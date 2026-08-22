import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MTO_TAG_RESOLUTION,
  resolveMtoEquipmentByTag,
} from '../src/core/mtoEquipmentResolution.js';

const equipments = [
  { id: 'EQ-1', equipmentTags: [' 32-WJ-10-3020 ', '32-WJ-10-3030'] },
  { id: 'EQ-2', equipmentTags: ['32-MP-20-0001'] },
];

test('resolves an MTO line to its equipment by normalized TAG', () => {
  const result = resolveMtoEquipmentByTag({ tag: ' 32-wj-10-3020 ' }, equipments);
  assert.equal(result.status, MTO_TAG_RESOLUTION.RESOLVED);
  assert.equal(result.equipment.id, 'EQ-1');
});

test('keeps an MTO line without TAG available for the legacy manual flow', () => {
  const result = resolveMtoEquipmentByTag({}, equipments);
  assert.equal(result.status, MTO_TAG_RESOLUTION.MISSING_TAG);
  assert.equal(result.equipment, null);
});

test('marks a present TAG without corresponding equipment as unmatched', () => {
  const result = resolveMtoEquipmentByTag({ tag: '32-XX-00-9999' }, equipments);
  assert.equal(result.status, MTO_TAG_RESOLUTION.UNMATCHED);
  assert.equal(result.equipment, null);
});

test('does not choose an equipment when duplicate normalized TAGs are ambiguous', () => {
  const result = resolveMtoEquipmentByTag({ tag: 'shared-tag' }, [
    { id: 'EQ-A', equipmentTags: ['SHARED-TAG'] },
    { id: 'EQ-B', equipmentTags: [' shared-tag '] },
  ]);
  assert.equal(result.status, MTO_TAG_RESOLUTION.AMBIGUOUS);
  assert.equal(result.equipment, null);
});
