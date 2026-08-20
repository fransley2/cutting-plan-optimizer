import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';

const STORE_NAME = 'drawings';

const DRAWING_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  IFR: 'IFR',
  IFA: 'IFA',
  IFC: 'IFC',
  SUPERSEDED: 'SUPERSEDED',
  CANCELLED: 'CANCELLED',
});

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  const value = text(status).trim().toUpperCase();
  return Object.values(DRAWING_STATUS).includes(value) ? value : DRAWING_STATUS.DRAFT;
}

function requiredText(value) {
  return text(value).trim();
}

function validateRequired(record, action) {
  if (!requiredText(record.projectId)) throw new Error(`projectId is required to ${action} a drawing.`);
  if (!requiredText(record.drawingNo)) throw new Error(`drawingNo is required to ${action} a drawing.`);
}

function normalizeDrawing(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    documentId: text(input.documentId || existing?.documentId).trim() || createId(),
    projectId: text(input.projectId).trim(),
    equipmentId: text(input.equipmentId).trim(),
    workpackId: text(input.workpackId).trim(),
    drawingNo: text(input.drawingNo).trim(),
    templateDrawingNo: text(input.templateDrawingNo).trim(),
    engineeringCode: text(input.engineeringCode).trim(),
    revision: text(input.revision).trim(),
    supersedesRevisionId: text(input.supersedesRevisionId || existing?.supersedesRevisionId).trim(),
    isCurrentRevision: input.isCurrentRevision == null ? existing?.isCurrentRevision !== false : input.isCurrentRevision === true,
    title: text(input.title).trim(),
    discipline: text(input.discipline).trim(),
    clientReference: text(input.clientReference).trim(),
    fileUrl: text(input.fileUrl).trim(),
    fileDataUrl: text(input.fileDataUrl).trim(),
    fileName: text(input.fileName).trim(),
    fileType: text(input.fileType).trim(),
    fileSize: Number.isFinite(Number(input.fileSize)) ? Number(input.fileSize) : 0,
    notes: text(input.notes).trim(),
    status: normalizeStatus(input.status || existing?.status),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function matchesFilters(record, filters = {}) {
  if (filters.projectId != null && filters.projectId !== '' && record.projectId !== String(filters.projectId)) {
    return false;
  }
  if (filters.equipmentId != null && filters.equipmentId !== '' && record.equipmentId !== String(filters.equipmentId)) {
    return false;
  }
  if (filters.workpackId != null && filters.workpackId !== '' && record.workpackId !== String(filters.workpackId)) {
    return false;
  }
  if (filters.status != null && filters.status !== '' && record.status !== normalizeStatus(filters.status)) {
    return false;
  }
  if (filters.documentId != null && filters.documentId !== '' && record.documentId !== String(filters.documentId)) return false;
  if (filters.isCurrentRevision != null && record.isCurrentRevision !== Boolean(filters.isCurrentRevision)) return false;
  return true;
}

export async function createDrawing(input = {}) {
  const db = await getDB();
  const record = normalizeDrawing(input);
  validateRequired(record, 'create');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function updateDrawing(id, patch = {}) {
  if (!id) return null;
  const db = await getDB();
  const current = await idbGet(db, STORE_NAME, id);
  if (!current) return null;
  const requestedRevision = patch.revision == null ? current.revision : text(patch.revision).trim();
  if (requestedRevision && requestedRevision !== current.revision) {
    return createDrawingRevision(id, patch);
  }
  const record = normalizeDrawing({ ...current, ...(patch || {}), id }, current);
  validateRequired(record, 'update');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function createDrawingRevision(id, patch = {}) {
  const db = await getDB();
  const current = await idbGet(db, STORE_NAME, id);
  if (!current) return null;
  const revision = text(patch.revision).trim();
  if (!revision || revision === current.revision) return updateDrawing(id, patch);
  const existingRevisions = await idbGetAll(db, STORE_NAME);
  const duplicate = existingRevisions.find((drawing) => drawing.projectId === current.projectId
    && drawing.documentId === current.documentId && drawing.revision === revision);
  if (duplicate) return duplicate;
  const superseded = normalizeDrawing({ ...current, status: DRAWING_STATUS.SUPERSEDED, isCurrentRevision: false, id: current.id }, current);
  const next = normalizeDrawing({
    ...current,
    ...(patch || {}),
    id: '',
    documentId: current.documentId,
    supersedesRevisionId: current.id,
    isCurrentRevision: true,
    createdAt: nowIso(),
  });
  validateRequired(next, 'create a drawing revision for');
  await idbPut(db, STORE_NAME, superseded);
  await idbPut(db, STORE_NAME, next);
  return next;
}

export async function deleteDrawing(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function getDrawing(id) {
  if (!id) return null;
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getDrawingByDrawingNo(drawingNo, filters = {}) {
  const value = requiredText(drawingNo).toUpperCase();
  if (!value) return null;
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  const matches = records.filter((record) => matchesFilters(record, filters)
    && requiredText(record.drawingNo).toUpperCase() === value);
  return matches.find((record) => record.isCurrentRevision !== false) || matches[0] || null;
}

export async function listDrawings(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => matchesFilters(record, filters));
}
