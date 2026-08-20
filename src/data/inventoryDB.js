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

function qualityDecision(input = {}) {
  const explicitStatus = text(input.qualityStatus).toUpperCase();
  const acceptanceStatus = text(input.acceptanceStatus).toUpperCase();
  const inspectionStatus = text(input.inspectionStatus).toUpperCase();
  const existingSource = text(input.qualitySource);
  const emptyDecision = (value) => !value || ['N/A', 'NA', 'N A'].includes(value);
  const inheritedFromLegacyInspection = !existingSource
    && !emptyDecision(explicitStatus)
    && explicitStatus === inspectionStatus
    && emptyDecision(acceptanceStatus);
  const rawStatus = inheritedFromLegacyInspection ? '' : (explicitStatus || acceptanceStatus);
  const qualityStatus = emptyDecision(rawStatus) ? 'ACCEPTED' : rawStatus;
  const qualitySource = existingSource
    || (inheritedFromLegacyInspection ? 'legacyInspectionDefault' : explicitStatus ? 'explicit' : acceptanceStatus ? 'acceptanceStatus' : 'defaultAccepted');
  return { qualityStatus, qualitySource };
}

export function normalizeInventoryItem(input = {}) {
  const trace = text(input.trace || input.traceability || input.id) || createId();
  const qty = numberValue(input.qty) || 1;
  const rawStatus = text(input.status).toLowerCase();
  const status = !rawStatus || ['n/a', 'na', 'n a'].includes(rawStatus) ? 'available' : rawStatus;
  const hasBalanceQty = input.balanceQty != null && text(input.balanceQty) !== '';
  const suppliedBalanceQty = numberValue(input.balanceQty);
  const parserPlaceholderBalance = status === 'available'
    && suppliedBalanceQty <= 0
    && qty > 0
    && numberValue(input.reservedQty) <= 0
    && numberValue(input.issuedQty || input.issuedMatQty) <= 0
    && !text(input.materialCouponNo)
    && !text(input.exitDate);
  const usesQtyFallback = !hasBalanceQty || parserPlaceholderBalance;
  const balanceQty = usesQtyFallback ? qty : suppliedBalanceQty;
  const balanceSource = text(input.balanceSource) || (usesQtyFallback ? 'qtyFallback' : 'explicit');
  const { qualityStatus, qualitySource } = qualityDecision(input);
  return {
    id: text(input.id) || trace,
    trace,
    traceability: text(input.traceability || input.trace || trace),
    vendor: text(input.vendor || input.vendorSupplier || input.supplier),
    category: text(input.category),
    materialDescription: text(input.materialDescription),
    materialClassification: text(input.materialClassification),
    type: text(input.type),
    profile: text(input.profile),
    poItemPo: text(input.poItemPo),
    po: text(input.po),
    poItem: text(input.poItem),
    poSubject: text(input.poSubject || input.chronoNumber),
    sapCode: text(input.sapCode),
    identCode: text(input.identCode || input.IdentCode || input['IDENT CODE']),
    regime: text(input.regime),
    materialGrade: text(input.materialGrade),
    thicknessMm: text(input.thicknessMm),
    diaMm: text(input.diaMm),
    widthMm: text(input.widthMm),
    lengthMm: numberValue(input.lengthMm),
    unit: text(input.unit),
    weightKg: numberValue(input.weightKg),
    qty,
    totalPoQty: numberValue(input.totalPoQty),
    receivedQty: numberValue(input.receivedQty),
    issuedQty: numberValue(input.issuedQty || input.issuedMatQty),
    balanceQty,
    balanceSource,
    nfArrival: text(input.nfArrival),
    receivedDate: text(input.receivedDate),
    mrr: text(input.mrr),
    partNumber: text(input.partNumber),
    serialNumber: text(input.serialNumber),
    mtcNumber: text(input.mtcNumber),
    heatNo: text(input.heatNo),
    mir: text(input.mir),
    inspectionStatus: text(input.inspectionStatus),
    acceptanceStatus: text(input.acceptanceStatus),
    qualityStatus,
    qualitySource,
    colorCode: text(input.colorCode),
    location: text(input.location),
    locationZone: text(input.locationZone),
    equipment: text(input.equipment),
    materialCouponNo: text(input.materialCouponNo),
    exitDate: text(input.exitDate),
    exitInvoice: text(input.exitInvoice),
    rmvNo: text(input.rmvNo),
    notes: text(input.notes),
    status,
    sourceDocumentId: text(input.sourceDocumentId),
    projectId: text(input.projectId),
    parentStockId: text(input.parentStockId),
    parentTraceability: text(input.parentTraceability),
    parentInventoryItemId: text(input.parentInventoryItemId),
    parentTrace: text(input.parentTrace),
    reservedQty: numberValue(input.reservedQty),
    isOffcut: input.isOffcut === true,
    source: text(input.source),
    sourceType: text(input.sourceType),
    sourceOffcutId: text(input.sourceOffcutId),
    parentCuttingPackageId: text(input.parentCuttingPackageId),
    parentInventoryId: text(input.parentInventoryId),
    createdAt: text(input.createdAt),
    updatedAt: text(input.updatedAt),
    metadata: input.metadata && typeof input.metadata === 'object' ? structuredClone(input.metadata) : {},
  };
}

export async function saveInventoryItems(items) {
  const database = await initInventoryDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    items.forEach((item) => {
      const normalized = normalizeInventoryItem(item);
      if (normalized.trace) store.put(normalized);
    });

    tx.oncomplete = () => resolve(items);
    tx.onerror = () => reject(new Error('Erro ao salvar o inventario no banco local.'));
  });
}

export async function getInventoryItems() {
  const database = await initInventoryDB();
  const items = await idbGetAll(database, STORE_NAME);
  const repaired = [];
  for (const item of items) {
    const status = text(item.status).toLowerCase();
    const placeholderBalance = !text(item.balanceSource)
      && status === 'available'
      && numberValue(item.balanceQty) <= 0
      && numberValue(item.qty) > 0
      && numberValue(item.reservedQty) <= 0
      && numberValue(item.issuedQty) <= 0
      && !text(item.materialCouponNo)
      && !text(item.exitDate);
    const quality = qualityDecision(item);
    const qualityNeedsRepair = item.qualityStatus !== quality.qualityStatus || item.qualitySource !== quality.qualitySource;
    if (!placeholderBalance && !qualityNeedsRepair) {
      repaired.push(item);
      continue;
    }
    const next = normalizeInventoryItem({
      ...item,
      ...(placeholderBalance ? { balanceQty: item.qty, balanceSource: 'legacyQtyFallback' } : {}),
      qualityStatus: quality.qualityStatus,
      qualitySource: quality.qualitySource,
    });
    await idbPut(database, STORE_NAME, next);
    repaired.push(next);
  }
  return repaired;
}

export const getAllInventoryItems = getInventoryItems;

export async function createInventoryItem(input) {
  const database = await initInventoryDB();
  const item = normalizeInventoryItem(input);
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
