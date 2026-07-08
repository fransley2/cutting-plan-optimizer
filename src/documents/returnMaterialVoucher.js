const COLUMNS = Object.freeze([
  { key: 'rmvNumber', label: 'RMV No.' },
  { key: 'materialCouponNumber', label: 'Material Coupon Related' },
  { key: 'cuttingSheetNumber', label: 'Cutting Sheet Related' },
  { key: 'project', label: 'Project' },
  { key: 'description', label: 'Description' },
  { key: 'materialGrade', label: 'Material / Grade' },
  { key: 'heat', label: 'Heat / Plate' },
  { key: 'po', label: 'PO' },
  { key: 'poItem', label: 'Item' },
  { key: 'returnedSize', label: 'Returned Material Size' },
  { key: 'quantity', label: 'Qty' },
  { key: 'reason', label: 'Reason' },
  { key: 'sketchSummary', label: 'Sketch / Textual Summary' },
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
    workpack: safeText(pickFirst(metadata.workpack, cuttingPackage.workpack)),
    destination: safeText(pickFirst(metadata.destination, cuttingPackage.destination)),
    date: safeText(pickFirst(metadata.date, cuttingPackage.date, cuttingPackage.createdAt)),
    materialCouponNumber: safeText(pickFirst(metadata.materialCouponNumber, cuttingPackage.materialCouponNumber, cuttingPackage.materialCouponNo)),
    cuttingSheetNumber: safeText(pickFirst(metadata.cuttingSheetNumber, cuttingPackage.cuttingSheetNumber, cuttingPackage.cuttingSheetNo)),
    rmvNumber: safeText(pickFirst(metadata.rmvNumber, cuttingPackage.rmvNumber, cuttingPackage.returnMaterialVoucherNo)),
    preparedBy: safeText(metadata.preparedBy),
    receivedBy: safeText(metadata.receivedBy),
    approvedBy: safeText(metadata.approvedBy),
    observations: safeText(metadata.observations),
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
  if (Array.isArray(cuttingPackage.returnedMaterials) && cuttingPackage.returnedMaterials.length) return cuttingPackage.returnedMaterials;
  if (Array.isArray(cuttingPackage.generatedOffcuts) && cuttingPackage.generatedOffcuts.length) return cuttingPackage.generatedOffcuts;
  return offcutsFromBars(cuttingPackage);
}

function sketchSummary(item = {}) {
  const trace = safeText(pickFirst(item.parentTrace, item.parentTraceability, item.sourceTraceability, item.traceability, item.trace, item.traceNo));
  const size = formatDimensions(item);
  const description = safeText(pickFirst(item.description, item.desc));
  if (trace && size) return `Offcut from trace ${trace}, length ${safeNumber(pickFirst(item.length, item.lengthMm, item.offcutLength, item.remaining))} mm`;
  if (description && size) return `Returned ${description} offcut ${size}`;
  if (size) return `Returned material offcut ${size}`;
  return trace ? `Offcut from trace ${trace}` : 'Returned offcut from nesting';
}

function rowFromItem(item = {}, metadata = {}, packageReason = '') {
  return {
    rmvNumber: metadata.rmvNumber,
    materialCouponNumber: metadata.materialCouponNumber,
    cuttingSheetNumber: metadata.cuttingSheetNumber,
    project: metadata.project,
    description: safeText(pickFirst(item.description, item.desc)),
    materialGrade: safeText(pickFirst(item.material, item.materialGrade, item.grade)),
    heat: safeText(pickFirst(item.heat, item.heatNumber, item.plate)),
    po: safeText(pickFirst(item.po, item.purchaseOrder, item.poNumber)),
    poItem: safeText(pickFirst(item.item, item.poItem, item.itemPo)),
    returnedSize: formatDimensions(item),
    quantity: safeText(pickFirst(item.qty, item.quantity, 1)),
    reason: safeText(pickFirst(item.reason, item.scrapReason, packageReason, 'Returned offcut from nesting')),
    sketchSummary: sketchSummary(item),
    status: safeText(item.status),
  };
}

function signatureFields(metadata = {}) {
  return [
    { role: 'PPC', label: 'Returned By', name: metadata.preparedBy || '', date: metadata.date || '', signature: '' },
    { role: 'Warehouse', label: 'Received By', name: metadata.receivedBy || '', date: '', signature: '' },
    { role: 'Fiscal', label: 'Fiscal Check', name: metadata.approvedBy || '', date: '', signature: '' },
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
    documentNumber: safeText(pickFirst(options.rmvNumber, metadata.rmvNumber)),
    generatedAt: createGeneratedAt(options),
    metadata,
    columns: COLUMNS.map((column) => ({ ...column })),
    rows: items.map((item) => rowFromItem(item, metadata, cuttingPackage.reason)),
    summary: {
      totalRows: items.length,
      totalQuantity: items.reduce((sum, item) => sum + safeNumber(pickFirst(item.qty, item.quantity, 1)), 0),
      totalReturnedLength: items.reduce((sum, item) => sum + safeNumber(pickFirst(item.length, item.lengthMm, item.offcutLength, item.remaining)), 0),
    },
    signatureFields: signatureFields(metadata),
    warnings,
  };
}
