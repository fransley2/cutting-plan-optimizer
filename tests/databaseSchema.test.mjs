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
        const oldVersion = state?.version || 0;
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
        if (isUpgrade) request.onupgradeneeded?.({ target: request, oldVersion });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

installIndexedDB();

const { getDB } = await import('../src/data/database.js');
const { idbPut, idbGet } = await import('../src/data/idb.js');

const db = await getDB();

[
  'inventory',
  'plans',
  'settings',
  'projects',
  'mtoItems',
  'cuttingPackages',
  'materialCoupons',
  'cuttingSheets',
  'returnMaterialVouchers',
  'offcuts',
  'auditLog',
  'equipments',
  'workpacks',
  'drawings',
  'documentTemplates',
].forEach((storeName) => {
  assert.equal(db.objectStoreNames.contains(storeName), true, `${storeName} store is missing`);
});

await idbPut(db, 'inventory', { trace: 'SCHEMA-KEEP', material: 'A106' });
const reopened = await getDB();
const kept = await idbGet(reopened, 'inventory', 'SCHEMA-KEEP');

assert.equal(kept.material, 'A106');

console.log('databaseSchema tests passed');
