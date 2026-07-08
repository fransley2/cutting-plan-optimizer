import { parseInventoryRows, mapInventoryItemToStockRow } from '../src/data/inventoryImport.js';

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
          objectStoreNames: { contains: (storeName) => state.stores.has(storeName) },
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

const rows = [
  ['Traceability', 'Category', 'PO', 'Item', 'Qty', 'Length', 'Material', 'Heat', 'Desc', 'Ref F', 'Ref G', 'Ref H'],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['T-101', 'Pipe', 'PO-1', 'IT-1', '3', '6000', 'A36', 'H1', 'Pipe', 'R1', 'R2', 'R3'],
];

const items = parseInventoryRows(rows);
if (items.length !== 1) throw new Error('Expected 1 parsed inventory item');
if (items[0].trace !== 'T-101') throw new Error('Traceability mapping failed');
if (items[0].qty !== 3) throw new Error('Qty mapping failed');

const stockRow = mapInventoryItemToStockRow(items[0]);
if (stockRow.qty !== 3 || stockRow.length !== 6000) throw new Error('Stock row mapping failed');

installIndexedDB();
const {
  getInventoryItems,
  getAllInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  deleteInventoryItems,
  clearInventoryItems,
} = await import('../src/data/inventoryDB.js');

await clearInventoryItems();

const original = { trace: 'INV-1', material: 'A106', length: 6000, heat: 'H1', status: 'available', notes: 'keep' };
const before = JSON.stringify(original);
const created = await createInventoryItem(original);
if (created.trace !== 'INV-1') throw new Error('createInventoryItem did not preserve trace');
if (JSON.stringify(original) !== before) throw new Error('createInventoryItem mutated input');
if ((await getInventoryItems()).length !== 1) throw new Error('createInventoryItem did not save item');
if ((await getAllInventoryItems()).length !== 1) throw new Error('getAllInventoryItems alias failed');

await createInventoryItem({ trace: 'INV-2', material: 'A36', length: 3000, heat: 'H2', status: 'available' });
const updated = await updateInventoryItem('INV-1', { status: 'reserved' });
if (updated.status !== 'reserved') throw new Error('updateInventoryItem did not update status');
if (updated.notes !== 'keep') throw new Error('updateInventoryItem did not preserve unrelated fields');
const afterUpdate = await getInventoryItems();
if (afterUpdate.find((item) => item.trace === 'INV-2').status !== 'available') throw new Error('updateInventoryItem updated unrelated item');

await deleteInventoryItem('INV-2');
if ((await getInventoryItems()).some((item) => item.trace === 'INV-2')) throw new Error('deleteInventoryItem failed');

await createInventoryItem({ trace: 'INV-3', material: 'A312', length: 2000 });
await createInventoryItem({ trace: 'INV-4', material: 'A333', length: 2500 });
await createInventoryItem({ trace: 'INV-KEEP', material: 'A516', length: 4000 });
await deleteInventoryItems([]);
await deleteInventoryItems(['INV-3', 'INV-4', 'DOES-NOT-EXIST']);
const remaining = await getInventoryItems();
if (!remaining.some((item) => item.trace === 'INV-KEEP')) throw new Error('deleteInventoryItems deleted unrelated item');
if (remaining.some((item) => item.trace === 'INV-3' || item.trace === 'INV-4')) throw new Error('deleteInventoryItems did not delete provided ids');

await clearInventoryItems();
if ((await getInventoryItems()).length !== 0) throw new Error('clearInventoryItems failed');

console.log('inventory import/db tests passed');
