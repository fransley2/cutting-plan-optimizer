import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';
import { createAuditEvent } from './auditLog.js';

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
  CANCELLED: 'cancelled',
});

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

function normalizeBatch(input = {}) {
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
    status: text(input.status) || MTO_BATCH_STATUS.IMPORTED,
    metadata: objectValue(input.metadata),
  };
}

function normalizeItem(input = {}, batch = {}) {
  const qty = numberValue(input.qty);
  const cutLength = numberValue(input.cutLength);
  const validationErrors = normalizeErrors(input.validationErrors);
  return {
    id: text(input.id) || createId(),
    batchId: text(input.batchId) || batch.id || '',
    projectId: text(input.projectId) || batch.projectId || '',
    free: text(input.free),
    drawing: text(input.drawing),
    revision: text(input.revision),
    mark: text(input.mark),
    pos: text(input.pos),
    qty,
    description: text(input.description),
    cutLength,
    requiredLength: input.requiredLength == null ? qty * cutLength : numberValue(input.requiredLength),
    identCode: text(input.identCode),
    tag: text(input.tag),
    weightKg: numberValue(input.weightKg),
    externalSurfaceM2: numberValue(input.externalSurfaceM2),
    paintingSurfaceM2: numberValue(input.paintingSurfaceM2),
    icon: text(input.icon),
    positionStatus: text(input.positionStatus),
    constructionActivity: text(input.constructionActivity),
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
  return fields.every((field) => filters[field] == null || item[field] === String(filters[field]));
}

async function logMtoImport(batch) {
  try {
    await createAuditEvent({
      eventType: 'IMPORT_MTO',
      entityType: 'mtoBatch',
      entityId: batch.id,
      projectId: batch.projectId,
      sourceDocumentType: 'MTO',
      sourceDocumentId: batch.id,
      after: batch,
      metadata: {
        rowCount: batch.rowCount,
        acceptedCount: batch.acceptedCount,
        rejectedCount: batch.rejectedCount,
        fileName: batch.fileName,
      },
    });
  } catch (error) {
    console.warn('Falha ao registrar auditoria de importacao MTO.', error);
  }
}

export async function saveMtoImport({ batch, items }) {
  const db = await getDB();
  const savedBatch = normalizeBatch(batch);
  const savedItems = (Array.isArray(items) ? items : []).map((item) => normalizeItem(item, savedBatch));
  await idbPut(db, BATCH_STORE, savedBatch);
  await Promise.all(savedItems.map((item) => idbPut(db, ITEM_STORE, item)));
  await logMtoImport(savedBatch);
  return { batch: savedBatch, items: savedItems };
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
  return getMtoItems({ batchId });
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
