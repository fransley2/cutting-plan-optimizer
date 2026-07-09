import { readExcelFile } from './excel.js';

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
  drawing: ['DrawingNº', 'DrawingN°', 'DrawingN�', 'DrawingNo', 'Drawing Nº', 'Drawing Number', 'Drawing', 'DWG', 'DWG Number', 'drawing', 'dwg', 'dwgNumber', 'dwg_number', 'drawingNumber', 'drawing_number'],
  revision: ['Revision', 'revision', 'rev', 'REV', 'Rev.'],
  mark: ['Mark', 'mark', 'MARK', 'partMark', 'part_mark'],
  pos: ['Position', 'POS', 'pos', 'position', 'itemPos', 'item_pos'],
  qty: ['Quantity', 'Qty', 'QTY', 'Quantidade', 'qty', 'quantity', 'QUANTITY'],
  description: ['Description', 'description', 'desc', 'DESC', 'itemDescription', 'item_description'],
  cutLength: ['Length/mm', 'Length', 'Cut Length', 'Comp. Corte (mm)', 'comprimento', 'Comprimento', 'cutLength', 'cut_length', 'length', 'cutL', 'Cut L.'],
  identCode: ['IdentCode', 'Ident Code', 'identCode', 'Code'],
  tag: ['Tag'],
  weightKg: ['Weight/kg'],
  externalSurfaceM2: ['ExternalSurface/m2'],
  paintingSurfaceM2: ['PaintingSurface/m2'],
  icon: ['Icone', 'Icon'],
  positionStatus: ['PositionStatus'],
  constructionActivity: ['ConstructionActivity'],
  equipmentName: ['Equipment Name', 'EquipmentName', 'equipmentName', 'Equipment'],
  material: ['Material', 'material', 'Grade', 'materialGrade', 'material_grade', 'grade'],
  line: ['Line'],
  type: ['Type'],
  mountErection: ['Mount/Erection'],
  instrument: ['Instrument'],
  discipline: ['Discipline'],
  profile: ['profile', 'section', 'Section', 'perfil', 'Perfil'],
  priority: ['priority', 'Priority', 'prioridade', 'Prioridade'],
};

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

function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s*(mm|kg|m2|m²)$/i, '')
    .replace(',', '.')
    .trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
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

function valueFromAliases(row, field) {
  const aliases = NORMALIZED_ALIASES[field] || [];
  const values = normalizedRowMap(row);
  for (const alias of aliases) {
    if (values.has(alias)) return values.get(alias);
  }
  return '';
}

function fieldValue(row, field) {
  return valueFromAliases(row, field);
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
  if (numberValue(item.qty) <= 0) errors.push('Invalid quantity');
  if (numberValue(item.cutLength) <= 0) errors.push('Invalid cut length');
  return errors;
}

export function normalizeMtoRow(row, options = {}) {
  const source = row && typeof row === 'object' ? row : {};
  const qty = numberValue(fieldValue(source, 'qty'));
  const cutLength = numberValue(fieldValue(source, 'cutLength'));
  const requiredLength = options.requiredLength == null
    ? qty * cutLength
    : numberValue(options.requiredLength);
  const description = text(fieldValue(source, 'description'));
  const metadataOptions = objectValue(options.metadata);
  const metadata = {
    ...metadataOptions,
    originalRow: { ...source },
    engineering: {
      ...engineeringMetadata(source),
      ...(metadataOptions.engineering || {}),
    },
  };

  const item = {
    id: '',
    batchId: text(options.batchId),
    projectId: text(options.projectId),
    free: text(fieldValue(source, 'free')),
    drawing: text(fieldValue(source, 'drawing')),
    revision: text(fieldValue(source, 'revision')),
    mark: text(fieldValue(source, 'mark')),
    pos: text(fieldValue(source, 'pos')),
    qty,
    description,
    cutLength,
    requiredLength,
    identCode: text(fieldValue(source, 'identCode')),
    tag: text(fieldValue(source, 'tag')),
    weightKg: numberValue(fieldValue(source, 'weightKg')),
    externalSurfaceM2: numberValue(fieldValue(source, 'externalSurfaceM2')),
    paintingSurfaceM2: numberValue(fieldValue(source, 'paintingSurfaceM2')),
    icon: text(fieldValue(source, 'icon')),
    positionStatus: text(fieldValue(source, 'positionStatus')),
    constructionActivity: text(fieldValue(source, 'constructionActivity')),
    equipmentName: text(fieldValue(source, 'equipmentName')),
    material: text(fieldValue(source, 'material')),
    line: text(fieldValue(source, 'line')),
    type: text(fieldValue(source, 'type')),
    mountErection: text(fieldValue(source, 'mountErection')),
    instrument: text(fieldValue(source, 'instrument')),
    discipline: text(fieldValue(source, 'discipline')),
    profile: text(fieldValue(source, 'profile')) || description,
    priority: text(fieldValue(source, 'priority')),
    status: text(options.defaultStatus),
    sourceRowNumber: numberValue(options.sourceRowNumber),
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
    : await readExcelFile(file);
  return {
    ...parseMtoRows(rows, options),
    file: {
      name: file?.name || '',
      size: file?.size || 0,
      type: file?.type || '',
    },
  };
}
