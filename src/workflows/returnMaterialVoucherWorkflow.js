import {
  RMV_LINE_STATUS,
  buildRmvGeneralNotesDraft,
  buildRmvReferenceDraft,
  nextReturnMaterialVoucherNumber,
  normalizeRmvLine,
} from '../core/returnMaterialVoucher.js';
import { RMV_STATUS } from '../data/returnMaterialVouchers.js';

function text(value) { return value == null ? '' : String(value).trim(); }
function now(context = {}) { return typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString(); }
function required(dependencies, name) {
  if (typeof dependencies[name] !== 'function') throw new Error(`Missing RMV dependency: ${name}`);
  return dependencies[name];
}

export async function createOrReuseRmvDraft({ cuttingSheet = {}, offcuts = [], context = {}, dependencies = {} } = {}) {
  const listRmvs = required(dependencies, 'listRmvs');
  const saveRmv = required(dependencies, 'saveRmv');
  const existing = context.reuseExisting === false ? null : (await listRmvs()).find((rmv) => rmv.cuttingSheetId === cuttingSheet.id
    && ![RMV_STATUS.CANCELLED, RMV_STATUS.CLOSED, RMV_STATUS.RETURNED].includes(rmv.status));
  if (existing) return existing;
  const eligibleOffcuts = (Array.isArray(offcuts) ? offcuts : []).filter((offcut) => {
    const length = Number(offcut.lengthMm ?? offcut.length ?? offcut.remaining);
    return Number.isFinite(length) && length > 0 && text(offcut.parentInventoryItemId || offcut.parentTrace || offcut.parentTraceability);
  });
  if (!eligibleOffcuts.length) throw new Error('NO_ELIGIBLE_OFFCUTS');

  const listInventory = required(dependencies, 'listInventory');
  const inventory = await listInventory();
  const parents = new Map((Array.isArray(inventory) ? inventory : []).flatMap((item) => [item.id, item.trace, item.traceability]
    .filter(Boolean).map((key) => [String(key), item])));
  const lines = eligibleOffcuts.map((offcut) => normalizeRmvLine(offcut, parents.get(text(offcut.parentInventoryItemId || offcut.parentTrace)) || {}));
  const records = await listRmvs();
  return saveRmv({
    projectId: text(cuttingSheet.projectId || context.projectId),
    workpackId: text(cuttingSheet.workpackId || context.workpackId),
    cuttingSheetId: text(cuttingSheet.id),
    materialCouponId: text(cuttingSheet.materialCouponId),
    number: nextReturnMaterialVoucherNumber(records, context.projectShortCode),
    status: RMV_STATUS.DRAFT,
    date: text(context.date) || now(context).slice(0, 10),
    origin: text(context.origin),
    destination: text(context.destination),
    drawingReference: text(context.drawingReference),
    reference: text(context.reference) || buildRmvReferenceDraft({
      ...context,
      cuttingSheetNumber: text(cuttingSheet.number),
    }, context.configuredReference),
    notes: text(context.notes) || buildRmvGeneralNotesDraft({
      ...context,
      cuttingSheetNumber: text(cuttingSheet.number),
    }, context.configuredNotes),
    createdBy: text(context.userName),
    updatedBy: text(context.userName),
    returnedItems: lines,
    metadata: {
      cuttingSheetNumber: text(cuttingSheet.number),
      materialCouponNumber: text(context.materialCouponNumber),
      workpackNumber: text(context.workpackNumber),
      ...(context.originLocked === true ? { originLocked: true } : {}),
      ...(context.reportOptions ? { reportOptions: structuredClone(context.reportOptions) } : {}),
    },
  });
}

export async function issueRmv(rmv = {}, selectedLineIds = [], context = {}, dependencies = {}) {
  if (rmv.status !== RMV_STATUS.DRAFT) throw new Error('Only draft RMVs can be issued.');
  const selected = new Set(selectedLineIds.map(text));
  const lines = rmv.returnedItems.filter((line) => selected.has(line.id));
  if (!lines.length) throw new Error('Select at least one returned material.');
  if (!text(rmv.destination)) throw new Error('RMV destination is required.');
  const preparedRmv = rmv.metadata?.reportOptions || !context.reportOptions
    ? rmv
    : { ...rmv, metadata: { ...(rmv.metadata || {}), reportOptions: structuredClone(context.reportOptions) } };
  return required(dependencies, 'commitIssue')(preparedRmv, [...selected], context);
}

export async function receiveRmvLines(rmv = {}, lineIds = [], context = {}, dependencies = {}) {
  if (![RMV_STATUS.ISSUED, RMV_STATUS.PARTIALLY_RECEIVED].includes(rmv.status)) throw new Error('RMV is not awaiting receipt.');
  const selected = new Set(lineIds.map(text));
  if (!selected.size) throw new Error('Select at least one pending RMV line.');
  return required(dependencies, 'commitReceipt')(rmv, [...selected], context);
}

export async function cancelRmv(rmv = {}, context = {}, dependencies = {}) {
  if (rmv.returnedItems.some((line) => line.status === RMV_LINE_STATUS.RECEIVED)) throw new Error('An RMV with received lines cannot be cancelled.');
  return required(dependencies, 'commitCancel')(rmv, context);
}
