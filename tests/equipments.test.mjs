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
  findEquipmentByHint,
  findEquipmentMatch,
  getEquipment,
  listEquipments,
} = await import('../src/data/equipments.js');

const input = {
  projectId: 'PROJECT-1',
  equipmentTypeId: 'TYPE-PLEM',
  code: 'EQ-001',
  'Equipment Designation': 'NON INCORPORATE',
  Structure_Clean: 'installation aid',
  'Equipment Structure': 'support frame',
  'Equipment - Type': 'plem module',
  'Equipment Name': 'Pump Skid',
  clientTag: 'P-1001',
  discipline: 'Mechanical',
  description: 'Main pump skid',
  theoreticalWeightKg: '1250.50',
  photoUrl: 'data:image/png;base64,equipment-photo',
  fieldLocation: 'kbd dw',
  system: 'production jumper',
  variant: 'type 1',
  plannedQuantity: '3',
  equipmentTags: '32-WJ-10-1020\n32-WJ-10-2020\n32-WJ-10-3010',
  designDrawingNo: 'sr-101-30-u101-290158',
};
const before = JSON.stringify(input);
const created = await createEquipment(input);

assert.equal(JSON.stringify(input), before, 'createEquipment mutated input');
assert.ok(created.id, 'created equipment should have id');
assert.equal(created.status, 'ACTIVE');
assert.equal(created.projectId, 'PROJECT-1');
assert.equal(created.equipmentTypeId, 'TYPE-PLEM');
assert.equal(created.code, 'EQ-001');
assert.equal(created.scopeType, 'NOT_INCORPORATED');
assert.equal(created.equipmentClass, 'INSTALLATION AID');
assert.equal(created.equipmentType, 'PLEM');
assert.equal(created.equipmentStructure, 'SUPPORT FRAME');
assert.equal(created.equipmentName, 'Pump Skid');
assert.equal(created.name, 'Pump Skid');
assert.equal(created.theoreticalWeightKg, 1250.5);
assert.equal(created.photoUrl, 'data:image/png;base64,equipment-photo');
assert.equal(created.fieldLocation, 'KBD DW');
assert.equal(created.system, 'PRODUCTION');
assert.equal(created.variant, 'TYPE 1');
assert.equal(created.plannedQuantity, 3);
assert.deepEqual(created.equipmentTags, ['32-WJ-10-1020', '32-WJ-10-2020', '32-WJ-10-3010']);
assert.equal(created.clientTag, '32-WJ-10-1020');
assert.equal(created.designDrawingNo, 'SR-101-30-U101-290158');
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
assert.equal(updated.theoreticalWeightKg, created.theoreticalWeightKg, 'updateEquipment should preserve theoretical weight when it is not patched');
assert.equal(updated.photoUrl, created.photoUrl, 'updateEquipment should preserve photoUrl when it is not patched');

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

assert.equal(findEquipmentMatch(await listEquipments({}), '32-wj-10-2020').equipment?.id, created.id, 'findEquipmentMatch should match any grouped tag');
assert.equal(findEquipmentMatch(await listEquipments({}), 'pump skid updated').equipment?.id, created.id, 'findEquipmentMatch should match name case-insensitively');
assert.equal((await findEquipmentByHint('EQ-002'))?.code, 'EQ-002', 'findEquipmentByHint should match code');

const ambiguousMatch = findEquipmentMatch([
  { id: 'AMBIGUOUS-1', equipmentTags: ['SHARED-TAG'], name: 'First' },
  { id: 'AMBIGUOUS-2', equipmentTags: ['SHARED-TAG'], name: 'Second' },
], 'shared-tag');
assert.equal(ambiguousMatch.equipment, null, 'ambiguous matches must not select the first equipment');
assert.equal(ambiguousMatch.ambiguous, true);
assert.equal(ambiguousMatch.matchedBy, 'equipmentTags');
assert.deepEqual(ambiguousMatch.matches.map((equipment) => equipment.id), ['AMBIGUOUS-1', 'AMBIGUOUS-2']);

const invalidStatus = await createEquipment({
  projectId: 'PROJECT-3',
  code: 'EQ-003',
  name: 'Invalid status equipment',
  status: 'bad-status',
});
assert.equal(invalidStatus.status, 'ACTIVE', 'invalid status should fall back to ACTIVE');

const generatedIdentity = await createEquipment({
  projectId: 'PROJECT-7',
  fieldLocation: 'KBD DW',
  equipmentType: 'Production Jumper',
  variant: 'Type 2',
  plannedQuantity: 3,
  equipmentTags: ['32-WJ-10-1010', '32-WJ-10-2010', '32-WJ-10-3020'],
});
assert.equal(generatedIdentity.equipmentName, 'KBD DW · PRODUCTION · JUMPER · TYPE 2');
assert.equal(generatedIdentity.equipmentType, 'JUMPER');
assert.equal(generatedIdentity.system, 'PRODUCTION');
assert.equal(generatedIdentity.name, generatedIdentity.equipmentName);
assert.equal(generatedIdentity.code, 'KBD-DW-PRODUCTION-JUMPER-TYPE-2');
assert.equal(generatedIdentity.status, 'ACTIVE');
assert.equal(generatedIdentity.clientTag, '32-WJ-10-1010');

const sameNameDifferentProject = await createEquipment({ projectId: 'PROJECT-4', name: 'Pump Skid Updated' });
assert.equal(sameNameDifferentProject.projectId, 'PROJECT-4', 'same equipment name should be allowed in another project');

await assert.rejects(
  () => createEquipment({ projectId: 'PROJECT-1', name: '  pump skid updated  ' }),
  (error) => error.code === 'EQUIPMENT_NAME_CONFLICT',
  'equipment names should be unique per project, ignoring case and surrounding spaces',
);

await assert.rejects(
  () => createEquipment({ projectId: 'PROJECT-1', name: 'Other equipment', code: ' eq-001 ' }),
  (error) => error.code === 'EQUIPMENT_CODE_CONFLICT',
  'populated codes should be unique per project',
);

await assert.rejects(
  () => createEquipment({ projectId: 'PROJECT-1', name: 'Other tag equipment', clientTag: ' 32-wj-10-1020 ' }),
  (error) => error.code === 'EQUIPMENT_CLIENT_TAG_CONFLICT',
  'populated client tags should be unique per project',
);

const blankIdentifiersOne = await createEquipment({ projectId: 'PROJECT-5', name: 'Blank A', code: '', clientTag: '' });
const blankIdentifiersTwo = await createEquipment({ projectId: 'PROJECT-5', name: 'Blank B', code: '', clientTag: '' });
assert.ok(blankIdentifiersOne.id && blankIdentifiersTwo.id, 'blank code and client tag should not conflict');

const selfUpdated = await updateEquipment(created.id, { code: 'EQ-001', clientTag: '32-WJ-10-1020' });
assert.equal(selfUpdated.id, created.id, 'updating an equipment must not conflict with itself');

const legacyField = await createEquipment({ projectId: 'PROJECT-6', name: 'Legacy Equipment', externalLegacyKey: 'LEGACY-42' });
const legacyUpdated = await updateEquipment(legacyField.id, { discipline: 'Mechanical' });
assert.equal(legacyUpdated.externalLegacyKey, 'LEGACY-42', 'unknown existing fields should survive an update');

await deleteEquipment(created.id);
assert.equal(await getEquipment(created.id), null, 'deleteEquipment should remove by id');

console.log('equipments tests passed');
