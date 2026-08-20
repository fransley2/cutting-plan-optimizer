import { validateMtoItem } from '../data/mtoImport.js';
import { ensureDrawingsForMtoItems, linkDrawingsForMtoItemsToEquipment } from '../data/mtoDrawings.js';
import { commitMtoThenCreateDrawings, retryPendingMtoDrawingSync } from '../data/mtoImportWorkflow.js';
import { getZeroMtoImportOutcome } from '../data/mtoImportDecisions.js';
import {
  MTO_ITEM_STATUS,
  createMtoItem,
  saveMtoImport,
  getAllMtoBatches,
  getMtoItems,
  updateMtoItem,
  updateMtoBatch,
  deleteMtoItems,
} from '../data/mtoDB.js';
import { getAllProjects } from '../data/projects.js';
import { findEquipmentMatch, listEquipments } from '../data/equipments.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { openMtoImportWizard } from './mtoImportWizard.js';
import { generateMissingMtoIdentCodes } from '../core/mtoIdentCode.js';
import { poItemTechnicalPresentation } from '../core/poItemPresentation.js';
import {
  applyMtoPoAutoAllocations,
  buildMtoPoAutoAllocationReview,
  eligibleMtoItemsForAutoAllocation,
} from '../core/mtoPoAutoAllocation.js';

const stateByContainer = new WeakMap();

const EDITABLE_FIELDS = [
  'drawing',
  'revision',
  'mark',
  'pos',
  'qty',
  'description',
  'cutLength',
  'identCode',
  'material',
  'type',
  'discipline',
];

const TABS = [
  { id: 'all', label: 'All', countKey: 'active' },
  { id: 'valid', label: 'Valid', countKey: 'valid' },
  { id: 'rejected', label: 'Rejected', countKey: 'rejected' },
  { id: 'missing-material', label: 'Missing Material', countKey: 'missingMaterial' },
  { id: 'ready-match', label: 'Ready for Match', countKey: 'readyForMatch' },
  { id: 'tracked', label: 'Matched / Reserved / Nested', countKey: 'tracked' },
  { id: 'superseded', label: 'Superseded', countKey: 'superseded' },
  { id: 'equipment', label: 'By Equipment', countKey: 'active' },
];

function createEl(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue != null) element.textContent = textValue;
  return element;
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value, fractionDigits = 0) {
  return numericValue(value).toLocaleString('pt-BR', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function projectLabel(project = {}) {
  return String(project.name || project.project || project.projectName || project.id || '');
}

export async function selectMtoImportFile({
  projectId = '',
  projectName = '',
  prepareItems,
  onValidationErrors,
  openWizard = openMtoImportWizard,
  notify = showToast,
} = {}) {
  if (!projectId) {
    notify('Selecione um projeto ativo antes de importar a MTO.', 'error');
    return null;
  }
  return openWizard({
    projectId,
    projectName,
    ...(prepareItems ? { prepareItems } : {}),
    ...(onValidationErrors ? { onValidationErrors } : {}),
  });
}

function itemIsInvalid(item) {
  return item.status === 'invalid' || (item.validationErrors || []).length > 0;
}

function itemIsValid(item) {
  return !itemIsInvalid(item);
}

function itemCanSend(item) {
  return item.status === 'open' || (item.validationErrors || []).length === 0;
}

function getMtoEquipmentKey(item) {
  return (
    item.line ||
    item.tag ||
    item.metadata?.engineering?.SBSArea ||
    item.metadata?.engineering?.SBSWorkpack ||
    item.constructionActivity ||
    item.mark ||
    item.type ||
    item.discipline ||
    'Unassigned'
  );
}

function getInitialState(options) {
  const initialFilters = options?.initialFilters || {};
  return {
    activeTab: 'all',
    equipmentGroup: '',
    editingId: '',
    expandedId: '',
    isAdding: false,
    filtersExpanded: false,
    selectedIds: new Set(),
    filters: {
      search: '',
      drawing: '',
      material: '',
      discipline: '',
      status: '',
      equipmentId: '',
      projectId: '',
      includeSuperseded: false,
      ...initialFilters,
    },
    options,
  };
}

function getState(container, options) {
  if (!stateByContainer.has(container)) {
    stateByContainer.set(container, getInitialState(options));
  }
  const state = stateByContainer.get(container);
  if (options?.initialFilters) {
    state.filters = { ...state.filters, ...options.initialFilters };
    state.activeTab = 'all';
    state.equipmentGroup = '';
  }
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

function hasProcurementLink(item, coverageByMto = new Map()) {
  const coverage = coverageByMto.get(item.id);
  return Boolean(coverage && coverage.status !== 'UNALLOCATED' && numericValue(coverage.allocatedQuantity) > 0);
}

function summarizeItems(items, coverageByMto = new Map()) {
  const valid = items.filter(itemIsValid).length;
  const rejected = items.length - valid;
  return {
    total: items.length,
    valid,
    rejected,
    requiredLength: items.reduce((sum, item) => sum + numericValue(item.requiredLength), 0),
    weight: items.reduce((sum, item) => sum + numericValue(item.weightKg), 0),
    missingMaterial: items.filter((item) => !item.material).length,
    readyForMatch: items.filter((item) => item.status === 'open' && itemIsValid(item) && !hasProcurementLink(item, coverageByMto)).length,
    tracked: items.filter((item) => ['matched', 'reserved', 'nested'].includes(item.status) || hasProcurementLink(item, coverageByMto)).length,
    superseded: items.filter((item) => item.status === MTO_ITEM_STATUS.SUPERSEDED).length,
  };
}

export function summarizeMtoTabs(items, coverageByMto = new Map()) {
  const operationalItems = items.filter((item) => item.status !== MTO_ITEM_STATUS.SUPERSEDED);
  const summary = summarizeItems(operationalItems, coverageByMto);
  return {
    ...summary,
    total: items.length,
    active: operationalItems.length,
    superseded: items.length - operationalItems.length,
  };
}

function uniqueValues(items, field) {
  return [...new Set(items.map((item) => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function getMtoTabItems(items, { activeTab = 'all', includeSuperseded = false, equipmentGroup = '', coverageByMto = new Map() } = {}) {
  const scopedItems = includeSuperseded || activeTab === 'superseded'
    ? items
    : items.filter((item) => item.status !== MTO_ITEM_STATUS.SUPERSEDED);
  if (activeTab === 'valid') return scopedItems.filter(itemIsValid);
  if (activeTab === 'rejected') return scopedItems.filter(itemIsInvalid);
  if (activeTab === 'missing-material') return scopedItems.filter((item) => !item.material);
  if (activeTab === 'ready-match') return scopedItems.filter((item) => item.status === 'open' && itemIsValid(item) && !hasProcurementLink(item, coverageByMto));
  if (activeTab === 'tracked') {
    return scopedItems.filter((item) => ['matched', 'reserved', 'nested'].includes(item.status) || hasProcurementLink(item, coverageByMto));
  }
  if (activeTab === 'superseded') {
    return scopedItems.filter((item) => item.status === MTO_ITEM_STATUS.SUPERSEDED);
  }
  if (activeTab === 'equipment' && equipmentGroup) {
    return scopedItems.filter((item) => getMtoEquipmentKey(item) === equipmentGroup);
  }
  return scopedItems;
}

function applyTab(items, state, coverageByMto = new Map()) {
  return getMtoTabItems(items, {
    activeTab: state.activeTab,
    includeSuperseded: state.filters.includeSuperseded,
    equipmentGroup: state.equipmentGroup,
    coverageByMto,
  });
}

function itemSearchText(item) {
  return [
    item.drawing,
    item.revision,
    item.mark,
    item.pos,
    item.description,
    item.identCode,
    item.material,
    item.type,
    item.discipline,
    item.constructionActivity,
    item.equipmentName,
  ].join(' ').toLowerCase();
}

export function filterMtoItems(items, filters) {
  const tokens = filters.search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return items.filter((item) => {
    const searchable = itemSearchText(item);
    return (
      tokens.every((token) => searchable.includes(token)) &&
      (!filters.drawing || item.drawing === filters.drawing) &&
      (!filters.equipmentId || item.equipmentId === filters.equipmentId) &&
      (!filters.material || item.material === filters.material) &&
      (!filters.discipline || item.discipline === filters.discipline) &&
      (!filters.status || item.status === filters.status)
    );
  });
}

function getVisibleMtoItems(items, state, coverageByMto = new Map()) {
  return filterMtoItems(applyTab(items, state, coverageByMto), state.filters);
}

function selectedItems(items, state) {
  return items.filter((item) => state.selectedIds.has(item.id));
}

function selectedSendableItems(items, state) {
  return selectedItems(items, state).filter(itemCanSend);
}

function buildKpiCard(label, value, detail) {
  const card = createEl('div', 'mto-page-kpi-card');
  card.append(createEl('span', null, label), createEl('strong', null, value));
  if (detail) card.append(createEl('small', null, detail));
  return card;
}

function renderDashboard(items, coverageByMto = new Map()) {
  const summary = summarizeItems(items, coverageByMto);
  const section = createEl('section', 'mto-page-dashboard');
  const grid = createEl('div', 'mto-page-kpi-grid');
  grid.append(
    buildKpiCard('Total Lines', String(summary.total)),
    buildKpiCard('Total Weight', `${formatNumber(summary.weight, 2)} kg`),
    buildKpiCard('Missing Material', String(summary.missingMaterial)),
    buildKpiCard('Ready for Match', String(summary.readyForMatch)),
  );
  section.append(grid);
  return section;
}

function renderTabs(items, state, rerender, coverageByMto = new Map()) {
  const tabs = createEl('div', 'mto-page-tabs');
  const counts = summarizeMtoTabs(items, coverageByMto);
  TABS.forEach((tab) => {
    const count = tab.id === 'all' && state.filters.includeSuperseded ? counts.total : counts[tab.countKey];
    const button = createEl('button', `mto-tabs-item${state.activeTab === tab.id ? ' active' : ''}`, `${tab.label} (${count})`);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.activeTab = tab.id;
      state.editingId = '';
      rerender();
    });
    tabs.append(button);
  });
  return tabs;
}

function renderEquipmentGroups(items, state, rerender) {
  if (state.activeTab !== 'equipment') return document.createDocumentFragment();

  const groups = uniqueValues(items.map((item) => ({ group: getMtoEquipmentKey(item) })), 'group');
  if (groups.length && !groups.includes(state.equipmentGroup)) state.equipmentGroup = groups[0];
  if (!groups.length) state.equipmentGroup = '';

  const wrapper = createEl('div', 'mto-page-equipment-groups');
  if (groups.length > 12) {
    const select = createEl('select');
    groups.forEach((group) => {
      const option = createEl('option', null, group);
      option.value = group;
      option.selected = state.equipmentGroup === group;
      select.append(option);
    });
    select.addEventListener('change', () => {
      state.equipmentGroup = select.value;
      rerender();
    });
    wrapper.append(select);
    return wrapper;
  }

  groups.forEach((group) => {
    const button = createEl('button', `mto-tabs-item${state.equipmentGroup === group ? ' active' : ''}`, group);
    button.type = 'button';
    button.addEventListener('click', () => {
      state.equipmentGroup = group;
      rerender();
    });
    wrapper.append(button);
  });
  return wrapper;
}

function renderSelect(label, value, values, onChange) {
  const field = createEl('label', 'field');
  field.append(createEl('span', null, label));
  const select = createEl('select');
  const emptyOption = createEl('option', null, 'Todos');
  emptyOption.value = '';
  select.append(emptyOption);
  values.forEach((item) => {
    const optionValue = typeof item === 'object' ? item.value : item;
    const optionLabel = typeof item === 'object' ? item.label : item;
    const option = createEl('option', null, optionLabel);
    option.value = optionValue;
    option.selected = optionValue === value;
    select.append(option);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  field.append(select);
  return field;
}

export function countActiveMtoFilters(filters = {}) {
  return ['drawing', 'equipmentId', 'material', 'discipline', 'status']
    .reduce((count, field) => count + (filters[field] ? 1 : 0), filters.includeSuperseded === true ? 1 : 0);
}

function renderFilters(items, state, rerender, equipmentById = new Map()) {
  const filters = createEl('section', 'mto-page-filters');
  const commandBar = createEl('div', 'mto-filter-commandbar');
  const searchField = createEl('label', 'field mto-search-field');
  searchField.append(createEl('span', 'sr-only', 'Buscar'));
  const search = createEl('input');
  search.id = 'mto-search-input';
  search.type = 'search';
  search.placeholder = 'Drawing, Mark, POS, Description, IdentCode, Material';
  search.value = state.filters.search;
  search.addEventListener('input', () => {
    state.filters.search = search.value;
    rerender();
  });
  searchField.append(search);

  const activeFilterCount = countActiveMtoFilters(state.filters);
  const toggle = createEl('button', 'btn btn-secondary mto-filter-toggle');
  toggle.type = 'button';
  toggle.dataset.focusKey = 'mto-filter-toggle';
  toggle.setAttribute('aria-expanded', String(state.filtersExpanded));
  toggle.append(createEl('span', 'material-symbols-outlined', 'filter_list'), document.createTextNode('Filtros'));
  if (activeFilterCount > 0) {
    toggle.append(createEl('span', 'mto-filter-count', String(activeFilterCount)));
    toggle.setAttribute('aria-label', `Filtros, ${activeFilterCount} ativo(s)`);
  }
  toggle.addEventListener('click', () => {
    state.filtersExpanded = !state.filtersExpanded;
    rerender();
  });
  commandBar.append(searchField, toggle);
  filters.append(commandBar);

  if (!state.filtersExpanded) return filters;

  const panel = createEl('div', 'mto-filter-panel');

  const drawingValues = [...new Set([...uniqueValues(items, 'drawing'), state.filters.drawing].filter(Boolean))];
  const equipmentIds = [...new Set([...uniqueValues(items, 'equipmentId'), state.filters.equipmentId].filter(Boolean))];
  panel.append(
    renderSelect('Drawing', state.filters.drawing, drawingValues, (value) => { state.filters.drawing = value; rerender(); }),
    renderSelect(
      'Equipamento',
      state.filters.equipmentId,
      equipmentIds.map((equipmentId) => ({
        value: equipmentId,
        label: equipmentLabel(equipmentById.get(equipmentId)) || equipmentId,
      })),
      (value) => { state.filters.equipmentId = value; rerender(); },
    ),
    renderSelect('Material', state.filters.material, uniqueValues(items, 'material'), (value) => { state.filters.material = value; rerender(); }),
    renderSelect('Discipline', state.filters.discipline, uniqueValues(items, 'discipline'), (value) => { state.filters.discipline = value; rerender(); }),
    renderSelect('Status', state.filters.status, uniqueValues(items, 'status'), (value) => { state.filters.status = value; rerender(); }),
  );

  const supersededField = createEl('label', 'field mto-inline-filter');
  const supersededToggle = createEl('input');
  supersededToggle.type = 'checkbox';
  supersededToggle.checked = state.filters.includeSuperseded === true;
  supersededToggle.addEventListener('change', () => {
    state.filters.includeSuperseded = supersededToggle.checked;
    rerender(true);
  });
  supersededField.append(supersededToggle, createEl('span', null, 'Mostrar itens SUPERSEDED'));
  panel.append(supersededField);

  const clear = createEl('button', 'btn btn-ghost', 'Limpar filtros');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    state.filters = {
      search: '',
      drawing: '',
      equipmentId: '',
      projectId: state.filters.projectId || '',
      material: '',
      discipline: '',
      status: '',
      includeSuperseded: false,
    };
    rerender(true);
  });
  panel.append(clear);
  filters.append(panel);
  return filters;
}

function renderEditInput(item, field) {
  const input = createEl('input');
  input.name = field;
  input.value = item[field] ?? '';
  if (field === 'qty' || field === 'cutLength') {
    input.type = 'number';
    input.step = 'any';
  } else {
    input.type = 'text';
  }
  return input;
}

function readEditPatch(row, currentItem = {}) {
  const patch = {};
  EDITABLE_FIELDS.forEach((field) => {
    const input = row.querySelector(`[name="${field}"]`);
    patch[field] = field === 'qty' || field === 'cutLength'
      ? numericValue(input?.value)
      : input?.value?.trim() || '';
  });
  patch.requiredLength = numericValue(patch.qty) * numericValue(patch.cutLength);
  const validationTarget = { ...currentItem, ...patch };
  patch.validationErrors = validateMtoItem(validationTarget);
  patch.status = patch.validationErrors.length > 0
    ? 'invalid'
    : (currentItem.status === 'invalid' ? 'open' : currentItem.status || 'open');
  return patch;
}

function renderSelectionCheckbox(item, state, rerender) {
  const checkbox = createEl('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.selectedIds.has(item.id);
  checkbox.setAttribute('aria-label', `Selecionar ${item.mark || item.drawing || item.id}`);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) state.selectedIds.add(item.id);
    else state.selectedIds.delete(item.id);
    rerender();
  });
  return checkbox;
}

function poItemAllocationLabel(poItem = {}, purchaseOrder = {}) {
  const poNumber = purchaseOrder.poNumber || poItem.purchaseOrderId || 'PO';
  const itemNumber = poItem.itemNumber || poItem.id || '-';
  const summary = poItemTechnicalPresentation(poItem).summary || poItem.identCode || 'Material sem descrição';
  return `${poNumber} · Item ${itemNumber} · ${summary}`;
}

function autoAllocationIssueReason(issue = {}) {
  const labels = {
    AMBIGUOUS_PO_ITEM_MATCH: `${issue.poItemIds?.length || 2} correspondências possíveis`,
    INSUFFICIENT_PO_BALANCE: 'Saldo do PO Item insuficiente para cobrir toda a demanda',
    NO_PO_ITEM_MATCH: 'Sem Ident Code correspondente no mesmo projeto',
    PROJECT_REQUIRED: 'Projeto obrigatório não informado',
    PROJECT_MISMATCH: 'Ident Code encontrado apenas em outro projeto',
    IDENT_CODE_REQUIRED: 'Ident Code não informado',
    ALLOCATION_UNIT_CONFLICT: 'Unidade incompatível com vínculo existente',
    MTO_PO_ITEM_ALREADY_LINKED: 'Linha já possui vínculo ativo',
  };
  return labels[issue.code] || issue.message || 'Correspondência exige revisão';
}

async function openMtoPoAutoAllocationModal({ allItems, filteredItems, state, rerender }) {
  const projectId = state.options.projectId || state.filters.projectId || '';
  try {
    const [purchaseOrders, poItems, allocations] = await Promise.all([
      state.options.listPurchaseOrders?.() || [],
      state.options.listPurchaseOrderItems?.() || [],
      state.options.listMtoPoItemAllocations?.(projectId ? { projectId } : {}) || [],
    ]);
    const activeAllocations = allocations.filter((item) => String(item.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
    const availableOrders = purchaseOrders.filter((item) => String(item.status || '').toUpperCase() !== 'CANCELLED');
    const projectOrders = availableOrders.filter((item) => !projectId || item.projectId === projectId);
    const orderIds = new Set(projectOrders.map((item) => item.id));
    const availableOrderIds = new Set(availableOrders.map((item) => item.id));
    const availablePoItems = poItems.filter((item) => availableOrderIds.has(item.purchaseOrderId)
      && String(item.status || 'OPEN').toUpperCase() !== 'CANCELLED');
    const projectPoItems = availablePoItems.filter((item) => (!projectId || item.projectId === projectId) && orderIds.has(item.purchaseOrderId));
    const orderById = new Map(availableOrders.map((item) => [item.id, item]));
    const mtoById = new Map(allItems.map((item) => [item.id, item]));
    const poItemById = new Map(projectPoItems.map((item) => [item.id, item]));
    let scope = 'filtered';
    let selectedKeys = new Set();
    let review = null;
    let footerCount = null;
    let applyButton = null;
    const body = createEl('div', 'mto-auto-allocation-modal');

    const allocationKey = (item) => `${item.mtoLineId}\u0000${item.poItemId}`;
    const scopedItems = () => (scope === 'filtered' ? filteredItems : allItems);

    function updateFooter() {
      const count = selectedKeys.size;
      if (footerCount) footerCount.textContent = `${count} vínculo(s) serão criados`;
      if (applyButton) {
        applyButton.textContent = `Aplicar ${count} vínculo(s)`;
        applyButton.disabled = count === 0;
      }
    }

    function renderPreview() {
      review = buildMtoPoAutoAllocationReview({
        mtoItems: scopedItems(),
        poItems: availablePoItems,
        existingAllocations: activeAllocations,
      });
      selectedKeys = new Set(review.safe.map(allocationKey));
      body.replaceChildren();

      const scopePanel = createEl('section', 'mto-auto-allocation-scope');
      scopePanel.append(createEl('strong', null, 'Escopo da análise'));
      const scopeOptions = createEl('div', 'mto-auto-allocation-scope-options');
      [
        ['filtered', `Apenas linhas filtradas atualmente (${eligibleMtoItemsForAutoAllocation(filteredItems, activeAllocations).length})`],
        ['all', `Todas as linhas elegíveis (${eligibleMtoItemsForAutoAllocation(allItems, activeAllocations).length})`],
      ].forEach(([value, labelText]) => {
        const label = createEl('label', 'mto-auto-allocation-scope-option');
        const input = createEl('input');
        input.type = 'radio';
        input.name = 'mto-auto-allocation-scope';
        input.value = value;
        input.checked = scope === value;
        input.addEventListener('change', () => { scope = value; renderPreview(); });
        label.append(input, createEl('span', null, labelText));
        scopeOptions.append(label);
      });
      scopePanel.append(scopeOptions);

      const metrics = createEl('section', 'mto-auto-allocation-metrics');
      const attentionLineIds = new Set([
        ...review.attention.map((item) => item.mtoLineId),
        ...review.ambiguous.flatMap((item) => item.mtoLineIds || []),
      ]);
      const noMatchLineIds = new Set(review.noMatch.flatMap((item) => item.mtoLineIds || []));
      [
        ['Linhas analisadas', review.analyzed, 'analytics'],
        ['Correspondências seguras', review.safe.length, 'verified'],
        ['Ambíguas / atenção', attentionLineIds.size, 'warning'],
        ['Sem correspondência', noMatchLineIds.size, 'link_off'],
      ].forEach(([label, value, icon]) => {
        const card = createEl('div', 'mto-auto-allocation-metric');
        card.append(createEl('span', 'material-symbols-outlined', icon), createEl('strong', null, String(value)), createEl('small', null, label));
        metrics.append(card);
      });

      const matchSection = createEl('section', 'mto-auto-allocation-matches');
      const matchHeader = createEl('div', 'mto-auto-allocation-list-header');
      const masterLabel = createEl('label');
      const master = createEl('input');
      master.type = 'checkbox';
      master.checked = review.safe.length > 0 && review.safe.every((item) => selectedKeys.has(allocationKey(item)));
      master.disabled = review.safe.length === 0;
      master.addEventListener('change', () => {
        review.safe.forEach((item) => master.checked ? selectedKeys.add(allocationKey(item)) : selectedKeys.delete(allocationKey(item)));
        renderMatchRows();
        updateFooter();
      });
      masterLabel.append(master, createEl('span', null, 'Selecionar todas as correspondências seguras'));
      matchHeader.append(masterLabel);
      const rows = createEl('div', 'mto-auto-allocation-rows');

      function renderMatchRows() {
        rows.replaceChildren();
        const candidates = [...review.safe.map((item) => ({ ...item, attention: false })), ...review.attention.map((item) => ({ ...item, attention: true }))];
        candidates.forEach((candidate) => {
          const key = allocationKey(candidate);
          const mtoItem = mtoById.get(candidate.mtoLineId) || {};
          const poItem = poItemById.get(candidate.poItemId) || {};
          const row = createEl('label', `mto-auto-allocation-row${candidate.attention ? ' attention' : ''}`);
          const checkbox = createEl('input');
          checkbox.type = 'checkbox';
          checkbox.checked = selectedKeys.has(key);
          checkbox.addEventListener('change', () => {
            checkbox.checked ? selectedKeys.add(key) : selectedKeys.delete(key);
            master.checked = review.safe.length > 0 && review.safe.every((item) => selectedKeys.has(allocationKey(item)));
            updateFooter();
          });
          const copy = createEl('span', 'mto-auto-allocation-row-copy');
          const identity = createEl('strong', null, `${mtoItem.drawing || 'Sem desenho'} · ${mtoItem.mark || '-'} · POS ${mtoItem.pos || '-'}`);
          const ident = createEl('code', null, candidate.matchedIdentCode || mtoItem.identCode || mtoItem.material || 'Sem Ident Code');
          const target = createEl('span', null, `→ ${poItemAllocationLabel(poItem, orderById.get(poItem.purchaseOrderId))}`);
          const meta = createEl('span', 'mto-auto-allocation-row-meta');
          meta.append(
            createEl('span', `status-badge ${candidate.attention ? 'warning' : 'current'}`, candidate.matchConfidence || 'HIGH'),
            createEl('strong', null, `${formatNumber(candidate.allocatedQuantity, 2)} ${candidate.unitOfMeasure || 'EA'}`),
          );
          if (candidate.reviewReason) meta.append(createEl('small', null, autoAllocationIssueReason({ code: candidate.reviewReason })));
          copy.append(identity, ident, target);
          row.append(checkbox, copy, meta);
          rows.append(row);
        });
        if (!candidates.length) rows.append(createEl('p', 'mto-allocation-panel-empty text-muted', 'Nenhuma correspondência aplicável neste escopo.'));
      }
      renderMatchRows();
      matchSection.append(matchHeader, rows);

      const issues = [...review.ambiguous, ...review.noMatch];
      const issueSection = createEl('details', 'mto-auto-allocation-issues');
      const issueSummary = createEl('summary', null, `Ambíguas e sem correspondência (${issues.length})`);
      issueSection.append(issueSummary);
      const issueList = createEl('div', 'mto-auto-allocation-issue-list');
      issues.forEach((item) => {
        const row = createEl('div', 'mto-auto-allocation-issue');
        const affected = item.mtoLineIds?.map((id) => {
          const mto = mtoById.get(id) || {};
          return `${mto.drawing || id} · ${mto.mark || mto.pos || '-'}`;
        }).join(', ') || item.matchedIdentCode || 'Linha MTO';
        row.append(createEl('strong', null, affected), createEl('span', null, autoAllocationIssueReason(item)));
        issueList.append(row);
      });
      if (!issues.length) issueList.append(createEl('p', 'text-muted', 'Nenhuma pendência neste escopo.'));
      issueSection.append(issueList);
      body.append(scopePanel, metrics, matchSection, issueSection);
      updateFooter();
    }

    const handle = openModal({
      title: 'Vincular automático por Ident Code',
      body,
      wide: true,
      buttons: [
        { label: 'Cancelar', variant: 'btn-ghost' },
        { label: 'Aplicar 0 vínculo(s)', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
          const candidates = [...review.safe, ...review.attention].filter((item) => selectedKeys.has(allocationKey(item)));
          if (!candidates.length) return;
          applyButton.disabled = true;
          const result = await applyMtoPoAutoAllocations(candidates.map((item) => ({
            ...item,
            createdBy: state.options.currentUserName || '',
          })), state.options.saveMtoPoItemAllocation);
          closeModal();
          await rerender(true);
          const unresolved = review.analyzed - result.created.length;
          showToast(`${result.created.length} vínculo(s) criado(s). ${unresolved} linha(s) continuam sem correspondência segura.`, result.failures.length ? 'warning' : 'success');
          if (result.failures.length) {
            const resultBody = createEl('div', 'mto-auto-allocation-result');
            resultBody.append(createEl('p', null, `${result.created.length} vínculo(s) foram criados; ${result.failures.length} falharam.`));
            const list = createEl('ul');
            result.failures.forEach(({ allocation, message }) => {
              const mto = mtoById.get(allocation.mtoLineId) || {};
              list.append(createEl('li', null, `${mto.drawing || allocation.mtoLineId} · ${mto.mark || mto.pos || '-'}: ${message}`));
            });
            resultBody.append(list);
            openModal({ title: 'Resultado do vínculo automático', body: resultBody, buttons: [{ label: 'Fechar', variant: 'btn-primary' }] });
          }
        } },
      ],
    });
    footerCount = createEl('strong', 'mto-allocation-footer-count', '0 vínculo(s) serão criados');
    const footer = handle.bodyEl.closest('.modal')?.querySelector('.modal-footer');
    footer?.prepend(footerCount);
    applyButton = footer?.querySelector('.btn-primary');
    renderPreview();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível analisar os vínculos automáticos.', 'error');
  }
}

async function openMtoPoAllocationModal(items, state, rerender) {
  const selectedMtoItems = Array.isArray(items) ? items : [items].filter(Boolean);
  const projectIds = new Set(selectedMtoItems.map((item) => item.projectId).filter(Boolean));
  if (!selectedMtoItems.length || selectedMtoItems.some((item) => !item.projectId) || projectIds.size !== 1) {
    showToast('Selecione linhas MTO vinculadas ao mesmo Projeto.', 'error');
    return;
  }
  const projectId = [...projectIds][0];
  try {
    const [purchaseOrders, poItems, organizations, allAllocations, coverageRows] = await Promise.all([
      state.options.listPurchaseOrders?.() || [],
      state.options.listPurchaseOrderItems?.() || [],
      state.options.listOrganizations?.() || [],
      state.options.listMtoPoItemAllocations?.({ projectId }) || [],
      state.options.listMtoProcurementCoverage?.({ projectId }) || [],
    ]);
    const projectPurchaseOrders = purchaseOrders.filter((po) => po.projectId === projectId && String(po.status || '').toUpperCase() !== 'CANCELLED');
    const projectPurchaseOrderIds = new Set(projectPurchaseOrders.map((po) => po.id));
    const projectPoItems = poItems.filter((poItem) => poItem.projectId === projectId
      && projectPurchaseOrderIds.has(poItem.purchaseOrderId)
      && String(poItem.status || 'OPEN').toUpperCase() !== 'CANCELLED');
    const poById = new Map(projectPurchaseOrders.map((po) => [po.id, po]));
    const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
    const activeAllocations = allAllocations.filter((allocation) => String(allocation.status || 'ACTIVE').toUpperCase() === 'ACTIVE');
    const coverageByMto = new Map(coverageRows.map((coverage) => [coverage.mtoItem.id, coverage]));
    const automaticMatch = state.options.suggestMtoPoItemAllocationsByIdentCode?.({
      mtoItems: selectedMtoItems,
      poItems: projectPoItems,
      existingAllocations: activeAllocations,
    }) || { suggestions: [], issues: [] };
    const automaticSuggestions = automaticMatch.suggestions.map((suggestion) => ({
      ...suggestion,
      createdBy: state.options.currentUserName || '',
    }));
    const drafts = [];
    let selectedPoId = '';
    let selectedPoItemId = '';
    let poSelectorOpen = true;
    let activeAllocationTab = 'select';
    let footerCounter = null;
    const body = createEl('div', 'mto-po-allocation-modal');
    const contextStrip = createEl('section', 'mto-allocation-context-strip');
    const tabs = createEl('div', 'mto-allocation-tabs');
    const tabPanels = createEl('div', 'mto-allocation-tab-panels');
    const procurementPanel = createEl('section', 'mto-allocation-tab-panel mto-allocation-procurement-panel');
    const draftPanel = createEl('section', 'mto-allocation-tab-panel mto-allocation-draft-panel');
    const existingPanel = createEl('section', 'mto-allocation-tab-panel mto-allocation-existing-panel');
    const selectedMtoIds = new Set(selectedMtoItems.map((item) => item.id));
    const existingAllocations = activeAllocations.filter((allocation) => selectedMtoIds.has(allocation.mtoLineId));

    const activeTotal = (filter) => activeAllocations.filter(filter).reduce((total, allocation) => total + numericValue(allocation.allocatedQuantity), 0);
    const draftTotal = (filter) => drafts.filter(filter).reduce((total, draft) => total + numericValue(draft.allocatedQuantity), 0);
    const poItemBalance = (poItem) => Math.max(0, numericValue(poItem.orderedQuantity)
      - activeTotal((allocation) => allocation.poItemId === poItem.id)
      - draftTotal((draft) => draft.poItemId === poItem.id));
    const demandBalance = (mtoItem, unitOfMeasure) => Math.max(0,
      (numericValue(state.options.mtoDemandQuantity?.(mtoItem, unitOfMeasure)) || numericValue(mtoItem.qty))
      - activeTotal((allocation) => allocation.mtoLineId === mtoItem.id)
      - draftTotal((draft) => draft.mtoLineId === mtoItem.id));
    const compatibleUnit = (mtoItem, unitOfMeasure) => {
      const units = new Set([...activeAllocations, ...drafts].filter((allocation) => allocation.mtoLineId === mtoItem.id)
        .map((allocation) => String(allocation.unitOfMeasure || '').toUpperCase()).filter(Boolean));
      return !units.size || units.has(String(unitOfMeasure || 'EA').toUpperCase());
    };

    function sectionHeader(title, hint, badge = '') {
      const header = createEl('div', 'mto-allocation-section-header');
      const copy = createEl('div');
      copy.append(createEl('h4', null, title), createEl('p', 'text-muted', hint));
      header.append(copy);
      if (badge) header.append(createEl('span', 'status-badge current', badge));
      return header;
    }

    function updateModalChrome() {
      tabs.querySelectorAll('[data-mto-allocation-tab]').forEach((button) => {
        const tabId = button.dataset.mtoAllocationTab;
        const count = tabId === 'drafts' ? drafts.length : (tabId === 'existing' ? existingAllocations.length : null);
        const label = tabId === 'select' ? 'Selecionar compra' : (tabId === 'drafts' ? 'Lote de vínculos' : 'Vínculos existentes');
        button.querySelector('.mto-allocation-tab-label').textContent = label;
        const badge = button.querySelector('.mto-allocation-tab-count');
        if (badge) badge.textContent = String(count);
        const active = tabId === activeAllocationTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      tabPanels.querySelectorAll('[data-mto-allocation-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.mtoAllocationPanel !== activeAllocationTab;
      });
      if (footerCounter) footerCounter.textContent = `${drafts.length} vínculo(s) no lote`;
    }

    function setActiveAllocationTab(tabId) {
      activeAllocationTab = tabId;
      updateModalChrome();
    }

    function acceptAutomaticSuggestion(suggestion) {
      const mtoItem = selectedMtoItems.find((item) => item.id === suggestion.mtoLineId);
      const poItem = projectPoItems.find((item) => item.id === suggestion.poItemId);
      const duplicate = [...activeAllocations, ...drafts].some((allocation) => allocation.mtoLineId === suggestion.mtoLineId
        && allocation.poItemId === suggestion.poItemId);
      if (!mtoItem || !poItem || duplicate
        || numericValue(suggestion.allocatedQuantity) > poItemBalance(poItem) + 0.000001
        || numericValue(suggestion.allocatedQuantity) > demandBalance(mtoItem, suggestion.unitOfMeasure) + 0.000001) {
        showToast('A sugestão não está mais disponível com os saldos atuais.', 'error');
        return;
      }
      drafts.push(suggestion);
      automaticSuggestions.splice(automaticSuggestions.indexOf(suggestion), 1);
      renderContextStrip();
      renderDrafts();
      renderPoCards();
      renderSelectedPoBar();
      renderPoItems();
    }

    function renderContextStrip() {
      contextStrip.replaceChildren();
      if (automaticSuggestions.length) {
        const suggestionList = createEl('div', 'mto-allocation-suggestions');
        const heading = createEl('div', 'mto-allocation-suggestion-heading');
        heading.append(
          createEl('span', 'material-symbols-outlined', 'auto_awesome'),
          createEl('strong', null, `${automaticSuggestions.length} sugestão(ões) automática(s) por IDENT CODE`),
        );
        suggestionList.append(heading);
        automaticSuggestions.forEach((suggestion) => {
          const mtoItem = selectedMtoItems.find((item) => item.id === suggestion.mtoLineId) || {};
          const poItem = projectPoItems.find((item) => item.id === suggestion.poItemId) || {};
          const row = createEl('div', 'mto-allocation-suggestion-row');
          const copy = createEl('span');
          copy.append(
            createEl('strong', null, `${mtoItem.drawing || '-'} · ${mtoItem.mark || mtoItem.pos || '-'}`),
            document.createTextNode(` → ${poItemAllocationLabel(poItem, poById.get(poItem.purchaseOrderId))}`),
          );
          const accept = createEl('button', 'btn btn-ghost btn-sm', 'Aceitar');
          accept.type = 'button';
          accept.addEventListener('click', () => acceptAutomaticSuggestion(suggestion));
          row.append(copy, accept);
          suggestionList.append(row);
        });
        if (automaticMatch.issues.length) {
          suggestionList.append(createEl('small', 'text-muted mto-allocation-suggestion-note',
            `${automaticMatch.issues.length} grupo(s) sem correspondência segura continuam disponíveis para seleção manual.`));
        }
        contextStrip.append(suggestionList);
      } else {
        const inline = createEl('p', 'mto-allocation-no-suggestion text-muted');
        const pendingMessage = automaticMatch.issues.length
          ? ` ${automaticMatch.issues.length} grupo(s) exigem seleção manual.`
          : '';
        inline.append(
          createEl('span', 'material-symbols-outlined', 'info'),
          document.createTextNode(`Nenhuma sugestão automática pendente.${pendingMessage}`),
        );
        contextStrip.append(inline);
      }
      const list = createEl('div', 'mto-allocation-demand-list');
      selectedMtoItems.forEach((mtoItem) => {
        const coverage = coverageByMto.get(mtoItem.id) || {};
        const unitOfMeasure = coverage.unitOfMeasure || 'EA';
        const chip = createEl('article', 'mto-allocation-demand-chip');
        const identity = createEl('strong', null, `${mtoItem.drawing || 'Sem desenho'} · ${mtoItem.mark || mtoItem.pos || 'Sem marca/POS'}`);
        const description = createEl('span', null, mtoItem.description || mtoItem.material || 'Demanda sem descrição');
        description.title = mtoItem.description || mtoItem.material || '';
        chip.append(identity, description, createEl('small', 'mto-allocation-shortage-badge', `falta ${formatNumber(demandBalance(mtoItem, unitOfMeasure), 2)} ${unitOfMeasure}`));
        list.append(chip);
      });
      contextStrip.append(list);
    }

    function renderPoCards() {
      const grid = procurementPanel.querySelector('[data-mto-po-grid]');
      const query = (procurementPanel.querySelector('[data-mto-po-search]')?.value || '').trim().toLowerCase();
      grid.replaceChildren();
      const matches = projectPurchaseOrders.filter((po) => {
        const supplier = organizationById.get(po.supplierId);
        return [po.poNumber, po.subject, po.status, supplier?.name, supplier?.legalName].join(' ').toLowerCase().includes(query);
      });
      matches.forEach((po) => {
        const poItemList = projectPoItems.filter((poItem) => poItem.purchaseOrderId === po.id);
        const linkedItems = poItemList.filter((poItem) => poItemBalance(poItem) + 0.000001 < numericValue(poItem.orderedQuantity)).length;
        const percentage = poItemList.length ? Math.round(linkedItems / poItemList.length * 100) : 0;
        const supplier = organizationById.get(po.supplierId);
        const card = createEl('button', `procurement-receiving-po-card mto-allocation-po-card${selectedPoId === po.id ? ' selected' : ''}`);
        card.type = 'button';
        const top = createEl('div', 'procurement-receiving-po-top');
        top.append(createEl('strong', null, po.poNumber || 'PO'), createEl('span', 'status-badge', `Rev. ${po.currentRevision || '00'}`));
        const progressLabel = createEl('div', 'procurement-receiving-progress-label');
        progressLabel.append(createEl('span', null, 'Itens vinculados'), createEl('strong', null, `${percentage}%`));
        const progress = createEl('div', 'procurement-receiving-progress');
        const bar = createEl('span');
        bar.style.width = `${percentage}%`;
        progress.append(bar);
        const footer = createEl('div', 'procurement-receiving-po-footer');
        footer.append(createEl('span', null, `${poItemList.length} itens`), createEl('span', null, po.orderDate || 'Sem data'));
        card.append(top, progressLabel, progress,
          createEl('strong', 'procurement-receiving-supplier', supplier?.name || supplier?.legalName || 'Fornecedor não informado'),
          createEl('p', 'text-muted procurement-receiving-subject', po.subject || 'Sem assunto'), footer);
        card.addEventListener('click', () => {
          selectedPoId = po.id;
          selectedPoItemId = '';
          poSelectorOpen = false;
          renderPoCards();
          renderSelectedPoBar();
          renderPoItems();
        });
        grid.append(card);
      });
      if (!matches.length) grid.append(createEl('p', 'text-muted', 'Nenhuma Purchase Order corresponde à busca.'));
    }

    function poProgress(po) {
      const itemsForPo = projectPoItems.filter((poItem) => poItem.purchaseOrderId === po.id);
      const linkedItems = itemsForPo.filter((poItem) => poItemBalance(poItem) + 0.000001 < numericValue(poItem.orderedQuantity)).length;
      return {
        items: itemsForPo,
        percentage: itemsForPo.length ? Math.round(linkedItems / itemsForPo.length * 100) : 0,
      };
    }

    function renderSelectedPoBar() {
      const bar = procurementPanel.querySelector('[data-mto-selected-po]');
      const selector = procurementPanel.querySelector('[data-mto-po-selector]');
      if (!bar || !selector) return;
      bar.replaceChildren();
      const po = poById.get(selectedPoId);
      selector.hidden = Boolean(po) && !poSelectorOpen;
      if (!po) {
        bar.append(createEl('strong', null, 'Selecione uma Purchase Order para continuar'));
        return;
      }
      const supplier = organizationById.get(po.supplierId);
      const progress = poProgress(po);
      const identity = createEl('div', 'mto-allocation-selected-po-identity');
      identity.append(
        createEl('strong', null, po.poNumber || 'PO'),
        createEl('span', 'status-badge', `Rev. ${po.currentRevision || '00'}`),
        createEl('span', 'mto-allocation-selected-po-supplier', supplier?.name || supplier?.legalName || 'Fornecedor não informado'),
        createEl('span', 'mto-allocation-selected-po-subject', po.subject || 'Sem assunto'),
      );
      const metrics = createEl('div', 'mto-allocation-selected-po-metrics');
      metrics.append(
        createEl('span', null, `${progress.items.length} itens`),
        createEl('strong', null, `${progress.percentage}% vinculado`),
      );
      const toggle = createEl('button', 'btn btn-ghost btn-sm', poSelectorOpen ? 'Fechar seletor' : 'Trocar PO');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(poSelectorOpen));
      toggle.addEventListener('click', () => {
        poSelectorOpen = !poSelectorOpen;
        renderSelectedPoBar();
      });
      bar.append(identity, metrics, toggle);
    }

    function renderEditor(poItem, editor) {
      const unitOfMeasure = poItem.unitOfMeasure || 'EA';
      editor.replaceChildren();
      editor.dataset.mtoAllocationEditor = '';
      const balanceLine = createEl('div', 'mto-allocation-editor-balance');
      balanceLine.append(
        createEl('span', null, 'Saldo disponível'),
        createEl('strong', null, `${formatNumber(poItemBalance(poItem), 2)} ${unitOfMeasure}`),
      );
      const wrap = createEl('div', 'table-wrap');
      const table = createEl('table', 'data-table mto-allocation-matrix');
      const head = createEl('thead');
      const headRow = createEl('tr');
      ['Drawing / Mark', 'Saldo da demanda', 'Quantidade deste item'].forEach((label) => headRow.append(createEl('th', null, label)));
      head.append(headRow);
      const tableBody = createEl('tbody');
      const inputs = [];
      selectedMtoItems.forEach((mtoItem) => {
        const duplicate = [...activeAllocations, ...drafts].some((allocation) => allocation.mtoLineId === mtoItem.id && allocation.poItemId === poItem.id);
        const compatible = compatibleUnit(mtoItem, unitOfMeasure);
        const balance = demandBalance(mtoItem, unitOfMeasure);
        const row = createEl('tr', duplicate || !compatible ? 'disabled-row' : '');
        const label = createEl('td');
        label.append(createEl('strong', null, `${mtoItem.drawing || '-'} · ${mtoItem.mark || mtoItem.pos || '-'}`),
          createEl('small', 'text-muted', duplicate ? 'Este par já está vinculado' : (!compatible ? 'Unidade incompatível' : mtoItem.description || '')));
        const input = createEl('input', 'input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.001';
        input.placeholder = '0';
        input.disabled = duplicate || !compatible || balance <= 0;
        inputs.push({ input, mtoItem, balance });
        const inputCell = createEl('td');
        inputCell.append(input);
        row.append(label, createEl('td', 'mc-numeric-cell', `${formatNumber(balance, 2)} ${unitOfMeasure}`), inputCell);
        tableBody.append(row);
      });
      table.append(head, tableBody);
      wrap.append(table);
      const actions = createEl('div', 'mto-allocation-editor-actions');
      const fill = createEl('button', 'btn btn-ghost', 'Preencher saldos');
      fill.type = 'button';
      fill.addEventListener('click', () => {
        let available = poItemBalance(poItem);
        inputs.forEach(({ input, balance }) => {
          const quantity = input.disabled ? 0 : Math.min(available, balance);
          input.value = quantity > 0 ? String(quantity) : '';
          available -= quantity;
        });
      });
      const add = createEl('button', 'btn btn-secondary', 'Adicionar ao lote');
      add.type = 'button';
      add.addEventListener('click', () => {
        const additions = inputs.map(({ input, mtoItem, balance }) => ({
          projectId, mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: numericValue(input.value), balance,
        })).filter((draft) => draft.allocatedQuantity > 0);
        const total = additions.reduce((sum, draft) => sum + draft.allocatedQuantity, 0);
        if (!additions.length) return showToast('Informe uma quantidade para pelo menos uma linha MTO.', 'error');
        if (total > poItemBalance(poItem) + 0.000001 || additions.some((draft) => draft.allocatedQuantity > draft.balance + 0.000001)) {
          return showToast('As quantidades excedem um dos saldos disponíveis.', 'error');
        }
        drafts.push(...additions.map(({ balance, ...draft }) => ({
          ...draft,
          unitOfMeasure,
          matchMethod: 'MANUAL',
          matchedIdentCode: '',
          createdBy: state.options.currentUserName || '',
        })));
        selectedPoItemId = '';
        renderContextStrip();
        renderDrafts();
        renderPoCards();
        renderSelectedPoBar();
        renderPoItems();
      });
      actions.append(fill, add);
      editor.append(balanceLine, wrap, actions);
    }

    function renderPoItems() {
      const list = procurementPanel.querySelector('[data-mto-po-items]');
      const query = (procurementPanel.querySelector('[data-mto-po-item-search]')?.value || '').trim().toLowerCase();
      list.replaceChildren();
      if (!selectedPoId) {
        list.append(createEl('p', 'mto-allocation-panel-empty text-muted', 'Selecione uma Purchase Order para ver os itens.'));
        return;
      }
      const matches = projectPoItems.filter((poItem) => poItem.purchaseOrderId === selectedPoId
        && poItemTechnicalPresentation(poItem).searchText.includes(query));
      matches.forEach((poItem) => {
        const presentation = poItemTechnicalPresentation(poItem);
        const unitOfMeasure = poItem.unitOfMeasure || 'EA';
        const balance = poItemBalance(poItem);
        const unavailable = balance <= 0.000001;
        if (unavailable && selectedPoItemId === poItem.id) selectedPoItemId = '';
        const expanded = selectedPoItemId === poItem.id;
        const card = createEl('article', `mto-allocation-po-item${expanded ? ' selected' : ''}${unavailable ? ' unavailable' : ''}`);
        const trigger = createEl('button', 'mto-allocation-po-item-trigger');
        trigger.type = 'button';
        trigger.disabled = unavailable;
        trigger.setAttribute('aria-expanded', String(expanded));
        const primaryLine = createEl('span', 'mto-allocation-po-item-primary');
        const identity = createEl('span', 'mto-allocation-po-item-identity');
        identity.append(
          createEl('strong', null, `Item ${poItem.itemNumber || '-'}`),
          createEl('code', null, presentation.tag || 'TAG —'),
        );
        const quantities = createEl('span', 'mto-allocation-po-item-quantities');
        quantities.append(
          createEl('span', null, `Total ${formatNumber(poItem.orderedQuantity, 2)} ${unitOfMeasure}`),
          createEl('strong', null, `Saldo ${formatNumber(balance, 2)} ${unitOfMeasure}`),
        );
        primaryLine.append(identity, quantities);
        const summary = createEl('small', 'mto-allocation-po-item-summary', presentation.summary || 'Material sem especificação resumida');
        trigger.append(primaryLine, summary);
        trigger.addEventListener('click', () => {
          selectedPoItemId = selectedPoItemId === poItem.id ? '' : poItem.id;
          renderPoItems();
        });
        card.append(trigger);
        if (expanded) {
          if (presentation.details.length) {
            const technicalGrid = createEl('dl', 'mto-allocation-technical-grid');
            presentation.details.forEach(({ label, value }) => {
              const field = createEl('div', 'mto-allocation-technical-field');
              field.append(createEl('dt', null, label), createEl('dd', null, value));
              technicalGrid.append(field);
            });
            card.append(technicalGrid);
          }
          const editor = createEl('div', 'mto-allocation-editor');
          renderEditor(poItem, editor);
          card.append(editor);
        }
        list.append(card);
      });
      if (!matches.length) list.append(createEl('p', 'text-muted', 'Nenhum PO Item corresponde à busca.'));
    }

    function renderProcurement() {
      procurementPanel.dataset.mtoAllocationPanel = 'select';
      procurementPanel.setAttribute('role', 'tabpanel');
      procurementPanel.replaceChildren();
      const workspace = createEl('div', 'mto-allocation-selection-workspace');
      const selectedPoBar = createEl('section', 'mto-allocation-selected-po');
      selectedPoBar.dataset.mtoSelectedPo = '';
      const poSelector = createEl('section', 'mto-allocation-po-selector');
      poSelector.dataset.mtoPoSelector = '';
      poSelector.append(sectionHeader('Purchase Orders', 'Selecione uma compra para consultar seus itens.'));
      const poSearch = createEl('input', 'input');
      poSearch.type = 'search';
      poSearch.placeholder = 'Buscar PO, fornecedor, assunto ou status...';
      poSearch.dataset.mtoPoSearch = '';
      poSearch.addEventListener('input', renderPoCards);
      const grid = createEl('div', 'procurement-receiving-po-grid mto-allocation-po-grid');
      grid.dataset.mtoPoGrid = '';
      poSelector.append(poSearch, grid);
      const itemWorkspace = createEl('section', 'mto-allocation-items-workspace');
      const itemToolbar = createEl('div', 'mto-allocation-item-toolbar');
      const itemSearch = createEl('input', 'input');
      itemSearch.type = 'search';
      itemSearch.placeholder = 'Buscar item, TAG, MR item ou material...';
      itemSearch.dataset.mtoPoItemSearch = '';
      itemSearch.addEventListener('input', renderPoItems);
      itemToolbar.append(createEl('h4', null, 'PO Items'), itemSearch);
      const itemList = createEl('div', 'mto-allocation-po-items');
      itemList.dataset.mtoPoItems = '';
      itemWorkspace.append(itemToolbar, itemList);
      workspace.append(selectedPoBar, poSelector, itemWorkspace);
      procurementPanel.append(workspace);
      renderPoCards();
      renderSelectedPoBar();
      renderPoItems();
    }

    function renderDrafts() {
      draftPanel.dataset.mtoAllocationPanel = 'drafts';
      draftPanel.setAttribute('role', 'tabpanel');
      draftPanel.replaceChildren(sectionHeader('Lote de vínculos', 'Revise as relações antes de salvar.', `${drafts.length} nova(s)`));
      if (!drafts.length) {
        const empty = createEl('div', 'mto-allocation-empty-state');
        empty.append(createEl('span', 'material-symbols-outlined', 'link_off'), createEl('p', null, 'Nenhum vínculo foi adicionado ao lote.'));
        draftPanel.append(empty);
        updateModalChrome();
        return;
      }
      const wrap = createEl('div', 'table-wrap');
      const table = createEl('table', 'data-table mto-allocation-links-table');
      const head = createEl('thead');
      const headRow = createEl('tr');
      ['MTO Drawing / Mark', 'Purchase Order Item', 'Quantidade', 'Origem', 'Ação'].forEach((label) => headRow.append(createEl('th', null, label)));
      head.append(headRow);
      const tableBody = createEl('tbody');
      drafts.forEach((draft, index) => {
        const mtoItem = selectedMtoItems.find((item) => item.id === draft.mtoLineId) || {};
        const poItem = projectPoItems.find((item) => item.id === draft.poItemId) || {};
        const row = createEl('tr');
        const mtoCell = createEl('td', 'mto-allocation-link-mto');
        mtoCell.append(
          createEl('strong', null, mtoItem.drawing || '-'),
          createEl('small', 'text-muted', mtoItem.mark || mtoItem.pos || '-'),
        );
        const poCell = createEl('td', 'mto-allocation-link-po');
        poCell.append(createEl('span', null, poItemAllocationLabel(poItem, poById.get(poItem.purchaseOrderId))));
        row.append(mtoCell, poCell,
          createEl('td', 'mc-numeric-cell', `${formatNumber(draft.allocatedQuantity, 2)} ${poItem.unitOfMeasure || 'EA'}`),
          createEl('td', null, draft.matchMethod === 'AUTO_IDENT_CODE' ? 'IDENT CODE automático' : 'Manual'));
        const action = createEl('td', 'row-actions mto-allocation-link-actions');
        const remove = createEl('button', 'btn btn-ghost btn-sm', 'Remover');
        remove.type = 'button';
        remove.addEventListener('click', () => {
          drafts.splice(index, 1);
          renderContextStrip();
          renderDrafts();
          renderPoCards();
          renderSelectedPoBar();
          renderPoItems();
        });
        action.append(remove);
        row.append(action);
        tableBody.append(row);
      });
      table.append(head, tableBody);
      wrap.append(table);
      draftPanel.append(wrap);
      updateModalChrome();
    }

    function renderExisting() {
      existingPanel.dataset.mtoAllocationPanel = 'existing';
      existingPanel.setAttribute('role', 'tabpanel');
      existingPanel.replaceChildren(sectionHeader('Vínculos existentes', 'Recebimentos continuam sendo calculados pelo PO Item ligado.', `${existingAllocations.length} ativo(s)`));
      if (!existingAllocations.length) {
        const empty = createEl('div', 'mto-allocation-empty-state');
        empty.append(createEl('span', 'material-symbols-outlined', 'link_off'), createEl('p', null, 'As linhas selecionadas ainda não possuem vínculos ativos.'));
        existingPanel.append(empty);
        return;
      }
      const wrap = createEl('div', 'table-wrap');
      const table = createEl('table', 'data-table mto-allocation-links-table');
      const head = createEl('thead');
      const headRow = createEl('tr');
      ['MTO Drawing / Mark', 'Purchase Order Item', 'Alocado', 'Recebido', 'Ação'].forEach((label) => headRow.append(createEl('th', null, label)));
      head.append(headRow);
      const tableBody = createEl('tbody');
      existingAllocations.forEach((allocation) => {
        const mtoItem = selectedMtoItems.find((item) => item.id === allocation.mtoLineId) || {};
        const poItem = projectPoItems.find((item) => item.id === allocation.poItemId) || {};
        const allocationDetail = (coverageByMto.get(allocation.mtoLineId)?.allocations || [])
          .find((detail) => detail.allocation.id === allocation.id) || {};
        const row = createEl('tr');
        const mtoCell = createEl('td', 'mto-allocation-link-mto');
        mtoCell.append(
          createEl('strong', null, mtoItem.drawing || '-'),
          createEl('small', 'text-muted', mtoItem.mark || mtoItem.pos || '-'),
        );
        const poCell = createEl('td', 'mto-allocation-link-po');
        poCell.append(createEl('span', null, poItemAllocationLabel(poItem, poById.get(poItem.purchaseOrderId))));
        row.append(mtoCell, poCell,
          createEl('td', 'mc-numeric-cell', `${formatNumber(allocation.allocatedQuantity, 2)} ${allocation.unitOfMeasure || poItem.unitOfMeasure || 'EA'}`),
          createEl('td', 'mc-numeric-cell', formatNumber(allocationDetail.receivedQuantity, 2)));
        const action = createEl('td', 'row-actions mto-allocation-link-actions');
        const cancel = createEl('button', 'btn btn-ghost btn-sm', 'Cancelar vínculo');
        cancel.type = 'button';
        cancel.addEventListener('click', async () => {
          try {
            await state.options.cancelMtoPoItemAllocation?.(allocation.id, {
              reason: 'Allocation cancelled from MTO Management.',
              userName: state.options.currentUserName || '',
            });
            closeModal();
            showToast('Vínculo entre MTO e PO Item cancelado.', 'success');
            await rerender(true);
          } catch (error) {
            console.error(error);
            showToast(error?.message || 'Falha ao cancelar o vínculo.', 'error');
          }
        });
        action.append(cancel);
        row.append(action);
        tableBody.append(row);
      });
      table.append(head, tableBody);
      wrap.append(table);
      existingPanel.append(wrap);
    }

    [
      { id: 'select', label: 'Selecionar compra' },
      { id: 'drafts', label: 'Lote de vínculos', count: drafts.length },
      { id: 'existing', label: 'Vínculos existentes', count: existingAllocations.length },
    ].forEach((tab) => {
      const button = createEl('button', 'mto-allocation-tab');
      button.type = 'button';
      button.dataset.mtoAllocationTab = tab.id;
      button.setAttribute('role', 'tab');
      button.append(createEl('span', 'mto-allocation-tab-label', tab.label));
      if (tab.count != null) button.append(createEl('span', 'mto-allocation-tab-count', String(tab.count)));
      button.addEventListener('click', () => setActiveAllocationTab(tab.id));
      tabs.append(button);
    });
    tabs.setAttribute('role', 'tablist');
    renderContextStrip();
    renderProcurement();
    renderDrafts();
    renderExisting();
    tabPanels.append(procurementPanel, draftPanel, existingPanel);
    body.append(contextStrip, tabs, tabPanels);
    const modalHandle = openModal({
      title: 'Ligar demandas MTO às compras', body, wide: true,
      buttons: [
        { label: 'Fechar', variant: 'btn-ghost' },
        { label: 'Salvar lote de vínculos', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
          if (!drafts.length) return showToast('Adicione pelo menos uma relação ao lote.', 'error');
          try {
            await state.options.saveMtoPoItemAllocations?.(drafts);
            closeModal();
            showToast(`${drafts.length} relação(ões) MTO × PO Item salvas.`, 'success');
            await rerender(true);
          } catch (error) {
            console.error(error);
            showToast(error?.message || 'Falha ao salvar o lote de vínculos.', 'error');
          }
        } },
      ],
    });
    footerCounter = createEl('strong', 'mto-allocation-footer-count', `${drafts.length} vínculo(s) no lote`);
    modalHandle.bodyEl.closest('.modal')?.querySelector('.modal-footer')?.prepend(footerCounter);
    updateModalChrome();
  } catch (error) {
    console.error(error);
    showToast('Falha ao carregar compras e recebimentos das demandas.', 'error');
  }
}

function renderSelectionToolbar(allItems, state, rerender) {
  const fragment = document.createDocumentFragment();
  const primaryToolbar = createEl('section', 'mto-toolbar mto-primary-toolbar');
  const selected = selectedItems(allItems, state);
  const canEdit = selected.length === 1;
  const canDelete = selected.length > 0;
  const canSend = selectedSendableItems(allItems, state).length > 0;

  const add = createEl('button', 'btn btn-secondary', 'Add line');
  add.type = 'button';
  add.addEventListener('click', () => {
    state.isAdding = true;
    state.editingId = '';
    rerender();
  });
  primaryToolbar.append(add);
  fragment.append(primaryToolbar);

  if (!selected.length) return fragment;

  const toolbar = createEl('section', 'mto-toolbar mto-contextual-toolbar');
  toolbar.setAttribute('aria-label', 'Ações para linhas MTO selecionadas');

  const count = createEl('strong', 'mto-selection-count', `${selected.length} selecionada(s)`);

  const edit = createEl('button', 'btn btn-ghost', 'Editar');
  edit.type = 'button';
  edit.disabled = !canEdit;
  edit.addEventListener('click', () => {
    if (!canEdit) return;
    state.isAdding = false;
    state.editingId = selected[0].id;
    state.expandedId = selected[0].id;
    rerender();
  });

  const remove = createEl('button', 'btn btn-critical', 'Excluir');
  remove.type = 'button';
  remove.disabled = !canDelete;
  remove.addEventListener('click', () => {
    if (!canDelete) return;
    openDeleteSelectedDialog(selected, state, rerender);
  });

  const send = createEl('button', 'btn btn-primary', 'Enviar para Cut Sheets');
  send.type = 'button';
  send.disabled = !canSend;
  send.addEventListener('click', async () => {
    const sendable = selectedSendableItems(allItems, state);
    if (!sendable.length) {
      showToast('Nenhuma linha válida selecionada.', 'error');
      return;
    }
    await state.options.onSendToCutSheets?.(sendable);
  });

  const createWorkpack = createEl('button', 'btn btn-secondary', 'Criar Workpack');
  createWorkpack.type = 'button';
  createWorkpack.disabled = !canSend;
  createWorkpack.addEventListener('click', async () => {
    const sendable = selectedSendableItems(allItems, state);
    if (!sendable.length) {
      showToast('Nenhuma linha válida selecionada.', 'error');
      return;
    }
    await state.options.onCreateWorkpack?.(sendable);
  });

  const linkPurchase = createEl('button', 'btn btn-secondary', 'Vincular PO Items');
  linkPurchase.type = 'button';
  linkPurchase.disabled = !canDelete;
  linkPurchase.addEventListener('click', () => {
    if (!selected.length) return;
    openMtoPoAllocationModal(selected, state, rerender);
  });

  const clear = createEl('button', 'btn btn-ghost mto-clear-selection');
  clear.type = 'button';
  clear.disabled = !canDelete;
  clear.title = 'Limpar seleção';
  clear.setAttribute('aria-label', 'Limpar seleção');
  clear.append(createEl('span', 'material-symbols-outlined', 'close'));
  clear.addEventListener('click', () => {
    state.selectedIds.clear();
    state.editingId = '';
    rerender();
  });

  toolbar.append(count, edit, linkPurchase, send, createWorkpack, remove, clear);
  fragment.append(toolbar);
  return fragment;
}

function openMtoIdentCodeReview(items, rerender) {
  const generated = generateMissingMtoIdentCodes(items);
  const changes = generated.items.filter((item, index) => item !== items[index]);
  if (!changes.length) {
    showToast('Nenhum IDENT CODE pôde ser gerado para os itens vazios.', 'warning');
    return;
  }

  const body = createEl('div', 'mto-ident-code-review');
  body.append(createEl('p', 'text-muted', `${changes.length} IDENT CODE(s) serão gerados. Revise antes de salvar.`));
  const table = createEl('table', 'data-table');
  const thead = createEl('thead');
  const header = createEl('tr');
  ['Drawing', 'Mark', 'Pos.', 'Material', 'IDENT CODE'].forEach((label) => header.append(createEl('th', null, label)));
  thead.append(header);
  const tbody = createEl('tbody');
  changes.forEach((item) => {
    const row = createEl('tr');
    [item.drawing, item.mark, item.pos, item.material, item.identCode]
      .forEach((value) => row.append(createEl('td', null, value || '—')));
    tbody.append(row);
  });
  table.append(thead, tbody);
  body.append(table);

  openModal({
    title: 'Revisar IDENT CODEs da MTO',
    body,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-secondary' },
      {
        label: `Salvar ${changes.length} código(s)`,
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          try {
            await Promise.all(changes.map((item) => updateMtoItem(item.id, { identCode: item.identCode })));
            closeModal();
            showToast(`${changes.length} IDENT CODE(s) gerado(s) e salvo(s).`, 'success');
            await rerender(true);
          } catch (error) {
            console.error(error);
            showToast('Falha ao salvar os IDENT CODEs gerados.', 'error');
          }
        },
      },
    ],
  });
}

function mtoDrawingKey(item = {}) {
  return item.drawingNo || item.drawing || '(sem desenho)';
}

function mtoPositionValue(item = {}) {
  return item.position || item.pos || '?';
}

function mtoBulkSearchText(item = {}) {
  return [
    item.mark,
    item.description,
    item.material,
    item.equipmentName,
    item.constructionActivity,
  ].join(' ').toLowerCase();
}

function groupMtoItemsByDrawing(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const key = mtoDrawingKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function mtoConstructionActivityKey(item = {}) {
  return item.constructionActivity || item.equipmentName || '(sem atividade)';
}

function groupMtoItemsByConstructionActivity(items = []) {
  const groups = new Map();
  items.forEach((item) => {
    const key = mtoConstructionActivityKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function equipmentLabel(equipment = {}) {
  return equipment.name || equipment.clientTag || equipment.code || equipment.id || '';
}

export function equipmentHint(item = {}) {
  return item.tag || item.equipmentName || item.constructionActivity || '';
}

export function enrichItemsWithEquipment(items = [], equipments = []) {
  return items.map((item) => {
    if (item.equipmentId) return item;
    const match = findEquipmentMatch(equipments, equipmentHint(item));
    return match.equipment ? { ...item, equipmentId: match.equipment.id } : item;
  });
}

async function getEquipmentCandidates(projectId = '') {
  return listEquipments(projectId ? { projectId } : {});
}

function getVisibleBulkItemCheckboxes(body) {
  return [...body.querySelectorAll('.mto-bulk-link-item-checkbox')]
    .filter((checkbox) => {
      const item = checkbox.closest('.mto-bulk-link-item');
      const group = checkbox.closest('.mto-bulk-link-group');
      return !item?.classList.contains('mto-bulk-link-item--hidden')
        && !group?.classList.contains('mto-bulk-link-group--hidden');
    });
}

function updateBulkGroupCheckbox(group) {
  const groupCheckbox = group.querySelector('.mto-bulk-link-group-checkbox');
  const visibleCheckboxes = [...group.querySelectorAll('.mto-bulk-link-item-checkbox')]
    .filter((checkbox) => !checkbox.closest('.mto-bulk-link-item')?.classList.contains('mto-bulk-link-item--hidden'));
  if (!groupCheckbox) return;
  const checkedCount = visibleCheckboxes.filter((checkbox) => checkbox.checked).length;
  groupCheckbox.checked = visibleCheckboxes.length > 0 && checkedCount === visibleCheckboxes.length;
  groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
}

function updateBulkSelectionState(body) {
  const visibleCheckboxes = getVisibleBulkItemCheckboxes(body);
  const selectedCount = visibleCheckboxes.filter((checkbox) => checkbox.checked).length;
  const counter = body.querySelector('.mto-bulk-link-counter');
  const selectAll = body.querySelector('.mto-bulk-link-select-all');
  if (counter) counter.textContent = `${selectedCount} de ${visibleCheckboxes.length} selecionados`;
  if (selectAll) {
    selectAll.checked = visibleCheckboxes.length > 0 && selectedCount === visibleCheckboxes.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleCheckboxes.length;
  }
  body.querySelectorAll('.mto-bulk-link-group').forEach(updateBulkGroupCheckbox);
}

function applyBulkLinkSearch(body, query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  body.querySelectorAll('.mto-bulk-link-group').forEach((group) => {
    let visibleCount = 0;
    group.querySelectorAll('.mto-bulk-link-item').forEach((row) => {
      const searchText = row.dataset.searchText || '';
      const matches = tokens.every((token) => searchText.includes(token));
      row.classList.toggle('mto-bulk-link-item--hidden', !matches);
      if (matches) visibleCount += 1;
    });
    group.classList.toggle('mto-bulk-link-group--hidden', visibleCount === 0);
    const count = group.querySelector('.mto-bulk-link-visible-count');
    if (count) count.textContent = `${visibleCount} visivel(is)`;
  });
  updateBulkSelectionState(body);
}

function renderHiddenItemsWarning(hiddenCount, state, rerender) {
  if (!state.options.projectId || hiddenCount <= 0) return document.createDocumentFragment();

  const warning = createEl('section', 'mto-hidden-items-warning');
  const message = createEl('span', null, `${hiddenCount} itens sem projeto estao ocultos.`);
  const linkNow = createEl('button', 'btn btn-secondary btn-sm', 'Vincular agora');
  linkNow.type = 'button';
  linkNow.addEventListener('click', () => openBulkLinkMtoItemsModal(state, rerender));
  warning.append(message, linkNow);
  return warning;
}

function renderViewAllBulkLinkButton(unlinkedCount, state, rerender) {
  if (state.options.projectId || unlinkedCount <= 0) return document.createDocumentFragment();

  const button = createEl('button', 'btn btn-secondary mto-bulk-link-button', `Vincular ${unlinkedCount} itens sem projeto`);
  button.type = 'button';
  button.addEventListener('click', () => openBulkLinkMtoItemsModal(state, rerender));
  return button;
}

function renderUnlinkedEquipmentWarning(unlinkedCount, state, rerender) {
  if (!state.options.projectId || unlinkedCount <= 0) return document.createDocumentFragment();

  const warning = createEl('section', 'mto-hidden-items-warning');
  const message = createEl('span', null, `${unlinkedCount} itens sem equipamento vinculado.`);
  const linkNow = createEl('button', 'btn btn-secondary btn-sm', 'Vincular equipamentos');
  linkNow.type = 'button';
  linkNow.addEventListener('click', () => openBulkLinkEquipmentModal(state, rerender));
  warning.append(message, linkNow);
  return warning;
}

function renderViewAllEquipmentBulkLinkButton(unlinkedCount, state, rerender) {
  if (state.options.projectId || unlinkedCount <= 0) return document.createDocumentFragment();

  const button = createEl('button', 'btn btn-secondary mto-bulk-link-button', `Vincular ${unlinkedCount} itens sem equipamento`);
  button.type = 'button';
  button.addEventListener('click', () => openBulkLinkEquipmentModal(state, rerender));
  return button;
}

function showMtoValidationErrors(validationErrors = []) {
  const body = createEl('div', 'mto-import-validation-errors');
  body.append(createEl(
    'p',
    'text-critical',
    `A importacao foi cancelada: ${validationErrors.length} linha(s) precisam de correcao.`,
  ));
  const list = createEl('ul');
  validationErrors.forEach((failure) => {
    list.append(createEl('li', null, `Linha ${failure.rowNumber}: ${failure.errors.join(', ')}`));
  });
  body.append(list);
  openModal({
    title: 'Erros de validacao da MTO',
    body,
    wide: true,
    buttons: [{ label: 'Fechar', variant: 'btn-primary' }],
  });
}

function drawingSyncStatusLabel(status) {
  return ({ pending: 'Pendente', failed: 'Falhou', processing: 'Processando' })[status] || status || 'Pendente';
}

function formatMtoBatchDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '-';
}

function openMtoDrawingSyncDetails(batch) {
  const sync = batch.metadata?.drawingSync || {};
  const body = createEl('div', 'mto-drawing-sync-details');
  const rows = [
    ['Batch', batch.id || '-'],
    ['Arquivo', batch.fileName || '-'],
    ['Status', drawingSyncStatusLabel(sync.status)],
    ['Ultima tentativa', formatMtoBatchDate(sync.lastAttemptAt)],
    ['Erro conhecido', sync.lastError || sync.error || '-'],
  ];
  rows.forEach(([label, value]) => {
    const row = createEl('div');
    row.append(createEl('strong', null, label), createEl('span', null, value));
    body.append(row);
  });
  const appendList = (title, values) => {
    body.append(createEl('h4', null, title));
    const list = createEl('ul');
    const entries = Array.isArray(values) ? values : [];
    if (!entries.length) list.append(createEl('li', 'text-muted', 'Nenhum.'));
    else entries.forEach((value) => list.append(createEl('li', null, value)));
    body.append(list);
  };
  appendList('Drawing Nos pendentes', sync.pendingDrawingNos);
  appendList('IDs de Drawings criados', sync.createdDrawingIds);
  openModal({ title: 'Detalhes da sincronizacao de Drawings', body, wide: true });
}

function pendingDrawingSyncSort(a, b) {
  const dateDifference = new Date(b.importedAt || 0).getTime() - new Date(a.importedAt || 0).getTime();
  return dateDifference || String(a.id || '').localeCompare(String(b.id || ''));
}

function renderPendingDrawingSyncBatches(batches, rerender) {
  if (!batches.length) return document.createDocumentFragment();
  const section = createEl('section', 'mto-drawing-sync-warning');
  const heading = createEl('div', 'mto-drawing-sync-heading');
  heading.append(
    createEl('span', 'material-symbols-outlined', 'sync_problem'),
    createEl('div'),
  );
  heading.lastElementChild.append(
    createEl('h2', null, 'Sincronizacao de Drawings pendente'),
    createEl('p', null, 'Uma importacao MTO foi concluida, mas alguns Drawings ainda nao foram sincronizados.'),
  );
  section.append(heading);

  batches.forEach((batch) => {
    const sync = batch.metadata?.drawingSync || {};
    const pendingCount = Array.isArray(sync.pendingDrawingNos) ? sync.pendingDrawingNos.length : 0;
    const card = createEl('article', 'mto-drawing-sync-card');
    const info = createEl('div', 'mto-drawing-sync-info');
    info.append(
      createEl('strong', null, batch.fileName || batch.id || 'Importacao MTO'),
      createEl('span', null, `Importado em: ${formatMtoBatchDate(batch.importedAt)}`),
      createEl('span', null, `${pendingCount} Drawing No(s) pendente(s)`),
      createEl('span', `status-badge ${sync.status === 'failed' ? 'critical' : ''}`, drawingSyncStatusLabel(sync.status)),
    );
    if (sync.lastError || sync.error) info.append(createEl('p', 'text-critical', sync.lastError || sync.error));

    const actions = createEl('div', 'mto-drawing-sync-actions');
    const retry = createEl('button', 'btn btn-primary btn-sm', 'Tentar novamente');
    retry.type = 'button';
    retry.disabled = sync.status === 'processing';
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      retry.setAttribute('aria-busy', 'true');
      const originalLabel = retry.textContent;
      retry.textContent = 'Sincronizando...';
      try {
        const result = await retryPendingMtoDrawingSync({ batchId: batch.id });
        if (result.status === 'complete') {
          showToast(`Drawings sincronizados: ${result.createdDrawings.length} criado(s).`, 'success');
        } else {
          showToast(`Falha ao sincronizar Drawings: ${result.error}`, 'error');
        }
      } catch (error) {
        console.error(error);
        showToast(error?.message || 'Falha ao reprocessar Drawings.', 'error');
      } finally {
        retry.removeAttribute('aria-busy');
        retry.textContent = originalLabel;
        await rerender(true);
      }
    });
    const details = createEl('button', 'btn btn-secondary btn-sm', 'Ver detalhes');
    details.type = 'button';
    details.addEventListener('click', () => openMtoDrawingSyncDetails(batch));
    actions.append(retry, details);
    card.append(info, actions);
    section.append(card);
  });
  return section;
}

function mtoImportErrorMessage(error) {
  if (error?.code === 'MTO_IMPORT_QUOTA_EXCEEDED') {
    return 'Espaco de armazenamento insuficiente para importar a MTO.';
  }
  if (error?.code === 'MTO_IMPORT_CONSTRAINT_FAILED') {
    return 'A importacao viola uma restricao do banco de dados. Revise itens duplicados.';
  }
  if (error?.code === 'MTO_BATCH_WRITE_FAILED') return 'Nao foi possivel salvar o lote da MTO.';
  if (error?.code === 'MTO_ITEM_WRITE_FAILED') {
    return `Nao foi possivel salvar o item da linha ${error.rowNumber || '?'}.`;
  }
  if (error?.code === 'MTO_AUDIT_WRITE_FAILED') return 'Nao foi possivel registrar a auditoria da importacao.';
  return error?.message || 'Falha ao importar MTO.';
}

function appendBulkLinkItem(list, item, body) {
  const label = createEl('label', 'mto-bulk-link-item');
  label.dataset.searchText = mtoBulkSearchText(item);
  const checkbox = createEl('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'mto-bulk-link-item-checkbox';
  checkbox.value = item.id;
  checkbox.addEventListener('change', () => updateBulkSelectionState(body));

  const summary = createEl('span');
  const mark = item.mark || '(sem mark)';
  const position = mtoPositionValue(item);
  const description = item.description || 'Sem descricao';
  summary.textContent = `${mark} / Pos ${position} \u2014 ${description}`;

  label.append(checkbox, summary);
  list.append(label);
}

function buildBulkLinkGroup(drawingNo, items, body) {
  const group = createEl('section', 'mto-bulk-link-group');

  const header = createEl('div', 'mto-bulk-link-group-header');
  const toggle = createEl('span', 'mto-bulk-link-group-toggle', '▼');
  const groupCheckbox = createEl('input');
  groupCheckbox.type = 'checkbox';
  groupCheckbox.className = 'mto-bulk-link-group-checkbox';
  const label = createEl('span', 'mto-bulk-link-group-label', `${drawingNo} [${items.length} pecas]`);
  const visibleCount = createEl('small', 'text-muted mto-bulk-link-visible-count', `${items.length} visivel(is)`);
  header.append(toggle, groupCheckbox, label, visibleCount);

  const itemList = createEl('div', 'mto-bulk-link-group-items');
  items.forEach((item) => appendBulkLinkItem(itemList, item, body));

  header.addEventListener('click', (event) => {
    if (event.target === groupCheckbox) return;
    const collapsed = itemList.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '▶' : '▼';
  });

  groupCheckbox.addEventListener('change', () => {
    const visibleCheckboxes = [...group.querySelectorAll('.mto-bulk-link-item-checkbox')]
      .filter((checkbox) => !checkbox.closest('.mto-bulk-link-item')?.classList.contains('mto-bulk-link-item--hidden'));
    visibleCheckboxes.forEach((checkbox) => {
      checkbox.checked = groupCheckbox.checked;
    });
    updateBulkSelectionState(body);
  });

  group.append(header, itemList);
  return group;
}

function appendEquipmentOption(select, equipment) {
  const label = equipmentLabel(equipment);
  if (!equipment?.id || !label) return;
  const option = createEl('option', null, label);
  option.value = equipment.id;
  select.append(option);
}

async function openBulkLinkMtoItemsModal(state, rerender) {
  try {
    const [allItems, projects] = await Promise.all([
      getMtoItems({}),
      getAllProjects(),
    ]);
    const unlinkedItems = allItems.filter((item) => !item.projectId);

    const body = createEl('div', 'mto-bulk-link-modal');
    body.append(createEl('p', 'text-muted', 'Selecione os itens sem projeto e o projeto destino.'));

    const search = createEl('input');
    search.className = 'input mto-bulk-link-search';
    search.type = 'search';
    search.placeholder = 'Buscar por mark, descricao ou material...';

    const controls = createEl('div', 'mto-bulk-link-controls');
    const selectAll = createEl('input');
    selectAll.type = 'checkbox';
    selectAll.className = 'mto-bulk-link-select-all';
    selectAll.id = 'mto-bulk-link-select-all';
    const selectAllLabel = createEl('label', null, 'Selecionar todos (visiveis)');
    selectAllLabel.htmlFor = selectAll.id;
    const counter = createEl('span', 'mto-bulk-link-counter', '0 de 0 selecionados');
    controls.append(selectAll, selectAllLabel, counter);

    const projectField = createEl('label', 'field');
    projectField.append(createEl('span', null, 'Projeto destino'));
    const projectSelect = createEl('select');
    projectSelect.className = 'input';
    const emptyOption = createEl('option', null, 'Selecione...');
    emptyOption.value = '';
    projectSelect.append(emptyOption);
    projects.forEach((project) => {
      const label = projectLabel(project);
      if (!label) return;
      const option = createEl('option', null, label);
      option.value = project.id || label;
      option.selected = option.value === state.options.projectId;
      projectSelect.append(option);
    });
    projectSelect.value = [...projectSelect.options].some((option) => option.value === state.options.projectId)
      ? state.options.projectId
      : '';
    projectField.append(projectSelect);

    const list = createEl('div', 'mto-bulk-link-list mto-bulk-link-groups');
    if (unlinkedItems.length) {
      groupMtoItemsByDrawing(unlinkedItems).forEach(([drawingNo, items]) => {
        list.append(buildBulkLinkGroup(drawingNo, items, body));
      });
    } else {
      list.append(createEl('p', 'text-muted', 'Nao ha itens sem projeto para vincular.'));
    }

    search.addEventListener('input', () => applyBulkLinkSearch(body, search.value));
    selectAll.addEventListener('change', () => {
      getVisibleBulkItemCheckboxes(body).forEach((checkbox) => {
        checkbox.checked = selectAll.checked;
      });
      updateBulkSelectionState(body);
    });

    body.append(search, controls, list, projectField);
    updateBulkSelectionState(body);

    openModal({
      title: 'Vincular Itens da MTO a um Projeto',
      body,
      wide: true,
      buttons: [
        { label: 'Cancelar', variant: 'btn-ghost' },
        {
          label: 'Vincular Selecionados',
          variant: 'btn-primary',
          closeOnClick: false,
          onClick: async () => {
            const projectId = projectSelect.value;
            if (!projectId) {
              showToast('Selecione um projeto destino', 'error');
              return;
            }

            const selectedIds = [...body.querySelectorAll('.mto-bulk-link-item input:checked')]
              .map((checkbox) => checkbox.value)
              .filter(Boolean);
            if (!selectedIds.length) {
              showToast('Selecione ao menos um item da MTO', 'error');
              return;
            }

            try {
              await Promise.all(selectedIds.map((id) => updateMtoItem(id, { projectId })));
              closeModal();
              showToast(`${selectedIds.length} itens vinculados com sucesso`, 'success');
              await rerender(true);
            } catch (error) {
              console.error(error);
              showToast('Falha ao vincular itens da MTO.', 'error');
            }
          },
        },
      ],
    });
  } catch (error) {
    console.error(error);
    showToast('Falha ao carregar itens sem projeto.', 'error');
  }
}

async function openBulkLinkEquipmentModal(state, rerender) {
  try {
    const [items, equipments] = await Promise.all([
      getMtoItems(state.options.projectId ? { projectId: state.options.projectId } : {}),
      getEquipmentCandidates(state.options.projectId || ''),
    ]);
    const unlinkedItems = items.filter((item) => !item.equipmentId);

    const body = createEl('div', 'mto-bulk-link-modal');
    body.append(createEl('p', 'text-muted', 'Selecione os itens sem equipamento e o equipamento destino.'));

    const search = createEl('input');
    search.className = 'input mto-bulk-link-search';
    search.type = 'search';
    search.placeholder = 'Buscar por mark, descricao, material ou atividade...';

    const controls = createEl('div', 'mto-bulk-link-controls');
    const selectAll = createEl('input');
    selectAll.type = 'checkbox';
    selectAll.className = 'mto-bulk-link-select-all';
    selectAll.id = 'mto-equipment-bulk-link-select-all';
    const selectAllLabel = createEl('label', null, 'Selecionar todos (visiveis)');
    selectAllLabel.htmlFor = selectAll.id;
    const counter = createEl('span', 'mto-bulk-link-counter', '0 de 0 selecionados');
    controls.append(selectAll, selectAllLabel, counter);

    const equipmentField = createEl('label', 'field');
    equipmentField.append(createEl('span', null, 'Equipamento destino'));
    const equipmentSelect = createEl('select');
    equipmentSelect.className = 'input';
    const emptyOption = createEl('option', null, 'Selecione...');
    emptyOption.value = '';
    equipmentSelect.append(emptyOption);
    equipments.forEach((equipment) => appendEquipmentOption(equipmentSelect, equipment));
    equipmentField.append(equipmentSelect);

    const list = createEl('div', 'mto-bulk-link-list mto-bulk-link-groups');
    if (unlinkedItems.length) {
      groupMtoItemsByConstructionActivity(unlinkedItems).forEach(([activity, groupItems]) => {
        list.append(buildBulkLinkGroup(activity, groupItems, body));
      });
    } else {
      list.append(createEl('p', 'text-muted', 'Nao ha itens sem equipamento para vincular.'));
    }

    search.addEventListener('input', () => applyBulkLinkSearch(body, search.value));
    selectAll.addEventListener('change', () => {
      getVisibleBulkItemCheckboxes(body).forEach((checkbox) => {
        checkbox.checked = selectAll.checked;
      });
      updateBulkSelectionState(body);
    });

    body.append(search, controls, list, equipmentField);
    updateBulkSelectionState(body);

    openModal({
      title: 'Vincular Itens da MTO a um Equipamento',
      body,
      wide: true,
      buttons: [
        { label: 'Cancelar', variant: 'btn-ghost' },
        {
          label: 'Tentar vincular automaticamente',
          variant: 'btn-secondary',
          closeOnClick: false,
          onClick: async () => {
            try {
              const linkedItems = enrichItemsWithEquipment(unlinkedItems, equipments)
                .filter((item) => item.equipmentId);
              await Promise.all(linkedItems.map((item) => updateMtoItem(item.id, { equipmentId: item.equipmentId })));
              const itemsByEquipment = linkedItems.reduce((groups, item) => {
                if (!groups.has(item.equipmentId)) groups.set(item.equipmentId, []);
                groups.get(item.equipmentId).push(item);
                return groups;
              }, new Map());
              await Promise.all([...itemsByEquipment.entries()].map(([equipmentId, items]) => (
                linkDrawingsForMtoItemsToEquipment(items, equipmentId, { projectId: state.options.projectId })
              )));
              closeModal();
              showToast(`${linkedItems.length} de ${unlinkedItems.length} itens vinculados automaticamente.`, 'success');
              await rerender(true);
            } catch (error) {
              console.error(error);
              showToast('Falha ao vincular equipamentos automaticamente.', 'error');
            }
          },
        },
        {
          label: 'Vincular Selecionados',
          variant: 'btn-primary',
          closeOnClick: false,
          onClick: async () => {
            const equipmentId = equipmentSelect.value;
            if (!equipmentId) {
              showToast('Selecione um equipamento destino', 'error');
              return;
            }

            const selectedIds = [...body.querySelectorAll('.mto-bulk-link-item input:checked')]
              .map((checkbox) => checkbox.value)
              .filter(Boolean);
            if (!selectedIds.length) {
              showToast('Selecione ao menos um item da MTO', 'error');
              return;
            }

            try {
              await Promise.all(selectedIds.map((id) => updateMtoItem(id, { equipmentId })));
              const selectedIdSet = new Set(selectedIds);
              const selectedItems = unlinkedItems.filter((item) => selectedIdSet.has(item.id));
              await linkDrawingsForMtoItemsToEquipment(selectedItems, equipmentId, {
                projectId: state.options.projectId,
              });
              closeModal();
              showToast(`${selectedIds.length} itens vinculados com sucesso`, 'success');
              await rerender(true);
            } catch (error) {
              console.error(error);
              showToast('Falha ao vincular equipamentos da MTO.', 'error');
            }
          },
        },
      ],
    });
  } catch (error) {
    console.error(error);
    showToast('Falha ao carregar itens sem equipamento.', 'error');
  }
}

function openDeleteSelectedDialog(items, state, rerender) {
  const body = createEl('div', 'mto-delete-confirm');
  const count = items.length;
  body.append(createEl(
    'p',
    null,
    count === 1 ? 'Deseja excluir 1 linha da MTO?' : `Deseja excluir ${count} linhas da MTO?`,
  ));

  openModal({
    title: 'Excluir linhas da MTO',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Excluir',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          try {
            await deleteMtoItems(items.map((item) => item.id));
            items.forEach((item) => state.selectedIds.delete(item.id));
            state.editingId = '';
            closeModal();
            showToast(`${count} linha(s) excluida(s).`, 'success');
            await rerender(true);
          } catch (error) {
            console.error(error);
            showToast('Falha ao excluir linhas MTO.', 'error');
          }
        },
      },
    ],
  });
}

const EDITABLE_FIELD_LABELS = Object.freeze({
  drawing: 'Desenho',
  revision: 'Revisão',
  mark: 'Marca',
  pos: 'POS',
  qty: 'Qtd',
  description: 'Descrição',
  cutLength: 'Length / mm',
  identCode: 'IDENT CODE',
  material: 'Material',
  type: 'Tipo',
  discipline: 'Disciplina',
});

function renderEditorRow(item, state, rerender, { isNew = false } = {}) {
  const row = createEl('tr', 'mto-table-row-editing');
  const cell = createEl('td');
  cell.colSpan = 6;
  const editor = createEl('section', 'mto-row-editor');
  editor.append(createEl('h3', null, isNew ? 'Adicionar linha MTO' : 'Editar linha MTO'));
  const fields = createEl('div', 'mto-row-editor-fields');
  EDITABLE_FIELDS.forEach((field) => {
    const label = createEl('label', 'field');
    label.append(createEl('span', null, EDITABLE_FIELD_LABELS[field] || field), renderEditInput(item, field));
    fields.append(label);
  });
  editor.append(fields);

  const actions = createEl('div', 'mto-row-editor-actions');
  const save = createEl('button', 'btn btn-primary btn-sm', 'Salvar');
  save.type = 'button';
  save.addEventListener('click', async () => {
    try {
      const patch = readEditPatch(row, item);
      if (isNew) {
        const saved = await createMtoItem({
          ...patch,
          batchId: state.options.batchId || '',
          projectId: state.options.projectId || '',
          sourceRowNumber: 0,
        });
        state.isAdding = false;
        state.selectedIds.clear();
        state.selectedIds.add(saved.id);
        state.expandedId = saved.id;
        showToast('Linha MTO criada.', 'success');
      } else {
        const updated = await updateMtoItem(item.id, patch);
        await state.options.onMtoItemsUpdated?.([updated].filter(Boolean));
        state.editingId = '';
        state.expandedId = item.id;
        showToast('Linha MTO atualizada.', 'success');
      }
      await rerender(true);
    } catch (error) {
      console.error(error);
      showToast(isNew ? 'Falha ao criar linha MTO.' : 'Falha ao salvar a linha MTO.', 'error');
    }
  });

  const cancel = createEl('button', 'btn btn-ghost btn-sm', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    state.isAdding = false;
    state.editingId = '';
    rerender();
  });
  actions.append(save, cancel);
  editor.append(actions);
  cell.append(editor);
  row.append(cell);
  return row;
}

function renderAddRow(state, rerender) {
  return renderEditorRow({}, state, rerender, { isNew: true });
}

function procurementSummary(item, coverageByMto = new Map()) {
  const coverage = coverageByMto.get(item.id);
  if (!coverage || coverage.status === 'UNALLOCATED') return 'Não alocado';
  return `${formatNumber(coverage.allocatedQuantity, 2)} / ${formatNumber(coverage.demandQuantity, 2)} ${coverage.unitOfMeasure} · Recebido ${formatNumber(coverage.receivedQuantity, 2)} · ${coverage.status.replaceAll('_', ' ')}`;
}

export function mtoHasPoAllocation(item, coverageByMto = new Map()) {
  const coverage = coverageByMto.get(item?.id);
  return Boolean(coverage
    && coverage.status !== 'UNALLOCATED'
    && (numericValue(coverage.allocatedQuantity) > 0 || coverage.allocations?.length));
}

function equipmentSummary(item, equipmentById = new Map()) {
  if (item.equipmentId) {
    return equipmentLabel(equipmentById.get(item.equipmentId)) || item.equipmentName || item.equipmentId;
  }
  return item.constructionActivity || item.equipmentName || 'Sem equipamento vinculado';
}

function renderIdentificationCell(item) {
  const cell = createEl('td', 'mto-table-identification');
  const drawing = item.drawing || 'Sem desenho';
  const revision = item.revision ? ` · Rev ${item.revision}` : '';
  const mark = item.mark || 'Sem marca';
  const pos = item.pos ? ` · POS ${item.pos}` : '';
  cell.append(
    createEl('strong', null, `${drawing}${revision}`),
    createEl('small', 'text-muted', `${mark}${pos}`),
  );
  return cell;
}

function statusPresentation(item, coverageByMto = new Map()) {
  const errors = item.validationErrors || [];
  if (errors.length || itemIsInvalid(item)) {
    return { icon: 'error', tone: 'critical', label: `${errors.length || 1} pendência(s) crítica(s)` };
  }
  if (procurementSummary(item, coverageByMto) === 'Não alocado') {
    return { icon: 'warning', tone: 'warning', label: 'Material ainda não alocado' };
  }
  return { icon: 'check_circle', tone: 'ok', label: `Status ${item.status || 'open'}` };
}

function renderStatusCell(item, state, rerender, coverageByMto = new Map()) {
  const cell = createEl('td', 'mto-table-status');
  const presentation = statusPresentation(item, coverageByMto);
  const trigger = createEl('button', `mto-status-indicator mto-status-indicator--${presentation.tone}`);
  trigger.type = 'button';
  trigger.title = `${presentation.label}. Abrir detalhes e ações.`;
  trigger.setAttribute('aria-label', trigger.title);
  trigger.append(createEl('span', 'material-symbols-outlined', presentation.icon));

  const panel = createEl('div', 'mto-status-popover');
  const popoverId = `mto-status-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  panel.id = popoverId;
  panel.setAttribute('popover', 'auto');
  trigger.setAttribute('popovertarget', popoverId);
  trigger.addEventListener('click', () => {
    requestAnimationFrame(() => {
      if (!panel.matches(':popover-open')) return;
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const gap = 4;
      const top = Math.min(triggerRect.bottom + gap, window.innerHeight - panelRect.height - 8);
      const left = Math.max(8, triggerRect.right - panelRect.width);
      panel.style.top = `${Math.max(8, top)}px`;
      panel.style.left = `${left}px`;
    });
  });
  panel.append(
    createEl('strong', null, item.status || 'open'),
    createEl('span', 'text-muted', procurementSummary(item, coverageByMto)),
  );
  const errors = item.validationErrors || [];
  panel.append(createEl('span', errors.length ? 'mto-status-errors' : 'text-muted', errors.length ? errors.join(', ') : 'Sem erros de validação'));

  const actions = createEl('div', 'mto-status-actions');
  const edit = createEl('button', 'btn btn-ghost btn-sm', 'Editar linha');
  edit.type = 'button';
  edit.addEventListener('click', () => {
    state.isAdding = false;
    state.editingId = item.id;
    state.expandedId = item.id;
    rerender();
  });
  const linkPurchase = createEl(
    'button',
    'btn btn-secondary btn-sm',
    mtoHasPoAllocation(item, coverageByMto) ? 'Editar vínculo PO' : 'Vincular PO Item',
  );
  linkPurchase.type = 'button';
  linkPurchase.addEventListener('click', () => openMtoPoAllocationModal([item], state, rerender));
  actions.append(edit, linkPurchase);
  panel.append(actions);
  cell.append(trigger, panel);
  return cell;
}

function renderDetailField(label, value) {
  const field = createEl('div', 'mto-row-detail-field');
  field.append(createEl('dt', null, label), createEl('dd', null, value == null || value === '' ? '—' : String(value)));
  return field;
}

function renderDetailRow(item, equipmentById = new Map(), coverageByMto = new Map()) {
  const row = createEl('tr', 'mto-table-detail-row');
  const cell = createEl('td');
  cell.colSpan = 6;
  const details = createEl('dl', 'mto-row-details');
  details.append(
    renderDetailField('Length / mm', formatNumber(item.cutLength, 2)),
    renderDetailField('IDENT CODE', item.identCode),
    renderDetailField('Tipo', item.type),
    renderDetailField('Disciplina', item.discipline),
    renderDetailField('Equipamento', equipmentSummary(item, equipmentById)),
    renderDetailField('Status', item.status || 'open'),
    renderDetailField('Suprimentos', procurementSummary(item, coverageByMto)),
    renderDetailField('Erros', (item.validationErrors || []).join(', ')),
    renderDetailField('Peso', item.weightKg == null ? '' : `${formatNumber(item.weightKg, 2)} kg`),
    renderDetailField('Atividade de construção', item.constructionActivity),
  );
  cell.append(details);
  row.append(cell);
  return row;
}

function renderTable(items, state, rerender, equipmentById = new Map(), coverageByMto = new Map()) {
  const wrap = createEl('div', 'mto-page-table-wrap');
  const table = createEl('table', 'mto-table');
  const thead = createEl('thead');
  const headRow = createEl('tr');

  const selectHead = createEl('th', 'mto-table-select');
  const selectAll = createEl('input');
  selectAll.type = 'checkbox';
  selectAll.setAttribute('aria-label', 'Selecionar linhas visiveis');
  const visibleIds = items.map((item) => item.id).filter(Boolean);
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
  headRow.append(selectHead);

  ['Identificação', 'Descrição', 'Qtd', 'Material', 'Status']
    .forEach((heading) => headRow.append(createEl('th', null, heading)));
  thead.append(headRow);

  const tbody = createEl('tbody');
  if (state.isAdding) tbody.append(renderAddRow(state, rerender));

  if (!items.length && !state.isAdding) {
    const row = createEl('tr');
    const emptyMessage = state.options.projectId
      ? 'Nenhuma linha de MTO importada para o projeto ativo.'
      : 'Nenhuma linha MTO encontrada.';
    const cell = createEl('td', 'mto-table-empty', emptyMessage);
    cell.colSpan = 6;
    row.append(cell);
    tbody.append(row);
  }

  items.forEach((item) => {
    const row = createEl('tr', `mto-table-row ${itemIsInvalid(item) ? 'mto-table-row-invalid ' : ''}${state.selectedIds.has(item.id) ? 'mto-table-row-selected ' : ''}${state.expandedId === item.id ? 'mto-table-row-expanded' : ''}`.trim());
    const editing = state.editingId === item.id;
    row.tabIndex = 0;
    row.setAttribute('aria-expanded', String(state.expandedId === item.id || editing));

    const selectCell = createEl('td', 'mto-table-select');
    selectCell.append(renderSelectionCheckbox(item, state, rerender));
    row.append(selectCell);
    row.addEventListener('click', (event) => {
      if (event.target.closest('input, button, a, label, select, textarea, details, summary')) return;
      state.expandedId = state.expandedId === item.id ? '' : item.id;
      rerender();
    });
    row.addEventListener('keydown', (event) => {
      if (event.target !== row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      state.expandedId = state.expandedId === item.id ? '' : item.id;
      rerender();
    });

    row.append(renderIdentificationCell(item));
    const description = createEl('td', 'mto-table-description', item.description || '—');
    description.title = item.description || '';
    row.append(description);
    row.append(createEl('td', 'mto-table-quantity', formatNumber(item.qty)));
    row.append(createEl('td', 'mto-table-material', item.material || '—'));
    row.append(renderStatusCell(item, state, rerender, coverageByMto));
    tbody.append(row);
    if (editing) tbody.append(renderEditorRow(item, state, rerender));
    else if (state.expandedId === item.id) tbody.append(renderDetailRow(item, equipmentById, coverageByMto));
  });

  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

async function handleImport(selection, importButton, state, rerender) {
  if (!selection) return;
  const { file, parsed, effectivePlan, reviewAction } = selection;
  if (!file || !parsed || !effectivePlan) return;
  const projectId = state.options.projectId || '';
  if (!projectId) {
    showToast('Selecione um projeto ativo antes de importar a MTO.', 'error');
    return;
  }

  const idleLabel = importButton.textContent;
  importButton.disabled = true;
  importButton.textContent = 'Importando...';
  importButton.setAttribute('aria-busy', 'true');

  try {
    if (!effectivePlan.canCommit) {
      const zeroOutcome = getZeroMtoImportOutcome(reviewAction, effectivePlan);
      showToast(zeroOutcome.message, zeroOutcome.successful ? 'success' : 'error');
      await rerender(true);
      return;
    }
    const itemsToImport = effectivePlan.itemsToImport;
    const pendingDrawingNos = [...new Set(itemsToImport
      .map((item) => String(item.drawing || '').trim())
      .filter(Boolean))];
    const importPayload = {
      batch: {
        ...parsed.batch,
        projectId,
        fileName: file.name,
        importedBy: state.options.importedBy || '',
        acceptedCount: itemsToImport.filter((item) => !(item.validationErrors || []).length).length,
        rejectedCount: itemsToImport.filter((item) => (item.validationErrors || []).length > 0).length,
        metadata: {
          ...(parsed.batch.metadata || {}),
          importDecisions: effectivePlan.auditSummary,
          drawingSync: {
            status: 'pending',
            pendingDrawingNos,
            updatedAt: new Date().toISOString(),
          },
        },
      },
      items: itemsToImport,
      itemsToSupersede: effectivePlan.itemsToSupersede,
    };
    const { importResult, createdDrawings, drawingError } = await commitMtoThenCreateDrawings({
      importPayload,
      items: itemsToImport,
      projectId,
      saveImport: saveMtoImport,
      createDrawings: ensureDrawingsForMtoItems,
    });
    if (!drawingError) {
      await updateMtoBatch(importResult.batch.id, {
        metadata: {
          ...importResult.batch.metadata,
          drawingSync: {
            status: 'complete',
            pendingDrawingNos: [],
            createdDrawingIds: createdDrawings.map((drawing) => drawing.id),
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } else {
      console.error('Falha ao criar drawings apos importar a MTO.', drawingError);
      try {
        await updateMtoBatch(importResult.batch.id, {
          metadata: {
            ...importResult.batch.metadata,
            drawingSync: {
              status: 'pending',
              pendingDrawingNos,
              error: drawingError?.message || String(drawingError),
              updatedAt: new Date().toISOString(),
            },
          },
        });
      } catch (pendingStatusError) {
        console.error('Falha ao atualizar a pendencia de drawings da MTO.', pendingStatusError);
      }
      showToast('MTO importada, mas a criacao de drawings ficou pendente para reprocessamento.', 'error');
      await rerender(true);
      return;
    }
    const pendingMessage = effectivePlan.unresolvedDecisions.length
      ? ` ${effectivePlan.unresolvedDecisions.length} linha(s) permanecem aguardando decisao.`
      : '';
    showToast(
      `Importacao concluida: ${itemsToImport.length} item(ns) e ${createdDrawings.length} drawing(s) criado(s).${pendingMessage}`,
      'success',
    );
    await rerender(true);
  } catch (error) {
    console.error(error);
    if (error?.code === 'MTO_IMPORT_VALIDATION_FAILED') {
      showMtoValidationErrors(error.validationErrors);
    }
    showToast(mtoImportErrorMessage(error), 'error');
  } finally {
    importButton.disabled = false;
    importButton.textContent = idleLabel;
    importButton.removeAttribute('aria-busy');
  }
}

async function render(container, state) {
  const projectId = state.filters.projectId || state.options.projectId || '';
  const activeProjectId = state.options.projectId || '';
  const itemFilters = {
    ...(projectId ? { projectId } : {}),
    includeSuperseded: true,
  };
  const [items, equipments, procurementCoverage, allBatches] = await Promise.all([
    getMtoItems(itemFilters),
    listEquipments({}),
    state.options.listMtoProcurementCoverage?.(projectId ? { projectId } : {}) || [],
    activeProjectId ? getAllMtoBatches() : [],
  ]);
  const pendingDrawingBatches = allBatches
    .filter((batch) => batch.projectId === activeProjectId)
    .filter((batch) => ['pending', 'failed', 'processing'].includes(batch.metadata?.drawingSync?.status))
    .sort(pendingDrawingSyncSort);
  const equipmentById = new Map(equipments.map((equipment) => [equipment.id, equipment]));
  const coverageByMto = new Map(procurementCoverage.map((coverage) => [coverage.mtoItem.id, coverage]));
  const operationalItems = items.filter((item) => item.status !== MTO_ITEM_STATUS.SUPERSEDED);
  const filterOptionItems = state.filters.includeSuperseded ? items : operationalItems;
  const unlinkedItems = state.options.projectId
    ? (await getMtoItems({})).filter((item) => !item.projectId)
    : operationalItems.filter((item) => !item.projectId);
  const unlinkedEquipmentItems = operationalItems.filter((item) => !item.equipmentId);
  const existingIds = new Set(items.map((item) => item.id));
  state.selectedIds.forEach((id) => {
    if (!existingIds.has(id)) state.selectedIds.delete(id);
  });
  state.options.onSelectionChange?.(selectedItems(items, state));
  const rerender = (reload = false) => (reload ? refreshMtoPage(container, state.options) : render(container, state));
  const visibleItems = getVisibleMtoItems(items, state, coverageByMto);

  const page = createEl('section', 'mto-page');
  const header = createEl('div', 'page-header');
  const titleBlock = createEl('div');
  titleBlock.append(
    createEl('p', 'eyebrow', 'Engineering MTO'),
    createEl('h1', null, 'MTO Management'),
    createEl('p', 'text-muted', 'Import, review and prepare engineering MTO lines before material matching.'),
  );

  const actions = createEl('div', 'page-actions');
  const importButton = createEl('button', 'mto-more-action', 'Importar MTO');
  importButton.id = 'mto-import-file-btn';
  importButton.type = 'button';
  importButton.setAttribute('role', 'menuitem');
  const exportButton = createEl('button', 'mto-more-action', 'Exportar MTO');
  exportButton.id = 'mto-export-file-btn';
  exportButton.type = 'button';
  exportButton.setAttribute('role', 'menuitem');
  const generateIdentCodesButton = createEl('button', 'mto-more-action', 'Gerar IDENT CODEs');
  generateIdentCodesButton.type = 'button';
  generateIdentCodesButton.setAttribute('role', 'menuitem');
  const autoLinkButton = createEl('button', 'mto-more-action');
  autoLinkButton.type = 'button';
  autoLinkButton.setAttribute('role', 'menuitem');
  autoLinkButton.append(
    createEl('span', 'material-symbols-outlined ti-wand', 'auto_fix_high'),
    createEl('span', null, 'Vincular automático por Ident Code'),
  );
  autoLinkButton.disabled = !operationalItems.some((item) => item.status === 'open'
    && itemIsValid(item) && !hasProcurementLink(item, coverageByMto));
  const moreActions = createEl('details', 'mto-more-actions');
  const moreActionsTrigger = createEl('summary', 'btn btn-secondary mto-more-actions-trigger');
  moreActionsTrigger.title = 'Mais ações da MTO';
  moreActionsTrigger.setAttribute('aria-label', 'Mais ações da MTO');
  moreActionsTrigger.append(createEl('span', 'material-symbols-outlined', 'more_vert'));
  const moreActionsMenu = createEl('div', 'mto-more-actions-menu');
  moreActionsMenu.setAttribute('role', 'menu');
  moreActionsMenu.append(importButton, exportButton, generateIdentCodesButton, autoLinkButton);
  moreActions.append(moreActionsTrigger, moreActionsMenu);
  importButton.addEventListener('click', async () => {
    moreActions.open = false;
    const selection = await selectMtoImportFile({
      projectId: state.options.projectId || '',
      projectName: state.options.projectName || '',
      prepareItems: async (items) => enrichItemsWithEquipment(
        items,
        await getEquipmentCandidates(state.options.projectId || ''),
      ),
      onValidationErrors: (validationErrors) => {
        showMtoValidationErrors(validationErrors);
        showToast('Corrija todas as linhas rejeitadas antes de tentar novamente.', 'error');
      },
    });
    if (!selection) return;
    await handleImport(selection, importButton, state, () => render(container, state));
  });
  exportButton.addEventListener('click', async () => {
    moreActions.open = false;
    if (!visibleItems.length) {
      showToast('Nenhuma linha visível para exportar.', 'warning');
      return;
    }
    try { await state.options.onExportMto?.(visibleItems, { projectId: state.options.projectId || '' }); }
    catch (error) { console.error(error); showToast(error?.message || 'Não foi possível exportar a MTO.', 'error'); }
  });
  generateIdentCodesButton.addEventListener('click', () => {
    moreActions.open = false;
    openMtoIdentCodeReview(items, rerender);
  });
  autoLinkButton.addEventListener('click', () => {
    moreActions.open = false;
    openMtoPoAutoAllocationModal({ allItems: operationalItems, filteredItems: visibleItems, state, rerender });
  });
  actions.append(
    renderViewAllBulkLinkButton(unlinkedItems.length, state, rerender),
    renderViewAllEquipmentBulkLinkButton(unlinkedEquipmentItems.length, state, rerender),
    moreActions,
  );
  header.append(titleBlock, actions);

  const workspace = createEl('section', 'mto-page-workspace');
  workspace.append(
    renderTabs(items, state, rerender, coverageByMto),
    renderEquipmentGroups(filterOptionItems, state, rerender),
    renderFilters(filterOptionItems, state, rerender, equipmentById),
    renderSelectionToolbar(items, state, rerender),
    renderHiddenItemsWarning(unlinkedItems.length, state, rerender),
    renderUnlinkedEquipmentWarning(unlinkedEquipmentItems.length, state, rerender),
    renderTable(visibleItems, state, rerender, equipmentById, coverageByMto),
  );

  page.append(header, renderDashboard(operationalItems, coverageByMto), renderPendingDrawingSyncBatches(pendingDrawingBatches, rerender), workspace);
  const focusSnapshot = captureFocus(container);
  container.replaceChildren(page);
  restoreFocus(container, focusSnapshot);
}

export async function renderMtoPage(container, options = {}) {
  if (!container) return;
  const state = getInitialState(options);
  stateByContainer.set(container, state);
  await render(container, state);
}

export async function refreshMtoPage(container, options = {}) {
  if (!container) return;
  const state = getState(container, options);
  await render(container, state);
}
