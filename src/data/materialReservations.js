import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'materialReservations';

export const MATERIAL_RESERVATION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE', RELEASED: 'RELEASED', CONSUMED: 'CONSUMED', CANCELLED: 'CANCELLED',
});

function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function nowIso() { return new Date().toISOString(); }

export function normalizeMaterialReservation(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId || existing?.projectId),
    workpackId: text(input.workpackId || existing?.workpackId),
    inventoryItemId: text(input.inventoryItemId || existing?.inventoryItemId),
    mtoItemId: text(input.mtoItemId || existing?.mtoItemId),
    materialCouponId: text(input.materialCouponId || existing?.materialCouponId),
    materialCouponLineId: text(input.materialCouponLineId || existing?.materialCouponLineId),
    quantity: numberValue(input.quantity ?? existing?.quantity),
    status: text(input.status || existing?.status || MATERIAL_RESERVATION_STATUS.ACTIVE).toUpperCase(),
    reservedAt: text(input.reservedAt || existing?.reservedAt) || nowIso(),
    reservedBy: text(input.reservedBy || existing?.reservedBy),
    releasedAt: text(input.releasedAt || existing?.releasedAt),
    releasedBy: text(input.releasedBy || existing?.releasedBy),
    reason: text(input.reason || existing?.reason),
    metadata: input.metadata && typeof input.metadata === 'object' ? structuredClone(input.metadata) : structuredClone(existing?.metadata || {}),
  };
}

export async function saveMaterialReservation(input = {}) {
  const db = await getDB();
  const existing = input.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeMaterialReservation(input, existing);
  if (!record.inventoryItemId) throw new Error('inventoryItemId is required for a material reservation.');
  if (record.quantity <= 0) throw new Error('A material reservation requires a positive quantity.');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function listMaterialReservations(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => ['projectId', 'workpackId', 'inventoryItemId', 'mtoItemId', 'materialCouponId', 'status']
    .every((field) => filters[field] == null || filters[field] === '' || record[field] === String(filters[field])));
}

export async function clearMaterialReservations() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
