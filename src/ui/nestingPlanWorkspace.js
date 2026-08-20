const STATUS = Object.freeze({
  DRAFT: 'RASCUNHO',
  DIRTY: 'ALTERADO',
  OPTIMIZED: 'OTIMIZADO',
  SAVED: 'SALVO',
});

const state = {
  root: null,
  dependencies: {},
  status: STATUS.DRAFT,
  savedAt: '',
  initialized: false,
};

let resultsCommandBarInitialized = false;

function byId(id) { return document.getElementById(id); }
function text(value) { return value == null ? '' : String(value).trim(); }

function formatSavedAt(value) {
  if (!value) return 'Ainda não salvo';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString('pt-BR');
}

function selectedText(select) {
  const option = select?.selectedOptions?.[0];
  return option?.value ? text(option.textContent) : '';
}

function currentContext() {
  const project = text(byId('planner-project-name')?.textContent);
  const workpack = selectedText(byId('planner-workpack-select')) || text(byId('workpack-name')?.value);
  const stocks = byId('stock-list')?.querySelectorAll('tr').length || 0;
  const parts = byId('parts-list')?.querySelectorAll('tr').length || 0;
  return {
    project: project && project !== 'Nenhum projeto selecionado' ? project : '',
    workpack,
    stocks,
    parts,
  };
}

function statusClass(status) {
  const classes = {
    [STATUS.DRAFT]: 'draft',
    [STATUS.DIRTY]: 'alterado',
    [STATUS.OPTIMIZED]: 'otimizado',
    [STATUS.SAVED]: 'salvo',
  };
  return `planner-status-${classes[status] || 'draft'}`;
}

export function getNestingPlanName() {
  return text(byId('planner-plan-name')?.value);
}

export function canAutoSuggestNestingPlanName() {
  const input = byId('planner-plan-name');
  return !text(input?.value) || input?.dataset.nameSource === 'automatic';
}

export function refreshNestingPlanWorkspace() {
  const name = getNestingPlanName();
  const context = currentContext();
  const title = byId('planner-workspace-title');
  const subtitle = byId('planner-workspace-subtitle');
  const badge = byId('planner-editor-status');
  const project = byId('planner-plan-project');
  const workpack = byId('planner-plan-workpack');
  const savedAt = byId('planner-plan-saved-at');
  const results = byId('btn-planner-open-results');

  if (title) title.textContent = name || 'Novo Cutting Sheet';
  if (subtitle) subtitle.textContent = [state.status, context.project, context.workpack, `${context.stocks} barra(s)`, `${context.parts} peça(s)`].filter(Boolean).join(' · ');
  if (project) project.value = context.project || '—';
  if (workpack) workpack.value = context.workpack || '—';
  if (savedAt) savedAt.value = formatSavedAt(state.savedAt);
  if (results) results.disabled = !state.dependencies.hasResults?.();
  if (badge) {
    badge.textContent = state.status;
    badge.className = `planner-status-badge ${statusClass(state.status)}`;
  }
}

export function setNestingPlanWorkspaceState({ name, status, savedAt, nameSource } = {}) {
  const nameInput = byId('planner-plan-name');
  if (nameInput && name !== undefined) {
    nameInput.value = text(name);
    if (nameSource) nameInput.dataset.nameSource = nameSource;
  }
  if (status !== undefined) state.status = STATUS[status] || status || STATUS.DRAFT;
  if (savedAt !== undefined) state.savedAt = savedAt;
  refreshNestingPlanWorkspace();
}

export function markNestingPlanDirty({ invalidateResults = false } = {}) {
  if (invalidateResults) state.dependencies.onContentDirty?.();
  state.status = getNestingPlanName() ? STATUS.DIRTY : STATUS.DRAFT;
  refreshNestingPlanWorkspace();
}

function closeMenu() {
  const trigger = byId('btn-planner-more');
  byId('planner-more-actions')?.classList.add('hidden');
  trigger?.setAttribute('aria-expanded', 'false');
}

function toggleMenu() {
  const menu = byId('planner-more-actions');
  const trigger = byId('btn-planner-more');
  const opening = menu?.classList.contains('hidden');
  menu?.classList.toggle('hidden', !opening);
  trigger?.setAttribute('aria-expanded', String(opening));
}

function bindAction(id, action) {
  byId(id)?.addEventListener('click', async () => {
    closeMenu();
    try {
      await action?.();
      refreshNestingPlanWorkspace();
    } catch (error) {
      state.dependencies.onError?.(error);
    }
  });
}

export function initNestingPlanWorkspace(root, dependencies = {}) {
  state.root = root;
  state.dependencies = dependencies;
  if (!root || state.initialized) return;
  state.initialized = true;

  byId('planner-plan-name')?.addEventListener('input', (event) => { event.currentTarget.dataset.nameSource = 'manual'; markNestingPlanDirty(); });
  root.addEventListener('input', (event) => {
    if (event.target.closest('.planner-workspace-header-card')) return;
    markNestingPlanDirty({ invalidateResults: true });
  });
  root.addEventListener('change', (event) => {
    if (event.target.closest('.planner-workspace-header-card')) return;
    markNestingPlanDirty({ invalidateResults: true });
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('#add-stock, #add-part, #import-inventory-btn, #import-coupon-materials-btn, #import-mto-btn, #upload-stock-btn, #upload-parts-btn, .btn-copy, .btn-remove')) setTimeout(() => markNestingPlanDirty({ invalidateResults: true }), 0);
  });

  byId('btn-planner-more')?.addEventListener('click', (event) => { event.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.planner-overflow')) closeMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

  bindAction('btn-planner-back', dependencies.onBack);
  bindAction('save-plan-btn', async () => {
    const name = getNestingPlanName();
    if (!name) {
      byId('planner-plan-name')?.focus();
      dependencies.onMissingName?.();
      return;
    }
    const saved = await dependencies.onSave?.(name);
    if (saved !== false) setNestingPlanWorkspaceState({ name, status: STATUS.SAVED, savedAt: new Date().toISOString(), nameSource: 'manual' });
  });
  bindAction('planner-optimize-btn', dependencies.onOptimize);
  bindAction('btn-planner-save-as', dependencies.onSaveAs);
  bindAction('load-plan-btn', dependencies.onLoad);
  bindAction('btn-planner-open-results', dependencies.onOpenResults);
  bindAction('btn-planner-new', dependencies.onNew);
  refreshNestingPlanWorkspace();
}

export function initNestingResultsCommandBar(root) {
  if (!root || resultsCommandBarInitialized) return;
  resultsCommandBarInitialized = true;
  const trigger = root.querySelector('#btn-results-more');
  const menu = root.querySelector('#results-more-actions');
  const close = () => { menu?.classList.add('hidden'); trigger?.setAttribute('aria-expanded', 'false'); };
  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = menu?.classList.contains('hidden');
    menu?.classList.toggle('hidden', !opening);
    trigger.setAttribute('aria-expanded', String(opening));
  });
  menu?.addEventListener('click', (event) => { if (event.target.closest('[role="menuitem"]')) close(); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.results-overflow')) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}

export { STATUS as NESTING_PLAN_WORKSPACE_STATUS };
