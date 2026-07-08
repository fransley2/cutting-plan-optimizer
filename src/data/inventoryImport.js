const DEFAULT_COLUMNS = {
  trace: 0,
  category: 3,
  po: 17,
  item: 18,
  qty: 34,
  length: 9,
  material: 25,
  heat: 24,
  desc: 4,
  thkMm: 6,
  diaOdMm: 7,
  widthMm: 8,
};

const COMPACT_COLUMNS = {
  trace: 0,
  category: 1,
  po: 2,
  item: 3,
  qty: 4,
  length: 5,
  material: 6,
  heat: 7,
  desc: 8,
  thkMm: 9,
  diaOdMm: 10,
  widthMm: 11,
};

const DATA_START_ROW = 5;

const REAL_HEADER_ALIASES = {
  trace: ['Traceability', 'Trace', 'Trace No.'],
  vendor: ['Vendor/Supplier', 'Vendor', 'Supplier'],
  poItemPo: ['PO - Item PO'],
  category: ['Category'],
  materialDescription: ['Material Description', 'Description', 'Desc'],
  materialClassification: ['Material Classification'],
  thkMm: ['Thk (mm)', 'Thickness', 'Thickness [mm]', 'Thk'],
  diaOdMm: ['Dia. (OD) (mm)', 'Dia OD', 'OD', 'Diameter'],
  widthMm: ['Width (mm)', 'Width'],
  length: ['Length (mm)', 'Length'],
  unitOfMeasure: ['Unit of Measure', 'Unit', 'UOM', 'Un.'],
  totalWeightKg: ['Total Weight (KG)', 'Weight/kg', 'Weight [Kg]', 'Weight'],
  qty: ['Qty', 'Quantity'],
  entryInvoice: ['Entry Invoice [NF]', 'Entry Invoice', 'NF arrival'],
  receivedDate: ['Received Date'],
  mrr: ['MRR'],
  poSubject: ['PO Subject / Chrono Number', 'PO Subject', 'Chrono Number'],
  poNumber: ['PO Number', 'PO'],
  poItem: ['PO Item #', 'PO ITEM', 'PO Item', 'Item'],
  sapCode: ['SAP Code', 'IdentCode'],
  regime: ['Regime'],
  partNumber: ['Part Number'],
  serialNumber: ['Serial Number'],
  mtcNumber: ['MTC Number [Certificate]', 'MTC Number', 'Certificate'],
  heat: ['Heat Number', 'Heat No.', 'Heat'],
  material: ['Material & Grade', 'Mat. Grade', 'Material / Grade', 'Material'],
  mirNumber: ['MIR Number', 'MIR'],
  inspectionStatus: ['Inspection Status'],
  acceptanceStatus: ['Acceptance Status'],
  colorCode: ['Color Code'],
  storageLocation: ['Storage Location', 'Location'],
  locationZone: ['Location Zone'],
  equipmentDesignation: ['Equipment Designation', 'Equipment'],
  totalPoQty: ['Total PO Qty'],
  receivedQty: ['Received Qty'],
  issuedQty: ['Issued Mat. Qty', 'Issued Qty'],
  balanceQty: ['Balance Qty'],
  materialCouponNo: ['Material Coupon No.', 'Material Coupon No'],
  exitDate: ['Exit / Movement Date at CTCO', 'Exit Date'],
  exitInvoice: ['Exit Invoice [NF]', 'Exit Invoice'],
  rmvNo: ['RMV No.', 'RMV No'],
  disponibilidade: ['Disponibilidade'],
  comments: ['Comments', 'Notes', 'Remarks'],
};

function text(value) {
  return String(value ?? '').trim();
}

function normalizeHeader(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ').replace(/[.:#]/g, '').trim();
}

function toNumber(value, fallback = 0) {
  const normalized = text(value).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const values = Array.isArray(row) ? row : Object.values(row || {});
    return values.some((value) => normalizeHeader(value) === normalizeHeader('Traceability'));
  });
}

function buildHeaderMap(headerRow) {
  const values = Array.isArray(headerRow) ? headerRow : Object.values(headerRow || {});
  const normalizedHeaders = values.map(normalizeHeader);
  const map = {};
  Object.entries(REAL_HEADER_ALIASES).forEach(([field, aliases]) => {
    const index = aliases
      .map(normalizeHeader)
      .map((alias) => normalizedHeaders.indexOf(alias))
      .find((candidate) => candidate >= 0);
    if (index >= 0) map[field] = index;
  });
  return map;
}

function valueAt(values, columnMap, field) {
  const index = columnMap[field];
  return index == null ? '' : text(values[index]);
}

function parseHeaderMappedRow(values, columnMap) {
  const trace = valueAt(values, columnMap, 'trace');
  if (!trace) return null;
  return {
    trace,
    traceability: trace,
    vendor: valueAt(values, columnMap, 'vendor'),
    poItemPo: valueAt(values, columnMap, 'poItemPo'),
    category: valueAt(values, columnMap, 'category'),
    materialDescription: valueAt(values, columnMap, 'materialDescription'),
    desc: valueAt(values, columnMap, 'materialDescription'),
    description: valueAt(values, columnMap, 'materialDescription'),
    materialClassification: valueAt(values, columnMap, 'materialClassification'),
    thkMm: valueAt(values, columnMap, 'thkMm'),
    diaOdMm: valueAt(values, columnMap, 'diaOdMm'),
    widthMm: valueAt(values, columnMap, 'widthMm'),
    length: toNumber(valueAt(values, columnMap, 'length')),
    currentLength: toNumber(valueAt(values, columnMap, 'length')),
    unitOfMeasure: valueAt(values, columnMap, 'unitOfMeasure'),
    totalWeightKg: toNumber(valueAt(values, columnMap, 'totalWeightKg')),
    entryInvoice: valueAt(values, columnMap, 'entryInvoice'),
    receivedDate: valueAt(values, columnMap, 'receivedDate'),
    mrr: valueAt(values, columnMap, 'mrr'),
    poSubject: valueAt(values, columnMap, 'poSubject'),
    poNumber: valueAt(values, columnMap, 'poNumber'),
    po: valueAt(values, columnMap, 'poNumber'),
    poItem: valueAt(values, columnMap, 'poItem'),
    item: valueAt(values, columnMap, 'poItem'),
    sapCode: valueAt(values, columnMap, 'sapCode'),
    regime: valueAt(values, columnMap, 'regime'),
    partNumber: valueAt(values, columnMap, 'partNumber'),
    serialNumber: valueAt(values, columnMap, 'serialNumber'),
    mtcNumber: valueAt(values, columnMap, 'mtcNumber'),
    heat: valueAt(values, columnMap, 'heat'),
    heatNumber: valueAt(values, columnMap, 'heat'),
    material: valueAt(values, columnMap, 'material'),
    materialGrade: valueAt(values, columnMap, 'material'),
    mirNumber: valueAt(values, columnMap, 'mirNumber'),
    inspectionStatus: valueAt(values, columnMap, 'inspectionStatus'),
    acceptanceStatus: valueAt(values, columnMap, 'acceptanceStatus'),
    colorCode: valueAt(values, columnMap, 'colorCode'),
    storageLocation: valueAt(values, columnMap, 'storageLocation'),
    location: valueAt(values, columnMap, 'storageLocation'),
    locationZone: valueAt(values, columnMap, 'locationZone'),
    equipmentDesignation: valueAt(values, columnMap, 'equipmentDesignation'),
    totalPoQty: toNumber(valueAt(values, columnMap, 'totalPoQty')),
    receivedQty: toNumber(valueAt(values, columnMap, 'receivedQty')),
    issuedQty: toNumber(valueAt(values, columnMap, 'issuedQty')),
    balanceQty: toNumber(valueAt(values, columnMap, 'balanceQty')),
    materialCouponNo: valueAt(values, columnMap, 'materialCouponNo'),
    exitDate: valueAt(values, columnMap, 'exitDate'),
    exitInvoice: valueAt(values, columnMap, 'exitInvoice'),
    rmvNo: valueAt(values, columnMap, 'rmvNo'),
    disponibilidade: valueAt(values, columnMap, 'disponibilidade'),
    comments: valueAt(values, columnMap, 'comments'),
    notes: valueAt(values, columnMap, 'comments'),
    qty: toNumber(valueAt(values, columnMap, 'qty'), toNumber(valueAt(values, columnMap, 'balanceQty'), 1)) || 1,
    status: 'N/A',
  };
}

export function parseInventoryRows(rows) {
  const parsed = [];
  const sourceRows = Array.isArray(rows) ? rows : [];
  const headerIndex = findHeaderIndex(sourceRows);
  const hasHeaderRow = headerIndex >= 0;
  const headerMap = hasHeaderRow ? buildHeaderMap(sourceRows[headerIndex]) : null;
  const startIndex = hasHeaderRow ? headerIndex + 1 : sourceRows.length <= DATA_START_ROW + 1 ? 0 : DATA_START_ROW;

  for (let index = startIndex; index < sourceRows.length; index += 1) {
    const row = sourceRows[index];
    if (!row || (Array.isArray(row) && row.length === 0)) continue;

    const values = Array.isArray(row) ? row : Object.values(row);
    if (headerMap && headerMap.trace != null) {
      const item = parseHeaderMappedRow(values, headerMap);
      if (item) parsed.push(item);
      continue;
    }

    const columnMap = values.length > 12 ? DEFAULT_COLUMNS : COMPACT_COLUMNS;
    const trace = String(values[columnMap.trace] || '').trim();
    if (!trace || trace.toLowerCase() === 'traceability') continue;

    const qty = Number.parseInt(String(values[columnMap.qty] || '1').trim(), 10);
    const length = Number.parseFloat(String(values[columnMap.length] || '0').trim());

    parsed.push({
      trace,
      category: String(values[columnMap.category] || '').trim(),
      po: String(values[columnMap.po] || '').trim(),
      item: String(values[columnMap.item] || '').trim(),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      length: Number.isFinite(length) && length > 0 ? length : 0,
      material: String(values[columnMap.material] || '').trim(),
      heat: String(values[columnMap.heat] || '').trim(),
      desc: String(values[columnMap.desc] || '').trim(),
      thkMm: String(values[columnMap.thkMm] || '').trim(),
      diaOdMm: String(values[columnMap.diaOdMm] || '').trim(),
      widthMm: String(values[columnMap.widthMm] || '').trim(),
      status: 'N/A',
    });
  }

  return parsed;
}

export function mapInventoryItemToStockRow(item) {
  const qty = Number.parseInt(item.qty || 1, 10);
  const length = Number.parseFloat(item.length || item.currentLength || 0);

  return {
    po: item.po || item.poNumber || '',
    item: item.item || item.poItem || '',
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    length: Number.isFinite(length) && length > 0 ? length : 0,
    materialGrade: item.material || item.materialGrade || '',
    heatNumber: item.heat || item.heatNumber || '',
    description: item.desc || item.description || item.materialDescription || '',
    traceability: item.trace || item.traceability || '',
  };
}

export function filterInventoryItems(items, term = '') {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => [
    item.trace,
    item.category,
    item.po,
    item.item,
    item.material,
    item.materialGrade,
    item.materialDescription,
    item.materialClassification,
    item.desc,
    item.length,
    item.thkMm ?? item.refF,
    item.diaOdMm ?? item.refG,
    item.widthMm ?? item.refH,
    item.heat,
    item.heatNumber,
    item.vendor,
    item.sapCode,
    item.storageLocation,
    item.locationZone,
    item.equipmentDesignation,
    item.materialCouponNo,
    item.rmvNo,
    item.disponibilidade,
    item.comments,
  ].some((value) => String(value || '').toLowerCase().includes(normalized)));
}
