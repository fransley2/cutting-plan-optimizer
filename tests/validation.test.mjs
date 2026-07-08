import assert from 'node:assert/strict';
import { validateTraceability } from '../src/core/validation.js';

const inventoryWithMissingTraceability = [
  { traceability: 'T-101', po: 'PO-1' },
  { traceability: '', po: 'PO-2' },
  { po: 'PO-3' },
  { traceability: '   ', po: 'PO-4' },
];

function run() {
  const disabled = validateTraceability(inventoryWithMissingTraceability, { requireTraceability: false });
  assert.deepEqual(disabled, { valid: true });

  const complete = validateTraceability(
    [{ traceability: 'T-101' }, { traceability: 'T-102' }],
    { requireTraceability: true },
  );
  assert.deepEqual(complete, { valid: true });

  const missing = validateTraceability(inventoryWithMissingTraceability, { requireTraceability: true });
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missing, [
    { traceability: '', po: 'PO-2' },
    { po: 'PO-3' },
    { traceability: '   ', po: 'PO-4' },
  ]);

  const empty = validateTraceability([], { requireTraceability: true });
  assert.deepEqual(empty, { valid: true });

  console.log('validation tests passed');
}

run();
