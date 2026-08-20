import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';

const STORE_NAME = 'workpacks';

const WORKPACK_STATUS = Object.freeze({ DRAFT:'DRAFT', PLANNED:'PLANNED', MTO_PENDING:'MTO_PENDING', MATERIAL_PENDING:'MATERIAL_PENDING', MATERIAL_RESERVED:'MATERIAL_RESERVED', READY_FOR_NESTING:'READY_FOR_NESTING', IN_NESTING:'IN_NESTING', NESTED:'NESTED', RELEASED_FOR_CUTTING:'RELEASED_FOR_CUTTING', IN_FABRICATION:'IN_FABRICATION', ON_HOLD:'ON_HOLD', COMPLETED:'COMPLETED', CANCELLED:'CANCELLED' });

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
  const legacy = { ACTIVE: 'IN_FABRICATION', CLOSED: 'COMPLETED' };
  return Object.values(WORKPACK_STATUS).includes(value) ? value : legacy[value] || (value ? WORKPACK_STATUS.DRAFT : WORKPACK_STATUS.PLANNED);
}

function arrayValue(value) { return Array.isArray(value) ? [...new Set(value.map((item) => text(item).trim()).filter(Boolean))] : []; }
function numberValue(value) { return Math.max(0, Number(value) || 0); }

function requiredText(value) {
  return text(value).trim();
}

function validateRequired(record, action) {
  if (!requiredText(record.projectId)) throw new Error(`projectId is required to ${action} a workpack.`);
  if (!requiredText(record.equipmentId)) throw new Error(`equipmentId is required to ${action} a workpack.`);
  if (!requiredText(record.wpNo)) throw new Error(`wpNo is required to ${action} a workpack.`);
}

function workpackNumberKey(projectId, wpNo) { return `${text(projectId).trim().toLowerCase()}|${text(wpNo).trim().toLowerCase()}`; }
async function validateUniqueWorkpackNumber(db, record) {
  const records = await idbGetAll(db, STORE_NAME);
  const conflict = records.some((item) => item.id !== record.id && workpackNumberKey(item.projectId, item.wpNo) === workpackNumberKey(record.projectId, record.wpNo));
  if (conflict) { const error = new Error('WORKPACK_NUMBER_CONFLICT'); error.code = 'WORKPACK_NUMBER_CONFLICT'; throw error; }
}

function normalizeWorkpack(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId).trim(),
    equipmentId: text(input.equipmentId).trim(),
    wpNo: text(input.wpNo).trim(),
    title: text(input.title).trim(),
    description: text(input.description).trim(),
    discipline: text(input.discipline).trim(),
    plannedStart: text(input.plannedStart).trim(),
    plannedFinish: text(input.plannedFinish).trim(),
    status: normalizeStatus(input.status || existing?.status),
    sourceType: text(input.sourceType || existing?.sourceType || 'MTO_LINES').trim().toUpperCase(),
    workpackType: text(input.workpackType || existing?.workpackType).trim().toUpperCase() || 'GENERAL',
    priority: text(input.priority || existing?.priority).trim().toUpperCase() || 'NORMAL',
    equipmentName: text(input.equipmentName || existing?.equipmentName).trim(),
    responsible: text(input.responsible || existing?.responsible).trim(), teamName: text(input.teamName || existing?.teamName).trim(), peopleCount: numberValue(input.peopleCount ?? existing?.peopleCount),
    plannedManHours: numberValue(input.plannedManHours ?? existing?.plannedManHours), actualManHours: numberValue(input.actualManHours ?? existing?.actualManHours),
    fabricationArea: text(input.fabricationArea || existing?.fabricationArea).trim(), shift: text(input.shift || existing?.shift).trim(), subcontractor: text(input.subcontractor || existing?.subcontractor).trim(), inspector: text(input.inspector || existing?.inspector).trim(), welders: arrayValue(input.welders ?? existing?.welders), cuttingMachine: text(input.cuttingMachine || existing?.cuttingMachine).trim(), specificMachine: text(input.specificMachine || existing?.specificMachine).trim(), dailyCapacity: numberValue(input.dailyCapacity ?? existing?.dailyCapacity),
    plannedStartDate: text(input.plannedStartDate || input.plannedStart || existing?.plannedStartDate || existing?.plannedStart).trim(), plannedFinishDate: text(input.plannedFinishDate || input.plannedFinish || existing?.plannedFinishDate || existing?.plannedFinish).trim(), actualStartDate: text(input.actualStartDate || existing?.actualStartDate).trim(), actualFinishDate: text(input.actualFinishDate || existing?.actualFinishDate).trim(),
    manualProgress: input.manualProgress == null || input.manualProgress === '' ? null : Math.min(100, Math.max(0, Number(input.manualProgress) || 0)), calculatedProgress: Math.min(100, Math.max(0, Number(input.calculatedProgress ?? existing?.calculatedProgress) || 0)), effectiveProgress: Math.min(100, Math.max(0, Number(input.effectiveProgress ?? existing?.effectiveProgress) || 0)), progressOverrideReason: input.manualProgress == null || input.manualProgress === '' ? '' : text(input.progressOverrideReason).trim(),
    matchIds: arrayValue(input.matchIds ?? existing?.matchIds), operations: Array.isArray(input.operations) ? input.operations : (existing?.operations || []), releaseSnapshot: input.releaseSnapshot && typeof input.releaseSnapshot === 'object' ? structuredClone(input.releaseSnapshot) : structuredClone(existing?.releaseSnapshot || {}), metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : (existing?.metadata || {}),
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
  if (filters.status != null && filters.status !== '' && record.status !== normalizeStatus(filters.status)) {
    return false;
  }
  return true;
}

export async function createWorkpack(input = {}) {
  const db = await getDB();
  const record = normalizeWorkpack(input);
  validateRequired(record, 'create');
  await validateUniqueWorkpackNumber(db, record);
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
  await validateUniqueWorkpackNumber(db, record);
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
