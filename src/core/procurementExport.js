import { calculatePoItemMetrics, derivePurchaseOrderStatus } from './procurementMetrics.js';

const QUANTITY_KEYS = Object.freeze([
  'ordered', 'received', 'accepted', 'hold', 'rejected', 'available', 'reserved', 'stockOnHand', 'issued', 'consumed', 'used', 'returned', 'pending',
]);

export const PROCUREMENT_PO_COLUMNS = Object.freeze([
  ['project', 'Project', 18], ['poNumber', 'PO Number', 14], ['revision', 'PO Rev.', 10], ['vendorCode', 'Vendor Code', 14],
  ['vendorName', 'Vendor', 34], ['subject', 'Subject / Task', 42], ['orderDate', 'PO Doc. Date', 14], ['status', 'PO Status', 22],
  ['currency', 'Currency', 10], ['sourceSystem', 'Source System', 14], ['buyerName', 'Buyer', 22], ['procurementOffice', 'Procurement Office', 22],
  ['itemCount', 'Items', 10], ['units', 'Units', 14], ['createdAt', 'Created At', 22], ['updatedAt', 'Updated At', 22],
].map(([key, label, width]) => ({ key, label, width })));

export const PROCUREMENT_ITEM_COLUMNS = Object.freeze([
  ['project', 'Project', 18], ['poNumber', 'PO Number', 14], ['poRevision', 'PO Rev.', 10], ['poItem', 'PO Item', 10], ['vendor', 'Vendor', 34],
  ['materialCode', 'Material Code', 18], ['traceability', 'Traceability', 22], ['identCode', 'IDENT CODE', 22],
  ['drawback', 'DRAWBACK', 12], ['equipmentDestination', 'Equipment Destination', 30], ['task', 'TASK', 34], ['itemClassification', 'Item Classification', 22], ['itemType', 'Item Type', 18],
  ['description', 'Item Description', 64], ['diameterOdMm', 'Diameter O.D. [mm]', 18], ['thicknessMm', 'Thickness [mm]', 16],
  ['materialGrade', 'Material Grade', 18], ['lengthArea', 'Length/Area', 14], ['lengthAreaUnit', 'Length/Area Unit', 16],
  ['ordered', 'PO Quantity', 14], ['unit', 'PO Unit', 10], ['unitPrice', 'Unit Price', 14], ['contractualDeliveryDate', 'Contractual Delivery', 18],
  ['expectedDeliveryDate', 'Expected Delivery', 18], ['received', 'Received', 14], ['arrivalPercent', 'Arrival %', 12, '0.0%'],
  ['accepted', 'Accepted', 14], ['hold', 'HOLD', 12], ['rejected', 'Rejected', 12], ['available', 'Available', 14],
  ['reserved', 'Reserved', 14], ['issued', 'Issued', 12], ['consumed', 'Consumed', 14], ['returned', 'Returned', 14],
  ['pending', 'Pending Arrival', 16], ['inspectionPending', 'Pending QC', 14], ['itemStatus', 'Item Status', 22],
  ['sourceFileName', 'Source File', 30], ['createdAt', 'Created At', 22], ['updatedAt', 'Updated At', 22],
].map(([key, label, width, format]) => ({ key, label, width, format })));

export const PROCUREMENT_RECEIPT_COLUMNS = Object.freeze([
  ['project', 'Project', 18], ['poNumber', 'PO Number', 14], ['poItem', 'PO Item', 10], ['itemDescription', 'Material Description', 48], ['identCode', 'IDENT CODE', 22], ['vendor', 'Vendor', 34],
  ['receiptNumber', 'Receipt Number', 18], ['receiptStatus', 'Receipt Status', 20], ['arrivalDate', 'Arrival Date', 14],
  ['invoiceNumber', 'Invoice / NF', 18], ['deliveryNoteNumber', 'Delivery Note', 18], ['packingListNumber', 'Packing List', 18],
  ['warehouse', 'Warehouse', 18], ['receivedQuantity', 'Received Qty', 14], ['unit', 'Unit', 10], ['heatNumber', 'Heat Number', 18],
  ['supplierBatchNumber', 'Supplier Batch', 18], ['inspectionStatus', 'QC Status', 16], ['visualCondition', 'Visual Condition', 18],
  ['visualCheck', 'Visual OK', 12], ['markingCheck', 'Marking OK', 12], ['documentsCheck', 'Docs OK', 12], ['quantityCheck', 'Qty OK', 12],
  ['remarks', 'Remarks', 36], ['createdAt', 'Created At', 22], ['updatedAt', 'Updated At', 22],
].map(([key, label, width]) => ({ key, label, width })));

export const PROCUREMENT_UNIT_COLUMNS = Object.freeze([
  ['project', 'Project', 18], ['poNumber', 'PO Number', 14], ['poItem', 'PO Item', 10], ['itemDescription', 'Material Description', 48], ['identCode', 'IDENT CODE', 22], ['receiptNumber', 'Receipt Number', 18],
  ['vendor', 'Supplier', 34], ['manufacturer', 'Manufacturer', 34], ['traceability', 'Physical Traceability', 24], ['heatNumber', 'Heat Number', 18],
  ['quantity', 'Quantity', 14], ['unit', 'Unit', 10], ['diameterMm', 'Diameter [mm]', 16], ['lengthMm', 'Length [mm]', 16],
  ['widthMm', 'Width [mm]', 16], ['thicknessMm', 'Thickness [mm]', 16], ['weightKg', 'Weight [kg]', 14],
  ['inspectionStatus', 'QC Status', 16], ['inventoryStatus', 'Inventory Status', 18], ['postingStatus', 'Posting Status', 18],
  ['storageLocation', 'Storage Location', 22], ['inventoryReference', 'Inventory Reference', 24], ['postedAt', 'Posted At', 22], ['postedBy', 'Posted By', 22],
  ['createdAt', 'Created At', 22], ['updatedAt', 'Updated At', 22],
].map(([key, label, width]) => ({ key, label, width })));

export const PROCUREMENT_REVISION_COLUMNS = Object.freeze([
  ['project', 'Project', 18], ['poNumber', 'PO Number', 14], ['vendor', 'Vendor', 34], ['subject', 'Subject / Task', 42], ['revision', 'Revision', 10], ['issueDate', 'Issue Date', 14],
  ['isCurrent', 'Current Revision', 16], ['documentReference', 'Document Reference', 28], ['supersedesRevision', 'Supersedes Revision', 20],
  ['createdAt', 'Created At', 22], ['updatedAt', 'Updated At', 22],
].map(([key, label, width]) => ({ key, label, width })));

export const PROCUREMENT_PROGRESS_COLUMNS = Object.freeze([
  ['project', 'Project', 18], ['poNumber', 'PO Number', 14], ['revision', 'PO Rev.', 10], ['vendor', 'Vendor', 34],
  ['subject', 'Subject / Task', 42], ['orderDate', 'PO Doc. Date', 14], ['unit', 'Unit', 10], ['itemCount', 'Items', 10],
  ['ordered', 'Ordered', 14], ['received', 'Received', 14], ['arrivalPercent', 'Arrival %', 12, '0.0%'],
  ['pending', 'Missing Arrival', 16], ['pendingPercent', 'Missing %', 12, '0.0%'], ['accepted', 'Accepted', 14],
  ['hold', 'HOLD', 12], ['rejected', 'Rejected', 12], ['available', 'Available', 14], ['reserved', 'Reserved', 14],
  ['issued', 'Issued', 12], ['consumed', 'Consumed', 14], ['consumedPercent', 'Consumed %', 12, '0.0%'],
  ['returned', 'Returned', 14], ['status', 'PO Status', 22],
].map(([key, label, width, format]) => ({ key, label, width, format })));

function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function ratio(value, total) { return total > 0 ? value / total : 0; }
function organizationName(organization) { return organization?.tradeName || organization?.legalName || ''; }
function projectName(project) { return project?.shortCode || project?.name || project?.code || ''; }
function isInternalUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)); }
function operationalReference(value) { const reference = text(value); return isInternalUuid(reference) ? '' : reference; }
function inventoryReference(inventoryItem, unit) {
  return operationalReference(inventoryItem?.traceability || inventoryItem?.trace || inventoryItem?.materialNumber
    || inventoryItem?.tagNumber || inventoryItem?.name || unit?.traceability);
}

function createExportScope(data = {}, filters = {}) {
  const purchaseOrders = (data.purchaseOrders || []).filter((po) => (!filters.projectId || po.projectId === filters.projectId)
    && (!filters.purchaseOrderId || po.id === filters.purchaseOrderId));
  const poIds = new Set(purchaseOrders.map((po) => po.id));
  const items = (data.items || []).filter((item) => poIds.has(item.purchaseOrderId));
  const receipts = (data.receipts || []).filter((receipt) => !filters.projectId || receipt.projectId === filters.projectId);
  const receiptIds = new Set(receipts.map((receipt) => receipt.id));
  const receiptLines = (data.receiptLines || []).filter((line) => receiptIds.has(line.receiptId) && poIds.has(line.purchaseOrderId));
  const lineIds = new Set(receiptLines.map((line) => line.id));
  const itemIds = new Set(items.map((item) => item.id));
  const materialUnits = (data.materialUnits || []).filter((unit) => itemIds.has(unit.poItemId) && lineIds.has(unit.receiptLineId));
  const metricsByItem = new Map(items.map((item) => [item.id, calculatePoItemMetrics({
    item, receipts, receiptLines, materialUnits, inventoryItems: data.inventoryItems || [], reservations: data.reservations || [], stockMovements: data.stockMovements || [],
  })]));
  return { ...data, purchaseOrders, items, receipts, receiptLines, materialUnits, metricsByItem };
}

function lookups(scope) {
  return {
    projects: new Map((scope.projects || []).map((record) => [record.id, record])),
    organizations: new Map((scope.organizations || []).map((record) => [record.id, record])),
    purchaseOrders: new Map(scope.purchaseOrders.map((record) => [record.id, record])),
    items: new Map(scope.items.map((record) => [record.id, record])),
    receipts: new Map(scope.receipts.map((record) => [record.id, record])),
    receiptLines: new Map(scope.receiptLines.map((record) => [record.id, record])),
    revisions: new Map((scope.revisions || []).map((record) => [record.id, record])),
    inventoryItems: new Map((scope.inventoryItems || []).flatMap((record) => [record.id, record.trace, record.traceability]
      .map(text).filter(Boolean).map((reference) => [reference, record]))),
  };
}

function metricsFields(metrics) {
  return Object.fromEntries([...QUANTITY_KEYS, 'inspectionPending'].map((key) => [key, number(metrics?.[key])]));
}

export function buildPurchaseOrderExportData(data = {}, filters = {}) {
  const scope = createExportScope(data, filters); const maps = lookups(scope);
  const poRows = scope.purchaseOrders.map((po) => {
    const project = maps.projects.get(po.projectId); const supplier = maps.organizations.get(po.supplierId);
    const poItems = scope.items.filter((item) => item.purchaseOrderId === po.id);
    return {
      project: projectName(project), poNumber: po.poNumber, revision: po.currentRevision, vendorCode: supplier?.vendorCode || '',
      vendorName: organizationName(supplier), subject: po.subject, orderDate: po.orderDate, status: derivePurchaseOrderStatus(poItems, scope.metricsByItem, po.status),
      currency: po.currency, sourceSystem: po.sourceSystem, buyerName: po.buyerName, procurementOffice: po.procurementOffice,
      itemCount: poItems.length, units: [...new Set(poItems.map((item) => item.unitOfMeasure).filter(Boolean))].join(', '), createdAt: po.createdAt, updatedAt: po.updatedAt,
    };
  });
  const itemRows = scope.items.map((item) => {
    const po = maps.purchaseOrders.get(item.purchaseOrderId); const supplier = maps.organizations.get(po?.supplierId); const metrics = scope.metricsByItem.get(item.id) || {};
    return {
      project: projectName(maps.projects.get(item.projectId)), vendor: organizationName(supplier), poNumber: po?.poNumber || '', poRevision: po?.currentRevision || '',
      poItem: item.itemNumber, materialCode: item.materialCode, traceability: item.traceability, identCode: item.identCode, drawback: item.drawback,
      equipmentDestination: item.equipmentDestination, task: item.task || po?.subject || '', itemClassification: item.itemClassification || item.materialCategory, itemType: item.itemType,
      description: item.description, diameterOdMm: item.diameterOdMm, thicknessMm: item.thicknessMm, materialGrade: item.materialGrade,
      lengthArea: item.lengthArea, lengthAreaUnit: item.lengthAreaUnit, ...metricsFields(metrics), arrivalPercent: ratio(number(metrics.received), number(metrics.ordered)),
      unit: item.unitOfMeasure, unitPrice: item.unitPrice, contractualDeliveryDate: item.contractualDeliveryDate,
      expectedDeliveryDate: item.expectedDeliveryDate, itemStatus: item.status, sourceFileName: item.sourceFileName, createdAt: item.createdAt, updatedAt: item.updatedAt,
    };
  });
  const receiptRows = scope.receiptLines.map((line) => {
    const receipt = maps.receipts.get(line.receiptId); const po = maps.purchaseOrders.get(line.purchaseOrderId); const item = maps.items.get(line.poItemId);
    return {
      project: projectName(maps.projects.get(receipt?.projectId)), poNumber: po?.poNumber || '', poItem: item?.itemNumber || '',
      itemDescription: item?.description || '', identCode: item?.identCode || '',
      vendor: organizationName(maps.organizations.get(receipt?.supplierId)), receiptNumber: receipt?.receiptNumber || '', receiptStatus: receipt?.status || '',
      arrivalDate: receipt?.arrivalDate || '', invoiceNumber: receipt?.invoiceNumber || '', deliveryNoteNumber: receipt?.deliveryNoteNumber || '',
      packingListNumber: receipt?.packingListNumber || '', warehouse: operationalReference(receipt?.warehouseId), receivedQuantity: line.receivedQuantity,
      unit: line.unitOfMeasure, heatNumber: line.heatNumber, supplierBatchNumber: line.supplierBatchNumber, inspectionStatus: line.inspectionStatus,
      visualCondition: line.visualCondition, visualCheck: line.visualCheck, markingCheck: line.markingCheck, documentsCheck: line.documentsCheck,
      quantityCheck: line.quantityCheck, remarks: line.remarks, createdAt: line.createdAt, updatedAt: line.updatedAt,
    };
  });
  const materialUnitRows = scope.materialUnits.map((unit) => {
    const line = maps.receiptLines.get(unit.receiptLineId); const receipt = maps.receipts.get(line?.receiptId); const po = maps.purchaseOrders.get(line?.purchaseOrderId); const item = maps.items.get(unit.poItemId);
    const inventoryItem = maps.inventoryItems.get(text(unit.inventoryItemId));
    return {
      project: projectName(maps.projects.get(unit.projectId)), poNumber: po?.poNumber || '', poItem: item?.itemNumber || '', receiptNumber: receipt?.receiptNumber || '',
      itemDescription: item?.description || '', identCode: item?.identCode || '',
      vendor: organizationName(maps.organizations.get(unit.supplierId)), manufacturer: organizationName(maps.organizations.get(unit.manufacturerId)),
      traceability: unit.traceability, heatNumber: unit.heatNumber, quantity: unit.quantity, unit: unit.unitOfMeasure,
      diameterMm: unit.originalDiameterMm, lengthMm: unit.originalLengthMm, widthMm: unit.originalWidthMm, thicknessMm: unit.originalThicknessMm,
      weightKg: unit.weightKg, inspectionStatus: unit.inspectionStatus, inventoryStatus: unit.inventoryStatus, postingStatus: unit.postingStatus,
      storageLocation: operationalReference(unit.storageLocationId), inventoryReference: inventoryReference(inventoryItem, unit),
      postedAt: unit.postedAt, postedBy: operationalReference(unit.postedBy),
      createdAt: unit.createdAt, updatedAt: unit.updatedAt,
    };
  });
  const revisionRows = (scope.revisions || []).filter((revision) => scope.purchaseOrders.some((po) => po.id === revision.purchaseOrderId)).map((revision) => {
    const po = maps.purchaseOrders.get(revision.purchaseOrderId);
    const superseded = maps.revisions.get(revision.supersedesRevisionId);
    return { project: projectName(maps.projects.get(po?.projectId)), poNumber: po?.poNumber || '',
      vendor: organizationName(maps.organizations.get(po?.supplierId)), subject: po?.subject || '', revision: revision.revision, issueDate: revision.issueDate,
      isCurrent: revision.isCurrent ? 'YES' : 'NO', documentReference: operationalReference(revision.documentRevisionId), supersedesRevision: superseded?.revision || '',
      createdAt: revision.createdAt, updatedAt: revision.updatedAt };
  });
  return { poRows, itemRows, receiptRows, materialUnitRows, revisionRows };
}

export function buildPurchaseOrderProgressExportData(data = {}, filters = {}) {
  const scope = createExportScope(data, filters); const maps = lookups(scope); const progressRows = [];
  scope.purchaseOrders.forEach((po) => {
    const poItems = scope.items.filter((item) => item.purchaseOrderId === po.id); const unitGroups = Map.groupBy
      ? Map.groupBy(poItems, (item) => text(item.unitOfMeasure).toUpperCase() || 'N/A')
      : poItems.reduce((groups, item) => { const key = text(item.unitOfMeasure).toUpperCase() || 'N/A'; groups.set(key, [...(groups.get(key) || []), item]); return groups; }, new Map());
    unitGroups.forEach((groupItems, unit) => {
      const totals = Object.fromEntries(QUANTITY_KEYS.map((key) => [key, groupItems.reduce((sum, item) => sum + number(scope.metricsByItem.get(item.id)?.[key]), 0)]));
      progressRows.push({
        project: projectName(maps.projects.get(po.projectId)), poNumber: po.poNumber, revision: po.currentRevision,
        vendor: organizationName(maps.organizations.get(po.supplierId)), subject: po.subject, orderDate: po.orderDate, unit, itemCount: groupItems.length,
        ...totals, arrivalPercent: ratio(totals.received, totals.ordered), pendingPercent: ratio(totals.pending, totals.ordered),
        consumedPercent: ratio(totals.consumed, totals.ordered), status: derivePurchaseOrderStatus(poItems, scope.metricsByItem, po.status),
      });
    });
  });
  const itemRows = buildPurchaseOrderExportData(data, filters).itemRows;
  return { progressRows, itemRows };
}
