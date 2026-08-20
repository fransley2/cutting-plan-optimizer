import { getActiveUser } from './userSession.js';
export { fileToBase64, MAX_SIGNATURE_BYTES } from './users.js';

export async function getProfile() {
  const user = await getActiveUser();
  return user || {
    id: '',
    name: '',
    role: '',
    company: '',
    signatureImage: null,
  };
}
