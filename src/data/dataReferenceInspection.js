import { buildEntityReferenceIssues } from '../core/entityReferenceQuality.js';
import { inspectChildProjectReferences } from './projectIdentityMigration.js';
import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';

const REFERENCE_STORES = Object.freeze([
  'equipments', 'equipmentTypes', 'drawings', 'mtoItems', 'workpacks', 'workpackLinks',
  'purchaseOrderItems', 'mtoPoItemAllocations', 'poDeliveryForecasts', 'materialReceiptLines', 'materialUnits', 'inventory',
  'plans', 'materialCoupons', 'cuttingSheets', 'returnMaterialVouchers', 'offcuts',
]);

async function readReferenceStores() {
  const db = await getDB();
  const storeNames = REFERENCE_STORES.filter((storeName) => db.objectStoreNames.contains(storeName));
  if (!storeNames.length) return {};
  return idbTransaction(db, storeNames, 'readonly', async (stores) => Object.fromEntries(await Promise.all(
    storeNames.map(async (storeName) => [storeName, await idbRequest(stores[storeName].getAll())]),
  )));
}

function normalizeProjectIssue(issue) {
  return {
    ...issue,
    domain: 'PROJECT',
    referenceField: 'projectId',
    targetType: 'PROJECT',
    suggestedReferenceId: issue.suggestedProjectId || '',
  };
}

export async function inspectAllDataReferences(projects = []) {
  const [projectIssues, recordsByStore] = await Promise.all([
    inspectChildProjectReferences(projects),
    readReferenceStores(),
  ]);
  return [
    ...projectIssues.map(normalizeProjectIssue),
    ...buildEntityReferenceIssues(recordsByStore),
  ];
}
