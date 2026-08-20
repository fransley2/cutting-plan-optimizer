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
          deleteObjectStore(storeName) {
            state.stores.delete(storeName);
          },
          transaction(storeNames) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const tx = {
              objectStore(storeName = names[0]) {
                const storeState = state.stores.get(storeName);
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
const sessionValues = new Map();
globalThis.sessionStorage = {
  getItem: (key) => sessionValues.get(key) || null,
  setItem: (key, value) => sessionValues.set(key, String(value)),
  removeItem: (key) => sessionValues.delete(key),
};
const localValues = new Map();
globalThis.localStorage = {
  getItem: (key) => localValues.get(key) || null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: (key) => localValues.delete(key),
};

const { getDB } = await import('../src/data/database.js');
const { idbPut, idbGet } = await import('../src/data/idb.js');
const { ensureWorkpackLink, listWorkpackLinks } = await import('../src/data/workpackLinks.js');
const { saveMaterialReservation, listMaterialReservations } = await import('../src/data/materialReservations.js');
const { createMaterialTransformation, listMaterialTransformations } = await import('../src/data/materialTransformations.js');
const { createMaterialCoupon, saveMaterialCoupon } = await import('../src/data/materialCoupons.js');
const { createCuttingSheet, getAllCuttingSheets, saveCuttingSheet } = await import('../src/data/cuttingSheets.js');
const { getAllPlans, savePlan } = await import('../src/data/plans.js');
const { migratePlansToCuttingSheets } = await import('../src/data/cuttingSheetPlanMigration.js');
const { createReturnMaterialVoucher, getReturnMaterialVouchers, saveReturnMaterialVoucher } = await import('../src/data/returnMaterialVouchers.js');
const { createProject, updateProject } = await import('../src/data/projects.js');
const { saveTaskSheet, listTaskSheets } = await import('../src/data/taskSheets.js');
const { deactivateUser, deleteUser, getUser, listUsers, migrateLegacyProfileToUsers, reactivateUser, saveUser } = await import('../src/data/users.js');
const { clearActiveUserId, getActiveUser, getActiveUserId, setActiveUserId } = await import('../src/data/userSession.js');
const { buildMaterialCouponReportHtmlWithProfile } = await import('../src/reports/materialCouponReport.js');

const db = await getDB();

[
  'inventory',
  'plans',
  'settings',
  'users',
  'projects',
  'mtoItems',
  'materialCoupons',
  'cuttingSheets',
  'returnMaterialVouchers',
  'offcuts',
  'auditLog',
  'equipments',
  'equipmentTypes',
  'workpacks',
  'workpackLinks',
  'materialReservations',
  'materialTransformations',
  'taskSheets',
  'drawings',
  'documentTemplates',
  'organizations',
  'organizationContacts',
  'purchaseOrders',
  'purchaseOrderRevisions',
  'purchaseOrderItems',
  'materialReceipts',
  'materialReceiptLines',
  'materialUnits',
  'mtoPoItemAllocations',
  'poDeliveryForecasts',
].forEach((storeName) => {
  assert.equal(db.objectStoreNames.contains(storeName), true, `${storeName} store is missing`);
});
assert.equal(db.objectStoreNames.contains('cuttingPackages'), false, 'cuttingPackages store must be removed');

await idbPut(db, 'inventory', { trace: 'SCHEMA-KEEP', material: 'A106' });
const reopened = await getDB();
const kept = await idbGet(reopened, 'inventory', 'SCHEMA-KEEP');

assert.equal(kept.material, 'A106');

const project = await createProject({ name: 'PLACEHOLDER', shortCode: 'PH' });
const renamedProject = await updateProject(project.name, { name: 'PLACEHOLDER RENAMED' });
assert.ok(project.id);
assert.equal(project.traceabilityCode, 'PH', 'material traceability code must default from the operational code');
assert.equal(renamedProject.traceabilityCode, 'PH', 'renaming a project must preserve its material traceability code');
assert.equal(renamedProject.id, project.id, 'renaming a project must preserve its stable id');

const granmorguProject = await createProject({ name: 'GRANMORGU BLOCK 58', shortCode: 'B58' });
assert.equal(granmorguProject.traceabilityCode, 'G', 'known project material codes must follow the project code guide');
const customizedGranmorguProject = await updateProject(granmorguProject.name, { traceabilityCode: 'GM' });
assert.equal(customizedGranmorguProject.traceabilityCode, 'GM', 'material traceability code must remain editable');

await ensureWorkpackLink({ projectId: project.id, workpackId: 'WP-1', targetType: 'MATERIAL_COUPON', targetId: 'MC-1' });
await ensureWorkpackLink({ projectId: project.id, workpackId: 'WP-1', targetType: 'MATERIAL_COUPON', targetId: 'MC-1' });
assert.equal((await listWorkpackLinks({ workpackId: 'WP-1' })).length, 1, 'Workpack links must be idempotent');

await saveMaterialReservation({ projectId: project.id, workpackId: 'WP-1', inventoryItemId: 'INV-1', quantity: 1 });
assert.equal((await listMaterialReservations({ inventoryItemId: 'INV-1' })).length, 1);

await createMaterialTransformation({ projectId: project.id, cuttingSheetId: 'CS-1', parentInventoryItemId: 'INV-1', outputType: 'CUT_PART', outputId: 'PART-1' });
assert.equal((await listMaterialTransformations({ cuttingSheetId: 'CS-1' })).length, 1);

const coupon = await createMaterialCoupon({ projectId: project.id, createdBy: 'USER-1', createdByName: 'Planner One', items: [{ traceability: 'INV-1' }], metadata: { coupon: { lines: [{ traceability: 'INV-1' }] } } });
const couponSavedAgain = await saveMaterialCoupon(coupon);
assert.ok(coupon.items[0].id);
assert.equal(couponSavedAgain.items[0].id, coupon.items[0].id);
assert.equal(couponSavedAgain.metadata.coupon.lines[0].id, coupon.metadata.coupon.lines[0].id);
assert.equal(couponSavedAgain.createdBy, 'USER-1');
assert.equal(couponSavedAgain.createdByName, 'Planner One');

await idbPut(db, 'settings', { id: 'profile', name: 'Legacy Planner', role: 'PPC', company: 'Saipem', signatureImage: 'data:image/png;base64,legacy', updatedAt: '2026-07-01T10:00:00.000Z' });
const migratedUser = await migrateLegacyProfileToUsers();
assert.equal(migratedUser.name, 'Legacy Planner');
assert.equal(migratedUser.role, 'PPC');
assert.equal((await idbGet(db, 'settings', 'profile')), null);
assert.equal((await getUser(migratedUser.id)).signatureImage, 'data:image/png;base64,legacy');
assert.equal(await migrateLegacyProfileToUsers(), null, 'legacy profile migration must run only once');
const createdAt = migratedUser.createdAt;
const editedUser = await saveUser({ ...migratedUser, name: 'Legacy Planner Edited' });
assert.equal(editedUser.createdAt, createdAt);
setActiveUserId(editedUser.id);
assert.equal(getActiveUserId(), editedUser.id);
assert.equal((await getActiveUser()).name, 'Legacy Planner Edited');
await deactivateUser(editedUser.id);
assert.equal((await listUsers({ activeOnly: true })).some((user) => user.id === editedUser.id), false);
assert.equal((await getUser(editedUser.id)).name, 'Legacy Planner Edited', 'deactivated users must remain resolvable');
assert.equal(await getActiveUser(), null, 'a deactivated user cannot remain an active selectable session');
const historicalReport = await buildMaterialCouponReportHtmlWithProfile({ ...couponSavedAgain, createdBy: editedUser.id, createdByName: editedUser.name });
assert.ok(historicalReport.includes('Legacy Planner Edited'), 'historical reports must resolve deactivated creators by id');
assert.ok(historicalReport.includes('data:image/png;base64,legacy'));
await reactivateUser(editedUser.id);
assert.equal((await getUser(editedUser.id)).active, true);
clearActiveUserId();
assert.equal(getActiveUserId(), '');

const disposableUser = await saveUser({ name: 'Disposable User', role: 'Test' });
const deletedUser = await deleteUser(disposableUser.id);
assert.equal(deletedUser.deleted, true);
assert.equal(await getUser(disposableUser.id), null);

const referencedUser = await saveUser({ name: 'Referenced User', role: 'PPC' });
const referencedCoupon = await createMaterialCoupon({ number: 'MC-USER-REFERENCE', createdBy: referencedUser.id, createdByName: referencedUser.name });
const blockedDeletion = await deleteUser(referencedUser.id);
assert.equal(blockedDeletion.deleted, false);
assert.equal(blockedDeletion.reason, 'referenced');
assert.deepEqual(blockedDeletion.references, [{ id: referencedCoupon.id, number: 'MC-USER-REFERENCE' }]);
assert.ok(await getUser(referencedUser.id), 'referenced users must remain stored');

const sheet = await createCuttingSheet({ projectId: project.id, planning: { parts: [{ mark: 'M1', hasSobremetal: true, sobremetalMm: 500 }], solution: null }, bars: [{ pieces: [{ mark: 'M1', hasSobremetal: true }] }] });
const sheetSavedAgain = await saveCuttingSheet({
  ...sheet,
  bars: sheet.bars.map((bar) => ({ ...bar, pieces: bar.pieces.map((piece) => ({ ...piece, sobremetalMm: 750 })) })),
});
assert.ok(sheet.bars[0].id);
assert.ok(sheet.bars[0].pieces[0].id);
assert.equal(sheet.bars[0].pieces[0].sobremetalMm, 500);
assert.equal(sheet.planning.parts[0].sobremetalMm, 500);
assert.equal(sheetSavedAgain.bars[0].pieces[0].id, sheet.bars[0].pieces[0].id);
assert.equal(sheetSavedAgain.bars[0].pieces[0].hasSobremetal, true);
assert.equal(sheetSavedAgain.bars[0].pieces[0].sobremetalMm, 750);

await savePlan('B58_FAB_CS-LEGACY', {
  projectId: project.id,
  workpackId: 'WP-MIGRATION',
  projectData: { projectId: project.id, workpackId: 'WP-MIGRATION', workpack: 'B58-WP-MIGRATION' },
  stocks: [{ traceability: 'TRACE-MIGRATION', lengthMm: 2000 }],
  parts: [{ mark: 'MIGRATED-PIECE', length: 1000 }],
  solution: { stockUsed: [{ id: 'MIGRATED-BAR', pieces: [{ id: 'MIGRATED-PIECE', length: 1000 }], remaining: 1000 }] },
  solutionSummary: { stockUsedCount: 1, totalRemaining: 1000 },
});
await ensureWorkpackLink({
  projectId: project.id,
  workpackId: 'WP-MIGRATION',
  targetType: 'NESTING_PLAN',
  targetId: 'B58_FAB_CS-LEGACY',
});
const planMigration = await migratePlansToCuttingSheets({ actor: 'Migration Test' });
const migratedSheet = (await getAllCuttingSheets()).find((item) => item.number === 'B58_FAB_CS-LEGACY');
const migratedLinks = await listWorkpackLinks({ workpackId: 'WP-MIGRATION' });
assert.equal(planMigration.changed, 1);
assert.equal(migratedSheet.status, 'draft');
assert.equal(migratedSheet.planning.parts[0].mark, 'MIGRATED-PIECE');
assert.equal(migratedSheet.bars[0].id, 'MIGRATED-BAR');
assert.ok(migratedLinks.some((link) => link.targetType === 'CUTTING_SHEET' && link.targetId === migratedSheet.id && link.status === 'ACTIVE'));
assert.ok(migratedLinks.some((link) => link.targetType === 'NESTING_PLAN' && link.status === 'INACTIVE'));
assert.ok((await getAllPlans()).some((item) => item.name === 'B58_FAB_CS-LEGACY'), 'legacy plan remains stored for compatibility and backup');

const rmv = await createReturnMaterialVoucher({ projectId: project.id, returnedItems: [{ parentInventoryItemId: 'INV-1' }] });
const rmvSavedAgain = await saveReturnMaterialVoucher(rmv);
assert.ok(rmv.returnedItems[0].id);
assert.equal(rmvSavedAgain.returnedItems[0].id, rmv.returnedItems[0].id);
await createReturnMaterialVoucher({ projectId: project.id, number: 'RMV-OLDER', status: 'issued', date: '2026-01-10' });
await createReturnMaterialVoucher({ projectId: project.id, number: 'RMV-NEWER', status: 'issued', date: '2026-02-10', metadata: { reportOptions: { reportHeader: { companyName: 'Snapshot Company' } } } });
const sortedRmvs = await getReturnMaterialVouchers({ projectId: project.id, status: 'issued' });
assert.equal(sortedRmvs[0].number, 'RMV-NEWER');
assert.equal(sortedRmvs[1].number, 'RMV-OLDER');
assert.equal(sortedRmvs[0].metadata.reportOptions.reportHeader.companyName, 'Snapshot Company');

const taskSheet = await saveTaskSheet({ projectId: project.id, workpackId: 'WP-1', number: 'WP-1-TS-001', lines: [{ workstation: 'CUTTING', activity: 'Cutting', actionQuantity: 1 }] });
const taskSheetSavedAgain = await saveTaskSheet(taskSheet);
assert.ok(taskSheet.lines[0].id);
assert.equal(taskSheetSavedAgain.lines[0].id, taskSheet.lines[0].id);
assert.equal((await listTaskSheets({ workpackId: 'WP-1' })).length, 1);

console.log('databaseSchema tests passed');
