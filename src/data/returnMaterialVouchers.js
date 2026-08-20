import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'returnMaterialVouchers';

export const RMV_STATUS = Object.freeze({
  DRAFT: 'draft',
  ISSUED: 'issued',
  PARTIALLY_RECEIVED: 'partially_received',
  RETURNED: 'returned',
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

export function normalizeReturnMaterialVoucher(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    number: text(input.number),
    status: text(input.status) || RMV_STATUS.DRAFT,
    cuttingSheetId: text(input.cuttingSheetId),
    materialCouponId: text(input.materialCouponId),
    workpackId: text(input.workpackId),
    date: text(input.date),
    origin: text(input.origin),
    destination: text(input.destination),
    drawingReference: text(input.drawingReference),
    reference: text(input.reference),
    notes: text(input.notes),
    issuedAt: text(input.issuedAt),
    issuedBy: text(input.issuedBy),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: text(input.createdBy),
    updatedBy: text(input.updatedBy),
    returnedAt: text(input.returnedAt),
    returnedBy: text(input.returnedBy),
    returnedItems: linesWithStableIds(input.returnedItems, existing?.returnedItems),
    metadata: objectValue(input.metadata),
  };
}

function matchesFilters(record, filters = {}) {
  const fields = ['projectId', 'status', 'number', 'cuttingSheetId', 'materialCouponId', 'workpackId'];
  return fields.every((field) => filters[field] == null || record[field] === String(filters[field]));
}

function recordTimestamp(record = {}) {
  for (const value of [record.date, record.issuedAt, record.updatedAt, record.createdAt]) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return 0;
}

export async function createReturnMaterialVoucher(input) {
  const db = await getDB();
  const record = normalizeReturnMaterialVoucher(input);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function saveReturnMaterialVoucher(input) {
  const db = await getDB();
  const existing = input?.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeReturnMaterialVoucher(input, existing);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getAllReturnMaterialVouchers() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}

export async function getReturnMaterialVoucher(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getReturnMaterialVouchers(filters = {}) {
  const records = await getAllReturnMaterialVouchers();
  return records
    .filter((record) => matchesFilters(record, filters))
    .sort((a, b) => recordTimestamp(b) - recordTimestamp(a) || text(b.number).localeCompare(text(a.number)));
}

export async function deleteReturnMaterialVoucher(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}
