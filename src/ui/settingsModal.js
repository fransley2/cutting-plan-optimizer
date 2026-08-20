import {
  CUTTING_METHOD_PRESETS,
  DEFAULT_MATERIAL_COUPON_FORM,
  DEFAULT_REPORT_HEADER,
  DEFAULT_RETURN_MATERIAL_VOUCHER_FORM,
  getAppSettings,
  saveAppSettings,
} from '../data/appSettings.js';
import {
  clearAllLocalData,
  exportFullBackup,
  getBackupSummary,
  getLocalDataSummary,
  importFullBackup,
  restoreFullBackup,
} from '../data/backup.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { openDataCleanupDialog } from './dataCleanupDialog.js';
import { setLanguage, SUPPORTED_LANGUAGES, t, translateDom } from '../i18n/index.js';

function field(labelText, control) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.textContent = t(labelText);
  wrapper.append(label, control);
  return wrapper;
}

function input(type, value = '') {
  const element = document.createElement('input');
  element.type = type;
  element.value = value;
  return element;
}

function section(titleText) {
  const wrapper = document.createElement('section');
  wrapper.className = 'settings-section';
  const title = document.createElement('h3');
  title.textContent = t(titleText);
  wrapper.appendChild(title);
  return wrapper;
}

function option(value, label, selectedValue) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = t(label);
  item.selected = value === selectedValue;
  return item;
}

function numberValue(control) {
  const value = Number(control.value);
  return Number.isFinite(value) ? value : 0;
}

function renderMaterials(list, materials) {
  list.replaceChildren();
  materials.forEach((material, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = material;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-critical';
    remove.textContent = t('Excluir');
    remove.addEventListener('click', () => {
      materials.splice(index, 1);
      renderMaterials(list, materials);
    });
    item.append(label, remove);
    list.appendChild(item);
  });
}

function buildStrategySelect(value) {
  const select = document.createElement('select');
  select.append(
    option('best-fit', 'Melhor Encaixe', value),
    option('prioritize-offcuts', 'Priorizar Retalhos', value),
    option('smallest-bars', 'Menores Barras Primeiro', value)
  );
  return select;
}

function backupSummaryList(summary) {
  const list = document.createElement('ul');
  list.className = 'settings-backup-summary';
  summary.stores.forEach((store) => {
    const item = document.createElement('li');
    item.textContent = `${store.name}: ${store.count}`;
    list.append(item);
  });
  return list;
}

function formatBackupDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR');
}

function dataMetric(iconName, value, label) {
  const card = document.createElement('div');
  card.className = 'settings-data-metric';
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.textContent = iconName;
  const content = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  const text = document.createElement('span');
  text.textContent = label;
  content.append(strong, text);
  card.append(icon, content);
  return card;
}

async function runButtonAction(button, pendingLabel, action) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = pendingLabel;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function openRestoreBackupConfirmation(backup, localSummary, onSettingsChange) {
  const summary = getBackupSummary(backup);
  const currentStores = new Set(localSummary.stores.map((store) => store.name));
  const backupStores = new Set(summary.stores.map((store) => store.name));
  const missingStores = [...currentStores].filter((name) => !backupStores.has(name));
  const ignoredStores = [...backupStores].filter((name) => !currentStores.has(name));
  const body = document.createElement('div');
  body.className = 'settings-restore-review';
  const integrity = document.createElement('div');
  integrity.className = `settings-backup-integrity ${summary.integrity ? 'is-verified' : 'is-warning'}`;
  const integrityIcon = document.createElement('span');
  integrityIcon.className = 'material-symbols-outlined';
  integrityIcon.textContent = summary.integrity ? 'verified_user' : 'warning';
  const integrityText = document.createElement('span');
  integrityText.textContent = summary.integrity
    ? 'Integridade SHA-256 verificada. O arquivo não foi alterado desde a exportação.'
    : 'Backup legado sem assinatura de integridade. Revise a origem antes de continuar.';
  integrity.append(integrityIcon, integrityText);
  body.append(
    integrity,
    Object.assign(document.createElement('p'), { textContent: `Exportado em ${formatBackupDate(summary.exportedAt)}. Contém ${summary.totalRecords} registros em ${summary.stores.length} stores.` }),
    backupSummaryList(summary),
  );
  if (missingStores.length) {
    const warning = document.createElement('p');
    warning.className = 'settings-restore-warning';
    warning.textContent = `${missingStores.length} stores atuais não existem neste backup e serão restauradas vazias.`;
    body.append(warning);
  }
  if (ignoredStores.length) {
    const warning = document.createElement('p');
    warning.className = 'settings-restore-warning';
    warning.textContent = `${ignoredStores.length} stores desconhecidas serão ignoradas por esta versão do aplicativo.`;
    body.append(warning);
  }
  const safetyBackup = input('checkbox');
  safetyBackup.checked = true;
  const safetyLabel = document.createElement('label');
  safetyLabel.className = 'settings-checkbox settings-safety-backup';
  safetyLabel.append(safetyBackup, document.createTextNode('Baixar um backup de segurança dos dados atuais antes de restaurar'));
  body.append(safetyLabel);
  const confirmation = input('text');
  confirmation.placeholder = 'Digite RESTAURAR para confirmar';
  body.append(field('Confirmação', confirmation));
  openModal({
    title: 'Restaurar backup completo',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      { label: 'Restaurar e substituir dados', variant: 'btn-critical', closeOnClick: false, onClick: async () => {
        if (confirmation.value.trim() !== 'RESTAURAR') { showToast('Digite RESTAURAR para confirmar.', 'error'); return; }
        try {
          if (safetyBackup.checked) await exportFullBackup();
          await restoreFullBackup(backup);
          await onSettingsChange?.();
          closeModal();
          showToast('Backup restaurado com sucesso.', 'success');
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Falha ao restaurar backup.', 'error');
        }
      } }],
  });
}

function openClearAllConfirmation(onSettingsChange) {
  const body = document.createElement('div');
  const warning = document.createElement('p');
  warning.className = 'text-critical';
  warning.textContent = 'Esta ação remove todos os dados locais de todas as áreas do aplicativo, inclusive configurações, documentos, MTO, Inventory, Workpacks e auditoria.';
  const confirmation = input('text');
  confirmation.placeholder = 'Digite EXCLUIR TUDO para confirmar';
  body.append(warning, field('Confirmação', confirmation));
  openModal({
    title: 'Excluir todos os dados locais',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      { label: 'Excluir tudo', variant: 'btn-critical', closeOnClick: false, onClick: async () => {
        if (confirmation.value.trim() !== 'EXCLUIR TUDO') { showToast('Digite EXCLUIR TUDO para confirmar.', 'error'); return; }
        try {
          await clearAllLocalData();
          await onSettingsChange?.();
          closeModal();
          showToast('Todos os dados locais foram excluídos.', 'success');
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Falha ao excluir os dados locais.', 'error');
        }
      } }],
  });
}

export async function openSettingsModal({ onSettingsChange, sharedSync = null } = {}) {
  const [settings, localDataSummary] = await Promise.all([getAppSettings(), getLocalDataSummary()]);
  const materials = [...settings.materialsCatalog];
  const reportHeaderSettings = settings.reportHeader;
  const materialCouponFormSettings = settings.materialCouponForm || DEFAULT_MATERIAL_COUPON_FORM;
  const returnMaterialVoucherFormSettings = settings.returnMaterialVoucherForm || DEFAULT_RETURN_MATERIAL_VOUCHER_FORM;
  const body = document.createElement('div');
  body.className = 'settings-modal-body';

  const nesting = section('Padroes de Nesting');
  const methodSelect = document.createElement('select');
  methodSelect.appendChild(option('', 'Selecione um metodo', ''));
  CUTTING_METHOD_PRESETS.forEach(preset => methodSelect.appendChild(option(preset.id, preset.label, '')));
  const kerfInput = input('number', settings.defaultKerf);
  const minOffcutInput = input('number', settings.defaultMinOffcut);
  const strategySelect = buildStrategySelect(settings.defaultStockStrategy);
  const trimCheckbox = input('checkbox');
  trimCheckbox.checked = !!settings.defaultTrimEnabled;
  const leftTrimInput = input('number', settings.defaultLeftTrim);
  const rightTrimInput = input('number', settings.defaultRightTrim);
  const trimFields = document.createElement('div');
  trimFields.className = 'settings-inline-fields';
  trimFields.append(field('Aparo esquerdo (mm)', leftTrimInput), field('Aparo direito (mm)', rightTrimInput));
  trimFields.classList.toggle('hidden', !trimCheckbox.checked);

  methodSelect.addEventListener('change', () => {
    const preset = CUTTING_METHOD_PRESETS.find(item => item.id === methodSelect.value);
    if (preset) kerfInput.value = preset.kerf;
  });
  trimCheckbox.addEventListener('change', () => trimFields.classList.toggle('hidden', !trimCheckbox.checked));

  const trimLabel = document.createElement('label');
  trimLabel.className = 'settings-checkbox';
  trimLabel.append(trimCheckbox, document.createTextNode(' Aparo habilitado por padrao'));
  nesting.append(
    field('Metodo de corte', methodSelect),
    field('Kerf padrao (mm)', kerfInput),
    field('Retalho minimo padrao (mm)', minOffcutInput),
    field('Estrategia de estoque padrao', strategySelect),
    trimLabel,
    trimFields
  );

  const catalog = section('Catalogo de Materiais');
  const materialList = document.createElement('ul');
  materialList.className = 'settings-material-list';
  renderMaterials(materialList, materials);
  const materialInput = input('text');
  materialInput.placeholder = 'Novo material';
  const addMaterial = document.createElement('button');
  addMaterial.type = 'button';
  addMaterial.className = 'btn btn-secondary';
  addMaterial.textContent = 'Adicionar';
  addMaterial.addEventListener('click', () => {
    const value = materialInput.value.trim();
    if (!value) return;
    if (!materials.includes(value)) materials.push(value);
    materialInput.value = '';
    renderMaterials(materialList, materials);
  });
  const materialControls = document.createElement('div');
  materialControls.className = 'settings-inline-fields';
  materialControls.append(materialInput, addMaterial);
  catalog.append(materialList, materialControls);

  const traceability = section('Rastreabilidade');
  const traceabilityCheckbox = input('checkbox');
  traceabilityCheckbox.checked = !!settings.requireTraceability;
  const traceabilityLabel = document.createElement('label');
  traceabilityLabel.className = 'settings-checkbox';
  traceabilityLabel.append(traceabilityCheckbox, document.createTextNode(' Exigir preenchimento de Rastreabilidade no Estoque'));
  traceability.appendChild(traceabilityLabel);

  const reports = section('Cabeçalho dos Relatórios');
  const companyNameInput = input('text', reportHeaderSettings.companyName);
  const subtitleInput = input('text', reportHeaderSettings.subtitle);
  subtitleInput.placeholder = 'Vazio = usar nome do projeto atual';
  const cuttingPlanTitleInput = input('text', reportHeaderSettings.documentTitles.cuttingPlan);
  const materialCouponTitleInput = input('text', reportHeaderSettings.documentTitles.materialCoupon);
  const returnMaterialVoucherTitleInput = input('text', reportHeaderSettings.documentTitles.returnMaterialVoucher);
  const logoUrlInput = input('url', reportHeaderSettings.logoUrl);
  logoUrlInput.placeholder = DEFAULT_REPORT_HEADER.logoUrl;
  const logoPreview = document.createElement('img');
  logoPreview.className = 'settings-logo-preview';
  logoPreview.alt = 'Logo do relatório';
  logoPreview.src = logoUrlInput.value || DEFAULT_REPORT_HEADER.logoUrl;
  logoUrlInput.addEventListener('input', () => {
    logoPreview.src = logoUrlInput.value.trim() || DEFAULT_REPORT_HEADER.logoUrl;
  });
  reports.append(
    field('Nome da empresa', companyNameInput),
    field('Subtitulo do cabecalho', subtitleInput),
    field('Titulo — Cutting Plan Report', cuttingPlanTitleInput),
    field('Titulo — Material Coupon', materialCouponTitleInput),
    field('Titulo — Returned Material Voucher', returnMaterialVoucherTitleInput),
    field('URL da logo', logoUrlInput),
    logoPreview
  );

  const materialCouponForm = section('Formulario do Material Coupon');
  const mcDocNumberInput = input('text', materialCouponFormSettings.docNumber);
  const mcDocRevisionInput = input('text', materialCouponFormSettings.docRevision);
  const mcDocRevisionDateInput = input('text', materialCouponFormSettings.docRevisionDate);
  const mcDocReferenceInput = input('text', materialCouponFormSettings.docReference);
  const mcReferenceInput = input('text', materialCouponFormSettings.reference);
  const mcNotesInput = document.createElement('textarea'); mcNotesInput.value = materialCouponFormSettings.notes || '';
  materialCouponForm.append(
    field('Doc Number', mcDocNumberInput), field('Doc Revision', mcDocRevisionInput),
    field('Doc Revision Date', mcDocRevisionDateInput), field('Doc Reference', mcDocReferenceInput),
    field('Reference / PO', mcReferenceInput), field('Description / Notes', mcNotesInput),
  );

  const returnMaterialVoucherForm = section('Formulario do Returned Material Voucher');
  const rmvDocNumberInput = input('text', returnMaterialVoucherFormSettings.docNumber);
  const rmvDocRevisionInput = input('text', returnMaterialVoucherFormSettings.docRevision);
  const rmvDocRevisionDateInput = input('text', returnMaterialVoucherFormSettings.docRevisionDate);
  const rmvDocReferenceInput = input('text', returnMaterialVoucherFormSettings.docReference);
  const rmvOriginInput = input('text', returnMaterialVoucherFormSettings.origin);
  const rmvDestinationInput = input('text', returnMaterialVoucherFormSettings.destination);
  const rmvReferenceInput = document.createElement('textarea'); rmvReferenceInput.value = returnMaterialVoucherFormSettings.reference || '';
  const rmvNotesInput = document.createElement('textarea'); rmvNotesInput.value = returnMaterialVoucherFormSettings.notes || '';
  returnMaterialVoucherForm.append(
    field('Doc Number', rmvDocNumberInput), field('Doc Revision', rmvDocRevisionInput),
    field('Doc Verification Date', rmvDocRevisionDateInput), field('Reference Document', rmvDocReferenceInput),
    field('Origem padrão', rmvOriginInput), field('Destino padrão', rmvDestinationInput),
    field('Texto adicional de Reference', rmvReferenceInput), field('Texto adicional de General Notes', rmvNotesInput),
  );

  const dataSection = section('Dados e Backup');
  dataSection.classList.add('settings-data-section');
  const dataIntro = document.createElement('div');
  dataIntro.className = 'settings-data-intro';
  const dataIntroIcon = document.createElement('span');
  dataIntroIcon.className = 'material-symbols-outlined';
  dataIntroIcon.textContent = 'shield_lock';
  const dataIntroCopy = document.createElement('div');
  const dataIntroTitle = document.createElement('strong');
  dataIntroTitle.textContent = 'Proteção dos dados locais';
  const dataIntroText = document.createElement('p');
  dataIntroText.textContent = 'O backup completo inclui documentos, estoque, projetos, vínculos, usuários, configurações e auditoria deste navegador.';
  dataIntroCopy.append(dataIntroTitle, dataIntroText);
  dataIntro.append(dataIntroIcon, dataIntroCopy);
  const dataMetrics = document.createElement('div');
  dataMetrics.className = 'settings-data-metrics';
  dataMetrics.append(
    dataMetric('database', `v${localDataSummary.databaseVersion}`, 'Versão da base'),
    dataMetric('table_rows', localDataSummary.stores.length, 'Stores protegidas'),
    dataMetric('inventory_2', localDataSummary.totalRecords, 'Registros locais'),
  );
  const backupInput = input('file');
  backupInput.accept = '.json';
  backupInput.className = 'hidden';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn btn-secondary';
  exportButton.textContent = 'Exportar backup completo (.json)';
  exportButton.addEventListener('click', async () => {
    await runButtonAction(exportButton, 'Preparando backup…', async () => {
      try {
        const backup = await exportFullBackup();
        const summary = getBackupSummary(backup);
        showToast(`Backup verificado exportado: ${summary.totalRecords} registros em ${summary.stores.length} stores.`, 'success');
      } catch (error) {
        console.error(error);
        showToast(error.message || 'Falha ao exportar backup.', 'error');
      }
    });
  });
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'btn btn-ghost';
  importButton.textContent = 'Importar backup';
  importButton.addEventListener('click', () => backupInput.click());
  backupInput.addEventListener('change', async () => {
    const file = backupInput.files?.[0];
    if (!file) return;
    try {
      const backup = await importFullBackup(file);
      openRestoreBackupConfirmation(backup, localDataSummary, onSettingsChange);
    } catch (error) {
      showToast(error.message || 'Falha ao importar backup.', 'error');
    } finally {
      backupInput.value = '';
    }
  });
  const selectiveClearButton = document.createElement('button');
  selectiveClearButton.type = 'button';
  selectiveClearButton.className = 'btn btn-ghost';
  selectiveClearButton.textContent = 'Limpeza seletiva';
  selectiveClearButton.addEventListener('click', async () => {
    await openDataCleanupDialog({ onCleanup: onSettingsChange });
  });
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'btn btn-critical';
  clearButton.textContent = 'Excluir todos os dados locais';
  clearButton.addEventListener('click', () => openClearAllConfirmation(onSettingsChange));
  const backupControls = document.createElement('div');
  backupControls.className = 'settings-actions';
  backupControls.append(exportButton, importButton, backupInput);
  const backupPanel = document.createElement('div');
  backupPanel.className = 'settings-data-panel';
  const backupPanelTitle = document.createElement('h4');
  backupPanelTitle.textContent = 'Backup completo';
  const backupPanelText = document.createElement('p');
  backupPanelText.textContent = 'O arquivo exportado recebe verificação SHA-256. Na restauração, o aplicativo valida integridade, versão e conteúdo antes de substituir a base.';
  backupPanel.append(backupPanelTitle, backupPanelText, backupControls);
  const maintenancePanel = document.createElement('div');
  maintenancePanel.className = 'settings-data-panel settings-danger-zone';
  const maintenanceTitle = document.createElement('h4');
  maintenanceTitle.textContent = 'Manutenção e exclusão';
  const maintenanceText = document.createElement('p');
  maintenanceText.textContent = 'Use a limpeza seletiva para remover somente uma área. A exclusão total exige confirmação textual.';
  const maintenanceActions = document.createElement('div');
  maintenanceActions.className = 'settings-actions';
  maintenanceActions.append(selectiveClearButton, clearButton);
  maintenancePanel.append(maintenanceTitle, maintenanceText, maintenanceActions);
  dataSection.append(dataIntro, dataMetrics, backupPanel, maintenancePanel);

  const sharedSyncSection = section('Pasta compartilhada');
  const sharedSyncIntro = document.createElement('p');
  sharedSyncIntro.className = 'text-muted';
  sharedSyncIntro.textContent = 'Selecione uma pasta de rede por meio do navegador. O IndexedDB continua sendo a copia local de trabalho; os arquivos JSON fazem a sincronizacao entre usuarios.';
  const sharedSyncStatus = document.createElement('strong');
  sharedSyncStatus.className = 'shared-sync-settings-status';
  sharedSyncStatus.textContent = sharedSync?.isConfigured?.()
    ? 'Pasta configurada neste navegador.'
    : 'Nenhuma pasta configurada.';
  const sharedSyncActions = document.createElement('div');
  sharedSyncActions.className = 'settings-actions';
  const selectSharedFolder = document.createElement('button');
  selectSharedFolder.type = 'button';
  selectSharedFolder.className = 'btn btn-secondary';
  selectSharedFolder.textContent = sharedSync?.isConfigured?.() ? 'Trocar pasta compartilhada' : 'Selecionar pasta compartilhada';
  selectSharedFolder.disabled = !sharedSync;
  selectSharedFolder.addEventListener('click', async () => {
    const connected = await runButtonAction(selectSharedFolder, 'Validando pasta…', () => sharedSync.connectOrChangeFolder());
    if (connected) {
      sharedSyncStatus.textContent = 'Pasta configurada e gravavel.';
      selectSharedFolder.textContent = 'Trocar pasta compartilhada';
      reconnectSharedFolder.disabled = false;
    }
  });
  const reconnectSharedFolder = document.createElement('button');
  reconnectSharedFolder.type = 'button';
  reconnectSharedFolder.className = 'btn btn-ghost';
  reconnectSharedFolder.textContent = 'Tentar reconectar';
  reconnectSharedFolder.disabled = !sharedSync?.isConfigured?.();
  reconnectSharedFolder.addEventListener('click', async () => {
    const connected = await runButtonAction(reconnectSharedFolder, 'Reconectando…', () => sharedSync.reconnect());
    if (connected) sharedSyncStatus.textContent = 'Conexao restabelecida.';
  });
  sharedSyncActions.append(selectSharedFolder, reconnectSharedFolder);
  sharedSyncSection.append(sharedSyncIntro, sharedSyncStatus, sharedSyncActions);

  const languageSection = section('Language');
  const languageSelect = document.createElement('select');
  SUPPORTED_LANGUAGES.forEach(({ code, label }) => {
    languageSelect.appendChild(option(code, label, settings.language));
  });
  const languageHelp = document.createElement('p');
  languageHelp.className = 'text-muted';
  languageHelp.textContent = t('The choice is applied to the application and saved in this browser.');
  languageSection.append(field('Application language', languageSelect), languageHelp);

  const about = section('Sobre');
  const aboutText = document.createElement('p');
  aboutText.className = 'text-muted';
  aboutText.textContent = 'Cutting Plan Optimizer. Configuracoes locais deste navegador para suporte operacional, backup e padroes de nesting.';
  about.appendChild(aboutText);

  const settingsNav = document.createElement('nav');
  settingsNav.className = 'settings-modal-nav';
  settingsNav.setAttribute('aria-label', 'Secoes de configuracoes');
  const settingsContent = document.createElement('div');
  settingsContent.className = 'settings-modal-content';
  const sections = [
    { id: 'language', label: 'Language', icon: 'language', el: languageSection },
    { id: 'nesting', label: 'Padroes de Nesting', icon: 'settings', el: nesting },
    { id: 'catalog', label: 'Catalogo de Materiais', icon: 'inventory_2', el: catalog },
    { id: 'traceability', label: 'Rastreabilidade', icon: 'verified_user', el: traceability },
    { id: 'reports', label: 'Relatorios', icon: 'article', el: reports },
    { id: 'material-coupon-form', label: 'Material Coupon', icon: 'confirmation_number', el: materialCouponForm },
    { id: 'rmv-form', label: 'Returned Material Voucher', icon: 'assignment_return', el: returnMaterialVoucherForm },
    { id: 'shared-sync', label: 'Pasta compartilhada', icon: 'folder_shared', el: sharedSyncSection },
    { id: 'data', label: 'Dados e Backup', icon: 'database', el: dataSection },
    { id: 'about', label: 'Sobre', icon: 'info', el: about },
  ];

  function activateSection(sectionId) {
    sections.forEach((item) => {
      const isActive = item.id === sectionId;
      item.button.classList.toggle('active', isActive);
      item.button.setAttribute('aria-current', isActive ? 'page' : 'false');
      item.el.classList.toggle('hidden', !isActive);
    });
  }

  sections.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-nav-item';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = item.icon;
    const label = document.createElement('span');
    label.textContent = t(item.label);
    button.append(icon, label);
    button.addEventListener('click', () => activateSection(item.id));
    item.button = button;
    settingsNav.appendChild(button);
    settingsContent.appendChild(item.el);
  });

  body.append(settingsNav, settingsContent);
  activateSection('language');
  translateDom(body);

  openModal({
    title: t('Settings'),
    body,
    wide: true,
    buttons: [
      { label: t('Cancel'), variant: 'btn-ghost' },
      {
        label: t('Salvar'),
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          await saveAppSettings({
            language: languageSelect.value,
            defaultKerf: numberValue(kerfInput),
            defaultMinOffcut: numberValue(minOffcutInput),
            defaultStockStrategy: strategySelect.value,
            defaultTrimEnabled: trimCheckbox.checked,
            defaultLeftTrim: numberValue(leftTrimInput),
            defaultRightTrim: numberValue(rightTrimInput),
            requireTraceability: traceabilityCheckbox.checked,
            materialsCatalog: materials,
            reportHeader: {
              companyName: companyNameInput.value.trim() || DEFAULT_REPORT_HEADER.companyName,
              subtitle: subtitleInput.value.trim(),
              logoUrl: logoUrlInput.value.trim() || DEFAULT_REPORT_HEADER.logoUrl,
              documentTitles: {
                cuttingPlan: cuttingPlanTitleInput.value.trim() || DEFAULT_REPORT_HEADER.documentTitles.cuttingPlan,
                materialCoupon: materialCouponTitleInput.value.trim() || DEFAULT_REPORT_HEADER.documentTitles.materialCoupon,
                returnMaterialVoucher: returnMaterialVoucherTitleInput.value.trim() || DEFAULT_REPORT_HEADER.documentTitles.returnMaterialVoucher,
              },
            },
            materialCouponForm: {
              docNumber: mcDocNumberInput.value.trim(), docRevision: mcDocRevisionInput.value.trim(),
              docRevisionDate: mcDocRevisionDateInput.value.trim(), docReference: mcDocReferenceInput.value.trim(),
              reference: mcReferenceInput.value.trim(), notes: mcNotesInput.value.trim(),
            },
            returnMaterialVoucherForm: {
              docNumber: rmvDocNumberInput.value.trim(), docRevision: rmvDocRevisionInput.value.trim(),
              docRevisionDate: rmvDocRevisionDateInput.value.trim(), docReference: rmvDocReferenceInput.value.trim(),
              origin: rmvOriginInput.value.trim(), destination: rmvDestinationInput.value.trim(),
              reference: rmvReferenceInput.value.trim(), notes: rmvNotesInput.value.trim(),
            },
          });
          setLanguage(languageSelect.value);
          await onSettingsChange?.();
          showToast(t('Settings saved.'), 'success');
          closeModal();
        },
      },
    ],
  });
}
