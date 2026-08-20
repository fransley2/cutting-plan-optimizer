import { OFFCUT_STATUS } from '../data/offcuts.js';
import { RMV_STATUS } from '../data/returnMaterialVouchers.js';
import { projectDisplayName } from '../core/projectIdentity.js';
import { offcutSourceKey } from '../workflows/processOffcutDisposition.js';
import { RETURN_OFFCUT_MODES } from '../workflows/returnOffcutsToStock.js';
import { offcutClassificationLabel } from '../core/offcutClassification.js';
import { openModal, closeModal } from './modal.js';

const state = {
  container: null,
  options: {},
  offcuts: [],
  rmvs: [],
  projects: [],
  selectedKeys: new Set(),
  activeTab: 'register',
  search: '',
  projectFilter: '',
  statusFilter: '',
  destination: 'Estoque',
};

function node(tag, className = '', value = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== '') element.textContent = String(value);
  return element;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function firstValue(item = {}, fields = []) {
  for (const field of fields) {
    if (item[field] != null && item[field] !== '') return item[field];
  }
  return '';
}

function formatDate(value) {
  const raw = text(value);
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function isProcessed(offcut = {}) {
  return [OFFCUT_STATUS.PENDING_RMV, OFFCUT_STATUS.RETURNED_TO_STOCK, OFFCUT_STATUS.SCRAP, OFFCUT_STATUS.CANCELLED]
    .includes(offcut.status);
}

function isActionable(offcut = {}) {
  return offcut.status === OFFCUT_STATUS.REUSABLE
    && offcutClassificationLabel(firstValue(offcut, ['length', 'lengthMm', 'remaining'])) === 'Reaproveitável';
}

function classification(offcut = {}) {
  return offcutClassificationLabel(firstValue(offcut, ['length', 'lengthMm', 'remaining'])) || '—';
}

function selectedOffcuts() {
  return state.offcuts.filter((offcut) => isActionable(offcut) && state.selectedKeys.has(offcutSourceKey(offcut)));
}

function renderKpis() {
  const reusable = state.offcuts.filter((item) => classification(item) === 'Reaproveitável');
  const scrap = state.offcuts.filter((item) => classification(item) === 'Scrap');
  const metrics = [
    ['Total RMVs', state.rmvs.length, 'assignment_return'],
    ['Draft', state.rmvs.filter((item) => item.status === RMV_STATUS.DRAFT).length, 'edit_note'],
    ['Aguardando recebimento', state.rmvs.filter((item) => [RMV_STATUS.ISSUED, RMV_STATUS.PARTIALLY_RECEIVED].includes(item.status)).length, 'pending_actions'],
    ['Retornados', state.rmvs.filter((item) => item.status === RMV_STATUS.RETURNED).length, 'warehouse'],
    ['Sobras reaproveitáveis', reusable.length, 'content_cut'],
    ['Scrap', scrap.length, 'delete'],
  ];
  const grid = node('div', 'kpi-grid return-material-kpis');
  metrics.forEach(([label, value, icon]) => {
    const card = node('div', 'kpi-card');
    card.append(
      node('div', 'kpi-label', label),
      node('div', 'kpi-value', value),
      node('span', 'material-symbols-outlined return-material-kpi-icon', icon),
    );
    grid.append(card);
  });
  return grid;
}

function projectName(rmv) {
  return rmv.metadata?.project || projectDisplayName(state.projects, rmv.projectId) || rmv.projectId || '—';
}

function routeText(rmv) {
  return [rmv.origin || rmv.metadata?.origin, rmv.destination || rmv.metadata?.destination]
    .map(text).filter(Boolean).join(' → ') || '—';
}

function matchesSearch(rmv) {
  const haystack = [
    rmv.number, rmv.date, projectName(rmv), rmv.projectId, rmv.workpackId,
    rmv.origin, rmv.destination, rmv.status, rmv.drawingReference,
    rmv.metadata?.workpack, rmv.metadata?.workpackNumber,
    rmv.metadata?.materialCouponNumber, rmv.metadata?.cuttingSheetNumber,
  ]
    .join(' ').toLowerCase();
  return (!state.search || haystack.includes(state.search.toLowerCase()))
    && (!state.projectFilter || text(rmv.projectId) === state.projectFilter)
    && (!state.statusFilter || text(rmv.status) === state.statusFilter);
}

function filterSelect(labelText, value, options, onChange) {
  const label = node('label', 'field');
  label.append(node('span', '', labelText));
  const select = node('select', 'input');
  select.append(new Option(`Todos os ${labelText.toLowerCase()}`, ''));
  options.forEach(([optionValue, optionLabel]) => select.append(new Option(optionLabel, optionValue)));
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  label.append(select);
  return label;
}

function statusBadge(status) {
  const labels = {
    draft: 'Aguardando corte', reusable: 'Disponível', pending_rmv: 'Em RMV',
    returned_to_stock: 'Retornada ao estoque', scrap: 'Scrap', cancelled: 'Cancelada',
  };
  return node('span', `return-material-status status-${text(status).replaceAll('_', '-')}`, labels[status] || text(status || 'unknown').replaceAll('_', ' '));
}

function renderRegister() {
  const panel = node('section', 'return-material-panel');
  panel.id = 'return-material-register-panel';
  panel.setAttribute('role', 'tabpanel');
  const header = node('div', 'card-header return-material-panel-header');
  const heading = node('div');
  heading.append(node('p', 'eyebrow', 'Document Register'), node('h2', '', 'Return Material Vouchers'));
  const count = node('strong');
  header.append(heading, count);

  const filters = node('div', 'filter-row return-material-filters return-material-register-filters');
  const searchField = node('label', 'field');
  searchField.append(node('span', '', 'Busca'));
  const search = node('input', 'input');
  search.id = 'return-material-search';
  search.type = 'search';
  search.value = state.search;
  search.placeholder = 'Buscar por RMV, projeto ou data';
  search.setAttribute('aria-label', 'Buscar Return Material Vouchers');
  search.addEventListener('input', () => {
    const caret = search.selectionStart;
    state.search = search.value.trim();
    render();
    const nextSearch = document.getElementById('return-material-search');
    nextSearch?.focus();
    if (caret != null) nextSearch?.setSelectionRange(caret, caret);
  });
  searchField.append(search);
  const projectOptions = state.projects.map((project) => [text(project.id), projectDisplayName(state.projects, project.id) || text(project.name || project.id)]);
  const statusOptions = [...new Set(state.rmvs.map((rmv) => text(rmv.status)).filter(Boolean))]
    .sort().map((status) => [status, status.replaceAll('_', ' ')]);
  filters.append(
    searchField,
    filterSelect('Projetos', state.projectFilter, projectOptions, (value) => { state.projectFilter = value; render(); }),
    filterSelect('Status', state.statusFilter, statusOptions, (value) => { state.statusFilter = value; render(); }),
  );

  const records = state.rmvs.filter(matchesSearch);
  count.textContent = `${records.length} de ${state.rmvs.length} RMV(s)`;
  const wrap = node('div', 'table-wrap');
  const table = node('table', 'data-table rmv-history-table');
  const thead = node('thead');
  const headerRow = node('tr');
  ['RMV Nº', 'Data', 'Projeto', 'Workpack', 'Material Coupon', 'Cutting Sheet', 'Origem → Destino', 'Status', 'Itens', 'Ações']
    .forEach((label) => headerRow.append(node('th', '', label)));
  thead.append(headerRow);
  const tbody = node('tbody');
  records.forEach((rmv) => {
    const row = node('tr');
    const values = [
      rmv.number || '—',
      formatDate(rmv.date || rmv.issuedAt || rmv.createdAt),
      projectName(rmv),
      rmv.metadata?.workpackNumber || rmv.metadata?.workpack || rmv.workpackId || '—',
      rmv.metadata?.materialCouponNumber || rmv.materialCouponId || '—',
      rmv.metadata?.cuttingSheetNumber || rmv.cuttingSheetId || '—',
      routeText(rmv),
    ];
    values.forEach((value) => row.append(node('td', '', value)));
    const statusCell = node('td'); statusCell.append(statusBadge(rmv.status)); row.append(statusCell);
    row.append(node('td', 'mc-numeric-cell', rmv.returnedItems?.length || 0));
    const actions = node('td', 'row-actions');
    const print = node('button', 'icon-action');
    print.type = 'button';
    print.title = 'Visualizar / reimprimir RMV';
    print.setAttribute('aria-label', `Visualizar ou reimprimir ${rmv.number || 'RMV'}`);
    print.append(node('span', 'material-symbols-outlined', 'print'));
    print.addEventListener('click', () => state.options.onPrint?.(rmv));
    actions.append(print); row.append(actions); tbody.append(row);
  });
  if (!records.length) {
    const row = node('tr'); const empty = node('td', 'text-muted', 'Nenhum RMV encontrado.');
    empty.colSpan = 10; row.append(empty); tbody.append(row);
  }
  table.append(thead, tbody); wrap.append(table); panel.append(header, filters, wrap);
  return panel;
}

function appendCell(row, value) {
  row.append(node('td', '', text(value) || '—'));
}

function renderOffcutTable() {
  const wrap = node('div', 'table-wrap');
  const table = node('table', 'data-table offcuts-table');
  const thead = node('thead'); const header = node('tr'); const selectCell = node('th');
  const selectable = state.offcuts.filter(isActionable);
  const selectAll = node('input'); selectAll.type = 'checkbox'; selectAll.disabled = !selectable.length;
  selectAll.setAttribute('aria-label', 'Selecionar todos os retalhos disponíveis');
  selectAll.checked = selectable.length > 0 && selectable.every((item) => state.selectedKeys.has(offcutSourceKey(item)));
  selectAll.addEventListener('change', () => {
    selectable.forEach((item) => selectAll.checked ? state.selectedKeys.add(offcutSourceKey(item)) : state.selectedKeys.delete(offcutSourceKey(item)));
    render();
  });
  selectCell.append(selectAll); header.append(selectCell);
  ['Rastreabilidade de origem', 'Rastreabilidade da sobra', 'Material', 'Heat', 'Comprimento', 'Classificação', 'Status', 'Disposição']
    .forEach((label) => header.append(node('th', '', label)));
  thead.append(header);
  const tbody = node('tbody');
  state.offcuts.forEach((offcut) => {
    const row = node('tr'); const selection = node('td'); const checkbox = node('input'); const key = offcutSourceKey(offcut);
    checkbox.type = 'checkbox'; checkbox.disabled = !isActionable(offcut); checkbox.checked = state.selectedKeys.has(key);
    checkbox.setAttribute('aria-label', `Selecionar retalho ${key || offcut.id}`);
    checkbox.addEventListener('change', () => { checkbox.checked ? state.selectedKeys.add(key) : state.selectedKeys.delete(key); render(); });
    selection.append(checkbox); row.append(selection);
    appendCell(row, firstValue(offcut, ['parentTrace', 'parentTraceability']) || offcut.metadata?.parentTrace);
    appendCell(row, offcut.status === OFFCUT_STATUS.DRAFT ? 'Será gerado no retorno' : offcut.traceability);
    appendCell(row, firstValue(offcut, ['material', 'materialGrade']));
    appendCell(row, firstValue(offcut, ['heat', 'heatNo']));
    appendCell(row, `${Number(firstValue(offcut, ['length', 'lengthMm', 'remaining']) || 0).toLocaleString('pt-BR')} mm`);
    appendCell(row, classification(offcut));
    const statusCell = node('td'); statusCell.append(statusBadge(offcut.status || OFFCUT_STATUS.DRAFT)); row.append(statusCell);
    appendCell(row, offcut.disposition || 'Pendente');
    tbody.append(row);
  });
  if (!state.offcuts.length) {
    const row = node('tr'); const empty = node('td', 'text-muted', 'Nenhum retalho persistido no IndexedDB.');
    empty.colSpan = 9; row.append(empty); tbody.append(row);
  }
  table.append(thead, tbody); wrap.append(table); return wrap;
}

function confirmDisposition(mode) {
  const offcuts = selectedOffcuts();
  if (!offcuts.length) return;
  const body = node('div');
  body.append(node('p', '', mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK
    ? `${offcuts.length} retalho(s) serão criados como itens disponíveis no Inventory.`
    : `${offcuts.length} retalho(s) serão marcados como scrap e não entrarão no Inventory.`));
  let reason = null;
  if (mode === RETURN_OFFCUT_MODES.SCRAP) {
    const label = node('label', 'field'); label.append(node('span', '', 'Motivo do scrap'));
    reason = node('textarea', 'input'); reason.rows = 3; reason.value = 'Retalho sem aproveitamento operacional';
    label.append(reason); body.append(label);
  }
  openModal({
    title: mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK ? 'Retornar retalhos ao estoque' : 'Marcar retalhos como scrap',
    body,
    buttons: [{ label: 'Cancelar' }, { label: 'Confirmar', variant: mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK ? 'btn-primary' : 'btn-critical', closeOnClick: false, onClick: async () => {
      try {
        await state.options.onProcess?.(mode, offcuts.map((item) => reason ? { ...item, scrapReason: reason.value.trim() } : item));
        state.selectedKeys.clear(); closeModal(); await refresh();
      } catch (error) { state.options.showToast?.(error?.message || 'Não foi possível processar os retalhos.', 'error'); }
    } }],
  });
}

async function createRmv() {
  const offcuts = selectedOffcuts();
  if (!offcuts.length) return;
  try {
    await state.options.onCreateRmv?.(offcuts, { origin: 'Offcut', destination: state.destination });
    state.selectedKeys.clear();
    await refresh();
  } catch (error) { state.options.showToast?.(error?.message || 'Não foi possível criar o RMV.', 'error'); }
}

function actionButton(label, icon, className, handler, disabled) {
  const button = node('button', className); button.type = 'button'; button.disabled = disabled;
  button.append(node('span', 'material-symbols-outlined', icon), node('span', '', label));
  button.addEventListener('click', handler); return button;
}

function renderEditor() {
  const panel = node('section', 'return-material-panel');
  panel.id = 'return-material-editor-panel'; panel.setAttribute('role', 'tabpanel');
  const selectedCount = selectedOffcuts().length;
  const header = node('div', 'return-material-editor-header');
  const copy = node('div'); copy.append(
    node('p', 'eyebrow', 'Sobras de material'),
    node('h2', '', 'Reaproveitáveis e scrap'),
    node('p', 'text-muted', 'Sobras com 500 mm ou mais podem retornar ao estoque ou seguir por RMV. Abaixo de 500 mm são classificadas como scrap.'),
  );
  const fields = node('div', 'return-material-document-fields');
  const originLabel = node('label', 'field'); originLabel.append(node('span', '', 'Origem'));
  const origin = node('input', 'input'); origin.value = 'Offcut'; origin.readOnly = true; originLabel.append(origin);
  const destinationLabel = node('label', 'field'); destinationLabel.append(node('span', '', 'Destino'));
  const destination = node('select', 'input'); destination.append(new Option('Estoque', 'Estoque'), new Option('Scrap', 'Scrap'));
  destination.value = state.destination; destination.addEventListener('change', () => { state.destination = destination.value; });
  destinationLabel.append(destination); fields.append(originLabel, destinationLabel); header.append(copy, fields);
  const actions = node('div', 'return-material-actions');
  actions.append(
    node('span', 'text-muted', `${selectedCount} retalho(s) selecionado(s)`),
    actionButton('Retornar ao Estoque', 'keyboard_return', 'btn btn-secondary', () => confirmDisposition(RETURN_OFFCUT_MODES.OPERATIONAL_STOCK), !selectedCount),
    actionButton('Marcar Scrap', 'delete', 'btn btn-secondary', () => confirmDisposition(RETURN_OFFCUT_MODES.SCRAP), !selectedCount),
    actionButton('Criar RMV', 'assignment_return', 'btn btn-primary', createRmv, !selectedCount),
  );
  panel.append(header, actions, renderOffcutTable()); return panel;
}

function renderTabs() {
  const tabs = node('div', 'return-material-tabs'); tabs.setAttribute('role', 'tablist');
  [['register', 'assignment', 'Registro / Gerenciador'], ['editor', 'edit_document', 'Editor']].forEach(([tab, icon, label]) => {
    const button = node('button', `return-material-tab${state.activeTab === tab ? ' active' : ''}`); button.type = 'button';
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(state.activeTab === tab));
    button.append(node('span', 'material-symbols-outlined', icon), node('span', '', label));
    button.addEventListener('click', () => { state.activeTab = tab; render(); }); tabs.append(button);
  });
  const refreshButton = actionButton('Atualizar', 'refresh', 'btn btn-secondary return-material-refresh', refresh, false);
  tabs.append(refreshButton); return tabs;
}

function render() {
  if (!state.container) return;
  state.container.replaceChildren(renderKpis(), renderTabs(), state.activeTab === 'register' ? renderRegister() : renderEditor());
}

async function refresh() {
  const [offcuts, rmvs, projects] = await Promise.all([
    state.options.listOffcuts?.() || [],
    state.options.listReturnMaterialVouchers?.() || [],
    state.options.listProjects?.() || [],
  ]);
  state.offcuts = Array.isArray(offcuts) ? offcuts : [];
  state.rmvs = Array.isArray(rmvs) ? rmvs : [];
  state.projects = Array.isArray(projects) ? projects : [];
  const validKeys = new Set(state.offcuts.filter(isActionable).map(offcutSourceKey));
  state.selectedKeys = new Set([...state.selectedKeys].filter((key) => validKeys.has(key)));
  render();
}

export async function initReturnMaterialPage(container, options = {}) {
  state.container = container;
  state.options = { ...options };
  await refresh();
}
