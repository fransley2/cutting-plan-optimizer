import assert from 'node:assert/strict';
import {
  isInventoryAvailableForWorkpack,
  isOffcutInventoryItem,
  suggestWorkpackMaterials,
} from '../src/core/workpackQuickCreate.js';

const inventory = [
  { id: 'OFFCUT-1', materialGrade: 'A36', lengthMm: 1200, balanceQty: 1, status: 'available', parentTrace: 'PARENT-1' },
  { id: 'BAR-1', materialGrade: 'A36', lengthMm: 6000, balanceQty: 2, status: 'available' },
  { id: 'RESERVED-1', materialGrade: 'A36', lengthMm: 6000, balanceQty: 1, status: 'reserved' },
  { id: 'ZERO-1', materialGrade: 'A36', lengthMm: 6000, balanceQty: 0, status: 'available' },
];

assert.equal(isInventoryAvailableForWorkpack(inventory[0]), true);
assert.equal(isInventoryAvailableForWorkpack(inventory[2]), false);
assert.equal(isInventoryAvailableForWorkpack(inventory[3]), false);
assert.equal(isOffcutInventoryItem(inventory[0]), true);
assert.equal(isOffcutInventoryItem(inventory[1]), false);

const sourceMto = [{ id: 'MTO-1', material: 'A36', cutLength: 1000, qty: 2 }];
const sourceInventory = structuredClone(inventory);
const suggestions = suggestWorkpackMaterials(sourceMto, sourceInventory);
assert.equal(suggestions.length, 1);
assert.equal(suggestions[0].requiredLength, 2200);
assert.deepEqual(suggestions[0].suggestedIds, ['OFFCUT-1', 'BAR-1']);
assert.equal(suggestions[0].remainingLength, 0);
assert.equal(JSON.stringify(sourceInventory), JSON.stringify(inventory));

const missing = suggestWorkpackMaterials([{ id: 'MTO-2', material: 'A106', cutLength: 1000, qty: 1 }], inventory);
assert.equal(missing[0].remainingLength, 1100);

console.log('workpack quick create tests passed');
