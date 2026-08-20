function text(value) {
  return value == null ? '' : String(value).trim();
}

export function operationalWorkpackValue(value) {
  const normalized = text(value);
  if (/^(selecione|selecione um|select|select a|select one|nenhum|none)\s+workpack\.?$/i.test(normalized)) return '';
  return normalized;
}

export function workpackDisplayName(workpacks = [], reference = '', fallback = '') {
  const expected = operationalWorkpackValue(reference).toLocaleUpperCase();
  const workpack = (Array.isArray(workpacks) ? workpacks : []).find((item) => [item.id, item.wpNo, item.title]
    .map((value) => text(value).toLocaleUpperCase()).includes(expected));
  return operationalWorkpackValue(workpack?.wpNo || workpack?.title || fallback || reference);
}

function ids(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

export const WORKPACK_RELATION_TYPES = Object.freeze({
  DRAWING_REVISION: 'DRAWING_REVISION',
  MTO_ITEM: 'MTO_ITEM',
  INVENTORY_ITEM: 'INVENTORY_ITEM',
  NESTING_PLAN: 'NESTING_PLAN',
  MATERIAL_COUPON: 'MATERIAL_COUPON',
  CUTTING_SHEET: 'CUTTING_SHEET',
  RETURN_MATERIAL_VOUCHER: 'RETURN_MATERIAL_VOUCHER',
  OFFCUT: 'OFFCUT',
});

const LEGACY_FIELDS = Object.freeze({
  DRAWING_REVISION: ['drawingRevisionIds', 'drawingIds', 'drawingId'],
  MTO_ITEM: ['mtoItemIds'],
  INVENTORY_ITEM: ['inventoryItemIds'],
  NESTING_PLAN: ['nestingPlanIds'],
  MATERIAL_COUPON: ['materialCouponIds'],
  CUTTING_SHEET: ['cuttingSheetIds'],
  RETURN_MATERIAL_VOUCHER: ['returnMaterialVoucherIds'],
  OFFCUT: ['offcutIds'],
});

export function stripLegacyWorkpackRelations(workpack = {}) {
  const result = { ...workpack };
  Object.values(LEGACY_FIELDS).flat().forEach((field) => delete result[field]);
  return result;
}

function legacyIds(workpack, targetType) {
  return ids((LEGACY_FIELDS[targetType] || []).flatMap((field) => {
    const value = workpack?.[field];
    return Array.isArray(value) ? value : [value];
  }));
}

function relationRecords(workpackId, workpackLinks, targetType) {
  return (Array.isArray(workpackLinks) ? workpackLinks : []).filter((link) => (
    text(link.workpackId) === text(workpackId)
    && text(link.targetType).toUpperCase() === text(targetType).toUpperCase()
  ));
}

/**
 * Active relation records are authoritative. Legacy arrays are read only when
 * no relation record (active or inactive) exists for this Workpack/type.
 */
export function workpackRelationIds(workpack = {}, workpackLinks = [], targetType = '') {
  const records = relationRecords(workpack.id, workpackLinks, targetType);
  if (records.length) {
    return ids(records
      .filter((link) => text(link.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
      .map((link) => link.targetId));
  }
  return legacyIds(workpack, text(targetType).toUpperCase());
}

export function workpackRelations(workpack = {}, workpackLinks = []) {
  return Object.fromEntries(Object.values(WORKPACK_RELATION_TYPES)
    .map((targetType) => [targetType, workpackRelationIds(workpack, workpackLinks, targetType)]));
}

export function legacyWorkpackRelationInputs(workpack = {}, workpackLinks = []) {
  return Object.values(WORKPACK_RELATION_TYPES).flatMap((targetType) => {
    if (relationRecords(workpack.id, workpackLinks, targetType).length) return [];
    return legacyIds(workpack, targetType).map((targetId) => ({
      projectId: text(workpack.projectId),
      workpackId: text(workpack.id),
      targetType,
      targetId,
      relationType: 'CONTAINS',
      status: 'ACTIVE',
      metadata: { migratedFromLegacyWorkpack: true },
    }));
  });
}
