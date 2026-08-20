import { getUser } from './users.js';

export const ACTIVE_USER_SESSION_KEY = 'activeUserId';

function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

export function getActiveUserId() {
  return sessionStore()?.getItem(ACTIVE_USER_SESSION_KEY) || '';
}

export function setActiveUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('Selecione um usuário.');
  sessionStore()?.setItem(ACTIVE_USER_SESSION_KEY, id);
  return id;
}

export function clearActiveUserId() {
  sessionStore()?.removeItem(ACTIVE_USER_SESSION_KEY);
}

export async function getActiveUser() {
  const user = await getUser(getActiveUserId());
  return user?.active === false ? null : user;
}
