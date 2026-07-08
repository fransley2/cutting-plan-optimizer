import { getDB } from './database.js';
import { idbGetAll, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'stockMovements';

export const STOCK_MOVEMENT_TYPES = Object.freeze({
  IMPORT_INVENTORY: 'IMPORT_INVENTORY',
  RESERVE_STOCK: 'RESERVE_STOCK',
  RELEASE_RESERVATION: 'RELEASE_RESERVATION',
  ISSUE_MATERIAL: 'ISSUE_MATERIAL',
  CONSUME_STOCK: 'CONSUME_STOCK',
  RETURN_OFFCUT: 'RETURN_OFFCUT',
  SCRAP_OFFCUT: 'SCRAP_OFFCUT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
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

function nullableValue(value) {
  return value == null ? null : value;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeMovement(input = {}) {
  return {
    id: text(input.id) || createId(),
    movementType: text(input.movementType),
    inventoryItemId: text(input.inventoryItemId),
    projectId: text(input.projectId),
    timestamp: normalizeTimestamp(input.timestamp),
    userName: text(input.userName),
    quantityDelta: numberValue(input.quantityDelta),
    lengthDelta: numberValue(input.lengthDelta),
    previousStatus: text(input.previousStatus),
    nextStatus: text(input.nextStatus),
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

function matchesFilters(movement, filters = {}) {
  const exactFields = [
    'inventoryItemId',
    'projectId',
    'movementType',
    'sourceDocumentType',
    'sourceDocumentId',
  ];
  const exactMatch = exactFields.every((field) => filters[field] == null || movement[field] === String(filters[field]));
  if (!exactMatch) return false;

  const timestamp = new Date(movement.timestamp);
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from && timestamp < from) return false;
  if (to && timestamp > to) return false;
  return true;
}

export async function createStockMovement(input) {
  const db = await getDB();
  const movement = normalizeMovement(input);
  return idbPut(db, STORE_NAME, movement);
}

export async function getAllStockMovements() {
  const db = await getDB();
  const movements = await idbGetAll(db, STORE_NAME);
  return movements.sort(newestFirst);
}

export async function getStockMovements(filters = {}) {
  const movements = await getAllStockMovements();
  return movements.filter((movement) => matchesFilters(movement, filters));
}

export function getStockMovementsForInventoryItem(inventoryItemId) {
  return getStockMovements({ inventoryItemId });
}

export async function deleteStockMovement(id) {
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function clearStockMovements() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
