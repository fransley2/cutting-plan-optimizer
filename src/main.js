import { createDataTable } from './ui/dataTable.js';
import { STOCK_COLUMNS, PARTS_COLUMNS } from './ui/columns.js';
import { getInitials } from './core/utils.js';
import { validateTraceability } from './core/validation.js';
import { runAllocations } from './core/allocate.js';
import { renderResults } from './ui/results.js';
import { showToast } from './ui/toast.js';
import { getAllPlans, getPlan, savePlan, deletePlan } from './data/plans.js';
import {
  getAllProjects,
  getProject,
  saveProject,
  deleteProject,
  createProject,
  updateProject,
} from './data/projects.js';
import { getProfile } from './data/profile.js';
import { getAppSettings, getActiveProjectName, setActiveProjectName } from './data/appSettings.js';
import {
  readExcelFile,
  exportSolutionToExcel,
  exportMaterialCouponExtract,
  exportMaterialCouponExcel,
} from './data/excel.js';
import { openModal } from './ui/modal.js';
import { showLoadPlanModal } from './ui/planListModal.js';
import { openEntityListModal } from './ui/entityListModal.js';
import { renderHomeDashboard } from './ui/homeDashboard.js';
import { openProfileModal } from './ui/profileModal.js';
import { openSettingsModal } from './ui/settingsModal.js';
import { openInventoryModal } from './ui/inventoryModal.js';
import { renderInventoryPage, refreshInventoryPage } from './ui/inventoryPage.js';
import { renderMtoPage, refreshMtoPage } from './ui/mtoPage.js';
import { initCuttingPackagesPage } from './ui/cuttingPackagesPage.js';
import { initProjectManagerPage } from './ui/projectManagerPage.js';
import { initEquipmentPage } from './ui/equipmentPage.js';
import { initWorkpackPage } from './ui/workpackPage.js';
import { initDrawingPage } from './ui/drawingPage.js';
import {
  openCuttingSheetPdfReport,
  openTabularPdfReport,
} from './reports/cuttingReport.js';
import { printVisualReport } from './reports/printVisual.js';
import { openSummaryReport } from './reports/summaryReport.js';
import {
  initMaterialCouponManager,
  mountMaterialCouponPage,
} from './features/materialCoupon/materialCouponService.js';
import {
  initMaterialCouponTemplateModal,
  openMaterialCouponTemplateModal,
} from './ui/materialCouponTemplateModal.js';
import {
  getAllCuttingPackages,
  saveCuttingPackage,
  updateCuttingPackage,
} from './data/cuttingPackages.js';
import { createAuditEvent } from './data/auditLog.js';
import {
  getAllMaterialCoupons,
  getMaterialCoupon,
  saveMaterialCoupon,
  updateMaterialCoupon,
} from './data/materialCoupons.js';
import {
  saveDocumentTemplate,
  getDocumentTemplate,
  deleteDocumentTemplate,
  hasDocumentTemplate,
} from './data/documentTemplates.js';
import {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getEquipment,
  listEquipments,
} from './data/equipments.js';
import {
  createWorkpack,
  updateWorkpack,
  deleteWorkpack,
  getWorkpack,
  listWorkpacks,
} from './data/workpacks.js';
import {
  createDrawing,
  updateDrawing,
  deleteDrawing,
  getDrawing,
  getDrawingByDrawingNo,
  listDrawings,
} from './data/drawings.js';
import {
  buildMaterialCouponDocument,
  buildMaterialCouponExtractRows,
} from './documents/materialCoupon.js';
import { generateMaterialCouponTemplateTest } from './documents/materialCouponExcel.js';
import { openMaterialCouponReport } from './reports/materialCouponReport.js';
import { createCuttingPackage as buildCuttingPackage } from './workflows/createCuttingPackage.js';
import { validateCuttingPackage } from './core/cuttingPackageValidation.js';
import { cuttingPackageToNestingInput } from './workflows/cuttingPackageToNestingInput.js';

const el = (id) => document.getElementById(id);

let stockTable = null;
let partsTable = null;

let lastSolution = null;
let activeProjectName = '';
let currentPhase = 'home';
let activePlannerProject = null;
let plannerEquipments = [];
let legacyPlannerProjectData = null;
let pendingPlannerEquipmentLabel = '';
let currentProfile = null;
let mtoPageRendered = false;
let inventoryPageRendered = false;
let materialCouponPreviousPhase = 'inventory';
let materialCouponManagerInitialized = false;
let cuttingPackagesPageInitialized = false;
let projectManagerPageInitialized = false;
let equipmentPageInitialized = false;
let workpackPageInitialized = false;
let drawingPageInitialized = false;
let selectedMtoItemsForPackage = [];
let selectedInventoryItemsForPackage = [];
const reportViewOptions = {
  labels: {
    sequence: false,
    mark: true,
    pos: true,
    length: true,
  },
  labelFontSizePt: 9,
  useColors: true,
  includeSignatures: false,
};

const REPORT_TRANSLATIONS = Object.freeze({
  en: Object.freeze({ printButtonResumido: 'Summary Report' }),
  'pt-br': Object.freeze({ printButtonResumido: 'Relatório Resumido' }),
  it: Object.freeze({ printButtonResumido: 'Report Riepilogativo' }),
  fr: Object.freeze({ printButtonResumido: 'Rapport Résumé' }),
});

function setActiveSection(title) {
  el('active-section-title').textContent = title;
}

function setActiveNav(phase) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.phase === phase);
  });
}

function showPhase(phase) {
  const normalizedPhase = phase === 'material-coupon' ? 'material-coupons' : phase;
  currentPhase = normalizedPhase;
  el('home-phase')?.classList.toggle('hidden', normalizedPhase !== 'home');
  el('planner-phase')?.classList.toggle('hidden', normalizedPhase !== 'planner');
  el('results-phase')?.classList.toggle('hidden', normalizedPhase !== 'results');
  el('mto-phase')?.classList.toggle('hidden', normalizedPhase !== 'mto');
  el('inventory-phase')?.classList.toggle('hidden', normalizedPhase !== 'inventory');
  el('section-projects')?.classList.toggle('hidden', normalizedPhase !== 'projects');
  el('section-equipments')?.classList.toggle('hidden', normalizedPhase !== 'equipments');
  el('section-workpacks')?.classList.toggle('hidden', normalizedPhase !== 'workpacks');
  el('section-drawings')?.classList.toggle('hidden', normalizedPhase !== 'drawings');
  el('section-material-coupons')?.classList.toggle('hidden', normalizedPhase !== 'material-coupons');
  el('section-cutting-packages')?.classList.toggle('hidden', normalizedPhase !== 'cutting-packages');
  el('documents-phase')?.classList.toggle('hidden', normalizedPhase !== 'documents');
  el('offcuts-phase')?.classList.toggle('hidden', normalizedPhase !== 'offcuts');
  el('audit-phase')?.classList.toggle('hidden', normalizedPhase !== 'audit');
  setActiveNav(normalizedPhase);
  const activeLink = document.querySelector(`.nav-link[data-phase="${normalizedPhase}"]`);
  setActiveSection(normalizedPhase === 'material-coupons' ? 'Material Coupon' : activeLink?.dataset.sectionTitle || 'Industrial Intelligence');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (normalizedPhase === 'planner') void refreshPlannerProjectContext();
  if (normalizedPhase === 'mto') void renderOrRefreshMtoPage();
  if (normalizedPhase === 'inventory') void renderOrRefreshInventoryPage();
  if (normalizedPhase === 'projects') void renderOrRefreshProjectManagerPage();
  if (normalizedPhase === 'equipments') void renderOrRefreshEquipmentPage();
  if (normalizedPhase === 'workpacks') void renderOrRefreshWorkpackPage();
  if (normalizedPhase === 'drawings') void renderOrRefreshDrawingPage();
  if (normalizedPhase === 'material-coupons') void renderOrRefreshMaterialCouponManager();
  if (normalizedPhase === 'cutting-packages') void renderOrRefreshCuttingPackagesPage();
}

async function refreshProfileButton() {
  const button = el('profile-btn');
  if (!button) return;

  const profile = await getProfile();
  currentProfile = profile;
  const avatar = button.querySelector('.user-avatar');
  const label = button.querySelector('[data-profile-label]');

  if (avatar) avatar.textContent = getInitials(profile.name);
  if (label) label.textContent = profile.name || 'Configurar perfil';
}

async function refreshActiveProjectSelector() {
  const button = el('active-project-selector');
  if (!button) return;
  const settings = await getAppSettings();
  activeProjectName = settings.activeProjectName || '';
  const label = button.querySelector('[data-active-project-label]');
  if (label) label.textContent = activeProjectName || 'Ver todos os projetos';
}

function textValue(value) {
  return value == null ? '' : String(value);
}

function equipmentDisplayName(equipment = {}) {
  const code = textValue(equipment.code).trim();
  const name = textValue(equipment.name).trim();
  return [code, name].filter(Boolean).join(' - ') || textValue(equipment.id).trim();
}

function findPlannerEquipmentByLabel(label) {
  const wanted = textValue(label).trim();
  if (!wanted) return null;
  return plannerEquipments.find((equipment) => (
    equipment.id === wanted
    || equipmentDisplayName(equipment) === wanted
    || equipment.name === wanted
    || equipment.code === wanted
  )) || null;
}

function renderPlannerProjectContext() {
  const projectNameTarget = el('planner-project-name');
  const projectClientTarget = el('planner-project-client');
  const equipmentSelect = el('planner-equipment-select');
  const equipmentLegacy = el('planner-equipment-legacy');
  const summaryLabel = el('active-project-label');

  if (legacyPlannerProjectData) {
    if (projectNameTarget) projectNameTarget.textContent = legacyPlannerProjectData.project || 'Plano legado sem projeto';
    if (projectClientTarget) projectClientTarget.textContent = legacyPlannerProjectData.client || 'Cliente nao informado';
    if (summaryLabel) summaryLabel.textContent = legacyPlannerProjectData.project
      ? `Plano legado: ${legacyPlannerProjectData.project}`
      : 'Plano legado';
    if (equipmentSelect) {
      equipmentSelect.replaceChildren(new Option('Plano legado textual', ''));
      equipmentSelect.disabled = true;
    }
    if (equipmentLegacy) {
      equipmentLegacy.textContent = legacyPlannerProjectData.equipment
        ? `Equipamento legado: ${legacyPlannerProjectData.equipment}`
        : '';
    }
    return;
  }

  if (projectNameTarget) projectNameTarget.textContent = activeProjectName || 'Nenhum projeto selecionado';
  if (projectClientTarget) {
    projectClientTarget.textContent = activeProjectName
      ? (activePlannerProject?.client || 'Cliente nao informado')
      : 'Selecione um projeto para preencher os dados do plano.';
  }
  if (summaryLabel) {
    const selectedEquipment = equipmentSelect?.selectedOptions?.[0]?.textContent || '';
    const descriptor = [activeProjectName, selectedEquipment && equipmentSelect?.value ? selectedEquipment : '', el('workpack-name')?.value || '']
      .filter(Boolean)
      .join(' - ');
    summaryLabel.textContent = descriptor || 'Nenhum projeto selecionado';
  }
  if (equipmentLegacy) equipmentLegacy.textContent = '';
}

function populatePlannerEquipmentSelect({ resetSelection = false } = {}) {
  const select = el('planner-equipment-select');
  if (!select) return;
  const previousValue = resetSelection ? '' : select.value;
  const blank = new Option(activeProjectName ? 'Selecione um equipamento' : 'Selecione um projeto ativo', '');
  const options = plannerEquipments.map((equipment) => new Option(equipmentDisplayName(equipment), equipment.id || equipmentDisplayName(equipment)));
  select.replaceChildren(blank, ...options);
  select.disabled = !activeProjectName;

  const pending = findPlannerEquipmentByLabel(pendingPlannerEquipmentLabel);
  if (pending) {
    select.value = pending.id || equipmentDisplayName(pending);
    pendingPlannerEquipmentLabel = '';
  } else if (!resetSelection && [...select.options].some((option) => option.value === previousValue)) {
    select.value = previousValue;
  } else {
    select.value = '';
  }
}

async function refreshPlannerProjectContext({ clearLegacy = false, resetEquipment = false } = {}) {
  const activeName = await getActiveProjectName();
  activeProjectName = activeName || '';
  if (clearLegacy) legacyPlannerProjectData = null;
  activePlannerProject = activeProjectName ? await getProject(activeProjectName) : null;
  plannerEquipments = activeProjectName
    ? await listEquipments({ projectId: activeProjectName, status: 'ACTIVE' })
    : [];
  populatePlannerEquipmentSelect({ resetSelection: resetEquipment });
  renderPlannerProjectContext();
}

async function refreshVisibleActiveProjectScopedPage() {
  if (currentPhase === 'planner') {
    await refreshPlannerProjectContext({ clearLegacy: true, resetEquipment: true });
    return;
  }
  if (currentPhase === 'projects') {
    await renderOrRefreshProjectManagerPage();
    return;
  }
  if (currentPhase === 'equipments') {
    await renderOrRefreshEquipmentPage();
    return;
  }
  if (currentPhase === 'drawings') {
    await renderOrRefreshDrawingPage();
    return;
  }
  if (currentPhase === 'workpacks') {
    await renderOrRefreshWorkpackPage();
    return;
  }
  if (currentPhase === 'mto') {
    await renderOrRefreshMtoPage();
  }
}

async function openActiveProjectSelector() {
  const projects = await getAllProjects();
  const viewAllProject = {
    id: '__view_all__',
    name: '— Ver todos os projetos —',
    client: '',
    code: '',
    status: '',
    _isViewAll: true,
  };
  const projectOptions = [viewAllProject, ...projects];

  openEntityListModal({
    title: 'Selecionar Projeto Ativo',
    loadItems: async () => projectOptions,
    searchFields: ['name', 'project', 'client', 'code', 'status'],
    renderCardMeta: (project) => {
      if (project._isViewAll) {
        return ['Visualizar todos os dados sem filtro de projeto'];
      }
      return [
        `Cliente: ${project.client || 'N/A'} - Codigo: ${project.code || 'N/A'}`,
        `Status: ${project.status || 'N/A'}`,
      ];
    },
    onLoad: async (project) => {
      if (project._isViewAll) {
        await setActiveProjectName('');
        activeProjectName = '';
        legacyPlannerProjectData = null;
        pendingPlannerEquipmentLabel = '';
        await refreshActiveProjectSelector();
        await refreshVisibleActiveProjectScopedPage();
        showToast('Visualizando todos os projetos.', 'success');
        return;
      }

      const name = project.name || project.project || project.projectName || '';
      if (!name) {
        showToast('Projeto sem nome nao pode ser ativado.', 'error');
        return;
      }
      await setActiveProjectName(name);
      activeProjectName = name;
      legacyPlannerProjectData = null;
      pendingPlannerEquipmentLabel = '';
      await refreshActiveProjectSelector();
      await refreshVisibleActiveProjectScopedPage();
      showToast(`Projeto "${name}" ativo.`, 'success');
    },
    onDelete: async (project) => {
      if (project._isViewAll) {
        showToast('Use o Gerenciador de Projetos para excluir projetos.', 'error');
        return;
      }
      showToast('Use o Gerenciador de Projetos para excluir projetos.', 'error');
    },
    emptyMessage: 'Nenhum projeto cadastrado ainda.',
  });
}

async function refreshMaterialsCatalogDatalist() {
  const datalist = el('materials-catalog-list');
  if (!datalist) return;
  const settings = await getAppSettings();
  const options = (settings.materialsCatalog || []).map((material) => {
    const option = document.createElement('option');
    option.value = material;
    return option;
  });
  datalist.replaceChildren(...options);
}

function applySettingsToPlanner(settings) {
  el('kerf').value = settings.defaultKerf ?? 5;
  el('min-offcut').value = settings.defaultMinOffcut ?? 500;
  el('stock-strategy').value = settings.defaultStockStrategy || 'best-fit';
  el('enable-trim').checked = !!settings.defaultTrimEnabled;
  el('left-trim').value = settings.defaultLeftTrim ?? 0;
  el('right-trim').value = settings.defaultRightTrim ?? 0;
  el('trim-inputs').classList.toggle('hidden', !settings.defaultTrimEnabled);
}

async function applyDefaultPlannerSettings() {
  applySettingsToPlanner(await getAppSettings());
}

function updateActiveProjectLabel() {
  renderPlannerProjectContext();
}

function getSettings() {
  const enableTrim = el('enable-trim').checked;
  return {
    kerf: parseFloat(el('kerf').value) || 0,
    minOffcut: parseFloat(el('min-offcut').value) || 0,
    stockUsageStrategy: el('stock-strategy').value,
    trim: enableTrim
      ? { left: parseFloat(el('left-trim').value) || 0, right: parseFloat(el('right-trim').value) || 0 }
      : { left: 0, right: 0 },
  };
}

function showPlannerPhase() {
  showPhase('planner');
}

function showResultsPhase() {
  if (!lastSolution) {
    showToast('Calcule um plano primeiro.', 'error');
    return;
  }
  showPhase('results');
}

function updateResultsSubtitle() {
  const projectData = getProjectData();
  const parts = [projectData.project, projectData.equipment, projectData.workpack].filter(Boolean);
  el('results-subtitle').textContent = parts.length
    ? `${parts.join(' / ')} - revise o aproveitamento, cortes e sobras antes de exportar.`
    : 'Revise o aproveitamento, cortes e sobras antes de exportar.';
}

function getReportViewOptions() {
  return {
    ...reportViewOptions,
    labels: { ...reportViewOptions.labels },
  };
}

function renderCurrentResults() {
  if (!lastSolution) return;
  renderResults({
    container: el('results-container'),
    summaryContainer: el('results-summary'),
    visualContainer: el('results-visual'),
    solution: lastSolution,
    projectData: getProjectData(),
    settings: getSettings(),
    reportOptions: getReportViewOptions(),
  });
}

function onExportExcel() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de exportar.', 'error');
    return;
  }

  exportSolutionToExcel(lastSolution);
}

async function onExportVisualPdf() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o relatorio.', 'error');
    return;
  }

  const projectData = getProjectData();
  const appSettings = await getAppSettings();
  const opened = printVisualReport({
    solution: lastSolution,
    projectData,
    project: projectData.project,
    client: projectData.client,
    equipment: projectData.equipment,
    workpack: projectData.workpack,
    date: projectData.reportDate,
    settings: getSettings(),
    profile: currentProfile,
    reportHeader: appSettings.reportHeader,
    reportOptions: getReportViewOptions(),
  });
  if (!opened) showToast('O navegador bloqueou a janela de impressao/PDF.', 'error');
}

async function onExportTabularPdf() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o relatorio.', 'error');
    return;
  }

  const appSettings = await getAppSettings();
  const opened = await openTabularPdfReport({
    solution: lastSolution,
    projectData: getProjectData(),
    settings: { ...getSettings(), reportHeader: appSettings.reportHeader },
    reportOptions: getReportViewOptions(),
  });
  if (!opened) showToast('O navegador bloqueou a janela de impressao/PDF.', 'error');
}

async function onExportCuttingSheetPdf() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar a ficha de corte.', 'error');
    return;
  }

  const appSettings = await getAppSettings();
  const opened = await openCuttingSheetPdfReport({
    solution: lastSolution,
    projectData: getProjectData(),
    settings: { ...getSettings(), reportHeader: appSettings.reportHeader },
    reportOptions: getReportViewOptions(),
  });
  if (!opened) showToast('O navegador bloqueou a janela de impressao/PDF.', 'error');
}

function currentLanguage() {
  return (document.documentElement.lang || navigator.language || 'pt-BR').toLowerCase();
}

function getReportTranslation(key) {
  const lang = currentLanguage();
  const normalized = lang.replace('_', '-');
  const short = normalized.split('-')[0];
  return REPORT_TRANSLATIONS[normalized]?.[key]
    || REPORT_TRANSLATIONS[short]?.[key]
    || REPORT_TRANSLATIONS.en[key]
    || key;
}

function removeNonPrintElements(root) {
  if (!root) return;
  root.querySelectorAll('.no-print, .results-actions, button, input, select, textarea, script, style')
    .forEach((node) => node.remove());
}

function buildSummaryReportBodyHtml() {
  const source = el('results-container');
  if (!source) return '';

  const clone = source.cloneNode(true);
  removeNonPrintElements(clone);
  clone.querySelector('#results-summary')?.classList.add('results-summary');
  clone.querySelector('#results-visual')?.classList.add('results-visual');
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((node) => {
    node.removeAttribute('id');
  });

  return clone.outerHTML;
}

async function onExportSummaryReport() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o relatorio.', 'error');
    return;
  }

  const projectData = getProjectData();
  const appSettings = await getAppSettings();
  const opened = openSummaryReport({
    reportBodyHtml: buildSummaryReportBodyHtml(),
    projectData: {
      ...projectData,
      date: projectData.reportDate,
      preparedBy: currentProfile?.name || '',
    },
    labelFontSizePt: reportViewOptions.labelFontSizePt || 7,
    isMonochrome: reportViewOptions.useColors === false,
    includeSignatures: Boolean(el('include-signatures')?.checked),
    currentLang: currentLanguage(),
    title: getReportTranslation('printButtonResumido'),
    reportHeader: appSettings.reportHeader,
  });
  if (!opened) showToast('O navegador bloqueou a janela de impressao/PDF.', 'error');
}

function printReport(type) {
  if (type === 'resumido') {
    void onExportSummaryReport();
    return;
  }
  if (type === 'visual') {
    void onExportVisualPdf();
    return;
  }
  if (type === 'classic' || type === 'tabular') {
    void onExportTabularPdf();
    return;
  }
  if (type === 'simple' || type === 'sheet') {
    void onExportCuttingSheetPdf();
  }
}

async function calculate() {
  const stock = stockTable.getRows();
  const parts = partsTable.getRows();
  if (stock.length === 0 || parts.length === 0) {
    showToast('Adicione ao menos um item de estoque e uma peÃ§a.', 'error');
    return;
  }
  const appSettings = await getAppSettings();
  const traceabilityValidation = validateTraceability(stock, appSettings);
  if (!traceabilityValidation.valid) {
    showToast('Rastreabilidade obrigatoria: preencha Traceability em todos os itens de estoque.', 'error');
    return;
  }
  const solution = runAllocations({ parts, stock, ...getSettings() });
  if (!solution) return;

  lastSolution = solution;
  renderResults({
    container: el('results-container'),
    summaryContainer: el('results-summary'),
    visualContainer: el('results-visual'),
    solution: lastSolution,
    projectData: getProjectData(),
    settings: getSettings(),
    reportOptions: getReportViewOptions(),
  });
  updateResultsSubtitle();
  showResultsPhase();
  renderHome();
  showToast('Plano otimizado com sucesso!', 'success');
}

function wireFileUpload(buttonId, inputId, table) {
  el(buttonId)?.addEventListener('click', () => el(inputId)?.click());
  el(inputId)?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await readExcelFile(file);
      table.tbody.innerHTML = '';
      rows.forEach(r => table.addRow(mapExcelRow(r, table === stockTable)));
    } catch {
      showToast('Falha ao ler o arquivo.', 'error');
    }
    e.target.value = '';
  });
}

function mapExcelRow(row, isStock) {
  return isStock
    ? { po: row['PO'], item: row['Item'], qty: row['Qty'], length: row['Stock Length (mm)'], materialGrade: row['Material'], heatNumber: row['Heat Number'], description: row['Description'], traceability: row['Traceability'] }
    : { dwgNumber: row['DWG Number'], mark: row['Mark'], pos: row['POS'], qty: row['Qty'], length: row['Cut Length (mm)'], material: row['Material'], priority: row['Priority'] };
}

// Sidebar mobile (abre/fecha) + link ativo conforme a seÃ§Ã£o visÃ­vel.
function wireNavigation() {
  const sidebar = el('sidebar');
  el('sidebar-toggle')?.addEventListener('click', () => sidebar?.classList.toggle('open'));

  const links = [...document.querySelectorAll('.nav-link')];
  links.forEach(link => {
    link.addEventListener('click', () => {
      if (link.dataset.action === 'disabled') {
        showToast('Modulo em breve.', 'error');
        return;
      }
      if (link.dataset.action === 'inventory') {
        showPhase('inventory');
        sidebar.classList.remove('open');
        return;
      }
      if (link.dataset.phase === 'stock') {
        showPlannerPhase();
        el('section-stock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveSection('Estoque');
        sidebar.classList.remove('open');
        return;
      }
      if (link.dataset.phase) showPhase(link.dataset.phase);
      sidebar.classList.remove('open');
    });
  });
}

async function resetCurrentPlan({ confirmFirst = false } = {}) {
  if (confirmFirst && !confirm('Limpar todos os dados do plano atual?')) return;
  activeProjectName = '';
  setProjectFormData();
  stockTable.tbody.innerHTML = '';
  partsTable.tbody.innerHTML = '';
  stockTable.addRow();
  partsTable.addRow();
  await applyDefaultPlannerSettings();
  showPlannerPhase();
  lastSolution = null;
  renderHome();
  showToast('Dados limpos.', 'success');
}

async function handleNewPlan() {
  try {
    await resetCurrentPlan();
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel criar um novo plano.', 'error');
  }
}

async function handleSettingsClick() {
  try {
    await openSettingsModal({
      onSettingsChange: async () => {
        await refreshMaterialsCatalogDatalist();
        renderHome();
      },
    });
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel abrir as configuracoes.', 'error');
  }
}

// ---------- Salvar / Carregar Plano ----------

function getProjectFormData() {
  if (legacyPlannerProjectData) {
    return {
      project: legacyPlannerProjectData.project || '',
      client: legacyPlannerProjectData.client || '',
      equipment: legacyPlannerProjectData.equipment || '',
      workpack: el('workpack-name')?.value || legacyPlannerProjectData.workpack || '',
    };
  }

  const equipmentSelect = el('planner-equipment-select');
  const selectedEquipment = findPlannerEquipmentByLabel(equipmentSelect?.value);
  return {
    project: activeProjectName || '',
    client: activePlannerProject?.client || '',
    equipment: selectedEquipment ? equipmentDisplayName(selectedEquipment) : '',
    workpack: el('workpack-name')?.value || '',
  };
}

async function getMtoPageOptions() {
  const activeProject = await getActiveProjectName();
  return {
    projectId: activeProject || '',
    importedBy: currentProfile?.name || '',
    onSendToCutSheets: sendMtoRowsToCutSheets,
    onSelectionChange: (items) => {
      selectedMtoItemsForPackage = Array.isArray(items) ? [...items] : [];
    },
  };
}

function getInventoryPageOptions() {
  return {
    onGenerateMaterialCoupon: (items) => openMaterialCouponPage(items, 'inventory'),
    onSelectionChange: (items) => {
      selectedInventoryItemsForPackage = Array.isArray(items) ? [...items] : [];
    },
  };
}

function getSelectedMtoItems() {
  return [...selectedMtoItemsForPackage];
}

function getSelectedInventoryItems() {
  return [...selectedInventoryItemsForPackage];
}

function normalizePackageForValidation(cuttingPackage) {
  const materialCouponNumber = cuttingPackage.materialCouponNo || cuttingPackage.materialCouponNumber || '';
  const cuttingSheetNumber = cuttingPackage.cuttingSheetNo || cuttingPackage.cuttingSheetNumber || '';
  const rmvNumber = cuttingPackage.returnMaterialVoucherNo || cuttingPackage.rmvNumber || '';
  return {
    ...cuttingPackage,
    project: cuttingPackage.projectData?.projectName || getProjectData().project || activeProjectName || '',
    materialCouponNumber,
    cuttingSheetNumber,
    rmvNumber,
    stockItems: cuttingPackage.stockItems || cuttingPackage.selectedStock || [],
    unallocatedParts: cuttingPackage.unallocatedParts || cuttingPackage.unplacedParts || [],
    nestedBars: cuttingPackage.nestedBars || cuttingPackage.stockUsed || [],
    generatedOffcuts: (cuttingPackage.generatedOffcuts || []).map((offcut) => ({
      classification: 'OPERATIONAL_STOCK',
      status: 'AVAILABLE_OFFCUT',
      ...offcut,
    })),
    materialCoupon: { documentNumber: materialCouponNumber, cuttingPackageId: cuttingPackage.id },
    cuttingSheet: { documentNumber: cuttingSheetNumber, cuttingPackageId: cuttingPackage.id },
    returnMaterialVoucher: { documentNumber: rmvNumber, cuttingPackageId: cuttingPackage.id },
    metadata: {
      ...(cuttingPackage.metadata || {}),
      project: cuttingPackage.projectData?.projectName || getProjectData().project || activeProjectName || '',
      materialCouponNumber,
      cuttingSheetNumber,
      rmvNumber,
    },
  };
}

function buildCuttingPackageRecord(cuttingPackage, auditLog, warnings = []) {
  const payload = normalizePackageForValidation(cuttingPackage);
  payload.auditEntries = [auditLog].filter(Boolean);
  return {
    id: payload.id,
    projectId: payload.projectData?.projectCode || payload.project || '',
    number: payload.cuttingSheetNumber || payload.materialCouponNumber || payload.id,
    name: payload.projectData?.projectName || payload.project || payload.id,
    status: 'draft',
    sourceType: 'MTO_INVENTORY_MATCH',
    mtoItemIds: (payload.mtoItems || []).map((item) => item.id).filter(Boolean),
    inventoryItemIds: (payload.stockItems || []).map((item) => item.id || item.traceability || item.trace).filter(Boolean),
    createdAt: payload.createdAt,
    createdBy: payload.createdBy,
    metadata: {
      cuttingPackage: payload,
      workflowAuditLog: auditLog,
      warnings,
    },
  };
}

async function createCuttingPackageRecord({ mtoItems, stockItems }) {
  const appSettings = await getAppSettings();
  const projectData = getProjectData();
  const result = buildCuttingPackage({
    mtoItems: mtoItems.map((item) => ({ project: projectData.project || activeProjectName || '', ...item })),
    stockItems,
    settings: {
      ...appSettings,
      ...getSettings(),
      project: {
        ...(appSettings.project || {}),
        name: projectData.project || activeProjectName || appSettings.project?.name || '',
      },
    },
    createdBy: currentProfile?.name || '',
    nestingOptions: getSettings(),
  });
  const cuttingPackage = {
    ...result.cuttingPackage,
    stockItems: stockItems.map((item) => ({ ...item })),
    selectedStock: stockItems.map((item) => ({ ...item })),
  };
  return {
    ...result,
    cuttingPackage,
    record: buildCuttingPackageRecord(cuttingPackage, result.auditLog, result.warnings),
  };
}

async function createCuttingPackageAuditEntry(eventType, record, metadata = {}) {
  return createAuditEvent({
    eventType,
    entityType: 'CuttingPackage',
    entityId: record?.id || '',
    projectId: record?.projectId || '',
    userName: currentProfile?.name || '',
    sourceDocumentType: 'CuttingPackage',
    sourceDocumentId: record?.id || '',
    reason: eventType,
    metadata,
  });
}

async function sendPackageToNesting(record) {
  const { stockItems, parts } = cuttingPackageToNestingInput(record);
  if (!stockItems.length || !parts.length) {
    showToast('Pacote sem stock ou parts para enviar ao Nesting.', 'error');
    return;
  }

  stockTable.tbody.innerHTML = '';
  partsTable.tbody.innerHTML = '';
  stockItems.forEach((item) => stockTable.addRow(item));
  parts.forEach((part) => partsTable.addRow(part));
  showPlannerPhase();
  showToast('Pacote enviado para Cut Sheets. Revise e execute o nesting.', 'success');
}

async function sendMtoRowsToCutSheets(items) {
  const validItems = (Array.isArray(items) ? items : [])
    .filter((item) => item.status === 'open' || (item.validationErrors || []).length === 0);
  if (!validItems.length) {
    showToast('Nenhuma linha válida selecionada.', 'error');
    return;
  }

  validItems.forEach((item) => {
    partsTable.addRow({
      dwgNumber: item.drawing || '',
      mark: item.mark || '',
      pos: item.pos || '',
      qty: item.qty || 1,
      length: item.cutLength || 0,
      material: item.material || '',
      priority: item.priority || '',
    });
  });

  showPlannerPhase();
  showToast(`${validItems.length} linhas enviadas para Cut Sheets.`, 'success');
}

async function renderOrRefreshMtoPage() {
  const container = el('mto-phase');
  if (!container) return;
  try {
    const options = await getMtoPageOptions();
    if (mtoPageRendered) {
      await refreshMtoPage(container, options);
    } else {
      await renderMtoPage(container, options);
      mtoPageRendered = true;
    }
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar a pagina MTO.', 'error');
  }
}

async function renderOrRefreshInventoryPage() {
  const container = el('inventory-phase');
  if (!container) return;
  try {
    const options = getInventoryPageOptions();
    if (inventoryPageRendered) {
      await refreshInventoryPage(container, options);
    } else {
      await renderInventoryPage(container, options);
      inventoryPageRendered = true;
    }
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar a pagina de inventario.', 'error');
  }
}

async function createMaterialCouponAuditEntry(eventType, record, metadata = {}) {
  return createAuditEvent({
    eventType,
    entityType: 'MaterialCoupon',
    entityId: record?.id || '',
    projectId: record?.projectId || record?.metadata?.coupon?.header?.project || '',
    userName: currentProfile?.name || '',
    sourceDocumentType: 'MaterialCoupon',
    sourceDocumentId: record?.id || '',
    reason: eventType,
    metadata,
  });
}

async function renderOrRefreshMaterialCouponManager() {
  try {
    const appSettings = await getAppSettings();
    const materialCouponReportOptions = {
      reportHeader: appSettings.reportHeader,
    };
    await initMaterialCouponManager({
      listCoupons: getAllMaterialCoupons,
      getCoupon: getMaterialCoupon,
      saveCoupon: saveMaterialCoupon,
      updateCoupon: updateMaterialCoupon,
      buildMaterialCouponDocument,
      buildMaterialCouponExtractRows,
      exportMaterialCouponExtract,
      exportMaterialCouponExcel,
      materialCouponReportOptions,
      printMaterialCouponReport: async (coupon) => {
        const latestSettings = await getAppSettings();
        return openMaterialCouponReport(coupon, {
          reportHeader: latestSettings.reportHeader || materialCouponReportOptions.reportHeader,
        });
      },
      createAuditEntry: createMaterialCouponAuditEntry,
      onBack: () => showPhase(materialCouponPreviousPhase || 'documents'),
      showToast,
    });
    materialCouponManagerInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar o Material Coupon Manager.', 'error');
  }
}

async function renderOrRefreshCuttingPackagesPage() {
  try {
    if (cuttingPackagesPageInitialized) {
      await initCuttingPackagesPage({
        loadPackages: getAllCuttingPackages,
        savePackage: saveCuttingPackage,
        updatePackage: updateCuttingPackage,
        createAuditEntry: createCuttingPackageAuditEntry,
        createCuttingPackage: createCuttingPackageRecord,
        validateCuttingPackage,
        sendPackageToNesting,
        getSelectedMtoItems,
        getSelectedInventoryItems,
        showToast,
      });
      return;
    }

    await initCuttingPackagesPage({
      loadPackages: getAllCuttingPackages,
      savePackage: saveCuttingPackage,
      updatePackage: updateCuttingPackage,
      createAuditEntry: createCuttingPackageAuditEntry,
      createCuttingPackage: createCuttingPackageRecord,
      validateCuttingPackage,
      sendPackageToNesting,
      getSelectedMtoItems,
      getSelectedInventoryItems,
      showToast,
    });
    cuttingPackagesPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar Cutting Packages.', 'error');
  }
}

async function renderOrRefreshProjectManagerPage() {
  try {
    const activeProjectNameForManager = await getActiveProjectName();
    await initProjectManagerPage({
      listProjects: getAllProjects,
      createProject,
      updateProject,
      deleteProject,
      listEquipments,
      openEquipmentsPage: () => showPhase('equipments'),
      activeProjectName: activeProjectNameForManager,
      showToast,
    });
    projectManagerPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar o Gerenciador de Projetos.', 'error');
  }
}

async function renderOrRefreshEquipmentPage() {
  try {
    const defaultProjectId = await getActiveProjectName();
    await initEquipmentPage({
      listEquipments,
      createEquipment,
      updateEquipment,
      deleteEquipment,
      getEquipment,
      listProjects: getAllProjects,
      defaultProjectId,
      showToast,
    });
    equipmentPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar Equipamentos.', 'error');
  }
}

async function renderOrRefreshWorkpackPage() {
  try {
    const defaultProjectId = await getActiveProjectName();
    await initWorkpackPage({
      listWorkpacks,
      createWorkpack,
      updateWorkpack,
      deleteWorkpack,
      getWorkpack,
      listProjects: getAllProjects,
      listEquipments,
      listDrawings,
      defaultProjectId,
      showToast,
    });
    workpackPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar Workpacks.', 'error');
  }
}

async function renderOrRefreshDrawingPage() {
  try {
    const defaultProjectId = await getActiveProjectName();
    await initDrawingPage({
      listDrawings,
      createDrawing,
      updateDrawing,
      deleteDrawing,
      getDrawing,
      getDrawingByDrawingNo,
      listProjects: getAllProjects,
      listEquipments,
      defaultProjectId,
      showToast,
    });
    drawingPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar Drawings.', 'error');
  }
}

function setProjectFormData(data = {}) {
  const project = textValue(data.project).trim();
  const equipment = textValue(data.equipment).trim();
  const workpack = textValue(data.workpack).trim();

  if (el('workpack-name')) el('workpack-name').value = workpack;
  if (data.reportDate && el('report-date')) el('report-date').value = data.reportDate;

  if (project) {
    legacyPlannerProjectData = {
      project,
      client: textValue(data.client).trim(),
      equipment,
      workpack,
    };
    pendingPlannerEquipmentLabel = '';
    renderPlannerProjectContext();
    return;
  }

  legacyPlannerProjectData = null;
  pendingPlannerEquipmentLabel = equipment;
  void refreshPlannerProjectContext();
}

function getProjectData() {
  return {
    ...getProjectFormData(),
    reportDate: el('report-date').value,
  };
}

function getMaterialCouponInitialData() {
  const projectData = getProjectData();
  return {
    project: projectData.project || activeProjectName || '',
    client: projectData.client || 'TOTAL ENERGIES',
    workpack: projectData.workpack || '',
    date: projectData.reportDate || new Date().toISOString().slice(0, 10),
    issuingName: currentProfile?.name || '',
    issuingCompany: 'SAIPEM',
  };
}

function openMaterialCouponPage(selectedMaterials, previousPhase = 'inventory') {
  const materials = Array.isArray(selectedMaterials) ? selectedMaterials.filter(Boolean) : [];
  materialCouponPreviousPhase = previousPhase;
  if (!materials.length) {
    showToast('Selecione ao menos um material para gerar o Material Coupon.', 'error');
  }

  const container = el('section-material-coupons');
  if (!container) {
    showToast('Pagina de Material Coupon indisponivel.', 'error');
    return;
  }

  mountMaterialCouponPage(container, {
    selectedMaterials: materials,
    initialData: getMaterialCouponInitialData(),
    onBack: () => showPhase(materialCouponPreviousPhase),
  });
  showPhase('material-coupons');
}

function openMaterialCouponFromResults() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o Material Coupon.', 'error');
    return;
  }
  const materials = Array.isArray(lastSolution.stockUsed) ? lastSolution.stockUsed : [];
  openMaterialCouponPage(materials, 'results');
}

function buildPlanSnapshot() {
  return {
    projectData: getProjectData(),
    settings: {
      kerf: el('kerf').value,
      minOffcut: el('min-offcut').value,
      strategy: el('stock-strategy').value,
      enableTrim: el('enable-trim').checked,
      leftTrim: el('left-trim').value,
      rightTrim: el('right-trim').value,
    },
    stocks: stockTable.getRows({ expandQty: false, includeInvalid: true }),
    parts: partsTable.getRows({ expandQty: false, includeInvalid: true }),
    solutionSummary: summarizeSolution(lastSolution),
  };
}

function summarizeSolution(solution) {
  if (!solution) return null;
  return {
    totalStockLength: solution.totalStockLength,
    totalRemaining: solution.totalRemaining,
    totalTrims: solution.totalTrims,
    stockUsedCount: solution.stockUsed?.length || 0,
    unplacedCount: solution.unplacedParts?.length || 0,
  };
}

function applyPlanSnapshot(plan) {
  const pd = plan.projectData || {};
  setProjectFormData(pd);

  const s = plan.settings || {};
  el('kerf').value = s.kerf ?? 5;
  el('min-offcut').value = s.minOffcut ?? 500;
  el('stock-strategy').value = s.strategy || 'best-fit';
  el('enable-trim').checked = !!s.enableTrim;
  el('left-trim').value = s.leftTrim ?? 0;
  el('right-trim').value = s.rightTrim ?? 0;
  el('trim-inputs').classList.toggle('hidden', !s.enableTrim);

  stockTable.tbody.innerHTML = '';
  partsTable.tbody.innerHTML = '';
  (plan.stocks || []).forEach(r => stockTable.addRow(r));
  (plan.parts || []).forEach(r => partsTable.addRow(r));

  showPlannerPhase();
  lastSolution = null;
  renderHome();
}

async function loadSavedPlan(name) {
  const plan = await getPlan(name);
  if (!plan) {
    showToast(`Plano "${name}" nao encontrado.`, 'error');
    return;
  }
  applyPlanSnapshot(plan);
  showToast(`Plano "${name}" carregado.`, 'success');
}

async function deleteSavedPlan(name) {
  await deletePlan(name);
  renderHome();
  showToast(`Plano "${name}" excluido.`, 'success');
}

function openSavePlanModal() {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Nome do plano';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = '<label style="display:block;margin-bottom:8px;font-size:var(--fs-sm);">Nome para identificar este plano:</label>';
  wrapper.appendChild(input);

  openModal({
    title: 'Salvar Plano',
    body: wrapper,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar', variant: 'btn-primary',
        onClick: async () => {
          const name = input.value.trim();
          if (!name) { showToast('Informe um nome para o plano.', 'error'); return; }
          await savePlan(name, buildPlanSnapshot());
          renderHome();
          showToast(`Plano "${name}" salvo.`, 'success');
        },
      },
    ],
  });
  setTimeout(() => input.focus(), 50);
}

function openLoadPlanModalFlow() {
  showLoadPlanModal(getAllPlans, {
    onLoad: loadSavedPlan,
    onDelete: deleteSavedPlan,
  });
}

function openSaveProjectModal() {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Nome do projeto salvo';
  input.value = activeProjectName || getProjectFormData().project || '';

  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.style.display = 'block';
  label.style.marginBottom = '8px';
  label.style.fontSize = 'var(--fs-sm)';
  label.textContent = 'Nome para identificar este projeto:';
  wrapper.append(label, input);

  openModal({
    title: 'Salvar Projeto',
    body: wrapper,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar',
        variant: 'btn-primary',
        onClick: async () => {
          const name = input.value.trim();
          if (!name) { showToast('Informe um nome para o projeto.', 'error'); return; }
          await saveProject(name, getProjectFormData());
          activeProjectName = name;
          updateActiveProjectLabel();
          showToast(`Projeto "${name}" salvo.`, 'success');
        },
      },
    ],
  });
  setTimeout(() => input.focus(), 50);
}

function openSwitchProjectModal() {
  openEntityListModal({
    title: 'Projetos Salvos',
    loadItems: getAllProjects,
    searchFields: ['name', 'project', 'client', 'equipment', 'workpack'],
    renderCardMeta: (project) => [
      `Projeto: ${project.project || 'N/A'} - Cliente: ${project.client || 'N/A'}`,
      `Equipamento: ${project.equipment || 'N/A'} - Workpack: ${project.workpack || 'N/A'}`,
    ],
    onLoad: (project) => {
      setProjectFormData({
        project: project.project || project.name || '',
        client: project.client || '',
        equipment: project.equipment || '',
        workpack: project.workpack || '',
      });
      showToast(`Projeto "${project.name}" carregado.`, 'success');
    },
    onDelete: async (project) => {
      await deleteProject(project.name);
      if (activeProjectName === project.name) {
        activeProjectName = '';
        updateActiveProjectLabel();
      }
      showToast(`Projeto "${project.name}" excluido.`, 'success');
    },
    emptyMessage: 'Nenhum projeto salvo ainda.',
  });
}

function openInventoryFlow() {
  openInventoryModal({
    onAddToStock: (row) => {
      stockTable.addRow(row);
      showToast('Material adicionado ao estoque.', 'success');
    },
  });
}

function openMtoImportFlow() {
  showPhase('mto');
}

function renderHome() {
  const container = el('home-phase');
  if (!container) return;
  renderHomeDashboard(container, {
    getPlans: getAllPlans,
    hasResults: !!lastSolution,
    onNewPlan: handleNewPlan,
    onImportInventory: openInventoryFlow,
    onViewResults: showResultsPhase,
    onLoadPlan: loadSavedPlan,
    onDeletePlan: deleteSavedPlan,
  });
}

function syncReportOptionControls() {
  document.querySelectorAll('[data-label-option]').forEach((button) => {
    const key = button.dataset.labelOption;
    const active = reportViewOptions.labels[key] === true;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const fontSlider = el('label-font-size-slider');
  const fontValue = el('label-font-size-value');
  if (fontSlider) fontSlider.value = String(reportViewOptions.labelFontSizePt);
  if (fontValue) fontValue.textContent = `${reportViewOptions.labelFontSizePt}pt`;

  const colorButton = el('toggle-colors-btn');
  if (colorButton) colorButton.textContent = reportViewOptions.useColors ? 'Colors' : 'Monochrome';

  const signatures = el('include-signatures');
  if (signatures) signatures.checked = reportViewOptions.includeSignatures;
}

function applyReportOptionChange() {
  syncReportOptionControls();
  renderCurrentResults();
}

function wireReportOptionControls() {
  document.querySelectorAll('[data-label-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.labelOption;
      reportViewOptions.labels[key] = !reportViewOptions.labels[key];
      applyReportOptionChange();
    });
  });

  el('label-font-size-slider')?.addEventListener('input', (event) => {
    reportViewOptions.labelFontSizePt = Number(event.target.value) || 9;
    applyReportOptionChange();
  });

  el('toggle-colors-btn')?.addEventListener('click', () => {
    reportViewOptions.useColors = !reportViewOptions.useColors;
    applyReportOptionChange();
  });

  el('include-signatures')?.addEventListener('change', (event) => {
    reportViewOptions.includeSignatures = event.target.checked === true;
    applyReportOptionChange();
  });

  syncReportOptionControls();
}

function ensureSummaryExportButton() {
  if (el('print-resumido-btn')) return;
  const grid = document.querySelector('#export-modal .export-cards-grid');
  if (!grid) return;

  const button = document.createElement('button');
  button.className = 'export-card';
  button.id = 'print-resumido-btn';
  button.type = 'button';

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined export-card-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'summarize';

  const title = document.createElement('span');
  title.className = 'export-card-title';
  title.dataset.translate = 'printButtonResumido';
  title.textContent = getReportTranslation('printButtonResumido') || 'Report Resumido';

  const description = document.createElement('span');
  description.className = 'export-card-desc';
  description.textContent = 'Resumo em paisagem usando os KPIs e diagramas ja renderizados.';

  button.append(icon, title, description);
  const excelButton = el('btn-export-excel');
  if (excelButton) grid.insertBefore(button, excelButton);
  else grid.appendChild(button);
}

function wireExportModal() {
  const exportModal = el('export-modal');
  ensureSummaryExportButton();

  el('open-export-modal')?.addEventListener('click', () => {
    if (!lastSolution) {
      showToast('Otimize um plano antes de exportar.', 'error');
      return;
    }
    exportModal?.showModal();
  });

  el('close-export-modal')?.addEventListener('click', () => exportModal?.close());

  exportModal?.addEventListener('click', (event) => {
    const rect = exportModal.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (clickedOutside) exportModal.close();
  });

  el('btn-export-pdf-visual')?.addEventListener('click', () => {
    exportModal?.close();
    onExportVisualPdf();
  });

  el('btn-export-pdf-tabular')?.addEventListener('click', () => {
    exportModal?.close();
    onExportTabularPdf();
  });

  el('btn-export-pdf-sheet')?.addEventListener('click', () => {
    exportModal?.close();
    onExportCuttingSheetPdf();
  });

  el('print-resumido-btn')?.addEventListener('click', () => {
    exportModal?.close();
    printReport('resumido');
  });

  el('btn-export-excel')?.addEventListener('click', () => {
    exportModal?.close();
    onExportExcel();
  });
}

function bindWorkflowPlaceholders() {
  const bind = (id, handler) => {
    const element = el(id);
    if (!element) return;
    element.addEventListener('click', handler);
  };

  bind('btn-import-mto', () => {
    console.info('[workflow] Import MTO clicked');
  });

  bind('btn-validate-mto', () => {
    console.info('[workflow] Validate MTO clicked');
  });

  bind('btn-open-material-match', () => {
    console.info('[workflow] MTO x Inventory Match clicked');
  });

  bind('btn-generate-cutting-sheet', () => {
    console.info('[workflow] Generate Cutting Sheet clicked');
  });

  bind('btn-generate-rmv', () => {
    console.info('[workflow] Generate RMV clicked');
  });

  bind('btn-return-offcuts-to-stock', () => {
    console.info('[workflow] Return Offcuts to Stock clicked');
  });

  bind('btn-mark-offcuts-scrap', () => {
    console.info('[workflow] Mark Offcuts as Scrap clicked');
  });

  bind('btn-create-offcut-rmv', () => {
    console.info('[workflow] Create Offcut RMV clicked');
  });

  bind('btn-refresh-audit-log', () => {
    console.info('[workflow] Refresh Audit Log clicked');
  });

  bind('btn-export-audit-log', () => {
    console.info('[workflow] Export Audit Log clicked');
  });
}

function init() {
  const stockList = el('stock-list');
  const partsList = el('parts-list');
  const calculateButton = el('calculate');

  if (!stockList || !partsList || !calculateButton) {
    showToast('Falha ao iniciar a tela do plano. Recarregue a pagina.', 'error');
    return;
  }

  stockTable = createDataTable(stockList, STOCK_COLUMNS);
  partsTable = createDataTable(partsList, PARTS_COLUMNS);

  stockTable.addRow({ po: 'PO123', item: 'IT456', qty: 1, length: 6000, materialGrade: 'A36', heatNumber: 'H789', description: 'Pipe 6 in', traceability: 'T-101' });
  partsTable.addRow({ dwgNumber: 'D-001', mark: 'M-01', pos: 'P-01', qty: 3, length: 1200, material: 'A36', priority: '2' });

  el('add-stock')?.addEventListener('click', () => stockTable.addRow());
  el('import-inventory-btn')?.addEventListener('click', openInventoryFlow);
  el('import-mto-btn')?.addEventListener('click', openMtoImportFlow);
  el('add-part')?.addEventListener('click', () => partsTable.addRow());
  el('enable-trim')?.addEventListener('change', (e) => el('trim-inputs')?.classList.toggle('hidden', !e.target.checked));
  el('calculate')?.addEventListener('click', calculate);
  el('back-to-edit-btn')?.addEventListener('click', showPlannerPhase);
  el('generate-results-material-coupon-btn')?.addEventListener('click', openMaterialCouponFromResults);
  el('btn-open-material-coupon-manager')?.addEventListener('click', () => {
    materialCouponPreviousPhase = 'documents';
    showPhase('material-coupons');
  });
  el('btn-generate-material-coupon')?.addEventListener('click', () => {
    materialCouponPreviousPhase = 'documents';
    showPhase('material-coupons');
  });
  initMaterialCouponTemplateModal({
    saveDocumentTemplate,
    getDocumentTemplate,
    deleteDocumentTemplate,
    hasDocumentTemplate,
    generateMaterialCouponTemplateTest,
    showToast,
  });
  el('btn-configure-material-coupon-template')?.addEventListener('click', () => {
    openMaterialCouponTemplateModal();
  });
  el('new-plan-btn')?.addEventListener('click', handleNewPlan);
  el('save-plan-btn')?.addEventListener('click', openSavePlanModal);
  el('load-plan-btn')?.addEventListener('click', openLoadPlanModalFlow);
  el('save-project-btn')?.addEventListener('click', openSaveProjectModal);
  el('switch-project-btn')?.addEventListener('click', openSwitchProjectModal);
  el('active-project-selector')?.addEventListener('click', openActiveProjectSelector);
  el('planner-select-project-btn')?.addEventListener('click', openActiveProjectSelector);
  el('profile-btn')?.addEventListener('click', () => openProfileModal({ onSave: refreshProfileButton }));
  el('settings-btn')?.addEventListener('click', handleSettingsClick);

  el('planner-equipment-select')?.addEventListener('change', () => {
    legacyPlannerProjectData = null;
    pendingPlannerEquipmentLabel = '';
    updateActiveProjectLabel();
  });

  ['workpack-name'].forEach((id) => {
    el(id)?.addEventListener('input', () => {
      updateActiveProjectLabel();
    });
  });

  wireFileUpload('upload-stock-btn', 'stock-file-input', stockTable);
  wireFileUpload('upload-parts-btn', 'parts-file-input', partsTable);
  wireNavigation();
  bindWorkflowPlaceholders();
  wireReportOptionControls();
  wireExportModal();
  refreshProfileButton();
  refreshActiveProjectSelector();
  refreshPlannerProjectContext();
  refreshMaterialsCatalogDatalist();
  applyDefaultPlannerSettings();
  renderHome();
  showPhase('home');

  const today = new Date().toISOString().slice(0, 10);
  if (el('report-date')) el('report-date').value = today;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}



