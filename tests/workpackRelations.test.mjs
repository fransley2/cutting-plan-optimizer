import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyWorkpackRelationInputs, operationalWorkpackValue, stripLegacyWorkpackRelations, workpackDisplayName, workpackRelationIds, WORKPACK_RELATION_TYPES } from '../src/core/workpackRelations.js';

test('resolves a persisted Workpack ID to its operational number for display', () => {
  const workpacks = [{ id: '7ec7243f-bd15-4732-96e9-fba1db55b6aa', wpNo: 'WP-B58-001', title: 'Fabrication' }];
  assert.equal(workpackDisplayName(workpacks, workpacks[0].id), 'WP-B58-001');
  assert.equal(workpackDisplayName(workpacks, 'missing-id', 'Legacy WP'), 'Legacy WP');
});

test('removes Workpack selection placeholders from reports and exports', () => {
  assert.equal(operationalWorkpackValue('Selecione um Workpack'), '');
  assert.equal(operationalWorkpackValue('Select a Workpack'), '');
  assert.equal(workpackDisplayName([], '', 'Selecione um Workpack'), '');
  assert.equal(operationalWorkpackValue('B58-WP-001'), 'B58-WP-001');
});

test('reads legacy arrays only until relation records exist', () => {
  const workpack = { id: 'WP-1', projectId: 'P-1', mtoItemIds: ['MTO-LEGACY'], inventoryItemIds: ['INV-LEGACY'] };
  assert.deepEqual(workpackRelationIds(workpack, [], WORKPACK_RELATION_TYPES.MTO_ITEM), ['MTO-LEGACY']);
  assert.deepEqual(workpackRelationIds(workpack, [
    { workpackId: 'WP-1', targetType: 'MTO_ITEM', targetId: 'MTO-LINK', status: 'ACTIVE' },
  ], WORKPACK_RELATION_TYPES.MTO_ITEM), ['MTO-LINK']);
  assert.deepEqual(workpackRelationIds(workpack, [
    { workpackId: 'WP-1', targetType: 'INVENTORY_ITEM', targetId: 'INV-LEGACY', status: 'INACTIVE' },
  ], WORKPACK_RELATION_TYPES.INVENTORY_ITEM), []);
});

test('removes all legacy relationship fields from the canonical Workpack record', () => {
  const canonical = stripLegacyWorkpackRelations({ id: 'WP-1', drawingId: 'D-1', mtoItemIds: ['M-1'], inventoryItemIds: ['I-1'], title: 'WP' });
  assert.deepEqual(canonical, { id: 'WP-1', title: 'WP' });
});

test('creates idempotent migration inputs only for relation types not migrated yet', () => {
  const inputs = legacyWorkpackRelationInputs({
    id: 'WP-1', projectId: 'P-1', drawingId: 'DWG-1', drawingIds: ['DWG-1'], mtoItemIds: ['MTO-1'], inventoryItemIds: ['INV-1'],
  }, [{ workpackId: 'WP-1', targetType: 'MTO_ITEM', targetId: 'MTO-NEW', status: 'ACTIVE' }]);
  assert.deepEqual(inputs.filter((item) => item.targetType === 'DRAWING_REVISION').map((item) => item.targetId), ['DWG-1']);
  assert.equal(inputs.some((item) => item.targetType === 'MTO_ITEM'), false);
  assert.equal(inputs.some((item) => item.targetType === 'INVENTORY_ITEM' && item.targetId === 'INV-1'), true);
});
