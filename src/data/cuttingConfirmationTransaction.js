import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { normalizeAuditEvent, AUDIT_EVENT_TYPES } from './auditLog.js';
import { normalizeMaterialTransformation } from './materialTransformations.js';
import { normalizeCuttingSheet } from './cuttingSheets.js';
import { normalizeOffcut, OFFCUT_STATUS } from './offcuts.js';
import { MATERIAL_TRANSFORMATION_TYPES } from './materialTransformations.js';

const STORE_NAMES = Object.freeze([
  'inventory',
  'stockMovements',
  'materialTransformations',
  'cuttingSheets',
  'offcuts',
  'auditLog',
  'auditEvents',
]);

function inventoryIdentity(item = {}) {
  return [item.id, item.trace, item.traceability].filter(Boolean).map(String);
}

function findInventoryItem(items, id) {
  const target = String(id || '');
  return items.find((item) => inventoryIdentity(item).includes(target)) || null;
}

function requestPut(store, value) {
  store.put(value);
  return value;
}

export async function commitCuttingConfirmation(cuttingSheet = {}, genealogy = {}, context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [inventoryItems, offcuts, storedSheet] = await Promise.all([
      idbRequest(stores.inventory.getAll()),
      idbRequest(stores.offcuts.getAll()),
      idbRequest(stores.cuttingSheets.get(cuttingSheet.id)),
    ]);
    if (!storedSheet) throw new Error(`Cutting Sheet not found: ${cuttingSheet.id}`);

    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const transformations = genealogy.transformations.map((item) => normalizeMaterialTransformation(item));
    transformations.forEach((item) => requestPut(stores.materialTransformations, item));

    const movements = [];
    const parentIds = [...new Set(transformations.map((item) => item.parentInventoryItemId))];
    parentIds.forEach((inventoryItemId) => {
      const current = findInventoryItem(inventoryItems, inventoryItemId);
      if (!current) throw new Error(`Inventory item not found: ${inventoryItemId}`);
      const next = normalizeInventoryItem({ ...current, status: 'consumed', updatedAt: timestamp });
      requestPut(stores.inventory, next);
      const movement = normalizeStockMovement({
        movementType: STOCK_MOVEMENT_TYPES.CONSUME_STOCK,
        inventoryItemId,
        projectId: cuttingSheet.projectId,
        timestamp,
        userName: context.userName || '',
        quantityDelta: 0,
        previousStatus: current.status,
        nextStatus: 'consumed',
        sourceDocumentType: 'CUTTING_SHEET',
        sourceDocumentId: cuttingSheet.id,
        reason: 'Cut execution confirmed.',
        before: current,
        after: next,
        metadata: { workpackId: cuttingSheet.workpackId },
      });
      requestPut(stores.stockMovements, movement);
      movements.push(movement);
    });

    const changedOffcuts = [];
    transformations
      .filter((item) => [MATERIAL_TRANSFORMATION_TYPES.REUSABLE_OFFCUT, MATERIAL_TRANSFORMATION_TYPES.SCRAP].includes(item.outputType))
      .forEach((transformation) => {
        const existing = offcuts.find((offcut) => offcut.id === transformation.outputId);
        if (existing && existing.status !== OFFCUT_STATUS.DRAFT) return;
        const parentInventory = findInventoryItem(inventoryItems, transformation.parentInventoryItemId) || {};
        const isScrap = transformation.outputType === MATERIAL_TRANSFORMATION_TYPES.SCRAP;
        const next = normalizeOffcut({
          ...(existing || {}),
          id: transformation.outputId,
          projectId: cuttingSheet.projectId,
          workpackId: cuttingSheet.workpackId,
          cuttingSheetId: cuttingSheet.id,
          parentInventoryItemId: transformation.parentInventoryItemId,
          material: existing?.material || parentInventory.materialGrade || parentInventory.material || '',
          heat: existing?.heat || parentInventory.heatNo || parentInventory.heat || '',
          traceability: existing?.traceability || `${parentInventory.traceability || parentInventory.trace || transformation.parentInventoryItemId}-OC`,
          status: isScrap ? OFFCUT_STATUS.SCRAP : OFFCUT_STATUS.REUSABLE,
          disposition: isScrap ? 'SCRAP' : existing?.disposition || '',
          length: transformation.lengthMm,
          qty: existing?.qty || 1,
          createdBy: existing?.createdBy || context.userName || '',
          updatedBy: context.userName || '',
          metadata: {
            ...(existing?.metadata || {}),
            parentTrace: parentInventory.traceability || parentInventory.trace || '',
            cutConfirmedAt: timestamp,
            materialTransformationId: transformation.id,
            classification: isScrap ? 'SCRAP' : 'REUSABLE',
            scrapReason: isScrap ? 'Sobra menor que 500 mm.' : existing?.metadata?.scrapReason || '',
          },
        }, existing);
        requestPut(stores.offcuts, next);
        changedOffcuts.push(next);
      });

    const savedSheet = normalizeCuttingSheet({
      ...storedSheet,
      status: 'cut',
      updatedBy: context.userName || storedSheet.updatedBy,
      metadata: {
        ...(storedSheet.metadata || {}),
        cutConfirmedAt: timestamp,
        cutConfirmedBy: context.userName || '',
        genealogyCount: transformations.length,
        cutExecutionSource: storedSheet.metadata?.cutExecution?.status === 'RECORDED' ? 'ACTUAL' : 'PLANNED_FALLBACK',
      },
    }, storedSheet);
    requestPut(stores.cuttingSheets, savedSheet);

    const auditEvent = normalizeAuditEvent({
      eventType: AUDIT_EVENT_TYPES.CONSUME_STOCK,
      entityType: 'CUTTING_SHEET',
      entityId: cuttingSheet.id,
      projectId: cuttingSheet.projectId,
      timestamp,
      userName: context.userName || '',
      sourceDocumentType: 'CUTTING_SHEET',
      sourceDocumentId: cuttingSheet.id,
      reason: 'Cutting Sheet execution confirmed and genealogy recorded.',
      before: storedSheet,
      after: savedSheet,
      metadata: {
        transformationIds: transformations.map((item) => item.id),
        movementIds: movements.map((item) => item.id),
        offcutIds: changedOffcuts.map((item) => item.id),
        cutExecutionVarianceCount: storedSheet.metadata?.cutExecution?.varianceCount || 0,
        cutExecutionSource: storedSheet.metadata?.cutExecution?.status === 'RECORDED' ? 'ACTUAL' : 'PLANNED_FALLBACK',
      },
    });
    requestPut(stores.auditLog, auditEvent);
    requestPut(stores.auditEvents, auditEvent);

    return { cuttingSheet: savedSheet, transformations, movements, auditEvent };
  });
}
