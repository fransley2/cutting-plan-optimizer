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

const { createInventoryItem, getInventoryItem } = await import('../src/data/inventoryDB.js');
const { saveCuttingSheet, getCuttingSheet } = await import('../src/data/cuttingSheets.js');
const { saveOffcut, getOffcut } = await import('../src/data/offcuts.js');
const { getAllStockMovements } = await import('../src/data/stockMovements.js');
const { getAllAuditEvents } = await import('../src/data/auditLog.js');
const { createMaterialTransformation, listMaterialTransformations } = await import('../src/data/materialTransformations.js');
const { commitCuttingConfirmation } = await import('../src/data/cuttingConfirmationTransaction.js');
const { saveMaterialCoupon, getMaterialCoupon, getAllMaterialCoupons } = await import('../src/data/materialCoupons.js');
const { listMaterialReservations, saveMaterialReservation } = await import('../src/data/materialReservations.js');
const { commitMaterialCouponIssue } = await import('../src/data/materialCouponIssueTransaction.js');
const { commitMaterialCouponInventoryAction } = await import('../src/data/materialCouponActionTransaction.js');
const { MATERIAL_COUPON_ACTIONS } = await import('../src/core/materialCouponWorkflow.js');
const { saveReturnMaterialVoucher, getReturnMaterialVoucher, RMV_STATUS } = await import('../src/data/returnMaterialVouchers.js');
const { commitRmvReceipt } = await import('../src/data/rmvReceiptTransaction.js');
const { commitRmvCancellation, commitRmvIssue } = await import('../src/data/rmvLifecycleTransaction.js');
const { commitCutExecution } = await import('../src/data/cutExecutionTransaction.js');
const { saveOrganization, getAllOrganizations } = await import('../src/data/organizations.js');
const { createPurchaseOrder, savePurchaseOrderItem, getAllPurchaseOrders, getAllPurchaseOrderItems } = await import('../src/data/purchaseOrders.js');
const { createMaterialReceiptWithLine, getAllMaterialUnits } = await import('../src/data/materialReceipts.js');
const { commitMaterialUnitsToInventory } = await import('../src/data/materialUnitPostingTransaction.js');
const { commitPurchaseOrderImport } = await import('../src/data/purchaseOrderImportTransaction.js');
const { commitInventoryAdjustment } = await import('../src/data/inventoryAdjustmentTransaction.js');

await createInventoryItem({ id: 'INV-TX-1', trace: 'INV-TX-1', traceability: 'INV-TX-1', status: 'issued', qty: 1 });
const sheet = await saveCuttingSheet({
  id: 'CS-TX-1', number: 'CS-TX-1', projectId: 'P-1', workpackId: 'WP-1', status: 'released',
  bars: [{ id: 'BAR-1', inventoryItemId: 'INV-TX-1', offcutId: 'OFF-TX-1', remaining: 500, pieces: [] }],
});
await saveOffcut({ id: 'OFF-TX-1', cuttingSheetId: sheet.id, status: 'draft', metadata: {} });

const genealogy = {
  transformations: [{
    id: 'TR-TX-1', projectId: 'P-1', workpackId: 'WP-1', cuttingSheetId: sheet.id,
    parentInventoryItemId: 'INV-TX-1', outputType: 'REUSABLE_OFFCUT', outputId: 'OFF-TX-1', lengthMm: 500,
  }],
};
const committed = await commitCuttingConfirmation(sheet, genealogy, { userName: 'Tester', nowFactory: () => '2026-07-16T10:00:00.000Z' });
assert.equal(committed.cuttingSheet.status, 'cut');
assert.equal((await getInventoryItem('INV-TX-1')).status, 'consumed');
assert.equal((await getOffcut('OFF-TX-1')).status, 'reusable');
assert.equal((await getAllStockMovements()).length, 1);
assert.equal((await getAllAuditEvents()).length, 1);
assert.equal((await listMaterialTransformations({ cuttingSheetId: sheet.id })).length, 1);

const failingSheet = await saveCuttingSheet({ id: 'CS-TX-FAIL', number: 'CS-TX-FAIL', projectId: 'P-1', status: 'released', bars: [] });
await assert.rejects(() => commitCuttingConfirmation(failingSheet, {
  transformations: [{ id: 'TR-FAIL', cuttingSheetId: failingSheet.id, parentInventoryItemId: 'MISSING', outputType: 'CUT_PART', outputId: 'PART-FAIL' }],
}, {}), /Inventory item not found/);
assert.equal((await getCuttingSheet(failingSheet.id)).status, 'released');
assert.equal((await listMaterialTransformations({ cuttingSheetId: failingSheet.id })).length, 0);
assert.equal((await getAllStockMovements()).length, 1);
assert.equal((await getAllAuditEvents()).length, 1);

await createInventoryItem({
  id: 'INV-MC-TX', trace: 'INV-MC-TX', traceability: 'INV-MC-TX', status: 'available',
  qty: 4, balanceQty: 4, reservedQty: 0, qualityStatus: 'ACCEPTED',
});
const coupon = await saveMaterialCoupon({
  id: 'MC-TX-1', number: 'P1_FAB_MC-001', projectId: 'P-1', workpackId: 'WP-1', status: 'draft',
  items: [{ id: 'MC-LINE-1', inventoryItemId: 'INV-MC-TX', mtoItemId: 'MTO-TAG-1', qty: 2 }],
  metadata: { coupon: { status: 'DRAFT', header: { project: 'P-1' }, lines: [{ id: 'MC-LINE-1', inventoryItemId: 'INV-MC-TX', mtoItemId: 'MTO-TAG-1', qty: 2 }] } },
});
const issuedCoupon = await commitMaterialCouponIssue(coupon, [{
  inventoryItemId: 'INV-MC-TX', traceability: 'INV-MC-TX', quantity: 2, line: { id: 'MC-LINE-1', mtoItemId: 'MTO-TAG-1' },
}], { userName: 'Tester', nowFactory: () => '2026-07-16T11:00:00.000Z' });
assert.equal(issuedCoupon.status, 'issued');
assert.equal(issuedCoupon.__auditCommitted, true);
assert.equal(issuedCoupon.metadata.coupon.responsible.issuing, 'Tester');
assert.equal((await getInventoryItem('INV-MC-TX')).status, 'reserved');
assert.equal((await getInventoryItem('INV-MC-TX')).balanceQty, 0);
assert.equal((await getInventoryItem('INV-MC-TX-R1')).balanceQty, 2);
assert.equal((await listMaterialReservations({ materialCouponId: coupon.id })).length, 1);
assert.equal((await listMaterialReservations({ materialCouponId: coupon.id }))[0].mtoItemId, 'MTO-TAG-1');
assert.equal((await getAllStockMovements()).length, 3);
assert.equal((await getAllAuditEvents()).length, 2);

const dispatchedCoupon = await commitMaterialCouponInventoryAction({
  ...issuedCoupon,
  status: 'dispatched',
  metadata: { ...issuedCoupon.metadata, coupon: { ...issuedCoupon.metadata.coupon, status: 'DISPATCHED' } },
}, MATERIAL_COUPON_ACTIONS.DISPATCH, '', { userName: 'Tester', nowFactory: () => '2026-07-16T12:00:00.000Z' });
assert.equal(dispatchedCoupon.status, 'dispatched');
assert.equal(dispatchedCoupon.__auditCommitted, true);
assert.equal((await getInventoryItem('INV-MC-TX')).status, 'issued');
assert.equal((await getInventoryItem('INV-MC-TX')).reservedQty, 0);
assert.equal((await getInventoryItem('INV-MC-TX')).issuedQty, 2);
assert.equal((await listMaterialReservations({ materialCouponId: coupon.id }))[0].status, 'CONSUMED');
assert.equal((await getAllStockMovements()).length, 4);
assert.equal((await getAllAuditEvents()).length, 3);

await createInventoryItem({
  id: 'INV-MC-RELEASE', trace: 'INV-MC-RELEASE', traceability: 'INV-MC-RELEASE', status: 'available',
  qty: 5, balanceQty: 5, reservedQty: 0, qualityStatus: 'ACCEPTED',
});
const releaseCouponDraft = await saveMaterialCoupon({
  id: 'MC-TX-RELEASE', number: 'P1_FAB_MC-003', projectId: 'P-1', workpackId: 'WP-1', status: 'draft',
  metadata: { coupon: { status: 'DRAFT', header: { project: 'P-1' }, lines: [{ id: 'MC-LINE-RELEASE', inventoryItemId: 'INV-MC-RELEASE', qty: 3 }] } },
});
const releaseCouponIssued = await commitMaterialCouponIssue(releaseCouponDraft, [{
  inventoryItemId: 'INV-MC-RELEASE', traceability: 'INV-MC-RELEASE', quantity: 3, line: { id: 'MC-LINE-RELEASE' },
}], { userName: 'Tester', nowFactory: () => '2026-07-16T13:00:00.000Z' });
const releasedCoupon = await commitMaterialCouponInventoryAction({
  ...releaseCouponIssued,
  status: 'draft',
  metadata: { ...releaseCouponIssued.metadata, coupon: { ...releaseCouponIssued.metadata.coupon, status: 'DRAFT' } },
}, MATERIAL_COUPON_ACTIONS.RELEASE, 'Reservation no longer required', {
  userName: 'Tester', nowFactory: () => '2026-07-16T14:00:00.000Z',
});
assert.equal(releasedCoupon.status, 'draft');
assert.equal((await getInventoryItem('INV-MC-RELEASE')).status, 'available');
assert.equal((await getInventoryItem('INV-MC-RELEASE')).balanceQty, 3);
assert.equal((await getInventoryItem('INV-MC-RELEASE-R1')).balanceQty, 2);
assert.equal((await getInventoryItem('INV-MC-RELEASE')).reservedQty, 0);
assert.equal((await listMaterialReservations({ materialCouponId: releaseCouponDraft.id }))[0].status, 'RELEASED');
assert.equal((await getAllStockMovements()).length, 7);
assert.equal((await getAllAuditEvents()).length, 5);

await createInventoryItem({
  id: 'INV-MC-CANCEL', trace: 'INV-MC-CANCEL', traceability: 'INV-MC-CANCEL', status: 'available',
  qty: 2, balanceQty: 2, reservedQty: 0, qualityStatus: 'ACCEPTED',
});
const cancelCouponDraft = await saveMaterialCoupon({
  id: 'MC-TX-CANCEL', number: 'P1_FAB_MC-004', projectId: 'P-1', workpackId: 'WP-1', status: 'draft',
  metadata: { coupon: { status: 'DRAFT', header: { project: 'P-1' }, lines: [{ id: 'MC-LINE-CANCEL', inventoryItemId: 'INV-MC-CANCEL', qty: 1 }] } },
});
const cancelCouponIssued = await commitMaterialCouponIssue(cancelCouponDraft, [{
  inventoryItemId: 'INV-MC-CANCEL', traceability: 'INV-MC-CANCEL', quantity: 1, line: { id: 'MC-LINE-CANCEL' },
}], { userName: 'Tester', nowFactory: () => '2026-07-16T15:00:00.000Z' });
const cancelledCoupon = await commitMaterialCouponInventoryAction({
  ...cancelCouponIssued,
  status: 'cancelled',
  metadata: { ...cancelCouponIssued.metadata, coupon: { ...cancelCouponIssued.metadata.coupon, status: 'CANCELLED' } },
}, MATERIAL_COUPON_ACTIONS.CANCEL, 'Coupon cancelled before dispatch', {
  userName: 'Tester', nowFactory: () => '2026-07-16T16:00:00.000Z',
});
assert.equal(cancelledCoupon.status, 'cancelled');
assert.equal((await getInventoryItem('INV-MC-CANCEL')).status, 'available');
assert.equal((await getInventoryItem('INV-MC-CANCEL')).balanceQty, 1);
assert.equal((await getInventoryItem('INV-MC-CANCEL-R1')).balanceQty, 1);
assert.equal((await listMaterialReservations({ materialCouponId: cancelCouponDraft.id }))[0].status, 'RELEASED');
assert.equal((await getAllStockMovements()).length, 10);
assert.equal((await getAllAuditEvents()).length, 7);

const failingCoupon = await saveMaterialCoupon({
  id: 'MC-TX-FAIL', number: 'P1_FAB_MC-002', projectId: 'P-1', status: 'draft',
  metadata: { coupon: { status: 'DRAFT', header: { project: 'P-1' }, lines: [] } },
});
await assert.rejects(() => commitMaterialCouponIssue(failingCoupon, [{
  inventoryItemId: 'MISSING-INVENTORY', quantity: 1, line: { id: 'FAIL-LINE' },
}], {}), /INVENTORY_ITEM_NOT_FOUND/);
assert.equal((await getMaterialCoupon(failingCoupon.id)).status, 'draft');
assert.equal((await listMaterialReservations({ materialCouponId: failingCoupon.id })).length, 0);
assert.equal((await getAllStockMovements()).length, 10);
assert.equal((await getAllAuditEvents()).length, 7);

await createInventoryItem({
  id: 'INV-MC-ATOMIC', trace: 'INV-MC-ATOMIC', traceability: 'INV-MC-ATOMIC', status: 'available',
  qty: 6, balanceQty: 6, reservedQty: 0, qualityStatus: 'ACCEPTED',
});
const atomicMovementCount = (await getAllStockMovements()).length;
const atomicAuditCount = (await getAllAuditEvents()).length;
const atomicIssuedCoupon = await commitMaterialCouponIssue({
  number: 'P1_FAB_MC-006', projectId: 'P-1', status: 'draft',
  metadata: { coupon: { status: 'DRAFT', header: { project: 'P-1' }, lines: [{ inventoryItemId: 'INV-MC-ATOMIC', qty: 2 }] } },
}, [], { userName: 'Tester' });
assert.equal((await getMaterialCoupon(atomicIssuedCoupon.id)).status, 'issued', 'issue must create an unsaved draft inside the transaction');
assert.equal((await getInventoryItem('INV-MC-ATOMIC')).balanceQty, 0);
assert.equal((await getInventoryItem('INV-MC-ATOMIC-R1')).balanceQty, 4);
assert.equal((await listMaterialReservations({ materialCouponId: atomicIssuedCoupon.id })).length, 1);
assert.equal((await getAllStockMovements()).length, atomicMovementCount + 2);
assert.equal((await getAllAuditEvents()).length, atomicAuditCount + 1);

await createInventoryItem({
  id: 'INV-MC-VALIDATE-FIRST', trace: 'INV-MC-VALIDATE-FIRST', traceability: 'INV-MC-VALIDATE-FIRST', status: 'available',
  qty: 5, balanceQty: 5, reservedQty: 0, qualityStatus: 'ACCEPTED',
});
const couponsBeforeFailedPreparation = (await getAllMaterialCoupons()).length;
const movementsBeforeFailedPreparation = (await getAllStockMovements()).length;
await assert.rejects(() => commitMaterialCouponIssue({
  number: 'P1_FAB_MC-007', projectId: 'P-1', status: 'draft',
  metadata: { coupon: { status: 'DRAFT', header: { project: 'P-1' }, lines: [
    { inventoryItemId: 'INV-MC-VALIDATE-FIRST', qty: 2 },
    { inventoryItemId: 'MISSING-AFTER-SPLIT-PLAN', qty: 1 },
  ] } },
}), /INVENTORY_ITEM_NOT_FOUND/);
assert.equal((await getInventoryItem('INV-MC-VALIDATE-FIRST')).balanceQty, 5);
assert.equal(await getInventoryItem('INV-MC-VALIDATE-FIRST-R1'), null, 'validation failure must not persist a planned split');
assert.equal((await getAllMaterialCoupons()).length, couponsBeforeFailedPreparation);
assert.equal((await getAllStockMovements()).length, movementsBeforeFailedPreparation);

const rollbackCoupon = await saveMaterialCoupon({
  id: 'MC-TX-ACTION-FAIL', number: 'P1_FAB_MC-005', projectId: 'P-1', status: 'issued',
  metadata: { coupon: { status: 'ISSUED', header: { project: 'P-1' }, lines: [] } },
});
await saveMaterialReservation({
  id: 'RES-TX-ACTION-FAIL', projectId: 'P-1', materialCouponId: rollbackCoupon.id,
  inventoryItemId: 'MISSING-INVENTORY', quantity: 1,
});
const movementCountBeforeRollback = (await getAllStockMovements()).length;
const auditCountBeforeRollback = (await getAllAuditEvents()).length;
await assert.rejects(() => commitMaterialCouponInventoryAction({
  ...rollbackCoupon,
  status: 'dispatched',
}, MATERIAL_COUPON_ACTIONS.DISPATCH, '', {}), /INVENTORY_ITEM_NOT_FOUND/);
assert.equal((await getMaterialCoupon(rollbackCoupon.id)).status, 'issued');
assert.equal((await listMaterialReservations({ materialCouponId: rollbackCoupon.id }))[0].status, 'ACTIVE');
assert.equal((await getAllStockMovements()).length, movementCountBeforeRollback);
assert.equal((await getAllAuditEvents()).length, auditCountBeforeRollback);

await createInventoryItem({
  id: 'INV-RMV-PARENT', trace: 'INV-RMV-PARENT', traceability: 'INV-RMV-PARENT', status: 'consumed',
  qty: 1, balanceQty: 0, issuedQty: 1, lengthMm: 6000, weightKg: 600,
  exitDate: '2026-07-15T10:00:00.000Z', materialCouponNo: 'P1_FAB_MC-001', projectId: 'P-1',
});
await saveOffcut({ id: 'OFF-RMV-1', projectId: 'P-1', workpackId: 'WP-1', cuttingSheetId: 'CS-TX-1', parentInventoryItemId: 'INV-RMV-PARENT', status: 'pending_rmv', traceability: 'INV-RMV-PARENT-OC-001', length: 1000 });
await saveOffcut({ id: 'OFF-RMV-2', projectId: 'P-1', workpackId: 'WP-1', cuttingSheetId: 'CS-TX-1', parentInventoryItemId: 'INV-RMV-PARENT', status: 'pending_rmv', traceability: 'INV-RMV-PARENT-OC-002', length: 500 });
await createMaterialTransformation({
  id: 'TR-RMV-1', projectId: 'P-1', workpackId: 'WP-1', cuttingSheetId: 'CS-TX-1',
  parentInventoryItemId: 'INV-RMV-PARENT', outputType: 'REUSABLE_OFFCUT', outputId: 'OFF-RMV-1', lengthMm: 1000,
});
const rmv = await saveReturnMaterialVoucher({
  id: 'RMV-TX-1', number: 'P1_FAB_RMV-001', projectId: 'P-1', workpackId: 'WP-1', cuttingSheetId: 'CS-TX-1',
  materialCouponId: 'MC-TX-1', destination: 'WAREHOUSE-A', status: RMV_STATUS.ISSUED,
  returnedItems: [
    { id: 'RMV-LINE-1', sourceOffcutId: 'OFF-RMV-1', parentInventoryItemId: 'INV-RMV-PARENT', parentTraceability: 'INV-RMV-PARENT', traceability: 'INV-RMV-PARENT-OC-001', qty: 1, lengthMm: 1000, weightKg: 100, status: 'pending' },
    { id: 'RMV-LINE-2', sourceOffcutId: 'OFF-RMV-2', parentInventoryItemId: 'INV-RMV-PARENT', parentTraceability: 'INV-RMV-PARENT', traceability: 'INV-RMV-PARENT-OC-002', qty: 1, lengthMm: 500, weightKg: 50, status: 'pending' },
  ],
});
const rmvMovementCount = (await getAllStockMovements()).length;
const rmvAuditCount = (await getAllAuditEvents()).length;
const partiallyReceivedRmv = await commitRmvReceipt(rmv, ['RMV-LINE-1'], {
  userName: 'Warehouse', nowFactory: () => '2026-07-16T17:00:00.000Z',
});
assert.equal(partiallyReceivedRmv.status, RMV_STATUS.PARTIALLY_RECEIVED);
assert.equal((await getInventoryItem('INV-RMV-PARENT-OC-001')).parentStockId, 'INV-RMV-PARENT');
assert.equal((await getInventoryItem('INV-RMV-PARENT-OC-001')).issuedQty, 0);
assert.equal((await getInventoryItem('INV-RMV-PARENT-OC-001')).exitDate, '');
assert.equal((await getInventoryItem('INV-RMV-PARENT-OC-001')).location, 'WAREHOUSE-A');
assert.equal((await getOffcut('OFF-RMV-1')).status, 'returned_to_stock');
assert.equal((await listMaterialTransformations({ cuttingSheetId: 'CS-TX-1' })).find((item) => item.id === 'TR-RMV-1').metadata.returnedInventoryItemId, 'INV-RMV-PARENT-OC-001');
assert.equal((await getAllStockMovements()).length, rmvMovementCount + 1);
assert.equal((await getAllAuditEvents()).length, rmvAuditCount + 2);

const completelyReceivedRmv = await commitRmvReceipt(partiallyReceivedRmv, ['RMV-LINE-2'], {
  userName: 'Warehouse', nowFactory: () => '2026-07-16T18:00:00.000Z',
});
assert.equal(completelyReceivedRmv.status, RMV_STATUS.RETURNED);
assert.equal(completelyReceivedRmv.returnedBy, 'Warehouse');
assert.equal((await getInventoryItem('INV-RMV-PARENT-OC-002')).status, 'available');
assert.equal((await getOffcut('OFF-RMV-2')).newInventoryItemId, 'INV-RMV-PARENT-OC-002');

await saveOffcut({ id: 'OFF-RMV-ROLLBACK', projectId: 'P-1', cuttingSheetId: 'CS-TX-1', parentInventoryItemId: 'INV-RMV-PARENT', status: 'pending_rmv' });
const rollbackRmv = await saveReturnMaterialVoucher({
  id: 'RMV-TX-ROLLBACK', number: 'P1_FAB_RMV-002', projectId: 'P-1', cuttingSheetId: 'CS-TX-1', status: RMV_STATUS.ISSUED,
  returnedItems: [
    { id: 'RMV-RB-1', sourceOffcutId: 'OFF-RMV-ROLLBACK', parentInventoryItemId: 'INV-RMV-PARENT', traceability: 'INV-RMV-ROLLBACK-001', qty: 1, lengthMm: 250, status: 'pending' },
    { id: 'RMV-RB-2', parentInventoryItemId: 'MISSING-RMV-PARENT', traceability: 'INV-RMV-ROLLBACK-002', qty: 1, lengthMm: 200, status: 'pending' },
  ],
});
const beforeFailedRmvMovements = (await getAllStockMovements()).length;
const beforeFailedRmvAudits = (await getAllAuditEvents()).length;
const beforeFailedRmvTransformations = (await listMaterialTransformations({ cuttingSheetId: 'CS-TX-1' })).length;
await assert.rejects(() => commitRmvReceipt(rollbackRmv, ['RMV-RB-1', 'RMV-RB-2'], {}), /RMV_PARENT_INVENTORY_NOT_FOUND/);
assert.equal((await getReturnMaterialVoucher(rollbackRmv.id)).status, RMV_STATUS.ISSUED);
assert.equal(await getInventoryItem('INV-RMV-ROLLBACK-001'), null);
assert.equal((await getOffcut('OFF-RMV-ROLLBACK')).status, 'pending_rmv');
assert.equal((await getAllStockMovements()).length, beforeFailedRmvMovements);
assert.equal((await getAllAuditEvents()).length, beforeFailedRmvAudits);
assert.equal((await listMaterialTransformations({ cuttingSheetId: 'CS-TX-1' })).length, beforeFailedRmvTransformations);

const lifecycleRmvDraft = await saveReturnMaterialVoucher({
  id: 'RMV-LIFECYCLE-1', number: 'P1_FAB_RMV-003', projectId: 'P-1', workpackId: 'WP-1',
  cuttingSheetId: 'CS-TX-1', destination: 'WAREHOUSE-B', status: RMV_STATUS.DRAFT,
  returnedItems: [{
    id: 'RMV-LIFECYCLE-LINE-1', sourceOffcutId: 'NESTING-OFFCUT-1',
    parentInventoryItemId: 'INV-RMV-PARENT', parentTraceability: 'INV-RMV-PARENT',
    qty: 1, lengthMm: 300, widthMm: 80, status: 'pending',
  }],
});
const lifecycleAuditCount = (await getAllAuditEvents()).length;
const lifecycleIssued = await commitRmvIssue(lifecycleRmvDraft, ['RMV-LIFECYCLE-LINE-1'], {
  userName: 'Planner', nowFactory: () => '2026-07-16T19:00:00.000Z',
});
assert.equal(lifecycleIssued.status, RMV_STATUS.ISSUED);
assert.equal(lifecycleIssued.issuedBy, 'Planner');
assert.equal(lifecycleIssued.returnedItems[0].traceability, 'INV-RMV-PARENT-OC-003');
const lifecycleOffcut = await getOffcut(lifecycleIssued.returnedItems[0].sourceOffcutId);
assert.equal(lifecycleOffcut.status, 'pending_rmv');
assert.equal(lifecycleOffcut.returnMaterialVoucherId, lifecycleIssued.id);
assert.equal((await getAllAuditEvents()).length, lifecycleAuditCount + 2);

const lifecycleCancelled = await commitRmvCancellation(lifecycleIssued, {
  userName: 'Planner', reason: 'Return no longer required', nowFactory: () => '2026-07-16T20:00:00.000Z',
});
assert.equal(lifecycleCancelled.status, RMV_STATUS.CANCELLED);
assert.equal((await getOffcut(lifecycleOffcut.id)).status, 'draft');
assert.equal((await getOffcut(lifecycleOffcut.id)).returnMaterialVoucherId, '');
assert.equal((await getAllAuditEvents()).length, lifecycleAuditCount + 3);
await assert.rejects(() => commitRmvCancellation(lifecycleIssued, {}), /STALE_RMV_STATUS:cancelled/);

const failedLifecycleRmv = await saveReturnMaterialVoucher({
  id: 'RMV-LIFECYCLE-FAIL', number: 'P1_FAB_RMV-004', projectId: 'P-1', cuttingSheetId: 'CS-TX-1',
  destination: 'WAREHOUSE-B', status: RMV_STATUS.DRAFT,
  returnedItems: [{ id: 'RMV-LIFECYCLE-FAIL-LINE', sourceOffcutId: 'MISSING-SOURCE', parentInventoryItemId: 'MISSING-PARENT', qty: 1, lengthMm: 100, status: 'pending' }],
});
const beforeFailedLifecycleAudits = (await getAllAuditEvents()).length;
await assert.rejects(() => commitRmvIssue(failedLifecycleRmv, ['RMV-LIFECYCLE-FAIL-LINE'], {}), /RMV_PARENT_INVENTORY_NOT_FOUND/);
assert.equal((await getReturnMaterialVoucher(failedLifecycleRmv.id)).status, RMV_STATUS.DRAFT);
assert.equal(await getOffcut('MISSING-SOURCE'), null);
assert.equal((await getAllAuditEvents()).length, beforeFailedLifecycleAudits);

const executionSheet = await saveCuttingSheet({
  id: 'CS-EXECUTION-TX', number: 'CS-EXECUTION-TX', projectId: 'P-1', status: 'released',
  bars: [{ id: 'BAR-EXEC', inventoryItemId: 'INV-RMV-PARENT', originalLength: 6000, remaining: 400, pieces: [{ id: 'PIECE-EXEC', cutLength: 1200 }] }],
});
const executionAuditCount = (await getAllAuditEvents()).length;
const executionResult = await commitCutExecution(executionSheet, {
  reason: 'Measured dimensional adjustment.',
  bars: [{ barId: 'BAR-EXEC', actualRemainingMm: 395, pieces: [{ pieceId: 'PIECE-EXEC', actualCutLengthMm: 1203 }] }],
}, { userName: 'Operator', nowFactory: () => '2026-07-16T21:00:00.000Z' });
assert.equal(executionResult.cuttingSheet.bars[0].actualRemainingMm, 395);
assert.equal(executionResult.cuttingSheet.bars[0].pieces[0].actualCutLengthMm, 1203);
assert.equal(executionResult.cuttingSheet.metadata.cutExecution.varianceCount, 2);
assert.equal((await getAllAuditEvents()).length, executionAuditCount + 1);

const beforeFailedExecution = await getCuttingSheet(executionSheet.id);
const beforeFailedExecutionAudits = (await getAllAuditEvents()).length;
await assert.rejects(() => commitCutExecution(beforeFailedExecution, {
  reason: '', bars: [{ barId: 'BAR-EXEC', actualRemainingMm: 390, pieces: [{ pieceId: 'PIECE-EXEC', actualCutLengthMm: 1210 }] }],
}, {}), /CUT_EXECUTION_VARIANCE_REASON_REQUIRED/);
assert.equal((await getCuttingSheet(executionSheet.id)).bars[0].actualRemainingMm, 395);
assert.equal((await getAllAuditEvents()).length, beforeFailedExecutionAudits);

const postingSupplier = await saveOrganization({ id: 'ORG-POST', legalName: 'Posting Supplier', tradeName: 'POST SUPPLIER' });
const postingPo = await createPurchaseOrder({ id: 'PO-POST', projectId: 'P-POST', poNumber: '1520999', supplierId: postingSupplier.id, subject: 'Posting integration test' });
const postingPoItem = await savePurchaseOrderItem({ id: 'POITEM-POST', projectId: 'P-POST', purchaseOrderId: postingPo.id, itemNumber: '10', description: 'Test pipe', materialCategory: 'PIPE', materialGrade: 'S32760', identCode: 'PIPE-10', orderedQuantity: 3, unitOfMeasure: 'EA' });
const postingReceipt = await createMaterialReceiptWithLine({
  receipt: { id: 'RECEIPT-POST', projectId: 'P-POST', receiptNumber: 'MRR-POST', supplierId: postingSupplier.id, invoiceNumber: 'NF-POST', arrivalDate: '2026-07-16', warehouseId: 'CTCO', status: 'INSPECTED' },
  line: { id: 'RECEIPT-LINE-POST', purchaseOrderId: postingPo.id, poItemId: postingPoItem.id, receivedQuantity: 2, unitOfMeasure: 'EA', heatNumber: 'HEAT-POST', inspectionStatus: 'ACCEPTED' },
  units: { physicalUnitCount: 2, traceabilityPrefix: 'TRACE-POST', originalLengthMm: 6100, storageLocationId: 'A-01' },
});
const movementsBeforePosting = (await getAllStockMovements()).length;
const auditsBeforePosting = (await getAllAuditEvents()).length;
const postingResult = await commitMaterialUnitsToInventory(postingReceipt.units.map((unit) => unit.id), { userName: 'Warehouse', nowFactory: () => '2026-07-16T22:00:00.000Z' });
assert.equal(postingResult.postedUnits.length, 2);
assert.equal(postingResult.inventoryItems.length, 2);
assert.equal((await getInventoryItem('TRACE-POST-001')).status, 'available');
assert.equal((await getInventoryItem('TRACE-POST-001')).qualityStatus, 'ACCEPTED');
assert.equal((await getAllMaterialUnits()).find((unit) => unit.id === postingReceipt.units[0].id).postingStatus, 'POSTED');
assert.equal((await getAllStockMovements()).length, movementsBeforePosting + 2);
assert.equal((await getAllAuditEvents()).length, auditsBeforePosting + 2);

const repeatedPosting = await commitMaterialUnitsToInventory(postingReceipt.units.map((unit) => unit.id), { userName: 'Warehouse' });
assert.equal(repeatedPosting.postedUnits.length, 0);
assert.equal(repeatedPosting.alreadyPostedUnits.length, 2);
assert.equal((await getAllStockMovements()).length, movementsBeforePosting + 2, 'repeated posting must not duplicate movements');
assert.equal((await getAllAuditEvents()).length, auditsBeforePosting + 2, 'repeated posting must not duplicate audit events');

const holdReceipt = await createMaterialReceiptWithLine({
  receipt: { id: 'RECEIPT-HOLD', projectId: 'P-POST', receiptNumber: 'MRR-HOLD', supplierId: postingSupplier.id, arrivalDate: '2026-07-16' },
  line: { id: 'RECEIPT-LINE-HOLD', purchaseOrderId: postingPo.id, poItemId: postingPoItem.id, receivedQuantity: 0.5, unitOfMeasure: 'EA', inspectionStatus: 'HOLD' },
  units: { physicalUnitCount: 1, traceabilityPrefix: 'TRACE-HOLD' },
});
await assert.rejects(() => commitMaterialUnitsToInventory([holdReceipt.units[0].id]), /MATERIAL_UNIT_NOT_ACCEPTED/);
assert.equal(await getInventoryItem('TRACE-HOLD'), null);

const poImportResult = await commitPurchaseOrderImport([
  { vendor: 'TUBACEX IMPORT', poNumber: '1520813-I', poItem: '18', poRevision: '2', poDocDate: '2025-05-28', task: 'B58 - SDSS PIPES', traceability: 'GPP1520813-I-18', identCode: 'PP-SD-168-19', drawback: 'YES', equipmentDestination: '6in DW PROD JUMPERS-T1', itemClassification: 'SUPERDUPLEX', itemType: 'PROCESS PIPE', itemDescription: 'CRA SMLS PIPE 6 INCH', diameterOdMm: 168.3, thicknessMm: 19.1, materialGrade: 'DNV25Cr', lengthArea: 6.1, lengthAreaUnit: 'M', poQuantity: 561.2, poUnit: 'M' },
  { vendor: 'TUBACEX IMPORT', poNumber: '1520813-I', poItem: '20', poRevision: '2', poDocDate: '2025-05-28', task: 'B58 - SDSS PIPES', traceability: 'GPP1520813-I-20', identCode: 'PP-SD-168-19', drawback: 'NO', itemClassification: 'SUPERDUPLEX', itemType: 'PROCESS PIPE', itemDescription: 'CRA SMLS PIPE 6 INCH', poQuantity: 488, poUnit: 'M' },
], { projectId: 'P-IMPORT', sourceFileName: 'PO-IMPORT.xlsx', sourceType: 'EXCEL', userName: 'Buyer', nowFactory: () => '2026-07-16T23:00:00.000Z' });
assert.equal(poImportResult.purchaseOrders.length, 1);
assert.equal(poImportResult.items.length, 2);
assert.equal((await getAllOrganizations()).filter((item) => item.legalName === 'TUBACEX IMPORT').length, 1);
assert.equal((await getAllPurchaseOrders()).find((item) => item.poNumber === '1520813-I').currentRevision, '2');
const importedPoItem = (await getAllPurchaseOrderItems()).find((item) => item.traceability === 'GPP1520813-I-18');
assert.equal(importedPoItem.identCode, 'PP-SD-168-19');
assert.equal(importedPoItem.diameterOdMm, 168.3);
assert.equal(importedPoItem.equipmentDestination, '6in DW PROD JUMPERS-T1');

await createInventoryItem({
  id: 'INV-ADJUST-TX', trace: 'INV-ADJUST-TX', traceability: 'INV-ADJUST-TX', status: 'available',
  qty: 10, balanceQty: 10, materialGrade: 'A36', qualityStatus: 'ACCEPTED',
});
const adjustmentMovementCount = (await getAllStockMovements()).length;
const adjustmentAuditCount = (await getAllAuditEvents()).length;
const adjustment = await commitInventoryAdjustment('INV-ADJUST-TX', {
  status: 'on-hold', balanceQty: 7, materialGrade: 'A36',
}, { userName: 'Inventory Controller', nowFactory: () => '2026-07-17T08:00:00.000Z' });
assert.equal(adjustment.inventoryItem.status, 'on-hold');
assert.equal((await getInventoryItem('INV-ADJUST-TX')).balanceQty, 7);
assert.equal((await getAllStockMovements()).length, adjustmentMovementCount + 1);
assert.equal((await getAllAuditEvents()).length, adjustmentAuditCount + 1);
assert.equal(adjustment.stockMovement.before.balanceQty, 10);
assert.equal(adjustment.stockMovement.after.balanceQty, 7);
assert.equal(adjustment.auditEvent.userName, 'Inventory Controller');

const movementsBeforeMissingAdjustment = (await getAllStockMovements()).length;
const auditsBeforeMissingAdjustment = (await getAllAuditEvents()).length;
await assert.rejects(() => commitInventoryAdjustment('MISSING-ADJUSTMENT', { status: 'scrap' }), /INVENTORY_ITEM_NOT_FOUND/);
assert.equal((await getAllStockMovements()).length, movementsBeforeMissingAdjustment);
assert.equal((await getAllAuditEvents()).length, auditsBeforeMissingAdjustment);

await createInventoryItem({
  id: 'INV-ADJUST-ROLLBACK', trace: 'INV-ADJUST-ROLLBACK', traceability: 'INV-ADJUST-ROLLBACK',
  status: 'available', qty: 4, balanceQty: 4, materialGrade: 'A36', qualityStatus: 'ACCEPTED',
});
const movementsBeforeFailedAdjustment = (await getAllStockMovements()).length;
const auditsBeforeFailedAdjustment = (await getAllAuditEvents()).length;
const nativeStructuredClone = globalThis.structuredClone;
globalThis.structuredClone = (value) => {
  if (value?.eventType === 'MANUAL_ADJUSTMENT') throw new Error('Injected audit write failure');
  return nativeStructuredClone(value);
};
try {
  await assert.rejects(
    () => commitInventoryAdjustment('INV-ADJUST-ROLLBACK', { status: 'scrap', balanceQty: 0, materialGrade: 'A36' }),
    /AUDIT_WRITE_FAILED/,
  );
} finally {
  globalThis.structuredClone = nativeStructuredClone;
}
assert.equal((await getInventoryItem('INV-ADJUST-ROLLBACK')).status, 'available', 'audit failure must roll back Inventory');
assert.equal((await getInventoryItem('INV-ADJUST-ROLLBACK')).balanceQty, 4);
assert.equal((await getAllStockMovements()).length, movementsBeforeFailedAdjustment, 'audit failure must roll back movement');
assert.equal((await getAllAuditEvents()).length, auditsBeforeFailedAdjustment);

await createInventoryItem({ id: 'INV-SCRAP-499', trace: 'INV-SCRAP-499', traceability: 'INV-SCRAP-499', status: 'issued', qty: 1, materialGrade: 'A36' });
const scrapSheet = await saveCuttingSheet({
  id: 'CS-SCRAP-499', number: 'CS-SCRAP-499', projectId: 'P-1', status: 'released',
  bars: [{ id: 'BAR-SCRAP-499', inventoryItemId: 'INV-SCRAP-499', offcutId: 'OFF-SCRAP-499', remaining: 499, pieces: [] }],
});
await commitCuttingConfirmation(scrapSheet, { transformations: [{
  id: 'TR-SCRAP-499', projectId: 'P-1', cuttingSheetId: scrapSheet.id,
  parentInventoryItemId: 'INV-SCRAP-499', outputType: 'SCRAP', outputId: 'OFF-SCRAP-499', lengthMm: 499,
}] }, { userName: 'Cutter', nowFactory: () => '2026-07-17T09:00:00.000Z' });
const persistedScrap = await getOffcut('OFF-SCRAP-499');
assert.equal(persistedScrap.status, 'scrap', 'a sub-500 mm remainder must be persisted as scrap during cut confirmation');
assert.equal(persistedScrap.length, 499);
assert.equal(persistedScrap.metadata.classification, 'SCRAP');

console.log('cutting confirmation transaction tests passed');
