import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'mtoItems';

export const MTO_ITEM_STATUS = Object.freeze({
  OPEN: 'open',
  INVALID: 'invalid',
  MATCHED: 'matched',
  RESERVED: 'reserved',
  NESTED: 'nested',
  ISSUED: 'issued',
  CUT: 'cut',
  CANCELLED: 'cancelled',
});

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeMtoItem(input = {}, existing = null) {
  const createdAt = text(input.createdAt) || existing?.createdAt || nowIso();
  const updatedAt = nowIso();
  const qty = numberValue(input.qty);
  const cutLength = numberValue(input.cutLength);
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    batchId: text(input.batchId),
    drawing: text(input.drawing),
    revision: text(input.revision),
    mark: text(input.mark),
    pos: text(input.pos),
    qty,
    description: text(input.description),
    cutLength,
    requiredLength: input.requiredLength == null ? qty * cutLength : numberValue(input.requiredLength),
    identCode: text(input.identCode),
    tag: text(input.tag),
    weightKg: numberValue(input.weightKg),
    material: text(input.material),
    line: text(input.line),
    type: text(input.type),
    discipline: text(input.discipline),
    status: text(input.status) || MTO_ITEM_STATUS.OPEN,
    createdAt,
    updatedAt,
    metadata: objectValue(input.metadata),
  };
}

function matchesFilters(item, filters = {}) {
  const fields = ['projectId', 'batchId', 'drawing', 'mark', 'pos', 'material', 'identCode', 'status'];
  return fields.every((field) => filters[field] == null || item[field] === String(filters[field]));
}

export async function createMtoItem(input) {
  const db = await getDB();
  const item = normalizeMtoItem(input);
  await idbPut(db, STORE_NAME, item);
  return item;
}

export async function saveMtoItem(input) {
  const db = await getDB();
  const existing = input?.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const item = normalizeMtoItem(input, existing);
  await idbPut(db, STORE_NAME, item);
  return item;
}

export async function getAllMtoItems() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}

export async function getMtoItem(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getMtoItems(filters = {}) {
  const items = await getAllMtoItems();
  return items.filter((item) => matchesFilters(item, filters));
}

export async function updateMtoItem(id, patch) {
  const current = await getMtoItem(id);
  if (!current) return null;
  return saveMtoItem({ ...current, ...(patch || {}), id });
}

export async function deleteMtoItem(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function deleteMtoItems(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteMtoItem(id)));
  return uniqueIds;
}

export async function clearMtoItems() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
