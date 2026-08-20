import { getDB } from './database.js';
import { idbGet, idbGetAll, idbRequest, idbTransaction } from './idb.js';
import { generateSequentialTraceabilities } from '../core/materialTraceability.js';
import { normalizeInventoryItem } from './inventoryDB.js';
import { normalizeStockMovement, STOCK_MOVEMENT_TYPES } from './stockMovements.js';
import { normalizeAuditEvent, AUDIT_EVENT_TYPES } from './auditLog.js';

const RECEIPT_STORE = 'materialReceipts';
const LINE_STORE = 'materialReceiptLines';
const UNIT_STORE = 'materialUnits';

function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) { const number = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(number) ? number : 0; }
function nowIso() { return new Date().toISOString(); }

export function normalizeMaterialReceipt(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(), projectId: text(input.projectId), receiptNumber: text(input.receiptNumber),
    supplierId: text(input.supplierId), invoiceNumber: text(input.invoiceNumber), deliveryNoteNumber: text(input.deliveryNoteNumber),
    packingListNumber: text(input.packingListNumber), arrivalDate: text(input.arrivalDate), warehouseId: text(input.warehouseId),
    status: text(input.status).toUpperCase() || 'INSPECTION_PENDING', createdAt: text(input.createdAt) || existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

export function normalizeMaterialReceiptLine(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(), receiptId: text(input.receiptId), purchaseOrderId: text(input.purchaseOrderId),
    poItemId: text(input.poItemId), receivedQuantity: numberValue(input.receivedQuantity), unitOfMeasure: text(input.unitOfMeasure).toUpperCase() || 'EA',
    heatNumber: text(input.heatNumber), supplierBatchNumber: text(input.supplierBatchNumber), visualCondition: text(input.visualCondition).toUpperCase() || 'ACCEPTABLE',
    inspectionStatus: text(input.inspectionStatus).toUpperCase() || 'PENDING', remarks: text(input.remarks),
    visualCheck: input.visualCheck !== false, markingCheck: input.markingCheck !== false, documentsCheck: input.documentsCheck !== false, quantityCheck: input.quantityCheck !== false,
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

export function normalizeMaterialUnit(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(), projectId: text(input.projectId), poItemId: text(input.poItemId), receiptLineId: text(input.receiptLineId),
    supplierId: text(input.supplierId), manufacturerId: text(input.manufacturerId), traceability: text(input.traceability), heatNumber: text(input.heatNumber),
    quantity: numberValue(input.quantity), unitOfMeasure: text(input.unitOfMeasure).toUpperCase() || 'EA', originalDiameterMm: numberValue(input.originalDiameterMm), originalLengthMm: numberValue(input.originalLengthMm),
    originalWidthMm: numberValue(input.originalWidthMm), originalThicknessMm: numberValue(input.originalThicknessMm),
    weightKg: numberValue(input.weightKg),
    isIndividuallySerialized: input.isIndividuallySerialized === true,
    inspectionStatus: text(input.inspectionStatus).toUpperCase() || 'PENDING', inventoryStatus: text(input.inventoryStatus).toUpperCase() || 'PENDING_POSTING',
    postingStatus: text(input.postingStatus).toUpperCase() || 'PENDING', storageLocationId: text(input.storageLocationId),
    inventoryItemId: text(input.inventoryItemId), postedAt: text(input.postedAt), postedBy: text(input.postedBy),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(), updatedAt: nowIso(),
  };
}

export function buildMaterialUnits(receipt, line, options = {}) {
  const assignedTraceabilities = Array.isArray(options.traceabilities) ? options.traceabilities.map(text).filter(Boolean) : [];
  const count = assignedTraceabilities.length || Math.max(1, Math.trunc(numberValue(options.physicalUnitCount) || 1));
  const quantityPerUnit = assignedTraceabilities.length ? 1 : line.receivedQuantity / count;
  const prefix = text(options.traceabilityPrefix) || `${receipt.receiptNumber}-${line.poItemId.slice(0, 8)}`;
  return Array.from({ length: count }, (_, index) => normalizeMaterialUnit({
    projectId: receipt.projectId, poItemId: line.poItemId, receiptLineId: line.id, supplierId: receipt.supplierId,
    manufacturerId: options.manufacturerId || receipt.supplierId, traceability: assignedTraceabilities[index] || (count === 1 ? prefix : `${prefix}-${String(index + 1).padStart(3, '0')}`),
    heatNumber: line.heatNumber, quantity: quantityPerUnit, unitOfMeasure: line.unitOfMeasure,
    originalDiameterMm: options.originalDiameterMm, originalLengthMm: options.originalLengthMm, originalWidthMm: options.originalWidthMm, originalThicknessMm: options.originalThicknessMm, weightKg: options.weightKg,
    inspectionStatus: line.inspectionStatus, inventoryStatus: 'PENDING_POSTING', postingStatus: 'PENDING', storageLocationId: options.storageLocationId,
    isIndividuallySerialized: assignedTraceabilities.length > 0,
  }));
}

export async function createMaterialReceiptWithLine(input = {}) {
  const db = await getDB();
  const receipt = normalizeMaterialReceipt(input.receipt || input);
  const line = normalizeMaterialReceiptLine({ ...(input.line || {}), receiptId: receipt.id });
  if (!receipt.projectId || !receipt.receiptNumber || !receipt.supplierId || !receipt.arrivalDate) throw new Error('Project, receipt number, Supplier and arrival date are required.');
  if (!line.purchaseOrderId || !line.poItemId || line.receivedQuantity <= 0) throw new Error('PO Item and received quantity are required.');
  const unitOptions = input.units || {};
  let units = [];
  await idbTransaction(db, [RECEIPT_STORE, LINE_STORE, UNIT_STORE, 'purchaseOrderItems', 'inventory'], 'readwrite', async (stores) => {
    const [poItem, existingReceipts, existingLines, existingUnits, inventoryItems] = await Promise.all([
      idbRequest(stores.purchaseOrderItems.get(line.poItemId)), idbRequest(stores[RECEIPT_STORE].getAll()),
      idbRequest(stores[LINE_STORE].getAll()), idbRequest(stores[UNIT_STORE].getAll()), idbRequest(stores.inventory.getAll()),
    ]);
    if (!poItem || poItem.purchaseOrderId !== line.purchaseOrderId || poItem.projectId !== receipt.projectId) throw new Error('PO Item does not belong to the selected Project and Purchase Order.');
    if (existingReceipts.some((item) => item.projectId === receipt.projectId && item.receiptNumber === receipt.receiptNumber)) throw new Error('This receipt number already exists in the selected Project.');
    const validReceiptIds = new Set(existingReceipts.filter((item) => item.status !== 'CANCELLED').map((item) => item.id));
    const alreadyReceived = existingLines.filter((item) => item.poItemId === line.poItemId && validReceiptIds.has(item.receiptId)).reduce((total, item) => total + numberValue(item.receivedQuantity), 0);
    if (alreadyReceived + line.receivedQuantity > numberValue(poItem.orderedQuantity)) throw new Error(`Received quantity exceeds the PO Item balance (${Math.max(0, numberValue(poItem.orderedQuantity) - alreadyReceived)} ${poItem.unitOfMeasure}).`);
    if (unitOptions.autoTraceability === true) {
      const physicalUnitCount = Number(unitOptions.physicalUnitCount);
      if (!Number.isInteger(physicalUnitCount) || physicalUnitCount <= 0) throw new Error('Sequential traceability requires a positive integer number of pieces.');
      const pieceLengthMm = numberValue(unitOptions.originalLengthMm);
      if (line.unitOfMeasure === 'M' && pieceLengthMm > 0) {
        const calculatedQuantity = physicalUnitCount * pieceLengthMm / 1000;
        if (Math.abs(calculatedQuantity - line.receivedQuantity) > 0.001) throw new Error('Total received must match number of pieces × piece length.');
      }
      const traceabilities = generateSequentialTraceabilities(unitOptions.baseTraceability, physicalUnitCount, [...existingUnits, ...inventoryItems]);
      units = buildMaterialUnits(receipt, line, { ...unitOptions, traceabilities });
    } else {
      units = buildMaterialUnits(receipt, line, unitOptions);
    }
    const existingTraces = new Set(existingUnits.map((item) => text(item.traceability)).filter(Boolean));
    if (units.some((unit) => existingTraces.has(unit.traceability))) throw new Error('Material Unit traceability already exists.');
    await idbRequest(stores[RECEIPT_STORE].put(receipt));
    await idbRequest(stores[LINE_STORE].put(line));
    await Promise.all(units.map((unit) => idbRequest(stores[UNIT_STORE].put(unit))));
  });
  return { receipt, line, units };
}

export async function updateReceivedMaterialUnit(id, input = {}, context = {}) {
  const unitId = text(id);
  if (!unitId) throw new Error('Material Unit is required.');
  const db = await getDB();
  return idbTransaction(db, [UNIT_STORE, 'inventory', 'stockMovements', 'auditLog', 'auditEvents'], 'readwrite', async (stores) => {
    const [current, units, inventoryItems] = await Promise.all([
      idbRequest(stores[UNIT_STORE].get(unitId)), idbRequest(stores[UNIT_STORE].getAll()), idbRequest(stores.inventory.getAll()),
    ]);
    if (!current) throw new Error('Material Unit not found.');
    const linkedInventoryId = text(current.inventoryItemId);
    const linkedInventory = linkedInventoryId ? inventoryItems.find((item) => [item.id, item.trace, item.traceability].map(text).includes(linkedInventoryId)) : null;
    if (linkedInventoryId && !linkedInventory) throw new Error('Posted Material Unit has no linked Inventory item.');
    const materialUnitPatch = input.materialUnitPatch || input;
    const inventoryPatch = input.inventoryPatch || {};
    const requestedTrace = text(materialUnitPatch.traceability || inventoryPatch.traceability || inventoryPatch.trace || current.traceability);
    if (linkedInventory && requestedTrace !== text(current.traceability)) throw new Error('Posted material traceability cannot be changed because it is already linked to Inventory and Workpacks.');
    const requestedQuantity = materialUnitPatch.quantity ?? inventoryPatch.qty ?? inventoryPatch.receivedQty ?? current.quantity;
    const updated = normalizeMaterialUnit({
      ...current,
      ...materialUnitPatch,
      traceability: requestedTrace,
      heatNumber: materialUnitPatch.heatNumber ?? inventoryPatch.heatNo ?? current.heatNumber,
      quantity: requestedQuantity,
      originalLengthMm: materialUnitPatch.originalLengthMm ?? inventoryPatch.lengthMm ?? current.originalLengthMm,
      storageLocationId: materialUnitPatch.storageLocationId ?? inventoryPatch.location ?? current.storageLocationId,
      id: current.id,
      projectId: current.projectId,
      poItemId: current.poItemId,
      receiptLineId: current.receiptLineId,
      supplierId: current.supplierId,
    }, current);
    if (updated.quantity <= 0) throw new Error('Material Unit quantity must be greater than zero.');
    if (!updated.traceability) throw new Error('Material Unit traceability is required.');
    const normalizedTrace = updated.traceability.toLowerCase();
    const duplicateUnit = units.some((unit) => unit.id !== current.id && text(unit.traceability).toLowerCase() === normalizedTrace);
    const duplicateInventory = inventoryItems.some((item) => item !== linkedInventory && [item.trace, item.traceability, item.id].some((value) => text(value).toLowerCase() === normalizedTrace));
    if (duplicateUnit || duplicateInventory) throw new Error('Material Unit traceability already exists.');
    let inventoryUpdate = null;
    let movement = null;
    if (linkedInventory) {
      const quantityDelta = updated.quantity - numberValue(current.quantity);
      const nextBalance = inventoryPatch.balanceQty == null
        ? Math.max(0, numberValue(linkedInventory.balanceQty) + quantityDelta)
        : Math.max(0, numberValue(inventoryPatch.balanceQty));
      inventoryUpdate = normalizeInventoryItem({
        ...linkedInventory,
        ...inventoryPatch,
        trace: linkedInventory.trace,
        traceability: linkedInventory.traceability || linkedInventory.trace,
        heatNo: updated.heatNumber,
        location: updated.storageLocationId,
        qty: updated.quantity,
        receivedQty: updated.quantity,
        balanceQty: nextBalance,
        diaMm: updated.originalDiameterMm || linkedInventory.diaMm,
        lengthMm: updated.originalLengthMm,
        widthMm: updated.originalWidthMm || linkedInventory.widthMm,
        thicknessMm: updated.originalThicknessMm || linkedInventory.thicknessMm,
        weightKg: updated.weightKg || linkedInventory.weightKg,
        metadata: { ...linkedInventory.metadata, manufacturerId: updated.manufacturerId },
      });
      movement = normalizeStockMovement({
        movementType: STOCK_MOVEMENT_TYPES.MANUAL_ADJUSTMENT,
        inventoryItemId: inventoryUpdate.id || inventoryUpdate.trace,
        projectId: updated.projectId,
        userName: context.userName,
        quantityDelta: nextBalance - numberValue(linkedInventory.balanceQty),
        lengthDelta: numberValue(inventoryUpdate.lengthMm) - numberValue(linkedInventory.lengthMm),
        previousStatus: linkedInventory.status,
        nextStatus: inventoryUpdate.status,
        sourceDocumentType: 'MATERIAL_RECEIPT',
        sourceDocumentId: updated.receiptLineId,
        reason: context.reason || 'Received Material Unit and Inventory updated together.',
        before: linkedInventory,
        after: inventoryUpdate,
        metadata: { materialUnitId: updated.id, source: 'procurementReceiving' },
      });
    }
    const auditEvent = normalizeAuditEvent({
      eventType: AUDIT_EVENT_TYPES.MANUAL_ADJUSTMENT,
      entityType: 'MATERIAL_UNIT',
      entityId: updated.id,
      projectId: updated.projectId,
      userName: context.userName,
      sourceDocumentType: 'MATERIAL_RECEIPT',
      sourceDocumentId: updated.receiptLineId,
      reason: context.reason || 'Received Material Unit and Inventory updated together.',
      before: { materialUnit: current, inventoryItem: linkedInventory },
      after: { materialUnit: updated, inventoryItem: inventoryUpdate },
      metadata: { inventoryItemId: inventoryUpdate?.id || inventoryUpdate?.trace || '' },
    });
    await idbRequest(stores[UNIT_STORE].put(updated));
    if (inventoryUpdate) await idbRequest(stores.inventory.put(inventoryUpdate));
    if (movement) await idbRequest(stores.stockMovements.put(movement));
    await idbRequest(stores.auditLog.put(auditEvent));
    await idbRequest(stores.auditEvents.put(auditEvent));
    return { materialUnit: updated, inventoryItem: inventoryUpdate, movement, auditEvent };
  });
}

export async function getAllMaterialReceipts() { return idbGetAll(await getDB(), RECEIPT_STORE); }
export async function getAllMaterialReceiptLines() { return idbGetAll(await getDB(), LINE_STORE); }
export async function getAllMaterialUnits() { return idbGetAll(await getDB(), UNIT_STORE); }
