import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaterialCouponStockRows } from '../src/documents/materialCoupon.js';

test('maps persisted Material Coupon lines to the planner stock-row contract', () => {
  const rows = buildMaterialCouponStockRows({
    number: 'B58_FAB_MC-012',
    metadata: {
      coupon: {
        lines: [{
          po: '4500012345',
          poItem: '10',
          qty: 2,
          lengthMm: 6000,
          materialGrade: 'A36',
          heatNo: 'H-001',
          materialDescription: 'Pipe 6 in',
          traceability: 'TR-001',
        }],
      },
    },
  });

  assert.deepEqual(rows, [{
    po: '4500012345',
    poItem: '10',
    qty: '2',
    lengthMm: '6000',
    materialGrade: 'A36',
    heatNo: 'H-001',
    materialDescription: 'Pipe 6 in',
    traceability: 'TR-001',
  }]);
});

test('preserves supported stock aliases without inventing missing planner values', () => {
  const rows = buildMaterialCouponStockRows({
    items: [{
      stockItem: {
        purchaseOrder: '4500099999',
        item: '20',
        originalLength: 3000,
        grade: 'A516',
        heat: 'H-002',
        description: 'Plate',
        trace: 'TR-002',
      },
    }],
  });

  assert.deepEqual(rows, [{
    po: '4500099999',
    poItem: '20',
    qty: '',
    lengthMm: '3000',
    materialGrade: 'A516',
    heatNo: 'H-002',
    materialDescription: 'Plate',
    traceability: 'TR-002',
  }]);
});
