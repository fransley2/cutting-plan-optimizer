import { assertFileAdapter } from './fileAdapters/fileAdapter.js';

export const DEFAULT_LOCK_TIMEOUT_MS = 15 * 60_000;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 4 * 60_000;
export const DEFAULT_LOCK_WATCH_INTERVAL_MS = 15_000;
export const DEFAULT_LOCK_EXPIRY_CHECK_INTERVAL_MS = 30_000;

export class SyncConflictError extends Error {
  constructor(storeKey, remote) {
    super('O arquivo compartilhado mudou desde que esta sessao carregou os dados.');
    this.name = 'SyncConflictError';
    this.code = 'SYNC_CONFLICT';
    this.storeKey = storeKey;
    this.remote = remote;
  }
}

export class SyncLockError extends Error {
  constructor(storeKey, lock) {
    super(`${lock?.userName || 'Outro usuario'} esta editando estes dados.`);
    this.name = 'SyncLockError';
    this.code = 'SYNC_LOCKED';
    this.storeKey = storeKey;
    this.lock = lock;
  }
}

export class SyncOwnLockError extends Error {
  constructor(storeKey, lock) {
    super('Estes dados estão sendo editados por você em outra aba ou dispositivo.');
    this.name = 'SyncOwnLockError';
    this.code = 'SYNC_OWN_LOCK';
    this.storeKey = storeKey;
    this.lock = lock;
  }
}

export class InvalidSyncFileError extends Error {
  constructor(fileName, message) {
    super(`Arquivo compartilhado "${fileName}" invalido: ${message}`);
    this.name = 'InvalidSyncFileError';
    this.code = 'INVALID_SYNC_FILE';
  }
}

function isoNow(clock) {
  return new Date(clock()).toISOString();
}

function parseJson(content, fileName) {
  try {
    return JSON.parse(content);
  } catch {
    throw new InvalidSyncFileError(fileName, 'JSON malformado.');
  }
}

export function validateSyncDocument(raw, fileName = 'dados.json') {
  if (!raw || typeof raw !== 'object') throw new InvalidSyncFileError(fileName, 'conteudo ausente.');
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new InvalidSyncFileError(fileName, 'version deve ser um inteiro positivo.');
  if (!Array.isArray(raw.data)) throw new InvalidSyncFileError(fileName, 'data deve ser uma lista de registros.');
  if (!raw.lastModifiedAt || Number.isNaN(new Date(raw.lastModifiedAt).getTime())) throw new InvalidSyncFileError(fileName, 'lastModifiedAt deve ser uma data ISO valida.');
  if (typeof raw.lastModifiedBy !== 'string') throw new InvalidSyncFileError(fileName, 'lastModifiedBy deve ser texto.');
  return raw;
}

export function isLockExpired(lock, now = Date.now(), timeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {
  const heartbeat = new Date(lock?.acquiredAt || '').getTime();
  return !Number.isFinite(heartbeat) || now - heartbeat >= timeoutMs;
}

function lockFileName(fileName) {
  return fileName.replace(/\.json$/i, '') + '.lock';
}

function annotateLock(lock, identity, sessionId) {
  return {
    ...lock,
    ownedByCurrentUser: Boolean(identity?.id && String(lock?.userId || '') === identity.id && lock?.sessionId !== sessionId),
  };
}

function isOfflineFailure(error) {
  return ![
    'INVALID_SYNC_FILE',
    'IDENTITY_REQUIRED',
    'INVALID_PATH',
    'WATCH_NOT_SUPPORTED',
  ].includes(error?.code);
}

function initialState(definition) {
  return {
    key: definition.key,
    storeName: definition.storeName,
    fileName: definition.fileName,
    loadedVersion: 0,
    lastModifiedAt: '',
    lastModifiedBy: '',
    lastSyncedAt: '',
    dirty: false,
    pendingChanges: 0,
    syncing: false,
    offline: false,
    newerAvailable: false,
    conflict: null,
    error: null,
    lock: null,
  };
}

export class SyncManager {
  constructor({
    adapter,
    cache,
    storeDefinitions,
    identityProvider,
    metadataStore = null,
    sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    deviceSessionId = sessionId,
    clock = Date.now,
    lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    lockWatchIntervalMs = DEFAULT_LOCK_WATCH_INTERVAL_MS,
    lockExpiryCheckIntervalMs = DEFAULT_LOCK_EXPIRY_CHECK_INTERVAL_MS,
    setIntervalFn = globalThis.setInterval?.bind(globalThis),
    clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  }) {
    this.adapter = assertFileAdapter(adapter);
    this.cache = cache;
    this.identityProvider = identityProvider;
    this.metadataStore = metadataStore;
    this.sessionId = sessionId;
    this.deviceSessionId = deviceSessionId;
    this.clock = clock;
    this.lockTimeoutMs = lockTimeoutMs;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.lockWatchIntervalMs = lockWatchIntervalMs;
    this.lockExpiryCheckIntervalMs = lockExpiryCheckIntervalMs;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.definitions = new Map(storeDefinitions.map((definition) => [definition.key, { ...definition }]));
    this.keysByStoreName = new Map(storeDefinitions.map((definition) => [definition.storeName, definition.key]));
    this.states = new Map(storeDefinitions.map((definition) => [definition.key, initialState(definition)]));
    this.listeners = new Set();
    this.watchers = new Map();
    this.heartbeats = new Map();
    this.lockExpiryTimer = null;
    this.metadataLoaded = new Set();
  }

  definition(key) {
    const definition = this.definitions.get(key);
    if (!definition) throw new Error(`Store de sincronizacao desconhecida: "${key}".`);
    return definition;
  }

  getState(key) {
    return { ...this.states.get(key) };
  }

  getStates(keys = [...this.definitions.keys()]) {
    return keys.filter((key) => this.states.has(key)).map((key) => this.getState(key));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(key) {
    const snapshot = this.getState(key);
    this.listeners.forEach((listener) => listener(snapshot, this.getStates()));
  }

  updateState(key, patch) {
    Object.assign(this.states.get(key), patch);
    this.emit(key);
  }

  async hydrateMetadata(key) {
    if (this.metadataLoaded.has(key)) return;
    const saved = await this.metadataStore?.load?.(key);
    if (saved) {
      this.updateState(key, {
        loadedVersion: Number(saved.loadedVersion || 0),
        lastModifiedAt: String(saved.lastModifiedAt || ''),
        lastModifiedBy: String(saved.lastModifiedBy || ''),
        lastSyncedAt: String(saved.lastSyncedAt || ''),
        dirty: saved.dirty === true,
        pendingChanges: Math.max(0, Number(saved.pendingChanges || (saved.dirty ? 1 : 0))),
      });
    }
    this.metadataLoaded.add(key);
  }

  async persistMetadata(key) {
    const state = this.states.get(key);
    await this.metadataStore?.save?.(key, {
      loadedVersion: state.loadedVersion,
      lastModifiedAt: state.lastModifiedAt,
      lastModifiedBy: state.lastModifiedBy,
      lastSyncedAt: state.lastSyncedAt,
      dirty: state.dirty,
      pendingChanges: state.pendingChanges,
    });
  }

  async readRemote(key) {
    const { fileName } = this.definition(key);
    if (!await this.adapter.exists(fileName)) return null;
    return validateSyncDocument(parseJson(await this.adapter.readFile(fileName), fileName), fileName);
  }

  async createRemoteFromLocal(key) {
    const definition = this.definition(key);
    const identity = await this.requireIdentity();
    const document = {
      version: 1,
      lastModifiedAt: isoNow(this.clock),
      lastModifiedBy: identity.id,
      lastModifiedSessionId: this.sessionId,
      data: await this.cache.readStore(definition.storeName),
    };
    await this.adapter.writeFile(definition.fileName, JSON.stringify(document, null, 2));
    return document;
  }

  async loadStore(key, { discardLocalChanges = false } = {}) {
    await this.hydrateMetadata(key);
    const definition = this.definition(key);
    this.updateState(key, { syncing: true, error: null });
    try {
      let remote = await this.readRemote(key);
      if (!remote) remote = await this.createRemoteFromLocal(key);
      const state = this.states.get(key);
      if (state.dirty && !discardLocalChanges) {
        const hasConflict = state.loadedVersion > 0 && remote.version !== state.loadedVersion;
        this.updateState(key, {
          offline: false,
          syncing: false,
          newerAvailable: hasConflict,
          conflict: hasConflict ? remote : null,
          error: null,
        });
        this.startWatching(key);
        return { key, preservedLocalChanges: true, remote };
      }
      await this.cache.replaceStore(definition.storeName, remote.data);
      const syncedAt = isoNow(this.clock);
      this.updateState(key, {
        loadedVersion: remote.version,
        lastModifiedAt: remote.lastModifiedAt,
        lastModifiedBy: remote.lastModifiedBy,
        lastSyncedAt: syncedAt,
        dirty: false,
        pendingChanges: 0,
        syncing: false,
        offline: false,
        newerAvailable: false,
        conflict: null,
        error: null,
      });
      await this.persistMetadata(key);
      this.startWatching(key);
      return { key, preservedLocalChanges: false, remote };
    } catch (error) {
      this.recordFailure(key, error);
      throw error;
    }
  }

  async loadStores(keys = [...this.definitions.keys()], options) {
    const results = [];
    for (const key of keys) {
      try {
        results.push(await this.loadStore(key, options));
      } catch (error) {
        results.push({ key, error });
      }
    }
    return results;
  }

  async reloadStore(key) {
    return this.loadStore(key, { discardLocalChanges: true });
  }

  async markDirtyByStoreName(storeName) {
    const key = this.keysByStoreName.get(storeName);
    if (!key) return false;
    await this.hydrateMetadata(key);
    const state = this.states.get(key);
    this.updateState(key, {
      dirty: true,
      pendingChanges: Math.max(1, state.pendingChanges + 1),
    });
    await this.persistMetadata(key);
    return true;
  }

  async requireIdentity() {
    const identity = await this.identityProvider?.();
    if (!identity?.id) {
      const error = new Error('Selecione um usuario antes de sincronizar.');
      error.code = 'IDENTITY_REQUIRED';
      throw error;
    }
    return { id: String(identity.id), name: String(identity.name || identity.id) };
  }

  async acquireLock(key) {
    const definition = this.definition(key);
    const identity = await this.requireIdentity();
    const fileName = lockFileName(definition.fileName);
    try {
      if (await this.adapter.exists(fileName)) {
        const raw = parseJson(await this.adapter.readFile(fileName), fileName);
        const current = annotateLock(raw, identity, this.sessionId);
        if (current.sessionId !== this.sessionId && !isLockExpired(current, this.clock(), this.lockTimeoutMs)) {
          this.updateState(key, { lock: current, offline: false, error: null });
          if (current.ownedByCurrentUser) return current;
          throw new SyncLockError(key, current);
        }
        if (current.sessionId !== this.sessionId) await this.adapter.deleteFile(fileName);
      }
      return this.writeCurrentLock(key, identity);
    } catch (error) {
      if (!(error instanceof SyncLockError) && !(error instanceof SyncOwnLockError)) this.recordFailure(key, error);
      throw error;
    }
  }

  async writeCurrentLock(key, identity) {
    const fileName = lockFileName(this.definition(key).fileName);
    const lock = { userId: identity.id, userName: identity.name, acquiredAt: isoNow(this.clock), sessionId: this.sessionId };
    await this.adapter.writeFile(fileName, JSON.stringify(lock, null, 2));
    const raw = parseJson(await this.adapter.readFile(fileName), fileName);
    const confirmed = annotateLock(raw, identity, this.sessionId);
    if (confirmed.sessionId !== this.sessionId) {
      this.updateState(key, { lock: confirmed, offline: false, error: null });
      if (confirmed.ownedByCurrentUser) throw new SyncOwnLockError(key, confirmed);
      throw new SyncLockError(key, confirmed);
    }
    this.updateState(key, { lock: confirmed, offline: false, error: null });
    this.startHeartbeat(key);
    return confirmed;
  }

  async takeOverLock(key) {
    const identity = await this.requireIdentity();
    const state = this.states.get(key);
    if (!state?.lock?.ownedByCurrentUser) throw new Error('Este lock não pertence ao usuário atual em outro contexto.');
    const fileName = lockFileName(this.definition(key).fileName);
    try {
      if (await this.adapter.exists(fileName)) {
        const current = parseJson(await this.adapter.readFile(fileName), fileName);
        if (String(current.userId || '') !== identity.id) {
          const annotated = annotateLock(current, identity, this.sessionId);
          this.updateState(key, { lock: annotated, offline: false, error: null });
          throw new SyncLockError(key, annotated);
        }
      }
      return await this.writeCurrentLock(key, identity);
    } catch (error) {
      if (!(error instanceof SyncLockError) && !(error instanceof SyncOwnLockError)) this.recordFailure(key, error);
      throw error;
    }
  }

  startHeartbeat(key) {
    this.stopHeartbeat(key);
    if (typeof this.setIntervalFn !== 'function') return;
    const timer = this.setIntervalFn(() => void this.heartbeat(key), this.heartbeatIntervalMs);
    this.heartbeats.set(key, timer);
  }

  stopHeartbeat(key) {
    const timer = this.heartbeats.get(key);
    if (timer !== undefined) this.clearIntervalFn?.(timer);
    this.heartbeats.delete(key);
  }

  async heartbeat(key) {
    const state = this.states.get(key);
    if (state?.lock?.sessionId !== this.sessionId) return false;
    const identity = await this.requireIdentity();
    const lock = { userId: identity.id, userName: identity.name, acquiredAt: isoNow(this.clock), sessionId: this.sessionId };
    try {
      await this.adapter.writeFile(lockFileName(this.definition(key).fileName), JSON.stringify(lock, null, 2));
      this.updateState(key, { lock, offline: false, error: null });
      return true;
    } catch (error) {
      this.recordFailure(key, error);
      return false;
    }
  }

  async releaseLock(key, { force = false } = {}) {
    const fileName = lockFileName(this.definition(key).fileName);
    this.stopHeartbeat(key);
    try {
      if (!await this.adapter.exists(fileName)) {
        this.updateState(key, { lock: null });
        return true;
      }
      const lock = parseJson(await this.adapter.readFile(fileName), fileName);
      if (!force && lock.sessionId !== this.sessionId) return false;
      await this.adapter.deleteFile(fileName);
      this.updateState(key, { lock: null, offline: false, error: null });
      return true;
    } catch (error) {
      this.recordFailure(key, error);
      throw error;
    }
  }

  async syncStore(key, { releaseLockAfterSave = true } = {}) {
    await this.hydrateMetadata(key);
    const definition = this.definition(key);
    const identity = await this.requireIdentity();
    this.updateState(key, { syncing: true, error: null });
    try {
      const state = this.states.get(key);
      if (state.lock?.sessionId !== this.sessionId) {
        const lock = await this.acquireLock(key);
        if (lock?.ownedByCurrentUser) throw new SyncOwnLockError(key, lock);
      }
      const remote = await this.readRemote(key);
      const remoteVersion = remote?.version || 0;
      if (remoteVersion !== state.loadedVersion) {
        this.updateState(key, {
          newerAvailable: true,
          conflict: remote,
          offline: false,
          error: null,
        });
        await this.releaseLock(key);
        throw new SyncConflictError(key, remote);
      }
      const document = {
        version: remoteVersion + 1,
        lastModifiedAt: isoNow(this.clock),
        lastModifiedBy: identity.id,
        lastModifiedSessionId: this.sessionId,
        data: await this.cache.readStore(definition.storeName),
      };
      await this.adapter.writeFile(definition.fileName, JSON.stringify(document, null, 2));
      this.updateState(key, {
        loadedVersion: document.version,
        lastModifiedAt: document.lastModifiedAt,
        lastModifiedBy: document.lastModifiedBy,
        lastSyncedAt: document.lastModifiedAt,
        dirty: false,
        pendingChanges: 0,
        syncing: false,
        offline: false,
        newerAvailable: false,
        conflict: null,
        error: null,
      });
      await this.persistMetadata(key);
      if (releaseLockAfterSave) await this.releaseLock(key);
      return document;
    } catch (error) {
      if (error instanceof SyncConflictError || error instanceof SyncLockError || error instanceof SyncOwnLockError) {
        this.updateState(key, { syncing: false });
      } else {
        this.recordFailure(key, error);
      }
      throw error;
    }
  }

  async syncStores(keys = [...this.definitions.keys()], options) {
    const results = [];
    for (const key of keys) {
      try {
        results.push({ key, document: await this.syncStore(key, options) });
      } catch (error) {
        results.push({ key, error });
        if (error instanceof SyncConflictError || error instanceof SyncLockError || error instanceof SyncOwnLockError) break;
      }
    }
    return results;
  }

  startWatching(key) {
    if (this.watchers.has(key)) return;
    const { fileName } = this.definition(key);
    const dataUnsubscribe = this.adapter.watchChanges(fileName, (change) => void this.handleWatchedChange(key, change));
    const lockUnsubscribe = this.adapter.watchChanges(
      lockFileName(fileName),
      (change) => void this.handleWatchedLockChange(key, change),
      { intervalMs: this.lockWatchIntervalMs },
    );
    this.watchers.set(key, [dataUnsubscribe, lockUnsubscribe]);
    this.startLockExpiryChecks();
    void this.refreshLockState(key);
  }

  async refreshLockState(key) {
    const fileName = lockFileName(this.definition(key).fileName);
    try {
      if (!await this.adapter.exists(fileName)) {
        this.stopHeartbeat(key);
        this.updateState(key, { lock: null, offline: false, error: null });
        return null;
      }
      const raw = parseJson(await this.adapter.readFile(fileName), fileName);
      if (isLockExpired(raw, this.clock(), this.lockTimeoutMs)) {
        this.stopHeartbeat(key);
        this.updateState(key, { lock: null, offline: false, error: null });
        return null;
      }
      const identity = await this.requireIdentity();
      const lock = annotateLock(raw, identity, this.sessionId);
      if (lock.sessionId === this.sessionId) this.startHeartbeat(key);
      else this.stopHeartbeat(key);
      this.updateState(key, { lock, offline: false, error: null });
      return lock;
    } catch (error) {
      this.recordFailure(key, error);
      return null;
    }
  }

  async handleWatchedLockChange(key, change) {
    if (change?.error) {
      this.recordFailure(key, change.error);
      return;
    }
    await this.refreshLockState(key);
  }

  startLockExpiryChecks() {
    if (this.lockExpiryTimer !== null || typeof this.setIntervalFn !== 'function') return;
    this.lockExpiryTimer = this.setIntervalFn(() => this.checkKnownLockExpirations(), this.lockExpiryCheckIntervalMs);
  }

  checkKnownLockExpirations() {
    this.states.forEach((state, key) => {
      if (!state.lock || !isLockExpired(state.lock, this.clock(), this.lockTimeoutMs)) return;
      this.stopHeartbeat(key);
      this.updateState(key, { lock: null });
    });
  }

  async handleWatchedChange(key, change) {
    if (change?.error) {
      this.recordFailure(key, change.error);
      return;
    }
    try {
      const remote = await this.readRemote(key);
      const state = this.states.get(key);
      if (!remote || (remote.version === state.loadedVersion && remote.lastModifiedAt === state.lastModifiedAt)) return;
      if (remote.lastModifiedSessionId === this.sessionId) return;
      this.updateState(key, { newerAvailable: true, conflict: remote, offline: false, error: null });
    } catch (error) {
      this.recordFailure(key, error);
    }
  }

  recordFailure(key, error) {
    this.updateState(key, { syncing: false, offline: isOfflineFailure(error), error });
  }

  setOffline(key, error) {
    this.updateState(key, { syncing: false, offline: true, error });
  }

  async releaseLocks(keys = [...this.definitions.keys()]) {
    const ownedKeys = keys.filter((key) => this.states.get(key)?.lock?.sessionId === this.sessionId);
    await Promise.all(ownedKeys.map(async (key) => {
      try { await this.releaseLock(key); } catch { /* status already records the error */ }
    }));
  }

  async resetRemoteContext({ preserveDirty = true } = {}) {
    for (const key of this.definitions.keys()) {
      await this.hydrateMetadata(key);
      const dirty = preserveDirty && this.states.get(key).dirty;
      const pendingChanges = dirty ? Math.max(1, this.states.get(key).pendingChanges) : 0;
      this.updateState(key, {
        loadedVersion: 0,
        lastModifiedAt: '',
        lastModifiedBy: '',
        lastSyncedAt: '',
        dirty,
        pendingChanges,
        syncing: false,
        offline: false,
        newerAvailable: false,
        conflict: null,
        error: null,
        lock: null,
      });
      await this.persistMetadata(key);
    }
  }

  dispose() {
    this.watchers.forEach((unsubscribes) => unsubscribes.forEach((unsubscribe) => unsubscribe()));
    this.watchers.clear();
    this.heartbeats.forEach((timer) => this.clearIntervalFn?.(timer));
    this.heartbeats.clear();
    if (this.lockExpiryTimer !== null) this.clearIntervalFn?.(this.lockExpiryTimer);
    this.lockExpiryTimer = null;
    this.listeners.clear();
  }
}
