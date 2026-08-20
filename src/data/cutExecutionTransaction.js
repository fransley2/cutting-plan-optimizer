import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeCuttingSheet } from './cuttingSheets.js';
import { normalizeAuditEvent } from './auditLog.js';
import { applyCutExecution } from '../core/cutExecution.js';

const STORE_NAMES = Object.freeze(['cuttingSheets', 'auditLog', 'auditEvents']);

function put(store, value) { store.put(value); return value; }

export async function commitCutExecution(cuttingSheet = {}, draft = {}, context = {}) {
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const storedSheet = await idbRequest(stores.cuttingSheets.get(cuttingSheet.id));
    if (!storedSheet) throw new Error('CUTTING_SHEET_NOT_FOUND');
    const executed = applyCutExecution(storedSheet, draft, context);
    const recordedAt = executed.metadata.cutExecution.recordedAt;
    const savedSheet = {
      ...normalizeCuttingSheet({ ...executed, updatedBy: context.userName || storedSheet.updatedBy }, storedSheet),
      updatedAt: recordedAt,
    };
    put(stores.cuttingSheets, savedSheet);
    const auditEvent = normalizeAuditEvent({
      eventType: 'CUT_EXECUTION_RECORDED',
      entityType: 'CUTTING_SHEET',
      entityId: savedSheet.id,
      projectId: savedSheet.projectId,
      timestamp: recordedAt,
      userName: context.userName || '',
      sourceDocumentType: 'CUTTING_SHEET',
      sourceDocumentId: savedSheet.id,
      reason: 'Actual cutting measurements recorded.',
      before: storedSheet,
      after: savedSheet,
      metadata: {
        varianceCount: savedSheet.metadata.cutExecution.varianceCount,
        totalAbsoluteVarianceMm: savedSheet.metadata.cutExecution.totalAbsoluteVarianceMm,
        varianceReason: savedSheet.metadata.cutExecution.reason,
      },
    });
    put(stores.auditLog, auditEvent);
    put(stores.auditEvents, auditEvent);
    return { cuttingSheet: savedSheet, auditEvent };
  });
}
