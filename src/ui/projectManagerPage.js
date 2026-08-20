import { openModal, closeModal } from './modal.js';
import { projectTraceabilityCode } from '../core/materialTraceability.js';

const STATUS_OPTIONS = ['ACTIVE', 'HOLD', 'INACTIVE'];
const STATUS_LABELS = Object.freeze({
  ACTIVE: 'Status: Ativo',
  HOLD: 'Status: Em espera',
  INACTIVE: 'Status: Inativo',
  LEGACY: 'Status: Migrado',
});

const state = {
  initialized: false,
  dependencies: {},
  projects: [],
  linkedEquipmentByProject: new Map(),
  selectedName: '',
};

const el = (id) => document.getElementById(id);

function text(value) {
  return value == null ? '' : String(value);
}

function projectName(project = {}) {
  return text(project.name || project.project || project.projectName || project.id).trim();
}

function showToast(message, type = 'info') {
  state.dependencies.showToast?.(message, type);
}

function projectStatusLabel(status) {
  const key = text(status || 'LEGACY').trim().toUpperCase() || 'LEGACY';
  return STATUS_LABELS[key] || `Status: ${key}`;
}

function createText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text(value);
  return element;
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
  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });
  select.value = value || 'ACTIVE';

  wrapper.append(labelText, select);
  return wrapper;
}

function collectFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function buildProjectForm(project = {}) {
  const form = document.createElement('form');
  form.className = 'project-manager-form-grid';
  const suggestedMaterialCode = project.traceabilityCode || projectTraceabilityCode(project) || project.shortCode;
  const nameField = createField('Nome *', 'name', projectName(project)); const codeField = createField('Codigo', 'code', project.code); const shortCodeField = createField('Sigla operacional', 'shortCode', project.shortCode); const materialCodeField = createField('Sigla de materiais *', 'traceabilityCode', suggestedMaterialCode);
  const materialCodeInput = materialCodeField.querySelector('input'); materialCodeInput.required = true; materialCodeInput.maxLength = 4; materialCodeInput.pattern = '[A-Za-z0-9]{1,4}'; materialCodeInput.title = 'Use de 1 a 4 letras ou números, por exemplo G, LU, B5 ou RA.';
  let useSuggestedMaterialCode = !text(project.traceabilityCode).trim();
  function updateMaterialCodeSuggestion() {
    if (!useSuggestedMaterialCode) return;
    const values = { name: nameField.querySelector('input').value, code: codeField.querySelector('input').value, shortCode: shortCodeField.querySelector('input').value };
    materialCodeInput.value = projectTraceabilityCode(values) || text(values.shortCode).trim().toUpperCase();
  }
  [nameField, codeField, shortCodeField].forEach((field) => field.querySelector('input').addEventListener('input', updateMaterialCodeSuggestion));
  materialCodeInput.addEventListener('input', () => { useSuggestedMaterialCode = !materialCodeInput.value.trim(); });
  form.append(
    nameField,
    createField('Cliente', 'client', project.client),
    codeField,
    shortCodeField,
    materialCodeField,
    createSelectField('Status', 'status', project.status || 'ACTIVE', STATUS_OPTIONS),
    createField('Descricao', 'description', project.description, 'textarea'),
  );
  return form;
}

function equipmentLabel(equipment = {}) {
  const code = text(equipment.code);
  const name = text(equipment.name);
  return [code, name].filter(Boolean).join(' - ') || text(equipment.id);
}

function renderEquipmentList(project) {
  const name = projectName(project);
  const items = state.linkedEquipmentByProject.get(name) || [];
  const wrapper = document.createElement('div');
  wrapper.className = 'project-manager-equipment-list';
  wrapper.append(createText('h3', null, 'Equipamentos vinculados'));

  if (!items.length) {
    wrapper.append(createText('p', 'text-muted', 'Nenhum equipamento vinculado a este projeto.'));
    return wrapper;
  }

  const list = document.createElement('ul');
  items.forEach((equipment) => {
    const item = document.createElement('li');
    item.textContent = `${equipmentLabel(equipment)}${equipment.status ? ` - ${equipment.status}` : ''}`;
    list.appendChild(item);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function renderProjectCard(project) {
  const name = projectName(project);
  const linkedEquipment = state.linkedEquipmentByProject.get(name) || [];
  const selectedInManager = state.selectedName === name;
  const inUse = text(state.dependencies.activeProjectName).trim() === name;
  const card = document.createElement('article');
  card.className = `project-manager-card${selectedInManager ? ' active' : ''}${inUse ? ' in-use' : ''}`;

  const header = document.createElement('div');
  header.className = 'project-manager-card-header';
  const title = document.createElement('div');
  const projectTitle = document.createElement('div');
  projectTitle.className = 'project-manager-title';
  if (text(project.shortCode).trim()) {
    projectTitle.append(createText('span', 'project-short-code', project.shortCode));
  }
  projectTitle.append(createText('h2', null, name || 'Projeto sem nome'));
  title.append(
    projectTitle,
    createText('p', 'text-muted', project.client || 'Cliente nao informado'),
  );
  if (selectedInManager || inUse) {
    const indicators = document.createElement('div');
    indicators.className = 'project-manager-selection-indicators';
    if (selectedInManager) {
      indicators.append(createText('span', 'project-selection-pill', 'Selecionado'));
    }
    if (inUse) {
      indicators.append(createText('span', 'project-in-use-pill', 'Em uso'));
    }
    title.append(indicators);
  }
  const status = createText('span', 'project-status-pill', projectStatusLabel(project.status));
  header.append(title, status);

  const meta = document.createElement('div');
  meta.className = 'project-manager-meta';
  meta.append(
    createText('span', null, `Codigo: ${project.code || '-'}`),
    createText('span', null, `Sigla: ${project.shortCode || '-'}`),
    createText('span', 'project-material-code', `Materiais: ${project.traceabilityCode || projectTraceabilityCode(project) || '-'}`),
    createText('span', null, `Equipamentos: ${linkedEquipment.length}`),
  );

  const actions = document.createElement('div');
  actions.className = 'project-manager-actions';
  const openButton = createText('button', 'btn btn-secondary', 'Abrir');
  openButton.type = 'button';
  openButton.addEventListener('click', () => {
    state.selectedName = name;
    renderProjectManagerPage();
  });
  const editButton = createText('button', 'btn btn-secondary', 'Editar');
  editButton.type = 'button';
  editButton.addEventListener('click', () => openProjectEditor(project));
  const equipmentButton = createText('button', 'btn btn-ghost', 'Equipamentos');
  equipmentButton.type = 'button';
  equipmentButton.addEventListener('click', () => state.dependencies.openEquipmentsPage?.());
  actions.append(openButton, editButton, equipmentButton);

  card.append(header, meta, actions);
  if (selectedInManager) card.append(renderEquipmentList(project));
  return card;
}

export function renderProjectManagerPage(nextState = {}) {
  if (Array.isArray(nextState.projects)) state.projects = [...nextState.projects];
  if (nextState.linkedEquipmentByProject instanceof Map) {
    state.linkedEquipmentByProject = nextState.linkedEquipmentByProject;
  }

  const list = el('project-manager-list');
  if (!list) return;

  const projects = state.projects;
  if (state.selectedName && !projects.some((project) => projectName(project) === state.selectedName)) {
    state.selectedName = '';
  }

  if (!projects.length) {
    const empty = document.createElement('div');
    empty.className = 'placeholder-panel';
    empty.append(
      createText('strong', null, 'Nenhum projeto cadastrado.'),
      createText('p', null, 'Crie um projeto para iniciar o Master Data FMS.'),
    );
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(...projects.map(renderProjectCard));
}

function openProjectEditor(project = null) {
  const isEdit = Boolean(projectName(project || {}));
  const form = buildProjectForm(project || {});
  openModal({
    title: isEdit ? 'Editar projeto' : 'Novo projeto',
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
            if (!form.reportValidity()) return;
            if (!text(payload.name).trim()) {
              showToast('Nome do projeto e obrigatorio.', 'error');
              return;
            }
            if (isEdit) {
              const updated = await state.dependencies.updateProject?.(projectName(project), payload);
              state.selectedName = projectName(updated || payload);
              showToast('Projeto atualizado.', 'success');
            } else {
              const created = await state.dependencies.createProject?.(payload);
              state.selectedName = projectName(created || payload);
              showToast('Projeto criado.', 'success');
            }
            closeModal();
            await refreshProjectManagerPage();
          } catch (error) {
            console.error(error);
            showToast(error?.message || 'Nao foi possivel salvar o projeto.', 'error');
          }
        },
      },
    ],
  });
}

async function openDeleteDialog() {
  if (!state.selectedName) {
    showToast('Selecione um projeto para excluir.', 'error');
    return;
  }

  const project = state.projects.find((item) => projectName(item) === state.selectedName);
  if (!project) {
    showToast('Projeto nao encontrado.', 'error');
    await refreshProjectManagerPage();
    return;
  }

  const linkedEquipment = await state.dependencies.listEquipments?.({ projectId: project.id }) || [];
  const body = document.createElement('div');
  body.appendChild(createText('p', null, `Excluir o projeto "${state.selectedName}"?`));
  if (linkedEquipment.length > 0) {
    body.appendChild(createText(
      'p',
      'text-muted',
      `Este projeto possui ${linkedEquipment.length} equipamento(s) vinculado(s). Excluir o projeto nao removera os equipamentos, mas eles ficarao orfaos.`,
    ));
  }

  openModal({
    title: 'Excluir projeto',
    body,
    buttons: [
      { label: 'Cancelar' },
      {
        label: 'Excluir',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          try {
            await state.dependencies.deleteProject?.(state.selectedName);
            state.selectedName = '';
            closeModal();
            await refreshProjectManagerPage();
            showToast('Projeto excluido.', 'success');
          } catch (error) {
            console.error(error);
            showToast('Nao foi possivel excluir o projeto.', 'error');
          }
        },
      },
    ],
  });
}

export async function refreshProjectManagerPage() {
  const { listProjects, listEquipments } = state.dependencies;
  if (!listProjects) return;

  const projects = await listProjects();
  const linkedEntries = await Promise.all((Array.isArray(projects) ? projects : []).map(async (project) => {
    const name = projectName(project);
    const equipments = listEquipments ? await listEquipments({ projectId: project.id }) : [];
    return [name, Array.isArray(equipments) ? equipments : []];
  }));

  state.projects = Array.isArray(projects) ? projects : [];
  state.linkedEquipmentByProject = new Map(linkedEntries);
  renderProjectManagerPage();
}

function bindEvents() {
  el('btn-project-new')?.addEventListener('click', () => openProjectEditor());
  el('btn-project-edit')?.addEventListener('click', () => {
    const project = state.projects.find((item) => projectName(item) === state.selectedName);
    if (!project) {
      showToast('Selecione um projeto para editar.', 'error');
      return;
    }
    openProjectEditor(project);
  });
  el('btn-project-delete')?.addEventListener('click', openDeleteDialog);
  el('btn-project-refresh')?.addEventListener('click', refreshProjectManagerPage);
}

export async function initProjectManagerPage(options = {}) {
  state.dependencies = { ...state.dependencies, ...options };
  if (!state.initialized) {
    bindEvents();
    state.initialized = true;
  }
  await refreshProjectManagerPage();
}
