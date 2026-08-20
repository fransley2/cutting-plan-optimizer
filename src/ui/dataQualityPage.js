import { buildCsv, downloadCsv } from '../data/csvExport.js';

const ISSUE_LABELS = Object.freeze({
  UNRESOLVED_PROJECT: 'Não resolvido',
  LEGACY_PROJECT_ALIAS: 'Alias legado',
  PROJECT_CONFLICT: 'Conflito',
  MISSING_CANONICAL_ID: 'ID ausente',
  BROKEN_REFERENCE: 'Referência quebrada',
  LEGACY_RELATION: 'Relação legada',
  AMBIGUOUS_SNAPSHOT: 'Snapshot ambíguo',
  UNRESOLVED_SNAPSHOT: 'Snapshot não resolvido',
});

const DOMAIN_LABELS = Object.freeze({ PROJECT: 'Projetos', ENTITY_REFERENCE: 'Entidades' });

const state = {
  container: null,
  dependencies: {},
  issues: [],
  filters: { search: '', domain: '', storeName: '', issueType: '' },
  bound: false,
};

function node(tag, className = '', value = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== '') element.textContent = String(value);
  return element;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function filterIssues(issues, filters = {}) {
  const query = String(filters.search || '').trim().toLocaleLowerCase();
  return issues.filter((item) => {
    if (filters.domain && item.domain !== filters.domain) return false;
    if (filters.storeName && item.storeName !== filters.storeName) return false;
    if (filters.issueType && item.issueType !== filters.issueType) return false;
    if (!query) return true;
    return [item.domain, item.storeName, item.recordId, item.recordLabel, item.referenceField,
      item.reference, item.targetType, item.suggestedReferenceId, item.suggestedProjectId, item.detail]
      .join(' ').toLocaleLowerCase().includes(query);
  });
}

function summarizeIssues(issues) {
  return {
    total: issues.length,
    broken: issues.filter((item) => item.issueType === 'BROKEN_REFERENCE' || item.issueType === 'PROJECT_CONFLICT').length,
    missingIds: issues.filter((item) => item.issueType === 'MISSING_CANONICAL_ID').length,
    review: issues.filter((item) => ['UNRESOLVED_PROJECT', 'UNRESOLVED_SNAPSHOT', 'AMBIGUOUS_SNAPSHOT'].includes(item.issueType)).length,
    legacy: issues.filter((item) => ['LEGACY_PROJECT_ALIAS', 'LEGACY_RELATION'].includes(item.issueType)).length,
  };
}

function kpi(label, value, caption) {
  const card = node('div', 'kpi-card');
  card.append(node('div', 'kpi-label', label), node('div', 'kpi-value', value), node('div', 'text-muted', caption));
  return card;
}

function selectField(label, key, values, labels = {}) {
  const field = node('label', 'data-quality-filter-field');
  field.append(node('span', '', label));
  const select = node('select', 'input');
  const all = node('option', '', 'Todos'); all.value = ''; select.append(all);
  values.forEach((value) => { const option = node('option', '', labels[value] || value); option.value = value; select.append(option); });
  select.value = state.filters[key];
  select.addEventListener('change', () => { state.filters[key] = select.value; renderResults(); });
  field.append(select);
  return field;
}

function renderFilters() {
  const card = node('section', 'card data-quality-filters');
  const heading = node('div', 'data-quality-filter-heading');
  const title = node('div'); title.append(node('h2', '', 'Filtros'), node('p', 'text-muted', 'Localize referências por store, registro ou valor atual.'));
  const clear = node('button', 'btn btn-ghost', 'Limpar filtros'); clear.type = 'button';
  clear.addEventListener('click', () => { state.filters = { search: '', domain: '', storeName: '', issueType: '' }; renderPage(); });
  heading.append(title, clear);
  const grid = node('div', 'data-quality-filter-grid');
  const searchField = node('label', 'data-quality-filter-field data-quality-filter-search');
  searchField.append(node('span', '', 'Pesquisar'));
  const search = node('input', 'input'); search.type = 'search'; search.placeholder = 'Store, registro, projeto ou referência...'; search.value = state.filters.search;
  search.addEventListener('input', () => { state.filters.search = search.value; renderResults(); });
  searchField.append(search);
  grid.append(
    searchField,
    selectField('Domínio', 'domain', unique(state.issues.map((item) => item.domain)), DOMAIN_LABELS),
    selectField('Store', 'storeName', unique(state.issues.map((item) => item.storeName))),
    selectField('Tipo de inconsistência', 'issueType', unique(state.issues.map((item) => item.issueType)), ISSUE_LABELS),
  );
  card.append(heading, grid);
  return card;
}

function issueBadge(issueType) {
  return node('span', `data-quality-badge data-quality-${issueType.toLocaleLowerCase()}`, ISSUE_LABELS[issueType] || issueType);
}

function stackedCell(primary, secondary = '') {
  const cell = node('td', 'data-quality-stacked-cell');
  cell.append(node('strong', '', primary || '—'));
  if (secondary) cell.append(node('small', 'text-muted', secondary));
  return cell;
}

function renderResults() {
  const host = state.container?.querySelector('[data-quality-results]');
  const kpis = state.container?.querySelector('[data-quality-kpis]');
  if (!host || !kpis) return;
  const filtered = filterIssues(state.issues, state.filters);
  const summary = summarizeIssues(filtered);
  kpis.replaceChildren(
    kpi('Pendências', summary.total, 'Referências filtradas'),
    kpi('Referências quebradas', summary.broken, 'IDs que apontam para registros inexistentes'),
    kpi('IDs ausentes', summary.missingIds, 'Snapshots que precisam de vínculo canônico'),
    kpi('Revisão manual', summary.review, `${summary.legacy} alias/relação(ões) legada(s)`),
  );

  const card = node('section', 'card data-quality-results-card');
  const header = node('div', 'data-quality-results-header');
  const heading = node('div'); heading.append(node('h2', '', 'Referências e IDs'), node('p', 'text-muted', `${filtered.length} inconsistência(s) encontrada(s)`)); header.append(heading);
  const wrap = node('div', 'table-wrap data-quality-table-wrap');
  const table = node('table', 'data-table data-quality-table');
  const thead = node('thead'); const headerRow = node('tr');
  ['Situação', 'Domínio / Store', 'Registro', 'Campo / Referência atual', 'Destino / ID sugerido', 'Diagnóstico'].forEach((label) => headerRow.append(node('th', '', label))); thead.append(headerRow);
  const tbody = node('tbody');
  filtered.forEach((item) => {
    const row = node('tr'); const status = node('td'); status.append(issueBadge(item.issueType));
    row.append(
      status,
      stackedCell(DOMAIN_LABELS[item.domain] || item.domain, item.storeName),
      stackedCell(item.recordLabel, item.recordId),
      stackedCell(item.referenceField, item.reference || '—'),
      stackedCell(item.targetType, item.suggestedReferenceId || item.suggestedProjectId || '—'),
      node('td', '', item.detail),
    );
    tbody.append(row);
  });
  if (!filtered.length) { const row = node('tr'); const empty = node('td', 'empty-row', 'Nenhuma inconsistência encontrada para os filtros atuais.'); empty.colSpan = 6; row.append(empty); tbody.append(row); }
  table.append(thead, tbody); wrap.append(table); card.append(header, wrap); host.replaceChildren(card);
}

function renderPage() {
  const notice = node('section', 'card data-quality-notice');
  notice.append(node('span', 'material-symbols-outlined', 'verified_user'));
  const copy = node('div'); copy.append(node('strong', '', 'IDs são vínculos; textos são snapshots'), node('p', 'text-muted', 'O diagnóstico verifica Projects, Equipment, Drawings, MTO, Workpacks, Procurement e Inventory. A correção automática continua restrita a aliases exatos de Projeto; nenhuma referência de negócio é inventada.'));
  notice.append(copy);
  const kpis = node('div', 'kpi-grid data-quality-kpis'); kpis.dataset.qualityKpis = '';
  const results = node('div'); results.dataset.qualityResults = '';
  state.container.replaceChildren(notice, renderFilters(), kpis, results);
  renderResults();
}

export async function refreshDataQualityPage() {
  if (!state.container) return;
  state.issues = await state.dependencies.loadIssues?.() || [];
  renderPage();
}

export function exportDataQualityPage() {
  const rows = filterIssues(state.issues, state.filters);
  if (!rows.length) { state.dependencies.showToast?.('Não há inconsistências para exportar.', 'warning'); return false; }
  const columns = ['domain', 'issueType', 'storeName', 'recordId', 'recordLabel', 'referenceField', 'reference', 'targetType', 'suggestedReferenceId', 'detail'];
  downloadCsv(buildCsv(rows, columns), `data-quality-${new Date().toISOString().slice(0, 10)}.csv`);
  return true;
}

async function runAutomaticCorrection() {
  const button = document.getElementById('btn-fix-project-aliases');
  if (button) button.disabled = true;
  try {
    const result = await state.dependencies.migrateAliases?.();
    await refreshDataQualityPage();
    if (result?.migratedCount) state.dependencies.showToast?.(`${result.migratedCount} referência(s) migrada(s) para Project ID.`, 'success');
    else state.dependencies.showToast?.('Nenhum alias elegível para correção automática.', 'info');
  } catch (error) {
    console.error(error);
    state.dependencies.showToast?.('Não foi possível corrigir os aliases de Projeto.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

export async function initDataQualityPage(container, dependencies = {}) {
  state.container = container;
  state.dependencies = { ...dependencies };
  if (!state.bound) {
    document.getElementById('btn-refresh-data-quality')?.addEventListener('click', () => void refreshDataQualityPage());
    document.getElementById('btn-fix-project-aliases')?.addEventListener('click', () => void runAutomaticCorrection());
    document.getElementById('btn-export-data-quality')?.addEventListener('click', exportDataQualityPage);
    state.bound = true;
  }
  await refreshDataQualityPage();
}
