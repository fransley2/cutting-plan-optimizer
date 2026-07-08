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

async function assertCrud(moduleConfig) {
  await moduleConfig.clear();
  const input = { ...moduleConfig.input };
  const before = JSON.stringify(input);
  const created = await moduleConfig.create(input);

  assert.equal(JSON.stringify(input), before, `${moduleConfig.name} mutated input`);
  assert.ok(created.id, `${moduleConfig.name} missing id`);
  assert.equal(typeof created.createdAt, 'string', `${moduleConfig.name} missing createdAt`);
  assert.equal(typeof created.updatedAt, 'string', `${moduleConfig.name} missing updatedAt`);
  assert.equal(created.status, moduleConfig.expectedStatus);

  const byId = await moduleConfig.get(created.id);
  assert.equal(byId.id, created.id, `${moduleConfig.name} get by id failed`);

  const all = await moduleConfig.getAll();
  assert.equal(all.length, 1, `${moduleConfig.name} get all failed`);

  const filteredByProject = await moduleConfig.filter({ projectId: 'PROJECT-FMS' });
  assert.equal(filteredByProject.length, 1, `${moduleConfig.name} projectId filter failed`);

  const filteredByStatus = await moduleConfig.filter({ status: moduleConfig.expectedStatus });
  assert.equal(filteredByStatus.length, 1, `${moduleConfig.name} status filter failed`);

  const updated = await moduleConfig.update(created.id, { status: moduleConfig.updatedStatus, metadata: { updated: true } });
  assert.equal(updated.status, moduleConfig.updatedStatus, `${moduleConfig.name} update failed`);
  assert.equal(updated.createdAt, created.createdAt, `${moduleConfig.name} did not preserve createdAt`);
  assert.equal(updated.metadata.updated, true, `${moduleConfig.name} metadata update failed`);

  await moduleConfig.deleteOne(created.id);
  assert.equal((await moduleConfig.getAll()).length, 0, `${moduleConfig.name} delete failed`);

  const one = await moduleConfig.create({ ...moduleConfig.input, id: `${moduleConfig.name}-1` });
  const two = await moduleConfig.create({ ...moduleConfig.input, id: `${moduleConfig.name}-2` });
  await moduleConfig.deleteMany([one.id]);
  assert.equal((await moduleConfig.get(two.id)).id, two.id, `${moduleConfig.name} deleteMany deleted unrelated record`);
  await moduleConfig.clear();
  assert.equal((await moduleConfig.getAll()).length, 0, `${moduleConfig.name} clear failed`);
}

installIndexedDB();

const mtoItems = await import('../src/data/mtoItems.js');
const cuttingPackages = await import('../src/data/cuttingPackages.js');
const materialCoupons = await import('../src/data/materialCoupons.js');
const cuttingSheets = await import('../src/data/cuttingSheets.js');
const returnMaterialVouchers = await import('../src/data/returnMaterialVouchers.js');
const offcuts = await import('../src/data/offcuts.js');
const auditLog = await import('../src/data/auditLog.js');

await assertCrud({
  name: 'mtoItems',
  create: mtoItems.createMtoItem,
  get: mtoItems.getMtoItem,
  getAll: mtoItems.getAllMtoItems,
  filter: mtoItems.getMtoItems,
  update: mtoItems.updateMtoItem,
  deleteOne: mtoItems.deleteMtoItem,
  deleteMany: mtoItems.deleteMtoItems,
  clear: mtoItems.clearMtoItems,
  input: { projectId: 'PROJECT-FMS', drawing: 'DWG-1', mark: 'M1', pos: '1A', material: 'A106', qty: 1, cutLength: 1000 },
  expectedStatus: 'open',
  updatedStatus: 'matched',
});

await assertCrud({
  name: 'cuttingPackages',
  create: cuttingPackages.createCuttingPackage,
  get: cuttingPackages.getCuttingPackage,
  getAll: cuttingPackages.getAllCuttingPackages,
  filter: cuttingPackages.getCuttingPackages,
  update: cuttingPackages.updateCuttingPackage,
  deleteOne: cuttingPackages.deleteCuttingPackage,
  deleteMany: cuttingPackages.deleteCuttingPackages,
  clear: cuttingPackages.clearCuttingPackages,
  input: { projectId: 'PROJECT-FMS', number: 'CP-1', sourceType: 'manual', mtoItemIds: ['MTO-1'] },
  expectedStatus: 'draft',
  updatedStatus: 'ready',
});

await assertCrud({
  name: 'materialCoupons',
  create: materialCoupons.createMaterialCoupon,
  get: materialCoupons.getMaterialCoupon,
  getAll: materialCoupons.getAllMaterialCoupons,
  filter: materialCoupons.getMaterialCoupons,
  update: materialCoupons.updateMaterialCoupon,
  deleteOne: materialCoupons.deleteMaterialCoupon,
  deleteMany: materialCoupons.deleteMaterialCoupons,
  clear: materialCoupons.clearMaterialCoupons,
  input: { projectId: 'PROJECT-FMS', number: 'MC-1', cuttingPackageId: 'CP-1', items: [{ id: 'I1' }] },
  expectedStatus: 'draft',
  updatedStatus: 'issued',
});

await assertCrud({
  name: 'cuttingSheets',
  create: cuttingSheets.createCuttingSheet,
  get: cuttingSheets.getCuttingSheet,
  getAll: cuttingSheets.getAllCuttingSheets,
  filter: cuttingSheets.getCuttingSheets,
  update: cuttingSheets.updateCuttingSheet,
  deleteOne: cuttingSheets.deleteCuttingSheet,
  deleteMany: cuttingSheets.deleteCuttingSheets,
  clear: cuttingSheets.clearCuttingSheets,
  input: { projectId: 'PROJECT-FMS', number: 'CS-1', materialCouponId: 'MC-1', cuttingPackageId: 'CP-1', bars: [{ id: 'B1' }] },
  expectedStatus: 'draft',
  updatedStatus: 'released',
});

await assertCrud({
  name: 'returnMaterialVouchers',
  create: returnMaterialVouchers.createReturnMaterialVoucher,
  get: returnMaterialVouchers.getReturnMaterialVoucher,
  getAll: returnMaterialVouchers.getAllReturnMaterialVouchers,
  filter: returnMaterialVouchers.getReturnMaterialVouchers,
  update: returnMaterialVouchers.updateReturnMaterialVoucher,
  deleteOne: returnMaterialVouchers.deleteReturnMaterialVoucher,
  deleteMany: returnMaterialVouchers.deleteReturnMaterialVouchers,
  clear: returnMaterialVouchers.clearReturnMaterialVouchers,
  input: { projectId: 'PROJECT-FMS', number: 'RMV-1', cuttingSheetId: 'CS-1', materialCouponId: 'MC-1', returnedItems: [{ id: 'R1' }] },
  expectedStatus: 'draft',
  updatedStatus: 'returned',
});

await assertCrud({
  name: 'offcuts',
  create: offcuts.createOffcut,
  get: offcuts.getOffcut,
  getAll: offcuts.getAllOffcuts,
  filter: offcuts.getOffcuts,
  update: offcuts.updateOffcut,
  deleteOne: offcuts.deleteOffcut,
  deleteMany: offcuts.deleteOffcuts,
  clear: offcuts.clearOffcuts,
  input: { projectId: 'PROJECT-FMS', parentInventoryItemId: 'INV-1', material: 'A106', heat: 'H1', traceability: 'T1', length: 500, qty: 1 },
  expectedStatus: 'draft',
  updatedStatus: 'reusable',
});

await auditLog.clearAuditLog();
const auditInput = {
  projectId: 'PROJECT-FMS',
  eventType: auditLog.AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT,
  entityType: 'inventoryItem',
  entityId: 'INV-1',
  timestamp: '2026-01-01T00:00:00.000Z',
  metadata: { source: 'test' },
};
const auditBefore = JSON.stringify(auditInput);
const auditEntry = await auditLog.createAuditLogEntry(auditInput);

assert.equal(JSON.stringify(auditInput), auditBefore, 'auditLog mutated input');
assert.ok(auditEntry.id);
assert.equal(typeof auditEntry.timestamp, 'string');
assert.equal((await auditLog.getAllAuditLogEntries()).length, 1);
assert.equal((await auditLog.getAuditLogEntry(auditEntry.id)).id, auditEntry.id);
assert.equal((await auditLog.getAuditLogEntries({ projectId: 'PROJECT-FMS' })).length, 1);
assert.equal((await auditLog.getAuditLogEntries({ eventType: auditLog.AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT })).length, 1);
assert.equal((await auditLog.getAuditLogEntries({ from: 'bad-date', to: 'also-bad' })).length, 1);
await auditLog.deleteAuditLogEntry(auditEntry.id);
assert.equal((await auditLog.getAllAuditLogEntries()).length, 0);
await auditLog.createAuditEvent({ projectId: 'PROJECT-FMS', eventType: auditLog.AUDIT_EVENT_TYPES.IMPORT_MTO });
assert.equal((await auditLog.getAllAuditEvents()).length, 1);
await auditLog.clearAuditEvents();
assert.equal((await auditLog.getAllAuditLogEntries()).length, 0);

console.log('fmsStores tests passed');
