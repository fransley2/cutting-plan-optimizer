import { cuttingSheetBarPoItem } from '../core/cuttingSheetPresentation.js';

const DEFAULT_COLUMNS = {
  trace: 0,
  category: 3,
  po: 17,
  poItem: 18,
  qty: 34,
  lengthMm: 9,
  materialGrade: 25,
  heatNo: 24,
  materialDescription: 4,
  thicknessMm: 6,
  diaMm: 7,
  widthMm: 8,
};

const COMPACT_COLUMNS = {
  trace: 0,
  category: 1,
  po: 2,
  poItem: 3,
  qty: 4,
  lengthMm: 5,
  materialGrade: 6,
  heatNo: 7,
  materialDescription: 8,
  thicknessMm: 9,
  diaMm: 10,
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
  thicknessMm: ['Thk (mm)', 'Thickness', 'Thickness [mm]', 'Thk'],
  diaMm: ['Dia. (OD) (mm)', 'Dia OD', 'OD', 'Diameter'],
  widthMm: ['Width (mm)', 'Width'],
  lengthMm: ['Length (mm)', 'Length'],
  unit: ['Unit of Measure', 'Unit', 'UOM', 'Un.'],
  weightKg: ['Total Weight (KG)', 'Weight/kg', 'Weight [Kg]', 'Weight'],
  qty: ['Qty', 'Quantity'],
  nfArrival: ['Entry Invoice [NF]', 'Entry Invoice', 'NF arrival'],
  receivedDate: ['Received Date'],
  mrr: ['MRR'],
  poSubject: ['PO Subject / Chrono Number', 'PO Subject', 'Chrono Number'],
  po: ['PO Number', 'PO'],
  poItem: ['PO Item #', 'PO ITEM', 'PO Item', 'Item'],
  sapCode: ['SAP Code'],
  identCode: ['IDENT CODE', 'IdentCode', 'Ident Code'],
  regime: ['Regime'],
  partNumber: ['Part Number'],
  serialNumber: ['Serial Number'],
  mtcNumber: ['MTC Number [Certificate]', 'MTC Number', 'Certificate'],
  heatNo: ['Heat Number', 'Heat No.', 'Heat'],
  materialGrade: ['Material & Grade', 'Mat. Grade', 'Material / Grade', 'Material'],
  mir: ['MIR Number', 'MIR'],
  inspectionStatus: ['Inspection Status'],
  acceptanceStatus: ['Acceptance Status'],
  colorCode: ['Color Code'],
  location: ['Storage Location', 'Location'],
  locationZone: ['Location Zone'],
  equipment: ['Equipment Designation', 'Equipment'],
  totalPoQty: ['Total PO Qty'],
  receivedQty: ['Received Qty'],
  issuedQty: ['Issued Mat. Qty', 'Issued Qty'],
  balanceQty: ['Balance Qty'],
  materialCouponNo: ['Material Coupon No.', 'Material Coupon No'],
  exitDate: ['Exit / Movement Date at CTCO', 'Exit Date'],
  exitInvoice: ['Exit Invoice [NF]', 'Exit Invoice'],
  rmvNo: ['RMV No.', 'RMV No'],
  notes: ['Comments', 'Notes', 'Remarks'],
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
    materialClassification: valueAt(values, columnMap, 'materialClassification'),
    thicknessMm: valueAt(values, columnMap, 'thicknessMm'),
    diaMm: valueAt(values, columnMap, 'diaMm'),
    widthMm: valueAt(values, columnMap, 'widthMm'),
    lengthMm: toNumber(valueAt(values, columnMap, 'lengthMm')),
    unit: valueAt(values, columnMap, 'unit'),
    weightKg: toNumber(valueAt(values, columnMap, 'weightKg')),
    nfArrival: valueAt(values, columnMap, 'nfArrival'),
    receivedDate: valueAt(values, columnMap, 'receivedDate'),
    mrr: valueAt(values, columnMap, 'mrr'),
    poSubject: valueAt(values, columnMap, 'poSubject'),
    po: valueAt(values, columnMap, 'po'),
    poItem: valueAt(values, columnMap, 'poItem'),
    sapCode: valueAt(values, columnMap, 'sapCode'),
    identCode: valueAt(values, columnMap, 'identCode'),
    regime: valueAt(values, columnMap, 'regime'),
    partNumber: valueAt(values, columnMap, 'partNumber'),
    serialNumber: valueAt(values, columnMap, 'serialNumber'),
    mtcNumber: valueAt(values, columnMap, 'mtcNumber'),
    heatNo: valueAt(values, columnMap, 'heatNo'),
    materialGrade: valueAt(values, columnMap, 'materialGrade'),
    mir: valueAt(values, columnMap, 'mir'),
    inspectionStatus: valueAt(values, columnMap, 'inspectionStatus'),
    acceptanceStatus: valueAt(values, columnMap, 'acceptanceStatus'),
    colorCode: valueAt(values, columnMap, 'colorCode'),
    location: valueAt(values, columnMap, 'location'),
    locationZone: valueAt(values, columnMap, 'locationZone'),
    equipment: valueAt(values, columnMap, 'equipment'),
    totalPoQty: toNumber(valueAt(values, columnMap, 'totalPoQty')),
    receivedQty: toNumber(valueAt(values, columnMap, 'receivedQty')),
    issuedQty: toNumber(valueAt(values, columnMap, 'issuedQty')),
    balanceQty: toNumber(valueAt(values, columnMap, 'balanceQty')),
    materialCouponNo: valueAt(values, columnMap, 'materialCouponNo'),
    exitDate: valueAt(values, columnMap, 'exitDate'),
    exitInvoice: valueAt(values, columnMap, 'exitInvoice'),
    rmvNo: valueAt(values, columnMap, 'rmvNo'),
    notes: valueAt(values, columnMap, 'notes'),
    qty: toNumber(valueAt(values, columnMap, 'qty'), toNumber(valueAt(values, columnMap, 'balanceQty'), 1)) || 1,
    status: 'available',
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
    const lengthMm = Number.parseFloat(String(values[columnMap.lengthMm] || '0').trim());

    parsed.push({
      trace,
      category: String(values[columnMap.category] || '').trim(),
      po: String(values[columnMap.po] || '').trim(),
      poItem: String(values[columnMap.poItem] || '').trim(),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      lengthMm: Number.isFinite(lengthMm) && lengthMm > 0 ? lengthMm : 0,
      materialGrade: String(values[columnMap.materialGrade] || '').trim(),
      heatNo: String(values[columnMap.heatNo] || '').trim(),
      materialDescription: String(values[columnMap.materialDescription] || '').trim(),
      thicknessMm: String(values[columnMap.thicknessMm] || '').trim(),
      diaMm: String(values[columnMap.diaMm] || '').trim(),
      widthMm: String(values[columnMap.widthMm] || '').trim(),
      status: 'available',
    });
  }

  return parsed;
}

export function mapInventoryItemToStockRow(item) {
  const balanceQty = Number.parseInt(item.balanceQty, 10);
  const qty = Number.isFinite(balanceQty) && balanceQty > 0
    ? balanceQty
    : Number.parseInt(item.qty || 1, 10);
  const lengthMm = Number.parseFloat(item.lengthMm || 0);

  return {
    po: item.po || '',
    poItem: cuttingSheetBarPoItem(item),
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    lengthMm: Number.isFinite(lengthMm) && lengthMm > 0 ? lengthMm : 0,
    materialGrade: item.materialGrade || '',
    heatNo: item.heatNo || '',
    materialDescription: item.materialDescription || '',
    traceability: item.trace || item.traceability || '',
  };
}
