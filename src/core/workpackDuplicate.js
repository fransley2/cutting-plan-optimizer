import { normalizeWorkpackOperations } from './workpackOperations.js';

export function duplicateWorkpack(source = {}) {
  const copy = structuredClone(source);
  const operations = normalizeWorkpackOperations(copy.operations).map((operation) => ({ ...operation, id: crypto.randomUUID(), status: ['COMPLETED', 'IN_PROGRESS', 'ON_HOLD'].includes(operation.status) ? 'NOT_STARTED' : operation.status, actualStartDate: '', actualFinishDate: '', actualManHours: 0 }));
  const { drawingIds, drawingRevisionIds, mtoItemIds, inventoryItemIds, materialCouponIds, cuttingSheetIds, returnMaterialVoucherIds, nestingPlanIds, offcutIds, ...base } = copy;
  return { ...base, id: '', wpNo: `${copy.wpNo || 'WORKPACK'}-COPY`, status: 'DRAFT', manualProgress: null, progressOverrideReason: '', actualStartDate: '', actualFinishDate: '', actualManHours: 0, drawingId: '', matchIds: [], operations };
}
