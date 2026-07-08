import { openModal, closeModal } from './modal.js';

const STATUS_OPTIONS = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'CLOSED'];

const state = {
  initialized: false,
  dependencies: {},
  workpacks: [],
  projects: [],
  equipments: [],
  drawings: [],
  selectedId: null,
  appliedDefaultProjectId: null,
  pendingProjectFilterValue: null,
};

const el = (id) => document.getElementById(id);

function text(value) {
  return value == null ? '' : String(value);
}

function showToast(message, type = 'info') {
  state.dependencies.showToast?.(message, type);
}

function getDefaultProjectId() {
  return text(state.dependencies.defaultProjectId).trim();
}

function projectLabel(project = {}) {
  return text(project.name || project.project || project.projectName || project.id);
}

function equipmentLabel(equipment = {}) {
  const code = text(equipment.code);
  const name = text(equipment.name);
  return [code, name].filter(Boolean).join(' - ') || text(equipment.id);
}

function equipmentValue(equipment = {}) {
  return text(equipment.id);
}

function drawingLabel(drawing = {}) {
  const drawingNo = text(drawing.drawingNo);
  const revision = text(drawing.revision);
  const title = text(drawing.title);
  const code = revision ? `${drawingNo} Rev. ${revision}` : drawingNo;
  return [code, title].filter(Boolean).join(' - ') || text(drawing.id);
}

function drawingValue(drawing = {}) {
  return text(drawing.id);
}

function getProjectName(projectId) {
  const project = state.projects.find((item) => projectLabel(item) === projectId || item.id === projectId);
  return projectLabel(project) || projectId;
}

function getEquipmentName(equipmentId) {
  const equipment = state.equipments.find((item) => equipmentValue(item) === equipmentId);
  return equipmentLabel(equipment) || equipmentId;
}

function getDrawingName(drawingId) {
  const drawing = state.drawings.find((item) => drawingValue(item) === drawingId);
  return drawingLabel(drawing) || drawingId;
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = text(value);
  row.appendChild(cell);
}

export function getCurrentWorkpackFilters() {
  return {
    projectId: el('workpack-project-filter')?.value || '',
    equipmentId: el('workpack-equipment-filter')?.value || '',
    drawingId: el('workpack-drawing-filter')?.value || '',
    status: el('workpack-status-filter')?.value || '',
    search: text(el('workpack-search')?.value).trim().toUpperCase(),
  };
}

function equipmentsForProject(projectId) {
  if (!projectId) return state.equipments;
  return state.equipments.filter((equipment) => equipment.projectId === projectId);
}

function drawingsForContext(projectId, equipmentId) {
  return state.drawings.filter((drawing) => {
    if (projectId && drawing.projectId !== projectId) return false;
    if (equipmentId && drawing.equipmentId !== equipmentId) return false;
    return true;
  });
}

export function populateWorkpackProjectFilter(projects = []) {
  const select = el('workpack-project-filter');
  if (!select) return;
  const current = select.value;
  const desired = state.pendingProjectFilterValue ?? current;
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Todos os projetos';

  const options = projects.map((project) => {
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

export function populateWorkpackEquipmentFilter(equipments = []) {
  const select = el('workpack-equipment-filter');
  if (!select) return;
  const current = select.value;
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Todos os equipamentos';

  const options = equipments.map((equipment) => {
    const option = document.createElement('option');
    option.value = equipmentValue(equipment);
    option.textContent = equipmentLabel(equipment) || 'Equipamento sem nome';
    return option;
  });

  select.replaceChildren(allOption, ...options);
  select.value = [...select.options].some((option) => option.value === current) ? current : '';
}

export function populateWorkpackDrawingFilter(drawings = []) {
  const select = el('workpack-drawing-filter');
  if (!select) return;
  const current = select.value;
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Todos os drawings';

  const options = drawings.map((drawing) => {
    const option = document.createElement('option');
    option.value = drawingValue(drawing);
    option.textContent = drawingLabel(drawing) || 'Drawing sem nome';
    return option;
  });

  select.replaceChildren(allOption, ...options);
  select.value = [...select.options].some((option) => option.value === current) ? current : '';
}

function applyClientFilters(workpacks) {
  const filters = getCurrentWorkpackFilters();
  if (!filters.search) return workpacks;
  return workpacks.filter((workpack) => [
    workpack.wpNo,
    workpack.title,
    workpack.discipline,
    getDrawingName(workpack.drawingId),
    getProjectName(workpack.projectId),
    getEquipmentName(workpack.equipmentId),
  ].some((value) => text(value).toUpperCase().includes(filters.search)));
}

export function renderWorkpackTable(workpacks = [], context = {}) {
  const body = context.body || el('workpacks-table-body');
  if (!body) return;

  const rows = applyClientFilters(workpacks).map((workpack) => {
    const row = document.createElement('tr');
    row.dataset.workpackId = workpack.id;
    row.classList.toggle('selected-row', workpack.id === state.selectedId);
    row.addEventListener('click', () => {
      state.selectedId = workpack.id;
      renderWorkpackTable(state.workpacks);
    });

    appendTextCell(row, workpack.wpNo);
    appendTextCell(row, workpack.title);
    appendTextCell(row, getProjectName(workpack.projectId));
    appendTextCell(row, getEquipmentName(workpack.equipmentId));
    appendTextCell(row, getDrawingName(workpack.drawingId));
    appendTextCell(row, workpack.discipline);
    appendTextCell(row, workpack.status);
    return row;
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-muted';
    cell.textContent = 'Nenhum workpack encontrado.';
    row.appendChild(cell);
    rows.push(row);
  }

  body.replaceChildren(...rows);
}

export async function renderWorkpackPage(nextState = {}) {
  if (Array.isArray(nextState.projects)) state.projects = [...nextState.projects];
  if (Array.isArray(nextState.equipments)) state.equipments = [...nextState.equipments];
  if (Array.isArray(nextState.drawings)) state.drawings = [...nextState.drawings];
  if (Array.isArray(nextState.workpacks)) state.workpacks = [...nextState.workpacks];

  populateWorkpackProjectFilter(state.projects);
  const filters = getCurrentWorkpackFilters();
  populateWorkpackEquipmentFilter(equipmentsForProject(filters.projectId));
  populateWorkpackDrawingFilter(drawingsForContext(filters.projectId, filters.equipmentId));
  renderWorkpackTable(state.workpacks);
}

export function getSelectedWorkpackId() {
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

function projectOptions() {
  return [
    { value: '', label: 'Selecione um projeto' },
    ...state.projects.map((project) => {
      const label = projectLabel(project);
      return { value: label, label: label || 'Projeto sem nome' };
    }),
  ];
}

function equipmentOptions(projectId) {
  return [
    { value: '', label: 'Selecione um equipamento' },
    ...equipmentsForProject(projectId).map((equipment) => ({
      value: equipmentValue(equipment),
      label: equipmentLabel(equipment) || 'Equipamento sem nome',
    })),
  ];
}

function drawingOptions(projectId, equipmentId) {
  return [
    { value: '', label: 'Selecione um drawing' },
    ...drawingsForContext(projectId, equipmentId).map((drawing) => ({
      value: drawingValue(drawing),
      label: drawingLabel(drawing) || 'Drawing sem nome',
    })),
  ];
}

function refreshEquipmentSelect(form) {
  const projectId = form.elements.projectId?.value || '';
  const current = form.elements.equipmentId?.value || '';
  const field = form.querySelector('[data-equipment-field]');
  if (!field) return;

  const nextField = createSelectField('Equipamento *', 'equipmentId', current, equipmentOptions(projectId));
  nextField.dataset.equipmentField = 'true';
  field.replaceWith(nextField);
}

function refreshDrawingSelect(form) {
  const projectId = form.elements.projectId?.value || '';
  const equipmentId = form.elements.equipmentId?.value || '';
  const current = form.elements.drawingId?.value || '';
  const field = form.querySelector('[data-drawing-field]');
  if (!field) return;

  const nextField = createSelectField('Drawing *', 'drawingId', current, drawingOptions(projectId, equipmentId));
  nextField.dataset.drawingField = 'true';
  field.replaceWith(nextField);
}

function bindModalCascade(form) {
  form.elements.projectId?.addEventListener('change', () => {
    refreshEquipmentSelect(form);
    refreshDrawingSelect(form);
    bindModalCascade(form);
  }, { once: true });

  form.elements.equipmentId?.addEventListener('change', () => {
    refreshDrawingSelect(form);
    bindModalCascade(form);
  }, { once: true });
}

function buildWorkpackForm(workpack = {}) {
  const form = document.createElement('form');
  form.className = 'workpack-form-grid';
  const projectId = workpack.projectId || (!workpack.id ? getDefaultProjectId() : '');

  const projectField = createSelectField('Projeto *', 'projectId', projectId, projectOptions());
  const equipmentField = createSelectField('Equipamento *', 'equipmentId', workpack.equipmentId, equipmentOptions(projectId));
  const drawingField = createSelectField('Drawing *', 'drawingId', workpack.drawingId, drawingOptions(projectId, workpack.equipmentId));
  equipmentField.dataset.equipmentField = 'true';
  drawingField.dataset.drawingField = 'true';

  form.append(
    projectField,
    equipmentField,
    drawingField,
    createField('WP No *', 'wpNo', workpack.wpNo),
    createField('Titulo', 'title', workpack.title),
    createField('Disciplina', 'discipline', workpack.discipline),
    createField('Planned Start', 'plannedStart', workpack.plannedStart, 'date'),
    createField('Planned Finish', 'plannedFinish', workpack.plannedFinish, 'date'),
    createSelectField('Status', 'status', workpack.status || 'PLANNED', STATUS_OPTIONS.map((status) => ({ value: status, label: status }))),
    createField('Descricao', 'description', workpack.description, 'textarea'),
  );

  bindModalCascade(form);
  return form;
}

function collectFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function validateFormPayload(payload) {
  if (!text(payload.projectId).trim()) return 'Projeto e obrigatorio.';
  if (!text(payload.equipmentId).trim()) return 'Equipamento e obrigatorio.';
  if (!text(payload.drawingId).trim()) return 'Drawing e obrigatorio.';
  if (!text(payload.wpNo).trim()) return 'WP No e obrigatorio.';
  return '';
}

async function refreshWorkpacks() {
  const { listWorkpacks, listProjects, listEquipments, listDrawings } = state.dependencies;
  if (!listWorkpacks) return;

  const filters = getCurrentWorkpackFilters();
  const defaultProjectId = getDefaultProjectId();
  if (defaultProjectId !== state.appliedDefaultProjectId) {
    state.appliedDefaultProjectId = defaultProjectId;
    filters.projectId = defaultProjectId;
    filters.equipmentId = '';
    filters.drawingId = '';
    state.pendingProjectFilterValue = defaultProjectId;
    const equipmentFilter = el('workpack-equipment-filter');
    const drawingFilter = el('workpack-drawing-filter');
    if (equipmentFilter) equipmentFilter.value = '';
    if (drawingFilter) drawingFilter.value = '';
  }
  const [projects, allEquipments, allDrawings] = await Promise.all([
    listProjects ? listProjects() : Promise.resolve(state.projects),
    listEquipments ? listEquipments({}) : Promise.resolve(state.equipments),
    listDrawings ? listDrawings({}) : Promise.resolve(state.drawings),
  ]);

  state.projects = Array.isArray(projects) ? projects : [];
  state.equipments = Array.isArray(allEquipments) ? allEquipments : [];
  state.drawings = Array.isArray(allDrawings) ? allDrawings : [];

  const projectEquipments = equipmentsForProject(filters.projectId);
  if (filters.equipmentId && !projectEquipments.some((equipment) => equipmentValue(equipment) === filters.equipmentId)) {
    const equipmentFilter = el('workpack-equipment-filter');
    if (equipmentFilter) equipmentFilter.value = '';
  }

  const nextEquipmentId = el('workpack-equipment-filter')?.value || '';
  const contextDrawings = drawingsForContext(filters.projectId, nextEquipmentId);
  if (filters.drawingId && !contextDrawings.some((drawing) => drawingValue(drawing) === filters.drawingId)) {
    const drawingFilter = el('workpack-drawing-filter');
    if (drawingFilter) drawingFilter.value = '';
  }

  const nextFilters = getCurrentWorkpackFilters();
  const workpacks = await listWorkpacks({
    projectId: nextFilters.projectId,
    equipmentId: nextFilters.equipmentId,
    drawingId: nextFilters.drawingId,
    status: nextFilters.status,
  });

  state.workpacks = Array.isArray(workpacks) ? workpacks : [];
  if (state.selectedId && !state.workpacks.some((workpack) => workpack.id === state.selectedId)) {
    state.selectedId = null;
  }
  await renderWorkpackPage();
}

function openWorkpackEditor(workpack = null) {
  const isEdit = Boolean(workpack?.id);
  const form = buildWorkpackForm(workpack || {});
  openModal({
    title: isEdit ? 'Editar workpack' : 'Novo workpack',
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
            const message = validateFormPayload(payload);
            if (message) {
              showToast(message, 'error');
              return;
            }
            if (isEdit) {
              await state.dependencies.updateWorkpack?.(workpack.id, payload);
              showToast('Workpack atualizado.', 'success');
            } else {
              const created = await state.dependencies.createWorkpack?.(payload);
              state.selectedId = created?.id || null;
              showToast('Workpack criado.', 'success');
            }
            closeModal();
            await refreshWorkpacks();
          } catch (error) {
            console.error(error);
            showToast(error?.message || 'Nao foi possivel salvar o workpack.', 'error');
          }
        },
      },
    ],
  });
}

async function handleEdit() {
  if (!state.selectedId) {
    showToast('Selecione um workpack para editar.', 'error');
    return;
  }
  const workpack = await state.dependencies.getWorkpack?.(state.selectedId);
  if (!workpack) {
    showToast('Workpack nao encontrado.', 'error');
    await refreshWorkpacks();
    return;
  }
  openWorkpackEditor(workpack);
}

async function handleDelete() {
  if (!state.selectedId) {
    showToast('Selecione um workpack para excluir.', 'error');
    return;
  }

  const workpack = await state.dependencies.getWorkpack?.(state.selectedId);
  if (!workpack) {
    showToast('Workpack nao encontrado.', 'error');
    await refreshWorkpacks();
    return;
  }

  const body = document.createElement('div');
  const message = document.createElement('p');
  message.textContent = `Excluir o workpack "${workpack.wpNo || workpack.title || workpack.id}"?`;
  body.appendChild(message);

  openModal({
    title: 'Excluir workpack',
    body,
    buttons: [
      { label: 'Cancelar' },
      {
        label: 'Excluir',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          try {
            await state.dependencies.deleteWorkpack?.(workpack.id);
            state.selectedId = null;
            closeModal();
            await refreshWorkpacks();
            showToast('Workpack excluido.', 'success');
          } catch (error) {
            console.error(error);
            showToast('Nao foi possivel excluir o workpack.', 'error');
          }
        },
      },
    ],
  });
}

function bindEvents() {
  el('btn-workpack-new')?.addEventListener('click', () => openWorkpackEditor());
  el('btn-workpack-edit')?.addEventListener('click', handleEdit);
  el('btn-workpack-delete')?.addEventListener('click', handleDelete);
  el('btn-workpack-refresh')?.addEventListener('click', refreshWorkpacks);
  el('workpack-project-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-equipment-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-drawing-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-status-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-search')?.addEventListener('input', () => renderWorkpackTable(state.workpacks));
}

export async function initWorkpackPage(options = {}) {
  state.dependencies = { ...state.dependencies, ...options };
  if (!state.initialized) {
    bindEvents();
    state.initialized = true;
  }
  await refreshWorkpacks();
}
