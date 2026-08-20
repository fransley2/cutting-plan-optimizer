import { openModal, closeModal } from './modal.js';
import { createInfoModalContent } from './infoModalContent.js';
import { drawingDesignReference } from '../core/equipmentDrawingLinks.js';

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

function projectValue(project = {}) {
  return text(project.id || projectLabel(project));
}

function equipmentLabel(equipment = {}) {
  const structured = [equipment.fieldLocation, equipment.system, equipment.equipmentType, equipment.variant]
    .map((value) => text(value).trim())
    .filter(Boolean);
  if (structured.length) return structured.join(' - ');
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

function getEquipment(equipmentId) {
  return state.equipments.find((item) => equipmentValue(item) === equipmentId) || null;
}

function getDrawingDesignReference(drawing = {}) {
  return drawingDesignReference(drawing, getEquipment(drawing.equipmentId) || {});
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = text(value);
  row.appendChild(cell);
}

function appendDrawingEquipmentCell(row, drawing) {
  const cell = document.createElement('td');
  const content = document.createElement('div');
  content.className = 'drawing-equipment-cell';
  const name = document.createElement('strong');
  name.textContent = getEquipmentName(drawing.equipmentId) || 'Não vinculado';
  const project = document.createElement('small');
  project.className = 'text-muted';
  project.textContent = getProjectName(drawing.projectId);
  content.append(name, project);
  cell.appendChild(content);
  row.appendChild(cell);
}

function appendDrawingFileCell(row, drawing) {
  const cell = document.createElement('td');
  const hasFile = Boolean(drawingFileSource(drawing));
  const hasLink = Boolean(safeDrawingFileUrl(drawing.fileUrl));
  const badge = document.createElement('span');
  badge.className = `drawing-file-badge${hasFile ? ' available' : ''}`;
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = hasLink ? 'link' : hasFile ? 'picture_as_pdf' : 'link_off';
  const label = document.createElement('span');
  label.textContent = hasLink ? 'Link disponível' : hasFile ? drawing.fileName || 'Arquivo anterior' : 'Pendente';
  badge.append(icon, label);
  cell.appendChild(badge);
  row.appendChild(cell);
}

function safeDrawingFileUrl(value) {
  const source = text(value).trim();
  if (/^data:application\/pdf;base64,/i.test(source)) return source;
  try {
    const url = new URL(source);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function drawingFileSource(drawing = {}) {
  return safeDrawingFileUrl(drawing.fileUrl) || safeDrawingFileUrl(drawing.fileDataUrl);
}

function openDrawingFile(value) {
  const href = safeDrawingFileUrl(value);
  if (!href) {
    showToast('O link do arquivo deste drawing nao e valido.', 'error');
    return;
  }
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
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
    option.value = projectValue(project);
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
    getDrawingDesignReference(drawing),
    drawing.revision,
    drawing.title,
    drawing.discipline,
    drawing.clientReference,
    drawing.fileUrl,
    drawing.fileName,
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
  button.addEventListener('dblclick', (event) => event.stopPropagation());

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
  const fileSource = drawingFileSource(drawing);
  if (fileSource) {
    actions.append(iconButton('open_in_new', 'Abrir link do Shop Drawing', () => openDrawingFile(fileSource)));
  }
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
      body.querySelectorAll('tr[data-drawing-id]').forEach((candidate) => {
        candidate.classList.toggle('selected-row', candidate.dataset.drawingId === drawing.id);
      });
    });
    row.addEventListener('dblclick', () => {
      state.selectedId = drawing.id;
      openDrawingInfo(drawing);
    });

    appendTextCell(row, drawing.drawingNo);
    appendTextCell(row, drawing.revision);
    appendTextCell(row, getDrawingDesignReference(drawing));
    appendDrawingEquipmentCell(row, drawing);
    appendDrawingFileCell(row, drawing);
    appendTextCell(row, drawing.status);
    appendActionsCell(row, drawing);
    return row;
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
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

function createField(label, name, value = '', inputType = 'text', attrs = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';

  const labelText = document.createElement('span');
  labelText.textContent = label;

  const input = inputType === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  input.className = 'input';
  input.name = name;
  input.value = text(value);
  if (inputType !== 'textarea') input.type = inputType;
  Object.entries(attrs).forEach(([key, attrValue]) => input.setAttribute(key, attrValue));

  wrapper.append(labelText, input);
  return wrapper;
}

function createSelectField(label, name, value, options, attrs = {}) {
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
    option.disabled = Boolean(optionConfig.disabled);
    select.appendChild(option);
  });
  select.value = value || '';
  Object.entries(attrs).forEach(([key, attrValue]) => select.setAttribute(key, attrValue));

  wrapper.append(labelText, select);
  return wrapper;
}

function createHiddenField(name, value = '') {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = text(value);
  return input;
}

function lockSelectField(field, name, value) {
  const select = field.querySelector('select');
  if (select) select.disabled = true;
  field.classList.add('drawing-context-locked');
  field.appendChild(createHiddenField(name, value));
  return field;
}

function createAdvancedSection(fields = []) {
  const details = document.createElement('details');
  details.className = 'drawing-advanced-section';
  const summary = document.createElement('summary');
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'tune';
  const title = document.createElement('strong');
  title.textContent = 'Mais opções';
  const helper = document.createElement('small');
  helper.className = 'text-muted';
  helper.textContent = 'Título, disciplina, status e observações';
  summary.append(icon, title, helper);
  const grid = document.createElement('div');
  grid.className = 'drawing-advanced-grid';
  grid.append(...fields);
  details.append(summary, grid);
  return details;
}

function createDrawingLinkField(drawing = {}) {
  const section = document.createElement('section');
  section.className = 'drawing-file-field';
  const label = document.createElement('span');
  label.className = 'drawing-file-label';
  label.textContent = 'Link do Shop Drawing';
  const input = document.createElement('input');
  input.type = 'url';
  input.name = 'fileUrl';
  input.className = 'input';
  input.placeholder = 'https://sharepoint...';
  input.value = text(drawing.fileUrl);
  const hiddenData = createHiddenField('fileDataUrl', drawing.fileDataUrl);
  const hiddenName = createHiddenField('fileName', drawing.fileName);
  const hiddenType = createHiddenField('fileType', drawing.fileType);
  const hiddenSize = createHiddenField('fileSize', drawing.fileSize);
  const helper = document.createElement('small');
  helper.className = 'text-muted';
  const actions = document.createElement('div');
  actions.className = 'drawing-file-actions';
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'btn btn-ghost';
  openButton.textContent = 'Abrir link';
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-ghost';
  removeButton.textContent = 'Remover vínculo';

  const render = () => {
    const link = safeDrawingFileUrl(input.value);
    const legacyFile = safeDrawingFileUrl(hiddenData.value);
    helper.textContent = link
      ? 'Link externo vinculado. Pode apontar para SharePoint, OneDrive ou outro sistema documental.'
      : legacyFile
        ? 'Existe um arquivo antigo armazenado no navegador. Cole um link para substituí-lo.'
        : 'Cole o link do Shop Drawing no SharePoint, OneDrive ou sistema documental.';
    openButton.textContent = link || !legacyFile ? 'Abrir link' : 'Abrir arquivo anterior';
    openButton.disabled = !(link || legacyFile);
    removeButton.disabled = !(text(input.value).trim() || legacyFile);
  };

  input.addEventListener('input', () => {
    if (text(input.value).trim()) {
      hiddenData.value = '';
      hiddenName.value = '';
      hiddenType.value = '';
      hiddenSize.value = '0';
    }
    render();
  });
  openButton.addEventListener('click', () => openDrawingFile(safeDrawingFileUrl(input.value) || safeDrawingFileUrl(hiddenData.value)));
  removeButton.addEventListener('click', () => {
    input.value = '';
    hiddenData.value = '';
    hiddenName.value = '';
    hiddenType.value = '';
    hiddenSize.value = '0';
    render();
  });

  actions.append(openButton, removeButton);
  section.append(label, input, hiddenData, hiddenName, hiddenType, hiddenSize, helper, actions);
  render();
  return section;
}

function createEngineeringCodeField(drawing = {}) {
  const field = createField('Design Drawing / Engineering Reference', 'engineeringCode', getDrawingDesignReference(drawing));
  field.dataset.engineeringReferenceField = 'true';
  const input = field.querySelector('[name="engineeringCode"]');
  input.readOnly = true;
  input.dataset.legacyReference = text(drawing.engineeringCode).trim();
  input.dataset.legacyEquipmentId = text(drawing.equipmentId).trim();
  input.dataset.allowLegacy = drawing.id ? 'true' : 'false';
  field.appendChild(document.createElement('small'));
  return field;
}

function syncEngineeringReference(form) {
  const field = form.querySelector('[data-engineering-reference-field]');
  const input = field?.querySelector('[name="engineeringCode"]');
  const helper = field?.querySelector('small');
  if (!input || !helper) return;
  const selectedEquipmentId = text(form.elements.equipmentId?.value).trim();
  const equipment = getEquipment(selectedEquipmentId);
  const inherited = text(equipment?.designDrawingNo).trim();
  const legacy = input.dataset.allowLegacy === 'true'
    && selectedEquipmentId === text(input.dataset.legacyEquipmentId).trim()
    ? text(input.dataset.legacyReference).trim()
    : '';
  input.value = inherited || legacy;
  helper.className = 'text-muted drawing-engineering-code-hint';
  helper.textContent = inherited
    ? 'Referência herdada do Equipment selecionado.'
    : legacy
      ? 'Referência legada; cadastre-a no Equipment para centralizar o dado.'
      : 'Cadastre o Design Drawing no Equipment selecionado.';
}

function projectOptions() {
  return [
    { value: '', label: 'Selecione um projeto', disabled: true },
    ...state.projects.map((project) => {
      const label = projectLabel(project);
      return { value: projectValue(project), label: label || 'Projeto sem nome' };
    }),
  ];
}

function equipmentOptions(projectId) {
  return [
    { value: '', label: 'Selecione um equipamento', disabled: true },
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

  const nextField = createSelectField('Equipamento *', 'equipmentId', current, equipmentOptions(projectId), { required: '' });
  nextField.dataset.equipmentField = 'true';
  field.replaceWith(nextField);
  syncEngineeringReference(form);
}

function bindModalCascade(form) {
  form.elements.projectId?.addEventListener('change', () => {
    refreshEquipmentSelect(form);
    bindModalCascade(form);
  }, { once: true });
  form.elements.equipmentId?.addEventListener('change', () => syncEngineeringReference(form));
}

function buildDrawingForm(drawing = {}, options = {}) {
  const form = document.createElement('form');
  form.className = 'drawing-form-grid';
  const projectId = drawing.projectId || (!drawing.id ? getDefaultProjectId() : '');

  if (options.originalDrawingNo) {
    const subtitle = document.createElement('p');
    subtitle.className = 'text-muted';
    subtitle.classList.add('drawing-field-full');
    subtitle.textContent = `Original: ${options.originalDrawingNo}`;
    form.appendChild(subtitle);
  }

  const projectField = createSelectField('Projeto *', 'projectId', projectId, projectOptions(), { required: '' });
  const equipmentField = createSelectField('Equipamento *', 'equipmentId', drawing.equipmentId, equipmentOptions(projectId), { required: '' });
  equipmentField.dataset.equipmentField = 'true';
  projectField.classList.add('drawing-field-full');
  equipmentField.classList.add('drawing-field-full');
  const drawingNoField = createField('Shop Drawing No *', 'drawingNo', drawing.drawingNo, 'text', { required: '' });
  const revisionField = createField('Revision', 'revision', drawing.revision || (!drawing.id ? '00' : ''));
  const engineeringCodeField = createEngineeringCodeField(drawing);
  engineeringCodeField.classList.add('drawing-field-full');

  if (options.lockContext) {
    lockSelectField(projectField, 'projectId', projectId);
    lockSelectField(equipmentField, 'equipmentId', drawing.equipmentId);
  }

  form.append(
    projectField,
    equipmentField,
    drawingNoField,
    revisionField,
    engineeringCodeField,
    createDrawingLinkField(drawing),
    createAdvancedSection([
      createField('Title', 'title', drawing.title),
      createField('Discipline', 'discipline', drawing.discipline),
      createSelectField('Status', 'status', drawing.status || (!drawing.id ? 'IFC' : 'DRAFT'), STATUS_OPTIONS.map((status) => ({ value: status, label: status }))),
      createField('Observações', 'notes', drawing.notes, 'textarea'),
    ]),
  );

  if (!options.lockContext) bindModalCascade(form);
  syncEngineeringReference(form);
  return form;
}

function collectFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function validateFormPayload(payload) {
  if (!text(payload.projectId).trim()) return 'Projeto e obrigatorio.';
  if (!text(payload.equipmentId).trim()) return 'Equipamento e obrigatorio.';
  if (!text(payload.drawingNo).trim()) return 'Drawing No e obrigatorio.';
  if (text(payload.fileUrl).trim() && !safeDrawingFileUrl(payload.fileUrl)) return 'Informe um link http ou https valido para o arquivo do drawing.';
  if (text(payload.fileDataUrl).trim() && !safeDrawingFileUrl(payload.fileDataUrl)) return 'O arquivo selecionado não é um PDF válido.';
  return '';
}

async function validateUniqueDrawingNo(payload, currentId = '') {
  const getDrawingByDrawingNo = state.dependencies.getDrawingByDrawingNo;
  if (!getDrawingByDrawingNo) return '';
  const existing = await getDrawingByDrawingNo(payload.drawingNo, { projectId: payload.projectId });
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
    lockContext: options.lockContext,
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
              const updated = await state.dependencies.updateDrawing?.(drawing.id, payload);
              state.selectedId = updated?.id || drawing.id;
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

export function openNewDrawingForEquipment({ projectId = '', equipmentId = '' } = {}) {
  if (!projectId || !equipmentId) {
    showToast('Projeto e equipamento são obrigatórios para adicionar um Drawing.', 'error');
    return;
  }
  openDrawingEditor({ projectId, equipmentId }, { lockContext: true });
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
      engineeringCode: source.engineeringCode,
      revision: source.revision,
      title: source.title,
      discipline: source.discipline,
      clientReference: source.clientReference,
      fileUrl: source.fileUrl,
      fileDataUrl: source.fileDataUrl,
      fileName: source.fileName,
      fileType: source.fileType,
      fileSize: source.fileSize,
      notes: source.notes,
      status: source.status || 'DRAFT',
    };
    openDrawingEditor(draft, { duplicate: true, originalDrawingNo: source.drawingNo });
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel duplicar o drawing.', 'error');
  }
}

function openDrawingInfo(drawing) {
  const fileUrl = drawingFileSource(drawing);
  const body = createInfoModalContent({
    details: [
      { label: 'Shop Drawing No', value: drawing.drawingNo },
      { label: 'Design Drawing / Engineering Reference', value: getDrawingDesignReference(drawing) },
      { label: 'Revision', value: drawing.revision },
      { label: 'Title', value: drawing.title },
      { label: 'Projeto', value: getProjectName(drawing.projectId) },
      { label: 'Equipamento', value: getEquipmentName(drawing.equipmentId) },
      { label: 'Disciplina', value: drawing.discipline },
      { label: 'Status', value: drawing.status },
      { label: 'Link do Shop Drawing', value: safeDrawingFileUrl(drawing.fileUrl) ? 'Link externo disponível' : fileUrl ? 'Arquivo anterior disponível' : '' },
    ],
  });
  openModal({
    title: 'Drawing Info',
    body,
    wide: true,
    buttons: [
      ...(drawing.drawingNo ? [{
        label: 'Ver MTO do desenho',
        variant: 'btn-secondary',
        closeOnClick: false,
        onClick: () => {
          closeModal();
          state.dependencies.onOpenMto?.({
            projectId: drawing.projectId,
            drawing: drawing.drawingNo,
            equipmentId: drawing.equipmentId,
          });
        },
      }] : []),
      {
        label: 'Editar',
        variant: 'btn-secondary',
        closeOnClick: false,
        onClick: () => {
          closeModal();
          openDrawingEditor(drawing);
        },
      },
      ...(fileUrl ? [{
        label: safeDrawingFileUrl(drawing.fileUrl) ? 'Abrir link do Shop Drawing' : 'Abrir arquivo anterior',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: () => openDrawingFile(fileUrl),
      }] : []),
    ],
  });
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
