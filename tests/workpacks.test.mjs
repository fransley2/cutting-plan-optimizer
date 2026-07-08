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

async function assertRejectsRequired(createWorkpack, patch, message) {
  await assert.rejects(
    () => createWorkpack(patch),
    (error) => error instanceof Error && error.message === message,
  );
}

installIndexedDB();

const {
  createWorkpack,
  updateWorkpack,
  deleteWorkpack,
  getWorkpack,
  listWorkpacks,
} = await import('../src/data/workpacks.js');

await assertRejectsRequired(
  createWorkpack,
  { equipmentId: 'EQ-1', wpNo: 'WP-001' },
  'projectId is required to create a workpack.',
);
await assertRejectsRequired(
  createWorkpack,
  { projectId: 'PROJECT-1', wpNo: 'WP-001' },
  'equipmentId is required to create a workpack.',
);
await assertRejectsRequired(
  createWorkpack,
  { projectId: 'PROJECT-1', equipmentId: 'EQ-1' },
  'wpNo is required to create a workpack.',
);

const input = {
  projectId: 'PROJECT-1',
  equipmentId: 'EQ-1',
  drawingId: 'DWG-1',
  wpNo: 'WP-001',
  title: 'Pipe rack fabrication',
  description: 'Primary pipe rack workpack',
  discipline: 'Structural',
  plannedStart: '2026-01-01',
  plannedFinish: '2026-02-01',
};
const before = JSON.stringify(input);
const created = await createWorkpack(input);

assert.equal(JSON.stringify(input), before, 'createWorkpack mutated input');
assert.ok(created.id, 'created workpack should have id');
assert.equal(created.status, 'PLANNED');
assert.equal(created.projectId, 'PROJECT-1');
assert.equal(created.equipmentId, 'EQ-1');
assert.equal(created.drawingId, 'DWG-1');
assert.deepEqual(created.drawingIds, ['DWG-1']);
assert.equal(created.wpNo, 'WP-001');
assert.equal(typeof created.createdAt, 'string');
assert.equal(typeof created.updatedAt, 'string');

const fetched = await getWorkpack(created.id);
assert.equal(fetched.id, created.id, 'getWorkpack should fetch by id');

const updated = await updateWorkpack(created.id, {
  title: 'Pipe rack fabrication updated',
  status: 'ACTIVE',
});
assert.equal(updated.title, 'Pipe rack fabrication updated', 'updateWorkpack should update title');
assert.equal(updated.status, 'ACTIVE', 'updateWorkpack should update status');
assert.equal(updated.drawingId, 'DWG-1', 'updateWorkpack should preserve drawingId');
assert.equal(updated.createdAt, created.createdAt, 'updateWorkpack should preserve createdAt');

await assert.rejects(
  () => updateWorkpack(created.id, { wpNo: '' }),
  /wpNo is required to update a workpack\./,
);

await createWorkpack({
  projectId: 'PROJECT-2',
  equipmentId: 'EQ-2',
  drawingId: 'DWG-2',
  wpNo: 'WP-002',
  title: 'Compressor workpack',
  status: 'CLOSED',
});

const projectOne = await listWorkpacks({ projectId: 'PROJECT-1' });
assert.equal(projectOne.length, 1, 'listWorkpacks should filter by projectId');
assert.equal(projectOne[0].id, created.id);

const equipmentTwo = await listWorkpacks({ equipmentId: 'EQ-2' });
assert.equal(equipmentTwo.length, 1, 'listWorkpacks should filter by equipmentId');
assert.equal(equipmentTwo[0].wpNo, 'WP-002');

const drawingTwo = await listWorkpacks({ drawingId: 'DWG-2' });
assert.equal(drawingTwo.length, 1, 'listWorkpacks should filter by drawingId');
assert.equal(drawingTwo[0].wpNo, 'WP-002');

const closed = await listWorkpacks({ status: 'CLOSED' });
assert.equal(closed.length, 1, 'listWorkpacks should filter by status');
assert.equal(closed[0].equipmentId, 'EQ-2');

const invalidStatus = await createWorkpack({
  projectId: 'PROJECT-3',
  equipmentId: 'EQ-3',
  drawingIds: ['DWG-3A', 'DWG-3B'],
  wpNo: 'WP-003',
  status: 'bad-status',
});
assert.equal(invalidStatus.status, 'PLANNED', 'invalid status should fall back to PLANNED');

const drawingArrayMatch = await listWorkpacks({ drawingId: 'DWG-3B' });
assert.equal(drawingArrayMatch.length, 1, 'listWorkpacks should match drawingIds arrays');
assert.equal(drawingArrayMatch[0].id, invalidStatus.id);

const legacyWithoutDrawing = await createWorkpack({
  projectId: 'PROJECT-4',
  equipmentId: 'EQ-4',
  wpNo: 'WP-004',
});
assert.equal(legacyWithoutDrawing.drawingId, '', 'data layer should keep compatibility with workpacks without drawing');
assert.deepEqual(legacyWithoutDrawing.drawingIds, []);

await deleteWorkpack(created.id);
assert.equal(await getWorkpack(created.id), null, 'deleteWorkpack should remove by id');

console.log('workpacks tests passed');
