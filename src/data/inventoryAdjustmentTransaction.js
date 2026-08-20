import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { AUDIT_EVENT_TYPES, normalizeAuditEvent } from './auditLog.js';

// A manual Inventory adjustment is one integrity boundary: the material change,
// stock movement, and canonical/legacy audit records must commit or roll back together.
const STORE_NAMES = Object.freeze(['inventory', 'stockMovements', 'auditLog', 'auditEvents']);

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

function transactionError(code, error) {
  const failure = new Error(`${code}: ${error?.message || 'IndexedDB request failed.'}`);
  failure.code = code;
  failure.cause = error;
  return failure;
}

async function writeRecord(store, value, errorCode) {
  let request;
  try {
    request = store.put(value);
  } catch (error) {
    throw transactionError(errorCode, error);
  }
  try {
    await idbRequest(request);
  } catch (error) {
    throw transactionError(errorCode, error);
  }
}

async function deleteRecord(store, key, errorCode) {
  let request;
  try {
    request = store.delete(key);
  } catch (error) {
    throw transactionError(errorCode, error);
  }
  try {
    await idbRequest(request);
  } catch (error) {
    throw transactionError(errorCode, error);
  }
}

export async function commitInventoryAdjustment(inventoryItemId, patch = {}, context = {}) {
  if (!text(inventoryItemId)) {
    const error = new Error('INVENTORY_ITEM_ID_REQUIRED');
    error.code = 'INVENTORY_ITEM_ID_REQUIRED';
    throw error;
  }

  const db = await getDB();
  let activeWriteErrorCode = '';
  try {
    return await idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const inventoryItems = await idbRequest(stores.inventory.getAll());
    const before = findInventoryItem(inventoryItems, inventoryItemId);
    if (!before) {
      const error = new Error('INVENTORY_ITEM_NOT_FOUND');
      error.code = 'INVENTORY_ITEM_NOT_FOUND';
      throw error;
    }

    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const after = normalizeInventoryItem({
      ...before,
      ...(patch || {}),
      id: before.id || inventoryItemId,
      updatedAt: timestamp,
    });
    const movement = normalizeStockMovement({
      movementType: STOCK_MOVEMENT_TYPES.MANUAL_ADJUSTMENT,
      inventoryItemId: after.id || after.trace,
      projectId: after.projectId || before.projectId || '',
      timestamp,
      userName: context.userName || '',
      previousStatus: before.status || '',
      nextStatus: after.status || '',
      reason: 'Inventory status updated from Inventory page',
      before,
      after,
      metadata: { source: 'inventoryPage', bulkAction: false },
    });
    const auditEvent = normalizeAuditEvent({
      eventType: AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT,
      entityType: 'inventoryItem',
      entityId: after.id || after.trace,
      projectId: after.projectId || before.projectId || '',
      timestamp,
      userName: context.userName || '',
      before,
      after,
      metadata: { source: 'inventoryPage', bulkAction: false },
    });

    // All validation and record preparation is complete before the first write.
    if (after.trace !== before.trace) {
      activeWriteErrorCode = 'INVENTORY_UPDATE_FAILED';
      await deleteRecord(stores.inventory, before.trace, 'INVENTORY_UPDATE_FAILED');
    }
    activeWriteErrorCode = 'INVENTORY_UPDATE_FAILED';
    await writeRecord(stores.inventory, after, 'INVENTORY_UPDATE_FAILED');
    activeWriteErrorCode = 'STOCK_MOVEMENT_WRITE_FAILED';
    await writeRecord(stores.stockMovements, movement, 'STOCK_MOVEMENT_WRITE_FAILED');
    activeWriteErrorCode = 'AUDIT_WRITE_FAILED';
    await writeRecord(stores.auditLog, auditEvent, 'AUDIT_WRITE_FAILED');
    await writeRecord(stores.auditEvents, auditEvent, 'AUDIT_WRITE_FAILED');

    return { inventoryItem: after, stockMovement: movement, auditEvent };
    });
  } catch (error) {
    if (error?.code || !activeWriteErrorCode) throw error;
    throw transactionError(activeWriteErrorCode, error);
  }
}
