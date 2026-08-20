import assert from 'node:assert/strict';
import { cuttingSheetBarDisplayName, cuttingSheetBarPoItem } from '../src/core/cuttingSheetPresentation.js';

const inventoryId = '7ec7243f-bd15-4732-96e9-fba1db55b6aa';

assert.equal(
  cuttingSheetBarDisplayName({ id: inventoryId, inventoryItemId: inventoryId }, 0, [{ id: inventoryId, name: 'HEB240 - BAR 01', traceability: 'GBE1450848-43-001' }]),
  'HEB240 - BAR 01',
);
assert.equal(cuttingSheetBarDisplayName({ id: inventoryId, traceability: 'GBE1450848-43-001' }, 0), 'GBE1450848-43-001');
assert.equal(cuttingSheetBarDisplayName({ id: inventoryId }, 2), 'Barra 3');
assert.equal(cuttingSheetBarDisplayName({ id: inventoryId, po: '1450848', poItem: '43' }, 0), 'PO 1450848 / Item 43');
assert.equal(cuttingSheetBarPoItem({ po: '1450848', poItem: '43' }), '43');
assert.equal(cuttingSheetBarPoItem({ stockItem: { poItem: '44' }, item: 'legacy' }), '44');
assert.equal(cuttingSheetBarPoItem({ item: '45' }), '45');
assert.equal(cuttingSheetBarPoItem({ po: '1450848', poItemPo: '1450848 / 43' }), '43');
assert.equal(cuttingSheetBarPoItem({ po: '1450848', traceability: 'GBE1450848-43-001' }), '43');

console.log('cutting sheet presentation tests passed');
