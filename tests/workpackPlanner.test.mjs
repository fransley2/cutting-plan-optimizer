import assert from 'node:assert/strict';
import { linkedInventoryForPlanner, uniqueLinkedRecords, resolvePlannerWorkpack } from '../src/core/workpackPlanner.js';
const records=[{id:'a'},{id:'b'}]; assert.deepEqual(uniqueLinkedRecords(['a','a','x'],records).missing,['x']); assert.equal(uniqueLinkedRecords(['a','a'],records).found.length,1); assert.equal(resolvePlannerWorkpack([{id:'w',wpNo:'WP'}],'w','old').workpack,'WP'); assert.equal(resolvePlannerWorkpack([], 'bad','old').workpack,'old');
assert.deepEqual(linkedInventoryForPlanner([{ trace: 'A', lengthMm: 6000 }, { trace: 'B', lengthMm: 0 }]).map((item) => item.trace), ['A']);
console.log('workpack planner tests passed');
