import { openDatabase } from './idb.js';

const DB_NAME = 'NestingAppDB';
const DB_VERSION = 23; // v23: auditable partial delivery forecasts per PO item

function createIndexedStore(db, storeName, options, indexes = []) {
  const store = db.objectStoreNames.contains(storeName) ? null : db.createObjectStore(storeName, options);
  if (!store) return;
  indexes.forEach((index) => {
    const definition = typeof index === 'string' ? { name: index, keyPath: index } : index;
    store.createIndex(definition.name, definition.keyPath, { unique: definition.unique === true });
  });
}

function upgrade(db, oldVersion = 0, transaction = null) {
  createIndexedStore(db, 'inventory', { keyPath: 'trace' });
  createIndexedStore(db, 'plans', { keyPath: 'name' });
  createIndexedStore(db, 'settings', { keyPath: 'id' });
  createIndexedStore(db, 'users', { keyPath: 'id' }, [
    'name',
    'active',
    'createdAt',
  ]);
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
  if (oldVersion < 16 && db.objectStoreNames.contains('cuttingPackages')) {
    db.deleteObjectStore('cuttingPackages');
  }
  createIndexedStore(db, 'materialCoupons', { keyPath: 'id' }, [
    'projectId',
    'number',
    'status',
    'createdAt',
    'workpackId',
  ]);
  createIndexedStore(db, 'cuttingSheets', { keyPath: 'id' }, [
    'projectId',
    'number',
    'status',
    'createdAt',
    'materialCouponId',
    'workpackId',
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
    'equipmentTypeId',
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
  if (oldVersion < 20 && db.objectStoreNames.contains('equipments')) {
    const equipments = transaction?.objectStore('equipments');
    if (equipments && !equipments.indexNames.contains('equipmentTypeId')) {
      equipments.createIndex('equipmentTypeId', 'equipmentTypeId', { unique: false });
    }
  }
  createIndexedStore(db, 'workpackLinks', { keyPath: 'id' }, [
    'projectId',
    'workpackId',
    'targetType',
    'targetId',
    'relationType',
    'status',
  ]);
  createIndexedStore(db, 'materialReservations', { keyPath: 'id' }, [
    'projectId',
    'workpackId',
    'inventoryItemId',
    'mtoItemId',
    'materialCouponId',
    'status',
  ]);
  createIndexedStore(db, 'materialTransformations', { keyPath: 'id' }, [
    'projectId',
    'workpackId',
    'cuttingSheetId',
    'parentInventoryItemId',
    'outputType',
    'outputId',
    'mtoItemId',
  ]);
  createIndexedStore(db, 'taskSheets', { keyPath: 'id' }, [
    'projectId',
    'workpackId',
    'equipmentId',
    'number',
    'status',
    'updatedAt',
  ]);
  if (oldVersion < 15 && db.objectStoreNames.contains('workpacks')) {
    const workpacks = transaction?.objectStore('workpacks');
    if (workpacks) ['workpackType', 'priority', 'plannedStartDate', 'updatedAt'].forEach((indexName) => {
      if (!workpacks.indexNames.contains(indexName)) workpacks.createIndex(indexName, indexName, { unique: false });
    });
  }
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
  createIndexedStore(db, 'organizations', { keyPath: 'id' }, [
    'vendorCode',
    'legalName',
    'status',
  ]);
  createIndexedStore(db, 'organizationContacts', { keyPath: 'id' }, [
    'organizationId',
    'isActive',
  ]);
  createIndexedStore(db, 'purchaseOrders', { keyPath: 'id' }, [
    'projectId',
    'supplierId',
    'poNumber',
    'status',
    { name: 'projectPoNumber', keyPath: ['projectId', 'poNumber'] },
  ]);
  createIndexedStore(db, 'purchaseOrderRevisions', { keyPath: 'id' }, [
    'purchaseOrderId',
    'revision',
    'isCurrent',
  ]);
  createIndexedStore(db, 'purchaseOrderItems', { keyPath: 'id' }, [
    'purchaseOrderId',
    'projectId',
    'materialCode',
    'identCode',
    'status',
    { name: 'purchaseOrderItemNumber', keyPath: ['purchaseOrderId', 'itemNumber'] },
  ]);
  createIndexedStore(db, 'materialReceipts', { keyPath: 'id' }, [
    'projectId',
    'supplierId',
    'receiptNumber',
    'status',
    'arrivalDate',
  ]);
  createIndexedStore(db, 'materialReceiptLines', { keyPath: 'id' }, [
    'receiptId',
    'purchaseOrderId',
    'poItemId',
    'inspectionStatus',
    { name: 'poItemInspectionStatus', keyPath: ['poItemId', 'inspectionStatus'] },
  ]);
  createIndexedStore(db, 'materialUnits', { keyPath: 'id' }, [
    'projectId',
    'poItemId',
    'receiptLineId',
    'supplierId',
    'manufacturerId',
    'traceability',
    'heatNumber',
    'inspectionStatus',
    'inventoryStatus',
  ]);
  createIndexedStore(db, 'mtoPoItemAllocations', { keyPath: 'id' }, [
    'projectId',
    'mtoLineId',
    'poItemId',
    'status',
    { name: 'mtoPoItem', keyPath: ['mtoLineId', 'poItemId'] },
  ]);
  createIndexedStore(db, 'poDeliveryForecasts', { keyPath: 'id' }, [
    'projectId',
    'purchaseOrderId',
    'poItemId',
    'stage',
    'customsChannel',
    'ctcoForecastDate',
    'status',
  ]);
  if (oldVersion < 14) {
    createIndexedStore(db, 'equipmentTypes', { keyPath: 'id' }, [
      'projectId',
      'category',
      'name',
    ]);
  }
}

// Futuras stores (novos documentos FMS, integrações, etc.) devem entrar neste upgrade(),
// com incremento de DB_VERSION, para manter um unico dono do schema IndexedDB.
export function getDB() {
  return openDatabase(DB_NAME, DB_VERSION, upgrade);
}
