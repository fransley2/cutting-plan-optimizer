import assert from 'node:assert/strict';
import { automaticWorkpackMaterialSelection, filterWorkpackNestingInputs, uniqueMaterialIds, resolveWorkpackMaterials, materialWarnings } from '../src/core/workpackMaterials.js';
assert.deepEqual(uniqueMaterialIds(['T1','T1','',null]),['T1']);
const links=resolveWorkpackMaterials(['T1','MISSING'],[{trace:'T1',balanceQty:0,status:'hold'},null]);
assert.equal(links.length,2); assert.ok(materialWarnings(links[0]).includes('Zero balance')); assert.deepEqual(materialWarnings(links[1]),['Missing from Inventory']);

const linkedMtoIds = ['M-PIPE', 'M-AUX'];
const mtoItems = [
  { id: 'M-PIPE', identCode: 'PP-SD-168-19', cutLength: 2542.8, qty: 1 },
  { id: 'M-AUX', identCode: 'PP-AUX-168-19', cutLength: 1041.35, qty: 1 },
];
const inventoryItems = [
  { trace: 'PIPE-RAW', identCode: 'PP-SD-168-19', lengthMm: 6100, balanceQty: 1, status: 'available' },
  { trace: 'AUX-RESERVED', identCode: 'PP-AUX-168-19', lengthMm: 1200, balanceQty: 1, status: 'reserved' },
  { trace: 'AUX-AVAILABLE', identCode: 'PP-AUX-168-19', lengthMm: 1200, balanceQty: 1, status: 'N/A' },
];
const beforeMto = structuredClone(mtoItems);
const beforeInventory = structuredClone(inventoryItems);
const automatic = automaticWorkpackMaterialSelection(linkedMtoIds, mtoItems, inventoryItems);
assert.deepEqual(automatic.selectedInventoryIds, ['PIPE-RAW', 'AUX-AVAILABLE']);
assert.equal(automatic.matchedGroups.length, 2);
assert.equal(automatic.unmatchedGroups.length, 0);
assert.equal(automatic.ignoredGroups.length, 0);
assert.deepEqual(mtoItems, beforeMto);
assert.deepEqual(inventoryItems, beforeInventory);

const shortage = automaticWorkpackMaterialSelection(
  ['M-PIPE'],
  mtoItems,
  [{ trace: 'TOO-SHORT', identCode: 'PP-SD-168-19', lengthMm: 1000, balanceQty: 1, status: 'available' }],
);
assert.deepEqual(shortage.selectedInventoryIds, []);
assert.equal(shortage.unmatchedGroups.length, 1);

const nonLinear = automaticWorkpackMaterialSelection(
  ['M-CURVE'],
  [{ id: 'M-CURVE', identCode: 'BD-SD-168-19-90', description: 'CURVA D168,3 x 19,1', cutLength: 1041.35, qty: 1 }],
  [{ trace: 'CURVE-STOCK', identCode: 'BD-SD-168-19-90', balanceQty: 1, status: 'available' }],
);
assert.deepEqual(nonLinear.selectedInventoryIds, ['CURVE-STOCK']);
assert.equal(nonLinear.matchedGroups.length, 1);
assert.equal(nonLinear.unmatchedGroups.length, 0);
assert.equal(nonLinear.nonLinearGroups.length, 1, 'non-linear MTO components must be linked by Ident Code without requiring bar length');

const nestingInputs = filterWorkpackNestingInputs(
  [
    { id: 'M-PIPE', identCode: 'PP-SD-168-19', description: 'TUBO', cutLength: 2542.8 },
    { id: 'M-CURVE', identCode: 'BD-SD-168-19-90', description: 'CURVA', cutLength: 1041.35 },
  ],
  [
    { trace: 'PIPE-STOCK', identCode: 'PP-SD-168-19', lengthMm: 6100 },
    { trace: 'CURVE-STOCK', identCode: 'BD-SD-168-19-90' },
  ],
);
assert.deepEqual(nestingInputs.mtoItems.map((item) => item.id), ['M-PIPE']);
assert.deepEqual(nestingInputs.inventoryItems.map((item) => item.trace), ['PIPE-STOCK']);
assert.deepEqual(nestingInputs.excludedMtoItems.map((item) => item.id), ['M-CURVE']);

const plannerAware = automaticWorkpackMaterialSelection(
  ['M-1', 'M-2', 'M-3'],
  [
    { id: 'M-1', identCode: 'PP-TEST', material: 'A36', cutLength: 4000, qty: 1 },
    { id: 'M-2', identCode: 'PP-TEST', material: 'A36', cutLength: 4000, qty: 1 },
    { id: 'M-3', identCode: 'PP-TEST', material: 'A36', cutLength: 4000, qty: 1 },
  ],
  [
    { trace: 'SHORT', identCode: 'PP-TEST', materialGrade: 'A36', lengthMm: 3500, balanceQty: 4, status: 'available' },
    { trace: 'BAR-A', identCode: 'PP-TEST', materialGrade: 'A36', lengthMm: 6000, balanceQty: 1, status: 'available' },
    { trace: 'BAR-B', identCode: 'PP-TEST', materialGrade: 'A36', lengthMm: 6000, balanceQty: 1, status: 'available' },
    { trace: 'BAR-C', identCode: 'PP-TEST', materialGrade: 'A36', lengthMm: 6000, balanceQty: 1, status: 'available' },
  ],
);
assert.deepEqual(plannerAware.selectedInventoryIds, ['BAR-A', 'BAR-B', 'BAR-C']);
assert.equal(plannerAware.matchedGroups.length, 1);

const normalizedGradeCoverage = automaticWorkpackMaterialSelection(
  ['M-NORMALIZED'],
  [{ id: 'M-NORMALIZED', identCode: 'PP-NORMALIZED', material: 'DNV 25 CR', cutLength: 4000, qty: 3 }],
  [
    { trace: 'NORM-A', identCode: 'PP-NORMALIZED', materialGrade: 'dnv-25-cr', lengthMm: 6000, balanceQty: 1, status: 'available' },
    { trace: 'NORM-B', identCode: 'PP-NORMALIZED', materialGrade: 'DNV25CR', lengthMm: 6000, balanceQty: 1, status: 'available' },
    { trace: 'NORM-C', identCode: 'PP-NORMALIZED', materialGrade: 'DNV 25 CR', lengthMm: 6000, balanceQty: 1, status: 'available' },
  ],
);
assert.deepEqual(normalizedGradeCoverage.selectedInventoryIds, ['NORM-A', 'NORM-B', 'NORM-C']);
assert.equal(normalizedGradeCoverage.matchedGroups.length, 1, 'automatic selection should cover the full MTO quantity after normalizing compatible grades');
console.log('workpack materials tests passed');
