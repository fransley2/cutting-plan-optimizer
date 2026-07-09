import { parseMtoFile, validateMtoItem } from '../data/mtoImport.js';
import {
  createMtoItem,
  saveMtoImport,
  getMtoItems,
  updateMtoItem,
  deleteMtoItems,
} from '../data/mtoDB.js';
import { getAllProjects } from '../data/projects.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

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
  { id: 'all', label: 'All' },
  { id: 'valid', label: 'Valid' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'missing-material', label: 'Missing Material' },
  { id: 'ready-match', label: 'Ready for Match' },
  { id: 'equipment', label: 'By Equipment' },
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
  return {
    activeTab: 'all',
    equipmentGroup: '',
    editingId: '',
    isAdding: false,
    selectedIds: new Set(),
    filters: {
      search: '',
      drawing: '',
      material: '',
      discipline: '',
      status: '',
    },
    options,
  };
}

function getState(container, options) {
  if (!stateByContainer.has(container)) {
    stateByContainer.set(container, getInitialState(options));
  }
  const state = stateByContainer.get(container);
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

function summarizeItems(items) {
  const valid = items.filter(itemIsValid).length;
  const rejected = items.length - valid;
  return {
    total: items.length,
    valid,
    rejected,
    requiredLength: items.reduce((sum, item) => sum + numericValue(item.requiredLength), 0),
    weight: items.reduce((sum, item) => sum + numericValue(item.weightKg), 0),
    missingMaterial: items.filter((item) => !item.material).length,
    readyForMatch: items.filter((item) => item.status === 'open' && itemIsValid(item)).length,
    tracked: items.filter((item) => ['matched', 'reserved', 'nested'].includes(item.status)).length,
  };
}

function uniqueValues(items, field) {
  return [...new Set(items.map((item) => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function applyTab(items, state) {
  if (state.activeTab === 'valid') return items.filter(itemIsValid);
  if (state.activeTab === 'rejected') return items.filter(itemIsInvalid);
  if (state.activeTab === 'missing-material') return items.filter((item) => !item.material);
  if (state.activeTab === 'ready-match') return items.filter((item) => item.status === 'open' && itemIsValid(item));
  if (state.activeTab === 'equipment' && state.equipmentGroup) {
    return items.filter((item) => getMtoEquipmentKey(item) === state.equipmentGroup);
  }
  return items;
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
  ].join(' ').toLowerCase();
}

function applyFilters(items, filters) {
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
      (!filters.material || item.material === filters.material) &&
      (!filters.discipline || item.discipline === filters.discipline) &&
      (!filters.status || item.status === filters.status)
    );
  });
}

function getVisibleMtoItems(items, state) {
  return applyFilters(applyTab(items, state), state.filters);
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

function renderDashboard(items) {
  const summary = summarizeItems(items);
  const section = createEl('section', 'mto-page-dashboard');
  const grid = createEl('div', 'mto-page-kpi-grid');
  grid.append(
    buildKpiCard('Total MTO Lines', String(summary.total)),
    buildKpiCard('Valid Lines', String(summary.valid)),
    buildKpiCard('Rejected Lines', String(summary.rejected)),
    buildKpiCard('Total Required Length', `${formatNumber(summary.requiredLength, 2)} mm`),
    buildKpiCard('Total Weight', `${formatNumber(summary.weight, 2)} kg`),
    buildKpiCard('Missing Material', String(summary.missingMaterial)),
    buildKpiCard('Ready for Match', String(summary.readyForMatch)),
    buildKpiCard('Matched / Reserved / Nested', String(summary.tracked)),
  );
  section.append(grid);
  return section;
}

function renderTabs(state, rerender) {
  const tabs = createEl('div', 'mto-page-tabs');
  TABS.forEach((tab) => {
    const button = createEl('button', `mto-tabs-item${state.activeTab === tab.id ? ' active' : ''}`, tab.label);
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
    const option = createEl('option', null, item);
    option.value = item;
    option.selected = item === value;
    select.append(option);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  field.append(select);
  return field;
}

function renderFilters(items, state, rerender) {
  const filters = createEl('section', 'mto-page-filters');
  const searchField = createEl('label', 'field');
  searchField.append(createEl('span', null, 'Buscar'));
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

  filters.append(
    searchField,
    renderSelect('Drawing', state.filters.drawing, uniqueValues(items, 'drawing'), (value) => { state.filters.drawing = value; rerender(); }),
    renderSelect('Material', state.filters.material, uniqueValues(items, 'material'), (value) => { state.filters.material = value; rerender(); }),
    renderSelect('Discipline', state.filters.discipline, uniqueValues(items, 'discipline'), (value) => { state.filters.discipline = value; rerender(); }),
    renderSelect('Status', state.filters.status, uniqueValues(items, 'status'), (value) => { state.filters.status = value; rerender(); }),
  );

  const clear = createEl('button', 'btn btn-ghost', 'Limpar filtros');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    state.filters = { search: '', drawing: '', material: '', discipline: '', status: '' };
    rerender();
  });
  filters.append(clear);
  return filters;
}

function renderStatus(item) {
  const className = itemIsInvalid(item)
    ? 'mto-status-chip mto-status-invalid'
    : `mto-status-chip mto-status-${item.status || 'open'}`;
  return createEl('span', className, item.status || 'open');
}

function renderCell(value) {
  const cell = createEl('td');
  cell.textContent = value == null || value === '' ? '-' : String(value);
  return cell;
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

function renderSelectionToolbar(allItems, visibleItems, state, rerender) {
  const toolbar = createEl('section', 'mto-toolbar');
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

  const edit = createEl('button', 'btn btn-ghost', 'Edit selected');
  edit.type = 'button';
  edit.disabled = !canEdit;
  edit.addEventListener('click', () => {
    if (!canEdit) return;
    state.isAdding = false;
    state.editingId = selected[0].id;
    rerender();
  });

  const remove = createEl('button', 'btn btn-critical', 'Delete selected');
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

  const clear = createEl('button', 'btn btn-ghost', 'Clear selection');
  clear.type = 'button';
  clear.disabled = !canDelete;
  clear.addEventListener('click', () => {
    state.selectedIds.clear();
    state.editingId = '';
    rerender();
  });

  const count = createEl('span', 'mto-selection-count', `${selected.length} selecionada(s)`);
  const visibleCount = createEl('span', 'mto-selection-count', `${visibleItems.length} visivel(is)`);
  toolbar.append(add, edit, remove, send, clear, count, visibleCount);
  return toolbar;
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
      option.value = label;
      option.selected = label === state.options.projectId;
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

function renderAddRow(state, rerender) {
  const row = createEl('tr', 'mto-table-row-editing');
  row.append(createEl('td'));

  const statusCell = createEl('td');
  statusCell.append(createEl('span', 'mto-status-chip mto-status-open', 'new'));
  row.append(statusCell);

  EDITABLE_FIELDS.forEach((field) => {
    const cell = createEl('td');
    cell.append(renderEditInput({}, field));
    row.append(cell);
  });

  row.append(renderCell(''));
  const actions = createEl('td', 'mto-table-actions');
  const save = createEl('button', 'btn btn-primary btn-sm', 'Salvar');
  save.type = 'button';
  save.addEventListener('click', async () => {
    try {
      const patch = readEditPatch(row, {});
      const saved = await createMtoItem({
        ...patch,
        batchId: state.options.batchId || '',
        projectId: state.options.projectId || '',
        sourceRowNumber: 0,
      });
      state.isAdding = false;
      state.selectedIds.clear();
      state.selectedIds.add(saved.id);
      showToast('Linha MTO criada.', 'success');
      await rerender(true);
    } catch (error) {
      console.error(error);
      showToast('Falha ao criar linha MTO.', 'error');
    }
  });

  const cancel = createEl('button', 'btn btn-ghost btn-sm', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    state.isAdding = false;
    rerender();
  });
  actions.append(save, cancel);
  row.append(actions);
  return row;
}

function renderTable(items, state, rerender) {
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

  ['Status', 'Drawing', 'Rev', 'Mark', 'POS', 'Qty', 'Description', 'Length/mm', 'IdentCode', 'Material', 'Type', 'Discipline', 'Errors', 'Actions']
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
    cell.colSpan = 15;
    row.append(cell);
    tbody.append(row);
  }

  items.forEach((item) => {
    const row = createEl('tr', itemIsInvalid(item) ? 'mto-table-row-invalid' : '');
    const editing = state.editingId === item.id;

    const selectCell = createEl('td', 'mto-table-select');
    selectCell.append(renderSelectionCheckbox(item, state, rerender));
    row.append(selectCell);

    const statusCell = createEl('td');
    statusCell.append(renderStatus(item));
    row.append(statusCell);

    EDITABLE_FIELDS.forEach((field) => {
      const cell = createEl('td');
      if (editing) {
        cell.append(renderEditInput(item, field));
      } else {
        cell.textContent = field === 'cutLength'
          ? formatNumber(item[field], 2)
          : (item[field] == null || item[field] === '' ? '-' : String(item[field]));
      }
      row.append(cell);
    });

    const errorsCell = renderCell((item.validationErrors || []).join(', '));
    errorsCell.classList.add('mto-table-errors');
    row.append(errorsCell);

    const actions = createEl('td', 'mto-table-actions');
    if (editing) {
      const save = createEl('button', 'btn btn-primary btn-sm', 'Salvar');
      save.type = 'button';
      save.addEventListener('click', async () => {
        try {
          await updateMtoItem(item.id, readEditPatch(row, item));
          state.editingId = '';
          showToast('Linha MTO atualizada.', 'success');
          await rerender(true);
        } catch (error) {
          console.error(error);
          showToast('Falha ao salvar a linha MTO.', 'error');
        }
      });

      const cancel = createEl('button', 'btn btn-ghost btn-sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        state.editingId = '';
        rerender();
      });
      actions.append(save, cancel);
    } else {
      actions.textContent = '-';
    }
    row.append(actions);
    tbody.append(row);
  });

  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

async function handleImport(fileInput, state, rerender) {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const parsed = await parseMtoFile(file, {
      projectId: state.options.projectId || '',
      metadata: { sourceFileName: file.name },
    });
    await saveMtoImport({
      batch: {
        ...parsed.batch,
        projectId: state.options.projectId || '',
        fileName: file.name,
        importedBy: state.options.importedBy || '',
      },
      items: parsed.items,
    });
    showToast(`MTO imported: ${parsed.batch.acceptedCount} valid, ${parsed.batch.rejectedCount} rejected`, 'success');
    await rerender(true);
  } catch (error) {
    console.error(error);
    showToast('Falha ao importar MTO.', 'error');
  } finally {
    fileInput.value = '';
  }
}

async function render(container, state) {
  const items = await getMtoItems(state.options.projectId ? { projectId: state.options.projectId } : {});
  const unlinkedItems = state.options.projectId
    ? (await getMtoItems({})).filter((item) => !item.projectId)
    : items.filter((item) => !item.projectId);
  const existingIds = new Set(items.map((item) => item.id));
  state.selectedIds.forEach((id) => {
    if (!existingIds.has(id)) state.selectedIds.delete(id);
  });
  state.options.onSelectionChange?.(selectedItems(items, state));
  const rerender = (reload = false) => (reload ? refreshMtoPage(container, state.options) : render(container, state));

  const page = createEl('section', 'mto-page');
  const header = createEl('div', 'page-header');
  const titleBlock = createEl('div');
  titleBlock.append(
    createEl('p', 'eyebrow', 'Engineering MTO'),
    createEl('h1', null, 'MTO Management'),
    createEl('p', 'text-muted', 'Import, review and prepare engineering MTO lines before material matching.'),
  );

  const actions = createEl('div', 'page-actions');
  const importButton = createEl('button', 'btn btn-primary', 'Importar MTO');
  importButton.id = 'mto-import-file-btn';
  importButton.type = 'button';
  const fileInput = createEl('input');
  fileInput.id = 'mto-file-input';
  fileInput.type = 'file';
  fileInput.accept = '.csv,.xls,.xlsx';
  fileInput.hidden = true;
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleImport(fileInput, state, () => render(container, state)));
  actions.append(renderViewAllBulkLinkButton(unlinkedItems.length, state, rerender), importButton, fileInput);
  header.append(titleBlock, actions);

  const workspace = createEl('section', 'mto-page-workspace');
  const visibleItems = getVisibleMtoItems(items, state);
  workspace.append(
    renderTabs(state, rerender),
    renderEquipmentGroups(items, state, rerender),
    renderFilters(items, state, rerender),
    renderSelectionToolbar(items, visibleItems, state, rerender),
    renderHiddenItemsWarning(unlinkedItems.length, state, rerender),
    renderTable(visibleItems, state, rerender),
  );

  page.append(header, renderDashboard(items), workspace);
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
