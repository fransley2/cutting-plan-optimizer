import { getDB } from './database.js';
import { idbGet, idbPut } from './idb.js';

const STORE_NAME = 'settings';
const PROFILE_ID = 'profile';
export const MAX_SIGNATURE_BYTES = 500 * 1024;

export async function getProfile() {
  const db = await getDB();
  const profile = await idbGet(db, STORE_NAME, PROFILE_ID);
  return profile || { id: PROFILE_ID, name: '', role: '', signatureImage: null };
}

export async function saveProfile({ name, role, signatureImage }) {
  const db = await getDB();
  return idbPut(db, STORE_NAME, {
    id: PROFILE_ID,
    name,
    role,
    signatureImage,
    updatedAt: new Date().toISOString(),
  });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
