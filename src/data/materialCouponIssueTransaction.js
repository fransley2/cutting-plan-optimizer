import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeMaterialCoupon } from './materialCoupons.js';
import { normalizeMaterialReservation } from './materialReservations.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { normalizeAuditEvent } from './auditLog.js';
import { prepareMaterialCouponIssue } from '../core/materialCouponIssue.js';

// These stores form one integrity boundary: an issued Coupon must never exist
// without its split stock, reservations, movements, and matching audit records.
const STORE_NAMES = Object.freeze([
  'inventory',
  'materialCoupons',
  'materialReservations',
  'stockMovements',
  'auditLog',
  'auditEvents',
]);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function identities(item = {}) {
  return [item.id, item.trace, item.traceability].map(text).filter(Boolean);
}

function findInventoryItem(items, id) {
  const target = text(id);
  return items.find((item) => identities(item).includes(target)) || null;
}

function linesForIssue(record, fallbackReservations) {
  const payloadLines = record.metadata?.coupon?.lines;
  if (Array.isArray(payloadLines) && payloadLines.length) return payloadLines;
  if (Array.isArray(record.items) && record.items.length) return record.items;
  return (Array.isArray(fallbackReservations) ? fallbackReservations : []).map((reservation) => ({
    ...(reservation.line || {}),
    inventoryItemId: reservation.inventoryItemId,
    traceability: reservation.traceability,
    reservationQty: reservation.quantity,
  }));
}

function validationError(error = {}) {
  const failure = new Error(error.code || 'MATERIAL_COUPON_ISSUE_VALIDATION_FAILED');
  failure.code = error.code || 'MATERIAL_COUPON_ISSUE_VALIDATION_FAILED';
  failure.details = error;
  return failure;
}

function put(store, value) {
  store.put(value);
  return value;
}

export async function commitMaterialCouponIssue(record = {}, fallbackReservations = [], context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const inventoryItemsPromise = idbRequest(stores.inventory.getAll());
    const storedCouponPromise = record.id
      ? idbRequest(stores.materialCoupons.get(record.id))
      : Promise.resolve(null);
    const [inventoryItems, storedCoupon] = await Promise.all([inventoryItemsPromise, storedCouponPromise]);

    if (storedCoupon && text(storedCoupon.status).toLowerCase() !== 'draft') {
      throw new Error(`MATERIAL_COUPON_NOT_DRAFT:${storedCoupon.status}`);
    }

    const issuedAt = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const userName = text(context.userName);
    const draftCoupon = normalizeMaterialCoupon({
      ...record,
      status: 'draft',
      createdBy: record.createdBy || context.userId || storedCoupon?.createdBy,
      createdByName: record.createdByName || userName || storedCoupon?.createdByName,
      createdAt: record.createdAt || storedCoupon?.createdAt || issuedAt,
    }, storedCoupon);
    const couponPayload = draftCoupon.metadata?.coupon || {};
    const lines = linesForIssue(draftCoupon, fallbackReservations);

    // Revalidate the current transaction snapshot before the first put. This
    // closes the gap between the UI's read-only validation and the atomic write.
    const prepared = prepareMaterialCouponIssue(lines, inventoryItems);
    if (!prepared.valid) throw validationError(prepared.errors[0]);

    const splitParents = new Map();
    const splitChildren = [];
    const splitMovements = [];
    for (const plan of prepared.splitPlans) {
      const original = normalizeInventoryItem({ ...plan.original, updatedAt: issuedAt });
      const child = normalizeInventoryItem({ ...plan.child, createdAt: plan.child.createdAt || issuedAt, updatedAt: issuedAt });
      identities(plan.source).forEach((id) => splitParents.set(id, original));
      splitChildren.push(child);
      splitMovements.push(normalizeStockMovement({
        movementType: STOCK_MOVEMENT_TYPES.SPLIT_STOCK,
        inventoryItemId: original.id || original.trace,
        projectId: draftCoupon.projectId,
        timestamp: issuedAt,
        userName,
        quantityDelta: 0,
        lengthDelta: 0,
        previousStatus: plan.source.status,
        nextStatus: original.status,
        sourceDocumentType: 'MaterialCoupon',
        sourceDocumentId: draftCoupon.id,
        reason: 'Inventory item split for Material Coupon consumption',
        before: plan.source,
        after: { original, child },
        metadata: {
          parentTraceability: plan.source.traceability || plan.source.trace,
          childTraceability: child.traceability || child.trace,
          consumedValues: plan.consumedValues,
          weightBasis: plan.weightBasis,
          workpackId: draftCoupon.workpackId,
        },
      }));
    }

    const projectedInventory = inventoryItems.map((item) => (
      identities(item).map((id) => splitParents.get(id)).find(Boolean) || item
    ));
    projectedInventory.push(...splitChildren);

    const inventoryUpdates = [];
    const reservationRecords = [];
    const reservationMovements = [];
    for (const reservation of prepared.reservations) {
      const current = findInventoryItem(projectedInventory, reservation.inventoryItemId);
      if (!current) throw new Error('INVENTORY_ITEM_NOT_FOUND');
      const quantity = Number(reservation.quantity);
      const next = normalizeInventoryItem({
        ...current,
        reservedQty: Number(current.reservedQty || 0) + quantity,
        balanceQty: Number(current.balanceQty || 0) - quantity,
        status: 'reserved',
        materialCouponNo: draftCoupon.number || '',
        updatedAt: issuedAt,
      });
      inventoryUpdates.push(next);

      const reservationRecord = normalizeMaterialReservation({
        projectId: draftCoupon.projectId,
        workpackId: draftCoupon.workpackId,
        inventoryItemId: current.id || current.trace,
        mtoItemId: reservation.line?.mtoItemId || reservation.line?.mtoId || '',
        materialCouponId: draftCoupon.id,
        materialCouponLineId: reservation.line?.id || '',
        quantity,
        reservedAt: issuedAt,
        reservedBy: userName,
      });
      reservationRecords.push(reservationRecord);
      reservationMovements.push(normalizeStockMovement({
        movementType: STOCK_MOVEMENT_TYPES.RESERVE_STOCK,
        inventoryItemId: current.id || current.trace,
        projectId: draftCoupon.projectId,
        timestamp: issuedAt,
        userName,
        quantityDelta: 0,
        previousStatus: current.status,
        nextStatus: 'reserved',
        sourceDocumentType: 'MaterialCoupon',
        sourceDocumentId: draftCoupon.id,
        reason: 'Material reserved by issued Material Coupon',
        before: current,
        after: next,
        metadata: {
          traceability: reservation.traceability,
          workpackId: draftCoupon.workpackId,
          reservationId: reservationRecord.id,
          reservedQuantity: quantity,
        },
      }));
    }

    const issuedPayload = {
      ...couponPayload,
      lines,
      status: 'ISSUED',
      issuedAt,
      issuedBy: userName,
      responsible: {
        ...(couponPayload.responsible || {}),
        issuing: userName || couponPayload.responsible?.issuing || '',
        issuingDate: issuedAt.slice(0, 10),
      },
    };
    const savedCoupon = normalizeMaterialCoupon({
      ...draftCoupon,
      status: 'issued',
      issuedAt,
      issuedBy: userName,
      metadata: { ...(draftCoupon.metadata || {}), coupon: issuedPayload },
    }, storedCoupon);
    const allMovements = [...splitMovements, ...reservationMovements];
    const auditEvent = normalizeAuditEvent({
      eventType: 'MATERIAL_COUPON_ISSUED',
      entityType: 'MaterialCoupon',
      entityId: savedCoupon.id,
      projectId: savedCoupon.projectId || issuedPayload.header?.project || '',
      timestamp: issuedAt,
      userName,
      sourceDocumentType: 'MaterialCoupon',
      sourceDocumentId: savedCoupon.id,
      reason: 'MATERIAL_COUPON_ISSUED',
      metadata: {
        splitCount: prepared.splitPlans.length,
        reservationIds: reservationRecords.map((item) => item.id),
        movementIds: allMovements.map((item) => item.id),
      },
    });

    // No writes occur above this point. From here, any failed request aborts all stores.
    prepared.splitPlans.forEach((plan) => put(stores.inventory, splitParents.get(text(plan.source.id || plan.source.trace || plan.source.traceability))));
    splitChildren.forEach((item) => put(stores.inventory, item));
    inventoryUpdates.forEach((item) => put(stores.inventory, item));
    reservationRecords.forEach((item) => put(stores.materialReservations, item));
    allMovements.forEach((item) => put(stores.stockMovements, item));
    put(stores.materialCoupons, savedCoupon);
    put(stores.auditLog, auditEvent);
    put(stores.auditEvents, auditEvent);

    return {
      ...savedCoupon,
      __auditCommitted: true,
      __splitCount: prepared.splitPlans.length,
      __weightUnresolvedCount: prepared.splitPlans.filter((plan) => Number(plan.source.weightKg) > 0 && !plan.weightBasis).length,
    };
  });
}
