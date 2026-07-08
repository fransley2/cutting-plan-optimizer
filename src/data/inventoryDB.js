import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'inventory';

export function initInventoryDB() {
  return getDB();
}

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  if (value === '' || value == null) return 0;
  const normalized = typeof value === 'string'
    ? value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function defaultDisponibilidade(balanceQty) {
  return numberValue(balanceQty) > 0 ? 'Disponível' : 'Não Disponível';
}

function normalizeInventoryItem(input = {}, options = {}) {
  const trace = text(input.trace || input.traceability || input.id) || createId();
  const material = text(input.material || input.materialGrade || input['Material & Grade']);
  const description = text(input.description || input.desc || input.materialDescription);
  const heat = text(input.heat || input.heatNumber);
  const storageLocation = text(input.storageLocation || input.location);
  const comments = text(input.comments || input.notes || input.remarks);
  const balanceQty = numberValue(input.balanceQty);
  const disponibilidade = text(input.disponibilidade)
    || (options.defaultDisponibilidade ? defaultDisponibilidade(balanceQty) : '');
  return {
    ...input,
    id: text(input.id) || trace,
    trace,
    traceability: text(input.traceability || input.trace || trace),
    vendor: text(input.vendor || input.vendorSupplier || input.supplier),
    category: text(input.category),
    materialDescription: description,
    materialClassification: text(input.materialClassification),
    type: text(input.type),
    profile: text(input.profile),
    poItemPo: text(input.poItemPo),
    po: text(input.po),
    item: text(input.item),
    poNumber: text(input.poNumber || input.po),
    poItem: text(input.poItem || input.item),
    poSubject: text(input.poSubject || input.chronoNumber),
    sapCode: text(input.sapCode),
    regime: text(input.regime),
    material,
    materialGrade: material,
    desc: description,
    description,
    thkMm: text(input.thkMm || input.thickness),
    diaOdMm: text(input.diaOdMm || input.od),
    widthMm: text(input.widthMm || input.width),
    length: numberValue(input.length || input.currentLength || input.comprimento || input.comp || input.originalLength),
    currentLength: numberValue(input.currentLength || input.length || input.comprimento || input.comp || input.originalLength),
    unitOfMeasure: text(input.unitOfMeasure || input.unit || input.uom),
    totalWeightKg: numberValue(input.totalWeightKg || input.totalWeight || input.weightKg || input.weight),
    qty: numberValue(input.qty) || 1,
    totalPoQty: numberValue(input.totalPoQty),
    receivedQty: numberValue(input.receivedQty),
    issuedQty: numberValue(input.issuedQty || input.issuedMatQty),
    balanceQty,
    entryInvoice: text(input.entryInvoice),
    receivedDate: text(input.receivedDate),
    mrr: text(input.mrr),
    partNumber: text(input.partNumber),
    serialNumber: text(input.serialNumber),
    mtcNumber: text(input.mtcNumber || input.certificate),
    heat,
    heatNumber: text(input.heatNumber || input.heat),
    mirNumber: text(input.mirNumber || input.mir),
    inspectionStatus: text(input.inspectionStatus),
    acceptanceStatus: text(input.acceptanceStatus),
    colorCode: text(input.colorCode),
    storageLocation,
    location: storageLocation,
    locationZone: text(input.locationZone),
    equipmentDesignation: text(input.equipmentDesignation || input.equipment),
    materialCouponNo: text(input.materialCouponNo),
    exitDate: text(input.exitDate),
    exitInvoice: text(input.exitInvoice),
    rmvNo: text(input.rmvNo),
    disponibilidade,
    comments,
    notes: comments,
    status: text(input.status) || 'available',
    sourceDocumentId: text(input.sourceDocumentId),
    projectId: text(input.projectId),
  };
}

export async function saveInventoryItems(items) {
  const database = await initInventoryDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    items.forEach((item) => {
      const normalized = normalizeInventoryItem(item, { defaultDisponibilidade: true });
      if (normalized.trace) store.put(normalized);
    });

    tx.oncomplete = () => resolve(items);
    tx.onerror = () => reject(new Error('Erro ao salvar o inventario no banco local.'));
  });
}

export async function getInventoryItems() {
  const database = await initInventoryDB();
  return idbGetAll(database, STORE_NAME);
}

export const getAllInventoryItems = getInventoryItems;

export async function createInventoryItem(input) {
  const database = await initInventoryDB();
  const item = normalizeInventoryItem(input, { defaultDisponibilidade: true });
  await idbPut(database, STORE_NAME, item);
  return item;
}

export async function getInventoryItem(id) {
  const database = await initInventoryDB();
  const direct = await idbGet(database, STORE_NAME, id);
  if (direct) return direct;
  const items = await idbGetAll(database, STORE_NAME);
  return items.find((item) => item.id === id || item.trace === id || item.traceability === id) || null;
}

export async function updateInventoryItem(id, patch) {
  const current = await getInventoryItem(id);
  if (!current) return null;
  const database = await initInventoryDB();
  const updated = normalizeInventoryItem({ ...current, ...(patch || {}), id: current.id || id });
  if (updated.trace !== current.trace) await idbDelete(database, STORE_NAME, current.trace);
  await idbPut(database, STORE_NAME, updated);
  return updated;
}

export async function deleteInventoryItem(id) {
  if (!id) return undefined;
  const current = await getInventoryItem(id);
  if (!current) return undefined;
  const database = await initInventoryDB();
  return idbDelete(database, STORE_NAME, current.trace);
}

export async function deleteInventoryItems(ids = []) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length) return [];
  await Promise.all(uniqueIds.map((id) => deleteInventoryItem(id)));
  return uniqueIds;
}

export async function clearInventoryItems() {
  const database = await initInventoryDB();
  return idbClear(database, STORE_NAME);
}
