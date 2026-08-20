import { getAllAuditLogEntries } from './auditLog.js';
import { getAllCuttingSheets } from './cuttingSheets.js';
import { listDrawings } from './drawings.js';
import { getAllMaterialCoupons } from './materialCoupons.js';
import { listMaterialTransformations } from './materialTransformations.js';
import { getAllOffcuts } from './offcuts.js';
import { loadReportsData } from './reports.js';
import { getAllReturnMaterialVouchers } from './returnMaterialVouchers.js';
import { listWorkpackLinks } from './workpackLinks.js';
import { listWorkpacks } from './workpacks.js';

function text(value) { return value == null ? '' : String(value).trim(); }
function sameProject(record, projectId) { return !projectId || text(record.projectId) === projectId; }

export async function loadDashboardData() {
  const [reportsData, drawings, workpacks, materialCoupons, cuttingSheets, returnMaterialVouchers, offcuts, auditEvents, materialTransformations, workpackLinks] = await Promise.all([
    loadReportsData(),
    listDrawings(),
    listWorkpacks(),
    getAllMaterialCoupons(),
    getAllCuttingSheets(),
    getAllReturnMaterialVouchers(),
    getAllOffcuts(),
    getAllAuditLogEntries(),
    listMaterialTransformations(),
    listWorkpackLinks(),
  ]);
  const projectId = text(reportsData.scope?.projectId);
  const scopedDrawings = drawings.filter((record) => sameProject(record, projectId));
  const scopedWorkpacks = workpacks.filter((record) => sameProject(record, projectId));
  const workpackIds = new Set(scopedWorkpacks.map((record) => text(record.id)).filter(Boolean));
  const scopedCoupons = materialCoupons.filter((record) => sameProject(record, projectId) || workpackIds.has(text(record.workpackId)));
  const couponIds = new Set(scopedCoupons.map((record) => text(record.id)).filter(Boolean));
  const scopedCuttingSheets = cuttingSheets.filter((record) => sameProject(record, projectId)
    || workpackIds.has(text(record.workpackId)) || couponIds.has(text(record.materialCouponId)));
  const cuttingSheetIds = new Set(scopedCuttingSheets.map((record) => text(record.id)).filter(Boolean));
  const scopedRmvs = returnMaterialVouchers.filter((record) => sameProject(record, projectId)
    || workpackIds.has(text(record.workpackId)) || cuttingSheetIds.has(text(record.cuttingSheetId)));
  return {
    ...reportsData,
    inventory: reportsData.inventoryItems,
    drawings: scopedDrawings,
    workpacks: scopedWorkpacks,
    materialCoupons: scopedCoupons,
    cuttingSheets: scopedCuttingSheets,
    returnMaterialVouchers: scopedRmvs,
    offcuts: offcuts.filter((record) => sameProject(record, projectId)
      || workpackIds.has(text(record.workpackId)) || cuttingSheetIds.has(text(record.cuttingSheetId))),
    auditEvents: auditEvents.filter((record) => sameProject(record, projectId)),
    materialTransformations: materialTransformations.filter((record) => sameProject(record, projectId)
      || workpackIds.has(text(record.workpackId)) || cuttingSheetIds.has(text(record.cuttingSheetId))),
    workpackLinks: workpackLinks.filter((record) => sameProject(record, projectId)
      || workpackIds.has(text(record.workpackId))),
  };
}
