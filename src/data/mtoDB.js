import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';
import { normalizeAuditEvent } from './auditLog.js';
import { validateMtoItem } from './mtoImport.js';
import { commitMtoImport } from './mtoImportTransaction.js';

const BATCH_STORE = 'mtoBatches';
const ITEM_STORE = 'mtoItems';

export const MTO_BATCH_STATUS = Object.freeze({
  IMPORTED: 'imported',
  VALIDATED: 'validated',
  MATCHED: 'matched',
  CANCELLED: 'cancelled',
});

export const MTO_ITEM_STATUS = Object.freeze({
  OPEN: 'open',
  INVALID: 'invalid',
  MATCHED: 'matched',
  RESERVED: 'reserved',
  NESTED: 'nested',
  ISSUED: 'issued',
  CUT: 'cut',
  SUPERSEDED: 'superseded',
  CANCELLED: 'cancelled',
});

const MTO_REVISION_COMPARE_FIELDS = Object.freeze(['qty', 'cutLength', 'material', 'description']);

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mtoImportNumberValue(input, field) {
  if (input?.metadata?.numericParsing && input[field] == null) return null;
  return numberValue(input?.[field]);
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeErrors(value) {
  return Array.isArray(value) ? [...value] : [];
}

function inferBatchRevision(items = []) {
  const revisions = (Array.isArray(items) ? items : [])
    .map((item) => text(item?.revision).trim())
    .filter(Boolean);
  const uniqueRevisions = [...new Set(revisions)];
  return uniqueRevisions.length === 1 ? uniqueRevisions[0] : '';
}

function normalizeBatch(input = {}) {
  const metadata = objectValue(input.metadata);
  return {
    id: text(input.id) || createId(),
    projectId: text(input.projectId),
    fileName: text(input.fileName),
    sourceType: text(input.sourceType) || 'engineering-mto',
    importedAt: normalizeTimestamp(input.importedAt),
    importedBy: text(input.importedBy),
    rowCount: numberValue(input.rowCount),
    acceptedCount: numberValue(input.acceptedCount),
    rejectedCount: numberValue(input.rejectedCount),
    revision: text(input.revision) || text(metadata.revision),
    status: text(input.status) || MTO_BATCH_STATUS.IMPORTED,
    metadata,
  };
}

function normalizeItem(input = {}, batch = {}) {
  const qty = mtoImportNumberValue(input, 'qty');
  const cutLength = mtoImportNumberValue(input, 'cutLength');
  const validationErrors = normalizeErrors(input.validationErrors);
  return {
    id: text(input.id) || createId(),
    batchId: text(input.batchId) || batch.id || '',
    projectId: text(input.projectId) || batch.projectId || '',
    free: text(input.free),
    drawing: text(input.drawing),
    drawingRevisionId: text(input.drawingRevisionId),
    revision: text(input.revision),
    mark: text(input.mark),
    pos: text(input.pos),
    qty,
    description: text(input.description),
    cutLength,
    requiredLength: input.requiredLength == null
      ? (qty == null || cutLength == null ? null : qty * cutLength)
      : mtoImportNumberValue(input, 'requiredLength'),
    identCode: text(input.identCode),
    tag: text(input.tag),
    weightKg: mtoImportNumberValue(input, 'weightKg'),
    externalSurfaceM2: mtoImportNumberValue(input, 'externalSurfaceM2'),
    paintingSurfaceM2: mtoImportNumberValue(input, 'paintingSurfaceM2'),
    icon: text(input.icon),
    positionStatus: text(input.positionStatus),
    constructionActivity: text(input.constructionActivity),
    equipmentId: text(input.equipmentId),
    equipmentName: text(input.equipmentName),
    material: text(input.material),
    line: text(input.line),
    type: text(input.type),
    mountErection: text(input.mountErection),
    instrument: text(input.instrument),
    discipline: text(input.discipline),
    profile: text(input.profile) || text(input.description),
    priority: text(input.priority),
    status: text(input.status) || (validationErrors.length > 0 ? MTO_ITEM_STATUS.INVALID : MTO_ITEM_STATUS.OPEN),
    sourceRowNumber: numberValue(input.sourceRowNumber),
    validationErrors,
    metadata: objectValue(input.metadata),
  };
}

function itemSort(a, b) {
  return (
    a.sourceRowNumber - b.sourceRowNumber ||
    a.mark.localeCompare(b.mark) ||
    a.pos.localeCompare(b.pos)
  );
}

function matchesItemFilters(item, filters = {}) {
  const fields = ['batchId', 'projectId', 'drawing', 'mark', 'pos', 'material', 'status', 'identCode', 'discipline', 'type'];
  // When projectId filter is set, items without projectId are excluded
  // because the equality check (item.projectId === filters.projectId) fails
  // for empty/undefined projectId values.
  if (
    !filters.includeSuperseded &&
    filters.status !== MTO_ITEM_STATUS.SUPERSEDED &&
    item.status === MTO_ITEM_STATUS.SUPERSEDED
  ) {
    return false;
  }
  return fields.every((field) => filters[field] == null || item[field] === String(filters[field]));
}

function mtoRevisionKey(item = {}) {
  return [item.drawing, item.mark, item.pos].map((value) => text(value).trim()).join('|');
}

function mtoComparableValue(value) {
  return value == null ? '' : String(value);
}

function mtoItemsHaveSameContent(oldItem, newItem) {
  return MTO_REVISION_COMPARE_FIELDS
    .every((field) => mtoComparableValue(oldItem?.[field]) === mtoComparableValue(newItem?.[field]));
}

export function compareRevisions(oldRev, newRev) {
  const oldValue = text(oldRev).trim();
  const newValue = text(newRev).trim();
  if (!oldValue || !newValue) return 'unknown';
  if (oldValue === newValue) return 'same';

  const isLetter = (value) => /^[A-Za-z]$/.test(value);
  const isNumber = (value) => /^\d+$/.test(value);

  const oldIsLetter = isLetter(oldValue);
  const newIsLetter = isLetter(newValue);
  const oldIsNumber = isNumber(oldValue);
  const newIsNumber = isNumber(newValue);

  if (oldIsLetter && newIsNumber) return 'newer';
  if (oldIsNumber && newIsLetter) return 'older';
  if (oldIsLetter && newIsLetter) {
    return oldValue.toLowerCase() < newValue.toLowerCase() ? 'newer' : 'older';
  }
  if (oldIsNumber && newIsNumber) {
    return Number(oldValue) < Number(newValue) ? 'newer' : 'older';
  }
  return 'unknown';
}

function collectImportValidationErrors(items) {
  const seenIds = new Map();
  return items.flatMap((item, index) => {
    const errors = [...validateMtoItem(item)];
    const rowNumber = Number(item.sourceRowNumber) || index + 1;
    if (item.id && seenIds.has(item.id)) {
      errors.push(`Duplicate item id (also used on row ${seenIds.get(item.id)})`);
    } else if (item.id) {
      seenIds.set(item.id, rowNumber);
    }
    return errors.length ? [{ rowNumber, itemId: item.id, errors }] : [];
  });
}

function importValidationError(details) {
  const message = details
    .map((failure) => `Row ${failure.rowNumber}: ${failure.errors.join(', ')}`)
    .join('; ');
  const error = new Error(`MTO_IMPORT_VALIDATION_FAILED: ${message}`);
  error.code = 'MTO_IMPORT_VALIDATION_FAILED';
  error.validationErrors = details;
  return error;
}

export async function saveMtoImport({ batch, items, itemsToSupersede = [] }) {
  const sourceItems = Array.isArray(items) ? items : [];
  const supersedeSources = Array.isArray(itemsToSupersede) ? itemsToSupersede : [];
  const existingItemsToSupersede = await Promise.all(supersedeSources.map((itemOrId) => (
    itemOrId && typeof itemOrId === 'object' ? itemOrId : getMtoItem(itemOrId)
  )));
  const missingSupersedeIndex = existingItemsToSupersede.findIndex((item) => !item);
  if (missingSupersedeIndex >= 0) {
    const error = new Error(`MTO_SUPERSEDE_ITEM_NOT_FOUND: ${supersedeSources[missingSupersedeIndex]}`);
    error.code = 'MTO_SUPERSEDE_ITEM_NOT_FOUND';
    throw error;
  }
  const batchInput = {
    ...(batch || {}),
    revision: text(batch?.revision) || text(batch?.metadata?.revision) || inferBatchRevision(sourceItems),
  };
  const savedBatch = normalizeBatch(batchInput);
  const savedItems = sourceItems.map((item) => normalizeItem(item, savedBatch));
  const savedItemsToSupersede = existingItemsToSupersede
    .map((item) => normalizeItem({ ...item, status: MTO_ITEM_STATUS.SUPERSEDED }));
  const validationErrors = collectImportValidationErrors(savedItems);
  if (validationErrors.length) throw importValidationError(validationErrors);

  const auditEvent = normalizeAuditEvent({
    eventType: 'IMPORT_MTO',
    entityType: 'mtoBatch',
    entityId: savedBatch.id,
    projectId: savedBatch.projectId,
    userName: savedBatch.importedBy,
    sourceDocumentType: 'MTO',
    sourceDocumentId: savedBatch.id,
    after: savedBatch,
    metadata: {
      rowCount: savedBatch.rowCount,
      acceptedCount: savedBatch.acceptedCount,
      rejectedCount: savedBatch.rejectedCount,
      fileName: savedBatch.fileName,
    },
  });

  // Validation and record preparation above are entirely in memory. Only this
  // call opens the all-or-nothing write transaction for the complete import.
  await commitMtoImport({
    batch: savedBatch,
    items: savedItems,
    itemsToSupersede: savedItemsToSupersede,
    auditEvent,
  });
  return { batch: savedBatch, items: savedItems, itemsToSupersede: savedItemsToSupersede };
}

export async function createMtoItem(input) {
  const db = await getDB();
  const savedItem = normalizeItem(input);
  await idbPut(db, ITEM_STORE, savedItem);
  return savedItem;
}

export async function getAllMtoBatches() {
  const db = await getDB();
  return idbGetAll(db, BATCH_STORE);
}

export async function getMtoBatch(id) {
  const db = await getDB();
  return idbGet(db, BATCH_STORE, id);
}

export async function getMtoItems(filters = {}) {
  const db = await getDB();
  const items = await idbGetAll(db, ITEM_STORE);
  return items.filter((item) => matchesItemFilters(item, filters)).sort(itemSort);
}

export function getMtoItemsByBatch(batchId) {
  return getMtoItems({ batchId, includeSuperseded: true });
}

export async function analyzeImportImpact(newItems = [], options = {}) {
  const filters = options.projectId
    ? { projectId: options.projectId, includeSuperseded: true }
    : { includeSuperseded: true };
  const existingItems = (await getMtoItems(filters))
    .filter((item) => item.status !== MTO_ITEM_STATUS.SUPERSEDED);
  const existingMap = new Map(existingItems.map((item) => [mtoRevisionKey(item), item]));
  const sourceItems = Array.isArray(newItems) ? newItems : [];
  const newItemsByKey = new Map();
  sourceItems.forEach((item) => {
    const key = mtoRevisionKey(item);
    if (!newItemsByKey.has(key)) newItemsByKey.set(key, []);
    newItemsByKey.get(key).push(item);
  });
  const conflictingKeys = new Set(
    [...newItemsByKey.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key]) => key),
  );
  const result = {
    brandNew: [],
    revisions: [],
    duplicates: [],
    sameRevisionChanged: [],
    olderRevisions: [],
    unknownRevisions: [],
    conflictingRowsInsideFile: [],
    toSupersede: [],
  };
  const toSupersede = new Set();

  sourceItems.forEach((newItem) => {
    const key = mtoRevisionKey(newItem);
    const existingItem = existingMap.get(key);
    if (conflictingKeys.has(key)) {
      result.conflictingRowsInsideFile.push({
        newItem,
        existingItem,
        conflictingItems: [...newItemsByKey.get(key)],
      });
      return;
    }
    if (!existingItem) {
      result.brandNew.push(newItem);
      return;
    }

    const revisionComparison = compareRevisions(existingItem.revision, newItem.revision);
    if (revisionComparison === 'same') {
      const sameRevision = {
        newItem,
        existingItem,
        contentChanged: !mtoItemsHaveSameContent(existingItem, newItem),
      };
      if (sameRevision.contentChanged) {
        result.sameRevisionChanged.push(sameRevision);
      } else {
        result.duplicates.push(sameRevision);
      }
      return;
    }

    if (revisionComparison === 'unknown') {
      result.unknownRevisions.push({ newItem, existingItem });
      return;
    }

    if (revisionComparison === 'older') {
      result.olderRevisions.push({ newItem, existingItem });
      return;
    }

    result.revisions.push({ newItem, existingItem, comparison: revisionComparison });
    if (existingItem.id) toSupersede.add(existingItem.id);
  });

  result.toSupersede = [...toSupersede];
  return result;
}

export async function getMtoItem(id) {
  const db = await getDB();
  return idbGet(db, ITEM_STORE, id);
}

export async function updateMtoItem(id, patch) {
  const current = await getMtoItem(id);
  if (!current) return null;
  const db = await getDB();
  const updated = normalizeItem({ ...current, ...(patch || {}), id });
  await idbPut(db, ITEM_STORE, updated);
  return updated;
}

export async function updateMtoItemsStatus(ids = [], status) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  return Promise.all(uniqueIds.map((id) => updateMtoItem(id, { status })));
}

export async function updateMtoBatch(id, patch) {
  const current = await getMtoBatch(id);
  if (!current) return null;
  const db = await getDB();
  const updated = normalizeBatch({ ...current, ...(patch || {}), id });
  await idbPut(db, BATCH_STORE, updated);
  return updated;
}

export async function deleteMtoBatch(id) {
  const db = await getDB();
  const linkedItems = await getMtoItemsByBatch(id);
  await Promise.all(linkedItems.map((item) => idbDelete(db, ITEM_STORE, item.id)));
  return idbDelete(db, BATCH_STORE, id);
}

export async function deleteMtoItem(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, ITEM_STORE, id);
}

export async function deleteMtoItems(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteMtoItem(id)));
  return uniqueIds;
}

export async function clearMtoData() {
  const db = await getDB();
  await idbClear(db, ITEM_STORE);
  return idbClear(db, BATCH_STORE);
}
