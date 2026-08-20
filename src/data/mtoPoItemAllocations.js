import { getDB } from './database.js';
import { idbGet, idbGetAll, idbPut, idbRequest, idbTransaction } from './idb.js';
import { createAuditEvent } from './auditLog.js';
import {
  MTO_PO_ITEM_ALLOCATION_STATUS,
  buildMtoProcurementCoverage,
  validateMtoPoItemAllocationBatch,
} from '../core/mtoPoItemAllocation.js';

const STORE_NAME = 'mtoPoItemAllocations';

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizeMtoPoItemAllocation(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId) || existing?.projectId || '',
    mtoLineId: text(input.mtoLineId || input.mtoItemId) || existing?.mtoLineId || '',
    poItemId: text(input.poItemId) || existing?.poItemId || '',
    allocatedQuantity: numberValue(input.allocatedQuantity ?? existing?.allocatedQuantity),
    unitOfMeasure: text(input.unitOfMeasure || existing?.unitOfMeasure).toUpperCase(),
    status: text(input.status || existing?.status || MTO_PO_ITEM_ALLOCATION_STATUS.ACTIVE).toUpperCase(),
    matchMethod: text(input.matchMethod || existing?.matchMethod || 'MANUAL').toUpperCase(),
    matchedIdentCode: text(input.matchedIdentCode ?? existing?.matchedIdentCode),
    matchSource: text(input.matchSource ?? existing?.matchSource).toUpperCase(),
    matchConfidence: text(input.matchConfidence ?? existing?.matchConfidence).toUpperCase(),
    notes: text(input.notes ?? existing?.notes),
    createdBy: text(input.createdBy || existing?.createdBy),
    cancelledAt: text(input.cancelledAt || existing?.cancelledAt),
    cancelledBy: text(input.cancelledBy || existing?.cancelledBy),
    cancellationReason: text(input.cancellationReason || existing?.cancellationReason),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function matchesFilters(record, filters = {}) {
  const mtoLineId = filters.mtoLineId || filters.mtoItemId;
  return (!filters.projectId || record.projectId === String(filters.projectId))
    && (!mtoLineId || record.mtoLineId === String(mtoLineId))
    && (!filters.poItemId || record.poItemId === String(filters.poItemId))
    && (!filters.status || record.status === String(filters.status).toUpperCase());
}

async function auditAllocation(eventType, record, before = null, reason = '') {
  return createAuditEvent({
    eventType,
    entityType: 'MTO_PO_ITEM_ALLOCATION',
    entityId: record.id,
    projectId: record.projectId,
    userName: record.cancelledBy || record.createdBy,
    sourceDocumentType: 'PURCHASE_ORDER_ITEM',
    sourceDocumentId: record.poItemId,
    reason,
    before,
    after: record,
    metadata: {
      mtoLineId: record.mtoLineId,
      poItemId: record.poItemId,
      allocatedQuantity: record.allocatedQuantity,
      matchMethod: record.matchMethod,
      matchedIdentCode: record.matchedIdentCode,
      matchSource: record.matchSource,
      matchConfidence: record.matchConfidence,
    },
  });
}

export async function saveMtoPoItemAllocations(inputs = []) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one MTO to PO item allocation is required.');
  const db = await getDB();
  const result = await idbTransaction(db, [STORE_NAME, 'mtoItems', 'purchaseOrderItems'], 'readwrite', async (stores) => {
    const existingById = new Map((await idbRequest(stores[STORE_NAME].getAll())).map((item) => [item.id, item]));
    const drafts = inputs.map((input) => normalizeMtoPoItemAllocation(input, existingById.get(input.id) || null));
    const mtoLineIds = [...new Set(drafts.map((draft) => draft.mtoLineId))];
    const poItemIds = [...new Set(drafts.map((draft) => draft.poItemId))];
    const [mtoItems, poItems, existingAllocations] = await Promise.all([
      Promise.all(mtoLineIds.map((id) => idbRequest(stores.mtoItems.get(id)))),
      Promise.all(poItemIds.map((id) => idbRequest(stores.purchaseOrderItems.get(id)))),
      idbRequest(stores[STORE_NAME].getAll()),
    ]);
    const mtoById = new Map(mtoItems.filter(Boolean).map((item) => [item.id, item]));
    const poItemById = new Map(poItems.filter(Boolean).map((item) => [item.id, item]));
    const records = drafts.map((draft) => {
      const before = existingById.get(draft.id) || null;
      const mtoItem = mtoById.get(draft.mtoLineId);
      const poItem = poItemById.get(draft.poItemId);
      return normalizeMtoPoItemAllocation({
        ...draft,
        projectId: mtoItem?.projectId || poItem?.projectId || draft.projectId,
        unitOfMeasure: poItem?.unitOfMeasure || draft.unitOfMeasure,
        status: MTO_PO_ITEM_ALLOCATION_STATUS.ACTIVE,
      }, before);
    });
    const validation = validateMtoPoItemAllocationBatch({ allocations: records, mtoItems, poItems, existingAllocations });
    if (!validation.valid) throw new Error(validation.errors[0].message);
    await Promise.all(records.map((record) => idbRequest(stores[STORE_NAME].put(record))));
    return { records, beforeRecords: records.map((record) => existingById.get(record.id) || null) };
  });
  await Promise.all(result.records.map((record, index) => {
    const before = result.beforeRecords[index];
    return auditAllocation(before ? 'MTO_PO_ITEM_ALLOCATION_UPDATED' : 'MTO_PO_ITEM_ALLOCATION_CREATED', record, before, 'MTO demand allocated to Purchase Order item.');
  }));
  return result.records;
}

export async function saveMtoPoItemAllocation(input = {}) {
  return (await saveMtoPoItemAllocations([input]))[0];
}

export async function cancelMtoPoItemAllocation(id, { reason = '', userName = '' } = {}) {
  const db = await getDB();
  const before = await idbGet(db, STORE_NAME, id);
  if (!before) return null;
  const record = normalizeMtoPoItemAllocation({
    ...before,
    status: MTO_PO_ITEM_ALLOCATION_STATUS.CANCELLED,
    cancelledAt: nowIso(),
    cancelledBy: userName,
    cancellationReason: reason,
  }, before);
  await idbPut(db, STORE_NAME, record);
  await auditAllocation('MTO_PO_ITEM_ALLOCATION_CANCELLED', record, before, reason || 'MTO to PO item allocation cancelled.');
  return record;
}

export async function listMtoPoItemAllocations(filters = {}) {
  const records = await idbGetAll(await getDB(), STORE_NAME);
  return records.filter((record) => matchesFilters(record, filters));
}

export async function listMtoProcurementCoverage(filters = {}) {
  const db = await getDB();
  const storeNames = [STORE_NAME, 'mtoItems', 'purchaseOrders', 'purchaseOrderItems', 'materialReceipts', 'materialReceiptLines', 'materialUnits'];
  const data = await idbTransaction(db, storeNames, 'readonly', async (stores) => Object.fromEntries(await Promise.all(
    storeNames.map(async (storeName) => [storeName, await idbRequest(stores[storeName].getAll())]),
  )));
  const projectId = text(filters.projectId);
  const mtoLineId = text(filters.mtoLineId || filters.mtoItemId);
  const mtoItems = data.mtoItems.filter((item) => (!projectId || item.projectId === projectId) && (!mtoLineId || item.id === mtoLineId));
  return buildMtoProcurementCoverage({
    mtoItems,
    purchaseOrders: data.purchaseOrders,
    poItems: data.purchaseOrderItems,
    allocations: data[STORE_NAME],
    receipts: data.materialReceipts,
    receiptLines: data.materialReceiptLines,
    materialUnits: data.materialUnits,
  });
}
