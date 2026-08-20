import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'taskSheets';

function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function nowIso() { return new Date().toISOString(); }

function normalizeLine(line = {}, existing = null) {
  return {
    id: text(line.id) || existing?.id || createId(),
    workstation: text(line.workstation).toUpperCase(),
    sourceMtoItemId: text(line.sourceMtoItemId),
    sourceCuttingSheetId: text(line.sourceCuttingSheetId),
    sourcePieceId: text(line.sourcePieceId),
    drawingNo: text(line.drawingNo), revision: text(line.revision), description: text(line.description),
    mark: text(line.mark), position: text(line.position), lengthMm: number(line.lengthMm),
    traceability: text(line.traceability), weightKg: number(line.weightKg), tag: text(line.tag),
    activity: text(line.activity), actionQuantity: number(line.actionQuantity), durationHours: number(line.durationHours),
    plannedDate: text(line.plannedDate), actualDate: text(line.actualDate), completed: line.completed === true,
    note: text(line.note),
  };
}

export function normalizeTaskSheet(input = {}, existing = null) {
  const existingLines = new Map((existing?.lines || []).map((line) => [line.id, line]));
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId), workpackId: text(input.workpackId), equipmentId: text(input.equipmentId),
    number: text(input.number), revision: text(input.revision || '00'), title: text(input.title),
    documentDate: text(input.documentDate), status: text(input.status || existing?.status || 'DRAFT').toUpperCase(),
    lines: (Array.isArray(input.lines) ? input.lines : []).map((line) => normalizeLine(line, existingLines.get(line.id))),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(), createdBy: text(input.createdBy || existing?.createdBy), updatedBy: text(input.updatedBy),
    metadata: input.metadata && typeof input.metadata === 'object' ? structuredClone(input.metadata) : structuredClone(existing?.metadata || {}),
  };
}

export async function saveTaskSheet(input = {}) {
  const db = await getDB();
  const existing = input.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeTaskSheet(input, existing);
  if (!record.projectId) throw new Error('projectId is required to save a Task Sheet.');
  if (!record.workpackId) throw new Error('workpackId is required to save a Task Sheet.');
  if (!record.number) throw new Error('Task Sheet number is required.');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function listTaskSheets(filters = {}) {
  const records = await idbGetAll(await getDB(), STORE_NAME);
  return records.filter((record) => ['projectId', 'workpackId', 'status', 'number']
    .every((field) => filters[field] == null || filters[field] === '' || record[field] === String(filters[field])));
}

export async function clearTaskSheets() { return idbClear(await getDB(), STORE_NAME); }
