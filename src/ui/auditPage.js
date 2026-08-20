import { buildAuditHistoryRows, filterAuditHistoryRows, summarizeAuditHistory } from '../core/auditHistory.js';
import { buildCsv, downloadCsv } from '../data/csvExport.js';
import { openModal } from './modal.js';

const state = {
  container: null,
  dependencies: {},
  rows: [],
  filters: { search: '', kind: '', projectId: '', action: '', entityType: '', from: '', to: '' },
  page: 1,
  pageSize: 50,
  bound: false,
};

function node(tag, className = '', textValue = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue !== '') element.textContent = textValue;
  return element;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function formatTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '-';
}

function filterField(label, key, options = null, type = 'text') {
  const wrapper = node('label', `audit-filter-field audit-filter-${key}`);
  wrapper.append(node('span', '', label));
  const control = options ? node('select', 'input') : node('input', 'input');
  if (!options) control.type = type;
  if (key === 'search') control.placeholder = 'Material, documento, usuário ou ação...';
  if (options) {
    const all = node('option', '', 'Todos'); all.value = ''; control.append(all);
    options.forEach((value) => { const option = node('option', '', value); option.value = value; control.append(option); });
  }
  control.value = state.filters[key] || '';
  control.addEventListener(options ? 'change' : 'input', () => {
    state.filters[key] = control.value;
    state.page = 1;
    renderResults();
  });
  wrapper.append(control);
  return wrapper;
}

function kpi(label, value, caption) {
  const card = node('div', 'kpi-card');
  card.append(node('div', 'kpi-label', label), node('div', 'kpi-value', String(value)), node('div', 'text-muted', caption));
  return card;
}

function statusText(row) {
  if (!row.previousStatus && !row.nextStatus) return '-';
  return `${row.previousStatus || '-'} → ${row.nextStatus || '-'}`;
}

function detailCell(row) {
  const cell = node('td');
  const button = node('button', 'btn btn-ghost audit-details-button', 'Abrir');
  button.type = 'button';
  button.addEventListener('click', () => {
    const body = node('div', 'audit-detail-dialog');
    const summary = node('dl', 'audit-detail-summary');
    [
      ['Data/Hora', formatTimestamp(row.timestamp)], ['Tipo', row.kind === 'AUDIT' ? 'Evento de auditoria' : 'Movimento de estoque'],
      ['Ação', row.action], ['Projeto', row.projectId || '-'], ['Entidade', row.entityType || '-'],
      ['Identificação', row.entityId || row.inventoryItemId || '-'], ['Documento', [row.sourceDocumentType, row.sourceDocumentId].filter(Boolean).join(' / ') || '-'],
      ['Usuário', row.userName || '-'], ['Status', statusText(row)], ['Motivo', row.reason || '-'],
    ].forEach(([label, value]) => { summary.append(node('dt', '', label), node('dd', '', value)); });
    const payload = node('pre', 'audit-detail-payload');
    payload.textContent = JSON.stringify({ before: row.before, after: row.after, metadata: row.metadata, quantityDelta: row.quantityDelta, lengthDelta: row.lengthDelta }, null, 2);
    body.append(summary, node('h3', '', 'Dados técnicos'), payload);
    openModal({ title: `Auditoria · ${row.action}`, body, wide: true, buttons: [{ label: 'Fechar', variant: 'btn-primary' }] });
  });
  cell.append(button);
  return cell;
}

function tableCell(value) {
  return node('td', '', value || '-');
}

function actionCell(row) {
  const cell = node('td', 'audit-action-cell');
  cell.append(node('span', `audit-kind audit-kind-${row.kind.toLowerCase()}`, row.kind === 'AUDIT' ? 'Evento' : 'Movimento'));
  cell.append(node('strong', '', row.action));
  if (row.reason) cell.append(node('small', 'text-muted', row.reason));
  return cell;
}

function stackedCell(primary, secondary = '') {
  const cell = node('td', 'audit-stacked-cell');
  cell.append(node('strong', '', primary || '-'));
  if (secondary) cell.append(node('small', 'text-muted', secondary));
  return cell;
}

function renderResults() {
  const host = state.container?.querySelector('[data-audit-results]');
  const kpis = state.container?.querySelector('[data-audit-kpis]');
  if (!host || !kpis) return;
  const filtered = filterAuditHistoryRows(state.rows, state.filters);
  const summary = summarizeAuditHistory(filtered);
  kpis.replaceChildren(
    kpi('Registros', summary.total, 'Eventos e movimentos filtrados'),
    kpi('Eventos', summary.auditEvents, 'Registros de auditoria'),
    kpi('Movimentos', summary.stockMovements, 'Alterações físicas do estoque'),
    kpi('Materiais', summary.materials, 'Itens de inventário rastreados'),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const visible = filtered.slice(start, start + state.pageSize);
  const card = node('section', 'card audit-results-card');
  const cardHeader = node('div', 'card-header audit-results-header');
  const heading = node('div'); heading.append(node('h2', '', 'Linha do tempo'), node('p', 'text-muted', `${filtered.length} registro(s) encontrado(s)`));
  cardHeader.append(heading);
  const wrap = node('div', 'table-wrap audit-table-wrap');
  const table = node('table', 'data-table audit-history-table');
  const colgroup = node('colgroup');
  [150, 260, 110, 190, 210, 180, 80].forEach((width) => { const col = node('col'); col.style.width = `${width}px`; colgroup.append(col); });
  const head = node('tr');
  ['Data/Hora', 'Evento', 'Projeto', 'Entidade / Material', 'Documento de origem', 'Status / Usuário', 'Detalhes']
    .forEach((label) => head.append(node('th', '', label)));
  const thead = node('thead'); thead.append(head);
  const tbody = node('tbody');
  visible.forEach((row) => {
    const tr = node('tr');
    tr.append(
      tableCell(formatTimestamp(row.timestamp)), actionCell(row), tableCell(row.projectId),
      stackedCell(row.entityType, row.entityId || row.inventoryItemId),
      stackedCell(row.sourceDocumentType, row.sourceDocumentId),
      stackedCell(statusText(row), row.userName), detailCell(row),
    );
    tbody.append(tr);
  });
  if (!visible.length) {
    const tr = node('tr'); const empty = node('td', 'empty-row', 'Nenhum registro encontrado para os filtros atuais.'); empty.colSpan = 7; tr.append(empty); tbody.append(tr);
  }
  table.append(colgroup, thead, tbody); wrap.append(table);

  const pagination = node('div', 'audit-pagination');
  const previous = node('button', 'btn btn-secondary', 'Anterior'); previous.type = 'button'; previous.disabled = state.page <= 1;
  const next = node('button', 'btn btn-secondary', 'Próxima'); next.type = 'button'; next.disabled = state.page >= totalPages;
  previous.addEventListener('click', () => { state.page -= 1; renderResults(); });
  next.addEventListener('click', () => { state.page += 1; renderResults(); });
  pagination.append(node('span', 'text-muted', `Página ${state.page} de ${totalPages} · ${filtered.length} registro(s)`), previous, next);
  card.append(cardHeader, wrap, pagination);
  host.replaceChildren(card);
}

function renderPage() {
  const filters = node('div', 'card audit-filter-panel');
  const filterHeader = node('div', 'audit-filter-header');
  const filterTitle = node('div'); filterTitle.append(node('h2', '', 'Filtros'), node('p', 'text-muted', 'Refine a rastreabilidade por origem, material ou período.'));
  const clear = node('button', 'btn btn-ghost', 'Limpar filtros'); clear.type = 'button';
  clear.addEventListener('click', () => {
    state.filters = { search: '', kind: '', projectId: '', action: '', entityType: '', from: '', to: '' };
    state.page = 1;
    renderPage();
  });
  filterHeader.append(filterTitle, clear);
  const filterGrid = node('div', 'audit-filter-grid');
  filterGrid.append(
    filterField('Pesquisar', 'search'),
    filterField('Tipo', 'kind', ['AUDIT', 'MOVEMENT']),
    filterField('Projeto', 'projectId', unique(state.rows.map((row) => row.projectId))),
    filterField('Ação', 'action', unique(state.rows.map((row) => row.action))),
    filterField('Entidade', 'entityType', unique(state.rows.map((row) => row.entityType))),
    filterField('De', 'from', null, 'date'),
    filterField('Até', 'to', null, 'date'),
  );
  filters.append(filterHeader, filterGrid);
  const kpis = node('div', 'kpi-grid audit-kpi-grid'); kpis.dataset.auditKpis = '';
  const results = node('div'); results.dataset.auditResults = '';
  state.container.replaceChildren(filters, kpis, results);
  renderResults();
}

export async function refreshAuditPage() {
  if (!state.container) return;
  const [events, movements] = await Promise.all([
    state.dependencies.listAuditEvents?.() || [],
    state.dependencies.listStockMovements?.() || [],
  ]);
  state.rows = buildAuditHistoryRows(events, movements);
  state.page = 1;
  renderPage();
}

export function exportAuditPage() {
  const rows = filterAuditHistoryRows(state.rows, state.filters);
  if (!rows.length) {
    state.dependencies.showToast?.('Não há registros de auditoria para exportar.', 'warning');
    return false;
  }
  const columns = ['timestamp', 'kind', 'action', 'projectId', 'entityType', 'entityId', 'inventoryItemId', 'sourceDocumentType', 'sourceDocumentId', 'previousStatus', 'nextStatus', 'userName', 'reason'];
  downloadCsv(buildCsv(rows, columns), `audit-history-${new Date().toISOString().slice(0, 10)}.csv`);
  return true;
}

export async function initAuditPage(container, dependencies = {}) {
  state.container = container;
  state.dependencies = { ...dependencies };
  if (!state.bound) {
    document.getElementById('btn-refresh-audit-log')?.addEventListener('click', () => void refreshAuditPage());
    document.getElementById('btn-export-audit-log')?.addEventListener('click', exportAuditPage);
    state.bound = true;
  }
  await refreshAuditPage();
}
