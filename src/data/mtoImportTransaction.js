import { getDB } from './database.js';
import { idbTransaction } from './idb.js';

// One MTO import is a single integrity boundary: the batch, every item, and
// both the canonical and legacy audit records must commit or roll back together.
const STORE_NAMES = Object.freeze(['mtoBatches', 'mtoItems', 'auditLog', 'auditEvents']);

function errorName(error) {
  return error?.name || error?.cause?.name || '';
}

function importWriteError(failure, transactionError) {
  const cause = failure?.error || transactionError;
  const name = errorName(cause);
  let code = failure?.code || 'MTO_IMPORT_STORAGE_FAILED';
  if (name === 'QuotaExceededError') code = 'MTO_IMPORT_QUOTA_EXCEEDED';
  if (name === 'ConstraintError') code = 'MTO_IMPORT_CONSTRAINT_FAILED';

  const error = new Error(`${code}: ${cause?.message || 'IndexedDB transaction failed.'}`);
  error.code = code;
  error.cause = cause;
  error.rowNumber = failure?.rowNumber || 0;
  return error;
}

function queuePut(store, value, failureDetails, onFailure) {
  let request;
  try {
    request = store.put(value);
  } catch (error) {
    onFailure({ ...failureDetails, error });
    throw error;
  }
  const captureError = () => {
    onFailure({ ...failureDetails, error: request.error });
  };
  if (typeof request.addEventListener === 'function') {
    request.addEventListener('error', captureError, { once: true });
  } else {
    request.onerror = captureError;
  }
}

export async function commitMtoImport({ batch, items, itemsToSupersede = [], auditEvent }) {
  const db = await getDB();
  let firstFailure = null;

  try {
    return await idbTransaction(db, STORE_NAMES, 'readwrite', (stores) => {
      const rememberFirstFailure = (failure) => {
        if (!firstFailure) firstFailure = failure;
      };

      // Queue the complete 1000+ row import without yielding. An unrelated
      // await here could let IndexedDB auto-commit before all puts are issued.
      queuePut(stores.mtoBatches, batch, { code: 'MTO_BATCH_WRITE_FAILED' }, rememberFirstFailure);
      items.forEach((item, index) => queuePut(
        stores.mtoItems,
        item,
        {
          code: 'MTO_ITEM_WRITE_FAILED',
          rowNumber: Number(item.sourceRowNumber) || index + 1,
        },
        rememberFirstFailure,
      ));
      itemsToSupersede.forEach((item) => queuePut(
        stores.mtoItems,
        item,
        { code: 'MTO_SUPERSEDE_WRITE_FAILED' },
        rememberFirstFailure,
      ));
      queuePut(stores.auditLog, auditEvent, { code: 'MTO_AUDIT_WRITE_FAILED' }, rememberFirstFailure);
      queuePut(stores.auditEvents, auditEvent, { code: 'MTO_AUDIT_WRITE_FAILED' }, rememberFirstFailure);

      return { batch, items, itemsToSupersede, auditEvent };
    });
  } catch (error) {
    throw importWriteError(firstFailure, error);
  }
}
