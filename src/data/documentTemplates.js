import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete } from './idb.js';

const STORE_NAME = 'documentTemplates';

export const DOCUMENT_TEMPLATE_TYPES = Object.freeze({
  MATERIAL_COUPON: 'MATERIAL_COUPON',
});

export const DOCUMENT_TEMPLATE_IDS = Object.freeze({
  MATERIAL_COUPON: 'material_coupon',
});

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  return value == null ? '' : String(value);
}

function getTemplateIdByType(type) {
  if (type === DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON) {
    return DOCUMENT_TEMPLATE_IDS.MATERIAL_COUPON;
  }
  throw new Error('Unsupported document template type.');
}

function validateTemplateFile(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('Template file is empty.');
  }

  const name = text(file.name);
  if (!name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Only .xlsx templates are supported.');
  }

  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Template file is empty.');
  }

  if (typeof file.arrayBuffer !== 'function') {
    throw new Error('Template file is empty.');
  }
}

export async function saveDocumentTemplate(type, file) {
  const id = getTemplateIdByType(type);
  validateTemplateFile(file);

  const db = await getDB();
  const existing = await idbGet(db, STORE_NAME, id);
  const createdAt = existing?.createdAt || nowIso();
  const updatedAt = nowIso();
  const arrayBuffer = await file.arrayBuffer();

  if (!arrayBuffer || Number(arrayBuffer.byteLength || 0) <= 0) {
    throw new Error('Template file is empty.');
  }

  const record = {
    id,
    type,
    fileName: text(file.name),
    mimeType: text(file.type),
    size: Number(file.size || arrayBuffer.byteLength || 0),
    arrayBuffer: arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer,
    createdAt,
    updatedAt,
  };

  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function getDocumentTemplate(type) {
  const db = await getDB();
  return idbGet(db, STORE_NAME, getTemplateIdByType(type));
}

export async function deleteDocumentTemplate(type) {
  const db = await getDB();
  return idbDelete(db, STORE_NAME, getTemplateIdByType(type));
}

export async function hasDocumentTemplate(type) {
  return Boolean(await getDocumentTemplate(type));
}

export async function listDocumentTemplates() {
  const db = await getDB();
  return idbGetAll(db, STORE_NAME);
}
