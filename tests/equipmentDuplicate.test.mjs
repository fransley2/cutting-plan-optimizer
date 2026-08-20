import assert from 'node:assert/strict';
import { createEquipmentDuplicate } from '../src/core/equipmentDuplicate.js';

const source = {
  id: 'equipment-1',
  projectId: 'PROJECT-1',
  code: 'EQ-100',
  scopeType: 'INCORPORATED',
  equipmentClass: 'MODULE',
  equipmentType: 'PLEM MODULE',
  equipmentStructure: 'SUPPORT FRAME',
  equipmentName: 'Pump Skid',
  name: 'Pump Skid',
  clientTag: 'P-1001',
  equipmentTags: ['P-1001', 'P-1002'],
  plannedQuantity: 2,
  discipline: 'Mechanical',
  description: 'Main pump skid',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  drawingIds: ['drawing-1'],
  mtoItemIds: ['mto-1'],
  workpackIds: ['workpack-1'],
};

const before = structuredClone(source);
const duplicate = createEquipmentDuplicate(source, { createId: () => 'equipment-copy' });

assert.deepEqual(source, before, 'duplicate helper must not mutate the source');
assert.equal(duplicate.id, 'equipment-copy');
assert.equal(duplicate.projectId, source.projectId);
assert.equal(duplicate.scopeType, source.scopeType);
assert.equal(duplicate.equipmentClass, source.equipmentClass);
assert.equal(duplicate.equipmentType, source.equipmentType);
assert.equal(duplicate.equipmentStructure, source.equipmentStructure);
assert.equal(duplicate.discipline, source.discipline);
assert.equal(duplicate.equipmentName, 'Pump Skid-COPY');
assert.equal(duplicate.name, 'Pump Skid-COPY');
assert.equal(duplicate.code, 'EQ-100-COPY');
assert.equal(duplicate.clientTag, '');
assert.deepEqual(duplicate.equipmentTags, []);
assert.equal(duplicate.plannedQuantity, 2);
assert.equal(duplicate.createdAt, '');
assert.equal(duplicate.updatedAt, '');
assert.equal('drawingIds' in duplicate, false);
assert.equal('mtoItemIds' in duplicate, false);
assert.equal('workpackIds' in duplicate, false);

const noCode = createEquipmentDuplicate({ id: 'equipment-2', name: 'No code', code: '' }, { createId: () => 'equipment-copy-2' });
assert.equal(noCode.code, '');

console.log('equipment duplicate tests passed');
