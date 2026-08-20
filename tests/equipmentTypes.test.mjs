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
  createEquipmentType,
  updateEquipmentType,
  deleteEquipmentType,
  getEquipmentType,
  isEquipmentTypeInUse,
  purgeRetiredEquipmentTypes,
  listEquipmentTypes,
  normalizeEquipmentTypeName,
  seedEquipmentTypes,
} = await import('../src/data/equipmentTypes.js');
const { createEquipment, listEquipments } = await import('../src/data/equipments.js');
const { getDB } = await import('../src/data/database.js');
const { idbPut } = await import('../src/data/idb.js');

assert.equal(normalizeEquipmentTypeName('plem module'), 'PLEM MODULE');

const seeded = await seedEquipmentTypes();
assert.ok(seeded.length >= 30, 'seedEquipmentTypes should create common offshore types');
assert.equal((await seedEquipmentTypes()).length, seeded.length, 'seedEquipmentTypes should not duplicate records');
assert.ok(seeded.some((type) => type.scopeType === 'INCORPORATED'), 'seed should include incorporated types');
assert.ok(seeded.some((type) => type.scopeType === 'NOT_INCORPORATED'), 'seed should include not incorporated types');
assert.ok(seeded.some((type) => type.name === 'JUMPER'), 'seed should include the physical jumper type');
assert.ok(seeded.some((type) => type.name === 'SPOOL'), 'seed should include the physical spool type');
assert.equal(seeded.some((type) => type.name === 'PRODUCTION JUMPER'), false, 'service should not be embedded in Equipment Type');
assert.equal(seeded.some((type) => type.name === 'GAS INJECTION SPOOL'), false, 'service should not be embedded in Equipment Type');
assert.equal(seeded.some((type) => type.name === 'JUMPER LIQUID'), false, 'seed should not include the retired placeholder');

const legacyCompositeType = await createEquipmentType({
  name: 'production jumper',
  code: 'jmp-prod',
  equipmentClass: 'jumper',
});
const db = await getDB();
await idbPut(db, 'equipments', {
  id: 'LEGACY-PRODUCTION-JUMPER',
  projectId: 'PROJECT-MIGRATION',
  equipmentTypeId: legacyCompositeType.id,
  equipmentType: 'PRODUCTION JUMPER',
  system: '',
  fieldLocation: 'KBD DW',
  variant: 'TYPE 1',
  equipmentName: 'KBD DW · PRODUCTION JUMPER · TYPE 1',
  name: 'KBD DW · PRODUCTION JUMPER · TYPE 1',
  code: 'KBD-DW-PRODUCTION-JUMPER-TYPE-1',
  plannedQuantity: 1,
  equipmentTags: [],
  status: 'ACTIVE',
});

await seedEquipmentTypes();
const migratedEquipment = (await listEquipments({ projectId: 'PROJECT-MIGRATION' }))[0];
const canonicalJumperType = (await listEquipmentTypes({})).find((type) => type.name === 'JUMPER' && !type.projectId);
assert.equal(migratedEquipment.equipmentType, 'JUMPER');
assert.equal(migratedEquipment.system, 'PRODUCTION');
assert.equal(migratedEquipment.equipmentTypeId, canonicalJumperType.id);
assert.equal(migratedEquipment.equipmentName, 'KBD DW · PRODUCTION · JUMPER · TYPE 1');
assert.equal(await getEquipmentType(legacyCompositeType.id), null, 'legacy composite catalog type should be removed after migration');

const projectType = await createEquipmentType({
  name: 'chemical injection skid',
  code: 'cis',
  equipmentClass: 'skid',
  scopeType: 'non incorporate',
  discipline: 'piping',
  projectId: 'PROJECT-1',
  description: 'Project specific chemical injection skid',
  sortOrder: 999,
});

assert.ok(projectType.id, 'created type should have id');
assert.equal(projectType.name, 'CHEMICAL INJECTION SKID');
assert.equal(projectType.code, 'CIS');
assert.equal(projectType.equipmentClass, 'SKID');
assert.equal(projectType.category, 'SKID');
assert.equal(projectType.scopeType, 'NOT_INCORPORATED');
assert.equal(projectType.status, 'ACTIVE');
assert.equal(projectType.projectId, 'PROJECT-1');
assert.equal(typeof projectType.createdAt, 'string');
assert.equal(typeof projectType.updatedAt, 'string');

const fetched = await getEquipmentType(projectType.id);
assert.equal(fetched.name, 'CHEMICAL INJECTION SKID');

const visibleForProject = await listEquipmentTypes({ projectId: 'PROJECT-1' });
assert.ok(visibleForProject.some((type) => type.name === 'CHEMICAL INJECTION SKID'), 'project filter should include project type');
assert.ok(visibleForProject.some((type) => type.projectId === ''), 'project filter should include global types');

const visibleForOtherProject = await listEquipmentTypes({ projectId: 'PROJECT-2' });
assert.equal(visibleForOtherProject.some((type) => type.id === projectType.id), false, 'project filter should exclude other project-specific types');

const updated = await updateEquipmentType(projectType.id, { description: 'Updated description' });
assert.equal(updated.description, 'Updated description');
assert.equal(updated.createdAt, projectType.createdAt, 'update should preserve createdAt');

await createEquipment({
  projectId: 'PROJECT-1',
  code: 'EQ-100',
  name: 'Equipment using type',
  equipmentType: 'chemical injection skid',
});

assert.equal(await isEquipmentTypeInUse('CHEMICAL INJECTION SKID'), true, 'type should be reported as in use');
await assert.rejects(
  () => deleteEquipmentType(projectType.id),
  /Equipment type is used/,
  'delete should be blocked when type is used by equipment',
);

const unused = await createEquipmentType({ name: 'Temporary frame', code: 'TMP', category: 'temporary' });
assert.equal(await deleteEquipmentType(unused.id), true, 'unused type should be deleted');
assert.equal(await getEquipmentType(unused.id), null);

const retiredType = await createEquipmentType({
  name: 'jumper liquid',
  code: 'jmp-liq',
  equipmentClass: 'jumper',
  projectId: 'PROJECT-1',
});
const retiredEquipment = await createEquipment({
  projectId: 'PROJECT-1',
  code: 'EQ-PLACEHOLDER',
  name: 'Placeholder equipment',
  equipmentTypeId: retiredType.id,
  equipmentType: 'jumper liquid',
});

const purgeResult = await purgeRetiredEquipmentTypes();
assert.deepEqual(purgeResult.equipmentTypeIds, [retiredType.id]);
assert.deepEqual(purgeResult.equipmentIds, [retiredEquipment.id]);
assert.equal(purgeResult.equipmentTypeCount, 1);
assert.equal(purgeResult.equipmentCount, 1);
assert.equal((await listEquipmentTypes({})).some((type) => type.name === 'JUMPER LIQUID'), false);
assert.equal((await listEquipments({})).some((equipment) => equipment.id === retiredEquipment.id), false);
assert.deepEqual(await purgeRetiredEquipmentTypes(), {
  equipmentTypeIds: [],
  equipmentIds: [],
  equipmentTypeCount: 0,
  equipmentCount: 0,
}, 'purge should be idempotent');

console.log('equipmentTypes tests passed');
