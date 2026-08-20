// Helper generico de IndexedDB. Nenhuma logica de negocio aqui: so
// promisifica as transacoes para evitar duplicar boilerplate entre stores.

import { showToast } from '../ui/toast.js';

let dbPromise = null;
const changeListeners = new Set();

function notifyStoreChanges(storeNames) {
  const names = [...new Set((Array.isArray(storeNames) ? storeNames : [storeNames]).filter(Boolean))];
  changeListeners.forEach((listener) => {
    try { listener(names); } catch (error) { console.error('Falha em listener de alteracao do IndexedDB.', error); }
  });
}

export function subscribeToIdbChanges(listener) {
  if (typeof listener !== 'function') throw new TypeError('O listener de alteracoes do IndexedDB deve ser uma funcao.');
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function openDatabase(name, version, upgrade) {
  if (dbPromise) return dbPromise;

  const openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade(event.target.result, event.oldVersion, event.target.transaction);
    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => {
        // A schema change makes this connection stale; the next caller must open a new one.
        db.close();
        if (dbPromise === openPromise) dbPromise = null;
      };
      resolve(db);
    };
    request.onblocked = () => {
      // Keep this request cached and pending: it may still succeed after the older tab closes.
      showToast('Outra aba deste app está aberta com uma versão anterior. Feche as outras abas do app para continuar.', 'warning');
    };
    request.onerror = () => {
      if (dbPromise === openPromise) dbPromise = null;
      reject(new Error(`Erro ao abrir o banco "${name}": ${request.error?.message || 'falha desconhecida'}.`));
    };
  });

  dbPromise = openPromise;
  return openPromise;
}

export function idbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => {
      notifyStoreChanges(storeName);
      resolve(value);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => {
      notifyStoreChanges(storeName);
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function idbClear(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => {
      notifyStoreChanges(storeName);
      resolve(true);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

export function idbTransaction(db, storeNames, mode, operation) {
  const names = [...new Set((Array.isArray(storeNames) ? storeNames : [storeNames]).filter(Boolean))];
  if (!names.length) return Promise.reject(new Error('At least one IndexedDB store is required.'));
  return new Promise((resolve, reject) => {
    let result;
    let operationError = null;
    let transaction;
    try {
      transaction = db.transaction(names, mode);
      const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));
      Promise.resolve(operation(stores, transaction)).then((value) => {
        result = value;
      }).catch((error) => {
        operationError = error;
        try { transaction.abort(); } catch { /* transaction already finished */ }
      });
    } catch (error) {
      try { transaction?.abort(); } catch { /* transaction was not created or already finished */ }
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      if (operationError) {
        reject(operationError);
        return;
      }
      if (mode === 'readwrite') notifyStoreChanges(names);
      resolve(result);
    };
    transaction.onabort = () => reject(operationError || transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
}
