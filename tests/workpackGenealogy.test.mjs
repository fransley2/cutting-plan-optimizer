import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkpackGenealogy } from '../src/core/workpackGenealogy.js';

test('builds an explicit Workpack material genealogy from stock to returned offcut', () => {
  const result = buildWorkpackGenealogy({ id: 'WP-1' }, {
    inventoryItems: [
      { id: 'INV-1', traceability: 'TR-001', description: 'Plate', status: 'CONSUMED', lengthMm: 6000 },
      { id: 'INV-2', traceability: 'TR-001-OC', description: 'Reusable offcut', status: 'AVAILABLE', lengthMm: 1800 },
    ],
    cuttingSheets: [{ id: 'CS-1' }],
    workpackLinks: [{ workpackId: 'WP-1', targetType: 'CUTTING_SHEET', targetId: 'CS-1', status: 'ACTIVE' }],
    materialTransformations: [
      { id: 'T-PART', workpackId: 'WP-1', cuttingSheetId: 'CS-1', parentInventoryItemId: 'INV-1', outputType: 'CUT_PART', outputId: 'PART-1', mark: 'M01', position: 'P01', lengthMm: 4000, quantity: 1 },
      { id: 'T-OFFCUT', cuttingSheetId: 'CS-1', parentInventoryItemId: 'INV-1', outputType: 'REUSABLE_OFFCUT', outputId: 'OFF-1', lengthMm: 1800, quantity: 1, metadata: { returnedInventoryItemId: 'INV-2', returnMaterialVoucherId: 'RMV-1' } },
      { id: 'UNRELATED', workpackId: 'WP-2', parentInventoryItemId: 'INV-X', outputType: 'CUT_PART', outputId: 'PART-X' },
    ],
    offcuts: [{ id: 'OFF-1', traceability: 'TR-001-OC', status: 'RETURNED', returnMaterialVoucherId: 'RMV-1', newInventoryItemId: 'INV-2', length: 1800 }],
    returnMaterialVouchers: [{ id: 'RMV-1', rmvNo: 'RMV-0001', status: 'RECEIVED', returnedItems: [{ sourceOffcutId: 'OFF-1', inventoryItemId: 'INV-2' }] }],
  });

  assert.equal(result.transformationCount, 2);
  assert.equal(result.roots.length, 1);
  assert.equal(result.roots[0].label, 'TR-001');
  assert.deepEqual(result.roots[0].children.map((node) => node.type), ['CUT_PART', 'OFFCUT']);
  assert.equal(result.roots[0].children[1].children[0].type, 'RMV');
  assert.equal(result.roots[0].children[1].children[0].children[0].type, 'RETURNED_STOCK');
  assert.deepEqual(result.summary, { materials: 1, cutParts: 1, offcuts: 1, rmvs: 1, returnedStock: 1, missingReferences: 0 });
});

test('keeps incomplete genealogy visible without inferring records by project', () => {
  const result = buildWorkpackGenealogy({ id: 'WP-1', projectId: 'P-1' }, {
    materialTransformations: [
      { id: 'T-1', workpackId: 'WP-1', parentInventoryItemId: 'MISSING', outputType: 'CUT_PART', outputId: 'PART-1' },
      { id: 'T-2', projectId: 'P-1', parentInventoryItemId: 'OTHER', outputType: 'CUT_PART', outputId: 'PART-2' },
    ],
  });

  assert.equal(result.transformationCount, 1);
  assert.equal(result.roots[0].type, 'MISSING_STOCK');
  assert.equal(result.summary.missingReferences, 1);
  assert.match(result.warnings[0], /MISSING/);
});
