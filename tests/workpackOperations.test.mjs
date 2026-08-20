import assert from 'node:assert/strict';
import { createWorkpackOperation, moveWorkpackOperation, normalizeOperationSequences, validateWorkpackOperation } from '../src/core/workpackOperations.js';

const original = [
  { id: 'op-1', sequence: 4, title: 'Cut', status: 'NOT_STARTED', plannedManHours: 4 },
  { id: 'op-2', sequence: 9, title: 'Weld', status: 'IN_PROGRESS', plannedManHours: 8 },
];
const before = structuredClone(original);
const normalized = normalizeOperationSequences(original);
assert.deepEqual(original, before, 'operation helpers must not mutate the original list');
assert.deepEqual(normalized.map((item) => item.sequence), [1, 2]);

const added = createWorkpackOperation({ id: 'op-3', title: 'Inspect', operationType: 'DIMENSIONAL_INSPECTION', status: 'READY' }, 3);
assert.equal(added.id, 'op-3');
assert.equal(added.sequence, 3);

const edited = { ...normalized[0], title: 'Cut revised' };
assert.equal(edited.id, 'op-1', 'editing must preserve the operation ID');
assert.equal(normalizeOperationSequences(normalized.filter((item) => item.id !== 'op-1')).length, 1, 'delete must remove only the selected operation');
assert.deepEqual(moveWorkpackOperation(normalized, 'op-2', -1).map((item) => item.id), ['op-2', 'op-1']);
assert.deepEqual(moveWorkpackOperation(normalized, 'op-1', 1).map((item) => item.id), ['op-2', 'op-1']);

assert.equal(validateWorkpackOperation({ sequence: 1, title: 'Valid', plannedManHours: 0, actualManHours: 0 }).length, 0);
assert.ok(validateWorkpackOperation({ sequence: 0, title: '', plannedManHours: -1, actualManHours: -1, plannedStartDate: '2026-02-02', plannedFinishDate: '2026-02-01' }).length >= 4);

console.log('workpack operations tests passed');
