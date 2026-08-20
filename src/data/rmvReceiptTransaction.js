import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeReturnMaterialVoucher, RMV_STATUS } from './returnMaterialVouchers.js';
import { normalizeOffcut, OFFCUT_STATUS } from './offcuts.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { normalizeAuditEvent, AUDIT_EVENT_TYPES } from './auditLog.js';
import { MATERIAL_TRANSFORMATION_TYPES, normalizeMaterialTransformation } from './materialTransformations.js';
import { deriveRmvStatus, RMV_LINE_STATUS } from '../core/returnMaterialVoucher.js';

const STORE_NAMES = Object.freeze([
  'returnMaterialVouchers',
  'inventory',
  'offcuts',
  'materialTransformations',
  'stockMovements',
  'auditLog',
  'auditEvents',
]);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function identity(item = {}) {
  return [item.id, item.trace, item.traceability].filter(Boolean).map(String);
}

function findInventoryItem(items, reference) {
  const target = text(reference);
  return items.find((item) => identity(item).includes(target)) || null;
}

function findOffcut(items, reference) {
  const target = text(reference);
  return items.find((item) => [item.id, item.sourceOffcutId, item.traceability, item.metadata?.sourceCandidateKey]
    .filter(Boolean).map(String).includes(target)) || null;
}

function put(store, value) {
  store.put(value);
  return value;
}

function buildReturnedInventoryItem(line, parent, rmv, timestamp) {
  return normalizeInventoryItem({
    ...parent,
    id: line.traceability,
    trace: line.traceability,
    traceability: line.traceability,
    qty: numberValue(line.qty, 1) || 1,
    balanceQty: numberValue(line.qty, 1) || 1,
    reservedQty: 0,
    issuedQty: 0,
    lengthMm: numberValue(line.lengthMm),
    widthMm: numberValue(line.widthMm),
    thicknessMm: line.thicknessMm,
    weightKg: numberValue(line.weightKg),
    location: rmv.destination,
    status: 'available',
    materialCouponNo: '',
    exitDate: '',
    exitInvoice: '',
    parentStockId: parent.id || parent.trace,
    parentInventoryItemId: parent.id || parent.trace,
    parentTraceability: parent.traceability || parent.trace,
    sourceDocumentId: rmv.id,
    source: 'RMV_RECEIPT',
    sourceType: 'OFFCUT',
    sourceOffcutId: line.sourceOffcutId,
    isOffcut: true,
    rmvNo: rmv.number,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function saveGenealogy(stores, transformations, line, inventoryItem, parent, rmv, timestamp, userName) {
  const sourceOffcutId = text(line.sourceOffcutId);
  const existing = transformations.find((item) => sourceOffcutId && item.outputId === sourceOffcutId);
  const record = normalizeMaterialTransformation({
    ...(existing || {}),
    projectId: rmv.projectId,
    workpackId: rmv.workpackId,
    cuttingSheetId: rmv.cuttingSheetId,
    materialCouponId: rmv.materialCouponId,
    parentInventoryItemId: parent.id || parent.trace,
    outputType: MATERIAL_TRANSFORMATION_TYPES.REUSABLE_OFFCUT,
    outputId: existing?.outputId || inventoryItem.id,
    quantity: line.qty || 1,
    lengthMm: line.lengthMm,
    widthMm: line.widthMm,
    thicknessMm: line.thicknessMm,
    weightKg: line.weightKg,
    createdAt: existing?.createdAt || timestamp,
    createdBy: existing?.createdBy || userName,
    metadata: {
      ...(existing?.metadata || {}),
      sourceOffcutId,
      returnedInventoryItemId: inventoryItem.id,
      returnMaterialVoucherId: rmv.id,
      rmvLineId: line.id,
      receivedAt: timestamp,
      receivedBy: userName,
    },
  });
  put(stores.materialTransformations, record);
  return record;
}

function saveAudit(stores, input) {
  const event = normalizeAuditEvent(input);
  put(stores.auditLog, event);
  put(stores.auditEvents, event);
  return event;
}

export async function commitRmvReceipt(rmv = {}, lineIds = [], context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [storedRmv, inventoryItems, offcuts, transformations] = await Promise.all([
      idbRequest(stores.returnMaterialVouchers.get(rmv.id)),
      idbRequest(stores.inventory.getAll()),
      idbRequest(stores.offcuts.getAll()),
      idbRequest(stores.materialTransformations.getAll()),
    ]);
    if (!storedRmv) throw new Error('RMV_NOT_FOUND');
    if (![RMV_STATUS.ISSUED, RMV_STATUS.PARTIALLY_RECEIVED].includes(storedRmv.status)) {
      throw new Error('RMV_NOT_AWAITING_RECEIPT');
    }

    const selectedIds = new Set((Array.isArray(lineIds) ? lineIds : []).map(text).filter(Boolean));
    const selectedLines = storedRmv.returnedItems.filter((line) => selectedIds.has(line.id)
      && line.status !== RMV_LINE_STATUS.RECEIVED);
    if (!selectedLines.length) throw new Error('NO_PENDING_RMV_LINES_SELECTED');

    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const userName = text(context.userName);
    const receivedByLineId = new Map();
    const batchTraceabilities = new Set();

    for (const line of selectedLines) {
      const traceability = text(line.traceability);
      if (!traceability) throw new Error(`RMV_TRACEABILITY_REQUIRED:${line.id}`);
      if (batchTraceabilities.has(traceability) || findInventoryItem(inventoryItems, traceability)) {
        throw new Error(`RMV_TRACEABILITY_ALREADY_EXISTS:${traceability}`);
      }
      batchTraceabilities.add(traceability);

      const parent = findInventoryItem(inventoryItems, line.parentInventoryItemId || line.parentTraceability);
      if (!parent) throw new Error(`RMV_PARENT_INVENTORY_NOT_FOUND:${line.parentTraceability || line.id}`);
      const inventoryItem = put(stores.inventory, buildReturnedInventoryItem(line, parent, storedRmv, timestamp));
      inventoryItems.push(inventoryItem);

      const sourceOffcut = findOffcut(offcuts, line.sourceOffcutId);
      if (sourceOffcut) {
        const returnedOffcut = normalizeOffcut({
          ...sourceOffcut,
          status: OFFCUT_STATUS.RETURNED_TO_STOCK,
          newInventoryItemId: inventoryItem.id,
          updatedBy: userName,
        }, sourceOffcut);
        put(stores.offcuts, { ...returnedOffcut, updatedAt: timestamp });
      }

      const genealogy = saveGenealogy(stores, transformations, line, inventoryItem, parent, storedRmv, timestamp, userName);
      const movement = put(stores.stockMovements, normalizeStockMovement({
        movementType: STOCK_MOVEMENT_TYPES.RETURN_OFFCUT,
        inventoryItemId: inventoryItem.id,
        projectId: storedRmv.projectId,
        timestamp,
        userName,
        quantityDelta: line.qty || 1,
        lengthDelta: line.lengthMm,
        previousStatus: OFFCUT_STATUS.PENDING_RMV,
        nextStatus: inventoryItem.status,
        sourceDocumentType: 'RETURN_MATERIAL_VOUCHER',
        sourceDocumentId: storedRmv.id,
        reason: 'RMV material received into Inventory.',
        before: line,
        after: inventoryItem,
        metadata: {
          rmvLineId: line.id,
          parentInventoryItemId: parent.id || parent.trace,
          materialTransformationId: genealogy.id,
        },
      }));
      saveAudit(stores, {
        eventType: AUDIT_EVENT_TYPES.RETURN_OFFCUT,
        entityType: 'INVENTORY',
        entityId: inventoryItem.id,
        projectId: storedRmv.projectId,
        timestamp,
        userName,
        sourceDocumentType: 'RETURN_MATERIAL_VOUCHER',
        sourceDocumentId: storedRmv.id,
        reason: 'RMV line received.',
        before: line,
        after: inventoryItem,
        metadata: { movementId: movement.id, rmvLineId: line.id, materialTransformationId: genealogy.id },
      });
      receivedByLineId.set(line.id, inventoryItem.id);
    }

    const nextLines = storedRmv.returnedItems.map((line) => receivedByLineId.has(line.id) ? {
      ...line,
      status: RMV_LINE_STATUS.RECEIVED,
      receivedAt: timestamp,
      receivedBy: userName,
      inventoryItemId: receivedByLineId.get(line.id),
    } : line);
    const status = deriveRmvStatus(nextLines, {
      issued: RMV_STATUS.ISSUED,
      partiallyReceived: RMV_STATUS.PARTIALLY_RECEIVED,
      returned: RMV_STATUS.RETURNED,
    });
    const savedRmv = { ...normalizeReturnMaterialVoucher({
      ...storedRmv,
      status,
      returnedItems: nextLines,
      updatedBy: userName,
      returnedAt: status === RMV_STATUS.RETURNED ? timestamp : storedRmv.returnedAt,
      returnedBy: status === RMV_STATUS.RETURNED ? userName : storedRmv.returnedBy,
    }, storedRmv), updatedAt: timestamp };
    put(stores.returnMaterialVouchers, savedRmv);
    saveAudit(stores, {
      eventType: 'RMV_RECEIPT',
      entityType: 'RETURN_MATERIAL_VOUCHER',
      entityId: savedRmv.id,
      projectId: savedRmv.projectId,
      timestamp,
      userName,
      sourceDocumentType: 'RETURN_MATERIAL_VOUCHER',
      sourceDocumentId: savedRmv.id,
      reason: 'RMV receipt committed.',
      before: storedRmv,
      after: savedRmv,
      metadata: { receivedLineIds: [...receivedByLineId.keys()], inventoryItemIds: [...receivedByLineId.values()] },
    });
    return { ...savedRmv, __auditCommitted: true };
  });
}
