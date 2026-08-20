import { openModal, closeModal } from './modal.js';
import { createEquipmentDuplicate } from '../core/equipmentDuplicate.js';
import { fileToBase64 } from '../data/profile.js';
import { createInfoModalContent } from './infoModalContent.js';
import {
  compareEquipmentPortfolio,
  equipmentPlannedQuantity,
  equipmentPortfolioGroupKey,
  equipmentPortfolioSummary,
  equipmentTags,
} from '../core/equipmentPortfolio.js';
import { EQUIPMENT_SERVICE_OPTIONS } from '../core/equipmentClassification.js';
import { drawingsLinkedToEquipment } from '../core/equipmentDrawingLinks.js';

const MAX_EQUIPMENT_PHOTO_BYTES = 500 * 1024;
const CUSTOM_EQUIPMENT_TYPE = '__CUSTOM__';
const state = {
  initialized: false,
  dependencies: {},
  equipments: [],
  drawings: [],
  equipmentTypes: [],
  projects: [],
  selectedId: null,
  expandedIds: new Set(),
  appliedDefaultProjectId: null,
  pendingProjectFilterValue: null,
};

const el = (id) => document.getElementById(id);

function text(value) {
  return value == null ? '' : String(value);
}

function upper(value) {
  return text(value).trim().toUpperCase();
}

function projectLabel(project = {}) {
  return text(project.name || project.project || project.projectName || project.id);
}

function projectValue(project = {}) {
  return text(project.id || projectLabel(project));
}

function showToast(message, type = 'info') {
  state.dependencies.showToast?.(message, type);
}

function getDefaultProjectId() {
  return text(state.dependencies.defaultProjectId).trim();
}

function getProjectName(projectId) {
  const project = state.projects.find((item) => projectLabel(item) === projectId || item.id === projectId);
  return projectLabel(project) || projectId;
}

function equipmentGroupName(equipment = {}) {
  return text(equipment.equipmentName || equipment.name || equipment.equipmentType || equipment.code || 'Grupo sem nome');
}

function equipmentConfiguration(equipment = {}) {
  const equipmentType = text(equipment.equipmentType).trim();
  const legacyType = /^(TYPE|TIPO)\s*\d+/i.test(equipmentType) ? equipmentType : '';
  return text(equipment.variant || legacyType || equipment.equipmentClass || '-');
}

function linkedDrawings(equipmentId) {
  return drawingsLinkedToEquipment(state.drawings, equipmentId);
}

function equipmentDesignReference(equipment = {}) {
  const directReference = text(equipment.designDrawingNo).trim();
  if (directReference) return directReference;
  const legacyReferences = [...new Set(
    linkedDrawings(equipment.id).map((drawing) => text(drawing.engineeringCode).trim()).filter(Boolean),
  )];
  return legacyReferences.length === 1 ? legacyReferences[0] : '';
}

function normalizeScopeLabel(value) {
  const normalized = upper(value);
  if (normalized === 'INCORPORATED') return 'INCORPORATED';
  if (normalized === 'NOT_INCORPORATED') return 'NOT_INCORPORATED';
  return normalized;
}

function formatWeight(value) {
  if (value === '' || value == null) return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number)} kg`;
}

function createText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text(value);
  return element;
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = text(value);
  row.appendChild(cell);
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

function appendActionsCell(row, equipment) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  actions.append(
    iconButton('edit', 'Editar equipamento', () => handleEdit(equipment.id)),
    iconButton('content_copy', 'Duplicar equipamento', () => handleDuplicate(equipment.id)),
    iconButton('note_add', 'Adicionar Drawing', () => state.dependencies.onAddDrawing?.({
      projectId: equipment.projectId,
      equipmentId: equipment.id,
    })),
  );
  cell.appendChild(actions);
  row.appendChild(cell);
}

function createBadge(value, className = '') {
  const badge = createText('span', `equipment-badge ${className}`.trim(), value);
  return badge;
}

function createGroupCell(equipment) {
  const cell = document.createElement('td');
  const content = document.createElement('div');
  content.className = 'equipment-group-cell';
  const expand = iconButton(
    state.expandedIds.has(equipment.id) ? 'expand_less' : 'expand_more',
    state.expandedIds.has(equipment.id) ? 'Ocultar TAGs' : 'Exibir TAGs',
    () => toggleEquipmentDetails(equipment.id),
  );
  expand.classList.add('equipment-expand-action');
  const identity = document.createElement('div');
  identity.append(
    createText('strong', null, equipmentGroupName(equipment)),
    createText('small', 'text-muted', [equipment.code, getProjectName(equipment.projectId)].filter(Boolean).join(' · ')),
  );
  content.append(expand, identity);
  cell.appendChild(content);
  return cell;
}

function createLocationCell(equipment) {
  const cell = document.createElement('td');
  const content = document.createElement('div');
  content.className = 'equipment-location-cell';
  content.append(
    createText('strong', null, equipment.fieldLocation || '-'),
    createText('small', 'text-muted', equipment.system || equipment.equipmentType || '-'),
  );
  cell.appendChild(content);
  return cell;
}

function createQuantityCell(equipment) {
  const cell = document.createElement('td');
  cell.className = 'mc-numeric-cell equipment-quantity-cell';
  const planned = equipmentPlannedQuantity(equipment);
  const registered = equipmentTags(equipment).length;
  cell.append(
    createText('strong', null, planned),
    createText('small', registered < planned ? 'equipment-count-pending' : 'text-muted', `${registered} TAG${registered === 1 ? '' : 's'} cadastrada${registered === 1 ? '' : 's'}`),
  );
  return cell;
}

function createTagsCell(equipment) {
  const cell = document.createElement('td');
  const tags = equipmentTags(equipment);
  const preview = document.createElement('div');
  preview.className = 'equipment-tag-preview';
  if (!tags.length) {
    preview.append(createText('span', 'text-muted', 'A cadastrar'));
  } else {
    tags.slice(0, 2).forEach((tag) => preview.append(createBadge(tag)));
    if (tags.length > 2) preview.append(createBadge(`+${tags.length - 2}`, 'muted'));
  }
  cell.appendChild(preview);
  return cell;
}

function createDrawingsCell(equipment) {
  const cell = document.createElement('td');
  const drawings = linkedDrawings(equipment.id);
  if (!drawings.length) {
    cell.append(createText('span', 'text-muted', 'Nenhum'));
    return cell;
  }
  const content = document.createElement('div');
  content.className = 'equipment-drawing-summary';
  const drawingNumbers = drawings.slice(0, 2).map((drawing) => [
    drawing.drawingNo,
    drawing.revision ? `Rev. ${drawing.revision}` : '',
  ].filter(Boolean).join(' · '));
  content.append(
    createText('strong', null, `${drawings.length} Shop Drawing${drawings.length === 1 ? '' : 's'}`),
    createText('small', 'text-muted', drawingNumbers.join(', ')),
  );
  cell.appendChild(content);
  return cell;
}

function createDetailsRow(equipment) {
  const row = document.createElement('tr');
  row.className = 'equipment-detail-row';
  row.dataset.equipmentDetailId = equipment.id;
  const cell = document.createElement('td');
  cell.colSpan = 9;
  const panel = document.createElement('div');
  panel.className = 'equipment-tag-panel';
  const heading = document.createElement('div');
  heading.className = 'equipment-tag-panel-heading';
  heading.append(
    createText('strong', null, `Unidades físicas · ${equipmentConfiguration(equipment)}`),
    createText('span', 'text-muted', `${equipmentTags(equipment).length} de ${equipmentPlannedQuantity(equipment)} TAGs cadastradas`),
  );
  const tags = document.createElement('div');
  tags.className = 'equipment-tag-list';
  const values = equipmentTags(equipment);
  if (values.length) values.forEach((tag, index) => tags.append(createBadge(`${index + 1}. ${tag}`)));
  else tags.append(createText('p', 'text-muted', 'Cadastre as TAGs conhecidas deste grupo para manter cada unidade rastreável.'));
  panel.append(heading, tags);
  cell.appendChild(panel);
  row.appendChild(cell);
  return row;
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

function availableEquipmentTypes(projectId = '') {
  const selectedProjectId = text(projectId).trim();
  const byName = new Map();
  state.equipmentTypes
    .filter((type) => (!type.projectId || type.projectId === selectedProjectId) && upper(type.status || 'ACTIVE') === 'ACTIVE')
    .sort((left, right) => Number(Boolean(left.projectId)) - Number(Boolean(right.projectId)))
    .forEach((type) => byName.set(upper(type.name), type));
  return [...byName.values()].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
    || text(left.name).localeCompare(text(right.name)));
}

function createEquipmentTypeField(equipment = {}, projectId = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'field equipment-type-catalog-field';
  wrapper.append(createText('span', null, 'Tipo de equipamento *'));
  const select = document.createElement('select');
  select.className = 'input';
  select.name = 'equipmentTypeId';
  select.required = true;
  const customInput = document.createElement('input');
  customInput.className = 'input equipment-type-custom-input hidden';
  customInput.name = 'equipmentType';
  customInput.type = 'text';
  customInput.placeholder = 'Informe o tipo de equipamento';
  const helper = createText('small', 'text-muted equipment-type-helper', 'Selecione um tipo do catálogo.');

  function selectedCatalogType() {
    return state.equipmentTypes.find((type) => type.id === select.value) || null;
  }

  function updateHelper(type = selectedCatalogType()) {
    if (!type) {
      helper.textContent = select.value === CUSTOM_EQUIPMENT_TYPE
        ? 'Tipo personalizado; ficará salvo como snapshot neste equipamento.'
        : 'Selecione um tipo do catálogo.';
      return;
    }
    helper.textContent = [type.code, type.equipmentClass, type.discipline].filter(Boolean).join(' · ')
      || 'Tipo padronizado do catálogo.';
  }

  function showCustomInput(show, { clear = false } = {}) {
    customInput.classList.toggle('hidden', !show);
    customInput.required = show;
    if (clear) customInput.value = '';
  }

  function refreshOptions(nextProjectId = '', preferredId = select.value, preferredName = customInput.value) {
    const types = availableEquipmentTypes(nextProjectId);
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = 'Selecione um tipo'; placeholder.disabled = true;
    const options = types.map((type) => {
      const option = document.createElement('option');
      option.value = type.id;
      option.textContent = [type.name, type.code].filter(Boolean).join(' · ');
      return option;
    });
    const custom = document.createElement('option');
    custom.value = CUSTOM_EQUIPMENT_TYPE; custom.textContent = 'Outro tipo…';
    select.replaceChildren(placeholder, ...options, custom);
    const selected = types.find((type) => type.id === preferredId)
      || types.find((type) => upper(type.name) === upper(preferredName));
    if (selected) {
      select.value = selected.id;
      customInput.value = selected.name;
      showCustomInput(false);
      updateHelper(selected);
    } else if (text(preferredName).trim()) {
      select.value = CUSTOM_EQUIPMENT_TYPE;
      customInput.value = preferredName;
      showCustomInput(true);
      updateHelper(null);
    } else {
      select.value = '';
      customInput.value = '';
      showCustomInput(false);
      updateHelper(null);
    }
  }

  select.addEventListener('change', () => {
    const type = selectedCatalogType();
    if (select.value === CUSTOM_EQUIPMENT_TYPE) {
      showCustomInput(true, { clear: true });
      updateHelper(null);
      customInput.focus();
      return;
    }
    if (type) customInput.value = type.name;
    showCustomInput(false);
    updateHelper(type);
  });

  wrapper.append(select, customInput, helper);
  refreshOptions(projectId, equipment.equipmentTypeId, equipment.equipmentType);
  return { field: wrapper, select, customInput, selectedCatalogType, refreshOptions };
}

function createAdvancedSection(fields = []) {
  const details = document.createElement('details');
  details.className = 'equipment-advanced-section';
  const summary = document.createElement('summary');
  summary.append(
    createText('span', 'material-symbols-outlined', 'tune'),
    createText('strong', null, 'Mais opções'),
    createText('small', 'text-muted', 'Campos complementares'),
  );
  const grid = document.createElement('div');
  grid.className = 'equipment-form-section-grid';
  grid.append(...fields);
  details.append(summary, grid);
  return details;
}

function createFormSection(title, description, fields = []) {
  const section = document.createElement('section');
  section.className = 'equipment-form-section';
  const heading = document.createElement('header');
  heading.append(
    createText('h4', null, title),
    createText('p', 'text-muted', description),
  );
  const grid = document.createElement('div');
  grid.className = 'equipment-form-section-grid';
  grid.append(...fields);
  section.append(heading, grid);
  return section;
}

function createTagsField(tags = []) {
  const field = createField(
    'TAGs das unidades',
    'equipmentTags',
    equipmentTags({ equipmentTags: tags }).join('\n'),
    'textarea',
    { placeholder: 'Uma TAG por linha\n32-WJ-10-1020\n32-WJ-10-2020' },
  );
  field.classList.add('equipment-tags-field');
  const helper = createText('small', 'text-muted equipment-tags-counter', '0 TAGs cadastradas');
  field.appendChild(helper);
  return field;
}

function createServiceField(value = '') {
  const field = createField('Serviço / Sistema', 'system', value, 'text', {
    list: 'equipment-service-options',
    placeholder: 'Ex.: PRODUCTION',
  });
  const dataList = document.createElement('datalist');
  dataList.id = 'equipment-service-options';
  EQUIPMENT_SERVICE_OPTIONS.forEach((service) => {
    const option = document.createElement('option');
    option.value = service;
    dataList.appendChild(option);
  });
  field.append(
    dataList,
    createText('small', 'text-muted', 'Função do equipamento; não altera o tipo físico.'),
  );
  return field;
}

function collectFormData(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.equipmentTypeId === CUSTOM_EQUIPMENT_TYPE) payload.equipmentTypeId = '';
  return payload;
}

function getEquipmentFilters() {
  return {
    projectId: el('equipment-project-filter')?.value || '',
    status: el('equipment-status-filter')?.value || '',
    fieldLocation: upper(el('equipment-location-filter')?.value),
    equipmentType: upper(el('equipment-type-filter')?.value),
    search: upper(el('equipment-search')?.value),
  };
}

function equipmentMatchesClientFilters(equipment) {
  const filters = getEquipmentFilters();
  if (filters.fieldLocation && upper(equipment.fieldLocation) !== filters.fieldLocation) return false;
  if (filters.equipmentType && upper(equipment.equipmentType) !== filters.equipmentType) return false;
  if (!filters.search) return true;
  const drawings = linkedDrawings(equipment.id);
  return [
    getProjectName(equipment.projectId),
    equipment.scopeType,
    equipment.equipmentClass,
    equipment.equipmentType,
    equipment.equipmentName,
    equipment.name,
    equipment.equipmentStructure,
    equipment.clientTag,
    equipment.code,
    equipment.discipline,
    equipment.status,
    equipment.fieldLocation,
    equipment.system,
    equipment.variant,
    equipmentDesignReference(equipment),
    ...equipmentTags(equipment),
    ...drawings.flatMap((drawing) => [
      drawing.drawingNo,
      drawing.engineeringCode,
      drawing.revision,
      drawing.title,
      drawing.status,
    ]),
  ].some((value) => upper(value).includes(filters.search));
}

function renderSelectValues(selectId, allLabel, values) {
  const select = el(selectId);
  if (!select) return;
  const current = select.value;
  const options = [new Option(allLabel, '')];
  [...new Set(values.map((value) => text(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .forEach((value) => options.push(new Option(value, value)));
  select.replaceChildren(...options);
  select.value = [...select.options].some((option) => option.value === current) ? current : '';
}

function renderProjectSelect(selectId, allLabel) {
  const select = el(selectId);
  if (!select) return;
  const current = select.value;
  const desired = selectId === 'equipment-project-filter' ? state.pendingProjectFilterValue ?? current : current;
  const options = [];
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = allLabel;
  options.push(allOption);
  state.projects.forEach((project) => {
    const option = document.createElement('option');
    const label = projectLabel(project);
    option.value = projectValue(project);
    option.textContent = label || 'Projeto sem nome';
    options.push(option);
  });
  select.replaceChildren(...options);
  select.value = [...select.options].some((option) => option.value === desired) ? desired : '';
  if (selectId === 'equipment-project-filter') state.pendingProjectFilterValue = null;
}

function renderFilters() {
  renderProjectSelect('equipment-project-filter', 'Todos os projetos');
  renderSelectValues('equipment-location-filter', 'Todas as áreas', state.equipments.map((equipment) => equipment.fieldLocation));
  renderSelectValues('equipment-type-filter', 'Todos os tipos', state.equipments.map((equipment) => equipment.equipmentType));
}

function renderEquipmentSummary(equipments) {
  const container = el('equipment-portfolio-summary');
  if (!container) return;
  const summary = equipmentPortfolioSummary(equipments);
  const cards = [
    ['Grupos', summary.groupCount, 'Famílias/configurações cadastradas'],
    ['Unidades planejadas', summary.plannedUnits, 'Quantidade total do escopo'],
    ['TAGs cadastradas', summary.registeredTags, `${summary.typeCount} tipo${summary.typeCount === 1 ? '' : 's'} de equipamento`],
    ['TAGs pendentes', summary.pendingTags, summary.pendingTags ? 'Unidades ainda sem identificação' : 'Cadastro de TAGs completo'],
  ].map(([label, value, helper], index) => {
    const card = document.createElement('article');
    card.className = `equipment-portfolio-kpi${index === 3 && Number(value) > 0 ? ' attention' : ''}`;
    card.append(
      createText('span', null, label),
      createText('strong', null, value),
      createText('small', 'text-muted', helper),
    );
    return card;
  });
  container.replaceChildren(...cards);
}

function renderEquipmentActions() {
  const hasSelection = Boolean(state.selectedId);
  ['btn-equipment-edit', 'btn-equipment-duplicate', 'btn-equipment-delete'].forEach((id) => {
    const button = el(id);
    if (button) button.disabled = !hasSelection;
  });
}

export function renderEquipmentTable(equipments = [], options = {}) {
  const body = options.body || el('equipments-table-body');
  if (!body) return;
  const visible = equipments.filter(equipmentMatchesClientFilters).sort(compareEquipmentPortfolio);
  const rows = [];
  let previousGroupKey = '';
  visible.forEach((equipment) => {
    const groupKey = equipmentPortfolioGroupKey(equipment);
    if (groupKey !== previousGroupKey) {
      previousGroupKey = groupKey;
      const groupRecords = visible.filter((record) => equipmentPortfolioGroupKey(record) === groupKey);
      const groupRow = document.createElement('tr');
      groupRow.className = 'equipment-portfolio-group-row';
      const groupCell = document.createElement('td');
      groupCell.colSpan = 9;
      const label = [getProjectName(equipment.projectId), equipment.fieldLocation || 'Área não informada', equipment.equipmentType || 'Tipo não informado']
        .filter(Boolean).join(' · ');
      const quantity = groupRecords.reduce((sum, record) => sum + equipmentPlannedQuantity(record), 0);
      groupCell.append(
        createText('strong', null, label),
        createText('span', null, `${groupRecords.length} grupo${groupRecords.length === 1 ? '' : 's'} · ${quantity} unidade${quantity === 1 ? '' : 's'}`),
      );
      groupRow.appendChild(groupCell);
      rows.push(groupRow);
    }
    const row = document.createElement('tr');
    row.dataset.equipmentId = equipment.id;
    row.classList.toggle('selected-row', equipment.id === state.selectedId);
    row.addEventListener('click', () => {
      state.selectedId = equipment.id;
      body.querySelectorAll('tr[data-equipment-id]').forEach((candidate) => {
        candidate.classList.toggle('selected-row', candidate.dataset.equipmentId === equipment.id);
      });
      renderEquipmentActions();
    });
    row.addEventListener('dblclick', () => {
      state.selectedId = equipment.id;
      renderEquipmentActions();
      openEquipmentInfo(equipment);
    });

    row.append(
      createGroupCell(equipment),
      createLocationCell(equipment),
    );
    appendTextCell(row, equipmentConfiguration(equipment));
    row.append(
      createQuantityCell(equipment),
      createTagsCell(equipment),
    );
    appendTextCell(row, equipmentDesignReference(equipment) || '-');
    row.appendChild(createDrawingsCell(equipment));
    appendTextCell(row, equipment.status);
    appendActionsCell(row, equipment);
    rows.push(row);
    if (state.expandedIds.has(equipment.id)) rows.push(createDetailsRow(equipment));
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.className = 'text-muted';
    cell.textContent = 'Nenhum equipamento encontrado.';
    row.appendChild(cell);
    rows.push(row);
  }

  body.replaceChildren(...rows);
  renderEquipmentActions();
}

function toggleEquipmentDetails(equipmentId) {
  if (state.expandedIds.has(equipmentId)) state.expandedIds.delete(equipmentId);
  else state.expandedIds.add(equipmentId);
  renderEquipmentTable(state.equipments);
}

export async function renderEquipmentPage(nextState = {}) {
  if (Array.isArray(nextState.projects)) state.projects = [...nextState.projects];
  if (Array.isArray(nextState.equipments)) state.equipments = [...nextState.equipments];
  if (Array.isArray(nextState.drawings)) state.drawings = [...nextState.drawings];
  if (Array.isArray(nextState.equipmentTypes)) state.equipmentTypes = [...nextState.equipmentTypes];
  renderFilters();
  renderEquipmentSummary(state.equipments.filter(equipmentMatchesClientFilters));
  renderEquipmentTable(state.equipments);
}

function buildEquipmentForm(equipment = {}) {
  const form = document.createElement('form');
  form.className = 'equipment-form-grid';
  const projectId = equipment.projectId || (!equipment.id ? getDefaultProjectId() : '');

  const projectOptions = [
    { value: '', label: 'Selecione um projeto', disabled: true },
    ...state.projects.map((project) => {
      const label = projectLabel(project);
      return { value: projectValue(project), label: label || 'Projeto sem nome' };
    }),
  ];

  const projectField = createSelectField('Projeto *', 'projectId', projectId, projectOptions, { required: '' });
  const locationField = createField('Área / Field Location *', 'fieldLocation', equipment.fieldLocation, 'text', {
    placeholder: 'Ex.: KBD DW', required: '',
  });
  const typeControl = createEquipmentTypeField(equipment, projectId);
  const typeField = typeControl.field;
  const serviceField = createServiceField(equipment.system);
  const variantField = createField('Configuração', 'variant', equipment.variant, 'text', { placeholder: 'Ex.: TYPE 1' });
  const quantityField = createField('Quantidade planejada *', 'plannedQuantity', equipmentPlannedQuantity(equipment), 'number', {
    min: '1', step: '1', required: '',
  });
  const tagsField = createTagsField(equipmentTags(equipment));
  const drawingField = createField('Design Drawing / Engineering Reference', 'designDrawingNo', equipmentDesignReference(equipment), 'text', {
    placeholder: 'Ex.: SR-101-30-U101-290158',
  });
  projectField.classList.add('equipment-field-full');
  drawingField.classList.add('equipment-field-full');

  const identitySection = createFormSection(
    'Informações principais',
    'Uma linha representa uma configuração; as TAGs identificam as unidades físicas do grupo.',
    [
      projectField,
      locationField,
      typeField,
      serviceField,
      variantField,
      quantityField,
      tagsField,
      drawingField,
    ],
  );

  const advancedSection = createAdvancedSection(
    [
      createSelectField('Classificação de escopo', 'scopeType', equipment.scopeType, [
        { value: '', label: 'Não informado' },
        { value: 'INCORPORATED', label: 'INCORPORATED' },
        { value: 'NOT_INCORPORATED', label: 'NOT_INCORPORATED' },
      ]),
      createField('Classe', 'equipmentClass', equipment.equipmentClass),
      createField('Estrutura', 'equipmentStructure', equipment.equipmentStructure),
      createField('Disciplina', 'discipline', equipment.discipline),
      createField('Descrição', 'description', equipment.description, 'textarea'),
      createEquipmentPhotoField(equipment.photoUrl),
    ],
  );

  form.append(identitySection, advancedSection);

  typeControl.select.addEventListener('change', () => {
    const type = typeControl.selectedCatalogType();
    if (!type) return;
    if (form.elements.scopeType) form.elements.scopeType.value = type.scopeType || '';
    if (form.elements.equipmentClass) form.elements.equipmentClass.value = type.equipmentClass || type.category || '';
    if (form.elements.discipline) form.elements.discipline.value = type.discipline || '';
  });
  form.elements.projectId?.addEventListener('change', () => {
    typeControl.refreshOptions(form.elements.projectId.value, typeControl.select.value, typeControl.customInput.value);
  });

  const quantityInput = form.elements.plannedQuantity;
  const tagsInput = form.elements.equipmentTags;
  const tagsCounter = form.querySelector('.equipment-tags-counter');
  let quantityEdited = Boolean(equipment.id && equipment.plannedQuantity);
  const updateTagsCounter = () => {
    const count = equipmentTags({ equipmentTags: tagsInput?.value }).length;
    const planned = Number(quantityInput?.value) || 0;
    tagsCounter.textContent = `${count} TAG${count === 1 ? '' : 's'} cadastrada${count === 1 ? '' : 's'} de ${planned} unidade${planned === 1 ? '' : 's'} planejada${planned === 1 ? '' : 's'}`;
    tagsCounter.classList.toggle('equipment-count-pending', count > planned);
  };
  quantityInput?.addEventListener('input', () => {
    quantityEdited = true;
    updateTagsCounter();
  });
  tagsInput?.addEventListener('input', () => {
    const count = equipmentTags({ equipmentTags: tagsInput.value }).length;
    if (!quantityEdited && count) quantityInput.value = String(count);
    updateTagsCounter();
  });
  updateTagsCounter();

  return form;
}

function renderPhotoPreview(preview, photoUrl) {
  preview.replaceChildren();
  if (photoUrl) {
    const image = document.createElement('img');
    image.src = photoUrl;
    image.alt = 'Preview da foto do equipamento';
    image.addEventListener('error', () => renderPhotoPreview(preview, ''), { once: true });
    preview.appendChild(image);
    return;
  }
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined equipment-photo-placeholder';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'precision_manufacturing';
  preview.appendChild(icon);
}

function createEquipmentPhotoField(initialPhotoUrl = '') {
  let photoUrl = text(initialPhotoUrl);
  const section = document.createElement('section');
  section.className = 'equipment-photo-field';
  const title = createText('span', null, 'Foto do equipamento');
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = 'photoUrl';
  hidden.value = photoUrl;
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';
  const preview = document.createElement('div');
  preview.className = 'equipment-photo-preview';
  renderPhotoPreview(preview, photoUrl);
  const actions = document.createElement('div');
  actions.className = 'equipment-photo-actions';
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'btn btn-secondary';
  selectButton.textContent = photoUrl ? 'Trocar foto' : 'Selecionar foto';
  selectButton.addEventListener('click', () => fileInput.click());
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-ghost';
  removeButton.textContent = 'Remover';
  removeButton.disabled = !photoUrl;
  removeButton.addEventListener('click', () => {
    photoUrl = '';
    hidden.value = '';
    fileInput.value = '';
    selectButton.textContent = 'Selecionar foto';
    removeButton.disabled = true;
    renderPhotoPreview(preview, photoUrl);
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Selecione um arquivo de imagem valido.', 'error');
    } else if (file.size > MAX_EQUIPMENT_PHOTO_BYTES) {
      showToast('A foto do equipamento deve ter no maximo 500 KB.', 'error');
    } else {
      try {
        photoUrl = text(await fileToBase64(file));
        hidden.value = photoUrl;
        selectButton.textContent = 'Trocar foto';
        removeButton.disabled = false;
        renderPhotoPreview(preview, photoUrl);
      } catch (error) {
        console.error(error);
        showToast('Nao foi possivel ler a foto do equipamento.', 'error');
      }
    }
    fileInput.value = '';
  });
  actions.append(selectButton, removeButton);
  section.append(title, hidden, fileInput, preview, actions);
  return section;
}

function validationMessages(payload) {
  const errors = [];
  if (!text(payload.projectId).trim()) errors.push('Projeto é obrigatório.');
  if (!text(payload.fieldLocation).trim()) errors.push('Área / Field Location é obrigatória.');
  if (!text(payload.equipmentType).trim()) errors.push('Tipo de equipamento é obrigatório.');
  const plannedQuantity = Number(payload.plannedQuantity);
  const tagCount = equipmentTags({ equipmentTags: payload.equipmentTags }).length;
  if (!Number.isInteger(plannedQuantity) || plannedQuantity < 1) errors.push('Quantidade planejada deve ser um numero inteiro maior que zero.');
  if (tagCount > plannedQuantity) errors.push(`A lista possui ${tagCount} TAGs, acima da quantidade planejada (${plannedQuantity}).`);
  return errors;
}

function errorMessage(error) {
  const messages = {
    EQUIPMENT_PROJECT_REQUIRED: 'Projeto é obrigatório.',
    EQUIPMENT_NAME_REQUIRED: 'Não foi possível gerar o nome do equipamento. Informe Área e Tipo.',
    EQUIPMENT_NAME_CONFLICT: 'Já existe um equipamento com a mesma Área, Serviço, Tipo e Configuração neste projeto.',
    EQUIPMENT_CODE_CONFLICT: 'This Code already exists in the selected Project.',
    EQUIPMENT_CLIENT_TAG_CONFLICT: 'This Client Tag already exists in the selected Project.',
  };
  return messages[error?.code] || error?.message || 'Nao foi possivel salvar o equipamento.';
}

function renderValidationSummary(container, messages) {
  container.replaceChildren();
  if (!messages.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const title = createText('strong', null, 'Revise os campos abaixo:');
  const list = document.createElement('ul');
  messages.forEach((message) => list.appendChild(createText('li', null, message)));
  container.append(title, list);
}

async function refreshEquipments() {
  const { listEquipments, listProjects, listEquipmentTypes } = state.dependencies;
  if (!listEquipments) return;
  const filters = getEquipmentFilters();
  const defaultProjectId = getDefaultProjectId();
  if (defaultProjectId !== state.appliedDefaultProjectId) {
    state.appliedDefaultProjectId = defaultProjectId;
    filters.projectId = defaultProjectId;
    state.pendingProjectFilterValue = defaultProjectId;
  }
  const [equipments, projects, drawings, equipmentTypes] = await Promise.all([
    listEquipments({ projectId: filters.projectId, status: filters.status }),
    listProjects ? listProjects() : Promise.resolve(state.projects),
    state.dependencies.listDrawings?.({ projectId: filters.projectId }) || Promise.resolve(state.drawings),
    listEquipmentTypes ? listEquipmentTypes({}) : Promise.resolve(state.equipmentTypes),
  ]);
  state.equipments = Array.isArray(equipments) ? equipments : [];
  state.projects = Array.isArray(projects) ? projects : [];
  state.drawings = Array.isArray(drawings) ? drawings : [];
  state.equipmentTypes = Array.isArray(equipmentTypes) ? equipmentTypes : [];
  if (state.selectedId && !state.equipments.some((equipment) => equipment.id === state.selectedId)) {
    state.selectedId = null;
  }
  await renderEquipmentPage();
}

function openEquipmentEditor(equipment = null, { mode } = {}) {
  const isEdit = mode ? mode === 'edit' : Boolean(equipment?.id);
  const form = buildEquipmentForm(equipment || {});
  const body = document.createElement('div');
  const validation = document.createElement('div');
  validation.className = 'form-validation-summary';
  validation.setAttribute('role', 'alert');
  validation.hidden = true;
  body.append(validation, form);
  openModal({
    title: isEdit ? 'Editar equipamento' : 'Novo equipamento',
    body,
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
            const errors = validationMessages(payload);
            if (errors.length) {
              renderValidationSummary(validation, errors);
              return;
            }
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
            renderValidationSummary(validation, [errorMessage(error)]);
          }
        },
      },
    ],
  });
}

async function handleDuplicate(equipmentId = state.selectedId) {
  if (!equipmentId) {
    showToast('Selecione um equipamento para duplicar.', 'error');
    return;
  }
  const equipment = await state.dependencies.getEquipment?.(equipmentId);
  if (!equipment) {
    showToast('Equipamento nao encontrado.', 'error');
    await refreshEquipments();
    return;
  }
  openEquipmentEditor(createEquipmentDuplicate(equipment), { mode: 'create' });
}

async function handleEdit(equipmentId = state.selectedId) {
  if (!equipmentId) {
    showToast('Selecione um equipamento para editar.', 'error');
    return;
  }
  const equipment = await state.dependencies.getEquipment?.(equipmentId);
  if (!equipment) {
    showToast('Equipamento nao encontrado.', 'error');
    await refreshEquipments();
    return;
  }
  openEquipmentEditor(equipment);
}

function equipmentContextMatches(record = {}, equipment = {}, tag = '') {
  const values = [record.equipmentId, record.tag, record.clientTag, record.equipmentTag].map((value) => upper(value));
  return values.includes(upper(equipment.id)) || (tag && values.includes(upper(tag)));
}

function couponContextMatches(record = {}, equipment = {}, tag = '') {
  const coupon = record.metadata?.coupon || record;
  return (coupon.lines || record.items || []).some((line) => equipmentContextMatches(line, equipment, tag));
}

function operationalNavigation(equipment, tag, counts) {
  const section = document.createElement('section'); section.className = 'equipment-operational-workspace';
  section.append(createText('h3', null, `Operational context${tag ? ` · ${tag}` : ''}`));
  const grid = document.createElement('div'); grid.className = 'equipment-operational-grid';
  [
    ['architecture', 'Drawings', counts.drawings, 'drawings'],
    ['assignment', 'MTO', counts.mto, 'mto'],
    ['workspaces', 'Workpacks', counts.workpacks, 'workpacks'],
    ['inventory_2', 'Material Availability', counts.mto, 'reports'],
    ['confirmation_number', 'Material Coupons', counts.coupons, 'material-coupons'],
    ['content_cut', 'Cutting Sheets', counts.cuttingSheets, 'cut-sheets'],
    ['description', 'Documents', counts.documents, 'documents'],
  ].forEach(([iconName, label, count, phase]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'equipment-operational-link';
    button.append(createText('span', 'material-symbols-outlined', iconName), createText('span', null, label), createText('strong', null, count));
    button.addEventListener('click', () => { closeModal(); state.dependencies.onNavigateContext?.(phase, { equipmentId: equipment.id, tag }); });
    grid.append(button);
  });
  section.append(grid); return section;
}

async function openEquipmentInfo(equipment, selectedTag = '') {
  try {
    const [drawings, mtoItems, workpacks, coupons, cuttingSheets] = await Promise.all([
      state.dependencies.listDrawings?.({ equipmentId: equipment.id, isCurrentRevision: true }) || [],
      state.dependencies.listMtoItems?.() || [],
      state.dependencies.listWorkpacks?.() || [],
      state.dependencies.listMaterialCoupons?.() || [],
      state.dependencies.listCuttingSheets?.() || [],
    ]);
    const tag = selectedTag || (equipmentTags(equipment).length === 1 ? equipmentTags(equipment)[0] : '');
    const scopedMto = mtoItems.filter((item) => equipmentContextMatches(item, equipment, tag));
    const scopedWorkpacks = workpacks.filter((item) => equipmentContextMatches(item, equipment, tag));
    const scopedCoupons = coupons.filter((item) => couponContextMatches(item, equipment, tag));
    const workpackIds = new Set(scopedWorkpacks.map((item) => item.id));
    const couponIds = new Set(scopedCoupons.map((item) => item.id));
    const scopedCuttingSheets = cuttingSheets.filter((item) => workpackIds.has(item.workpackId) || couponIds.has(item.materialCouponId) || equipmentContextMatches(item, equipment, tag));
    const body = createInfoModalContent({
      imageUrl: equipment.photoUrl,
      imageAlt: `Foto de ${equipment.equipmentName || equipment.name || 'equipamento'}`,
      placeholderIcon: 'precision_manufacturing',
      details: [
        { label: 'Project', value: getProjectName(equipment.projectId) },
        { label: 'Field Location', value: equipment.fieldLocation },
        { label: 'Service / System', value: equipment.system },
        { label: 'Equipment Type', value: equipment.equipmentType },
        { label: 'Configuracao', value: equipmentConfiguration(equipment) },
        { label: 'Grupo', value: equipmentGroupName(equipment) },
        { label: 'Quantidade planejada', value: equipmentPlannedQuantity(equipment) },
        { label: 'TAGs', value: equipmentTags(equipment).join(', ') },
        { label: 'Design Drawing / Engineering Reference', value: equipmentDesignReference(equipment) },
        { label: 'Scope Classification', value: normalizeScopeLabel(equipment.scopeType) },
        { label: 'Peso teorico', value: formatWeight(equipment.theoreticalWeightKg) },
        { label: 'Status', value: equipment.status },
      ],
      relatedTitle: 'Shop Drawings vinculados por Equipment ID',
      relatedColumns: ['Shop Drawing No', 'Title', 'Revision', 'Status'],
      relatedRows: drawings.map((drawing) => ({
        label: `Abrir MTO do drawing ${drawing.drawingNo || drawing.id}`,
        values: [drawing.drawingNo, drawing.title, drawing.revision, drawing.status],
        onClick: () => {
          closeModal();
          state.dependencies.openMto?.({ projectId: equipment.projectId, drawing: drawing.drawingNo });
        },
      })),
    });
    body.append(operationalNavigation(equipment, tag, {
      drawings: drawings.length,
      mto: scopedMto.length,
      workpacks: scopedWorkpacks.length,
      coupons: scopedCoupons.length,
      cuttingSheets: scopedCuttingSheets.length,
      documents: drawings.length + scopedCoupons.length + scopedCuttingSheets.length,
    }));
    openModal({
      title: tag || equipment.equipmentName || equipment.name || 'Equipment Info',
      body,
      wide: true,
      buttons: [
        {
          label: 'Adicionar Drawing',
          variant: 'btn-secondary',
          closeOnClick: false,
          onClick: () => {
            closeModal();
            state.dependencies.onAddDrawing?.({ projectId: equipment.projectId, equipmentId: equipment.id });
          },
        },
        {
          label: 'Editar',
          variant: 'btn-secondary',
          closeOnClick: false,
          onClick: () => {
            closeModal();
            openEquipmentEditor(equipment);
          },
        },
        {
          label: 'MTO',
          variant: 'btn-primary',
          closeOnClick: false,
          onClick: () => {
            closeModal();
            state.dependencies.openMto?.({ projectId: equipment.projectId, equipmentId: equipment.id });
          },
        },
      ],
    });
  } catch (error) {
    console.error(error);
    showToast('Nao foi possivel carregar as informacoes do equipamento.', 'error');
  }
}

export async function openEquipmentOperationalView(equipmentId, tag = '') {
  const equipment = await state.dependencies.getEquipment?.(equipmentId)
    || state.equipments.find((item) => item.id === equipmentId);
  if (!equipment) return false;
  state.selectedId = equipment.id;
  await openEquipmentInfo(equipment, tag);
  return true;
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
  body.appendChild(createText('p', null, `Excluir o equipamento "${equipment.equipmentName || equipment.name || equipment.code || equipment.id}"?`));

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
  el('btn-equipment-edit')?.addEventListener('click', () => handleEdit());
  el('btn-equipment-duplicate')?.addEventListener('click', () => handleDuplicate());
  el('btn-equipment-delete')?.addEventListener('click', handleDelete);
  el('btn-equipment-refresh')?.addEventListener('click', refreshEquipments);
  el('equipment-project-filter')?.addEventListener('change', refreshEquipments);
  el('equipment-status-filter')?.addEventListener('change', refreshEquipments);
  ['equipment-location-filter', 'equipment-type-filter'].forEach((id) => {
    el(id)?.addEventListener('change', () => renderEquipmentPage());
  });
  el('equipment-search')?.addEventListener('input', () => renderEquipmentPage());
}

export async function initEquipmentPage(options = {}) {
  state.dependencies = { ...state.dependencies, ...options };
  if (!state.initialized) {
    bindEvents();
    state.initialized = true;
  }
  await refreshEquipments();
}
