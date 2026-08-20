import assert from 'node:assert/strict';
import { validateWorkpack } from '../src/core/workpackValidation.js';
const valid = { id:'1', wpNo:'WP-1', projectId:'P', equipmentId:'E', workpackType:'GENERAL', status:'DRAFT', priority:'NORMAL', peopleCount:0, plannedManHours:0, actualManHours:0, dailyCapacity:0, mtoItemIds:[], inventoryItemIds:[], operations:[] };
assert.equal(validateWorkpack(valid).valid, true);
const invalid = validateWorkpack({ ...valid, wpNo:'', peopleCount:-1, operations:[{id:'x',sequence:1},{id:'x',sequence:1}] });
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.length >= 3);
console.log('workpack validation tests passed');
