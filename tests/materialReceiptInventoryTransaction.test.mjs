import assert from 'node:assert/strict';

function clone(value) { return value == null ? value : structuredClone(value); }

function installIndexedDB() {
  const databases = new Map();
  globalThis.indexedDB = {
    open(name, version) {
      const request = { result: null, error: null };
      setTimeout(() => {
        let state = databases.get(name);
        const oldVersion = state?.version || 0;
        if (!state) { state = { version, stores: new Map() }; databases.set(name, state); }
        state.version = Math.max(state.version, version);
        const db = {
          objectStoreNames: { contains: (storeName) => state.stores.has(storeName) },
          createObjectStore(storeName, options) {
            const storeState = { keyPath: options.keyPath, records: new Map(), indexes: new Set() };
            state.stores.set(storeName, storeState);
            return { createIndex: (indexName) => storeState.indexes.add(indexName) };
          },
          deleteObjectStore: (storeName) => state.stores.delete(storeName),
          transaction(storeNames) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const snapshots = new Map(names.map((storeName) => [storeName, new Map(state.stores.get(storeName).records)]));
            let pending = 0; let queued = false; let aborted = false;
            const tx = {
              error: null,
              objectStore(storeName) {
                const store = state.stores.get(storeName);
                const run = (operation) => {
                  const req = { result: undefined, error: null };
                  pending += 1;
                  setTimeout(() => {
                    if (aborted) return;
                    try { req.result = operation(); req.onsuccess?.({ target: req }); }
                    catch (error) { req.error = error; tx.error = error; req.onerror?.({ target: req }); tx.onerror?.({ target: tx }); }
                    finally { pending -= 1; queueCompletion(); }
                  }, 0);
                  return req;
                };
                return {
                  getAll: () => run(() => [...store.records.values()].map(clone)),
                  get: (key) => run(() => clone(store.records.get(key) || null)),
                  put: (value) => run(() => { store.records.set(value[store.keyPath], clone(value)); return value[store.keyPath]; }),
                  delete: (key) => run(() => store.records.delete(key)),
                  clear: () => run(() => store.records.clear()),
                };
              },
              abort() {
                if (aborted) return;
                aborted = true;
                snapshots.forEach((records, storeName) => { state.stores.get(storeName).records = new Map(records); });
                setTimeout(() => tx.onabort?.({ target: tx }), 0);
              },
            };
            function queueCompletion() {
              if (aborted || pending || queued) return;
              queued = true;
              setTimeout(() => { queued = false; if (!aborted && pending === 0) tx.oncomplete?.({ target: tx }); }, 0);
            }
            setTimeout(queueCompletion, 0);
            return tx;
          },
          close() {},
        };
        request.result = db;
        if (version > oldVersion) request.onupgradeneeded?.({ target: request, oldVersion });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

installIndexedDB();

const { getDB } = await import('../src/data/database.js');
const { idbGet, idbGetAll, idbPut } = await import('../src/data/idb.js');
const { updateReceivedMaterialUnit } = await import('../src/data/materialReceipts.js');

const db = await getDB();
await idbPut(db, 'materialUnits', {
  id: 'UNIT-1', projectId: 'P-1', poItemId: 'POI-1', receiptLineId: 'LINE-1', supplierId: 'SUP-1',
  traceability: 'GBD100-1-001', heatNumber: 'H-OLD', quantity: 8, originalLengthMm: 6000,
  inventoryItemId: 'GBD100-1-001', postingStatus: 'POSTED', inventoryStatus: 'IN_INVENTORY',
});
await idbPut(db, 'inventory', {
  id: 'GBD100-1-001', trace: 'GBD100-1-001', traceability: 'GBD100-1-001', projectId: 'P-1',
  heatNo: 'H-OLD', qty: 8, receivedQty: 8, balanceQty: 6, lengthMm: 6000, status: 'available',
});

const saved = await updateReceivedMaterialUnit('UNIT-1', {
  materialUnitPatch: { heatNumber: 'H-NEW', quantity: 10, originalLengthMm: 12000, storageLocationId: 'YARD-A' },
}, { userName: 'Receiver' });

assert.equal(saved.materialUnit.quantity, 10);
assert.equal(saved.inventoryItem.qty, 10);
assert.equal(saved.inventoryItem.balanceQty, 8, 'quantity adjustment must preserve the two already-used pieces');
assert.equal(saved.inventoryItem.heatNo, 'H-NEW');
assert.equal(saved.inventoryItem.lengthMm, 12000);
assert.equal((await idbGet(db, 'materialUnits', 'UNIT-1')).storageLocationId, 'YARD-A');
assert.equal((await idbGet(db, 'inventory', 'GBD100-1-001')).location, 'YARD-A');
assert.equal((await idbGetAll(db, 'stockMovements')).length, 1);
assert.equal((await idbGetAll(db, 'auditLog')).length, 1);
assert.equal((await idbGetAll(db, 'auditEvents')).length, 1);

await assert.rejects(
  updateReceivedMaterialUnit('UNIT-1', { materialUnitPatch: { traceability: 'GBD100-1-999' } }),
  /cannot be changed/i,
);
assert.equal((await idbGet(db, 'materialUnits', 'UNIT-1')).traceability, 'GBD100-1-001');
assert.equal((await idbGet(db, 'inventory', 'GBD100-1-001')).trace, 'GBD100-1-001');

console.log('material receipt and Inventory transaction tests passed');
