import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';

const STORE_NAME = 'workpacks';

const WORKPACK_STATUS = Object.freeze({
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  CLOSED: 'CLOSED',
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
  return Object.values(WORKPACK_STATUS).includes(value) ? value : WORKPACK_STATUS.PLANNED;
}

function requiredText(value) {
  return text(value).trim();
}

function validateRequired(record, action) {
  if (!requiredText(record.projectId)) throw new Error(`projectId is required to ${action} a workpack.`);
  if (!requiredText(record.equipmentId)) throw new Error(`equipmentId is required to ${action} a workpack.`);
  if (!requiredText(record.wpNo)) throw new Error(`wpNo is required to ${action} a workpack.`);
}

function normalizeDrawingIds(input = {}, existing = null) {
  if (Array.isArray(input.drawingIds)) {
    return input.drawingIds.map((id) => text(id).trim()).filter(Boolean);
  }
  if (input.drawingId != null && text(input.drawingId).trim()) {
    return [text(input.drawingId).trim()];
  }
  return Array.isArray(existing?.drawingIds) ? [...existing.drawingIds] : [];
}

function normalizeWorkpack(input = {}, existing = null) {
  const drawingIds = normalizeDrawingIds(input, existing);
  const drawingId = text(input.drawingId || existing?.drawingId || drawingIds[0]).trim();
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId).trim(),
    equipmentId: text(input.equipmentId).trim(),
    drawingId,
    drawingIds: drawingIds.length ? drawingIds : (drawingId ? [drawingId] : []),
    wpNo: text(input.wpNo).trim(),
    title: text(input.title).trim(),
    description: text(input.description).trim(),
    discipline: text(input.discipline).trim(),
    plannedStart: text(input.plannedStart).trim(),
    plannedFinish: text(input.plannedFinish).trim(),
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
  if (filters.drawingId != null && filters.drawingId !== '') {
    const drawingId = String(filters.drawingId);
    const drawingIds = Array.isArray(record.drawingIds) ? record.drawingIds : [];
    if (record.drawingId !== drawingId && !drawingIds.includes(drawingId)) return false;
  }
  if (filters.status != null && filters.status !== '' && record.status !== normalizeStatus(filters.status)) {
    return false;
  }
  return true;
}

export async function createWorkpack(input = {}) {
  const db = await getDB();
  const record = normalizeWorkpack(input);
  validateRequired(record, 'create');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function updateWorkpack(id, patch = {}) {
  if (!id) return null;
  const db = await getDB();
  const current = await idbGet(db, STORE_NAME, id);
  if (!current) return null;
  const record = normalizeWorkpack({ ...current, ...(patch || {}), id }, current);
  validateRequired(record, 'update');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function deleteWorkpack(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function getWorkpack(id) {
  if (!id) return null;
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function listWorkpacks(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => matchesFilters(record, filters));
}
