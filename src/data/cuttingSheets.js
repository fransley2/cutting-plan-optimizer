import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'cuttingSheets';

export const CUTTING_SHEET_STATUS = Object.freeze({
  DRAFT: 'draft',
  RELEASED: 'released',
  CUT: 'cut',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
});

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value);
}

function arrayValue(value) {
  return Array.isArray(value) ? [...value] : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCuttingSheet(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    number: text(input.number),
    status: text(input.status) || CUTTING_SHEET_STATUS.DRAFT,
    cuttingPackageId: text(input.cuttingPackageId),
    materialCouponId: text(input.materialCouponId),
    planId: text(input.planId),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: text(input.createdBy),
    updatedBy: text(input.updatedBy),
    releasedAt: text(input.releasedAt),
    releasedBy: text(input.releasedBy),
    bars: arrayValue(input.bars),
    summary: objectValue(input.summary),
    metadata: objectValue(input.metadata),
  };
}

function matchesFilters(record, filters = {}) {
  const fields = ['projectId', 'status', 'number', 'materialCouponId', 'cuttingPackageId'];
  return fields.every((field) => filters[field] == null || record[field] === String(filters[field]));
}

export async function createCuttingSheet(input) {
  const db = await getDB();
  const record = normalizeCuttingSheet(input);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function saveCuttingSheet(input) {
  const db = await getDB();
  const existing = input?.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeCuttingSheet(input, existing);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getAllCuttingSheets() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}

export async function getCuttingSheet(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getCuttingSheets(filters = {}) {
  const records = await getAllCuttingSheets();
  return records.filter((record) => matchesFilters(record, filters));
}

export async function updateCuttingSheet(id, patch) {
  const current = await getCuttingSheet(id);
  if (!current) return null;
  return saveCuttingSheet({ ...current, ...(patch || {}), id });
}

export async function deleteCuttingSheet(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function deleteCuttingSheets(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteCuttingSheet(id)));
  return uniqueIds;
}

export async function clearCuttingSheets() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
