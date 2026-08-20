import assert from 'node:assert/strict';
import {
  nextInventoryRemainderTraceability,
  planMaterialCouponInventorySplits,
  splitInventoryItem,
  splitInventoryLength,
} from '../src/core/inventorySplit.js';
import { validateMaterialCouponReservation } from '../src/core/materialCouponReservation.js';

const qtySource = { id: 'Q-1', trace: 'Q-1', traceability: 'Q-1', qty: 10, balanceQty: 10, weightKg: 100, status: 'available' };
const qtySplit = splitInventoryItem(qtySource, { qty: 4 }, 'Q-1-R1');
assert.equal(qtySplit.original.id, 'Q-1');
assert.equal(qtySplit.original.qty, 4);
assert.equal(qtySplit.original.balanceQty, 4);
assert.equal(qtySplit.child.qty, 6);
assert.equal(qtySplit.child.balanceQty, 6);
assert.equal(qtySplit.original.weightKg, 40);
assert.equal(qtySplit.child.weightKg, 60);
assert.equal(qtySplit.weightBasis, 'qty');

const lengthSource = { id: 'L-1', trace: 'L-1', traceability: 'L-1', qty: 1, balanceQty: 1, lengthMm: 6000, weightKg: 60, status: 'available' };
const lengthSplit = splitInventoryLength(lengthSource, 4000, 'L-1-R1');
assert.equal(lengthSplit.original.lengthMm, 4000);
assert.equal(lengthSplit.child.lengthMm, 2000);
assert.equal(lengthSplit.original.balanceQty, 1);
assert.equal(lengthSplit.child.balanceQty, 1);
assert.equal(lengthSplit.original.weightKg, 40);
assert.equal(lengthSplit.child.weightKg, 20);
assert.equal(lengthSplit.weightBasis, 'length');

const bothSource = { id: 'B-1', trace: 'B-1', traceability: 'B-1', qty: 10, balanceQty: 10, lengthMm: 6000, weightKg: 120, status: 'available' };
const bothPlans = planMaterialCouponInventorySplits(
  [{ inventoryItemId: 'B-1', qty: 4, lengthMm: 3000 }],
  [bothSource],
);
assert.equal(bothPlans.length, 1);
assert.deepEqual(bothPlans[0].consumedValues, { qty: 4, lengthMm: 3000 });
assert.equal(bothPlans[0].original.qty, 4);
assert.equal(bothPlans[0].child.qty, 6);
assert.equal(bothPlans[0].original.lengthMm, 3000);
assert.equal(bothPlans[0].child.lengthMm, 3000);
assert.equal(bothPlans[0].original.weightKg, 60);
assert.equal(bothPlans[0].child.weightKg, 60);
assert.equal(bothPlans[0].weightBasis, 'length');

assert.deepEqual(planMaterialCouponInventorySplits([{ manualLine: true, qty: 1, lengthMm: 1000 }], [lengthSource]), []);
assert.deepEqual(planMaterialCouponInventorySplits([{ inventoryItemId: 'L-1', qty: 1, lengthMm: 6000 }], [lengthSource]), []);
assert.deepEqual(planMaterialCouponInventorySplits([{ inventoryItemId: 'L-1', qty: 1, diaMm: 10, thicknessMm: 2 }], [lengthSource]), []);

const balanceFallbackPlan = planMaterialCouponInventorySplits(
  [{ inventoryItemId: 'BF-1', qty: 4 }],
  [{ id: 'BF-1', trace: 'BF-1', qty: 1, balanceQty: 10, status: 'available' }],
);
assert.equal(balanceFallbackPlan[0].original.qty, 4);
assert.equal(balanceFallbackPlan[0].child.qty, 6);

const issueLine = { inventoryItemId: 'B-1', qty: 4, lengthMm: 3000 };
const postSplitValidation = validateMaterialCouponReservation([issueLine], [bothPlans[0].original, bothPlans[0].child]);
assert.equal(postSplitValidation.valid, true);
assert.equal(postSplitValidation.reservations[0].quantity, 4);

const widthSplit = splitInventoryItem({ ...lengthSource, widthMm: 1000 }, { widthMm: 600 }, 'L-1-R2');
assert.equal(widthSplit.original.widthMm, 600);
assert.equal(widthSplit.child.widthMm, 400);
assert.equal(widthSplit.original.weightKg, 60);
assert.equal(widthSplit.child.weightKg, 0);
assert.equal(widthSplit.weightBasis, '');

assert.equal(nextInventoryRemainderTraceability(lengthSource, [lengthSource, { trace: 'L-1-R1' }]), 'L-1-R2');
assert.equal(qtySplit.child.parentStockId, 'Q-1');
assert.equal(qtySplit.child.parentTraceability, 'Q-1');
assert.equal(qtySplit.child.status, 'available');
assert.equal(qtySplit.child.reservedQty, 0);

assert.throws(() => splitInventoryItem(qtySource, { qty: 0 }, 'Q-1-R1'), /INVALID_SPLIT_QTY/);
assert.throws(() => splitInventoryItem(qtySource, { qty: 10 }, 'Q-1-R1'), /INVALID_SPLIT_QTY/);
assert.throws(() => splitInventoryItem(lengthSource, { lengthMm: 6000 }, 'L-1-R1'), /INVALID_SPLIT_LENGTH/);
assert.throws(() => splitInventoryItem({ ...lengthSource, widthMm: 1000 }, { widthMm: 1000 }, 'L-1-R1'), /INVALID_SPLIT_WIDTH/);
assert.throws(() => splitInventoryItem(qtySource, { qty: 4 }, ''), /CHILD_TRACEABILITY_REQUIRED/);

console.log('inventory split tests passed');
