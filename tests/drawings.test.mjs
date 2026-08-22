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

async function assertRejectsRequired(createDrawing, patch, message) {
  await assert.rejects(
    () => createDrawing(patch),
    (error) => error instanceof Error && error.message === message,
  );
}

installIndexedDB();

const {
  createDrawing,
  updateDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  getDrawingByDrawingNo,
} = await import('../src/data/drawings.js');
const {
  ensureAndLinkDrawingsForMtoItems,
  ensureDrawingsForMtoItems,
  linkDrawingsForMtoItemsToEquipment,
} = await import('../src/data/mtoDrawings.js');

await assertRejectsRequired(
  createDrawing,
  { equipmentId: 'EQ-1', drawingNo: 'DWG-001' },
  'projectId is required to create a drawing.',
);
await assertRejectsRequired(
  createDrawing,
  { projectId: 'PROJECT-1', equipmentId: 'EQ-1' },
  'drawingNo is required to create a drawing.',
);

const input = {
  projectId: 'PROJECT-1',
  equipmentId: 'EQ-1',
  drawingNo: '263216-SGU-IF-ST-DM-011',
  templateDrawingNo: 'ROV-GRAB-BAR-STD-001',
  engineeringCode: 'C.CNS.2488',
  revision: 'A',
  title: 'Pipe rack general arrangement',
  discipline: 'STRUCTURAL',
  clientReference: 'CLIENT-REF-1',
  fileUrl: 'https://sharepoint.example.com/drawings/263216-SGU-IF-ST-DM-011.pdf',
  fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
  fileName: '263216-SGU-IF-ST-DM-011.pdf',
  fileType: 'application/pdf',
  fileSize: 2048,
  notes: 'Shop drawing for fabrication.',
};
const before = JSON.stringify(input);
const created = await createDrawing(input);

assert.equal(JSON.stringify(input), before, 'createDrawing mutated input');
assert.ok(created.id, 'created drawing should have id');
assert.equal(created.status, 'DRAFT');
assert.equal(created.projectId, 'PROJECT-1');
assert.equal(created.equipmentId, 'EQ-1');
assert.equal(created.workpackId, '');
assert.equal(created.drawingNo, '263216-SGU-IF-ST-DM-011');
assert.equal(created.templateDrawingNo, 'ROV-GRAB-BAR-STD-001');
assert.equal(created.engineeringCode, 'C.CNS.2488');
assert.equal(created.fileUrl, 'https://sharepoint.example.com/drawings/263216-SGU-IF-ST-DM-011.pdf');
assert.equal(created.fileDataUrl, 'data:application/pdf;base64,JVBERi0xLjQ=');
assert.equal(created.fileName, '263216-SGU-IF-ST-DM-011.pdf');
assert.equal(created.fileType, 'application/pdf');
assert.equal(created.fileSize, 2048);
assert.equal(created.notes, 'Shop drawing for fabrication.');
assert.equal(typeof created.createdAt, 'string');
assert.equal(typeof created.updatedAt, 'string');

const fetched = await getDrawing(created.id);
assert.equal(fetched.id, created.id, 'getDrawing should fetch by id');

const updated = await updateDrawing(created.id, {
  title: 'Pipe rack arrangement updated',
  status: 'IFC',
  templateDrawingNo: 'ROV-GRAB-BAR-STD-002',
  engineeringCode: 'C.CNS.2490',
});
assert.equal(updated.title, 'Pipe rack arrangement updated', 'updateDrawing should update title');
assert.equal(updated.status, 'IFC', 'updateDrawing should update status');
assert.equal(updated.templateDrawingNo, 'ROV-GRAB-BAR-STD-002', 'updateDrawing should update templateDrawingNo');
assert.equal(updated.engineeringCode, 'C.CNS.2490', 'updateDrawing should update engineeringCode');
assert.equal(updated.fileUrl, created.fileUrl, 'updateDrawing should preserve fileUrl when it is not patched');
assert.equal(updated.createdAt, created.createdAt, 'updateDrawing should preserve createdAt');

const revised = await updateDrawing(updated.id, { revision: 'B', status: 'IFC' });
assert.notEqual(revised.id, updated.id, 'a new drawing revision must create a new immutable record');
assert.equal(revised.documentId, updated.documentId);
assert.equal(revised.supersedesRevisionId, updated.id);
assert.equal(revised.isCurrentRevision, true);
assert.equal((await getDrawing(updated.id)).status, 'SUPERSEDED');
assert.equal((await getDrawing(updated.id)).isCurrentRevision, false);

await assert.rejects(
  () => updateDrawing(created.id, { drawingNo: '' }),
  /drawingNo is required to update a drawing\./,
);

await createDrawing({
  projectId: 'PROJECT-2',
  equipmentId: 'EQ-2',
  drawingNo: '263216-SGU-IF-ST-DM-012',
  revision: 'B',
  title: 'Compressor skid drawing',
  discipline: 'PIPING',
  status: 'IFR',
});

const projectOne = await listDrawings({ projectId: 'PROJECT-1' });
assert.equal(projectOne.length, 2, 'listDrawings should preserve superseded drawing revisions');
assert.equal((await listDrawings({ projectId: 'PROJECT-1', isCurrentRevision: true }))[0].id, revised.id);

const equipmentTwo = await listDrawings({ equipmentId: 'EQ-2' });
assert.equal(equipmentTwo.length, 1, 'listDrawings should filter by equipmentId');
assert.equal(equipmentTwo[0].drawingNo, '263216-SGU-IF-ST-DM-012');

const ifc = await listDrawings({ status: 'IFC' });
assert.equal(ifc.length, 1, 'listDrawings should filter by status');
assert.equal(ifc[0].id, revised.id);

const invalidStatus = await createDrawing({
  projectId: 'PROJECT-3',
  equipmentId: 'EQ-3',
  drawingNo: '263216-SGU-IF-ST-DM-013',
  status: 'bad-status',
});
assert.equal(invalidStatus.status, 'DRAFT', 'invalid status should fall back to DRAFT');

const relationship = await createDrawing({
  projectId: 'PROJECT-REL',
  equipmentId: 'EQ-REL',
  drawingNo: 'REL-DWG-001',
  status: 'IFA',
});
const relationshipResult = await listDrawings({
  projectId: 'PROJECT-REL',
  equipmentId: 'EQ-REL',
});
assert.equal(relationshipResult.length, 1, 'relationship filters should combine project/equipment');
assert.equal(relationshipResult[0].id, relationship.id);

const pendingEquipment = await createDrawing({
  projectId: 'PROJECT-PENDING',
  equipmentId: '',
  drawingNo: 'PENDING-DWG-001',
});
assert.equal(pendingEquipment.equipmentId, '', 'drawings created from MTO may remain pending equipment resolution');

const sampleMtoItems = [
  { projectId: 'PROJECT-AUTO', drawing: 'AUTO-DWG-001', equipmentId: 'EQ-AUTO', constructionActivity: 'C.CNS.2488' },
  { projectId: 'PROJECT-AUTO', drawing: 'AUTO-DWG-001', equipmentId: 'EQ-AUTO', constructionActivity: 'C.CNS.2488' },
  { projectId: 'PROJECT-AUTO', drawing: 'AUTO-DWG-002', equipmentId: '', constructionActivity: 'C.CNS.2489' },
];
const firstAutoCreate = await ensureDrawingsForMtoItems(sampleMtoItems, { projectId: 'PROJECT-AUTO' });
assert.equal(firstAutoCreate.length, 2, 'a sample MTO import should create one drawing per new Drawing No');
const secondAutoCreate = await ensureDrawingsForMtoItems(sampleMtoItems, { projectId: 'PROJECT-AUTO' });
assert.equal(secondAutoCreate.length, 0, 're-importing the same MTO should not duplicate drawings');

const autoDrawings = await listDrawings({ projectId: 'PROJECT-AUTO' });
const autoOne = autoDrawings.find((drawing) => drawing.drawingNo === 'AUTO-DWG-001');
const autoTwo = autoDrawings.find((drawing) => drawing.drawingNo === 'AUTO-DWG-002');
assert.equal(autoOne.equipmentId, 'EQ-AUTO');
assert.equal(autoOne.engineeringCode, 'C.CNS.2488');
assert.equal(autoOne.status, 'DRAFT');
assert.equal(autoTwo.equipmentId, '');
assert.equal(autoTwo.engineeringCode, 'C.CNS.2489');
const editedAutoDrawing = await updateDrawing(autoTwo.id, { engineeringCode: 'C.CNS.2500' });
assert.equal(editedAutoDrawing.engineeringCode, 'C.CNS.2500', 'engineeringCode should be editable on an auto-created drawing');

await createDrawing({ projectId: 'PROJECT-AUTO', drawingNo: 'AUTO-DWG-NOT-SELECTED' });
const linkedDrawings = await linkDrawingsForMtoItemsToEquipment([
  { projectId: 'PROJECT-AUTO', drawing: 'AUTO-DWG-001' },
  { projectId: 'PROJECT-AUTO', drawing: 'AUTO-DWG-002' },
  { projectId: 'PROJECT-AUTO', drawing: 'AUTO-DWG-003' },
], 'EQ-BULK', { projectId: 'PROJECT-AUTO' });
assert.equal(linkedDrawings.length, 3, 'bulk MTO linking should resolve every selected Drawing No');
assert.ok(linkedDrawings.every((drawing) => drawing.equipmentId === 'EQ-BULK'));
assert.equal(
  (await getDrawingByDrawingNo('AUTO-DWG-003', { projectId: 'PROJECT-AUTO' }))?.equipmentId,
  'EQ-BULK',
  'a drawing missing at link time should be created already linked to the destination equipment',
);
assert.equal(
  (await getDrawingByDrawingNo('AUTO-DWG-NOT-SELECTED', { projectId: 'PROJECT-AUTO' }))?.equipmentId,
  '',
  'drawings outside the selected MTO items must not be changed',
);

await createDrawing({ projectId: 'PROJECT-TAG-LINK', drawingNo: 'TAG-DWG-EXISTING' });
await ensureAndLinkDrawingsForMtoItems([
  { projectId: 'PROJECT-TAG-LINK', drawing: 'TAG-DWG-EXISTING', equipmentId: 'EQ-TAG' },
  { projectId: 'PROJECT-TAG-LINK', drawing: 'TAG-DWG-NEW', equipmentId: 'EQ-TAG' },
  { projectId: 'PROJECT-TAG-LINK', drawing: 'TAG-DWG-AMBIGUOUS', equipmentId: 'EQ-A' },
  { projectId: 'PROJECT-TAG-LINK', drawing: 'TAG-DWG-AMBIGUOUS', equipmentId: 'EQ-B' },
], { projectId: 'PROJECT-TAG-LINK' });
assert.equal((await getDrawingByDrawingNo('TAG-DWG-EXISTING', { projectId: 'PROJECT-TAG-LINK' }))?.equipmentId, 'EQ-TAG');
assert.equal((await getDrawingByDrawingNo('TAG-DWG-NEW', { projectId: 'PROJECT-TAG-LINK' }))?.equipmentId, 'EQ-TAG');
assert.equal((await getDrawingByDrawingNo('TAG-DWG-AMBIGUOUS', { projectId: 'PROJECT-TAG-LINK' }))?.equipmentId, '');

await createDrawing({ projectId: 'PROJECT-SCOPE-A', drawingNo: 'SAME-DWG' });
await createDrawing({ projectId: 'PROJECT-SCOPE-B', drawingNo: 'SAME-DWG' });
assert.equal((await getDrawingByDrawingNo('same-dwg', { projectId: 'PROJECT-SCOPE-B' }))?.projectId, 'PROJECT-SCOPE-B');

const legacyLinked = await createDrawing({
  projectId: 'PROJECT-LEGACY',
  equipmentId: 'EQ-LEGACY',
  workpackId: 'WP-LEGACY',
  drawingNo: 'LEGACY-DWG-001',
});
const legacyByWorkpack = await listDrawings({ workpackId: 'WP-LEGACY' });
assert.equal(legacyByWorkpack.length, 1, 'listDrawings should keep optional workpackId compatibility');
assert.equal(legacyByWorkpack[0].id, legacyLinked.id);

await deleteDrawing(created.id);
assert.equal(await getDrawing(created.id), null, 'deleteDrawing should remove by id');

console.log('drawings tests passed');
