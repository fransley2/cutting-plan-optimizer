import assert from 'node:assert/strict';
import {
  isCuttingSheetCouponEligible,
  prepareCuttingSheetIssue,
} from '../src/core/cuttingSheetWorkflow.js';

const solution = {
  stockUsed: [{ traceability: 'TR-1', originalLength: 6000, pieces: [{ id: 'PART-1', mark: 'M1', pos: '1', length: 1000 }] }],
  unplacedParts: [{ id: 'PART-2' }],
};
const inventory = [{ id: 'INV-1', trace: 'TR-1', traceability: 'TR-1', projectId: 'P-1', status: 'issued' }];
const coupon = {
  id: 'MC-1', projectId: 'P-1', workpackId: 'WP-1', status: 'dispatched',
  metadata: { coupon: { lines: [{ id: 'MC-L1', inventoryItemId: 'INV-1', traceability: 'TR-1' }] } },
};
const reservations = [{ materialCouponId: 'MC-1', materialCouponLineId: 'MC-L1', inventoryItemId: 'INV-1', status: 'CONSUMED' }];

assert.equal(isCuttingSheetCouponEligible(coupon), true);
assert.equal(isCuttingSheetCouponEligible({ id: 'MC-DRAFT', status: 'draft' }), true);

const prepared = prepareCuttingSheetIssue({ solution, projectId: 'P-1', workpackId: 'WP-1', coupon, inventoryItems: inventory, reservations });
assert.equal(prepared.valid, true);
assert.equal(prepared.bars[0].inventoryItemId, 'INV-1');
assert.equal(prepared.bars[0].materialCouponId, 'MC-1');
assert.equal(prepared.bars[0].materialCouponLineId, 'MC-L1');
assert.equal(prepared.bars[0].pieces[0].materialCouponLineId, 'MC-L1');
assert.equal(prepared.warnings[0].code, 'UNPLACED_PARTS_EXCLUDED');
assert.equal(solution.stockUsed[0].inventoryItemId, undefined, 'preparation must not mutate the optimizer result');

const issuedCoupon = prepareCuttingSheetIssue({ solution, projectId: 'P-1', coupon: { ...coupon, status: 'issued' }, inventoryItems: inventory });
assert.equal(issuedCoupon.valid, true, 'Coupon workflow status must not gate Cutting Sheet/RMV forecasting');

const wrongProject = prepareCuttingSheetIssue({ solution, projectId: 'P-2', coupon, inventoryItems: inventory });
assert.ok(wrongProject.errors.some((error) => error.code === 'MATERIAL_COUPON_PROJECT_MISMATCH'));

const uncovered = prepareCuttingSheetIssue({ solution, projectId: 'P-1', coupon: { ...coupon, metadata: { coupon: { lines: [] } } }, inventoryItems: inventory });
assert.ok(uncovered.errors.some((error) => error.code === 'CUTTING_BAR_NOT_COVERED_BY_COUPON'));

const missingInventory = prepareCuttingSheetIssue({ solution, projectId: 'P-1', coupon, inventoryItems: [] });
assert.ok(missingInventory.errors.some((error) => error.code === 'CUTTING_BAR_INVENTORY_NOT_FOUND'));

console.log('cutting sheet workflow tests passed');
