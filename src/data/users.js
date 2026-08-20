import { getDB } from './database.js';
import { idbDelete, idbGet, idbGetAll, idbPut } from './idb.js';

const STORE_NAME = 'users';
const LEGACY_PROFILE_KEY = 'profile';
export const DEFAULT_USER_COMPANY = 'Saipem';
export const MAX_SIGNATURE_BYTES = 500 * 1024;

function text(value) {
  return value == null ? '' : String(value).trim();
}

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function normalizeUser(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    name: text(input.name),
    role: text(input.role),
    company: text(input.company) || DEFAULT_USER_COMPANY,
    signatureImage: input.signatureImage == null ? null : String(input.signatureImage),
    active: input.active == null ? existing?.active !== false : input.active !== false,
    createdAt: text(input.createdAt) || existing?.createdAt || new Date().toISOString(),
  };
}

export async function listUsers({ activeOnly = false } = {}) {
  const db = await getDB();
  const users = await idbGetAll(db, STORE_NAME);
  return users
    .filter((user) => !activeOnly || user.active !== false)
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export async function getUser(id) {
  if (!id) return null;
  const db = await getDB();
  return idbGet(db, STORE_NAME, id);
}

export async function saveUser(input = {}) {
  const name = text(input.name);
  if (!name) throw new Error('Informe o nome do usuário.');
  const db = await getDB();
  const existing = input.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const user = normalizeUser({ ...input, name }, existing);
  await idbPut(db, STORE_NAME, user);
  return user;
}

export async function deactivateUser(id) {
  const current = await getUser(id);
  if (!current) return null;
  return saveUser({ ...current, active: false });
}

export async function reactivateUser(id) {
  const current = await getUser(id);
  if (!current) return null;
  return saveUser({ ...current, active: true });
}

export async function deleteUser(id) {
  const current = await getUser(id);
  if (!current) return { deleted: false, reason: 'not-found', references: [] };
  const db = await getDB();
  const coupons = await idbGetAll(db, 'materialCoupons');
  const references = coupons
    .filter((coupon) => String(coupon.createdBy || '') === current.id)
    .map((coupon) => ({ id: coupon.id, number: coupon.number || coupon.id }));
  if (references.length) return { deleted: false, reason: 'referenced', references, user: current };
  await idbDelete(db, STORE_NAME, current.id);
  return { deleted: true, references: [], user: current };
}

function migrationTransaction(db, legacyProfile) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['settings', STORE_NAME], 'readwrite');
    const users = transaction.objectStore(STORE_NAME);
    const settings = transaction.objectStore('settings');
    const migratedUser = normalizeUser({
      name: legacyProfile.name,
      role: legacyProfile.role,
      company: legacyProfile.company,
      signatureImage: legacyProfile.signatureImage,
      active: true,
      createdAt: legacyProfile.createdAt || legacyProfile.updatedAt,
    });
    users.put(migratedUser);
    settings.delete(LEGACY_PROFILE_KEY);
    transaction.oncomplete = () => resolve(migratedUser);
    transaction.onabort = () => reject(transaction.error || new Error('A migração do perfil antigo foi cancelada.'));
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao migrar o perfil antigo.'));
  });
}

export async function migrateLegacyProfileToUsers() {
  const db = await getDB();
  const legacyProfile = await idbGet(db, 'settings', LEGACY_PROFILE_KEY);
  if (!legacyProfile) return null;

  try {
    const migratedUser = await migrationTransaction(db, legacyProfile);
    console.info(`[users] Perfil global migrado para o usuário ${migratedUser.id} e removido de settings.`);
    return migratedUser;
  } catch (error) {
    console.error('[users] Falha na migração do perfil global; o registro antigo foi preservado para nova tentativa.', error);
    throw error;
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
