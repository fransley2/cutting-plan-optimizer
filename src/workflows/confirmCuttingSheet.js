import { buildCuttingTransformations } from '../core/materialGenealogy.js';
import { STOCK_MOVEMENT_TYPES } from '../data/stockMovements.js';
import { AUDIT_EVENT_TYPES } from '../data/auditLog.js';
import { OFFCUT_STATUS } from '../data/offcuts.js';
import { MATERIAL_TRANSFORMATION_TYPES } from '../data/materialTransformations.js';

function required(dependencies, name) {
  if (typeof dependencies[name] !== 'function') throw new Error(`Missing Cutting Sheet confirmation dependency: ${name}`);
  return dependencies[name];
}

export async function confirmCuttingSheet(cuttingSheet = {}, context = {}, dependencies = {}) {
  if (!['released', 'in_progress'].includes(String(cuttingSheet.status || '').toLowerCase())) {
    throw new Error('Only released or in-progress Cutting Sheets can be confirmed.');
  }
  const genealogy = buildCuttingTransformations(cuttingSheet, context);
  if (!genealogy.valid) throw new Error(genealogy.errors[0]?.code || 'INVALID_CUTTING_GENEALOGY');
  if (typeof dependencies.commitAtomic === 'function') {
    return dependencies.commitAtomic(cuttingSheet, genealogy, context);
  }
  const createdTransformations = [];
  const inventoryChanges = [];
  const movements = [];
  const offcutChanges = [];
  let cuttingSheetChanged = false;
  try {
    for (const transformation of genealogy.transformations) {
      createdTransformations.push(await required(dependencies, 'createTransformation')(transformation));
    }
    const parentIds = [...new Set(genealogy.transformations.map((item) => item.parentInventoryItemId))];
    for (const inventoryItemId of parentIds) {
      const current = await required(dependencies, 'getInventoryItem')(inventoryItemId);
      if (!current) throw new Error(`Inventory item not found: ${inventoryItemId}`);
      const next = await required(dependencies, 'updateInventoryItem')(inventoryItemId, { status: 'consumed' });
      inventoryChanges.push({ current, next });
      movements.push(await required(dependencies, 'createStockMovement')({
        movementType: STOCK_MOVEMENT_TYPES.CONSUME_STOCK,
        inventoryItemId,
        projectId: cuttingSheet.projectId,
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
      }));
    }
    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    if (typeof dependencies.listOffcuts === 'function' && typeof dependencies.updateOffcut === 'function') {
      const relatedOffcuts = (await dependencies.listOffcuts()).filter((offcut) => offcut.cuttingSheetId === cuttingSheet.id);
      for (const offcut of relatedOffcuts.filter((item) => item.status === OFFCUT_STATUS.DRAFT)) {
        const transformation = createdTransformations.find((item) => item.outputId === offcut.id
          && [MATERIAL_TRANSFORMATION_TYPES.REUSABLE_OFFCUT, MATERIAL_TRANSFORMATION_TYPES.SCRAP].includes(item.outputType));
        const isScrap = transformation?.outputType === MATERIAL_TRANSFORMATION_TYPES.SCRAP;
        const next = await dependencies.updateOffcut(offcut.id, {
          status: isScrap ? OFFCUT_STATUS.SCRAP : OFFCUT_STATUS.REUSABLE,
          disposition: isScrap ? 'SCRAP' : offcut.disposition,
          length: transformation?.lengthMm || offcut.length,
          updatedBy: context.userName || '',
          metadata: {
            ...(offcut.metadata || {}),
            cutConfirmedAt: timestamp,
            materialTransformationId: transformation?.id || '',
            classification: isScrap ? 'SCRAP' : 'REUSABLE',
            scrapReason: isScrap ? 'Sobra menor que 500 mm.' : offcut.metadata?.scrapReason || '',
          },
        });
        offcutChanges.push({ current: offcut, next });
      }

      if (typeof dependencies.saveOffcut === 'function') {
        const knownIds = new Set(relatedOffcuts.map((offcut) => offcut.id));
        for (const transformation of createdTransformations.filter((item) => (
          [MATERIAL_TRANSFORMATION_TYPES.REUSABLE_OFFCUT, MATERIAL_TRANSFORMATION_TYPES.SCRAP].includes(item.outputType)
          && !knownIds.has(item.outputId)
        ))) {
          const isScrap = transformation.outputType === MATERIAL_TRANSFORMATION_TYPES.SCRAP;
          const next = await dependencies.saveOffcut({
            id: transformation.outputId,
            projectId: cuttingSheet.projectId,
            workpackId: cuttingSheet.workpackId,
            cuttingSheetId: cuttingSheet.id,
            parentInventoryItemId: transformation.parentInventoryItemId,
            material: '',
            length: transformation.lengthMm,
            qty: 1,
            status: isScrap ? OFFCUT_STATUS.SCRAP : OFFCUT_STATUS.REUSABLE,
            disposition: isScrap ? 'SCRAP' : '',
            createdBy: context.userName || '',
            metadata: {
              cutConfirmedAt: timestamp,
              materialTransformationId: transformation.id,
              classification: isScrap ? 'SCRAP' : 'REUSABLE',
              scrapReason: isScrap ? 'Sobra menor que 500 mm.' : '',
            },
          });
          offcutChanges.push({ current: null, next });
        }
      }
    }
    const saved = await required(dependencies, 'updateCuttingSheet')(cuttingSheet.id, {
      status: 'cut',
      metadata: {
        ...(cuttingSheet.metadata || {}),
        cutConfirmedAt: timestamp,
        cutConfirmedBy: context.userName || '',
        genealogyCount: genealogy.transformations.length,
        cutExecutionSource: cuttingSheet.metadata?.cutExecution?.status === 'RECORDED' ? 'ACTUAL' : 'PLANNED_FALLBACK',
      },
    });
    cuttingSheetChanged = true;
    await required(dependencies, 'createAuditEvent')({
      eventType: AUDIT_EVENT_TYPES.CONSUME_STOCK,
      entityType: 'CUTTING_SHEET',
      entityId: cuttingSheet.id,
      projectId: cuttingSheet.projectId,
      userName: context.userName || '',
      sourceDocumentType: 'CUTTING_SHEET',
      sourceDocumentId: cuttingSheet.id,
      reason: 'Cutting Sheet execution confirmed and genealogy recorded.',
      before: cuttingSheet,
      after: saved,
      metadata: {
        transformationIds: createdTransformations.map((item) => item.id),
        movementIds: movements.map((item) => item.id),
        offcutIds: offcutChanges.map((item) => item.next?.id).filter(Boolean),
        cutExecutionVarianceCount: cuttingSheet.metadata?.cutExecution?.varianceCount || 0,
        cutExecutionSource: cuttingSheet.metadata?.cutExecution?.status === 'RECORDED' ? 'ACTUAL' : 'PLANNED_FALLBACK',
      },
    });
    return { cuttingSheet: saved, transformations: createdTransformations, movements };
  } catch (error) {
    if (cuttingSheetChanged) await dependencies.updateCuttingSheet?.(cuttingSheet.id, cuttingSheet);
    await Promise.all(offcutChanges.filter(({ current }) => current).map(({ current }) => dependencies.updateOffcut?.(current.id, current)));
    await Promise.all(offcutChanges.filter(({ current }) => !current).map(({ next }) => dependencies.deleteOffcut?.(next.id)));
    await Promise.all(inventoryChanges.map(({ current }) => dependencies.updateInventoryItem?.(current.id || current.trace, current)));
    await Promise.all(movements.map((movement) => dependencies.deleteStockMovement?.(movement.id)));
    await Promise.all(createdTransformations.map((item) => dependencies.deleteTransformation?.(item.id)));
    throw error;
  }
}
