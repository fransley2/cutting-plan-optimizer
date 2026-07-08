import assert from 'node:assert/strict';

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function requestSuccess(result) {
  const request = { result, error: null };
  setTimeout(() => request.onsuccess?.({ target: request }), 0);
  return request;
}

function installIndexedDB() {
  const databases = new Map();

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
          transaction(storeName) {
            const storeState = state.stores.get(storeName);
            const tx = {
              objectStore() {
                return {
                  getAll: () => requestSuccess([...storeState.records.values()].map(clone)),
                  get: (key) => requestSuccess(clone(storeState.records.get(key) || null)),
                  put(value) {
                    if (storeName === 'auditEvents') {
                      tx.error = new Error('audit failure');
                      setTimeout(() => tx.onerror?.(), 0);
                      return;
                    }
                    storeState.records.set(value[storeState.keyPath], clone(value));
                    setTimeout(() => tx.oncomplete?.(), 0);
                  },
                  delete(key) {
                    storeState.records.delete(key);
                    setTimeout(() => tx.oncomplete?.(), 0);
                  },
                  clear() {
                    storeState.records.clear();
                    setTimeout(() => tx.oncomplete?.(), 0);
                  },
                };
              },
            };
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
}

installIndexedDB();
const auditWarnings = [];
const originalWarn = console.warn;
console.warn = (...args) => auditWarnings.push(args);

const {
  MTO_ITEM_STATUS,
  createMtoItem,
  saveMtoImport,
  getAllMtoBatches,
  getMtoItems,
  getMtoItemsByBatch,
  updateMtoItem,
  deleteMtoItem,
  deleteMtoItems,
  deleteMtoBatch,
  clearMtoData,
} = await import('../src/data/mtoDB.js');

await clearMtoData();

const importResult = await saveMtoImport({
  batch: {
    id: 'BATCH-1',
    projectId: 'PROJECT-1',
    fileName: 'mto.xlsx',
    rowCount: 3,
    acceptedCount: 2,
    rejectedCount: 1,
  },
  items: [
    { id: 'ITEM-2', drawing: 'D-1', mark: 'M-2', pos: 'P-2', qty: 1, material: 'A36', cutLength: 2000, sourceRowNumber: 2, identCode: 'ID-2', discipline: 'Piping', type: 'Pipe' },
    { id: 'ITEM-1', drawing: 'D-1', mark: 'M-1', pos: 'P-1', qty: 1, material: 'A36', cutLength: 1000, sourceRowNumber: 1, identCode: 'ID-1', discipline: 'Piping', type: 'Pipe' },
    { id: 'ITEM-INVALID', drawing: '', mark: 'M-X', pos: 'P-X', qty: 0, material: '', cutLength: 0, sourceRowNumber: 3, status: MTO_ITEM_STATUS.INVALID, validationErrors: ['Missing drawing'] },
  ],
});
assert.equal(auditWarnings.length, 1);
assert.equal(importResult.batch.id, 'BATCH-1');
assert.equal(importResult.items.length, 3);
assert.equal(importResult.items[0].batchId, 'BATCH-1');
assert.equal(importResult.items[0].projectId, 'PROJECT-1');

await saveMtoImport({
  batch: { id: 'BATCH-2', projectId: 'PROJECT-2', rowCount: 1, acceptedCount: 1 },
  items: [
    { id: 'ITEM-3', drawing: 'D-2', mark: 'M-3', pos: 'P-3', qty: 1, material: 'A106', cutLength: 500, sourceRowNumber: 1, status: MTO_ITEM_STATUS.MATCHED, identCode: 'ID-3', discipline: 'Structure', type: 'Beam' },
  ],
});
assert.equal(auditWarnings.length, 2);

const batches = await getAllMtoBatches();
assert.equal(batches.length, 2);

const batchItems = await getMtoItemsByBatch('BATCH-1');
assert.deepEqual(batchItems.map((item) => item.id), ['ITEM-1', 'ITEM-2', 'ITEM-INVALID']);

const allItems = await getMtoItems();
assert.equal(allItems.length, 4);

const invalidItems = await getMtoItems({ status: MTO_ITEM_STATUS.INVALID });
assert.equal(invalidItems.length, 1);
assert.equal(invalidItems[0].id, 'ITEM-INVALID');

const openItems = await getMtoItems({ status: MTO_ITEM_STATUS.OPEN });
assert.equal(openItems.length, 2);

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
assert.equal((await getAllMtoBatches()).length, 1);
assert.equal((await getMtoItemsByBatch('BATCH-1')).length, 0);
assert.equal((await getMtoItemsByBatch('BATCH-2')).length, 1);

await clearMtoData();
assert.equal((await getAllMtoBatches()).length, 0);
assert.equal((await getMtoItems()).length, 0);
console.warn = originalWarn;

console.log('mtoDB tests passed');
