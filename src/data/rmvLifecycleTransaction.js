import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeReturnMaterialVoucher, RMV_STATUS } from './returnMaterialVouchers.js';
import { normalizeOffcut, OFFCUT_STATUS } from './offcuts.js';
import { normalizeAuditEvent, AUDIT_EVENT_TYPES } from './auditLog.js';
import { RMV_LINE_STATUS } from '../core/returnMaterialVoucher.js';
import { createOffcutTraceability } from '../core/offcutTraceability.js';

const STORE_NAMES = Object.freeze([
  'returnMaterialVouchers',
  'inventory',
  'offcuts',
  'auditLog',
  'auditEvents',
]);

function text(value) { return value == null ? '' : String(value).trim(); }
function identity(item = {}) { return [item.id, item.trace, item.traceability].filter(Boolean).map(String); }
function findInventory(items, reference) {
  const target = text(reference);
  return items.find((item) => identity(item).includes(target)) || null;
}
function sourceKey(item = {}) {
  return text(item.sourceCandidateKey || item.metadata?.sourceCandidateKey || item.sourceOffcutId
    || item.traceability || item.trace || [item.parentTrace, item.lengthMm || item.length].filter(Boolean).join('|'));
}
function findOffcut(items, reference) {
  const target = text(reference);
  return items.find((item) => [item.id, item.sourceOffcutId, item.traceability, item.metadata?.sourceCandidateKey, sourceKey(item)]
    .filter(Boolean).map(String).includes(target)) || null;
}
function put(store, value) { store.put(value); return value; }
function saveAudit(stores, input) {
  const event = normalizeAuditEvent(input);
  put(stores.auditLog, event);
  put(stores.auditEvents, event);
  return event;
}
function timestamp(context = {}) {
  return typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
}

function createPendingOffcut(line, parent, existing, rmv, traceability, createdAt, userName) {
  const parentTrace = parent.traceability || parent.trace || parent.id;
  return normalizeOffcut({
    ...(existing || {}),
    projectId: rmv.projectId || parent.projectId,
    workpackId: rmv.workpackId,
    parentInventoryItemId: parent.id || parent.trace,
    newInventoryItemId: '',
    cuttingSheetId: rmv.cuttingSheetId,
    returnMaterialVoucherId: rmv.id,
    material: line.materialGrade || parent.materialGrade,
    heat: line.heatNo || parent.heatNo,
    traceability,
    length: line.lengthMm,
    qty: line.qty || 1,
    status: OFFCUT_STATUS.PENDING_RMV,
    disposition: 'FISCAL_RETURN_PENDING',
    createdAt: existing?.createdAt || createdAt,
    createdBy: existing?.createdBy || userName,
    updatedBy: userName,
    metadata: {
      ...(existing?.metadata || {}),
      sourceCandidateKey: sourceKey(line),
      parentTrace,
      sourceDocumentType: 'RETURN_MATERIAL_VOUCHER',
      sourceDocumentId: rmv.id,
    },
  }, existing);
}

export async function commitRmvIssue(rmv = {}, selectedLineIds = [], context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [storedRmv, inventory, offcuts] = await Promise.all([
      idbRequest(stores.returnMaterialVouchers.get(rmv.id)),
      idbRequest(stores.inventory.getAll()),
      idbRequest(stores.offcuts.getAll()),
    ]);
    if (!storedRmv) throw new Error('RMV_NOT_FOUND');
    if (storedRmv.status !== RMV_STATUS.DRAFT) throw new Error(`STALE_RMV_STATUS:${storedRmv.status}`);
    if (!text(storedRmv.destination)) throw new Error('RMV_DESTINATION_REQUIRED');

    const selectedIds = new Set((Array.isArray(selectedLineIds) ? selectedLineIds : []).map(text).filter(Boolean));
    const selectedLines = storedRmv.returnedItems.filter((line) => selectedIds.has(text(line.id)));
    if (!selectedLines.length) throw new Error('NO_RMV_LINES_SELECTED');
    const issuedAt = timestamp(context);
    const userName = text(context.userName);
    const issuedLines = [];
    const processedSources = new Set();

    for (const [index, line] of selectedLines.entries()) {
      const lineSourceKey = text(line.sourceOffcutId || sourceKey(line));
      if (processedSources.has(lineSourceKey)) throw new Error(`DUPLICATE_RMV_OFFCUT_SOURCE:${lineSourceKey}`);
      processedSources.add(lineSourceKey);
      const parent = findInventory(inventory, line.parentInventoryItemId || line.parentTraceability);
      if (!parent) throw new Error(`RMV_PARENT_INVENTORY_NOT_FOUND:${line.parentTraceability || line.id}`);
      const existing = findOffcut(offcuts, line.sourceOffcutId || sourceKey(line));
      if (existing && [OFFCUT_STATUS.PENDING_RMV, OFFCUT_STATUS.RETURNED_TO_STOCK, OFFCUT_STATUS.SCRAP]
        .includes(existing.status) && text(existing.returnMaterialVoucherId) !== text(storedRmv.id)) {
        throw new Error(`OFFCUT_ALREADY_PROCESSED:${existing.id}`);
      }
      const parentTrace = parent.traceability || parent.trace || parent.id;
      let sequence = index + 1;
      let traceability = text(line.traceability || existing?.traceability);
      while (!traceability) {
        const candidate = createOffcutTraceability(parentTrace, sequence);
        const conflict = inventory.some((item) => text(item.traceability || item.trace) === candidate)
          || offcuts.some((item) => item.id !== existing?.id && item.traceability === candidate);
        if (!conflict) traceability = candidate;
        sequence += 1;
      }
      const offcut = createPendingOffcut(line, parent, existing, storedRmv, traceability, issuedAt, userName);
      if (inventory.some((item) => text(item.traceability || item.trace) === offcut.traceability)) {
        throw new Error(`OFFCUT_TRACEABILITY_ALREADY_IN_INVENTORY:${offcut.traceability}`);
      }
      const traceConflict = offcuts.find((item) => item.id !== offcut.id && item.traceability === offcut.traceability);
      if (traceConflict) throw new Error(`OFFCUT_TRACEABILITY_CONFLICT:${offcut.traceability}`);
      const savedOffcut = { ...offcut, updatedAt: issuedAt };
      put(stores.offcuts, savedOffcut);
      const existingIndex = offcuts.findIndex((item) => item.id === savedOffcut.id);
      if (existingIndex >= 0) offcuts[existingIndex] = savedOffcut;
      else offcuts.push(savedOffcut);
      issuedLines.push({ ...line, sourceOffcutId: savedOffcut.id, traceability: savedOffcut.traceability, status: RMV_LINE_STATUS.PENDING });
      saveAudit(stores, {
        eventType: AUDIT_EVENT_TYPES.GENERATE_RMV,
        entityType: 'OFFCUT', entityId: savedOffcut.id, projectId: storedRmv.projectId,
        timestamp: issuedAt, userName, sourceDocumentType: 'RETURN_MATERIAL_VOUCHER', sourceDocumentId: storedRmv.id,
        reason: 'Offcut linked to RMV and awaiting fiscal receipt.', before: existing || line, after: savedOffcut,
        metadata: { parentInventoryItemId: parent.id || parent.trace, rmvLineId: line.id },
      });
    }

    const savedRmv = {
      ...normalizeReturnMaterialVoucher({
        ...storedRmv,
        status: RMV_STATUS.ISSUED,
        issuedAt,
        issuedBy: userName,
        updatedBy: userName,
        returnedItems: issuedLines,
      }, storedRmv),
      updatedAt: issuedAt,
    };
    put(stores.returnMaterialVouchers, savedRmv);
    saveAudit(stores, {
      eventType: AUDIT_EVENT_TYPES.GENERATE_RMV,
      entityType: 'RETURN_MATERIAL_VOUCHER', entityId: savedRmv.id, projectId: savedRmv.projectId,
      timestamp: issuedAt, userName, sourceDocumentType: 'CUTTING_SHEET', sourceDocumentId: savedRmv.cuttingSheetId,
      reason: 'RMV issued and materials are awaiting receipt.', before: storedRmv, after: savedRmv,
      metadata: { offcutIds: issuedLines.map((line) => line.sourceOffcutId) },
    });
    return { ...savedRmv, __auditCommitted: true };
  });
}

export async function commitRmvCancellation(rmv = {}, context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [storedRmv, offcuts] = await Promise.all([
      idbRequest(stores.returnMaterialVouchers.get(rmv.id)),
      idbRequest(stores.offcuts.getAll()),
    ]);
    if (!storedRmv) throw new Error('RMV_NOT_FOUND');
    if (![RMV_STATUS.DRAFT, RMV_STATUS.ISSUED].includes(storedRmv.status)) {
      throw new Error(`STALE_RMV_STATUS:${storedRmv.status}`);
    }
    if (storedRmv.returnedItems.some((line) => line.status === RMV_LINE_STATUS.RECEIVED)) {
      throw new Error('RMV_HAS_RECEIVED_LINES');
    }
    const cancelledAt = timestamp(context);
    const userName = text(context.userName);
    for (const line of storedRmv.returnedItems) {
      const offcut = findOffcut(offcuts, line.sourceOffcutId);
      if (!offcut || text(offcut.returnMaterialVoucherId) !== text(storedRmv.id)) continue;
      const released = normalizeOffcut({
        ...offcut,
        status: OFFCUT_STATUS.DRAFT,
        returnMaterialVoucherId: '',
        disposition: '',
        updatedBy: userName,
      }, offcut);
      put(stores.offcuts, { ...released, updatedAt: cancelledAt });
    }
    const lines = storedRmv.returnedItems.map((line) => ({ ...line, status: RMV_LINE_STATUS.PENDING }));
    const savedRmv = {
      ...normalizeReturnMaterialVoucher({
        ...storedRmv,
        status: RMV_STATUS.CANCELLED,
        returnedItems: lines,
        updatedBy: userName,
      }, storedRmv),
      updatedAt: cancelledAt,
    };
    put(stores.returnMaterialVouchers, savedRmv);
    saveAudit(stores, {
      eventType: AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT,
      entityType: 'RETURN_MATERIAL_VOUCHER', entityId: savedRmv.id, projectId: savedRmv.projectId,
      timestamp: cancelledAt, userName, sourceDocumentType: 'RETURN_MATERIAL_VOUCHER', sourceDocumentId: savedRmv.id,
      reason: text(context.reason) || 'RMV cancelled before receipt.', before: storedRmv, after: savedRmv,
    });
    return { ...savedRmv, __auditCommitted: true };
  });
}
