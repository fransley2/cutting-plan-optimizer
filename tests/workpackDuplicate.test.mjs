import assert from 'node:assert/strict';
import { duplicateWorkpack } from '../src/core/workpackDuplicate.js';
const source = { id:'A', wpNo:'WP-1', status:'COMPLETED', actualManHours:10, inventoryItemIds:['I'], mtoItemIds:['M'], operations:[{id:'OP',sequence:1,status:'COMPLETED'}] };
const copy = duplicateWorkpack(source);
assert.equal(source.id, 'A'); assert.equal(copy.status, 'DRAFT'); assert.equal(copy.wpNo, 'WP-1-COPY'); assert.equal('inventoryItemIds' in copy, false); assert.notEqual(copy.operations[0].id, 'OP'); assert.equal(copy.operations[0].status, 'NOT_STARTED');
console.log('workpack duplicate tests passed');
