import { getMaterialUnitPostingEligibility, buildInventoryItemFromMaterialUnit } from '../core/materialUnitPosting.js';
import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeMaterialUnit } from './materialReceipts.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { normalizeAuditEvent, AUDIT_EVENT_TYPES } from './auditLog.js';

const STORE_NAMES = Object.freeze([
  'materialUnits', 'materialReceiptLines', 'materialReceipts', 'purchaseOrderItems', 'purchaseOrders', 'organizations',
  'inventory', 'stockMovements', 'auditLog', 'auditEvents',
]);

function text(value) { return value == null ? '' : String(value).trim(); }
function put(store, value) { store.put(value); return value; }

function saveAudit(stores, input) {
  const event = normalizeAuditEvent(input);
  put(stores.auditLog, event);
  put(stores.auditEvents, event);
  return event;
}

export async function commitMaterialUnitsToInventory(unitIds = [], context = {}) {
  const selectedIds = [...new Set((Array.isArray(unitIds) ? unitIds : []).map(text).filter(Boolean))];
  if (!selectedIds.length) throw new Error('NO_MATERIAL_UNITS_SELECTED');
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [units, receiptLines, receipts, poItems, purchaseOrders, organizations, inventoryItems] = await Promise.all([
      idbRequest(stores.materialUnits.getAll()), idbRequest(stores.materialReceiptLines.getAll()),
      idbRequest(stores.materialReceipts.getAll()), idbRequest(stores.purchaseOrderItems.getAll()),
      idbRequest(stores.purchaseOrders.getAll()), idbRequest(stores.organizations.getAll()), idbRequest(stores.inventory.getAll()),
    ]);
    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const userName = text(context.userName);
    const result = { postedUnits: [], alreadyPostedUnits: [], inventoryItems: [], movements: [], auditEvents: [] };
    const knownTraces = new Set(inventoryItems.flatMap((item) => [item.trace, item.traceability]).map(text).filter(Boolean));

    for (const unitId of selectedIds) {
      const unit = units.find((item) => item.id === unitId);
      if (!unit) throw new Error(`MATERIAL_UNIT_NOT_FOUND:${unitId}`);
      const eligibility = getMaterialUnitPostingEligibility(unit);
      if (eligibility.code === 'MATERIAL_UNIT_ALREADY_POSTED') {
        const linkedItem = inventoryItems.find((item) => [item.id, item.trace, item.traceability].map(text).includes(text(unit.inventoryItemId || unit.traceability)));
        if (!linkedItem) throw new Error(`MATERIAL_UNIT_POSTING_INCONSISTENT:${unit.id}`);
        result.alreadyPostedUnits.push(unit);
        continue;
      }
      if (!eligibility.eligible) throw new Error(`${eligibility.code}:${unit.id}`);
      if (knownTraces.has(text(unit.traceability))) throw new Error(`INVENTORY_TRACEABILITY_ALREADY_EXISTS:${unit.traceability}`);

      const receiptLine = receiptLines.find((item) => item.id === unit.receiptLineId);
      const receipt = receipts.find((item) => item.id === receiptLine?.receiptId);
      const poItem = poItems.find((item) => item.id === unit.poItemId);
      const purchaseOrder = purchaseOrders.find((item) => item.id === poItem?.purchaseOrderId);
      if (!receiptLine || !receipt || !poItem || !purchaseOrder) throw new Error(`MATERIAL_UNIT_SOURCE_NOT_FOUND:${unit.id}`);
      if (unit.projectId !== receipt.projectId || unit.projectId !== poItem.projectId || unit.projectId !== purchaseOrder.projectId) {
        throw new Error(`MATERIAL_UNIT_PROJECT_MISMATCH:${unit.id}`);
      }
      const supplier = organizations.find((item) => item.id === unit.supplierId) || {};
      const inventoryItem = normalizeInventoryItem(buildInventoryItemFromMaterialUnit({ unit, poItem, purchaseOrder, receipt, supplier, timestamp }));
      put(stores.inventory, inventoryItem);
      inventoryItems.push(inventoryItem);
      knownTraces.add(inventoryItem.trace);

      const postedUnit = { ...normalizeMaterialUnit({ ...unit, postingStatus: 'POSTED', inventoryStatus: 'AVAILABLE', inventoryItemId: inventoryItem.id, postedAt: timestamp, postedBy: userName }, unit), updatedAt: timestamp };
      put(stores.materialUnits, postedUnit);
      const movement = put(stores.stockMovements, normalizeStockMovement({
        movementType: STOCK_MOVEMENT_TYPES.RECEIVE_MATERIAL, inventoryItemId: inventoryItem.id, projectId: unit.projectId,
        timestamp, userName, quantityDelta: unit.quantity, lengthDelta: unit.originalLengthMm,
        previousStatus: unit.inventoryStatus || 'PENDING_POSTING', nextStatus: inventoryItem.status,
        sourceDocumentType: 'MATERIAL_RECEIPT', sourceDocumentId: receipt.id, reason: 'Accepted Material Unit posted to Inventory.',
        before: unit, after: inventoryItem, metadata: { materialUnitId: unit.id, receiptLineId: receiptLine.id, poItemId: poItem.id, purchaseOrderId: purchaseOrder.id },
      }));
      const audit = saveAudit(stores, {
        eventType: AUDIT_EVENT_TYPES.RECEIVE_MATERIAL, entityType: 'MATERIAL_UNIT', entityId: unit.id, projectId: unit.projectId,
        timestamp, userName, sourceDocumentType: 'MATERIAL_RECEIPT', sourceDocumentId: receipt.id,
        reason: 'Accepted Material Unit posted atomically to Inventory.', before: unit, after: postedUnit,
        metadata: { inventoryItemId: inventoryItem.id, movementId: movement.id, receiptLineId: receiptLine.id },
      });
      result.postedUnits.push(postedUnit);
      result.inventoryItems.push(inventoryItem);
      result.movements.push(movement);
      result.auditEvents.push(audit);
    }
    return result;
  });
}
