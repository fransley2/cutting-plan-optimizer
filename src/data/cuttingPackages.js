import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'cuttingPackages';

export const CUTTING_PACKAGE_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  IN_NESTING: 'in_nesting',
  NESTED: 'nested',
  RELEASED: 'released',
  CANCELLED: 'cancelled',
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

function normalizeCuttingPackage(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    number: text(input.number),
    name: text(input.name),
    status: text(input.status) || CUTTING_PACKAGE_STATUS.DRAFT,
    sourceType: text(input.sourceType),
    mtoItemIds: arrayValue(input.mtoItemIds),
    inventoryItemIds: arrayValue(input.inventoryItemIds),
    matchIds: arrayValue(input.matchIds),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: text(input.createdBy),
    updatedBy: text(input.updatedBy),
    metadata: objectValue(input.metadata),
  };
}

function matchesFilters(record, filters = {}) {
  const fields = ['projectId', 'status', 'sourceType', 'number'];
  return fields.every((field) => filters[field] == null || record[field] === String(filters[field]));
}

export async function createCuttingPackage(input) {
  const db = await getDB();
  const record = normalizeCuttingPackage(input);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function saveCuttingPackage(input) {
  const db = await getDB();
  const existing = input?.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeCuttingPackage(input, existing);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getAllCuttingPackages() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}

export async function getCuttingPackage(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getCuttingPackages(filters = {}) {
  const records = await getAllCuttingPackages();
  return records.filter((record) => matchesFilters(record, filters));
}

export async function updateCuttingPackage(id, patch) {
  const current = await getCuttingPackage(id);
  if (!current) return null;
  return saveCuttingPackage({ ...current, ...(patch || {}), id });
}

export async function deleteCuttingPackage(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function deleteCuttingPackages(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteCuttingPackage(id)));
  return uniqueIds;
}

export async function clearCuttingPackages() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
