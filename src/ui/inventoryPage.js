import {
  getAllInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItems,
  saveInventoryItems,
} from '../data/inventoryDB.js';
import { parseInventoryRows } from '../data/inventoryImport.js';
import { readExcelFile } from '../data/excel.js';
import { createStockMovement, STOCK_MOVEMENT_TYPES } from '../data/stockMovements.js';
import { createAuditEvent, AUDIT_EVENT_TYPES } from '../data/auditLog.js';
import { commitInventoryAdjustment } from '../data/inventoryAdjustmentTransaction.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

const stateByContainer = new WeakMap();

const STATUSES = ['available', 'reserved', 'issued', 'consumed', 'returned', 'scrap', 'on-hold', 'quarantine'];
const QUALITY_STATUSES = ['ACCEPTED', 'PENDING', 'HOLD', 'QUARANTINE', 'REJECTED'];
const EDIT_FIELD_GROUPS = Object.freeze([
  {
    title: 'Identification',
    fields: ['status', 'traceability', 'category', 'materialDescription', 'materialClassification', 'materialGrade'],
  },
  {
    title: 'Dimensions & Quantity',
    fields: ['thicknessMm', 'diaMm', 'widthMm', 'lengthMm', 'unit', 'weightKg', 'totalPoQty', 'receivedQty', 'issuedQty', 'balanceQty'],
  },
  {
    title: 'Procurement',
    fields: ['vendor', 'poItemPo', 'po', 'poItem', 'poSubject', 'sapCode', 'regime', 'nfArrival', 'receivedDate', 'mrr'],
  },
  {
    title: 'Quality & Certification',
    fields: ['partNumber', 'serialNumber', 'mtcNumber', 'heatNo', 'mir', 'inspectionStatus', 'acceptanceStatus', 'qualityStatus'],
  },
  {
    title: 'Location',
    fields: ['location', 'locationZone', 'equipment', 'colorCode'],
  },
  {
    title: 'Movement',
    fields: ['materialCouponNo', 'exitDate', 'exitInvoice', 'rmvNo'],
  },
  {
    title: 'Comments',
    fields: ['notes'],
  },
]);
const EDIT_FIELDS = EDIT_FIELD_GROUPS.flatMap((group) => group.fields);

const EDIT_FIELD_LABELS = Object.freeze({
  status: 'Status',
  traceability: 'Traceability',
  vendor: 'Vendor/Supplier',
  poItemPo: 'PO - Item PO',
  category: 'Category',
  materialDescription: 'Material Description',
  materialClassification: 'Material Classification',
  thicknessMm: 'Thk (mm)',
  diaMm: 'Dia. (OD) (mm)',
  widthMm: 'Width (mm)',
  lengthMm: 'Length (mm)',
  unit: 'Unit of Measure',
  weightKg: 'Total Weight (KG)',
  nfArrival: 'Entry Invoice [NF]',
  receivedDate: 'Received Date',
  mrr: 'MRR',
  poSubject: 'PO Subject / Chrono Number',
  po: 'PO Number',
  poItem: 'PO Item #',
  sapCode: 'SAP Code',
  regime: 'Regime',
  partNumber: 'Part Number',
  serialNumber: 'Serial Number',
  mtcNumber: 'MTC Number [Certificate]',
  heatNo: 'Heat Number',
  materialGrade: 'Material & Grade',
  mir: 'MIR Number',
  inspectionStatus: 'Inspection Status',
  acceptanceStatus: 'Acceptance Status',
  qualityStatus: 'Quality Release Status',
  colorCode: 'Color Code',
  location: 'Storage Location',
  locationZone: 'Location Zone',
  equipment: 'Equipment Designation',
  totalPoQty: 'Total PO Qty',
  receivedQty: 'Received Qty',
  issuedQty: 'Issued Mat. Qty',
  balanceQty: 'Balance Qty',
  materialCouponNo: 'Material Coupon No.',
  exitDate: 'Exit / Movement Date at CTCO',
  exitInvoice: 'Exit Invoice [NF]',
  rmvNo: 'RMV No.',
  notes: 'Comments',
});

const QUICK_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'available', label: 'Disponíveis' },
  { id: 'reserved', label: 'Reservados' },
  { id: 'quality-pending', label: 'Aguardando qualidade' },
  { id: 'missing-traceability', label: 'Sem rastreabilidade' },
  { id: 'returned', label: 'Retornos' },
];

const COLUMN_VIEW_LABELS = Object.freeze({
  essential: 'Essencial',
  procurement: 'Suprimento',
  quality: 'Qualidade',
  location: 'Localização',
  movement: 'Movimentação',
  complete: 'Completa',
});

function el(tag, className, textValue) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textValue != null) node.textContent = textValue;
  return node;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  if (value === '' || value == null) return 0;
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function itemId(item) {
  return text(item.id || item.trace || item.traceability);
}

function fieldValue(item, fields) {
  for (const field of fields) {
    if (text(item[field])) return text(item[field]);
  }
  return '';
}

function lengthValue(item) {
  return numberValue(item.lengthMm);
}

function weightValue(item) {
  return numberValue(item.weightKg);
}

export function normalizeInventorySearchText(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

export function getInventoryStatus(item) {
  const status = normalizeInventorySearchText(item?.status);
  return STATUSES.includes(status) ? status : 'available';
}

export function getInventoryCategoryKey(item) {
  return fieldValue(item || {}, ['category', 'type', 'profile', 'materialGrade', 'materialDescription']) || 'Uncategorized';
}

export function getInventoryQualityState(item = {}) {
  const inspection = text(item.inspectionStatus).toUpperCase();
  const release = text(item.qualityStatus || item.acceptanceStatus || 'ACCEPTED').toUpperCase();
  const blocked = ['REJECTED', 'HOLD', 'ON_HOLD', 'QUARANTINE', 'QUARANTINED'];
  if (blocked.includes(inspection) || blocked.includes(release)) return 'blocked';
  if (inspection && !['ACCEPTED', 'APPROVED', 'RELEASED', 'N/A', 'NA', 'N A'].includes(inspection)) return 'pending';
  if (!['ACCEPTED', 'APPROVED', 'RELEASED', 'LIBERADO', 'ACEITO', 'N/A', 'NA', 'N A'].includes(release)) return 'pending';
  return 'accepted';
}

export function inventoryRowMatchesSearch(item, query) {
  const tokens = normalizeInventorySearchText(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const rowText = normalizeInventorySearchText([
    item.id,
    item.po,
    item.poItem,
    item.category,
    item.type,
    item.profile,
    item.materialGrade,
    item.materialDescription,
    item.materialClassification,
    item.heatNo,
    item.traceability,
    item.trace,
    item.status,
    item.projectId,
    item.sourceDocumentId,
    item.vendor,
    item.poItem,
    item.sapCode,
    item.location,
    item.locationZone,
    item.equipment,
    item.materialCouponNo,
    item.rmvNo,
    item.notes,
  ].join(' '));
  return tokens.every((token) => rowText.includes(token));
}

export function calculateInventoryDashboard(items) {
  const source = Array.isArray(items) ? items : [];
  return {
    total: source.length,
    available: source.filter((item) => getInventoryStatus(item) === 'available').length,
    reserved: source.filter((item) => getInventoryStatus(item) === 'reserved').length,
    issued: source.filter((item) => getInventoryStatus(item) === 'issued').length,
    consumed: source.filter((item) => getInventoryStatus(item) === 'consumed').length,
    returned: source.filter((item) => getInventoryStatus(item) === 'returned').length,
    qualityPending: source.filter((item) => getInventoryQualityState(item) === 'pending').length,
    qualityBlocked: source.filter((item) => getInventoryQualityState(item) === 'blocked').length,
    missingTraceability: source.filter((item) => !fieldValue(item, ['traceability', 'trace'])).length,
    missingHeat: source.filter((item) => !text(item.heatNo)).length,
    availableLength: source
      .filter((item) => getInventoryStatus(item) === 'available')
      .reduce((sum, item) => sum + lengthValue(item), 0),
    totalWeight: source.reduce((sum, item) => sum + weightValue(item), 0),
  };
}

function uniqueValues(items, getter) {
  return [...new Set(items.map(getter).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getInitialState(options) {
  return {
    activeTab: 'all',
    categoryGroup: '',
    filtersExpanded: false,
    selectedIds: new Set(),
    filters: {
      search: '',
      category: '',
      material: '',
      status: '',
      heat: '',
      traceabilityStatus: '',
    },
    sort: {
      key: null,
      direction: 'asc',
    },
    columnView: 'essential',
    options,
  };
}

function getState(container, options) {
  if (!stateByContainer.has(container)) stateByContainer.set(container, getInitialState(options));
  const state = stateByContainer.get(container);
  if (!state.sort) state.sort = { key: null, direction: 'asc' };
  if (!state.columnView) state.columnView = 'essential';
  state.options = options;
  return state;
}

function captureFocus(container) {
  const active = document.activeElement;
  if (!active || !container.contains(active)) return null;
  return {
    id: active.id || '',
    name: active.name || '',
    focusKey: active.dataset?.focusKey || '',
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

function restoreFocus(container, snapshot) {
  if (!snapshot) return;
  const selector = snapshot.id
    ? `#${snapshot.id}`
    : snapshot.focusKey
      ? `[data-focus-key="${snapshot.focusKey}"]`
      : snapshot.name
        ? `[name="${snapshot.name}"]`
        : '';
  if (!selector) return;
  const next = container.querySelector(selector);
  if (!next) return;
  next.focus();
  if (snapshot.start != null && typeof next.setSelectionRange === 'function') {
    next.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
  }
}

function captureScrollPosition(container) {
  const tableWrap = container.querySelector('.inventory-page-table-wrap');
  const ancestorPositions = [];
  let ancestor = container.parentElement;

  while (ancestor) {
    if (ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth) {
      ancestorPositions.push({
        element: ancestor,
        top: ancestor.scrollTop,
        left: ancestor.scrollLeft,
      });
    }
    ancestor = ancestor.parentElement;
  }

  return {
    tableTop: tableWrap?.scrollTop ?? 0,
    tableLeft: tableWrap?.scrollLeft ?? 0,
    viewportTop: window.scrollY,
    viewportLeft: window.scrollX,
    ancestorPositions,
  };
}

function restoreScrollPosition(container, snapshot) {
  if (!snapshot) return;
  const tableWrap = container.querySelector('.inventory-page-table-wrap');
  if (tableWrap) {
    tableWrap.scrollTop = snapshot.tableTop;
    tableWrap.scrollLeft = snapshot.tableLeft;
  }

  snapshot.ancestorPositions.forEach(({ element, top, left }) => {
    element.scrollTop = top;
    element.scrollLeft = left;
  });

  window.requestAnimationFrame(() => {
    window.scrollTo(snapshot.viewportLeft, snapshot.viewportTop);
    snapshot.ancestorPositions.forEach(({ element, top, left }) => {
      element.scrollTop = top;
      element.scrollLeft = left;
    });
  });
}

function applyTab(items, state) {
  if (state.activeTab === 'missing-traceability') return items.filter((item) => !fieldValue(item, ['traceability', 'trace']));
  if (state.activeTab === 'missing-heat') return items.filter((item) => !text(item.heatNo));
  if (state.activeTab === 'returned') return items.filter((item) => getInventoryStatus(item) === 'returned');
  if (state.activeTab === 'quality-pending') return items.filter((item) => getInventoryQualityState(item) !== 'accepted');
  if (STATUSES.includes(state.activeTab)) return items.filter((item) => getInventoryStatus(item) === state.activeTab);
  return items;
}

function applyFilters(items, state) {
  const filters = state.filters;
  return items.filter((item) => (
    inventoryRowMatchesSearch(item, filters.search) &&
    (!filters.category || getInventoryCategoryKey(item) === filters.category) &&
    (!filters.material || text(item.materialGrade) === filters.material) &&
    (!filters.status || getInventoryStatus(item) === filters.status) &&
    (!filters.heat || text(item.heatNo) === filters.heat) &&
    (!filters.traceabilityStatus ||
      (filters.traceabilityStatus === 'with' && !!fieldValue(item, ['traceability', 'trace'])) ||
      (filters.traceabilityStatus === 'missing' && !fieldValue(item, ['traceability', 'trace'])))
  ));
}

function getSortValue(item, key) {
  return COLUMN_DEFINITIONS[key]?.sortValue?.(item) ?? '';
}

function getCurrentColumns(state) {
  const keys = COLUMN_VIEWS[state.columnView] || COLUMN_VIEWS.essential;
  return keys.map((key) => COLUMN_DEFINITIONS[key]).filter(Boolean);
}

function applySort(items, state) {
  const sort = state.sort || {};
  if (!sort.key) return items;
  const visibleColumn = getCurrentColumns(state).find((column) => column.key === sort.key && column.sortable);
  if (!visibleColumn) return items;
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...items].sort((left, right) => {
    const leftValue = getSortValue(left, sort.key);
    const rightValue = getSortValue(right, sort.key);
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: 'base', numeric: true }) * direction;
  });
}

function getVisibleItems(items, state) {
  return applySort(applyFilters(applyTab(items, state), state), state);
}

function selectedItems(items, state) {
  return items.filter((item) => state.selectedIds.has(itemId(item)));
}

function kpi(label, value, options = {}) {
  const card = el(options.onClick ? 'button' : 'div', `inventory-kpi-card${options.active ? ' active' : ''}`);
  if (options.onClick) {
    card.type = 'button';
    card.addEventListener('click', options.onClick);
  }
  card.append(el('span', null, label), el('strong', null, value));
  if (options.note) card.append(el('small', null, options.note));
  return card;
}

function renderDashboard(items, state, visibleCount, rerender) {
  const summary = calculateInventoryDashboard(items);
  const section = el('section', 'inventory-page-dashboard');
  const heading = el('div', 'inventory-dashboard-heading');
  const headingCopy = el('div');
  headingCopy.append(el('span', 'inventory-section-label', 'Visão geral'), el('h2', null, 'Situação do estoque'));
  heading.append(headingCopy, el('span', 'inventory-dashboard-context', `${visibleCount} de ${summary.total} itens exibidos`));
  const grid = el('div', 'inventory-kpi-grid');
  grid.append(
    kpi('Total no Inventory', String(summary.total), { active: state.activeTab === 'all', onClick: () => { state.activeTab = 'all'; rerender(); } }),
    kpi('Disponíveis', String(summary.available), { active: state.activeTab === 'available', onClick: () => { state.activeTab = 'available'; rerender(); }, note: `${summary.availableLength.toLocaleString('pt-BR')} mm disponíveis` }),
    kpi('Reservados', String(summary.reserved), { active: state.activeTab === 'reserved', onClick: () => { state.activeTab = 'reserved'; rerender(); } }),
    kpi('Qualidade pendente', String(summary.qualityPending + summary.qualityBlocked), { active: state.activeTab === 'quality-pending', onClick: () => { state.activeTab = 'quality-pending'; rerender(); }, note: `${summary.qualityBlocked} bloqueado(s)` }),
    kpi('Sem rastreabilidade', String(summary.missingTraceability), { active: state.activeTab === 'missing-traceability', onClick: () => { state.activeTab = 'missing-traceability'; rerender(); } }),
    kpi('Peso cadastrado', `${summary.totalWeight.toLocaleString('pt-BR')} kg`, { note: `${state.selectedIds.size} selecionado(s)` }),
  );
  section.append(heading, grid);
  return section;
}

function renderTabs(items, state, rerender) {
  const tabs = el('nav', 'inventory-page-tabs');
  tabs.setAttribute('aria-label', 'Filtros rápidos do Inventory');
  QUICK_FILTERS.forEach((tab) => {
    const button = el('button', `inventory-tabs-item${state.activeTab === tab.id ? ' active' : ''}`, tab.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.activeTab = tab.id;
      rerender();
    });
    tabs.append(button);
  });

  return tabs;
}

function renderSelect(label, value, options, onChange, emptyLabel = 'Todos') {
  const field = el('label', 'field');
  field.append(el('span', null, label));
  const select = el('select');
  const empty = el('option', null, emptyLabel);
  empty.value = '';
  select.append(empty);
  options.forEach((optionValue) => {
    const option = el('option', null, optionValue.label || optionValue);
    option.value = optionValue.value || optionValue;
    option.selected = option.value === value;
    select.append(option);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  field.append(select);
  return field;
}

function renderFilters(items, state, rerender) {
  const filters = el('section', 'inventory-page-filters');
  const searchField = el('label', 'inventory-search-field');
  const search = el('input');
  search.id = 'inventory-search-input';
  search.type = 'search';
  search.placeholder = 'Buscar por material, trace, heat, PO ou local...';
  search.value = state.filters.search;
  search.addEventListener('input', () => {
    state.filters.search = search.value;
    rerender();
  });
  searchField.append(search);

  const toggle = el('button', `btn btn-ghost inventory-filter-toggle${state.filtersExpanded ? ' active' : ''}`, state.filtersExpanded ? 'Ocultar filtros' : 'Filtros');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(state.filtersExpanded));
  toggle.addEventListener('click', () => {
    state.filtersExpanded = !state.filtersExpanded;
    rerender();
  });
  const commandbar = el('div', 'inventory-filter-commandbar');
  commandbar.append(searchField, toggle);
  filters.append(commandbar);
  if (!state.filtersExpanded) return filters;

  const advanced = el('div', 'inventory-filter-fields');
  advanced.append(
    renderSelect('Category', state.filters.category, uniqueValues(items, getInventoryCategoryKey), (value) => { state.filters.category = value; rerender(); }),
    renderSelect('Material', state.filters.material, uniqueValues(items, (item) => text(item.materialGrade)), (value) => { state.filters.material = value; rerender(); }),
    renderSelect('Status', state.filters.status, STATUSES, (value) => { state.filters.status = value; rerender(); }),
    renderSelect('Heat', state.filters.heat, uniqueValues(items, (item) => text(item.heatNo)), (value) => { state.filters.heat = value; rerender(); }),
    renderSelect('Traceability', state.filters.traceabilityStatus, [
      { value: 'with', label: 'With Traceability' },
      { value: 'missing', label: 'Missing Traceability' },
    ], (value) => { state.filters.traceabilityStatus = value; rerender(); }, 'All'),
  );

  const clear = el('button', 'btn btn-ghost', 'Clear filters');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    state.filters = { search: '', category: '', material: '', status: '', heat: '', traceabilityStatus: '' };
    rerender();
  });
  advanced.append(clear);
  filters.append(advanced);
  return filters;
}

function readForm(form) {
  return Object.fromEntries(EDIT_FIELDS.map((field) => {
    const input = form.querySelector(`[name="${field}"]`);
    return [field, input?.value?.trim() || ''];
  }));
}

function itemPatchFromForm(form) {
  const values = readForm(form);
  return {
    status: values.status || 'available',
    trace: values.traceability,
    traceability: values.traceability,
    vendor: values.vendor,
    category: values.category,
    materialDescription: values.materialDescription,
    materialClassification: values.materialClassification,
    poItemPo: values.poItemPo,
    po: values.po,
    poItem: values.poItem,
    poSubject: values.poSubject,
    sapCode: values.sapCode,
    regime: values.regime,
    materialGrade: values.materialGrade,
    thicknessMm: values.thicknessMm,
    diaMm: values.diaMm,
    widthMm: values.widthMm,
    lengthMm: numberValue(values.lengthMm),
    unit: values.unit,
    weightKg: numberValue(values.weightKg),
    totalPoQty: numberValue(values.totalPoQty),
    receivedQty: numberValue(values.receivedQty),
    issuedQty: numberValue(values.issuedQty),
    balanceQty: numberValue(values.balanceQty),
    nfArrival: values.nfArrival,
    receivedDate: values.receivedDate,
    mrr: values.mrr,
    partNumber: values.partNumber,
    serialNumber: values.serialNumber,
    mtcNumber: values.mtcNumber,
    heatNo: values.heatNo,
    mir: values.mir,
    inspectionStatus: values.inspectionStatus,
    acceptanceStatus: values.acceptanceStatus,
    qualityStatus: values.qualityStatus || 'ACCEPTED',
    qualitySource: 'manual',
    colorCode: values.colorCode,
    location: values.location,
    locationZone: values.locationZone,
    equipment: values.equipment,
    materialCouponNo: values.materialCouponNo,
    exitDate: values.exitDate,
    exitInvoice: values.exitInvoice,
    rmvNo: values.rmvNo,
    notes: values.notes,
  };
}

function editValue(item, field) {
  const values = {
    status: getInventoryStatus(item),
    traceability: fieldValue(item, ['traceability', 'trace']),
    vendor: fieldValue(item, ['vendor', 'vendorSupplier', 'supplier']),
    category: getInventoryCategoryKey(item) === 'Uncategorized' ? '' : getInventoryCategoryKey(item),
    materialDescription: text(item.materialDescription),
    materialClassification: text(item.materialClassification),
    thicknessMm: text(item.thicknessMm),
    diaMm: text(item.diaMm),
    widthMm: text(item.widthMm),
    lengthMm: String(lengthValue(item) || ''),
    unit: text(item.unit),
    weightKg: text(item.weightKg),
    totalPoQty: text(item.totalPoQty),
    receivedQty: text(item.receivedQty),
    issuedQty: fieldValue(item, ['issuedQty', 'issuedMatQty']),
    balanceQty: text(item.balanceQty),
    poItemPo: text(item.poItemPo),
    po: text(item.po),
    poItem: text(item.poItem),
    poSubject: fieldValue(item, ['poSubject', 'chronoNumber']),
    sapCode: text(item.sapCode),
    regime: text(item.regime),
    nfArrival: text(item.nfArrival),
    receivedDate: text(item.receivedDate),
    mrr: text(item.mrr),
    partNumber: text(item.partNumber),
    serialNumber: text(item.serialNumber),
    mtcNumber: fieldValue(item, ['mtcNumber', 'certificate']),
    heatNo: text(item.heatNo),
    materialGrade: text(item.materialGrade),
    mir: text(item.mir),
    inspectionStatus: text(item.inspectionStatus),
    acceptanceStatus: text(item.acceptanceStatus),
    qualityStatus: text(item.qualityStatus || 'ACCEPTED').toUpperCase(),
    colorCode: text(item.colorCode),
    location: text(item.location),
    locationZone: text(item.locationZone),
    equipment: text(item.equipment),
    materialCouponNo: text(item.materialCouponNo),
    exitDate: text(item.exitDate),
    exitInvoice: text(item.exitInvoice),
    rmvNo: text(item.rmvNo),
    notes: text(item.notes),
  };
  return values[field] || '';
}

function inputTypeForField(field) {
  if (['lengthMm', 'thicknessMm', 'diaMm', 'widthMm', 'weightKg', 'totalPoQty', 'receivedQty', 'issuedQty', 'balanceQty'].includes(field)) return 'number';
  if (['receivedDate', 'exitDate'].includes(field)) return 'date';
  return 'text';
}

function renderEditField(field, item) {
  const label = el('label', 'field');
  label.append(el('span', null, EDIT_FIELD_LABELS[field] || field));
  const control = ['status', 'qualityStatus'].includes(field) ? el('select') : el('input');
  control.name = field;
  if (['status', 'qualityStatus'].includes(field)) {
    const options = field === 'status' ? STATUSES : QUALITY_STATUSES;
    options.forEach((status) => {
      const option = el('option', null, status);
      option.value = status;
      option.selected = status === editValue(item, field);
      control.append(option);
    });
  } else {
    control.type = inputTypeForField(field);
    control.value = editValue(item, field);
  }
  label.append(control);
  return label;
}

function renderItemForm(item = {}) {
  const form = el('div', 'inventory-edit-form');
  EDIT_FIELD_GROUPS.forEach((group) => {
    const fieldset = el('fieldset', 'inventory-edit-fieldset');
    fieldset.append(el('legend', null, group.title));
    const grid = el('div', 'inventory-edit-fieldset-grid');
    group.fields.forEach((field) => {
      grid.append(renderEditField(field, item));
    });
    fieldset.append(grid);
    form.append(fieldset);
  });
  return form;
}

function validateInventoryPatch(patch) {
  const errors = [];
  if (!text(patch.materialGrade)) errors.push('Material e obrigatorio.');
  const categoryText = normalizeInventorySearchText(`${patch.category} ${patch.type || ''} ${patch.profile || ''}`);
  const lengthBased = ['pipe', 'beam', 'bar', 'profile', 'tubo', 'barra', 'perfil'].some((token) => categoryText.includes(token));
  if (lengthBased && numberValue(patch.lengthMm) <= 0) errors.push('Comprimento e obrigatorio para materiais lineares.');
  return errors;
}

function duplicateItemDraft(item) {
  return {
    ...item,
    id: '',
    trace: '',
    traceability: '',
    heatNo: '',
    status: getInventoryStatus(item),
  };
}

function openAddItemModal(state, rerender, initialItem = { status: 'available' }) {
  const form = renderItemForm(initialItem);
  openModal({
    title: 'Adicionar item ao inventario',
    body: form,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          const patch = itemPatchFromForm(form);
          const errors = validateInventoryPatch(patch);
          if (errors.length) {
            showToast(errors[0], 'error');
            return;
          }
          if (!patch.traceability) showToast('Item salvo sem rastreabilidade.', 'error');
          if (!patch.heatNo) showToast('Item salvo sem Heat.', 'error');
          const saved = await createInventoryItem(patch);
          state.selectedIds.clear();
          state.selectedIds.add(itemId(saved));
          closeModal();
          showToast('Item de inventario criado.', 'success');
          await rerender(true);
        },
      },
    ],
  });
}

function openEditItemModal(item, rerender) {
  const form = renderItemForm(item);
  let modalHandle = null;
  const setBusy = (busy) => {
    form.setAttribute('aria-busy', String(busy));
    form.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = busy; });
    const saveButton = modalHandle?.bodyEl?.closest('.modal')?.querySelector('.modal-footer .btn-primary');
    if (saveButton) {
      saveButton.disabled = busy;
      saveButton.textContent = busy ? 'Salvando…' : 'Salvar';
    }
  };
  modalHandle = openModal({
    title: 'Editar item do inventario',
    body: form,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          const patch = itemPatchFromForm(form);
          const errors = validateInventoryPatch(patch);
          if (errors.length) {
            showToast(errors[0], 'error');
            return;
          }
          setBusy(true);
          try {
            await commitInventoryAdjustment(itemId(item), patch);
          } catch (error) {
            console.error(error);
            showToast(inventoryAdjustmentErrorMessage(error, item), 'error');
            return;
          } finally {
            setBusy(false);
          }
          closeModal();
          showToast('Item de inventario atualizado.', 'success');
          await rerender(true);
        },
      },
    ],
  });
}

function inventoryAdjustmentErrorMessage(error = {}, item = {}) {
  const code = error.code || String(error.message || '').split(':')[0];
  const traceability = fieldValue(item, ['traceability', 'trace']) || itemId(item);
  const messages = {
    INVENTORY_ITEM_ID_REQUIRED: 'Não foi possível identificar o item de Inventory.',
    INVENTORY_ITEM_NOT_FOUND: `O item ${traceability || 'selecionado'} não foi encontrado no Inventory. Atualize a página e tente novamente.`,
    INVENTORY_UPDATE_FAILED: 'Falha de armazenamento: não foi possível atualizar o item de Inventory.',
    STOCK_MOVEMENT_WRITE_FAILED: 'Falha de armazenamento: não foi possível registrar a movimentação de estoque; nenhuma alteração foi salva.',
    AUDIT_WRITE_FAILED: 'Falha de armazenamento: não foi possível registrar a auditoria; nenhuma alteração foi salva.',
  };
  if (messages[code]) return messages[code];
  return error.message
    ? `Não foi possível salvar o ajuste de Inventory: ${error.message}`
    : 'Não foi possível salvar o ajuste de Inventory.';
}

async function logInventoryAdjustment(before, after, bulkAction, reason = 'Inventory status updated from Inventory page') {
  try {
    await createStockMovement({
      movementType: STOCK_MOVEMENT_TYPES.MANUAL_ADJUSTMENT,
      inventoryItemId: itemId(after || before),
      projectId: after?.projectId || before?.projectId || '',
      previousStatus: before?.status || '',
      nextStatus: after?.status || '',
      reason,
      before,
      after,
      metadata: { source: 'inventoryPage', bulkAction },
    });
  } catch (error) {
    console.warn('Falha ao registrar movimentacao de estoque.', error);
  }

  try {
    await createAuditEvent({
      eventType: AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT,
      entityType: 'inventoryItem',
      entityId: itemId(after || before),
      projectId: after?.projectId || before?.projectId || '',
      before,
      after,
      metadata: { source: 'inventoryPage', bulkAction },
    });
  } catch (error) {
    console.warn('Falha ao registrar auditoria de inventario.', error);
  }
}

function openDeleteDialog(items, state, rerender) {
  const body = el('div', 'inventory-delete-dialog');
  const count = items.length;
  body.append(el('p', null, count === 1 ? 'Deseja excluir 1 item do inventario?' : `Deseja excluir ${count} itens do inventario?`));
  if (items.some((item) => ['reserved', 'issued', 'consumed', 'returned'].includes(getInventoryStatus(item)))) {
    body.append(el('p', 'text-critical', 'Alguns itens possuem status operacional. Para auditoria, prefira alterar o status em vez de excluir.'));
  }

  openModal({
    title: 'Excluir itens do inventario',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Excluir',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          await deleteInventoryItems(items.map(itemId));
          items.forEach((item) => state.selectedIds.delete(itemId(item)));
          closeModal();
          showToast(`${count} item(ns) excluido(s).`, 'success');
          await rerender(true);
        },
      },
    ],
  });
}

function openStatusModal(items, rerender) {
  const body = el('div', 'inventory-status-dialog');
  const select = el('select');
  STATUSES.forEach((status) => {
    const option = el('option', null, status);
    option.value = status;
    select.append(option);
  });
  const reason = el('p', 'text-muted', 'A alteracao sera registrada como ajuste manual local.');
  body.append(select, reason);

  openModal({
    title: 'Alterar status',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Aplicar',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          const nextStatus = select.value;
          await Promise.all(items.map(async (item) => {
            const before = { ...item };
            const updated = await updateInventoryItem(itemId(item), { status: nextStatus });
            await logInventoryAdjustment(before, updated, true);
          }));
          closeModal();
          showToast(`${items.length} item(ns) atualizado(s).`, 'success');
          await rerender(true);
        },
      },
    ],
  });
}

function openQualityAcceptanceModal(items, rerender) {
  const pending = items.filter((item) => getInventoryQualityState(item) !== 'accepted');
  const body = el('div', 'inventory-quality-dialog');
  body.append(
    el('p', null, pending.length === 1
      ? 'Confirmar o aceite de qualidade deste material?'
      : `Confirmar o aceite de qualidade de ${pending.length} materiais?`),
    el('p', 'text-muted', 'Inspection, acceptance e quality release serão registrados como ACCEPTED.'),
  );
  if (pending.length !== items.length) {
    body.append(el('p', 'inventory-quality-note', `${items.length - pending.length} item(ns) já aceito(s) serão mantidos sem alteração.`));
  }

  openModal({
    title: 'Aceite de qualidade',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: `Aceitar ${pending.length || ''}`.trim(),
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          if (!pending.length) {
            closeModal();
            showToast('Os materiais selecionados já estão aceitos.', 'info');
            return;
          }
          await Promise.all(pending.map(async (item) => {
            const before = { ...item };
            const updated = await updateInventoryItem(itemId(item), {
              inspectionStatus: 'ACCEPTED',
              acceptanceStatus: 'ACCEPTED',
              qualityStatus: 'ACCEPTED',
              qualitySource: 'explicit',
            });
            await logInventoryAdjustment(before, updated, 'qualityAcceptance', 'Material accepted by Quality from Inventory page');
          }));
          closeModal();
          showToast(`${pending.length} material(is) aceito(s) pela Qualidade.`, 'success');
          await rerender(true);
        },
      },
    ],
  });
}

function renderToolbar(items, state, rerender) {
  const selected = selectedItems(items, state);
  const onGenerateMaterialCoupon = state.options?.onGenerateMaterialCoupon;
  const toolbar = el('section', 'inventory-toolbar');
  const primary = el('div', 'inventory-toolbar-primary');
  const contextual = el('div', 'inventory-toolbar-contextual');
  const add = el('button', 'btn btn-secondary', 'Adicionar item');
  add.type = 'button';
  add.addEventListener('click', () => openAddItemModal(state, rerender));

  const edit = el('button', 'btn btn-ghost', 'Editar');
  edit.type = 'button';
  edit.disabled = selected.length !== 1;
  edit.addEventListener('click', () => {
    if (selected.length === 1) openEditItemModal(selected[0], rerender);
  });

  const remove = el('button', 'btn btn-ghost inventory-delete-action', 'Excluir');
  remove.type = 'button';
  remove.disabled = selected.length < 1;
  remove.addEventListener('click', () => {
    if (selected.length) openDeleteDialog(selected, state, rerender);
  });

  const setStatus = el('button', 'btn btn-ghost', 'Alterar status');
  setStatus.type = 'button';
  setStatus.disabled = selected.length < 1;
  setStatus.addEventListener('click', () => {
    if (selected.length) openStatusModal(selected, rerender);
  });

  const clear = el('button', 'btn btn-ghost', 'Limpar seleção');
  clear.type = 'button';
  clear.disabled = selected.length < 1;
  clear.addEventListener('click', () => {
    state.selectedIds.clear();
    rerender();
  });

  const coupon = el('button', 'btn btn-primary', 'Gerar Material Coupon');
  coupon.type = 'button';
  coupon.disabled = selected.length < 1 || !onGenerateMaterialCoupon;
  coupon.addEventListener('click', () => {
    if (!selected.length) {
      showToast('Selecione ao menos um material para gerar o Material Coupon.', 'error');
      return;
    }
    onGenerateMaterialCoupon?.(selected);
  });

  const quality = el('button', 'btn btn-secondary', 'Aceitar qualidade');
  quality.type = 'button';
  quality.disabled = selected.length < 1;
  quality.addEventListener('click', () => {
    if (selected.length) openQualityAcceptanceModal(selected, rerender);
  });

  primary.append(add);
  contextual.append(
    el('span', 'inventory-selection-count', selected.length ? `${selected.length} selecionado(s)` : 'Selecione materiais para executar ações'),
    coupon,
    quality,
    setStatus,
    edit,
    remove,
    clear,
  );
  toolbar.append(primary, contextual);
  return toolbar;
}

function statusChip(item) {
  const status = getInventoryStatus(item);
  return el('span', `inventory-status-chip inventory-status-${status}`, status);
}

function qualityCell(item) {
  const td = el('td');
  const state = getInventoryQualityState(item);
  const label = state === 'accepted' ? 'Aceito' : state === 'blocked' ? 'Bloqueado' : 'Pendente';
  td.append(el('span', `inventory-quality-chip inventory-quality-${state}`, label));
  return td;
}

function cell(value) {
  const td = el('td');
  td.textContent = value == null || value === '' ? '-' : String(value);
  return td;
}

function textCell(value, className = '') {
  const td = cell(value);
  if (className) td.className = className;
  return td;
}

function quantityCell(value) {
  return textCell(value, 'inventory-quantity-cell');
}

function fieldText(item, field) {
  return editValue(item, field);
}

function dimensionString(item) {
  const thickness = text(item.thicknessMm) || '-';
  const diameter = text(item.diaMm) || '-';
  const width = text(item.widthMm) || '-';
  const length = lengthValue(item) || '-';
  return `${thickness} x ${diameter} x ${width} x ${length}mm`;
}

function descriptionCell(item) {
  const value = fieldText(item, 'materialDescription');
  const td = textCell(value, 'inventory-description-cell');
  td.title = value;
  return td;
}

function traceabilityCell(item) {
  const value = fieldValue(item, ['traceability', 'trace']);
  const td = textCell(value, 'inventory-sticky-trace');
  td.title = value;
  return td;
}

function statusCell(item) {
  const td = el('td');
  td.append(statusChip(item));
  return td;
}

function sortText(field) {
  return (item) => fieldText(item, field);
}

const COLUMN_DEFINITIONS = Object.freeze({
  traceability: { key: 'traceability', title: 'Traceability', sticky: true, sortable: true, sortValue: (item) => fieldValue(item, ['traceability', 'trace']), render: traceabilityCell },
  category: { key: 'category', title: 'Category', sortable: true, sortValue: (item) => getInventoryCategoryKey(item), render: (item) => textCell(getInventoryCategoryKey(item)) },
  materialDescription: { key: 'materialDescription', title: 'Material Description', sortable: true, sortValue: sortText('materialDescription'), render: descriptionCell },
  materialClassification: { key: 'materialClassification', title: 'Material Classification', sortable: true, sortValue: sortText('materialClassification'), render: (item) => textCell(fieldText(item, 'materialClassification')) },
  materialGrade: { key: 'materialGrade', title: 'Material & Grade', sortable: true, sortValue: sortText('materialGrade'), render: (item) => textCell(fieldText(item, 'materialGrade')) },
  dimensions: { key: 'dimensions', title: 'Dimensions', sortable: false, render: (item) => textCell(dimensionString(item)) },
  thicknessMm: { key: 'thicknessMm', title: 'Thk (mm)', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'thicknessMm')), render: (item) => textCell(fieldText(item, 'thicknessMm')) },
  diaMm: { key: 'diaMm', title: 'Dia. OD (mm)', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'diaMm')), render: (item) => textCell(fieldText(item, 'diaMm')) },
  widthMm: { key: 'widthMm', title: 'Width (mm)', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'widthMm')), render: (item) => textCell(fieldText(item, 'widthMm')) },
  lengthMm: { key: 'lengthMm', title: 'Length (mm)', sortable: true, sortValue: lengthValue, render: (item) => textCell(lengthValue(item) || '') },
  unit: { key: 'unit', title: 'UOM', sortable: true, sortValue: sortText('unit'), render: (item) => textCell(fieldText(item, 'unit')) },
  weightKg: { key: 'weightKg', title: 'Total Weight (KG)', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'weightKg')), render: (item) => textCell(fieldText(item, 'weightKg')) },
  totalPoQty: { key: 'totalPoQty', title: 'Total PO Qty', className: 'inventory-quantity-column', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'totalPoQty')), render: (item) => quantityCell(fieldText(item, 'totalPoQty')) },
  receivedQty: { key: 'receivedQty', title: 'Received Qty', className: 'inventory-quantity-column', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'receivedQty')), render: (item) => quantityCell(fieldText(item, 'receivedQty')) },
  issuedQty: { key: 'issuedQty', title: 'Issued Qty', className: 'inventory-quantity-column', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'issuedQty')), render: (item) => quantityCell(fieldText(item, 'issuedQty')) },
  balanceQty: { key: 'balanceQty', title: 'Balance Qty', className: 'inventory-quantity-column', sortable: true, sortValue: (item) => numberValue(fieldText(item, 'balanceQty')), render: (item) => quantityCell(fieldText(item, 'balanceQty')) },
  vendor: { key: 'vendor', title: 'Vendor/Supplier', sortable: true, sortValue: sortText('vendor'), render: (item) => textCell(fieldText(item, 'vendor')) },
  poItemPo: { key: 'poItemPo', title: 'PO - Item PO', sortable: true, sortValue: sortText('poItemPo'), render: (item) => textCell(fieldText(item, 'poItemPo')) },
  po: { key: 'po', title: 'PO Number', sortable: true, sortValue: sortText('po'), render: (item) => textCell(fieldText(item, 'po')) },
  poItem: { key: 'poItem', title: 'PO Item #', sortable: true, sortValue: sortText('poItem'), render: (item) => textCell(fieldText(item, 'poItem')) },
  poSubject: { key: 'poSubject', title: 'PO Subject', sortable: true, sortValue: sortText('poSubject'), render: (item) => textCell(fieldText(item, 'poSubject')) },
  sapCode: { key: 'sapCode', title: 'SAP Code', sortable: true, sortValue: sortText('sapCode'), render: (item) => textCell(fieldText(item, 'sapCode')) },
  regime: { key: 'regime', title: 'Regime', sortable: true, sortValue: sortText('regime'), render: (item) => textCell(fieldText(item, 'regime')) },
  nfArrival: { key: 'nfArrival', title: 'Entry Invoice [NF]', sortable: true, sortValue: sortText('nfArrival'), render: (item) => textCell(fieldText(item, 'nfArrival')) },
  receivedDate: { key: 'receivedDate', title: 'Received Date', sortable: true, sortValue: sortText('receivedDate'), render: (item) => textCell(fieldText(item, 'receivedDate')) },
  mrr: { key: 'mrr', title: 'MRR', sortable: true, sortValue: sortText('mrr'), render: (item) => textCell(fieldText(item, 'mrr')) },
  partNumber: { key: 'partNumber', title: 'Part Number', sortable: true, sortValue: sortText('partNumber'), render: (item) => textCell(fieldText(item, 'partNumber')) },
  serialNumber: { key: 'serialNumber', title: 'Serial Number', sortable: true, sortValue: sortText('serialNumber'), render: (item) => textCell(fieldText(item, 'serialNumber')) },
  mtcNumber: { key: 'mtcNumber', title: 'MTC Number', sortable: true, sortValue: sortText('mtcNumber'), render: (item) => textCell(fieldText(item, 'mtcNumber')) },
  heatNo: { key: 'heatNo', title: 'Heat Number', sortable: true, sortValue: sortText('heatNo'), render: (item) => textCell(fieldText(item, 'heatNo')) },
  mir: { key: 'mir', title: 'MIR Number', sortable: true, sortValue: sortText('mir'), render: (item) => textCell(fieldText(item, 'mir')) },
  inspectionStatus: { key: 'inspectionStatus', title: 'Inspection Status', sortable: true, sortValue: sortText('inspectionStatus'), render: (item) => textCell(fieldText(item, 'inspectionStatus')) },
  acceptanceStatus: { key: 'acceptanceStatus', title: 'Acceptance Status', sortable: true, sortValue: sortText('acceptanceStatus'), render: (item) => textCell(fieldText(item, 'acceptanceStatus')) },
  qualityStatus: { key: 'qualityStatus', title: 'Aceite da qualidade', sortable: true, sortValue: (item) => getInventoryQualityState(item), render: qualityCell },
  location: { key: 'location', title: 'Storage Location', sortable: true, sortValue: sortText('location'), render: (item) => textCell(fieldText(item, 'location')) },
  locationZone: { key: 'locationZone', title: 'Location Zone', sortable: true, sortValue: sortText('locationZone'), render: (item) => textCell(fieldText(item, 'locationZone')) },
  equipment: { key: 'equipment', title: 'Equipment', sortable: true, sortValue: sortText('equipment'), render: (item) => textCell(fieldText(item, 'equipment')) },
  colorCode: { key: 'colorCode', title: 'Color Code', sortable: true, sortValue: sortText('colorCode'), render: (item) => textCell(fieldText(item, 'colorCode')) },
  materialCouponNo: { key: 'materialCouponNo', title: 'Material Coupon No.', sortable: true, sortValue: sortText('materialCouponNo'), render: (item) => textCell(fieldText(item, 'materialCouponNo')) },
  exitDate: { key: 'exitDate', title: 'Exit Date', sortable: true, sortValue: sortText('exitDate'), render: (item) => textCell(fieldText(item, 'exitDate')) },
  exitInvoice: { key: 'exitInvoice', title: 'Exit Invoice [NF]', sortable: true, sortValue: sortText('exitInvoice'), render: (item) => textCell(fieldText(item, 'exitInvoice')) },
  rmvNo: { key: 'rmvNo', title: 'RMV No.', sortable: true, sortValue: sortText('rmvNo'), render: (item) => textCell(fieldText(item, 'rmvNo')) },
  notes: { key: 'notes', title: 'Comments', sortable: true, sortValue: sortText('notes'), render: (item) => textCell(fieldText(item, 'notes'), 'inventory-comments-cell') },
  status: { key: 'status', title: 'Status', sortable: true, sortValue: (item) => getInventoryStatus(item), render: statusCell },
  actions: { key: 'actions', title: 'Actions', className: 'inventory-sticky-actions', sortable: false, render: actionsCell },
});

const COLUMN_VIEWS = Object.freeze({
  essential: ['traceability', 'materialDescription', 'materialGrade', 'dimensions', 'heatNo', 'balanceQty', 'location', 'status', 'actions'],
  procurement: ['traceability', 'materialDescription', 'materialGrade', 'dimensions', 'heatNo', 'balanceQty', 'location', 'vendor', 'poItemPo', 'po', 'poItem', 'poSubject', 'sapCode', 'regime', 'nfArrival', 'receivedDate', 'mrr', 'status', 'actions'],
  quality: ['traceability', 'materialDescription', 'materialGrade', 'dimensions', 'heatNo', 'balanceQty', 'location', 'partNumber', 'serialNumber', 'mtcNumber', 'mir', 'inspectionStatus', 'acceptanceStatus', 'qualityStatus', 'status', 'actions'],
  location: ['traceability', 'materialDescription', 'materialGrade', 'dimensions', 'heatNo', 'balanceQty', 'location', 'locationZone', 'equipment', 'colorCode', 'status', 'actions'],
  movement: ['traceability', 'materialDescription', 'materialGrade', 'dimensions', 'heatNo', 'balanceQty', 'location', 'materialCouponNo', 'exitDate', 'exitInvoice', 'rmvNo', 'status', 'actions'],
  complete: [...EDIT_FIELDS.filter((field) => field !== 'status'), 'status', 'actions'],
});

function toggleSort(state, key) {
  if (state.sort?.key === key) {
    state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    return;
  }
  state.sort = { key, direction: 'asc' };
}

function renderHeaderCell(column, state, rerender) {
  const classes = [column.sticky ? 'inventory-sticky-trace' : '', column.className || ''].filter(Boolean).join(' ');
  const th = el('th', classes);
  if (!column.sortable) {
    th.textContent = column.title;
    return th;
  }

  const active = state.sort?.key === column.key;
  const button = el('button', `inventory-sort-button${active ? ' active' : ''}`);
  button.type = 'button';
  button.append(el('span', null, column.title));
  if (active) button.append(el('span', 'inventory-sort-indicator', state.sort.direction === 'desc' ? 'DESC' : 'ASC'));
  button.addEventListener('click', () => {
    toggleSort(state, column.key);
    rerender();
  });
  th.append(button);
  return th;
}

function renderColumnViewSwitcher(state, rerender) {
  const wrapper = el('section', 'inventory-column-views');
  Object.entries(COLUMN_VIEW_LABELS).forEach(([key, label]) => {
    const button = el('button', `inventory-view-button${state.columnView === key ? ' active' : ''}`, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.columnView = key;
      rerender();
    });
    wrapper.append(button);
  });
  return wrapper;
}

function iconButton(iconName, label, onClick) {
  const button = el('button', 'icon-action');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  const icon = el('span', 'material-symbols-outlined', iconName);
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  button.addEventListener('click', onClick);
  return button;
}

function actionsCell(item, state, rerender) {
  const td = el('td', 'inventory-sticky-actions');
  const actions = el('div', 'inventory-row-actions');
  actions.append(
    iconButton('edit', 'Editar item', () => openEditItemModal(item, rerender)),
    iconButton('content_copy', 'Duplicar item', () => openAddItemModal(state, rerender, duplicateItemDraft(item))),
  );
  td.append(actions);
  return td;
}

function renderTable(items, state, rerender) {
  const wrap = el('div', 'inventory-page-table-wrap');
  const table = el('table', 'inventory-table');
  const columns = getCurrentColumns(state);
  const thead = el('thead');
  const head = el('tr');
  const selectHead = el('th', 'inventory-table-select');
  const selectAll = el('input');
  selectAll.type = 'checkbox';
  const visibleIds = items.map(itemId).filter(Boolean);
  const selectedVisibleCount = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  selectAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  selectAll.addEventListener('change', () => {
    visibleIds.forEach((id) => {
      if (selectAll.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
    });
    rerender();
  });
  selectHead.append(selectAll);
  head.append(selectHead);
  columns.forEach((column) => head.append(renderHeaderCell(column, state, rerender)));
  thead.append(head);

  const tbody = el('tbody');
  if (!items.length) {
    const row = el('tr');
    const empty = el('td', 'inventory-table-empty', 'Nenhum item de inventario encontrado.');
    empty.colSpan = columns.length + 1;
    row.append(empty);
    tbody.append(row);
  }

  items.forEach((item) => {
    const row = el('tr');
    if (state.selectedIds.has(itemId(item))) row.className = 'inventory-row-selected';
    const checkboxCell = el('td', 'inventory-table-select');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedIds.has(itemId(item));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedIds.add(itemId(item));
      else state.selectedIds.delete(itemId(item));
      rerender();
    });
    checkboxCell.append(checkbox);

    row.addEventListener('click', (event) => {
      if (event.target.closest('input, button, a, label')) return;
      const id = itemId(item);
      if (state.selectedIds.has(id)) state.selectedIds.delete(id);
      else state.selectedIds.add(id);
      rerender();
    });

    row.append(checkboxCell, ...columns.map((column) => column.render(item, state, rerender)));
    tbody.append(row);
  });

  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

async function handleImport(fileInput, rerender) {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const rows = await readExcelFile(file, { raw: true });
    const parsedItems = parseInventoryRows(rows);
    await saveInventoryItems(parsedItems);
    showToast(`${parsedItems.length} item(ns) importado(s).`, 'success');
    await rerender(true);
  } catch (error) {
    console.error(error);
    showToast('Erro ao importar inventario.', 'error');
  } finally {
    fileInput.value = '';
  }
}

async function render(container, state) {
  const items = await getAllInventoryItems();
  const ids = new Set(items.map(itemId));
  state.selectedIds.forEach((id) => {
    if (!ids.has(id)) state.selectedIds.delete(id);
  });
  state.options.onSelectionChange?.(selectedItems(items, state));
  const visibleItems = getVisibleItems(items, state);
  const rerender = (reload = false) => (reload ? refreshInventoryPage(container, state.options) : render(container, state));

  const page = el('section', 'inventory-page');
  const header = el('div', 'page-header');
  const titleBlock = el('div');
  titleBlock.append(
    el('p', 'eyebrow', 'Inventory'),
    el('h1', null, 'Inventario'),
    el('p', 'text-muted', 'Estoque físico e rastreabilidade para Material Coupon, Cutting Sheet, RMV e Workpack.'),
  );
  const actions = el('div', 'page-actions');
  const exportButton = el('button', 'btn btn-secondary');
  exportButton.id = 'inventory-export-database-btn';
  exportButton.type = 'button';
  const exportIcon = el('span', 'material-symbols-outlined', 'download');
  exportIcon.setAttribute('aria-hidden', 'true');
  exportButton.append(exportIcon, el('span', null, 'Exportar Base Completa'));
  exportButton.disabled = typeof state.options.onExportInventory !== 'function';
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      await state.options.onExportInventory?.();
      showToast('Base completa do inventário exportada.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Não foi possível exportar a base do inventário.', 'error');
    } finally {
      exportButton.disabled = typeof state.options.onExportInventory !== 'function';
    }
  });
  const importButton = el('button', 'btn btn-primary', 'Importar Inventario');
  importButton.id = 'inventory-import-file-btn';
  importButton.type = 'button';
  const fileInput = el('input');
  fileInput.id = 'inventory-page-file-input';
  fileInput.type = 'file';
  fileInput.accept = '.csv,.xls,.xlsx';
  fileInput.hidden = true;
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleImport(fileInput, rerender));
  actions.append(exportButton, importButton, fileInput);
  header.append(titleBlock, actions);

  const workspace = el('section', 'inventory-page-workspace');
  workspace.append(
    renderTabs(items, state, rerender),
    renderFilters(items, state, rerender),
    renderToolbar(items, state, rerender),
    renderColumnViewSwitcher(state, rerender),
    renderTable(visibleItems, state, rerender),
  );

  page.append(header, renderDashboard(items, state, visibleItems.length, rerender), workspace);
  const focusSnapshot = captureFocus(container);
  const scrollSnapshot = captureScrollPosition(container);
  container.replaceChildren(page);
  restoreFocus(container, focusSnapshot);
  restoreScrollPosition(container, scrollSnapshot);
}

export async function renderInventoryPage(container, options = {}) {
  if (!container) return;
  const state = getInitialState(options);
  stateByContainer.set(container, state);
  await render(container, state);
}

export async function refreshInventoryPage(container, options = {}) {
  if (!container) return;
  const state = getState(container, options);
  await render(container, state);
}
