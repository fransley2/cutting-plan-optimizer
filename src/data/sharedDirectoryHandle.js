import { getDB } from './database.js';
import { idbDelete, idbGet, idbPut } from './idb.js';

const STORE_NAME = 'settings';
const HANDLE_ID = 'sharedDirectoryHandle';

export function createSharedDirectoryHandleStore() {
  return {
    async load() {
      const db = await getDB();
      return (await idbGet(db, STORE_NAME, HANDLE_ID))?.handle || null;
    },
    async save(handle) {
      const db = await getDB();
      await idbPut(db, STORE_NAME, { id: HANDLE_ID, handle, updatedAt: new Date().toISOString() });
      return handle;
    },
    async clear() {
      const db = await getDB();
      return idbDelete(db, STORE_NAME, HANDLE_ID);
    },
  };
}
