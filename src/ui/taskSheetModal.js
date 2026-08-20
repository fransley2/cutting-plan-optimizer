import { openModal, closeModal } from './modal.js';
import { TASK_SHEET_WORKSTATIONS, taskSheetWorkstationDefinition, validateTaskSheet } from '../core/taskSheet.js';

function text(value) { return value == null ? '' : String(value); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function node(tag, className, value) { const element = document.createElement(tag); if (className) element.className = className; if (value != null) element.textContent = text(value); return element; }

function inputControl(line, key, type = 'text', options = {}) {
  const input = document.createElement('input');
  input.type = type;
  input.className = `task-sheet-cell-input${options.numeric ? ' is-numeric' : ''}`;
  if (options.step) input.step = options.step;
  if (options.min != null) input.min = String(options.min);
  if (type === 'checkbox') input.checked = line[key] === true;
  else input.value = text(line[key]);
  input.addEventListener('change', () => {
    if (type === 'checkbox') line[key] = input.checked;
    else if (options.numeric) line[key] = number(input.value);
    else line[key] = input.value.trim();
  });
  return input;
}

function appendEditorCell(row, control, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.append(control);
  row.append(cell);
}

function buildLineRow(line, draft, rerender) {
  const row = document.createElement('tr');
  row.dataset.taskLineId = line.id;
  appendEditorCell(row, inputControl(line, 'drawingNo'));
  appendEditorCell(row, inputControl(line, 'revision'));
  appendEditorCell(row, inputControl(line, 'description'));
  appendEditorCell(row, inputControl(line, 'mark'));
  appendEditorCell(row, inputControl(line, 'position'));
  appendEditorCell(row, inputControl(line, 'lengthMm', 'number', { numeric: true, step: '0.01', min: 0 }), 'is-number');
  appendEditorCell(row, inputControl(line, 'traceability'));
  appendEditorCell(row, inputControl(line, 'weightKg', 'number', { numeric: true, step: '0.01', min: 0 }), 'is-number');
  appendEditorCell(row, inputControl(line, 'tag'));
  appendEditorCell(row, inputControl(line, 'activity'));
  appendEditorCell(row, inputControl(line, 'actionQuantity', 'number', { numeric: true, step: '1', min: 1 }), 'is-number');
  appendEditorCell(row, inputControl(line, 'durationHours', 'number', { numeric: true, step: '0.25', min: 0 }), 'is-number');
  appendEditorCell(row, inputControl(line, 'plannedDate', 'date'));
  appendEditorCell(row, inputControl(line, 'actualDate', 'date'));
  appendEditorCell(row, inputControl(line, 'completed', 'checkbox'), 'task-sheet-check-cell');
  appendEditorCell(row, inputControl(line, 'note'));
  const actions = document.createElement('td');
  actions.className = 'row-actions';
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'icon-action icon-action-danger'; remove.title = 'Remover tarefa';
  remove.append(node('span', 'material-symbols-outlined', 'delete'));
  remove.addEventListener('click', () => { draft.lines = draft.lines.filter((item) => item.id !== line.id); rerender(); });
  actions.append(remove); row.append(actions);
  return row;
}

function createEmptyLine(workstation) {
  const definition = taskSheetWorkstationDefinition(workstation);
  return {
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    workstation, drawingNo: '', revision: '', description: '', mark: '', position: '', lengthMm: 0,
    traceability: '', weightKg: 0, tag: '', activity: `${definition.activity} - Material`,
    actionQuantity: definition.defaultQuantity, durationHours: definition.defaultQuantity * definition.hoursPerAction,
    plannedDate: '', actualDate: '', completed: false, note: '',
  };
}

function buildStationSection(workstation, draft, rerender) {
  const definition = taskSheetWorkstationDefinition(workstation);
  const lines = draft.lines.filter((line) => line.workstation === workstation);
  const section = node('section', 'task-sheet-station');
  const header = node('div', 'task-sheet-station-header');
  const title = node('div');
  title.append(node('p', 'eyebrow', 'Estação de trabalho'), node('h3', null, definition.label));
  const bulk = node('div', 'task-sheet-bulk-actions');
  const plannedDate = document.createElement('input'); plannedDate.type = 'date'; plannedDate.className = 'input'; plannedDate.title = 'Data planejada para a estação';
  const duration = document.createElement('input'); duration.type = 'number'; duration.min = '0'; duration.step = '0.25'; duration.className = 'input'; duration.placeholder = 'Horas'; duration.title = 'Duração por linha';
  const apply = node('button', 'btn btn-secondary', 'Aplicar a todas'); apply.type = 'button';
  apply.addEventListener('click', () => {
    lines.forEach((line) => { if (plannedDate.value) line.plannedDate = plannedDate.value; if (duration.value !== '') line.durationHours = number(duration.value); });
    rerender();
  });
  const add = node('button', 'btn btn-secondary', 'Adicionar linha'); add.type = 'button';
  add.addEventListener('click', () => { draft.lines.push(createEmptyLine(workstation)); rerender(); });
  bulk.append(plannedDate, duration, apply, add); header.append(title, bulk); section.append(header);
  if (!lines.length) { section.append(node('p', 'text-muted', 'Nenhuma tarefa nesta estação. Use “Adicionar linha” para incluir uma atividade manual.')); return section; }
  const wrap = node('div', 'table-wrap task-sheet-table-wrap');
  const table = node('table', 'data-table task-sheet-table');
  const head = document.createElement('thead'); const headerRow = document.createElement('tr');
  ['Desenho nº', 'Rev.', 'Descrição', 'Marca', 'Pos.', 'Comp. (mm)', 'Traceability', 'Peso (kg)', 'TAG', 'Atividade', definition.quantityLabel, 'Duration (hr)', 'Data Planejada', 'Data Realizada', 'Check', 'Nota', 'Ações']
    .forEach((label) => headerRow.append(node('th', null, label)));
  head.append(headerRow);
  const body = document.createElement('tbody'); lines.forEach((line) => body.append(buildLineRow(line, draft, rerender)));
  table.append(head, body); wrap.append(table); section.append(wrap); return section;
}

export function openTaskSheetEditor(taskSheet, options = {}) {
  const draft = structuredClone(taskSheet);
  const body = node('div', 'task-sheet-editor');
  function render() {
    const header = node('section', 'task-sheet-document-header');
    const fields = [
      ['Número', 'number', 'text'], ['Revisão', 'revision', 'text'], ['Data', 'documentDate', 'date'], ['Título', 'title', 'text'],
    ].map(([label, key, type]) => {
      const field = node('label', `field${key === 'title' ? ' task-sheet-title-field' : ''}`);
      field.append(node('span', null, label), inputControl(draft, key, type));
      field.querySelector('input').className = 'input editable-field';
      return field;
    });
    header.append(...fields);
    const summary = node('div', 'task-sheet-summary');
    const completed = draft.lines.filter((line) => line.completed).length;
    const hours = draft.lines.reduce((sum, line) => sum + number(line.durationHours), 0);
    [['Tarefas', draft.lines.length], ['Concluídas', completed], ['Horas planejadas', hours.toFixed(2)]].forEach(([label, value]) => {
      const card = node('div', 'task-sheet-summary-card'); card.append(node('span', null, label), node('strong', null, value)); summary.append(card);
    });
    body.replaceChildren(header, summary, ...TASK_SHEET_WORKSTATIONS.map((station) => buildStationSection(station, draft, render)));
  }
  render();
  openModal({
    title: `Task Sheet — ${draft.number || 'Nova'}`,
    body,
    wide: true,
    onClose: options.onClose,
    buttons: [
      { label: 'Fechar' },
      { label: 'Exportar Excel', variant: 'btn-secondary', closeOnClick: false, onClick: () => options.onExport?.(draft) },
      { label: 'Salvar Task Sheet', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
        const errors = validateTaskSheet(draft);
        if (errors.length) { options.showToast?.(errors[0], 'error'); return; }
        const saved = await options.onSave?.(draft);
        if (!saved) return;
        closeModal();
        options.onSaved?.(saved);
      } },
    ],
  });
}
