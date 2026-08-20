import assert from 'node:assert/strict';
import {
  classifyOffcutLength,
  buildFinalMaterialRemainders,
  offcutClassificationLabel,
  OFFCUT_CLASSIFICATION,
  OFFCUT_REUSE_MIN_LENGTH_MM,
} from '../src/core/offcutClassification.js';

assert.equal(OFFCUT_REUSE_MIN_LENGTH_MM, 500);
assert.equal(classifyOffcutLength(500), OFFCUT_CLASSIFICATION.REUSABLE);
assert.equal(classifyOffcutLength(500.01), OFFCUT_CLASSIFICATION.REUSABLE);
assert.equal(classifyOffcutLength(499.99), OFFCUT_CLASSIFICATION.SCRAP);
assert.equal(classifyOffcutLength(0), '');
assert.equal(offcutClassificationLabel(500), 'Reaproveitável');
assert.equal(offcutClassificationLabel(499), 'Scrap');

const remainders = buildFinalMaterialRemainders({ stockUsed: [
  { inventoryItemId: 'INV-1', traceability: 'TR-1', remaining: 600, materialGrade: 'A36' },
  { inventoryItemId: 'INV-1', traceability: 'TR-1_OC', remaining: 499, materialGrade: 'A36' },
  { inventoryItemId: 'INV-2', traceability: 'TR-2', remaining: 500, materialGrade: 'S355' },
] });
assert.deepEqual(remainders.map(({ traceability, length, metadata }) => [traceability, length, metadata.classification]), [
  ['TR-1_OC_OC', 499, 'SCRAP'],
  ['TR-2_OC', 500, 'REUSABLE'],
]);

console.log('offcut classification tests passed');
