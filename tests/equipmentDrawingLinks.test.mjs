import assert from 'node:assert/strict';
import { drawingDesignReference, drawingsLinkedToEquipment } from '../src/core/equipmentDrawingLinks.js';

const drawings = [
  { id: 'D-2', equipmentId: 'EQ-1', drawingNo: 'DA-012', revision: '00', isCurrentRevision: true },
  { id: 'D-1', equipmentId: 'EQ-1', drawingNo: 'DA-011', revision: '01', isCurrentRevision: true },
  { id: 'D-OLD', equipmentId: 'EQ-1', drawingNo: 'DA-011', revision: '00', isCurrentRevision: false },
  { id: 'D-OTHER', equipmentId: 'EQ-2', drawingNo: 'DA-010', revision: '00', isCurrentRevision: true },
];

assert.deepEqual(
  drawingsLinkedToEquipment(drawings, 'EQ-1').map((drawing) => drawing.id),
  ['D-1', 'D-2'],
  'Equipment should display only current Drawings linked by its exact equipmentId',
);
assert.deepEqual(
  drawingsLinkedToEquipment(drawings, 'EQ-1', { currentOnly: false }).map((drawing) => drawing.id),
  ['D-OLD', 'D-1', 'D-2'],
  'revision history remains available when explicitly requested',
);
assert.deepEqual(drawingsLinkedToEquipment(drawings, ''), []);
assert.equal(
  drawingDesignReference({ engineeringCode: 'LEGACY-REF' }, { designDrawingNo: 'DESIGN-DWG-001' }),
  'DESIGN-DWG-001',
  'the Equipment Design Drawing should be the canonical reference',
);
assert.equal(
  drawingDesignReference({ engineeringCode: 'LEGACY-REF' }, {}),
  'LEGACY-REF',
  'legacy Drawing engineeringCode remains available as a compatibility fallback',
);

console.log('equipment drawing links tests passed');
