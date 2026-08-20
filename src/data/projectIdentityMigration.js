import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { canonicalizeProjectRecord } from '../core/projectIdentity.js';
import { buildProjectReferenceIssues } from '../core/projectDataQuality.js';

export const PROJECT_CHILD_STORES = Object.freeze([
  'equipments', 'equipmentTypes', 'drawings', 'workpacks', 'workpackLinks',
  'mtoBatches', 'mtoItems', 'inventory', 'materialReservations',
  'materialCoupons', 'cuttingSheets', 'returnMaterialVouchers', 'offcuts',
  'materialTransformations', 'stockMovements', 'auditEvents', 'auditLog', 'plans',
  'taskSheets',
  'purchaseOrders', 'purchaseOrderItems', 'materialReceipts', 'materialUnits', 'mtoPoItemAllocations', 'poDeliveryForecasts',
]);

async function readProjectChildStores(db, storeNames) {
  return idbTransaction(db, storeNames, 'readonly', async (stores) => Object.fromEntries(await Promise.all(
    storeNames.map(async (storeName) => [storeName, await idbRequest(stores[storeName].getAll())]),
  )));
}

export async function inspectChildProjectReferences(projects = []) {
  const db = await getDB();
  const storeNames = PROJECT_CHILD_STORES.filter((storeName) => db.objectStoreNames.contains(storeName));
  if (!storeNames.length) return [];
  const recordsByStore = await readProjectChildStores(db, storeNames);
  return buildProjectReferenceIssues(recordsByStore, projects);
}

export async function migrateChildProjectIds(projects = []) {
  const validProjects = (Array.isArray(projects) ? projects : []).filter((project) => project?.id);
  if (!validProjects.length) return { migratedCount: 0, unresolved: [] };
  const db = await getDB();
  const storeNames = PROJECT_CHILD_STORES.filter((storeName) => db.objectStoreNames.contains(storeName));
  if (!storeNames.length) return { migratedCount: 0, unresolved: [] };
  return idbTransaction(db, storeNames, 'readwrite', async (stores) => {
    const recordsByStore = await Promise.all(storeNames.map(async (storeName) => ({
      storeName,
      records: await idbRequest(stores[storeName].getAll()),
    })));
    let migratedCount = 0;
    const unresolved = new Set();
    recordsByStore.forEach(({ storeName, records }) => {
      (records || []).forEach((record) => {
        const result = canonicalizeProjectRecord(record, validProjects);
        if (result.unresolved) unresolved.add(result.unresolved);
        if (!result.changed) return;
        stores[storeName].put(result.record);
        migratedCount += 1;
      });
    });
    return { migratedCount, unresolved: [...unresolved].sort() };
  });
}
