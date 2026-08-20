import { createDataTable } from './ui/dataTable.js';
import { STOCK_COLUMNS, PARTS_COLUMNS } from './ui/columns.js';
import { getInitials } from './core/utils.js';
import { validateTraceability } from './core/validation.js';
import { runAllocations } from './core/allocate.js';
import { renderResults } from './ui/results.js';
import { showToast } from './ui/toast.js';
import {
  getAllProjects,
  getProject,
  saveProject,
  deleteProject,
  createProject,
  updateProject,
} from './data/projects.js';
import { clearActiveUserId, getActiveUser } from './data/userSession.js';
import { getUser, migrateLegacyProfileToUsers } from './data/users.js';
import { subscribeToIdbChanges } from './data/idb.js';
import { createFsApiAdapter } from './core/fileAdapters/fsApiAdapter.js';
import { SyncManager } from './core/syncManager.js';
import { createSharedDirectoryHandleStore } from './data/sharedDirectoryHandle.js';
import { createSharedSyncCache } from './data/sharedSyncCache.js';
import { SHARED_SYNC_STORES, syncKeysForPhase } from './data/sharedSyncConfig.js';
import { createSharedSyncMetadataStore } from './data/sharedSyncMetadata.js';
import { getOrCreateSharedSyncSession } from './data/sharedSyncSession.js';
import { createSharedSyncControls } from './ui/sharedSyncControls.js';
import { getAppSettings, saveAppSettings, getActiveProjectName, setActiveProjectName } from './data/appSettings.js';
import { getCurrentLanguage, observeTranslations, setLanguage, t, translateDom } from './i18n/index.js';
import {
  readExcelFile,
  exportSolutionToExcel,
  exportMaterialCouponExtract,
  exportMaterialCouponControlDatabase,
  exportMaterialCouponExcel,
  exportReturnMaterialVoucherExcel,
  exportPurchaseOrderDatabaseExcel,
  exportPurchaseOrderProgressExcel,
  exportInventoryDatabaseExcel,
  exportMtoItemsExcel,
  exportTaskSheetExcel,
} from './data/excel.js';
import { openModal, closeModal } from './ui/modal.js';
import { openNewDocumentModal } from './ui/newDocumentModal.js';
import { showLoadPlanModal } from './ui/planListModal.js';
import { openEntityListModal } from './ui/entityListModal.js';
import { openSobremetalModal } from './ui/sobremetalModal.js';
import { renderHomeDashboard } from './ui/homeDashboard.js';
import { renderGenealogyPage } from './ui/genealogyPage.js';
import { renderReportsPage } from './ui/reportsUI.js';
import { exportActiveReportExcel, openReportsPresentation } from './ui/reportsExport.js';
import { openActiveUserMenu, openUsersManager, selectUserForSession } from './ui/usersPage.js';
import { openSettingsModal } from './ui/settingsModal.js';
import { openInventoryModal } from './ui/inventoryModal.js';
import { createInventoryItem, getInventoryItem, getInventoryItems, updateInventoryItem } from './data/inventoryDB.js';
import { createStockMovement, deleteStockMovement, getAllStockMovements, getStockMovements } from './data/stockMovements.js';
import { mapInventoryItemToStockRow } from './data/inventoryImport.js';
import { linkedInventoryForPlanner, uniqueLinkedRecords } from './core/workpackPlanner.js';
import { operationalWorkpackValue, workpackRelationIds, WORKPACK_RELATION_TYPES } from './core/workpackRelations.js';
import { filterWorkpackNestingInputs } from './core/workpackMaterials.js';
import { renderInventoryPage, refreshInventoryPage } from './ui/inventoryPage.js';
import { renderMtoPage, refreshMtoPage } from './ui/mtoPage.js';
import { initProjectManagerPage } from './ui/projectManagerPage.js';
import { initEquipmentPage, openEquipmentOperationalView } from './ui/equipmentPage.js';
import { initWorkpackPage, syncWorkpackMtoItems } from './ui/workpackPage.js';
import { initReturnMaterialPage } from './ui/returnMaterialPage.js';
import { openReturnMaterialVoucherModal } from './ui/returnMaterialVoucherModal.js';
import { openWorkpackQuickCreateModal } from './ui/workpackQuickCreateModal.js';
import { initDrawingPage, openNewDrawingForEquipment } from './ui/drawingPage.js';
import {
  openCuttingSheetPdfReport,
  openTabularPdfReport,
} from './reports/cuttingReport.js';
import { printVisualReport } from './reports/printVisual.js';
import { openSummaryReport } from './reports/summaryReport.js';
import { openPhysicalPieceLabelsReport } from './reports/labels.js';
import { openPieceLabelTemplateModal } from './ui/pieceLabelTemplateModal.js';
import {
  initMaterialCouponManager,
  mountMaterialCouponPage,
  openMaterialCouponEditor,
} from './features/materialCoupon/materialCouponService.js';
import { MATERIAL_COUPON_ACTIONS } from './core/materialCouponWorkflow.js';
import { syncCuttingSheetPieceCouponLinks } from './core/materialCouponPieceLink.js';
import { nextCuttingSheetNumber } from './core/documentNumbering.js';
import { cuttingSheetPlanningSnapshot, preparePiecesForNesting } from './core/cuttingSheetPlanning.js';
import { initCuttingSheetsPage, refreshCuttingSheetsPage, showCuttingSheetsPage } from './ui/cuttingSheetsPage.js';
import { canAutoSuggestNestingPlanName, getNestingPlanName, initNestingPlanWorkspace, initNestingResultsCommandBar, refreshNestingPlanWorkspace, setNestingPlanWorkspaceState } from './ui/nestingPlanWorkspace.js';
import {
  initMaterialCouponTemplateModal,
  openMaterialCouponTemplateModal,
} from './ui/materialCouponTemplateModal.js';
import { createAuditEvent, deleteAuditEvent, getAllAuditEvents, getAuditEvents } from './data/auditLog.js';
import {
  getAllMaterialCoupons,
  getMaterialCoupon,
  getMaterialCoupons,
  saveMaterialCoupon,
  updateMaterialCoupon,
  deleteMaterialCoupon,
  deleteMaterialCoupons,
} from './data/materialCoupons.js';
import { deleteCuttingSheet, getAllCuttingSheets, getCuttingSheet, saveCuttingSheet, updateCuttingSheet } from './data/cuttingSheets.js';
import { migratePlansToCuttingSheets } from './data/cuttingSheetPlanMigration.js';
import { deleteOffcut, getAllOffcuts, saveOffcut, updateOffcut } from './data/offcuts.js';
import { buildFinalMaterialRemainders, classifyOffcutLength, OFFCUT_CLASSIFICATION } from './core/offcutClassification.js';
import { getAllReturnMaterialVouchers, getReturnMaterialVouchers, saveReturnMaterialVoucher } from './data/returnMaterialVouchers.js';
import { processOffcutDisposition } from './workflows/processOffcutDisposition.js';
import { createOrReuseRmvDraft, issueRmv, receiveRmvLines, cancelRmv } from './workflows/returnMaterialVoucherWorkflow.js';
import { cuttingSheetRmvCandidates } from './core/returnMaterialVoucher.js';
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
import { listEquipmentTypes, seedEquipmentTypes } from './data/equipmentTypes.js';
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
  buildMaterialCouponStockRows,
  mergeMaterialCouponInventoryDetails,
} from './documents/materialCoupon.js';
import { generateMaterialCouponTemplateTest } from './documents/materialCouponExcel.js';
import { openMaterialCouponReport } from './reports/materialCouponReport.js';
import { openReturnMaterialVoucherReport } from './reports/returnMaterialVoucherReport.js';
import { getMtoItems } from './data/mtoDB.js';
import { loadDashboardData } from './data/dashboardData.js';
import { loadReportsData } from './data/reports.js';
import { normalizePhase } from './core/navigation.js';
import { mtoDemandQuantity, suggestMtoPoItemAllocationsByIdentCode } from './core/mtoPoItemAllocation.js';
import { persistWorkpackAudit } from './core/workpackAudit.js';
import { renderDocumentsPage } from './ui/documentsPage.js';
import { initAuditPage } from './ui/auditPage.js';
import { initDataQualityPage } from './ui/dataQualityPage.js';
import { initProcurementPage } from './ui/procurementPage.js';
import { getAllOrganizations, getOrganization, saveOrganization } from './data/organizations.js';
import { createPurchaseOrder, createPurchaseOrderRevision, deletePurchaseOrder, deletePurchaseOrderItem, getAllPurchaseOrderItems, getAllPurchaseOrderRevisions, getAllPurchaseOrders, getPurchaseOrder, getPurchaseOrderItem, savePurchaseOrder, savePurchaseOrderItem } from './data/purchaseOrders.js';
import { createMaterialReceiptWithLine, getAllMaterialReceiptLines, getAllMaterialReceipts, getAllMaterialUnits, updateReceivedMaterialUnit } from './data/materialReceipts.js';
import {
  cancelMtoPoItemAllocation,
  listMtoPoItemAllocations,
  listMtoProcurementCoverage,
  saveMtoPoItemAllocation,
  saveMtoPoItemAllocations,
} from './data/mtoPoItemAllocations.js';
import { cancelPoDeliveryForecast, listPoDeliveryForecasts, savePoDeliveryForecast } from './data/poDeliveryForecasts.js';
import { commitMaterialUnitsToInventory } from './data/materialUnitPostingTransaction.js';
import { readPurchaseOrderFile } from './data/purchaseOrderFiles.js';
import { commitPurchaseOrderImport } from './data/purchaseOrderImportTransaction.js';
import { parseDelimitedPurchaseOrderText } from './core/purchaseOrderImport.js';
import { ensureWorkpackLink, listWorkpackLinks, migrateLegacyWorkpackLinks, replaceWorkpackTargetLinks, unlinkWorkpackTarget, WORKPACK_LINK_TARGETS } from './data/workpackLinks.js';
import { listMaterialReservations } from './data/materialReservations.js';
import { createMaterialTransformation, deleteMaterialTransformation, listMaterialTransformations } from './data/materialTransformations.js';
import { confirmCuttingSheet } from './workflows/confirmCuttingSheet.js';
import { commitCuttingConfirmation } from './data/cuttingConfirmationTransaction.js';
import { commitMaterialCouponIssue } from './data/materialCouponIssueTransaction.js';
import { commitMaterialCouponInventoryAction } from './data/materialCouponActionTransaction.js';
import { commitRmvReceipt } from './data/rmvReceiptTransaction.js';
import { commitRmvCancellation, commitRmvIssue } from './data/rmvLifecycleTransaction.js';
import { commitCutExecution } from './data/cutExecutionTransaction.js';
import { cuttingSheetIssueErrorMessage, prepareCuttingSheetIssue } from './core/cuttingSheetWorkflow.js';
import { migrateChildProjectIds } from './data/projectIdentityMigration.js';
import { inspectAllDataReferences } from './data/dataReferenceInspection.js';
import { listTaskSheets, saveTaskSheet } from './data/taskSheets.js';

const el = (id) => document.getElementById(id);

let stockTable = null;
let partsTable = null;

let lastSolution = null;
let currentCuttingSheetId = '';
let activeProjectName = '';
let activeProjectId = '';
let currentPhase = 'home';
let activePlannerProject = null;
let plannerEquipments = [];
let plannerWorkpacks = [];
let legacyPlannerProjectData = null;
let pendingPlannerEquipmentLabel = '';
let currentProfile = null;
let mtoPageRendered = false;
let pendingMtoFilters = null;
let inventoryPageRendered = false;
let materialCouponPreviousPhase = 'inventory';
let materialCouponManagerInitialized = false;
let reportsRequestedEquipmentTag = '';
let projectManagerPageInitialized = false;
let equipmentPageInitialized = false;
let workpackPageInitialized = false;
let drawingPageInitialized = false;
let cuttingSheetsPageInitialized = false;
let sharedSyncManager = null;
let sharedSyncControls = null;
const reportViewOptions = {
  labels: {
    sequence: true,
    mark: true,
    pos: true,
    length: true,
  },
  labelFontSizePt: 9,
  colorMode: 'ink',
  useColors: false,
  includeSignatures: false,
};

const REPORT_TRANSLATIONS = Object.freeze({
  en: Object.freeze({ printButtonResumido: 'Summary Report' }),
  'pt-br': Object.freeze({ printButtonResumido: 'Relatório Resumido' }),
  it: Object.freeze({ printButtonResumido: 'Report Riepilogativo' }),
  fr: Object.freeze({ printButtonResumido: 'Rapport Résumé' }),
});

function setActiveSection(title) {
  el('active-section-title').textContent = t(title);
}

async function initializeApplicationLanguage() {
  const settings = await getAppSettings();
  translateDom(document);
  setLanguage(settings.language);
  observeTranslations(document.body);
  document.querySelectorAll('[data-language-selector]').forEach((selector) => {
    selector.addEventListener('change', async () => {
      const previousLanguage = getCurrentLanguage();
      const language = setLanguage(selector.value);
      translateDom(document);
      try {
        await saveAppSettings({ language });
        showToast(t('Language preference saved.'), 'success');
      } catch (error) {
        console.error('Could not persist the application language.', error);
        setLanguage(previousLanguage);
        showToast(t('Could not change the application language.'), 'error');
      }
    });
  });
}

function setActiveNav(phase) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.phase === phase);
  });
}

function closeTransientInteractionLayers() {
  closeModal();
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function restorePlannerInteractivity() {
  const planner = el('planner-phase');
  if (!planner) return;
  planner.removeAttribute('inert');
  planner.removeAttribute('aria-busy');
  planner.classList.remove('is-locked');
  planner.querySelectorAll([
    '#stock-list .planner-cell-editor',
    '#parts-list .planner-cell-editor',
    '#stock-list .planner-row-action',
    '#parts-list .planner-row-action',
    '#add-stock',
    '#add-part',
    '#import-stock-btn',
    '#import-inventory-btn',
    '#import-parts-btn',
    '#import-mto-btn',
    '#calculate',
  ].join(', ')).forEach((control) => { control.disabled = false; });
}

function showPhase(phase) {
  const normalizedPhase = normalizePhase(phase);
  closeTransientInteractionLayers();
  currentPhase = normalizedPhase;
  el('home-phase')?.classList.toggle('hidden', normalizedPhase !== 'home');
  el('planner-phase')?.classList.toggle('hidden', normalizedPhase !== 'planner');
  el('cut-sheets-phase')?.classList.toggle('hidden', normalizedPhase !== 'cut-sheets');
  el('mto-phase')?.classList.toggle('hidden', normalizedPhase !== 'mto');
  el('inventory-phase')?.classList.toggle('hidden', normalizedPhase !== 'inventory');
  el('procurement-phase')?.classList.toggle('hidden', normalizedPhase !== 'procurement');
  el('section-projects')?.classList.toggle('hidden', normalizedPhase !== 'projects');
  el('section-equipments')?.classList.toggle('hidden', normalizedPhase !== 'equipments');
  el('section-workpacks')?.classList.toggle('hidden', normalizedPhase !== 'workpacks');
  el('section-drawings')?.classList.toggle('hidden', normalizedPhase !== 'drawings');
  el('section-material-coupons')?.classList.toggle('hidden', normalizedPhase !== 'material-coupons');
  el('return-material-phase')?.classList.toggle('hidden', normalizedPhase !== 'return-material');
  el('documents-phase')?.classList.toggle('hidden', normalizedPhase !== 'documents');
  el('audit-phase')?.classList.toggle('hidden', normalizedPhase !== 'audit');
  el('data-quality-phase')?.classList.toggle('hidden', normalizedPhase !== 'data-quality');
  el('reports-phase')?.classList.toggle('hidden', normalizedPhase !== 'reports');
  el('genealogy-phase')?.classList.toggle('hidden', normalizedPhase !== 'genealogy');
  setActiveNav(normalizedPhase);
  const activeLink = document.querySelector(`.nav-link[data-phase="${normalizedPhase}"]`);
  setActiveSection(normalizedPhase === 'material-coupons' ? 'Material Coupon' : activeLink?.dataset.sectionTitle || 'Industrial Intelligence');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (normalizedPhase === 'planner') {
    restorePlannerInteractivity();
    void refreshPlannerProjectContext();
  }
  if (normalizedPhase === 'cut-sheets') {
    showCuttingSheetsPage(1);
    void renderOrRefreshCuttingSheetsPage();
  }
  if (normalizedPhase === 'mto') void renderOrRefreshMtoPage();
  if (normalizedPhase === 'inventory') void renderOrRefreshInventoryPage();
  if (normalizedPhase === 'procurement') void renderOrRefreshProcurementPage();
  if (normalizedPhase === 'projects') void renderOrRefreshProjectManagerPage();
  if (normalizedPhase === 'equipments') void renderOrRefreshEquipmentPage();
  if (normalizedPhase === 'workpacks') void renderOrRefreshWorkpackPage();
  if (normalizedPhase === 'drawings') void renderOrRefreshDrawingPage();
  if (normalizedPhase === 'material-coupons') void renderOrRefreshMaterialCouponManager();
  if (normalizedPhase === 'return-material') void renderOrRefreshReturnMaterialPage();
  if (normalizedPhase === 'documents') void renderOrRefreshDocumentsPage();
  if (normalizedPhase === 'audit') void renderOrRefreshAuditPage();
  if (normalizedPhase === 'data-quality') void renderOrRefreshDataQualityPage();
  if (normalizedPhase === 'reports') void renderOrRefreshReportsPage();
  if (normalizedPhase === 'genealogy') void renderOrRefreshGenealogyPage();
  void sharedSyncControls?.enterPhase(normalizedPhase);
}

async function refreshCurrentSyncPhase() {
  const refreshers = {
    mto: renderOrRefreshMtoPage,
    inventory: renderOrRefreshInventoryPage,
    procurement: renderOrRefreshProcurementPage,
    projects: renderOrRefreshProjectManagerPage,
    equipments: renderOrRefreshEquipmentPage,
    drawings: renderOrRefreshDrawingPage,
    workpacks: renderOrRefreshWorkpackPage,
    'material-coupons': renderOrRefreshMaterialCouponManager,
    'cut-sheets': renderOrRefreshCuttingSheetsPage,
    'return-material': renderOrRefreshReturnMaterialPage,
    audit: renderOrRefreshAuditPage,
  };
  await refreshers[currentPhase]?.();
}

async function initializeSharedFolderSync() {
  const adapter = createFsApiAdapter({ handleStore: createSharedDirectoryHandleStore() });
  const syncSession = getOrCreateSharedSyncSession();
  sharedSyncManager = new SyncManager({
    adapter,
    cache: createSharedSyncCache(),
    storeDefinitions: SHARED_SYNC_STORES,
    identityProvider: () => currentProfile || getActiveUser(),
    metadataStore: createSharedSyncMetadataStore(),
    deviceSessionId: syncSession.deviceSessionId,
    sessionId: syncSession.sessionId,
  });
  sharedSyncControls = createSharedSyncControls({
    manager: sharedSyncManager,
    adapter,
    syncKeysForPhase,
    getCurrentPhase: () => currentPhase,
    refreshCurrentPhase: refreshCurrentSyncPhase,
    resolveUserName: async (id) => (await getUser(id))?.name || '',
    openModal,
    closeModal,
    showToast,
  });
  const result = await sharedSyncControls.initialize({ subscribeToIdbChanges });
  window.addEventListener('pagehide', () => void sharedSyncManager?.releaseLocks(), { once: true });
  return result;
}

async function refreshProfileButton(user = null) {
  const button = el('profile-btn');
  if (!button) return;

  const profile = user || await getActiveUser();
  currentProfile = profile;
  const avatar = button.querySelector('.user-avatar');
  const name = button.querySelector('[data-active-user-name]');
  const role = button.querySelector('[data-active-user-role]');

  if (avatar) avatar.textContent = getInitials(profile?.name || '');
  if (name) name.textContent = profile?.name || '—';
  if (role) role.textContent = profile?.role || '—';
}

async function selectAndApplyActiveUser() {
  const user = await selectUserForSession();
  await refreshProfileButton(user);
  if (currentPhase === 'material-coupons') await renderOrRefreshMaterialCouponManager();
  return user;
}

async function initializeUserSession() {
  await migrateLegacyProfileToUsers();
  const activeUser = await getActiveUser();
  if (activeUser) {
    await refreshProfileButton(activeUser);
    return activeUser;
  }
  return selectAndApplyActiveUser();
}

async function handleManagedUserChange(user) {
  if (!user || user.id !== currentProfile?.id) return;
  if (user.deleted || user.active === false) {
    clearActiveUserId();
    closeModal();
    return selectAndApplyActiveUser();
  }
  await refreshProfileButton(user);
}

async function refreshActiveProjectSelector() {
  const button = el('active-project-selector');
  if (!button) return;
  const settings = await getAppSettings();
  activeProjectName = settings.activeProjectName || '';
  const label = button.querySelector('[data-active-project-label]');
  if (label) label.textContent = activeProjectName || t('View all projects');
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

  if (projectNameTarget) {
    const shortCode = activePlannerProject?.shortCode || '';
    projectNameTarget.textContent = activeProjectName
      ? [shortCode, activeProjectName].filter(Boolean).join(' — ')
      : 'Nenhum projeto selecionado';
  }
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

function setPlannerLegacyWorkpack(workpackText, message = '') {
  const container = el('planner-workpack-legacy-container');
  const input = el('workpack-name');
  const notice = el('planner-workpack-legacy');
  const value = textValue(workpackText).trim();
  if (input) input.value = value;
  if (notice) notice.textContent = value ? message : '';
  container?.classList.toggle('hidden', !value);
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

function populatePlannerWorkpackSelect({ resetSelection = false } = {}) {
  const select = el('planner-workpack-select');
  if (!select) return;
  const equipmentId = el('planner-equipment-select')?.value || '';
  const previous = resetSelection ? '' : select.value;
  const visible = plannerWorkpacks.filter((item) => !equipmentId || item.equipmentId === equipmentId);
  select.replaceChildren(new Option('Selecione um Workpack', ''), ...visible.map((item) => new Option(item.wpNo || item.title || item.id, item.id)));
  select.value = [...select.options].some((item) => item.value === previous) ? previous : '';
}

function hasExactPlannerMaterialCouponSelection() {
  const input = el('planner-material-coupon');
  const options = el('planner-material-coupon-options');
  if (!input || !options) return false;
  return [...options.querySelectorAll('option')].some((option) => option.value === input.value);
}

function syncCouponMaterialsImportButton() {
  const button = el('import-coupon-materials-btn');
  if (button) button.disabled = !hasExactPlannerMaterialCouponSelection();
}

async function refreshPlannerProjectContext({ clearLegacy = false, resetEquipment = false } = {}) {
  const activeName = await getActiveProjectName();
  activeProjectName = activeName || '';
  if (clearLegacy) {
    legacyPlannerProjectData = null;
    setPlannerLegacyWorkpack('');
  }
  activePlannerProject = activeProjectName ? await getProject(activeProjectName) : null;
  activeProjectId = activePlannerProject?.id || '';
  plannerEquipments = activeProjectId
    ? await listEquipments({ projectId: activeProjectId, status: 'ACTIVE' })
    : [];
  plannerWorkpacks = activeProjectId ? await listWorkpacks({ projectId: activeProjectId }) : [];
  const couponOptions = el('planner-material-coupon-options');
  if (couponOptions) {
    const coupons = await getAllMaterialCoupons();
    couponOptions.replaceChildren(...coupons.filter((coupon) => !activeProjectId || coupon.projectId === activeProjectId).map((coupon) => { const option = document.createElement('option'); option.value = coupon.number; return option; }));
  }
  syncCouponMaterialsImportButton();
  populatePlannerEquipmentSelect({ resetSelection: resetEquipment });
  populatePlannerWorkpackSelect({ resetSelection: resetEquipment });
  renderPlannerProjectContext();
  await refreshSuggestedNestingPlanName();
  refreshNestingPlanWorkspace();
}

async function refreshSuggestedNestingPlanName() {
  const shortCode = textValue(activePlannerProject?.shortCode).trim();
  if (!shortCode || !canAutoSuggestNestingPlanName()) return;
  const cuttingSheets = await getAllCuttingSheets();
  const name = nextCuttingSheetNumber(cuttingSheets, shortCode);
  setNestingPlanWorkspaceState({ name, status: 'DRAFT', nameSource: 'automatic' });
}

async function refreshVisibleActiveProjectScopedPage() {
  if (currentPhase === 'home') {
    await renderHome();
    return;
  }
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
    return;
  }
  if (currentPhase === 'reports') {
    await renderOrRefreshReportsPage();
  }
}

async function openActiveProjectSelector() {
  const projects = await getAllProjects();
  const viewAllProject = {
    id: '__view_all__',
    name: '— Ver todos os projetos —',
    client: '',
    code: '',
    shortCode: '',
    status: '',
    _isViewAll: true,
  };
  const projectOptions = [viewAllProject, ...projects];

  openEntityListModal({
    title: 'Selecionar Projeto Ativo',
    loadItems: async () => projectOptions,
    searchFields: ['name', 'project', 'client', 'code', 'shortCode', 'status'],
    renderCardMeta: (project) => {
      if (project._isViewAll) {
        return ['Visualizar todos os dados sem filtro de projeto'];
      }
      return [
        `Cliente: ${project.client || 'N/A'} - Codigo: ${project.code || 'N/A'} - Sigla: ${project.shortCode || 'N/A'} - Materiais: ${project.traceabilityCode || 'N/A'}`,
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

function showCutSheetsResultsPage() {
  if (!lastSolution) {
    showToast('Calcule um plano primeiro.', 'error');
    return false;
  }
  renderCurrentResults();
  updateResultsSubtitle();
  showPhase('cut-sheets');
  showCuttingSheetsPage(2);
  return true;
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

async function onExportExcel() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de exportar.', 'error');
    return;
  }

  try {
    await exportSolutionToExcel(lastSolution);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível exportar o plano para Excel.', 'error');
  }
}

async function onExportVisualPdf() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o relatorio.', 'error');
    return;
  }

  try {
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
  } catch (error) {
    console.error('Falha ao gerar o relatório visual.', error);
    showToast(error?.message || 'Não foi possível gerar o relatório visual.', 'error');
  }
}

async function onExportTabularPdf() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o relatorio.', 'error');
    return;
  }

  try {
    const appSettings = await getAppSettings();
    const opened = await openTabularPdfReport({
      solution: lastSolution,
      projectData: getProjectData(),
      settings: { ...getSettings(), reportHeader: appSettings.reportHeader },
      reportOptions: getReportViewOptions(),
    });
    if (!opened) showToast('O navegador bloqueou a janela de impressao/PDF.', 'error');
  } catch (error) {
    console.error('Falha ao gerar o relatório tabular.', error);
    showToast(error?.message || 'Não foi possível gerar o relatório tabular.', 'error');
  }
}

async function onExportCuttingSheetPdf() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar a ficha de corte.', 'error');
    return;
  }

  try {
    const appSettings = await getAppSettings();
    const opened = await openCuttingSheetPdfReport({
      solution: lastSolution,
      projectData: { ...getProjectData(), cuttingSheetNumber: getNestingPlanName() },
      settings: { ...getSettings(), reportHeader: appSettings.reportHeader },
      reportOptions: getReportViewOptions(),
    });
    if (!opened) showToast('O navegador bloqueou a janela de impressao/PDF.', 'error');
  } catch (error) {
    console.error('Falha ao gerar a ficha de corte.', error);
    showToast(error?.message || 'Não foi possível gerar a ficha de corte.', 'error');
  }
}

async function generateRmvFromCurrentCuttingSheet() {
  if (!lastSolution) {
    showToast('Otimize o Cutting Sheet antes de gerar o RMV.', 'warning');
    return;
  }
  let sheet = currentCuttingSheetId ? await getCuttingSheet(currentCuttingSheetId) : null;
  if (!sheet) sheet = (await persistCurrentPlan(getNestingPlanName(), getProjectData().workpackId)).sheet;
  const candidates = cuttingSheetRmvCandidates(sheet, await getAllOffcuts());
  if (!candidates.length) {
    showToast('Este Cutting Sheet não possui materiais de retorno elegíveis.', 'warning');
    return;
  }
  await openRmvForOffcuts(candidates, sheet, null, { navigateToReturnMaterial: true });
}

function onExportPieceLabels() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar as etiquetas.', 'error');
    return;
  }
  const labelCount = (lastSolution.stockUsed || []).reduce((total, bar) => total + (bar.pieces || []).length, 0);
  openPieceLabelTemplateModal({
    labelCount,
    onSelect: (templateId) => {
      try {
        const opened = openPhysicalPieceLabelsReport({
          solution: lastSolution,
          projectData: getProjectData(),
          options: { templateId },
        });
        if (!opened) showToast('Nenhuma peça alocada ou a janela de impressão foi bloqueada.', 'error');
      } catch (error) {
        console.error('Falha ao gerar as etiquetas físicas.', error);
        showToast(error?.message || 'Não foi possível gerar as etiquetas físicas.', 'error');
      }
    },
  });
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

  try {
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
  } catch (error) {
    console.error('Falha ao gerar o relatório resumido.', error);
    showToast(error?.message || 'Não foi possível gerar o relatório resumido.', 'error');
  }
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
  const number = getNestingPlanName();
  if (!number) {
    showToast('Informe o número do Cutting Sheet antes de otimizar.', 'error');
    return;
  }
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
  const stockForAllocate = stock.map((item) => ({
    ...item,
    length: Number(item.length ?? item.lengthMm) || 0,
    description: item.description ?? item.materialDescription ?? '',
  }));
  const solution = runAllocations({ parts: preparePiecesForNesting(parts), stock: stockForAllocate, ...getSettings() });
  if (!solution) return;

  lastSolution = solution;
  await persistCurrentPlan(number, getProjectData().workpackId);
  setNestingPlanWorkspaceState({ name: number, status: 'OPTIMIZED', savedAt: new Date().toISOString(), nameSource: 'manual' });
  showCutSheetsResultsPage();
  renderHome();
  showToast(`${number} otimizado e salvo como rascunho.`, 'success');
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
    ? { po: row['PO'], poItem: row['Item'], qty: row['Qty'], lengthMm: row['Stock Length (mm)'], materialGrade: row['Material'], heatNo: row['Heat Number'], materialDescription: row['Description'], traceability: row['Traceability'] }
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
      if (link.dataset.phase) showPhase(link.dataset.phase);
      sidebar.classList.remove('open');
    });
  });
}

async function resetCurrentPlan({ confirmFirst = false } = {}) {
  if (confirmFirst && !confirm('Limpar todos os dados do Cutting Sheet atual?')) return;
  activeProjectName = '';
  setProjectFormData();
  stockTable.tbody.innerHTML = '';
  partsTable.tbody.innerHTML = '';
  stockTable.addRow();
  partsTable.addRow();
  await applyDefaultPlannerSettings();
  showPlannerPhase();
  lastSolution = null;
  currentCuttingSheetId = '';
  setNestingPlanWorkspaceState({ name: '', status: 'DRAFT', savedAt: '', nameSource: 'automatic' });
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
      sharedSync: sharedSyncControls,
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
      workpackId: el('planner-workpack-select')?.value || '',
      workpack: operationalWorkpackValue(el('workpack-name')?.value || legacyPlannerProjectData.workpack),
    };
  }

  const equipmentSelect = el('planner-equipment-select');
  const selectedEquipment = findPlannerEquipmentByLabel(equipmentSelect?.value);
  return {
    project: activeProjectName || '',
    client: activePlannerProject?.client || '',
    equipment: selectedEquipment ? equipmentDisplayName(selectedEquipment) : '',
    workpackId: el('planner-workpack-select')?.value || '',
    workpack: operationalWorkpackValue(
      el('planner-workpack-select')?.value
        ? el('planner-workpack-select')?.selectedOptions?.[0]?.textContent
        : el('workpack-name')?.value,
    ),
  };
}

async function getMtoPageOptions() {
  const activeProject = await getProject(await getActiveProjectName());
  return {
    projectId: activeProject?.id || '',
    projectName: activeProject?.shortCode || activeProject?.name || '',
    importedBy: currentProfile?.name || '',
    initialFilters: pendingMtoFilters || undefined,
    onSendToCutSheets: sendMtoRowsToCutSheets,
    onCreateWorkpack: openQuickWorkpackFromMto,
    onMtoItemsUpdated: syncWorkpackMtoItems,
    currentUserName: currentProfile?.name || '',
    listPurchaseOrders: getAllPurchaseOrders,
    listPurchaseOrderItems: getAllPurchaseOrderItems,
    listOrganizations: getAllOrganizations,
    listMtoPoItemAllocations,
    listMtoProcurementCoverage,
    saveMtoPoItemAllocation,
    saveMtoPoItemAllocations,
    cancelMtoPoItemAllocation,
    mtoDemandQuantity,
    suggestMtoPoItemAllocationsByIdentCode,
    onExportMto: (items, options = {}) => exportMtoItemsExcel(items, {
      ...options,
      projectName: activeProject?.shortCode || activeProject?.name || '',
    }),
  };
}

async function openQuickWorkpackFromMto(selectedMtoItems = []) {
  const projectId = selectedMtoItems[0]?.projectId || activeProjectId || '';
  const [allMtoItems, inventoryItems, projects, equipments] = await Promise.all([
    getMtoItems({}),
    getInventoryItems(),
    getAllProjects(),
    listEquipments({}),
  ]);
  openWorkpackQuickCreateModal({
    selectedMtoItems,
    allMtoItems: [...new Map([...allMtoItems, ...selectedMtoItems].filter((item) => item?.id).map((item) => [item.id, item])).values()],
    inventoryItems,
    projects,
    equipments,
    defaultProjectId: projectId,
    showToast,
    onCreate: async (payload) => {
      let created = null;
      try {
        const { mtoItemIds = [], inventoryItemIds = [], ...workpackData } = payload;
        created = await createWorkpack(workpackData);
        await replaceWorkpackTargetLinks({ projectId: created.projectId, workpackId: created.id, targetType: WORKPACK_LINK_TARGETS.MTO_ITEM, targetIds: mtoItemIds, linkedBy: currentProfile?.name || '' });
        await replaceWorkpackTargetLinks({ projectId: created.projectId, workpackId: created.id, targetType: WORKPACK_LINK_TARGETS.INVENTORY_ITEM, targetIds: inventoryItemIds, linkedBy: currentProfile?.name || '' });
        await createWorkpackAuditEntry('WORKPACK_CREATED', created, {
          source: 'mtoQuickCreate',
          mtoItemCount: mtoItemIds.length,
          inventorySuggestionCount: inventoryItemIds.length,
        });
        showToast('Workpack criado com peças MTO e materiais sugeridos.', 'success');
        showPhase('workpacks');
        return created;
      } catch (error) {
        if (created?.id) {
          await replaceWorkpackTargetLinks({ projectId: created.projectId, workpackId: created.id, targetType: WORKPACK_LINK_TARGETS.MTO_ITEM, targetIds: [], linkedBy: currentProfile?.name || '' });
          await replaceWorkpackTargetLinks({ projectId: created.projectId, workpackId: created.id, targetType: WORKPACK_LINK_TARGETS.INVENTORY_ITEM, targetIds: [], linkedBy: currentProfile?.name || '' });
          await deleteWorkpack(created.id);
        }
        console.error(error);
        showToast(error?.message || 'Não foi possível criar o Workpack.', 'error');
        return null;
      }
    },
  });
}

async function exportInventoryDatabaseWithRelations() {
  const [
    projects, organizations, purchaseOrders, items, receipts, receiptLines, materialUnits, inventoryItems,
    stockMovements, materialCoupons, cuttingSheets, returnMaterialVouchers, workpacks, drawings, equipments, workpackLinks,
  ] = await Promise.all([
    getAllProjects(), getAllOrganizations(), getAllPurchaseOrders(), getAllPurchaseOrderItems(), getAllMaterialReceipts(),
    getAllMaterialReceiptLines(), getAllMaterialUnits(), getInventoryItems(), getAllStockMovements(), getAllMaterialCoupons(),
    getAllCuttingSheets(), getAllReturnMaterialVouchers(), listWorkpacks(), listDrawings(), listEquipments({}), listWorkpackLinks(),
  ]);
  return exportInventoryDatabaseExcel({
    projects, organizations, purchaseOrders, items, receipts, receiptLines, materialUnits, inventoryItems,
    stockMovements, materialCoupons, cuttingSheets, returnMaterialVouchers, workpacks, drawings, equipments, workpackLinks,
  });
}

function getInventoryPageOptions() {
  return {
    onGenerateMaterialCoupon: (items) => openMaterialCouponPage(items, 'inventory'),
    onExportInventory: exportInventoryDatabaseWithRelations,
  };
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
    if (options.initialFilters === pendingMtoFilters) pendingMtoFilters = null;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar a pagina MTO.', 'error');
  }
}

function openFilteredMto({ projectId = '', drawing = '', equipmentId = '' } = {}) {
  pendingMtoFilters = {
    projectId,
    drawing,
    equipmentId,
    search: '',
    material: '',
    discipline: '',
    status: '',
    includeSuperseded: false,
  };
  showPhase('mto');
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

async function syncMaterialCouponDocumentLinks(record, previousRecord = null) {
  const coupon = record?.metadata?.coupon || {};
  const previousCoupon = previousRecord?.metadata?.coupon || {};
  const workpackId = record?.workpackId || coupon.links?.workpackId || '';
  const directCuttingSheetId = coupon.links?.cuttingSheetId || '';
  const previousDirectCuttingSheetId = previousCoupon.links?.cuttingSheetId || '';
  const workpack = workpackId ? await getWorkpack(workpackId) : null;
  if (workpack) {
    await ensureWorkpackLink({ projectId: record.projectId, workpackId: workpack.id, targetType: WORKPACK_LINK_TARGETS.MATERIAL_COUPON, targetId: record.id, linkedBy: currentProfile?.name || '' });
  }
  const affectedSheetIds = new Set([
    directCuttingSheetId,
    previousDirectCuttingSheetId,
    ...(coupon.linkedCuttingSheetPieces || []).map((item) => item.cuttingSheetId),
    ...(previousCoupon.linkedCuttingSheetPieces || []).map((item) => item.cuttingSheetId),
  ].filter(Boolean));
  if (!affectedSheetIds.size) return;
  const cuttingSheets = (await getAllCuttingSheets()).filter((cuttingSheet) => affectedSheetIds.has(cuttingSheet.id));
  const linkOwner = { ...coupon, id: record.id, number: record.number };
  await Promise.all(cuttingSheets.map((cuttingSheet) => {
    const linked = syncCuttingSheetPieceCouponLinks(cuttingSheet, linkOwner);
    const directLink = cuttingSheet.id === directCuttingSheetId;
    const staleDirectLink = cuttingSheet.id === previousDirectCuttingSheetId && !directLink && cuttingSheet.materialCouponId === record.id;
    const metadata = { ...(cuttingSheet.metadata || {}) };
    if (staleDirectLink && metadata.materialCouponNumber === (previousRecord?.number || record.number || '')) delete metadata.materialCouponNumber;
    return updateCuttingSheet(cuttingSheet.id, {
      bars: linked.bars,
      ...(directLink ? {
        materialCouponId: record.id,
        metadata: { ...metadata, materialCouponNumber: record.number || '' },
      } : staleDirectLink ? { materialCouponId: '', metadata } : {}),
    });
  }));
}

async function saveMaterialCouponWithLinks(record) {
  const isNew = !record?.id;
  const previous = isNew ? null : await getMaterialCoupon(record.id);
  const saved = await saveMaterialCoupon(isNew ? {
    ...record,
    createdBy: currentProfile?.id || '',
    createdByName: currentProfile?.name || '',
    createdAt: record?.createdAt || new Date().toISOString(),
  } : record);
  await syncMaterialCouponDocumentLinks(saved, previous);
  return saved;
}

async function issueMaterialCoupon(record, reservations = []) {
  const previous = record?.id ? await getMaterialCoupon(record.id) : null;
  const issued = await commitMaterialCouponIssue(record, reservations, {
    userId: currentProfile?.id || '',
    userName: currentProfile?.name || '',
  });
  try {
    await syncMaterialCouponDocumentLinks(issued, previous);
  } catch (error) {
    console.error(error);
    showToast('Material Coupon emitido, mas não foi possível atualizar todos os vínculos de documentos.', 'warning');
  }
  return issued;
}

async function applyMaterialCouponWorkflowAction(nextRecord, action, reason = '') {
  const current = await getMaterialCoupon(nextRecord.id);
  if (!current) throw new Error('MATERIAL_COUPON_NOT_FOUND');
  const currentStatus = String(current.status || '').toUpperCase();
  const releasesInventory = action === MATERIAL_COUPON_ACTIONS.RELEASE
    || (action === MATERIAL_COUPON_ACTIONS.CANCEL && currentStatus === 'ISSUED');
  if (releasesInventory || action === MATERIAL_COUPON_ACTIONS.DISPATCH) {
    const saved = await commitMaterialCouponInventoryAction(nextRecord, action, reason, { userName: currentProfile?.name || '' });
    await syncMaterialCouponDocumentLinks(saved);
    return saved;
  }
  const saved = await saveMaterialCoupon(nextRecord);
  await createMaterialCouponAuditEntry(`MATERIAL_COUPON_${action}`, saved, { reason, previousStatus: current.status, nextStatus: saved.status });
  return saved;
}

async function deleteMaterialCouponWithAudit(id) {
  const current = await getMaterialCoupon(id);
  if (!current) return undefined;
  await createMaterialCouponAuditEntry('MATERIAL_COUPON_DELETED', current);
  return deleteMaterialCoupon(id);
}

async function deleteMaterialCouponsWithAudit(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const records = (await Promise.all(uniqueIds.map((id) => getMaterialCoupon(id)))).filter(Boolean);
  await Promise.all(records.map((record) => createMaterialCouponAuditEntry('MATERIAL_COUPON_DELETED', record)));
  await deleteMaterialCoupons(records.map((record) => record.id));
  return records.map((record) => record.id);
}

async function listMaterialCouponHistory(id) {
  const [events, movements] = await Promise.all([
    getAuditEvents({ entityType: 'MaterialCoupon', entityId: id }),
    getStockMovements({ sourceDocumentType: 'MaterialCoupon', sourceDocumentId: id }),
  ]);
  return { events, movements };
}

async function exportMaterialCouponControlDatabaseWithRelations(coupons, options = {}) {
  try {
    const [workpacks, drawings, cuttingSheets, returnMaterialVouchers, inventoryItems, auditEvents, workpackLinks] = await Promise.all([
      listWorkpacks(),
      listDrawings(),
      getAllCuttingSheets(),
      getAllReturnMaterialVouchers(),
      getInventoryItems(),
      getAllAuditEvents(),
      listWorkpackLinks(),
    ]);
    return exportMaterialCouponControlDatabase(coupons, {
      ...options,
      workpacks,
      drawings,
      cuttingSheets,
      returnMaterialVouchers,
      inventoryItems,
      auditEvents,
      workpackLinks,
    });
  } catch (error) {
    console.error(error);
    showToast('Não foi possível exportar o Control Database.', 'error');
    return null;
  }
}

async function renderOrRefreshMaterialCouponManager() {
  try {
    const appSettings = await getAppSettings();
    const couponProjectName = await getActiveProjectName();
    const couponProject = couponProjectName ? await getProject(couponProjectName) : null;
    const materialCouponReportOptions = {
      reportHeader: appSettings.reportHeader,
      reportColumnLayout: appSettings.materialCouponReportLayout,
    };
    await initMaterialCouponManager({
      listCoupons: getAllMaterialCoupons,
      getCoupon: getMaterialCoupon,
      saveCoupon: saveMaterialCouponWithLinks,
      updateCoupon: updateMaterialCoupon,
      issueCoupon: issueMaterialCoupon,
      applyCouponAction: applyMaterialCouponWorkflowAction,
      deleteCoupon: deleteMaterialCouponWithAudit,
      deleteCoupons: deleteMaterialCouponsWithAudit,
      listCouponHistory: listMaterialCouponHistory,
      currentUserName: currentProfile?.name || '',
      initialData: {
        project: couponProject?.name || couponProjectName || '',
        client: couponProject?.client || '',
        projectShortCode: couponProject?.shortCode || '',
      },
      materialCouponFormSettings: appSettings.materialCouponForm,
      listInventoryItems: getInventoryItems,
      openInventorySelector: openInventoryModal,
      listProjects: getAllProjects,
      listEquipments,
      listWorkpacks,
      getWorkpack,
      listDrawings,
      listMtoItems: getMtoItems,
      listMtoPoItemAllocations,
      listCuttingSheets: getAllCuttingSheets,
      listReturnMaterialVouchers: getAllReturnMaterialVouchers,
      listAuditEvents: getAllAuditEvents,
      listWorkpackLinks,
      readExcelFile,
      buildMaterialCouponDocument,
      buildMaterialCouponExtractRows,
      exportMaterialCouponExtract,
      exportMaterialCouponControlDatabase: exportMaterialCouponControlDatabaseWithRelations,
      exportMaterialCouponExcel,
      materialCouponReportOptions,
      saveGlobalReportColumnLayout: (layout) => saveAppSettings({ materialCouponReportLayout: layout }),
      printMaterialCouponReport: async (coupon) => {
        const latestSettings = await getAppSettings();
        return openMaterialCouponReport(coupon, {
          reportHeader: latestSettings.reportHeader || materialCouponReportOptions.reportHeader,
          reportColumnLayout: latestSettings.materialCouponReportLayout || materialCouponReportOptions.reportColumnLayout,
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
    await seedEquipmentTypes();
    const defaultProjectId = (await getProject(await getActiveProjectName()))?.id || '';
    await initEquipmentPage({
      listEquipments,
      createEquipment,
      updateEquipment,
      deleteEquipment,
      getEquipment,
      listDrawings,
      listMtoItems: getMtoItems,
      listWorkpacks,
      listMaterialCoupons: getAllMaterialCoupons,
      listCuttingSheets: getAllCuttingSheets,
      listEquipmentTypes,
      listProjects: getAllProjects,
      defaultProjectId,
      currentUserName: currentProfile?.name || '',
      openMto: openFilteredMto,
      onAddDrawing: openDrawingFromEquipment,
      onNavigateContext: (phase, context = {}) => {
        if (phase === 'mto') { void openFilteredMto({ projectId: defaultProjectId, equipmentId: context.equipmentId }); return; }
        if (phase === 'reports') reportsRequestedEquipmentTag = context.tag || '';
        showPhase(phase);
      },
      showToast,
    });
    equipmentPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar Equipamentos.', 'error');
  }
}

async function openDrawingFromEquipment({ projectId = '', equipmentId = '' } = {}) {
  showPhase('drawings');
  await renderOrRefreshDrawingPage();
  openNewDrawingForEquipment({ projectId, equipmentId });
}

async function createWorkpackAuditEntry(eventType, workpack, metadata = {}) {
  const result = await persistWorkpackAudit(createAuditEvent, {
      eventType,
      entityType: 'WORKPACK',
      entityId: workpack?.id || '',
      projectId: workpack?.projectId || '',
      userName: currentProfile?.name || '',
      sourceDocumentType: 'Workpack',
      sourceDocumentId: workpack?.id || '',
      metadata: { source: 'workpackWorkspace', ...metadata },
    }, (error) => {
      console.warn('Falha ao registrar auditoria do Workpack.', error);
    });
  if (!result.ok) {
    showToast('Workpack atualizado, mas não foi possível registrar a auditoria.', 'warning');
    return null;
  }
  return result.event;
}

async function printLinkedMaterialCouponPdf(coupon) {
  const settings = await getAppSettings();
  return openMaterialCouponReport(coupon, {
    reportHeader: settings.reportHeader,
    reportColumnLayout: settings.materialCouponReportLayout,
  });
}

async function printLinkedCuttingSheetPdf(sheet) {
  const storedSolution = sheet.metadata?.solution || {};
  const solution = {
    ...structuredClone(storedSolution),
    stockUsed: structuredClone(sheet.bars || []),
    totalStockLength: Number(storedSolution.totalStockLength ?? sheet.summary?.totalStockLength) || 0,
    totalRemaining: Number(storedSolution.totalRemaining ?? sheet.summary?.totalRemaining) || 0,
    totalTrims: Number(storedSolution.totalTrims ?? sheet.summary?.totalTrims) || 0,
    allParts: Array.isArray(storedSolution.allParts) ? structuredClone(storedSolution.allParts) : (sheet.bars || []).flatMap((bar) => bar.pieces || []),
    unplacedParts: Array.isArray(storedSolution.unplacedParts) ? structuredClone(storedSolution.unplacedParts) : [],
  };
  return openCuttingSheetPdfReport({
    solution,
    projectData: {
      project: sheet.metadata?.project || sheet.projectId,
      client: sheet.metadata?.client || '',
      equipment: sheet.metadata?.equipment || '',
      workpack: sheet.metadata?.workpack || sheet.workpackId,
      reportDate: sheet.releasedAt || sheet.createdAt,
      cuttingSheetNumber: sheet.number,
      materialCouponNumber: sheet.metadata?.materialCouponNumber || '',
    },
    settings: {
      ...(await getAppSettings()),
      kerf: storedSolution.kerf || 0,
      minOffcut: storedSolution.minOffcut || 0,
    },
    reportOptions: getReportViewOptions(),
  });
}

async function printLinkedSavedPlanPdf(plan) {
  if (!plan?.solution) return false;
  return openCuttingSheetPdfReport({
    solution: structuredClone(plan.solution),
    projectData: structuredClone(plan.projectData || {}),
    settings: { ...(await getAppSettings()), ...(plan.settings || {}) },
    reportOptions: getReportViewOptions(),
  });
}

async function renderOrRefreshWorkpackPage() {
  try {
    const defaultProjectId = (await getProject(await getActiveProjectName()))?.id || '';
    await initWorkpackPage({
      listWorkpacks,
      createWorkpack,
      updateWorkpack,
      deleteWorkpack,
      getWorkpack,
      listProjects: getAllProjects,
      listEquipments,
      listDrawings,
      listMtoItems: getMtoItems,
      listInventoryItems: getInventoryItems,
      listMaterialCoupons: getAllMaterialCoupons,
      listCuttingSheets: getAllCuttingSheets,
      listReturnMaterialVouchers: getAllReturnMaterialVouchers,
      listMaterialTransformations,
      listWorkpackLinks,
      migrateLegacyWorkpackLinks,
      replaceWorkpackTargetLinks,
      listPlans: async () => [],
      listOffcuts: getAllOffcuts,
      listAuditEvents: getAllAuditEvents,
      listTaskSheets,
      saveTaskSheet,
      exportTaskSheet: exportTaskSheetExcel,
      printMaterialCouponPdf: printLinkedMaterialCouponPdf,
      printCuttingSheetPdf: printLinkedCuttingSheetPdf,
      printSavedPlanPdf: printLinkedSavedPlanPdf,
      openInventorySelector: openInventoryModal,
      onOpenPlanner: () => showPlannerPhase(),
      onStageToPlanner: stageWorkpackToPlanner,
      onOpenMaterialCoupons: () => showPhase('material-coupons'),
      onLoadPlan: loadSavedPlan,
      onOpenCuttingSheet: openCuttingSheetResults,
      auditWorkpack: createWorkpackAuditEntry,
      getNestingSettings: getAppSettings,
      currentUserName: currentProfile?.name || '',
      defaultProjectId,
      showToast,
    });
    workpackPageInitialized = true;
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar Workpacks.', 'error');
  }
}

function currentMaterialRemainders() {
  return buildFinalMaterialRemainders(lastSolution || {});
}

function rmvWorkflowDependencies() {
  return {
    listRmvs: getAllReturnMaterialVouchers,
    saveRmv: saveReturnMaterialVoucher,
    listInventory: getInventoryItems,
    commitIssue: commitRmvIssue,
    commitReceipt: commitRmvReceipt,
    commitCancel: commitRmvCancellation,
  };
}

function printRmvWithFeedback(rmv, reportOptions = {}) {
  try {
    const opened = openReturnMaterialVoucherReport(rmv, reportOptions);
    if (!opened) showToast('O navegador bloqueou a janela de impressão/PDF do RMV.', 'error');
    return opened;
  } catch (error) {
    console.error('Falha ao gerar o relatório RMV.', error);
    showToast(error?.message || 'Não foi possível gerar o relatório RMV.', 'error');
    return false;
  }
}

async function openRmvForOffcuts(offcuts, requestedCuttingSheet = null, requestedRmv = null, rmvContext = {}) {
  const selected = Array.isArray(offcuts) ? offcuts : [];
  if (!selected.length) return;
  const cuttingSheetIds = [...new Set(selected.map((item) => item.cuttingSheetId).filter(Boolean))];
  if (cuttingSheetIds.length > 1) throw new Error('Selecione retalhos da mesma Cutting Sheet para criar um RMV.');
  const sheetId = selected.map((item) => item.cuttingSheetId).find(Boolean);
  const sheets = await getAllCuttingSheets();
  const cuttingSheet = requestedCuttingSheet || (sheetId ? await getCuttingSheet(sheetId) : null)
    || sheets.filter((sheet) => sheet.status === 'cut' && (!activeProjectId || sheet.projectId === activeProjectId)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!cuttingSheet) {
    showToast('Nenhuma Cutting Sheet foi encontrada para gerar o RMV.', 'warning');
    return;
  }
  const [project, coupon, appSettings, workpack] = await Promise.all([
    getProject(cuttingSheet.projectId),
    cuttingSheet.materialCouponId ? getMaterialCoupon(cuttingSheet.materialCouponId) : null,
    getAppSettings(),
    cuttingSheet.workpackId ? getWorkpack(cuttingSheet.workpackId) : null,
  ]);
  const couponPayload = coupon?.metadata?.coupon || {};
  const reportOptionsSnapshot = structuredClone({
    reportHeader: appSettings.reportHeader,
    returnMaterialVoucherForm: appSettings.returnMaterialVoucherForm,
  });
  const draft = requestedRmv || await createOrReuseRmvDraft({
      cuttingSheet,
      offcuts: selected,
      context: {
        projectId: cuttingSheet.projectId,
        workpackId: cuttingSheet.workpackId,
        projectShortCode: project?.shortCode || cuttingSheet.metadata?.projectShortCode || cuttingSheet.projectId,
         origin: rmvContext.origin || couponPayload.header?.destination || coupon?.metadata?.materialDestination || appSettings.returnMaterialVoucherForm.origin || '',
         destination: rmvContext.destination || appSettings.returnMaterialVoucherForm.destination || '',
         reuseExisting: rmvContext.reuseExisting,
        materialCouponNumber: coupon?.number || cuttingSheet.metadata?.materialCouponNumber || '',
        workpackNumber: workpack?.wpNo || workpack?.title || cuttingSheet.metadata?.workpack || '',
        drawingReference: cuttingSheet.metadata?.drawingReference || '',
        reference: rmvContext.reference || '',
        notes: rmvContext.notes || '',
        configuredReference: appSettings.returnMaterialVoucherForm.reference || '',
        configuredNotes: appSettings.returnMaterialVoucherForm.notes || '',
        userName: currentProfile?.name || '',
        reportOptions: reportOptionsSnapshot,
      },
      dependencies: rmvWorkflowDependencies(),
    });
  const decorate = (rmv) => ({
    ...rmv,
    metadata: {
      ...(rmv.metadata || {}),
      project: project?.name || cuttingSheet.projectId,
      client: project?.client || '',
      scope: cuttingSheet.metadata?.scope || '',
      workpack: workpack?.wpNo || workpack?.title || cuttingSheet.metadata?.workpack || '',
      workpackNumber: workpack?.wpNo || workpack?.title || rmv.metadata?.workpackNumber || '',
      cuttingSheetNumber: cuttingSheet.number,
      materialCouponNumber: coupon?.number || rmv.metadata?.materialCouponNumber || '',
      origin: rmv.origin, destination: rmv.destination, drawingReference: rmv.drawingReference,
      reference: rmv.reference, notes: rmv.notes,
      preparedBy: rmv.issuedBy || currentProfile?.name || '',
    },
  });
  const modalDeps = {
    showToast,
    saveRmv: async (rmv) => decorate(await saveReturnMaterialVoucher(rmv)),
    issueRmv: async (rmv, ids) => {
      const saved = await issueRmv(rmv, ids, { userName: currentProfile?.name || '', reportOptions: reportOptionsSnapshot }, rmvWorkflowDependencies());
      await updateCuttingSheet(saved.cuttingSheetId, { metadata: { ...(cuttingSheet.metadata || {}), returnMaterialVoucherId: saved.id, returnMaterialVoucherNumber: saved.number } });
      if (saved.materialCouponId) {
        const linkedCoupon = await getMaterialCoupon(saved.materialCouponId);
        if (linkedCoupon) {
          const payload = linkedCoupon.metadata?.coupon;
          await saveMaterialCoupon({
            ...linkedCoupon,
            metadata: payload ? { ...linkedCoupon.metadata, coupon: { ...payload, links: { ...(payload.links || {}), rmvId: saved.id } } } : { ...(linkedCoupon.metadata || {}), returnMaterialVoucherId: saved.id },
          });
        }
      }
      if (saved.workpackId) {
        await ensureWorkpackLink({ projectId: saved.projectId, workpackId: saved.workpackId, targetType: WORKPACK_LINK_TARGETS.RETURN_MATERIAL_VOUCHER, targetId: saved.id, linkedBy: currentProfile?.name || '' });
      }
      showToast(`${saved.number} emitido e aguardando recebimento.`, 'success');
      return decorate(saved);
    },
    receiveLines: async (rmv, ids) => {
      if (!ids.length) throw new Error('Selecione ao menos uma linha pendente.');
      const saved = await receiveRmvLines(rmv, ids, { userName: currentProfile?.name || '' }, rmvWorkflowDependencies());
      if (inventoryPageRendered) await refreshInventoryPage(el('inventory-phase'), getInventoryPageOptions());
      showToast('Recebimento do RMV registrado.', 'success');
      return decorate(saved);
    },
    cancelRmv: async (rmv) => decorate(await cancelRmv(rmv, { userName: currentProfile?.name || '' }, rmvWorkflowDependencies())),
    exportExcel: exportReturnMaterialVoucherExcel,
    printReport: (rmv) => printRmvWithFeedback(rmv, rmv.metadata?.reportOptions || reportOptionsSnapshot),
  };
  if (rmvContext.navigateToReturnMaterial) {
    showPhase('return-material');
    await renderOrRefreshReturnMaterialPage();
  }
  openReturnMaterialVoucherModal(decorate(draft), modalDeps);
}

async function renderOrRefreshReturnMaterialPage() {
  const container = el('return-material-workspace');
  if (!container) return;
  try {
    const settings = await getAppSettings();
    const currentReportOptions = {
      reportHeader: settings.reportHeader,
      returnMaterialVoucherForm: settings.returnMaterialVoucherForm,
    };
    await initReturnMaterialPage(container, {
      listOffcuts: getAllOffcuts,
      listReturnMaterialVouchers: getReturnMaterialVouchers,
      listProjects: getAllProjects,
      showToast,
      onPrint: (rmv) => printRmvWithFeedback(rmv, rmv.metadata?.reportOptions || currentReportOptions),
      onCreateRmv: (offcuts, context) => openRmvForOffcuts(offcuts, null, null, { ...context, originLocked: true, reuseExisting: false }),
      onProcess: async (mode, offcuts) => {
        const source = offcuts[0] || {};
        const result = await processOffcutDisposition({
          offcuts,
          mode,
          context: {
            projectId: source.projectId || activeProjectId,
            workpackId: source.workpackId || '',
            cuttingSheetId: source.cuttingSheetId || '',
            sourceDocumentType: 'OFFCUT',
            sourceDocumentId: source.id || source.cuttingSheetId || '',
            userName: currentProfile?.name || '',
          },
          dependencies: {
            getInventoryItem,
            createInventoryItem,
            saveOffcut,
            listOffcuts: getAllOffcuts,
            createStockMovement,
            createAuditEvent,
          },
        });
        if (inventoryPageRendered) await refreshInventoryPage(el('inventory-phase'), getInventoryPageOptions());
        const action = mode === 'OPERATIONAL_STOCK' ? 'retornado(s) ao Inventory' : 'marcado(s) como scrap';
        showToast(`${result.processed.length} retalho(s) ${action}.${result.skipped.length ? ` ${result.skipped.length} já processado(s) ignorado(s).` : ''}`, 'success');
        return result;
      },
    });
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível carregar os retalhos.', 'error');
  }
}

async function renderOrRefreshAuditPage() {
  const container = el('audit-workspace');
  if (!container) return;
  try {
    await initAuditPage(container, {
      listAuditEvents: getAllAuditEvents,
      listStockMovements: getAllStockMovements,
      showToast,
    });
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar o histórico de auditoria.', 'error');
  }
}

async function renderOrRefreshDataQualityPage() {
  const container = el('data-quality-workspace');
  if (!container) return;
  try {
    await initDataQualityPage(container, {
      loadIssues: async () => inspectAllDataReferences(await getAllProjects()),
      migrateAliases: async () => migrateChildProjectIds(await getAllProjects()),
      showToast,
    });
  } catch (error) {
    console.error(error);
    showToast('Não foi possível analisar a qualidade das referências de dados.', 'error');
  }
}

async function renderOrRefreshProcurementPage() {
  const container = el('procurement-workspace');
  if (!container) return;
  try {
    await initProcurementPage(container, {
      showToast,
      readPurchaseOrderFile,
      parsePurchaseOrderText: parseDelimitedPurchaseOrderText,
      exportPurchaseOrderDatabase: exportPurchaseOrderDatabaseExcel,
      exportPurchaseOrderProgress: exportPurchaseOrderProgressExcel,
      commitPurchaseOrderImport: (rows, metadata = {}) => commitPurchaseOrderImport(rows, {
        ...metadata, userName: currentProfile?.name || '',
      }),
      loadData: async () => {
        const projects = await getAllProjects();
        const activeProject = await getProject(await getActiveProjectName());
        const [organizations, purchaseOrders, revisions, items, receipts, receiptLines, materialUnits, inventoryItems, reservations, stockMovements, allocations, deliveryForecasts, mtoItems] = await Promise.all([
          getAllOrganizations(), getAllPurchaseOrders(), getAllPurchaseOrderRevisions(), getAllPurchaseOrderItems(), getAllMaterialReceipts(),
          getAllMaterialReceiptLines(), getAllMaterialUnits(), getInventoryItems(), listMaterialReservations(), getAllStockMovements(), listMtoPoItemAllocations(), listPoDeliveryForecasts(), getMtoItems({ includeSuperseded: false }),
        ]);
        return { projects, organizations, purchaseOrders, revisions, items, receipts, receiptLines, materialUnits, inventoryItems, reservations, stockMovements, allocations, deliveryForecasts, mtoItems, defaultProjectId: activeProject?.id || '' };
      },
      currentUserName: currentProfile?.name || '',
      savePoDeliveryForecast,
      cancelPoDeliveryForecast,
      saveMtoPoItemAllocations,
      suggestMtoPoItemAllocationsByIdentCode,
      saveOrganization: async (input) => {
        const before = input.id ? await getOrganization(input.id) : null;
        const saved = await saveOrganization(input);
        await createAuditEvent({ eventType: before ? 'ORGANIZATION_UPDATED' : 'ORGANIZATION_CREATED', entityType: 'ORGANIZATION', entityId: saved.id, userName: currentProfile?.name || '', reason: before ? 'Vendor profile updated in Procurement workspace.' : 'Vendor created in Procurement workspace.', before, after: saved });
        return saved;
      },
      createPurchaseOrder: async (input) => {
        const saved = await createPurchaseOrder(input);
        await createAuditEvent({ eventType: 'PURCHASE_ORDER_CREATED', entityType: 'PURCHASE_ORDER', entityId: saved.id, projectId: saved.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentId: saved.poNumber, reason: 'Purchase Order created.', after: saved });
        return saved;
      },
      savePurchaseOrder: async (input) => {
        const before = await getPurchaseOrder(input.id);
        const saved = await savePurchaseOrder(input);
        await createAuditEvent({ eventType: 'PURCHASE_ORDER_UPDATED', entityType: 'PURCHASE_ORDER', entityId: saved.id, projectId: saved.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentId: saved.poNumber, reason: 'Purchase Order details updated.', before, after: saved });
        return saved;
      },
      deletePurchaseOrder: async (id) => {
        const deleted = await deletePurchaseOrder(id);
        if (!deleted) return null;
        await createAuditEvent({ eventType: 'PURCHASE_ORDER_DELETED', entityType: 'PURCHASE_ORDER', entityId: deleted.purchaseOrder.id, projectId: deleted.purchaseOrder.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentId: deleted.purchaseOrder.poNumber, reason: 'Unused Purchase Order and its unreferenced items deleted.', before: deleted, after: null });
        return deleted;
      },
      createPurchaseOrderRevision: async (purchaseOrderId, input) => {
        const saved = await createPurchaseOrderRevision(purchaseOrderId, input);
        const po = await getPurchaseOrder(purchaseOrderId);
        await createAuditEvent({ eventType: 'PURCHASE_ORDER_REVISION_CREATED', entityType: 'PURCHASE_ORDER_REVISION', entityId: saved.id, projectId: po?.projectId || '', userName: currentProfile?.name || '', sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentId: po?.poNumber || purchaseOrderId, reason: 'Purchase Order revision created without overwriting prior revisions.', after: saved });
        return saved;
      },
      savePurchaseOrderItem: async (input) => {
        const before = input.id ? await getPurchaseOrderItem(input.id) : null;
        const saved = await savePurchaseOrderItem(input);
        await createAuditEvent({ eventType: before ? 'PURCHASE_ORDER_ITEM_UPDATED' : 'PURCHASE_ORDER_ITEM_CREATED', entityType: 'PURCHASE_ORDER_ITEM', entityId: saved.id, projectId: saved.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentId: saved.purchaseOrderId, reason: before ? 'Purchase Order item updated.' : 'Purchase Order item created.', before, after: saved });
        return saved;
      },
      deletePurchaseOrderItem: async (id) => {
        const deleted = await deletePurchaseOrderItem(id);
        if (!deleted) return null;
        await createAuditEvent({ eventType: 'PURCHASE_ORDER_ITEM_DELETED', entityType: 'PURCHASE_ORDER_ITEM', entityId: deleted.item.id, projectId: deleted.item.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'PURCHASE_ORDER', sourceDocumentId: deleted.purchaseOrder.poNumber || deleted.item.purchaseOrderId, reason: 'Unused Purchase Order item deleted.', before: deleted.item, after: null });
        return deleted;
      },
      createMaterialReceipt: async (input) => {
        const result = await createMaterialReceiptWithLine(input);
        await createAuditEvent({ eventType: 'MATERIAL_RECEIPT_CREATED', entityType: 'MATERIAL_RECEIPT', entityId: result.receipt.id, projectId: result.receipt.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'MATERIAL_RECEIPT', sourceDocumentId: result.receipt.receiptNumber, reason: 'Physical material receipt registered for immediate Inventory integration.', after: result.receipt, metadata: { receiptLineId: result.line.id, materialUnitIds: result.units.map((unit) => unit.id) } });
        const posting = await commitMaterialUnitsToInventory(result.units.map((unit) => unit.id), { userName: currentProfile?.name || '' });
        if (inventoryPageRendered) await renderOrRefreshInventoryPage();
        return { ...result, posting };
      },
      updateReceivedMaterialUnit: async (id, patches) => {
        const saved = await updateReceivedMaterialUnit(id, patches, { userName: currentProfile?.name || '' });
        if (inventoryPageRendered) await renderOrRefreshInventoryPage();
        return saved;
      },
      postMaterialUnits: async (unitIds) => {
        const result = await commitMaterialUnitsToInventory(unitIds, { userName: currentProfile?.name || '' });
        if (inventoryPageRendered) await renderOrRefreshInventoryPage();
        return result;
      },
    });
  } catch (error) {
    console.error(error);
    showToast('Não foi possível carregar Procurement & Receiving.', 'error');
  }
}

async function linkCuttingSheetMaterialCoupon(cuttingSheet, value) {
  const typed = textValue(value).trim();
  const coupons = await getAllMaterialCoupons();
  const coupon = coupons.find((item) => item.id === typed || item.number.toLowerCase() === typed.toLowerCase());
  if (coupon && cuttingSheet.projectId && coupon.projectId && cuttingSheet.projectId !== coupon.projectId) {
    throw new Error('O Material Coupon pertence a outro projeto.');
  }
  const saved = await updateCuttingSheet(cuttingSheet.id, {
    materialCouponId: coupon?.id || '',
    metadata: { ...(cuttingSheet.metadata || {}), materialCouponNumber: coupon?.number || typed },
  });
  if (coupon) await syncCuttingSheetDocumentLinks(saved, coupon);
  showToast(coupon ? `Cutting Sheet vinculado ao ${coupon.number}.` : 'Número do Material Coupon salvo como referência manual.', 'success');
  return saved;
}

async function syncCuttingSheetDocumentLinks(cuttingSheet, materialCoupon) {
  if (!cuttingSheet?.id || !materialCoupon?.id) return;
  const payload = materialCoupon.metadata?.coupon;
  const linkedIds = [...new Set([
    ...(Array.isArray(payload?.links?.cuttingSheetIds) ? payload.links.cuttingSheetIds : []),
    cuttingSheet.id,
  ])];
  await saveMaterialCoupon({
    ...materialCoupon,
    metadata: payload ? {
      ...materialCoupon.metadata,
      coupon: {
        ...payload,
        links: {
          ...(payload.links || {}),
          cuttingSheetId: cuttingSheet.id,
          cuttingSheetIds: linkedIds,
        },
      },
    } : {
      ...(materialCoupon.metadata || {}),
      cuttingSheetId: cuttingSheet.id,
      cuttingSheetIds: linkedIds,
    },
  });
  const workpackId = cuttingSheet.workpackId || materialCoupon.workpackId;
  if (!workpackId) return;
  await ensureWorkpackLink({
    projectId: cuttingSheet.projectId,
    workpackId,
    targetType: WORKPACK_LINK_TARGETS.CUTTING_SHEET,
    targetId: cuttingSheet.id,
    linkedBy: currentProfile?.name || '',
  });
  await ensureWorkpackLink({
    projectId: cuttingSheet.projectId,
    workpackId,
    targetType: WORKPACK_LINK_TARGETS.MATERIAL_COUPON,
    targetId: materialCoupon.id,
    linkedBy: currentProfile?.name || '',
  });
}

async function issueCurrentCuttingSheet() {
  if (!lastSolution) { showToast('Otimize um plano antes de emitir o Cutting Sheet.', 'error'); return null; }
  const projectData = getProjectData();
  const project = await getProject(projectData.project || activeProjectName);
  const projectId = project?.id || activeProjectId;
  const workpackId = projectData.workpackId || el('planner-workpack-select')?.value || '';
  const coupons = await getAllMaterialCoupons();
  const materialCoupon = coupons.find((item) => item.number.toLowerCase() === textValue(projectData.materialCoupon).toLowerCase());
  const [inventoryItems, reservations] = await Promise.all([
    getInventoryItems(),
    materialCoupon?.id ? listMaterialReservations({ materialCouponId: materialCoupon.id }) : [],
  ]);
  const prepared = prepareCuttingSheetIssue({
    solution: lastSolution,
    projectId,
    workpackId,
    coupon: materialCoupon,
    inventoryItems,
    reservations,
  });
  if (!prepared.valid) {
    showToast(cuttingSheetIssueErrorMessage(prepared.errors[0]), 'error');
    return null;
  }
  const records = await getAllCuttingSheets();
  const projectShortCode = project?.shortCode || projectData.projectShortCode || projectData.project || activeProjectName;
  const planName = getNestingPlanName();
  const existing = (currentCuttingSheetId ? records.find((record) => record.id === currentCuttingSheetId) : null)
    || records.find((record) => record.status === 'draft' && textValue(record.number).toLowerCase() === planName.toLowerCase());
  if (existing && existing.status !== 'draft') {
    showToast('Este Cutting Sheet já foi emitido.', 'warning');
    return existing;
  }
  const number = planName || nextCuttingSheetNumber(records, projectShortCode);
  let sheet = await saveCuttingSheet({
    ...(existing || {}),
    projectId,
    number,
    status: 'released',
    workpackId,
    materialCouponId: materialCoupon?.id || '',
    planning: buildPlanSnapshot(),
    releasedAt: new Date().toISOString(), releasedBy: currentProfile?.name || '',
    bars: prepared.bars,
    summary: summarizeSolution(lastSolution) || {},
    metadata: {
      projectShortCode: project?.shortCode || '', project: projectData.project || activeProjectName,
      client: projectData.client || project?.client || '', equipment: projectData.equipment || '',
      workpack: projectData.workpack || '', date: projectData.reportDate || new Date().toISOString().slice(0, 10),
      materialCouponNumber: materialCoupon?.number || projectData.materialCoupon || '',
      materialCouponStatusAtRelease: materialCoupon?.status || '',
      sourceInventoryItemIds: [...new Set(prepared.bars.map((bar) => bar.inventoryItemId).filter(Boolean))],
      excludedUnplacedPartCount: prepared.warnings.find((warning) => warning.code === 'UNPLACED_PARTS_EXCLUDED')?.count || 0,
      solution: structuredClone(lastSolution),
    },
  });
  currentCuttingSheetId = sheet.id;
  const issuedOffcuts = [];
  for (const source of currentMaterialRemainders()) {
    const offcut = await saveOffcut({
      projectId: sheet.projectId, workpackId, cuttingSheetId: sheet.id,
      parentInventoryItemId: source.parentInventoryItemId, material: source.materialGrade,
      heat: source.heatNo, traceability: source.traceability, length: source.length || source.lengthMm,
      qty: source.qty || 1, status: 'draft', createdBy: currentProfile?.name || '',
      metadata: {
        ...(source.metadata || {}),
        sourceCandidateKey: source.sourceCandidateKey,
        cuttingSheetNumber: number,
        classification: classifyOffcutLength(source.length || source.lengthMm),
        plannedDisposition: classifyOffcutLength(source.length || source.lengthMm) === OFFCUT_CLASSIFICATION.REUSABLE ? 'REUSE' : 'SCRAP',
      },
    });
    issuedOffcuts.push({ source, offcut });
  }
  if (issuedOffcuts.length) {
    const bars = sheet.bars.map((bar) => {
      const match = issuedOffcuts.find(({ source }) => {
        const parentTrace = source.parentTrace || source.parentTraceability || source.metadata?.parentTrace;
        return parentTrace && [bar.inventoryItemId, bar.trace, bar.traceability].includes(parentTrace);
      });
      return match ? { ...bar, offcutId: match.offcut.id } : bar;
    });
    sheet = await updateCuttingSheet(sheet.id, {
      bars,
      metadata: { ...(sheet.metadata || {}), offcutIds: issuedOffcuts.map(({ offcut }) => offcut.id) },
    });
  }
  await syncCuttingSheetDocumentLinks(sheet, materialCoupon);
  await createAuditEvent({
    eventType: 'GENERATE_CUTTING_SHEET', entityType: 'CUTTING_SHEET', entityId: sheet.id,
    projectId: sheet.projectId, userName: currentProfile?.name || '', sourceDocumentType: 'NESTING_RESULT',
    sourceDocumentId: projectData.workpack || sheet.id, reason: 'Cutting Sheet issued from nesting result.', after: sheet,
  });
  showToast(`${sheet.number} emitido.`, 'success');
  showPhase('cut-sheets');
  return sheet;
}

async function openCuttingSheetResults(sheet) {
  const solution = sheet.planning?.solution || sheet.metadata?.solution || (sheet.bars?.length ? {
    stockUsed: sheet.bars,
    generatedOffcuts: [],
    unplacedParts: [],
    totalStockLength: sheet.summary?.totalStockLength || 0,
    totalRemaining: sheet.summary?.totalRemaining || 0,
    totalTrims: sheet.summary?.totalTrims || 0,
  } : null);
  if (!solution) {
    showToast('Este Cutting Sheet não possui snapshot reabrível.', 'warning');
    return false;
  }
  if (sheet.planning && typeof sheet.planning === 'object') applyPlanSnapshot(sheet);
  if (el('planner-material-coupon')) el('planner-material-coupon').value = sheet.metadata?.materialCouponNumber || '';
  currentCuttingSheetId = sheet.id;
  lastSolution = {
    ...structuredClone(solution),
    stockUsed: structuredClone(sheet.bars?.length ? sheet.bars : solution.stockUsed || []),
  };
  setNestingPlanWorkspaceState({ name: sheet.number, status: sheet.status === 'draft' ? 'SAVED' : String(sheet.status || '').toUpperCase(), savedAt: sheet.updatedAt || '', nameSource: 'manual' });
  return renderStoredSolution();
}

async function renderOrRefreshCuttingSheetsPage() {
  const container = el('cut-sheets-workspace');
  if (!container) return;
  await initCuttingSheetsPage(container, {
    showToast,
    listCuttingSheets: getAllCuttingSheets, listCoupons: getAllMaterialCoupons, listRmvs: getAllReturnMaterialVouchers, listProjects: getAllProjects, listWorkpacks, listInventoryItems: getInventoryItems, listMtoItems: getMtoItems, listEquipments, listOffcuts: getAllOffcuts,
    resultsPage: el('cut-sheets-results-page'),
    pageIndicator: el('cut-sheets-page-indicator'),
    previousPageButton: el('btn-cut-sheets-page-previous'),
    nextPageButton: el('btn-cut-sheets-page-next'),
    onBeforeResultsPage: async (selected) => {
      if (selected?.kind === 'sheet') return openCuttingSheetResults(selected.item);
      if (!lastSolution) {
        showToast('Otimize ou abra um Cutting Sheet antes de acessar os resultados.', 'warning');
        return false;
      }
      renderCurrentResults();
      updateResultsSubtitle();
      return true;
    },
    openConfirmation: ({ title, body, confirmLabel, onConfirm }) => openModal({
      title, body, buttons: [
        { label: 'Cancelar', variant: 'btn-ghost' },
        { label: confirmLabel, variant: 'btn-danger', closeOnClick: false, onClick: async () => {
          try { await onConfirm(); closeModal(); }
          catch (error) { console.error(error); showToast(error?.message || 'Não foi possível concluir a exclusão.', 'error'); }
        } },
      ],
    }),
    onDeleteSheet: async (sheet) => {
      if (sheet.status !== 'draft') throw new Error('Somente Cutting Sheets em rascunho podem ser excluídos.');
      const activeLinks = await listWorkpackLinks({ targetType: WORKPACK_LINK_TARGETS.CUTTING_SHEET, targetId: sheet.id, status: 'ACTIVE' });
      await deleteCuttingSheet(sheet.id);
      await Promise.all(activeLinks.map((link) => unlinkWorkpackTarget(link.id, currentProfile?.name || '')));
      await createAuditEvent({
        eventType: 'CUTTING_SHEET_DELETED', entityType: 'CUTTING_SHEET', entityId: sheet.id,
        projectId: sheet.projectId || '', userName: currentProfile?.name || '',
        sourceDocumentType: 'CUTTING_SHEET', sourceDocumentId: sheet.id, reason: 'Draft Cutting Sheet deleted from register.',
        before: sheet, metadata: { unlinkedWorkpackLinks: activeLinks.length },
      });
      if (currentCuttingSheetId === sheet.id) currentCuttingSheetId = '';
      showToast(`${sheet.number} excluído.`, 'success');
    },
    onSaveCutExecution: async (sheet, draft) => {
      const result = await commitCutExecution(sheet, draft, { userName: currentProfile?.name || '' });
      showToast('Medidas reais do corte registradas.', 'success');
      return result.cuttingSheet;
    },
    onConfirmCut: async (sheet) => {
      const result = await confirmCuttingSheet(sheet, { userName: currentProfile?.name || '' }, {
        commitAtomic: commitCuttingConfirmation,
        createTransformation: createMaterialTransformation,
        deleteTransformation: deleteMaterialTransformation,
        getInventoryItem,
        updateInventoryItem,
        createStockMovement,
        deleteStockMovement,
        updateCuttingSheet,
        createAuditEvent,
        listOffcuts: getAllOffcuts,
        updateOffcut,
        saveOffcut,
        deleteOffcut,
      });
      if (inventoryPageRendered) await refreshInventoryPage(el('inventory-phase'), getInventoryPageOptions());
      showToast(`${result.cuttingSheet.number} confirmado como cortado.`, 'success');
      return result.cuttingSheet;
    },
    onEditSheet: (sheet) => loadSavedPlan(sheet.id),
    onNewSheet: () => resetCurrentPlan(),
    onOpenSheetResults: openCuttingSheetResults,
    onPrintSheet: async (sheet) => {
      const [sheetProject, sheetWorkpack] = await Promise.all([
        getProject(sheet.projectId),
        sheet.workpackId ? getWorkpack(sheet.workpackId) : null,
      ]);
      const storedSolution = sheet.planning?.solution || sheet.metadata?.solution || {};
      const solution = {
        ...structuredClone(storedSolution),
        stockUsed: structuredClone(sheet.bars || []),
        totalStockLength: Number(storedSolution.totalStockLength ?? sheet.summary?.totalStockLength) || 0,
        totalRemaining: Number(storedSolution.totalRemaining ?? sheet.summary?.totalRemaining) || 0,
        totalTrims: Number(storedSolution.totalTrims ?? sheet.summary?.totalTrims) || 0,
        allParts: Array.isArray(storedSolution.allParts) ? structuredClone(storedSolution.allParts) : (sheet.bars || []).flatMap((bar) => bar.pieces || []),
        unplacedParts: Array.isArray(storedSolution.unplacedParts) ? structuredClone(storedSolution.unplacedParts) : [],
      };
      await openCuttingSheetPdfReport({
        solution,
        projectData: {
          project: sheetProject?.name || sheet.metadata?.project || sheet.projectId,
          client: sheet.metadata?.client || '',
          equipment: sheet.metadata?.equipment || '',
          workpack: sheetWorkpack?.wpNo || sheetWorkpack?.title || sheet.metadata?.workpack || sheet.workpackId,
          reportDate: sheet.releasedAt || sheet.createdAt,
          cuttingSheetNumber: sheet.number,
          materialCouponNumber: sheet.metadata?.materialCouponNumber || '',
        },
        settings: {
          ...(await getAppSettings()),
          kerf: storedSolution.kerf || 0,
          minOffcut: storedSolution.minOffcut || 0,
        },
        reportOptions: getReportViewOptions(),
      });
    },
    onLinkCoupon: linkCuttingSheetMaterialCoupon,
    onOpenCoupon: async (couponId) => {
      showPhase('material-coupons');
      await renderOrRefreshMaterialCouponManager();
      if (!await openMaterialCouponEditor(couponId)) showToast('Material Coupon vinculado não encontrado.', 'warning');
    },
    onCreateRmv: async (sheet) => {
      const offcuts = cuttingSheetRmvCandidates(sheet, await getAllOffcuts());
      if (!offcuts.length) { showToast('Este Cutting Sheet não possui retalhos elegíveis.', 'warning'); return; }
      await openRmvForOffcuts(offcuts, sheet, null, { navigateToReturnMaterial: true });
    },
    onOpenExistingRmv: async (rmv, sheet) => openRmvForOffcuts(rmv.returnedItems || [], sheet, rmv),
  });
  cuttingSheetsPageInitialized = true;
}

function mtoToPlannerRow(item) {
  const qty = Number(item.qty) || 1;
  const cutLength = Number(item.cutLength);
  const requiredLength = Number(item.requiredLength);
  const length = cutLength > 0 ? cutLength : (requiredLength > 0 ? requiredLength / qty : 0);
  return { dwgNumber: item.drawing || '', mark: item.mark || '', pos: item.pos || '', qty, length, material: item.material || '', priority: item.priority || '' };
}
async function stageWorkpackToPlanner(workpack, related = {}) {
  const mtoIds = workpackRelationIds(workpack, related.workpackLinks || [], WORKPACK_RELATION_TYPES.MTO_ITEM);
  const inventoryIds = workpackRelationIds(workpack, related.workpackLinks || [], WORKPACK_RELATION_TYPES.INVENTORY_ITEM);
  const mto = uniqueLinkedRecords(mtoIds, related.mtoItems || []);
  const inventory = uniqueLinkedRecords(inventoryIds, related.inventoryItems || [], (item) => item.trace || item.traceability || item.id);
  const nesting = filterWorkpackNestingInputs(mto.found, inventory.found);
  const plannerInventory = linkedInventoryForPlanner(inventory.found);
  const replace = async () => {
    const project = await getProject(workpack.projectId);
    if (project?.name) await setActiveProjectName(project.name);
    await refreshPlannerProjectContext({ resetEquipment: true });
    stockTable.tbody.replaceChildren();
    partsTable.tbody.replaceChildren();
    plannerInventory.forEach((item) => stockTable.addRow(mapInventoryItemToStockRow(item)));
    nesting.mtoItems.forEach((item) => partsTable.addRow(mtoToPlannerRow(item)));
    void createWorkpackAuditEntry('WORKPACK_STAGED_TO_PLANNER', workpack, { mtoCount: nesting.mtoItems.length, inventoryCount: plannerInventory.length, excludedNonLinearMtoCount: nesting.excludedMtoItems.length, excludedInventoryWithoutLengthCount: inventory.found.length - plannerInventory.length, missingMtoCount: mto.missing.length, missingInventoryCount: inventory.missing.length });
    if (el('planner-equipment-select')) el('planner-equipment-select').value = workpack.equipmentId || '';
    populatePlannerWorkpackSelect();
    if (el('planner-workpack-select')) el('planner-workpack-select').value = workpack.id;
    setPlannerLegacyWorkpack('', '');
    if (el('workpack-name')) el('workpack-name').value = workpack.wpNo || '';
    showPlannerPhase();
    if (mto.missing.length || inventory.missing.length) showToast('Algumas referências do Workpack não foram encontradas.', 'warning');
  };
  if (stockTable.getRows().length || partsTable.getRows().length) { const body=document.createElement('p');body.textContent='Substituir os dados atuais do Planner pelos itens vinculados ao Workpack?';openModal({title:'Substituir dados do Planner',body,buttons:[{label:'Cancelar'},{label:'Substituir Planner Data',variant:'btn-primary',onClick:replace}]}); return; }
  await replace();
}

async function renderOrRefreshDrawingPage() {
  try {
    const defaultProjectId = (await getProject(await getActiveProjectName()))?.id || '';
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
      onOpenMto: openFilteredMto,
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

  setPlannerLegacyWorkpack(workpack, workpack ? 'Texto preservado de um plano legado.' : '');
  if (data.reportDate && el('report-date')) el('report-date').value = data.reportDate;
  if (el('planner-material-coupon')) el('planner-material-coupon').value = data.materialCoupon || data.materialCouponNumber || '';

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
    materialCoupon: el('planner-material-coupon')?.value?.trim() || '',
  };
}

function getMaterialCouponInitialData() {
  const projectData = getProjectData();
  return {
    project: activeProjectName || '',
    client: activePlannerProject?.client || '',
    projectShortCode: activePlannerProject?.shortCode || '',
    workpack: projectData.workpack || '',
    workpackId: projectData.workpackId || el('planner-workpack-select')?.value || '',
    date: projectData.reportDate || new Date().toISOString().slice(0, 10),
    issuingName: currentProfile?.name || '',
    issuingCompany: 'SAIPEM',
  };
}

async function openMaterialCouponPage(selectedMaterials, previousPhase = 'inventory') {
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

  await renderOrRefreshMaterialCouponManager();
  mountMaterialCouponPage(container, {
    selectedMaterials: materials,
    initialData: getMaterialCouponInitialData(),
    onCouponSaved: async (record) => {
      const couponNumber = textValue(record?.number).trim();
      if (!couponNumber) return;
      const input = el('planner-material-coupon');
      if (input) input.value = couponNumber;
      await refreshPlannerProjectContext();
      if (input) input.value = couponNumber;
      showToast(`${couponNumber} salvo e vinculado ao Cutting Sheet atual.`, 'success');
    },
    onBack: () => showPhase(materialCouponPreviousPhase),
  });
  showPhase('material-coupons');
}

async function openMaterialCouponFromResults() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de gerar o Material Coupon.', 'error');
    return;
  }
  const inventoryItems = await getInventoryItems();
  const materials = mergeMaterialCouponInventoryDetails(lastSolution.stockUsed || [], inventoryItems);
  await openMaterialCouponPage(materials, 'results');
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
    solution: lastSolution ? structuredClone(lastSolution) : null,
  };
}

async function persistCurrentPlan(name, workpackId = '') {
  const planName = textValue(name).trim();
  if (!planName) throw new Error('Informe o número do Cutting Sheet.');
  const workpack = workpackId ? await getWorkpack(workpackId) : null;
  if (workpackId && !workpack) throw new Error('Workpack nao encontrado.');

  const projectData = getProjectData();
  const project = await getProject(projectData.project || activeProjectName);
  const existing = currentCuttingSheetId ? await getCuttingSheet(currentCuttingSheetId) : null;
  if (existing && existing.status !== 'draft') throw new Error('Somente Cutting Sheets em rascunho podem ser editados.');
  const duplicate = (await getAllCuttingSheets()).find((sheet) => sheet.id !== existing?.id && textValue(sheet.number).toLowerCase() === planName.toLowerCase());
  if (duplicate) throw new Error(`Já existe um Cutting Sheet com o número ${planName}.`);
  const snapshot = buildPlanSnapshot();
  if (workpack) {
    snapshot.projectData = {
      ...snapshot.projectData,
      workpackId: workpack.id,
      workpack: workpack.wpNo || workpack.title || workpack.id,
    };
  }
  const sheet = await saveCuttingSheet({
    ...(existing || {}),
    projectId: project?.id || activeProjectId || projectData.projectId || '',
    number: planName,
    status: 'draft',
    workpackId: workpack?.id || workpackId || projectData.workpackId || '',
    materialCouponId: existing?.materialCouponId || '',
    bars: lastSolution?.stockUsed || existing?.bars || [],
    summary: summarizeSolution(lastSolution) || existing?.summary || {},
    planning: snapshot,
    updatedBy: currentProfile?.name || '',
    metadata: {
      ...(existing?.metadata || {}),
      projectShortCode: project?.shortCode || projectData.projectShortCode || '',
      project: projectData.project || activeProjectName,
      client: projectData.client || project?.client || '',
      equipment: projectData.equipment || '',
      workpack: workpack?.wpNo || projectData.workpack || '',
      date: projectData.reportDate || new Date().toISOString().slice(0, 10),
      materialCouponNumber: projectData.materialCoupon || '',
      solution: lastSolution ? structuredClone(lastSolution) : null,
    },
  });
  currentCuttingSheetId = sheet.id;

  if (workpack) {
    await ensureWorkpackLink({ projectId: workpack.projectId, workpackId: workpack.id, targetType: WORKPACK_LINK_TARGETS.CUTTING_SHEET, targetId: sheet.id, linkedBy: currentProfile?.name || '' });
    await createWorkpackAuditEntry('WORKPACK_CUTTING_SHEET_LINKED', workpack, { cuttingSheetId: sheet.id, cuttingSheetNumber: sheet.number });
  }
  return { snapshot, workpack, sheet };
}

async function openLinkResultsToWorkpack() {
  if (!lastSolution) {
    showToast('Otimize um plano antes de vincular ao Workpack.', 'error');
    return;
  }

  try {
    const projectData = getProjectData();
    const equipmentId = el('planner-equipment-select')?.value || '';
    const project = await getProject(projectData.project || activeProjectName);
    const projectWorkpacks = await listWorkpacks(project?.id ? { projectId: project.id } : {});
    const workpacks = equipmentId
      ? projectWorkpacks.filter((workpack) => workpack.equipmentId === equipmentId)
      : projectWorkpacks;
    if (!workpacks.length) {
      showToast('Nenhum Workpack compativel com o projeto e equipamento deste resultado.', 'warning');
      return;
    }

    const body = document.createElement('form');
    body.className = 'workpack-plan-link-form';
    body.addEventListener('submit', (event) => event.preventDefault());
    const description = document.createElement('p');
    description.className = 'text-muted';
    description.textContent = 'O Cutting Sheet em rascunho será salvo e adicionado aos documentos do Workpack.';
    const workpackField = document.createElement('label');
    workpackField.className = 'field';
    const workpackLabel = document.createElement('span');
    workpackLabel.textContent = 'Workpack';
    const workpackSelect = document.createElement('select');
    workpackSelect.className = 'input';
    workpackSelect.append(new Option('Selecione um Workpack', ''), ...workpacks.map((workpack) => new Option(workpack.wpNo || workpack.title || workpack.id, workpack.id)));
    workpackSelect.value = projectData.workpackId && workpacks.some((workpack) => workpack.id === projectData.workpackId)
      ? projectData.workpackId
      : '';
    workpackField.append(workpackLabel, workpackSelect);
    const nameField = document.createElement('label');
    nameField.className = 'field';
    const nameLabel = document.createElement('span');
    nameLabel.textContent = 'Número do Cutting Sheet';
    const nameInput = document.createElement('input');
    nameInput.className = 'input';
    nameInput.type = 'text';
    nameInput.placeholder = 'Ex.: NEST-WP-001-REV-A';
    nameField.append(nameLabel, nameInput);
    body.append(description, workpackField, nameField);

    openModal({
      title: 'Vincular otimizacao ao Workpack',
      body,
      wide: true,
      buttons: [
        { label: 'Cancelar' },
        {
          label: 'Salvar e vincular',
          variant: 'btn-primary',
          closeOnClick: false,
          onClick: async () => {
            const workpackId = workpackSelect.value;
            const planName = nameInput.value.trim();
            if (!workpackId || !planName) {
              showToast('Selecione o Workpack e informe o número do Cutting Sheet.', 'error');
              return;
            }
            try {
              const { workpack } = await persistCurrentPlan(planName, workpackId);
              const plannerSelect = el('planner-workpack-select');
              if (plannerSelect && [...plannerSelect.options].some((option) => option.value === workpackId)) plannerSelect.value = workpackId;
              setPlannerLegacyWorkpack('', '');
              if (el('workpack-name')) el('workpack-name').value = workpack?.wpNo || '';
              closeModal();
              renderHome();
              showToast(`Cutting Sheet "${planName}" vinculado ao Workpack ${workpack?.wpNo || workpackId}.`, 'success');
            } catch (error) {
              console.error(error);
              showToast(error?.message || 'Nao foi possivel vincular a otimizacao ao Workpack.', 'error');
            }
          },
        },
      ],
    });
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar os Workpacks disponiveis.', 'error');
  }
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

function applyPlanSnapshot(sheet) {
  const plan = cuttingSheetPlanningSnapshot(sheet);
  const pd = plan.projectData || {};
  setProjectFormData(pd);
  const workpackSelect = el('planner-workpack-select');
  const savedWorkpackText = textValue(pd.workpack).trim();
  const resolvedWorkpack = workpackSelect && pd.workpackId
    && [...workpackSelect.options].some((option) => option.value === pd.workpackId);
  if (workpackSelect) workpackSelect.value = resolvedWorkpack ? pd.workpackId : '';
  setPlannerLegacyWorkpack(
    resolvedWorkpack ? '' : savedWorkpackText,
    pd.workpackId ? 'Referência de Workpack não encontrada; texto legado preservado.' : 'Texto preservado de um plano legado.',
  );

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
  lastSolution = plan.solution ? structuredClone(plan.solution) : null;
  currentCuttingSheetId = sheet.id || '';
  renderHome();
}

function renderStoredSolution() {
  if (!lastSolution) return false;
  return showCutSheetsResultsPage();
}

async function openSavedPlanResults(id) {
  const sheet = await getCuttingSheet(id);
  const planning = sheet ? cuttingSheetPlanningSnapshot(sheet) : null;
  if (!planning?.solution) { if (sheet) applyPlanSnapshot(sheet); showToast('Este Cutting Sheet precisa ser otimizado novamente.', 'warning'); return false; }
  applyPlanSnapshot(sheet);
  setNestingPlanWorkspaceState({ name: sheet.number, status: sheet.status === 'draft' ? 'SAVED' : sheet.status.toUpperCase(), savedAt: sheet.updatedAt || '', nameSource: 'manual' });
  return renderStoredSolution();
}

async function loadSavedPlan(id) {
  const sheet = await getCuttingSheet(id);
  if (!sheet) {
    showToast('Cutting Sheet não encontrado.', 'error');
    return;
  }
  if (sheet.status !== 'draft') {
    showToast('Somente Cutting Sheets em rascunho podem ser editados.', 'warning');
    return;
  }
  applyPlanSnapshot(sheet);
  setNestingPlanWorkspaceState({ name: sheet.number, status: 'SAVED', savedAt: sheet.updatedAt || '', nameSource: 'manual' });
  showToast(`${sheet.number} carregado para edição.`, 'success');
}

async function deleteSavedPlan(id) {
  const sheet = await getCuttingSheet(id);
  if (!sheet || sheet.status !== 'draft') throw new Error('Somente Cutting Sheets em rascunho podem ser excluídos.');
  await deleteCuttingSheet(id);
  if (currentCuttingSheetId === id) currentCuttingSheetId = '';
  renderHome();
  showToast(`${sheet.number} excluído.`, 'success');
}

async function saveCurrentPlanDraft(name) {
  await persistCurrentPlan(name, getProjectData().workpackId);
  renderHome();
  showToast(`Cutting Sheet "${name}" salvo como rascunho.`, 'success');
  return true;
}

async function saveCurrentPlanFromResults() {
  const name = getNestingPlanName();
  if (!name) {
    showPlannerPhase();
    openSavePlanModal();
    return false;
  }
  await saveCurrentPlanDraft(name);
  setNestingPlanWorkspaceState({ name, status: 'SAVED', savedAt: new Date().toISOString(), nameSource: 'manual' });
  return true;
}

function openSavePlanModal() {
  const currentName = getNestingPlanName();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.placeholder = 'Ex.: NEST-WP-001-REV-A';
  input.value = currentName;
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'field';
  const labelText = document.createElement('span');
  labelText.textContent = 'Número do novo Cutting Sheet';
  label.append(labelText, input);
  wrapper.appendChild(label);

  openModal({
    title: 'Salvar como novo Cutting Sheet',
    body: wrapper,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar como novo', variant: 'btn-primary', closeOnClick: false,
        onClick: async () => {
          const name = input.value.trim();
          if (!name) { showToast('Informe o número do Cutting Sheet.', 'error'); return; }
          if (currentName && name === currentName) { showToast('Informe um nome diferente para criar uma nova cópia.', 'error'); return; }
          const sourceId = currentCuttingSheetId;
          currentCuttingSheetId = '';
          try { await saveCurrentPlanDraft(name); }
          catch (error) { currentCuttingSheetId = sourceId; throw error; }
          setNestingPlanWorkspaceState({ name, status: 'SAVED', savedAt: new Date().toISOString(), nameSource: 'manual' });
          closeModal();
        },
      },
    ],
  });
  setTimeout(() => input.focus(), 50);
}

function openLoadPlanModalFlow() {
  showLoadPlanModal(async () => (await getAllCuttingSheets()).filter((sheet) => sheet.status === 'draft'), {
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

async function importSelectedCouponMaterials() {
  const input = el('planner-material-coupon');
  const button = el('import-coupon-materials-btn');
  if (!input || !button || !stockTable || !hasExactPlannerMaterialCouponSelection()) {
    syncCouponMaterialsImportButton();
    return;
  }

  button.disabled = true;
  try {
    const coupons = await getMaterialCoupons({ number: input.value });
    const materialRows = buildMaterialCouponStockRows(coupons);
    if (!materialRows.length) {
      showToast(`Nenhum material encontrado para o Coupon ${input.value}.`, 'warning');
      return;
    }

    const existingTraceabilities = new Set(stockTable
      .getRows({ expandQty: false, includeInvalid: true })
      .map((row) => String(row.traceability ?? '').trim())
      .filter(Boolean));
    let added = 0;
    let skipped = 0;

    materialRows.forEach((row) => {
      const traceability = String(row.traceability ?? '').trim();
      if (traceability && existingTraceabilities.has(traceability)) {
        skipped += 1;
        return;
      }
      stockTable.addRow(row);
      if (traceability) existingTraceabilities.add(traceability);
      added += 1;
    });

    const importedLabel = added === 1 ? 'material importado' : 'materiais importados';
    const duplicateLabel = skipped === 1 ? 'já existia' : 'já existiam';
    showToast(`${added} ${importedLabel}, ${skipped} ${duplicateLabel} na tabela.`, added > 0 ? 'success' : 'warning');
  } catch (error) {
    console.error('Falha ao importar materiais do Material Coupon.', error);
    showToast('Não foi possível importar os materiais do Coupon.', 'error');
  } finally {
    syncCouponMaterialsImportButton();
  }
}

async function renderOrRefreshDocumentsPage() {
  const container = el('documents-hub');
  if (!container) return;
  await renderDocumentsPage(container, {
    loadDocuments: async () => ({
      materialCoupons: await getAllMaterialCoupons(),
      cuttingSheets: await getAllCuttingSheets(),
      returnMaterialVouchers: await getAllReturnMaterialVouchers(),
      workpacks: await listWorkpacks(),
      projects: await getAllProjects(),
    }),
  });
}

function openMtoImportFlow() {
  showPhase('mto');
}

async function renderHome() {
  const container = el('home-phase');
  if (!container) return;
  await renderHomeDashboard(container, {
    activeProjectName,
    loadDashboardData,
    onNavigate: (phase) => (phase === 'results' ? showCutSheetsResultsPage() : showPhase(phase)),
    onNewPlan: handleNewPlan,
    onOpenInventory: () => showPhase('inventory'),
    onOpenMaterialCoupon: () => showPhase('material-coupons'),
    onOpenEquipment: openOperationalEquipment,
  });
}

async function openOperationalEquipment(equipmentId, tag = '') {
  showPhase('equipments');
  await renderOrRefreshEquipmentPage();
  await openEquipmentOperationalView(equipmentId, tag);
}

async function renderOrRefreshGenealogyPage() {
  const container = el('genealogy-workspace');
  if (!container) return;
  await renderGenealogyPage(container, {
    loadData: loadDashboardData,
    onNavigate: (phase) => showPhase(phase),
    onOpenEquipment: openOperationalEquipment,
  });
}

async function renderOrRefreshReportsPage() {
  const container = el('reports-workspace');
  if (!container) return;
  await renderReportsPage(container, {
    loadReportsData,
    initialEquipmentTag: reportsRequestedEquipmentTag,
    exportExcel: exportActiveReportExcel,
    printPresentation: openReportsPresentation,
    showToast,
  });
  reportsRequestedEquipmentTag = '';
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

  document.querySelectorAll('[data-report-color-mode]').forEach((button) => {
    const active = button.dataset.reportColorMode === reportViewOptions.colorMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

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

  document.querySelectorAll('[data-report-color-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      reportViewOptions.colorMode = button.dataset.reportColorMode;
      reportViewOptions.useColors = reportViewOptions.colorMode === 'color';
      applyReportOptionChange();
    });
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

  el('btn-export-piece-labels')?.addEventListener('click', () => {
    exportModal?.close();
    onExportPieceLabels();
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

}

async function init() {
  const stockList = el('stock-list');
  const partsList = el('parts-list');
  const calculateButton = el('calculate');

  if (!stockList || !partsList || !calculateButton) {
    showToast('Falha ao iniciar a tela do plano. Recarregue a pagina.', 'error');
    return;
  }

  try {
    await initializeApplicationLanguage();
  } catch (error) {
    console.error('Falha ao inicializar o idioma do aplicativo.', error);
    translateDom(document);
    setLanguage('pt-BR');
  }

  try {
    await initializeUserSession();
  } catch (error) {
    console.error('Falha ao inicializar usuários.', error);
    showToast(error.message || 'Não foi possível inicializar os usuários.', 'error');
    return;
  }

  try {
    await initializeSharedFolderSync();
  } catch (error) {
    console.error('Falha ao inicializar sincronizacao por pasta compartilhada.', error);
    showToast('A sincronizacao compartilhada nao iniciou. Os dados locais continuam disponiveis.', 'warning');
  }

  try {
    const projects = await getAllProjects();
    const migration = await migrateChildProjectIds(projects);
    if (migration.unresolved.length) console.warn('Project references pending manual resolution:', migration.unresolved);
  } catch (error) {
    console.error('Falha ao migrar referências de Project ID.', error);
    showToast('Algumas referências antigas de projeto não puderam ser migradas.', 'warning');
  }

  try {
    const migration = await migratePlansToCuttingSheets({ actor: currentProfile?.name || '' });
    if (migration.changed) console.info(`[migration] ${migration.changed} Saved Plan(s) converted to Cutting Sheet draft(s).`);
  } catch (error) {
    console.error('Falha ao migrar Saved Plans para Cutting Sheets.', error);
    showToast('Alguns planos antigos não puderam ser convertidos para Cutting Sheets.', 'warning');
  }

  stockTable = createDataTable(stockList, STOCK_COLUMNS);
  partsTable = createDataTable(partsList, PARTS_COLUMNS, {
    enableSobremetal: true,
    onConfigureSobremetal: ({ row, update }) => openSobremetalModal({ piece: row, onSave: update }),
  });
  void seedEquipmentTypes().catch((error) => {
    console.error(error);
    showToast('Nao foi possivel carregar tipos padrao de equipamento.', 'error');
  });

  stockTable.addRow({ po: 'PO123', poItem: 'IT456', qty: 1, lengthMm: 6000, materialGrade: 'A36', heatNo: 'H789', materialDescription: 'Pipe 6 in', traceability: 'T-101' });
  partsTable.addRow({ dwgNumber: 'D-001', mark: 'M-01', pos: 'P-01', qty: 3, length: 1200, material: 'A36', priority: '2' });

  initNestingPlanWorkspace(el('planner-phase'), {
    onBack: () => showPhase('cut-sheets'),
    onSave: saveCurrentPlanDraft,
    onSaveAs: openSavePlanModal,
    onLoad: openLoadPlanModalFlow,
    onOpenResults: showCutSheetsResultsPage,
    onNew: () => resetCurrentPlan({ confirmFirst: true }),
    onOptimize: calculate,
    onMissingName: () => showToast('Informe o número do Cutting Sheet no campo destacado.', 'error'),
    onError: (error) => { console.error(error); showToast(error?.message || 'Não foi possível concluir a ação do Cutting Sheet.', 'error'); },
    hasResults: () => Boolean(lastSolution),
    onContentDirty: () => { lastSolution = null; },
  });
  initNestingResultsCommandBar(el('cut-sheets-results-page'));

  el('add-stock')?.addEventListener('click', () => stockTable.addRow());
  el('import-inventory-btn')?.addEventListener('click', openInventoryFlow);
  el('planner-material-coupon')?.addEventListener('input', syncCouponMaterialsImportButton);
  el('import-coupon-materials-btn')?.addEventListener('click', importSelectedCouponMaterials);
  el('import-mto-btn')?.addEventListener('click', openMtoImportFlow);
  el('add-part')?.addEventListener('click', () => partsTable.addRow());
  el('enable-trim')?.addEventListener('change', (e) => el('trim-inputs')?.classList.toggle('hidden', !e.target.checked));
  el('calculate')?.addEventListener('click', calculate);
  el('back-to-edit-btn')?.addEventListener('click', showPlannerPhase);
  el('save-results-plan-btn')?.addEventListener('click', () => void saveCurrentPlanFromResults().catch((error) => {
    console.error(error);
    showToast(error?.message || 'Não foi possível salvar o Cutting Sheet.', 'error');
  }));
  el('new-results-plan-btn')?.addEventListener('click', () => void resetCurrentPlan({ confirmFirst: true }));
  el('print-results-cutting-sheet-btn')?.addEventListener('click', () => void onExportCuttingSheetPdf());
  el('generate-results-rmv-btn')?.addEventListener('click', () => void generateRmvFromCurrentCuttingSheet().catch((error) => {
    console.error(error);
    showToast(error?.message || 'Não foi possível gerar o RMV.', 'error');
  }));
  el('generate-results-material-coupon-btn')?.addEventListener('click', openMaterialCouponFromResults);
  el('issue-results-cutting-sheet-btn')?.addEventListener('click', issueCurrentCuttingSheet);
  el('link-results-workpack-btn')?.addEventListener('click', openLinkResultsToWorkpack);
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
  el('new-plan-btn')?.addEventListener('click', () => openNewDocumentModal({ onNavigate: (phase) => {
    if (phase === 'cut-sheets') void resetCurrentPlan();
    else showPhase(phase);
  } }));
  el('save-project-btn')?.addEventListener('click', openSaveProjectModal);
  el('switch-project-btn')?.addEventListener('click', openSwitchProjectModal);
  el('active-project-selector')?.addEventListener('click', openActiveProjectSelector);
  el('planner-select-project-btn')?.addEventListener('click', openActiveProjectSelector);
  el('profile-btn')?.addEventListener('click', (event) => openActiveUserMenu(event.currentTarget, {
    onSwitch: selectAndApplyActiveUser,
    onEditSaved: refreshProfileButton,
  }));
  el('users-btn')?.addEventListener('click', () => openUsersManager({ onChange: handleManagedUserChange }));
  el('settings-btn')?.addEventListener('click', handleSettingsClick);

  el('planner-equipment-select')?.addEventListener('change', () => {
    legacyPlannerProjectData = null;
    pendingPlannerEquipmentLabel = '';
    updateActiveProjectLabel();
    populatePlannerWorkpackSelect();
  });

  el('planner-workpack-select')?.addEventListener('change', () => {
    const selected = plannerWorkpacks.find((item) => item.id === el('planner-workpack-select')?.value);
    setPlannerLegacyWorkpack('', '');
    if (selected && el('workpack-name')) el('workpack-name').value = selected.wpNo || '';
    updateActiveProjectLabel();
  });

  wireFileUpload('upload-stock-btn', 'stock-file-input', stockTable);
  wireFileUpload('upload-parts-btn', 'parts-file-input', partsTable);
  wireNavigation();
  bindWorkflowPlaceholders();
  wireReportOptionControls();
  wireExportModal();
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



