const COLUMNS = Object.freeze([
  { key: 'serialNumber', label: 'S/N.' },
  { key: 'sapCode', label: 'SAP Code' },
  { key: 'itemCategory', label: 'Item Category' },
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Qty' },
  { key: 'unit', label: 'Un.' },
  { key: 'diaMm', label: 'Dia [mm]' },
  { key: 'thicknessMm', label: 'Thickness [mm]' },
  { key: 'widthMm', label: 'Width [mm]' },
  { key: 'lengthMm', label: 'Length [mm]' },
  { key: 'weightKg', label: 'Weight [Kg]' },
  { key: 'condition', label: 'Condition' },
  { key: 'traceability', label: 'Original Traceability' },
  { key: 'heat', label: 'Heat No.' },
  { key: 'materialCouponNumber', label: 'Ref. MC' },
  { key: 'cuttingSheetNumber', label: 'Cutting Plan' },
  { key: 'poItem', label: 'PO / Item' },
  { key: 'notes', label: 'Notes' },
]);

function safeText(value) {
  return value == null ? '' : String(value);
}

function safeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = safeText(value).trim();
  if (!text) return 0;
  const normalized = text.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function pickFirst(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  return value ?? '';
}

function formatDimensions(item = {}) {
  const length = safeNumber(pickFirst(item.length, item.lengthMm, item.cutLength, item.cutLengthMm, item.offcutLength, item.remaining));
  const width = safeNumber(pickFirst(item.width, item.widthMm));
  const thickness = safeNumber(pickFirst(item.thickness, item.thicknessMm, item.thk));
  const parts = [];
  if (length) parts.push(`${length} mm`);
  if (width && thickness) return `${length || ''}${length ? ' x ' : ''}${width} x ${thickness} mm`;
  return parts.join('');
}

function createGeneratedAt(options = {}) {
  const value = typeof options.nowFactory === 'function' ? options.nowFactory() : new Date().toISOString();
  return safeText(value);
}

function getPackageMetadata(cuttingPackage = {}) {
  const metadata = cuttingPackage.metadata || {};
  return {
    project: safeText(pickFirst(metadata.project, cuttingPackage.project, cuttingPackage.projectData?.projectName)),
    client: safeText(pickFirst(metadata.client, cuttingPackage.client)),
    equipment: safeText(pickFirst(metadata.equipment, cuttingPackage.equipment, cuttingPackage.projectData?.equipment)),
    workpack: operationalWorkpackValue(pickFirst(metadata.workpack, cuttingPackage.workpack)),
    destination: safeText(pickFirst(cuttingPackage.destination, metadata.destination)),
    origin: safeText(pickFirst(cuttingPackage.origin, metadata.origin)),
    scope: safeText(pickFirst(metadata.scope, cuttingPackage.scope)),
    drawingReference: safeText(pickFirst(cuttingPackage.drawingReference, metadata.drawingReference)),
    date: safeText(pickFirst(cuttingPackage.date, metadata.date, cuttingPackage.createdAt)),
    materialCouponNumber: safeText(pickFirst(metadata.materialCouponNumber, cuttingPackage.materialCouponNumber, cuttingPackage.materialCouponNo)),
    cuttingSheetNumber: safeText(pickFirst(metadata.cuttingSheetNumber, cuttingPackage.cuttingSheetNumber, cuttingPackage.cuttingSheetNo)),
    rmvNumber: safeText(pickFirst(metadata.rmvNumber, cuttingPackage.rmvNumber, cuttingPackage.returnMaterialVoucherNo)),
    preparedBy: safeText(metadata.preparedBy),
    receivedBy: safeText(metadata.receivedBy),
    approvedBy: safeText(metadata.approvedBy),
    observations: safeText(metadata.observations),
    reference: safeText(pickFirst(cuttingPackage.reference, metadata.reference)),
    notes: safeText(pickFirst(cuttingPackage.notes, metadata.notes, metadata.observations)),
    dispatchBy: safeText(pickFirst(cuttingPackage.dispatchBy, metadata.dispatchBy)),
  };
}

function offcutsFromBars(cuttingPackage = {}) {
  const bars = Array.isArray(cuttingPackage.nestedBars)
    ? cuttingPackage.nestedBars
    : Array.isArray(cuttingPackage.stockUsed)
      ? cuttingPackage.stockUsed
      : [];
  return bars.flatMap((bar) => {
    if (Array.isArray(bar.offcuts)) return bar.offcuts;
    const remaining = pickFirst(bar.remaining, bar.offcut, bar.spareOffcut);
    if (remaining === '') return [];
    return [{
      ...bar,
      length: remaining,
      sourceTraceability: pickFirst(bar.traceability, bar.trace, bar.stockItem?.traceability, bar.stockItem?.trace),
    }];
  });
}

function sourceItems(cuttingPackage = {}) {
  if (Array.isArray(cuttingPackage.returnedItems) && cuttingPackage.returnedItems.length) return cuttingPackage.returnedItems;
  if (Array.isArray(cuttingPackage.returnedMaterials) && cuttingPackage.returnedMaterials.length) return cuttingPackage.returnedMaterials;
  if (Array.isArray(cuttingPackage.generatedOffcuts) && cuttingPackage.generatedOffcuts.length) return cuttingPackage.generatedOffcuts;
  return offcutsFromBars(cuttingPackage);
}

function sketchSummary(item = {}) {
  const trace = safeText(pickFirst(item.parentTrace, item.parentTraceability, item.sourceTraceability, item.traceability, item.trace, item.traceNo));
  const size = formatDimensions(item);
  const description = safeText(item.materialDescription);
  if (trace && size) return `Offcut from trace ${trace}, length ${safeNumber(pickFirst(item.length, item.lengthMm, item.offcutLength, item.remaining))} mm`;
  if (description && size) return `Returned ${description} offcut ${size}`;
  if (size) return `Returned material offcut ${size}`;
  return trace ? `Offcut from trace ${trace}` : 'Returned offcut from nesting';
}

function rowFromItem(item = {}, metadata = {}, packageReason = '') {
  return {
    rmvNumber: metadata.rmvNumber,
    serialNumber: safeText(item.serialNumber),
    sapCode: safeText(item.sapCode),
    itemCategory: safeText(pickFirst(item.itemCategory, item.category)),
    materialCouponNumber: metadata.materialCouponNumber,
    cuttingSheetNumber: metadata.cuttingSheetNumber,
    description: safeText(item.materialDescription),
    materialGrade: safeText(pickFirst(item.materialGrade, item.grade)),
    heat: safeText(pickFirst(item.heatNo, item.plate)),
    po: safeText(pickFirst(item.po, item.purchaseOrder)),
    poItem: [safeText(pickFirst(item.po, item.purchaseOrder)), safeText(pickFirst(item.poItem, item.itemPo))].filter(Boolean).join(' / '),
    returnedSize: formatDimensions(item),
    quantity: safeText(pickFirst(item.qty, item.quantity, 1)),
    unit: safeText(item.unit) || 'EA',
    diaMm: safeText(pickFirst(item.diaMm, item.diameterMm)),
    thicknessMm: safeText(pickFirst(item.thicknessMm, item.thickness)),
    widthMm: safeText(pickFirst(item.widthMm, item.width)),
    lengthMm: safeText(pickFirst(item.lengthMm, item.length, item.remaining)),
    weightKg: safeText(item.weightKg),
    condition: safeText(item.condition) || 'GOOD',
    traceability: safeText(pickFirst(item.parentTraceability, item.parentTrace, item.traceability)),
    reason: safeText(pickFirst(item.reason, item.scrapReason, packageReason, 'Returned offcut from nesting')),
    sketchSummary: sketchSummary(item),
    notes: safeText(item.notes),
    status: safeText(item.status),
  };
}

function signatureFields(metadata = {}) {
  return [
    { role: 'PPC', label: 'MC Issuing Responsible', name: metadata.preparedBy || '', date: metadata.date || '', signature: '' },
    { role: 'Dispatch', label: 'Material Dispatch Responsible', name: metadata.dispatchBy || '', date: '', signature: '' },
    { role: 'Warehouse', label: 'Material Receiving Responsible', name: metadata.receivedBy || '', date: '', signature: '' },
  ];
}

export function buildReturnMaterialVoucherDocument(cuttingPackage = {}, options = {}) {
  const metadata = getPackageMetadata(cuttingPackage);
  const items = sourceItems(cuttingPackage);
  const warnings = [];
  if (!items.length) warnings.push('No returned materials or generated offcuts found for RMV.');

  return {
    documentType: 'returnMaterialVoucher',
    title: 'Return Material Voucher',
    documentNumber: safeText(pickFirst(options.rmvNumber, cuttingPackage.number, metadata.rmvNumber)),
    generatedAt: createGeneratedAt(options),
    metadata,
    columns: COLUMNS.map((column) => ({ ...column })),
    rows: items.map((item, index) => ({ ...rowFromItem(item, metadata, cuttingPackage.reason), serialNumber: safeText(item.serialNumber) || String(index + 1) })),
    summary: {
      totalRows: items.length,
      totalQuantity: items.reduce((sum, item) => sum + safeNumber(pickFirst(item.qty, item.quantity, 1)), 0),
      totalReturnedLength: items.reduce((sum, item) => sum + safeNumber(pickFirst(item.length, item.lengthMm, item.offcutLength, item.remaining)), 0),
    },
    signatureFields: signatureFields(metadata),
    warnings,
  };
}
import { operationalWorkpackValue } from '../core/workpackRelations.js';
