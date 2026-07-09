import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';

const STORE_NAME = 'equipments';

const EQUIPMENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  HOLD: 'HOLD',
  INACTIVE: 'INACTIVE',
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
  return Object.values(EQUIPMENT_STATUS).includes(value) ? value : EQUIPMENT_STATUS.ACTIVE;
}

function normalizeEquipment(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId),
    code: text(input.code).trim(),
    name: text(input.name).trim(),
    clientTag: text(input.clientTag).trim(),
    discipline: text(input.discipline).trim(),
    description: text(input.description).trim(),
    status: normalizeStatus(input.status || existing?.status),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function matchesFilters(record, filters = {}) {
  if (filters.projectId != null && filters.projectId !== '' && record.projectId !== String(filters.projectId)) {
    return false;
  }
  if (filters.status != null && filters.status !== '' && record.status !== normalizeStatus(filters.status)) {
    return false;
  }
  return true;
}

function normalizedLookup(value) {
  return text(value).trim().toLowerCase();
}

export function findEquipmentMatch(equipments = [], hint) {
  const normalized = normalizedLookup(hint);
  if (!normalized) return null;
  const records = Array.isArray(equipments) ? equipments : [];
  const fields = ['clientTag', 'name', 'code'];
  for (const field of fields) {
    const matches = records.filter((equipment) => normalizedLookup(equipment?.[field]) === normalized);
    if (matches.length > 1) {
      console.warn(`Multiple equipments match "${hint}" by ${field}. Using the first match.`);
    }
    if (matches.length) return matches[0];
  }
  return null;
}

export async function createEquipment(input = {}) {
  const db = await getDB();
  const record = normalizeEquipment(input);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function updateEquipment(id, patch = {}) {
  if (!id) return null;
  const db = await getDB();
  const current = await idbGet(db, STORE_NAME, id);
  if (!current) return null;
  const record = normalizeEquipment({ ...current, ...(patch || {}), id }, current);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function deleteEquipment(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function getEquipment(id) {
  if (!id) return null;
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function listEquipments(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => matchesFilters(record, filters));
}

export async function findEquipmentByHint(hint, filters = {}) {
  if (!text(hint).trim()) return null;
  return findEquipmentMatch(await listEquipments(filters), hint);
}
