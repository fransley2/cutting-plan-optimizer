import { getDB } from './database.js';
import { idbDelete, idbGet, idbPut } from './idb.js';

const STORE_NAME = 'settings';
const PREFIX = 'sharedSyncState:';

export function createSharedSyncMetadataStore() {
  return {
    async load(key) {
      const db = await getDB();
      return idbGet(db, STORE_NAME, `${PREFIX}${key}`);
    },
    async save(key, value) {
      const db = await getDB();
      const record = { id: `${PREFIX}${key}`, ...value };
      await idbPut(db, STORE_NAME, record);
      return record;
    },
    async clear(key) {
      const db = await getDB();
      return idbDelete(db, STORE_NAME, `${PREFIX}${key}`);
    },
  };
}
