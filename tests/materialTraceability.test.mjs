import assert from 'node:assert/strict';
import { derivePoItemBaseTraceability, generateSequentialTraceabilities, highestSequentialTraceability, materialTypeTraceabilityCode, projectTraceabilityCode } from '../src/core/materialTraceability.js';

const base = 'GBD1523734-1';
const materialUnits = [
  { traceability: `${base}-001` },
  { traceability: `${base}-008` },
  { traceability: 'GBD1523734-10-099' },
];
const inventoryItems = [
  { trace: `${base}-012` },
  { traceability: `${base}-010`, id: `${base}-010` },
  { trace: `${base}-R1` },
];

assert.equal(highestSequentialTraceability(base, [...materialUnits, ...inventoryItems]), 12);
assert.deepEqual(generateSequentialTraceabilities(base, 3, [...materialUnits, ...inventoryItems]), [
  `${base}-013`, `${base}-014`, `${base}-015`,
]);
assert.deepEqual(generateSequentialTraceabilities('GPP1524494-18', 2, [{ trace: 'GPP1524494-18-999' }]), [
  'GPP1524494-18-1000', 'GPP1524494-18-1001',
]);

assert.equal(projectTraceabilityCode({ name: 'GRANMORGU BLOCK 58', shortCode: 'B58' }), 'G');
assert.equal(projectTraceabilityCode({ name: 'RAIA BMC33' }), 'RA');
assert.equal(projectTraceabilityCode({ name: 'GRANMORGU BLOCK 58', shortCode: 'B58', traceabilityCode: 'GM' }), 'GM');
assert.equal(materialTypeTraceabilityCode({ itemType: 'BEND', identCode: '' }), 'BD');
assert.equal(materialTypeTraceabilityCode({ itemType: 'PROCESS PIPE', identCode: 'PP-CS-273-28' }), 'PP');
assert.equal(materialTypeTraceabilityCode({ description: 'SUBSEA INDUCTION BEND OD 168,3MM WT 19,1MM' }), 'BD');
assert.equal(materialTypeTraceabilityCode({ description: 'WELDING CONSUMABLES FOR FABRICATION' }), 'WC');
assert.equal(derivePoItemBaseTraceability({ project: { name: 'GRANMORGU BLOCK 58' }, purchaseOrder: { poNumber: '1523734' }, item: { itemNumber: '25', itemType: 'BEND' } }), 'GBD1523734-25');
assert.equal(derivePoItemBaseTraceability({ project: { traceabilityCode: 'G' }, purchaseOrder: { poNumber: '1523734' }, item: { itemNumber: '1', description: 'PROD JUMPER INDUCTION BEND', traceability: 'XBD1523734-1' } }), 'GBD1523734-1');
assert.equal(derivePoItemBaseTraceability({ project: {}, purchaseOrder: { poNumber: '1524494' }, item: { itemNumber: '18', traceability: 'GPP1524494-18' } }), 'GPP1524494-18');
assert.deepEqual(generateSequentialTraceabilities('A.B[1]', 1, [{ traceability: 'A.B[1]-003' }]), ['A.B[1]-004']);
assert.throws(() => generateSequentialTraceabilities(base, 1.5), /SEQUENTIAL_TRACEABILITY_QUANTITY_INVALID/);
assert.throws(() => generateSequentialTraceabilities('', 1), /BASE_TRACEABILITY_REQUIRED/);

console.log('material traceability tests passed');
