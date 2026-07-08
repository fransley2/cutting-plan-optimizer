import { openModal, closeModal } from './modal.js';

const STATUS_OPTIONS = ['ACTIVE', 'HOLD', 'INACTIVE'];

const state = {
  initialized: false,
  dependencies: {},
  equipments: [],
  projects: [],
  selectedId: null,
  appliedDefaultProjectId: null,
  pendingProjectFilterValue: null,
};

const el = (id) => document.getElementById(id);

function text(value) {
  return value == null ? '' : String(value);
}

function projectLabel(project = {}) {
  return text(project.name || project.project || project.projectName || project.id);
}

function showToast(message, type = 'info') {
  state.dependencies.showToast?.(message, type);
}

function getDefaultProjectId() {
  return text(state.dependencies.defaultProjectId).trim();
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = text(value);
  row.appendChild(cell);
}

function getFilters() {
  return {
    projectId: el('equipment-project-filter')?.value || '',
    status: el('equipment-status-filter')?.value || '',
    search: text(el('equipment-search')?.value).trim().toUpperCase(),
  };
}

function getProjectName(projectId) {
  const project = state.projects.find((item) => projectLabel(item) === projectId || item.id === projectId);
  return projectLabel(project) || projectId;
}

function applyClientFilters(equipments) {
  const filters = getFilters();
  if (!filters.search) return equipments;
  return equipments.filter((equipment) => [
    equipment.code,
    equipment.name,
    equipment.clientTag,
    equipment.discipline,
  ].some((value) => text(value).toUpperCase().includes(filters.search)));
}

function renderProjectFilter() {
  const select = el('equipment-project-filter');
  if (!select) return;
  const current = select.value;
  const desired = state.pendingProjectFilterValue ?? current;
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Todos os projetos';

  const options = state.projects.map((project) => {
    const option = document.createElement('option');
    const label = projectLabel(project);
    option.value = label;
    option.textContent = label || 'Projeto sem nome';
    return option;
  });

  select.replaceChildren(allOption, ...options);
  select.value = [...select.options].some((option) => option.value === desired) ? desired : '';
  state.pendingProjectFilterValue = null;
}

export function renderEquipmentTable(equipments = [], options = {}) {
  const body = options.body || el('equipments-table-body');
  if (!body) return;
  const rows = applyClientFilters(equipments).map((equipment) => {
    const row = document.createElement('tr');
    row.dataset.equipmentId = equipment.id;
    row.classList.toggle('selected-row', equipment.id === state.selectedId);
    row.addEventListener('click', () => {
      state.selectedId = equipment.id;
      renderEquipmentTable(state.equipments);
    });

    appendTextCell(row, getProjectName(equipment.projectId));
    appendTextCell(row, equipment.code);
    appendTextCell(row, equipment.name);
    appendTextCell(row, equipment.clientTag);
    appendTextCell(row, equipment.discipline);
    appendTextCell(row, equipment.status);
    return row;
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'text-muted';
    cell.textContent = 'Nenhum equipamento encontrado.';
    row.appendChild(cell);
    rows.push(row);
  }

  body.replaceChildren(...rows);
}

export async function renderEquipmentPage(nextState = {}) {
  if (Array.isArray(nextState.projects)) state.projects = [...nextState.projects];
  if (Array.isArray(nextState.equipments)) state.equipments = [...nextState.equipments];
  renderProjectFilter();
  renderEquipmentTable(state.equipments);
}

export function getSelectedEquipmentId() {
  return state.selectedId;
}

function createField(label, name, value = '', inputType = 'text') {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';

  const labelText = document.createElement('span');
  labelText.textContent = label;

  const input = inputType === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  input.className = 'input';
  input.name = name;
  input.value = text(value);
  if (inputType !== 'textarea') input.type = inputType;

  wrapper.append(labelText, input);
  return wrapper;
}

function createSelectField(label, name, value, options) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';

  const labelText = document.createElement('span');
  labelText.textContent = label;

  const select = document.createElement('select');
  select.className = 'input';
  select.name = name;
  options.forEach((optionConfig) => {
    const option = document.createElement('option');
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    select.appendChild(option);
  });
  select.value = value || '';

  wrapper.append(labelText, select);
  return wrapper;
}

function buildEquipmentForm(equipment = {}) {
  const form = document.createElement('form');
  form.className = 'equipment-form-grid';
  const projectId = equipment.projectId || (!equipment.id ? getDefaultProjectId() : '');

  const projectOptions = [
    { value: '', label: 'Sem projeto' },
    ...state.projects.map((project) => {
      const label = projectLabel(project);
      return { value: label, label: label || 'Projeto sem nome' };
    }),
  ];

  form.append(
    createSelectField('Project', 'projectId', projectId, projectOptions),
    createField('Code', 'code', equipment.code),
    createField('Name', 'name', equipment.name),
    createField('Client Tag', 'clientTag', equipment.clientTag),
    createField('Discipline', 'discipline', equipment.discipline),
    createSelectField('Status', 'status', equipment.status || 'ACTIVE', STATUS_OPTIONS.map((status) => ({ value: status, label: status }))),
    createField('Description', 'description', equipment.description, 'textarea'),
  );

  return form;
}

function collectFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function refreshEquipments() {
  const { listEquipments, listProjects } = state.dependencies;
  if (!listEquipments) return;
  const filters = getFilters();
  const defaultProjectId = getDefaultProjectId();
  if (defaultProjectId !== state.appliedDefaultProjectId) {
    state.appliedDefaultProjectId = defaultProjectId;
    filters.projectId = defaultProjectId;
    state.pendingProjectFilterValue = defaultProjectId;
  }
  const [equipments, projects] = await Promise.all([
    listEquipments({ projectId: filters.projectId, status: filters.status }),
    listProjects ? listProjects() : Promise.resolve(state.projects),
  ]);
  state.equipments = Array.isArray(equipments) ? equipments : [];
  state.projects = Array.isArray(projects) ? projects : [];
  if (state.selectedId && !state.equipments.some((equipment) => equipment.id === state.selectedId)) {
    state.selectedId = null;
  }
  await renderEquipmentPage();
}

function openEquipmentEditor(equipment = null) {
  const isEdit = Boolean(equipment?.id);
  const form = buildEquipmentForm(equipment || {});
  openModal({
    title: isEdit ? 'Editar equipamento' : 'Novo equipamento',
    body: form,
    wide: true,
    buttons: [
      { label: 'Cancelar' },
      {
        label: isEdit ? 'Salvar' : 'Criar',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          try {
            const payload = collectFormData(form);
            if (isEdit) {
              await state.dependencies.updateEquipment?.(equipment.id, payload);
              showToast('Equipamento atualizado.', 'success');
            } else {
              const created = await state.dependencies.createEquipment?.(payload);
              state.selectedId = created?.id || null;
              showToast('Equipamento criado.', 'success');
            }
            closeModal();
            await refreshEquipments();
          } catch (error) {
            console.error(error);
            showToast('Nao foi possivel salvar o equipamento.', 'error');
          }
        },
      },
    ],
  });
}

async function handleEdit() {
  if (!state.selectedId) {
    showToast('Selecione um equipamento para editar.', 'error');
    return;
  }
  const equipment = await state.dependencies.getEquipment?.(state.selectedId);
  if (!equipment) {
    showToast('Equipamento nao encontrado.', 'error');
    await refreshEquipments();
    return;
  }
  openEquipmentEditor(equipment);
}

async function handleDelete() {
  if (!state.selectedId) {
    showToast('Selecione um equipamento para excluir.', 'error');
    return;
  }

  const equipment = await state.dependencies.getEquipment?.(state.selectedId);
  if (!equipment) {
    showToast('Equipamento nao encontrado.', 'error');
    await refreshEquipments();
    return;
  }

  const body = document.createElement('div');
  const message = document.createElement('p');
  message.textContent = `Excluir o equipamento "${equipment.code || equipment.name || equipment.id}"?`;
  body.appendChild(message);

  openModal({
    title: 'Excluir equipamento',
    body,
    buttons: [
      { label: 'Cancelar' },
      {
        label: 'Excluir',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          try {
            await state.dependencies.deleteEquipment?.(equipment.id);
            state.selectedId = null;
            closeModal();
            await refreshEquipments();
            showToast('Equipamento excluido.', 'success');
          } catch (error) {
            console.error(error);
            showToast('Nao foi possivel excluir o equipamento.', 'error');
          }
        },
      },
    ],
  });
}

function bindEvents() {
  el('btn-equipment-new')?.addEventListener('click', () => openEquipmentEditor());
  el('btn-equipment-edit')?.addEventListener('click', handleEdit);
  el('btn-equipment-delete')?.addEventListener('click', handleDelete);
  el('btn-equipment-refresh')?.addEventListener('click', refreshEquipments);
  el('equipment-project-filter')?.addEventListener('change', refreshEquipments);
  el('equipment-status-filter')?.addEventListener('change', refreshEquipments);
  el('equipment-search')?.addEventListener('input', () => renderEquipmentTable(state.equipments));
}

export async function initEquipmentPage(options = {}) {
  state.dependencies = { ...state.dependencies, ...options };
  if (!state.initialized) {
    bindEvents();
    state.initialized = true;
  }
  await refreshEquipments();
}
