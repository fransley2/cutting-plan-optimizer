import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMtoIdentCode, generateMissingMtoIdentCodes } from '../src/core/mtoIdentCode.js';
import { generatePurchaseOrderIdentCode } from '../src/core/purchaseOrderImport.js';

const mtoItem = {
  id: 'mto-1',
  type: 'PROCESS PIPE',
  material: 'UNS S32760',
  description: 'PIPE\nOD 323.8 MM\nWT 35.5 MM',
};

test('generates an MTO IDENT CODE with the same pattern as the PO generator', () => {
  const result = generateMissingMtoIdentCodes([mtoItem]);
  const identCode = result.items[0].identCode;
  assert.equal(result.generatedCount, 1);
  assert.equal(identCode, 'PP-SD-323-35');
  assert.equal(identCode, generatePurchaseOrderIdentCode({
    itemType: 'PROCESS PIPE',
    itemClassification: 'SUPERDUPLEX',
    diameterOdMm: 323.8,
    thicknessMm: 35.5,
  }));
});

test('does not replace an existing MTO IDENT CODE', () => {
  const existing = { ...mtoItem, identCode: 'EXISTING-CODE' };
  const result = generateMissingMtoIdentCodes([existing]);
  assert.equal(result.generatedCount, 0);
  assert.strictEqual(result.items[0], existing);
  assert.equal(result.items[0].identCode, 'EXISTING-CODE');
});

test('keeps the PO generator output unchanged', () => {
  assert.equal(generatePurchaseOrderIdentCode({
    itemClassification: 'CARBON STEEL',
    itemType: 'BEND',
    diameterOdMm: '273,1',
    thicknessMm: '34,9',
    degree: 90,
  }), 'BD-CS-273-34-90');
});

test('generates the template IDENT CODE from real MTO pipe fields without a prefilled code', () => {
  const item = {
    id: 'mto-real-pipe',
    type: 'Pipe',
    material: 'DNV25Cr',
    description: 'TUBO D168,3 x 19,1',
  };
  assert.equal(generateMtoIdentCode(item), 'PP-SD-168-19');
  const result = generateMissingMtoIdentCodes([item]);
  assert.equal(result.generatedCount, 1);
  assert.equal(result.items[0].identCode, 'PP-SD-168-19');
});
