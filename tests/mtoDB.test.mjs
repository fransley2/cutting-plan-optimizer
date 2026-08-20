import assert from 'node:assert/strict';

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function installIndexedDB() {
  const databases = new Map();
  let failNextStore = '';
  let failNextRecordId = '';

  globalThis.indexedDB = {
    open(name, version) {
      const request = { result: null, error: null };
      setTimeout(() => {
        let state = databases.get(name);
        const isUpgrade = !state || version > state.version;
        if (!state) {
          state = { version, stores: new Map() };
          databases.set(name, state);
        }
        if (version > state.version) state.version = version;

        const db = {
          version: state.version,
          objectStoreNames: {
            contains: (storeName) => state.stores.has(storeName),
          },
          createObjectStore(storeName, options) {
            const storeState = { keyPath: options.keyPath, records: new Map(), indexes: new Set() };
            state.stores.set(storeName, storeState);
            return { createIndex: (indexName) => storeState.indexes.add(indexName) };
          },
          transaction(storeNames) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const snapshots = new Map(names.map((storeName) => [storeName, new Map(state.stores.get(storeName).records)]));
            let pending = 0;
            let completionQueued = false;
            let aborted = false;
            const tx = {
              objectStore(storeName) {
                const storeState = state.stores.get(storeName);
                const run = (operation) => {
                  const request = { result: undefined, error: null };
                  pending += 1;
                  setTimeout(() => {
                    if (aborted) return;
                    try {
                      request.result = operation();
                      request.onsuccess?.({ target: request });
                    } catch (error) {
                      request.error = error;
                      tx.error = error;
                      request.onerror?.({ target: request });
                      tx.abort();
                    } finally {
                      pending -= 1;
                      queueCompletion();
                    }
                  }, 0);
                  return request;
                };
                return {
                  getAll: () => run(() => [...storeState.records.values()].map(clone)),
                  get: (key) => run(() => clone(storeState.records.get(key) || null)),
                  put: (value) => run(() => {
                    if (failNextStore === storeName && (!failNextRecordId || value?.id === failNextRecordId)) {
                      failNextStore = '';
                      failNextRecordId = '';
                      throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
                    }
                    storeState.records.set(value[storeState.keyPath], clone(value));
                    return value[storeState.keyPath];
                  }),
                  delete: (key) => run(() => storeState.records.delete(key)),
                  clear: () => run(() => storeState.records.clear()),
                };
              },
              abort() {
                if (aborted) return;
                aborted = true;
                snapshots.forEach((records, storeName) => {
                  state.stores.get(storeName).records = new Map(records);
                });
                setTimeout(() => tx.onabort?.({ target: tx }), 0);
              },
            };
            function queueCompletion() {
              if (aborted || pending || completionQueued) return;
              completionQueued = true;
              setTimeout(() => {
                completionQueued = false;
                if (!aborted && pending === 0) tx.oncomplete?.({ target: tx });
              }, 0);
            }
            setTimeout(queueCompletion, 0);
            return tx;
          },
          close() {},
        };

        request.result = db;
        if (isUpgrade) request.onupgradeneeded?.({ target: request, oldVersion: 0 });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
  return {
    failNextPut(storeName, recordId = '') {
      failNextStore = storeName;
      failNextRecordId = recordId;
    },
  };
}

const indexedDBControl = installIndexedDB();

const {
  MTO_ITEM_STATUS,
  analyzeImportImpact,
  compareRevisions,
  createMtoItem,
  saveMtoImport,
  getAllMtoBatches,
  getMtoItems,
  getMtoItemsByBatch,
  updateMtoItemsStatus,
  updateMtoItem,
  deleteMtoItem,
  deleteMtoItems,
  deleteMtoBatch,
  clearMtoData,
} = await import('../src/data/mtoDB.js');
const { normalizeMtoRow } = await import('../src/data/mtoImport.js');
const { buildDefaultMtoImportPlan } = await import('../src/data/mtoImportPlan.js');

await clearMtoData();

const invalidLocalizedItem = normalizeMtoRow({
  Drawing: 'D-INVALID-NUMBER',
  Mark: 'M-INVALID-NUMBER',
  Position: 'P-INVALID-NUMBER',
  Quantity: 'abc',
  Material: 'A36',
  'Length/mm': '6000 mm',
}, { sourceRowNumber: 1 });
await assert.rejects(
  saveMtoImport({
    batch: { id: 'BATCH-INVALID-NUMBER', projectId: 'PROJECT-1', rowCount: 1, rejectedCount: 1 },
    items: [invalidLocalizedItem],
  }),
  (error) => error.code === 'MTO_IMPORT_VALIDATION_FAILED'
    && error.validationErrors[0].errors.includes('Invalid quantity format'),
);
assert.equal(invalidLocalizedItem.qty, null);
assert.equal(invalidLocalizedItem.metadata.originalRow.Quantity, 'abc');
assert.equal((await getAllMtoBatches()).some((batch) => batch.id === 'BATCH-INVALID-NUMBER'), false);
assert.equal((await getMtoItems({ includeSuperseded: true })).some((item) => item.mark === 'M-INVALID-NUMBER'), false);

const validLocalizedItem = normalizeMtoRow({
  Drawing: 'D-VALID-NUMBER',
  Mark: 'M-VALID-NUMBER',
  Position: 'P-VALID-NUMBER',
  Quantity: '12,5',
  Material: 'A36',
  'Length/mm': '6 000',
  'Weight/kg': '1.234,56',
}, { sourceRowNumber: 1 });
await saveMtoImport({
  batch: { id: 'BATCH-VALID-NUMBER', projectId: 'PROJECT-1', rowCount: 1, acceptedCount: 1 },
  items: [validLocalizedItem],
});
const persistedLocalizedItem = (await getMtoItemsByBatch('BATCH-VALID-NUMBER'))[0];
assert.equal(persistedLocalizedItem.qty, 12.5);
assert.equal(persistedLocalizedItem.cutLength, 6000);
assert.equal(persistedLocalizedItem.weightKg, 1234.56);
assert.equal(typeof persistedLocalizedItem.qty, 'number');
assert.equal(persistedLocalizedItem.metadata.numericParsing.qty.rawValue, '12,5');
await deleteMtoBatch('BATCH-VALID-NUMBER');

await assert.rejects(
  saveMtoImport({
    batch: { id: 'BATCH-INVALID', projectId: 'PROJECT-1', rowCount: 1, rejectedCount: 1 },
    items: [{ id: 'ITEM-REJECTED', drawing: '', mark: 'M-X', pos: 'P-X', qty: 0, material: '', cutLength: 0, sourceRowNumber: 7 }],
  }),
  (error) => error.code === 'MTO_IMPORT_VALIDATION_FAILED'
    && error.validationErrors[0].rowNumber === 7
    && error.validationErrors[0].errors.length === 4,
);
assert.equal((await getAllMtoBatches()).length, 0);
assert.equal((await getMtoItems()).length, 0);

const importResult = await saveMtoImport({
  batch: {
    id: 'BATCH-1',
    projectId: 'PROJECT-1',
    fileName: 'mto.xlsx',
    rowCount: 2,
    acceptedCount: 2,
    rejectedCount: 0,
  },
  items: [
    { id: 'ITEM-2', drawing: 'D-1', mark: 'M-2', pos: 'P-2', qty: 1, material: 'A36', cutLength: 2000, sourceRowNumber: 2, identCode: 'ID-2', discipline: 'Piping', type: 'Pipe' },
    { id: 'ITEM-1', drawing: 'D-1', revision: 'A', mark: 'M-1', pos: 'P-1', qty: 1, material: 'A36', cutLength: 1000, sourceRowNumber: 1, identCode: 'ID-1', discipline: 'Piping', type: 'Pipe' },
  ],
});
assert.equal(importResult.batch.id, 'BATCH-1');
assert.equal(importResult.batch.revision, 'A');
assert.equal(importResult.items.length, 2);
assert.equal(importResult.items[0].batchId, 'BATCH-1');
assert.equal(importResult.items[0].projectId, 'PROJECT-1');

await createMtoItem({
  id: 'ITEM-INVALID', batchId: 'BATCH-1', projectId: 'PROJECT-1', drawing: '', mark: 'M-X', pos: 'P-X',
  qty: 0, material: '', cutLength: 0, sourceRowNumber: 3, status: MTO_ITEM_STATUS.INVALID,
  validationErrors: ['Missing drawing'],
});

await saveMtoImport({
  batch: { id: 'BATCH-2', projectId: 'PROJECT-2', rowCount: 1, acceptedCount: 1 },
  items: [
    { id: 'ITEM-3', drawing: 'D-2', mark: 'M-3', pos: 'P-3', qty: 1, material: 'A106', cutLength: 500, sourceRowNumber: 1, status: MTO_ITEM_STATUS.MATCHED, identCode: 'ID-3', discipline: 'Structure', type: 'Beam' },
  ],
});

await saveMtoImport({
  batch: { id: 'BATCH-REV-OLD', projectId: 'PROJECT-REV', rowCount: 3, acceptedCount: 3 },
  items: [
    { id: 'REV-OLD-UNCHANGED', drawing: 'D-REV', revision: 'A', mark: 'M-1', pos: '1', qty: 1, material: 'A36', cutLength: 1000, sourceRowNumber: 1 },
    { id: 'REV-OLD-MODIFIED', drawing: 'D-REV', revision: 'A', mark: 'M-2', pos: '1', qty: 1, material: 'A36', cutLength: 1000, sourceRowNumber: 2 },
    { id: 'REV-OLD-REMOVED', drawing: 'D-REV', revision: 'A', mark: 'M-3', pos: '1', qty: 1, material: 'A36', cutLength: 1000, sourceRowNumber: 3 },
  ],
});
await saveMtoImport({
  batch: { id: 'BATCH-REV-NEW', projectId: 'PROJECT-REV', rowCount: 3, acceptedCount: 3 },
  items: [
    { id: 'REV-NEW-UNCHANGED', drawing: 'D-REV', revision: '0', mark: 'M-1', pos: '1', qty: 1, material: 'A36', cutLength: 1000, sourceRowNumber: 1 },
    { id: 'REV-NEW-MODIFIED', drawing: 'D-REV', revision: '0', mark: 'M-2', pos: '1', qty: 2, material: 'A36', cutLength: 1200, sourceRowNumber: 2 },
    { id: 'REV-NEW-ADDED', drawing: 'D-REV', revision: '0', mark: 'M-4', pos: '1', qty: 1, material: 'A106', cutLength: 900, sourceRowNumber: 3 },
  ],
});

assert.equal(compareRevisions('A', '0'), 'newer');
assert.equal(compareRevisions('0', 'A'), 'older');
assert.equal(compareRevisions('A', 'B'), 'newer');
assert.equal(compareRevisions('1', '0'), 'older');
assert.equal(compareRevisions('A', 'A'), 'same');
assert.equal(compareRevisions('IFC', '0'), 'unknown');

await createMtoItem({
  id: 'IMPACT-EXISTING-UNKNOWN', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '0',
  mark: 'M-UNKNOWN', pos: '1', qty: 1, material: 'A36', cutLength: 1000,
});
await createMtoItem({
  id: 'IMPACT-EXISTING-SAME', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '0',
  mark: 'M-SAME', pos: '1', qty: 1, material: 'A36', cutLength: 1000,
});
const impact = await analyzeImportImpact([
  { id: 'IMPACT-DUP', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '0', mark: 'M-1', pos: '1', qty: 1, material: 'A36', cutLength: 1000, description: '' },
  { id: 'IMPACT-REPLACE', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '1', mark: 'M-2', pos: '1', qty: 3, material: 'A36', cutLength: 1400 },
  { id: 'IMPACT-OLDER', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: 'A', mark: 'M-4', pos: '1', qty: 1, material: 'A106', cutLength: 900 },
  { id: 'IMPACT-UNKNOWN', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: 'IFC', mark: 'M-UNKNOWN', pos: '1', qty: 1, material: 'A36', cutLength: 1000 },
  { id: 'IMPACT-SAME-CHANGED', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '0', mark: 'M-SAME', pos: '1', qty: 2, material: 'A36', cutLength: 1000 },
  { id: 'IMPACT-NEW', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '1', mark: 'M-5', pos: '1', qty: 1, material: 'A36', cutLength: 700 },
], { projectId: 'PROJECT-REV' });
assert.deepEqual(impact.duplicates.map((entry) => entry.newItem.id), ['IMPACT-DUP']);
assert.deepEqual(impact.revisions.map((entry) => entry.newItem.id), ['IMPACT-REPLACE']);
assert.deepEqual(impact.olderRevisions.map((entry) => entry.newItem.id), ['IMPACT-OLDER']);
assert.deepEqual(impact.unknownRevisions.map((entry) => entry.newItem.id), ['IMPACT-UNKNOWN']);
assert.deepEqual(impact.sameRevisionChanged.map((entry) => entry.newItem.id), ['IMPACT-SAME-CHANGED']);
assert.deepEqual(impact.brandNew.map((item) => item.id), ['IMPACT-NEW']);
assert.deepEqual(impact.toSupersede, ['REV-NEW-MODIFIED']);
assert.equal(impact.toSupersede.includes('REV-NEW-ADDED'), false, 'an older revision must remain pending');
assert.equal(impact.toSupersede.includes('REV-NEW-UNCHANGED'), false, 'an unknown revision must remain pending');

const conflictingInsideFileItems = [
  { id: 'IMPACT-FILE-CONFLICT-A', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '1', mark: 'M-2', pos: '1', qty: 3, material: 'A36', cutLength: 1400 },
  { id: 'IMPACT-FILE-CONFLICT-B', projectId: 'PROJECT-REV', drawing: 'D-REV', revision: '2', mark: 'M-2', pos: '1', qty: 4, material: 'A36', cutLength: 1500 },
];
const conflictingInsideFileImpact = await analyzeImportImpact(conflictingInsideFileItems, { projectId: 'PROJECT-REV' });
assert.deepEqual(
  conflictingInsideFileImpact.conflictingRowsInsideFile.map((entry) => entry.newItem.id),
  ['IMPACT-FILE-CONFLICT-A', 'IMPACT-FILE-CONFLICT-B'],
);
assert.deepEqual(conflictingInsideFileImpact.brandNew, []);
assert.deepEqual(conflictingInsideFileImpact.revisions, []);
assert.deepEqual(conflictingInsideFileImpact.duplicates, []);
assert.deepEqual(conflictingInsideFileImpact.sameRevisionChanged, []);
assert.deepEqual(conflictingInsideFileImpact.olderRevisions, []);
assert.deepEqual(conflictingInsideFileImpact.unknownRevisions, []);
assert.deepEqual(conflictingInsideFileImpact.toSupersede, []);
const conflictingInsideFilePlan = buildDefaultMtoImportPlan(
  conflictingInsideFileItems,
  conflictingInsideFileImpact,
);
assert.deepEqual(conflictingInsideFilePlan.itemsToImport, []);
assert.deepEqual(conflictingInsideFilePlan.itemsToSupersede, []);
assert.equal(
  (await getMtoItems({ includeSuperseded: true }))
    .some((item) => conflictingInsideFileItems.some((candidate) => candidate.id === item.id)),
  false,
  'conflicting rows analyzed inside one file must not be persisted',
);

await deleteMtoItem('IMPACT-EXISTING-UNKNOWN');
await deleteMtoItem('IMPACT-EXISTING-SAME');
await updateMtoItemsStatus(impact.toSupersede, MTO_ITEM_STATUS.SUPERSEDED);
assert.equal((await getMtoItems({ projectId: 'PROJECT-REV' })).length, 5);
assert.equal((await getMtoItems({ projectId: 'PROJECT-REV', includeSuperseded: true })).length, 6);
assert.equal((await getMtoItems({ status: MTO_ITEM_STATUS.SUPERSEDED })).length, 1);

const batches = await getAllMtoBatches();
assert.equal(batches.length, 4);

const batchItems = await getMtoItemsByBatch('BATCH-1');
assert.deepEqual(batchItems.map((item) => item.id), ['ITEM-1', 'ITEM-2', 'ITEM-INVALID']);

const allItems = await getMtoItems();
assert.equal(allItems.length, 9);

const invalidItems = await getMtoItems({ status: MTO_ITEM_STATUS.INVALID });
assert.equal(invalidItems.length, 1);
assert.equal(invalidItems[0].id, 'ITEM-INVALID');

const openItems = await getMtoItems({ status: MTO_ITEM_STATUS.OPEN });
assert.equal(openItems.length, 7);

const projectItems = await getMtoItems({ projectId: 'PROJECT-2' });
assert.equal(projectItems.length, 1);
assert.equal(projectItems[0].id, 'ITEM-3');

const matchedItems = await getMtoItems({ status: MTO_ITEM_STATUS.MATCHED });
assert.equal(matchedItems.length, 1);
assert.equal(matchedItems[0].projectId, 'PROJECT-2');

const identItems = await getMtoItems({ identCode: 'ID-1' });
assert.equal(identItems.length, 1);
assert.equal(identItems[0].id, 'ITEM-1');

const disciplineItems = await getMtoItems({ discipline: 'Piping' });
assert.equal(disciplineItems.length, 2);

const updated = await updateMtoItem('ITEM-1', { status: MTO_ITEM_STATUS.RESERVED, metadata: { reservedBy: 'test' } });
assert.equal(updated.status, MTO_ITEM_STATUS.RESERVED);
assert.deepEqual(updated.metadata, { reservedBy: 'test' });
assert.equal((await getMtoItems({ status: MTO_ITEM_STATUS.RESERVED })).length, 1);

const corrected = await updateMtoItem('ITEM-INVALID', {
  drawing: 'D-X',
  qty: 1,
  material: 'A36',
  cutLength: 900,
  requiredLength: 900,
  validationErrors: [],
  status: MTO_ITEM_STATUS.OPEN,
});
assert.equal(corrected.status, MTO_ITEM_STATUS.OPEN);
assert.equal((await getMtoItems({ status: MTO_ITEM_STATUS.INVALID })).length, 0);

const single = await createMtoItem({
  id: 'ITEM-SINGLE',
  projectId: 'PROJECT-3',
  drawing: 'D-3',
  mark: 'M-4',
  pos: 'P-4',
  qty: 2,
  material: 'A312',
  cutLength: 750,
  validationErrors: [],
});
assert.equal(single.id, 'ITEM-SINGLE');
assert.equal((await getMtoItems({ projectId: 'PROJECT-3' })).length, 1);

await deleteMtoItem('ITEM-SINGLE');
assert.equal((await getMtoItems({ projectId: 'PROJECT-3' })).length, 0);

await createMtoItem({ id: 'ITEM-DELETE-1', projectId: 'PROJECT-4', drawing: 'D-4', mark: 'M-5', pos: 'P-5', qty: 1, material: 'A36', cutLength: 300 });
await createMtoItem({ id: 'ITEM-DELETE-2', projectId: 'PROJECT-4', drawing: 'D-4', mark: 'M-6', pos: 'P-6', qty: 1, material: 'A36', cutLength: 400 });
await createMtoItem({ id: 'ITEM-KEEP', projectId: 'PROJECT-4', drawing: 'D-4', mark: 'M-7', pos: 'P-7', qty: 1, material: 'A36', cutLength: 500 });
await deleteMtoItems([]);
await deleteMtoItems(['ITEM-DELETE-1', 'ITEM-DELETE-2', 'DOES-NOT-EXIST']);
const remainingProject4 = await getMtoItems({ projectId: 'PROJECT-4' });
assert.deepEqual(remainingProject4.map((item) => item.id), ['ITEM-KEEP']);

await deleteMtoBatch('BATCH-1');
assert.equal((await getAllMtoBatches()).length, 3);
assert.equal((await getMtoItemsByBatch('BATCH-1')).length, 0);
assert.equal((await getMtoItemsByBatch('BATCH-2')).length, 1);

await clearMtoData();
assert.equal((await getAllMtoBatches()).length, 0);
assert.equal((await getMtoItems()).length, 0);

await createMtoItem({
  id: 'ATOMIC-SUPERSEDE-OLD', projectId: 'PROJECT-ATOMIC', drawing: 'D-A', revision: '0',
  mark: 'M-A', pos: '1', qty: 1, material: 'A36', cutLength: 500,
});
const atomicImport = await saveMtoImport({
  batch: { id: 'BATCH-ATOMIC', projectId: 'PROJECT-ATOMIC', rowCount: 1, acceptedCount: 1 },
  items: [{
    id: 'ATOMIC-SUPERSEDE-NEW', drawing: 'D-A', revision: '1', mark: 'M-A', pos: '1',
    qty: 1, material: 'A36', cutLength: 500,
  }],
  itemsToSupersede: ['ATOMIC-SUPERSEDE-OLD'],
});
assert.deepEqual(atomicImport.itemsToSupersede.map((item) => item.id), ['ATOMIC-SUPERSEDE-OLD']);
assert.equal(
  (await getMtoItems({ includeSuperseded: true })).find((item) => item.id === 'ATOMIC-SUPERSEDE-OLD').status,
  MTO_ITEM_STATUS.SUPERSEDED,
);

const largeItems = Array.from({ length: 1000 }, (_, index) => ({
  id: `LARGE-${index + 1}`,
  drawing: 'D-LARGE',
  mark: `M-${index + 1}`,
  pos: String(index + 1),
  qty: 1,
  material: 'A36',
  cutLength: 1000 + index,
  sourceRowNumber: index + 2,
}));
const largeImport = await saveMtoImport({
  batch: { id: 'BATCH-LARGE', projectId: 'PROJECT-LARGE', rowCount: 1000, acceptedCount: 1000 },
  items: largeItems,
});
assert.equal(largeImport.items.length, 1000);
assert.equal((await getMtoItemsByBatch('BATCH-LARGE')).length, 1000);

await createMtoItem({
  id: 'ROLLBACK-OLD', projectId: 'PROJECT-LARGE', drawing: 'D-R', revision: '0',
  mark: 'M-R', pos: '1', qty: 1, material: 'A36', cutLength: 500,
});
indexedDBControl.failNextPut('mtoItems', 'ROLLBACK-OLD');
await assert.rejects(
  saveMtoImport({
    batch: { id: 'BATCH-ROLLBACK', projectId: 'PROJECT-LARGE', rowCount: 1, acceptedCount: 1 },
    items: [{ id: 'ROLLBACK-ITEM', drawing: 'D-R', mark: 'M-R', pos: '1', qty: 1, material: 'A36', cutLength: 500 }],
    itemsToSupersede: ['ROLLBACK-OLD'],
  }),
  (error) => error.code === 'MTO_IMPORT_QUOTA_EXCEEDED'
    && error.cause?.name === 'QuotaExceededError',
);
assert.equal((await getAllMtoBatches()).some((batch) => batch.id === 'BATCH-ROLLBACK'), false);
assert.equal((await getMtoItems({ includeSuperseded: true })).some((item) => item.id === 'ROLLBACK-ITEM'), false);
assert.equal(
  (await getMtoItems({ includeSuperseded: true })).find((item) => item.id === 'ROLLBACK-OLD').status,
  MTO_ITEM_STATUS.OPEN,
);

console.log('mtoDB tests passed');
