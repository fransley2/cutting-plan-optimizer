import assert from 'node:assert/strict';
import test from 'node:test';
import { retryPendingMtoDrawingSync } from '../src/data/mtoImportWorkflow.js';

function fixture(overrides = {}) {
  let batch = {
    id: 'BATCH-1',
    projectId: 'PROJECT-1',
    fileName: 'mto.csv',
    metadata: {
      untouched: 'keep-me',
      drawingSync: { status: 'pending', pendingDrawingNos: ['D-1', 'D-2'], createdDrawingIds: ['OLD-DRAWING'] },
    },
    ...overrides.batch,
  };
  const items = overrides.items || [
    { id: 'ITEM-1', batchId: 'BATCH-1', projectId: 'PROJECT-1', drawing: 'D-1', status: 'open' },
    { id: 'ITEM-2', batchId: 'BATCH-1', projectId: 'PROJECT-1', drawing: 'D-2', status: 'open' },
  ];
  const updates = [];
  const ensureCalls = [];
  const audits = [];
  let timestamp = 0;
  const dependencies = {
    batchId: 'BATCH-1',
    getMtoBatch: async (id) => (id === batch.id ? structuredClone(batch) : null),
    getMtoItemsByBatch: async (id) => {
      assert.equal(id, 'BATCH-1');
      return structuredClone(items.filter((item) => item.batchId === id));
    },
    ensureDrawingsForMtoItems: overrides.ensure || (async ([item]) => {
      ensureCalls.push(item.drawing);
      return [{ id: `DRAWING-${item.drawing}`, drawingNo: item.drawing }];
    }),
    updateMtoBatch: async (id, patch) => {
      assert.equal(id, batch.id);
      updates.push(structuredClone(patch));
      batch = { ...batch, ...structuredClone(patch), id };
      return structuredClone(batch);
    },
    createAuditEvent: async (event) => { audits.push(structuredClone(event)); },
    now: () => `2026-08-01T00:00:0${timestamp += 1}.000Z`,
  };
  return { dependencies, items, updates, ensureCalls, audits, get batch() { return batch; } };
}

test('requires a batch id', async () => {
  await assert.rejects(retryPendingMtoDrawingSync({}), (error) => error.code === 'MTO_DRAWING_SYNC_BATCH_ID_REQUIRED');
});

test('returns a domain error when the batch does not exist', async () => {
  const f = fixture();
  await assert.rejects(
    retryPendingMtoDrawingSync({ ...f.dependencies, batchId: 'MISSING' }),
    (error) => error.code === 'MTO_DRAWING_SYNC_BATCH_NOT_FOUND',
  );
});

test('returns an already complete batch without creating Drawings', async () => {
  const f = fixture({ batch: { metadata: { drawingSync: { status: 'complete', pendingDrawingNos: [], createdDrawingIds: ['D-OLD'] } } } });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.createdDrawingIds, ['D-OLD']);
  assert.equal(f.ensureCalls.length, 0);
  assert.equal(f.updates.length, 0);
});

test('creates pending Drawings and marks the batch complete', async () => {
  const f = fixture();
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.requestedDrawingNos, ['D-1', 'D-2']);
  assert.deepEqual(result.remainingDrawingNos, []);
  assert.equal(f.batch.metadata.drawingSync.status, 'complete');
  assert.equal(f.audits[0].metadata.operation, 'COMPLETE_MTO_DRAWING_SYNC');
});

test('marks a batch without items complete without calling creation', async () => {
  const f = fixture({ items: [] });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(result.status, 'complete');
  assert.equal(f.ensureCalls.length, 0);
  assert.deepEqual(f.batch.metadata.drawingSync.pendingDrawingNos, []);
});

test('ignores missing Drawing Nos and inactive cancelled or superseded items', async () => {
  const f = fixture({
    batch: { metadata: { drawingSync: { status: 'pending', pendingDrawingNos: ['D-1', 'D-X', 'D-Y'] } } },
    items: [
      { id: 'ACTIVE', batchId: 'BATCH-1', drawing: 'D-1', status: 'open' },
      { id: 'EMPTY', batchId: 'BATCH-1', drawing: '', status: 'open' },
      { id: 'CANCELLED', batchId: 'BATCH-1', drawing: 'D-X', status: 'cancelled' },
      { id: 'SUPERSEDED', batchId: 'BATCH-1', drawing: 'D-Y', status: 'superseded' },
    ],
  });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.deepEqual(result.requestedDrawingNos, ['D-1']);
});

test('deduplicates Drawing Nos case-insensitively', async () => {
  const f = fixture({
    batch: { metadata: { drawingSync: { status: 'pending', pendingDrawingNos: ['D-1', 'd-1'] } } },
    items: [
      { id: 'A', batchId: 'BATCH-1', drawing: 'D-1', status: 'open' },
      { id: 'B', batchId: 'BATCH-1', drawing: 'd-1', status: 'open' },
    ],
  });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.deepEqual(result.requestedDrawingNos, ['D-1']);
});

test('marks the batch failed and preserves remaining Drawing Nos after failure', async () => {
  const f = fixture({ ensure: async () => { throw new Error('Drawing service unavailable\nSTACK SHOULD NOT BE STORED'); } });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.remainingDrawingNos, ['D-1', 'D-2']);
  assert.equal(f.batch.metadata.drawingSync.status, 'failed');
  assert.equal(f.batch.metadata.drawingSync.lastError, 'Drawing service unavailable');
  assert.equal(f.batch.metadata.drawingSync.lastError.includes('STACK'), false);
});

test('preserves partial created IDs and retries only remaining Drawings', async () => {
  let fail = true;
  const calls = [];
  const f = fixture({ ensure: async ([item]) => {
    calls.push(item.drawing);
    if (item.drawing === 'D-2' && fail) throw new Error('second failed');
    return [{ id: `DRAWING-${item.drawing}`, drawingNo: item.drawing }];
  } });
  const failed = await retryPendingMtoDrawingSync(f.dependencies);
  assert.deepEqual(failed.createdDrawingIds, ['OLD-DRAWING', 'DRAWING-D-1']);
  assert.deepEqual(failed.remainingDrawingNos, ['D-2']);
  fail = false;
  const completed = await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(completed.status, 'complete');
  assert.deepEqual(calls, ['D-1', 'D-2', 'D-2']);
});

test('unites old and new Drawing IDs without duplicates', async () => {
  const f = fixture({ ensure: async ([item]) => [{ id: item.drawing === 'D-1' ? 'OLD-DRAWING' : 'NEW-DRAWING' }] });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.deepEqual(result.createdDrawingIds, ['OLD-DRAWING', 'NEW-DRAWING']);
});

test('does not rewrite MTO items or invoke impact and supersedence operations', async () => {
  const f = fixture();
  const before = structuredClone(f.items);
  await retryPendingMtoDrawingSync(f.dependencies);
  assert.deepEqual(f.items, before);
  assert.equal('updateMtoItem' in f.dependencies, false);
  assert.equal('analyzeImportImpact' in f.dependencies, false);
  assert.equal('updateMtoItemsStatus' in f.dependencies, false);
});

test('prevents simultaneous retries from creating Drawings twice', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const f = fixture({ ensure: async ([item]) => {
    calls += 1;
    await gate;
    return [{ id: `DRAWING-${item.drawing}` }];
  } });
  const first = retryPendingMtoDrawingSync(f.dependencies);
  const second = retryPendingMtoDrawingSync(f.dependencies);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 2, 'one execution should process the two distinct Drawing Nos once each');
  assert.deepEqual(a, b);
});

test('never leaves the batch processing after Drawing creation rejects', async () => {
  const f = fixture({ ensure: async () => { throw new Error('rejected'); } });
  await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(f.batch.metadata.drawingSync.status, 'failed');
  assert.equal(f.updates.some((patch) => patch.metadata.drawingSync.status === 'processing'), true);
});

test('preserves metadata outside drawingSync', async () => {
  const f = fixture();
  await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(f.batch.metadata.untouched, 'keep-me');
});

test('requests items only for the selected batch', async () => {
  const f = fixture({
    items: [
      { id: 'RIGHT', batchId: 'BATCH-1', drawing: 'D-1', status: 'open' },
      { id: 'OTHER', batchId: 'BATCH-OTHER', drawing: 'D-OTHER', status: 'open' },
    ],
    batch: { metadata: { drawingSync: { status: 'pending', pendingDrawingNos: ['D-1', 'D-OTHER'] } } },
  });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.deepEqual(result.requestedDrawingNos, ['D-1']);
});

test('treats an existing Drawing as synchronized when the idempotent creator returns none', async () => {
  const f = fixture({ ensure: async () => [] });
  const result = await retryPendingMtoDrawingSync(f.dependencies);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.createdDrawingIds, ['OLD-DRAWING']);
  assert.deepEqual(result.remainingDrawingNos, []);
});
