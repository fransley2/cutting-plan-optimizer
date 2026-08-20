import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'materialCoupons';

export const MATERIAL_COUPON_STATUS = Object.freeze({
  DRAFT: 'draft',
  ISSUED: 'issued',
  DISPATCHED: 'dispatched',
  RECEIVED: 'received',
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

function linesWithStableIds(lines, existingLines = []) {
  return arrayValue(lines).map((line, index) => ({
    ...(line && typeof line === 'object' ? structuredClone(line) : {}),
    id: text(line?.id) || text(existingLines[index]?.id) || createId(),
  }));
}

function metadataWithStableLineIds(value, existing = {}) {
  const metadata = objectValue(value);
  if (!metadata.coupon || typeof metadata.coupon !== 'object') return metadata;
  const existingLines = Array.isArray(existing?.coupon?.lines) ? existing.coupon.lines : [];
  return {
    ...metadata,
    coupon: {
      ...metadata.coupon,
      lines: linesWithStableIds(metadata.coupon.lines, existingLines),
    },
  };
}

export function normalizeMaterialCoupon(input = {}, existing = null) {
  const metadata = metadataWithStableLineIds(input.metadata, existing?.metadata);
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    number: text(input.number),
    status: text(input.status) || MATERIAL_COUPON_STATUS.DRAFT,
    workpackId: text(input.workpackId),
    planId: text(input.planId),
    issuedAt: text(input.issuedAt),
    issuedBy: text(input.issuedBy),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: text(input.createdBy) || text(existing?.createdBy),
    createdByName: text(input.createdByName) || text(existing?.createdByName),
    updatedBy: text(input.updatedBy),
    items: linesWithStableIds(input.items, existing?.items),
    signatures: arrayValue(input.signatures),
    metadata,
  };
}

function matchesFilters(record, filters = {}) {
  const fields = ['projectId', 'status', 'number', 'workpackId'];
  return fields.every((field) => filters[field] == null || record[field] === String(filters[field]));
}

export async function createMaterialCoupon(input) {
  const db = await getDB();
  const record = normalizeMaterialCoupon(input);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function saveMaterialCoupon(input) {
  const db = await getDB();
  const existing = input?.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeMaterialCoupon(input, existing);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getAllMaterialCoupons() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}

export async function getMaterialCoupon(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getMaterialCoupons(filters = {}) {
  const records = await getAllMaterialCoupons();
  return records.filter((record) => matchesFilters(record, filters));
}

export async function updateMaterialCoupon(id, patch) {
  const current = await getMaterialCoupon(id);
  if (!current) return null;
  return saveMaterialCoupon({ ...current, ...(patch || {}), id });
}

export async function deleteMaterialCoupon(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function deleteMaterialCoupons(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteMaterialCoupon(id)));
  return uniqueIds;
}

export async function clearMaterialCoupons() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
