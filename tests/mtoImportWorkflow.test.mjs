import assert from 'node:assert/strict';
import test from 'node:test';
import { commitMtoThenCreateDrawings } from '../src/data/mtoImportWorkflow.js';

test('commits the complete MTO before creating drawings and keeps it committed on drawing failure', async () => {
  const calls = [];
  const persisted = { batch: null, items: [], superseded: [] };
  const drawingFailure = new Error('Synthetic drawing failure');
  const importPayload = {
    batch: { id: 'BATCH-ORDER' },
    items: [{ id: 'ITEM-NEW', drawing: 'DWG-1' }],
    itemsToSupersede: ['ITEM-OLD'],
  };

  const result = await commitMtoThenCreateDrawings({
    importPayload,
    items: importPayload.items,
    projectId: 'PROJECT-1',
    saveImport: async (payload) => {
      calls.push('saveMtoImport');
      persisted.batch = payload.batch;
      persisted.items = payload.items;
      persisted.superseded = payload.itemsToSupersede;
      return { batch: payload.batch, items: payload.items, itemsToSupersede: payload.itemsToSupersede };
    },
    createDrawings: async () => {
      calls.push('ensureDrawingsForMtoItems');
      throw drawingFailure;
    },
  });

  assert.deepEqual(calls, ['saveMtoImport', 'ensureDrawingsForMtoItems']);
  assert.equal(persisted.batch.id, 'BATCH-ORDER');
  assert.deepEqual(persisted.items.map((item) => item.id), ['ITEM-NEW']);
  assert.deepEqual(persisted.superseded, ['ITEM-OLD']);
  assert.equal(result.importResult.batch.id, 'BATCH-ORDER');
  assert.equal(result.drawingError, drawingFailure);
});

for (const scenario of ['all unresolved', 'continue unresolved', 'all kept existing']) {
  test(`does not save, create drawings, or create an empty batch for ${scenario}`, async () => {
    let saveCalls = 0;
    let drawingCalls = 0;
    const result = await commitMtoThenCreateDrawings({
      importPayload: { batch: { id: `EMPTY-${scenario}` }, items: [], itemsToSupersede: [] },
      items: [],
      projectId: 'PROJECT-1',
      saveImport: async () => { saveCalls += 1; },
      createDrawings: async () => { drawingCalls += 1; },
    });
    assert.equal(saveCalls, 0);
    assert.equal(drawingCalls, 0);
    assert.equal(result.importResult, null);
    assert.equal(result.reason, 'NO_ITEMS');
  });
}
