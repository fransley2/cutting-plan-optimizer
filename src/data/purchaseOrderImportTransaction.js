import { validatePurchaseOrderImportRows } from '../core/purchaseOrderImport.js';
import { getDB } from './database.js';
import { idbRequest, idbTransaction } from './idb.js';
import { normalizeOrganization } from './organizations.js';
import { normalizePurchaseOrder, normalizePurchaseOrderItem } from './purchaseOrders.js';
import { normalizeAuditEvent } from './auditLog.js';

const STORE_NAMES = Object.freeze(['organizations', 'purchaseOrders', 'purchaseOrderRevisions', 'purchaseOrderItems', 'auditLog', 'auditEvents']);
function text(value) { return value == null ? '' : String(value).trim(); }
function key(value) { return text(value).toLocaleLowerCase(); }
function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function put(store, record) { store.put(record); return record; }

export async function commitPurchaseOrderImport(rows = [], context = {}) {
  const projectId = text(context.projectId);
  if (!projectId) throw new Error('PROJECT_REQUIRED');
  const validation = validatePurchaseOrderImportRows(rows);
  const invalid = validation.filter((item) => !item.valid);
  if (invalid.length) throw new Error(`PO_IMPORT_INVALID_ROWS:${invalid.map((item) => item.index + 1).join(',')}`);
  const uniqueRows = [...new Map(rows.map((row) => [`${key(row.poNumber)}|${key(row.poItem)}`, row])).values()];
  if (!uniqueRows.length) throw new Error('PO_IMPORT_EMPTY');
  const db = await getDB();
  return idbTransaction(db, STORE_NAMES, 'readwrite', async (stores) => {
    const [organizations, purchaseOrders, revisions, items] = await Promise.all([
      idbRequest(stores.organizations.getAll()), idbRequest(stores.purchaseOrders.getAll()),
      idbRequest(stores.purchaseOrderRevisions.getAll()), idbRequest(stores.purchaseOrderItems.getAll()),
    ]);
    const timestamp = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
    const sourceFileName = text(context.sourceFileName);
    const sourceType = text(context.sourceType).toUpperCase() || 'MANUAL_GRID';
    const savedOrganizations = new Map(); const savedPurchaseOrders = new Map(); const savedItems = [];

    for (const row of uniqueRows) {
      const vendorKey = key(row.vendor);
      let organization = savedOrganizations.get(vendorKey) || organizations.find((item) => key(item.legalName) === vendorKey || key(item.tradeName) === vendorKey);
      organization = normalizeOrganization({ ...(organization || {}), legalName: organization?.legalName || row.vendor, tradeName: organization?.tradeName || row.vendor, vendorCode: row.vendorCode || organization?.vendorCode, organizationType: organization?.organizationType?.length ? organization.organizationType : ['SUPPLIER'], sourceSystem: sourceType }, organization);
      organization = { ...organization, updatedAt: timestamp };
      put(stores.organizations, organization); savedOrganizations.set(vendorKey, organization);

      const poKey = `${projectId}|${key(row.poNumber)}`;
      let po = savedPurchaseOrders.get(poKey) || purchaseOrders.find((item) => item.projectId === projectId && key(item.poNumber) === key(row.poNumber));
      const previousRevision = text(po?.currentRevision);
      po = normalizePurchaseOrder({ ...(po || {}), projectId, poNumber: row.poNumber, currentRevision: row.poRevision || previousRevision || '00', supplierId: organization.id, subject: row.task || po?.subject, orderDate: row.poDocDate || po?.orderDate, status: po?.status || 'ISSUED', sourceSystem: sourceType, currency: row.currency || po?.currency }, po);
      po = { ...po, updatedAt: timestamp };
      put(stores.purchaseOrders, po); savedPurchaseOrders.set(poKey, po);

      const revisionCode = text(row.poRevision || po.currentRevision || '00');
      let revision = revisions.find((item) => item.purchaseOrderId === po.id && text(item.revision) === revisionCode);
      if (!revision) {
        revisions.filter((item) => item.purchaseOrderId === po.id && item.isCurrent).forEach((item) => put(stores.purchaseOrderRevisions, { ...item, isCurrent: false, updatedAt: timestamp }));
        revision = { id: createId(), purchaseOrderId: po.id, revision: revisionCode, issueDate: row.poDocDate || po.orderDate, documentRevisionId: '', isCurrent: true, supersedesRevisionId: revisions.find((item) => item.purchaseOrderId === po.id && item.isCurrent)?.id || '', sourceFileName, createdAt: timestamp, updatedAt: timestamp };
        put(stores.purchaseOrderRevisions, revision); revisions.push(revision);
      }

      const existingItem = items.find((item) => item.purchaseOrderId === po.id && text(item.itemNumber) === text(row.poItem));
      const poItem = normalizePurchaseOrderItem({
        ...(existingItem || {}), purchaseOrderId: po.id, projectId, itemNumber: row.poItem, identCode: row.identCode,
        description: row.itemDescription, materialCategory: row.itemClassification, materialGrade: row.materialGrade,
        orderedQuantity: row.poQuantity, unitOfMeasure: row.poUnit || row.lengthAreaUnit || 'EA', traceability: row.traceability,
        drawback: row.drawback, equipmentDestination: row.equipmentDestination, task: row.task, itemClassification: row.itemClassification,
        itemType: row.itemType, diameterOdMm: row.diameterOdMm, thicknessMm: row.thicknessMm, degree: row.degree, lengthArea: row.lengthArea,
        lengthAreaUnit: row.lengthAreaUnit, unitPrice: row.unitPrice, expectedDeliveryDate: row.deliveryDate, materialCode: row.materialCode,
        sourceFileName, status: Number(row.poQuantity) > 0 ? 'OPEN' : 'QUANTITY_PENDING',
      }, existingItem);
      const savedItem = { ...poItem, updatedAt: timestamp };
      put(stores.purchaseOrderItems, savedItem); savedItems.push(savedItem);
      if (!existingItem) items.push(savedItem);
    }

    const audit = normalizeAuditEvent({
      eventType: 'PURCHASE_ORDER_IMPORT', entityType: 'PROCUREMENT_IMPORT', entityId: createId(), projectId, timestamp,
      userName: text(context.userName), sourceDocumentType: sourceType, sourceDocumentId: sourceFileName,
      reason: 'Purchase Orders and PO Items imported after grid review.',
      metadata: { rowCount: uniqueRows.length, purchaseOrderNumbers: [...new Set(uniqueRows.map((row) => row.poNumber))], sourceFileName },
    });
    put(stores.auditLog, audit); put(stores.auditEvents, audit);
    return { organizations: [...savedOrganizations.values()], purchaseOrders: [...savedPurchaseOrders.values()], items: savedItems, audit };
  });
}
