import { getDB } from './database.js';
import { idbDelete, idbGet, idbGetAll, idbPut } from './idb.js';

const STORE_NAME = 'organizations';

function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function text(value) { return value == null ? '' : String(value).trim(); }
function nowIso() { return new Date().toISOString(); }

function roles(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map((item) => text(item).toUpperCase()).filter(Boolean))];
}

function list(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map((item) => text(item)).filter(Boolean))];
}

export function normalizeOrganization(input = {}, existing = null) {
  const source = { ...(existing || {}), ...input };
  return {
    id: text(source.id) || createId(),
    legalName: text(source.legalName),
    tradeName: text(source.tradeName),
    organizationType: roles(source.organizationType?.length ? source.organizationType : ['SUPPLIER']),
    vendorCode: text(source.vendorCode),
    taxId: text(source.taxId),
    country: text(source.country),
    primaryEmail: text(source.primaryEmail),
    primaryPhone: text(source.primaryPhone),
    website: text(source.website),
    supplyCategories: list(source.supplyCategories),
    qualificationStatus: text(source.qualificationStatus).toUpperCase() || 'NOT_STARTED',
    qualificationExpiry: text(source.qualificationExpiry),
    certifications: list(source.certifications),
    notes: text(source.notes),
    status: text(source.status).toUpperCase() || 'ACTIVE',
    sourceSystem: text(source.sourceSystem) || 'MANUAL',
    createdAt: text(source.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

export async function saveOrganization(input = {}) {
  const db = await getDB();
  const existing = input.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeOrganization(input, existing);
  if (!record.legalName) throw new Error('Organization legal name is required.');
  const duplicateVendorCode = record.vendorCode && (await idbGetAll(db, STORE_NAME)).some((item) => item.id !== record.id && item.vendorCode === record.vendorCode);
  if (duplicateVendorCode) throw new Error('Vendor Code already belongs to another Organization.');
  const duplicateTaxId = record.taxId && (await idbGetAll(db, STORE_NAME)).some((item) => item.id !== record.id && text(item.taxId).toUpperCase() === record.taxId.toUpperCase());
  if (duplicateTaxId) throw new Error('Tax ID already belongs to another Organization.');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getOrganization(id) { return idbGet(await getDB(), STORE_NAME, id); }
export async function getAllOrganizations() { return idbGetAll(await getDB(), STORE_NAME); }
export async function listOrganizations(filters = {}) {
  const records = await getAllOrganizations();
  return records.filter((record) => (!filters.status || record.status === filters.status)
    && (!filters.role || record.organizationType.includes(filters.role)));
}
