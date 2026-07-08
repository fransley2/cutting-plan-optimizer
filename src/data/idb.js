// Helper generico de IndexedDB. Nenhuma logica de negocio aqui: so
// promisifica as transacoes para evitar duplicar boilerplate entre stores.

let dbPromise = null;

export function openDatabase(name, version, upgrade) {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade(event.target.result, event.oldVersion);
    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error(`Feche outras abas do app para atualizar o banco "${name}".`));
    };
    request.onerror = () => {
      dbPromise = null;
      reject(new Error(`Erro ao abrir o banco "${name}": ${request.error?.message || 'falha desconhecida'}.`));
    };
  });

  return dbPromise;
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
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

export function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export function idbClear(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
