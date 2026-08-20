export const PURCHASE_ORDER_IMPORT_COLUMNS = Object.freeze([
  { key: 'vendor', label: 'VENDOR', required: true, width: 250 },
  { key: 'vendorCode', label: 'Vendor Code', width: 110 },
  { key: 'traceability', label: 'Traceability', width: 150 },
  { key: 'identCode', label: 'IDENT CODE', width: 150 },
  { key: 'drawback', label: 'DRAWBACK', required: true, width: 110, control: 'drawback' },
  { key: 'task', label: 'TASK', width: 240 },
  { key: 'poDocDate', label: 'PO Doc. Date', width: 120 },
  { key: 'poRevision', label: 'PO Rev.', width: 90 },
  { key: 'poNumber', label: 'PO Number', required: true, width: 110 },
  { key: 'poItem', label: 'PO Item', required: true, width: 90 },
  { key: 'itemClassification', label: 'Item Classification', width: 150 },
  { key: 'itemType', label: 'Item Type', width: 150 },
  { key: 'itemDescription', label: 'Item Description', width: 420 },
  { key: 'diameterOdMm', label: 'Diameter O.D.', width: 120 },
  { key: 'thicknessMm', label: 'Thickness ( MM )', width: 130 },
  { key: 'degree', label: 'Degree', width: 90 },
  { key: 'materialGrade', label: 'Material Grade', width: 140 },
  { key: 'lengthArea', label: 'Length/Area (unit)', width: 140 },
  { key: 'lengthAreaUnit', label: 'Un.', width: 80 },
  { key: 'poQuantity', label: 'PO Quantity', width: 120 },
  { key: 'poUnit', label: 'PO un.', width: 90 },
  { key: 'unitPrice', label: 'Price', width: 110 },
  { key: 'deliveryDate', label: 'Delivery Date', width: 120 },
]);

const ALIASES = Object.freeze({
  vendor: ['vendor', 'supplier'], vendorCode: ['vendorcode', 'suppliercode'], poNumberItem: ['ponumberpoitem', 'poitempo'], traceability: ['traceability', 'trace'],
  identCode: ['identcode'], drawback: ['drawback'], equipmentDestination: ['equipmentdestination', 'destination'], task: ['task', 'subject'],
  poDocDate: ['podocdate', 'orderdate'], poRevision: ['porev', 'porevision', 'revision'], poNumber: ['ponumber', 'po'], poItem: ['poitem', 'itemnumber'],
  itemClassification: ['itemclassification', 'materialclassification'], itemType: ['itemtype', 'materialtype'], itemDescription: ['itemdescription', 'description'],
  diameterOdMm: ['diameterod', 'diameterodmm', 'od'], thicknessMm: ['thicknessmm', 'thickness', 'wt'], degree: ['degree', 'angle', 'bendangle', 'grau'], materialGrade: ['materialgrade', 'grade'],
  lengthArea: ['lengthareaunit', 'lengtharea', 'length'], lengthAreaUnit: ['un', 'lengthunit'], poQuantity: ['poquantity', 'orderedquantity', 'quantity'], poUnit: ['poun', 'pounit', 'unitofmeasure', 'um'],
  unitPrice: ['unitprice', 'price'], deliveryDate: ['deliverydate', 'contractualdeliverydate', 'expecteddeliverydate'],
});

function text(value) { return value == null ? '' : String(value).trim(); }
function normalizedHeader(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function decimal(value) { const source = text(value).replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'); const parsed = Number(source); return Number.isFinite(parsed) ? parsed : 0; }
function optionalDecimal(value) { return text(value) ? decimal(value) : ''; }
function rounded(value) { return Math.round(value * 1000) / 1000; }

const MATERIAL_TYPE_CODES = Object.freeze({
  BEND: 'BD', 'PROCESS PIPE': 'PP', PIPE: 'PP', TUBO: 'PP', PLATE: 'PL', 'TEST RING': 'TR',
  'WELDING CONSUMABLES': 'WC', GASKET: 'GA', BEAM: 'BE', TUBE: 'TB', TUBULAR: 'TU',
  'ROUND BAR': 'RB', FITTING: 'FT', ELBOW: 'EL', FLANGE: 'FL', BOLT: 'BO', NUT: 'NU', WASHER: 'WA',
});

const MATERIAL_CLASSIFICATION_CODES = Object.freeze({
  'CARBON STEEL': 'CS', SUPERDUPLEX: 'SD', 'SUPER DUPLEX': 'SD', DUPLEX: 'DX', 'STAINLESS STEEL': 'SS',
});

function upper(value) { return text(value).toUpperCase().replace(/\s+/g, ' '); }

export function materialTypeIdentCode(value) {
  return MATERIAL_TYPE_CODES[upper(value)] || '';
}

export function materialClassificationIdentCode(value) {
  return MATERIAL_CLASSIFICATION_CODES[upper(value)] || '';
}

function identDimension(value) {
  const number = decimal(value);
  return number > 0 ? String(Math.trunc(number)) : '';
}

export function generatePurchaseOrderIdentCode(input = {}) {
  const inferred = inferPurchaseOrderMaterialFields(input.itemDescription || input.description || '');
  const itemType = upper(input.itemType || inferred.itemType);
  const parts = [
    materialTypeIdentCode(itemType),
    materialClassificationIdentCode(input.itemClassification || input.materialClassification || input.materialCategory || inferred.itemClassification),
    identDimension(input.diameterOdMm || inferred.diameterOdMm),
    identDimension(input.thicknessMm || inferred.thicknessMm),
  ];
  if (parts.some((part) => !part)) return '';
  if (itemType === 'BEND') {
    const degree = identDimension(input.degree || inferred.degree);
    if (!degree) return '';
    parts.push(degree);
  }
  return parts.join('-');
}

function measurementNumber(value = '') {
  const source = text(value).replace(',', '.');
  const mixed = source.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + (Number(mixed[2]) / Number(mixed[3]));
  const fraction = source.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(source);
  return Number.isFinite(number) ? number : 0;
}

function measurement(source, labels) {
  const token = '(\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+)';
  const match = String(source).match(new RegExp(`(?:${labels})\\s*[:=]?\\s*${token}\\s*(MM|M|INCHES|INCH|IN|\")`, 'i'));
  if (!match) return { value: '', unit: '' };
  const value = measurementNumber(match[1]); const unit = match[2].toUpperCase();
  if (['IN', 'INCH', 'INCHES', '"'].includes(unit)) return { value: rounded(value * 25.4), unit: 'mm' };
  return { value: rounded(value), unit: unit === 'MM' ? 'mm' : unit };
}

function inferredMaterialGrade(description = '') {
  return String(description).split(/\r?\n/).map(text).find((line) => (
    /^(?:DNV(?:GL)?\s*[A-Z0-9 -]+|UNS\s*S\d{5}|ASTM\s*[A-Z0-9 -]+|AISI\s*\d{3}[A-Z]*)$/i.test(line)
  )) || '';
}

function inferredClassification(description = '', grade = '') {
  const source = `${description} ${grade}`.toUpperCase();
  if (/SUPER\s*DUPLEX|25\s*CR|S32750|S32760/.test(source)) return 'SUPERDUPLEX';
  if (/\bDUPLEX\b|22\s*CR|S31803|S32205/.test(source)) return 'DUPLEX';
  if (/CARBON\s*STEEL|\bCS\b|DNV(?:GL)?\s*450/.test(source)) return 'CARBON STEEL';
  if (/STAINLESS\s*STEEL|\bAISI\s*(?:304|316)|\bSS\b/.test(source)) return 'STAINLESS STEEL';
  return '';
}

function inferredItemType(description = '') {
  const source = String(description).toUpperCase();
  if (/WELDING\s*CONSUMABLES?|WELDING\s*(?:WIRE|ELECTRODES?)|\bELECTRODES?\b/.test(source)) return 'WELDING CONSUMABLES';
  if (/TEST\s*RING/.test(source)) return 'TEST RING';
  if (/BEND\s*ANGLE|INDUCTION\s*BEND|\bBENDS?\b/.test(source)) return 'BEND';
  if (/\bGASKETS?\b/.test(source)) return 'GASKET';
  if (/\bFLANGES?\b/.test(source)) return 'FLANGE';
  if (/\b(?:ELBOW|TEE|REDUCER|FITTING)S?\b/.test(source)) return 'FITTING';
  if (/MOTHER\s*PIPE|\bPIPES?\b|\bSPOOL\b|\bTUBOS?\b/.test(source)) return 'PROCESS PIPE';
  if (/\bPLATES?\b/.test(source)) return 'PLATE';
  if (/\bROUND\s*BARS?\b/.test(source)) return 'ROUND BAR';
  if (/\bBEAMS?\b/.test(source)) return 'BEAM';
  if (/\bTUBULARS?\b/.test(source)) return 'TUBULAR';
  if (/\bTUBES?\b/.test(source)) return 'TUBE';
  if (/\bBOLTS?\b/.test(source)) return 'BOLT';
  if (/\bNUTS?\b/.test(source)) return 'NUT';
  if (/\bWASHERS?\b/.test(source)) return 'WASHER';
  if (/\bPROFILES?\b/.test(source)) return 'PROFILE';
  return '';
}

export function inferPurchaseOrderMaterialFields(description = '') {
  const grade = inferredMaterialGrade(description);
  const compactDimensions = String(description).match(/\bD\s*(\d+(?:[.,]\d+)?)\s*(?:X|×)\s*(\d+(?:[.,]\d+)?)/i);
  const diameter = measurement(description, '\\b(?:OD|OUTSIDE DIAMETER|DIAMETER O\\.?D\\.?)\\b');
  const thickness = measurement(description, '\\b(?:WT|WALL THICKNESS|THICKNESS|THK)\\b');
  const length = measurement(description, '\\b(?:UNIT LENGTH|TANGENT LENGTH|TOTAL LENGTH|LENGTH\\/AREA|LENGTH|AREA)\\b');
  const degree = text(String(description).match(/\b(?:BEND\s*)?(?:ANGLE|DEGREE)\s*:?\s*(\d+(?:[.,]\d+)?)/i)?.[1]);
  return {
    itemClassification: inferredClassification(description, grade),
    itemType: inferredItemType(description),
    diameterOdMm: diameter.value || optionalDecimal(compactDimensions?.[1]),
    thicknessMm: thickness.value || optionalDecimal(compactDimensions?.[2]),
    degree: optionalDecimal(degree),
    materialGrade: grade,
    lengthArea: length.value,
    lengthAreaUnit: length.unit,
  };
}

function drawbackFlag(value) {
  const source = normalizedHeader(value);
  if (['yes', 'sim', 'y', 'true', '1'].includes(source)) return 'YES';
  if (['no', 'nao', 'n', 'false', '0'].includes(source)) return 'NO';
  return '';
}

function isoDate(value) {
  const source = text(value);
  const match = source.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(source) ? source : source;
}

function valueFromObject(input, aliases) {
  const entries = Object.entries(input || {});
  const match = entries.find(([key]) => aliases.includes(normalizedHeader(key)));
  return match ? match[1] : '';
}

export function normalizePurchaseOrderImportRow(input = {}) {
  const row = {};
  PURCHASE_ORDER_IMPORT_COLUMNS.forEach((column) => { row[column.key] = text(valueFromObject(input, ALIASES[column.key] || [normalizedHeader(column.label)])); });
  const poNumberItem = text(valueFromObject(input, ALIASES.poNumberItem));
  row.equipmentDestination = text(valueFromObject(input, ALIASES.equipmentDestination));
  row.poNumber = row.poNumber || poNumberItem.split('-')[0] || '';
  row.poItem = row.poItem || poNumberItem.split('-').slice(1).join('-') || '';
  row.poDocDate = isoDate(row.poDocDate);
  row.deliveryDate = isoDate(row.deliveryDate);
  row.poQuantity = decimal(row.poQuantity);
  row.unitPrice = optionalDecimal(row.unitPrice);
  row.diameterOdMm = optionalDecimal(row.diameterOdMm);
  row.thicknessMm = optionalDecimal(row.thicknessMm);
  row.degree = optionalDecimal(row.degree);
  row.lengthArea = optionalDecimal(row.lengthArea);
  row.poRevision = row.poRevision.replace(/^0+(?=\d)/, '') || row.poRevision;
  row.poUnit = row.poUnit.toUpperCase();
  row.drawback = drawbackFlag(row.drawback);
  row.currency = text(input.currency).toUpperCase();
  row.materialCode = text(input.materialCode);
  const inferred = inferPurchaseOrderMaterialFields(row.itemDescription);
  ['itemClassification', 'itemType', 'diameterOdMm', 'thicknessMm', 'degree', 'materialGrade', 'lengthArea', 'lengthAreaUnit']
    .forEach((key) => { if (row[key] === '') row[key] = inferred[key]; });
  if (!row.identCode) row.identCode = generatePurchaseOrderIdentCode(row);
  return row;
}

export function parsePurchaseOrderRows(source = []) {
  if (!Array.isArray(source) || !source.length) return [];
  if (!Array.isArray(source[0])) return source.map(normalizePurchaseOrderImportRow).filter((row) => row.vendor || row.poNumber || row.poItem);
  const [headers, ...records] = source;
  return records.map((record) => normalizePurchaseOrderImportRow(Object.fromEntries(headers.map((header, index) => [header, record[index] ?? '']))))
    .filter((row) => row.vendor || row.poNumber || row.poItem);
}

export function findPurchaseOrderHeaderRow(source = [], maxRows = 20) {
  if (!Array.isArray(source) || !source.length || !Array.isArray(source[0])) return 0;
  let bestIndex = 0; let bestScore = -1;
  source.slice(0, Math.max(1, maxRows)).forEach((row, index) => {
    const headers = new Set((row || []).map(normalizedHeader).filter(Boolean));
    const score = Object.values(ALIASES).reduce((total, aliases) => total + (aliases.some((alias) => headers.has(alias)) ? 1 : 0), 0);
    const hasIdentity = [...(ALIASES.poNumber || []), ...(ALIASES.poNumberItem || []), ...(ALIASES.identCode || [])].some((alias) => headers.has(alias));
    if (hasIdentity && score > bestScore) { bestIndex = index; bestScore = score; }
  });
  return bestIndex;
}

function splitDelimitedLine(line, delimiter) {
  const values = []; let value = ''; let quoted = false; let atFieldStart = true;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"' && quoted) { quoted = false; atFieldStart = false; }
    else if (char === '"' && atFieldStart) quoted = true;
    else if (char === delimiter && !quoted) { values.push(value); value = ''; atFieldStart = true; }
    else { value += char; if (char.trim()) atFieldStart = false; }
  }
  values.push(value); return values;
}

export function parseDelimitedPurchaseOrderText(value = '') {
  const source = String(value).replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0];
  if (!firstLine.trim()) return [];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const records = []; let record = ''; let quoted = false; let atFieldStart = true;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && source[index + 1] === '"' && quoted) { record += '""'; index += 1; }
    else if (char === '"' && quoted) { quoted = false; atFieldStart = false; record += char; }
    else if (char === '"' && atFieldStart) { quoted = true; record += char; }
    else if (char === delimiter && !quoted) { record += char; atFieldStart = true; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (record.trim()) records.push(splitDelimitedLine(record, delimiter));
      record = ''; atFieldStart = true; if (char === '\r' && source[index + 1] === '\n') index += 1;
    } else { record += char; if (char.trim()) atFieldStart = false; }
  }
  if (record.trim()) records.push(splitDelimitedLine(record, delimiter));
  return parsePurchaseOrderRows(records);
}

function poItemFromSapLine(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 10 && number % 10 === 0 ? String(number / 10) : text(value);
}

const VENDOR_LEGAL_SUFFIX = /\b(?:S\.?P\.?A\.?|S\.?R\.?L\.?|S\.?A\.?|S\.?A\.?U\.?|LTDA?|LTD|INC|GMBH|LLC|N\.?V\.?|B\.?V\.?|CORP\.?|CO\.?)\.?$/i;

/**
 * Fallback vendor name when it isn't encoded in the filename: SAP PO letterheads (and the repeating
 * page footer "Vendor / code / name") end the SUPPLIER company line with a legal-entity suffix
 * (S.P.A., S.R.L., LTD, GMBH...). PURCHASER is always Saipem, so that line is explicitly excluded.
 */
function vendorFromPdfLetterhead(layoutSource = '') {
  const lines = String(layoutSource).split(/\r?\n/).map(text).filter(Boolean);
  const candidate = lines.find((line) => line.length <= 80 && VENDOR_LEGAL_SUFFIX.test(line) && !/^SAIPEM\b/i.test(line));
  return text(candidate).replace(/^Vendor\s+/i, '').replace(/^\d+\s+/, '');
}

function subjectFromPdf(source = '') {
  const match = source.match(/Subject:\s*([\s\S]{1,300}?)(?=\n\s*(?:The subject|Job\s*:|Our reference))/i);
  return text(match?.[1]).split(/\r?\n/).map(text).filter(Boolean).join(' ');
}

function sapItemBlocks(source = '') {
  const starts = [...source.matchAll(/^\s*(\d+)\s+Commodity code:\s*([^\s]+).*$/gmi)];
  return starts.map((match, index) => ({
    itemNumber: match[1],
    value: source.slice(match.index, starts[index + 1]?.index ?? source.length),
  }));
}

function sapMaterialItem(block = {}) {
  const lines = String(block.value || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const valuesPattern = /^(.*?)\s+(\d+(?:[.,]\d+)?)\s+(PCS|EA|M|KG|T|M2|M3)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d{1,2}[./]\d{1,2}[./]\d{4})$/i;
  const valuesIndex = lines.findIndex((line) => valuesPattern.test(line));
  if (valuesIndex < 0) return null;
  const values = lines[valuesIndex].match(valuesPattern);
  const details = [values[1]];
  for (let index = valuesIndex + 1; index < lines.length; index += 1) {
    if (/^(?:PR|Rq\.Center|G\/L account|WbE|Un\. Point)\b/i.test(lines[index])) break;
    if (/^(?:INTERNAL USE|Purchase Order No\.|Item Description|Total supply|Total extra costs|Total order)\b/i.test(lines[index])) continue;
    details.push(lines[index].replace(/^(BEND ANGLE:\s*\d+(?:[.,]\d+)?)\?$/i, '$1°'));
  }
  return {
    poItem: block.itemNumber,
    itemDescription: details.join('\n'),
    poQuantity: values[2],
    poUnit: values[3],
    unitPrice: values[4],
    deliveryDate: values[6],
  };
}

const SAIPEM_UNIT_TOKEN = 'PCS|EA|SET|NO|UN|L|T|KG|M2|M3|M';
const SAIPEM_ITEM_LINE = new RegExp(`^(\\d{1,4})\\s+(.+)\\s+(\\d+(?:[.,]\\d+)?)\\s+(${SAIPEM_UNIT_TOKEN})\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+(\\d{1,2}[./]\\d{1,2}[./]\\d{4})\\s*$`, 'i');
const SAIPEM_DELETED_LINE = /^(\d{1,4})\s+(.+)\s+DELETED\s+([\d.,]+)\s*$/i;
const SAIPEM_EXTRA_COST_LINE = /^\d{1,4}\s+GENERAL\s+EXTRAPRICE\b/i;
const SAIPEM_NOISE_LINE = /^(?:Vendor$|Purchase Order No\.?\s*\d|dated\s+\d|Revision No\.?\s*\d|Pg\.?\s*\d+$|of\s*\d+$|Item\s+Description\s+Quantity\s+UM\s+Price|^Date$|USD\s+USD|_{5,})/i;
const SAIPEM_PURE_NUMBER_LINE = /^\d{1,6}$/;
const SAIPEM_STOP_LINE = /^Total\s+supply\b/i;

/**
 * Saipem "pricing list" PDF format (e.g. FCA/DALMINE bare-pipe POs): each item is a table row with
 * Item / Description / Quantity / UM / Price / Amount / Delivery Date on the same line, followed by
 * wrapped description/attribute lines (FIELD LOCATION, grade, OD/WT, MR ITEM, UNIT LENGTH, COATING,
 * source PO ITEM reference) until the next item number or the "Total supply" summary section.
 */
function saipemPricingListBlocks(layoutSource = '') {
  const rawLines = String(layoutSource).split(/\r?\n/).map(text);
  const stopIndex = rawLines.findIndex((line) => SAIPEM_STOP_LINE.test(line));
  const lines = stopIndex >= 0 ? rawLines.slice(0, stopIndex) : rawLines;
  const starts = [];
  lines.forEach((line, index) => {
    if (!line || SAIPEM_EXTRA_COST_LINE.test(line)) return;
    if (SAIPEM_ITEM_LINE.test(line) || SAIPEM_DELETED_LINE.test(line)) starts.push(index);
  });
  return starts.map((startIndex, order) => {
    const endIndex = starts[order + 1] ?? lines.length;
    const headLine = lines[startIndex];
    const qtyMatch = headLine.match(SAIPEM_ITEM_LINE);
    const deletedMatch = !qtyMatch ? headLine.match(SAIPEM_DELETED_LINE) : null;
    const match = qtyMatch || deletedMatch;
    if (!match) return null;
    const detailLines = lines.slice(startIndex + 1, endIndex)
      .filter((line) => line && !SAIPEM_NOISE_LINE.test(line) && !SAIPEM_PURE_NUMBER_LINE.test(line));
    return {
      poItem: match[1],
      itemDescription: [match[2], ...detailLines].join('\n'),
      poQuantity: qtyMatch ? qtyMatch[3] : '',
      poUnit: qtyMatch ? qtyMatch[4] : '',
      unitPrice: qtyMatch ? qtyMatch[5] : '',
      deliveryDate: qtyMatch ? qtyMatch[7] : '',
    };
  }).filter(Boolean);
}

function legacyPdfCandidates(source, defaults) {
  const candidates = [];
  const itemPattern = /(.{0,900}?)(\d+(?:[.,]\d+)?)\s+(PCS|EA|M|KG)\b(.{0,900}?)PR\s*Item\.?\s*(\d+)/gi;
  let match;
  while ((match = itemPattern.exec(source)) && candidates.length < 300) {
    const description = text(`${match[1]} ${match[4]}`).replace(/^.*?Revision No\.?\s*\d+/i, '').slice(-900);
    const itemType = /\bBEND\b/i.test(description) ? 'BEND' : /TEST RING/i.test(description) ? 'TEST RING' : /PIPE/i.test(description) ? 'PROCESS PIPE' : '';
    candidates.push(normalizePurchaseOrderImportRow({
      ...defaults, poItem: poItemFromSapLine(match[5]), itemType, itemDescription: description, poQuantity: match[2], poUnit: match[3],
      diameterOdMm: description.match(/\bOD\s*:?\s*(\d+(?:[.,]\d+)?)/i)?.[1] || '',
      thicknessMm: description.match(/\b(?:CS\s*)?WT\s*:?\s*(\d+(?:[.,]\d+)?)/i)?.[1] || '',
      materialGrade: description.match(/\bDNV(?:GL)?\s*(?:SMLS\s*)?(\d+\s*[A-Z]+)/i)?.[1] || '',
      lengthArea: description.match(/(?:UNIT LENGTH|TANGENT LENGTH)\s*:?\s*(\d+(?:[.,]\d+)?)/i)?.[1] || '',
      lengthAreaUnit: /TANGENT LENGTH/i.test(description) ? 'mm' : 'M',
    }));
  }
  return candidates;
}

export function parsePurchaseOrderPdfText(value = '', fileName = '') {
  const layoutSource = String(value).replace(/\r/g, '').trim();
  const source = layoutSource.replace(/\s+/g, ' ').trim();
  const nameMatch = fileName.match(/PO\s*(\d+)_R(\d+)_([^_]+)(?:_(.+))?/i);
  const headerMatch = source.match(/Purchase Order No\.?\s*(\d+)[,\s]+dated\s+(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
  const revisionMatch = source.match(/Revision No\.?\s*(\d+)/i);
  const poNumber = headerMatch?.[1] || nameMatch?.[1] || '';
  const poRevision = revisionMatch?.[1] || nameMatch?.[2] || '';
  const poDocDate = isoDate(headerMatch?.[2] || '');
  const vendor = text(nameMatch?.[3]).replace(/\s+-\s+Unpriced$/i, '') || vendorFromPdfLetterhead(layoutSource);
  const task = subjectFromPdf(layoutSource) || text(nameMatch?.[4]).replace(/\.pdf$/i, '');
  const vendorCode = text(source.match(/Vendor\s+code\s*:\s*([A-Z0-9-]+)/i)?.[1]);
  const currency = text(source.match(/Item Description\s+Quantity\s+UM\s+Price[\s\S]{0,80}?\b([A-Z]{3})\b/i)?.[1]) || 'EUR';
  const defaults = { vendor, vendorCode, poNumber, poRevision, poDocDate, task, currency };
  const candidates = sapItemBlocks(layoutSource).map(sapMaterialItem).filter(Boolean)
    .map((item) => normalizePurchaseOrderImportRow({ ...defaults, ...item }));
  if (!candidates.length) candidates.push(...legacyPdfCandidates(source, defaults));
  if (!candidates.length) candidates.push(...saipemPricingListBlocks(layoutSource).map((item) => normalizePurchaseOrderImportRow({ ...defaults, ...item })));
  if (!candidates.length) candidates.push(normalizePurchaseOrderImportRow({ vendor, poNumber, poRevision, poDocDate, task }));
  return candidates;
}

export function validatePurchaseOrderImportRows(rows = []) {
  return rows.map((row, index) => {
    const errors = [];
    if (!text(row.vendor)) errors.push('VENDOR obrigatório');
    if (!text(row.poNumber)) errors.push('PO Number obrigatório');
    if (!text(row.poItem)) errors.push('PO Item obrigatório');
    if (!['YES', 'NO'].includes(text(row.drawback).toUpperCase())) errors.push('DRAWBACK deve ser Sim ou Não');
    if (Number(row.poQuantity) < 0) errors.push('PO Quantity inválida');
    return { index, valid: errors.length === 0, errors };
  });
}
