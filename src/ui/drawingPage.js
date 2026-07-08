import { openModal, closeModal } from './modal.js';

const STATUS_OPTIONS = ['DRAFT', 'IFR', 'IFA', 'IFC', 'SUPERSEDED', 'CANCELLED'];

const state = {
  initialized: false,
  dependencies: {},
  drawings: [],
  projects: [],
  equipments: [],
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

function getProjectName(projectId) {
  const project = state.projects.find((item) => projectLabel(item) === projectId || item.id === projectId);
  return projectLabel(project) || projectId;
}

function getEquipmentName(equipmentId) {
  const equipment = state.equipments.find((item) => equipmentValue(item) === equipmentId);
  return equipmentLabel(equipment) || equipmentId;
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = text(value);
  row.appendChild(cell);
}

export function getCurrentDrawingFilters() {
  return {
    projectId: el('drawing-project-filter')?.value || '',
    equipmentId: el('drawing-equipment-filter')?.value || '',
    status: el('drawing-status-filter')?.value || '',
    search: text(el('drawing-search')?.value).trim().toUpperCase(),
  };
}

function equipmentsForProject(projectId) {
  if (!projectId) return state.equipments;
  return state.equipments.filter((equipment) => equipment.projectId === projectId);
}

export function populateDrawingProjectFilter(projects = []) {
  const select = el('drawing-project-filter');
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

export function populateDrawingEquipmentFilter(equipments = []) {
  const select = el('drawing-equipment-filter');
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

function applyClientFilters(drawings) {
  const filters = getCurrentDrawingFilters();
  if (!filters.search) return drawings;
  return drawings.filter((drawing) => [
    drawing.drawingNo,
    drawing.templateDrawingNo,
    drawing.revision,
    drawing.title,
    drawing.discipline,
    drawing.clientReference,
    getProjectName(drawing.projectId),
    getEquipmentName(drawing.equipmentId),
  ].some((value) => text(value).toUpperCase().includes(filters.search)));
}

function compactCounts(items, key) {
  const counts = new Map();
  items.forEach((item) => {
    const value = text(item[key]).trim() || 'N/A';
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => `${label}: ${count}`)
    .join(' / ') || '0';
}

function renderDrawingKpis(drawings) {
  const filtered = applyClientFilters(drawings);
  const total = el('drawing-kpi-total');
  const status = el('drawing-kpi-status');
  const discipline = el('drawing-kpi-discipline');
  if (total) total.textContent = String(filtered.length);
  if (status) status.textContent = compactCounts(filtered, 'status');
  if (discipline) discipline.textContent = compactCounts(filtered, 'discipline');
}

function iconButton(iconName, label, onClick) {
  const button = document.createElement('button');
  button.className = 'icon-action';
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = iconName;
  button.appendChild(icon);
  return button;
}

function appendActionsCell(row, drawing) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.append(
    iconButton('edit', 'Editar drawing', () => openDrawingEditor(drawing)),
    iconButton('content_copy', 'Duplicar para outro equipamento', () => openDuplicateDrawing(drawing.id)),
  );
  cell.appendChild(actions);
  row.appendChild(cell);
}

export function renderDrawingTable(drawings = [], context = {}) {
  const body = context.body || el('drawings-table-body');
  if (!body) return;

  const filtered = applyClientFilters(drawings);
  const rows = filtered.map((drawing) => {
    const row = document.createElement('tr');
    row.dataset.drawingId = drawing.id;
    row.classList.toggle('selected-row', drawing.id === state.selectedId);
    row.addEventListener('click', () => {
      state.selectedId = drawing.id;
      renderDrawingTable(state.drawings);
    });

    appendTextCell(row, drawing.drawingNo);
    appendTextCell(row, drawing.templateDrawingNo);
    appendTextCell(row, drawing.revision);
    appendTextCell(row, drawing.title);
    appendTextCell(row, getProjectName(drawing.projectId));
    appendTextCell(row, getEquipmentName(drawing.equipmentId));
    appendTextCell(row, drawing.discipline);
    appendTextCell(row, drawing.status);
    appendActionsCell(row, drawing);
    return row;
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.className = 'text-muted';
    cell.textContent = 'Nenhum drawing encontrado.';
    row.appendChild(cell);
    rows.push(row);
  }

  body.replaceChildren(...rows);
  renderDrawingKpis(drawings);
}

export async function renderDrawingPage(nextState = {}) {
  if (Array.isArray(nextState.projects)) state.projects = [...nextState.projects];
  if (Array.isArray(nextState.equipments)) state.equipments = [...nextState.equipments];
  if (Array.isArray(nextState.drawings)) state.drawings = [...nextState.drawings];

  populateDrawingProjectFilter(state.projects);
  const filters = getCurrentDrawingFilters();
  populateDrawingEquipmentFilter(equipmentsForProject(filters.projectId));
  renderDrawingTable(state.drawings);
}

export function getSelectedDrawingId() {
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

function setFieldReadonly(field, readonly = false) {
  const input = field.querySelector('input, textarea, select');
  if (input) input.readOnly = Boolean(readonly);
  return field;
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

function updateTemplateHint(input, hint, currentDrawingId = '') {
  const value = text(input.value).trim().toUpperCase();
  if (!value) {
    hint.textContent = '';
    return;
  }

  const count = state.drawings.filter((drawing) => (
    drawing.id !== currentDrawingId && text(drawing.templateDrawingNo).trim().toUpperCase() === value
  )).length;
  hint.textContent = count
    ? `${count} outro(s) desenho(s) usam este template.`
    : 'Nenhum outro desenho usa este template.';
}

function createTemplateField(drawing = {}, options = {}) {
  const wrapper = createField('Desenho Padrao / Template', 'templateDrawingNo', drawing.templateDrawingNo);
  setFieldReadonly(wrapper, options.readonly);
  const input = wrapper.querySelector('[name="templateDrawingNo"]');
  const hint = document.createElement('small');
  hint.className = 'text-muted drawing-template-hint';
  wrapper.appendChild(hint);
  input?.addEventListener('input', () => updateTemplateHint(input, hint, drawing.id || ''));
  if (input) updateTemplateHint(input, hint, drawing.id || '');
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

function refreshEquipmentSelect(form) {
  const projectId = form.elements.projectId?.value || '';
  const current = form.elements.equipmentId?.value || '';
  const field = form.querySelector('[data-equipment-field]');
  if (!field) return;

  const nextField = createSelectField('Equipamento *', 'equipmentId', current, equipmentOptions(projectId));
  nextField.dataset.equipmentField = 'true';
  field.replaceWith(nextField);
}

function bindModalCascade(form) {
  form.elements.projectId?.addEventListener('change', () => {
    refreshEquipmentSelect(form);
    bindModalCascade(form);
  }, { once: true });
}

function buildDrawingForm(drawing = {}, options = {}) {
  const form = document.createElement('form');
  form.className = 'drawing-form-grid';
  const projectId = drawing.projectId || (!drawing.id ? getDefaultProjectId() : '');

  if (options.originalDrawingNo) {
    const subtitle = document.createElement('p');
    subtitle.className = 'text-muted';
    subtitle.textContent = `Original: ${options.originalDrawingNo}`;
    form.appendChild(subtitle);
  }

  const projectField = createSelectField('Projeto *', 'projectId', projectId, projectOptions());
  const equipmentField = createSelectField('Equipamento *', 'equipmentId', drawing.equipmentId, equipmentOptions(projectId));
  equipmentField.dataset.equipmentField = 'true';

  form.append(
    projectField,
    equipmentField,
    createField('Drawing No *', 'drawingNo', drawing.drawingNo),
    createTemplateField(drawing, { readonly: options.templateReadonly }),
    createField('Revision', 'revision', drawing.revision),
    createField('Title', 'title', drawing.title),
    createField('Discipline', 'discipline', drawing.discipline),
    createField('Client Reference', 'clientReference', drawing.clientReference),
    createSelectField('Status', 'status', drawing.status || 'DRAFT', STATUS_OPTIONS.map((status) => ({ value: status, label: status }))),
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
  if (!text(payload.drawingNo).trim()) return 'Drawing No e obrigatorio.';
  return '';
}

async function validateUniqueDrawingNo(payload, currentId = '') {
  const getDrawingByDrawingNo = state.dependencies.getDrawingByDrawingNo;
  if (!getDrawingByDrawingNo) return '';
  const existing = await getDrawingByDrawingNo(payload.drawingNo);
  if (existing && existing.id !== currentId) {
    return 'Drawing number already exists. Please choose another.';
  }
  return '';
}

async function refreshDrawings() {
  const { listDrawings, listProjects, listEquipments } = state.dependencies;
  if (!listDrawings) return;

  const filters = getCurrentDrawingFilters();
  const defaultProjectId = getDefaultProjectId();
  if (defaultProjectId !== state.appliedDefaultProjectId) {
    state.appliedDefaultProjectId = defaultProjectId;
    filters.projectId = defaultProjectId;
    filters.equipmentId = '';
    state.pendingProjectFilterValue = defaultProjectId;
    const equipmentFilter = el('drawing-equipment-filter');
    if (equipmentFilter) equipmentFilter.value = '';
  }
  const [projects, allEquipments] = await Promise.all([
    listProjects ? listProjects() : Promise.resolve(state.projects),
    listEquipments ? listEquipments({}) : Promise.resolve(state.equipments),
  ]);

  state.projects = Array.isArray(projects) ? projects : [];
  state.equipments = Array.isArray(allEquipments) ? allEquipments : [];

  const projectEquipments = equipmentsForProject(filters.projectId);
  if (filters.equipmentId && !projectEquipments.some((equipment) => equipmentValue(equipment) === filters.equipmentId)) {
    const equipmentFilter = el('drawing-equipment-filter');
    if (equipmentFilter) equipmentFilter.value = '';
  }

  const nextFilters = getCurrentDrawingFilters();
  const drawings = await listDrawings({
    projectId: nextFilters.projectId,
    equipmentId: nextFilters.equipmentId,
    status: nextFilters.status,
  });

  state.drawings = Array.isArray(drawings) ? drawings : [];
  if (state.selectedId && !state.drawings.some((drawing) => drawing.id === state.selectedId)) {
    state.selectedId = null;
  }
  await renderDrawingPage();
}

function openDrawingEditor(drawing = null, options = {}) {
  const isDuplicate = Boolean(options.duplicate);
  const isEdit = Boolean(drawing?.id) && !isDuplicate;
  const form = buildDrawingForm(drawing || {}, {
    originalDrawingNo: options.originalDrawingNo,
    templateReadonly: isDuplicate,
  });
  openModal({
    title: isEdit ? 'Editar drawing' : (isDuplicate ? 'Duplicar drawing' : 'Novo drawing'),
    body: form,
    wide: true,
    buttons: [
      { label: 'Cancelar' },
      {
        label: isEdit ? 'Salvar' : (isDuplicate ? 'Salvar como novo drawing' : 'Criar'),
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
            if (isDuplicate) {
              const duplicateMessage = await validateUniqueDrawingNo(payload);
              if (duplicateMessage) {
                showToast(duplicateMessage, 'error');
                return;
              }
            }
            if (isEdit) {
              await state.dependencies.updateDrawing?.(drawing.id, payload);
              showToast('Drawing atualizado.', 'success');
            } else {
              const created = await state.dependencies.createDrawing?.(payload);
              state.selectedId = created?.id || null;
              showToast('Drawing criado.', 'success');
            }
            closeModal();
            await refreshDrawings();
          } catch (error) {
            console.error(error);
            showToast(error?.message || 'Nao foi possivel salvar o drawing.', 'error');
          }
        },
      },
    ],
  });
}

async function openDuplicateDrawing(sourceOrId = {}) {
  try {
    const source = typeof sourceOrId === 'string'
      ? await state.dependencies.getDrawing?.(sourceOrId)
      : sourceOrId;
    if (!source) {
      showToast('Drawing not found', 'error');
      await refreshDrawings();
      return;
    }
    const draft = {
      projectId: source.projectId,
      equipmentId: '',
      drawingNo: source.drawingNo ? `${source.drawingNo}-COPY` : '',
      templateDrawingNo: source.drawingNo,
      revision: source.revision,
      title: source.title,
      discipline: source.discipline,
      clientReference: source.clientReference,
      status: source.status || 'DRAFT',
    };
    openDrawingEditor(draft, { duplicate: true, originalDrawingNo: source.drawingNo });
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel duplicar o drawing.', 'error');
  }
}

async function handleEdit() {
  if (!state.selectedId) {
    showToast('Selecione um drawing para editar.', 'error');
    return;
  }
  const drawing = await state.dependencies.getDrawing?.(state.selectedId);
  if (!drawing) {
    showToast('Drawing nao encontrado.', 'error');
    await refreshDrawings();
    return;
  }
  openDrawingEditor(drawing);
}

async function handleDelete() {
  if (!state.selectedId) {
    showToast('Selecione um drawing para excluir.', 'error');
    return;
  }

  const drawing = await state.dependencies.getDrawing?.(state.selectedId);
  if (!drawing) {
    showToast('Drawing nao encontrado.', 'error');
    await refreshDrawings();
    return;
  }

  const body = document.createElement('div');
  const message = document.createElement('p');
  message.textContent = `Excluir o drawing "${drawing.drawingNo || drawing.title || drawing.id}"?`;
  body.appendChild(message);

  openModal({
    title: 'Excluir drawing',
    body,
    buttons: [
      { label: 'Cancelar' },
      {
        label: 'Excluir',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          try {
            await state.dependencies.deleteDrawing?.(drawing.id);
            state.selectedId = null;
            closeModal();
            await refreshDrawings();
            showToast('Drawing excluido.', 'success');
          } catch (error) {
            console.error(error);
            showToast('Nao foi possivel excluir o drawing.', 'error');
          }
        },
      },
    ],
  });
}

function bindEvents() {
  el('btn-drawing-new')?.addEventListener('click', () => openDrawingEditor());
  el('btn-drawing-edit')?.addEventListener('click', handleEdit);
  el('btn-drawing-delete')?.addEventListener('click', handleDelete);
  el('btn-drawing-refresh')?.addEventListener('click', refreshDrawings);
  el('drawing-project-filter')?.addEventListener('change', refreshDrawings);
  el('drawing-equipment-filter')?.addEventListener('change', refreshDrawings);
  el('drawing-status-filter')?.addEventListener('change', refreshDrawings);
  el('drawing-search')?.addEventListener('input', () => renderDrawingTable(state.drawings));
}

export async function initDrawingPage(options = {}) {
  state.dependencies = { ...state.dependencies, ...options };
  if (!state.initialized) {
    bindEvents();
    state.initialized = true;
  }
  await refreshDrawings();
}
