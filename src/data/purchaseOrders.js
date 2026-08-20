import { getDB } from './database.js';
import { idbGet, idbGetAll, idbRequest, idbTransaction } from './idb.js';
import { purchaseOrderDeletionBlockers, purchaseOrderItemDeletionBlockers } from '../core/purchaseOrderLifecycle.js';

const PO_STORE = 'purchaseOrders';
const REVISION_STORE = 'purchaseOrderRevisions';
const ITEM_STORE = 'purchaseOrderItems';

export const PURCHASE_ORDER_STATUS = Object.freeze({
  DRAFT: 'DRAFT', ISSUED: 'ISSUED', ACKNOWLEDGED: 'ACKNOWLEDGED', IN_PRODUCTION: 'IN_PRODUCTION',
  PARTIALLY_SHIPPED: 'PARTIALLY_SHIPPED', SHIPPED: 'SHIPPED', PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED', CLOSED: 'CLOSED', CANCELLED: 'CANCELLED',
});

function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) { const number = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(number) ? number : 0; }
function nowIso() { return new Date().toISOString(); }

export function normalizePurchaseOrder(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(), projectId: text(input.projectId), poNumber: text(input.poNumber),
    currentRevision: text(input.currentRevision) || '00', supplierId: text(input.supplierId), subject: text(input.subject),
    buyerName: text(input.buyerName), procurementOffice: text(input.procurementOffice), orderDate: text(input.orderDate),
    status: text(input.status).toUpperCase() || PURCHASE_ORDER_STATUS.DRAFT, sourceSystem: text(input.sourceSystem) || 'MANUAL',
    currency: text(input.currency).toUpperCase(), createdAt: text(input.createdAt) || existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

export function normalizePurchaseOrderItem(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(), purchaseOrderId: text(input.purchaseOrderId), projectId: text(input.projectId),
    itemNumber: text(input.itemNumber), materialCode: text(input.materialCode), identCode: text(input.identCode), description: text(input.description),
    materialCategory: text(input.materialCategory).toUpperCase(), materialGrade: text(input.materialGrade), orderedQuantity: numberValue(input.orderedQuantity),
    unitOfMeasure: text(input.unitOfMeasure).toUpperCase() || 'EA', contractualDeliveryDate: text(input.contractualDeliveryDate),
    expectedDeliveryDate: text(input.expectedDeliveryDate), status: text(input.status).toUpperCase() || 'OPEN',
    traceability: text(input.traceability), drawback: text(input.drawback).toUpperCase(), equipmentDestination: text(input.equipmentDestination),
    task: text(input.task), itemClassification: text(input.itemClassification).toUpperCase(), itemType: text(input.itemType).toUpperCase(),
    diameterOdMm: numberValue(input.diameterOdMm), thicknessMm: numberValue(input.thicknessMm), degree: numberValue(input.degree), lengthArea: numberValue(input.lengthArea),
    lengthAreaUnit: text(input.lengthAreaUnit), unitPrice: numberValue(input.unitPrice), sourceFileName: text(input.sourceFileName),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

function normalizeRevision(po, input = {}, existing = null) {
  const revision = text(input.revision || po.currentRevision) || '00';
  return {
    id: text(input.id) || existing?.id || createId(), purchaseOrderId: po.id, revision,
    issueDate: text(input.issueDate || po.orderDate), documentRevisionId: text(input.documentRevisionId),
    isCurrent: input.isCurrent !== false, supersedesRevisionId: text(input.supersedesRevisionId),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

export async function createPurchaseOrder(input = {}) {
  const db = await getDB();
  const record = normalizePurchaseOrder(input);
  if (!record.projectId || !record.poNumber || !record.supplierId) throw new Error('Project, PO number and Supplier are required.');
  const revision = normalizeRevision(record, input.revisionData || {});
  await idbTransaction(db, [PO_STORE, REVISION_STORE], 'readwrite', async (stores) => {
    const records = await idbRequest(stores[PO_STORE].getAll());
    if (records.some((item) => item.projectId === record.projectId && item.poNumber === record.poNumber)) throw new Error('A Purchase Order with this number already exists in the selected Project.');
    await idbRequest(stores[PO_STORE].put(record));
    await idbRequest(stores[REVISION_STORE].put(revision));
  });
  return record;
}

export async function savePurchaseOrder(input = {}) {
  const db = await getDB(); const existing = input.id ? await idbGet(db, PO_STORE, input.id) : null;
  if (!existing) return createPurchaseOrder(input);
  const record = normalizePurchaseOrder(input, existing);
  if (!record.projectId || !record.poNumber || !record.supplierId) throw new Error('Project, PO number and Supplier are required.');
  await idbTransaction(db, PO_STORE, 'readwrite', async (stores) => {
    const records = await idbRequest(stores[PO_STORE].getAll());
    if (records.some((item) => item.id !== record.id && item.projectId === record.projectId && item.poNumber === record.poNumber)) {
      throw new Error('A Purchase Order with this number already exists in the selected Project.');
    }
    await idbRequest(stores[PO_STORE].put(record));
  });
  return record;
}

export async function getPurchaseOrder(id) { return idbGet(await getDB(), PO_STORE, id); }
export async function getAllPurchaseOrders() { return idbGetAll(await getDB(), PO_STORE); }
function deletionStores() {
  return [PO_STORE, REVISION_STORE, ITEM_STORE, 'materialReceiptLines', 'materialUnits', 'inventory', 'mtoPoItemAllocations', 'poDeliveryForecasts'];
}

async function deletionData(stores) {
  const [receiptLines, materialUnits, inventoryItems, allocations, deliveryForecasts] = await Promise.all([
    idbRequest(stores.materialReceiptLines.getAll()),
    idbRequest(stores.materialUnits.getAll()),
    idbRequest(stores.inventory.getAll()),
    idbRequest(stores.mtoPoItemAllocations.getAll()),
    idbRequest(stores.poDeliveryForecasts.getAll()),
  ]);
  return { receiptLines, materialUnits, inventoryItems, allocations, deliveryForecasts };
}

function deletionBlockedError(blockers, target) {
  const details = [...new Set(blockers.map((blocker) => blocker.label))].join(', ');
  const error = new Error(`${target} não pode ser excluído porque ${details}.`);
  error.code = 'PURCHASE_ORDER_DELETE_BLOCKED';
  error.blockers = blockers;
  return error;
}

export async function deletePurchaseOrder(id) {
  const db = await getDB();
  return idbTransaction(db, deletionStores(), 'readwrite', async (stores) => {
    const [purchaseOrder, items, revisions, data] = await Promise.all([
      idbRequest(stores[PO_STORE].get(id)),
      idbRequest(stores[ITEM_STORE].getAll()),
      idbRequest(stores[REVISION_STORE].getAll()),
      deletionData(stores),
    ]);
    if (!purchaseOrder) return null;
    const poItems = items.filter((item) => item.purchaseOrderId === purchaseOrder.id);
    const blockers = purchaseOrderDeletionBlockers(purchaseOrder, poItems, data);
    if (blockers.length) throw deletionBlockedError(blockers, `PO ${purchaseOrder.poNumber}`);
    await Promise.all([
      ...poItems.map((item) => idbRequest(stores[ITEM_STORE].delete(item.id))),
      ...revisions.filter((revision) => revision.purchaseOrderId === purchaseOrder.id)
        .map((revision) => idbRequest(stores[REVISION_STORE].delete(revision.id))),
      idbRequest(stores[PO_STORE].delete(purchaseOrder.id)),
    ]);
    return { purchaseOrder, items: poItems };
  });
}
export async function listPurchaseOrders(filters = {}) { return (await getAllPurchaseOrders()).filter((item) => (!filters.projectId || item.projectId === filters.projectId) && (!filters.supplierId || item.supplierId === filters.supplierId) && (!filters.status || item.status === filters.status)); }
export async function getAllPurchaseOrderRevisions() { return idbGetAll(await getDB(), REVISION_STORE); }
export async function createPurchaseOrderRevision(purchaseOrderId, input = {}) {
  const db = await getDB();
  return idbTransaction(db, [PO_STORE, REVISION_STORE], 'readwrite', async (stores) => {
    const [po, revisions] = await Promise.all([idbRequest(stores[PO_STORE].get(purchaseOrderId)), idbRequest(stores[REVISION_STORE].getAll())]);
    if (!po) throw new Error('Purchase Order not found.');
    const poRevisions = revisions.filter((item) => item.purchaseOrderId === purchaseOrderId);
    const revisionCode = text(input.revision);
    if (!revisionCode) throw new Error('Revision code is required.');
    if (poRevisions.some((item) => item.revision === revisionCode)) throw new Error('This Purchase Order revision already exists.');
    const current = poRevisions.find((item) => item.isCurrent) || null;
    const revision = normalizeRevision({ ...po, currentRevision: revisionCode }, { ...input, revision: revisionCode, supersedesRevisionId: current?.id || '', isCurrent: true });
    await Promise.all(poRevisions.filter((item) => item.isCurrent).map((item) => idbRequest(stores[REVISION_STORE].put({ ...item, isCurrent: false, updatedAt: nowIso() }))));
    await idbRequest(stores[REVISION_STORE].put(revision));
    await idbRequest(stores[PO_STORE].put({ ...po, currentRevision: revisionCode, updatedAt: nowIso() }));
    return revision;
  });
}

export async function savePurchaseOrderItem(input = {}) {
  const db = await getDB(); const existing = input.id ? await idbGet(db, ITEM_STORE, input.id) : null;
  const record = normalizePurchaseOrderItem(input, existing);
  if (!record.purchaseOrderId || !record.projectId || !record.itemNumber || record.orderedQuantity <= 0) throw new Error('PO, item number and ordered quantity are required.');
  await idbTransaction(db, [PO_STORE, ITEM_STORE], 'readwrite', async (stores) => {
    const [po, items] = await Promise.all([idbRequest(stores[PO_STORE].get(record.purchaseOrderId)), idbRequest(stores[ITEM_STORE].getAll())]);
    if (!po || po.projectId !== record.projectId) throw new Error('Purchase Order does not belong to the selected Project.');
    if (items.some((item) => item.id !== record.id && item.purchaseOrderId === record.purchaseOrderId && item.itemNumber === record.itemNumber)) throw new Error('This item number already exists in the Purchase Order.');
    await idbRequest(stores[ITEM_STORE].put(record));
  });
  return record;
}

export async function getPurchaseOrderItem(id) { return idbGet(await getDB(), ITEM_STORE, id); }
export async function getAllPurchaseOrderItems() { return idbGetAll(await getDB(), ITEM_STORE); }
export async function listPurchaseOrderItems(filters = {}) { return (await getAllPurchaseOrderItems()).filter((item) => (!filters.purchaseOrderId || item.purchaseOrderId === filters.purchaseOrderId) && (!filters.projectId || item.projectId === filters.projectId)); }
export async function deletePurchaseOrderItem(id) {
  const db = await getDB();
  return idbTransaction(db, deletionStores(), 'readwrite', async (stores) => {
    const [item, purchaseOrders, data] = await Promise.all([
      idbRequest(stores[ITEM_STORE].get(id)),
      idbRequest(stores[PO_STORE].getAll()),
      deletionData(stores),
    ]);
    if (!item) return null;
    const purchaseOrder = purchaseOrders.find((po) => po.id === item.purchaseOrderId) || {};
    const blockers = purchaseOrderItemDeletionBlockers(item, purchaseOrder, data);
    if (blockers.length) throw deletionBlockedError(blockers, `Item ${item.itemNumber}`);
    await idbRequest(stores[ITEM_STORE].delete(item.id));
    return { item, purchaseOrder };
  });
}
