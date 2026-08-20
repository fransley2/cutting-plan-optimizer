import { buildMaterialDeliveryTimeline, buildMaterialUtilizationSummary, buildPoItemStatusBreakdown, calculateReportsDashboard, reportEquipmentTagOptions } from '../core/reportCalculations.js';
import { buildEquipmentReadinessByProject, buildMaterialBottlenecks } from '../core/operationalReadiness.js';
import { buildPpcReports } from '../core/ppcReportCalculations.js';

const TAB_DEFINITIONS = Object.freeze([
  { id: 'executive', label: 'Visão PPC', icon: 'monitoring' },
  { id: 'warehouse', label: 'Warehouse', icon: 'warehouse' },
  { id: 'fabrication', label: 'Fabricação', icon: 'precision_manufacturing' },
  { id: 'availability', label: 'Disponibilidade de Material', icon: 'inventory_2' },
  { id: 'receiving', label: 'Recebimento', icon: 'local_shipping' },
]);

const state = {
  container: null,
  options: {},
  rawData: null,
  report: null,
  scope: {},
  equipmentTagOptions: [],
  selectedEquipmentTag: '',
  calculationDate: '',
  planningHorizonDays: 28,
  activeTab: 'executive',
  charts: [],
  sorting: new Map(),
  equipmentReadinessByProject: [],
  materialBottlenecks: { criticalEquipmentRows: [], bottlenecks: [] },
  deliveryGranularity: 'month',
  materialDeliveryTimeline: [],
  poItemStatusBreakdown: { totalItems: 0, buckets: [], inconsistencies: [] },
  materialUtilization: {},
};

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value) {
  return value == null ? '' : String(value);
}

function percentageValue(value) {
  const number = numberValue(value);
  return number >= 0 && number <= 1 ? number * 100 : number;
}

function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(numberValue(value));
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? textValue(value) : new Intl.DateTimeFormat('pt-BR').format(parsed);
}

const OPERATIONAL_STATUS_LABELS = Object.freeze({
  READY: 'Pronto',
  AT_RISK: 'Em risco',
  BLOCKED: 'Bloqueado',
  IN_PROGRESS: 'Em fabricação',
  NOT_PLANNED: 'Não planejado',
  DATA_ISSUE: 'Dado pendente',
  COMPLETE: 'Concluído',
  MATERIAL_PENDING: 'Material pendente',
  MATERIAL_RESERVED: 'Material reservado',
  READY_FOR_NESTING: 'Pronto para nesting',
  IN_NESTING: 'Em nesting',
  NESTED: 'Nesting concluído',
  RELEASED_FOR_CUTTING: 'Liberado para corte',
  IN_FABRICATION: 'Em fabricação',
  COMPLETED: 'Concluído',
  PLANNED: 'Planejado',
  DRAFT: 'Rascunho',
  MTO_PENDING: 'MTO pendente',
  ON_HOLD: 'HOLD',
  ACCEPTED: 'Aceito',
  PENDING: 'Pendente',
  HOLD: 'HOLD',
  REJECTED: 'Rejeitado',
  AVAILABLE: 'Disponível',
  RESERVED: 'Reservado',
});

function formatValue(value, format = '', unit = '') {
  const normalizedFormat = textValue(format).toLowerCase();
  if (normalizedFormat === 'completionstatus') return ({ NOT_STARTED: 'Não iniciado', PARTIAL: 'Parcial', COMPLETE: 'Completo' })[value] || '—';
  if (normalizedFormat === 'overduestatus') return value ? 'Atrasado' : 'No prazo';
  if (normalizedFormat === 'operationalstatus') return OPERATIONAL_STATUS_LABELS[textValue(value).toUpperCase()] || textValue(value) || '—';
  if (normalizedFormat === 'percentnullable') return value == null || value === '' ? '—' : `${formatNumber(percentageValue(value), 1)}%`;
  if (normalizedFormat.includes('percent') || unit === '%') return `${formatNumber(percentageValue(value), 1)}%`;
  if (normalizedFormat.includes('date')) return formatDate(value);
  if (normalizedFormat.includes('kg') || unit.toLowerCase() === 'kg') return `${formatNumber(value, 1)} kg`;
  if (normalizedFormat.includes('number') || normalizedFormat.includes('integer') || typeof value === 'number') {
    const formatted = formatNumber(value, normalizedFormat.includes('integer') ? 0 : 1);
    return unit ? `${formatted} ${unit}` : formatted;
  }
  return textValue(value) || '—';
}

function normalizeKpis(dashboard = {}) {
  if (Array.isArray(dashboard.kpis)) return dashboard.kpis;
  return Object.entries(dashboard.kpis || {}).map(([key, value]) => (
    value && typeof value === 'object' ? { key, ...value } : { key, label: key, value }
  ));
}

function humanizeKey(key) {
  return textValue(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function inferColumns(rows = []) {
  const first = rows[0] || {};
  return Object.keys(first).map((key) => ({ key, label: humanizeKey(key) }));
}

function normalizeTables(dashboard = {}) {
  if (Array.isArray(dashboard.tables)) return dashboard.tables;
  return Object.entries(dashboard.tables || {}).map(([key, value]) => {
    if (Array.isArray(value)) return { key, title: humanizeKey(key), rows: value };
    return { key, ...(value || {}) };
  });
}

function currentDashboard() {
  return state.report?.[state.activeTab] || state.report?.dashboards?.[state.activeTab] || {};
}

function destroyCharts() {
  state.charts.forEach(({ chart }) => chart?.destroy?.());
  state.charts = [];
}

function actionButton(label, icon, className, handler) {
  const button = node('button', className);
  button.type = 'button';
  button.append(node('span', 'material-symbols-outlined', icon), node('span', '', label));
  button.addEventListener('click', handler);
  return button;
}

function scopeLabel() {
  return state.scope.projectName || state.scope.activeProjectName || 'Todos os projetos';
}

function visibleScopeLabel() {
  return state.selectedEquipmentTag
    ? `${scopeLabel()} · TAG ${state.selectedEquipmentTag}`
    : scopeLabel();
}

function reportContext() {
  return {
    projectName: scopeLabel(),
    equipmentTag: state.selectedEquipmentTag,
    generatedAt: new Date().toISOString(),
    chartImages: state.charts.map(({ chart, title }) => ({ title, dataUrl: chart.toBase64Image() })),
  };
}

function recalculateReport() {
  const baseReport = calculateReportsDashboard(state.rawData || {}, {
    today: state.calculationDate,
    equipmentTag: state.selectedEquipmentTag,
  });
  state.equipmentReadinessByProject = buildEquipmentReadinessByProject(state.rawData || {}, {
    today: state.calculationDate,
  });
  state.materialBottlenecks = buildMaterialBottlenecks(state.rawData || {}, { today: state.calculationDate });
  state.report = {
    ...baseReport,
    ...buildPpcReports(state.rawData || {}, {
      today: state.calculationDate,
      equipmentTag: state.selectedEquipmentTag,
      horizonDays: state.planningHorizonDays,
      baseDashboard: baseReport,
      equipmentReadinessByProject: state.equipmentReadinessByProject,
      materialBottlenecks: state.materialBottlenecks,
    }),
  };
  state.materialDeliveryTimeline = buildMaterialDeliveryTimeline(state.rawData || {}, {
    today: state.calculationDate,
    granularity: state.deliveryGranularity,
  });
  state.poItemStatusBreakdown = buildPoItemStatusBreakdown(state.rawData || {}, { today: state.calculationDate });
  state.materialUtilization = buildMaterialUtilizationSummary(state.rawData || {}, { today: state.calculationDate });
}

function renderPlanningHorizonFilter() {
  const field = node('label', 'reports-filter-field reports-filter-field-compact');
  const caption = node('span', 'reports-filter-label', 'Horizonte PPC');
  const select = node('select', 'reports-filter-select');
  select.setAttribute('aria-label', 'Selecionar horizonte do PPC');
  [14, 28, 56].forEach((days) => {
    const option = node('option', '', `${days} dias`);
    option.value = String(days);
    select.append(option);
  });
  select.value = String(state.planningHorizonDays);
  select.addEventListener('change', () => {
    state.planningHorizonDays = Number(select.value) || 28;
    state.sorting.clear();
    recalculateReport();
    render();
  });
  field.append(caption, select);
  return field;
}

function renderEquipmentTagFilter() {
  const field = node('label', 'reports-filter-field');
  const caption = node('span', 'reports-filter-label', 'Equipment Tag');
  const select = node('select', 'reports-filter-select');
  select.setAttribute('aria-label', 'Filtrar Reports por Equipment Tag');

  const allOption = node('option', '', 'Todas as Tags');
  allOption.value = '';
  select.append(allOption);
  state.equipmentTagOptions.forEach((option) => {
    const item = node('option');
    item.value = option.value;
    item.textContent = option.equipmentName
      ? `${option.label} — ${option.equipmentName}`
      : option.label;
    select.append(item);
  });
  select.value = state.selectedEquipmentTag;
  select.addEventListener('change', () => {
    state.selectedEquipmentTag = select.value;
    state.sorting.clear();
    recalculateReport();
    render();
  });
  field.append(caption, select);
  return field;
}

function renderHeader() {
  const header = node('header', 'reports-header');
  const copy = node('div', 'reports-header-copy');
  copy.append(
    node('p', 'eyebrow', 'Planejamento · Warehouse · Fabricação'),
    node('h1', '', 'PPC Control Tower'),
  );
  const scope = node('p', 'reports-scope');
  scope.append(node('span', 'material-symbols-outlined', 'filter_alt'), node('span', '', `Escopo: ${visibleScopeLabel()}`));
  copy.append(scope);

  const actions = node('div', 'reports-actions');
  actions.append(
    renderPlanningHorizonFilter(),
    renderEquipmentTagFilter(),
    actionButton('Exportar Excel', 'table_view', 'btn btn-secondary', async () => {
      try {
        await state.options.exportExcel?.(currentDashboard(), reportContext());
        state.options.showToast?.('Relatório exportado para Excel.', 'success');
      } catch (error) {
        console.error(error);
        state.options.showToast?.(error?.message || 'Não foi possível exportar o Excel.', 'error');
      }
    }),
    actionButton('Modo Apresentação / PDF', 'picture_as_pdf', 'btn btn-primary', () => {
      try {
        const printWindow = state.options.printPresentation?.(currentDashboard(), reportContext());
        if (!printWindow) throw new Error('A janela de impressão/PDF foi bloqueada.');
      } catch (error) {
        console.error(error);
        state.options.showToast?.(error?.message || 'Não foi possível abrir o modo apresentação.', 'error');
      }
    }),
  );
  header.append(copy, actions);
  return header;
}

function renderTabs() {
  const tabs = node('div', 'reports-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Painéis de PPC, Warehouse e Fabricação');
  TAB_DEFINITIONS.forEach((definition, index) => {
    const selected = definition.id === state.activeTab;
    const button = node('button', `reports-tab${selected ? ' active' : ''}`);
    button.type = 'button';
    button.id = `reports-tab-${definition.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(selected));
    button.setAttribute('aria-controls', `reports-panel-${definition.id}`);
    button.tabIndex = selected ? 0 : -1;
    button.append(node('span', 'material-symbols-outlined', definition.icon), node('span', '', definition.label));
    button.addEventListener('click', () => {
      if (state.activeTab === definition.id) return;
      state.activeTab = definition.id;
      render();
    });
    button.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % TAB_DEFINITIONS.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TAB_DEFINITIONS.length) % TAB_DEFINITIONS.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = TAB_DEFINITIONS.length - 1;
      else return;
      event.preventDefault();
      state.activeTab = TAB_DEFINITIONS[nextIndex].id;
      render();
      document.getElementById(`reports-tab-${state.activeTab}`)?.focus();
    });
    tabs.append(button);
  });
  return tabs;
}

function kpiTone(kpi = {}) {
  if (kpi.tone) return kpi.tone;
  const key = textValue(kpi.key).toLowerCase();
  const value = numberValue(kpi.value);
  if ((key.includes('missing') || key.includes('critical') || key.includes('overdue') || key.includes('falt') || key.includes('critic')) && value > 0) return 'critical';
  if (key.includes('availability') || key.includes('received') || key.includes('coverage') || key.includes('dispon')) return 'positive';
  if ((key.includes('pending') || key.includes('open')) && value > 0) return 'attention';
  return '';
}

export function executiveEquipmentKpis(groups = []) {
  const equipmentRows = groups.flatMap((group) => Array.isArray(group.equipmentRows) ? group.equipmentRows : []);
  const total = equipmentRows.length;
  const ready = equipmentRows.filter((row) => row.status === 'READY').length;
  const blocked = equipmentRows.filter((row) => row.status === 'BLOCKED').length;
  return [
    { key: 'readyEquipments', label: 'Equipamentos liberados', value: `${ready} / ${total}`, note: 'Status READY', tone: 'positive' },
    { key: 'blockedEquipments', label: 'Equipamentos críticos', value: blocked, format: 'integer', note: 'Status BLOCKED', tone: blocked ? 'critical' : 'positive' },
  ];
}

function renderKpis(dashboard) {
  const grid = node('div', 'reports-kpi-grid');
  normalizeKpis(dashboard).forEach((kpi) => {
    const card = node('article', `reports-kpi-card ${kpiTone(kpi)}`.trim());
    const label = kpi.label || humanizeKey(kpi.key);
    card.append(
      node('span', 'reports-kpi-label', label),
      node('strong', 'reports-kpi-value', formatValue(kpi.value, kpi.format, kpi.unit)),
    );
    if (kpi.note) card.append(node('span', 'reports-kpi-unit', kpi.note));
    grid.append(card);
  });
  return grid;
}

const EQUIPMENT_STATUS_LABELS = Object.freeze({
  READY: 'Liberado',
  PARTIAL: 'Parcial',
  BLOCKED: 'Bloqueado',
  NOT_PLANNED: 'Não planejado',
});

export function renderEquipmentReadinessProjects(groups = []) {
  const section = node('section', 'reports-equipment-readiness');
  section.append(panelHeader('Feasibility por equipamento', 'Todos os equipamentos agrupados por projeto.'));
  const projects = node('div', 'reports-equipment-project-grid');
  groups.forEach((group) => {
    const card = node('article', 'reports-equipment-project-card');
    const header = node('header', 'reports-equipment-project-header');
    const copy = node('div');
    copy.append(
      node('h3', '', group.projectName || group.projectId || 'Projeto não resolvido'),
      node('p', 'text-muted', `${numberValue(group.totalEquipments)} equipamento(s) · ${numberValue(group.criticalEquipments)} crítico(s)`),
    );
    header.append(copy);
    const rows = node('div', 'reports-equipment-list');
    (Array.isArray(group.equipmentRows) ? group.equipmentRows : []).forEach((equipment) => {
      const status = EQUIPMENT_STATUS_LABELS[equipment.status] ? equipment.status : 'NOT_PLANNED';
      const availability = Math.max(0, Math.min(100, percentageValue(equipment.availability)));
      const row = node('article', `reports-equipment-row status-${status.toLowerCase().replace('_', '-')}`);
      const identity = node('div', 'reports-equipment-identity');
      identity.append(
        node('strong', '', equipment.tag || 'Sem TAG'),
        node('span', 'text-muted', equipment.equipmentName || 'Equipamento sem nome'),
      );
      const feasibility = node('div', 'reports-equipment-feasibility');
      const labels = node('div', 'reports-equipment-feasibility-labels');
      labels.append(
        node('span', '', 'Feasibility'),
        node('strong', '', `${formatNumber(availability, 1)}%`),
      );
      const track = node('div', 'reports-equipment-feasibility-track');
      const fill = node('span');
      fill.style.width = `${availability}%`;
      track.append(fill);
      feasibility.append(labels, track);
      const details = node('div', 'reports-equipment-details');
      details.append(
        node('span', `reports-equipment-status status-${status.toLowerCase().replace('_', '-')}`, EQUIPMENT_STATUS_LABELS[status]),
        node('span', 'text-muted', `${numberValue(equipment.criticalItems)} crítico(s) · ${numberValue(equipment.demandItems)} demanda(s)`),
      );
      row.append(identity, feasibility, details);
      rows.append(row);
    });
    card.append(header, rows);
    projects.append(card);
  });
  if (!groups.length) projects.append(node('p', 'reports-empty-cell', 'Nenhum equipamento encontrado no escopo atual.'));
  section.append(projects);
  return section;
}

function poItemLabel(poItem = {}) {
  return poItem.linked === false || !poItem.poNumber
    ? 'Sem PO vinculada'
    : `PO ${poItem.poNumber} · Item ${poItem.itemNumber || '—'}`;
}

export function renderMaterialBottlenecks(result = {}) {
  const section = node('section', 'reports-bottlenecks');
  section.append(panelHeader('Equipamentos críticos e bottlenecks', 'Materiais que impedem a liberação e quantos equipamentos cada falta afeta.'));
  const layout = node('div', 'reports-bottleneck-layout');
  const equipmentPanel = node('section', 'reports-bottleneck-panel');
  equipmentPanel.append(node('h3', '', 'Equipamentos bloqueados'));
  const equipmentList = node('div', 'reports-critical-equipment-list');
  (Array.isArray(result.criticalEquipmentRows) ? result.criticalEquipmentRows : []).forEach((equipment) => {
    const card = node('article', 'reports-critical-equipment-card');
    const header = node('div', 'reports-critical-equipment-header');
    const identity = node('div');
    identity.append(node('strong', '', equipment.tag || 'Sem TAG'), node('span', 'text-muted', equipment.equipmentName || 'Equipamento sem nome'));
    header.append(identity, node('strong', 'reports-critical-availability', `${formatNumber(percentageValue(equipment.availability), 1)}%`));
    const materials = node('div', 'reports-critical-materials');
    equipment.materials.forEach((material) => {
      const row = node('div', 'reports-critical-material-row');
      const materialName = material.identCode || material.materialGrade || material.materialDescription || 'Material não identificado';
      const poLabels = material.poLinked ? material.poItems.map(poItemLabel).join(' · ') : 'Sem PO vinculada';
      row.append(
        node('strong', '', materialName),
        node('span', 'text-muted', `Falta: ${formatNumber(material.shortageQty, 2)}`),
        node('span', material.poLinked ? 'text-muted' : 'reports-no-po', poLabels),
      );
      materials.append(row);
    });
    const delivery = equipment.nextDeliveryDate ? `Próxima entrega: ${formatDate(equipment.nextDeliveryDate)}` : 'Próxima entrega: não informada';
    card.append(header, materials, node('p', 'reports-critical-delivery', delivery));
    equipmentList.append(card);
  });
  if (!equipmentList.children.length) equipmentList.append(node('p', 'reports-empty-cell', 'Nenhum equipamento bloqueado no escopo atual.'));
  equipmentPanel.append(equipmentList);

  const bottleneckPanel = node('section', 'reports-bottleneck-panel');
  bottleneckPanel.append(node('h3', '', 'Materiais que bloqueiam equipamentos'));
  const bottleneckList = node('div', 'reports-bottleneck-list');
  (Array.isArray(result.bottlenecks) ? result.bottlenecks : []).forEach((bottleneck) => {
    const card = node('article', `reports-bottleneck-card${bottleneck.equipmentCount > 1 ? ' multiple' : ''}`);
    const impact = node('strong', 'reports-bottleneck-impact', `Bloqueia ${numberValue(bottleneck.equipmentCount)} equipamento(s)`);
    const materialName = bottleneck.identCode || bottleneck.materialGrade || bottleneck.materialKey || 'Material não identificado';
    const po = bottleneck.poLinked ? poItemLabel(bottleneck.poItem) : 'Sem PO vinculada';
    card.append(
      impact,
      node('strong', '', materialName),
      node('span', bottleneck.poLinked ? 'text-muted' : 'reports-no-po', po),
      node('span', 'reports-bottleneck-tags', bottleneck.tags.join(', ') || 'Sem TAG associada'),
    );
    bottleneckList.append(card);
  });
  if (!bottleneckList.children.length) bottleneckList.append(node('p', 'reports-empty-cell', 'Nenhum bottleneck material encontrado.'));
  bottleneckPanel.append(bottleneckList);
  layout.append(equipmentPanel, bottleneckPanel);
  section.append(layout);
  return section;
}

function panelHeader(title, description = '') {
  const header = node('div', 'reports-panel-header');
  const copy = node('div');
  copy.append(node('h3', '', title));
  if (description) copy.append(node('p', 'text-muted', description));
  header.append(copy);
  return header;
}

function flowTone(key) {
  const normalized = textValue(key).toLowerCase();
  if (/blocked|hold|rejected/.test(normalized)) return 'critical';
  if (/risk|pending|material/.test(normalized)) return 'attention';
  if (/ready|available|complete/.test(normalized)) return 'positive';
  return '';
}

export function renderOperationalFlow(items = [], title = 'Fluxo operacional') {
  const section = node('section', 'reports-operational-flow');
  section.append(panelHeader(title, 'Leitura rápida do fluxo para orientar prioridades e exceções da reunião.'));
  const grid = node('div', 'reports-operational-flow-grid');
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const card = node('article', `reports-flow-card ${flowTone(item.key)}`.trim());
    card.append(
      node('span', 'reports-flow-sequence', String(index + 1).padStart(2, '0')),
      node('strong', 'reports-flow-value', formatNumber(item.value, 0)),
      node('span', 'reports-flow-label', item.label || humanizeKey(item.key)),
    );
    grid.append(card);
  });
  if (!grid.children.length) grid.append(node('p', 'reports-empty-cell', 'Nenhuma etapa operacional encontrada.'));
  section.append(grid);
  return section;
}

function renderDetailedEquipmentAnalysis(dashboard) {
  const details = node('details', 'reports-analysis-details');
  const summary = node('summary');
  summary.append(
    node('span', 'material-symbols-outlined', 'analytics'),
    node('span', '', 'Análise detalhada de material e equipamento'),
    node('small', '', 'Abrir visão analítica'),
  );
  details.append(summary);
  const content = node('div', 'reports-analysis-details-content');
  const analysisTables = normalizeTables(dashboard).filter((table) => table.section === 'analysis');
  if (analysisTables.length) content.append(renderTables({ tables: analysisTables }));
  content.append(
    renderEquipmentReadinessProjects(state.equipmentReadinessByProject),
    renderMaterialBottlenecks(state.materialBottlenecks),
  );
  details.append(content);
  return details;
}

function chartCard(title, description = '', compact = false) {
  const card = node('section', 'reports-chart-card');
  const frame = node('div', `reports-chart-frame${compact ? ' compact' : ''}`);
  const canvas = node('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', title);
  frame.append(canvas);
  card.append(panelHeader(title, description), frame);
  return { card, frame, canvas };
}

function createChart(canvas, title, configuration) {
  const Chart = globalThis.Chart;
  if (!Chart) {
    canvas.parentElement?.replaceChildren(node('p', 'reports-chart-fallback', 'Chart.js não está disponível. Verifique a conexão e recarregue a página.'));
    return null;
  }
  const chart = new Chart(canvas, configuration);
  state.charts.push({ chart, title });
  return chart;
}

function commonChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: '#44515a', usePointStyle: true, boxWidth: 8 } },
      tooltip: { intersect: false },
    },
  };
}

function chartPayload(dashboard, key, aliases = []) {
  const sources = [dashboard.charts || {}, dashboard.chartData || {}, dashboard];
  for (const source of sources) {
    if (source?.[key] != null) return source[key];
    for (const alias of aliases) if (source?.[alias] != null) return source[alias];
  }
  return null;
}

function renderExecutiveCharts(dashboard) {
  const grid = node('div', 'reports-chart-grid single');
  const { card, canvas } = chartCard('Pode Fabricar', 'Percentual da demanda MTO coberta por estoque disponível.');
  grid.append(card);
  const rows = chartPayload(dashboard, 'manufacturableByProject', ['projectAvailability', 'byProject']) || [];
  const values = Array.isArray(rows) ? rows : [];
  createChart(canvas, 'Pode Fabricar', {
    type: 'bar',
    data: {
      labels: values.map((row) => row.projectName || row.name || row.projectId || 'Sem projeto'),
      datasets: [{
        label: 'Pode Fabricar (%)',
        data: values.map((row) => percentageValue(row.percentage ?? row.availabilityPercent ?? row.coveragePercent ?? row.value)),
        backgroundColor: '#22505F',
        borderRadius: 5,
      }],
    },
    options: {
      ...commonChartOptions(),
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { callback: (value) => `${value}%` }, grid: { color: '#e5eaed' } },
        y: { grid: { display: false } },
      },
    },
  });
  return grid;
}

function gaugeLabelPlugin(value) {
  return {
    id: `reports-gauge-label-${Math.round(value * 10)}`,
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.fillStyle = '#22505F';
      ctx.font = '700 30px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatNumber(value, 1)}%`, (chartArea.left + chartArea.right) / 2, chartArea.bottom - 16);
      ctx.restore();
    },
  };
}

function renderAvailabilityCharts(dashboard) {
  const grid = node('div', 'reports-chart-grid');
  const overall = percentageValue(chartPayload(dashboard, 'overallPercent', ['availabilityPercent', 'coveragePercent']) ?? 0);
  const gauge = chartCard('Material Availability Geral', 'Cobertura imediata da demanda MTO.', true);
  const stacked = chartCard('Disponível / Em trânsito / Faltando', 'Distribuição da cobertura por projeto.');
  grid.append(gauge.card, stacked.card);
  createChart(gauge.canvas, 'Material Availability Geral', {
    type: 'doughnut',
    data: {
      labels: ['Disponível', 'Faltando'],
      datasets: [{ data: [overall, Math.max(0, 100 - overall)], backgroundColor: ['#22505F', '#e5eaed'], borderWidth: 0 }],
    },
    options: {
      ...commonChartOptions(),
      rotation: -90,
      circumference: 180,
      cutout: '72%',
      plugins: { ...commonChartOptions().plugins, legend: { display: false } },
    },
    plugins: [gaugeLabelPlugin(overall)],
  });

  const rows = chartPayload(dashboard, 'byProject', ['projectBreakdown', 'availabilityByProject']) || [];
  const values = Array.isArray(rows) ? rows : [];
  createChart(stacked.canvas, 'Disponível / Em trânsito / Faltando', {
    type: 'bar',
    data: {
      labels: values.map((row) => row.projectName || row.name || row.projectId || 'Sem projeto'),
      datasets: [
        { label: 'Disponível', data: values.map((row) => numberValue(row.available)), backgroundColor: '#22505F' },
        { label: 'Em trânsito', data: values.map((row) => numberValue(row.inTransit ?? row.pending)), backgroundColor: '#6B8F9C' },
        { label: 'Faltando', data: values.map((row) => numberValue(row.missing ?? row.shortage)), backgroundColor: '#8B2C2C' },
      ],
    },
    options: {
      ...commonChartOptions(),
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#e5eaed' } },
      },
    },
  });
  return grid;
}

function renderReceivingCharts(dashboard) {
  const grid = node('div', 'reports-chart-grid');
  const timeline = chartCard('Recebimentos por semana', 'Semanas ISO (Wxx). Peso quando disponível; quantidades de unidades diferentes não são somadas.');
  const balance = chartCard('PO Recebido x Pendente', 'Saldo por unidade: PCS/PC/UN são consolidados como EA, enquanto M permanece separado.');
  grid.append(timeline.card, balance.card);
  const weeklyRows = chartPayload(dashboard, 'weeklyReceipts', ['timeline', 'receiptsByWeek']) || [];
  const values = Array.isArray(weeklyRows) ? weeklyRows : [];
  const useWeight = values.some((row) => numberValue(row.weightKg) > 0);
  const quantityUnits = [...new Set(values.flatMap((row) => (
    Array.isArray(row.quantitiesByUnit) ? row.quantitiesByUnit : []
  )).filter((entry) => numberValue(entry?.value) > 0).map((entry) => textValue(entry.unit)).filter(Boolean))];
  const singleQuantityUnit = !useWeight && quantityUnits.length === 1 ? quantityUnits[0] : '';
  const timelineLabel = useWeight
    ? 'Peso recebido (kg)'
    : singleQuantityUnit
      ? `Quantidade recebida (${singleQuantityUnit})`
      : 'Recebimentos';
  createChart(timeline.canvas, 'Recebimentos por semana', {
    type: 'line',
    data: {
      labels: values.map((row) => row.weekLabel || row.week || row.label || row.date),
      datasets: [{
        label: timelineLabel,
        data: values.map((row) => {
          if (useWeight) return numberValue(row.weightKg);
          if (!singleQuantityUnit) return numberValue(row.receiptCount);
          const quantity = (row.quantitiesByUnit || []).find((entry) => textValue(entry.unit) === singleQuantityUnit);
          return numberValue(quantity?.value ?? row.receivedQuantity);
        }),
        borderColor: '#22505F',
        backgroundColor: 'rgba(34, 80, 95, .14)',
        fill: true,
        tension: .25,
        pointRadius: 3,
      }],
    },
    options: {
      ...commonChartOptions(),
      plugins: {
        ...commonChartOptions().plugins,
        tooltip: {
          intersect: false,
          callbacks: {
            title(items) {
              const row = values[items[0]?.dataIndex];
              if (!row) return '';
              const label = row.weekLabel || row.week || row.label || row.date;
              return row.weekYear ? `${label} · ${row.weekYear}` : label;
            },
            afterBody(items) {
              const row = values[items[0]?.dataIndex];
              if (!row) return [];
              const details = [];
              if (row.quantitySummary) details.push(`Quantidades: ${row.quantitySummary}`);
              if (!useWeight && numberValue(row.weightKg) > 0) details.push(`Peso: ${formatNumber(row.weightKg, 1)} kg`);
              return details;
            },
          },
        },
      },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#e5eaed' } } },
    },
  });

  const poBalance = chartPayload(dashboard, 'poBalanceByUnit') || [];
  const poRows = Array.isArray(poBalance) ? poBalance : [];
  createChart(balance.canvas, 'PO Recebido x Pendente', {
    type: 'bar',
    data: {
      labels: poRows.map((row) => row.unit || 'Sem unidade'),
      datasets: [
        {
          label: 'Recebido',
          data: poRows.map((row) => numberValue(row.received)),
          backgroundColor: '#22505F',
          borderRadius: 5,
        },
        {
          label: 'Pendente',
          data: poRows.map((row) => numberValue(row.pending)),
          backgroundColor: '#d29b00',
          borderRadius: 5,
        },
      ],
    },
    options: {
      ...commonChartOptions(),
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#e5eaed' } } },
    },
  });
  return grid;
}

function deliveryQuantitySummary(entries = []) {
  return entries.map((entry) => `${formatNumber(entry.value, 1)} ${entry.unit}`).join(' · ') || '—';
}

export function renderMaterialDeliveryTimeline(rows = [], granularity = 'month', onGranularityChange = null) {
  const section = node('section', 'reports-delivery-timeline');
  const header = panelHeader('Chegada de materiais', 'Previsto pendente versus recebido por período, sem truncamento.');
  const controls = node('div', 'reports-period-toggle');
  [['month', 'Mês'], ['week', 'Semana']].forEach(([value, label]) => {
    const button = node('button', `btn btn-sm ${granularity === value ? 'btn-primary' : 'btn-secondary'}`, label);
    button.type = 'button';
    button.addEventListener('click', () => onGranularityChange?.(value));
    controls.append(button);
  });
  header.append(controls);
  section.append(header);
  const content = node('div', 'reports-delivery-content');
  const frame = node('div', 'reports-chart-frame compact');
  const canvas = node('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Previsto versus recebido por período');
  frame.append(canvas);
  createChart(canvas, 'Chegada de materiais', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        { label: 'Previsto', data: rows.map((row) => numberValue(row.expectedWeightKg ?? row.expectedQty)), backgroundColor: '#D97800', borderRadius: 4 },
        { label: 'Recebido', data: rows.map((row) => numberValue(row.receivedWeightKg ?? row.receivedQty)), backgroundColor: '#22505F', borderRadius: 4 },
      ],
    },
    options: { ...commonChartOptions(), scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#e5eaed' } } } },
  });
  const wrap = node('div', 'reports-table-wrap');
  const table = node('table', 'reports-table reports-delivery-table');
  const thead = node('thead');
  const head = node('tr');
  ['Período', 'Previsto', 'Recebido', 'Peso recebido'].forEach((label) => head.append(node('th', '', label)));
  thead.append(head);
  const tbody = node('tbody');
  rows.forEach((period) => {
    const row = node('tr');
    row.append(
      node('td', '', period.label),
      node('td', '', deliveryQuantitySummary(period.expectedQuantitiesByUnit)),
      node('td', '', deliveryQuantitySummary(period.receivedQuantitiesByUnit)),
      node('td', 'numeric', period.receivedWeightKg == null ? '—' : `${formatNumber(period.receivedWeightKg, 1)} kg`),
    );
    tbody.append(row);
  });
  if (!rows.length) {
    const row = node('tr');
    const cell = node('td', 'reports-empty-cell', 'Nenhuma previsão ou entrega encontrada.');
    cell.colSpan = 4;
    row.append(cell);
    tbody.append(row);
  }
  table.append(thead, tbody);
  wrap.append(table);
  content.append(frame, wrap);
  section.append(content);
  return section;
}

const PO_BUCKET_LABELS = Object.freeze({
  RECEIVED_BUCKET: 'Recebido',
  IN_TRANSIT_BUCKET: 'Em trânsito',
  IN_PRODUCTION_BUCKET: 'Em produção',
});

export function renderPoItemStatusBreakdown(result = {}) {
  const section = node('section', 'reports-po-status-breakdown');
  section.append(panelHeader('Status dos itens de PO', 'Situação nominal dos itens ativos; atrasos permanecem destacados dentro do respectivo status.'));
  const grid = node('div', 'reports-po-status-grid');
  (Array.isArray(result.buckets) ? result.buckets : []).forEach((bucket) => {
    const percentage = Math.max(0, Math.min(100, percentageValue(bucket.percentage)));
    const card = node('article', `reports-po-status-card bucket-${textValue(bucket.key).toLowerCase().replace(/_/g, '-')}`);
    const header = node('div', 'reports-po-status-header');
    header.append(
      node('strong', '', PO_BUCKET_LABELS[bucket.key] || humanizeKey(bucket.key)),
      node('span', '', `${numberValue(bucket.count)} item(ns) · ${formatNumber(percentage, 1)}%`),
    );
    const track = node('div', 'reports-po-status-track');
    const fill = node('span');
    fill.style.width = `${percentage}%`;
    track.append(fill);
    const overdue = node(
      'p',
      bucket.overdueCount > 0 ? 'reports-po-overdue' : 'text-muted',
      bucket.overdueCount > 0 ? `${numberValue(bucket.overdueCount)} atrasado(s) neste status` : 'Nenhum item atrasado neste status',
    );
    card.append(header, track, overdue);
    grid.append(card);
  });
  section.append(grid);
  return section;
}

function utilizationMeasure(quantity, weightKg, lengthMm = null) {
  const values = [`${formatNumber(quantity, 2)} un.`];
  if (numberValue(weightKg) > 0) values.push(`${formatNumber(weightKg, 1)} kg`);
  if (lengthMm != null && numberValue(lengthMm) > 0) values.push(`${formatNumber(lengthMm, 0)} mm`);
  return values.join(' · ');
}

export function renderMaterialUtilizationSummary(summary = {}) {
  const section = node('section', 'reports-material-utilization');
  section.append(panelHeader('Material Utilization', 'Consumo, reserva, estoque, retornos RMV, nesting e aparas registrados no escopo.'));
  const grid = node('div', 'reports-utilization-grid');
  const cards = [
    { label: 'Material consumido', value: utilizationMeasure(summary.consumedQty, summary.consumedWeightKg), tone: 'primary' },
    { label: 'Material reservado', value: utilizationMeasure(summary.reservedQty, summary.reservedWeightKg), tone: 'attention' },
    { label: 'Material em estoque', value: utilizationMeasure(summary.stockQty, summary.stockWeightKg), tone: 'positive' },
    { label: 'Retornos RMV', value: utilizationMeasure(summary.returnedQty, summary.returnedWeightKg, summary.returnedLengthMm), tone: 'primary' },
    { label: 'Aproveitamento de nesting', value: `${formatNumber(percentageValue(summary.nestingUtilization), 1)}%`, tone: 'positive' },
    { label: 'Aparas', value: `${formatNumber(summary.trimQty, 0)} ocorrência(s) · ${formatNumber(summary.trimLengthMm, 0)} mm`, tone: 'attention' },
  ];
  cards.forEach((item) => {
    const card = node('article', `reports-utilization-card ${item.tone}`);
    card.append(node('span', 'reports-kpi-label', item.label), node('strong', 'reports-utilization-value', item.value));
    grid.append(card);
  });
  section.append(grid);
  return section;
}

function renderCharts(dashboard) {
  if (state.activeTab === 'availability') return renderAvailabilityCharts(dashboard);
  if (state.activeTab === 'receiving') return renderReceivingCharts(dashboard);
  return node('div', 'reports-chart-grid reports-chart-grid-empty');
}

function compareValues(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (left !== '' && right !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return textValue(left).localeCompare(textValue(right), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function sortedRows(table, columns) {
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  const key = table.key || table.title;
  const sorting = state.sorting.get(key);
  if (!sorting || !columns.some((column) => column.key === sorting.column)) return rows;
  return rows.sort((left, right) => compareValues(left[sorting.column], right[sorting.column]) * (sorting.direction === 'asc' ? 1 : -1));
}

function toggleTableSort(tableKey, columnKey) {
  const current = state.sorting.get(tableKey);
  state.sorting.set(tableKey, {
    column: columnKey,
    direction: current?.column === columnKey && current.direction === 'desc' ? 'asc' : 'desc',
  });
  render();
}

function renderTable(table, index) {
  const key = table.key || `table-${index}`;
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : inferColumns(rows);
  const card = node('section', 'reports-table-card');
  card.append(panelHeader(table.title || humanizeKey(key), table.description || ''));
  const wrap = node('div', 'reports-table-wrap');
  const element = node('table', 'reports-table');
  const thead = node('thead');
  const headerRow = node('tr');
  columns.forEach((column) => {
    const th = node('th');
    const button = node('button', 'reports-sort-button');
    button.type = 'button';
    const sorting = state.sorting.get(key);
    const active = sorting?.column === column.key;
    button.append(
      node('span', '', column.label || humanizeKey(column.key)),
      node('span', 'material-symbols-outlined', active ? (sorting.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'),
    );
    button.addEventListener('click', () => toggleTableSort(key, column.key));
    th.append(button);
    headerRow.append(th);
  });
  thead.append(headerRow);

  const tbody = node('tbody');
  const sorted = sortedRows({ ...table, key }, columns);
  const visibleRows = table.showAll === true ? sorted : sorted.slice(0, 10);
  if (!visibleRows.length) {
    const row = node('tr');
    const cell = node('td', 'reports-empty-cell', table.emptyMessage || 'Nenhum registro para este ranking.');
    cell.colSpan = Math.max(1, columns.length);
    row.append(cell);
    tbody.append(row);
  } else {
    visibleRows.forEach((record) => {
      const row = node('tr', record?.isOverdue ? 'reports-row-overdue' : '');
      columns.forEach((column) => {
        const value = record?.[column.key];
        const numeric = typeof value === 'number' || textValue(column.format).match(/number|percent|kg/i);
        const cell = node('td', numeric ? 'numeric' : '');
        if (column.format === 'completionStatus') {
          cell.append(node('span', `reports-status-badge ${textValue(value).toLowerCase().replace(/_/g, '-')}`, formatValue(value, column.format)));
        } else if (column.format === 'overdueStatus') {
          cell.append(node('span', `reports-status-badge ${value ? 'overdue' : 'on-time'}`, formatValue(value, column.format)));
        } else if (column.format === 'operationalStatus') {
          const statusClass = textValue(value).toLowerCase().replace(/_/g, '-');
          cell.append(node('span', `reports-status-badge status-${statusClass}`, formatValue(value, column.format)));
        } else {
          cell.textContent = formatValue(value, column.format, column.unit);
        }
        row.append(cell);
      });
      tbody.append(row);
    });
  }
  element.append(thead, tbody);
  wrap.append(element);
  card.append(wrap);
  return card;
}

function renderTables(dashboard) {
  const grid = node('div', 'reports-table-grid');
  normalizeTables(dashboard).forEach((table, index) => grid.append(renderTable(table, index)));
  return grid;
}

function renderDashboard() {
  const dashboard = currentDashboard();
  const panel = node('section', 'reports-dashboard');
  panel.id = `reports-panel-${state.activeTab}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `reports-tab-${state.activeTab}`);
  const heading = node('div', 'reports-dashboard-heading');
  const tab = TAB_DEFINITIONS.find((item) => item.id === state.activeTab);
  heading.append(
    node('h2', '', dashboard.title || tab?.label || 'Reports'),
    node('p', 'text-muted', dashboard.question || ''),
  );
  panel.append(heading, renderKpis(dashboard));
  const tables = normalizeTables(dashboard);
  if (state.activeTab === 'executive') {
    panel.append(
      renderOperationalFlow(dashboard.statusFlow, 'Fluxo de liberação dos Workpacks'),
      renderTables({ tables: tables.filter((table) => table.section !== 'analysis') }),
      renderDetailedEquipmentAnalysis(dashboard),
    );
  } else if (state.activeTab === 'warehouse') {
    panel.append(
      renderOperationalFlow(dashboard.statusFlow, 'Fluxo físico do Warehouse'),
      renderMaterialUtilizationSummary(state.materialUtilization),
      renderTables(dashboard),
    );
  } else if (state.activeTab === 'fabrication') {
    panel.append(
      renderOperationalFlow(dashboard.statusFlow, 'Fluxo de fabricação por Workpack'),
      renderMaterialUtilizationSummary(state.materialUtilization),
      renderTables(dashboard),
    );
  } else {
    panel.append(renderCharts(dashboard));
    if (state.activeTab === 'receiving') {
      panel.append(
        renderMaterialDeliveryTimeline(
          state.materialDeliveryTimeline,
          state.deliveryGranularity,
          (granularity) => {
            if (granularity === state.deliveryGranularity) return;
            state.deliveryGranularity = granularity;
            recalculateReport();
            render();
          },
        ),
        renderPoItemStatusBreakdown(state.poItemStatusBreakdown),
        renderMaterialUtilizationSummary(state.materialUtilization),
      );
    }
    if (tables.length) panel.append(renderTables(dashboard));
  }
  return panel;
}

function render() {
  if (!state.container || !state.report) return;
  destroyCharts();
  const page = node('div', 'reports-page');
  page.append(renderHeader(), renderTabs(), renderDashboard());
  state.container.replaceChildren(page);
}

export async function renderReportsPage(container, options = {}) {
  state.container = container;
  state.options = { ...options };
  destroyCharts();
  container.replaceChildren(node('p', 'reports-loading', 'Carregando dados de MTO, Procurement e Inventory…'));
  try {
    const data = await options.loadReportsData?.();
    state.rawData = data || {};
    state.scope = data?.scope || {};
    state.equipmentTagOptions = reportEquipmentTagOptions(state.rawData);
    state.selectedEquipmentTag = state.equipmentTagOptions.some((item) => item.value === options.initialEquipmentTag)
      ? options.initialEquipmentTag
      : '';
    state.calculationDate = new Date().toISOString().slice(0, 10);
    state.planningHorizonDays = [14, 28, 56].includes(Number(options.initialPlanningHorizonDays))
      ? Number(options.initialPlanningHorizonDays)
      : 28;
    state.sorting.clear();
    recalculateReport();
    render();
  } catch (error) {
    console.error('Falha ao carregar Reports.', error);
    state.rawData = null;
    state.report = null;
    container.replaceChildren(node('p', 'reports-error', error?.message || 'Não foi possível carregar os Reports.'));
  }
}
