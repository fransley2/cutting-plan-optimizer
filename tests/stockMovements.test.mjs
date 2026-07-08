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

const {
  STOCK_MOVEMENT_TYPES,
  createStockMovement,
  getAllStockMovements,
  getStockMovements,
  getStockMovementsForInventoryItem,
  clearStockMovements,
} = await import('../src/data/stockMovements.js');

await clearStockMovements();

const input = {
  movementType: STOCK_MOVEMENT_TYPES.IMPORT_INVENTORY,
  inventoryItemId: 'TRACE-1',
  projectId: 'PROJECT-1',
  timestamp: '2026-01-02T10:00:00.000Z',
  quantityDelta: '2',
  lengthDelta: '12000',
  metadata: { source: 'test' },
};
const before = JSON.stringify(input);
const created = await createStockMovement(input);

assert.equal(created.movementType, STOCK_MOVEMENT_TYPES.IMPORT_INVENTORY);
assert.equal(created.quantityDelta, 2);
assert.equal(created.lengthDelta, 12000);
assert.equal(JSON.stringify(input), before);

await createStockMovement({
  movementType: STOCK_MOVEMENT_TYPES.RESERVE_STOCK,
  inventoryItemId: 'TRACE-2',
  projectId: 'PROJECT-2',
  timestamp: '2026-01-03T10:00:00.000Z',
  quantityDelta: 'invalid',
  lengthDelta: Number.NaN,
});

const allMovements = await getAllStockMovements();
assert.equal(allMovements.length, 2);
assert.equal(allMovements[0].projectId, 'PROJECT-2');
assert.equal(allMovements[0].quantityDelta, 0);
assert.equal(allMovements[0].lengthDelta, 0);

const inventoryMovements = await getStockMovementsForInventoryItem('TRACE-1');
assert.equal(inventoryMovements.length, 1);
assert.equal(inventoryMovements[0].projectId, 'PROJECT-1');

const projectMovements = await getStockMovements({ projectId: 'PROJECT-2' });
assert.equal(projectMovements.length, 1);
assert.equal(projectMovements[0].inventoryItemId, 'TRACE-2');

const typeMovements = await getStockMovements({ movementType: STOCK_MOVEMENT_TYPES.RESERVE_STOCK });
assert.equal(typeMovements.length, 1);
assert.equal(typeMovements[0].projectId, 'PROJECT-2');

const invalidDateMovements = await getStockMovements({ from: 'not-a-date', to: 'also-invalid' });
assert.equal(invalidDateMovements.length, 2);

await clearStockMovements();
assert.equal((await getAllStockMovements()).length, 0);

console.log('stockMovements tests passed');
