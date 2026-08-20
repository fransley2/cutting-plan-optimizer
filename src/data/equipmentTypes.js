import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';
import { deleteEquipment, listEquipments, migrateEquipmentClassifications } from './equipments.js';
import { isLegacyEquipmentTypeName } from '../core/equipmentClassification.js';

const STORE_NAME = 'equipmentTypes';
const RETIRED_EQUIPMENT_TYPE_NAMES = new Set(['JUMPER LIQUID']);
const RETIRED_EQUIPMENT_TYPE_CODES = new Set(['JMP-LIQ']);

export const EQUIPMENT_TYPE_CATEGORIES = Object.freeze({
  SUBSEA: 'SUBSEA',
  PIPELINE: 'PIPELINE',
  STRUCTURAL: 'STRUCTURAL',
  INSTALLATION: 'INSTALLATION',
  TEMPORARY: 'TEMPORARY',
});

const SEED_EQUIPMENT_TYPES = Object.freeze([
  { name: 'PLEM', code: 'PLEM', equipmentClass: 'PLEM', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Pipeline End Manifold', sortOrder: 10 },
  { name: 'PLEM INTERMEDIATE FRAME', code: 'PIF', equipmentClass: 'PLEM', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Intermediate PLEM frame', sortOrder: 20 },
  { name: 'PLET', code: 'PLET', equipmentClass: 'PLET', scopeType: 'INCORPORATED', discipline: 'PIPING', description: 'Pipeline End Termination', sortOrder: 30 },
  { name: 'MANIFOLD', code: 'MAN', equipmentClass: 'MANIFOLD', scopeType: 'INCORPORATED', discipline: 'PIPING', description: 'Subsea manifold', sortOrder: 40 },
  { name: 'JUMPER', code: 'JMP', equipmentClass: 'JUMPER', scopeType: 'INCORPORATED', discipline: 'PIPING', description: 'Rigid jumper assembly', sortOrder: 50 },
  { name: 'SPOOL', code: 'SPL', equipmentClass: 'SPOOL', scopeType: 'INCORPORATED', discipline: 'PIPING', description: 'Fabricated spool assembly', sortOrder: 60 },
  { name: 'LOOP', code: 'LOOP', equipmentClass: 'LOOP', scopeType: 'INCORPORATED', discipline: 'PIPING', description: 'Fabricated loop assembly', sortOrder: 70 },
  { name: 'FLEXIBLE JUMPER', code: 'FJMP', equipmentClass: 'JUMPER', scopeType: 'INCORPORATED', discipline: 'PIPING', description: 'Flexible jumper', sortOrder: 80 },
  { name: 'BASE FRAME', code: 'BF', equipmentClass: 'FRAME', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Equipment base frame', sortOrder: 100 },
  { name: 'PROTECTION STRUCTURE', code: 'PS', equipmentClass: 'STRUCTURE', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Protection structure', sortOrder: 110 },
  { name: 'ROV PANEL', code: 'ROV-PNL', equipmentClass: 'PANEL', scopeType: 'INCORPORATED', discipline: 'MECHANICAL', description: 'ROV interface panel', sortOrder: 120 },
  { name: 'ROV GRAB BAR', code: 'ROV-GB', equipmentClass: 'ROV TOOLING', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'ROV grab bar', sortOrder: 130 },
  { name: 'ROV TOOL BASKET', code: 'RTB', equipmentClass: 'ROV TOOLING', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'ROV tool basket', sortOrder: 140 },
  { name: 'ROV TOOL BASKET TYPE A', code: 'RTB-A', equipmentClass: 'ROV TOOLING', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'ROV tool basket type A', sortOrder: 150 },
  { name: 'HOT STAB ASSEMBLY', code: 'HSA', equipmentClass: 'CONNECTOR', scopeType: 'INCORPORATED', discipline: 'MECHANICAL', description: 'Hot stab assembly', sortOrder: 160 },
  { name: 'UTA', code: 'UTA', equipmentClass: 'UMBILICAL', scopeType: 'INCORPORATED', discipline: 'ELECTRICAL', description: 'Umbilical Termination Assembly', sortOrder: 170 },
  { name: 'SDU', code: 'SDU', equipmentClass: 'DISTRIBUTION', scopeType: 'INCORPORATED', discipline: 'ELECTRICAL', description: 'Subsea Distribution Unit', sortOrder: 180 },
  { name: 'EDU', code: 'EDU', equipmentClass: 'DISTRIBUTION', scopeType: 'INCORPORATED', discipline: 'ELECTRICAL', description: 'Electrical Distribution Unit', sortOrder: 190 },
  { name: 'INLINE ANCHOR STRUCTURE', code: 'ILA', equipmentClass: 'ANCHOR', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Inline anchor structure', sortOrder: 200 },
  { name: 'INLINE SLED', code: 'ILSD', equipmentClass: 'SLED', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Inline sled', sortOrder: 210 },
  { name: 'SUCTION PILE', code: 'SP', equipmentClass: 'FOUNDATION', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Suction pile', sortOrder: 220 },
  { name: 'SLEEPER', code: 'SLP', equipmentClass: 'SUPPORT', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Pipeline sleeper', sortOrder: 230 },
  { name: 'CROSSING BRIDGE', code: 'CBR', equipmentClass: 'SUPPORT', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Crossing bridge', sortOrder: 240 },
  { name: 'ADJUSTABLE PIPELINE SUPPORT', code: 'APS', equipmentClass: 'SUPPORT', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Adjustable pipeline support', sortOrder: 250 },
  { name: 'LBMS', code: 'LBMS', equipmentClass: 'SUPPORT', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Lateral buckling mitigation support', sortOrder: 260 },
  { name: 'A&R HEAD', code: 'ARH', equipmentClass: 'INSTALLATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Abandonment and Recovery head', sortOrder: 270 },
  { name: 'PULL-IN HEAD', code: 'PIH', equipmentClass: 'INSTALLATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Pull-in head', sortOrder: 280 },
  { name: 'BUOYANCY TANK', code: 'BT', equipmentClass: 'INSTALLATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Buoyancy tank', sortOrder: 290 },
  { name: 'CLUMP WEIGHT', code: 'CW', equipmentClass: 'INSTALLATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Clump weight', sortOrder: 300 },
  { name: 'SEAFASTENING', code: 'SEA', equipmentClass: 'FABRICATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Seafastening structure', sortOrder: 310 },
  { name: 'SPREADER FRAME', code: 'SPF', equipmentClass: 'LIFTING AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Spreader frame', sortOrder: 320 },
  { name: 'LAYDOWN ASSEMBLY', code: 'LDA', equipmentClass: 'INSTALLATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Laydown assembly', sortOrder: 330 },
  { name: 'TEMPORARY SUPPORT', code: 'TMP-SUP', equipmentClass: 'FABRICATION AID', scopeType: 'NOT_INCORPORATED', discipline: 'STRUCTURAL', description: 'Temporary fabrication support', sortOrder: 340 },
  { name: 'STRUCTURE', code: 'STR', equipmentClass: 'STRUCTURE', scopeType: 'INCORPORATED', discipline: 'STRUCTURAL', description: 'Generic incorporated structure', sortOrder: 350 },
]);

let seedPromise = null;

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value);
}

function upper(value) {
  return text(value).trim().toUpperCase();
}

function nowIso() {
  return new Date().toISOString();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeScopeType(value) {
  const normalized = upper(value).replace(/[\s_-]+/g, ' ');
  if (!normalized) return '';
  if (normalized === 'INCORPORATE' || normalized === 'INCORPORATED') return 'INCORPORATED';
  if (normalized === 'NON INCORPORATE' || normalized === 'NON INCORPORATED' || normalized === 'NOT INCORPORATED') {
    return 'NOT_INCORPORATED';
  }
  return normalized.replace(/\s+/g, '_');
}

function normalizeStatus(value) {
  const normalized = upper(value);
  return normalized || 'ACTIVE';
}

function normalizeEquipmentType(input = {}, existing = null) {
  const equipmentClass = upper(input.equipmentClass || input.category || existing?.equipmentClass || existing?.category);
  const scopeType = normalizeScopeType(input.scopeType || existing?.scopeType);
  return {
    id: text(input.id).trim() || existing?.id || createId(),
    name: upper(input.name),
    code: upper(input.code),
    category: equipmentClass,
    equipmentClass,
    scopeType,
    discipline: upper(input.discipline),
    status: normalizeStatus(input.status || existing?.status),
    description: text(input.description).trim(),
    projectId: text(input.projectId).trim(),
    sortOrder: numberValue(input.sortOrder, existing?.sortOrder || 0),
    createdAt: text(input.createdAt).trim() || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function sortEquipmentTypes(a, b) {
  return (a.sortOrder || 0) - (b.sortOrder || 0)
    || a.projectId.localeCompare(b.projectId)
    || a.name.localeCompare(b.name);
}

function matchesFilters(type, filters = {}) {
  if (filters.projectId !== undefined && filters.projectId !== null) {
    const projectId = text(filters.projectId).trim();
    if (type.projectId && type.projectId !== projectId) return false;
  }
  if (filters.category && type.category !== upper(filters.category)) return false;
  if (filters.scopeType && type.scopeType !== normalizeScopeType(filters.scopeType)) return false;
  if (filters.status && type.status !== normalizeStatus(filters.status)) return false;
  if (filters.search) {
    const query = upper(filters.search);
    const haystack = [
      type.name,
      type.code,
      type.category,
      type.equipmentClass,
      type.scopeType,
      type.discipline,
      type.status,
      type.description,
      type.projectId,
    ].join(' ').toUpperCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export function normalizeEquipmentTypeName(value) {
  return upper(value);
}

export function isRetiredEquipmentType(input = {}) {
  if (typeof input === 'string') return RETIRED_EQUIPMENT_TYPE_NAMES.has(upper(input));
  return RETIRED_EQUIPMENT_TYPE_NAMES.has(upper(input.name))
    || RETIRED_EQUIPMENT_TYPE_CODES.has(upper(input.code));
}

export async function createEquipmentType(input = {}) {
  const db = await getDB();
  const record = normalizeEquipmentType(input);
  if (!record.name) throw new Error('Equipment type name is required.');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getEquipmentType(id) {
  if (!id) return null;
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function listEquipmentTypes(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => matchesFilters(record, filters)).sort(sortEquipmentTypes);
}

export async function updateEquipmentType(id, patch = {}) {
  if (!id) return null;
  const current = await getEquipmentType(id);
  if (!current) return null;
  const db = await getDB();
  const record = normalizeEquipmentType({ ...current, ...(patch || {}), id }, current);
  if (!record.name) throw new Error('Equipment type name is required.');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function isEquipmentTypeInUse(typeName) {
  const normalized = normalizeEquipmentTypeName(typeName);
  if (!normalized) return false;
  const equipments = await listEquipments({});
  return equipments.some((equipment) => normalizeEquipmentTypeName(equipment.equipmentType) === normalized);
}

export async function deleteEquipmentType(id) {
  const current = await getEquipmentType(id);
  if (!current) return false;
  if (await isEquipmentTypeInUse(current.name)) {
    throw new Error('Equipment type is used by existing equipment records.');
  }
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function purgeRetiredEquipmentTypes() {
  const equipmentTypes = await listEquipmentTypes({});
  const retiredTypes = equipmentTypes.filter(isRetiredEquipmentType);
  const retiredTypeIds = new Set(retiredTypes.map((type) => type.id).filter(Boolean));
  const equipments = await listEquipments({});
  const retiredEquipments = equipments.filter((equipment) => (
    retiredTypeIds.has(equipment.equipmentTypeId)
    || isRetiredEquipmentType(equipment.equipmentType)
  ));

  await Promise.all(retiredEquipments.map((equipment) => deleteEquipment(equipment.id)));
  const db = await getDB();
  await Promise.all(retiredTypes.map((type) => idbDelete(db, STORE_NAME, type.id)));

  return {
    equipmentTypeIds: retiredTypes.map((type) => type.id),
    equipmentIds: retiredEquipments.map((equipment) => equipment.id),
    equipmentTypeCount: retiredTypes.length,
    equipmentCount: retiredEquipments.length,
  };
}

export async function seedEquipmentTypes() {
  if (seedPromise) return seedPromise;
  seedPromise = seedEquipmentTypesOnce().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

async function seedEquipmentTypesOnce() {
  await purgeRetiredEquipmentTypes();
  const existing = await listEquipmentTypes({});
  const existingByKey = new Map(existing.map((type) => [`${type.projectId || ''}|${normalizeEquipmentTypeName(type.name)}`, type]));
  const seeded = [];
  for (const seed of SEED_EQUIPMENT_TYPES) {
    const key = `|${normalizeEquipmentTypeName(seed.name)}`;
    const current = existingByKey.get(key);
    if (!current) {
      seeded.push(await createEquipmentType({ ...seed, projectId: '' }));
      continue;
    }
    if (!current.equipmentClass || !current.scopeType || !current.status) {
      seeded.push(await updateEquipmentType(current.id, {
        code: current.code || seed.code,
        category: current.category || seed.equipmentClass,
        equipmentClass: current.equipmentClass || seed.equipmentClass,
        scopeType: current.scopeType || seed.scopeType,
        discipline: current.discipline || seed.discipline,
        status: current.status || 'ACTIVE',
        description: current.description || seed.description,
        sortOrder: current.sortOrder || seed.sortOrder,
      }));
    } else {
      seeded.push(current);
    }
  }

  const currentTypes = await listEquipmentTypes({});
  const canonicalTypeIds = new Map(
    currentTypes
      .filter((type) => !type.projectId && !isLegacyEquipmentTypeName(type.name))
      .map((type) => [normalizeEquipmentTypeName(type.name), type.id]),
  );
  await migrateEquipmentClassifications(canonicalTypeIds);

  const legacyTypes = currentTypes.filter((type) => isLegacyEquipmentTypeName(type.name));
  if (legacyTypes.length) {
    const db = await getDB();
    await Promise.all(legacyTypes.map((type) => idbDelete(db, STORE_NAME, type.id)));
  }
  return seeded;
}

export const DEFAULT_EQUIPMENT_TYPES = SEED_EQUIPMENT_TYPES;
