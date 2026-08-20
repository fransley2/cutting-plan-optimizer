import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeMaterialCoupon } from './materialCoupons.js';
import { MATERIAL_RESERVATION_STATUS, normalizeMaterialReservation } from './materialReservations.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { normalizeAuditEvent } from './auditLog.js';
import { MATERIAL_COUPON_ACTIONS } from '../core/materialCouponWorkflow.js';

const STORE_NAMES = Object.freeze([
  'inventory',
  'materialCoupons',
  'materialReservations',
  'stockMovements',
  'auditLog',
  'auditEvents',
]);

function identity(item = {}) {
  return [item.id, item.trace, item.traceability].filter(Boolean).map(String);
}

function findInventoryItem(items, id) {
  const target = String(id || '');
  return items.find((item) => identity(item).includes(target)) || null;
}

function put(store, value) {
  store.put(value);
  return value;
}

function activeCouponReservations(reservations, couponId) {
  return reservations.filter((reservation) => reservation.materialCouponId === couponId
    && reservation.status === MATERIAL_RESERVATION_STATUS.ACTIVE);
}

function groupReservationsByInventory(reservations, inventoryItems) {
  const groups = new Map();
  reservations.forEach((reservation) => {
    const inventory = findInventoryItem(inventoryItems, reservation.inventoryItemId);
    if (!inventory) throw new Error('INVENTORY_ITEM_NOT_FOUND');
    const quantity = Number(reservation.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_RESERVATION_QUANTITY');
    const key = inventory.id || inventory.trace || inventory.traceability;
    const group = groups.get(key) || { inventory, quantity: 0, reservations: [] };
    group.quantity += quantity;
    group.reservations.push(reservation);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function dispatchGroup(stores, group, coupon, timestamp, userName) {
  const { inventory: current, quantity, reservations } = group;
  if (Number(current.reservedQty || 0) < quantity) throw new Error('INSUFFICIENT_RESERVED_INVENTORY');
  const next = normalizeInventoryItem({
    ...current,
    reservedQty: Number(current.reservedQty || 0) - quantity,
    issuedQty: Number(current.issuedQty || 0) + quantity,
    status: 'issued',
    materialCouponNo: coupon.number || '',
    exitDate: timestamp,
    updatedAt: timestamp,
  });
  put(stores.inventory, next);

  const consumedReservations = reservations.map((reservation) => put(stores.materialReservations, normalizeMaterialReservation({
    ...reservation,
    status: MATERIAL_RESERVATION_STATUS.CONSUMED,
    metadata: { ...(reservation.metadata || {}), consumedAt: timestamp, consumedBy: userName },
  }, reservation)));
  const movement = put(stores.stockMovements, normalizeStockMovement({
    movementType: STOCK_MOVEMENT_TYPES.ISSUE_MATERIAL,
    inventoryItemId: current.id || current.trace,
    projectId: coupon.projectId,
    timestamp,
    userName,
    quantityDelta: -quantity,
    previousStatus: current.status,
    nextStatus: next.status,
    sourceDocumentType: 'MaterialCoupon',
    sourceDocumentId: coupon.id,
    reason: 'Material dispatched from warehouse to fabrication',
    before: current,
    after: next,
    metadata: {
      workpackId: coupon.workpackId,
      reservationIds: consumedReservations.map((reservation) => reservation.id),
      dispatchedQuantity: quantity,
    },
  }));
  return { movement, reservations: consumedReservations };
}

function releaseGroup(stores, group, coupon, action, timestamp, userName) {
  const { inventory: current, quantity, reservations } = group;
  if (Number(current.reservedQty || 0) < quantity) throw new Error('INSUFFICIENT_RESERVED_INVENTORY');
  const remainingReserved = Number(current.reservedQty || 0) - quantity;
  const next = normalizeInventoryItem({
    ...current,
    balanceQty: Number(current.balanceQty || 0) + quantity,
    reservedQty: remainingReserved,
    status: remainingReserved > 0 ? 'reserved' : 'available',
    materialCouponNo: remainingReserved > 0 ? current.materialCouponNo : '',
    exitDate: remainingReserved > 0 ? current.exitDate : '',
    updatedAt: timestamp,
  });
  put(stores.inventory, next);

  const releasedReservations = reservations.map((reservation) => put(stores.materialReservations, normalizeMaterialReservation({
    ...reservation,
    status: MATERIAL_RESERVATION_STATUS.RELEASED,
    releasedAt: timestamp,
    releasedBy: userName,
    reason: action === MATERIAL_COUPON_ACTIONS.CANCEL ? 'Issued Material Coupon cancelled' : 'Material Coupon reservation released',
  }, reservation)));
  const movement = put(stores.stockMovements, normalizeStockMovement({
    movementType: STOCK_MOVEMENT_TYPES.RELEASE_RESERVATION,
    inventoryItemId: current.id || current.trace,
    projectId: coupon.projectId,
    timestamp,
    userName,
    quantityDelta: quantity,
    previousStatus: current.status,
    nextStatus: next.status,
    sourceDocumentType: 'MaterialCoupon',
    sourceDocumentId: coupon.id,
    reason: action === MATERIAL_COUPON_ACTIONS.CANCEL ? 'Issued Material Coupon cancelled' : 'Material Coupon reservation released',
    before: current,
    after: next,
    metadata: {
      workpackId: coupon.workpackId,
      reservationIds: releasedReservations.map((reservation) => reservation.id),
      releasedQuantity: quantity,
    },
  }));
  return { movement, reservations: releasedReservations };
}

export async function commitMaterialCouponInventoryAction(nextRecord = {}, action, reason = '', context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [storedCoupon, inventoryItems, reservations] = await Promise.all([
      idbRequest(stores.materialCoupons.get(nextRecord.id)),
      idbRequest(stores.inventory.getAll()),
      idbRequest(stores.materialReservations.getAll()),
    ]);
    if (!storedCoupon) throw new Error('MATERIAL_COUPON_NOT_FOUND');

    const currentStatus = String(storedCoupon.status || '').toUpperCase();
    const dispatches = action === MATERIAL_COUPON_ACTIONS.DISPATCH;
    const releases = action === MATERIAL_COUPON_ACTIONS.RELEASE
      || (action === MATERIAL_COUPON_ACTIONS.CANCEL && currentStatus === 'ISSUED');
    if (!dispatches && !releases) throw new Error(`UNSUPPORTED_ATOMIC_COUPON_ACTION:${action}`);
    if (currentStatus !== 'ISSUED') throw new Error(`STALE_MATERIAL_COUPON_STATUS:${currentStatus}`);

    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const userName = context.userName || '';
    const groups = groupReservationsByInventory(activeCouponReservations(reservations, storedCoupon.id), inventoryItems);
    const changes = groups.map((group) => dispatches
      ? dispatchGroup(stores, group, storedCoupon, timestamp, userName)
      : releaseGroup(stores, group, storedCoupon, action, timestamp, userName));

    const savedCoupon = normalizeMaterialCoupon({ ...storedCoupon, ...nextRecord, updatedBy: userName }, storedCoupon);
    put(stores.materialCoupons, savedCoupon);

    const auditEvent = normalizeAuditEvent({
      eventType: `MATERIAL_COUPON_${action}`,
      entityType: 'MaterialCoupon',
      entityId: savedCoupon.id,
      projectId: savedCoupon.projectId || savedCoupon.metadata?.coupon?.header?.project || '',
      timestamp,
      userName,
      sourceDocumentType: 'MaterialCoupon',
      sourceDocumentId: savedCoupon.id,
      reason: reason || `MATERIAL_COUPON_${action}`,
      before: storedCoupon,
      after: savedCoupon,
      metadata: {
        previousStatus: storedCoupon.status,
        nextStatus: savedCoupon.status,
        movementIds: changes.map((change) => change.movement.id),
        reservationIds: changes.flatMap((change) => change.reservations.map((reservation) => reservation.id)),
      },
    });
    put(stores.auditLog, auditEvent);
    put(stores.auditEvents, auditEvent);

    return { ...savedCoupon, __auditCommitted: true };
  });
}
