import assert from 'node:assert/strict';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function installEnvironment() {
  const databases = new Map();
  const localValues = new Map();
  let failPlanPutNumber = 0;
  let planPutCount = 0;
  let migrationWriteTransactions = 0;

  globalThis.localStorage = {
    getItem: (key) => localValues.has(key) ? localValues.get(key) : null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key),
  };

  globalThis.indexedDB = {
    open(name, version) {
      const request = { result: null, error: null };
      setTimeout(() => {
        let state = databases.get(name);
        const oldVersion = state?.version || 0;
        if (!state) {
          state = { version, stores: new Map() };
          databases.set(name, state);
        }
        state.version = Math.max(state.version, version);

        const db = {
          version: state.version,
          objectStoreNames: { contains: (storeName) => state.stores.has(storeName) },
          createObjectStore(storeName, options) {
            const storeState = { keyPath: options.keyPath, records: new Map(), indexes: new Set() };
            state.stores.set(storeName, storeState);
            return {
              indexNames: { contains: (indexName) => storeState.indexes.has(indexName) },
              createIndex: (indexName) => storeState.indexes.add(indexName),
            };
          },
          deleteObjectStore: (storeName) => state.stores.delete(storeName),
          transaction(storeNames, mode) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            if (mode === 'readwrite' && names.includes('plans')) migrationWriteTransactions += 1;
            const snapshots = new Map(names.map((storeName) => [storeName, new Map(state.stores.get(storeName).records)]));
            let pending = 0;
            let completionQueued = false;
            let aborted = false;
            const tx = {
              error: null,
              objectStore(storeName) {
                const storeState = state.stores.get(storeName);
                const run = (operation) => {
                  const idbRequest = { result: undefined, error: null };
                  pending += 1;
                  setTimeout(() => {
                    if (aborted) return;
                    try {
                      idbRequest.result = operation();
                      idbRequest.onsuccess?.({ target: idbRequest });
                    } catch (error) {
                      idbRequest.error = error;
                      tx.error = error;
                      idbRequest.onerror?.({ target: idbRequest });
                      tx.abort();
                    } finally {
                      pending -= 1;
                      queueCompletion();
                    }
                  }, 0);
                  return idbRequest;
                };
                return {
                  getAll: () => run(() => [...storeState.records.values()].map(clone)),
                  get: (key) => run(() => clone(storeState.records.get(key) || null)),
                  put: (value) => run(() => {
                    if (storeName === 'plans') {
                      planPutCount += 1;
                      if (planPutCount === failPlanPutNumber) {
                        throw new DOMException('Synthetic Plans write failure', 'QuotaExceededError');
                      }
                    }
                    storeState.records.set(value[storeState.keyPath], clone(value));
                    return value[storeState.keyPath];
                  }),
                  delete: (key) => run(() => storeState.records.delete(key)),
                };
              },
              abort() {
                if (aborted) return;
                aborted = true;
                snapshots.forEach((records, storeName) => {
                  state.stores.get(storeName).records = new Map(records);
                });
                setTimeout(() => tx.onabort?.({ target: tx }), 0);
              },
            };
            function queueCompletion() {
              if (aborted || pending || completionQueued) return;
              completionQueued = true;
              setTimeout(() => {
                completionQueued = false;
                if (!aborted && pending === 0) tx.oncomplete?.({ target: tx });
              }, 0);
            }
            setTimeout(queueCompletion, 0);
            return tx;
          },
          close() {},
        };

        request.result = db;
        if (version > oldVersion) request.onupgradeneeded?.({ target: request, oldVersion });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };

  return {
    failOnPlanPut(number) {
      planPutCount = 0;
      failPlanPutNumber = number;
    },
    allowWrites() {
      planPutCount = 0;
      failPlanPutNumber = 0;
    },
    migrationWriteTransactions: () => migrationWriteTransactions,
    planRecords() {
      const state = databases.get('NestingAppDB');
      return [...(state?.stores.get('plans')?.records.values() || [])].map(clone);
    },
  };
}

const controls = installEnvironment();
const legacyPlans = {
  'Plan A': { projectName: 'Project 1', savedAt: '2026-01-01T00:00:00.000Z', stock: [{ length: 6000 }] },
  'Plan B': { projectName: 'Project 1', parts: [{ length: 1200 }] },
};
localStorage.setItem('cuttingPlans_v1', JSON.stringify(legacyPlans));

const migrationErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => migrationErrors.push(args);

const { getAllPlans } = await import('../src/data/plans.js');

controls.failOnPlanPut(2);
await assert.rejects(getAllPlans(), /Synthetic Plans write failure/);
assert.equal(localStorage.getItem('cuttingPlans_v1'), JSON.stringify(legacyPlans));
assert.equal(controls.planRecords().length, 0);
assert.match(String(migrationErrors[0]?.[0]), /\[plans migration\].*preserved.*retry/i);

controls.allowWrites();
const transactionCountBeforeRetry = controls.migrationWriteTransactions();
const [firstRetry, concurrentRetry] = await Promise.all([getAllPlans(), getAllPlans()]);
assert.equal(controls.migrationWriteTransactions() - transactionCountBeforeRetry, 1);
assert.deepEqual(firstRetry.map((plan) => plan.name).sort(), ['Plan A', 'Plan B']);
assert.deepEqual(concurrentRetry.map((plan) => plan.name).sort(), ['Plan A', 'Plan B']);
assert.equal(localStorage.getItem('cuttingPlans_v1'), null);

const afterSuccess = await getAllPlans();
assert.equal(afterSuccess.length, 2);
assert.equal(afterSuccess.find((plan) => plan.name === 'Plan A').savedAt, '2026-01-01T00:00:00.000Z');

console.error = originalConsoleError;
console.log('plans migration tests passed');
