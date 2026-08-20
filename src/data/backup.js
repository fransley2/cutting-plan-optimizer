import { getDB } from './database.js';

export const BACKUP_FORMAT = 'CuttingPlanOptimizerBackup';
export const BACKUP_VERSION = 4;
export const BACKUP_INTEGRITY_ALGORITHM = 'SHA-256';

const LEGACY_STORE_MAP = Object.freeze({
  plans: 'plans',
  projects: 'projects',
  inventory: 'inventory',
  auditEvents: 'auditEvents',
  auditLog: 'auditLog',
  stockMovements: 'stockMovements',
  mtoBatches: 'mtoBatches',
  mtoItems: 'mtoItems',
  materialCoupons: 'materialCoupons',
  cuttingSheets: 'cuttingSheets',
  returnMaterialVouchers: 'returnMaterialVouchers',
  offcuts: 'offcuts',
  workpackLinks: 'workpackLinks',
  materialReservations: 'materialReservations',
  materialTransformations: 'materialTransformations',
  taskSheets: 'taskSheets',
});

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('A transação de dados foi cancelada.'));
    transaction.onerror = () => reject(transaction.error || new Error('Falha na transação de dados.'));
  });
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function serializeBackupValue(value) {
  if (value instanceof Date) {
    return { __backupType: 'Date', value: value.toISOString() };
  }
  if (value instanceof ArrayBuffer) {
    return { __backupType: 'ArrayBuffer', base64: bufferToBase64(value) };
  }
  if (ArrayBuffer.isView(value)) {
    return { __backupType: 'ArrayBuffer', base64: bufferToBase64(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) };
  }
  if (Array.isArray(value)) return value.map(serializeBackupValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBackupValue(item)]));
  }
  return value;
}

export function deserializeBackupValue(value) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map(deserializeBackupValue);
  if (value && typeof value === 'object') {
    if (value.__backupType === 'ArrayBuffer' && typeof value.base64 === 'string') return base64ToBuffer(value.base64);
    if (value.__backupType === 'Date' && typeof value.value === 'string') return new Date(value.value);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deserializeBackupValue(item)]));
  }
  return value;
}

function legacyStores(raw = {}) {
  const stores = {};
  Object.entries(LEGACY_STORE_MAP).forEach(([legacyKey, storeName]) => {
    if (Array.isArray(raw[legacyKey])) stores[storeName] = raw[legacyKey];
  });
  const settings = [raw.appSettings, raw.profile].filter((item) => item && typeof item === 'object');
  if (settings.length) stores.settings = settings;
  return stores;
}

export function normalizeBackupPayload(raw = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('Arquivo de backup inválido.');
  const sourceStores = raw.format === BACKUP_FORMAT && raw.stores && typeof raw.stores === 'object'
    ? raw.stores
    : legacyStores(raw);
  if (!Object.keys(sourceStores).length) throw new Error('O arquivo não contém nenhuma store de dados reconhecida.');
  const invalidStore = Object.entries(sourceStores).find(([, records]) => !Array.isArray(records));
  if (invalidStore) throw new Error(`A store "${invalidStore[0]}" não contém uma lista válida de registros.`);
  const stores = Object.fromEntries(Object.entries(sourceStores).map(([name, records]) => [String(name), deserializeBackupValue(records)]));
  return {
    format: raw.format || 'LegacyCuttingPlanOptimizerBackup',
    version: Number(raw.version || 1),
    exportedAt: String(raw.exportedAt || ''),
    databaseVersion: Number(raw.databaseVersion || 0),
    integrity: raw.integrity && typeof raw.integrity === 'object' ? { ...raw.integrity } : null,
    stores,
  };
}

export function getBackupSummary(backup = {}) {
  const normalized = normalizeBackupPayload(backup);
  const stores = Object.entries(normalized.stores)
    .map(([name, records]) => ({ name, count: records.length }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    format: normalized.format,
    version: normalized.version,
    exportedAt: normalized.exportedAt,
    databaseVersion: normalized.databaseVersion,
    integrity: normalized.integrity,
    stores,
    totalRecords: stores.reduce((total, item) => total + item.count, 0),
  };
}

function integrityContent(backup) {
  const normalized = normalizeBackupPayload(backup);
  return JSON.stringify({
    format: normalized.format,
    version: normalized.version,
    exportedAt: normalized.exportedAt,
    databaseVersion: normalized.databaseVersion,
    stores: serializeBackupValue(normalized.stores),
  });
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador não oferece verificação criptográfica para backups.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function addBackupIntegrity(backup) {
  return {
    ...backup,
    integrity: {
      algorithm: BACKUP_INTEGRITY_ALGORITHM,
      digest: await sha256(integrityContent(backup)),
    },
  };
}

export async function verifyBackupIntegrity(backup) {
  const normalized = normalizeBackupPayload(backup);
  if (!normalized.integrity) return { verified: false, legacy: true };
  if (normalized.integrity.algorithm !== BACKUP_INTEGRITY_ALGORITHM || !normalized.integrity.digest) {
    throw new Error('O backup usa um método de integridade não suportado.');
  }
  const actualDigest = await sha256(integrityContent({ ...normalized, integrity: null }));
  if (actualDigest !== normalized.integrity.digest) {
    throw new Error('A verificação de integridade falhou. O arquivo pode estar corrompido ou ter sido alterado.');
  }
  return { verified: true, legacy: false };
}

async function readAllStores(database, storeNames) {
  if (!storeNames.length) return {};
  const transaction = database.transaction(storeNames, 'readonly');
  const requests = storeNames.map((name) => ({ name, request: transaction.objectStore(name).getAll() }));
  await transactionDone(transaction);
  return Object.fromEntries(requests.map(({ name, request }) => [name, request.result || []]));
}

export async function createFullBackup() {
  const database = await getDB();
  const storeNames = Array.from(database.objectStoreNames);
  const records = await readAllStores(database, storeNames);
  return addBackupIntegrity({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    databaseVersion: database.version,
    stores: Object.fromEntries(Object.entries(records).map(([name, values]) => [name, serializeBackupValue(values)])),
  });
}

export async function getLocalDataSummary() {
  const database = await getDB();
  const storeNames = Array.from(database.objectStoreNames).sort();
  if (!storeNames.length) return { databaseVersion: database.version, stores: [], totalRecords: 0 };
  const transaction = database.transaction(storeNames, 'readonly');
  const requests = storeNames.map((name) => ({ name, request: transaction.objectStore(name).count() }));
  await transactionDone(transaction);
  const stores = requests.map(({ name, request }) => ({ name, count: request.result || 0 }));
  return { databaseVersion: database.version, stores, totalRecords: stores.reduce((sum, item) => sum + item.count, 0) };
}

function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const timestamp = String(backup.exportedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  link.download = `cutting-plan-backup-${timestamp}.json`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportFullBackup() {
  const backup = await createFullBackup();
  downloadBackup(backup);
  return backup;
}

export async function importFullBackup(file) {
  if (!file || typeof file.text !== 'function') throw new Error('Selecione um arquivo de backup .json válido.');
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('O arquivo não contém JSON válido.');
  }
  const normalized = normalizeBackupPayload(raw);
  if (normalized.format === BACKUP_FORMAT && normalized.version > BACKUP_VERSION) {
    throw new Error(`Este backup é da versão ${normalized.version}. Atualize o aplicativo antes de restaurá-lo.`);
  }
  await verifyBackupIntegrity(normalized);
  return normalized;
}

export async function restoreFullBackup(backup) {
  const normalized = normalizeBackupPayload(backup);
  if (normalized.format === BACKUP_FORMAT && normalized.version > BACKUP_VERSION) {
    throw new Error(`Este backup é da versão ${normalized.version}. Atualize o aplicativo antes de restaurá-lo.`);
  }
  await verifyBackupIntegrity(normalized);
  const database = await getDB();
  const storeNames = Array.from(database.objectStoreNames);
  const transaction = database.transaction(storeNames, 'readwrite');
  storeNames.forEach((name) => transaction.objectStore(name).clear());
  storeNames.forEach((name) => {
    const store = transaction.objectStore(name);
    (normalized.stores[name] || []).forEach((record) => store.put(record));
  });
  await transactionDone(transaction);
  return getBackupSummary(normalized);
}

export async function clearAllLocalData() {
  const database = await getDB();
  const storeNames = Array.from(database.objectStoreNames);
  const transaction = database.transaction(storeNames, 'readwrite');
  storeNames.forEach((name) => transaction.objectStore(name).clear());
  await transactionDone(transaction);
  return storeNames;
}
