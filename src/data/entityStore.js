import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';

export function createEntityStore(storeName) {
  return {
    async getAll() {
      const db = await getDB();
      return idbGetAll(db, storeName);
    },
    async get(name) {
      const db = await getDB();
      return idbGet(db, storeName, name);
    },
    async save(name, data) {
      const db = await getDB();
      return idbPut(db, storeName, { name, ...data, savedAt: new Date().toISOString() });
    },
    async remove(name) {
      const db = await getDB();
      return idbDelete(db, storeName, name);
    },
  };
}
