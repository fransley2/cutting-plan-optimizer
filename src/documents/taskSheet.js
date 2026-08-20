import { TASK_SHEET_WORKSTATIONS, taskSheetWorkstationDefinition } from '../core/taskSheet.js';

export const TASK_SHEET_COLUMNS = Object.freeze([
  ['workstationLabel', 'Workstation', 14], ['drawingNo', 'Desenho nº', 26], ['revision', 'Rev.', 8],
  ['description', 'Descrição', 28], ['mark', 'Marca', 20], ['position', 'Pos.', 10],
  ['lengthMm', 'Comp. (mm)', 14], ['traceability', 'Traceability', 24], ['weightKg', 'Peso (kg)', 12],
  ['tag', 'TAG', 28], ['activity', 'Atividade', 28], ['actionQuantity', 'Quantidade', 12],
  ['durationHours', 'Duration (hr)', 14], ['plannedDate', 'Data Planejada', 16], ['actualDate', 'Data Realizada', 16],
  ['completed', 'Check', 10], ['note', 'Nota', 28],
].map(([key, label, width]) => ({ key, label, width })));

function text(value) { return value == null ? '' : String(value); }

export function buildTaskSheetDocument(taskSheet = {}) {
  const lines = (Array.isArray(taskSheet.lines) ? taskSheet.lines : []).map((line) => ({
    ...line,
    workstationLabel: taskSheetWorkstationDefinition(line.workstation).label,
    lengthMm: Number(line.lengthMm) || 0,
    weightKg: Number(line.weightKg) || 0,
    actionQuantity: Number(line.actionQuantity) || 0,
    durationHours: Number(line.durationHours) || 0,
    completed: line.completed === true,
  }));
  const sections = TASK_SHEET_WORKSTATIONS.map((workstation) => ({
    workstation,
    label: taskSheetWorkstationDefinition(workstation).label,
    quantityLabel: taskSheetWorkstationDefinition(workstation).quantityLabel,
    lines: lines.filter((line) => line.workstation === workstation),
  })).filter((section) => section.lines.length);
  return {
    documentType: 'taskSheet',
    documentNumber: text(taskSheet.number),
    title: text(taskSheet.title),
    revision: text(taskSheet.revision || '00'),
    documentDate: text(taskSheet.documentDate),
    status: text(taskSheet.status || 'DRAFT'),
    columns: TASK_SHEET_COLUMNS.map((column) => ({ ...column })),
    sections,
    summary: {
      totalLines: lines.length,
      completedLines: lines.filter((line) => line.completed).length,
      plannedHours: lines.reduce((sum, line) => sum + line.durationHours, 0),
    },
  };
}
