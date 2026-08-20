import { getDB } from './database.js';
import { idbGetAll } from './idb.js';

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('A atualizacao do cache local foi cancelada.'));
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao atualizar o cache local.'));
  });
}

export function createSharedSyncCache() {
  return {
    async readStore(storeName) {
      const db = await getDB();
      return idbGetAll(db, storeName);
    },
    async replaceStore(storeName, records) {
      if (!Array.isArray(records)) throw new TypeError(`Dados invalidos para a store "${storeName}".`);
      const db = await getDB();
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      records.forEach((record) => store.put(record));
      await transactionDone(transaction);
      return records.length;
    },
  };
}
