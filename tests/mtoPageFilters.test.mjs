import assert from 'node:assert/strict';
import {
  buildMtoEquipmentGroups,
  commonResolvedEquipmentId,
  enrichItemsWithEquipment,
  equipmentHint,
  extractMtoDimension,
  filterMtoItems,
} from '../src/ui/mtoPage.js';

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

assert.deepEqual(
  filterMtoItems([{ id: 'TAGGED', tag: '32-WJ-10-3020' }], { ...filters, search: 'wj-10-3020' }).map((item) => item.id),
  ['TAGGED'],
  'the general MTO search also indexes TAG',
);

assert.equal(extractMtoDimension('TUBO D168,3 x 19,1 ASTM'), 'D168,3 x 19,1');
assert.equal(extractMtoDimension('SEM MEDIDA'), '');

const groupEquipments = [{
  id: 'EQ-GROUP', name: 'Production Jumper', equipmentType: 'JUMPER', fieldLocation: 'KBD', variant: 'TYPE 1',
  equipmentTags: ['TAG-01', 'TAG-02'],
}];
const enrichedGroups = enrichItemsWithEquipment([
  { id: 'M-1', tag: 'tag-01' },
  { id: 'M-2', tag: 'TAG-02' },
  { id: 'M-3', tag: 'TAG-MISSING' },
], groupEquipments);
assert.equal(commonResolvedEquipmentId(enrichedGroups.slice(0, 2), groupEquipments), 'EQ-GROUP');
assert.equal(commonResolvedEquipmentId(enrichedGroups, groupEquipments), '');
const equipmentGroups = buildMtoEquipmentGroups(enrichedGroups, groupEquipments);
assert.equal(equipmentGroups.find((group) => group.key === 'equipment:EQ-GROUP').tagCount, 2);
assert.equal(equipmentGroups.find((group) => group.key === 'unmatched:TAG-MISSING').unmatchedCount, 1);
