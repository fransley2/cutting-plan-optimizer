import { getAllPlans } from './plans.js';
import { getAllProjects } from './projects.js';
import { getInventoryItems } from './inventoryDB.js';
import { getProfile } from './profile.js';
import { getAppSettings } from './appSettings.js';
import { getAllAuditEvents, getAllAuditLogEntries } from './auditLog.js';
import { getAllStockMovements } from './stockMovements.js';
import { getAllMtoBatches, getMtoItems } from './mtoDB.js';
import { getAllCuttingPackages } from './cuttingPackages.js';
import { getAllMaterialCoupons } from './materialCoupons.js';
import { getAllCuttingSheets } from './cuttingSheets.js';
import { getAllReturnMaterialVouchers } from './returnMaterialVouchers.js';
import { getAllOffcuts } from './offcuts.js';

export async function exportFullBackup() {
  const [
    plans,
    projects,
    inventory,
    profile,
    appSettings,
    auditEvents,
    auditLog,
    stockMovements,
    mtoBatches,
    mtoItems,
    cuttingPackages,
    materialCoupons,
    cuttingSheets,
    returnMaterialVouchers,
    offcuts,
  ] = await Promise.all([
    getAllPlans(),
    getAllProjects(),
    getInventoryItems(),
    getProfile(),
    getAppSettings(),
    getAllAuditEvents(),
    getAllAuditLogEntries(),
    getAllStockMovements(),
    getAllMtoBatches(),
    getMtoItems(),
    getAllCuttingPackages(),
    getAllMaterialCoupons(),
    getAllCuttingSheets(),
    getAllReturnMaterialVouchers(),
    getAllOffcuts(),
  ]);
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    plans,
    projects,
    inventory,
    profile,
    appSettings,
    auditEvents,
    auditLog,
    stockMovements,
    mtoBatches,
    mtoItems,
    cuttingPackages,
    materialCoupons,
    cuttingSheets,
    returnMaterialVouchers,
    offcuts,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup-cutting-plan-optimizer-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importFullBackup(file) {
  const text = await file.text();
  const backup = JSON.parse(text);
  if (!backup || typeof backup !== 'object' || !backup.version) {
    throw new Error('Arquivo de backup invalido.');
  }
  return {
    ...backup,
    auditEvents: Array.isArray(backup.auditEvents) ? backup.auditEvents : [],
    auditLog: Array.isArray(backup.auditLog) ? backup.auditLog : [],
    stockMovements: Array.isArray(backup.stockMovements) ? backup.stockMovements : [],
    mtoBatches: Array.isArray(backup.mtoBatches) ? backup.mtoBatches : [],
    mtoItems: Array.isArray(backup.mtoItems) ? backup.mtoItems : [],
    cuttingPackages: Array.isArray(backup.cuttingPackages) ? backup.cuttingPackages : [],
    materialCoupons: Array.isArray(backup.materialCoupons) ? backup.materialCoupons : [],
    cuttingSheets: Array.isArray(backup.cuttingSheets) ? backup.cuttingSheets : [],
    returnMaterialVouchers: Array.isArray(backup.returnMaterialVouchers) ? backup.returnMaterialVouchers : [],
    offcuts: Array.isArray(backup.offcuts) ? backup.offcuts : [],
  }; // The caller writes data back after confirmation.
}
