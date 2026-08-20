function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function upper(value) {
  return text(value).toUpperCase();
}

function poItemLengthMm(poItem = {}) {
  const value = numberValue(poItem.lengthArea);
  const unit = upper(poItem.lengthAreaUnit);
  if (!value) return 0;
  if (unit === 'M') return value * 1000;
  if (['IN', 'INCH', 'INCHES'].includes(unit)) return value * 25.4;
  return value;
}

export function getMaterialUnitPostingEligibility(unit) {
  if (!unit) return { eligible: false, code: 'MATERIAL_UNIT_NOT_FOUND' };
  if (upper(unit.postingStatus) === 'POSTED' || text(unit.inventoryItemId)) return { eligible: false, code: 'MATERIAL_UNIT_ALREADY_POSTED' };
  if (upper(unit.inspectionStatus) !== 'ACCEPTED') return { eligible: false, code: 'MATERIAL_UNIT_NOT_ACCEPTED' };
  if (!text(unit.traceability)) return { eligible: false, code: 'MATERIAL_UNIT_TRACEABILITY_REQUIRED' };
  if (numberValue(unit.quantity) <= 0) return { eligible: false, code: 'MATERIAL_UNIT_QUANTITY_INVALID' };
  return { eligible: true, code: '' };
}

export function buildInventoryItemFromMaterialUnit({
  unit = {}, poItem = {}, purchaseOrder = {}, receipt = {}, supplier = {}, timestamp = '',
} = {}) {
  const supplierName = text(supplier.tradeName || supplier.legalName);
  return {
    id: text(unit.traceability), trace: text(unit.traceability), traceability: text(unit.traceability),
    vendor: supplierName, category: text(poItem.materialCategory), itemType: text(poItem.itemType), materialDescription: text(poItem.description),
    materialClassification: text(poItem.materialCategory), poItemPo: [purchaseOrder.poNumber, poItem.itemNumber].filter(Boolean).join('-'),
    po: text(purchaseOrder.poNumber), poItem: text(poItem.itemNumber), poSubject: text(purchaseOrder.subject),
    sapCode: text(poItem.materialCode), identCode: text(poItem.identCode), materialGrade: text(poItem.materialGrade),
    diaMm: numberValue(unit.originalDiameterMm) || numberValue(poItem.diameterOdMm), lengthMm: numberValue(unit.originalLengthMm) || poItemLengthMm(poItem),
    widthMm: numberValue(unit.originalWidthMm), thicknessMm: numberValue(unit.originalThicknessMm) || numberValue(poItem.thicknessMm),
    weightKg: numberValue(unit.weightKg), drawback: upper(poItem.drawback),
    qty: numberValue(unit.quantity), balanceQty: numberValue(unit.quantity), balanceSource: 'explicit', unit: text(unit.unitOfMeasure),
    totalPoQty: numberValue(poItem.orderedQuantity), receivedQty: numberValue(unit.quantity), nfArrival: text(receipt.invoiceNumber),
    receivedDate: text(receipt.arrivalDate), mrr: text(receipt.receiptNumber), heatNo: text(unit.heatNumber),
    inspectionStatus: 'ACCEPTED', acceptanceStatus: 'ACCEPTED', qualityStatus: 'ACCEPTED', qualitySource: 'explicit',
    location: text(unit.storageLocationId), status: 'available', sourceDocumentId: text(receipt.id), projectId: text(unit.projectId),
    reservedQty: 0, source: 'RECEIPT_POSTING', sourceType: 'PURCHASE_ORDER', createdAt: timestamp, updatedAt: timestamp,
    metadata: {
      materialUnitId: text(unit.id), poItemId: text(poItem.id), purchaseOrderId: text(purchaseOrder.id),
      receiptId: text(receipt.id), receiptLineId: text(unit.receiptLineId), supplierId: text(unit.supplierId),
      manufacturerId: text(unit.manufacturerId),
      isIndividuallySerialized: unit.isIndividuallySerialized === true,
    },
  };
}
