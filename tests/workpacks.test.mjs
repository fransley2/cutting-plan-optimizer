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
const { listWorkpackLinks, replaceWorkpackTargetLinks } = await import('../src/data/workpackLinks.js');

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
assert.equal('drawingId' in created, false, 'Drawing ownership should be persisted in workpackLinks');
assert.equal('drawingIds' in created, false, 'relationship arrays should not be persisted on Workpack records');
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
assert.equal(updated.status, 'IN_FABRICATION', 'legacy ACTIVE should normalize to IN_FABRICATION');
assert.equal('drawingId' in updated, false, 'updateWorkpack should keep relationships out of the Workpack record');
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

const closed = await listWorkpacks({ status: 'CLOSED' });
assert.equal(closed.length, 1, 'listWorkpacks should filter by status');
assert.equal(closed[0].equipmentId, 'EQ-2');

const invalidStatus = await createWorkpack({
  projectId: 'PROJECT-3',
  equipmentId: 'EQ-3',
  drawingId: 'DWG-3A',
  wpNo: 'WP-003',
  status: 'bad-status',
});
assert.equal(invalidStatus.status, 'DRAFT', 'invalid status should fall back to DRAFT');

const legacyWithoutDrawing = await createWorkpack({
  projectId: 'PROJECT-4',
  equipmentId: 'EQ-4',
  wpNo: 'WP-004',
});
assert.equal('drawingId' in legacyWithoutDrawing, false, 'Drawing relationship is not stored on Workpack');
assert.equal('drawingIds' in legacyWithoutDrawing, false);

const materialOwner = await createWorkpack({
  projectId: 'PROJECT-5', equipmentId: 'EQ-5', wpNo: 'WP-005', inventoryItemIds: ['TRACE-001'],
});
const independent = await createWorkpack({
  projectId: 'PROJECT-6', equipmentId: 'EQ-6', wpNo: 'WP-006', inventoryItemIds: ['TRACE-001'],
});
assert.equal('inventoryItemIds' in materialOwner, false, 'legacy relationship input should not be persisted');
assert.equal('inventoryItemIds' in independent, false, 'Inventory ownership is enforced by workpackLinks');
await updateWorkpack(materialOwner.id, { title: 'Unrelated update remains valid' });

await replaceWorkpackTargetLinks({ projectId: materialOwner.projectId, workpackId: materialOwner.id, targetType: 'INVENTORY_ITEM', targetIds: ['TRACE-001'] });
await assert.rejects(
  () => replaceWorkpackTargetLinks({ projectId: independent.projectId, workpackId: independent.id, targetType: 'INVENTORY_ITEM', targetIds: ['TRACE-001'] }),
  (error) => error?.code === 'WORKPACK_INVENTORY_ITEM_CONFLICT',
);
await replaceWorkpackTargetLinks({ projectId: materialOwner.projectId, workpackId: materialOwner.id, targetType: 'INVENTORY_ITEM', targetIds: [] });
assert.equal((await listWorkpackLinks({ workpackId: materialOwner.id, targetType: 'INVENTORY_ITEM', status: 'ACTIVE' })).length, 0);

const overridden = await updateWorkpack(created.id, { manualProgress: 45, progressOverrideReason: 'Approved field update' });
assert.equal(overridden.manualProgress, 45);
assert.equal(overridden.progressOverrideReason, 'Approved field update');
const overrideCleared = await updateWorkpack(created.id, { manualProgress: null, progressOverrideReason: '' });
assert.equal(overrideCleared.manualProgress, null, 'clearing the override should persist null');
assert.equal(overrideCleared.progressOverrideReason, '', 'clearing the override should clear its reason');

await deleteWorkpack(created.id);
assert.equal(await getWorkpack(created.id), null, 'deleteWorkpack should remove by id');

console.log('workpacks tests passed');
