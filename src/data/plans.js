import { createEntityStore } from './entityStore.js';

const LEGACY_LOCALSTORAGE_KEY = 'cuttingPlans_v1';
const store = createEntityStore('plans');

let migrated = false;

async function ensureMigrated() {
  if (migrated) return;
  migrated = true;

  const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  if (!raw) return;

  try {
    const legacyPlans = JSON.parse(raw);
    await Promise.all(
      Object.entries(legacyPlans).map(([name, data]) => store.save(name, data))
    );
  } catch {
    // JSON corrompido: nada a migrar, segue sem quebrar o app.
  } finally {
    localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  }
}

export async function getAllPlans() {
  await ensureMigrated();
  return store.getAll();
}

export async function getPlan(name) {
  await ensureMigrated();
  return store.get(name);
}

export async function savePlan(name, data) {
  return store.save(name, data);
}

export async function deletePlan(name) {
  return store.remove(name);
}
