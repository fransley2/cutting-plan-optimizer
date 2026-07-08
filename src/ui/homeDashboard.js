import { formatRecentPlans } from '../data/planStats.js';

function icon(name, className = '') {
  const span = document.createElement('span');
  span.className = `material-symbols-outlined ${className}`.trim();
  span.textContent = name;
  return span;
}

function actionCard({ iconName, tone, title, description, disabled = false, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `home-action-card tone-${tone}`;
  button.disabled = disabled;
  if (onClick) button.addEventListener('click', onClick);

  const iconBox = document.createElement('span');
  iconBox.className = 'home-action-icon';
  iconBox.appendChild(icon(iconName));

  const titleEl = document.createElement('strong');
  titleEl.textContent = title;

  const desc = document.createElement('span');
  desc.textContent = description;

  button.append(iconBox, titleEl, desc);
  return button;
}

function pivotBar() {
  const wrapper = document.createElement('div');
  wrapper.className = 'home-pivot-bar';

  const recent = document.createElement('button');
  recent.type = 'button';
  recent.className = 'pivot-item active';
  recent.textContent = 'Recente';

  const favorites = document.createElement('button');
  favorites.type = 'button';
  favorites.className = 'pivot-item';
  favorites.disabled = true;
  favorites.textContent = 'Favoritos';

  wrapper.append(recent, favorites);
  return wrapper;
}

function utilizationBadge(plan) {
  const badge = document.createElement('span');
  badge.className = `status-chip status-${plan.utilizationTone}`;
  badge.textContent = plan.utilizationLabel;
  return badge;
}

function renderPlanRows(tbody, rows, { onLoadPlan, onDeletePlan, refresh }) {
  tbody.replaceChildren();

  rows.forEach((plan) => {
    const tr = document.createElement('tr');

    const nameCell = document.createElement('td');
    const nameWrap = document.createElement('span');
    nameWrap.className = 'home-plan-name';
    nameWrap.append(icon('description'), document.createTextNode(plan.name));
    nameCell.appendChild(nameWrap);

    const modifiedCell = document.createElement('td');
    modifiedCell.textContent = plan.modified;

    const projectCell = document.createElement('td');
    projectCell.textContent = plan.projectClient;

    const utilizationCell = document.createElement('td');
    utilizationCell.appendChild(utilizationBadge(plan));

    const actionsCell = document.createElement('td');
    actionsCell.className = 'home-table-actions';

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'icon-action';
    loadButton.title = 'Carregar plano';
    loadButton.appendChild(icon('visibility'));
    loadButton.addEventListener('click', () => onLoadPlan(plan.name));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'icon-action icon-action-critical';
    deleteButton.title = 'Excluir plano';
    deleteButton.appendChild(icon('delete'));
    deleteButton.addEventListener('click', async () => {
      if (!confirm(`Excluir o plano "${plan.name}"?`)) return;
      await onDeletePlan(plan.name);
      await refresh();
    });

    actionsCell.append(loadButton, deleteButton);
    tr.append(nameCell, modifiedCell, projectCell, utilizationCell, actionsCell);
    tbody.appendChild(tr);
  });
}

function emptyState(onNewPlan) {
  const wrapper = document.createElement('div');
  wrapper.className = 'home-empty-state';

  const title = document.createElement('strong');
  title.textContent = 'Nenhum plano ainda. Crie o primeiro.';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary';
  button.textContent = 'Novo plano de corte';
  button.addEventListener('click', onNewPlan);

  wrapper.append(title, button);
  return wrapper;
}

function recentPlansSection({ getPlans, onLoadPlan, onDeletePlan, onNewPlan }) {
  const section = document.createElement('section');
  section.className = 'home-recent';

  const header = document.createElement('div');
  header.className = 'home-recent-header';
  header.appendChild(pivotBar());

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap home-table-wrap';

  const table = document.createElement('table');
  table.className = 'data-table home-plans-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Nome', 'Modificado', 'Projeto / Cliente', 'Aproveitamento', 'Acoes'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  tableWrap.appendChild(table);

  const loading = document.createElement('p');
  loading.className = 'text-muted home-loading';
  loading.textContent = 'Carregando...';

  async function refresh() {
    section.querySelector('.home-empty-state')?.remove();
    tableWrap.classList.add('hidden');
    if (!section.contains(loading)) section.appendChild(loading);

    const rows = formatRecentPlans(await getPlans());
    loading.remove();

    if (rows.length === 0) {
      section.appendChild(emptyState(onNewPlan));
      return;
    }

    tableWrap.classList.remove('hidden');
    renderPlanRows(tbody, rows, { onLoadPlan, onDeletePlan, refresh });
  }

  section.append(header, tableWrap);
  refresh();
  return section;
}

export function renderHomeDashboard(container, options) {
  container.replaceChildren();

  const header = document.createElement('div');
  header.className = 'home-header';
  const title = document.createElement('h1');
  title.textContent = 'Bem-vindo ao Portal de Fabricacao';
  const subtitle = document.createElement('p');
  subtitle.className = 'text-muted';
  subtitle.textContent = 'Centralize planos de corte, inventario e resultados de nesting em um fluxo auditavel.';
  header.append(title, subtitle);

  const actions = document.createElement('div');
  actions.className = 'home-actions-grid';
  actions.append(
    actionCard({
      iconName: 'add_box',
      tone: 'primary',
      title: 'Novo plano de corte',
      description: 'Crie uma nova ordem de servico e otimize o material.',
      onClick: options.onNewPlan,
    }),
    actionCard({
      iconName: 'upload_file',
      tone: 'secondary',
      title: 'Importar inventario',
      description: 'Carregue arquivos Excel ou CSV para atualizar o estoque.',
      onClick: options.onImportInventory,
    }),
    actionCard({
      iconName: 'analytics',
      tone: 'tertiary',
      title: 'Ver resultados',
      description: options.hasResults ? 'Revise o ultimo plano calculado.' : 'Calcule um plano primeiro.',
      disabled: !options.hasResults,
      onClick: options.onViewResults,
    })
  );

  container.append(
    header,
    actions,
    recentPlansSection(options)
  );
}
