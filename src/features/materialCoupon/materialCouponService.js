import { buildMaterialCouponReportHtml } from '../../reports/materialCouponReport.js';

const STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  DISPATCHED: 'DISPATCHED',
  RECEIVED: 'RECEIVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
});

let deps = {};
let managerState = {
  coupons: [],
  selectedId: '',
  activeTab: 'header',
  search: '',
  statusFilter: '',
  draft: null,
  history: [],
};
let managerBound = false;

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

function newCoupon() {
  const createdAt = new Date().toISOString();
  return {
    id: '',
    status: STATUS.DRAFT,
    header: {
      mcCode: `MC-${Date.now()}`,
      revision: '0',
      project: '',
      client: 'TOTAL ENERGIES',
      scope: '',
      destination: '',
      date: today(),
      workpack: '',
      docNumber: 'FORM-SDB-EXE-FAB-018-E-R01',
      docRevision: '01',
      docRevisionDate: '13/12/2025',
      docReference: 'STD_GR-SDB-EXE-FAB-008-E',
      reference: '',
      notes: '',
      remarks: '',
    },
    responsible: {
      issuing: '',
      dispatch: '',
      receiving: '',
    },
    lines: [],
    links: {
      cuttingPackageId: '',
      cuttingSheetId: '',
      rmvId: '',
    },
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
    projectId: payload.header.project,
    number: payload.header.mcCode,
    status: payload.status.toLowerCase(),
    cuttingPackageId: payload.links.cuttingPackageId,
    issuedAt: payload.status === STATUS.ISSUED ? new Date().toISOString() : '',
    items: payload.lines,
    metadata: { coupon: payload },
  };
}

function fromRecord(record = {}) {
  const payload = couponPayload(record);
  if (payload.header && Array.isArray(payload.lines)) {
    return {
      ...newCoupon(),
      ...clone(payload),
      id: record.id || payload.id || '',
      status: text(payload.status || record.status).toUpperCase() || STATUS.DRAFT,
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
  const search = managerState.search.toLowerCase();
  return managerState.coupons.filter((record) => {
    const coupon = fromRecord(record);
    const haystack = [
      coupon.header.mcCode,
      coupon.header.project,
      coupon.header.destination,
      coupon.status,
      coupon.header.date,
    ].join(' ').toLowerCase();
    return (!search || haystack.includes(search)) && (!managerState.statusFilter || coupon.status === managerState.statusFilter);
  });
}

function canEdit(coupon) {
  return coupon && ![STATUS.CLOSED, STATUS.CANCELLED].includes(coupon.status);
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
    issuing: readInput('[data-mc-field="issuing"]', coupon.responsible.issuing),
    dispatch: readInput('[data-mc-field="dispatch"]', coupon.responsible.dispatch),
    receiving: readInput('[data-mc-field="receiving"]', coupon.responsible.receiving),
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
    if (!line.po && !line.poItemNumber && !line.poItem) warnings.push(`Line ${index + 1}: PO/item is missing.`);
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

async function loadCoupons() {
  managerState.coupons = await deps.listCoupons?.() || [];
  if (managerState.selectedId && !managerState.coupons.some((coupon) => coupon.id === managerState.selectedId)) {
    managerState.selectedId = '';
    managerState.draft = null;
  }
  renderMaterialCouponManager(managerState);
}

async function saveDraft({ issue = false } = {}) {
  const coupon = readDraftFromDom();
  if (issue) {
    const validation = validateForIssue(coupon);
    if (!validation.valid) {
      deps.showToast?.(validation.errors[0] || 'Coupon has blocking errors.', 'error');
      return null;
    }
    if (validation.warnings.length) deps.showToast?.(`${validation.warnings.length} warning(s) found.`, 'warning');
    coupon.status = STATUS.ISSUED;
  }

  const saved = await deps.saveCoupon?.(toRecord(coupon));
  await deps.createAuditEntry?.(issue ? 'MATERIAL_COUPON_ISSUED' : 'MATERIAL_COUPON_SAVED', saved);
  managerState.selectedId = saved.id;
  managerState.draft = fromRecord(saved);
  await loadCoupons();
  deps.showToast?.(issue ? 'Material Coupon issued.' : 'Draft saved.', 'success');
  return saved;
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

function lineInput(line, index, key, type = 'text') {
  const control = node('input', 'mc-line-input');
  control.type = type;
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

export function renderMaterialCouponList(coupons = [], selectedId = null) {
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
  return node('span', `mc-status-pill mc-status-${status.toLowerCase()}`, status);
}

export function renderMaterialCouponHeader(coupon = {}) {
  const panel = el('mc-tab-header');
  if (!panel || !coupon) return;
  const grid = node('div', 'mc-form-grid');
  const identity = fieldGroup('Coupon Identity', [
    input('MC Code', 'mcCode', coupon.header.mcCode),
    input('Revision', 'revision', coupon.header.revision),
    input('Date', 'date', coupon.header.date, 'date'),
    input('Doc Number', 'docNumber', coupon.header.docNumber),
    input('Doc Revision', 'docRevision', coupon.header.docRevision),
    input('Doc Rev. Date', 'docRevisionDate', coupon.header.docRevisionDate),
    input('Doc Reference', 'docReference', coupon.header.docReference),
  ]);
  const project = fieldGroup('Project / Destination', [
    input('Project', 'project', coupon.header.project),
    input('Client', 'client', coupon.header.client),
    input('Scope', 'scope', coupon.header.scope),
    input('Workpack', 'workpack', coupon.header.workpack),
    input('Destination', 'destination', coupon.header.destination),
  ]);
  const responsible = fieldGroup('Responsibilities', [
    input('MC Issuing Responsible', 'issuing', coupon.responsible.issuing),
    input('Material Dispatch Responsible', 'dispatch', coupon.responsible.dispatch),
    input('Material Receiving Responsible', 'receiving', coupon.responsible.receiving),
  ]);
  grid.append(identity, project, responsible);
  panel.replaceChildren(grid);
}

function fieldGroup(title, children) {
  const group = node('section', 'mc-field-group');
  group.append(node('h3', null, title), ...children);
  return group;
}

export function renderMaterialCouponMaterials(coupon = {}) {
  const panel = el('mc-tab-materials');
  if (!panel || !coupon) return;
  const toolbar = node('div', 'mc-materials-toolbar');
  const add = button('Add Line', 'btn btn-primary', () => {
    coupon.lines.push(emptyLine(coupon.lines.length + 1));
    managerState.draft = coupon;
    renderMaterialCouponMaterials(coupon);
  });
  const duplicate = button('Duplicate Line', 'btn btn-secondary', () => {
    if (!coupon.lines.length) return;
    coupon.lines.push({ ...coupon.lines[coupon.lines.length - 1], serialNumber: String(coupon.lines.length + 1) });
    managerState.draft = coupon;
    renderMaterialCouponMaterials(coupon);
  });
  const remove = button('Remove Last', 'btn btn-secondary', () => {
    coupon.lines.pop();
    managerState.draft = coupon;
    renderMaterialCouponMaterials(coupon);
  });
  const placeholders = ['Import From Inventory Selection', 'Import From MTO', 'Import From Cutting Package']
    .map((label) => button(label, 'btn btn-secondary', () => deps.showToast?.(`${label} ainda sera integrado.`, 'warning')));
  toolbar.append(add, remove, duplicate, ...placeholders);

  const wrap = node('div', 'table-wrap');
  const table = node('table', 'data-table mc-materials-table');
  const head = node('tr');
  ['S/N', 'SAP Code', 'Item Type', 'Material Description', 'Qty', 'Unit', 'Dimensions', 'Weight', 'Mat. Grade', 'Traceability', 'Heat', 'PO', 'PO Item', 'Status', 'Notes']
    .forEach((label) => head.append(node('th', null, label)));
  const thead = node('thead');
  thead.append(head);
  const tbody = node('tbody');
  coupon.lines.forEach((line, index) => {
    const row = node('tr');
    row.append(
      td(lineInput(line, index, 'serialNumber')),
      td(lineInput(line, index, 'sapCode')),
      td(lineInput(line, index, 'itemType')),
      td(lineInput(line, index, 'materialDescription')),
      td(lineInput(line, index, 'qty')),
      td(lineInput(line, index, 'unit')),
      td(node('span', null, [line.diaMm, line.thicknessMm, line.widthMm, line.lengthMm].filter(Boolean).join(' x '))),
      td(lineInput(line, index, 'weightKg')),
      td(lineInput(line, index, 'materialGrade')),
      td(lineInput(line, index, 'traceability')),
      td(lineInput(line, index, 'heatNo')),
      td(lineInput(line, index, 'po')),
      td(lineInput(line, index, 'poItemNumber')),
      td(lineInput(line, index, 'statusMaterial')),
      td(lineInput(line, index, 'notes')),
    );
    tbody.append(row);
  });
  if (!coupon.lines.length) {
    const row = node('tr');
    const empty = node('td', 'text-muted', 'No material lines. Use Add Line to start.');
    empty.colSpan = 15;
    row.append(empty);
    tbody.append(row);
  }
  table.append(thead, tbody);
  wrap.append(table);
  panel.replaceChildren(toolbar, wrap);
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
    po: '',
    poItemNumber: '',
    statusMaterial: '',
    notes: '',
  };
}

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
  grid.append(fieldGroup('Signature Names', [
    input('MC Issuing Responsible', 'issuing', coupon.responsible.issuing),
    input('Material Dispatch Responsible', 'dispatch', coupon.responsible.dispatch),
    input('Material Receiving Responsible', 'receiving', coupon.responsible.receiving),
  ]));
  panel.replaceChildren(grid);
}

export function renderMaterialCouponNotes(coupon = {}) {
  const panel = el('mc-tab-notes');
  if (!panel || !coupon) return;
  const grid = node('div', 'mc-form-grid');
  grid.append(fieldGroup('Reference / Notes', [
    input('Reference', 'reference', coupon.header.reference, 'textarea'),
    input('Notes', 'notes', coupon.header.notes, 'textarea'),
    input('Remarks', 'remarks', coupon.header.remarks, 'textarea'),
  ]));
  panel.replaceChildren(grid);
}

export function renderMaterialCouponPreview(coupon = {}) {
  const panel = el('mc-tab-preview');
  if (!panel || !coupon) return;
  const preview = node('div', 'mc-report-preview');
  preview.id = 'mc-report-preview';
  const html = buildMaterialCouponReportHtml(coupon, deps.materialCouponReportOptions || {});
  const frame = node('iframe', 'mc-report-preview-frame');
  frame.title = 'Material Coupon Preview';
  frame.srcdoc = html;
  preview.append(frame);
  panel.replaceChildren(preview);
}

export function renderMaterialCouponHistory(coupon = {}) {
  const panel = el('mc-tab-history');
  if (!panel) return;
  const events = Array.isArray(coupon.audit) && coupon.audit.length ? coupon.audit : managerState.history;
  if (!events.length) {
    panel.replaceChildren(node('p', 'text-muted', 'No audit events loaded yet.'));
    return;
  }
  const list = node('div', 'mc-history-list');
  events.forEach((event) => {
    list.append(node('div', 'mc-history-item', `${event.eventType || event.action || 'EVENT'} · ${event.timestamp || event.createdAt || ''}`));
  });
  panel.replaceChildren(list);
}

function renderActiveTab(coupon) {
  clearPanels();
  if (!coupon) return;
  renderMaterialCouponHeader(coupon);
  renderMaterialCouponMaterials(coupon);
  renderMaterialCouponSignatures(coupon);
  renderMaterialCouponNotes(coupon);
  renderMaterialCouponPreview(coupon);
  renderMaterialCouponHistory(coupon);
  document.querySelectorAll('.mc-tab-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `mc-tab-${managerState.activeTab}`);
    panel.classList.toggle('active', panel.id === `mc-tab-${managerState.activeTab}`);
  });
}

function renderKpis(coupons) {
  const container = el('material-coupon-kpis');
  if (!container) return;
  const normalized = coupons.map(fromRecord);
  const count = (status) => normalized.filter((coupon) => coupon.status === status).length;
  container.replaceChildren(
    kpi('Total Coupons', coupons.length),
    kpi('Draft', count(STATUS.DRAFT)),
    kpi('Issued', count(STATUS.ISSUED)),
    kpi('Dispatched', count(STATUS.DISPATCHED)),
    kpi('Received / Closed', count(STATUS.RECEIVED) + count(STATUS.CLOSED)),
  );
}

function kpi(label, value) {
  const card = node('div', 'kpi-card');
  card.append(node('div', 'kpi-label', label), node('div', 'kpi-value', String(value)));
  return card;
}

export function renderMaterialCouponManager(state = managerState) {
  renderKpis(state.coupons);
  renderMaterialCouponList(state.coupons, state.selectedId);
  renderWorkspaceTitle();
  const coupon = selectedCoupon();
  renderActiveTab(coupon);
  const editable = canEdit(coupon);
  ['btn-mc-save', 'btn-mc-issue'].forEach((id) => {
    const control = el(id);
    if (control) control.disabled = !coupon || !editable;
  });
  ['btn-mc-duplicate', 'btn-mc-export-extract', 'btn-mc-export-excel', 'btn-mc-print'].forEach((id) => {
    const control = el(id);
    if (control) control.disabled = !coupon;
  });
}

export function getSelectedMaterialCouponId() {
  return managerState.selectedId;
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

async function exportExtract() {
  const coupon = selectedCoupon();
  if (!coupon) return;
  deps.exportMaterialCouponExtract?.(coupon);
}

async function exportExcel() {
  const coupon = selectedCoupon();
  if (!coupon) return;
  deps.exportMaterialCouponExcel?.(coupon);
}

async function printSelected() {
  const coupon = readDraftFromDom();
  if (!coupon) return;
  try {
    const opened = await deps.printMaterialCouponReport?.(coupon);
    if (!opened) deps.showToast?.('Browser blocked the print window.', 'error');
  } catch (error) {
    console.error(error);
    deps.showToast?.('Could not open the Material Coupon report.', 'error');
  }
}

function bindManagerEvents() {
  if (managerBound) return;
  managerBound = true;
  el('btn-mc-new')?.addEventListener('click', () => {
    managerState.selectedId = '';
    managerState.draft = newCoupon();
    managerState.activeTab = 'header';
    renderMaterialCouponManager(managerState);
  });
  el('btn-mc-refresh')?.addEventListener('click', loadCoupons);
  el('btn-mc-save')?.addEventListener('click', () => saveDraft());
  el('btn-mc-issue')?.addEventListener('click', () => saveDraft({ issue: true }));
  el('btn-mc-duplicate')?.addEventListener('click', duplicateSelected);
  el('btn-mc-export-extract')?.addEventListener('click', exportExtract);
  el('btn-mc-export-excel')?.addEventListener('click', exportExcel);
  el('btn-mc-print')?.addEventListener('click', printSelected);
  el('btn-mc-back')?.addEventListener('click', () => deps.onBack?.());
  el('mc-search')?.addEventListener('input', (event) => {
    managerState.search = event.target.value;
    renderMaterialCouponList(managerState.coupons, managerState.selectedId);
  });
  el('mc-status-filter')?.addEventListener('change', (event) => {
    managerState.statusFilter = event.target.value;
    renderMaterialCouponList(managerState.coupons, managerState.selectedId);
  });
  document.querySelectorAll('[data-mc-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      readDraftFromDom();
      managerState.activeTab = tab.dataset.mcTab;
      document.querySelectorAll('[data-mc-tab]').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === tab);
      });
      renderMaterialCouponManager(managerState);
    });
  });
}

export async function initMaterialCouponManager(options = {}) {
  deps = { ...options };
  bindManagerEvents();
  await loadCoupons();
}

export function mountMaterialCouponPage(container, options = {}) {
  managerState.selectedId = '';
  managerState.activeTab = 'header';
  managerState.draft = newCoupon();
  managerState.draft.lines = (Array.isArray(options.selectedMaterials) ? options.selectedMaterials : [])
    .map((item, index) => ({
      ...emptyLine(index + 1),
      serialNumber: String(index + 1),
      sapCode: item.sapCode || item.sap || item.identCode || item.IdentCode || '',
      itemType: item.itemCategory || item.category || item.type || item.profile || '',
      materialDescription: item.materialDescription || item.description || item.Description || item.desc || '',
      qty: item.qty || item.quantity || '1',
      unit: item.unit || item.un || 'EA',
      lengthMm: item.lengthMm || item.length || item.currentLength || item.originalLength || '',
      weightKg: item.weightKg || item.weight || '',
      materialGrade: item.materialGrade || item.grade || item.material || '',
      traceability: item.traceability || item.trace || '',
      heatNo: item.heatNo || item.heatNumber || item.heat || '',
      po: item.po || item.purchaseOrder || '',
      poItemNumber: item.item || item.poItem || '',
      notes: item.notes || item.note || '',
    }));
  managerState.draft.header = {
    ...managerState.draft.header,
    ...(options.initialData || {}),
    mcCode: options.initialData?.materialCouponNo || options.initialData?.mcCode || managerState.draft.header.mcCode,
  };
  renderMaterialCouponManager(managerState);
  return { getState: () => clone(managerState) };
}
