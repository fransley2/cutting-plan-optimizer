import { calculateInventoryReceivedQuantity, calculatePoItemMetrics, derivePurchaseOrderStatus, inventoryMatchesPoItem, summarizeProcurement } from '../core/procurementMetrics.js';
import { generatePurchaseOrderIdentCode, inferPurchaseOrderMaterialFields, PURCHASE_ORDER_IMPORT_COLUMNS, validatePurchaseOrderImportRows } from '../core/purchaseOrderImport.js';
import { derivePoItemBaseTraceability, generateSequentialTraceabilities } from '../core/materialTraceability.js';
import { purchaseOrderDeletionBlockers, purchaseOrderItemDeletionBlockers } from '../core/purchaseOrderLifecycle.js';
import { summarizePoItemDeliveryForecasts } from '../core/poDeliveryForecast.js';
import { poItemTechnicalPresentation } from '../core/poItemPresentation.js';
import { vendorProfileCompleteness, vendorQualificationSummary } from '../core/vendorProfile.js';
import { closeModal, openModal } from './modal.js';
import { openPoDeliveryForecastModal } from './poDeliveryForecastModal.js';

const TABS = Object.freeze([
  ['dashboard', 'Visão geral'], ['purchase-orders', 'Purchase Orders'], ['receipts', 'Recebimento'], ['suppliers', 'Vendors'],
]);

const state = {
  container: null, dependencies: {}, projects: [], organizations: [], purchaseOrders: [], revisions: [], items: [], receipts: [],
  receiptLines: [], materialUnits: [], inventoryItems: [], reservations: [], stockMovements: [], allocations: [], deliveryForecasts: [], mtoItems: [], projectId: '', tab: 'dashboard', selectedPoId: '', selectedReceiptItemId: '', search: '',
  importRows: [], importFileName: '', importSourceType: 'MANUAL_GRID', importText: '', receivingSearch: '', receivingFilter: 'all', receivingSort: 'item-asc', poItemSearch: '', expandedPoItemId: '',
  vendorSearch: '', vendorStatus: 'ALL', vendorQualification: 'ALL', selectedOrganizationId: '', refreshToken: 0,
};

function node(tag, className = '', value = '') { const element = document.createElement(tag); if (className) element.className = className; if (value !== '') element.textContent = String(value); return element; }
function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatNumber(value) { return number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); }
function formatDate(value) {
  if (!value) return '—'; const raw = text(value); const serial = Number(raw);
  if (/^\d{5}$/.test(raw) && serial >= 20000 && serial <= 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const date = new Date(`${raw}T00:00:00`); return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('pt-BR');
}
function compareItemNumbers(left, right) { return text(left?.itemNumber).localeCompare(text(right?.itemNumber), undefined, { numeric: true, sensitivity: 'base' }); }
function projectName(id) { const project = state.projects.find((item) => item.id === id); return project?.name || project?.shortCode || id || '—'; }
function projectById(id) { return state.projects.find((item) => item.id === id); }
function supplierName(id) { const supplier = state.organizations.find((item) => item.id === id); return supplier?.tradeName || supplier?.legalName || id || '—'; }
function poById(id) { return state.purchaseOrders.find((item) => item.id === id); }
function itemById(id) { return state.items.find((item) => item.id === id); }
function scoped(records) { return state.projectId ? records.filter((item) => item.projectId === state.projectId) : []; }
function showToast(message, type = 'info') { state.dependencies.showToast?.(message, type); }

function button(label, className, onClick, icon = '') {
  const control = node('button', className); control.type = 'button';
  if (icon) control.append(node('span', 'material-symbols-outlined', icon));
  control.append(document.createTextNode(label)); control.addEventListener('click', onClick); return control;
}

function iconActionButton(label, className, onClick, icon, tablerClass) {
  const control = button('', `${className} btn-icon procurement-item-icon-action`, onClick, icon);
  control.title = label;
  control.setAttribute('aria-label', label);
  control.querySelector('.material-symbols-outlined')?.classList.add(tablerClass);
  return control;
}

function actionGroup(...controls) {
  const group = node('div', 'procurement-action-group'); group.append(...controls); return group;
}

function field(label, name, value = '', type = 'text', options = {}) {
  const wrapper = node('label', 'field'); wrapper.append(node('span', '', label));
  const input = type === 'textarea' ? node('textarea', 'input') : node('input', 'input'); input.name = name; input.value = text(value);
  if (type !== 'textarea') input.type = type; if (options.required) input.required = true; if (options.min != null) input.min = String(options.min); if (options.step != null) input.step = String(options.step);
  wrapper.append(input); return wrapper;
}

function selectField(label, name, value, options, required = false) {
  const wrapper = node('label', 'field'); wrapper.append(node('span', '', label)); const select = node('select', 'input'); select.name = name; select.required = required;
  options.forEach(({ value: optionValue, label: optionLabel }) => { const option = node('option', '', optionLabel); option.value = optionValue; select.append(option); }); select.value = text(value); wrapper.append(select); return wrapper;
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

function formGrid(...children) { const form = node('form', 'procurement-form-grid'); form.append(...children); return form; }

function formSection(title, description = '') {
  const section = node('div', 'procurement-form-section');
  section.append(node('strong', '', title));
  if (description) section.append(node('small', 'text-muted', description));
  return section;
}

function receiptSection(title, description, ...children) {
  const section = node('section', 'procurement-receipt-section'); const heading = node('div', 'procurement-section-heading');
  heading.append(node('h4', '', title));
  if (description) heading.append(node('p', 'text-muted', description));
  section.append(heading, ...children); return section;
}

function kpi(label, value, caption) { const card = node('article', 'kpi-card'); card.append(node('div', 'kpi-label', label), node('div', 'kpi-value', value), node('div', 'text-muted', caption)); return card; }

function metricsByItem() {
  const receipts = scoped(state.receipts); const receiptIds = new Set(receipts.map((item) => item.id));
  const receiptLines = state.receiptLines.filter((item) => receiptIds.has(item.receiptId));
  const materialUnits = scoped(state.materialUnits);
  return new Map(scoped(state.items).map((item) => [item.id, calculatePoItemMetrics({
    item, purchaseOrder: poById(item.purchaseOrderId), receipts, receiptLines, materialUnits, inventoryItems: state.inventoryItems, reservations: state.reservations, stockMovements: state.stockMovements,
  })]));
}

function activeItemForecasts(itemId) {
  return state.deliveryForecasts.filter((record) => record.poItemId === itemId && record.status !== 'CANCELLED');
}

export function poItemPendingPresentation(metrics = {}, forecast = {}) {
  const pending = Math.max(0, number(metrics.pending));
  if (pending <= 0) return { status: 'received', pending: 0, etaDate: '', label: 'Recebido' };
  if (forecast.nextCtcoDate) return { status: 'eta', pending, etaDate: forecast.nextCtcoDate, label: 'ETA' };
  return { status: 'no-eta', pending, etaDate: '', label: 'Sem ETA' };
}

function openItemLogistics(po, item) {
  const open = () => openPoDeliveryForecastModal({
    po, item, metrics: metricsByItem().get(item.id) || {}, forecasts: state.deliveryForecasts, allocations: state.allocations,
    mtoItems: state.mtoItems, allMtoItems: scoped(state.mtoItems), dependencies: { ...state.dependencies, showToast },
    onChanged: async ({ reopen } = {}) => { await refreshProcurementPage(); if (reopen) { const refreshedPo = poById(po.id); const refreshedItem = itemById(item.id); if (refreshedPo && refreshedItem) openItemLogistics(refreshedPo, refreshedItem); } },
  });
  open();
}

function procurementExportData() {
  return {
    projects: state.projects, organizations: state.organizations, purchaseOrders: state.purchaseOrders, revisions: state.revisions,
    items: state.items, receipts: state.receipts, receiptLines: state.receiptLines, materialUnits: state.materialUnits, inventoryItems: state.inventoryItems,
    reservations: state.reservations, stockMovements: state.stockMovements,
  };
}

async function exportPurchaseOrderDatabase(po = null) {
  if (!state.projectId) { showToast('Selecione um projeto antes de exportar.', 'warning'); return; }
  try {
    await state.dependencies.exportPurchaseOrderDatabase?.(procurementExportData(), {
      projectId: state.projectId, purchaseOrderId: po?.id || '', purchaseOrderNumber: po?.poNumber || '',
    });
  } catch (error) { console.error(error); showToast(error?.message || 'Não foi possível exportar a base de Procurement.', 'error'); }
}

async function exportPurchaseOrderProgress(po = null) {
  if (!state.projectId) { showToast('Selecione um projeto antes de exportar.', 'warning'); return; }
  try {
    await state.dependencies.exportPurchaseOrderProgress?.(procurementExportData(), {
      projectId: state.projectId, purchaseOrderId: po?.id || '', purchaseOrderNumber: po?.poNumber || '',
    });
  } catch (error) { console.error(error); showToast(error?.message || 'Não foi possível exportar o progresso de Procurement.', 'error'); }
}

function renderScopeHeader() {
  const card = node('section', 'card procurement-scope-card');
  const copy = node('div'); copy.append(node('span', 'eyebrow', 'Material Management'), node('h2', '', 'Procurement & Receiving'), node('p', 'text-muted', 'Purchase Orders, recebimentos, Inventory e Vendors em um único fluxo operacional.'));
  const controls = node('div', 'procurement-scope-controls'); const label = node('label', 'field'); label.append(node('span', '', 'Projeto'));
  const select = node('select', 'input'); select.append(new Option('Selecione um projeto', ''));
  state.projects.forEach((project) => select.append(new Option(project.name || project.shortCode || project.id, project.id))); select.value = state.projectId;
  select.addEventListener('change', () => { state.projectId = select.value; state.selectedPoId = ''; state.selectedReceiptItemId = ''; render(); }); label.append(select);
  controls.append(label);
  card.append(copy, controls); return card;
}

function renderTabs() {
  const tabs = node('div', 'procurement-tabs');
  TABS.forEach(([id, label]) => { const control = button(label, `procurement-tab${state.tab === id ? ' active' : ''}`, () => { state.tab = id; state.selectedPoId = ''; state.selectedReceiptItemId = ''; render(); }); control.setAttribute('aria-pressed', String(state.tab === id)); tabs.append(control); });
  return tabs;
}

function renderDashboard() {
  const poList = scoped(state.purchaseOrders); const items = scoped(state.items); const receipts = scoped(state.receipts); const units = scoped(state.materialUnits); const metrics = metricsByItem();
  const summary = summarizeProcurement({ purchaseOrders: poList, items, metricsByItem: metrics, receipts, materialUnits: units });
  const content = node('div', 'procurement-dashboard'); const completion = summary.ordered > 0 ? Math.min(100, Math.round((summary.received / summary.ordered) * 100)) : 0;
  const overviewHeader = node('section', 'card procurement-overview-header'); const overviewCopy = node('div'); overviewCopy.append(node('span', 'eyebrow', projectName(state.projectId)), node('h2', '', 'Visão geral do Procurement'), node('p', 'text-muted', 'Posição consolidada das Purchase Orders, recebimentos e Inventory.'));
  const completionCard = node('div', 'procurement-overview-completion'); completionCard.append(node('span', '', 'Recebimento geral'), node('strong', '', `${completion}%`)); const completionTrack = node('div', 'procurement-receiving-progress'); const completionBar = node('span'); completionBar.style.width = `${completion}%`; completionTrack.append(completionBar); completionCard.append(completionTrack); overviewHeader.append(overviewCopy, completionCard); content.append(overviewHeader);
  const kpis = node('div', 'kpi-grid procurement-kpis procurement-overview-kpis');
  const orderedKpi = kpi('Pedido', formatNumber(summary.ordered), 'Quantidade contratada'); const receivedKpi = kpi('Recebido', formatNumber(summary.received), 'Receipt + Inventory'); const pendingKpi = kpi('Falta chegar', formatNumber(summary.pending), 'Saldo aberto');
  orderedKpi.classList.add('primary'); receivedKpi.classList.add('positive'); pendingKpi.classList.add('attention');
  kpis.append(orderedKpi, receivedKpi, pendingKpi, kpi('Em estoque', formatNumber(summary.stockOnHand), 'Livre + reservado'), kpi('Usado', formatNumber(summary.used), 'Saída registrada'), kpi('Purchase Orders', summary.purchaseOrders, 'POs do projeto'));
  const overviewGrid = node('div', 'procurement-overview-grid'); overviewGrid.append(renderInventoryFlowChart(items, metrics), renderDeliveryPriorities(items, metrics)); content.append(kpis, overviewGrid); return content;
}

function renderDeliveryPriorities(items, metrics) {
  const pendingItems = items.filter((item) => number(metrics.get(item.id)?.pending) > 0).sort((left, right) => {
    const poComparison = text(poById(left.purchaseOrderId)?.poNumber).localeCompare(text(poById(right.purchaseOrderId)?.poNumber), undefined, { numeric: true });
    return poComparison || compareItemNumbers(left, right);
  }).slice(0, 12);
  const card = node('section', 'card procurement-delivery-priorities'); const header = node('div', 'card-header'); const title = node('div'); title.append(node('h2', '', 'Entregas pendentes'), node('p', 'text-muted', 'Itens que ainda exigem recebimento.'));
  header.append(title, button('Abrir Recebimento', 'btn btn-ghost btn-sm', () => { state.tab = 'receipts'; state.selectedPoId = ''; render(); }, 'arrow_forward')); card.append(header);
  const list = node('div', 'procurement-delivery-priority-list');
  pendingItems.forEach((item) => {
    const values = metrics.get(item.id) || {}; const po = poById(item.purchaseOrderId); const inferred = inferPurchaseOrderMaterialFields(item.description); const type = item.itemType || item.materialCategory || inferred.itemType || inferred.itemClassification || 'Material';
    const row = node('article', 'procurement-delivery-priority'); const context = node('div', 'procurement-delivery-priority-context'); context.append(node('strong', '', `PO ${po?.poNumber || '—'} · Item ${item.itemNumber}`), node('span', '', item.identCode || item.materialCode || type), node('small', 'text-muted', item.description || type));
    const figures = node('div', 'procurement-delivery-priority-figures'); [['Pedido', values.ordered], ['Recebido', values.received], ['Estoque', values.stockOnHand], ['Usado', values.used]].forEach(([label, value]) => { const figure = node('div'); figure.append(node('span', '', label), node('strong', '', formatNumber(value))); figures.append(figure); });
    const delivery = summarizePoItemDeliveryForecasts({ poItem: item, forecasts: activeItemForecasts(item.id), receivedQuantity: values.received });
    const balance = node('div', 'procurement-delivery-priority-balance'); balance.append(node('span', '', 'Falta'), node('strong', '', `${formatNumber(values.pending)} ${item.unitOfMeasure}`), node('small', delivery.nextCtcoDate ? '' : 'status-critical', delivery.nextCtcoDate ? `ETA CTCO ${formatDate(delivery.nextCtcoDate)}` : 'Sem ETA CTCO')); row.append(context, figures, balance); list.append(row);
  });
  if (!pendingItems.length) list.append(node('div', 'placeholder-panel procurement-delivery-complete', 'Todos os itens das POs estão recebidos.'));
  card.append(list); return card;
}

function renderInventoryFlowChart(items, metrics) {
  const card = node('section', 'card procurement-stock-chart'); const header = node('div', 'card-header'); const title = node('div');
  title.append(node('h2', '', 'Fluxo de materiais'), node('p', 'text-muted', 'Estoque e uso vêm do Inventory; falta chegar vem do saldo da PO.'));
  const legend = node('div', 'procurement-stock-legend'); [['stock', 'Em estoque'], ['used', 'Usado'], ['pending', 'Falta chegar']].forEach(([kind, label]) => { const item = node('span'); item.append(node('i', kind), document.createTextNode(label)); legend.append(item); });
  header.append(title, legend); card.append(header); const chart = node('div', 'procurement-stock-chart-rows');
  items.filter((item) => number(metrics.get(item.id)?.ordered) > 0).sort((left, right) => {
    const poComparison = text(poById(left.purchaseOrderId)?.poNumber).localeCompare(text(poById(right.purchaseOrderId)?.poNumber), undefined, { numeric: true });
    return poComparison || compareItemNumbers(left, right);
  }).slice(0, 12).forEach((item) => {
    const values = metrics.get(item.id) || {}; const total = Math.max(1, number(values.ordered)); const row = node('div', 'procurement-stock-chart-row');
    const label = node('div', 'procurement-stock-chart-label'); label.append(node('strong', '', `${poById(item.purchaseOrderId)?.poNumber || '—'} / ${item.itemNumber}`), node('small', 'text-muted', item.identCode || item.description || 'Material'));
    const track = node('div', 'procurement-stock-chart-track'); [['stock', values.stockOnHand], ['used', values.used], ['pending', values.pending]].forEach(([kind, value]) => { const segment = node('span', kind); segment.style.width = `${Math.min(100, (number(value) / total) * 100)}%`; segment.title = `${kind}: ${formatNumber(value)} ${item.unitOfMeasure}`; track.append(segment); });
    row.append(label, track, node('strong', 'procurement-stock-chart-value', `${formatNumber(values.stockOnHand)} / ${formatNumber(values.used)} / ${formatNumber(values.pending)} ${item.unitOfMeasure}`)); chart.append(row);
  });
  if (!chart.childElementCount) chart.append(node('p', 'text-muted', 'Nenhum item de PO disponível para o gráfico.'));
  card.append(chart); return card;
}

function buildItemMetricsTable(entries, includeActions = true) {
  const columnCount = includeActions ? 9 : 8;
  const wrap = node('div', 'table-wrap procurement-po-items-table-wrap');
  const table = node('table', 'data-table procurement-items-table');
  const head = node('tr');
  const headers = [
    ['Item', 'Número do item da Purchase Order'],
    ['Descrição', 'TAG, tipo, material e Ident Code'],
    ['OD / WT', 'Diâmetro externo e espessura de parede'],
    ['Ord', 'Quantidade pedida'],
    ['Rec', 'Quantidade recebida'],
    ['Estq', 'Quantidade em estoque'],
    ['Usado', 'Quantidade utilizada'],
    ['Pendência', 'Situação da quantidade ainda não recebida'],
    ...(includeActions ? [['Ações', 'Ações do PO Item']] : []),
  ];
  headers.forEach(([label, title]) => { const cell = node('th', '', label); cell.title = title; head.append(cell); });
  const thead = node('thead'); thead.append(head); const tbody = node('tbody');

  function syncExpandedRows() {
    tbody.querySelectorAll('[data-procurement-po-item-row]').forEach((row) => {
      const expanded = row.dataset.procurementPoItemRow === state.expandedPoItemId;
      row.classList.toggle('expanded', expanded);
      row.querySelector('.procurement-item-description-trigger')?.setAttribute('aria-expanded', String(expanded));
    });
    tbody.querySelectorAll('[data-procurement-po-item-detail]').forEach((row) => {
      row.hidden = row.dataset.procurementPoItemDetail !== state.expandedPoItemId;
    });
  }

  entries.forEach(({ item, po, metrics = {} }) => {
    const presentation = poItemTechnicalPresentation(item);
    const forecast = summarizePoItemDeliveryForecasts({ poItem: item, forecasts: activeItemForecasts(item.id), receivedQuantity: metrics.received });
    const pending = poItemPendingPresentation(metrics, forecast);
    const row = node('tr', 'procurement-po-item-row');
    row.dataset.procurementPoItemRow = item.id;
    row.dataset.procurementPoItemSearch = presentation.searchText;

    const itemCell = node('td', 'procurement-po-item-number');
    itemCell.append(node('strong', '', item.itemNumber || '—'));
    if (item.materialCode) itemCell.append(node('small', 'text-muted', item.materialCode));

    const descriptionCell = node('td', 'procurement-po-item-description');
    const descriptionTrigger = node('button', 'procurement-item-description-trigger');
    descriptionTrigger.type = 'button';
    descriptionTrigger.setAttribute('aria-expanded', String(state.expandedPoItemId === item.id));
    descriptionTrigger.setAttribute('aria-label', `Mostrar especificação técnica do item ${item.itemNumber || ''}`.trim());
    const descriptionPrimary = node('span', 'procurement-item-description-primary');
    if (presentation.tag) descriptionPrimary.append(node('code', '', presentation.tag));
    descriptionPrimary.append(node('strong', '', presentation.type || 'Material'));
    if (item.identCode || item.traceability) descriptionPrimary.append(node('span', 'procurement-item-ident-badge', item.identCode || item.traceability));
    descriptionTrigger.append(descriptionPrimary, node('span', 'procurement-item-description-secondary', presentation.material || 'Material não informado'));
    descriptionTrigger.addEventListener('click', () => {
      state.expandedPoItemId = state.expandedPoItemId === item.id ? '' : item.id;
      syncExpandedRows();
    });
    descriptionCell.append(descriptionTrigger);

    const pendingCell = node('td', 'procurement-po-item-pending');
    const pendingLabel = pending.status === 'received'
      ? 'Recebido'
      : pending.status === 'eta'
        ? `ETA ${formatDate(pending.etaDate)} · falta ${formatNumber(pending.pending)} ${item.unitOfMeasure || ''}`.trim()
        : `Sem ETA · falta ${formatNumber(pending.pending)} ${item.unitOfMeasure || ''}`.trim();
    pendingCell.append(node('span', `procurement-pending-badge ${pending.status}`, pendingLabel));
    row.append(
      itemCell,
      descriptionCell,
      node('td', 'procurement-po-item-dimensions', presentation.dimensions ? `${presentation.dimensions} mm` : '—'),
      node('td', 'mc-numeric-cell', formatNumber(metrics.ordered)),
      node('td', 'mc-numeric-cell', formatNumber(metrics.received)),
      node('td', 'mc-numeric-cell', formatNumber(metrics.stockOnHand)),
      node('td', 'mc-numeric-cell', formatNumber(metrics.used)),
      pendingCell,
    );
    if (includeActions) {
      const actions = node('td', 'row-actions procurement-item-actions');
      actions.append(actionGroup(
        iconActionButton('Editar item', 'btn btn-ghost btn-sm', () => openPoItemEditor(po, item), 'edit', 'ti-edit'),
        iconActionButton('Logística', 'btn btn-ghost btn-sm', () => openItemLogistics(po, item), 'local_shipping', 'ti-truck'),
        iconActionButton('Receber item', 'btn btn-ghost btn-sm', () => openReceiptEditor(item.id), 'move_to_inbox', 'ti-package-import'),
        iconActionButton('Excluir item', 'btn btn-ghost btn-sm text-danger', () => openPoItemDeleteDialog(po, item), 'delete', 'ti-trash'),
      ));
      row.append(actions);
    }
    tbody.append(row);

    const detailRow = node('tr', 'procurement-po-item-detail-row');
    detailRow.dataset.procurementPoItemDetail = item.id;
    detailRow.dataset.procurementPoItemSearch = presentation.searchText;
    const detailCell = node('td'); detailCell.colSpan = columnCount;
    const detailGrid = node('dl', 'procurement-po-item-technical-grid');
    const detailFields = [
      ...presentation.details,
      ...(item.identCode ? [{ label: 'Ident Code', value: item.identCode }] : []),
      ...(item.traceability ? [{ label: 'Traceability', value: item.traceability }] : []),
    ];
    detailFields.forEach(({ label, value }) => {
      const field = node('div', 'procurement-po-item-technical-field');
      field.append(node('dt', '', label), node('dd', '', value));
      detailGrid.append(field);
    });
    if (!detailFields.length) detailGrid.append(node('p', 'text-muted', 'Sem especificações técnicas adicionais.'));
    detailCell.append(detailGrid); detailRow.append(detailCell); tbody.append(detailRow);
  });
  const emptyRow = node('tr', 'procurement-po-items-empty');
  const empty = node('td', 'empty-row', entries.length ? 'Nenhum item corresponde à busca.' : 'Nenhum item encontrado.');
  empty.colSpan = columnCount; emptyRow.append(empty); tbody.append(emptyRow);
  table.append(thead, tbody); wrap.append(table); syncExpandedRows(); return wrap;
}

function applyPoItemSearch(card) {
  const query = text(state.poItemSearch).toLocaleLowerCase();
  const rows = [...card.querySelectorAll('[data-procurement-po-item-row]')];
  let visible = 0;
  rows.forEach((row) => {
    const matches = !query || row.dataset.procurementPoItemSearch.includes(query);
    row.hidden = !matches;
    const detail = [...card.querySelectorAll('[data-procurement-po-item-detail]')]
      .find((candidate) => candidate.dataset.procurementPoItemDetail === row.dataset.procurementPoItemRow);
    if (detail) detail.hidden = !matches || state.expandedPoItemId !== row.dataset.procurementPoItemRow;
    if (matches) visible += 1;
  });
  card.querySelector('.procurement-po-items-empty')?.classList.toggle('hidden', visible > 0);
  const counter = card.querySelector('[data-procurement-po-item-count]');
  if (counter) counter.textContent = `${visible} de ${rows.length} itens`;
}

function renderPurchaseOrders() {
  const content = node('div', 'procurement-po-register'); const poList = scoped(state.purchaseOrders); const items = scoped(state.items); const metrics = metricsByItem();
  const selected = poList.find((po) => po.id === state.selectedPoId);
  if (selected) return renderPurchaseOrderDetail(selected, items, metrics);
  const card = node('section', 'card'); const header = node('div', 'card-header'); const title = node('div'); title.append(node('h2', '', 'PO Database'), node('p', 'text-muted', `${poList.length} Purchase Order(s) · ${items.length} item(ns) no projeto ${projectName(state.projectId)}`));
  const headerActions = node('div', 'page-actions'); const search = node('input', 'input procurement-search'); search.type = 'search'; search.placeholder = 'PO, Vendor, Task ou IDENT CODE...'; search.value = state.search; search.addEventListener('change', () => { state.search = search.value; render(); }); headerActions.append(search, button('Exportar base', 'btn btn-secondary', () => exportPurchaseOrderDatabase(), 'table_view'), button('Nova PO manual', 'btn btn-secondary', () => openPurchaseOrderEditor(), 'add'), button('Importar nova PO', 'btn btn-primary', openPurchaseOrderImport, 'upload_file')); header.append(title, headerActions); card.append(header);
  const query = state.search.toLocaleLowerCase(); const visible = poList.filter((po) => {
    const poItems = items.filter((item) => item.purchaseOrderId === po.id);
    return !query || [po.poNumber, po.subject, supplierName(po.supplierId), ...poItems.flatMap((item) => [item.identCode, item.traceability, item.equipmentDestination])].join(' ').toLocaleLowerCase().includes(query);
  });
  const wrap = node('div', 'table-wrap'); const table = node('table', 'data-table procurement-po-database-table'); const head = node('tr'); ['PO', 'Rev.', 'Vendor', 'PO Doc. Date', 'Task', 'Items', 'Ordered', 'Received', 'Status', 'Ações'].forEach((label) => head.append(node('th', '', label))); const thead = node('thead'); thead.append(head); const tbody = node('tbody');
  visible.forEach((po) => {
    const poItems = items.filter((item) => item.purchaseOrderId === po.id);
    const totals = poItems.map((item) => metrics.get(item.id));
    const row = node('tr');
    row.append(node('td', '', po.poNumber), node('td', '', po.currentRevision), node('td', '', supplierName(po.supplierId)), node('td', '', formatDate(po.orderDate)), node('td', '', po.subject || '—'), node('td', 'mc-numeric-cell', poItems.length), node('td', 'mc-numeric-cell', formatNumber(totals.reduce((sum, item) => sum + number(item?.ordered), 0))), node('td', 'mc-numeric-cell', formatNumber(totals.reduce((sum, item) => sum + number(item?.received), 0))), node('td', '', derivePurchaseOrderStatus(poItems, metrics, po.status)));
    const actions = node('td', 'row-actions procurement-po-actions');
    actions.append(actionGroup(
      button('Abrir', 'btn btn-ghost btn-sm', () => { state.selectedPoId = po.id; state.poItemSearch = ''; state.expandedPoItemId = ''; render(); }, 'open_in_new'),
      button('Editar', 'btn btn-row-edit btn-sm', () => openPurchaseOrderEditor(po), 'edit'),
      button('Excluir', 'btn btn-row-delete btn-sm', () => openPurchaseOrderDeleteDialog(po), 'delete'),
    ));
    row.append(actions);
    tbody.append(row);
  });
  if (!visible.length) { const row = node('tr'); const empty = node('td', 'empty-row', 'Nenhuma Purchase Order encontrada.'); empty.colSpan = 10; row.append(empty); tbody.append(row); }
  table.append(thead, tbody); wrap.append(table); card.append(wrap); content.append(card); return content;
}

function renderPurchaseOrderDetail(po, items, metrics) {
  const card = node('section', 'card procurement-po-detail');
  if (!po) { card.append(node('div', 'placeholder-panel', 'Selecione ou crie uma Purchase Order para visualizar seus itens.')); return card; }
  if (!state.selectedPoId) state.selectedPoId = po.id;
  const poItems = items.filter((item) => item.purchaseOrderId === po.id).sort(compareItemNumbers);
  if (!poItems.some((item) => item.id === state.expandedPoItemId)) state.expandedPoItemId = '';
  const header = node('div', 'card-header procurement-po-detail-header');
  const title = node('div');
  title.append(node('span', 'eyebrow', supplierName(po.supplierId)), node('h2', '', `PO ${po.poNumber}`), node('p', 'text-muted', po.subject || 'Sem assunto informado'));
  const actions = node('div', 'page-actions');
  const back = button('Voltar ao PO Database', 'btn btn-secondary', () => {
    state.selectedPoId = ''; state.poItemSearch = ''; state.expandedPoItemId = ''; render();
  }, 'arrow_back');
  const addItem = button('Adicionar item', 'btn btn-primary', () => openPoItemEditor(po), 'add');
  const moreActions = node('details', 'procurement-more-actions');
  const moreTrigger = node('summary', 'btn btn-secondary procurement-more-actions-trigger');
  moreTrigger.title = 'Mais ações da Purchase Order';
  moreTrigger.setAttribute('aria-label', 'Mais ações da Purchase Order');
  moreTrigger.append(node('span', 'material-symbols-outlined ti-dots-vertical', 'more_vert'));
  const moreMenu = node('div', 'procurement-more-actions-menu'); moreMenu.setAttribute('role', 'menu');
  [
    ['Editar PO', 'edit', 'ti-edit', () => openPurchaseOrderEditor(po), ''],
    ['Exportar PO', 'table_view', 'ti-file-export', () => exportPurchaseOrderDatabase(po), ''],
    ['Nova revisão', 'history', 'ti-history', () => openPoRevisionEditor(po), ''],
    ['Excluir PO', 'delete', 'ti-trash', () => openPurchaseOrderDeleteDialog(po), 'danger'],
  ].forEach(([label, icon, iconClass, handler, variant]) => {
    const control = button('', `procurement-more-action${variant ? ` ${variant}` : ''}`, () => { moreActions.open = false; handler(); }, icon);
    control.setAttribute('role', 'menuitem');
    control.querySelector('.material-symbols-outlined')?.classList.add(iconClass);
    control.append(node('span', '', label)); moreMenu.append(control);
  });
  moreActions.append(moreTrigger, moreMenu);
  actions.append(back, addItem, moreActions);
  header.append(title, actions); card.append(header);

  const revisions = state.revisions.filter((item) => item.purchaseOrderId === po.id)
    .sort((a, b) => String(a.revision).localeCompare(String(b.revision), undefined, { numeric: true }));
  const meta = node('div', 'procurement-po-meta');
  [['Projeto', projectName(po.projectId)], ['Status', derivePurchaseOrderStatus(poItems, metrics, po.status)], ['Data', formatDate(po.orderDate)], ['Moeda', po.currency || '—'], ['Origem', po.sourceSystem || '—']]
    .forEach(([label, value]) => { const item = node('div'); item.append(node('span', '', label), node('strong', '', value)); meta.append(item); });
  const revisionMeta = node('div', 'procurement-po-revision-meta'); revisionMeta.append(node('span', '', 'Revisão atual'));
  if (revisions.length > 1) {
    const history = node('details', 'procurement-revision-popover');
    const summary = node('summary', '', `Rev. ${po.currentRevision || '00'}`);
    summary.title = 'Mostrar histórico de revisões';
    const list = node('div', 'procurement-revision-popover-list');
    revisions.forEach((revision) => list.append(node('span', `procurement-revision-pill${revision.isCurrent ? ' current' : ''}`, `Rev. ${revision.revision}${revision.isCurrent ? ' · Atual' : ''}`)));
    history.append(summary, list); revisionMeta.append(history);
  } else revisionMeta.append(node('strong', '', `Rev. ${po.currentRevision || revisions[0]?.revision || '00'}`));
  meta.append(revisionMeta); card.append(meta);

  const toolbar = node('div', 'procurement-po-items-toolbar');
  const searchWrap = node('label', 'procurement-po-items-search');
  searchWrap.append(node('span', 'material-symbols-outlined', 'search'));
  const search = node('input', 'input'); search.type = 'search'; search.value = state.poItemSearch;
  search.placeholder = 'Buscar TAG, MR item, tipo ou material...'; search.setAttribute('aria-label', 'Buscar itens da Purchase Order');
  searchWrap.append(search);
  const count = node('strong', 'procurement-po-item-count'); count.dataset.procurementPoItemCount = '';
  toolbar.append(searchWrap, count); card.append(toolbar);
  card.append(buildItemMetricsTable(poItems.map((item) => ({ item, po, metrics: metrics.get(item.id) })), true));
  search.addEventListener('input', () => { state.poItemSearch = search.value; applyPoItemSearch(card); });
  applyPoItemSearch(card);
  return card;
}

function poReceivingProgress(po, metrics) {
  const direction = state.receivingSort === 'item-desc' ? -1 : 1;
  const items = scoped(state.items).filter((item) => item.purchaseOrderId === po.id).sort((left, right) => compareItemNumbers(left, right) * direction);
  const totals = items.reduce((result, item) => {
    const itemMetrics = metrics.get(item.id) || {};
    result.ordered += number(itemMetrics.ordered); result.received += number(itemMetrics.received); return result;
  }, { ordered: 0, received: 0 });
  return { items, ...totals, percent: totals.ordered > 0 ? Math.min(100, Math.round((totals.received / totals.ordered) * 100)) : 0 };
}

function renderReceivingPoCards(poList, metrics) {
  const grid = node('div', 'procurement-receiving-po-grid');
  poList.forEach((po) => {
    const progress = poReceivingProgress(po, metrics); const card = node('button', 'procurement-receiving-po-card'); card.type = 'button';
    card.setAttribute('aria-label', `Abrir recebimento da PO ${po.poNumber}`); card.addEventListener('click', () => { state.selectedPoId = po.id; render(); });
    const top = node('div', 'procurement-receiving-po-top'); top.append(node('strong', '', po.poNumber), node('span', 'status-badge', `Revision ${po.currentRevision || '00'}`));
    const progressLabel = node('div', 'procurement-receiving-progress-label'); progressLabel.append(node('span', '', 'Recebido'), node('strong', '', `${progress.percent}%`));
    const progressTrack = node('div', 'procurement-receiving-progress'); const progressBar = node('span'); progressBar.style.width = `${progress.percent}%`; progressTrack.append(progressBar);
    const supplier = node('strong', 'procurement-receiving-supplier', supplierName(po.supplierId));
    const subject = node('p', 'text-muted procurement-receiving-subject', po.subject || 'Sem assunto informado');
    const footer = node('div', 'procurement-receiving-po-footer'); footer.append(node('span', '', `${progress.items.length} Items`), node('span', '', formatDate(po.orderDate)));
    card.append(top, progressLabel, progressTrack, supplier, subject, footer); grid.append(card);
  });
  if (!poList.length) grid.append(node('div', 'placeholder-panel', 'Nenhuma Purchase Order disponível para recebimento.'));
  return grid;
}

function renderReceivingPoDetail(po, metrics) {
  const selectedItem = itemById(state.selectedReceiptItemId);
  if (selectedItem?.purchaseOrderId === po.id) return renderReceiptWorkspace(po, selectedItem, metrics.get(selectedItem.id) || {});
  const progress = poReceivingProgress(po, metrics); const section = node('section', 'card procurement-receiving-detail');
  const header = node('div', 'procurement-receiving-detail-header'); const context = node('div', 'procurement-receiving-context');
  context.append(node('span', 'eyebrow', supplierName(po.supplierId)), node('h2', '', `PO ${po.poNumber}`));
  const meta = node('div', 'procurement-receiving-context-meta'); meta.append(node('span', 'status-badge current', `REV. ${po.currentRevision || '00'}`), node('span', '', po.subject || 'Sem assunto informado'), node('span', '', formatDate(po.orderDate))); context.append(meta);
  const actions = node('div', 'page-actions'); actions.append(button('Voltar às POs', 'btn btn-ghost', () => { state.selectedPoId = ''; state.receivingSearch = ''; state.receivingFilter = 'all'; render(); }, 'arrow_back'), button('Exportar progresso', 'btn btn-secondary', () => exportPurchaseOrderProgress(po), 'table_view'));
  header.append(context, actions); section.append(header);

  const stockOnHand = progress.items.reduce((total, item) => total + number(metrics.get(item.id)?.stockOnHand), 0); const balance = Math.max(0, progress.ordered - progress.received);
  const summary = node('div', 'procurement-receiving-summary'); [['Itens da PO', progress.items.length], ['Quantidade pedida', formatNumber(progress.ordered)], ['Recebido', formatNumber(progress.received)], ['Em estoque', formatNumber(stockOnHand)], ['Falta receber', formatNumber(balance)]].forEach(([label, value], index) => { const cell = node('div', index === 4 && balance > 0 ? 'attention' : ''); cell.append(node('span', '', label), node('strong', '', value)); summary.append(cell); });
  const overallProgress = node('div', 'procurement-receiving-overall-progress'); const progressCopy = node('div'); progressCopy.append(node('span', '', 'Progresso de recebimento'), node('strong', '', `${progress.percent}%`)); const progressTrack = node('div', 'procurement-receiving-progress'); const progressBar = node('span'); progressBar.style.width = `${progress.percent}%`; progressTrack.append(progressBar); overallProgress.append(progressCopy, progressTrack); section.append(summary, overallProgress);

  const toolbar = node('div', 'procurement-receiving-toolbar'); const searchWrap = node('label', 'procurement-receiving-search'); searchWrap.append(node('span', 'material-symbols-outlined', 'search')); const search = node('input', 'input'); search.type = 'search'; search.placeholder = 'Buscar item, material, IDENT, tipo ou grade...'; search.value = state.receivingSearch; search.setAttribute('aria-label', 'Buscar itens da Purchase Order'); searchWrap.append(search);
  const sort = node('select', 'input procurement-receiving-sort'); [['item-asc', 'Item 1 → N'], ['item-desc', 'Item N → 1']].forEach(([value, label]) => sort.append(new Option(label, value))); sort.value = state.receivingSort; sort.setAttribute('aria-label', 'Ordenar itens da PO'); sort.addEventListener('change', () => { state.receivingSort = sort.value; render(); });
  const filters = node('div', 'procurement-receiving-filters'); const filterOptions = [['all', 'Todos'], ['pending', 'Não recebidos'], ['partial', 'Parciais'], ['complete', 'Completos']];
  filterOptions.forEach(([value, label]) => { const control = button(label, `procurement-receiving-filter${state.receivingFilter === value ? ' active' : ''}`, () => { state.receivingFilter = value; applyReceivingItemFilters(section); }); control.dataset.receivingFilter = value; control.setAttribute('aria-pressed', String(state.receivingFilter === value)); filters.append(control); });
  const resultCount = node('strong', 'procurement-receiving-result-count'); resultCount.dataset.receivingResultCount = ''; toolbar.append(searchWrap, filters, sort, resultCount); section.append(toolbar);

  const wrap = node('div', 'table-wrap procurement-receiving-table-wrap'); const table = node('table', 'data-table procurement-receiving-items-table'); const head = node('tr'); ['Item', 'Material', 'Pedido', 'Recebido', 'Inventory', 'Saldo', 'Ação'].forEach((label) => head.append(node('th', '', label))); const thead = node('thead'); thead.append(head); const tbody = node('tbody');
  progress.items.forEach((item) => { const itemMetrics = metrics.get(item.id) || {}; const itemReceipts = state.receiptLines.filter((line) => line.poItemId === item.id); const status = receivingItemStatus(itemMetrics); const inferredMaterial = inferPurchaseOrderMaterialFields(item.description); const materialType = item.itemType || item.materialCategory || item.itemClassification || inferredMaterial.itemType || inferredMaterial.itemClassification; const materialGrade = item.materialGrade || inferredMaterial.materialGrade; const diameterOdMm = number(item.diameterOdMm) || number(inferredMaterial.diameterOdMm); const thicknessMm = number(item.thicknessMm) || number(inferredMaterial.thicknessMm); const row = node('tr', `procurement-receiving-item-row ${status}`); row.dataset.receivingStatus = status; row.dataset.receivingSearch = [item.itemNumber, item.materialCode, item.identCode, item.description, materialType, materialGrade].join(' ').toLocaleLowerCase();
    const itemCell = node('td', 'procurement-receiving-item-number'); itemCell.append(node('strong', '', item.itemNumber), node('small', 'text-muted', item.materialCode || 'PO Item'));
    const materialCell = node('td', 'procurement-receiving-material'); const materialTitle = node('strong', 'procurement-receiving-material-title', item.description || 'Sem descrição'); materialTitle.title = item.description || ''; const materialMeta = node('div', 'procurement-receiving-material-meta'); const dimensions = diameterOdMm > 0 || thicknessMm > 0 ? `${formatNumber(diameterOdMm)} × ${formatNumber(thicknessMm)} mm` : ''; [item.identCode, materialType, materialGrade, dimensions].filter(Boolean).forEach((value) => materialMeta.append(node('span', '', value))); materialCell.append(materialTitle, materialMeta);
    const orderedCell = receivingQuantityCell(itemMetrics.ordered, item.unitOfMeasure); const receivedCell = receivingQuantityCell(itemMetrics.received, item.unitOfMeasure);
    const inventoryCell = node('td', 'procurement-receiving-inventory-cell'); inventoryCell.append(node('strong', '', `${formatNumber(itemMetrics.stockOnHand)} ${item.unitOfMeasure}`), node('small', 'text-muted', `Usado: ${formatNumber(itemMetrics.used)}`));
    const balanceCell = node('td', 'procurement-receiving-balance-cell'); const itemPercent = number(itemMetrics.ordered) > 0 ? Math.min(100, Math.round((number(itemMetrics.received) / number(itemMetrics.ordered)) * 100)) : 0; const itemTrack = node('div', 'procurement-receiving-item-progress'); const itemBar = node('span'); itemBar.style.width = `${itemPercent}%`; itemTrack.append(itemBar); balanceCell.append(node('strong', '', `${formatNumber(itemMetrics.pending)} ${item.unitOfMeasure}`), itemTrack, node('small', 'text-muted', status === 'complete' ? 'Completo' : status === 'partial' ? `${itemPercent}% recebido` : 'Aguardando chegada'));
    const actionCell = node('td', 'row-actions procurement-receiving-action'); const actionLabel = status === 'complete' ? 'Ver recebimentos' : itemReceipts.length ? 'Receber mais' : 'Receber'; actionCell.append(actionGroup(button(actionLabel, status === 'complete' ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm', () => openReceiptEditor(item.id), status === 'complete' ? 'inventory_2' : 'add_box')));
    row.append(itemCell, materialCell, orderedCell, receivedCell, inventoryCell, balanceCell, actionCell); tbody.append(row);
  });
  const emptyRow = node('tr', 'procurement-receiving-filter-empty hidden'); const emptyCell = node('td', 'empty-row', 'Nenhum item corresponde aos filtros.'); emptyCell.colSpan = 7; emptyRow.append(emptyCell); tbody.append(emptyRow);
  table.append(thead, tbody); wrap.append(table); section.append(wrap); search.addEventListener('input', () => { state.receivingSearch = search.value; applyReceivingItemFilters(section); }); applyReceivingItemFilters(section); return section;
}

function receivingItemStatus(metrics = {}) {
  if (number(metrics.pending) <= 0 && number(metrics.received) > 0) return 'complete';
  if (number(metrics.received) > 0) return 'partial';
  return 'pending';
}

function receivingQuantityCell(value, unit) {
  const cell = node('td', 'mc-numeric-cell procurement-receiving-quantity'); cell.append(node('strong', '', formatNumber(value)), node('small', 'text-muted', unit || '')); return cell;
}

function applyReceivingItemFilters(section) {
  const query = text(state.receivingSearch).toLocaleLowerCase(); const rows = [...section.querySelectorAll('.procurement-receiving-item-row')]; let visible = 0;
  rows.forEach((row) => { const matchesSearch = !query || row.dataset.receivingSearch.includes(query); const matchesStatus = state.receivingFilter === 'all' || row.dataset.receivingStatus === state.receivingFilter; row.hidden = !(matchesSearch && matchesStatus); if (!row.hidden) visible += 1; });
  section.querySelectorAll('[data-receiving-filter]').forEach((control) => { const active = control.dataset.receivingFilter === state.receivingFilter; control.classList.toggle('active', active); control.setAttribute('aria-pressed', String(active)); });
  const counter = section.querySelector('[data-receiving-result-count]'); if (counter) counter.textContent = `${visible} de ${rows.length} itens`;
  section.querySelector('.procurement-receiving-filter-empty')?.classList.toggle('hidden', visible > 0);
}

function renderReceipts() {
  const poList = scoped(state.purchaseOrders); const metrics = metricsByItem(); const selected = poList.find((po) => po.id === state.selectedPoId);
  if (selected) return renderReceivingPoDetail(selected, metrics);
  const section = node('section', 'card procurement-receiving-dashboard'); const header = node('div', 'card-header'); const title = node('div'); title.append(node('h2', '', 'Recebimento de materiais'), node('p', 'text-muted', 'Selecione uma Purchase Order para visualizar materiais, saldos e lotes recebidos.')); header.append(title, button('Exportar progresso', 'btn btn-secondary', () => exportPurchaseOrderProgress(), 'table_view')); section.append(header, renderReceivingPoCards(poList, metrics)); return section;
}

function renderSuppliers() {
  const selected = state.organizations.find((item) => item.id === state.selectedOrganizationId);
  if (selected) return renderVendorProfile(selected);
  const workspace = node('div', 'procurement-vendor-workspace');
  const organizations = [...state.organizations].sort((left, right) => (left.tradeName || left.legalName).localeCompare(right.tradeName || right.legalName));
  const qualified = organizations.filter((item) => vendorQualificationSummary(item) === 'QUALIFIED').length;
  const withOpenPos = organizations.filter((item) => state.purchaseOrders.some((po) => po.supplierId === item.id && !['CLOSED', 'CANCELLED', 'RECEIVED'].includes(text(po.status).toUpperCase()))).length;
  const countries = new Set(organizations.map((item) => text(item.country).toUpperCase()).filter(Boolean)).size;
  const header = node('section', 'card procurement-vendor-hero'); const copy = node('div');
  copy.append(node('span', 'eyebrow', 'Vendor Management'), node('h2', '', 'Vendor Register'), node('p', 'text-muted', 'Cadastro único para dados mestres, qualificação e atividade de compras do fornecedor.'));
  header.append(copy, button('Novo Vendor', 'btn btn-primary', () => openSupplierEditor(), 'add_business')); workspace.append(header);
  const kpis = node('div', 'kpi-grid procurement-vendor-kpis');
  kpis.append(kpi('Vendors', organizations.length, 'Organizações cadastradas'), kpi('Ativos', organizations.filter((item) => item.status === 'ACTIVE').length, 'Liberados para uso'), kpi('Qualificados', qualified, 'Qualificação vigente'), kpi('Com PO aberta', withOpenPos, 'Relação comercial ativa'), kpi('Países', countries, 'Cobertura da base'));
  workspace.append(kpis);

  const card = node('section', 'card procurement-vendor-register'); const cardHeader = node('div', 'card-header'); const title = node('div'); title.append(node('h2', '', 'Vendor Directory'), node('p', 'text-muted', 'Abra o perfil para revisar dados, documentos declarados e Purchase Orders relacionadas.'));
  const filters = node('div', 'page-actions procurement-vendor-filters');
  const search = node('input', 'input procurement-search'); search.type = 'search'; search.placeholder = 'Nome, Vendor Code, Tax ID ou categoria...'; search.value = state.vendorSearch; search.setAttribute('aria-label', 'Buscar Vendors'); search.addEventListener('change', () => { state.vendorSearch = search.value; render(); });
  const status = node('select', 'input'); [['ALL', 'Todos os status'], ['ACTIVE', 'Ativos'], ['HOLD', 'Em hold'], ['INACTIVE', 'Inativos']].forEach(([value, label]) => status.append(new Option(label, value))); status.value = state.vendorStatus; status.setAttribute('aria-label', 'Filtrar Vendor por status'); status.addEventListener('change', () => { state.vendorStatus = status.value; render(); });
  const qualification = node('select', 'input'); [['ALL', 'Todas as qualificações'], ['QUALIFIED', 'Qualificado'], ['CONDITIONAL', 'Condicional'], ['PENDING', 'Em avaliação'], ['EXPIRED', 'Expirado'], ['NOT_STARTED', 'Não iniciado']].forEach(([value, label]) => qualification.append(new Option(label, value))); qualification.value = state.vendorQualification; qualification.setAttribute('aria-label', 'Filtrar Vendor por qualificação'); qualification.addEventListener('change', () => { state.vendorQualification = qualification.value; render(); });
  filters.append(search, status, qualification); cardHeader.append(title, filters); card.append(cardHeader);
  const query = text(state.vendorSearch).toLocaleLowerCase();
  const visible = organizations.filter((organization) => {
    const qualificationState = vendorQualificationSummary(organization);
    const haystack = [organization.legalName, organization.tradeName, organization.vendorCode, organization.taxId, organization.country, ...(organization.supplyCategories || [])].join(' ').toLocaleLowerCase();
    return (!query || haystack.includes(query)) && (state.vendorStatus === 'ALL' || organization.status === state.vendorStatus) && (state.vendorQualification === 'ALL' || qualificationState === state.vendorQualification);
  });
  const wrap = node('div', 'table-wrap'); const table = node('table', 'data-table procurement-vendor-table'); const head = node('tr');
  ['Vendor', 'Vendor Code', 'País', 'Categorias', 'Qualificação', 'Perfil', 'POs', 'Status', 'Ações'].forEach((label) => head.append(node('th', '', label))); const thead = node('thead'); thead.append(head); const tbody = node('tbody');
  visible.forEach((organization) => {
    const row = node('tr'); const identity = node('td', 'procurement-vendor-identity'); identity.append(node('strong', '', organization.tradeName || organization.legalName), node('small', 'text-muted', organization.tradeName ? organization.legalName : organization.taxId || 'Sem Tax ID'));
    const profile = vendorProfileCompleteness(organization); const completeness = node('td'); const completenessLabel = node('span', 'procurement-vendor-completeness-label', `${profile.percent}%`); const track = node('span', 'procurement-vendor-completeness'); const bar = node('i'); bar.style.width = `${profile.percent}%`; track.append(bar); completeness.append(completenessLabel, track);
    const qualificationState = vendorQualificationSummary(organization); const actions = node('td', 'row-actions procurement-vendor-actions'); actions.append(actionGroup(button('Abrir', 'btn btn-ghost btn-sm', () => { state.selectedOrganizationId = organization.id; render(); }, 'open_in_new'), button('Editar', 'btn btn-row-edit btn-sm', () => openSupplierEditor(organization), 'edit')));
    row.append(identity, node('td', 'procurement-code-cell', organization.vendorCode || '—'), node('td', '', organization.country || '—'), node('td', '', organization.supplyCategories?.join(', ') || '—'), node('td', '', qualificationState.replaceAll('_', ' ')), completeness, node('td', 'mc-numeric-cell', state.purchaseOrders.filter((po) => po.supplierId === organization.id).length), node('td', '', organization.status), actions); tbody.append(row);
  });
  if (!visible.length) { const row = node('tr'); const empty = node('td', 'empty-row', organizations.length ? 'Nenhum Vendor corresponde aos filtros.' : 'Nenhum Vendor cadastrado.'); empty.colSpan = 9; row.append(empty); tbody.append(row); }
  table.append(thead, tbody); wrap.append(table); card.append(wrap); workspace.append(card); return workspace;
}

function vendorDetail(label, value) { const item = node('div', 'procurement-vendor-detail'); item.append(node('span', '', label), node('strong', '', value || '—')); return item; }

function renderVendorProfile(organization) {
  const workspace = node('div', 'procurement-vendor-workspace'); const profile = vendorProfileCompleteness(organization); const qualification = vendorQualificationSummary(organization);
  const header = node('section', 'card procurement-vendor-profile-header'); const copy = node('div'); copy.append(node('span', 'eyebrow', organization.vendorCode || 'Vendor profile'), node('h2', '', organization.tradeName || organization.legalName), node('p', 'text-muted', organization.tradeName ? organization.legalName : 'Organization master data'));
  const actions = node('div', 'page-actions'); actions.append(button('Voltar ao Vendor Register', 'btn btn-ghost', () => { state.selectedOrganizationId = ''; render(); }, 'arrow_back'), button('Editar Vendor', 'btn btn-primary', () => openSupplierEditor(organization), 'edit')); header.append(copy, actions); workspace.append(header);
  const summary = node('div', 'procurement-vendor-profile-summary'); summary.append(vendorDetail('Status', organization.status), vendorDetail('Qualificação', qualification.replaceAll('_', ' ')), vendorDetail('Completude do perfil', `${profile.percent}%`), vendorDetail('Purchase Orders', state.purchaseOrders.filter((po) => po.supplierId === organization.id).length)); workspace.append(summary);
  const grid = node('div', 'procurement-vendor-profile-grid');
  const master = node('section', 'card procurement-vendor-profile-card'); master.append(node('h3', '', 'Organization data')); const masterDetails = node('div', 'procurement-vendor-details'); masterDetails.append(vendorDetail('Legal name', organization.legalName), vendorDetail('Trade name', organization.tradeName), vendorDetail('Vendor Code', organization.vendorCode), vendorDetail('Tax ID', organization.taxId), vendorDetail('Country', organization.country), vendorDetail('Roles', organization.organizationType?.join(', '))); master.append(masterDetails);
  const contact = node('section', 'card procurement-vendor-profile-card'); contact.append(node('h3', '', 'Contact & supply scope')); const contactDetails = node('div', 'procurement-vendor-details'); contactDetails.append(vendorDetail('E-mail', organization.primaryEmail), vendorDetail('Phone', organization.primaryPhone), vendorDetail('Website', organization.website), vendorDetail('Supply categories', organization.supplyCategories?.join(', '))); contact.append(contactDetails);
  const compliance = node('section', 'card procurement-vendor-profile-card'); compliance.append(node('h3', '', 'Qualification')); const complianceDetails = node('div', 'procurement-vendor-details'); complianceDetails.append(vendorDetail('Status', qualification.replaceAll('_', ' ')), vendorDetail('Valid until', formatDate(organization.qualificationExpiry)), vendorDetail('Certifications / documents', organization.certifications?.join(', ')), vendorDetail('Last update', organization.updatedAt ? new Date(organization.updatedAt).toLocaleString('pt-BR') : '—')); compliance.append(complianceDetails);
  const activity = node('section', 'card procurement-vendor-profile-card'); activity.append(node('h3', '', 'Procurement activity')); const related = state.purchaseOrders.filter((po) => po.supplierId === organization.id); const activityDetails = node('div', 'procurement-vendor-details'); activityDetails.append(vendorDetail('Total POs', related.length), vendorDetail('Open POs', related.filter((po) => !['CLOSED', 'CANCELLED', 'RECEIVED'].includes(text(po.status).toUpperCase())).length), vendorDetail('Source system', organization.sourceSystem), vendorDetail('Notes', organization.notes)); activity.append(activityDetails);
  grid.append(master, contact, compliance, activity); workspace.append(grid); return workspace;
}

function emptyImportRow() { return Object.fromEntries(PURCHASE_ORDER_IMPORT_COLUMNS.map((column) => [column.key, ''])); }

function generatePurchaseOrderImportIdentifiers() {
  let identCodes = 0; let traceabilities = 0;
  state.importRows.forEach((row) => {
    if (!text(row.identCode)) {
      const identCode = generatePurchaseOrderIdentCode(row);
      if (identCode) { row.identCode = identCode; identCodes += 1; }
    }
    if (!text(row.traceability)) {
      try {
        row.traceability = derivePoItemBaseTraceability({
          project: projectById(state.projectId),
          purchaseOrder: { poNumber: row.poNumber },
          item: { itemNumber: row.poItem, identCode: row.identCode, itemType: row.itemType, description: row.itemDescription },
        });
        if (row.traceability) traceabilities += 1;
      } catch { /* The grid remains editable when the source fields are incomplete. */ }
    }
  });
  return { identCodes, traceabilities };
}

function generateImportIdentifiersAndRender() {
  const result = generatePurchaseOrderImportIdentifiers();
  renderPurchaseOrderImportModal();
  if (result.identCodes + result.traceabilities) showToast(`${result.identCodes} IDENT CODE(s) e ${result.traceabilities} traceability(s) gerados.`, 'success');
  else showToast('Nenhum código pôde ser gerado. Revise tipo, classificação, OD, espessura, grau da curva, projeto, PO e item.', 'warning');
}

function openPurchaseOrderImport() {
  if (!state.projectId) { showToast('Selecione um projeto antes de importar Purchase Orders.', 'warning'); return; }
  state.importRows = []; state.importFileName = ''; state.importSourceType = 'MANUAL_GRID'; state.importText = ''; renderPurchaseOrderImportModal();
}

async function loadPurchaseOrderFile(file) {
  try {
    const result = await state.dependencies.readPurchaseOrderFile?.(file);
    if (!result) throw new Error('Leitor de Purchase Order indisponível.');
    state.importRows = result.rows || []; state.importFileName = result.fileName || file.name; state.importSourceType = result.sourceType || 'FILE'; generatePurchaseOrderImportIdentifiers(); renderPurchaseOrderImportModal();
    showToast(`${state.importRows.length} linha(s) extraída(s). Confira a grade antes de salvar.`, 'success');
  } catch (error) { showToast(error?.message || 'Não foi possível ler o arquivo.', 'error'); }
}

function loadPastedPurchaseOrderText() {
  const rows = state.dependencies.parsePurchaseOrderText?.(state.importText) || [];
  if (!rows.length) { showToast('Cole uma tabela com cabeçalho e linhas separadas por tabulação.', 'warning'); return; }
  state.importRows = rows; state.importFileName = 'PASTE_GRID'; state.importSourceType = 'PASTE'; generatePurchaseOrderImportIdentifiers(); renderPurchaseOrderImportModal();
}

async function savePurchaseOrderImport() {
  const validation = validatePurchaseOrderImportRows(state.importRows); const invalid = validation.filter((item) => !item.valid);
  if (invalid.length) { showToast(`Corrija ${invalid.length} linha(s) destacada(s) antes de salvar.`, 'error'); renderPurchaseOrderImportModal(); return; }
  try {
    const result = await state.dependencies.commitPurchaseOrderImport?.(state.importRows, { projectId: state.projectId, sourceFileName: state.importFileName, sourceType: state.importSourceType });
    if (!result) throw new Error('Serviço de importação indisponível.');
    closeModal(); state.importRows = []; state.tab = 'purchase-orders'; state.selectedPoId = result.purchaseOrders?.[0]?.id || ''; await refreshProcurementPage();
    showToast(`${result.purchaseOrders.length} PO(s) e ${result.items.length} item(ns) salvos no database.`, 'success');
  } catch (error) { showToast(error?.message || 'Não foi possível salvar as Purchase Orders.', 'error'); }
}

function buildPurchaseOrderImportModalBody() {
  const page = node('div', 'procurement-import-modal');
  page.append(node('p', 'text-muted procurement-import-guidance', 'PDF SAP preenche os dados comerciais, infere tipo, classificação, OD, espessura e ângulo, e gera IDENT CODE e Traceability quando houver dados suficientes. Revise os campos antes de salvar; o vínculo com equipamentos será realizado pela alocação PO Item → MTO.'));
  const sources = node('div', 'procurement-import-sources');
  const fileCard = node('label', 'procurement-import-source'); fileCard.append(node('span', 'material-symbols-outlined', 'upload_file'), node('strong', '', 'PDF ou Excel'), node('small', 'text-muted', 'PDF, XLSX, XLS, CSV ou TSV'));
  const fileInput = node('input'); fileInput.type = 'file'; fileInput.accept = '.pdf,.xlsx,.xls,.csv,.tsv,.txt'; fileInput.addEventListener('change', () => { const [file] = fileInput.files; if (file) void loadPurchaseOrderFile(file); }); fileCard.append(fileInput);
  const pasteCard = node('div', 'procurement-import-paste'); const paste = node('textarea', 'input'); paste.rows = 3; paste.placeholder = 'Cole aqui a tabela do Excel, incluindo os cabeçalhos VENDOR, PO Number e PO Item...'; paste.value = state.importText; paste.addEventListener('input', () => { state.importText = paste.value; }); pasteCard.append(paste, button('Carregar texto tabulado', 'btn btn-secondary', loadPastedPurchaseOrderText, 'content_paste'));
  sources.append(fileCard, pasteCard); page.append(sources);

  const validation = validatePurchaseOrderImportRows(state.importRows); const invalidByIndex = new Map(validation.filter((item) => !item.valid).map((item) => [item.index, item.errors]));
  const status = node('div', 'procurement-import-status'); status.append(node('strong', '', `${state.importRows.length} linha(s)`), node('span', 'text-muted', state.importFileName || 'Entrada manual'), node('span', invalidByIndex.size ? 'status-badge critical' : 'status-badge', invalidByIndex.size ? `${invalidByIndex.size} com pendência` : 'Pronto para salvar')); page.append(status);
  const bulk = node('div', 'procurement-import-bulk'); const drawbackLabel = node('label', 'field'); drawbackLabel.append(node('span', '', 'Drawback para todos os itens')); const drawbackSelect = node('select', 'input'); [['', 'Selecione...'], ['YES', 'Sim - Drawback'], ['NO', 'Não - sem Drawback']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; drawbackSelect.append(option); }); drawbackLabel.append(drawbackSelect); bulk.append(drawbackLabel, button('Aplicar a todos', 'btn btn-secondary', () => { if (!drawbackSelect.value) { showToast('Escolha Sim ou Não para aplicar o Drawback.', 'warning'); return; } state.importRows.forEach((item) => { item.drawback = drawbackSelect.value; }); renderPurchaseOrderImportModal(); }, 'done_all'), button('Gerar IDENT CODE e Traceability', 'btn btn-secondary', generateImportIdentifiersAndRender, 'auto_fix_high')); page.append(bulk);
  const wrap = node('div', 'table-wrap procurement-import-grid-wrap'); const table = node('table', 'data-table procurement-import-grid'); const colgroup = node('colgroup'); PURCHASE_ORDER_IMPORT_COLUMNS.forEach((column) => { const col = node('col'); col.style.width = `${column.width}px`; colgroup.append(col); }); const removeCol = node('col'); removeCol.style.width = '60px'; colgroup.append(removeCol);
  const head = node('tr'); PURCHASE_ORDER_IMPORT_COLUMNS.forEach((column) => head.append(node('th', '', `${column.label}${column.required ? ' *' : ''}`))); head.append(node('th', '', '')); const thead = node('thead'); thead.append(head); const tbody = node('tbody');
  state.importRows.forEach((rowData, rowIndex) => { const row = node('tr', invalidByIndex.has(rowIndex) ? 'invalid-row' : ''); if (invalidByIndex.has(rowIndex)) row.title = invalidByIndex.get(rowIndex).join(' · '); PURCHASE_ORDER_IMPORT_COLUMNS.forEach((column) => { const cell = node('td'); let control; if (column.control === 'drawback') { control = node('select', 'procurement-grid-input'); [['', 'Definir...'], ['YES', 'Sim'], ['NO', 'Não']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; option.selected = rowData[column.key] === value; control.append(option); }); control.addEventListener('change', () => { rowData[column.key] = control.value; }); } else { control = node('input', 'procurement-grid-input'); control.value = rowData[column.key] ?? ''; control.addEventListener('input', () => { rowData[column.key] = control.value; }); } control.setAttribute('aria-label', `${column.label} linha ${rowIndex + 1}`); cell.append(control); row.append(cell); }); const remove = node('td', 'row-actions'); const removeButton = button('', 'btn btn-ghost btn-icon', () => { state.importRows.splice(rowIndex, 1); renderPurchaseOrderImportModal(); }, 'delete'); removeButton.setAttribute('aria-label', `Excluir linha ${rowIndex + 1}`); remove.append(removeButton); row.append(remove); tbody.append(row); });
  if (!state.importRows.length) { const row = node('tr'); const empty = node('td', 'empty-row', 'Importe um arquivo, cole uma tabela ou adicione a primeira linha.'); empty.colSpan = PURCHASE_ORDER_IMPORT_COLUMNS.length + 1; row.append(empty); tbody.append(row); }
  table.append(colgroup, thead, tbody); wrap.append(table); page.append(wrap); return page;
}

function renderPurchaseOrderImportModal() {
  openModal({
    title: `Importar nova PO · ${projectName(state.projectId)}`,
    body: buildPurchaseOrderImportModalBody(),
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      { label: 'Adicionar linha', variant: 'btn-secondary', closeOnClick: false, onClick: () => { state.importRows.push(emptyImportRow()); renderPurchaseOrderImportModal(); } },
      { label: 'Salvar no database', variant: 'btn-primary', closeOnClick: false, onClick: savePurchaseOrderImport },
    ],
  });
}

function render() {
  if (!state.container) return;
  const content = !state.projectId && state.tab !== 'suppliers'
    ? node('div', 'placeholder-panel', 'Selecione um projeto para organizar suas Purchase Orders e recebimentos.')
    : state.tab === 'purchase-orders' ? renderPurchaseOrders() : state.tab === 'receipts' ? renderReceipts() : state.tab === 'suppliers' ? renderSuppliers() : renderDashboard();
  state.container.replaceChildren(renderScopeHeader(), renderTabs(), content);
}

async function saveAndRefresh(action, successMessage) {
  try { await action(); closeModal(); await refreshProcurementPage(); showToast(successMessage, 'success'); }
  catch (error) { showToast(error?.message || 'Não foi possível salvar o registro.', 'error'); }
}

function saveForm(form, action, successMessage) {
  if (!form.reportValidity()) return undefined;
  return saveAndRefresh(action, successMessage);
}

function openSupplierEditor(organization = null) {
  const editing = Boolean(organization?.id); const form = formGrid();
  form.append(
    formSection('Organization data', 'Identificação única usada em Procurement, Receiving e Inventory.'),
    field('Legal Name *', 'legalName', organization?.legalName, 'text', { required: true }), field('Trade Name', 'tradeName', organization?.tradeName),
    field('Vendor Code', 'vendorCode', organization?.vendorCode), field('Tax ID', 'taxId', organization?.taxId),
    field('Country', 'country', organization?.country), field('Roles', 'organizationType', organization?.organizationType?.join(', ') || 'SUPPLIER, MANUFACTURER'),
    formSection('Contact & supply scope', 'Dados de contato e categorias para localizar o fornecedor com rapidez.'),
    field('Primary e-mail', 'primaryEmail', organization?.primaryEmail, 'email'), field('Primary phone', 'primaryPhone', organization?.primaryPhone, 'tel'),
    field('Website', 'website', organization?.website, 'url'), field('Supply categories', 'supplyCategories', organization?.supplyCategories?.join(', ')),
    formSection('Qualification', 'Resumo operacional; documentos continuam declarados sem criar um repositório paralelo.'),
    selectField('Qualification status', 'qualificationStatus', organization?.qualificationStatus || 'NOT_STARTED', [['NOT_STARTED', 'Not started'], ['PENDING', 'Under evaluation'], ['QUALIFIED', 'Qualified'], ['CONDITIONAL', 'Conditional'], ['EXPIRED', 'Expired']].map(([value, label]) => ({ value, label }))),
    field('Qualification valid until', 'qualificationExpiry', organization?.qualificationExpiry, 'date'),
    field('Certifications / documents', 'certifications', organization?.certifications?.join(', ')), selectField('Vendor status', 'status', organization?.status || 'ACTIVE', ['ACTIVE', 'HOLD', 'INACTIVE'].map((value) => ({ value, label: value }))),
    field('Notes', 'notes', organization?.notes, 'textarea'),
  );
  form.elements.notes.closest('.field').classList.add('procurement-form-full');
  openModal({ title: editing ? `Editar Vendor · ${organization.tradeName || organization.legalName}` : 'Novo Vendor', body: form, wide: true, buttons: [{ label: 'Cancelar', variant: 'btn-ghost' }, { label: editing ? 'Salvar alterações' : 'Cadastrar Vendor', variant: 'btn-primary', closeOnClick: false, onClick: () => saveForm(form, () => state.dependencies.saveOrganization?.({ ...(organization || {}), ...formData(form) }), editing ? 'Vendor atualizado.' : 'Vendor cadastrado.') }] });
}

function openPurchaseOrderEditor(purchaseOrder = null) {
  if (!state.projectId) { showToast('Selecione um projeto antes de criar a PO.', 'warning'); return; }
  if (!state.organizations.length) { showToast('Cadastre um Supplier antes de criar a PO.', 'warning'); state.tab = 'suppliers'; render(); return; }
  const editing = Boolean(purchaseOrder?.id);
  const form = formGrid(
    field('PO Number *', 'poNumber', purchaseOrder?.poNumber, 'text', { required: true }),
    selectField('Supplier *', 'supplierId', purchaseOrder?.supplierId, [{ value: '', label: 'Selecione...' }, ...state.organizations.map((item) => ({ value: item.id, label: item.tradeName || item.legalName }))], true),
    field('Subject', 'subject', purchaseOrder?.subject),
    field('Buyer', 'buyerName', purchaseOrder?.buyerName),
    field('Procurement Office', 'procurementOffice', purchaseOrder?.procurementOffice),
    field('Order Date', 'orderDate', purchaseOrder?.orderDate || new Date().toISOString().slice(0, 10), 'date'),
    field('Currency', 'currency', purchaseOrder?.currency || 'EUR'),
    selectField('Status', 'status', purchaseOrder?.status || 'ISSUED', ['DRAFT', 'ISSUED', 'ACKNOWLEDGED', 'IN_PRODUCTION', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'].map((value) => ({ value, label: value }))),
  );
  const poHasTraceability = editing && purchaseOrderDeletionBlockers(
    purchaseOrder,
    state.items.filter((item) => item.purchaseOrderId === purchaseOrder.id),
    deletionData(),
  ).length > 0;
  if (poHasTraceability) {
    form.elements.poNumber.disabled = true;
    form.elements.supplierId.disabled = true;
    form.prepend(node('p', 'text-muted procurement-form-guidance', 'PO Number e Supplier ficam bloqueados após o início da rastreabilidade. Os demais dados continuam editáveis.'));
  }
  openModal({
    title: editing ? `Editar PO ${purchaseOrder.poNumber}` : `Nova Purchase Order · ${projectName(state.projectId)}`,
    body: form,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: editing ? 'Salvar alterações' : 'Criar PO',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: () => saveForm(form, async () => {
          const values = { ...(purchaseOrder || {}), ...formData(form), projectId: state.projectId };
          const po = editing
            ? await state.dependencies.savePurchaseOrder?.(values)
            : await state.dependencies.createPurchaseOrder?.({ ...values, currentRevision: '00', sourceSystem: 'MANUAL' });
          state.selectedPoId = po.id;
          state.tab = 'purchase-orders';
        }, editing ? 'Purchase Order atualizada.' : 'Purchase Order criada.'),
      },
    ],
  });
}

function openPoItemEditor(po, item = null) {
  const editing = Boolean(item?.id);
  const form = formGrid(
    field('Item Number *', 'itemNumber', item?.itemNumber, 'text', { required: true }),
    field('Material Code', 'materialCode', item?.materialCode),
    field('IDENT CODE', 'identCode', item?.identCode),
    field('Description *', 'description', item?.description, 'text', { required: true }),
    field('Item Type', 'itemType', item?.itemType),
    field('Classification', 'itemClassification', item?.itemClassification),
    field('Material Category', 'materialCategory', item?.materialCategory),
    field('Material Grade', 'materialGrade', item?.materialGrade),
    field('Ordered Quantity *', 'orderedQuantity', item?.orderedQuantity || '1', 'number', { required: true, min: 0.001, step: 0.001 }),
    field('Unit of Measure', 'unitOfMeasure', item?.unitOfMeasure || 'EA'),
    field('Diameter O.D. [mm]', 'diameterOdMm', item?.diameterOdMm, 'number', { min: 0, step: 0.001 }),
    field('Thickness [mm]', 'thicknessMm', item?.thicknessMm, 'number', { min: 0, step: 0.001 }),
    field('Degree', 'degree', item?.degree, 'number', { min: 0, step: 0.001 }),
    field('Length / Area', 'lengthArea', item?.lengthArea, 'number', { min: 0, step: 0.001 }),
    field('Length / Area Unit', 'lengthAreaUnit', item?.lengthAreaUnit),
    field('Task', 'task', item?.task),
    field('Equipment Destination', 'equipmentDestination', item?.equipmentDestination),
    field('Contractual Delivery', 'contractualDeliveryDate', item?.contractualDeliveryDate, 'date'),
    field('Expected Delivery', 'expectedDeliveryDate', item?.expectedDeliveryDate, 'date'),
    selectField('Drawback', 'drawback', item?.drawback || '', ['', 'YES', 'NO'].map((value) => ({ value, label: value || 'Não definido' }))),
    selectField('Status', 'status', item?.status || 'OPEN', ['OPEN', 'IN_PRODUCTION', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'].map((value) => ({ value, label: value }))),
  );
  const itemHasTraceability = editing && purchaseOrderItemDeletionBlockers(item, po, deletionData()).length > 0;
  if (itemHasTraceability) {
    form.elements.itemNumber.disabled = true;
    form.elements.unitOfMeasure.disabled = true;
    const received = number(metricsByItem().get(item.id)?.received);
    if (received > 0) form.elements.orderedQuantity.min = String(received);
    form.prepend(node('p', 'text-muted procurement-form-guidance', 'Item Number e unidade ficam bloqueados após o início da rastreabilidade. A quantidade pedida não pode ficar abaixo do total recebido.'));
  }
  openModal({
    title: `${editing ? 'Editar' : 'Adicionar'} item · PO ${po.poNumber}`,
    body: form,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: editing ? 'Salvar alterações' : 'Salvar Item',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: () => saveForm(form, () => state.dependencies.savePurchaseOrderItem?.({
          ...(item || {}),
          ...formData(form),
          purchaseOrderId: po.id,
          projectId: po.projectId,
        }), editing ? 'Item da PO atualizado.' : 'Item adicionado à PO.'),
      },
    ],
  });
}

function deletionData() {
  return {
    receiptLines: state.receiptLines,
    materialUnits: state.materialUnits,
    inventoryItems: state.inventoryItems,
    allocations: state.allocations,
  };
}

function deletionBlockedBody(intro, blockers) {
  const body = node('div', 'procurement-delete-dialog');
  body.append(node('p', '', intro), node('p', 'text-muted', 'Remova ou regularize os vínculos abaixo antes de tentar novamente.'));
  const list = node('ul');
  [...new Map(blockers.map((blocker) => [`${blocker.itemNumber || ''}:${blocker.code}`, blocker])).values()]
    .forEach((blocker) => list.append(node('li', '', `${blocker.itemNumber ? `Item ${blocker.itemNumber}: ` : ''}${blocker.label}.`)));
  body.append(list);
  return body;
}

function openPoItemDeleteDialog(po, item) {
  const blockers = purchaseOrderItemDeletionBlockers(item, po, deletionData());
  if (blockers.length) {
    openModal({
      title: `Item ${item.itemNumber} não pode ser excluído`,
      body: deletionBlockedBody('Este item já participa da rastreabilidade do material.', blockers),
      buttons: [{ label: 'Entendi', variant: 'btn-primary' }],
    });
    return;
  }
  const body = node('div', 'procurement-delete-dialog');
  body.append(node('p', '', `Excluir permanentemente o item ${item.itemNumber} da PO ${po.poNumber}?`), node('p', 'text-muted', item.description || 'Esta ação não pode ser desfeita.'));
  openModal({
    title: 'Excluir item da Purchase Order',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Excluir item',
        variant: 'btn-danger',
        closeOnClick: false,
        onClick: () => saveAndRefresh(async () => {
          await state.dependencies.deletePurchaseOrderItem?.(item.id);
          if (state.selectedReceiptItemId === item.id) state.selectedReceiptItemId = '';
        }, 'Item excluído da Purchase Order.'),
      },
    ],
  });
}

function openPurchaseOrderDeleteDialog(po) {
  const poItems = state.items.filter((item) => item.purchaseOrderId === po.id);
  const blockers = purchaseOrderDeletionBlockers(po, poItems, deletionData());
  if (blockers.length) {
    openModal({
      title: `PO ${po.poNumber} não pode ser excluída`,
      body: deletionBlockedBody('A Purchase Order contém itens que já participam da rastreabilidade do material.', blockers),
      wide: true,
      buttons: [{ label: 'Entendi', variant: 'btn-primary' }],
    });
    return;
  }
  const body = node('div', 'procurement-delete-dialog');
  body.append(
    node('p', '', `Excluir permanentemente a PO ${po.poNumber}?`),
    node('p', 'text-muted', `${poItems.length} item(ns) e o histórico de revisões desta PO também serão excluídos.`),
  );
  openModal({
    title: 'Excluir Purchase Order',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Excluir PO',
        variant: 'btn-danger',
        closeOnClick: false,
        onClick: () => saveAndRefresh(async () => {
          await state.dependencies.deletePurchaseOrder?.(po.id);
          state.selectedPoId = '';
          state.selectedReceiptItemId = '';
        }, 'Purchase Order excluída.'),
      },
    ],
  });
}

function openPoRevisionEditor(po) {
  const form = formGrid(field('Revision *', 'revision', '', 'text', { required: true }), field('Issue Date *', 'issueDate', new Date().toISOString().slice(0, 10), 'date', { required: true }), field('Document Revision ID', 'documentRevisionId'));
  openModal({ title: `Nova revisão · PO ${po.poNumber}`, body: form, buttons: [{ label: 'Cancelar', variant: 'btn-ghost' }, { label: 'Criar revisão', variant: 'btn-primary', closeOnClick: false, onClick: () => saveForm(form, () => state.dependencies.createPurchaseOrderRevision?.(po.id, formData(form)), 'Revisão da Purchase Order criada.') }] });
}

function poItemLengthMm(item = {}) {
  const length = number(item.lengthArea); const unit = text(item.lengthAreaUnit).toUpperCase();
  if (unit === 'M') return length * 1000;
  if (['IN', 'INCH', 'INCHES'].includes(unit)) return length * 25.4;
  return length;
}

function inventoryIdentityValues(inventoryItem = {}) {
  return [inventoryItem.id, inventoryItem.trace, inventoryItem.traceability].map(text).filter(Boolean);
}

function receiptRecordsForItem(itemId) {
  const item = itemById(itemId); const po = poById(item?.purchaseOrderId); if (!item || !po) return [];
  const receiptRecords = state.receiptLines.filter((line) => line.poItemId === itemId).map((line) => ({
    source: 'RECEIPT', line, receipt: state.receipts.find((receipt) => receipt.id === line.receiptId), units: state.materialUnits.filter((unit) => unit.receiptLineId === line.id).sort((left, right) => text(left.traceability).localeCompare(text(right.traceability), undefined, { numeric: true })),
  })).filter((entry) => entry.receipt);
  const representedInventoryValues = new Set(receiptRecords.flatMap(({ units }) => units.flatMap((unit) => [unit.id, unit.inventoryItemId, unit.traceability]).map(text).filter(Boolean)));
  const inventoryOnly = state.inventoryItems.filter((inventoryItem) => inventoryMatchesPoItem(item, po, inventoryItem)
    && !inventoryIdentityValues(inventoryItem).some((value) => representedInventoryValues.has(value)));
  const groups = new Map();
  inventoryOnly.forEach((inventoryItem) => {
    const key = [text(inventoryItem.mrr) || text(inventoryItem.sourceDocumentId) || 'INVENTORY', text(inventoryItem.receivedDate), text(inventoryItem.nfArrival)].join('|');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(inventoryItem);
  });
  const inventoryRecords = [...groups.entries()].map(([key, inventoryItems]) => {
    const receiptNumber = text(inventoryItems[0]?.mrr) || 'Inventory importado'; const arrivalDate = text(inventoryItems[0]?.receivedDate);
    const units = inventoryItems.map((inventoryItem) => ({
      id: inventoryIdentityValues(inventoryItem)[0], traceability: text(inventoryItem.traceability || inventoryItem.trace || inventoryItem.id), heatNumber: text(inventoryItem.heatNo),
      quantity: inventoryItems.length === 1 ? Math.max(number(inventoryItem.qty), number(inventoryItem.receivedQty)) : number(inventoryItem.qty), unitOfMeasure: text(inventoryItem.unit) || item.unitOfMeasure,
      originalLengthMm: number(inventoryItem.lengthMm), storageLocationId: text(inventoryItem.location), postingStatus: 'POSTED', inventoryStatus: text(inventoryItem.status).toUpperCase() || 'AVAILABLE',
      inventoryItemId: inventoryIdentityValues(inventoryItem)[0], inventoryItem,
    })).sort((left, right) => text(left.traceability).localeCompare(text(right.traceability), undefined, { numeric: true }));
    return {
      source: 'INVENTORY', receipt: { id: `inventory:${key}`, receiptNumber, arrivalDate },
      line: { receivedQuantity: calculateInventoryReceivedQuantity(item, inventoryItems), unitOfMeasure: text(inventoryItems[0]?.unit) || item.unitOfMeasure }, units,
    };
  });
  return [...receiptRecords, ...inventoryRecords].sort((left, right) => String(right.receipt.arrivalDate).localeCompare(String(left.receipt.arrivalDate)) || text(left.receipt.receiptNumber).localeCompare(text(right.receipt.receiptNumber), undefined, { numeric: true }));
}

function nextReceiptNumber(po, item) {
  const prefix = `MRR-${po.poNumber}-${item.itemNumber}`; const used = new Set(state.receipts.map((receipt) => receipt.receiptNumber)); let sequence = 1;
  while (used.has(`${prefix}-${String(sequence).padStart(3, '0')}`)) sequence += 1;
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

function autoTraceabilityToggle() {
  const wrapper = node('label', 'procurement-auto-traceability'); const input = node('input'); input.type = 'checkbox'; input.name = 'autoTraceability';
  const copy = node('span'); copy.append(node('strong', '', 'Gerar traceability sequencial'), node('small', 'text-muted', 'Cria uma unidade com quantidade 1 para cada peça recebida.'));
  wrapper.append(input, copy); return wrapper;
}

function materialUnitIsPosted(unit) {
  return text(unit.postingStatus).toUpperCase() === 'POSTED' || Boolean(text(unit.inventoryItemId));
}

function openMaterialUnitEditor(unit, itemId) {
  const form = formGrid(
    field('Traceability', 'traceability', unit.traceability),
    field('Heat Number *', 'heatNumber', unit.heatNumber, 'text', { required: true }),
    field('Piece Length [m]', 'pieceLengthM', number(unit.originalLengthMm) / 1000 || '', 'number', { min: 0.001, step: 0.001 }),
    field('Storage Location', 'storageLocationId', unit.storageLocationId),
  );
  form.elements.traceability.readOnly = materialUnitIsPosted(unit);
  openModal({ title: `Editar unidade · ${unit.traceability}`, body: form, buttons: [
    { label: 'Cancelar', variant: 'btn-ghost' },
    { label: 'Salvar unidade', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
      if (!form.reportValidity()) return;
      try {
        const values = formData(form); await state.dependencies.updateReceivedMaterialUnit?.(unit.id, { materialUnitPatch: { ...values, originalLengthMm: number(values.pieceLengthM) * 1000 } });
        closeModal(); await refreshProcurementPage(); state.selectedReceiptItemId = itemId; render(); showToast('Unidade e Inventory atualizados.', 'success');
      } catch (error) { showToast(error?.message || 'Não foi possível atualizar a unidade.', 'error'); }
    } },
  ] });
}

function openInventoryReceiptEditor(unit, itemId) {
  const inventoryItem = unit.inventoryItem; if (!inventoryItem) return;
  const form = formGrid(
    field('Traceability *', 'traceability', unit.traceability, 'text', { required: true }),
    field('Heat Number', 'heatNo', inventoryItem.heatNo),
    field('Qty Received *', 'quantity', unit.quantity, 'number', { required: true, min: 0.001, step: 0.001 }),
    field('Piece Length [m]', 'pieceLengthM', number(inventoryItem.lengthMm) / 1000 || '', 'number', { min: 0, step: 0.001 }),
    field('Storage Location', 'location', inventoryItem.location),
  );
  form.elements.traceability.readOnly = true;
  openModal({ title: `Editar item recebido · ${unit.traceability}`, body: form, buttons: [
    { label: 'Cancelar', variant: 'btn-ghost' },
    { label: 'Salvar no Inventory', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
      if (!form.reportValidity()) return;
      try {
        const values = formData(form); const quantity = number(values.quantity);
        await state.dependencies.updateReceivedMaterialUnit?.(unit.id, {
          materialUnitPatch: { heatNumber: values.heatNo, quantity, originalLengthMm: number(values.pieceLengthM) * 1000, storageLocationId: values.location },
          inventoryPatch: { heatNo: values.heatNo, qty: quantity, receivedQty: quantity, lengthMm: number(values.pieceLengthM) * 1000, location: values.location },
        });
        closeModal(); await refreshProcurementPage(); state.selectedReceiptItemId = itemId; render(); showToast('Recebimento atualizado no Procurement e no Inventory.', 'success');
      } catch (error) { showToast(error?.message || 'Não foi possível atualizar o item do Inventory.', 'error'); }
    } },
  ] });
}

function renderReceiptBatchList(itemId) {
  const section = node('section', 'procurement-receipt-batches'); section.append(node('h4', '', 'Recebimentos registrados')); const records = receiptRecordsForItem(itemId);
  if (!records.length) { section.append(node('p', 'text-muted', 'Nenhum lote recebido para este item.')); return section; }
  records.forEach(({ source, receipt, line, units }) => {
    const batch = node('article', 'procurement-receipt-batch'); const copy = node('div'); const traces = units.map((unit) => unit.traceability).filter(Boolean); const heats = [...new Set(units.map((unit) => text(unit.heatNumber)).filter(Boolean))]; const heatLabel = heats.length > 1 ? 'Mixed heats' : heats[0] || line.heatNumber || '—';
    const traceSummary = traces.length > 3 ? `${traces[0]} … ${traces.at(-1)} · ${traces.length} linhas` : traces.join(', ');
    copy.append(node('strong', '', `${formatNumber(line.receivedQuantity)} ${line.unitOfMeasure} · Heat ${heatLabel}`), node('span', 'text-muted', `${receipt.receiptNumber} · ${formatDate(receipt.arrivalDate)}`), node('small', 'text-muted', traceSummary || 'Sem traceabilidade'));
    const header = node('div', 'procurement-receipt-batch-header'); header.append(copy, node('span', 'status-badge current', units.every(materialUnitIsPosted) ? 'IN INVENTORY' : 'INTEGRATION PENDING')); batch.append(header);
    const wrap = node('div', 'table-wrap procurement-unit-table-wrap'); const table = node('table', 'data-table procurement-unit-table'); const head = node('tr');
    ['Traceability', 'Heat', 'Qty', 'Length [m]', 'Location', 'Inventory', 'Ação'].forEach((label) => head.append(node('th', '', label))); const thead = node('thead'); thead.append(head); const tbody = node('tbody');
    units.forEach((unit) => { const row = node('tr'); const posted = materialUnitIsPosted(unit); row.append(node('td', 'procurement-unit-trace', unit.traceability || '—'), node('td', '', unit.heatNumber || '—'), node('td', 'mc-numeric-cell', formatNumber(unit.quantity)), node('td', 'mc-numeric-cell', formatNumber(number(unit.originalLengthMm) / 1000)), node('td', '', unit.storageLocationId || '—'), node('td', '', posted ? 'INTEGRATED' : 'PENDING')); const actions = node('td', 'row-actions'); actions.append(actionGroup(button('Editar', 'btn btn-row-edit btn-sm', () => source === 'INVENTORY' ? openInventoryReceiptEditor(unit, itemId) : openMaterialUnitEditor(unit, itemId), 'edit'))); row.append(actions); tbody.append(row); });
    table.append(thead, tbody); wrap.append(table); batch.append(wrap); section.append(batch);
  });
  return section;
}

function openReceiptEditor(preselectedItemId = '') {
  if (!state.projectId) { showToast('Selecione um projeto antes de registrar o recebimento.', 'warning'); return; }
  const item = itemById(preselectedItemId); const po = poById(item?.purchaseOrderId); if (!item || !po) { showToast('Selecione um material a partir da Purchase Order.', 'warning'); return; }
  state.selectedPoId = po.id; state.selectedReceiptItemId = item.id; state.tab = 'receipts'; render();
}

function renderReceiptWorkspace(po, item, metrics) {
  const workspace = node('div', 'procurement-receipt-workspace'); const pending = number(metrics.pending); const batches = receiptRecordsForItem(item.id);
  const header = node('section', 'card procurement-receipt-workspace-header'); const copy = node('div');
  copy.append(node('span', 'eyebrow', `PO ${po.poNumber} · ITEM ${item.itemNumber}`), node('h2', '', item.description || item.identCode || 'Material'), node('p', 'text-muted', `${item.materialCode || item.identCode || 'Sem código'} · ${item.unitOfMeasure} · Supplier ${supplierName(po.supplierId)}`));
  const actions = node('div', 'page-actions'); actions.append(button('Voltar aos itens', 'btn btn-ghost', () => { state.selectedReceiptItemId = ''; render(); }, 'arrow_back'));
  header.append(copy, actions); const summary = node('div', 'procurement-receiving-summary'); [['Pedido', metrics.ordered], ['Recebido', metrics.received], ['Em estoque', metrics.stockOnHand], ['Usado', metrics.used], ['Falta chegar', metrics.pending]].forEach(([label, value]) => { const cell = node('div'); cell.append(node('span', '', label), node('strong', '', `${formatNumber(value)} ${item.unitOfMeasure}`)); summary.append(cell); }); header.append(summary); workspace.append(header);

  if (pending > 0) workspace.append(renderReceiptEntryForm(po, item, pending, batches));
  else { const complete = node('section', 'card placeholder-panel'); complete.append(node('strong', '', 'Item totalmente recebido'), node('p', 'text-muted', 'Não existe saldo pendente nesta Purchase Order.')); workspace.append(complete); }
  const history = node('section', 'card procurement-receipt-history'); history.append(renderReceiptBatchList(item.id)); workspace.append(history); return workspace;
}

function traceabilityDerivationMessage(error) {
  if (error?.message === 'TRACEABILITY_PROJECT_CODE_REQUIRED') return 'Defina a Sigla de materiais em Projects > Editar projeto.';
  if (error?.message === 'TRACEABILITY_MATERIAL_TYPE_CODE_REQUIRED') return 'O tipo deste material ainda não possui uma sigla de traceability. Revise Item Type ou a descrição da PO.';
  return 'Não foi possível montar a traceability deste item. Revise o Projeto e a PO.';
}

function renderReceiptEntryForm(po, item, pending, batches) {
  const card = node('section', 'card procurement-receipt-entry'); const header = node('div', 'card-header'); const title = node('div'); title.append(node('h2', '', 'Registrar chegada'), node('p', 'text-muted', 'Ao salvar, o material entra imediatamente no Inventory e fica disponível para uso.')); header.append(title); card.append(header);
  const form = node('form', 'procurement-receipt-form'); let traceabilityDerivationError = null; let baseTraceability = '';
  try { baseTraceability = derivePoItemBaseTraceability({ project: projectById(item.projectId), purchaseOrder: po, item }); } catch (error) { traceabilityDerivationError = error; baseTraceability = text(item.traceability) || `${po.poNumber}-${item.itemNumber}`; }
  const manualTraceability = `${baseTraceability}-${String(batches.length + 1).padStart(3, '0')}`; const isLinearMeters = text(item.unitOfMeasure).toUpperCase() === 'M'; const inheritedLengthM = poItemLengthMm(item) / 1000;
  const toggle = autoTraceabilityToggle(); const quantityField = field(`Total Received [${item.unitOfMeasure}] *`, 'receivedQuantity', pending, 'number', { required: true, min: 0.001, step: 0.001 }); const quantityInput = quantityField.querySelector('input');
  const initialPieceCount = !isLinearMeters && Number.isInteger(pending) ? pending : 1;
  const physicalUnitField = field('Number of Pieces *', 'physicalUnitCount', initialPieceCount, 'number', { required: true, min: 1, step: 1 }); const physicalUnitInput = physicalUnitField.querySelector('input');
  const pieceLengthField = field('Piece Length [m]', 'pieceLengthM', inheritedLengthM || '', 'number', { min: 0.001, step: 0.001 }); const pieceLengthInput = pieceLengthField.querySelector('input');
  const traceabilityField = field('Traceability Tag *', 'traceabilityPrefix', manualTraceability, 'text', { required: true }); const traceabilityInput = traceabilityField.querySelector('input'); const preview = node('div', 'procurement-auto-traceability-preview hidden');
  const grid = node('div', 'procurement-receipt-grid'); grid.append(field('Heat Number *', 'heatNumber', '', 'text', { required: true }), quantityField, physicalUnitField, pieceLengthField, field('Arrival Date *', 'arrivalDate', new Date().toISOString().slice(0, 10), 'date', { required: true }), field('Invoice (NF)', 'invoiceNumber'), field('Storage Location', 'storageLocationId'), traceabilityField);
  const acceptance = node('div', 'procurement-acceptance-note'); acceptance.append(node('span', 'material-symbols-outlined', 'verified'), node('div'));
  acceptance.lastElementChild.append(node('strong', '', 'Aceite para entrada no Inventory'), node('small', 'text-muted', 'O recebimento será registrado com inspection status ACCEPTED e ficará auditável.'));
  form.append(
    receiptSection('Dados do recebimento', 'Informe quantidade, identificação física e local de armazenagem.', grid),
    receiptSection('Rastreabilidade', 'Escolha entre identificação manual ou geração sequencial por peça.', toggle, preview),
    receiptSection('Aceite e observações', 'Confirme o destino operacional antes de registrar a chegada.', acceptance, field('Remarks', 'remarks', '', 'textarea')),
  );
  function updateAutoTraceabilityFields() {
    const enabled = form.elements.autoTraceability.checked; traceabilityInput.disabled = enabled; pieceLengthInput.disabled = !enabled; pieceLengthField.classList.toggle('procurement-field-disabled', !enabled); traceabilityField.classList.toggle('procurement-field-disabled', enabled); preview.classList.toggle('hidden', !enabled);
    if (!enabled) { physicalUnitInput.value = '1'; traceabilityInput.value = manualTraceability; return; }
    if (traceabilityDerivationError) { preview.textContent = traceabilityDerivationMessage(traceabilityDerivationError); return; }
    traceabilityInput.value = baseTraceability; const count = number(physicalUnitInput.value); const pieceLengthM = number(pieceLengthInput.value);
    if (isLinearMeters && count > 0 && pieceLengthM > 0) quantityInput.value = String(count * pieceLengthM);
    if (!isLinearMeters && count > 0) quantityInput.value = String(count);
    if (!Number.isInteger(count) || count <= 0) { preview.textContent = 'Informe uma quantidade inteira para gerar as unidades.'; return; }
    try { const codes = generateSequentialTraceabilities(baseTraceability, count, [...state.materialUnits, ...state.inventoryItems]); preview.textContent = `${count} peça(s)${pieceLengthM ? ` de ${formatNumber(pieceLengthM)} m` : ''} · total ${formatNumber(quantityInput.value)} ${item.unitOfMeasure} · ${codes[0]} até ${codes.at(-1)}.`; } catch (error) { preview.textContent = error.message; }
  }
  form.elements.autoTraceability.addEventListener('change', updateAutoTraceabilityFields); physicalUnitInput.addEventListener('input', updateAutoTraceabilityFields); pieceLengthInput.addEventListener('input', updateAutoTraceabilityFields); updateAutoTraceabilityFields();
  const footer = node('div', 'procurement-receipt-entry-actions'); footer.append(node('small', 'text-muted', 'Dimensões e fornecedor são herdados do item da PO.'), button('Receber e adicionar ao Inventory', 'btn btn-primary', async () => {
    if (!form.reportValidity()) return; const values = formData(form); const quantity = number(values.receivedQuantity); const autoTraceability = form.elements.autoTraceability.checked; if (autoTraceability && traceabilityDerivationError) { showToast(traceabilityDerivationMessage(traceabilityDerivationError), 'error'); return; } if (quantity > pending) { showToast(`Quantidade superior ao saldo pendente (${formatNumber(pending)} ${item.unitOfMeasure}).`, 'error'); return; }
    try {
      await state.dependencies.createMaterialReceipt?.({ receipt: { projectId: state.projectId, receiptNumber: nextReceiptNumber(po, item), supplierId: po.supplierId, invoiceNumber: values.invoiceNumber, arrivalDate: values.arrivalDate, warehouseId: values.storageLocationId, status: 'RECEIVED' }, line: { purchaseOrderId: po.id, poItemId: item.id, receivedQuantity: quantity, unitOfMeasure: item.unitOfMeasure, heatNumber: values.heatNumber, inspectionStatus: 'ACCEPTED', remarks: values.remarks }, units: { autoTraceability, baseTraceability, physicalUnitCount: values.physicalUnitCount, traceabilityPrefix: autoTraceability ? baseTraceability : values.traceabilityPrefix, manufacturerId: po.supplierId, originalDiameterMm: item.diameterOdMm, originalLengthMm: number(values.pieceLengthM) * 1000 || poItemLengthMm(item), originalThicknessMm: item.thicknessMm, storageLocationId: values.storageLocationId } });
      await refreshProcurementPage(); state.selectedReceiptItemId = item.id; render(); showToast('Material recebido e integrado ao Inventory.', 'success');
    } catch (error) { showToast(error?.message || 'Não foi possível registrar o recebimento.', 'error'); }
  }, 'move_to_inbox')); form.append(footer); card.append(form); return card;
}

export async function refreshProcurementPage() {
  if (!state.container) return; const refreshToken = ++state.refreshToken; const data = await state.dependencies.loadData?.() || {};
  if (refreshToken !== state.refreshToken) return;
  ['projects', 'organizations', 'purchaseOrders', 'revisions', 'items', 'receipts', 'receiptLines', 'materialUnits', 'inventoryItems', 'reservations', 'stockMovements', 'allocations', 'deliveryForecasts', 'mtoItems'].forEach((key) => { state[key] = Array.isArray(data[key]) ? data[key] : []; });
  if (!state.projectId || !state.projects.some((project) => project.id === state.projectId)) state.projectId = data.defaultProjectId || state.projects[0]?.id || '';
  render();
}

export async function initProcurementPage(container, dependencies = {}) {
  state.container = container; state.dependencies = { ...dependencies };
  const loading = node('section', 'card placeholder-panel procurement-loading'); loading.setAttribute('aria-live', 'polite'); loading.append(node('strong', '', 'Atualizando Procurement...'), node('p', 'text-muted', 'Carregando Purchase Orders, recebimentos e saldos do Inventory.'));
  container.replaceChildren(loading);
  await refreshProcurementPage();
}
