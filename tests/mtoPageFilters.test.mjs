import assert from 'node:assert/strict';
import { enrichItemsWithEquipment, equipmentHint, filterMtoItems } from '../src/ui/mtoPage.js';

const items = [
  { id: '1', drawing: 'DWG-001', equipmentId: 'EQ-1', material: 'A', discipline: 'PIPING', status: 'open' },
  { id: '2', drawing: 'DWG-002', equipmentId: 'EQ-1', material: 'B', discipline: 'STRUCTURAL', status: 'open' },
  { id: '3', drawing: 'DWG-003', equipmentId: 'EQ-2', material: 'A', discipline: 'PIPING', status: 'matched' },
];

const filters = { search: '', drawing: '', equipmentId: '', material: '', discipline: '', status: '' };

assert.deepEqual(
  filterMtoItems(items, { ...filters, drawing: 'DWG-002' }).map((item) => item.id),
  ['2'],
  'drawing navigation should reuse the drawing filter',
);

assert.deepEqual(
  filterMtoItems(items, { ...filters, equipmentId: 'EQ-1' }).map((item) => item.id),
  ['1', '2'],
  'equipment navigation should show every MTO item linked to the equipment',
);

assert.deepEqual(
  filterMtoItems(items, { ...filters, drawing: 'DWG-003', equipmentId: 'EQ-2' }).map((item) => item.id),
  ['3'],
  'drawing and equipment filters should remain composable',
);

assert.equal(
  equipmentHint({ tag: '32-WJ-10-2020', equipmentName: 'Pump skid', constructionActivity: 'Installation' }),
  '32-WJ-10-2020',
  'automatic equipment matching must try the MTO Tag before descriptive fields',
);
assert.equal(
  equipmentHint({ equipmentName: 'Pump skid', constructionActivity: 'Installation' }),
  'Pump skid',
  'equipment name remains the fallback when the MTO has no Tag',
);

const [ambiguousEquipmentItem] = enrichItemsWithEquipment(
  [{ id: 'MTO-AMBIGUOUS', tag: 'SHARED-TAG' }],
  [
    { id: 'EQ-AMBIGUOUS-1', equipmentTags: ['SHARED-TAG'] },
    { id: 'EQ-AMBIGUOUS-2', equipmentTags: ['SHARED-TAG'] },
  ],
);
assert.equal(
  ambiguousEquipmentItem.equipmentId,
  undefined,
  'ambiguous equipment matches must leave the MTO item without an automatic link',
);

console.log('mto page filter tests passed');
