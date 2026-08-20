import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLockExpired,
  SyncConflictError,
  SyncLockError,
  SyncManager,
} from '../src/core/syncManager.js';
import { getSharedSyncIndicator, protectUnsyncedBeforeUnload, shouldWarnBeforeUnload } from '../src/ui/sharedSyncControls.js';
import { getOrCreateSharedSyncSession } from '../src/data/sharedSyncSession.js';

class FakeAdapter {
  constructor(files = {}) {
    this.files = new Map(Object.entries(files));
    this.offline = false;
    this.watchers = new Map();
  }

  fail() {
    if (this.offline) throw new Error('network folder unavailable');
  }

  async readFile(path) { this.fail(); if (!this.files.has(path)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' }); return this.files.get(path); }
  async writeFile(path, content) { this.fail(); this.files.set(path, String(content)); }
  async exists(path) { this.fail(); return this.files.has(path); }
  async deleteFile(path) { this.fail(); this.files.delete(path); }
  watchChanges(path, callback, options = {}) { this.watchers.set(path, { callback, options }); return () => this.watchers.delete(path); }
  async emitWatch(path, change = {}) {
    this.watchers.get(path)?.callback(change);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function document(version, data, by = 'user-a', at = '2026-08-20T12:00:00.000Z') {
  return JSON.stringify({ version, lastModifiedAt: at, lastModifiedBy: by, data });
}

function fixture({ files = {}, now = Date.parse('2026-08-20T12:30:00.000Z') } = {}) {
  const adapter = new FakeAdapter(files);
  const records = new Map([['mtoItems', [{ id: 'local' }]]]);
  const metadata = new Map();
  const time = { value: now };
  const timers = [];
  const manager = new SyncManager({
    adapter,
    cache: {
      readStore: async (storeName) => structuredClone(records.get(storeName) || []),
      replaceStore: async (storeName, value) => { records.set(storeName, structuredClone(value)); },
    },
    storeDefinitions: [{ key: 'mto', storeName: 'mtoItems', fileName: 'mto.json' }],
    identityProvider: async () => ({ id: 'user-a', name: 'Ana' }),
    metadataStore: {
      load: async (key) => metadata.get(key) || null,
      save: async (key, value) => { metadata.set(key, structuredClone(value)); },
    },
    sessionId: 'session-a',
    clock: () => time.value,
    setIntervalFn: (callback, interval) => {
      const timer = { id: timers.length + 1, callback, interval, active: true };
      timers.push(timer);
      return timer.id;
    },
    clearIntervalFn: (id) => {
      const timer = timers.find((item) => item.id === id);
      if (timer) timer.active = false;
    },
  });
  return { adapter, records, metadata, manager, time, timers };
}

test('save detects a remote version conflict and never overwrites the newer file', async () => {
  const context = fixture({ files: { 'mto.json': document(1, [{ id: 'remote-v1' }]) } });
  await context.manager.loadStore('mto');
  context.records.set('mtoItems', [{ id: 'local-change' }]);
  await context.manager.markDirtyByStoreName('mtoItems');
  context.adapter.files.set('mto.json', document(2, [{ id: 'remote-v2' }], 'user-b', '2026-08-20T12:20:00.000Z'));

  await assert.rejects(context.manager.syncStore('mto'), SyncConflictError);
  assert.equal(JSON.parse(context.adapter.files.get('mto.json')).version, 2);
  assert.deepEqual(context.records.get('mtoItems'), [{ id: 'local-change' }]);
  assert.equal(context.manager.getState('mto').newerAvailable, true);
  assert.equal(context.manager.getState('mto').conflict.version, 2);
  assert.equal(getSharedSyncIndicator(context.manager.getStates(), true, 'session-a').kind, 'conflict');

  await context.manager.reloadStore('mto');
  assert.equal(context.manager.getState('mto').dirty, false);
  assert.equal(context.manager.getState('mto').newerAvailable, false);
  assert.equal(context.manager.getState('mto').conflict, null);
  assert.equal(getSharedSyncIndicator(context.manager.getStates(), true, 'session-a').kind, 'synced');
  assert.deepEqual(context.records.get('mtoItems'), [{ id: 'remote-v2' }]);
});

test('indicator distinguishes a remote update from a local-versus-remote conflict', async () => {
  const context = fixture({ files: { 'mto.json': document(1, [{ id: 'remote-v1' }]) } });
  await context.manager.loadStore('mto');
  context.adapter.files.set('mto.json', document(2, [{ id: 'remote-v2' }], 'user-b', '2026-08-20T12:20:00.000Z'));

  await context.manager.handleWatchedChange('mto', {});
  const update = getSharedSyncIndicator(context.manager.getStates(), true, 'session-a');
  assert.equal(update.kind, 'update');
  assert.equal(update.label, 'Atualizar');

  await context.manager.markDirtyByStoreName('mtoItems');
  const conflict = getSharedSyncIndicator(context.manager.getStates(), true, 'session-a');
  assert.equal(conflict.kind, 'conflict');
  assert.equal(conflict.label, 'Conflito');
  assert.match(conflict.detail, /MTO/);
});

test('beforeunload warning is required only while local changes are not confirmed remotely', async () => {
  const context = fixture({ files: { 'mto.json': document(1, [{ id: 'remote-v1' }]) } });
  await context.manager.loadStore('mto');
  assert.equal(shouldWarnBeforeUnload(context.manager.getStates()), false);

  await context.manager.markDirtyByStoreName('mtoItems');
  assert.equal(shouldWarnBeforeUnload(context.manager.getStates()), true);
  const event = { prevented: false, returnValue: null, preventDefault() { this.prevented = true; } };
  assert.equal(protectUnsyncedBeforeUnload(event, context.manager.getStates()), true);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, true);

  await context.manager.syncStore('mto');
  assert.equal(shouldWarnBeforeUnload(context.manager.getStates()), false);
});

test('invalid lock content is reported as an error without declaring the shared folder offline', async () => {
  const context = fixture({ files: { 'mto.lock': '{invalid-json' } });

  await assert.rejects(context.manager.acquireLock('mto'), /JSON malformado/);

  const state = context.manager.getState('mto');
  assert.equal(state.offline, false);
  assert.equal(state.error.code, 'INVALID_SYNC_FILE');
  const indicator = getSharedSyncIndicator([state], true, context.manager.sessionId);
  assert.equal(indicator.kind, 'error');
  assert.match(indicator.detail, /mto\.lock/i);
});

test('releaseLocks avoids network access for stores without a lock owned by this session', async () => {
  const context = fixture();
  context.adapter.offline = true;

  await context.manager.releaseLocks(['mto']);

  assert.equal(context.manager.getState('mto').offline, false);
});

test('expired locks are replaced while active locks remain protected', async () => {
  const now = Date.parse('2026-08-20T12:30:00.000Z');
  assert.equal(isLockExpired({ acquiredAt: '2026-08-20T12:14:59.000Z' }, now, 15 * 60_000), true);
  assert.equal(isLockExpired({ acquiredAt: '2026-08-20T12:20:00.000Z' }, now, 15 * 60_000), false);

  const stale = JSON.stringify({ userId: 'user-b', userName: 'Bruno', acquiredAt: '2026-08-20T12:00:00.000Z', sessionId: 'session-b' });
  const context = fixture({ files: { 'mto.lock': stale }, now });
  const lock = await context.manager.acquireLock('mto');
  assert.equal(lock.sessionId, 'session-a');
  assert.equal(lock.userName, 'Ana');
});

test('same user with a different session is marked as an owned lock without SyncLockError', async () => {
  const ownOtherSession = JSON.stringify({ userId: 'user-a', userName: 'Ana', acquiredAt: '2026-08-20T12:20:00.000Z', sessionId: 'session-b' });
  const context = fixture({ files: { 'mto.lock': ownOtherSession } });

  const lock = await context.manager.acquireLock('mto');

  assert.equal(lock.ownedByCurrentUser, true);
  assert.equal(context.manager.getState('mto').lock.ownedByCurrentUser, true);
  assert.equal(JSON.parse(context.adapter.files.get('mto.lock')).sessionId, 'session-b');
  const indicator = getSharedSyncIndicator(context.manager.getStates(), true, 'session-a', context.time.value, 15 * 60_000);
  assert.equal(indicator.kind, 'owned-lock');
  assert.match(indicator.detail, /há 10 min · expira em 5 min/);
});

test('takeOverLock replaces an owned lock with the current session', async () => {
  const ownOtherSession = JSON.stringify({ userId: 'user-a', userName: 'Ana', acquiredAt: '2026-08-20T12:20:00.000Z', sessionId: 'session-b' });
  const context = fixture({ files: { 'mto.lock': ownOtherSession } });
  await context.manager.acquireLock('mto');

  const lock = await context.manager.takeOverLock('mto');

  assert.equal(lock.sessionId, 'session-a');
  assert.equal(lock.ownedByCurrentUser, false);
  assert.equal(JSON.parse(context.adapter.files.get('mto.lock')).sessionId, 'session-a');
  assert.equal(context.manager.getState('mto').lock.sessionId, 'session-a');
});

test('lock watcher detects changes and expiration without acquireLock', async () => {
  const context = fixture({ files: { 'mto.json': document(1, [{ id: 'remote-v1' }]) } });
  await context.manager.loadStore('mto');
  await new Promise((resolve) => setImmediate(resolve));
  const watchedLock = context.adapter.watchers.get('mto.lock');
  assert.equal(watchedLock.options.intervalMs, 15_000);

  context.adapter.files.set('mto.lock', JSON.stringify({ userId: 'user-b', userName: 'Bruno', acquiredAt: '2026-08-20T12:20:00.000Z', sessionId: 'session-b' }));
  await context.adapter.emitWatch('mto.lock');
  assert.equal(context.manager.getState('mto').lock.userId, 'user-b');

  context.adapter.files.delete('mto.lock');
  await context.adapter.emitWatch('mto.lock');
  assert.equal(context.manager.getState('mto').lock, null);

  context.adapter.files.set('mto.lock', JSON.stringify({ userId: 'user-b', userName: 'Bruno', acquiredAt: '2026-08-20T12:00:00.000Z', sessionId: 'session-b' }));
  await context.adapter.emitWatch('mto.lock');
  assert.equal(context.manager.getState('mto').lock, null);

  context.adapter.files.set('mto.lock', JSON.stringify({ userId: 'user-b', userName: 'Bruno', acquiredAt: '2026-08-20T12:20:00.000Z', sessionId: 'session-b' }));
  await context.adapter.emitWatch('mto.lock');
  context.time.value = Date.parse('2026-08-20T12:36:00.000Z');
  context.timers.find((timer) => timer.interval === 30_000).callback();
  assert.equal(context.manager.getState('mto').lock, null);
});

test('different user remains blocked until the lock expires', async () => {
  const otherUser = JSON.stringify({ userId: 'user-b', userName: 'Bruno', acquiredAt: '2026-08-20T12:20:00.000Z', sessionId: 'session-b' });
  const context = fixture({ files: { 'mto.lock': otherUser } });

  await assert.rejects(context.manager.acquireLock('mto'), SyncLockError);
  assert.equal(context.manager.getState('mto').lock.ownedByCurrentUser, false);
  assert.equal(getSharedSyncIndicator(context.manager.getStates(), true, 'session-a').kind, 'locked');

  context.time.value = Date.parse('2026-08-20T12:36:00.000Z');
  const replacement = await context.manager.acquireLock('mto');
  assert.equal(replacement.sessionId, 'session-a');
  assert.equal(replacement.userId, 'user-a');
});

test('shared sync session persists device identity and keeps tab identity separate', () => {
  const createStorage = () => {
    const values = new Map();
    return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  };
  const localStorage = createStorage();
  const firstTabStorage = createStorage();
  const first = getOrCreateSharedSyncSession({ localStorage, sessionStorage: firstTabStorage });
  const reload = getOrCreateSharedSyncSession({ localStorage, sessionStorage: firstTabStorage });
  const otherTab = getOrCreateSharedSyncSession({ localStorage, sessionStorage: createStorage() });

  assert.deepEqual(reload, first);
  assert.equal(otherTab.deviceSessionId, first.deviceSessionId);
  assert.notEqual(otherTab.sessionId, first.sessionId);
});

test('offline failure preserves the IndexedDB working copy and pending changes sync after reconnect', async () => {
  const context = fixture({ files: { 'mto.json': document(1, [{ id: 'remote-v1' }]) } });
  await context.manager.loadStore('mto');
  context.records.set('mtoItems', [{ id: 'offline-change' }]);
  await context.manager.markDirtyByStoreName('mtoItems');
  context.adapter.offline = true;

  await assert.rejects(context.manager.loadStore('mto'), /unavailable/);
  assert.equal(context.manager.getState('mto').offline, true);
  assert.deepEqual(context.records.get('mtoItems'), [{ id: 'offline-change' }]);

  context.adapter.offline = false;
  const saved = await context.manager.syncStore('mto');
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.data, [{ id: 'offline-change' }]);
  assert.equal(context.manager.getState('mto').dirty, false);
  assert.equal(context.manager.getState('mto').offline, false);
});

test('successful write transitions pending through syncing to synced and clears persisted dirty state', async () => {
  const context = fixture({ files: { 'mto.json': document(1, [{ id: 'remote-v1' }]) } });
  await context.manager.loadStore('mto');
  context.records.set('mtoItems', [{ id: 'local-change' }]);
  await context.manager.markDirtyByStoreName('mtoItems');
  const transitions = [];
  const unsubscribe = context.manager.subscribe((state) => transitions.push({
    dirty: state.dirty,
    syncing: state.syncing,
    offline: state.offline,
  }));

  const saved = await context.manager.syncStore('mto');
  unsubscribe();

  const finalState = context.manager.getState('mto');
  assert.equal(saved.version, 2);
  assert.equal(transitions.some((state) => state.dirty && state.syncing), true);
  assert.equal(finalState.syncing, false);
  assert.equal(finalState.dirty, false);
  assert.equal(finalState.pendingChanges, 0);
  assert.equal(finalState.offline, false);
  assert.equal(context.metadata.get('mto').dirty, false);
  assert.equal(context.metadata.get('mto').pendingChanges, 0);
  assert.equal(getSharedSyncIndicator([finalState], true, context.manager.sessionId).kind, 'synced');
});
