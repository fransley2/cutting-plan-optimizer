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

function piecesWithStableIds(pieces, existingPieces = []) {
  return arrayValue(pieces).map((piece, index) => {
    const existing = existingPieces[index] || {};
    const copy = piece && typeof piece === 'object' ? structuredClone(piece) : {};
    const rawSobremetal = copy.sobremetalMm ?? existing.sobremetalMm;
    const numericSobremetal = rawSobremetal === '' || rawSobremetal == null ? null : Number(rawSobremetal);
    const hasSobremetal = typeof copy.hasSobremetal === 'boolean'
      ? copy.hasSobremetal
      : Boolean(existing.hasSobremetal || (Number.isFinite(numericSobremetal) && numericSobremetal > 0));
    return {
      ...copy,
      id: text(piece?.id) || text(existing.id) || createId(),
      hasSobremetal,
      sobremetalMm: hasSobremetal
        ? (Number.isFinite(numericSobremetal) ? Math.max(0, numericSobremetal) : 500)
        : 0,
    };
  });
}

function barsWithStableIds(bars, existingBars = []) {
  return arrayValue(bars).map((bar, index) => ({
    ...(bar && typeof bar === 'object' ? structuredClone(bar) : {}),
    id: text(bar?.id) || text(existingBars[index]?.id) || createId(),
    pieces: piecesWithStableIds(bar?.pieces, existingBars[index]?.pieces),
  }));
}

export function normalizeCuttingSheet(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    number: text(input.number),
    status: text(input.status) || CUTTING_SHEET_STATUS.DRAFT,
    workpackId: text(input.workpackId),
    materialCouponId: text(input.materialCouponId),
    planId: text(input.planId),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: text(input.createdBy),
    updatedBy: text(input.updatedBy),
    releasedAt: text(input.releasedAt),
    releasedBy: text(input.releasedBy),
    bars: barsWithStableIds(input.bars, existing?.bars),
    summary: objectValue(input.summary),
    planning: objectValue(input.planning),
    metadata: objectValue(input.metadata),
  };
}

function matchesFilters(record, filters = {}) {
  const fields = ['projectId', 'status', 'number', 'materialCouponId', 'workpackId'];
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
