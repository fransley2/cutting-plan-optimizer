import assert from 'node:assert/strict';

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function requestSuccess(result) {
  const request = { result, error: null };
  setTimeout(() => request.onsuccess?.({ target: request }), 0);
  return request;
}

function installIndexedDB() {
  const databases = new Map();

  globalThis.indexedDB = {
    open(name, version) {
      const request = { result: null, error: null };
      setTimeout(() => {
        let state = databases.get(name);
        const isUpgrade = !state || version > state.version;
        const oldVersion = state?.version || 0;
        if (!state) {
          state = { version, stores: new Map() };
          databases.set(name, state);
        }
        if (version > state.version) state.version = version;

        const db = {
          version: state.version,
          objectStoreNames: {
            contains: (storeName) => state.stores.has(storeName),
          },
          createObjectStore(storeName, options) {
            const storeState = { keyPath: options.keyPath, records: new Map(), indexes: new Set() };
            state.stores.set(storeName, storeState);
            return { createIndex: (indexName) => storeState.indexes.add(indexName) };
          },
          transaction(storeName) {
            const storeState = state.stores.get(storeName);
            const tx = {
              objectStore() {
                return {
                  getAll: () => requestSuccess([...storeState.records.values()].map(clone)),
                  get: (key) => requestSuccess(clone(storeState.records.get(key) || null)),
                  put(value) {
                    storeState.records.set(value[storeState.keyPath], clone(value));
                    setTimeout(() => tx.oncomplete?.(), 0);
                  },
                  delete(key) {
                    storeState.records.delete(key);
                    setTimeout(() => tx.oncomplete?.(), 0);
                  },
                  clear() {
                    storeState.records.clear();
                    setTimeout(() => tx.oncomplete?.(), 0);
                  },
                };
              },
            };
            return tx;
          },
          close() {},
        };

        request.result = db;
        if (isUpgrade) request.onupgradeneeded?.({ target: request, oldVersion });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

function fakeFile(name, bytes, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const buffer = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
  return {
    name,
    size: buffer.byteLength,
    type,
    arrayBuffer: async () => buffer.slice(0),
  };
}

installIndexedDB();

const {
  DOCUMENT_TEMPLATE_TYPES,
  saveDocumentTemplate,
  getDocumentTemplate,
  deleteDocumentTemplate,
  hasDocumentTemplate,
  listDocumentTemplates,
} = await import('../src/data/documentTemplates.js');

{
  assert.equal(await hasDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON), false);
  const saved = await saveDocumentTemplate(
    DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON,
    fakeFile('template.xlsx', [1, 2, 3, 4])
  );

  assert.equal(saved.id, 'material_coupon');
  assert.equal(saved.type, DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON);
  assert.equal(saved.fileName, 'template.xlsx');
  assert.equal(saved.size, 4);
  assert.ok(saved.arrayBuffer instanceof ArrayBuffer);

  const retrieved = await getDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON);
  assert.equal(retrieved.fileName, 'template.xlsx');
  assert.equal(retrieved.arrayBuffer.byteLength, 4);
  assert.equal(await hasDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON), true);

  const templates = await listDocumentTemplates();
  assert.equal(templates.length, 1);

  await deleteDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON);
  assert.equal(await hasDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON), false);
}

{
  await assert.rejects(
    () => saveDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON, fakeFile('template.xls', [1])),
    /Only \.xlsx templates are supported/
  );
}

{
  await assert.rejects(
    () => saveDocumentTemplate(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON, fakeFile('empty.xlsx', [])),
    /Template file is empty/
  );
}

console.log('materialCouponTemplate tests passed');
