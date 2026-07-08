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
        if (isUpgrade) request.onupgradeneeded?.({ target: request, oldVersion: 0 });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

installIndexedDB();

const {
  AUDIT_EVENT_TYPES,
  createAuditEvent,
  getAllAuditEvents,
  getAuditEvents,
  getAuditEventsForEntity,
  clearAuditEvents,
} = await import('../src/data/auditLog.js');

await clearAuditEvents();

const input = {
  eventType: AUDIT_EVENT_TYPES.IMPORT_INVENTORY,
  entityType: 'inventory',
  entityId: 'TRACE-1',
  projectId: 'PROJECT-1',
  timestamp: '2026-01-02T10:00:00.000Z',
  userName: 'Operator',
  metadata: { source: 'test' },
};
const before = JSON.stringify(input);
const created = await createAuditEvent(input);

assert.equal(created.eventType, AUDIT_EVENT_TYPES.IMPORT_INVENTORY);
assert.equal(created.projectId, 'PROJECT-1');
assert.equal(JSON.stringify(input), before);

await createAuditEvent({
  eventType: AUDIT_EVENT_TYPES.MATCH_MTO,
  entityType: 'mto',
  entityId: 'MTO-1',
  projectId: 'PROJECT-2',
  timestamp: '2026-01-03T10:00:00.000Z',
});

const allEvents = await getAllAuditEvents();
assert.equal(allEvents.length, 2);
assert.equal(allEvents[0].projectId, 'PROJECT-2');

const projectEvents = await getAuditEvents({ projectId: 'PROJECT-1' });
assert.equal(projectEvents.length, 1);
assert.equal(projectEvents[0].entityId, 'TRACE-1');

const entityEvents = await getAuditEventsForEntity('inventory', 'TRACE-1');
assert.equal(entityEvents.length, 1);
assert.equal(entityEvents[0].projectId, 'PROJECT-1');

const typeEvents = await getAuditEvents({ eventType: AUDIT_EVENT_TYPES.MATCH_MTO });
assert.equal(typeEvents.length, 1);
assert.equal(typeEvents[0].entityType, 'mto');

const invalidDateEvents = await getAuditEvents({ from: 'not-a-date', to: 'also-invalid' });
assert.equal(invalidDateEvents.length, 2);

await clearAuditEvents();
assert.equal((await getAllAuditEvents()).length, 0);

console.log('auditLog tests passed');
