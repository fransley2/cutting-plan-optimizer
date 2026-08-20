import { getMtoBatch, getMtoItemsByBatch, updateMtoBatch } from './mtoDB.js';
import { ensureDrawingsForMtoItems } from './mtoDrawings.js';
import { AUDIT_EVENT_TYPES, createAuditEvent } from './auditLog.js';

const drawingSyncAttempts = new Map();

function text(value) {
  return value == null ? '' : String(value).trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function usefulError(error) {
  return text(error?.message || error).split(/\r?\n/, 1)[0].slice(0, 500) || 'Falha desconhecida ao sincronizar Drawings.';
}

function activeDrawingItems(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const status = text(item?.status).toLowerCase();
    const drawingNo = text(item?.drawing);
    const key = drawingNo.toUpperCase();
    if (!drawingNo || status === 'cancelled' || status === 'superseded' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function writeRetryAudit(createAudit, batch, previousStatus, finalStatus, requestedDrawingNos, createdCount, error) {
  if (typeof createAudit !== 'function') return;
  try {
    await createAudit({
      eventType: AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT,
      entityType: 'mtoBatch',
      entityId: batch.id,
      projectId: batch.projectId,
      sourceDocumentType: 'MTO',
      sourceDocumentId: batch.id,
      reason: 'MTO Drawing synchronization retry',
      metadata: {
        operation: finalStatus === 'complete' ? 'COMPLETE_MTO_DRAWING_SYNC' : 'FAIL_MTO_DRAWING_SYNC',
        batchId: batch.id,
        projectId: batch.projectId,
        previousStatus,
        finalStatus,
        requestedDrawingNos,
        createdCount,
        error: error || '',
      },
    });
  } catch (auditError) {
    console.warn('Falha ao registrar auditoria do retry de Drawings da MTO.', auditError);
  }
}

async function runPendingMtoDrawingSync({
  batchId,
  getBatch,
  getItems,
  ensureDrawings,
  updateBatch,
  createAudit,
  now,
}) {
  const batch = await getBatch(batchId);
  if (!batch) {
    const error = new Error(`MTO drawing sync batch not found: ${batchId}`);
    error.code = 'MTO_DRAWING_SYNC_BATCH_NOT_FOUND';
    throw error;
  }

  const previousSync = batch.metadata?.drawingSync || {};
  const previousStatus = text(previousSync.status) || 'pending';
  const previousCreatedIds = unique(Array.isArray(previousSync.createdDrawingIds) ? previousSync.createdDrawingIds : []);
  if (previousStatus === 'complete') {
    return {
      batch,
      status: 'complete',
      requestedDrawingNos: [],
      createdDrawings: [],
      createdDrawingIds: previousCreatedIds,
      remainingDrawingNos: [],
      error: null,
    };
  }

  const items = await getItems(batchId);
  const activeItems = activeDrawingItems(items);
  const storedPending = Array.isArray(previousSync.pendingDrawingNos)
    ? new Set(previousSync.pendingDrawingNos.map((drawingNo) => text(drawingNo).toUpperCase()).filter(Boolean))
    : null;
  const drawingItems = storedPending
    ? activeItems.filter((item) => storedPending.has(text(item.drawing).toUpperCase()))
    : activeItems;
  const requestedDrawingNos = drawingItems.map((item) => text(item.drawing));
  const lastAttemptAt = now();
  const processingBatch = await updateBatch(batchId, {
    metadata: {
      ...(batch.metadata || {}),
      drawingSync: {
        ...previousSync,
        status: 'processing',
        pendingDrawingNos: requestedDrawingNos,
        lastAttemptAt,
        lastError: '',
      },
    },
  });

  if (!requestedDrawingNos.length) {
    const completedAt = now();
    const completedBatch = await updateBatch(batchId, {
      metadata: {
        ...(processingBatch?.metadata || batch.metadata || {}),
        drawingSync: {
          ...previousSync,
          status: 'complete',
          pendingDrawingNos: [],
          createdDrawingIds: previousCreatedIds,
          completedAt,
          lastAttemptAt,
          lastError: '',
        },
      },
    });
    await writeRetryAudit(createAudit, batch, previousStatus, 'complete', [], 0, '');
    return {
      batch: completedBatch,
      status: 'complete',
      requestedDrawingNos: [],
      createdDrawings: [],
      createdDrawingIds: previousCreatedIds,
      remainingDrawingNos: [],
      error: null,
    };
  }

  const createdDrawings = [];
  const remainingDrawingNos = [...requestedDrawingNos];
  try {
    for (const item of drawingItems) {
      const created = await ensureDrawings([item], { projectId: batch.projectId });
      createdDrawings.push(...(Array.isArray(created) ? created : []));
      remainingDrawingNos.shift();
    }
    const createdDrawingIds = unique([...previousCreatedIds, ...createdDrawings.map((drawing) => text(drawing?.id))]);
    const completedAt = now();
    const completedBatch = await updateBatch(batchId, {
      metadata: {
        ...(processingBatch?.metadata || batch.metadata || {}),
        drawingSync: {
          ...previousSync,
          status: 'complete',
          pendingDrawingNos: [],
          createdDrawingIds,
          completedAt,
          lastAttemptAt,
          lastError: '',
        },
      },
    });
    await writeRetryAudit(createAudit, batch, previousStatus, 'complete', requestedDrawingNos, createdDrawings.length, '');
    return {
      batch: completedBatch,
      status: 'complete',
      requestedDrawingNos,
      createdDrawings,
      createdDrawingIds,
      remainingDrawingNos: [],
      error: null,
    };
  } catch (error) {
    const lastError = usefulError(error);
    const createdDrawingIds = unique([...previousCreatedIds, ...createdDrawings.map((drawing) => text(drawing?.id))]);
    const failedBatch = await updateBatch(batchId, {
      metadata: {
        ...(processingBatch?.metadata || batch.metadata || {}),
        drawingSync: {
          ...previousSync,
          status: 'failed',
          pendingDrawingNos: remainingDrawingNos,
          createdDrawingIds,
          lastAttemptAt,
          lastError,
        },
      },
    });
    await writeRetryAudit(createAudit, batch, previousStatus, 'failed', requestedDrawingNos, createdDrawings.length, lastError);
    return {
      batch: failedBatch,
      status: 'failed',
      requestedDrawingNos,
      createdDrawings,
      createdDrawingIds,
      remainingDrawingNos,
      error: lastError,
    };
  }
}

export function retryPendingMtoDrawingSync({
  batchId,
  getMtoBatch: getBatch = getMtoBatch,
  getMtoItemsByBatch: getItems = getMtoItemsByBatch,
  ensureDrawingsForMtoItems: ensureDrawings = ensureDrawingsForMtoItems,
  updateMtoBatch: updateBatch = updateMtoBatch,
  createAuditEvent: createAudit = createAuditEvent,
  now = () => new Date().toISOString(),
} = {}) {
  const id = text(batchId);
  if (!id) {
    const error = new Error('batchId is required to retry MTO Drawing synchronization.');
    error.code = 'MTO_DRAWING_SYNC_BATCH_ID_REQUIRED';
    return Promise.reject(error);
  }
  if (drawingSyncAttempts.has(id)) return drawingSyncAttempts.get(id);

  const attempt = runPendingMtoDrawingSync({
    batchId: id, getBatch, getItems, ensureDrawings, updateBatch, createAudit, now,
  }).finally(() => {
    if (drawingSyncAttempts.get(id) === attempt) drawingSyncAttempts.delete(id);
  });
  drawingSyncAttempts.set(id, attempt);
  return attempt;
}

export async function commitMtoThenCreateDrawings({
  importPayload,
  items,
  projectId,
  saveImport,
  createDrawings,
}) {
  if (!Array.isArray(importPayload?.items) || importPayload.items.length === 0) {
    return { importResult: null, createdDrawings: [], drawingError: null, skipped: true, reason: 'NO_ITEMS' };
  }
  const importResult = await saveImport(importPayload);
  try {
    const createdDrawings = await createDrawings(items, { projectId });
    return { importResult, createdDrawings, drawingError: null };
  } catch (drawingError) {
    return { importResult, createdDrawings: [], drawingError };
  }
}
