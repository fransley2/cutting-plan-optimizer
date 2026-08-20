const DEVICE_SESSION_KEY = 'sharedSyncDeviceSessionId';
const TAB_SESSION_KEY = 'sharedSyncTabSessionId';

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function storedId(storage, key) {
  try {
    const current = storage?.getItem?.(key);
    if (current) return current;
    const created = createId();
    storage?.setItem?.(key, created);
    return created;
  } catch {
    return createId();
  }
}

export function getOrCreateSharedSyncSession({
  localStorage = globalThis.localStorage,
  sessionStorage = globalThis.sessionStorage,
} = {}) {
  return {
    deviceSessionId: storedId(localStorage, DEVICE_SESSION_KEY),
    sessionId: storedId(sessionStorage, TAB_SESSION_KEY),
  };
}
