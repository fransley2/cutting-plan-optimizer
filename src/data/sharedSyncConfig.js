export const SHARED_SYNC_STORES = Object.freeze([
  { key: 'projects', storeName: 'projects', fileName: 'projects.json' },
  { key: 'equipments', storeName: 'equipments', fileName: 'equipments.json' },
  { key: 'drawings', storeName: 'drawings', fileName: 'drawings.json' },
  { key: 'mto-batches', storeName: 'mtoBatches', fileName: 'mto-batches.json' },
  { key: 'mto', storeName: 'mtoItems', fileName: 'mto.json' },
  { key: 'mto-po-item-allocations', storeName: 'mtoPoItemAllocations', fileName: 'mto-po-item-allocations.json' },
  { key: 'organizations', storeName: 'organizations', fileName: 'organizations.json' },
  { key: 'organization-contacts', storeName: 'organizationContacts', fileName: 'organization-contacts.json' },
  { key: 'po', storeName: 'purchaseOrders', fileName: 'po.json' },
  { key: 'po-revisions', storeName: 'purchaseOrderRevisions', fileName: 'po-revisions.json' },
  { key: 'po-items', storeName: 'purchaseOrderItems', fileName: 'po-items.json' },
  { key: 'material-receipts', storeName: 'materialReceipts', fileName: 'material-receipts.json' },
  { key: 'material-receipt-lines', storeName: 'materialReceiptLines', fileName: 'material-receipt-lines.json' },
  { key: 'material-units', storeName: 'materialUnits', fileName: 'material-units.json' },
  { key: 'po-delivery-forecasts', storeName: 'poDeliveryForecasts', fileName: 'po-delivery-forecasts.json' },
  { key: 'inventory', storeName: 'inventory', fileName: 'inventory.json' },
  { key: 'stock-movements', storeName: 'stockMovements', fileName: 'stock-movements.json' },
  { key: 'material-reservations', storeName: 'materialReservations', fileName: 'material-reservations.json' },
  { key: 'material-transformations', storeName: 'materialTransformations', fileName: 'material-transformations.json' },
  { key: 'offcuts', storeName: 'offcuts', fileName: 'offcuts.json' },
  { key: 'workpacks', storeName: 'workpacks', fileName: 'workpacks.json' },
  { key: 'workpack-links', storeName: 'workpackLinks', fileName: 'workpack-links.json' },
  { key: 'task-sheets', storeName: 'taskSheets', fileName: 'task-sheets.json' },
  { key: 'coupons', storeName: 'materialCoupons', fileName: 'coupons.json' },
  { key: 'cutting-sheets', storeName: 'cuttingSheets', fileName: 'cutting-sheets.json' },
  { key: 'return-material-vouchers', storeName: 'returnMaterialVouchers', fileName: 'return-material-vouchers.json' },
  { key: 'audit-events', storeName: 'auditEvents', fileName: 'audit-events.json' },
  { key: 'audit-log', storeName: 'auditLog', fileName: 'audit-log.json' },
]);

export const PHASE_SYNC_STORE_KEYS = Object.freeze({
  projects: ['projects'],
  equipments: ['projects', 'equipments'],
  drawings: ['projects', 'equipments', 'drawings'],
  mto: ['mto-batches', 'mto', 'mto-po-item-allocations'],
  procurement: ['organizations', 'organization-contacts', 'po', 'po-revisions', 'po-items', 'material-receipts', 'material-receipt-lines', 'material-units', 'po-delivery-forecasts', 'mto-po-item-allocations'],
  inventory: ['inventory', 'material-units', 'stock-movements', 'material-reservations', 'material-transformations', 'offcuts'],
  workpacks: ['workpacks', 'workpack-links', 'task-sheets'],
  'material-coupons': ['coupons'],
  'cut-sheets': ['coupons', 'cutting-sheets', 'offcuts', 'material-transformations'],
  'return-material': ['return-material-vouchers', 'offcuts', 'inventory', 'stock-movements', 'material-transformations'],
  audit: ['audit-events', 'audit-log', 'stock-movements'],
});

export function syncKeysForPhase(phase) {
  return [...(PHASE_SYNC_STORE_KEYS[phase] || [])];
}
