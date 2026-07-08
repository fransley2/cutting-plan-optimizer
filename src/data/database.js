import { openDatabase } from './idb.js';

const DB_NAME = 'NestingAppDB';
const DB_VERSION = 13; // v13: document template store

function createIndexedStore(db, storeName, options, indexes = []) {
  if (db.objectStoreNames.contains(storeName)) return;
  const store = db.createObjectStore(storeName, options);
  indexes.forEach((indexName) => store.createIndex(indexName, indexName, { unique: false }));
}

function upgrade(db) {
  createIndexedStore(db, 'inventory', { keyPath: 'trace' });
  createIndexedStore(db, 'plans', { keyPath: 'name' });
  createIndexedStore(db, 'settings', { keyPath: 'id' });
  createIndexedStore(db, 'projects', { keyPath: 'name' });
  createIndexedStore(db, 'auditEvents', { keyPath: 'id' }, [
    'entityType',
    'entityId',
    'projectId',
    'eventType',
    'timestamp',
    'sourceDocumentType',
    'sourceDocumentId',
  ]);
  createIndexedStore(db, 'stockMovements', { keyPath: 'id' }, [
    'inventoryItemId',
    'projectId',
    'movementType',
    'timestamp',
    'sourceDocumentType',
    'sourceDocumentId',
  ]);
  createIndexedStore(db, 'mtoBatches', { keyPath: 'id' }, [
    'projectId',
    'status',
    'importedAt',
    'fileName',
  ]);
  createIndexedStore(db, 'mtoItems', { keyPath: 'id' }, [
    'batchId',
    'projectId',
    'drawing',
    'mark',
    'pos',
    'material',
    'status',
    'identCode',
    'discipline',
    'type',
  ]);
  createIndexedStore(db, 'cuttingPackages', { keyPath: 'id' }, [
    'projectId',
    'status',
    'createdAt',
    'sourceType',
  ]);
  createIndexedStore(db, 'materialCoupons', { keyPath: 'id' }, [
    'projectId',
    'number',
    'status',
    'createdAt',
    'cuttingPackageId',
  ]);
  createIndexedStore(db, 'cuttingSheets', { keyPath: 'id' }, [
    'projectId',
    'number',
    'status',
    'createdAt',
    'materialCouponId',
    'cuttingPackageId',
  ]);
  createIndexedStore(db, 'returnMaterialVouchers', { keyPath: 'id' }, [
    'projectId',
    'number',
    'status',
    'createdAt',
    'cuttingSheetId',
    'materialCouponId',
  ]);
  createIndexedStore(db, 'offcuts', { keyPath: 'id' }, [
    'projectId',
    'parentInventoryItemId',
    'cuttingSheetId',
    'returnMaterialVoucherId',
    'material',
    'heat',
    'traceability',
    'status',
  ]);
  createIndexedStore(db, 'auditLog', { keyPath: 'id' }, [
    'projectId',
    'entityType',
    'entityId',
    'eventType',
    'timestamp',
    'sourceDocumentType',
    'sourceDocumentId',
  ]);
  createIndexedStore(db, 'equipments', { keyPath: 'id' }, [
    'projectId',
    'code',
    'name',
    'status',
  ]);
  createIndexedStore(db, 'workpacks', { keyPath: 'id' }, [
    'projectId',
    'equipmentId',
    'wpNo',
    'status',
  ]);
  createIndexedStore(db, 'drawings', { keyPath: 'id' }, [
    'projectId',
    'equipmentId',
    'workpackId',
    'drawingNo',
    'revision',
    'status',
  ]);
  createIndexedStore(db, 'documentTemplates', { keyPath: 'id' }, [
    'type',
    'updatedAt',
  ]);
}

// Futuras stores (novos documentos FMS, integrações, etc.) devem entrar neste upgrade(),
// com incremento de DB_VERSION, para manter um unico dono do schema IndexedDB.
export function getDB() {
  return openDatabase(DB_NAME, DB_VERSION, upgrade);
}
