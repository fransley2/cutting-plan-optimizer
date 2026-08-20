import assert from 'node:assert/strict';
import { resolveWorkpackOffcuts } from '../src/core/workpackOffcuts.js';

const result = resolveWorkpackOffcuts(
  { id: 'WP-1', projectId: 'PROJECT-1', offcutIds: ['OFF-1', 'OFF-MISSING', 'OFF-1'] },
  [
    { id: 'OFF-1', traceability: 'TRACE-1', material: 'A106', length: 500, qty: 1, status: 'reusable' },
    { id: 'OFF-2', workpackId: 'WP-1', traceability: 'TRACE-2', metadata: { workpackId: 'WP-1' } },
    { id: 'OFF-3', projectId: 'PROJECT-1', traceability: 'TRACE-3' },
    null,
    'malformed',
  ],
);

assert.equal(result.records.length, 2);
assert.equal(result.records.some((record) => record.id === 'OFF-3'), false, 'project-only offcuts must not be inferred');
assert.deepEqual(result.missing, ['OFF-MISSING']);
assert.equal(result.records[0].traceability, 'TRACE-1');

console.log('workpack offcuts tests passed');
