import { buildOperationalReadiness, searchOperationalRecords } from '../core/operationalReadiness.js';
import { t } from '../i18n/index.js';

function node(tag, className = '', value = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== '') element.textContent = String(value);
  return element;
}

function text(value, fallback = '') {
  const result = value == null ? '' : String(value).trim();
  return result || fallback;
}

function icon(name) { return node('span', 'material-symbols-outlined', name); }
function percent(value) { return `${Math.round(Math.max(0, Number(value) || 0) * 100)}%`; }

function contextHeader(project, activeProjectName) {
  const header = node('header', 'dashboard-readiness-header');
  const copy = node('div');
  copy.append(node('p', 'eyebrow', 'Material Readiness'), node('h1', '', 'CAN WE FABRICATE TODAY?'));
  copy.append(node('p', 'text-muted', activeProjectName ? `${activeProjectName} · posição operacional por TAG` : 'Todos os projetos · selecione um projeto ativo para uma decisão operacional precisa'));
  header.append(copy);
  if (project) {
    const scope = node('div', 'dashboard-scope-badge');
    scope.append(icon('business_center'), node('span', '', [project.shortCode || project.code, project.client].filter(Boolean).join(' · ') || project.name));
    header.append(scope);
  }
  return header;
}

function searchBox(data, options) {
  const section = node('section', 'dashboard-universal-search');
  const label = node('label', 'dashboard-search-field');
  label.append(icon('search'));
  const input = node('input');
  input.type = 'search';
  input.placeholder = 'Search anything: TAG, IDENT CODE, Traceability, Heat, PO, MTO, Workpack, Coupon, Cutting Sheet...';
  input.setAttribute('aria-label', 'Search anything');
  label.append(input);
  const results = node('div', 'dashboard-search-results hidden');
  input.addEventListener('input', () => {
    const matches = searchOperationalRecords(data, input.value, 8);
    results.replaceChildren();
    results.classList.toggle('hidden', input.value.trim().length < 2);
    if (input.value.trim().length < 2) return;
    if (!matches.length) { results.append(node('p', 'text-muted', 'Nenhum registro rastreável encontrado.')); return; }
    matches.forEach((match) => {
      const button = node('button', 'dashboard-search-result');
      button.type = 'button';
      const type = node('span', 'dashboard-search-type', match.type);
      const copy = node('span'); copy.append(node('strong', '', match.title), node('small', 'text-muted', match.subtitle || match.entityId));
      button.append(type, copy, icon('arrow_forward'));
      button.addEventListener('click', () => match.type === 'Equipment'
        ? options.onOpenEquipment?.(match.entityId, match.tag)
        : options.onNavigate?.(match.phase, match));
      results.append(button);
    });
  });
  section.append(label, results);
  return section;
}

function kpiCard(label, value, caption, tone = '', iconName = 'monitoring') {
  const card = node('article', `dashboard-readiness-kpi ${tone}`.trim());
  const heading = node('div', 'dashboard-readiness-kpi-heading'); heading.append(icon(iconName), node('span', '', label));
  card.append(heading, node('strong', '', value), node('small', 'text-muted', caption));
  return card;
}

function readinessKpis(readiness) {
  const grid = node('div', 'dashboard-readiness-kpis');
  grid.append(
    kpiCard('Material Availability', percent(readiness.materialAvailability), 'Cobertura da demanda MTO', readiness.materialAvailability >= 0.999999 ? 'positive' : 'attention', 'inventory_2'),
    kpiCard('Critical Items', readiness.criticalItems, 'Sem cobertura suficiente', readiness.criticalItems ? 'critical' : 'positive', 'error'),
    kpiCard('PO Delayed', readiness.delayedPurchaseOrders, 'Itens com entrega vencida', readiness.delayedPurchaseOrders ? 'attention' : '', 'local_shipping'),
    kpiCard('Ready Workpacks', readiness.readyWorkpacks, 'Workpacks ligados a TAG pronta', 'positive', 'workspaces'),
    kpiCard('Ready Equipment', readiness.readyEquipments, 'TAGs prontas para fabricar', 'positive', 'precision_manufacturing'),
    kpiCard('Blocked Equipment', readiness.blockedEquipments, 'TAGs com item crítico', readiness.blockedEquipments ? 'critical' : '', 'block'),
  );
  return grid;
}

const STATUS_LABELS = Object.freeze({ READY: 'Ready', PARTIAL: 'Partial', BLOCKED: 'Blocked', NOT_PLANNED: 'Not planned' });

function equipmentReadinessTable(readiness, options) {
  const section = node('section', 'dashboard-panel dashboard-equipment-readiness');
  const header = node('div', 'card-header');
  const copy = node('div'); copy.append(node('h2', '', 'Equipment Readiness'), node('p', 'text-muted', 'Decisão por TAG física. Abra uma linha para acessar o contexto operacional do equipamento.'));
  header.append(copy);
  const wrap = node('div', 'table-wrap');
  const table = node('table', 'data-table');
  const thead = node('thead'); const heading = node('tr');
  ['TAG', 'Equipment', 'Availability', 'Demand', 'Critical items', 'Status'].forEach((label) => heading.append(node('th', '', label)));
  thead.append(heading);
  const tbody = node('tbody');
  readiness.equipmentRows.forEach((item) => {
    const row = node('tr', 'dashboard-equipment-row'); row.tabIndex = 0;
    const status = node('span', `readiness-status status-${item.status.toLowerCase()}`); status.append(node('i'), node('span', '', t(STATUS_LABELS[item.status] || item.status)));
    row.append(node('td', 'dashboard-tag-cell', item.tag), node('td', '', item.equipmentName || '—'), node('td', 'numeric', percent(item.availability)), node('td', 'numeric', item.demandItems), node('td', 'numeric', item.criticalItems), node('td'));
    row.lastChild.append(status);
    const open = () => options.onOpenEquipment?.(item.equipmentId, item.tag);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    tbody.append(row);
  });
  if (!readiness.equipmentRows.length) {
    const row = node('tr'); const empty = node('td', 'empty-row', t('No TAG with MTO demand is available for evaluation.')); empty.colSpan = 6; row.append(empty); tbody.append(row);
  }
  table.append(thead, tbody); wrap.append(table); section.append(header, wrap); return section;
}

function loadingState() { return node('p', 'text-muted dashboard-loading', 'Calculando disponibilidade por TAG...'); }
function errorState() { return node('p', 'text-muted dashboard-error', 'Não foi possível calcular a prontidão operacional.'); }

export async function renderHomeDashboard(container, options = {}) {
  container.replaceChildren(loadingState());
  try {
    const data = await options.loadDashboardData?.() || {};
    const activeProjectName = text(options.activeProjectName);
    const project = (data.projects || []).find((item) => text(item?.name || item?.project || item?.projectName) === activeProjectName);
    const readiness = buildOperationalReadiness(data);
    container.replaceChildren(
      contextHeader(project, activeProjectName),
      searchBox(data, options),
      readinessKpis(readiness),
      equipmentReadinessTable(readiness, options),
    );
  } catch (error) {
    console.error(error);
    container.replaceChildren(errorState());
  }
}
