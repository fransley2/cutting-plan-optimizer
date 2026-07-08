export const MATERIAL_COUPON_EXTRACT_COLUMNS = Object.freeze([
  { key: 'mcCode', label: 'MC Code:' },
  { key: 'mcRevision', label: 'MC Rev.' },
  { key: 'materialDestination', label: 'Mat. Destination:' },
  { key: 'mcDate', label: 'MC Date:' },
  { key: 'serialNumber', label: 'Material Coupon S/N.' },
  { key: 'sapCode', label: 'SAP Code' },
  { key: 'itemType', label: 'Item Type' },
  { key: 'materialDescription', label: 'Material Description' },
  { key: 'qty', label: 'Qty' },
  { key: 'unit', label: 'Un.' },
  { key: 'diaMm', label: 'Dia\n[mm]' },
  { key: 'thicknessMm', label: 'Thickness\n[mm]' },
  { key: 'widthMm', label: 'Width\n[mm]' },
  { key: 'lengthMm', label: 'Length\n[mm]' },
  { key: 'weightKg', label: 'Weight\n[Kg]' },
  { key: 'materialGrade', label: 'Mat. Grade' },
  { key: 'traceability', label: 'Traceability' },
  { key: 'heatNo', label: 'Heat No.' },
  { key: 'mir', label: 'MIR' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'poItem', label: '[po-item]' },
  { key: 'nfArrival', label: 'NF arrival' },
  { key: 'notes', label: 'Notes' },
  { key: 'materialProject', label: 'Mat. Project' },
  { key: 'totalSurfaceM2', label: 'Total Surf.\n[m2]' },
  { key: 'po', label: 'PO' },
  { key: 'poItemNumber', label: 'PO Item #' },
  { key: 'mcIssuingResponsible', label: 'MC Issuing Responsible' },
  { key: 'materialDispatchResponsible', label: 'Material Dispatch Responsible' },
  { key: 'materialReceivingResponsible', label: 'Material Receiving Responsible' },
  { key: 'remarksNotes', label: 'REMARKS / NOTES' },
  { key: 'classOfMaterial', label: 'Class of Material' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'dispatchNfInvoice', label: 'Dispatch NF (invoice)' },
  { key: 'statusMaterial', label: 'Status Material' },
  { key: 'receivedDate', label: 'Received Date' },
  { key: 'receivedSignature', label: 'Received Signature' },
  { key: 'workpack', label: 'Workpack' },
  { key: 'drawingUse', label: 'Drawing Use' },
  { key: 'uploadInFms', label: 'Upload in FMS' },
  { key: 'fmsMwcProcess', label: 'FMS MWC Process' },
  { key: 'fmsTrackNumber', label: 'FMS Track Number' },
  { key: 'mpcCode', label: 'MPC Code' },
  { key: 'rmvCode', label: 'RMV Code' },
  { key: 'local', label: 'Local' },
  { key: 'returnedQty', label: 'Returned Qty' },
  { key: 'returnedWidthMm', label: 'Returned Width [mm]' },
  { key: 'returnedLengthMm', label: 'Returned Lenght [mm]' },
  { key: 'nesting', label: 'Nesting' },
  { key: 'drawback', label: 'DRAWBACK' },
]);

const DOCUMENT_COLUMNS = Object.freeze([
  { key: 'serialNumber', label: 'S/N.' },
  { key: 'sapCode', label: 'SAP Code' },
  { key: 'itemType', label: 'Item Category' },
  { key: 'materialDescription', label: 'Material Description' },
  { key: 'qty', label: 'Qty' },
  { key: 'unit', label: 'Un.' },
  { key: 'diaMm', label: 'Dia [mm]' },
  { key: 'thicknessMm', label: 'Thickness [mm]' },
  { key: 'widthMm', label: 'Width [mm]' },
  { key: 'lengthMm', label: 'Length [mm]' },
  { key: 'weightKg', label: 'Weight [Kg]' },
  { key: 'materialGrade', label: 'Mat. Grade' },
  { key: 'traceability', label: 'Traceability' },
  { key: 'heatNo', label: 'Heat No.' },
  { key: 'mir', label: 'MIR' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'poItem', label: 'PO ITEM' },
  { key: 'nfArrival', label: 'NF arrival' },
  { key: 'notes', label: 'Notes' },
]);

function safeText(value) {
  return value == null ? '' : String(value);
}

function pickFirst(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && safeText(candidate).trim() !== '');
  return value ?? '';
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function createGeneratedAt(options = {}) {
  return safeText(typeof options.nowFactory === 'function' ? options.nowFactory() : new Date().toISOString());
}

function couponPayload(source = {}) {
  return source.metadata?.coupon || source.metadata?.materialCoupon || source;
}

function headerFromCoupon(source = {}) {
  const coupon = couponPayload(source);
  const metadata = source.metadata || {};
  const header = coupon.header || {};
  const responsible = coupon.responsible || {};
  return {
    mcCode: safeText(pickFirst(header.mcCode, coupon.number, source.number, metadata.materialCouponNumber, source.materialCouponNumber)),
    mcRevision: safeText(pickFirst(header.revision, header.mcRevision, coupon.revision, '0')),
    materialDestination: safeText(pickFirst(header.destination, metadata.destination, source.destination)),
    mcDate: safeText(pickFirst(header.date, metadata.date, source.date, source.createdAt)),
    project: safeText(pickFirst(header.project, metadata.project, source.project, source.projectData?.projectName)),
    client: safeText(pickFirst(header.client, metadata.client, source.client)),
    scope: safeText(pickFirst(header.scope, metadata.scope, source.scope)),
    workpack: safeText(pickFirst(header.workpack, metadata.workpack, source.workpack)),
    docNumber: safeText(pickFirst(header.docNumber, header.docNo, metadata.docNumber)),
    docRevision: safeText(pickFirst(header.docRevision, metadata.docRevision)),
    docRevisionDate: safeText(pickFirst(header.docRevisionDate, metadata.docRevisionDate)),
    docReference: safeText(pickFirst(header.docReference, metadata.docReference)),
    reference: safeText(pickFirst(header.reference, metadata.reference)),
    notes: safeText(pickFirst(header.notes, metadata.notes, metadata.observations)),
    remarks: safeText(pickFirst(header.remarks, metadata.remarks)),
    issuing: safeText(pickFirst(responsible.issuing, metadata.preparedBy, metadata.issuingName)),
    dispatch: safeText(pickFirst(responsible.dispatch, metadata.dispatchName)),
    receiving: safeText(pickFirst(responsible.receiving, metadata.receivedBy, metadata.receivingName)),
  };
}

function sourceLines(source = {}) {
  const coupon = couponPayload(source);
  const candidates = [
    coupon.lines,
    coupon.items,
    source.lines,
    source.items,
    source.stockItems,
    source.selectedStock,
    source.inventoryItems,
    source.nestedBars,
  ];
  return candidates.find((items) => Array.isArray(items) && items.length) || [];
}

export function normalizeMaterialCouponLine(line = {}, header = {}) {
  const stock = line.stockItem || line.inventoryItem || line.stock || line;
  const po = safeText(pickFirst(stock.po, stock.purchaseOrder, stock.poNumber, line.po));
  const poItemNumber = safeText(pickFirst(stock.poItemNumber, stock.poItem, stock.item, stock.itemPo, line.poItemNumber, line.poItem, line.item));
  return {
    mcCode: safeText(header.mcCode),
    mcRevision: safeText(header.mcRevision),
    materialDestination: safeText(header.materialDestination),
    mcDate: safeText(header.mcDate),
    serialNumber: safeText(pickFirst(stock.serialNumber, stock.serial, stock.sn, line.serialNumber)),
    sapCode: safeText(pickFirst(stock.sapCode, stock.sap, stock.identCode, stock.IdentCode, line.sapCode)),
    itemType: safeText(pickFirst(stock.itemType, stock.itemCategory, stock.category, stock.type, stock.profile, line.itemType)),
    materialDescription: safeText(pickFirst(stock.materialDescription, stock.description, stock.Description, stock.desc, line.materialDescription)),
    qty: safeText(pickFirst(stock.qty, stock.quantity, stock.Quantity, line.qty, 1)),
    unit: safeText(pickFirst(stock.unit, stock.un, stock.Unit, line.unit, 'EA')),
    diaMm: safeText(pickFirst(stock.diaMm, stock.dia, stock.diameter, stock.od, stock.diaOdMm, line.diaMm)),
    thicknessMm: safeText(pickFirst(stock.thicknessMm, stock.thickness, stock.wallThickness, stock.wt, stock.thkMm, line.thicknessMm)),
    widthMm: safeText(pickFirst(stock.widthMm, stock.width, line.widthMm)),
    lengthMm: safeText(pickFirst(stock.lengthMm, stock.length, stock.currentLength, stock.originalLength, stock.cutLength, line.lengthMm)),
    weightKg: safeText(pickFirst(stock.weightKg, stock.weight, stock['Weight/kg'], line.weightKg)),
    materialGrade: safeText(pickFirst(stock.materialGrade, stock.matGrade, stock.grade, stock.material, line.materialGrade)),
    traceability: safeText(pickFirst(stock.traceability, stock.heatTraceability, stock.trace, line.traceability)),
    heatNo: safeText(pickFirst(stock.heatNo, stock.heatNumber, stock.heat, line.heatNo)),
    mir: safeText(pickFirst(stock.mir, stock.MIR, line.mir)),
    equipment: safeText(pickFirst(stock.equipment, stock.tag, stock.Tag, line.equipment, header.equipment)),
    poItem: safeText(pickFirst(stock.poItem, poItemNumber, line.poItem)),
    nfArrival: safeText(pickFirst(stock.nfArrival, stock.invoice, stock.nf, line.nfArrival)),
    notes: safeText(pickFirst(stock.notes, stock.note, line.notes)),
    project: safeText(header.project),
    client: safeText(header.client),
    destination: safeText(header.materialDestination),
    date: safeText(header.mcDate),
    materialCouponNumber: safeText(header.mcCode),
    description: safeText(pickFirst(stock.materialDescription, stock.description, stock.Description, stock.desc, line.materialDescription)),
    heat: safeText(pickFirst(stock.heatNo, stock.heatNumber, stock.heat, line.heatNo)),
    quantity: safeText(pickFirst(stock.qty, stock.quantity, stock.Quantity, line.qty, 1)),
    dimensions: [
      safeText(pickFirst(stock.diaMm, stock.dia, stock.diameter, stock.od, stock.diaOdMm, line.diaMm)),
      safeText(pickFirst(stock.thicknessMm, stock.thickness, stock.wallThickness, stock.wt, stock.thkMm, line.thicknessMm)),
      safeText(pickFirst(stock.widthMm, stock.width, line.widthMm)),
      safeText(pickFirst(stock.lengthMm, stock.length, stock.currentLength, stock.originalLength, stock.cutLength, line.lengthMm)),
    ].filter(Boolean).join(' x '),
    drawing: safeText(pickFirst(stock.drawing, stock.drawingRef, stock.dwgNumber, line.drawing)),
    observations: safeText(pickFirst(stock.observations, stock.notes, stock.note, line.observations, header.notes)),
    materialProject: safeText(pickFirst(stock.materialProject, stock.project, header.project)),
    totalSurfaceM2: safeText(pickFirst(stock.totalSurfaceM2, line.totalSurfaceM2)),
    po,
    poItemNumber,
    mcIssuingResponsible: safeText(pickFirst(line.mcIssuingResponsible, header.issuing)),
    materialDispatchResponsible: safeText(pickFirst(line.materialDispatchResponsible, header.dispatch)),
    materialReceivingResponsible: safeText(pickFirst(line.materialReceivingResponsible, header.receiving)),
    remarksNotes: safeText(pickFirst(line.remarksNotes, stock.remarksNotes, header.remarks, header.notes)),
    classOfMaterial: safeText(pickFirst(line.classOfMaterial, stock.classOfMaterial, stock.materialClass)),
    discipline: safeText(pickFirst(line.discipline, stock.discipline)),
    dispatchNfInvoice: safeText(pickFirst(line.dispatchNfInvoice, stock.dispatchNfInvoice)),
    statusMaterial: safeText(pickFirst(line.statusMaterial, stock.statusMaterial, stock.status)),
    receivedDate: safeText(pickFirst(line.receivedDate, stock.receivedDate)),
    receivedSignature: safeText(pickFirst(line.receivedSignature, stock.receivedSignature)),
    workpack: safeText(pickFirst(line.workpack, stock.workpack, header.workpack)),
    drawingUse: safeText(pickFirst(line.drawingUse, stock.drawingUse, stock.drawing, stock.dwgNumber)),
    uploadInFms: safeText(pickFirst(line.uploadInFms, stock.uploadInFms)),
    fmsMwcProcess: safeText(pickFirst(line.fmsMwcProcess, stock.fmsMwcProcess)),
    fmsTrackNumber: safeText(pickFirst(line.fmsTrackNumber, stock.fmsTrackNumber)),
    mpcCode: safeText(pickFirst(line.mpcCode, stock.mpcCode)),
    rmvCode: safeText(pickFirst(line.rmvCode, stock.rmvCode)),
    local: safeText(pickFirst(line.local, stock.local, stock.location)),
    returnedQty: safeText(pickFirst(line.returnedQty, stock.returnedQty)),
    returnedWidthMm: safeText(pickFirst(line.returnedWidthMm, stock.returnedWidthMm)),
    returnedLengthMm: safeText(pickFirst(line.returnedLengthMm, stock.returnedLengthMm)),
    nesting: safeText(pickFirst(line.nesting, stock.nesting)),
    drawback: safeText(pickFirst(line.drawback, stock.drawback)),
  };
}

export function buildMaterialCouponExtractRows(coupons = [], options = {}) {
  const source = Array.isArray(coupons) ? coupons : [coupons];
  return source.flatMap((coupon) => {
    const header = { ...headerFromCoupon(coupon), ...(options.header || {}) };
    return sourceLines(coupon).map((line, index) => {
      const row = normalizeMaterialCouponLine(line, header);
      return { ...row, serialNumber: row.serialNumber || String(index + 1) };
    });
  });
}

function signatureFields(header = {}) {
  return [
    { role: 'PPC', label: 'Issued By', name: header.issuing || '', date: header.mcDate || '', signature: '' },
    { role: 'Warehouse', label: 'Dispatched By', name: header.dispatch || '', date: '', signature: '' },
    { role: 'Receiving', label: 'Received By', name: header.receiving || '', date: '', signature: '' },
  ];
}

export function buildMaterialCouponDocument(couponOrPackage = {}, options = {}) {
  const header = { ...headerFromCoupon(couponOrPackage), ...(options.header || {}) };
  const rows = buildMaterialCouponExtractRows(couponOrPackage, { header });
  const warnings = [];
  if (!rows.length) warnings.push('No material lines found for Material Coupon.');

  return {
    documentType: 'materialCoupon',
    title: 'Material Coupon',
    documentNumber: safeText(pickFirst(options.materialCouponNumber, header.mcCode)),
    generatedAt: createGeneratedAt(options),
    metadata: header,
    columns: DOCUMENT_COLUMNS.map((column) => ({ ...column })),
    rows,
    summary: {
      totalRows: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0),
    },
    signatureFields: signatureFields(header),
    warnings,
  };
}
