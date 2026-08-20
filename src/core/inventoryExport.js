import { inventoryReservationAvailability } from './materialCouponReservation.js';
import { buildPurchaseOrderExportData } from './procurementExport.js';

function columns(definitions) {
  return Object.freeze(definitions.map(([key, label, width, format]) => ({ key, label, width, format })));
}

export const INVENTORY_REGISTER_COLUMNS = columns([
  ['project', 'Project', 18], ['traceability', 'Traceability', 24], ['vendor', 'Vendor / Supplier', 34], ['poItemPo', 'PO - Item PO', 18],
  ['category', 'Category', 22], ['materialDescription', 'Material Description', 64], ['materialClassification', 'Material Classification', 24],
  ['thicknessMm', 'Thk (mm)', 14], ['diameterMm', 'Dia. (OD) (mm)', 16], ['widthMm', 'Width (mm)', 14], ['lengthMm', 'Length (mm)', 14],
  ['unit', 'Unit of Measure', 16], ['weightKg', 'Total Weight (KG)', 18], ['entryInvoice', 'Entry Invoice [NF]', 20],
  ['receivedDate', 'Received Date', 16], ['mrr', 'MRR', 20], ['poSubject', 'PO Subject / Chrono Number', 42], ['poNumber', 'PO Number', 16],
  ['poItem', 'PO Item #', 12], ['sapCode', 'SAP Code', 18], ['identCode', 'IDENT CODE', 22], ['regime', 'Regime', 18],
  ['partNumber', 'Part Number', 20], ['serialNumber', 'Serial Number', 20], ['mtcNumber', 'MTC Number [Certificate]', 26], ['heatNumber', 'Heat Number', 20],
  ['materialGrade', 'Material & Grade', 24], ['mirNumber', 'MIR Number', 20], ['inspectionStatus', 'Inspection Status', 18],
  ['acceptanceStatus', 'Acceptance Status', 18], ['colorCode', 'Color Code', 16], ['storageLocation', 'Storage Location', 24],
  ['locationZone', 'Location Zone', 18], ['equipment', 'Equipment Designation', 30], ['totalPoQty', 'Total PO Qty', 16],
  ['receivedQty', 'Received Qty', 16], ['issuedQty', 'Issued Mat. Qty', 16], ['reservedQty', 'Reserved Qty', 14], ['balanceQty', 'Balance Qty', 14],
  ['materialCouponNo', 'Material Coupon No.', 26], ['lastExitDate', 'Last Exit / Movement Date', 24], ['exitInvoice', 'Exit Invoice [NF]', 20],
  ['rmvNo', 'RMV No.', 22], ['availability', 'Disponibilidade', 18], ['availabilityReason', 'Availability Reason', 30], ['status', 'Inventory Status', 18],
  ['comments', 'Comments', 42], ['inventoryItemId', 'Inventory Item ID', 38], ['materialUnitId', 'Material Unit ID', 38], ['parentStockId', 'Parent Stock ID', 38],
]);

export const INVENTORY_MOVEMENT_COLUMNS = columns([
  ['timestamp', 'Movement Date / Time', 24], ['movementType', 'Movement Type', 24], ['project', 'Project', 18], ['traceability', 'Traceability', 24],
  ['quantityDelta', 'Qty Delta', 14], ['lengthDelta', 'Length Delta [mm]', 18], ['unit', 'Unit', 10], ['previousStatus', 'Previous Status', 18],
  ['nextStatus', 'Next Status', 18], ['sourceDocumentType', 'Source Document Type', 24], ['sourceDocumentNumber', 'Source Document No.', 26],
  ['materialCouponNo', 'Material Coupon No.', 26], ['cuttingSheetNo', 'Cutting Sheet No.', 24], ['rmvNo', 'RMV No.', 22], ['workpack', 'Workpack', 20],
  ['drawing', 'Drawing Number', 28], ['mark', 'Mark', 16], ['position', 'Position', 16], ['equipment', 'Equipment', 30], ['equipmentTag', 'Equipment Tag', 22],
  ['fabricationLinkSource', 'Fabrication Link Source', 30], ['userName', 'User', 22], ['reason', 'Reason', 42], ['inventoryItemId', 'Inventory Item ID', 38],
  ['movementId', 'Movement ID', 38],
]);

export const INVENTORY_SUMMARY_UNIT_COLUMNS = columns([
  ['unit', 'Unit', 12], ['poItems', 'PO Items', 12], ['ordered', 'Ordered', 16], ['received', 'Received', 16], ['missing', 'Missing Arrival', 18],
  ['arrivalPercent', 'Arrival %', 14, '0.0%'], ['traceabilities', 'Traceabilities', 16], ['availableQty', 'Available Qty', 16],
  ['reservedQty', 'Reserved Qty', 16], ['issuedQty', 'Issued Qty', 16], ['balanceQty', 'Balance Qty', 16], ['weightKg', 'Inventory Weight [kg]', 22],
]);

export const INVENTORY_PENDING_ARRIVAL_COLUMNS = columns([
  ['project', 'Project', 18], ['vendor', 'Vendor', 34], ['poNumber', 'PO Number', 16], ['poItem', 'PO Item', 12], ['materialCode', 'SAP / Material Code', 22],
  ['identCode', 'IDENT CODE', 22], ['description', 'Material Description', 64], ['classification', 'Classification', 24], ['materialGrade', 'Material Grade', 22],
  ['ordered', 'Ordered Qty', 16], ['received', 'Received Qty', 16], ['missing', 'Missing Qty', 16], ['unit', 'Unit', 10], ['arrivalPercent', 'Arrival %', 14, '0.0%'],
  ['contractualDeliveryDate', 'Contractual Delivery', 20], ['expectedDeliveryDate', 'Expected Delivery', 18], ['daysOverdue', 'Days Overdue', 16],
  ['arrivalStatus', 'Arrival Status', 18], ['poStatus', 'PO Status', 20], ['poSubject', 'PO Subject / Chrono Number', 42],
]);

function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function array(value) { return Array.isArray(value) ? value : []; }
function normalized(value) { return text(value).toLowerCase(); }
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function joined(values) { return unique(values).join(', '); }
function projectName(project = {}) { return project.shortCode || project.name || project.code || project.id || ''; }
function organizationName(organization = {}) { return organization.tradeName || organization.legalName || organization.name || ''; }
function ratio(value, total) { return total > 0 ? value / total : 0; }

function mapById(records = []) {
  return new Map(array(records).map((record) => [text(record?.id), record]).filter(([id]) => id));
}

function inventoryAliases(item = {}) {
  return new Set(unique([item.id, item.trace, item.traceability]));
}

function aliasMatches(aliases, ...values) {
  return values.some((value) => aliases.has(text(value)));
}

function couponPayload(coupon = {}) {
  return coupon.metadata?.coupon && typeof coupon.metadata.coupon === 'object' ? coupon.metadata.coupon : coupon;
}

function couponNumber(coupon = {}) {
  const payload = couponPayload(coupon);
  return text(coupon.number || payload.header?.mcCode || payload.number);
}

function couponLines(coupon = {}) {
  const payload = couponPayload(coupon);
  return array(payload.lines).length ? array(payload.lines) : array(coupon.items);
}

function lineMatchesAliases(line = {}, aliases) {
  return aliasMatches(aliases, line.inventoryItemId, line.inventoryId, line.stockId, line.traceability, line.trace);
}

function workpackIdForCoupon(coupon = {}) {
  const payload = couponPayload(coupon);
  return text(coupon.workpackId || payload.links?.workpackId || payload.workpackId);
}

function cuttingSheetPieces(sheet = {}, aliases) {
  return array(sheet.bars).flatMap((bar) => {
    const barMatches = aliasMatches(aliases, bar.inventoryItemId, bar.inventoryId, bar.stockId, bar.traceability, bar.trace);
    return barMatches ? array(bar.pieces).map((piece) => ({ bar, piece })) : [];
  });
}

function linkedDrawingNumbers(workpackId, data, maps) {
  if (!workpackId) return [];
  const drawingIds = new Set(array(data.workpackLinks)
    .filter((link) => text(link.workpackId) === workpackId
      && text(link.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
      && text(link.targetType).toUpperCase() === 'DRAWING_REVISION')
    .map((link) => text(link.targetId)));
  return array(data.drawings)
    .filter((drawing) => drawingIds.has(text(drawing.id)) || text(drawing.workpackId) === workpackId)
    .map((drawing) => drawing.drawingNo);
}

function materialContext(item, movement, data, maps) {
  const aliases = inventoryAliases(item);
  const sourceId = text(movement?.sourceDocumentId);
  const directCoupon = maps.coupons.get(sourceId);
  const directSheet = maps.cuttingSheets.get(sourceId);
  const directRmv = maps.rmvs.get(sourceId);
  const linkedSheet = directRmv ? maps.cuttingSheets.get(text(directRmv.cuttingSheetId)) : null;
  const couponFromDocument = directSheet?.materialCouponId ? maps.coupons.get(text(directSheet.materialCouponId))
    : directRmv?.materialCouponId ? maps.coupons.get(text(directRmv.materialCouponId))
      : linkedSheet?.materialCouponId ? maps.coupons.get(text(linkedSheet.materialCouponId)) : null;
  const matchingCoupons = array(data.materialCoupons).filter((coupon) => couponLines(coupon).some((line) => lineMatchesAliases(line, aliases)));
  const coupons = unique([directCoupon?.id, couponFromDocument?.id, ...matchingCoupons.map((coupon) => coupon.id)])
    .map((id) => maps.coupons.get(id)).filter(Boolean);
  const matchingLines = coupons.flatMap((coupon) => couponLines(coupon)
    .filter((line) => lineMatchesAliases(line, aliases)).map((line) => ({ coupon, line })));
  const sheets = unique([
    directSheet?.id,
    linkedSheet?.id,
    ...array(data.cuttingSheets).filter((sheet) => coupons.some((coupon) => text(sheet.materialCouponId) === text(coupon.id))
      || cuttingSheetPieces(sheet, aliases).length).map((sheet) => sheet.id),
  ]).map((id) => maps.cuttingSheets.get(id)).filter(Boolean);
  const pieces = sheets.flatMap((sheet) => cuttingSheetPieces(sheet, aliases).map((entry) => ({ sheet, ...entry })));
  const workpackIds = unique([
    movement?.metadata?.workpackId,
    ...coupons.map(workpackIdForCoupon),
    ...sheets.map((sheet) => sheet.workpackId),
    directRmv?.workpackId,
  ]);
  const workpacks = workpackIds.map((id) => maps.workpacks.get(id)).filter(Boolean);
  const equipments = unique(workpacks.map((workpack) => workpack.equipmentId)).map((id) => maps.equipments.get(id)).filter(Boolean);
  const exactTags = matchingLines.flatMap(({ line }) => [line.tag, line.equipmentTag])
    .concat(pieces.flatMap(({ piece }) => [piece.tag, piece.equipmentTag]));
  const singleEquipmentTags = equipments.flatMap((equipment) => {
    const tags = unique([...(array(equipment.equipmentTags)), equipment.clientTag]);
    return tags.length === 1 ? tags : [];
  });
  const lineDrawings = matchingLines.flatMap(({ line }) => [line.drawing, line.drawingNo, line.dwgNumber, line.drawingUse]);
  const pieceDrawings = pieces.flatMap(({ piece }) => [piece.drawing, piece.drawingNo, piece.dwgNumber, piece.drawingUse]);
  const linkedDrawings = workpackIds.flatMap((id) => linkedDrawingNumbers(id, data, maps));
  const sources = [];
  if (matchingLines.length) sources.push('MATERIAL_COUPON_LINE');
  if (pieces.length) sources.push('CUTTING_SHEET_PIECE');
  if (workpacks.length) sources.push('WORKPACK');
  if (!sources.length && text(item.equipment)) sources.push('INVENTORY');
  return {
    coupons,
    sheets,
    rmvs: directRmv ? [directRmv] : [],
    workpack: joined(workpacks.map((workpack) => workpack.wpNo || workpack.title || workpack.id)),
    drawing: joined([...lineDrawings, ...pieceDrawings, ...linkedDrawings]),
    mark: joined([
      ...matchingLines.map(({ line }) => line.mark),
      ...pieces.map(({ piece }) => piece.mark),
    ]),
    position: joined([
      ...matchingLines.flatMap(({ line }) => [line.pos, line.position]),
      ...pieces.flatMap(({ piece }) => [piece.pos, piece.position]),
    ]),
    equipment: joined([
      ...matchingLines.map(({ line }) => line.equipment),
      ...pieces.map(({ piece }) => piece.equipment),
      ...workpacks.map((workpack) => workpack.equipmentName),
      ...equipments.map((equipment) => equipment.equipmentName || equipment.name),
      item.equipment,
    ]),
    equipmentTag: joined(exactTags.length ? exactTags : singleEquipmentTags),
    source: joined(sources),
  };
}

function createMaps(data = {}) {
  return {
    projects: mapById(data.projects), organizations: mapById(data.organizations), purchaseOrders: mapById(data.purchaseOrders),
    poItems: mapById(data.items), receipts: mapById(data.receipts), receiptLines: mapById(data.receiptLines), materialUnits: mapById(data.materialUnits),
    inventory: mapById(data.inventoryItems), movements: mapById(data.stockMovements), coupons: mapById(data.materialCoupons),
    cuttingSheets: mapById(data.cuttingSheets), rmvs: mapById(data.returnMaterialVouchers), workpacks: mapById(data.workpacks),
    drawings: mapById(data.drawings), equipments: mapById(data.equipments),
  };
}

function findInventoryItem(movement, data) {
  const target = text(movement.inventoryItemId);
  return array(data.inventoryItems).find((item) => inventoryAliases(item).has(target))
    || movement.after || movement.before || { id: target, traceability: target, projectId: movement.projectId };
}

function findMaterialUnit(item, data) {
  const aliases = inventoryAliases(item);
  const metadataId = text(item.metadata?.materialUnitId);
  return array(data.materialUnits).find((unit) => aliasMatches(aliases, unit.inventoryItemId))
    || (metadataId ? array(data.materialUnits).find((unit) => text(unit.id) === metadataId) : null)
    || array(data.materialUnits).find((unit) => text(unit.traceability) === text(item.traceability || item.trace)
      && (!item.projectId || !unit.projectId || text(unit.projectId) === text(item.projectId)))
    || null;
}

function procurementContext(item, data, maps, preferredUnit = null) {
  const unit = preferredUnit || findMaterialUnit(item, data);
  const line = maps.receiptLines.get(text(unit?.receiptLineId));
  const receipt = maps.receipts.get(text(line?.receiptId));
  let poItem = maps.poItems.get(text(unit?.poItemId || line?.poItemId));
  let po = maps.purchaseOrders.get(text(line?.purchaseOrderId || poItem?.purchaseOrderId));
  if (!po && text(item.po)) po = array(data.purchaseOrders).find((record) => text(record.poNumber) === text(item.po)
    && (!item.projectId || !record.projectId || text(record.projectId) === text(item.projectId)));
  if (!poItem && po && text(item.poItem)) poItem = array(data.items).find((record) => text(record.purchaseOrderId) === text(po.id)
    && text(record.itemNumber) === text(item.poItem));
  const supplierId = text(unit?.supplierId || receipt?.supplierId || po?.supplierId);
  return { unit, line, receipt, poItem, po, supplier: maps.organizations.get(supplierId) };
}

function movementsForItem(item, data) {
  const aliases = inventoryAliases(item);
  return array(data.stockMovements).filter((movement) => aliasMatches(aliases, movement.inventoryItemId));
}

function rmvNumbersForItem(item, data) {
  const aliases = inventoryAliases(item);
  return array(data.returnMaterialVouchers).filter((rmv) => array(rmv.returnedItems).some((line) => aliasMatches(aliases,
    line.inventoryItemId, line.parentInventoryItemId, line.traceability, line.parentTraceability, line.parentStockId))).map((rmv) => rmv.number);
}

function documentContext(movement, maps) {
  const sourceId = text(movement.sourceDocumentId);
  const coupon = maps.coupons.get(sourceId);
  const sheet = maps.cuttingSheets.get(sourceId);
  const rmv = maps.rmvs.get(sourceId);
  const receiptLine = maps.receiptLines.get(sourceId);
  const receipt = maps.receipts.get(sourceId) || maps.receipts.get(text(receiptLine?.receiptId));
  return {
    sourceDocumentNumber: coupon ? couponNumber(coupon) : sheet?.number || rmv?.number || receipt?.receiptNumber || sourceId,
    materialCouponNo: coupon ? couponNumber(coupon) : '', cuttingSheetNo: sheet?.number || '', rmvNo: rmv?.number || '',
  };
}

function registerEntities(data, options) {
  const inventoryItems = array(data.inventoryItems);
  const usedInventoryIds = new Set();
  const entities = array(data.materialUnits)
    .filter((unit) => !options.projectId || text(unit.projectId) === text(options.projectId))
    .map((unit) => {
      const linkedId = text(unit.inventoryItemId);
      const inventoryItem = inventoryItems.find((item) => (linkedId && inventoryAliases(item).has(linkedId))
        || (text(item.traceability || item.trace) === text(unit.traceability)
          && (!item.projectId || !unit.projectId || text(item.projectId) === text(unit.projectId))));
      if (inventoryItem) usedInventoryIds.add(text(inventoryItem.id || inventoryItem.trace || inventoryItem.traceability));
      const item = inventoryItem || {
        id: '', projectId: unit.projectId, trace: unit.traceability, traceability: unit.traceability,
        status: text(unit.inventoryStatus || unit.postingStatus || 'PENDING_POSTING').toLowerCase(),
        inspectionStatus: unit.inspectionStatus, qualityStatus: unit.inspectionStatus, qty: unit.quantity,
        receivedQty: unit.quantity, balanceQty: 0, unit: unit.unitOfMeasure, weightKg: unit.weightKg,
        thicknessMm: unit.originalThicknessMm, diaMm: unit.originalDiameterMm, widthMm: unit.originalWidthMm,
        lengthMm: unit.originalLengthMm, location: unit.storageLocationId, metadata: { materialUnitId: unit.id },
      };
      return { item, unit };
    });
  inventoryItems
    .filter((item) => !options.projectId || text(item.projectId) === text(options.projectId))
    .filter((item) => !usedInventoryIds.has(text(item.id || item.trace || item.traceability)))
    .forEach((item) => entities.push({ item, unit: null }));
  return entities;
}

function buildRegisterRows(data, options, maps) {
  return registerEntities(data, options)
    .map(({ item, unit }) => {
      const context = procurementContext(item, data, maps, unit);
      const movements = movementsForItem(item, data);
      const material = materialContext(item, null, data, maps);
      const issueMovements = movements.filter((movement) => text(movement.movementType).toUpperCase() === 'ISSUE_MATERIAL');
      const lastExit = [...issueMovements].sort((a, b) => text(b.timestamp).localeCompare(text(a.timestamp)))[0];
      const availability = inventoryReservationAvailability(item);
      const projectId = text(item.projectId || context.unit?.projectId || context.po?.projectId);
      const receiptQuantity = context.unit ? number(context.unit.quantity) : number(item.receivedQty || item.qty);
      const issuedQuantity = item.issuedQty != null ? number(item.issuedQty)
        : issueMovements.reduce((sum, movement) => sum + Math.abs(Math.min(0, number(movement.quantityDelta))), 0);
      const couponNumbers = unique([item.materialCouponNo, ...material.coupons.map(couponNumber)]);
      return {
        project: projectName(maps.projects.get(projectId)), traceability: item.traceability || item.trace || item.id,
        vendor: item.vendor || organizationName(context.supplier), poItemPo: item.poItemPo || joined([context.po?.poNumber, context.poItem?.itemNumber]).replace(', ', '-'),
        category: item.category || context.poItem?.materialCategory || context.poItem?.itemType || '',
        materialDescription: item.materialDescription || context.poItem?.description || '',
        materialClassification: item.materialClassification || context.poItem?.itemClassification || '',
        thicknessMm: item.thicknessMm || context.unit?.originalThicknessMm || context.poItem?.thicknessMm || '',
        diameterMm: item.diaMm || context.unit?.originalDiameterMm || context.poItem?.diameterOdMm || '', widthMm: item.widthMm || context.unit?.originalWidthMm || '',
        lengthMm: item.lengthMm || context.unit?.originalLengthMm || '', unit: item.unit || context.unit?.unitOfMeasure || context.poItem?.unitOfMeasure || '',
        weightKg: number(item.weightKg || context.unit?.weightKg), entryInvoice: item.nfArrival || context.receipt?.invoiceNumber || '',
        receivedDate: item.receivedDate || context.receipt?.arrivalDate || '', mrr: item.mrr || context.receipt?.receiptNumber || '',
        poSubject: item.poSubject || context.po?.subject || '', poNumber: item.po || context.po?.poNumber || '', poItem: item.poItem || context.poItem?.itemNumber || '',
        sapCode: item.sapCode || context.poItem?.materialCode || '', identCode: item.identCode || context.poItem?.identCode || '', regime: item.regime || context.poItem?.drawback || '',
        partNumber: item.partNumber || '', serialNumber: item.serialNumber || '', mtcNumber: item.mtcNumber || '',
        heatNumber: item.heatNo || context.unit?.heatNumber || context.line?.heatNumber || '', materialGrade: item.materialGrade || context.poItem?.materialGrade || '',
        mirNumber: item.mir || '', inspectionStatus: item.inspectionStatus || context.unit?.inspectionStatus || context.line?.inspectionStatus || '',
        acceptanceStatus: item.acceptanceStatus || item.qualityStatus || '', colorCode: item.colorCode || '',
        storageLocation: item.location || context.unit?.storageLocationId || context.receipt?.warehouseId || '', locationZone: item.locationZone || '',
        equipment: material.equipment || item.equipment || context.poItem?.equipmentDestination || '', totalPoQty: number(item.totalPoQty || context.poItem?.orderedQuantity),
        receivedQty: receiptQuantity, issuedQty: issuedQuantity, reservedQty: number(item.reservedQty), balanceQty: number(item.balanceQty),
        materialCouponNo: joined(couponNumbers), lastExitDate: lastExit?.timestamp || item.exitDate || '', exitInvoice: item.exitInvoice || '',
        rmvNo: joined([item.rmvNo, ...rmvNumbersForItem(item, data)]), availability: availability.available ? 'Disponível' : 'Não disponível',
        availabilityReason: availability.code || '', status: item.status || '', comments: item.notes || '', inventoryItemId: item.id || item.trace || '',
        materialUnitId: context.unit?.id || '', parentStockId: item.parentStockId || item.parentInventoryItemId || item.parentInventoryId || '',
      };
    })
    .sort((a, b) => text(a.traceability).localeCompare(text(b.traceability)));
}

function buildMovementRows(data, options, maps) {
  return array(data.stockMovements)
    .filter((movement) => !options.projectId || text(movement.projectId) === text(options.projectId))
    .map((movement) => {
      const item = findInventoryItem(movement, data);
      const material = materialContext(item, movement, data, maps);
      const document = documentContext(movement, maps);
      const projectId = text(movement.projectId || item.projectId);
      return {
        timestamp: movement.timestamp || '', movementType: movement.movementType || '', project: projectName(maps.projects.get(projectId)),
        traceability: item.traceability || item.trace || movement.inventoryItemId || '', quantityDelta: number(movement.quantityDelta),
        lengthDelta: number(movement.lengthDelta), unit: item.unit || movement.after?.unit || movement.before?.unit || '',
        previousStatus: movement.previousStatus || '', nextStatus: movement.nextStatus || '', sourceDocumentType: movement.sourceDocumentType || '',
        sourceDocumentNumber: document.sourceDocumentNumber, materialCouponNo: document.materialCouponNo || joined(material.coupons.map(couponNumber)),
        cuttingSheetNo: document.cuttingSheetNo || joined(material.sheets.map((sheet) => sheet.number)),
        rmvNo: document.rmvNo || joined(material.rmvs.map((rmv) => rmv.number)), workpack: material.workpack,
        drawing: material.drawing, mark: material.mark, position: material.position, equipment: material.equipment,
        equipmentTag: material.equipmentTag, fabricationLinkSource: material.source, userName: movement.userName || '', reason: movement.reason || '',
        inventoryItemId: movement.inventoryItemId || item.id || '', movementId: movement.id || '',
      };
    })
    .sort((a, b) => text(a.timestamp).localeCompare(text(b.timestamp)) || text(a.movementId).localeCompare(text(b.movementId)));
}

function dayStart(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pendingArrivalRows(data, options) {
  const exported = buildPurchaseOrderExportData(data, options);
  const poById = mapById(data.purchaseOrders);
  const today = dayStart(options.now || new Date());
  return exported.itemRows.flatMap((row) => {
    const po = poById.get(text(row.purchaseOrderId));
    if (text(po?.status).toUpperCase() === 'CANCELLED' || text(row.itemStatus).toUpperCase() === 'CANCELLED' || number(row.pending) <= 0) return [];
    const dueDateText = row.expectedDeliveryDate || row.contractualDeliveryDate;
    const dueDate = dayStart(dueDateText);
    const daysOverdue = today && dueDate && today > dueDate ? Math.floor((today - dueDate) / 86400000) : 0;
    const baseStatus = number(row.received) > 0 ? 'PARTIAL' : 'NOT RECEIVED';
    return [{
      project: row.project, vendor: row.vendor, poNumber: row.poNumber, poItem: row.poItem, materialCode: row.materialCode,
      identCode: row.identCode, description: row.description, classification: row.itemClassification || row.itemType || '', materialGrade: row.materialGrade,
      ordered: number(row.ordered), received: number(row.received), missing: number(row.pending), unit: row.unit,
      arrivalPercent: ratio(number(row.received), number(row.ordered)), contractualDeliveryDate: row.contractualDeliveryDate,
      expectedDeliveryDate: row.expectedDeliveryDate, daysOverdue, arrivalStatus: daysOverdue > 0 ? 'OVERDUE' : baseStatus,
      poStatus: po?.status || '', poSubject: row.task || po?.subject || '',
    }];
  }).sort((a, b) => b.daysOverdue - a.daysOverdue || text(a.expectedDeliveryDate).localeCompare(text(b.expectedDeliveryDate)) || text(a.poNumber).localeCompare(text(b.poNumber)));
}

function summaryData(data, options, registerRows, pendingRows) {
  const exported = buildPurchaseOrderExportData(data, options);
  const poById = mapById(data.purchaseOrders);
  const activeItemRows = exported.itemRows.filter((row) => text(row.itemStatus).toUpperCase() !== 'CANCELLED'
    && text(poById.get(text(row.purchaseOrderId))?.status).toUpperCase() !== 'CANCELLED');
  const units = unique([...activeItemRows.map((row) => row.unit || 'N/A'), ...registerRows.map((row) => row.unit || 'N/A')]).sort();
  const unitRows = units.map((unit) => {
    const poRows = activeItemRows.filter((row) => text(row.unit || 'N/A') === unit);
    const inventoryRows = registerRows.filter((row) => text(row.unit || 'N/A') === unit);
    const ordered = poRows.reduce((sum, row) => sum + number(row.ordered), 0);
    const received = poRows.reduce((sum, row) => sum + number(row.received), 0);
    return {
      unit, poItems: poRows.length, ordered, received, missing: poRows.reduce((sum, row) => sum + number(row.pending), 0),
      arrivalPercent: ratio(received, ordered), traceabilities: inventoryRows.length,
      availableQty: inventoryRows.filter((row) => row.availability === 'Disponível').reduce((sum, row) => sum + number(row.balanceQty), 0),
      reservedQty: inventoryRows.reduce((sum, row) => sum + number(row.reservedQty), 0),
      issuedQty: inventoryRows.reduce((sum, row) => sum + number(row.issuedQty), 0),
      balanceQty: inventoryRows.reduce((sum, row) => sum + number(row.balanceQty), 0),
      weightKg: inventoryRows.reduce((sum, row) => sum + number(row.weightKg), 0),
    };
  });
  const overdueItems = pendingRows.filter((row) => row.arrivalStatus === 'OVERDUE').length;
  const kpis = [
    { metric: 'Inventory traceabilities', value: registerRows.length },
    { metric: 'Available traceabilities', value: registerRows.filter((row) => row.availability === 'Disponível').length },
    { metric: 'Recorded movements', value: array(data.stockMovements).filter((movement) => !options.projectId || text(movement.projectId) === text(options.projectId)).length },
    { metric: 'Active PO items', value: activeItemRows.length },
    { metric: 'Complete PO items', value: activeItemRows.filter((row) => number(row.pending) <= 0).length },
    { metric: 'Partially received PO items', value: activeItemRows.filter((row) => number(row.received) > 0 && number(row.pending) > 0).length },
    { metric: 'PO items not received', value: activeItemRows.filter((row) => number(row.received) <= 0 && number(row.pending) > 0).length },
    { metric: 'PO items pending arrival', value: pendingRows.length },
    { metric: 'Overdue PO items', value: overdueItems },
  ];
  return { kpis, unitRows };
}

export function buildInventoryExportData(data = {}, options = {}) {
  const maps = createMaps(data);
  const registerRows = buildRegisterRows(data, options, maps);
  const movementRows = buildMovementRows(data, options, maps);
  const pendingRows = pendingArrivalRows(data, options);
  return {
    registerRows,
    movementRows,
    summary: summaryData(data, options, registerRows, pendingRows),
    pendingArrivalRows: pendingRows,
  };
}
