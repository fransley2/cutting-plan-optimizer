import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';
import {
  equipmentGeneratedCode,
  equipmentGeneratedName,
  equipmentLegacyGeneratedName,
  equipmentPlannedQuantity,
  normalizeEquipmentTags,
} from '../core/equipmentPortfolio.js';
import { normalizeEquipmentClassification } from '../core/equipmentClassification.js';

const STORE_NAME = 'equipments';

const EQUIPMENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  HOLD: 'HOLD',
  INACTIVE: 'INACTIVE',
});

const EQUIPMENT_SCOPE_TYPES = Object.freeze({
  INCORPORATED: 'INCORPORATED',
  NOT_INCORPORATED: 'NOT_INCORPORATED',
});

// --- Utility Functions ---

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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function valueFrom(input, keys, fallback = '') {
  for (const key of keys) {
    if (hasOwn(input, key)) return text(input[key]).trim();
  }
  return text(fallback).trim();
}

function optionalNumber(value) {
  const normalized = text(value).trim().replace(',', '.');
  if (!normalized) return '';
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : '';
}

function optionalNumberFrom(input, keys, fallback = '') {
  for (const key of keys) {
    if (!hasOwn(input, key)) continue;
    return optionalNumber(input[key]);
  }
  return optionalNumber(fallback);
}

function normalizeScopeType(value) {
  const normalized = text(value).trim().toUpperCase().replace(/[\s_-]+/g, ' ');
  if (!normalized) return '';
  if (normalized === 'INCORPORATE' || normalized === 'INCORPORATED') return EQUIPMENT_SCOPE_TYPES.INCORPORATED;
  if (normalized === 'NON INCORPORATE' || normalized === 'NOT INCORPORATED' || normalized === 'NON INCORPORATED') {
    return EQUIPMENT_SCOPE_TYPES.NOT_INCORPORATED;
  }
  return normalized.replace(/\s+/g, '_');
}

function normalizeEquipment(input = {}, existing = null) {
  const classification = normalizeEquipmentClassification({
    equipmentType: valueFrom(input, ['equipmentType', 'Equipment - Type'], existing?.equipmentType),
    system: valueFrom(input, ['system', 'service', 'System', 'Service'], existing?.system),
  });
  const equipmentType = classification.equipmentType;
  const fieldLocation = valueFrom(input, ['fieldLocation', 'Field Location'], existing?.fieldLocation).toUpperCase();
  const variant = valueFrom(input, ['variant', 'Type', 'configuration'], existing?.variant).toUpperCase();
  const equipmentClass = valueFrom(input, ['equipmentClass', 'Structure_Clean', 'structureClean'], existing?.equipmentClass);
  const equipmentStructure = valueFrom(input, ['equipmentStructure', 'Equipment Structure'], existing?.equipmentStructure);
  const scopeType = valueFrom(input, ['scopeType', 'Equipment Designation'], existing?.scopeType);
  const base = existing && typeof existing === 'object' ? { ...existing } : { ...input };
  const tagsWereProvided = hasOwn(input, 'equipmentTags') || hasOwn(input, 'tags');
  const equipmentTags = tagsWereProvided
    ? normalizeEquipmentTags(input.equipmentTags || input.tags)
    : normalizeEquipmentTags(existing?.equipmentTags || existing?.tags || input.clientTag || existing?.clientTag);
  const plannedQuantity = equipmentPlannedQuantity({
    plannedQuantity: valueFrom(input, ['plannedQuantity', 'quantity'], existing?.plannedQuantity || existing?.quantity),
    equipmentTags,
    clientTag: valueFrom(input, ['clientTag'], existing?.clientTag),
  });
  const generatedIdentity = { fieldLocation, equipmentType, system: classification.system, variant };
  const generatedName = equipmentGeneratedName(generatedIdentity);
  const generatedCode = equipmentGeneratedCode(generatedIdentity);
  const existingName = text(existing?.equipmentName || existing?.name).trim();
  const previousGeneratedName = equipmentGeneratedName(existing || {});
  const previousLegacyGeneratedName = equipmentLegacyGeneratedName(existing || {});
  const explicitName = valueFrom(input, ['equipmentName', 'Equipment Name', 'name']);
  const equipmentName = explicitName || (!existingName || [previousGeneratedName, previousLegacyGeneratedName].includes(existingName)
    ? generatedName
    : existingName);
  const existingCode = text(existing?.code).trim();
  const previousGeneratedCode = equipmentGeneratedCode(existing || {});
  const previousLegacyGeneratedCode = equipmentGeneratedCode({ ...existing, system: '' });
  const explicitCode = valueFrom(input, ['code']);
  const code = explicitCode || (!existingCode || [previousGeneratedCode, previousLegacyGeneratedCode].includes(existingCode)
    ? generatedCode
    : existingCode);

  return {
    ...base,
    id: text(input.id).trim() || existing?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    projectId: valueFrom(input, ['projectId'], existing?.projectId),
    equipmentTypeId: valueFrom(input, ['equipmentTypeId'], existing?.equipmentTypeId),
    code,
    scopeType: normalizeScopeType(scopeType),
    equipmentClass: equipmentClass.toUpperCase(),
    equipmentType: equipmentType.toUpperCase(),
    equipmentStructure: equipmentStructure.toUpperCase(),
    equipmentName,
    name: equipmentName,
    fieldLocation,
    system: classification.system,
    variant,
    plannedQuantity,
    equipmentTags,
    clientTag: tagsWereProvided ? equipmentTags[0] || '' : valueFrom(input, ['clientTag'], existing?.clientTag),
    designDrawingNo: valueFrom(input, ['designDrawingNo', 'designDrawing'], existing?.designDrawingNo).toUpperCase(),
    discipline: valueFrom(input, ['discipline'], existing?.discipline),
    description: valueFrom(input, ['description'], existing?.description),
    theoreticalWeightKg: optionalNumberFrom(input, ['theoreticalWeightKg'], existing?.theoreticalWeightKg),
    photoUrl: valueFrom(input, ['photoUrl'], existing?.photoUrl),
    status: normalizeStatus(valueFrom(input, ['status'], existing?.status)),
    createdAt: existing?.createdAt || valueFrom(input, ['createdAt']) || nowIso(),
    updatedAt: nowIso(),
  };
}

// --- Uniqueness Validation ---

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function identity(value) {
  return text(value).trim().toLocaleUpperCase();
}

function equipmentName(record) {
  return text(record?.equipmentName || record?.name).trim();
}

function recordTags(record) {
  return normalizeEquipmentTags([
    ...normalizeEquipmentTags(record?.equipmentTags || record?.tags),
    record?.clientTag,
  ]);
}

async function validateUniqueness(record) {
  const db = await getDB();
  const allRecords = await idbGetAll(db, STORE_NAME);

  if (!record.projectId) throw domainError('EQUIPMENT_PROJECT_REQUIRED', 'Project is required.');
  if (!equipmentName(record)) throw domainError('EQUIPMENT_NAME_REQUIRED', 'Equipment Name is required.');

  for (const existing of allRecords) {
    if (existing.id === record.id || identity(existing.projectId) !== identity(record.projectId)) continue;
    if (identity(equipmentName(existing)) === identity(equipmentName(record))) {
      throw domainError('EQUIPMENT_NAME_CONFLICT', `Equipment Name "${record.equipmentName}" already exists in this Project.`);
    }
    if (record.code && existing.code && identity(existing.code) === identity(record.code)) {
      throw domainError('EQUIPMENT_CODE_CONFLICT', `Code "${record.code}" already exists in this Project.`);
    }
    const existingTags = new Set(recordTags(existing).map(identity));
    const duplicatedTag = recordTags(record).find((tag) => existingTags.has(identity(tag)));
    if (duplicatedTag) {
      throw domainError('EQUIPMENT_CLIENT_TAG_CONFLICT', `Equipment Tag "${duplicatedTag}" already exists in this Project.`);
    }
  }
}

// --- Filters & Lookups ---

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
  if (!normalized) return { equipment: null, ambiguous: false, matches: [], matchedBy: null };

  const records = Array.isArray(equipments) ? equipments : [];
  const tagMatches = records.filter((equipment) => recordTags(equipment).some((tag) => normalizedLookup(tag) === normalized));
  if (tagMatches.length > 1) {
    console.warn(`Multiple equipments match "${hint}" by equipmentTags.`);
    return { equipment: null, ambiguous: true, matches: tagMatches, matchedBy: 'equipmentTags' };
  }
  if (tagMatches.length) return { equipment: tagMatches[0], ambiguous: false, matches: tagMatches, matchedBy: 'equipmentTags' };
  const fields = ['clientTag', 'name', 'code'];

  for (const field of fields) {
    const matches = records.filter((equipment) => normalizedLookup(equipment?.[field]) === normalized);
    if (matches.length > 1) {
      console.warn(`Multiple equipments match "${hint}" by ${field}.`);
      return { equipment: null, ambiguous: true, matches, matchedBy: field };
    }
    if (matches.length) return { equipment: matches[0], ambiguous: false, matches, matchedBy: field };
  }
  return { equipment: null, ambiguous: false, matches: [], matchedBy: null };
}

// --- CRUD Operations ---

export async function createEquipment(input = {}) {
  const db = await getDB();
  const record = normalizeEquipment(input);
  await validateUniqueness(record);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function updateEquipment(id, patch = {}) {
  if (!id) return null;
  const db = await getDB();

  const current = await idbGet(db, STORE_NAME, id);
  if (!current) return null;

  const record = normalizeEquipment({ ...(patch || {}), id }, current);
  await validateUniqueness(record);
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

export async function migrateEquipmentClassifications(equipmentTypeIdsByName = new Map()) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  const typeIdFor = (equipmentType) => equipmentTypeIdsByName instanceof Map
    ? equipmentTypeIdsByName.get(equipmentType)
    : equipmentTypeIdsByName[equipmentType];
  const updatedIds = [];

  for (const current of records) {
    const classification = normalizeEquipmentClassification(current);
    const canonicalTypeId = typeIdFor(classification.equipmentType) || current.equipmentTypeId || '';
    if (
      classification.equipmentType === current.equipmentType
      && classification.system === (current.system || '')
      && canonicalTypeId === (current.equipmentTypeId || '')
    ) continue;

    const migrated = normalizeEquipment({
      id: current.id,
      equipmentType: classification.equipmentType,
      equipmentTypeId: canonicalTypeId,
      system: classification.system,
    }, current);
    await idbPut(db, STORE_NAME, migrated);
    updatedIds.push(current.id);
  }

  return { updatedCount: updatedIds.length, updatedIds };
}

export async function findEquipmentByHint(hint, filters = {}) {
  if (!text(hint).trim()) return null;
  return findEquipmentMatch(await listEquipments(filters), hint).equipment;
}
