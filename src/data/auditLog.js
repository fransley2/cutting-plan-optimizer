import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'auditLog';
const LEGACY_STORE_NAME = 'auditEvents';

export const AUDIT_EVENT_TYPES = Object.freeze({
  IMPORT_INVENTORY: 'IMPORT_INVENTORY',
  IMPORT_MTO: 'IMPORT_MTO',
  MATCH_MTO: 'MATCH_MTO',
  RESERVE_STOCK: 'RESERVE_STOCK',
  RELEASE_RESERVATION: 'RELEASE_RESERVATION',
  ISSUE_MATERIAL: 'ISSUE_MATERIAL',
  GENERATE_MATERIAL_COUPON: 'GENERATE_MATERIAL_COUPON',
  GENERATE_CUTTING_SHEET: 'GENERATE_CUTTING_SHEET',
  CONSUME_STOCK: 'CONSUME_STOCK',
  RETURN_OFFCUT: 'RETURN_OFFCUT',
  SCRAP_OFFCUT: 'SCRAP_OFFCUT',
  GENERATE_RMV: 'GENERATE_RMV',
  IMPORT_BACKUP: 'IMPORT_BACKUP',
  EXPORT_BACKUP: 'EXPORT_BACKUP',
  CLEAR_LOCAL_DATA: 'CLEAR_LOCAL_DATA',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
});

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value);
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function nullableValue(value) {
  return value == null ? null : value;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeEvent(input = {}) {
  return {
    id: text(input.id) || createId(),
    eventType: text(input.eventType),
    entityType: text(input.entityType),
    entityId: text(input.entityId),
    projectId: text(input.projectId),
    timestamp: normalizeTimestamp(input.timestamp),
    userName: text(input.userName),
    sourceDocumentType: text(input.sourceDocumentType),
    sourceDocumentId: text(input.sourceDocumentId),
    reason: text(input.reason),
    before: nullableValue(input.before),
    after: nullableValue(input.after),
    metadata: objectValue(input.metadata),
  };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function newestFirst(a, b) {
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
}

function matchesFilters(event, filters = {}) {
  const exactFields = [
    'projectId',
    'entityType',
    'entityId',
    'eventType',
    'sourceDocumentType',
    'sourceDocumentId',
  ];
  const exactMatch = exactFields.every((field) => filters[field] == null || event[field] === String(filters[field]));
  if (!exactMatch) return false;

  const timestamp = new Date(event.timestamp);
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from && timestamp < from) return false;
  if (to && timestamp > to) return false;
  return true;
}

export async function createAuditEvent(input) {
  const event = await createAuditLogEntry(input);
  const db = await getDB();
  if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
    await idbPut(db, LEGACY_STORE_NAME, event);
  }
  return event;
}

export async function createAuditLogEntry(input) {
  const db = await getDB();
  const event = normalizeEvent(input);
  return idbPut(db, STORE_NAME, event);
}

export async function getAllAuditEvents() {
  return getAllAuditLogEntries();
}

export async function getAllAuditLogEntries() {
  const db = await getDB();
  const events = await idbGetAll(db, STORE_NAME);
  return events.sort(newestFirst);
}

export async function getAuditEvents(filters = {}) {
  return getAuditLogEntries(filters);
}

export async function getAuditLogEntry(id) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function getAuditLogEntries(filters = {}) {
  const events = await getAllAuditEvents();
  return events.filter((event) => matchesFilters(event, filters));
}

export function getAuditEventsForEntity(entityType, entityId) {
  return getAuditEvents({ entityType, entityId });
}

export async function deleteAuditEvent(id) {
  const deleted = await deleteAuditLogEntry(id);
  const db = await getDB();
  if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
    await idbDelete(db, LEGACY_STORE_NAME, id);
  }
  return deleted;
}

export async function deleteAuditLogEntry(id) {
  if (!id) return undefined;
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function clearAuditEvents() {
  const cleared = await clearAuditLog();
  const db = await getDB();
  if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
    await idbClear(db, LEGACY_STORE_NAME);
  }
  return cleared;
}

export async function clearAuditLog() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
