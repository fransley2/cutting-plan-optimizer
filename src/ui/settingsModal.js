import {
  CUTTING_METHOD_PRESETS,
  DEFAULT_MATERIALS_CATALOG,
  getAppSettings,
  saveAppSettings,
} from '../data/appSettings.js';
import { exportFullBackup, importFullBackup } from '../data/backup.js';
import { getAllPlans, savePlan, deletePlan } from '../data/plans.js';
import { getAllProjects, saveProject, deleteProject } from '../data/projects.js';
import { saveInventoryItems, clearInventoryItems } from '../data/inventoryDB.js';
import { saveProfile } from '../data/profile.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { openDataCleanupDialog } from './dataCleanupDialog.js';

const DEFAULT_REPORT_HEADER = Object.freeze({
  companyName: 'Saipem do Brasil',
  subtitle: '',
  documentTitle: 'Cutting Plan Report',
  logoUrl: 'https://i.ibb.co/wZZQrZW0/Saipem-logo-300px.png',
});

function field(labelText, control) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
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
  title.textContent = titleText;
  wrapper.appendChild(title);
  return wrapper;
}

function option(value, label, selectedValue) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
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
    remove.textContent = 'Excluir';
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

async function overwriteFromBackup(backup) {
  const [plans, projects] = await Promise.all([getAllPlans(), getAllProjects()]);
  await Promise.all(plans.map(plan => deletePlan(plan.name)));
  await Promise.all(projects.map(project => deleteProject(project.name)));

  await Promise.all((backup.plans || []).map(plan => {
    const { name, savedAt, ...data } = plan;
    return name ? savePlan(name, { ...data, savedAt }) : null;
  }));
  await Promise.all((backup.projects || []).map(project => {
    const { name, savedAt, ...data } = project;
    return name ? saveProject(name, { ...data, savedAt }) : null;
  }));

  await saveInventoryItems(backup.inventory || []);
  if (backup.profile) await saveProfile(backup.profile);
  if (backup.appSettings) await saveAppSettings(backup.appSettings);
}

async function clearLocalData() {
  const first = window.confirm('Limpar todos os dados locais deste navegador? Isso inclui planos, projetos, inventario, perfil e configuracoes.');
  if (!first) return false;
  const second = window.confirm('Confirmacao final: esta acao sobrescreve os dados locais e nao pode ser desfeita. Deseja continuar?');
  if (!second) return false;

  const [plans, projects] = await Promise.all([getAllPlans(), getAllProjects()]);
  await Promise.all(plans.map(plan => deletePlan(plan.name)));
  await Promise.all(projects.map(project => deleteProject(project.name)));
  await clearInventoryItems();
  await saveProfile({ name: '', role: '', signatureImage: null });
  await saveAppSettings({
    defaultKerf: 5,
    defaultMinOffcut: 500,
    defaultStockStrategy: 'best-fit',
    defaultTrimEnabled: false,
    defaultLeftTrim: 0,
    defaultRightTrim: 0,
    requireTraceability: false,
    materialsCatalog: DEFAULT_MATERIALS_CATALOG,
    reportHeader: { ...DEFAULT_REPORT_HEADER },
  });
  return true;
}

export async function openSettingsModal({ onSettingsChange } = {}) {
  const settings = await getAppSettings();
  const materials = [...settings.materialsCatalog];
  const reportHeaderSettings = { ...DEFAULT_REPORT_HEADER, ...(settings.reportHeader || {}) };
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
  const documentTitleInput = input('text', reportHeaderSettings.documentTitle);
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
    field('Titulo do documento', documentTitleInput),
    field('URL da logo', logoUrlInput),
    logoPreview
  );

  const dataSection = section('Dados e Backup');
  const backupInput = input('file');
  backupInput.accept = '.json';
  backupInput.className = 'hidden';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn btn-secondary';
  exportButton.textContent = 'Exportar backup completo (.json)';
  exportButton.addEventListener('click', () => exportFullBackup());
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
      const confirmed = window.confirm('Importar este backup vai SOBRESCREVER os dados locais atuais. Continuar?');
      if (!confirmed) return;
      await overwriteFromBackup(backup);
      await onSettingsChange?.();
      showToast('Backup importado com sucesso.', 'success');
      closeModal();
    } catch (error) {
      showToast(error.message || 'Falha ao importar backup.', 'error');
    } finally {
      backupInput.value = '';
    }
  });
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'btn btn-critical';
  clearButton.textContent = 'Excluir dados locais';
  clearButton.addEventListener('click', async () => {
    await openDataCleanupDialog({ onCleanup: onSettingsChange });
  });
  const backupControls = document.createElement('div');
  backupControls.className = 'settings-actions';
  backupControls.append(exportButton, importButton, clearButton, backupInput);
  dataSection.appendChild(backupControls);

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
    { id: 'nesting', label: 'Padroes de Nesting', icon: 'settings', el: nesting },
    { id: 'catalog', label: 'Catalogo de Materiais', icon: 'inventory_2', el: catalog },
    { id: 'traceability', label: 'Rastreabilidade', icon: 'verified_user', el: traceability },
    { id: 'reports', label: 'Relatorios', icon: 'article', el: reports },
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
    label.textContent = item.label;
    button.append(icon, label);
    button.addEventListener('click', () => activateSection(item.id));
    item.button = button;
    settingsNav.appendChild(button);
    settingsContent.appendChild(item.el);
  });

  body.append(settingsNav, settingsContent);
  activateSection('nesting');

  openModal({
    title: 'Configuracoes',
    body,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          await saveAppSettings({
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
              documentTitle: documentTitleInput.value.trim() || DEFAULT_REPORT_HEADER.documentTitle,
              logoUrl: logoUrlInput.value.trim() || DEFAULT_REPORT_HEADER.logoUrl,
            },
          });
          await onSettingsChange?.();
          showToast('Configuracoes salvas.', 'success');
          closeModal();
        },
      },
    ],
  });
}
