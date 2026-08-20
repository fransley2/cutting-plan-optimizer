import {
  RETURN_OFFCUT_MODES,
  returnOffcutsToStock,
} from './returnOffcutsToStock.js';
import { OFFCUT_STATUS } from '../data/offcuts.js';
import { STOCK_MOVEMENT_TYPES } from '../data/stockMovements.js';
import { AUDIT_EVENT_TYPES } from '../data/auditLog.js';
import { classifyOffcutLength, OFFCUT_CLASSIFICATION } from '../core/offcutClassification.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function offcutSourceKey(offcut = {}) {
  return text(
    offcut.sourceCandidateKey
    || offcut.metadata?.sourceCandidateKey
    || offcut.sourceOffcutId
    || offcut.traceability
    || offcut.trace
    || [offcut.parentTrace, offcut.lengthMm || offcut.length].filter(Boolean).join('|'),
  );
}

function parentReference(offcut = {}) {
  return text(
    offcut.parentInventoryItemId
    || offcut.parentStockId
    || offcut.parentInventoryId
    || offcut.parentTrace
    || offcut.parentTraceability
    || offcut.metadata?.parentTrace,
  );
}

function processedStatus(status) {
  return [OFFCUT_STATUS.PENDING_RMV, OFFCUT_STATUS.RETURNED_TO_STOCK, OFFCUT_STATUS.SCRAP, OFFCUT_STATUS.CANCELLED].includes(text(status));
}

function requireDependency(dependencies, name) {
  if (typeof dependencies[name] !== 'function') throw new Error(`Missing offcut dependency: ${name}`);
  return dependencies[name];
}

export async function processOffcutDisposition({
  offcuts = [],
  mode = RETURN_OFFCUT_MODES.OPERATIONAL_STOCK,
  context = {},
  dependencies = {},
} = {}) {
  const getInventoryItem = requireDependency(dependencies, 'getInventoryItem');
  const createInventoryItem = requireDependency(dependencies, 'createInventoryItem');
  const saveOffcut = requireDependency(dependencies, 'saveOffcut');
  const createStockMovement = requireDependency(dependencies, 'createStockMovement');
  const createAuditEvent = requireDependency(dependencies, 'createAuditEvent');
  const existingOffcuts = typeof dependencies.listOffcuts === 'function' ? await dependencies.listOffcuts() : [];
  const results = { processed: [], skipped: [], inventoryItems: [], movements: [], auditEvents: [] };

  for (const [index, source] of (Array.isArray(offcuts) ? offcuts : []).entries()) {
    const sourceLength = numberValue(source.lengthMm ?? source.length ?? source.remaining);
    if (mode !== RETURN_OFFCUT_MODES.SCRAP && classifyOffcutLength(sourceLength) !== OFFCUT_CLASSIFICATION.REUSABLE) {
      throw new Error('Somente sobras com 500 mm ou mais podem retornar ao estoque ou seguir por RMV.');
    }
    const sourceKey = offcutSourceKey(source);
    const existing = existingOffcuts.find((item) => offcutSourceKey(item) === sourceKey);
    if (existing && processedStatus(existing.status)) {
      results.skipped.push(existing);
      continue;
    }

    const reference = parentReference(source);
    const parentInventory = reference ? await getInventoryItem(reference) : null;
    if (!parentInventory) throw new Error(`Parent Inventory item not found for offcut ${sourceKey || index + 1}.`);

    const generated = returnOffcutsToStock([source], {
      id: text(context.sourceDocumentId),
      stockItem: parentInventory,
    }, mode, {
      traceStartIndex: Number(context.traceStartIndex || 1) + index,
      nowFactory: context.nowFactory,
      idFactory: context.idFactory,
    });
    const workflowItem = generated.inventoryItemsToAdd[0] || generated.scrapItems[0] || generated.rmvItems[0];
    if (!workflowItem) throw new Error(`Unsupported offcut disposition mode: ${mode}`);

    let inventoryItem = null;
    if (mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK) {
      inventoryItem = await createInventoryItem({
        ...parentInventory,
        ...workflowItem,
        id: workflowItem.traceability,
        trace: workflowItem.traceability,
        traceability: workflowItem.traceability,
        status: 'available',
        balanceQty: numberValue(workflowItem.qty) || 1,
        reservedQty: 0,
        projectId: text(context.projectId || parentInventory.projectId),
        parentStockId: parentInventory.id || parentInventory.trace,
        parentInventoryItemId: parentInventory.id || parentInventory.trace,
        parentTraceability: parentInventory.traceability || parentInventory.trace,
        sourceDocumentId: text(context.sourceDocumentId),
        source: 'OFFCUT_RETURN',
        sourceType: 'OFFCUT',
        isOffcut: true,
      });
      results.inventoryItems.push(inventoryItem);
    }

    const nextStatus = mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK
      ? OFFCUT_STATUS.RETURNED_TO_STOCK
      : mode === RETURN_OFFCUT_MODES.FISCAL_RETURN_PENDING
        ? OFFCUT_STATUS.PENDING_RMV
        : OFFCUT_STATUS.SCRAP;
    const offcutRecord = await saveOffcut({
      ...(existing || {}),
      projectId: text(context.projectId || parentInventory.projectId),
      workpackId: text(context.workpackId),
      parentInventoryItemId: parentInventory.id || parentInventory.trace,
      newInventoryItemId: inventoryItem?.id || '',
      cuttingSheetId: text(context.cuttingSheetId),
      returnMaterialVoucherId: text(context.returnMaterialVoucherId || context.rmvId),
      material: workflowItem.materialGrade,
      heat: workflowItem.heatNo,
      traceability: workflowItem.traceability,
      length: workflowItem.lengthMm,
      qty: workflowItem.qty,
      status: nextStatus,
      disposition: mode,
      createdBy: text(context.userName),
      updatedBy: text(context.userName),
      metadata: {
        ...(existing?.metadata || {}),
        ...(source.metadata || {}),
        sourceCandidateKey: sourceKey,
        parentTrace: parentInventory.traceability || parentInventory.trace,
        sourceDocumentType: text(context.sourceDocumentType),
        sourceDocumentId: text(context.sourceDocumentId),
        scrapReason: workflowItem.scrapReason || '',
      },
    });

    const eventType = mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK
      ? AUDIT_EVENT_TYPES.RETURN_OFFCUT
      : mode === RETURN_OFFCUT_MODES.FISCAL_RETURN_PENDING
        ? AUDIT_EVENT_TYPES.GENERATE_RMV
        : AUDIT_EVENT_TYPES.SCRAP_OFFCUT;
    if (mode === RETURN_OFFCUT_MODES.FISCAL_RETURN_PENDING) {
      const auditEvent = await createAuditEvent({
        eventType,
        entityType: 'OFFCUT',
        entityId: offcutRecord.id,
        projectId: offcutRecord.projectId,
        userName: text(context.userName),
        sourceDocumentType: 'RETURN_MATERIAL_VOUCHER',
        sourceDocumentId: text(context.returnMaterialVoucherId || context.rmvId),
        reason: 'Offcut linked to RMV and awaiting fiscal receipt.',
        before: existing || source,
        after: offcutRecord,
        metadata: { disposition: mode, parentInventoryItemId: parentInventory.id || parentInventory.trace },
      });
      results.processed.push(offcutRecord);
      existingOffcuts.push(offcutRecord);
      results.auditEvents.push(auditEvent);
      continue;
    }
    const movementType = mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK
      ? STOCK_MOVEMENT_TYPES.RETURN_OFFCUT
      : STOCK_MOVEMENT_TYPES.SCRAP_OFFCUT;
    const movement = await createStockMovement({
      movementType,
      inventoryItemId: inventoryItem?.id || parentInventory.id || parentInventory.trace,
      projectId: offcutRecord.projectId,
      userName: text(context.userName),
      quantityDelta: mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK ? numberValue(workflowItem.qty) || 1 : 0,
      lengthDelta: mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK ? numberValue(workflowItem.lengthMm) : 0,
      previousStatus: existing?.status || OFFCUT_STATUS.DRAFT,
      nextStatus,
      sourceDocumentType: text(context.sourceDocumentType || 'OFFCUT'),
      sourceDocumentId: text(context.sourceDocumentId || offcutRecord.id),
      reason: mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK ? 'Reusable offcut returned to Inventory.' : workflowItem.scrapReason,
      before: existing || source,
      after: inventoryItem || offcutRecord,
      metadata: { offcutId: offcutRecord.id, parentInventoryItemId: parentInventory.id || parentInventory.trace },
    });
    const auditEvent = await createAuditEvent({
      eventType,
      entityType: 'OFFCUT',
      entityId: offcutRecord.id,
      projectId: offcutRecord.projectId,
      userName: text(context.userName),
      sourceDocumentType: text(context.sourceDocumentType || 'OFFCUT'),
      sourceDocumentId: text(context.sourceDocumentId || offcutRecord.id),
      reason: movement.reason,
      before: existing || source,
      after: inventoryItem || offcutRecord,
      metadata: {
        movementId: movement.id,
        inventoryItemId: inventoryItem?.id || '',
        parentInventoryItemId: parentInventory.id || parentInventory.trace,
        disposition: mode,
      },
    });

    results.processed.push(offcutRecord);
    existingOffcuts.push(offcutRecord);
    results.movements.push(movement);
    results.auditEvents.push(auditEvent);
  }

  return results;
}
