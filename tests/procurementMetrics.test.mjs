import assert from 'node:assert/strict';
import { calculatePoItemMetrics, derivePoItemStatus, derivePurchaseOrderStatus, summarizeProcurement } from '../src/core/procurementMetrics.js';

const item = { id: 'item-42', orderedQuantity: 5, status: 'OPEN' };
const receipts = [{ id: 'r-1', status: 'INSPECTION_PENDING' }, { id: 'r-cancelled', status: 'CANCELLED' }];
const receiptLines = [
  { id: 'rl-1', receiptId: 'r-1', poItemId: item.id, receivedQuantity: 3 },
  { id: 'rl-2', receiptId: 'r-cancelled', poItemId: item.id, receivedQuantity: 8 },
];
const materialUnits = [
  { id: 'u-1', receiptLineId: 'rl-1', poItemId: item.id, quantity: 1, inspectionStatus: 'ACCEPTED', inventoryStatus: 'AVAILABLE' },
  { id: 'u-2', receiptLineId: 'rl-1', poItemId: item.id, quantity: 1, inspectionStatus: 'ACCEPTED', inventoryStatus: 'RESERVED' },
  { id: 'u-3', receiptLineId: 'rl-1', poItemId: item.id, quantity: 1, inspectionStatus: 'HOLD', inventoryStatus: 'PENDING_POSTING' },
];
const metrics = calculatePoItemMetrics({
  item, receipts, receiptLines, materialUnits,
  inventoryItems: [
    { id: 'inv-1', balanceQty: 0, reservedQty: 1, issuedQty: 0, metadata: { poItemId: item.id } },
    { id: 'inv-2', balanceQty: 1, reservedQty: 0, issuedQty: 1, metadata: { poItemId: item.id } },
  ],
  reservations: [{ poItemId: item.id, quantity: 1, status: 'ACTIVE' }],
  stockMovements: [{ poItemId: item.id, movementType: 'ISSUE_MATERIAL', quantityDelta: -1 }],
});

assert.deepEqual(metrics, {
  ordered: 5, received: 3, accepted: 2, hold: 1, rejected: 0, available: 1,
  reserved: 1, stockOnHand: 2, issued: 1, consumed: 0, used: 1, returned: 0, pending: 2, inspectionPending: 0,
});
assert.equal(derivePoItemStatus(metrics), 'PARTIALLY_RECEIVED');
assert.equal(derivePoItemStatus({ ordered: 5, received: 5 }), 'RECEIVED');
assert.equal(derivePurchaseOrderStatus([item], new Map([[item.id, metrics]]), 'ISSUED'), 'PARTIALLY_RECEIVED');
assert.deepEqual(summarizeProcurement({ purchaseOrders: [{ id: 'po-1' }], items: [item], metricsByItem: new Map([[item.id, metrics]]), receipts, materialUnits }), {
  purchaseOrders: 1, ordered: 5, received: 3, accepted: 2, hold: 1, available: 1, reserved: 1, stockOnHand: 2, used: 1, pending: 2, receipts: 2, physicalUnits: 3,
});

const linearMetrics = calculatePoItemMetrics({
  item: { id: 'pipe-item', orderedQuantity: 60, unitOfMeasure: 'M' },
  receipts: [{ id: 'pipe-receipt', status: 'RECEIVED' }],
  receiptLines: [{ id: 'pipe-line', receiptId: 'pipe-receipt', poItemId: 'pipe-item', receivedQuantity: 60 }],
  materialUnits: Array.from({ length: 10 }, (_, index) => ({ id: `pipe-unit-${index}`, receiptLineId: 'pipe-line', poItemId: 'pipe-item', quantity: 1, inventoryItemId: `pipe-inv-${index}` })),
  inventoryItems: Array.from({ length: 10 }, (_, index) => ({ id: `pipe-inv-${index}`, balanceQty: index ? 1 : 0, issuedQty: index ? 0 : 1, lengthMm: 6000, metadata: { poItemId: 'pipe-item', isIndividuallySerialized: true } })),
});
assert.equal(linearMetrics.received, 60);
assert.equal(linearMetrics.stockOnHand, 54);
assert.equal(linearMetrics.used, 6);

const legacyInventoryMetrics = calculatePoItemMetrics({
  item: { id: 'legacy-item', projectId: 'project-1', purchaseOrderId: 'legacy-po', itemNumber: '13', orderedQuantity: 8, unitOfMeasure: 'EA' },
  purchaseOrder: { id: 'legacy-po', poNumber: '1523734' },
  inventoryItems: [
    { id: 'legacy-inv-1', projectId: 'project-1', po: '1523734', poItem: '13', qty: 3, receivedQty: 3, balanceQty: 2, issuedQty: 1 },
    { id: 'legacy-inv-2', projectId: 'project-1', poItemPo: '1523734 / 13', qty: 2, balanceQty: 2 },
    { id: 'other-project', projectId: 'project-2', poItemPo: '1523734-13', qty: 9, balanceQty: 9 },
  ],
});
assert.equal(legacyInventoryMetrics.received, 5);
assert.equal(legacyInventoryMetrics.stockOnHand, 4);
assert.equal(legacyInventoryMetrics.used, 1);
assert.equal(legacyInventoryMetrics.pending, 3);

const repeatedInventoryTotalMetrics = calculatePoItemMetrics({
  item: { id: 'serialized-legacy-item', projectId: 'project-1', itemNumber: '14', orderedQuantity: 8, unitOfMeasure: 'EA' },
  purchaseOrder: { id: 'legacy-po', poNumber: '1523734' },
  inventoryItems: Array.from({ length: 8 }, (_, index) => ({
    id: `legacy-serialized-${index}`, projectId: 'project-1', poItemPo: '1523734-14', qty: 1, receivedQty: 8, balanceQty: 1,
  })),
});
assert.equal(repeatedInventoryTotalMetrics.received, 8);
assert.equal(repeatedInventoryTotalMetrics.pending, 0);

const reconciledMetrics = calculatePoItemMetrics({
  item: { id: 'reconciled-item', projectId: 'project-1', itemNumber: '4', orderedQuantity: 10, unitOfMeasure: 'EA' },
  purchaseOrder: { id: 'po-1', poNumber: '1512341' },
  receipts: [{ id: 'receipt-1', status: 'RECEIVED' }],
  receiptLines: [{ id: 'line-1', receiptId: 'receipt-1', poItemId: 'reconciled-item', receivedQuantity: 4 }],
  inventoryItems: [{ id: 'posted-inventory', projectId: 'project-1', qty: 4, receivedQty: 4, balanceQty: 4, metadata: { poItemId: 'reconciled-item' } }],
});
assert.equal(reconciledMetrics.received, 4);
assert.equal(reconciledMetrics.pending, 6);

console.log('procurement metrics tests passed');
