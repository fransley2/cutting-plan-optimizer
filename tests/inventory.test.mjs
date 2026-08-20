import { parseInventoryRows, mapInventoryItemToStockRow } from '../src/data/inventoryImport.js';

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
        if (!state) {
          state = { version, stores: new Map() };
          databases.set(name, state);
        }
        if (version > state.version) state.version = version;

        const db = {
          version: state.version,
          objectStoreNames: { contains: (storeName) => state.stores.has(storeName) },
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
        if (isUpgrade) request.onupgradeneeded?.({ target: request, oldVersion: 0 });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

const rows = [
  ['Traceability', 'Category', 'PO', 'Item', 'Qty', 'Length', 'Material', 'Heat', 'Desc', 'Ref F', 'Ref G', 'Ref H'],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['T-101', 'Pipe', 'PO-1', 'IT-1', '3', '6000', 'A36', 'H1', 'Pipe', 'R1', 'R2', 'R3'],
];

const items = parseInventoryRows(rows);
if (items.length !== 1) throw new Error('Expected 1 parsed inventory item');
if (items[0].trace !== 'T-101') throw new Error('Traceability mapping failed');
if (items[0].qty !== 3) throw new Error('Qty mapping failed');

const identifiedItems = parseInventoryRows([
  ['Traceability', 'Length (mm)', 'Balance Qty', 'IDENT CODE', 'Disponibilidade'],
  ['T-IDENT', '6100', '1', 'PP-SD-168-19', 'Disponivel'],
]);
if (identifiedItems[0].identCode !== 'PP-SD-168-19') throw new Error('IDENT CODE mapping failed');
if ('disponibilidade' in identifiedItems[0]) throw new Error('Legacy Disponibilidade column must be ignored');
if (identifiedItems[0].status !== 'available') throw new Error('Imported inventory must be controlled by app status');

const stockRow = mapInventoryItemToStockRow(items[0]);
if (stockRow.qty !== 3 || stockRow.lengthMm !== 6000) throw new Error('Stock row mapping failed');
if (stockRow.materialDescription !== 'Pipe' || stockRow.heatNo !== 'H1') throw new Error('Planner stock mapping failed');
const legacyPoItemStockRow = mapInventoryItemToStockRow({ po: '1450848', poItemPo: '1450848 / 43', traceability: 'GBE1450848-43-001', qty: 1, lengthMm: 6000 });
if (legacyPoItemStockRow.poItem !== '43') throw new Error('Planner stock mapping must recover the PO Item from legacy references');
const availableStockRow = mapInventoryItemToStockRow({ qty: 1, balanceQty: 4, lengthMm: 6000 });
if (availableStockRow.qty !== 4) throw new Error('Stock row must use available balance quantity');

installIndexedDB();
const {
  getInventoryItems,
  getAllInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  deleteInventoryItems,
  clearInventoryItems,
} = await import('../src/data/inventoryDB.js');
const { validateMaterialCouponReservation } = await import('../src/core/materialCouponReservation.js');
const { getDB } = await import('../src/data/database.js');
const { idbPut } = await import('../src/data/idb.js');
const {
  createMaterialCoupon,
  getAllMaterialCoupons,
  clearMaterialCoupons,
} = await import('../src/data/materialCoupons.js');

await clearInventoryItems();

await idbPut(await getDB(), 'inventory', { id: 'LEGACY-ZERO', trace: 'LEGACY-ZERO', traceability: 'LEGACY-ZERO', qty: 3, balanceQty: 0, reservedQty: 0, issuedQty: 0, status: 'available' });
await idbPut(await getDB(), 'inventory', { id: 'LEGACY-QUALITY', trace: 'LEGACY-QUALITY', traceability: 'LEGACY-QUALITY', qty: 1, balanceQty: 1, status: 'available', inspectionStatus: 'PENDING', acceptanceStatus: '', qualityStatus: 'PENDING' });
const repairedLegacy = (await getInventoryItems()).find((item) => item.id === 'LEGACY-ZERO');
if (repairedLegacy.balanceQty !== 3 || repairedLegacy.balanceSource !== 'legacyQtyFallback') throw new Error('Legacy placeholder balances must be repaired once');
const repairedLegacyQuality = (await getInventoryItems()).find((item) => item.id === 'LEGACY-QUALITY');
if (repairedLegacyQuality.qualityStatus !== 'ACCEPTED' || repairedLegacyQuality.qualitySource !== 'legacyInspectionDefault') throw new Error('Legacy inspection status must not remain an implicit Quality rejection');
await clearInventoryItems();

const compactImported = await createInventoryItem(items[0]);
if (compactImported.balanceQty !== 3) throw new Error('Compact import must derive Balance Qty from Qty after parsing');
if (!validateMaterialCouponReservation([{ inventoryItemId: compactImported.id, qty: 1 }], [compactImported]).valid) throw new Error('Compact imported Inventory must be available for Material Coupon');
await clearInventoryItems();

const inspectionPending = await createInventoryItem({ trace: 'QUALITY-INSPECTION', qty: 1, inspectionStatus: 'PENDING' });
if (inspectionPending.qualityStatus !== 'ACCEPTED') throw new Error('Inspection workflow status must not block Quality release by itself');
if (validateMaterialCouponReservation([{ inventoryItemId: inspectionPending.id, qty: 1 }], [inspectionPending]).valid) throw new Error('Pending physical inspection must block Material Coupon reservation');
const qualityRejected = await createInventoryItem({ trace: 'QUALITY-REJECTED', qty: 1, acceptanceStatus: 'REJECTED' });
if (qualityRejected.qualityStatus !== 'REJECTED') throw new Error('Acceptance decision must control Quality release');
if (validateMaterialCouponReservation([{ inventoryItemId: qualityRejected.id, qty: 1 }], [qualityRejected]).valid) throw new Error('Rejected material must not be reservable');
await clearInventoryItems();

const original = { trace: 'INV-1', materialGrade: 'A106', lengthMm: 6000, heatNo: 'H1', status: 'available', disponibilidade: 'Não Disponível', notes: 'keep' };
const before = JSON.stringify(original);
const created = await createInventoryItem(original);
if (created.trace !== 'INV-1') throw new Error('createInventoryItem did not preserve trace');
if ('disponibilidade' in created) throw new Error('Inventory persistence must discard legacy Disponibilidade');
for (const removedKey of ['material', 'description', 'desc', 'length', 'currentLength', 'heat', 'heatNumber', 'totalWeightKg', 'storageLocation', 'comments', 'item']) {
  if (removedKey in created) throw new Error(`Inventory persistence retained removed key: ${removedKey}`);
}
if (JSON.stringify(original) !== before) throw new Error('createInventoryItem mutated input');
if ((await getInventoryItems()).length !== 1) throw new Error('createInventoryItem did not save item');
if ((await getAllInventoryItems()).length !== 1) throw new Error('getAllInventoryItems alias failed');
if (created.balanceQty !== 1) throw new Error('Inventory persistence must use qty when Balance Qty is absent');

const explicitEmpty = await createInventoryItem({ trace: 'INV-EMPTY', qty: 5, balanceQty: 0, status: 'issued', issuedQty: 5 });
if (explicitEmpty.balanceQty !== 0) throw new Error('Explicit exhausted balance must be preserved');

await createInventoryItem({ trace: 'INV-2', materialGrade: 'A36', lengthMm: 3000, heatNo: 'H2', status: 'available' });
const updated = await updateInventoryItem('INV-1', { status: 'reserved' });
if (updated.status !== 'reserved') throw new Error('updateInventoryItem did not update status');
if (updated.notes !== 'keep') throw new Error('updateInventoryItem did not preserve unrelated fields');
const afterUpdate = await getInventoryItems();
if (afterUpdate.find((item) => item.trace === 'INV-2').status !== 'available') throw new Error('updateInventoryItem updated unrelated item');

await deleteInventoryItem('INV-2');
if ((await getInventoryItems()).some((item) => item.trace === 'INV-2')) throw new Error('deleteInventoryItem failed');

await createInventoryItem({ trace: 'INV-3', materialGrade: 'A312', lengthMm: 2000 });
await createInventoryItem({ trace: 'INV-4', materialGrade: 'A333', lengthMm: 2500 });
await createInventoryItem({ trace: 'INV-KEEP', materialGrade: 'A516', lengthMm: 4000 });
await deleteInventoryItems([]);
await deleteInventoryItems(['INV-3', 'INV-4', 'DOES-NOT-EXIST']);
const remaining = await getInventoryItems();
if (!remaining.some((item) => item.trace === 'INV-KEEP')) throw new Error('deleteInventoryItems deleted unrelated item');
if (remaining.some((item) => item.trace === 'INV-3' || item.trace === 'INV-4')) throw new Error('deleteInventoryItems did not delete provided ids');

await clearInventoryItems();
if ((await getInventoryItems()).length !== 0) throw new Error('clearInventoryItems failed');

await createMaterialCoupon({ number: 'MC-PLACEHOLDER' });
await clearMaterialCoupons();
if ((await getAllMaterialCoupons()).length !== 0) throw new Error('clearMaterialCoupons failed');

console.log('inventory import/db and placeholder cleanup tests passed');
