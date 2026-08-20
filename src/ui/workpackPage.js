import { openModal, closeModal } from './modal.js';
import { calculateWorkpackProgress } from '../core/workpackProgress.js';
import { normalizeWorkpackOperations, normalizeOperationSequences, createWorkpackOperation, moveWorkpackOperation, validateWorkpackOperation, WORKPACK_OPERATION_TYPES, WORKPACK_OPERATION_STATUSES } from '../core/workpackOperations.js';
import { validateWorkpack } from '../core/workpackValidation.js';
import { calculateWorkpackMetrics } from '../core/workpackMetrics.js';
import { duplicateWorkpack } from '../core/workpackDuplicate.js';
import { availableMtoItems, compatibleDrawings, mergeUpdatedMtoItems, mtoMatchesLinkedDrawings, uniqueIds } from '../core/workpackScope.js';
import { automaticWorkpackMaterialSelection, filterWorkpackNestingInputs, uniqueMaterialIds, resolveWorkpackMaterials, materialWarnings } from '../core/workpackMaterials.js';
import { resolveWorkpackDocuments } from '../core/workpackDocuments.js';
import { resolveWorkpackOffcuts } from '../core/workpackOffcuts.js';
import { resolveWorkpackActivity } from '../core/workpackActivity.js';
import { buildWorkpackReleaseSnapshot } from '../core/workpackSnapshot.js';
import { buildWorkpackGenealogy } from '../core/workpackGenealogy.js';
import { workpackRelationIds, WORKPACK_RELATION_TYPES } from '../core/workpackRelations.js';
import { buildTaskSheetDraft, TASK_SHEET_WORKSTATIONS, taskSheetWorkstationDefinition } from '../core/taskSheet.js';
import { openTaskSheetEditor } from './taskSheetModal.js';

const STATUS_OPTIONS = ['DRAFT', 'PLANNED', 'MTO_PENDING', 'MATERIAL_PENDING', 'MATERIAL_RESERVED', 'READY_FOR_NESTING', 'IN_NESTING', 'NESTED', 'RELEASED_FOR_CUTTING', 'IN_FABRICATION', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const TYPE_OPTIONS = ['CUTTING', 'FABRICATION', 'ASSEMBLY', 'WELDING', 'PAINTING', 'INSPECTION', 'INSTALLATION', 'GENERAL'];
const PRIORITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const SOURCE_TYPE_OPTIONS = ['MTO_LINES', 'CUTTING_SHEETS', 'DOCUMENTS_ONLY', 'FREE_LINE'];

const state = {
  initialized: false,
  dependencies: {},
  workpacks: [],
  projects: [],
  equipments: [],
  drawings: [],
  mtoItems: [],
  inventoryItems: [],
  materialCoupons: [],
  cuttingSheets: [],
  returnMaterialVouchers: [],
  materialTransformations: [],
  workpackLinks: [],
  plans: [],
  offcuts: [],
  auditEvents: [],
  taskSheets: [],
  selectedId: null,
  activeTab: 'Overview',
  scopeMtoDrawingFilter: '',
  scopeMtoMarkFilter: '',
  appliedDefaultProjectId: null,
  pendingProjectFilterValue: null,
  workspaceHost: null,
};

const el = (id) => document.getElementById(id);

function text(value) {
  return value == null ? '' : String(value);
}

function showToast(message, type = 'info') {
  state.dependencies.showToast?.(message, type);
}

async function auditWorkpack(eventType, workpack, metadata = {}) {
  return state.dependencies.auditWorkpack?.(eventType, workpack, metadata);
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

function relationIds(workpack, targetType) {
  return workpackRelationIds(workpack, state.workpackLinks, targetType);
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
    workpackType: el('workpack-type-filter')?.value || '',
    priority: el('workpack-priority-filter')?.value || '',
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
    option.value = projectValue(project);
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
  return workpacks.filter((workpack) => {
    if (filters.drawingId && !relationIds(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION).includes(filters.drawingId)) return false;
    if (filters.workpackType && workpack.workpackType !== filters.workpackType) return false;
    if (filters.priority && workpack.priority !== filters.priority) return false;
    if (!filters.search) return true;
    return [
    workpack.wpNo,
    workpack.title,
    workpack.discipline,
    workpack.workpackType, workpack.priority,
    relationIds(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION).map(getDrawingName).join(' '),
    getProjectName(workpack.projectId),
    getEquipmentName(workpack.equipmentId),
    ].some((value) => text(value).toUpperCase().includes(filters.search));
  });
}

function openWorkpackWorkspaceModal(workpack = state.workpacks.find((item) => item.id === state.selectedId)) {
  if (!workpack) return;
  const body = document.createElement('div');
  body.className = 'workpack-workspace-modal';
  state.workspaceHost = body;
  openModal({
    title: `Workpack — ${workpack.wpNo || workpack.title || workpack.id}`,
    body,
    wide: true,
    onClose: () => {
      if (state.workspaceHost === body) state.workspaceHost = null;
    },
    buttons: [{ label: 'Fechar', variant: 'btn-secondary' }],
  });
  renderWorkspace();
}

function renderWorkspace() {
  const host = state.workspaceHost;
  if (!host) return;
  const workpack = state.workpacks.find((item) => item.id === state.selectedId);
  if (!workpack) { host.replaceChildren(createText('p', 'text-muted', 'Selecione um Workpack para abrir o workspace.')); return; }
  const section = document.createElement('section'); section.className = 'workpack-workspace-card';
  const header = document.createElement('div'); header.className = 'workpack-workspace-header';
  const titleBlock = document.createElement('div');
  const eyebrow = createText('p', 'eyebrow', 'Execution Workspace');
  const title = createText('h2', null, workpack.wpNo || 'Workpack');
  const subtitle = createText('p', 'text-muted', workpack.title || 'Sem título definido');
  titleBlock.append(eyebrow, title, subtitle);
  const progress = calculateWorkpackProgress(workpack);
  const progressBlock = document.createElement('div'); progressBlock.className = 'workpack-progress-summary';
  progressBlock.append(createText('span', null, 'Effective Progress'), createText('strong', null, `${progress.effectiveProgress}%`));
  const meter = document.createElement('div'); meter.className = 'workpack-progress-meter';
  const fill = document.createElement('span'); fill.style.width = `${progress.effectiveProgress}%`; meter.appendChild(fill); progressBlock.appendChild(meter);
  header.append(titleBlock, progressBlock);
  const tabs = document.createElement('div'); tabs.className = 'workpack-tabs';
  const body = document.createElement('div'); body.className = 'workpack-tab-content';
  const names = ['Overview', 'Scope', 'Materials', 'Nesting', 'Task Sheet', 'Resources & Schedule', 'Operations', 'Documents', 'Traceability', 'Offcuts', 'Activity'];
  names.forEach((name) => { const button = document.createElement('button'); button.type = 'button'; button.className = `tab${state.activeTab === name ? ' active' : ''}`; button.textContent = name; button.addEventListener('click', () => { state.activeTab = name; renderWorkspace(); }); tabs.appendChild(button); });
  if (state.activeTab === 'Overview') body.appendChild(renderOverview(workpack));
  else if (state.activeTab === 'Scope') body.appendChild(renderScope(workpack));
  else if (state.activeTab === 'Materials') body.appendChild(renderMaterials(workpack));
  else if (state.activeTab === 'Nesting') body.appendChild(renderNesting(workpack));
  else if (state.activeTab === 'Task Sheet') body.appendChild(renderTaskSheets(workpack));
  else if (state.activeTab === 'Operations') body.appendChild(renderOperations(workpack));
  else if (state.activeTab === 'Resources & Schedule') body.appendChild(renderResources(workpack));
  else if (state.activeTab === 'Documents') body.appendChild(renderDocuments(workpack));
  else if (state.activeTab === 'Traceability') body.appendChild(renderTraceability(workpack));
  else if (state.activeTab === 'Offcuts') body.appendChild(renderOffcuts(workpack));
  else if (state.activeTab === 'Activity') body.appendChild(renderActivity(workpack));
  else body.appendChild(createText('p', 'text-muted', 'This section will be connected in the next implementation phase.'));
  section.append(header, tabs, body); host.replaceChildren(section);
}

function createText(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; node.textContent = text(value); return node; }

async function saveWorkpackWorkspaceChange(workpack, patch, activeTab, eventType, metadata = {}) {
  const saved = await state.dependencies.updateWorkpack?.(workpack.id, patch);
  if (!saved) {
    showToast('Não foi possível atualizar o Workpack.', 'error');
    return null;
  }
  state.workpacks = state.workpacks.map((item) => item.id === saved.id ? saved : item);
  if (eventType) await auditWorkpack(eventType, saved, metadata);
  if (state.dependencies.listAuditEvents) {
    try { state.auditEvents = await state.dependencies.listAuditEvents(); } catch (error) { console.warn('Falha ao atualizar atividade do Workpack.', error); }
  }
  state.activeTab = activeTab;
  renderWorkpackTable(state.workpacks);
  renderWorkspace();
  return saved;
}

function renderOverview(workpack) {
  const progress = calculateWorkpackProgress(workpack);
  const panel = document.createElement('div');
  panel.className = 'workpack-overview';
  [['Project', getProjectName(workpack.projectId)], ['Equipment', getEquipmentName(workpack.equipmentId)], ['Origin', workpack.sourceType || 'MTO_LINES'], ['Type', workpack.workpackType], ['Status', workpack.status], ['Priority', workpack.priority], ['Calculated Progress', `${progress.calculatedProgress}%`], ['Effective Progress', `${progress.effectiveProgress}%`], ['Responsible', workpack.responsible]].forEach(([label,value]) => {
    const item = document.createElement('div'); item.className = 'workpack-detail'; item.append(createText('span', null, label), createText('strong', null, value || '—')); panel.appendChild(item);
  });
  const controls = document.createElement('section');
  controls.className = 'workpack-progress-controls';
  controls.append(createText('h3', null, 'Manual progress override'));
  const manual = document.createElement('input'); manual.className = 'input'; manual.type = 'number'; manual.min = '0'; manual.max = '100'; manual.step = '1'; manual.value = workpack.manualProgress == null ? '' : String(workpack.manualProgress);
  const reason = document.createElement('textarea'); reason.className = 'input'; reason.rows = 2; reason.value = text(workpack.progressOverrideReason);
  const message = createText('p', 'text-critical', ''); message.hidden = true;
  const manualLabel = document.createElement('label'); manualLabel.className = 'field'; manualLabel.append(createText('span', null, 'Manual Progress (0–100)'), manual);
  const reasonLabel = document.createElement('label'); reasonLabel.className = 'field'; reasonLabel.append(createText('span', null, 'Override Reason'), reason);
  manual.addEventListener('input', () => { if (!manual.value.trim()) reason.value = ''; });
  const save = document.createElement('button'); save.type = 'button'; save.className = 'btn btn-primary'; save.textContent = 'Save override';
  save.addEventListener('click', async () => {
    const raw = manual.value.trim();
    const nextProgress = raw === '' ? null : Number(raw);
    const nextReason = raw === '' ? '' : reason.value.trim();
    const errors = [];
    if (raw !== '' && (!Number.isFinite(nextProgress) || nextProgress < 0 || nextProgress > 100)) errors.push('Manual Progress must be between 0 and 100.');
    if (raw !== '' && !nextReason) errors.push('Override Reason is required when Manual Progress is set.');
    if (errors.length) { message.textContent = errors.join(' '); message.hidden = false; return; }
    const previous = workpack.manualProgress == null ? null : Number(workpack.manualProgress);
    if (previous === nextProgress && text(workpack.progressOverrideReason) === nextReason) return;
    await saveWorkpackWorkspaceChange(workpack, { manualProgress: nextProgress, progressOverrideReason: nextReason }, 'Overview', 'WORKPACK_PROGRESS_OVERRIDE_CHANGED', { previousManualProgress: previous, manualProgress: nextProgress, overrideReason: nextReason });
  });
  controls.append(manualLabel, reasonLabel, message, save);
  panel.append(controls);
  return panel;
}

function renderResources(workpack) { const panel = document.createElement('div'); panel.className='workpack-overview'; [['Team',workpack.teamName],['People',workpack.peopleCount],['Planned man-hours',workpack.plannedManHours],['Actual man-hours',workpack.actualManHours],['Planned start',workpack.plannedStartDate],['Planned finish',workpack.plannedFinishDate],['Shift',workpack.shift],['Fabrication area',workpack.fabricationArea]].forEach(([label,value])=>panel.appendChild(createText('p',null,`${label}: ${value || '—'}`))); return panel; }

function taskSheetNumber(workpack) {
  const sequence = state.taskSheets.filter((item) => item.workpackId === workpack.id).length + 1;
  return `${workpack.wpNo || 'WORKPACK'}-TS-${String(sequence).padStart(3, '0')}`;
}

function linkedTaskSheetMto(workpack) {
  const ids = new Set(relationIds(workpack, WORKPACK_RELATION_TYPES.MTO_ITEM));
  if (ids.size) return state.mtoItems.filter((item) => ids.has(item.id));
  const drawingIds = relationIds(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION);
  if (drawingIds.length) return compatibleMtoItems(workpack, state.mtoItems, drawingIds, state.drawings);
  return state.mtoItems.filter((item) => item.workpackId === workpack.id);
}

function linkedTaskSheetCuttingSheets(workpack) {
  const ids = new Set(relationIds(workpack, WORKPACK_RELATION_TYPES.CUTTING_SHEET));
  return state.cuttingSheets.filter((sheet) => sheet.workpackId === workpack.id || ids.has(sheet.id));
}

function reopenWorkpackTaskSheet() {
  state.activeTab = 'Task Sheet';
  openWorkpackWorkspaceModal();
}

function openTaskSheet(workpack, taskSheet) {
  state.workspaceHost = null;
  openTaskSheetEditor(taskSheet, {
    showToast,
    onClose: reopenWorkpackTaskSheet,
    onExport: async (draft) => {
      try { await state.dependencies.exportTaskSheet?.(draft); }
      catch (error) { console.error(error); showToast(error?.message || 'Não foi possível exportar a Task Sheet.', 'error'); }
    },
    onSave: async (draft) => {
      try {
        const userName = state.dependencies.currentUserName || '';
        const saved = await state.dependencies.saveTaskSheet?.({ ...draft, createdBy: draft.createdBy || userName, updatedBy: userName });
        if (!saved) return null;
        state.taskSheets = [...state.taskSheets.filter((item) => item.id !== saved.id), saved];
        await auditWorkpack(taskSheet.id ? 'TASK_SHEET_UPDATED' : 'TASK_SHEET_CREATED', workpack, { taskSheetId: saved.id, taskSheetNumber: saved.number, lineCount: saved.lines.length });
        showToast('Task Sheet salva.', 'success');
        return saved;
      } catch (error) {
        console.error(error); showToast(error?.message || 'Não foi possível salvar a Task Sheet.', 'error'); return null;
      }
    },
  });
}

function renderTaskSheets(workpack) {
  const panel = document.createElement('div'); panel.className = 'workpack-task-sheets';
  const intro = document.createElement('div'); intro.className = 'workpack-task-sheet-heading';
  const copy = document.createElement('div'); copy.append(createText('h3', null, 'Task Sheet de fabricação'), createText('p', 'text-muted', 'Gere tarefas a partir da MTO e das Cutting Sheets vinculadas. Depois ajuste datas, duração, quantidade e notas diretamente na tabela.'));
  intro.append(copy); panel.append(intro);

  const creator = document.createElement('section'); creator.className = 'task-sheet-quick-create';
  const stationFields = document.createElement('div'); stationFields.className = 'task-sheet-station-selector';
  TASK_SHEET_WORKSTATIONS.forEach((workstation) => {
    const definition = taskSheetWorkstationDefinition(workstation);
    const field = document.createElement('label'); field.className = 'task-sheet-station-option';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = workstation; checkbox.checked = true;
    const planned = document.createElement('input'); planned.type = 'date'; planned.className = 'input'; planned.dataset.stationDate = workstation; planned.title = `Data planejada — ${definition.label}`;
    field.append(checkbox, createText('strong', null, definition.label), planned); stationFields.append(field);
  });
  const create = document.createElement('button'); create.type = 'button'; create.className = 'btn btn-primary'; create.textContent = 'Criar Task Sheet';
  create.addEventListener('click', () => {
    const workstations = [...stationFields.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    if (!workstations.length) return showToast('Selecione pelo menos uma estação de trabalho.', 'error');
    const plannedDates = Object.fromEntries([...stationFields.querySelectorAll('input[data-station-date]')].map((input) => [input.dataset.stationDate, input.value]));
    const cuttingSheets = linkedTaskSheetCuttingSheets(workpack);
    const draft = buildTaskSheetDraft({
      workpack, number: taskSheetNumber(workpack), workstations, plannedDates,
      mtoItems: linkedTaskSheetMto(workpack), cuttingSheets, cuttingSheetIds: cuttingSheets.map((sheet) => sheet.id),
      inventoryItems: state.inventoryItems, tag: getEquipmentName(workpack.equipmentId),
    });
    if (!draft.lines.length) return showToast('Vincule linhas de MTO ou uma Cutting Sheet ao Workpack antes de gerar a Task Sheet.', 'error');
    openTaskSheet(workpack, draft);
  });
  creator.append(createText('p', 'eyebrow', 'Geração rápida'), stationFields, create); panel.append(creator);

  const documents = state.taskSheets.filter((item) => item.workpackId === workpack.id).sort((a, b) => text(b.updatedAt).localeCompare(text(a.updatedAt)));
  const register = document.createElement('section'); register.className = 'task-sheet-register';
  register.append(createText('h3', null, `Documentos (${documents.length})`));
  if (!documents.length) register.append(createText('p', 'text-muted', 'Nenhuma Task Sheet salva para este Workpack.'));
  else {
    const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap';
    const table = document.createElement('table'); table.className = 'data-table'; const head = document.createElement('thead'); const header = document.createElement('tr');
    ['Número', 'Rev.', 'Status', 'Tarefas', 'Concluídas', 'Horas', 'Atualizado', 'Ações'].forEach((label) => appendTextCell(header, label)); head.append(header);
    const body = document.createElement('tbody');
    documents.forEach((document) => {
      const row = document.createElement('tr'); const completed = document.lines.filter((line) => line.completed).length; const hours = document.lines.reduce((sum, line) => sum + (Number(line.durationHours) || 0), 0);
      [document.number, document.revision, document.status, document.lines.length, completed, hours.toFixed(2), document.updatedAt ? new Date(document.updatedAt).toLocaleString() : ''].forEach((value) => appendTextCell(row, value));
      const actions = document.createElement('td'); actions.className = 'row-actions';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'btn btn-secondary'; open.textContent = 'Abrir'; open.addEventListener('click', () => openTaskSheet(workpack, document));
      const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.className = 'btn btn-secondary'; exportButton.textContent = 'Excel'; exportButton.addEventListener('click', async () => {
        try { await state.dependencies.exportTaskSheet?.(document); }
        catch (error) { console.error(error); showToast(error?.message || 'Não foi possível exportar a Task Sheet.', 'error'); }
      });
      actions.append(open, exportButton); row.append(actions); body.append(row);
    });
    table.append(head, body); tableWrap.append(table); register.append(tableWrap);
  }
  panel.append(register); return panel;
}

function operationInput(label, name, value = '', type = 'text') { const field = document.createElement('label'); field.className = 'field'; const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input'); input.className = 'input'; input.name = name; input.value = text(value); if (type !== 'textarea') input.type = type; field.append(createText('span', null, label), input); return field; }
function operationSelect(label, name, value, options) { const field = document.createElement('label'); field.className = 'field'; const select = document.createElement('select'); select.className = 'input'; select.name = name; options.forEach((optionValue) => { const option = document.createElement('option'); option.value = optionValue; option.textContent = optionValue; select.append(option); }); select.value = value || options[0]; field.append(createText('span', null, label), select); return field; }

function openOperationEditor(workpack, operation = null) {
  const existing = operation || createWorkpackOperation({}, normalizeWorkpackOperations(workpack.operations).length + 1);
  const isEdit = Boolean(operation);
  const form = document.createElement('form'); form.className = 'workpack-form-grid';
  const typeField = operationInput('Type', 'operationType', existing.operationType);
  const typeList = document.createElement('datalist'); typeList.id = 'workpack-operation-types'; WORKPACK_OPERATION_TYPES.forEach((type) => { const option = document.createElement('option'); option.value = type; typeList.append(option); }); typeField.querySelector('input').setAttribute('list', typeList.id);
  form.append(
    operationInput('Sequence', 'sequence', existing.sequence, 'number'), typeField, operationInput('Title *', 'title', existing.title), operationInput('Responsible', 'responsible', existing.responsible),
    operationSelect('Status', 'status', existing.status, WORKPACK_OPERATION_STATUSES), operationInput('Planned Start', 'plannedStartDate', existing.plannedStartDate, 'date'), operationInput('Planned Finish', 'plannedFinishDate', existing.plannedFinishDate, 'date'),
    operationInput('Actual Start', 'actualStartDate', existing.actualStartDate, 'date'), operationInput('Actual Finish', 'actualFinishDate', existing.actualFinishDate, 'date'), operationInput('Planned Man-Hours', 'plannedManHours', existing.plannedManHours, 'number'), operationInput('Actual Man-Hours', 'actualManHours', existing.actualManHours, 'number'), operationInput('Notes', 'notes', existing.notes, 'textarea'), typeList,
  );
  const errors = document.createElement('div'); errors.className = 'form-validation-summary'; errors.hidden = true;
  const body = document.createElement('div'); body.append(errors, form);
  state.workspaceHost = null;
  openModal({ title: isEdit ? 'Edit operation' : 'Add operation', body, wide: true, onClose: () => openWorkpackWorkspaceModal(), buttons: [{ label: 'Cancel' }, { label: isEdit ? 'Save operation' : 'Add operation', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
    const payload = Object.fromEntries(new FormData(form).entries()); const validation = validateWorkpackOperation(payload);
    if (validation.length) { errors.replaceChildren(createText('strong', null, 'Review the operation:'), ...validation.map((item) => createText('p', null, item.message))); errors.hidden = false; return; }
    const nextOperation = createWorkpackOperation({ ...payload, id: existing.id }, payload.sequence);
    const previous = normalizeWorkpackOperations(workpack.operations);
    const operations = normalizeOperationSequences(isEdit ? previous.map((item) => item.id === existing.id ? nextOperation : item) : [...previous, nextOperation]);
    const eventType = isEdit ? 'WORKPACK_OPERATION_UPDATED' : 'WORKPACK_OPERATION_ADDED';
    const saved = await saveWorkpackWorkspaceChange(workpack, { operations }, 'Operations', eventType, { operationId: nextOperation.id, operationTitle: nextOperation.title, previousStatus: isEdit ? existing.status : '', status: nextOperation.status });
    if (saved) closeModal();
  } }] });
}

function renderOperations(workpack) {
  const panel = document.createElement('div'); panel.className = 'workpack-operations';
  const operations = normalizeOperationSequences(workpack.operations);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'btn btn-primary'; add.textContent = 'Add Operation'; add.addEventListener('click', () => openOperationEditor(workpack)); panel.append(add);
  if (!operations.length) { panel.append(createText('p', 'text-muted', 'No operations configured.')); return panel; }
  const table = document.createElement('table'); table.className = 'data-table'; const head = document.createElement('thead'); const header = document.createElement('tr'); ['Sequence', 'Type', 'Title', 'Responsible', 'Status', 'Planned Start', 'Planned Finish', 'Actual Start', 'Actual Finish', 'Planned Man-Hours', 'Actual Man-Hours', 'Notes', 'Actions'].forEach((label) => appendTextCell(header, label)); head.append(header); const body = document.createElement('tbody');
  operations.forEach((operation, index) => { const row = document.createElement('tr'); [operation.sequence, operation.operationType, operation.title, operation.responsible, operation.status, operation.plannedStartDate, operation.plannedFinishDate, operation.actualStartDate, operation.actualFinishDate, operation.plannedManHours, operation.actualManHours, operation.notes].forEach((value) => appendCell(row, value)); const actions = document.createElement('td'); const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-secondary'; edit.textContent = 'Edit'; edit.addEventListener('click', () => openOperationEditor(workpack, operation)); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-critical'; remove.textContent = 'Delete'; remove.addEventListener('click', async () => { const saved = await saveWorkpackWorkspaceChange(workpack, { operations: operations.filter((item) => item.id !== operation.id) }, 'Operations', 'WORKPACK_OPERATION_DELETED', { operationId: operation.id, operationTitle: operation.title, previousStatus: operation.status }); if (saved) showToast('Operation deleted.', 'success'); }); const up = document.createElement('button'); up.type = 'button'; up.className = 'btn btn-ghost'; up.textContent = 'Up'; up.disabled = index === 0; up.addEventListener('click', () => saveWorkpackWorkspaceChange(workpack, { operations: moveWorkpackOperation(operations, operation.id, -1) }, 'Operations', 'WORKPACK_OPERATION_UPDATED', { operationId: operation.id, operationTitle: operation.title, change: 'sequence' })); const down = document.createElement('button'); down.type = 'button'; down.className = 'btn btn-ghost'; down.textContent = 'Down'; down.disabled = index === operations.length - 1; down.addEventListener('click', () => saveWorkpackWorkspaceChange(workpack, { operations: moveWorkpackOperation(operations, operation.id, 1) }, 'Operations', 'WORKPACK_OPERATION_UPDATED', { operationId: operation.id, operationTitle: operation.title, change: 'sequence' })); actions.append(edit, remove, up, down); row.append(actions); body.append(row); });
  table.append(head, body); const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap'; tableWrap.append(table); panel.append(tableWrap); return panel;
}

function captureWorkspaceScroll() {
  return {
    viewportTop: window.scrollY,
    viewportLeft: window.scrollX,
    lists: [...document.querySelectorAll('[data-workpack-scroll-key]')].map((element) => ({
      key: element.dataset.workpackScrollKey,
      top: element.scrollTop,
      left: element.scrollLeft,
    })),
  };
}

function restoreWorkspaceScroll(snapshot) {
  if (!snapshot) return;
  window.requestAnimationFrame(() => {
    snapshot.lists.forEach(({ key, top, left }) => {
      const element = document.querySelector(`[data-workpack-scroll-key="${key}"]`);
      if (element) {
        element.scrollTop = top;
        element.scrollLeft = left;
      }
    });
    window.scrollTo(snapshot.viewportLeft, snapshot.viewportTop);
  });
}

async function saveScopeRelations(workpack, targetType, targetIds) {
  const scrollSnapshot = captureWorkspaceScroll();
  const before = new Set(relationIds(workpack, targetType));
  let links;
  try {
    links = await state.dependencies.replaceWorkpackTargetLinks?.({
      projectId: workpack.projectId,
      workpackId: workpack.id,
      targetType,
      targetIds: uniqueIds(targetIds),
      linkedBy: state.dependencies.currentUserName || '',
    });
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível atualizar o escopo do Workpack.', 'error');
    return;
  }
  if (!Array.isArray(links)) {
    showToast('Não foi possível atualizar o escopo do Workpack.', 'error');
    return;
  }
  state.workpackLinks = [...state.workpackLinks.filter((link) => link.workpackId !== workpack.id), ...links];
  const after = new Set(relationIds(workpack, targetType));
  const drawingRelation = targetType === WORKPACK_RELATION_TYPES.DRAWING_REVISION;
  const eventPrefix = drawingRelation ? 'WORKPACK_DRAWING' : 'WORKPACK_MTO';
  const metadataField = drawingRelation ? 'drawingIds' : 'mtoItemIds';
  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  if (added.length) auditWorkpack(`${eventPrefix}_LINKED`, workpack, { [metadataField]: added });
  if (removed.length) auditWorkpack(`${eventPrefix}_UNLINKED`, workpack, { [metadataField]: removed });
  state.activeTab = 'Scope';
  renderWorkpackTable(state.workpacks);
  renderWorkspace();
  restoreWorkspaceScroll(scrollSnapshot);
}

function mtoDrawingValue(item = {}) {
  return text(item.drawingId || item.drawingNo || item.drawing).trim();
}

function mtoMarkValue(item = {}) {
  return text(item.mark || item.clientTag || item.markNo).trim();
}

function createScopeButton(label, onClick, className = 'btn btn-secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createScopeSelect(value, options, onChange, placeholder) {
  const select = document.createElement('select');
  select.className = 'input workpack-scope-filter';
  const initial = document.createElement('option');
  initial.value = '';
  initial.textContent = placeholder;
  select.append(initial);
  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.append(option);
  });
  select.value = options.includes(value) ? value : '';
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function createScopeRow(input, labelValue) {
  const row = document.createElement('label');
  row.className = `workpack-scope-row${input.checked ? ' is-linked' : ''}`;
  row.append(input, createText('span', null, labelValue));
  return row;
}

function renderScope(workpack) {
  const panel = document.createElement('div');
  panel.className = 'workpack-scope';
  const linkedDrawingIds = relationIds(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION);
  const drawingCandidates = compatibleDrawings(workpack, state.drawings);
  const linkedDrawings = drawingCandidates.filter((drawing) => linkedDrawingIds.includes(drawing.id));

  const drawingSection = document.createElement('section');
  drawingSection.className = 'workpack-scope-section';
  const drawingHeader = document.createElement('div');
  drawingHeader.className = 'workpack-scope-section-header';
  drawingHeader.append(createText('h3', null, `Linked Drawings (${linkedDrawings.length})`));
  const drawingActions = document.createElement('div');
  drawingActions.className = 'workpack-scope-actions';
  drawingActions.append(
    createScopeButton('Link all compatible', () => saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION, drawingCandidates.map((drawing) => drawing.id))),
    createScopeButton('Clear drawings', () => saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION, []), 'btn btn-ghost'),
  );
  drawingHeader.append(drawingActions);
  const drawingList = document.createElement('div');
  drawingList.className = 'workpack-scope-list';
  drawingList.dataset.workpackScrollKey = 'drawings';
  drawingCandidates.forEach((drawing) => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = linkedDrawingIds.includes(drawing.id);
    input.addEventListener('change', () => {
      const ids = input.checked
        ? uniqueIds([...linkedDrawingIds, drawing.id])
        : linkedDrawingIds.filter((id) => id !== drawing.id);
      saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION, ids);
    });
    drawingList.append(createScopeRow(input, `${drawingLabel(drawing)} — ${drawing.discipline || '—'} (${drawing.status || '—'})`));
  });
  if (!drawingCandidates.length) drawingList.append(createText('p', 'text-muted', 'No compatible Drawings found.'));
  drawingSection.append(drawingHeader, drawingList);

  const mtoCandidates = availableMtoItems(workpack, state.mtoItems);
  const linkedMtoIds = relationIds(workpack, WORKPACK_RELATION_TYPES.MTO_ITEM);
  const drawingValues = [...new Set(mtoCandidates.map(mtoDrawingValue).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const markValues = [...new Set(mtoCandidates.map(mtoMarkValue).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visibleMto = mtoCandidates.filter((item) => (
    (!state.scopeMtoDrawingFilter || mtoDrawingValue(item) === state.scopeMtoDrawingFilter) &&
    (!state.scopeMtoMarkFilter || mtoMarkValue(item) === state.scopeMtoMarkFilter)
  ));

  const mtoSection = document.createElement('section');
  mtoSection.className = 'workpack-scope-section';
  const mtoHeader = document.createElement('div');
  mtoHeader.className = 'workpack-scope-section-header';
  mtoHeader.append(createText('h3', null, `MTO Items (${linkedMtoIds.length} linked · ${mtoCandidates.length} available)`));
  const mtoActions = document.createElement('div');
  mtoActions.className = 'workpack-scope-actions';
  const linkedDrawingMto = visibleMto.filter((item) => mtoMatchesLinkedDrawings(item, linkedDrawingIds, state.drawings));
  mtoActions.append(
    createScopeButton(`Link drawing matches (${linkedDrawingMto.length})`, () => saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.MTO_ITEM, uniqueIds([...linkedMtoIds, ...linkedDrawingMto.map((item) => item.id)]))),
    createScopeButton(`Link visible (${visibleMto.length})`, () => saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.MTO_ITEM, uniqueIds([...linkedMtoIds, ...visibleMto.map((item) => item.id)]))),
    createScopeButton('Unlink visible', () => {
      const visibleIds = new Set(visibleMto.map((item) => item.id));
      return saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.MTO_ITEM, linkedMtoIds.filter((id) => !visibleIds.has(id)));
    }, 'btn btn-ghost'),
  );
  mtoHeader.append(mtoActions);
  const filters = document.createElement('div');
  filters.className = 'workpack-scope-filters';
  filters.append(
    createScopeSelect(state.scopeMtoDrawingFilter, drawingValues, (value) => { state.scopeMtoDrawingFilter = value; renderWorkspace(); }, 'All drawings'),
    createScopeSelect(state.scopeMtoMarkFilter, markValues, (value) => { state.scopeMtoMarkFilter = value; renderWorkspace(); }, 'All marks'),
  );
  const mtoList = document.createElement('div');
  mtoList.className = 'workpack-scope-list';
  mtoList.dataset.workpackScrollKey = 'mto';
  visibleMto.forEach((item) => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = linkedMtoIds.includes(item.id);
    input.addEventListener('change', () => {
      const ids = input.checked
        ? uniqueIds([...linkedMtoIds, item.id])
        : linkedMtoIds.filter((id) => id !== item.id);
      saveScopeRelations(workpack, WORKPACK_RELATION_TYPES.MTO_ITEM, ids);
    });
    const drawingMatched = mtoMatchesLinkedDrawings(item, linkedDrawingIds, state.drawings);
    input.title = drawingMatched ? 'Drawing linked' : 'Drawing pending';
    input.dataset.drawingMatch = drawingMatched ? 'true' : 'false';
    const cutLength=Number(item.cutLength || item.length || item.requiredLength || 0);
    const quantity=Math.max(1,Number(item.qty || item.quantity || 1));
    const size=cutLength > 0 ? `${cutLength.toLocaleString('pt-BR')} mm × ${quantity} = ${(cutLength * quantity).toLocaleString('pt-BR')} mm` : 'Comprimento não informado';
    mtoList.append(createScopeRow(input, `${mtoDrawingValue(item) || '—'} | ${mtoMarkValue(item) || '—'} | ${item.pos || item.position || '—'} | ${size} | ${item.identCode || 'Sem Ident Code'} | ${item.material || '—'} | ${item.status || '—'}`));
  });
  if (!visibleMto.length) mtoList.append(createText('p', 'text-muted', 'No compatible MTO Items found for the current filters.'));
  mtoSection.append(mtoHeader, filters, mtoList);
  panel.append(drawingSection, mtoSection);
  return panel;
}

function inventoryValue(item = {}, fields = []) { for (const field of fields) { if (item[field] != null && item[field] !== '') return String(item[field]); } return '—'; }
async function saveMaterialLinks(workpack, inventoryItemIds) {
  const before = new Set(relationIds(workpack, WORKPACK_RELATION_TYPES.INVENTORY_ITEM));
  let links;
  try {
    links = await state.dependencies.replaceWorkpackTargetLinks?.({
      projectId: workpack.projectId,
      workpackId: workpack.id,
      targetType: WORKPACK_RELATION_TYPES.INVENTORY_ITEM,
      targetIds: uniqueMaterialIds(inventoryItemIds),
      linkedBy: state.dependencies.currentUserName || '',
    });
  } catch (error) {
    if (error?.code === 'WORKPACK_INVENTORY_ITEM_CONFLICT') {
      showToast('Um ou mais materiais já estão vinculados a outro Workpack.', 'error');
      return null;
    }
    showToast(error?.message || 'Não foi possível atualizar os materiais do Workpack.', 'error');
    return null;
  }
  if (!Array.isArray(links)) {
    showToast('Não foi possível atualizar os materiais do Workpack.', 'error');
    return null;
  }
  state.workpackLinks = [...state.workpackLinks.filter((link) => link.workpackId !== workpack.id), ...links];
  const after = new Set(relationIds(workpack, WORKPACK_RELATION_TYPES.INVENTORY_ITEM));
  if (after.size > before.size) auditWorkpack('WORKPACK_INVENTORY_LINKED', workpack, { inventoryItemIds: [...after].filter((id) => !before.has(id)) });
  if (after.size < before.size) auditWorkpack('WORKPACK_INVENTORY_UNLINKED', workpack, { inventoryItemIds: [...before].filter((id) => !after.has(id)) });
  state.activeTab = 'Materials';
  renderWorkpackTable(state.workpacks);
  renderWorkspace();
  return workpack;
}
function renderMaterials(workpack) {
  const panel=document.createElement('div'); panel.className='workpack-materials';
  panel.append(createText('p','text-muted','Materials linked to this Workpack are selected only. They are not reserved or consumed.'));
  const actions=document.createElement('div'); actions.className='workpack-material-actions';
  const linkedInventoryIds=relationIds(workpack,WORKPACK_RELATION_TYPES.INVENTORY_ITEM);
  const linkedMtoIds=relationIds(workpack,WORKPACK_RELATION_TYPES.MTO_ITEM);
  const linkedElsewhere=new Set(state.workpacks.filter((item)=>item.id!==workpack.id).flatMap((item)=>relationIds(item,WORKPACK_RELATION_TYPES.INVENTORY_ITEM)));
  const select=document.createElement('button'); select.type='button'; select.className='btn btn-secondary'; select.textContent='Select Inventory';
  select.addEventListener('click',()=>state.dependencies.openInventorySelector?.({ mode:'select', selectedIds:linkedInventoryIds, unavailableIds:[...linkedElsewhere], onConfirm:async(items)=>{ const ids=uniqueMaterialIds([...linkedInventoryIds,...items.map((item)=>item.trace || item.traceability || item.id)]); return Boolean(await saveMaterialLinks(workpack, ids)); } }));
  const autoSelect=document.createElement('button'); autoSelect.type='button'; autoSelect.className='btn btn-primary'; autoSelect.textContent='Selecionar material automaticamente';
  autoSelect.addEventListener('click', async () => {
    const nestingSettings=await state.dependencies.getNestingSettings?.() || {};
    const selection=automaticWorkpackMaterialSelection(linkedMtoIds,state.mtoItems,state.inventoryItems.filter((item)=>!linkedElsewhere.has(item.trace || item.traceability || item.id)),{
      kerfMm:Number(nestingSettings.defaultKerf || 0),
      trim:nestingSettings.defaultTrimEnabled ? { left:Number(nestingSettings.defaultLeftTrim || 0), right:Number(nestingSettings.defaultRightTrim || 0) } : { left:0, right:0 },
    });
    if (!selection.selectedInventoryIds.length) {
      showToast(linkedMtoIds.length
        ? 'Nenhum material disponível cobre a quantidade dos itens MTO vinculados pelo Ident Code.'
        : 'Vincule itens MTO na aba Scope antes de selecionar materiais automaticamente.', 'warning');
      return;
    }
    const saved=await saveMaterialLinks(workpack,selection.selectedInventoryIds);
    if (!saved) return;
    const matchedCount=selection.selectedInventoryIds.length;
    const shortage=selection.unmatchedGroups.length;
    const nonLinear=selection.nonLinearGroups.length;
    showToast(`${matchedCount} item${matchedCount === 1 ? '' : 's'} de Inventory vinculado${matchedCount === 1 ? '' : 's'} por Ident Code.${nonLinear ? ` ${nonLinear} grupo${nonLinear === 1 ? '' : 's'} não linear${nonLinear === 1 ? '' : 'es'} vinculado${nonLinear === 1 ? '' : 's'} ao Workpack e excluído${nonLinear === 1 ? '' : 's'} apenas do nesting.` : ''}${shortage ? ` ${shortage} grupo${shortage === 1 ? '' : 's'} ainda precisa${shortage === 1 ? '' : 'm'} de material disponível.` : ''}`,shortage ? 'warning' : 'success');
  });
  actions.append(select,autoSelect); panel.appendChild(actions);
  const links=resolveWorkpackMaterials(linkedInventoryIds,state.inventoryItems); if(!links.length) panel.appendChild(createText('p','text-muted','No Inventory items linked to this Workpack.'));
  links.forEach((link)=>{ const row=document.createElement('article'); row.className='workpack-material-row'; const item=link.item; row.append(createText('strong',null,link.inventoryId),createText('span',null,item?`${inventoryValue(item,['identCode','sapCode'])} | ${inventoryValue(item,['po'])} | ${inventoryValue(item,['poItem'])} | ${inventoryValue(item,['materialGrade'])} | Heat ${inventoryValue(item,['heatNo'])} | Balance ${inventoryValue(item,['balanceQty'])} | ${inventoryValue(item,['status'])}`:'Missing Inventory record')); const warnings=materialWarnings(link); if(warnings.length) row.appendChild(createText('small','text-muted',warnings.join('; '))); const remove=document.createElement('button'); remove.type='button'; remove.className='btn btn-secondary'; remove.textContent='Unlink'; remove.addEventListener('click',()=>saveMaterialLinks(workpack,linkedInventoryIds.filter((id)=>id!==link.inventoryId))); row.appendChild(remove); panel.appendChild(row); }); return panel;
}
function renderNesting(workpack) { const panel=document.createElement('div'); const linkedMtoIds=new Set(relationIds(workpack,WORKPACK_RELATION_TYPES.MTO_ITEM)); const linkedInventoryIds=new Set(relationIds(workpack,WORKPACK_RELATION_TYPES.INVENTORY_ITEM)); const linkedMto=state.mtoItems.filter((item)=>linkedMtoIds.has(item.id)); const linkedInventory=state.inventoryItems.filter((item)=>linkedInventoryIds.has(item.trace || item.traceability || item.id)); const nesting=filterWorkpackNestingInputs(linkedMto,linkedInventory); panel.append(createText('p',null,`Linear MTO items sent to nesting: ${nesting.mtoItems.length}`),createText('p',null,`Linear Inventory items sent to nesting: ${nesting.inventoryItems.length}`),createText('p','text-muted',`Non-linear components kept in the Workpack: ${nesting.excludedMtoItems.length} MTO / ${nesting.excludedInventoryItems.length} Inventory`),createText('p',null,`Cutting Sheets: ${relationIds(workpack,WORKPACK_RELATION_TYPES.CUTTING_SHEET).length}`)); const open=document.createElement('button');open.type='button';open.className='btn btn-secondary';open.textContent='Open Cutting Sheet';open.addEventListener('click',()=>state.dependencies.onOpenPlanner?.());const stage=document.createElement('button');stage.type='button';stage.className='btn btn-primary';stage.textContent='Stage to Cutting Sheet';stage.addEventListener('click',()=>state.dependencies.onStageToPlanner?.(workpack,{mtoItems:state.mtoItems,inventoryItems:state.inventoryItems,workpackLinks:state.workpackLinks}));panel.append(open,stage);return panel; }

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = text(value) || '—';
  row.append(cell);
}

function waitForPdfTrigger(delayMs) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
}

function unavailablePdf(record, reason) {
  return { record, reason };
}

export async function downloadLinkedWorkpackDocumentsPdf(records = [], dependencies = {}, options = {}) {
  const downloaded = [];
  const unavailable = [];
  const materialCouponDelayMs = options.materialCouponDelayMs ?? 2200;
  const reportDelayMs = options.reportDelayMs ?? 400;

  for (const record of Array.isArray(records) ? records : []) {
    let exportPdf = null;
    let unavailableReason = '';
    if (record.type === 'Task Sheet') {
      unavailableReason = 'exportação PDF ainda não disponível';
    } else if (record.type === 'Material Coupon') {
      if (!record.raw) unavailableReason = 'registro não encontrado';
      else if (typeof dependencies.printMaterialCouponPdf !== 'function') unavailableReason = 'exportador PDF não configurado';
      else exportPdf = dependencies.printMaterialCouponPdf;
    } else if (record.type === 'Cutting Sheet') {
      const hasSnapshot = Array.isArray(record.raw?.bars) && record.raw.bars.length > 0
        || Array.isArray(record.raw?.planning?.solution?.stockUsed) && record.raw.planning.solution.stockUsed.length > 0
        || Array.isArray(record.raw?.metadata?.solution?.stockUsed) && record.raw.metadata.solution.stockUsed.length > 0;
      if (!record.raw) unavailableReason = 'registro não encontrado';
      else if (!hasSnapshot) unavailableReason = 'sem barras ou snapshot de corte';
      else if (typeof dependencies.printCuttingSheetPdf !== 'function') unavailableReason = 'exportador PDF não configurado';
      else exportPdf = dependencies.printCuttingSheetPdf;
    } else {
      unavailableReason = 'tipo de documento sem exportador PDF configurado';
    }

    if (unavailableReason) {
      unavailable.push(unavailablePdf(record, unavailableReason));
      continue;
    }

    try {
      const opened = await exportPdf(record.raw);
      if (opened === false) unavailable.push(unavailablePdf(record, 'janela de impressão bloqueada pelo navegador'));
      else {
        downloaded.push(record);
        await waitForPdfTrigger(record.type === 'Material Coupon' ? materialCouponDelayMs : reportDelayMs);
      }
    } catch (error) {
      console.error(`Falha ao abrir ${record.type} ${record.number} para PDF.`, error);
      unavailable.push(unavailablePdf(record, error?.message || 'falha ao abrir relatório'));
    }
  }
  return { downloaded, unavailable };
}

function pdfDownloadSummary(result = {}) {
  const downloaded = Array.isArray(result.downloaded) ? result.downloaded : [];
  const unavailable = Array.isArray(result.unavailable) ? result.unavailable : [];
  const openedLabel = `${downloaded.length} documento${downloaded.length === 1 ? '' : 's'} aberto${downloaded.length === 1 ? '' : 's'} para impressão/PDF`;
  if (!unavailable.length) return `${openedLabel}.`;
  const skipped = unavailable.map(({ record, reason }) => `${record.type} ${record.number} — ${reason}`).join('; ');
  return `${openedLabel}, ${unavailable.length} indisponível${unavailable.length === 1 ? '' : 'is'} (${skipped}).`;
}

function renderDocuments(workpack) {
  const panel = document.createElement('div');
  panel.className = 'workpack-linked-records';
  const resolved = resolveWorkpackDocuments(workpack, {
    materialCoupons: state.materialCoupons,
    cuttingSheets: state.cuttingSheets,
    returnMaterialVouchers: state.returnMaterialVouchers,
    taskSheets: state.taskSheets,
    workpackLinks: state.workpackLinks,
    plans: state.plans,
  });
  const contentHeader = document.createElement('div');
  contentHeader.className = 'workpack-documents-header';
  const headerCopy = document.createElement('div');
  headerCopy.append(
    createText('h3', null, 'Documentos vinculados'),
    createText('p', 'text-muted', 'Only explicit Workpack links are displayed. No Project or Equipment inference is used.'),
  );
  const downloadAll = document.createElement('button');
  downloadAll.type = 'button';
  downloadAll.className = 'btn btn-secondary';
  downloadAll.textContent = 'Baixar todos os documentos em PDF';
  downloadAll.disabled = !resolved.records.length;
  downloadAll.addEventListener('click', async () => {
    const originalLabel = downloadAll.textContent;
    downloadAll.disabled = true;
    downloadAll.textContent = 'Preparando documentos...';
    try {
      const result = await downloadLinkedWorkpackDocumentsPdf(resolved.records, state.dependencies);
      showToast(pdfDownloadSummary(result), result.unavailable.length ? 'warning' : 'success');
    } finally {
      downloadAll.textContent = originalLabel;
      downloadAll.disabled = !resolved.records.length;
    }
  });
  contentHeader.append(headerCopy, downloadAll);
  panel.append(contentHeader);
  if (resolved.missing.length) {
    panel.append(createText('p', 'text-muted', `Missing document references: ${resolved.missing.map((item) => `${item.type} ${item.id}`).join(', ')}`));
  }
  if (!resolved.records.length) {
    panel.append(createText('p', 'text-muted', 'No linked documents found.'));
    return panel;
  }
  const table = document.createElement('table');
  table.className = 'data-table';
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Type', 'Number / Name', 'Status', 'Updated Date', 'Source', 'Actions'].forEach((label) => appendTextCell(header, label));
  head.append(header);
  const body = document.createElement('tbody');
  resolved.records.forEach((record) => {
    const row = document.createElement('tr');
    appendCell(row, record.type);
    appendCell(row, record.number);
    appendCell(row, record.status);
    appendCell(row, record.updatedAt || 'Invalid or missing date');
    appendCell(row, record.source);
    const actionCell = document.createElement('td');
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-secondary';
    if (record.type === 'Material Coupon') {
      action.textContent = 'Open Manager';
      action.addEventListener('click', () => state.dependencies.onOpenMaterialCoupons?.());
    } else if (record.type === 'Task Sheet') {
      action.textContent = 'Open Task Sheet';
      action.addEventListener('click', () => openTaskSheet(workpack, record.raw));
    } else if (record.type === 'Cutting Sheet') {
      action.textContent = record.raw.status === 'draft' ? 'Edit Cutting Sheet' : 'Open Results';
      action.addEventListener('click', () => record.raw.status === 'draft'
        ? state.dependencies.onLoadPlan?.(record.raw.id)
        : state.dependencies.onOpenCuttingSheet?.(record.raw));
    } else {
      action.textContent = 'Open';
      action.disabled = true;
    }
    actionCell.append(action);
    row.append(actionCell);
    body.append(row);
  });
  table.append(head, body);
  panel.append(table);
  return panel;
}

function renderOffcuts(workpack) {
  const panel = document.createElement('div');
  panel.className = 'workpack-linked-records';
  const resolved = resolveWorkpackOffcuts(workpack, state.offcuts, state.workpackLinks);
  panel.append(createText('p', 'text-muted', 'Read-only offcut references. No material is returned, scrapped or changed from this screen.'));
  if (resolved.missing.length) panel.append(createText('p', 'text-muted', `Missing Offcut references: ${resolved.missing.join(', ')}`));
  if (!resolved.records.length) {
    panel.append(createText('p', 'text-muted', 'No linked Offcuts found.'));
    return panel;
  }
  const table = document.createElement('table');
  table.className = 'data-table';
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Traceability', 'Parent Traceability', 'Material', 'Heat', 'Dimensions / Length', 'Quantity', 'Status', 'Disposition', 'Source'].forEach((label) => appendTextCell(header, label));
  head.append(header);
  const body = document.createElement('tbody');
  resolved.records.forEach((record) => {
    const row = document.createElement('tr');
    [record.traceability, record.parentTraceability, record.material, record.heat, [record.dimensions, record.length].filter(Boolean).join(' / '), record.quantity, record.status, record.disposition, record.source].forEach((value) => appendCell(row, value));
    body.append(row);
  });
  table.append(head, body);
  panel.append(table);
  return panel;
}

const GENEALOGY_NODE_PRESENTATION = Object.freeze({
  STOCK: { label: 'Material original', icon: 'inventory_2' },
  MISSING_STOCK: { label: 'Referência ausente', icon: 'warning' },
  CUT_PART: { label: 'Peça cortada', icon: 'content_cut' },
  OFFCUT: { label: 'Retalho', icon: 'recycling' },
  RMV: { label: 'RMV', icon: 'assignment_return' },
  RETURNED_STOCK: { label: 'Retorno ao estoque', icon: 'warehouse' },
});

function genealogyDimensionLabel(node) {
  const values = [node.lengthMm, node.widthMm, node.thicknessMm].filter((value) => Number(value) > 0);
  return values.length ? `${values.join(' × ')} mm` : '';
}

function createGenealogyNode(node) {
  const item = document.createElement('li');
  item.className = `workpack-genealogy-item type-${text(node.type).toLowerCase()}`;
  item.setAttribute('role', 'treeitem');
  const card = document.createElement('article');
  card.className = 'workpack-genealogy-node';
  const icon = createText('span', 'material-symbols-outlined', GENEALOGY_NODE_PRESENTATION[node.type]?.icon || 'schema');
  icon.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  content.className = 'workpack-genealogy-node-content';
  const category = createText('span', 'workpack-genealogy-category', GENEALOGY_NODE_PRESENTATION[node.type]?.label || node.type);
  const title = createText('strong', null, node.label || 'Sem identificação');
  const details = [node.reference, genealogyDimensionLabel(node), node.quantity ? `Qtd. ${node.quantity}` : '', node.status].filter(Boolean);
  content.append(category, title);
  if (details.length) content.append(createText('span', 'text-muted', details.join(' · ')));
  card.append(icon, content);
  item.append(card);
  if (node.children.length) {
    const children = document.createElement('ul');
    children.className = 'workpack-genealogy-branch';
    children.setAttribute('role', 'group');
    node.children.forEach((child) => children.append(createGenealogyNode(child)));
    item.append(children);
  }
  return item;
}

function renderTraceability(workpack) {
  const genealogy = buildWorkpackGenealogy(workpack, {
    inventoryItems: state.inventoryItems,
    cuttingSheets: state.cuttingSheets,
    materialTransformations: state.materialTransformations,
    offcuts: state.offcuts,
    returnMaterialVouchers: state.returnMaterialVouchers,
    workpackLinks: state.workpackLinks,
  });
  const panel = document.createElement('div');
  panel.className = 'workpack-genealogy';
  const introduction = document.createElement('div');
  introduction.className = 'workpack-genealogy-heading';
  const headingText = document.createElement('div');
  headingText.append(createText('h3', null, 'Genealogia física do material'), createText('p', 'text-muted', 'Relações explícitas do Workpack, do material original às peças e aos retalhos devolvidos.'));
  introduction.append(headingText);
  panel.append(introduction);

  const summary = document.createElement('div');
  summary.className = 'workpack-genealogy-summary';
  [
    ['Materiais', genealogy.summary.materials],
    ['Peças cortadas', genealogy.summary.cutParts],
    ['Retalhos', genealogy.summary.offcuts],
    ['RMVs', genealogy.summary.rmvs],
    ['Retornos ao estoque', genealogy.summary.returnedStock],
    ['Pendências', genealogy.summary.missingReferences],
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = value && label === 'Pendências' ? 'workpack-genealogy-kpi has-warning' : 'workpack-genealogy-kpi';
    card.append(createText('span', null, label), createText('strong', null, value));
    summary.append(card);
  });
  panel.append(summary);

  if (genealogy.warnings.length) {
    const warning = document.createElement('section');
    warning.className = 'workpack-genealogy-warning';
    warning.append(createText('strong', null, 'Vínculos que precisam de revisão'));
    const list = document.createElement('ul');
    genealogy.warnings.forEach((message) => list.append(createText('li', null, message)));
    warning.append(list);
    panel.append(warning);
  }
  if (!genealogy.roots.length) {
    panel.append(createText('p', 'text-muted', 'Nenhuma transformação de material foi registrada para este Workpack. A árvore aparecerá após a confirmação de uma Cutting Sheet vinculada.'));
    return panel;
  }
  const tree = document.createElement('ul');
  tree.className = 'workpack-genealogy-tree';
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', `Genealogia de material do Workpack ${workpack.wpNo || workpack.id}`);
  genealogy.roots.forEach((root) => tree.append(createGenealogyNode(root)));
  panel.append(tree);
  return panel;
}

function renderActivity(workpack) {
  const panel = document.createElement('div');
  panel.className = 'workpack-linked-records';
  const events = resolveWorkpackActivity(state.auditEvents, workpack.id);
  if (!events.length) {
    panel.append(createText('p', 'text-muted', 'No audit activity found for this Workpack.'));
    return panel;
  }
  const table = document.createElement('table');
  table.className = 'data-table';
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Event', 'User', 'Timestamp', 'Summary', 'Source'].forEach((label) => appendTextCell(header, label));
  head.append(header);
  const body = document.createElement('tbody');
  events.forEach((event) => {
    const row = document.createElement('tr');
    [event.event, event.user || 'Not recorded', event.timestamp || 'Invalid or missing date', event.summary || '—', event.source].forEach((value) => appendCell(row, value));
    body.append(row);
  });
  table.append(head, body);
  panel.append(table);
  return panel;
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
      state.activeTab = 'Overview';
      renderWorkpackTable(state.workpacks);
      openWorkpackWorkspaceModal(workpack);
    });

    appendTextCell(row, workpack.wpNo);
    appendTextCell(row, workpack.title);
    appendTextCell(row, getProjectName(workpack.projectId));
    appendTextCell(row, getEquipmentName(workpack.equipmentId));
    appendTextCell(row, workpack.workpackType);
    appendTextCell(row, workpack.priority);
    appendTextCell(row, workpack.status);
    appendTextCell(row, `${calculateWorkpackProgress(workpack).effectiveProgress}%`);
    return row;
  });

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
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
  ['workpack-type-filter', 'workpack-priority-filter'].forEach((id) => {
    const select = el(id); if (!select || select.options.length > 1) return;
    const values = id.includes('type') ? TYPE_OPTIONS : PRIORITY_OPTIONS;
    values.forEach((value) => select.appendChild(new Option(value, value)));
  });
  renderWorkpackTable(state.workpacks);
  renderWorkpackKpis();
  renderWorkspace();
}

function renderWorkpackKpis() {
  const container = el('workpack-kpis'); if (!container) return;
  const metrics = calculateWorkpackMetrics(state.workpacks, getCurrentWorkpackFilters().projectId);
  const labels = [['Total', metrics.total], ['Active', metrics.active], ['Material Pending', metrics.materialPending], ['Ready for Nesting', metrics.readyForNesting], ['In Fabrication', metrics.inFabrication], ['Completed', metrics.completed], ['On Hold', metrics.onHold]];
  container.replaceChildren(...labels.map(([label,value]) => { const card=document.createElement('div'); card.className='kpi-card'; card.append(createText('span','kpi-label',label),createText('strong','kpi-value',value)); return card; }));
}

export function syncWorkpackMtoItems(updatedItems = []) {
  (Array.isArray(updatedItems) ? updatedItems : []).forEach((updated) => {
    const current = state.mtoItems.find((item) => item.id === updated?.id);
    if (!current) return;
    if (state.scopeMtoDrawingFilter === mtoDrawingValue(current)) state.scopeMtoDrawingFilter = mtoDrawingValue(updated);
    if (state.scopeMtoMarkFilter === mtoMarkValue(current)) state.scopeMtoMarkFilter = mtoMarkValue(updated);
  });
  state.mtoItems = mergeUpdatedMtoItems(state.mtoItems, updatedItems);
  if (!state.initialized) return;
  renderWorkpackTable(state.workpacks);
  renderWorkspace();
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
      return { value: projectValue(project), label: label || 'Projeto sem nome' };
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
    createSelectField('Criado a partir de', 'sourceType', workpack.sourceType || 'MTO_LINES', SOURCE_TYPE_OPTIONS.map((value) => ({ value, label: value }))),
    createSelectField('Workpack Type', 'workpackType', workpack.workpackType || 'GENERAL', TYPE_OPTIONS.map((value) => ({ value, label: value }))),
    createSelectField('Priority', 'priority', workpack.priority || 'NORMAL', PRIORITY_OPTIONS.map((value) => ({ value, label: value }))),
    createField('Disciplina', 'discipline', workpack.discipline),
    createField('Planned Start', 'plannedStart', workpack.plannedStart, 'date'),
    createField('Planned Finish', 'plannedFinish', workpack.plannedFinish, 'date'),
    createSelectField('Status', 'status', workpack.status || 'PLANNED', STATUS_OPTIONS.map((status) => ({ value: status, label: status }))),
    createField('Responsible', 'responsible', workpack.responsible),
    createField('Planned Man-Hours', 'plannedManHours', workpack.plannedManHours, 'number'),
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
  if (!text(payload.wpNo).trim()) return 'WP No e obrigatorio.';
  return '';
}

async function refreshWorkpacks() {
  const { listWorkpacks, listProjects, listEquipments, listDrawings, listMtoItems, listInventoryItems, listMaterialCoupons, listCuttingSheets, listReturnMaterialVouchers, listMaterialTransformations, listWorkpackLinks, migrateLegacyWorkpackLinks, listPlans, listOffcuts, listAuditEvents, listTaskSheets } = state.dependencies;
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
  const [projects, allEquipments, allDrawings, mtoItems, inventoryItems, materialCoupons, cuttingSheets, returnMaterialVouchers, materialTransformations, workpackLinks, plans, offcuts, auditEvents, taskSheets] = await Promise.all([
    listProjects ? listProjects() : Promise.resolve(state.projects),
    listEquipments ? listEquipments({}) : Promise.resolve(state.equipments),
    listDrawings ? listDrawings({}) : Promise.resolve(state.drawings),
    listMtoItems ? listMtoItems({}) : Promise.resolve(state.mtoItems),
    listInventoryItems ? listInventoryItems() : Promise.resolve(state.inventoryItems),
    listMaterialCoupons ? listMaterialCoupons() : Promise.resolve(state.materialCoupons),
    listCuttingSheets ? listCuttingSheets() : Promise.resolve(state.cuttingSheets),
    listReturnMaterialVouchers ? listReturnMaterialVouchers() : Promise.resolve(state.returnMaterialVouchers),
    listMaterialTransformations ? listMaterialTransformations() : Promise.resolve(state.materialTransformations),
    listWorkpackLinks ? listWorkpackLinks() : Promise.resolve(state.workpackLinks),
    listPlans ? listPlans() : Promise.resolve(state.plans),
    listOffcuts ? listOffcuts() : Promise.resolve(state.offcuts),
    listAuditEvents ? listAuditEvents() : Promise.resolve(state.auditEvents),
    listTaskSheets ? listTaskSheets() : Promise.resolve(state.taskSheets),
  ]);

  state.projects = Array.isArray(projects) ? projects : [];
  state.equipments = Array.isArray(allEquipments) ? allEquipments : [];
  state.drawings = Array.isArray(allDrawings) ? allDrawings : [];
  state.mtoItems = Array.isArray(mtoItems) ? mtoItems : [];
  state.inventoryItems = Array.isArray(inventoryItems) ? inventoryItems : [];
  state.materialCoupons = Array.isArray(materialCoupons) ? materialCoupons : [];
  state.cuttingSheets = Array.isArray(cuttingSheets) ? cuttingSheets : [];
  state.returnMaterialVouchers = Array.isArray(returnMaterialVouchers) ? returnMaterialVouchers : [];
  state.materialTransformations = Array.isArray(materialTransformations) ? materialTransformations : [];
  state.workpackLinks = Array.isArray(workpackLinks) ? workpackLinks : [];
  state.plans = Array.isArray(plans) ? plans : [];
  state.offcuts = Array.isArray(offcuts) ? offcuts : [];
  state.auditEvents = Array.isArray(auditEvents) ? auditEvents : [];
  state.taskSheets = Array.isArray(taskSheets) ? taskSheets : [];

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
    status: nextFilters.status,
  });

  state.workpacks = Array.isArray(workpacks) ? workpacks : [];
  if (migrateLegacyWorkpackLinks && state.workpacks.length) {
    const migration = await migrateLegacyWorkpackLinks(state.workpacks, state.dependencies.currentUserName || '');
    if (Array.isArray(migration?.links)) state.workpackLinks = migration.links;
  }
  if (state.selectedId && !state.workpacks.some((workpack) => workpack.id === state.selectedId)) {
    state.selectedId = null;
  }
  await renderWorkpackPage();
}

function openWorkpackEditor(workpack = null, { duplicateSourceId = '' } = {}) {
  const isEdit = Boolean(workpack?.id);
  const linkedDrawingId = isEdit ? relationIds(workpack, WORKPACK_RELATION_TYPES.DRAWING_REVISION)[0] || '' : '';
  const form = buildWorkpackForm({ ...(workpack || {}), drawingId: linkedDrawingId || workpack?.drawingId || '' });
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
              const releaseRequested = payload.status === 'RELEASED_FOR_CUTTING' && workpack.status !== 'RELEASED_FOR_CUTTING';
              const snapshotLinks = [
                ...state.workpackLinks.filter((link) => !(link.workpackId === workpack.id && link.targetType === WORKPACK_RELATION_TYPES.DRAWING_REVISION)),
                ...(payload.drawingId ? [{ workpackId: workpack.id, targetType: WORKPACK_RELATION_TYPES.DRAWING_REVISION, targetId: payload.drawingId, status: 'ACTIVE' }] : []),
              ];
              const nextPayload = releaseRequested ? {
                ...payload,
                releaseSnapshot: buildWorkpackReleaseSnapshot({ ...workpack, ...payload }, {
                  drawings: state.drawings,
                  mtoItems: state.mtoItems,
                  inventoryItems: state.inventoryItems,
                  materialCoupons: state.materialCoupons,
                  cuttingSheets: state.cuttingSheets,
                  workpackLinks: snapshotLinks,
                }, { userName: state.dependencies.currentUserName || '' }),
              } : payload;
              const updated = await state.dependencies.updateWorkpack?.(workpack.id, nextPayload);
              await state.dependencies.replaceWorkpackTargetLinks?.({ projectId: workpack.projectId, workpackId: workpack.id, targetType: WORKPACK_RELATION_TYPES.DRAWING_REVISION, targetIds: payload.drawingId ? [payload.drawingId] : [], linkedBy: state.dependencies.currentUserName || '' });
              auditWorkpack('WORKPACK_UPDATED', updated || workpack);
              if (releaseRequested) auditWorkpack('WORKPACK_RELEASE_SNAPSHOT_CREATED', updated || workpack);
              showToast('Workpack atualizado.', 'success');
            } else {
              const created = await state.dependencies.createWorkpack?.(payload);
              await state.dependencies.replaceWorkpackTargetLinks?.({ projectId: created.projectId, workpackId: created.id, targetType: WORKPACK_RELATION_TYPES.DRAWING_REVISION, targetIds: payload.drawingId ? [payload.drawingId] : [], linkedBy: state.dependencies.currentUserName || '' });
              state.selectedId = created?.id || null;
              auditWorkpack(duplicateSourceId ? 'WORKPACK_DUPLICATED' : 'WORKPACK_CREATED', created, duplicateSourceId ? { sourceWorkpackId: duplicateSourceId } : {});
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
            auditWorkpack('WORKPACK_DELETED', workpack);
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
  el('btn-workpack-duplicate')?.addEventListener('click', async () => {
    const source = await state.dependencies.getWorkpack?.(state.selectedId);
    if (!source) return showToast('Selecione um workpack para duplicar.', 'error');
    openWorkpackEditor(duplicateWorkpack(source), { duplicateSourceId: source.id });
  });
  el('btn-workpack-delete')?.addEventListener('click', handleDelete);
  el('btn-workpack-refresh')?.addEventListener('click', refreshWorkpacks);
  el('workpack-project-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-equipment-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-drawing-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-status-filter')?.addEventListener('change', refreshWorkpacks);
  el('workpack-type-filter')?.addEventListener('change', () => renderWorkpackTable(state.workpacks));
  el('workpack-priority-filter')?.addEventListener('change', () => renderWorkpackTable(state.workpacks));
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
