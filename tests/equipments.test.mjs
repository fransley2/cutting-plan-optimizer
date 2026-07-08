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

const {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getEquipment,
  listEquipments,
} = await import('../src/data/equipments.js');

const input = {
  projectId: 'PROJECT-1',
  code: 'EQ-001',
  name: 'Pump Skid',
  clientTag: 'P-1001',
  discipline: 'Mechanical',
  description: 'Main pump skid',
};
const before = JSON.stringify(input);
const created = await createEquipment(input);

assert.equal(JSON.stringify(input), before, 'createEquipment mutated input');
assert.ok(created.id, 'created equipment should have id');
assert.equal(created.status, 'ACTIVE');
assert.equal(created.projectId, 'PROJECT-1');
assert.equal(created.code, 'EQ-001');
assert.equal(typeof created.createdAt, 'string');
assert.equal(typeof created.updatedAt, 'string');

const fetched = await getEquipment(created.id);
assert.equal(fetched.id, created.id, 'getEquipment should fetch by id');

const updated = await updateEquipment(created.id, {
  name: 'Pump Skid Updated',
  status: 'HOLD',
});
assert.equal(updated.name, 'Pump Skid Updated', 'updateEquipment should update name');
assert.equal(updated.status, 'HOLD', 'updateEquipment should update status');
assert.equal(updated.createdAt, created.createdAt, 'updateEquipment should preserve createdAt');

await createEquipment({
  projectId: 'PROJECT-2',
  code: 'EQ-002',
  name: 'Compressor',
  status: 'INACTIVE',
});

const projectOne = await listEquipments({ projectId: 'PROJECT-1' });
assert.equal(projectOne.length, 1, 'listEquipments should filter by projectId');
assert.equal(projectOne[0].id, created.id);

const inactive = await listEquipments({ status: 'INACTIVE' });
assert.equal(inactive.length, 1, 'listEquipments should filter by status');
assert.equal(inactive[0].code, 'EQ-002');

const invalidStatus = await createEquipment({
  projectId: 'PROJECT-3',
  code: 'EQ-003',
  name: 'Invalid status equipment',
  status: 'bad-status',
});
assert.equal(invalidStatus.status, 'ACTIVE', 'invalid status should fall back to ACTIVE');

await deleteEquipment(created.id);
assert.equal(await getEquipment(created.id), null, 'deleteEquipment should remove by id');

console.log('equipments tests passed');
