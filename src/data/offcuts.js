import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'offcuts';

export const OFFCUT_STATUS = Object.freeze({
  DRAFT: 'draft',
  REUSABLE: 'reusable',
  RETURNED_TO_STOCK: 'returned_to_stock',
  SCRAP: 'scrap',
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

function normalizeOffcut(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    parentInventoryItemId: text(input.parentInventoryItemId),
    newInventoryItemId: text(input.newInventoryItemId),
    cuttingSheetId: text(input.cuttingSheetId),
    returnMaterialVoucherId: text(input.returnMaterialVoucherId),
    material: text(input.material),
    heat: text(input.heat),
    traceability: text(input.traceability),
    length: numberValue(input.length),
    qty: numberValue(input.qty),
    status: text(input.status) || OFFCUT_STATUS.DRAFT,
    disposition: text(input.disposition),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: text(input.createdBy),
    updatedBy: text(input.updatedBy),
    metadata: objectValue(input.metadata),
  };
}

function matchesFilters(record, filters = {}) {
  const fields = [
    'projectId',
    'parentInventoryItemId',
    'cuttingSheetId',
    'returnMaterialVoucherId',
    'material',
    'heat',
    'traceability',
    'status',
    'disposition',
  ];
  return fields.every((field) => filters[field] == null || record[field] === String(filters[field]));
}

export async function createOffcut(input) {
  const db = await getDB();
  const record = normalizeOffcut(input);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function saveOffcut(input) {
  const db = await getDB();
  const existing = input?.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeOffcut(input, existing);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getAllOffcuts() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}

export async function getOffcut(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getOffcuts(filters = {}) {
  const records = await getAllOffcuts();
  return records.filter((record) => matchesFilters(record, filters));
}

export async function updateOffcut(id, patch) {
  const current = await getOffcut(id);
  if (!current) return null;
  return saveOffcut({ ...current, ...(patch || {}), id });
}

export async function deleteOffcut(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function deleteOffcuts(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteOffcut(id)));
  return uniqueIds;
}

export async function clearOffcuts() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
