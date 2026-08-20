import assert from 'node:assert/strict';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function installIndexedDB() {
  const databases = new Map();
  globalThis.indexedDB = {
    open(name, version) {
      const request = { result: null, error: null };
      setTimeout(() => {
        let state = databases.get(name);
        const oldVersion = state?.version || 0;
        if (!state) {
          state = { version, stores: new Map() };
          databases.set(name, state);
        }
        state.version = Math.max(state.version, version);
        const db = {
          version: state.version,
          objectStoreNames: { contains: (storeName) => state.stores.has(storeName) },
          createObjectStore(storeName, options) {
            const storeState = { keyPath: options.keyPath, records: new Map(), indexes: new Set() };
            state.stores.set(storeName, storeState);
            return { createIndex: (indexName) => storeState.indexes.add(indexName) };
          },
          deleteObjectStore(storeName) { state.stores.delete(storeName); },
          transaction(storeNames) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const snapshots = new Map(names.map((storeName) => [storeName, new Map(state.stores.get(storeName).records)]));
            let pending = 0;
            let completionQueued = false;
            let aborted = false;
            const tx = {
              error: null,
              objectStore(storeName) {
                const storeState = state.stores.get(storeName);
                const run = (operation) => {
                  const req = { result: undefined, error: null };
                  pending += 1;
                  setTimeout(() => {
                    if (aborted) return;
                    try {
                      req.result = operation();
                      req.onsuccess?.({ target: req });
                    } catch (error) {
                      req.error = error;
                      tx.error = error;
                      req.onerror?.({ target: req });
                      tx.onerror?.({ target: tx });
                    } finally {
                      pending -= 1;
                      queueCompletion();
                    }
                  }, 0);
                  return req;
                };
                return {
                  getAll: () => run(() => [...storeState.records.values()].map(clone)),
                  get: (key) => run(() => clone(storeState.records.get(key) || null)),
                  put: (value) => run(() => {
                    storeState.records.set(value[storeState.keyPath], clone(value));
                    return value[storeState.keyPath];
                  }),
                  delete: (key) => run(() => storeState.records.delete(key)),
                  clear: () => run(() => storeState.records.clear()),
                };
              },
              abort() {
                if (aborted) return;
                aborted = true;
                snapshots.forEach((records, storeName) => { state.stores.get(storeName).records = new Map(records); });
                setTimeout(() => tx.onabort?.({ target: tx }), 0);
              },
            };
            function queueCompletion() {
              if (aborted || pending || completionQueued) return;
              completionQueued = true;
              setTimeout(() => {
                completionQueued = false;
                if (!aborted && pending === 0) tx.oncomplete?.({ target: tx });
              }, 0);
            }
            setTimeout(queueCompletion, 0);
            return tx;
          },
          close() {},
        };
        request.result = db;
        if (version > oldVersion) request.onupgradeneeded?.({ target: request, oldVersion });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

installIndexedDB();

const { getDB } = await import('../src/data/database.js');
const { idbPut } = await import('../src/data/idb.js');
const { getAuditEvents } = await import('../src/data/auditLog.js');
const {
  cancelMtoPoItemAllocation,
  listMtoPoItemAllocations,
  listMtoProcurementCoverage,
  normalizeMtoPoItemAllocation,
  saveMtoPoItemAllocation,
  saveMtoPoItemAllocations,
} = await import('../src/data/mtoPoItemAllocations.js');

const normalizedAutomatic = normalizeMtoPoItemAllocation({
  mtoLineId: 'MTO-AUTO', poItemId: 'POI-AUTO', allocatedQuantity: 1,
  matchMethod: 'AUTO_IDENT_CODE', matchSource: 'ident_code', matchConfidence: 'high',
});
assert.equal(normalizedAutomatic.matchSource, 'IDENT_CODE');
assert.equal(normalizedAutomatic.matchConfidence, 'HIGH');

const db = await getDB();
await idbPut(db, 'mtoItems', { id: 'MTO-1', projectId: 'P-1', qty: 10, cutLength: 6000, requiredLength: 60000 });
await idbPut(db, 'mtoItems', { id: 'MTO-2', projectId: 'P-1', qty: 10, cutLength: 4000, requiredLength: 40000 });
await idbPut(db, 'purchaseOrders', { id: 'PO-1', projectId: 'P-1', poNumber: '1520813' });
await idbPut(db, 'purchaseOrderItems', { id: 'POI-1', purchaseOrderId: 'PO-1', projectId: 'P-1', itemNumber: '18', orderedQuantity: 100, unitOfMeasure: 'M' });

const first = await saveMtoPoItemAllocation({ mtoLineId: 'MTO-1', poItemId: 'POI-1', allocatedQuantity: 60, createdBy: 'Buyer' });
const second = await saveMtoPoItemAllocation({ mtoLineId: 'MTO-2', poItemId: 'POI-1', allocatedQuantity: 40, createdBy: 'Buyer' });
assert.equal(first.projectId, 'P-1');
assert.equal(first.unitOfMeasure, 'M');
assert.equal(first.matchMethod, 'MANUAL');
assert.equal(first.matchedIdentCode, '');
assert.equal((await listMtoPoItemAllocations({ projectId: 'P-1', status: 'ACTIVE' })).length, 2);

await assert.rejects(
  saveMtoPoItemAllocation({ mtoLineId: 'MTO-2', poItemId: 'POI-1', allocatedQuantity: 1 }),
  /already linked|exceeds/i,
);

await idbPut(db, 'materialReceipts', { id: 'R-1', projectId: 'P-1', status: 'RECEIVED' });
await idbPut(db, 'materialReceiptLines', { id: 'RL-1', receiptId: 'R-1', poItemId: 'POI-1', receivedQuantity: 50, unitOfMeasure: 'M' });
for (let index = 0; index < 5; index += 1) {
  await idbPut(db, 'materialUnits', {
    id: `UNIT-${index + 1}`, projectId: 'P-1', poItemId: 'POI-1', receiptLineId: 'RL-1', quantity: 1,
    originalLengthMm: 10000, inspectionStatus: index < 4 ? 'ACCEPTED' : 'HOLD',
  });
}

const coverage = await listMtoProcurementCoverage({ projectId: 'P-1' });
assert.equal(coverage[0].receivedQuantity, 30);
assert.equal(coverage[0].acceptedQuantity, 24);
assert.equal(coverage[1].receivedQuantity, 20);

await cancelMtoPoItemAllocation(second.id, { reason: 'Scope changed', userName: 'Buyer' });
assert.equal((await listMtoPoItemAllocations({ status: 'ACTIVE' })).length, 1);
assert.equal((await listMtoPoItemAllocations({ status: 'CANCELLED' }))[0].cancellationReason, 'Scope changed');
assert.equal((await getAuditEvents({ entityType: 'MTO_PO_ITEM_ALLOCATION' })).length, 3);

await idbPut(db, 'mtoItems', { id: 'MTO-3', projectId: 'P-1', qty: 60 });
await idbPut(db, 'mtoItems', { id: 'MTO-4', projectId: 'P-1', qty: 40 });
await idbPut(db, 'purchaseOrderItems', { id: 'POI-2', purchaseOrderId: 'PO-1', projectId: 'P-1', itemNumber: '19', orderedQuantity: 100, unitOfMeasure: 'EA' });
const batch = await saveMtoPoItemAllocations([
  {
    mtoLineId: 'MTO-3',
    poItemId: 'POI-2',
    allocatedQuantity: 60,
    createdBy: 'Buyer',
    matchMethod: 'AUTO_IDENT_CODE',
    matchedIdentCode: 'PP-SD-168-19',
  },
  { mtoLineId: 'MTO-4', poItemId: 'POI-2', allocatedQuantity: 40, createdBy: 'Buyer' },
]);
assert.equal(batch.length, 2);
assert.equal(batch[0].matchMethod, 'AUTO_IDENT_CODE');
assert.equal(batch[0].matchedIdentCode, 'PP-SD-168-19');
assert.equal(batch[1].matchMethod, 'MANUAL');
assert.equal((await listMtoPoItemAllocations({ poItemId: 'POI-2', status: 'ACTIVE' })).length, 2, 'one PO item must supply several MTO marks');

await idbPut(db, 'mtoItems', { id: 'MTO-5', projectId: 'P-1', qty: 20 });
await idbPut(db, 'purchaseOrderItems', { id: 'POI-3', purchaseOrderId: 'PO-1', projectId: 'P-1', itemNumber: '20', orderedQuantity: 10, unitOfMeasure: 'EA' });
const beforeRejectedBatch = (await listMtoPoItemAllocations({})).length;
await assert.rejects(saveMtoPoItemAllocations([
  { mtoLineId: 'MTO-5', poItemId: 'POI-3', allocatedQuantity: 6 },
  { mtoLineId: 'MTO-4', poItemId: 'POI-3', allocatedQuantity: 6 },
]), /exceeds/i);
assert.equal((await listMtoPoItemAllocations({})).length, beforeRejectedBatch, 'an invalid batch must not persist a partial allocation');

console.log('MTO to PO item allocation data tests passed');
