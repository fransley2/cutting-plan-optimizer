import { createEntityStore } from './entityStore.js';
import { getDB } from './database.js';
import { idbTransaction } from './idb.js';

const LEGACY_LOCALSTORAGE_KEY = 'cuttingPlans_v1';
const STORE_NAME = 'plans';
const store = createEntityStore('plans');

let migrationPromise = null;

function parseLegacyPlans(raw) {
  const legacyPlans = JSON.parse(raw);
  if (!legacyPlans || typeof legacyPlans !== 'object' || Array.isArray(legacyPlans)) {
    throw new TypeError('Legacy Plans data must be an object keyed by plan name.');
  }

  const migratedAt = new Date().toISOString();
  return Object.entries(legacyPlans).map(([name, data]) => {
    if (!name) throw new TypeError('Legacy Plans data contains an empty plan name.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError(`Legacy Plan "${name}" must contain an object value.`);
    }
    return {
      ...data,
      // The localStorage object key is the stable IndexedDB key. put() makes
      // retries safe even when an older app version left partial records.
      name,
      savedAt: data.savedAt || migratedAt,
    };
  });
}

async function migrateLegacyPlans() {
  const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  if (!raw) return;

  const records = parseLegacyPlans(raw);
  const db = await getDB();
  await idbTransaction(db, STORE_NAME, 'readwrite', (stores) => {
    records.forEach((record) => stores[STORE_NAME].put(record));
    return records.length;
  });

  // Remove the only legacy copy strictly after IndexedDB confirms commit.
  // If parsing or any put fails, the source remains available for the next load.
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
}

async function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyPlans().catch((error) => {
      migrationPromise = null;
      console.error('[plans migration] Failed; legacy localStorage data was preserved for automatic retry.', error);
      throw error;
    });
  }
  return migrationPromise;
}

export async function getAllPlans() {
  await ensureMigrated();
  return store.getAll();
}

export async function savePlan(name, data) {
  return store.save(name, data);
}
