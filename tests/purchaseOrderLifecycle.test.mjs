import assert from 'node:assert/strict';
import { purchaseOrderDeletionBlockers, purchaseOrderItemDeletionBlockers } from '../src/core/purchaseOrderLifecycle.js';

const purchaseOrder = { id: 'PO-ID', projectId: 'P-1', poNumber: '1520813' };
const firstItem = { id: 'ITEM-1', purchaseOrderId: 'PO-ID', projectId: 'P-1', itemNumber: '10' };
const secondItem = { id: 'ITEM-2', purchaseOrderId: 'PO-ID', projectId: 'P-1', itemNumber: '20' };

assert.deepEqual(purchaseOrderItemDeletionBlockers(firstItem, purchaseOrder, {}), []);
assert.deepEqual(purchaseOrderDeletionBlockers(purchaseOrder, [firstItem, secondItem], {}), []);

const blockers = purchaseOrderItemDeletionBlockers(firstItem, purchaseOrder, {
  receiptLines: [{ id: 'RL-1', purchaseOrderId: 'PO-ID', poItemId: 'ITEM-1' }],
  materialUnits: [{ id: 'MU-1', poItemId: 'ITEM-1' }],
  inventoryItems: [{ id: 'INV-1', projectId: 'P-1', po: '1520813', poItem: '10' }],
  allocations: [{ id: 'AL-1', poItemId: 'ITEM-1', status: 'ACTIVE' }],
  deliveryForecasts: [{ id: 'ETA-1', poItemId: 'ITEM-1', status: 'ACTIVE' }],
});
assert.deepEqual(blockers.map((blocker) => blocker.code), [
  'PO_ITEM_HAS_RECEIPTS',
  'PO_ITEM_HAS_MATERIAL_UNITS',
  'PO_ITEM_HAS_INVENTORY',
  'PO_ITEM_HAS_MTO_ALLOCATIONS',
  'PO_ITEM_HAS_DELIVERY_FORECASTS',
]);

const poBlockers = purchaseOrderDeletionBlockers(purchaseOrder, [firstItem, secondItem], {
  inventoryItems: [{ id: 'INV-2', projectId: 'P-1', purchaseOrderId: 'PO-ID', poItemNumber: '20' }],
});
assert.equal(poBlockers.length, 1);
assert.equal(poBlockers[0].itemNumber, '20');
assert.equal(poBlockers[0].code, 'PO_ITEM_HAS_INVENTORY');

assert.equal(purchaseOrderItemDeletionBlockers(firstItem, purchaseOrder, {
  inventoryItems: [{ id: 'OTHER', projectId: 'P-2', po: '1520813', poItem: '10' }],
}).length, 0, 'same PO number in another project must not block deletion');

console.log('purchase order lifecycle tests passed');
