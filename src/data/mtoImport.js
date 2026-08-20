import { readExcelFile } from './excel.js';
import { parseLocalizedNumber } from '../core/utils.js';

export const MTO_REQUIRED_FIELDS = Object.freeze([
  'drawing',
  'mark',
  'pos',
  'qty',
  'material',
  'cutLength',
]);

const ENGINEERING_FIELDS = [
  'Rev,Type',
  'Rev,Code',
  'ABSS',
  'ABSSubssemblydraw',
  'ABSSubssemblydrawrev,',
  'ABSA',
  'ABSAssemblydraw',
  'ABSAssemblydrawrev,',
  'ABSB',
  'ABSBlockdraw',
  'ABSBlockdrawrev,',
  'ABSW',
  'ABSWorkPackdraw',
  'ABSWorkPackdrawrev,',
  'ABSE',
  'ABSErectionBlockdraw',
  'ABSErectionBlockdrawrev,',
  'SBSWorkpack',
  'SBSArea',
  'SBSClass',
  'SBSFunctionalGroup',
];

const FIELD_ALIASES = {
  free: ['Free'],
  drawing: ['DrawingNº', 'DrawingN°', 'DrawingN�', 'DrawingNo', 'Drawing Nº', 'Drawing Number', 'Shop Drawing Name', 'Drawing', 'DWG', 'DWG Number', 'drawing', 'dwg', 'dwgNumber', 'dwg_number', 'drawingNumber', 'drawing_number'],
  revision: ['Revision', 'Shop Drawing Revision Number', 'revision', 'rev', 'REV', 'Rev.'],
  mark: ['Mark', 'SPOOL', 'mark', 'MARK', 'partMark', 'part_mark'],
  pos: ['Position', 'POS', 'pos', 'position', 'itemPos', 'item_pos'],
  qty: ['Quantity', 'Qty', 'QTY', 'Quantidade', 'qty', 'quantity', 'QUANTITY'],
  description: ['Description', 'Material Description Detail', 'description', 'desc', 'DESC', 'itemDescription', 'item_description'],
  cutLength: ['Length/mm', 'Lenght (mm)', 'Length (mm)', 'Length', 'Cut Length', 'Comp. Corte (mm)', 'comprimento', 'Comprimento', 'cutLength', 'cut_length', 'length', 'cutL', 'Cut L.'],
  identCode: ['IdentCode', 'Ident Code', 'IDENT (Mark for Gemapi)', 'identCode', 'Code'],
  tag: ['Tag', 'Tag (*)'],
  weightKg: ['Weight/kg', 'Weight (kg)'],
  externalSurfaceM2: ['ExternalSurface/m2', 'External Surface (mq)', 'External Surface (m2)'],
  paintingSurfaceM2: ['PaintingSurface/m2'],
  icon: ['Icone', 'Icon'],
  positionStatus: ['PositionStatus', 'Position Status (**)'],
  constructionActivity: ['ConstructionActivity'],
  equipmentName: ['Equipment Name', 'EquipmentName', 'equipmentName', 'Equipment'],
  material: ['Material', 'material', 'Grade', 'materialGrade', 'material_grade', 'grade'],
  line: ['Line'],
  type: ['Type'],
  mountErection: ['Mount/Erection', 'Prefabrication / Erection'],
  instrument: ['Instrument', 'Instrument (***)'],
  discipline: ['Discipline', 'Discipline (Piping)'],
  profile: ['profile', 'section', 'Section', 'perfil', 'Perfil'],
  priority: ['priority', 'Priority', 'prioridade', 'Prioridade'],
};

export const MTO_IMPORT_COLUMN_DEFINITIONS = Object.freeze([
  { field: 'drawing', label: 'Drawing', required: true },
  { field: 'revision', label: 'Revision', required: false },
  { field: 'mark', label: 'Mark', required: true },
  { field: 'pos', label: 'Position', required: true },
  { field: 'qty', label: 'Quantity', required: true },
  { field: 'description', label: 'Description', required: false },
  { field: 'cutLength', label: 'Length/mm', required: true },
  { field: 'material', label: 'Material', required: true },
  { field: 'identCode', label: 'IdentCode', required: false },
  { field: 'tag', label: 'Tag', required: false },
  { field: 'weightKg', label: 'Weight/kg', required: false },
  { field: 'externalSurfaceM2', label: 'ExternalSurface/m2', required: false },
  { field: 'positionStatus', label: 'PositionStatus', required: false },
  { field: 'line', label: 'Line', required: false },
  { field: 'type', label: 'Type', required: false },
  { field: 'mountErection', label: 'Mount/Erection', required: false },
  { field: 'instrument', label: 'Instrument', required: false },
  { field: 'discipline', label: 'Discipline', required: false },
]);

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
    field,
    aliases.map((alias) => normalizeMtoHeaderKey(alias)),
  ]),
);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function stripBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '');
}

export function decodeMtoTextFromArrayBuffer(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array
    ? arrayBuffer
    : new Uint8Array(arrayBuffer || []);

  if (typeof TextDecoder !== 'undefined') {
    try {
      return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      try {
        return stripBom(new TextDecoder('windows-1252').decode(bytes));
      } catch {
        // Fall through to latin1-like decoding for older browser runtimes.
      }
    }
  }

  let decoded = '';
  bytes.forEach((byte) => {
    decoded += String.fromCharCode(byte);
  });
  return stripBom(decoded);
}

export function normalizeMtoHeaderKey(header) {
  const raw = stripBom(header)
    .trim()
    .replace(/\uFFFD/g, '')
    .replace(/[º°]/g, 'o');
  const normalized = typeof raw.normalize === 'function'
    ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : raw;
  return normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sourceRowNumber(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : 0;
  const normalized = String(value ?? '').trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : 0;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizedRowMap(row) {
  const map = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeMtoHeaderKey(key);
    if (!map.has(normalizedKey)) map.set(normalizedKey, value);
  });
  return map;
}

function valueFromAliases(row, field, columnMapping = {}) {
  const mappedHeader = text(columnMapping?.[field]);
  if (mappedHeader && Object.prototype.hasOwnProperty.call(row || {}, mappedHeader)) {
    return row[mappedHeader];
  }
  const aliases = NORMALIZED_ALIASES[field] || [];
  const values = normalizedRowMap(row);
  for (const alias of aliases) {
    if (values.has(alias)) return values.get(alias);
  }
  return '';
}

function fieldValue(row, field, options = {}) {
  return valueFromAliases(row, field, options.columnMapping);
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarHeader(field, headers, usedHeaders) {
  const aliases = NORMALIZED_ALIASES[field] || [];
  let best = null;
  headers.forEach((header) => {
    if (usedHeaders.has(header) || !text(header) || /^null(?:_\d+)?$/i.test(text(header))) return;
    const normalized = normalizeMtoHeaderKey(header);
    aliases.forEach((alias) => {
      if (!normalized || !alias) return;
      const score = 1 - (editDistance(normalized, alias) / Math.max(normalized.length, alias.length));
      if (score >= 0.78 && (!best || score > best.score)) best = { header, score };
    });
  });
  return best;
}

export function suggestMtoColumnMappings(sourceHeaders = []) {
  const headers = sourceHeaders.map(text).filter(Boolean);
  const normalizedHeaders = new Map(headers.map((header) => [normalizeMtoHeaderKey(header), header]));
  const usedHeaders = new Set();
  const profileHeaders = ['Shop Drawing Name', 'SPOOL', 'Material Description Detail', 'IDENT (Mark for Gemapi)'];
  const isShopDrawingProfile = profileHeaders.every((header) => normalizedHeaders.has(normalizeMtoHeaderKey(header)));

  return MTO_IMPORT_COLUMN_DEFINITIONS.map((definition) => {
    let sourceHeader = '';
    let confidence = 'none';
    let reason = 'Nenhuma coluna compativel foi encontrada. Selecione manualmente.';
    const profileHeader = isShopDrawingProfile
      ? ({ material: 'Line Specification', line: 'Notes' }[definition.field] || '')
      : '';
    if (profileHeader) {
      sourceHeader = normalizedHeaders.get(normalizeMtoHeaderKey(profileHeader)) || '';
      if (sourceHeader && !usedHeaders.has(sourceHeader)) {
        confidence = 'review';
        reason = 'Sugestao baseada no formato Shop Drawing detectado; confirme pelos valores da previa.';
      } else sourceHeader = '';
    }
    if (!sourceHeader) {
      const exact = (NORMALIZED_ALIASES[definition.field] || [])
        .map((alias) => normalizedHeaders.get(alias))
        .find((header) => header && !usedHeaders.has(header));
      if (exact) {
        sourceHeader = exact;
        confidence = 'high';
        reason = normalizeMtoHeaderKey(exact) === normalizeMtoHeaderKey(definition.label)
          ? 'Titulo reconhecido diretamente.'
          : 'Titulo alternativo reconhecido com alta confianca.';
      }
    }
    if (!sourceHeader) {
      const similar = similarHeader(definition.field, headers, usedHeaders);
      if (similar) {
        sourceHeader = similar.header;
        confidence = 'review';
        reason = 'Titulo parecido encontrado; revise antes de continuar.';
      }
    }
    if (sourceHeader) usedHeaders.add(sourceHeader);
    return { ...definition, sourceHeader, confidence, reason };
  });
}

export function mtoColumnMappingFromSuggestions(suggestions = []) {
  return Object.fromEntries(suggestions
    .filter((suggestion) => text(suggestion?.field) && text(suggestion?.sourceHeader))
    .map((suggestion) => [suggestion.field, suggestion.sourceHeader]));
}

function engineeringMetadata(row) {
  const values = normalizedRowMap(row);
  const metadata = {};
  ENGINEERING_FIELDS.forEach((field) => {
    const key = normalizeMtoHeaderKey(field);
    if (values.has(key)) metadata[field] = values.get(key);
  });
  return metadata;
}

function csvLineToCells(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

export function parseMtoCsvText(value, options = {}) {
  const textValue = stripBom(value);
  if (!textValue.trim()) return [];

  const delimiter = options.delimiter || ';';
  const lines = textValue.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== '');
  if (headerIndex < 0) return [];

  const headers = csvLineToCells(lines[headerIndex], delimiter).map((header) => text(header));
  return lines.slice(headerIndex + 1)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells = csvLineToCells(line, delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? '';
      });
      return row;
    });
}

export function validateMtoItem(item) {
  const errors = [];
  if (!text(item.drawing)) errors.push('Missing drawing');
  if (!text(item.mark)) errors.push('Missing mark');
  if (!text(item.pos)) errors.push('Missing POS');
  if (!text(item.material)) errors.push('Missing material');
  const validatePositiveMeasure = (field, label) => {
    const parsing = item?.metadata?.numericParsing?.[field] || parseLocalizedNumber(item?.[field]);
    const missing = parsing.rawValue == null || String(parsing.rawValue).trim() === '';
    if (missing) errors.push(`Missing ${label}`);
    else if (!parsing.valid) errors.push(`Invalid ${label} format`);
    else if (parsing.parsedValue <= 0) errors.push(`Invalid ${label}`);
  };
  validatePositiveMeasure('qty', 'quantity');
  validatePositiveMeasure('cutLength', 'cut length');
  return errors;
}

export function normalizeMtoRow(row, options = {}) {
  const source = row && typeof row === 'object' ? row : {};
  const sourceValue = (field) => fieldValue(source, field, options);
  const numericParsing = {
    qty: parseLocalizedNumber(sourceValue('qty')),
    cutLength: parseLocalizedNumber(sourceValue('cutLength')),
    weightKg: parseLocalizedNumber(sourceValue('weightKg')),
    externalSurfaceM2: parseLocalizedNumber(sourceValue('externalSurfaceM2')),
    paintingSurfaceM2: parseLocalizedNumber(sourceValue('paintingSurfaceM2')),
  };
  const qty = numericParsing.qty.parsedValue;
  const cutLength = numericParsing.cutLength.parsedValue;
  const explicitRequiredLength = options.requiredLength != null
    ? parseLocalizedNumber(options.requiredLength)
    : null;
  const requiredLength = explicitRequiredLength
    ? explicitRequiredLength.parsedValue
    : (qty == null || cutLength == null ? null : qty * cutLength);
  const description = text(sourceValue('description'));
  const metadataOptions = objectValue(options.metadata);
  const metadata = {
    ...metadataOptions,
    originalRow: { ...source },
    engineering: {
      ...engineeringMetadata(source),
      ...(metadataOptions.engineering || {}),
    },
    numericParsing: {
      ...(metadataOptions.numericParsing || {}),
      ...numericParsing,
      ...(explicitRequiredLength ? { requiredLength: explicitRequiredLength } : {}),
    },
    columnMapping: { ...(options.columnMapping || {}) },
  };

  const item = {
    id: '',
    batchId: text(options.batchId),
    projectId: text(options.projectId),
    free: text(sourceValue('free')),
    drawing: text(sourceValue('drawing')),
    revision: text(sourceValue('revision')),
    mark: text(sourceValue('mark')),
    pos: text(sourceValue('pos')),
    qty,
    description,
    cutLength,
    requiredLength,
    identCode: text(sourceValue('identCode')),
    tag: text(sourceValue('tag')),
    weightKg: numericParsing.weightKg.parsedValue,
    externalSurfaceM2: numericParsing.externalSurfaceM2.parsedValue,
    paintingSurfaceM2: numericParsing.paintingSurfaceM2.parsedValue,
    icon: text(sourceValue('icon')),
    positionStatus: text(sourceValue('positionStatus')),
    constructionActivity: text(sourceValue('constructionActivity')),
    equipmentName: text(sourceValue('equipmentName')),
    material: text(sourceValue('material')),
    line: text(sourceValue('line')),
    type: text(sourceValue('type')),
    mountErection: text(sourceValue('mountErection')),
    instrument: text(sourceValue('instrument')),
    discipline: text(sourceValue('discipline')),
    profile: text(sourceValue('profile')) || description,
    priority: text(sourceValue('priority')),
    status: text(options.defaultStatus),
    sourceRowNumber: sourceRowNumber(options.sourceRowNumber),
    validationErrors: [],
    metadata,
  };
  const errors = validateMtoItem(item);
  return {
    ...item,
    status: item.status || (errors.length > 0 ? 'invalid' : 'open'),
  };
}

export function parseMtoRows(rows, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const items = sourceRows.map((row, index) => {
    const item = normalizeMtoRow(row, {
      ...options,
      sourceRowNumber: options.sourceRowNumber ?? index + 1,
    });
    const validationErrors = validateMtoItem(item);
    return {
      ...item,
      validationErrors,
      status: item.status === 'invalid' || validationErrors.length > 0 ? 'invalid' : item.status || 'open',
    };
  });
  const acceptedItems = items.filter((item) => item.validationErrors.length === 0);
  const rejectedItems = items.filter((item) => item.validationErrors.length > 0);
  return {
    batch: {
      rowCount: items.length,
      acceptedCount: acceptedItems.length,
      rejectedCount: rejectedItems.length,
    },
    items,
    acceptedItems,
    rejectedItems,
  };
}

export async function parseMtoFile(file, options = {}) {
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  const rows = extension === 'csv'
    ? parseMtoCsvText(decodeMtoTextFromArrayBuffer(await file.arrayBuffer()), options)
    : await readExcelFile(file, {
      sheetName: options.sheetName,
      headerRowIndex: options.headerRowIndex,
    });
  return {
    ...parseMtoRows(rows, options),
    file: {
      name: file?.name || '',
      size: file?.size || 0,
      type: file?.type || '',
    },
  };
}
