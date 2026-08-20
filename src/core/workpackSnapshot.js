import { workpackRelationIds, WORKPACK_RELATION_TYPES } from './workpackRelations.js';

function recordsByIds(records = [], ids = []) {
  const wanted = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  return (Array.isArray(records) ? records : []).filter((record) => wanted.has(record?.id)).map((record) => structuredClone(record));
}

export function buildWorkpackReleaseSnapshot(workpack = {}, sources = {}, options = {}) {
  const links = sources.workpackLinks || [];
  const drawingIds = workpackRelationIds(workpack, links, WORKPACK_RELATION_TYPES.DRAWING_REVISION);
  return {
    version: 1,
    createdAt: typeof options.nowFactory === 'function' ? options.nowFactory() : new Date().toISOString(),
    createdBy: String(options.userName || ''),
    projectId: String(workpack.projectId || ''),
    equipmentId: String(workpack.equipmentId || ''),
    workpackId: String(workpack.id || ''),
    workpackNumber: String(workpack.wpNo || ''),
    sourceType: String(workpack.sourceType || 'MTO_LINES'),
    drawings: recordsByIds(sources.drawings, drawingIds),
    mtoItems: recordsByIds(sources.mtoItems, workpackRelationIds(workpack, links, WORKPACK_RELATION_TYPES.MTO_ITEM)),
    inventoryItems: recordsByIds(sources.inventoryItems, workpackRelationIds(workpack, links, WORKPACK_RELATION_TYPES.INVENTORY_ITEM)),
    materialCoupons: recordsByIds(sources.materialCoupons, workpackRelationIds(workpack, links, WORKPACK_RELATION_TYPES.MATERIAL_COUPON)),
    cuttingSheets: recordsByIds(sources.cuttingSheets, workpackRelationIds(workpack, links, WORKPACK_RELATION_TYPES.CUTTING_SHEET)),
  };
}
