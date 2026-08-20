import { buildMaterialCouponReportHtmlWithProfile, MATERIAL_COUPON_REPORT_COLUMNS } from '../../reports/materialCouponReport.js';
import { enrichMaterialCouponLines } from '../../documents/materialCoupon.js';
import { linkMaterialCouponLinesToEquipmentTags, linkMaterialCouponLinesToMto, materialCouponEquipmentTagOptions, prepareMaterialCouponIssue } from '../../core/materialCouponIssue.js';
import { MATERIAL_COUPON_CONTROL_COLUMNS, buildMaterialCouponControlRows, filterMaterialCouponControlRows } from '../../core/materialCouponControl.js';
import { MATERIAL_COUPON_ACTIONS, applyMaterialCouponAction, canMaterialCouponAction, nextMaterialCouponRevision } from '../../core/materialCouponWorkflow.js';
import { workpackRelationIds, WORKPACK_RELATION_TYPES } from '../../core/workpackRelations.js';
import { resolveProjectId } from '../../core/projectIdentity.js';
import { nextProjectDocumentNumber } from '../../core/documentNumbering.js';
import { openModal, closeModal } from '../../ui/modal.js';

const STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  DISPATCHED: 'DISPATCHED',
  RECEIVED: 'RECEIVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
});

const MATERIAL_COUPON_CONTROL_COLUMN_WIDTHS = Object.freeze({
  mcCode: 150,
  sapCode: 135,
  couponStatus: 115,
  mcRevision: 90,
  materialDestination: 170,
  mcDate: 120,
  serialNumber: 145,
  itemType: 150,
  materialDescription: 360,
  qty: 90,
  unit: 75,
  diaMm: 100,
  thicknessMm: 110,
  widthMm: 100,
  lengthMm: 105,
  weightKg: 105,
  materialGrade: 145,
  traceability: 190,
  heatNo: 125,
  mir: 180,
  equipment: 190,
  poItem: 105,
  nfArrival: 120,
  notes: 240,
  materialProject: 165,
  totalSurfaceM2: 120,
  po: 120,
  mcIssuingResponsible: 210,
  materialDispatchResponsible: 220,
  materialReceivingResponsible: 225,
  workpack: 165,
  drawingUse: 210,
  rmvCode: 155,
  local: 170,
  returnedQty: 120,
  returnedWidthMm: 155,
  returnedLengthMm: 160,
  nesting: 220,
});

const MATERIAL_COUPON_CONTROL_LINK_FIELDS = new Set([
  'materialDispatchResponsible',
  'materialReceivingResponsible',
  'workpack',
  'drawingUse',
  'rmvCode',
  'returnedQty',
  'returnedWidthMm',
  'returnedLengthMm',
  'nesting',
]);

function reservationErrorMessage(error = {}) {
  const trace = error.inventoryItemId ? ` (${error.inventoryItemId})` : '';
  const messages = {
    INVENTORY_BALANCE_EMPTY: `O material${trace} está sem saldo disponível.`,
    INVENTORY_ALREADY_RESERVED: `O material${trace} já está reservado por outro fluxo.`,
    INVENTORY_STATUS_NOT_AVAILABLE: `O material${trace} não está com status disponível.`,
    INVENTORY_QUALITY_NOT_ACCEPTED: `O material${trace} ainda não está liberado pela Qualidade.`,
    INVENTORY_INSPECTION_NOT_ACCEPTED: `O material${trace} ainda não possui inspeção aceita.`,
    INVENTORY_ITEM_NOT_FOUND: `O material${trace} não foi encontrado no Inventory.`,
    INSUFFICIENT_INVENTORY_BALANCE: `O material${trace} não possui saldo suficiente para a quantidade solicitada.`,
    INVALID_RESERVATION_QUANTITY: `Informe uma quantidade válida para o material${trace}.`,
    DUPLICATE_INVENTORY_LINE: `O material${trace} aparece mais de uma vez no Coupon.`,
  };
  return messages[error.code] || error.code || 'Inventory reservation validation failed.';
}

function materialCouponIssueErrorMessage(error = {}) {
  const code = error.code || error.message || '';
  const details = error.details || { code };
  const reservationMessage = reservationErrorMessage({ ...details, code });
  if (reservationMessage !== code && reservationMessage !== 'Inventory reservation validation failed.') return reservationMessage;
  const messages = {
    MATERIAL_COUPON_NOT_DRAFT: 'Este Material Coupon não está mais em rascunho. Atualize a lista antes de tentar novamente.',
    CHILD_TRACEABILITY_REQUIRED: 'Não foi possível gerar a rastreabilidade do saldo remanescente.',
    INVALID_SPLIT_QTY: 'A quantidade a separar do Inventory não é válida.',
    INVALID_SPLIT_LENGTH: 'O comprimento a separar do Inventory não é válido.',
    INVALID_SPLIT_WIDTH: 'A largura a separar do Inventory não é válida.',
    SPLIT_DIMENSION_REQUIRED: 'Nenhuma dimensão válida foi informada para dividir o Inventory.',
  };
  const normalizedCode = code.split(':')[0];
  if (messages[normalizedCode]) return messages[normalizedCode];
  if (error.message && !/^[A-Z0-9_:.-]+$/.test(error.message)) return `Falha de armazenamento: ${error.message}`;
  return code ? `Não foi possível emitir o Material Coupon: ${code}` : 'Não foi possível emitir o Material Coupon.';
}

let deps = {};
let managerState = {
  coupons: [],
  projects: [],
  workpacks: [],
  cuttingSheets: [],
  equipments: [],
  mtoItems: [],
  selectedId: '',
  activeTab: 'header',
  search: '',
  statusFilter: '',
  listFilters: { project: '', destination: '', material: '', itemType: '', from: '' },
  listPage: 1,
  listPageSize: 10,
  selectedListIds: new Set(),
  editorOpen: false,
  draft: null,
  history: [],
  view: 'manager',
  busy: false,
  busyAction: '',
  controlFilters: { search: '', project: '', workpack: '', status: '', from: '', to: '' },
  controlData: { drawings: [], returnMaterialVouchers: [], inventoryItems: [], auditEvents: [], workpackLinks: [] },
};
let managerBound = false;
let closeActiveRowActions = null;
let notifyGeneratedCouponSaved = null;

function el(id) {
  return document.getElementById(id);
}

function node(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue != null) element.textContent = textValue;
  return element;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function couponPayload(record = {}) {
  return record.metadata?.coupon || record;
}

function couponWithInventoryDetails(coupon, inventoryItems = []) {
  if (!coupon || !Array.isArray(coupon.lines)) return coupon;
  return { ...coupon, lines: enrichMaterialCouponLines(coupon.lines, inventoryItems) };
}

function normalizedProjectShortCode(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
}

export function nextMaterialCouponCode(projectShortCode, records = []) {
  const shortCode = normalizedProjectShortCode(projectShortCode);
  if (!shortCode) return '';
  const numberedRecords = (Array.isArray(records) ? records : []).map((record) => ({
    number: record?.number || couponPayload(record)?.header?.mcCode,
  }));
  return nextProjectDocumentNumber(numberedRecords, shortCode, 'MC');
}

function isGeneratedMaterialCouponCode(value) {
  return /^[A-Z0-9_-]+_FAB_MC-\d+$/i.test(text(value));
}

function newCoupon() {
  const createdAt = new Date().toISOString();
  const initial = deps.initialData || {};
  const form = deps.materialCouponFormSettings || {};
  return {
    id: '',
    status: STATUS.DRAFT,
    header: {
      mcCode: nextMaterialCouponCode(initial.projectShortCode, managerState.coupons),
      revision: '0',
      project: initial.project || '',
      client: initial.client || '',
      scope: '',
      destination: '',
      date: today(),
      workpack: '',
      docNumber: form.docNumber || '',
      docRevision: form.docRevision || '',
      docRevisionDate: form.docRevisionDate || '',
      docReference: form.docReference || '',
      reference: form.reference || '',
      notes: form.notes || '',
      remarks: '',
    },
    responsible: {
      issuing: deps.currentUserName || '',
      dispatch: '',
      dispatchRole: 'Project Warehouse',
      dispatchCompany: '',
      dispatchDate: '',
      receiving: '',
      receivingRole: 'CTCO Yard/Subcontractor',
      receivingCompany: '',
      receivingDate: '',
    },
    lines: [],
    links: {
      workpackId: '',
      cuttingSheetId: '',
      cuttingSheetPieceIds: [],
      rmvId: '',
    },
    linkedCuttingSheetPieces: [],
    audit: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function clone(value) {
  return structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function toRecord(coupon) {
  const payload = {
    ...coupon,
    updatedAt: new Date().toISOString(),
  };
  return {
    id: payload.id || undefined,
    projectId: resolveProjectId(managerState.projects, payload.header.project) || payload.projectId || payload.header.project,
    number: payload.header.mcCode,
    status: payload.status.toLowerCase(),
    workpackId: payload.links.workpackId,
    issuedAt: payload.status === STATUS.ISSUED ? new Date().toISOString() : '',
    createdAt: payload.createdAt,
    createdBy: payload.createdBy,
    createdByName: payload.createdByName,
    items: payload.lines,
    metadata: { coupon: payload },
  };
}

function fromRecord(record = {}) {
  const payload = couponPayload(record);
  if (payload.header && Array.isArray(payload.lines)) {
    const base = newCoupon();
    return {
      ...base,
      ...clone(payload),
      links: { ...base.links, ...(clone(payload.links) || {}) },
      linkedCuttingSheetPieces: Array.isArray(payload.linkedCuttingSheetPieces) ? clone(payload.linkedCuttingSheetPieces) : [],
      id: record.id || payload.id || '',
      status: text(payload.status || record.status).toUpperCase() || STATUS.DRAFT,
      createdAt: record.createdAt || payload.createdAt,
      createdBy: record.createdBy || payload.createdBy || '',
      createdByName: record.createdByName || payload.createdByName || '',
    };
  }

  const base = newCoupon();
  return {
    ...base,
    id: record.id || '',
    status: text(record.status).toUpperCase() || STATUS.DRAFT,
    header: {
      ...base.header,
      mcCode: record.number || base.header.mcCode,
      project: record.projectId || '',
    },
    lines: Array.isArray(record.items) ? clone(record.items) : [],
    createdAt: record.createdAt || base.createdAt,
    createdBy: record.createdBy || '',
    createdByName: record.createdByName || '',
    updatedAt: record.updatedAt || base.updatedAt,
  };
}

function selectedCouponRecord() {
  return managerState.coupons.find((coupon) => coupon.id === managerState.selectedId) || null;
}

function selectedCoupon() {
  return managerState.draft || (selectedCouponRecord() ? fromRecord(selectedCouponRecord()) : null);
}

function filteredCoupons() {
  const filters = managerState.listFilters;
  const controlRows = buildMaterialCouponControlRows(managerState.coupons);
  const matchingIssuedIds = new Set(filterMaterialCouponControlRows(controlRows, {
    search: managerState.search, project: filters.project, status: managerState.statusFilter, from: filters.from,
  }).map((row) => row.couponId));
  const search = managerState.search.toLowerCase();
  return managerState.coupons.filter((record) => {
    const coupon = fromRecord(record);
    const displayStatus = couponListStatus(coupon);
    const haystack = [
      coupon.header.mcCode,
      coupon.header.project,
      coupon.header.destination,
      coupon.status,
      coupon.header.date,
    ].join(' ').toLowerCase();
    const lineMatch = coupon.lines.some((line) => {
      if (filters.material && text(line.materialDescription) !== filters.material) return false;
      if (filters.itemType && text(line.itemType) !== filters.itemType) return false;
      return true;
    });
    const updated = validDate(coupon.updatedAt);
    const from = validDate(filters.from);
    const baseMatch = (!search || haystack.includes(search) || matchingIssuedIds.has(record.id))
      && (!managerState.statusFilter || displayStatus === managerState.statusFilter)
      && (!filters.project || coupon.header.project === filters.project)
      && (!filters.destination || coupon.header.destination === filters.destination)
      && (!from || (updated && updated >= from));
    return baseMatch && ((!filters.material && !filters.itemType) || lineMatch);
  });
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function couponListStatus(coupon) {
  return coupon.status;
}

function canEdit(coupon) {
  return coupon && coupon.status === STATUS.DRAFT;
}

function readInput(selector, fallback = '') {
  return text(document.querySelector(selector)?.value ?? fallback);
}

function readDraftFromDom() {
  const coupon = selectedCoupon() || newCoupon();
  coupon.header = {
    ...coupon.header,
    mcCode: readInput('[data-mc-field="mcCode"]', coupon.header.mcCode),
    revision: readInput('[data-mc-field="revision"]', coupon.header.revision),
    date: readInput('[data-mc-field="date"]', coupon.header.date),
    docNumber: readInput('[data-mc-field="docNumber"]', coupon.header.docNumber),
    docRevision: readInput('[data-mc-field="docRevision"]', coupon.header.docRevision),
    docRevisionDate: readInput('[data-mc-field="docRevisionDate"]', coupon.header.docRevisionDate),
    docReference: readInput('[data-mc-field="docReference"]', coupon.header.docReference),
    project: readInput('[data-mc-field="project"]', coupon.header.project),
    client: readInput('[data-mc-field="client"]', coupon.header.client),
    scope: readInput('[data-mc-field="scope"]', coupon.header.scope),
    workpack: readInput('[data-mc-field="workpack"]', coupon.header.workpack),
    destination: readInput('[data-mc-field="destination"]', coupon.header.destination),
    reference: readInput('[data-mc-field="reference"]', coupon.header.reference),
    notes: readInput('[data-mc-field="notes"]', coupon.header.notes),
    remarks: readInput('[data-mc-field="remarks"]', coupon.header.remarks),
  };
  coupon.responsible = {
    ...coupon.responsible,
    issuing: readInput('[data-mc-field="issuing"]', coupon.responsible.issuing),
    dispatch: readInput('[data-mc-field="dispatch"]', coupon.responsible.dispatch),
    dispatchRole: readInput('[data-mc-field="dispatchRole"]', coupon.responsible.dispatchRole),
    dispatchCompany: readInput('[data-mc-field="dispatchCompany"]', coupon.responsible.dispatchCompany),
    dispatchDate: readInput('[data-mc-field="dispatchDate"]', coupon.responsible.dispatchDate),
    receiving: readInput('[data-mc-field="receiving"]', coupon.responsible.receiving),
    receivingRole: readInput('[data-mc-field="receivingRole"]', coupon.responsible.receivingRole),
    receivingCompany: readInput('[data-mc-field="receivingCompany"]', coupon.responsible.receivingCompany),
    receivingDate: readInput('[data-mc-field="receivingDate"]', coupon.responsible.receivingDate),
  };
  coupon.updatedAt = new Date().toISOString();
  managerState.draft = coupon;
  return coupon;
}

function validateForIssue(coupon) {
  const errors = [];
  const warnings = [];
  if (!coupon.header.mcCode) errors.push('MC Code is required.');
  if (!coupon.header.date) errors.push('Date is required.');
  if (!coupon.header.project) errors.push('Project is required.');
  if (!coupon.header.destination) errors.push('Destination is required.');
  if (!coupon.lines.length) errors.push('At least one material line is required.');
  coupon.lines.forEach((line, index) => {
    if (!line.materialDescription) errors.push(`Line ${index + 1}: description is required.`);
    if (!line.qty) errors.push(`Line ${index + 1}: quantity is required.`);
    if (!line.unit) errors.push(`Line ${index + 1}: unit is required.`);
    if (!line.traceability) warnings.push(`Line ${index + 1}: traceability is missing.`);
    if (!line.po && !line.poItem) warnings.push(`Line ${index + 1}: PO/item is missing.`);
    if (looksMetallic(line) && !line.heatNo) warnings.push(`Line ${index + 1}: heat is missing.`);
  });
  return { valid: errors.length === 0, errors, warnings };
}

function looksMetallic(line) {
  return /STEEL|AÇO|ACO|PIPE|PLATE|BEAM|S355|DNV|ASTM|CARBON|METAL/i.test([
    line.materialDescription,
    line.materialGrade,
    line.itemType,
  ].join(' '));
}

function inventoryLineToCouponLine(item = {}, index = 0, context = {}) {
  return {
    ...emptyLine(index + 1),
    inventoryItemId: item.id || item.trace || item.traceability || '',
    mtoItemId: item.mtoItemId || item.metadata?.mtoItemId || '',
    serialNumber: String(index + 1),
    sapCode: item.sapCode || item.identCode || '',
    itemType: item.category || '',
    materialDescription: item.materialDescription || '',
    qty: item.qty || item.balanceQty || '1',
    unit: item.unit || 'EA',
    diaMm: item.diaMm || '',
    thicknessMm: item.thicknessMm || '',
    widthMm: item.widthMm || '',
    lengthMm: item.lengthMm || '',
    weightKg: item.weightKg || '',
    materialGrade: item.materialGrade || '',
    traceability: item.traceability || item.trace || '',
    heatNo: item.heatNo || '',
    mir: item.mir || '',
    equipment: context.equipment || item.equipment || '',
    drawing: item.drawing || item.drawingRef || item.dwgNumber || '',
    drawingTitle: item.drawingTitle || item.title || '',
    tag: item.tag || item.Tag || '',
    mark: item.mark || '',
    pos: item.pos || item.position || '',
    po: item.po || '',
    poItem: item.poItem || '',
    nfArrival: item.nfArrival || '',
    statusMaterial: item.status || 'available',
    notes: '',
  };
}

async function importFromWorkpack() {
  const workpacks = await deps.listWorkpacks?.() || [];
  if (!workpacks.length) { deps.showToast?.('No Workpacks available.', 'warning'); return; }
  const select = node('select', 'input');
  select.append(new Option('Select a Workpack', ''));
  workpacks.forEach((workpack) => select.append(new Option(`${workpack.wpNo || workpack.id} — ${workpack.title || ''}`, workpack.id)));
  openModal({ title: 'Import materials from Workpack', body: select, buttons: [{ label: 'Cancel' }, { label: 'Import', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
    const workpack = workpacks.find((item) => item.id === select.value);
    if (!workpack) { deps.showToast?.('Select a Workpack.', 'error'); return; }
    const inventory = await deps.listInventoryItems?.() || [];
    const mtoItems = await deps.listMtoItems?.() || [];
    const workpackLinks = await deps.listWorkpackLinks?.() || [];
    const ids = new Set(workpackRelationIds(workpack, workpackLinks, WORKPACK_RELATION_TYPES.INVENTORY_ITEM));
    const items = inventory.filter((item) => ids.has(item.id) || ids.has(item.trace) || ids.has(item.traceability));
    const linkedMtoIds = new Set(workpackRelationIds(workpack, workpackLinks, WORKPACK_RELATION_TYPES.MTO_ITEM));
    const linkedMto = mtoItems.filter((item) => linkedMtoIds.has(item.id));
    const equipment = workpack.equipmentName || linkedMto.find((item) => item.equipmentName)?.equipmentName || '';
    const coupon = managerState.draft || newCoupon();
    coupon.links.workpackId = workpack.id;
    coupon.header.workpack = workpack.wpNo || workpack.title || workpack.id;
    coupon.header.scope = equipment || coupon.header.scope;
    coupon.lines = items.map((item, index) => inventoryLineToCouponLine(item, index, { equipment }));
    managerState.draft = coupon;
    closeModal();
    renderMaterialCouponManager(managerState);
    deps.showToast?.(`${items.length} material line(s) imported from Workpack.`, 'success');
  } }] });
}

async function linkSelectedWorkpack() {
  const coupon = selectedCoupon();
  if (!coupon || !canEdit(coupon)) { deps.showToast?.('Only draft coupons can be linked to a Workpack.', 'warning'); return; }
  const workpacks = await deps.listWorkpacks?.() || [];
  if (!workpacks.length) { deps.showToast?.('No Workpacks available.', 'warning'); return; }
  const select = node('select', 'input'); select.append(new Option('Select a Workpack', ''));
  workpacks.forEach((workpack) => select.append(new Option(`${workpack.wpNo || workpack.id} — ${workpack.title || ''}`, workpack.id)));
  select.value = coupon.links.workpackId || '';
  openModal({ title: 'Link Material Coupon to Workpack', body: select, buttons: [{ label: 'Cancel' }, { label: 'Link', variant: 'btn-primary', closeOnClick: false, onClick: () => {
    const workpack = workpacks.find((item) => item.id === select.value); if (!workpack) return;
    coupon.links.workpackId = workpack.id; coupon.header.workpack = workpack.wpNo || workpack.title || workpack.id;
    managerState.draft = coupon; closeModal(); renderMaterialCouponManager(managerState); deps.showToast?.('Workpack linked. Save the coupon to persist the link.', 'success');
  } }] });
}

async function loadCoupons() {
  const [coupons, projects, workpacks, cuttingSheets, equipments, mtoItems, drawings, returnMaterialVouchers, inventoryItems, auditEvents, workpackLinks] = await Promise.all([
    deps.listCoupons?.() || [],
    deps.listProjects?.() || [],
    deps.listWorkpacks?.() || [],
    deps.listCuttingSheets?.() || [],
    deps.listEquipments?.() || [],
    deps.listMtoItems?.() || [],
    deps.listDrawings?.() || [],
    deps.listReturnMaterialVouchers?.() || [],
    deps.listInventoryItems?.() || [],
    deps.listAuditEvents?.() || [],
    deps.listWorkpackLinks?.() || [],
  ]);
  managerState.coupons = coupons;
  managerState.projects = projects;
  managerState.workpacks = workpacks;
  managerState.cuttingSheets = cuttingSheets;
  managerState.equipments = equipments;
  managerState.mtoItems = mtoItems;
  managerState.controlData = { drawings, returnMaterialVouchers, inventoryItems, auditEvents, workpackLinks };
  const couponIds = new Set(coupons.map((coupon) => coupon.id));
  managerState.selectedListIds = new Set([...managerState.selectedListIds].filter((id) => couponIds.has(id)));
  if (managerState.selectedId && !managerState.coupons.some((coupon) => coupon.id === managerState.selectedId)) {
    managerState.selectedId = '';
    managerState.draft = null;
  }
  renderMaterialCouponManager(managerState);
}

async function saveDraft({ issue = false } = {}) {
  if (managerState.busy) return null;
  const coupon = readDraftFromDom();
  if (issue) {
    if (!canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.ISSUE)) {
      deps.showToast?.('Only a draft coupon can be issued.', 'error');
      return null;
    }
    const validation = validateForIssue(coupon);
    if (!validation.valid) {
      deps.showToast?.(validation.errors[0] || 'Coupon has blocking errors.', 'error');
      return null;
    }
    if (validation.warnings.length) deps.showToast?.(`${validation.warnings.length} warning(s) found.`, 'warning');
  }

  managerState.busy = true;
  managerState.busyAction = issue ? 'issue' : 'save';
  renderMaterialCouponManager(managerState);
  try {
    let saved;
    if (issue) {
      const workpackId = text(coupon.links?.workpackId);
      const [inventoryItems, mtoItems, allocations, workpackLinks] = await Promise.all([
        deps.listInventoryItems?.() || [],
        deps.listMtoItems?.() || [],
        deps.listMtoPoItemAllocations?.() || [],
        deps.listWorkpackLinks?.() || [],
      ]);
      const workpack = managerState.workpacks.find((item) => text(item.id) === workpackId)
        || (workpackId ? await deps.getWorkpack?.(workpackId) : null)
        || {};
      const linkage = linkMaterialCouponLinesToMto({
        lines: coupon.lines,
        inventoryItems,
        mtoItems,
        allocations,
        workpack,
        workpackLinks,
        projectId: resolveProjectId(managerState.projects, coupon.header.project) || coupon.projectId,
      });
      coupon.lines = linkage.lines;
      if (linkage.ambiguousCount || linkage.unresolvedCount) {
        deps.showToast?.(
          `${linkage.ambiguousCount + linkage.unresolvedCount} material line(s) could not be linked safely to an MTO/TAG and will remain unassigned.`,
          'warning',
        );
      }
      const prepared = prepareMaterialCouponIssue(coupon.lines, inventoryItems);
      if (!prepared.valid) {
        deps.showToast?.(reservationErrorMessage(prepared.errors[0]), 'error');
        return null;
      }
      // The transaction revalidates this plan against its own current snapshot before writing.
      saved = await deps.issueCoupon?.(toRecord({ ...coupon, status: STATUS.DRAFT }), prepared.reservations);
      if (saved?.__splitCount) {
        deps.showToast?.(`${saved.__splitCount} line(s) split — remainder returned to stock as new inventory record(s).`, 'success');
      }
    } else {
      saved = await deps.saveCoupon?.(toRecord(coupon));
    }
    if (!saved?.__auditCommitted) {
      await deps.createAuditEntry?.(issue ? 'MATERIAL_COUPON_ISSUED' : 'MATERIAL_COUPON_SAVED', saved);
    }
    managerState.selectedId = saved.id;
    managerState.draft = fromRecord(saved);
    await loadCoupons();
    if (notifyGeneratedCouponSaved) {
      const notify = notifyGeneratedCouponSaved;
      notifyGeneratedCouponSaved = null;
      try {
        await notify(saved);
      } catch (error) {
        console.error(error);
        deps.showToast?.('Material Coupon salvo, mas não foi possível vinculá-lo ao Cutting Sheet atual.', 'warning');
      }
    }
    deps.showToast?.(issue ? 'Material Coupon issued.' : 'Draft saved.', 'success');
    return saved;
  } catch (error) {
    console.error(error);
    deps.showToast?.(issue ? materialCouponIssueErrorMessage(error) : (error.message || 'Could not save the Material Coupon.'), 'error');
    return null;
  } finally {
    managerState.busy = false;
    managerState.busyAction = '';
    renderMaterialCouponManager(managerState);
  }
}

function input(label, key, value, type = 'text') {
  const wrap = node('label', 'mc-field');
  const span = node('span', null, label);
  const control = node(type === 'textarea' ? 'textarea' : 'input');
  control.dataset.mcField = key;
  if (type !== 'textarea') control.type = type;
  control.value = value || '';
  control.disabled = !canEdit(selectedCoupon());
  control.addEventListener('input', () => {
    readDraftFromDom();
    renderWorkspaceTitle();
  });
  wrap.append(span, control);
  return wrap;
}

function automaticInput(label, key, value) {
  const field = input(label, key, value);
  const control = field.querySelector('input');
  control.readOnly = true;
  control.classList.add('mc-automatic-input');
  control.title = 'Preenchido automaticamente pelo projeto ativo';
  return field;
}

function assistedInput(label, key, value, listId) {
  const field = input(label, key, value);
  field.querySelector('input')?.setAttribute('list', listId);
  return field;
}

function projectForInput(value) {
  const query = text(value).toLowerCase();
  return managerState.projects.find((project) => [project.name, project.code, project.shortCode]
    .some((candidate) => text(candidate).toLowerCase() === query)) || null;
}

function workpackForInput(value) {
  const query = text(value).toLowerCase();
  return managerState.workpacks.find((workpack) => [workpack.id, workpack.wpNo, workpack.title]
    .some((candidate) => text(candidate).toLowerCase() === query)) || null;
}

function optionsList(id, records, valueFor, labelFor) {
  const list = node('datalist');
  list.id = id;
  records.forEach((record) => {
    const value = text(valueFor(record));
    if (!value) return;
    const option = node('option');
    option.value = value;
    option.label = text(labelFor(record));
    list.append(option);
  });
  return list;
}

function lineInput(line, index, key, type = 'text') {
  const control = node('input', `planner-cell-editor${type === 'number' ? ' planner-cell-editor--number' : ''}`);
  control.type = type;
  control.dataset.key = key;
  control.value = line[key] || '';
  control.disabled = !canEdit(selectedCoupon());
  control.addEventListener('input', () => {
    const coupon = selectedCoupon();
    coupon.lines[index][key] = control.value;
    managerState.draft = coupon;
  });
  return control;
}

function renderWorkspaceTitle() {
  const coupon = selectedCoupon();
  el('mc-workspace-title').textContent = coupon ? (coupon.header.mcCode || 'New Material Coupon') : 'No coupon selected';
  el('mc-workspace-subtitle').textContent = coupon
    ? `${coupon.status} · ${coupon.header.project || 'No project'} · ${coupon.lines.length} line(s)`
    : 'Create or select a Material Coupon.';
}

function clearPanels() {
  ['header', 'materials', 'signatures', 'notes', 'preview', 'history'].forEach((tab) => {
    el(`mc-tab-${tab}`)?.replaceChildren();
  });
}

function renderLegacyMaterialCouponList(coupons = [], selectedId = null) {
  const container = el('material-coupon-list');
  if (!container) return;
  const items = filteredCoupons();
  if (!items.length) {
    container.replaceChildren(node('p', 'text-muted', 'No Material Coupons found.'));
    return;
  }

  container.replaceChildren(...items.map((record) => {
    const coupon = fromRecord(record);
    const button = node('button', `mc-list-item${record.id === selectedId ? ' active' : ''}`);
    button.type = 'button';
    button.addEventListener('click', async () => {
      managerState.selectedId = record.id;
      managerState.draft = fromRecord(await deps.getCoupon?.(record.id) || record);
      managerState.activeTab = 'header';
      renderMaterialCouponManager(managerState);
    });
    const top = node('div', 'mc-list-item-top');
    top.append(node('strong', null, coupon.header.mcCode || 'Untitled MC'), statusPill(coupon.status));
    button.append(
      top,
      node('span', null, coupon.header.project || 'No project'),
      node('small', null, `${coupon.header.destination || 'No destination'} · ${coupon.lines.length} line(s)`),
      node('small', null, coupon.updatedAt ? `Updated ${coupon.updatedAt.slice(0, 10)}` : ''),
    );
    return button;
  }));
}

function statusPill(status) {
  return node('span', `mc-status-badge mc-status-${text(status).toLowerCase().replaceAll('_', '-')}`, text(status).replaceAll('_', ' '));
}

export function renderMaterialCouponList(coupons = [], selectedId = null) {
  const container = el('material-coupon-list');
  if (!container) return;
  populateListFilterOptions(coupons);
  const items = filteredCoupons();
  if (!items.length) {
    const empty = node('p', 'mc-list-empty text-muted', 'No Material Coupons found.');
    const actionBar = renderMaterialCouponBulkActionBar();
    container.replaceChildren(...[empty, actionBar].filter(Boolean));
    return;
  }
  const pageCount = Math.max(1, Math.ceil(items.length / managerState.listPageSize));
  managerState.listPage = Math.min(managerState.listPage, pageCount);
  const start = (managerState.listPage - 1) * managerState.listPageSize;
  const wrap = node('div', 'mc-list-table-wrap');
  const table = node('table', 'data-table mc-list-table');
  table.append(tableColgroup([52, 200, 130, 210, 180, 120, 80, 180, 150, 96]));
  const thead = node('thead'); const head = node('tr'); const selectHead = node('th');
  const selectableItems = items.filter((record) => canMaterialCouponAction(fromRecord(record), MATERIAL_COUPON_ACTIONS.DELETE));
  const selectAll = node('input'); selectAll.type = 'checkbox'; selectAll.setAttribute('aria-label', 'Select all filtered coupons');
  selectAll.disabled = !selectableItems.length;
  selectAll.checked = selectableItems.length > 0 && selectableItems.every((record) => managerState.selectedListIds.has(record.id));
  selectAll.indeterminate = !selectAll.checked && selectableItems.some((record) => managerState.selectedListIds.has(record.id));
  selectAll.addEventListener('change', () => { selectableItems.forEach((record) => selectAll.checked ? managerState.selectedListIds.add(record.id) : managerState.selectedListIds.delete(record.id)); renderMaterialCouponList(coupons, selectedId); }); selectHead.append(selectAll);
  head.append(selectHead, ...['Coupon Code', 'Status', 'Project', 'Destination', 'Workpack', 'Lines', 'Created by', 'Last Updated', 'Actions'].map((label) => node('th', null, label))); thead.append(head);
  const tbody = node('tbody');
  items.slice(start, start + managerState.listPageSize).forEach((record) => {
    const coupon = fromRecord(record); const row = node('tr', record.id === selectedId ? 'is-selected' : '');
    const checkCell = node('td'); const check = node('input'); check.type = 'checkbox'; check.checked = managerState.selectedListIds.has(record.id); check.disabled = !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.DELETE); check.title = check.disabled ? 'Only draft or cancelled coupons can be deleted' : ''; check.setAttribute('aria-label', `Select ${coupon.header.mcCode}`); check.addEventListener('change', () => { if (check.checked) managerState.selectedListIds.add(record.id); else managerState.selectedListIds.delete(record.id); renderMaterialCouponList(coupons, selectedId); }); checkCell.append(check);
    const codeCell = node('td'); const code = node('button', 'mc-code-link', coupon.header.mcCode || 'Untitled MC'); code.type = 'button';
    code.addEventListener('click', async () => { managerState.selectedId = record.id; managerState.draft = fromRecord(await deps.getCoupon?.(record.id) || record); managerState.activeTab = 'header'; managerState.editorOpen = true; renderMaterialCouponManager(managerState); }); codeCell.append(code);
    const actions = node('td', 'mc-row-actions'); const more = node('button', 'mc-row-more'); more.type = 'button'; more.title = 'Open coupon actions'; more.setAttribute('aria-label', `Open actions for ${coupon.header.mcCode}`); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false'); more.append(node('span', 'material-symbols-outlined', 'more_horiz')); more.addEventListener('click', (event) => { event.stopPropagation(); openRowActions(actions, record, coupon, more); }); actions.append(more);
    const workpack = managerState.workpacks.find((item) => item.id === (coupon.links?.workpackId || record.workpackId));
    const workpackLabel = workpack?.wpNo || workpack?.title || coupon.header.workpack || '—';
    const workpackCell = node('td', workpackLabel === '—' ? 'text-muted' : '', workpackLabel);
    row.append(
      checkCell,
      codeCell,
      td(statusPill(couponListStatus(coupon))),
      node('td', null, coupon.header.project || '—'),
      node('td', null, coupon.header.destination || '—'),
      workpackCell,
      node('td', 'mc-numeric-cell', String(coupon.lines.length)),
      node('td', coupon.createdByName ? '' : 'text-muted', coupon.createdByName || '—'),
      node('td', null, formatListDate(coupon.updatedAt)),
      actions,
    );
    tbody.append(row);
  });
  table.append(thead, tbody); wrap.append(table);
  const footer = node('div', 'mc-list-pagination'); footer.append(node('span', 'text-muted', `Showing ${start + 1} to ${Math.min(start + managerState.listPageSize, items.length)} of ${items.length} entries`));
  const pages = node('div', 'mc-page-buttons');
  for (let page = 1; page <= pageCount; page += 1) pages.append(button(String(page), `mc-page-button${page === managerState.listPage ? ' active' : ''}`, () => { managerState.listPage = page; renderMaterialCouponList(coupons, selectedId); }));
  footer.append(pages);
  const actionBar = renderMaterialCouponBulkActionBar();
  container.replaceChildren(...[wrap, footer, actionBar].filter(Boolean));
}

function renderMaterialCouponBulkActionBar() {
  const count = managerState.selectedListIds.size;
  if (!count) return null;
  const bar = node('div', 'mc-list-selection-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Selected Material Coupon actions');
  const summary = node('strong', null, `${count} coupon${count === 1 ? '' : 's'} selected`);
  const remove = button('Delete selected', 'btn btn-critical', confirmDeleteSelectedCoupons);
  remove.prepend(node('span', 'material-symbols-outlined', 'delete'));
  remove.disabled = managerState.busy;
  bar.append(summary, remove);
  return bar;
}

function confirmDeleteSelectedCoupons() {
  const records = managerState.coupons.filter((record) => managerState.selectedListIds.has(record.id)
    && canMaterialCouponAction(fromRecord(record), MATERIAL_COUPON_ACTIONS.DELETE));
  const ids = records.map((record) => record.id);
  if (!ids.length) return;
  const body = node('div', 'mc-bulk-delete-confirmation');
  body.append(
    node('p', null, `${ids.length} Material Coupon${ids.length === 1 ? '' : 's'} will be permanently deleted.`),
    node('p', 'text-muted', 'This action cannot be undone.'),
  );
  openModal({
    title: 'Delete selected coupons',
    body,
    buttons: [
      { label: 'Cancel', variant: 'btn-ghost' },
      {
        label: `Delete ${ids.length}`,
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          managerState.busy = true;
          renderMaterialCouponList(managerState.coupons, managerState.selectedId);
          try {
            if (typeof deps.deleteCoupons === 'function') await deps.deleteCoupons(ids);
            else await Promise.all(ids.map((id) => deps.deleteCoupon?.(id)));
            managerState.selectedListIds.clear();
            if (ids.includes(managerState.selectedId)) {
              managerState.selectedId = '';
              managerState.draft = null;
              managerState.editorOpen = false;
            }
            closeModal();
            await loadCoupons();
            deps.showToast?.(`${ids.length} Material Coupon${ids.length === 1 ? '' : 's'} deleted.`, 'success');
          } catch (error) {
            console.error(error);
            deps.showToast?.('Could not delete the selected Material Coupons.', 'error');
            await loadCoupons();
          } finally {
            managerState.busy = false;
            renderMaterialCouponManager(managerState);
          }
        },
      },
    ],
  });
}

function tableColgroup(widths) {
  const group = node('colgroup', 'planner-column-widths');
  widths.forEach((width) => { const col = node('col'); col.style.width = `${width}px`; group.append(col); });
  return group;
}

function formatListDate(value) { const date = validDate(value); return date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date) : '—'; }

function openRowActions(cell, record, coupon, trigger) {
  closeActiveRowActions?.();
  const menu = node('div', 'mc-overflow-menu mc-row-context-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Actions for ${coupon.header.mcCode}`);
  const action = (label, icon, handler, className = '') => { const item = node('button', className); item.type = 'button'; item.setAttribute('role', 'menuitem'); item.append(node('span', 'material-symbols-outlined', icon), node('span', null, label)); item.addEventListener('click', async () => { managerState.selectedId = record.id; managerState.draft = fromRecord(await deps.getCoupon?.(record.id) || record); close(); await handler(); }); return item; };
  menu.append(
    action('Duplicate', 'content_copy', duplicateSelected),
    action('Refresh Local', 'refresh', loadCoupons),
    action('Link Workpack', 'workspaces', linkSelectedWorkpack),
    node('div', 'mc-overflow-divider'),
    action('Export Extract', 'csv', exportExtract),
    action('Export Excel', 'table_view', exportExcel),
    action('Configure Template', 'settings_applications', () => el('btn-configure-material-coupon-template')?.click()),
    action('Delete Coupon', 'delete', deleteSelectedCoupon, 'mc-menu-danger'),
  );
  const deleteItem = menu.querySelector('.mc-menu-danger'); deleteItem.disabled = !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.DELETE);
  const close = ({ restoreFocus = false } = {}) => {
    menu.remove(); trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', handleOutsidePointer, true);
    document.removeEventListener('keydown', handleEscape, true);
    window.removeEventListener('scroll', handleScroll, true);
    if (closeActiveRowActions === close) closeActiveRowActions = null;
    if (restoreFocus) trigger.focus();
  };
  const handleOutsidePointer = (event) => { if (!menu.contains(event.target) && event.target !== trigger) close(); };
  const handleEscape = (event) => { if (event.key === 'Escape') { event.preventDefault(); close({ restoreFocus: true }); } };
  const handleScroll = () => close();
  const rect = trigger.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`; menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  trigger.setAttribute('aria-expanded', 'true'); document.body.append(menu); closeActiveRowActions = close;
  document.addEventListener('pointerdown', handleOutsidePointer, true);
  document.addEventListener('keydown', handleEscape, true);
  window.addEventListener('scroll', handleScroll, true);
  menu.querySelector('button:not(:disabled)')?.focus();
}

function populateListFilterOptions(records) {
  const coupons = records.map(fromRecord);
  const setOptions = (id, values, selected, { sort = true, label = (value) => value } = {}) => { const select = el(id); if (!select) return; const first = select.options[0]?.cloneNode(true) || new Option('All', ''); const uniqueValues = [...new Set(values.filter(Boolean))]; if (sort) uniqueValues.sort(); select.replaceChildren(first, ...uniqueValues.map((value) => new Option(label(value), value))); select.value = selected; };
  setOptions('mc-status-filter', Object.values(STATUS), managerState.statusFilter, { sort: false, label: (value) => value.replaceAll('_', ' ') });
  setOptions('mc-project-filter', coupons.map((coupon) => coupon.header.project), managerState.listFilters.project);
  setOptions('mc-destination-filter', coupons.map((coupon) => coupon.header.destination), managerState.listFilters.destination);
  setOptions('mc-material-filter', coupons.flatMap((coupon) => coupon.lines.map((line) => text(line.materialDescription))), managerState.listFilters.material);
  setOptions('mc-type-filter', coupons.flatMap((coupon) => coupon.lines.map((line) => text(line.itemType))), managerState.listFilters.itemType);
}

export function renderMaterialCouponHeader(coupon = {}) {
  const panel = el('mc-tab-header');
  if (!panel || !coupon) return;
  const grid = node('div', 'mc-form-grid');
  const identity = fieldGroup('ID Information', [
    input('MC Code', 'mcCode', coupon.header.mcCode),
    input('Revision', 'revision', coupon.header.revision),
    input('Date', 'date', coupon.header.date, 'date'),
  ]);
  const hasActiveProject = Boolean(text(deps.initialData?.project));
  const projectField = hasActiveProject
    ? automaticInput('Project', 'project', coupon.header.project)
    : assistedInput('Project', 'project', coupon.header.project, 'mc-project-options');
  const clientField = hasActiveProject
    ? automaticInput('Client', 'client', coupon.header.client)
    : input('Client', 'client', coupon.header.client);
  const workpackField = assistedInput('Workpack', 'workpack', coupon.header.workpack, 'mc-workpack-options');
  const cuttingSheetField = node('label', 'mc-field');
  const cuttingSheetControl = node('select');
  cuttingSheetControl.dataset.mcField = 'cuttingSheetId';
  cuttingSheetControl.disabled = !canEdit(coupon);
  cuttingSheetControl.append(
    new Option('No Cutting Sheet linked', ''),
    ...managerState.cuttingSheets.map((sheet) => new Option(
      [sheet.number || sheet.id, text(sheet.status).toUpperCase()].filter(Boolean).join(' — '),
      sheet.id,
    )),
  );
  cuttingSheetControl.value = coupon.links?.cuttingSheetId || '';
  cuttingSheetField.append(node('span', null, 'Cutting Sheet'), cuttingSheetControl);
  const projectControl = projectField.querySelector('input');
  const workpackControl = workpackField.querySelector('input');
  const renderedProject = text(coupon.header.project);
  projectControl?.addEventListener('change', () => {
    const selectedProject = projectForInput(projectControl.value);
    if (!selectedProject) return;
    coupon.header.project = selectedProject.name;
    coupon.header.client = selectedProject.client || '';
    projectControl.value = coupon.header.project;
    const clientControl = panel.querySelector('[data-mc-field="client"]');
    if (clientControl) clientControl.value = coupon.header.client;
    const changedProject = renderedProject.toLowerCase() !== selectedProject.name.toLowerCase();
    if (changedProject && (!coupon.header.mcCode || isGeneratedMaterialCouponCode(coupon.header.mcCode))) {
      coupon.header.mcCode = nextMaterialCouponCode(selectedProject.shortCode, managerState.coupons);
      const codeControl = panel.querySelector('[data-mc-field="mcCode"]');
      if (codeControl) codeControl.value = coupon.header.mcCode;
    }
    managerState.draft = coupon;
    renderWorkspaceTitle();
  });
  workpackControl?.addEventListener('change', () => {
    const selectedWorkpack = workpackForInput(workpackControl.value);
    coupon.links.workpackId = selectedWorkpack?.id || '';
    coupon.header.workpack = selectedWorkpack
      ? (selectedWorkpack.wpNo || selectedWorkpack.title || selectedWorkpack.id)
      : workpackControl.value;
    workpackControl.value = coupon.header.workpack;
    managerState.draft = coupon;
  });
  cuttingSheetControl.addEventListener('change', async () => {
    const selectedCuttingSheet = managerState.cuttingSheets.find((item) => item.id === cuttingSheetControl.value) || null;
    coupon.links.cuttingSheetId = selectedCuttingSheet?.id || '';
    coupon.links.cuttingSheetPieceIds = [];
    coupon.linkedCuttingSheetPieces = [];
    coupon.header.reference = await buildCurrentMaterialCouponReference(coupon, selectedCuttingSheet ? [selectedCuttingSheet] : []);
    managerState.draft = coupon;
    renderMaterialCouponNotes(coupon);
    deps.showToast?.(selectedCuttingSheet
      ? 'Cutting Sheet linked. Save the coupon to persist the link.'
      : 'Cutting Sheet link removed. Save the coupon to persist the change.', 'success');
  });
  const project = fieldGroup('Project / Destination', [
    projectField,
    clientField,
    input('Scope', 'scope', coupon.header.scope),
    workpackField,
    cuttingSheetField,
    input('Destination', 'destination', coupon.header.destination),
  ]);
  const attribution = fieldGroup('Attribution', [
    automaticInput('Created by', 'createdByName', coupon.createdByName || '—'),
    automaticInput('Created at', 'createdAt', formatListDate(coupon.createdAt)),
  ]);
  grid.append(identity, project, attribution);
  panel.replaceChildren(
    grid,
    optionsList('mc-project-options', managerState.projects, (item) => item.name, (item) => [item.shortCode, item.client].filter(Boolean).join(' — ')),
    optionsList('mc-workpack-options', managerState.workpacks, (item) => item.wpNo || item.title || item.id, (item) => item.title || item.projectId),
  );
}

function fieldGroup(title, children) {
  const group = node('section', 'mc-field-group');
  const heading = node('h3'); heading.append(node('span', 'material-symbols-outlined', groupIcon(title)), node('span', null, title));
  group.append(heading, ...children);
  return group;
}

function groupIcon(title) {
  if (title.includes('ID')) return 'badge';
  if (title.includes('Project')) return 'business_center';
  if (title.includes('Document') || title.includes('Reference')) return 'description';
  if (title.includes('Responsible') || title.includes('Signature')) return 'draw';
  return 'notes';
}

export function renderMaterialCouponMaterials(coupon = {}) {
  const panel = el('mc-tab-materials');
  if (!panel || !coupon) return;
  const previousScrollLeft = panel.querySelector('.mc-materials-table-wrap')?.scrollLeft || 0;
  const projectId = resolveProjectId(managerState.projects, coupon.header?.project) || coupon.projectId || '';
  coupon.lines = linkMaterialCouponLinesToEquipmentTags({
    lines: coupon.lines,
    mtoItems: managerState.mtoItems,
    equipments: managerState.equipments,
    projectId,
  }).lines;
  const equipmentTagOptions = materialCouponEquipmentTagOptions(managerState.equipments, projectId);
  const count = el('mc-materials-tab-count');
  if (count) count.textContent = String(coupon.lines.length);
  const toolbar = node('div', 'mc-materials-toolbar');
  const add = button('Add Row', 'btn btn-primary', () => {
    coupon.lines.push({ ...emptyLine(coupon.lines.length + 1), manualLine: true });
    managerState.draft = coupon;
    renderMaterialCouponMaterials(coupon);
  });
  const importActions = node('div', 'mc-import-actions');
  const importInventory = button('Inventory Selection', 'btn btn-secondary', importFromInventorySelection);
  const importExcel = button('Import Excel', 'btn btn-secondary', importMaterialRowsFromExcel);
  const editable = canEdit(selectedCoupon());
  add.disabled = !editable;
  importInventory.disabled = !editable;
  importExcel.disabled = !editable;
  importActions.append(importExcel, importInventory);
  const countLabel = node('strong', 'mc-material-total', `${coupon.lines.length} Items Total`);
  toolbar.append(countLabel, importActions, add);

  const wrap = node('div', 'table-wrap mc-materials-table-wrap');
  const table = node('table', 'data-table planner-data-table');
  table.append(tableColgroup([64, 104, 112, 300, 72, 64, 92, 104, 92, 104, 96, 120, 140, 110, 104, 160, 190, 112, 104, 112, 220, 72]));
  const head = node('tr');
  ['S/N', 'SAP Code', 'Item Type', 'Material Description', 'Qty', 'Un', 'Dia [mm]', 'Thickness [mm]', 'Width [mm]', 'Length [mm]', 'Weight [Kg]', 'Mat. Grade', 'Traceability', 'Heat No.', 'MIR', 'Equipment', 'Equipment TAG', 'PO', 'PO Item', 'NF Arrival', 'Notes', 'Actions']
    .forEach((label) => head.append(node('th', null, label)));
  const thead = node('thead');
  thead.append(head);
  const tbody = node('tbody');
  coupon.lines.forEach((line, index) => {
    const row = node('tr', 'planner-data-row');
    row.append(
      lineCell(line, index, 'serialNumber'),
      lineCell(line, index, 'sapCode'),
      lineCell(line, index, 'itemType'),
      lineCell(line, index, 'materialDescription'),
      lineCell(line, index, 'qty', 'number'),
      lineCell(line, index, 'unit'),
      lineCell(line, index, 'diaMm', 'number'),
      lineCell(line, index, 'thicknessMm', 'number'),
      lineCell(line, index, 'widthMm', 'number'),
      lineCell(line, index, 'lengthMm', 'number'),
      lineCell(line, index, 'weightKg', 'number'),
      lineCell(line, index, 'materialGrade'),
      lineCell(line, index, 'traceability'),
      lineCell(line, index, 'heatNo'),
      lineCell(line, index, 'mir'),
      lineCell(line, index, 'equipment'),
      equipmentTagCell(line, equipmentTagOptions),
      lineCell(line, index, 'po'),
      lineCell(line, index, 'poItem'),
      lineCell(line, index, 'nfArrival'),
      lineCell(line, index, 'notes'),
      lineActions(coupon, index),
    );
    tbody.append(row);
  });
  if (!coupon.lines.length) {
    const row = node('tr');
    const empty = node('td', 'text-muted', 'No material lines. Use Add Line to start.');
    empty.colSpan = 22;
    row.append(empty);
    tbody.append(row);
  }
  table.append(thead, tbody);
  wrap.append(table);
  panel.replaceChildren(toolbar, wrap);
  wrap.scrollLeft = Math.min(previousScrollLeft, Math.max(0, wrap.scrollWidth - wrap.clientWidth));
}

function equipmentTagCell(line, options = []) {
  const cell = node('td', 'mc-equipment-tag-cell');
  const select = node('select', 'planner-cell-editor');
  select.setAttribute('aria-label', `Equipment TAG da linha ${line.serialNumber || ''}`);
  select.append(new Option('Selecionar TAG...', ''));
  const knownTags = new Set(options.map((option) => option.tag));
  if (line.tag && !knownTags.has(line.tag)) select.append(new Option(`${line.tag} — TAG não cadastrada`, line.tag));
  options.forEach((option) => select.append(new Option(`${option.tag} — ${option.equipment || 'Equipment'}`, option.tag)));
  select.value = line.tag || '';
  select.disabled = !canEdit(selectedCoupon());
  select.addEventListener('change', () => {
    const selected = options.find((option) => option.tag === select.value);
    line.tag = select.value;
    line.equipmentId = selected?.equipmentId || '';
    line.equipment = selected?.equipment || line.equipment || '';
    line.equipmentTagLinkMethod = 'MANUAL';
    managerState.draft = selectedCoupon();
  });
  cell.dataset.column = 'tag';
  cell.append(select);
  return cell;
}

function lineActions(coupon, index) {
  const actions = node('td', 'row-actions planner-row-actions');
  const duplicate = button('', 'planner-row-action btn-copy', () => {
    const source = coupon.lines[index];
    coupon.lines.splice(index + 1, 0, { ...source });
    normalizeLineSerials(coupon.lines);
    managerState.draft = coupon;
    renderMaterialCouponMaterials(coupon);
  });
  duplicate.title = 'Duplicate line';
  duplicate.setAttribute('aria-label', 'Duplicate line');
  duplicate.append(node('span', 'material-symbols-outlined', 'content_copy'));

  const remove = button('', 'planner-row-action btn-remove', () => {
    coupon.lines.splice(index, 1);
    normalizeLineSerials(coupon.lines);
    managerState.draft = coupon;
    renderMaterialCouponMaterials(coupon);
  });
  remove.title = 'Remove line';
  remove.setAttribute('aria-label', 'Remove line');
  remove.append(node('span', 'material-symbols-outlined', 'delete'));

  const editable = canEdit(selectedCoupon());
  duplicate.disabled = !editable;
  remove.disabled = !editable;
  actions.append(duplicate, remove);
  return actions;
}

function lineCell(line, index, key, type = 'text') {
  const cell = td(lineInput(line, index, key, type));
  cell.dataset.column = key;
  return cell;
}

function normalizeLineSerials(lines) {
  lines.forEach((line, index) => {
    line.serialNumber = String(index + 1);
  });
}

function emptyLine(serialNumber) {
  return {
    serialNumber: String(serialNumber),
    sapCode: '',
    itemType: '',
    materialDescription: '',
    qty: '1',
    unit: 'EA',
    diaMm: '',
    thicknessMm: '',
    widthMm: '',
    lengthMm: '',
    weightKg: '',
    materialGrade: '',
    traceability: '',
    heatNo: '',
    mir: '',
    equipment: '',
    poItem: '',
    po: '',
    statusMaterial: '',
    notes: '',
  };
}

function selectionList(items, labelFor) {
  const list = node('div', 'mc-selection-list');
  items.forEach((item) => {
    const label = node('label', 'mc-selection-item');
    const input = node('input');
    input.type = 'checkbox';
    input.value = item.id || item.trace || item.traceability || '';
    label.append(input, node('span', null, labelFor(item)));
    list.append(label);
  });
  return list;
}

async function importFromInventorySelection() {
  if (!deps.openInventorySelector) { deps.showToast?.('Inventory selector is unavailable.', 'warning'); return; }
  const inventory = await deps.listInventoryItems?.() || [];
  const unavailableIds = inventory
    .filter((item) => Number(item.balanceQty ?? item.qty) <= 0 || Number(item.reservedQty || 0) > 0 || !['available', 'returned', '', 'n/a'].includes(text(item.status).toLowerCase()))
    .map((item) => item.trace || item.traceability || item.id)
    .filter(Boolean);
  deps.openInventorySelector({
    mode: 'select',
    unavailableIds,
    onConfirm: (selected) => {
      const coupon = managerState.draft || newCoupon();
      coupon.lines.push(...selected.map((item, index) => inventoryLineToCouponLine(item, coupon.lines.length + index)));
      normalizeLineSerials(coupon.lines);
      managerState.draft = coupon;
      closeModal();
      renderMaterialCouponManager(managerState);
      deps.showToast?.(`${selected.length} Inventory item(s) imported.`, 'success');
    },
  });
}

function mtoLineToCouponLine(item = {}, index = 0) {
  return { ...emptyLine(index + 1), manualLine: true, mtoItemId: item.id || '', mtoLinkMethod: 'MANUAL', identCode: item.identCode || item.material || '', tag: item.tag || item.clientTag || '', equipmentId: item.equipmentId || '', sapCode: item.sapCode || item.identCode || item.material || '', itemType: item.itemType || item.category || '', materialDescription: item.materialDescription || item.description || '', qty: item.qty || item.quantity || '1', unit: item.unit || item.uom || 'EA', diaMm: item.diaMm || item.diameter || '', thicknessMm: item.thicknessMm || item.thickness || '', widthMm: item.widthMm || item.width || '', lengthMm: item.cutLength || item.length || '', materialGrade: item.materialGrade || '', equipment: item.equipmentName || item.equipment || '', notes: `MTO ${item.itemNo || item.id || ''}` };
}

async function importFromMtoSelection() {
  const items = await deps.listMtoItems?.() || [];
  if (!items.length) { deps.showToast?.('No MTO items available.', 'warning'); return; }
  const list = selectionList(items, (item) => `${item.itemNo || item.id} · ${item.materialDescription || item.description || item.material || ''}`);
  openModal({ title: 'Import from MTO', body: list, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Import Selected', variant: 'btn-primary', closeOnClick: false, onClick: () => {
    const ids = new Set([...list.querySelectorAll('input:checked')].map((input) => input.value));
    const selected = items.filter((item) => ids.has(item.id)); const coupon = managerState.draft || newCoupon();
    coupon.lines.push(...selected.map((item, index) => mtoLineToCouponLine(item, coupon.lines.length + index)));
    normalizeLineSerials(coupon.lines); managerState.draft = coupon; closeModal(); renderMaterialCouponManager(managerState);
    deps.showToast?.(`${selected.length} MTO item(s) imported as manual lines.`, 'success');
  } }] });
}

async function importMaterialRowsFromExcel() {
  if (!deps.readExcelFile) { deps.showToast?.('Excel import is unavailable.', 'warning'); return; }
  const picker = node('input'); picker.type = 'file'; picker.accept = '.xlsx,.xls,.csv';
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0]; if (!file) return;
    try {
      const rows = await deps.readExcelFile(file);
      const coupon = selectedCoupon();
      rows.forEach((row) => {
        const normalized = emptyLine(coupon.lines.length + 1);
        ESSENTIAL_LINE_COLUMNS.forEach(([key, label]) => { normalized[key] = row[key] ?? row[label] ?? normalized[key]; });
        coupon.lines.push(normalized);
      });
      normalizeLineSerials(coupon.lines); managerState.draft = coupon; renderMaterialCouponManager(managerState);
      deps.showToast?.(`${rows.length} Excel row(s) imported.`, 'success');
    } catch (error) { console.error(error); deps.showToast?.('Could not import the Excel file.', 'error'); }
  }, { once: true });
  picker.click();
}

const ESSENTIAL_LINE_COLUMNS = Object.freeze([
  ['serialNumber', 'S/N'], ['sapCode', 'SAP Code'], ['itemType', 'Item Type'], ['materialDescription', 'Material Description'], ['qty', 'Qty'], ['unit', 'Un'], ['diaMm', 'Dia [mm]'], ['thicknessMm', 'Thickness [mm]'], ['widthMm', 'Width [mm]'], ['lengthMm', 'Length [mm]'], ['weightKg', 'Weight [Kg]'], ['materialGrade', 'Mat. Grade'], ['traceability', 'Traceability'], ['heatNo', 'Heat No.'], ['mir', 'MIR'], ['equipment', 'Equipment'], ['po', 'PO'], ['poItem', 'PO Item'], ['nfArrival', 'NF Arrival'], ['notes', 'Notes'],
]);

function button(label, className, onClick) {
  const btn = node('button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function td(child) {
  const cell = node('td');
  cell.append(child);
  return cell;
}

export function renderMaterialCouponSignatures(coupon = {}) {
  const panel = el('mc-tab-signatures');
  if (!panel || !coupon) return;
  const grid = node('div', 'mc-form-grid');
  grid.append(autoSignatureGroup('Dispatch', 'local_shipping', 'Filled automatically when the coupon is dispatched.', [
    input('Material Dispatch Responsible', 'dispatch', coupon.responsible.dispatch),
    input('Function', 'dispatchRole', coupon.responsible.dispatchRole),
    input('Company', 'dispatchCompany', coupon.responsible.dispatchCompany),
    input('Date', 'dispatchDate', coupon.responsible.dispatchDate, 'date'),
  ]), autoSignatureGroup('Receiving', 'inventory', 'Filled automatically when the coupon is received.', [
    input('Material Receiving Responsible', 'receiving', coupon.responsible.receiving),
    input('Function', 'receivingRole', coupon.responsible.receivingRole),
    input('Company', 'receivingCompany', coupon.responsible.receivingCompany),
    input('Date', 'receivingDate', coupon.responsible.receivingDate, 'date'),
  ]));
  panel.replaceChildren(grid);
}

function autoSignatureGroup(title, iconName, helperText, fields) {
  const group = node('section', 'mc-field-group');
  const heading = node('h3'); heading.append(node('span', 'material-symbols-outlined', iconName), node('span', null, title));
  const helper = node('p', 'mc-field-group-helper text-muted', helperText);
  fields.forEach((field) => { field.dataset.state = 'auto'; });
  group.append(heading, helper, ...fields);
  return group;
}

export function renderMaterialCouponNotes(coupon = {}) {
  const panel = el('mc-tab-notes');
  if (!panel || !coupon) return;
  const grid = node('div', 'mc-form-grid');
  grid.append(notesFieldGroup(coupon, [
    input('Reference', 'reference', coupon.header.reference, 'textarea'),
    input('Notes', 'notes', coupon.header.notes, 'textarea'),
  ]));
  panel.replaceChildren(grid);
}

function notesFieldGroup(coupon, fields) {
  const group = node('section', 'mc-field-group mc-notes-group');
  const heading = node('h3');
  heading.append(node('span', 'material-symbols-outlined', 'notes'), node('span', null, 'Reference and Notes'));
  const generate = button('Generate', 'btn btn-secondary mc-generate-notes', () => generateMaterialCouponNotes(coupon));
  generate.prepend(node('span', 'material-symbols-outlined', 'auto_awesome'));
  generate.disabled = !canEdit(coupon);
  heading.append(generate);
  const fieldsGrid = node('div', 'mc-form-grid');
  fieldsGrid.append(...fields);
  group.append(heading, fieldsGrid);
  return group;
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

export function buildMaterialCouponReferenceDraft(coupon = {}, workpack = null, drawings = [], mtoItems = [], cuttingSheets = [], workpackLinks = []) {
  const workpackDrawings = (Array.isArray(drawings) ? drawings : []).map((drawing) => ({ number: text(drawing.drawingNo), title: text(drawing.title) })).filter((drawing) => drawing.number || drawing.title);
  const fallbackDrawings = uniqueText((coupon.lines || []).map((line) => line.drawingUse));
  const drawingLines = workpackDrawings.length
    ? workpackDrawings.map((drawing) => `- ${[drawing.number, drawing.title].filter(Boolean).join(' — ')}`)
    : fallbackDrawings.map((drawing) => `- ${drawing}`);
  const linkedMtoIds = new Set(workpackRelationIds(workpack || {}, workpackLinks, WORKPACK_RELATION_TYPES.MTO_ITEM));
  const workpackTags = uniqueText((Array.isArray(mtoItems) ? mtoItems : []).filter((item) => linkedMtoIds.has(item.id)).flatMap((item) => [item.tag, item.clientTag]));
  const fallbackTags = uniqueText((coupon.lines || []).map((line) => line.tag));
  const tags = workpackTags.length ? workpackTags : fallbackTags;
  const cuttingSheetEntries = (Array.isArray(cuttingSheets) ? cuttingSheets : []).map((cuttingSheet) => {
    const bars = [cuttingSheet.bars, cuttingSheet.planning?.solution?.stockUsed, cuttingSheet.metadata?.solution?.stockUsed]
      .find((items) => Array.isArray(items) && items.length) || [];
    const nestedPieces = bars.flatMap((bar) => Array.isArray(bar?.pieces) ? bar.pieces : []);
    const pieces = nestedPieces.length
      ? nestedPieces
      : [cuttingSheet.planning?.parts, cuttingSheet.planning?.solution?.allParts, cuttingSheet.metadata?.solution?.allParts]
        .find((items) => Array.isArray(items) && items.length) || [];
    const references = uniqueText(pieces.map((piece) => [text(piece?.mark), text(piece?.pos || piece?.position)].filter(Boolean).join(' / ')));
    return { number: text(cuttingSheet.number || cuttingSheet.id), references };
  }).filter((entry) => entry.number);
  const sections = [];
  if (drawingLines.length) sections.push(['DESIGN DRAWING:', ...drawingLines].join('\n'));
  if (tags.length) sections.push(['TAGS:', ...tags.map((tag) => `- ${tag}`)].join('\n'));
  cuttingSheetEntries.forEach((entry) => {
    const lines = [`CUTTING SHEET: ${entry.number}`];
    if (entry.references.length) lines.push('MARK / POSITION:', ...entry.references.map((reference) => `- ${reference}`));
    sections.push(lines.join('\n'));
  });
  return sections.join('\n\n');
}

export function materialCouponStorageLocations(coupon = {}, inventoryItems = []) {
  const byId = new Map((Array.isArray(inventoryItems) ? inventoryItems : []).filter(Boolean).flatMap((item) => [
    [text(item.id), item],
    [text(item.trace), item],
    [text(item.traceability), item],
  ]).filter(([id]) => id));
  const seen = new Set();
  const locations = [];
  (Array.isArray(coupon.lines) ? coupon.lines : []).forEach((line) => {
    const id = text(line.inventoryItemId || line.inventoryId || line.traceability);
    const item = byId.get(id);
    const location = text(item?.location);
    const key = location.toLowerCase();
    if (!location || seen.has(key)) return;
    seen.add(key);
    locations.push(location);
  });
  return locations;
}

export function buildMaterialCouponNotesDraft(header = {}, storageLocations = []) {
  const storage = uniqueText(Array.isArray(storageLocations) ? storageLocations : [storageLocations]).join('/') || '[STORAGE]';
  const destination = text(header.materialDestination || header.destination) || '[DESTINATION]';
  const scope = text(header.scope) || '[SCOPE]';
  return `* TRANSFER OF MATERIALS FROM ${storage} TO "${destination}" FOR ${scope}\n- SUBCONTRACTORS TO SIGN AND RETURN A COPY TO SAIPEM UPON RECEIPT AND VERIFICATION`;
}

async function materialCouponReferenceContext(current, selectedCuttingSheets = null) {
  const workpackId = text(current.workpackId || current.links?.workpackId);
  const workpack = workpackId ? await deps.getWorkpack?.(workpackId) : null;
  const workpackLinks = workpack ? await deps.listWorkpackLinks?.() || [] : [];
  const allDrawings = workpack ? await deps.listDrawings?.() || [] : [];
  const drawingIds = new Set(workpackRelationIds(workpack || {}, workpackLinks, WORKPACK_RELATION_TYPES.DRAWING_REVISION));
  const drawings = allDrawings.filter((drawing) => drawingIds.has(drawing.id) || drawing.workpackId === workpackId);
  const allMtoItems = workpack ? await deps.listMtoItems?.() || [] : [];
  const directCuttingSheetId = text(current.links?.cuttingSheetId);
  const pieceCuttingSheetIds = (current.linkedCuttingSheetPieces || []).map((item) => item.cuttingSheetId).filter(Boolean);
  const workpackCuttingSheetIds = directCuttingSheetId
    ? []
    : workpackRelationIds(workpack || {}, workpackLinks, WORKPACK_RELATION_TYPES.CUTTING_SHEET);
  const cuttingSheetIds = new Set([directCuttingSheetId, ...pieceCuttingSheetIds, ...workpackCuttingSheetIds].filter(Boolean));
  const allCuttingSheets = selectedCuttingSheets || ((workpackId || cuttingSheetIds.size) ? await deps.listCuttingSheets?.() || [] : []);
  const cuttingSheets = selectedCuttingSheets || allCuttingSheets.filter((cuttingSheet) => cuttingSheetIds.has(cuttingSheet.id)
    || (!directCuttingSheetId && workpackId && cuttingSheet.workpackId === workpackId));
  return { workpack, workpackLinks, drawings, mtoItems: allMtoItems, cuttingSheets };
}

async function buildCurrentMaterialCouponReference(coupon, selectedCuttingSheets = null) {
  const context = await materialCouponReferenceContext(coupon, selectedCuttingSheets);
  return buildMaterialCouponReferenceDraft(coupon, context.workpack, context.drawings, context.mtoItems, context.cuttingSheets, context.workpackLinks);
}

async function generateMaterialCouponNotes(coupon) {
  readDraftFromDom();
  const current = selectedCoupon() || coupon;
  const inventoryItems = await deps.listInventoryItems?.() || [];
  const storageLocations = materialCouponStorageLocations(current, inventoryItems);
  const reference = await buildCurrentMaterialCouponReference(current);
  const notes = buildMaterialCouponNotesDraft(current.header, storageLocations);
  const generated = { reference, notes };
  const labels = { reference: 'Reference', notes: 'Notes' };
  const pending = [];
  ['reference', 'notes'].forEach((key) => {
    if (text(current.header[key])) pending.push(key);
    else current.header[key] = generated[key];
  });
  managerState.draft = current;

  const finish = () => {
    closeModal();
    renderMaterialCouponNotes(current);
  };
  const confirmNext = () => {
    const key = pending.shift();
    if (!key) { finish(); return; }
    const label = labels[key];
    const body = node('p', null, `Replace current ${label} text with generated draft?`);
    const keepCurrent = () => { closeModal(); confirmNext(); };
    const replaceCurrent = () => {
      current.header[key] = generated[key];
      managerState.draft = current;
      closeModal();
      confirmNext();
    };
    openModal({ title: `Generate ${label}`, body, buttons: [
      { label: 'Keep Current', variant: 'btn-ghost', closeOnClick: false, onClick: keepCurrent },
      { label: 'Replace', variant: 'btn-primary', closeOnClick: false, onClick: replaceCurrent },
    ] });
  };
  confirmNext();
}

export async function renderMaterialCouponPreview(coupon = {}) {
  const panel = el('mc-tab-preview');
  if (!panel || !coupon) return;
  const globalLayout = Array.isArray(deps.materialCouponReportOptions?.reportColumnLayout) ? deps.materialCouponReportOptions.reportColumnLayout : [];
  const effectiveLayout = Array.isArray(coupon.reportColumnLayout) ? coupon.reportColumnLayout : globalLayout;
  const byKey = new Map(effectiveLayout.map((item) => [item.key, item]));
  const controls = node('div', 'mc-report-column-controls');
  const controlsHeader = node('div', 'mc-report-column-controls-header');
  controlsHeader.append(node('div', null, 'Colunas do relatório'));
  const actions = node('div', 'gap-2');
  actions.append(
    button('Restaurar padrão global', 'btn btn-ghost', () => { coupon.reportColumnLayout = globalLayout.map((item) => ({ ...item })); managerState.draft = coupon; void renderMaterialCouponPreview(coupon); }),
    button('Salvar como padrão global', 'btn btn-secondary', async () => {
      const layout = (coupon.reportColumnLayout || effectiveLayout).map((item) => ({ ...item }));
      await deps.saveGlobalReportColumnLayout?.(layout);
      deps.materialCouponReportOptions = { ...(deps.materialCouponReportOptions || {}), reportColumnLayout: layout };
      deps.showToast?.('Layout de colunas salvo como padrão global.', 'success');
    }),
  );
  controlsHeader.append(actions); controls.append(controlsHeader);
  const grid = node('div', 'mc-report-column-grid');
  MATERIAL_COUPON_REPORT_COLUMNS.forEach((column) => {
    const current = byKey.get(column.key) || column;
    const item = node('label', 'mc-report-column-item');
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = current.visible == null ? column.key !== 'widthMm' || (coupon.lines || []).some((line) => Number(line.widthMm) > 0) : current.visible !== false;
    const label = node('span', null, column.label);
    const width = node('input', 'input'); width.type = 'number'; width.min = '1'; width.max = '40'; width.step = '1'; width.value = String(current.width || column.width);
    const update = () => {
      const layout = MATERIAL_COUPON_REPORT_COLUMNS.map((entry) => {
        const existing = (coupon.reportColumnLayout || effectiveLayout).find((value) => value.key === entry.key) || entry;
        return entry.key === column.key ? { key: entry.key, visible: checkbox.checked, width: Number(width.value) || entry.width } : { key: entry.key, visible: existing.visible == null ? undefined : existing.visible !== false, width: Number(existing.width) || entry.width };
      });
      coupon.reportColumnLayout = layout; managerState.draft = coupon; void renderMaterialCouponPreview(coupon);
    };
    checkbox.addEventListener('change', update); width.addEventListener('change', update);
    item.append(checkbox, label, width); grid.append(item);
  });
  controls.append(grid);
  const preview = node('div', 'mc-report-preview');
  preview.id = 'mc-report-preview';
  preview.append(node('p', 'text-muted', 'Loading report preview...'));
  panel.replaceChildren(controls, preview);
  try {
    const inventoryItems = await deps.listInventoryItems?.() || [];
    const html = await buildMaterialCouponReportHtmlWithProfile(
      couponWithInventoryDetails(coupon, inventoryItems),
      { ...(deps.materialCouponReportOptions || {}), reportColumnLayout: coupon.reportColumnLayout || effectiveLayout },
    );
    const frame = node('iframe', 'mc-report-preview-frame');
    frame.title = 'Material Coupon Preview';
    frame.srcdoc = html;
    if (el('mc-tab-preview') === panel) preview.replaceChildren(frame);
  } catch (error) {
    console.error(error);
    if (el('mc-tab-preview') === panel) {
      preview.replaceChildren(node('p', 'text-muted', 'Could not load report preview.'));
    }
  }
}

export async function renderMaterialCouponHistory(coupon = {}) {
  const panel = el('mc-tab-history');
  if (!panel) return;
  const loaded = coupon.id ? await deps.listCouponHistory?.(coupon.id) : null;
  const events = loaded?.events || (Array.isArray(coupon.audit) && coupon.audit.length ? coupon.audit : managerState.history);
  const movements = loaded?.movements || [];
  if (!events.length && !movements.length) {
    panel.replaceChildren(node('p', 'text-muted', 'No audit events loaded yet.'));
    return;
  }
  const list = node('div', 'mc-history-list');
  events.forEach((event) => {
    list.append(node('div', 'mc-history-item', `${event.eventType || event.action || 'EVENT'} · ${event.timestamp || event.createdAt || ''}`));
  });
  movements.forEach((movement) => {
    const item = node('div', 'mc-history-item mc-history-movement');
    item.append(
      node('strong', null, movement.movementType || 'STOCK_MOVEMENT'),
      node('span', 'text-muted', movement.timestamp || ''),
      node('span', null, `Inventory ${movement.inventoryItemId || '—'} · Qty Δ ${movement.quantityDelta || 0}`),
      node('span', null, `${movement.previousStatus || '—'} → ${movement.nextStatus || '—'}`),
    );
    list.append(item);
  });
  panel.replaceChildren(list);
}

function controlFilter(label, key, type = 'text') {
  const field = node('label', 'mc-control-filter');
  field.append(node('span', null, label));
  const input = node(type === 'select' ? 'select' : 'input', 'input');
  if (type !== 'select') input.type = type;
  input.value = managerState.controlFilters[key] || '';
  input.addEventListener(type === 'select' ? 'change' : 'input', () => {
    managerState.controlFilters[key] = input.value;
    renderMaterialCouponControlDatabase();
  });
  field.append(input);
  return { field, input };
}

function controlKpi(label, value, iconName, accent = '') {
  const card = node('div', `kpi-card mc-control-kpi ${accent}`.trim());
  const icon = node('span', 'material-symbols-outlined mc-control-kpi-icon', iconName);
  card.append(icon, node('div', 'kpi-label', label), node('div', 'kpi-value mc-numeric-cell', String(value)));
  return card;
}

export function renderMaterialCouponControlDatabase() {
  const panel = el('mc-control-database-content');
  if (!panel) return;
  const allRows = buildMaterialCouponControlRows(managerState.coupons, {
    workpacks: managerState.workpacks,
    cuttingSheets: managerState.cuttingSheets,
    ...managerState.controlData,
  });
  const projects = [...new Set(allRows.map((row) => row.materialProject).filter(Boolean))].sort();
  const workpacks = [...new Set(allRows.map((row) => row.workpack).filter(Boolean))].sort();
  const filters = node('div', 'mc-control-filters');
  const search = controlFilter('Search', 'search');
  const project = controlFilter('Project', 'project', 'select');
  const workpack = controlFilter('Workpack', 'workpack', 'select');
  const status = controlFilter('Status', 'status', 'select');
  const from = controlFilter('From', 'from', 'date');
  const to = controlFilter('To', 'to', 'date');
  project.input.append(new Option('All projects', ''), ...projects.map((value) => new Option(value, value)));
  workpack.input.append(new Option('All Workpacks', ''), ...workpacks.map((value) => new Option(value, value)));
  const statuses = [...new Set(allRows.map((row) => row.couponStatus).filter(Boolean))].sort();
  status.input.append(new Option('All statuses', ''), ...statuses.map((value) => new Option(value, value)));
  project.input.value = managerState.controlFilters.project || '';
  workpack.input.value = managerState.controlFilters.workpack || '';
  status.input.value = managerState.controlFilters.status || '';
  filters.append(search.field, project.field, workpack.field, status.field, from.field, to.field);

  const rows = filterMaterialCouponControlRows(allRows, managerState.controlFilters);
  const controlKpis = el('mc-control-kpis');
  controlKpis?.replaceChildren(
    controlKpi('Issued Coupons', new Set(rows.map((row) => row.couponId || row.mcCode).filter(Boolean)).size, 'confirmation_number'),
    controlKpi('RMVs', new Set(rows.map((row) => row.rmvId).filter(Boolean)
      .concat(rows.flatMap((row) => row.rmvIds || []))).size, 'assignment_return'),
    controlKpi('Active Workpacks', new Set(rows.map((row) => row.workpack).filter(Boolean)).size, 'workspaces'),
    controlKpi('Active Projects', new Set(rows.map((row) => row.materialProject).filter(Boolean)).size, 'business_center', 'mc-control-kpi-warning'),
  );
  const toolbar = node('div', 'mc-control-toolbar');
  toolbar.append(node('span', 'text-muted mc-control-record-count', `Showing ${rows.length} of ${allRows.length} Material Coupon line(s)`));
  const exportButton = button('Export Control Database (Excel)', 'btn btn-secondary', async () => {
    try { await deps.exportMaterialCouponControlDatabase?.(managerState.coupons); }
    catch (error) { console.error(error); deps.showToast?.(error?.message || 'Could not export the control database.', 'error'); }
  });
  exportButton.prepend(node('span', 'material-symbols-outlined', 'download'));
  exportButton.disabled = !allRows.length;
  toolbar.append(exportButton);

  const wrap = node('div', 'table-wrap mc-control-table-wrap');
  const table = node('table', 'data-table mc-control-table');
  const columnWidths = MATERIAL_COUPON_CONTROL_COLUMNS.map((column) => MATERIAL_COUPON_CONTROL_COLUMN_WIDTHS[column.key] || 112);
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
  table.style.width = `${tableWidth}px`;
  table.style.minWidth = `${tableWidth}px`;
  table.append(tableColgroup(columnWidths));
  const head = node('tr');
  MATERIAL_COUPON_CONTROL_COLUMNS.forEach((column) => head.append(node('th', null, column.label)));
  const thead = node('thead'); thead.append(head);
  const tbody = node('tbody');
  rows.forEach((row) => {
    const tr = node('tr');
    MATERIAL_COUPON_CONTROL_COLUMNS.forEach((column) => {
      const cell = node('td');
      if (column.key === 'couponStatus') cell.append(statusPill(row.couponStatus));
      else {
        const value = row[column.key] ?? '';
        if (text(value)) {
          cell.textContent = value;
          cell.title = String(value);
        } else if (MATERIAL_COUPON_CONTROL_LINK_FIELDS.has(column.key)) {
          const empty = node('span', 'mc-control-empty-value', '—');
          empty.title = 'No linked record or completed event was found.';
          cell.append(empty);
        }
      }
      tr.append(cell);
    });
    tbody.append(tr);
  });
  if (!rows.length) {
    const tr = node('tr'); const empty = node('td', 'text-muted', 'No issued Material Coupon lines match the current filters.');
    empty.colSpan = MATERIAL_COUPON_CONTROL_COLUMNS.length; tr.append(empty); tbody.append(tr);
  }
  table.append(thead, tbody); wrap.append(table); panel.replaceChildren(toolbar, filters, wrap);
}

function renderActiveTab(coupon) {
  clearPanels();
  if (coupon) {
    renderMaterialCouponHeader(coupon);
    renderMaterialCouponMaterials(coupon);
    renderMaterialCouponSignatures(coupon);
    renderMaterialCouponNotes(coupon);
    void renderMaterialCouponPreview(coupon);
    void renderMaterialCouponHistory(coupon);
  }
  document.querySelectorAll('.mc-tab-panel').forEach((panel) => { panel.classList.remove('hidden'); panel.classList.add('active'); });
}

function renderKpis(coupons) {
  const container = el('material-coupon-kpis');
  if (!container) return;
  const normalized = coupons.map(fromRecord);
  const count = (status) => normalized.filter((coupon) => coupon.status === status).length;
  const total = kpi('Total Coupons', coupons.length, 'confirmation_number', 'All registered documents');
  const draft = kpi('Draft', count(STATUS.DRAFT), 'edit_note', 'Work in progress');
  const issued = kpi('Issued', count(STATUS.ISSUED), 'output', 'Material issued to fabrication');
  total.classList.add('mc-kpi-primary');
  draft.classList.add('mc-kpi-muted');
  issued.classList.add('mc-kpi-issued');
  container.replaceChildren(
    total,
    draft,
    issued,
    kpi('Received', count(STATUS.RECEIVED), 'inventory', 'Received by fabrication'),
  );
}

function kpi(label, value, iconName, caption) {
  const card = node('div', 'kpi-card');
  const meta = node('div', 'mc-kpi-caption'); meta.append(node('span', 'material-symbols-outlined', iconName), node('span', null, caption));
  card.append(node('div', 'kpi-label', label), node('div', 'kpi-value', String(value)), meta);
  return card;
}

export function renderMaterialCouponManager(state = managerState) {
  const showingControl = state.view === 'control';
  el('section-material-coupons')?.classList.toggle('mc-control-mode', showingControl);
  el('mc-manager-layout')?.classList.toggle('hidden', showingControl);
  el('material-coupon-kpis')?.classList.toggle('hidden', showingControl);
  el('mc-control-database-page')?.classList.toggle('hidden', !showingControl);
  const managerViewButton = el('btn-mc-close-control');
  const controlViewButton = el('btn-mc-open-control');
  managerViewButton?.classList.toggle('active', !showingControl);
  controlViewButton?.classList.toggle('active', showingControl);
  managerViewButton?.setAttribute('aria-pressed', String(!showingControl));
  controlViewButton?.setAttribute('aria-pressed', String(showingControl));
  renderKpis(state.coupons);
  if (showingControl) {
    renderMaterialCouponControlDatabase();
    return;
  }
  const editorOpen = Boolean(state.editorOpen);
  el('mc-list-view')?.classList.toggle('hidden', editorOpen);
  el('mc-main-workspace')?.classList.toggle('hidden', !editorOpen);
  renderMaterialCouponList(state.coupons, state.selectedId);
  renderWorkspaceTitle();
  const coupon = selectedCoupon();
  const busy = Boolean(state.busy);
  el('mc-main-workspace')?.setAttribute('aria-busy', String(busy));
  const editorStatus = el('mc-editor-status');
  if (editorStatus && coupon) editorStatus.replaceWith(Object.assign(statusPill(couponListStatus(coupon)), { id: 'mc-editor-status' }));
  const materialsCount = el('mc-materials-tab-count');
  if (materialsCount) materialsCount.textContent = String(coupon?.lines?.length || 0);
  el('mc-main-workspace')?.classList.toggle('is-locked', Boolean(coupon && !canEdit(coupon)));
  renderActiveTab(coupon);
  if (busy) {
    el('mc-main-workspace')?.querySelectorAll('.mc-field input, .mc-field textarea, .mc-field select, .planner-cell-editor, .mc-materials-toolbar button')
      .forEach((control) => { control.disabled = true; });
  }
  const editable = canEdit(coupon);
  ['btn-mc-save', 'btn-mc-issue'].forEach((id) => {
    const control = el(id);
    if (control) control.disabled = busy || !coupon || !editable;
  });
  if (el('btn-mc-issue')) el('btn-mc-issue').disabled = busy || !coupon || !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.ISSUE);
  ['btn-mc-duplicate', 'btn-mc-export-extract', 'btn-mc-export-excel', 'btn-mc-print'].forEach((id) => {
    const control = el(id);
    if (control) control.disabled = busy || !coupon;
  });
  if (el('btn-mc-link-workpack')) el('btn-mc-link-workpack').disabled = busy || !coupon || !editable;
  if (el('btn-mc-back')) el('btn-mc-back').disabled = busy;
  if (el('btn-mc-new')) el('btn-mc-new').disabled = busy;
  const actionButtons = {
    'btn-mc-submit': MATERIAL_COUPON_ACTIONS.SUBMIT,
    'btn-mc-approve': MATERIAL_COUPON_ACTIONS.APPROVE,
    'btn-mc-reject': MATERIAL_COUPON_ACTIONS.REJECT,
    'btn-mc-dispatch': MATERIAL_COUPON_ACTIONS.DISPATCH,
    'btn-mc-receive': MATERIAL_COUPON_ACTIONS.RECEIVE,
    'btn-mc-close': MATERIAL_COUPON_ACTIONS.CLOSE,
    'btn-mc-reopen': MATERIAL_COUPON_ACTIONS.REOPEN,
    'btn-mc-release': MATERIAL_COUPON_ACTIONS.RELEASE,
    'btn-mc-cancel': MATERIAL_COUPON_ACTIONS.CANCEL,
    'btn-mc-new-revision': MATERIAL_COUPON_ACTIONS.NEW_REVISION,
    'btn-mc-delete': MATERIAL_COUPON_ACTIONS.DELETE,
  };
  Object.entries(actionButtons).forEach(([id, action]) => {
    const control = el(id); if (control) control.disabled = busy || !coupon || !canMaterialCouponAction(coupon, action);
  });
  updatePrimaryStatusAction(coupon);
  unlockDraftEditor(coupon);
}

function updatePrimaryStatusAction(coupon) {
  const control = el('btn-mc-issue'); if (!control) return;
  const candidates = [
    [MATERIAL_COUPON_ACTIONS.ISSUE, 'Emitir'], [MATERIAL_COUPON_ACTIONS.RECEIVE, 'Informar recebimento'],
  ];
  const next = candidates.find(([action]) => coupon && canMaterialCouponAction(coupon, action));
  control.dataset.mcPrimaryAction = next?.[0] || '';
  control.lastChild.textContent = managerState.busyAction === 'issue' ? 'Emitindo…' : (next?.[1] || 'No status action');
  control.disabled = managerState.busy || !next;
}

export function resetMaterialCouponDraftControls(workspace, { focusFirst = false } = {}) {
  if (!workspace) return [];
  workspace.classList.remove('is-locked');
  workspace.removeAttribute('inert');
  workspace.removeAttribute('aria-busy');
  const controls = [...workspace.querySelectorAll([
    '.mc-field input',
    '.mc-field textarea',
    '.mc-field select',
    '.planner-cell-editor',
    '.mc-materials-toolbar button',
    '.planner-row-action',
    '.mc-generate-notes',
    '.mc-report-column-controls input',
    '.mc-report-column-controls button',
  ].join(', '))];
  controls.forEach((control) => {
    control.disabled = false;
    if (control.matches?.('[data-mc-field]:not(.mc-automatic-input)')) control.readOnly = false;
  });
  const editableFields = controls.filter((control) => control.matches?.('[data-mc-field]:not(.mc-automatic-input)'));
  if (focusFirst) editableFields[0]?.focus();
  return editableFields;
}

function unlockDraftEditor(coupon) {
  if (!canEdit(coupon) || managerState.busy) return;
  resetMaterialCouponDraftControls(el('mc-main-workspace'));
}

function resetTransientEditorState() {
  managerState.busy = false;
  managerState.busyAction = '';
  managerState.history = [];
  managerState.view = 'manager';
  closeMoreActions();

  const workspace = el('mc-main-workspace');
  if (!workspace) return;
  workspace.classList.remove('is-locked');
  workspace.removeAttribute('inert');
  workspace.removeAttribute('aria-busy');
}

function openNewCouponEditor() {
  resetTransientEditorState();
  notifyGeneratedCouponSaved = null;
  managerState.selectedId = '';
  managerState.draft = newCoupon();
  managerState.activeTab = 'header';
  managerState.editorOpen = true;
  managerState.view = 'manager';
  renderMaterialCouponManager(managerState);
  unlockDraftEditor(managerState.draft);
  globalThis.requestAnimationFrame?.(() => {
    if (canEdit(selectedCoupon()) && !managerState.busy) {
      resetMaterialCouponDraftControls(el('mc-main-workspace'), { focusFirst: true });
    }
  });
}

export async function openMaterialCouponEditor(couponId) {
  const record = await deps.getCoupon?.(couponId);
  if (!record) return false;
  resetTransientEditorState();
  managerState.selectedId = record.id;
  managerState.draft = fromRecord(record);
  managerState.activeTab = 'header';
  managerState.editorOpen = true;
  renderMaterialCouponManager(managerState);
  return true;
}

async function duplicateSelected() {
  const coupon = readDraftFromDom();
  if (!coupon) return;
  const copy = {
    ...clone(coupon),
    id: '',
    status: STATUS.DRAFT,
    header: {
      ...coupon.header,
      mcCode: `${coupon.header.mcCode || 'MC'}-COPY`,
      revision: '0',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const saved = await deps.saveCoupon?.(toRecord(copy));
  await deps.createAuditEntry?.('MATERIAL_COUPON_DUPLICATED', saved);
  managerState.selectedId = saved.id;
  managerState.draft = fromRecord(saved);
  await loadCoupons();
  deps.showToast?.('Coupon duplicated.', 'success');
}

async function runCouponAction(action, { reasonRequired = false } = {}) {
  const coupon = readDraftFromDom();
  if (!coupon || !canMaterialCouponAction(coupon, action)) return;
  const reason = reasonRequired ? text(globalThis.prompt?.('Reason / comments:') || '') : '';
  if (reasonRequired && !reason) return;
  try {
    const next = applyMaterialCouponAction(coupon, action, deps.currentUserName || '', reason);
    const saved = await deps.applyCouponAction?.(toRecord(next), action, reason);
    managerState.selectedId = saved?.id || coupon.id;
    managerState.draft = saved ? fromRecord(saved) : next;
    await loadCoupons();
    deps.showToast?.(`Coupon action ${action} completed.`, 'success');
  } catch (error) {
    console.error(error); deps.showToast?.(error.message || `Could not execute ${action}.`, 'error');
  }
}

async function deleteSelectedCoupon() {
  const coupon = selectedCoupon();
  if (!coupon || !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.DELETE)) return;
  if (!globalThis.confirm?.(`Delete ${coupon.header.mcCode}? This cannot be undone.`)) return;
  await deps.deleteCoupon?.(coupon.id); managerState.selectedId = ''; managerState.draft = null; managerState.editorOpen = false; await loadCoupons();
  deps.showToast?.('Coupon deleted.', 'success');
}

async function releaseSelectedCoupon() {
  const coupon = selectedCoupon();
  if (!coupon || !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.RELEASE)) return;
  if (!globalThis.confirm?.('Release reserved inventory back to stock for this coupon?')) return;
  await runCouponAction(MATERIAL_COUPON_ACTIONS.RELEASE);
}

async function cancelSelectedCoupon() {
  const coupon = selectedCoupon();
  if (!coupon || !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.CANCEL)) return;
  if (coupon.status === STATUS.ISSUED && !globalThis.confirm?.('Cancel this issued coupon? Reserved inventory will be released back to stock.')) return;
  await runCouponAction(MATERIAL_COUPON_ACTIONS.CANCEL, { reasonRequired: true });
}

async function createNewRevision() {
  const coupon = readDraftFromDom();
  if (!coupon || !canMaterialCouponAction(coupon, MATERIAL_COUPON_ACTIONS.NEW_REVISION)) return;
  const revision = nextMaterialCouponRevision(coupon);
  try {
    const saved = await deps.saveCoupon?.(toRecord(revision));
    await deps.createAuditEntry?.('MATERIAL_COUPON_NEW_REVISION', saved, {
      previousRevision: coupon.header.revision,
      nextRevision: revision.header.revision,
    });
    managerState.selectedId = saved.id;
    managerState.draft = fromRecord(saved);
    await loadCoupons();
    deps.showToast?.(`Revision ${revision.header.revision} created.`, 'success');
  } catch (error) {
    console.error(error);
    deps.showToast?.(error.message || 'Could not create a new revision.', 'error');
  }
}

async function exportExtract() {
  const coupon = selectedCoupon();
  if (!coupon) return;
  try { await deps.exportMaterialCouponExtract?.(coupon); }
  catch (error) { console.error(error); deps.showToast?.(error?.message || 'Could not export the Material Coupon extract.', 'error'); }
}

async function exportExcel() {
  const coupon = selectedCoupon();
  if (!coupon) return;
  try { await deps.exportMaterialCouponExcel?.(coupon); }
  catch (error) { console.error(error); deps.showToast?.(error?.message || 'Could not export the Material Coupon Excel file.', 'error'); }
}

async function printSelected() {
  const coupon = readDraftFromDom();
  if (!coupon) return;
  try {
    const inventoryItems = await deps.listInventoryItems?.() || [];
    const opened = await deps.printMaterialCouponReport?.(couponWithInventoryDetails(coupon, inventoryItems));
    if (!opened) deps.showToast?.('Browser blocked the print window.', 'error');
  } catch (error) {
    console.error(error);
    deps.showToast?.('Could not open the Material Coupon report.', 'error');
  }
}

function closeMoreActions({ restoreFocus = false } = {}) {
  const trigger = el('btn-mc-more');
  const menu = el('mc-more-actions');
  if (!trigger || !menu) return;
  menu.classList.add('hidden');
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger.focus();
}

function openMoreActions({ focusFirst = false } = {}) {
  const trigger = el('btn-mc-more');
  const menu = el('mc-more-actions');
  if (!trigger || !menu) return;
  menu.classList.remove('hidden');
  trigger.setAttribute('aria-expanded', 'true');
  if (focusFirst) menu.querySelector('button:not(:disabled)')?.focus();
}

function bindManagerEvents() {
  if (managerBound) return;
  managerBound = true;
  el('btn-mc-new')?.addEventListener('click', openNewCouponEditor);
  el('btn-mc-refresh')?.addEventListener('click', () => { closeMoreActions(); loadCoupons(); });
  el('btn-mc-save')?.addEventListener('click', () => saveDraft());
  el('btn-mc-issue')?.addEventListener('click', () => {
    const action = el('btn-mc-issue')?.dataset.mcPrimaryAction;
    if (action === MATERIAL_COUPON_ACTIONS.ISSUE) saveDraft({ issue: true });
    else if (action) runCouponAction(action);
  });
  el('btn-mc-duplicate')?.addEventListener('click', () => { closeMoreActions(); duplicateSelected(); });
  el('btn-mc-link-workpack')?.addEventListener('click', () => { closeMoreActions(); linkSelectedWorkpack(); });
  el('btn-mc-export-extract')?.addEventListener('click', () => { closeMoreActions(); exportExtract(); });
  el('btn-mc-export-excel')?.addEventListener('click', () => { closeMoreActions(); exportExcel(); });
  el('btn-mc-print')?.addEventListener('click', () => { closeMoreActions(); printSelected(); });
  el('btn-mc-delete')?.addEventListener('click', deleteSelectedCoupon);
  el('btn-mc-submit')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.SUBMIT); });
  el('btn-mc-approve')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.APPROVE); });
  el('btn-mc-reject')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.REJECT, { reasonRequired: true }); });
  el('btn-mc-dispatch')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.DISPATCH); });
  el('btn-mc-receive')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.RECEIVE); });
  el('btn-mc-close')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.CLOSE); });
  el('btn-mc-reopen')?.addEventListener('click', () => { closeMoreActions(); runCouponAction(MATERIAL_COUPON_ACTIONS.REOPEN); });
  el('btn-mc-release')?.addEventListener('click', () => { closeMoreActions(); releaseSelectedCoupon(); });
  el('btn-mc-cancel')?.addEventListener('click', () => { closeMoreActions(); cancelSelectedCoupon(); });
  el('btn-mc-new-revision')?.addEventListener('click', () => { closeMoreActions(); createNewRevision(); });
  el('btn-mc-back')?.addEventListener('click', () => {
    if (managerState.busy) return;
    const coupon = readDraftFromDom();
    if (coupon && !canEdit(coupon)) {
      managerState.draft = null;
      managerState.selectedId = '';
      managerState.history = [];
      el('mc-main-workspace')?.classList.remove('is-locked');
    }
    managerState.editorOpen = false;
    closeMoreActions();
    renderMaterialCouponManager(managerState);
  });
  el('btn-mc-list-export')?.addEventListener('click', async () => {
    try { await deps.exportMaterialCouponControlDatabase?.(filteredCoupons()); }
    catch (error) { console.error(error); deps.showToast?.(error?.message || 'Could not export the control database.', 'error'); }
  });
  el('btn-mc-open-control')?.addEventListener('click', () => {
    readDraftFromDom();
    managerState.view = 'control';
    renderMaterialCouponManager(managerState);
  });
  el('btn-mc-close-control')?.addEventListener('click', () => {
    managerState.view = 'manager';
    renderMaterialCouponManager(managerState);
  });
  el('btn-mc-more')?.addEventListener('click', () => {
    if (el('mc-more-actions')?.classList.contains('hidden')) openMoreActions();
    else closeMoreActions({ restoreFocus: true });
  });
  el('btn-mc-more')?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMoreActions({ focusFirst: true });
      if (event.key === 'ArrowUp') {
        const items = el('mc-more-actions')?.querySelectorAll('button:not(:disabled)');
        items?.[items.length - 1]?.focus();
      }
    }
  });
  el('mc-more-actions')?.addEventListener('click', () => closeMoreActions());
  el('mc-more-actions')?.addEventListener('keydown', (event) => {
    const items = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMoreActions({ restoreFocus: true });
      return;
    }
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') items[0].focus();
    else if (event.key === 'End') items[items.length - 1].focus();
    else {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + step + items.length) % items.length;
      items[nextIndex].focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!el('mc-more-actions')?.parentElement?.contains(event.target)) closeMoreActions();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el('mc-more-actions')?.classList.contains('hidden')) {
      event.preventDefault();
      closeMoreActions({ restoreFocus: true });
    }
  });
  el('mc-search')?.addEventListener('input', (event) => {
    managerState.search = event.target.value;
    renderMaterialCouponList(managerState.coupons, managerState.selectedId);
  });
  el('mc-status-filter')?.addEventListener('change', (event) => {
    managerState.statusFilter = event.target.value;
    managerState.listPage = 1;
    renderMaterialCouponList(managerState.coupons, managerState.selectedId);
  });
  [['mc-project-filter', 'project'], ['mc-destination-filter', 'destination'], ['mc-material-filter', 'material'], ['mc-type-filter', 'itemType'], ['mc-date-filter', 'from']].forEach(([id, key]) => {
    el(id)?.addEventListener('change', (event) => { managerState.listFilters[key] = event.target.value; managerState.listPage = 1; renderMaterialCouponList(managerState.coupons, managerState.selectedId); });
  });
}

export async function initMaterialCouponManager(options = {}) {
  deps = { ...options };
  bindManagerEvents();
  await loadCoupons();
}

export function mountMaterialCouponPage(container, options = {}) {
  resetTransientEditorState();
  notifyGeneratedCouponSaved = typeof options.onCouponSaved === 'function' ? options.onCouponSaved : null;
  managerState.selectedId = '';
  managerState.activeTab = 'header';
  managerState.editorOpen = true;
  managerState.draft = newCoupon();
  managerState.draft.lines = (Array.isArray(options.selectedMaterials) ? options.selectedMaterials : [])
    .map(inventoryLineToCouponLine);
  managerState.draft.header = {
    ...managerState.draft.header,
    ...(options.initialData || {}),
    mcCode: options.initialData?.materialCouponNo || options.initialData?.mcCode
      || nextMaterialCouponCode(options.initialData?.projectShortCode, managerState.coupons)
      || managerState.draft.header.mcCode,
  };
  managerState.draft.links = {
    ...managerState.draft.links,
    workpackId: options.initialData?.workpackId || managerState.draft.links.workpackId,
  };
  renderMaterialCouponManager(managerState);
  return { getState: () => clone(managerState) };
}
