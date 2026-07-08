import { runAllocations } from '../core/allocate.js';

const DEFAULT_REQUIRED_STOCK_FIELDS = Object.freeze(['traceability', 'heatNo', 'materialGrade']);
const DEFAULT_OFFCUT_MIN_LENGTH_MM = 100;

const DOCUMENT_DEFAULTS = Object.freeze({
  materialCoupon: Object.freeze({ code: 'MC', pattern: '{PROJECT}_FAB_MC-{SEQ:3}' }),
  cuttingSheet: Object.freeze({ code: 'CS', pattern: '{PROJECT}_FAB_CS-{SEQ:3}' }),
  returnMaterialVoucher: Object.freeze({ code: 'RMV', pattern: '{PROJECT}_FAB_RMV-{SEQ:3}' }),
});

const FIELD_ALIASES = Object.freeze({
  mtoId: ['id', 'mtoId', 'lineId', 'mark', 'Mark', 'Position'],
  quantity: ['quantity', 'qty', 'Quantity'],
  mtoLength: ['length', 'lengthMm', 'Length/mm', 'Length [mm]', 'cutLength'],
  description: ['description', 'Description', 'materialDescription'],
  drawing: ['drawing', 'DrawingNº', 'drawingNo', 'dwgNumber'],
  revision: ['revision', 'Revision'],
  mark: ['mark', 'Mark'],
  position: ['position', 'Position', 'pos', 'POS'],
  tag: ['tag', 'Tag'],
  materialType: ['materialType', 'itemCategory', 'Item Category', 'category', 'type'],
  materialGrade: ['materialGrade', 'matGrade', 'Mat. Grade', 'grade', 'material'],
  identCode: ['identCode', 'IdentCode', 'SAP Code', 'sapCode'],
  stockId: ['id', 'stockId', 'materialId', 'traceability', 'trace'],
  stockLength: ['length', 'lengthMm', 'Length/mm', 'Length [mm]', 'currentLength', 'originalLength'],
  traceability: ['traceability', 'Traceability', 'trace'],
  heatNo: ['heatNo', 'heatNumber', 'Heat No.', 'heat'],
  sapCode: ['sapCode', 'SAP Code', 'IdentCode', 'identCode'],
  weight: ['weight', 'weightKg', 'Weight/kg'],
  location: ['location', 'warehouseLocation'],
  poItem: ['poItem', 'PO ITEM', 'purchaseOrder', 'po'],
  nfArrival: ['nfArrival', 'NF arrival', 'invoice', 'nf'],
  projectName: ['project', 'Project', 'projectName', 'Project Name'],
  equipment: ['equipment', 'Equipment', 'tag', 'Tag'],
});

export class CuttingPackageValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'CuttingPackageValidationError';
    this.details = details;
  }
}

export function createCuttingPackage(input = {}) {
  const {
    mtoItems = [],
    stockItems = [],
    settings = {},
    createdBy = '',
    now,
    nestingOptions = {},
  } = input;
  const createdAt = new Date(now || Date.now()).toISOString();
  const warnings = [];

  validateSelectedArrays(mtoItems, stockItems);
  const mtoValidation = validateMtoItems(mtoItems);
  const stockValidation = validateStockItems(stockItems);
  const traceabilityValidation = validateStockTraceability(stockItems, settings);
  const validationErrors = [
    ...mtoValidation.errors,
    ...stockValidation.errors,
    ...traceabilityValidation.errors,
  ];

  warnings.push(...mtoValidation.warnings, ...stockValidation.warnings, ...traceabilityValidation.warnings);

  if (validationErrors.length) {
    throw new CuttingPackageValidationError('Invalid input for cutting package creation.', {
      errors: validationErrors,
      warnings,
    });
  }

  const expandedParts = expandMtoItemsByQuantity(mtoItems);
  const normalizedStock = expandStockItemsByQuantity(stockItems);
  const projectData = resolveProjectData({
    mtoItems,
    stockItems,
    expandedParts,
    stock: normalizedStock,
    now: createdAt,
  }, settings);
  const nestingResult = runNestingAdapter(expandedParts, normalizedStock, settings, nestingOptions);
  const normalizedResult = normalizeNestingResult(nestingResult, {
    expandedParts,
    stock: normalizedStock,
    projectData,
  }, settings);

  const documentContext = {
    projectData,
    mtoItems,
    stockItems,
    parts: expandedParts,
    stock: normalizedStock,
    now: createdAt,
  };
  const materialCouponNo = generateDocumentNumber('materialCoupon', documentContext, settings);
  const cuttingSheetNo = generateDocumentNumber('cuttingSheet', documentContext, settings);
  const returnMaterialVoucherNo = hasUsableOffcuts(normalizedResult.generatedOffcuts)
    ? generateDocumentNumber('returnMaterialVoucher', documentContext, settings)
    : null;

  const id = buildCuttingPackageId({ projectData, now: createdAt }, settings);
  const cuttingPackage = {
    id,
    projectData,
    materialCouponNo,
    cuttingSheetNo,
    returnMaterialVoucherNo,
    mtoItems: mtoItems.map((item) => ({ ...item })),
    stockUsed: normalizedResult.stockResults,
    unplacedParts: normalizedResult.unplacedParts,
    generatedOffcuts: normalizedResult.generatedOffcuts,
    scrapItems: normalizedResult.scrapItems,
    totalStockLength: normalizedResult.totalStockLength,
    totalNestedLength: normalizedResult.totalNestedLength,
    totalRemaining: normalizedResult.totalRemaining,
    utilization: normalizedResult.utilization,
    status: 'DRAFT',
    createdAt,
    createdBy: normalizeString(createdBy),
  };

  const auditLog = createAuditLog({
    entityId: id,
    projectData,
    createdAt,
    createdBy,
    mtoRowsSelected: mtoItems.length,
    expandedParts: expandedParts.length,
    stockItemsSelected: stockItems.length,
    stockItemsUsed: normalizedResult.stockResults.length,
    unplacedParts: normalizedResult.unplacedParts.length,
    offcutsGenerated: normalizedResult.generatedOffcuts.length,
    scrapItems: normalizedResult.scrapItems.length,
    metrics: {
      totalStockLength: normalizedResult.totalStockLength,
      totalNestedLength: normalizedResult.totalNestedLength,
      totalRemaining: normalizedResult.totalRemaining,
      utilization: normalizedResult.utilization,
    },
    documents: {
      materialCouponNo,
      cuttingSheetNo,
      returnMaterialVoucherNo,
    },
    warnings,
  });

  return { cuttingPackage, auditLog, warnings };
}

export function validateStockTraceability(stockItems, settings = {}) {
  const requiredFields = getRequiredStockFields(settings);
  const errors = [];
  const warnings = [];

  (Array.isArray(stockItems) ? stockItems : []).forEach((item, index) => {
    const stockId = getFirstValue(item, FIELD_ALIASES.stockId, `stock-${index + 1}`);
    requiredFields.forEach((field) => {
      const fieldAliases = FIELD_ALIASES[field] || [field];
      if (!normalizeString(getFirstValue(item, fieldAliases))) {
        errors.push({
          index,
          stockId,
          field,
          message: `Missing required stock traceability field: ${field}.`,
          item,
        });
      }
    });
  });

  return { valid: errors.length === 0, errors, warnings };
}

export function expandMtoItemsByQuantity(mtoItems = []) {
  return (Array.isArray(mtoItems) ? mtoItems : []).flatMap((item, itemIndex) => {
    const sourceMtoId = normalizeString(getFirstValue(item, FIELD_ALIASES.mtoId, `MTO-${itemIndex + 1}`));
    const quantity = toPositiveInteger(getFirstValue(item, FIELD_ALIASES.quantity), 1);
    const requiredLength = toNumber(getFirstValue(item, FIELD_ALIASES.mtoLength), 0);
    return Array.from({ length: quantity }, (_, index) => ({
      id: `${sourceMtoId}#${index + 1}`,
      sourceMtoId,
      sequence: index + 1,
      requiredLength,
      length: requiredLength,
      description: getFirstValue(item, FIELD_ALIASES.description),
      drawing: getFirstValue(item, [...FIELD_ALIASES.drawing, 'DrawingNº', 'DrawingNo', 'Drawing Number']),
      revision: getFirstValue(item, FIELD_ALIASES.revision),
      mark: getFirstValue(item, FIELD_ALIASES.mark),
      position: getFirstValue(item, FIELD_ALIASES.position),
      pos: getFirstValue(item, FIELD_ALIASES.position),
      tag: getFirstValue(item, FIELD_ALIASES.tag),
      materialType: getFirstValue(item, FIELD_ALIASES.materialType),
      materialGrade: getFirstValue(item, FIELD_ALIASES.materialGrade),
      material: getFirstValue(item, FIELD_ALIASES.materialGrade),
      identCode: getFirstValue(item, FIELD_ALIASES.identCode),
      priority: toNumber(item.priority, 2),
      raw: item,
    }));
  });
}

export function generateDocumentNumber(documentType, context = {}, settings = {}) {
  const defaults = DOCUMENT_DEFAULTS[documentType];
  if (!defaults) {
    throw new CuttingPackageValidationError(`Unsupported document type: ${documentType}`, { documentType });
  }

  const config = getNumberingConfig(documentType, settings);
  const sequence = toPositiveInteger(config.nextSequence ?? getSequenceAlias(documentType, settings), 1);
  const pattern = normalizeString(config.pattern) || defaults.pattern;
  const date = new Date(context.now || Date.now());
  const projectData = context.projectData || resolveProjectData(context, settings);
  const materialType = projectData.materialType || firstMaterialType(context);
  const equipment = projectData.equipment || firstEquipment(context);
  const tokenValues = {
    PROJECT: projectData.projectCode || resolveProjectCode(projectData.projectName, settings),
    PROJECT_CODE: projectData.projectCode || resolveProjectCode(projectData.projectName, settings),
    PROJECT_NAME: projectData.projectName || '',
    DOC: defaults.code,
    YYYY: formatDateToken(date, 'YYYY'),
    YY: formatDateToken(date, 'YY'),
    MM: formatDateToken(date, 'MM'),
    DD: formatDateToken(date, 'DD'),
    SEQ: String(sequence),
    MATERIAL: projectData.materialShortCode || resolveMaterialShortCode(materialType, settings),
    EQUIPMENT: equipment ? sanitizeCode(equipment) : '',
  };

  return pattern.replace(/\{SEQ(?::(\d+))?\}|\{([A-Z_]+)\}/g, (match, sequencePadding, token) => {
    if (match.startsWith('{SEQ')) {
      return sequencePadding ? padSequence(sequence, Number(sequencePadding)) : String(sequence);
    }
    return tokenValues[token] ?? '';
  });
}

export function buildCuttingPackageId(context = {}, settings = {}) {
  const date = new Date(context.now || Date.now());
  const projectData = context.projectData || resolveProjectData(context, settings);
  const projectCode = projectData.projectCode || resolveProjectCode(projectData.projectName, settings);
  return `CP-${projectCode}-${timestampToken(date)}-${randomSuffix()}`;
}

export function createAuditLog(summaryInput = {}) {
  const projectData = summaryInput.projectData || {};
  const createdAt = summaryInput.createdAt || new Date().toISOString();
  const metrics = {
    totalStockLength: toNumber(summaryInput.metrics?.totalStockLength, 0),
    totalNestedLength: toNumber(summaryInput.metrics?.totalNestedLength, 0),
    totalRemaining: toNumber(summaryInput.metrics?.totalRemaining, 0),
    utilization: toNumber(summaryInput.metrics?.utilization, 0),
  };
  const documents = {
    materialCouponNo: summaryInput.documents?.materialCouponNo || null,
    cuttingSheetNo: summaryInput.documents?.cuttingSheetNo || null,
    returnMaterialVoucherNo: summaryInput.documents?.returnMaterialVoucherNo || null,
  };

  return {
    id: `AUD-${projectData.projectCode || 'PRJ'}-${timestampToken(new Date(createdAt))}-${randomSuffix()}`,
    action: 'CREATE_CUTTING_PACKAGE',
    entityType: 'CuttingPackage',
    entityId: summaryInput.entityId || '',
    createdAt,
    createdBy: normalizeString(summaryInput.createdBy),
    summary: {
      mtoRowsSelected: toPositiveInteger(summaryInput.mtoRowsSelected, 0),
      expandedParts: toPositiveInteger(summaryInput.expandedParts, 0),
      stockItemsSelected: toPositiveInteger(summaryInput.stockItemsSelected, 0),
      stockItemsUsed: toPositiveInteger(summaryInput.stockItemsUsed, 0),
      unplacedParts: toPositiveInteger(summaryInput.unplacedParts, 0),
      offcutsGenerated: toPositiveInteger(summaryInput.offcutsGenerated, 0),
      scrapItems: toPositiveInteger(summaryInput.scrapItems, 0),
      utilization: metrics.utilization,
      documents,
    },
    metrics,
    documents,
    warnings: Array.isArray(summaryInput.warnings) ? [...summaryInput.warnings] : [],
  };
}

function validateSelectedArrays(mtoItems, stockItems) {
  const errors = [];
  if (!Array.isArray(mtoItems) || mtoItems.length === 0) {
    errors.push({ field: 'mtoItems', message: 'mtoItems must be a non-empty array.' });
  }
  if (!Array.isArray(stockItems) || stockItems.length === 0) {
    errors.push({ field: 'stockItems', message: 'stockItems must be a non-empty array.' });
  }
  if (errors.length) {
    throw new CuttingPackageValidationError('Invalid selected MTO or stock items.', { errors });
  }
}

function validateMtoItems(mtoItems) {
  const errors = [];
  const warnings = [];
  mtoItems.forEach((item, index) => {
    const mtoId = getFirstValue(item, FIELD_ALIASES.mtoId, `MTO-${index + 1}`);
    const length = toNumber(getFirstValue(item, FIELD_ALIASES.mtoLength), 0);
    const quantity = toPositiveInteger(getFirstValue(item, FIELD_ALIASES.quantity), 0);
    if (length <= 0) {
      errors.push({ index, mtoId, field: 'length', message: 'MTO item must have a valid required length.', item });
    }
    if (quantity < 1) {
      errors.push({ index, mtoId, field: 'quantity', message: 'MTO item quantity must be >= 1.', item });
    }
  });
  return { valid: errors.length === 0, errors, warnings };
}

function validateStockItems(stockItems) {
  const errors = [];
  const warnings = [];
  stockItems.forEach((item, index) => {
    const stockId = getFirstValue(item, FIELD_ALIASES.stockId, `stock-${index + 1}`);
    const length = toNumber(getFirstValue(item, FIELD_ALIASES.stockLength), 0);
    if (length <= 0) {
      errors.push({ index, stockId, field: 'length', message: 'Stock item must have a valid stock length.', item });
    }
  });
  return { valid: errors.length === 0, errors, warnings };
}

function expandStockItemsByQuantity(stockItems = []) {
  return stockItems.flatMap((item, itemIndex) => {
    const quantity = toPositiveInteger(getFirstValue(item, ['quantity', 'qty', 'Quantity']), 1);
    return Array.from({ length: quantity }, (_, index) => normalizeStockItem(item, itemIndex, index + 1));
  });
}

function normalizeStockItem(item, itemIndex, sequence) {
  const sourceId = normalizeString(getFirstValue(item, FIELD_ALIASES.stockId, `STOCK-${itemIndex + 1}`));
  const po = getFirstValue(item, FIELD_ALIASES.poItem);
  const lineItem = getFirstValue(item, ['item', 'Item']);
  return {
    ...item,
    id: sequence > 1 ? `${sourceId}#${sequence}` : sourceId,
    sourceStockId: sourceId,
    length: toNumber(getFirstValue(item, FIELD_ALIASES.stockLength), 0),
    description: getFirstValue(item, FIELD_ALIASES.description),
    traceability: getFirstValue(item, FIELD_ALIASES.traceability),
    heatNo: getFirstValue(item, FIELD_ALIASES.heatNo),
    heatNumber: getFirstValue(item, FIELD_ALIASES.heatNo),
    materialGrade: getFirstValue(item, FIELD_ALIASES.materialGrade),
    sapCode: getFirstValue(item, FIELD_ALIASES.sapCode),
    itemCategory: getFirstValue(item, FIELD_ALIASES.materialType),
    weight: getFirstValue(item, FIELD_ALIASES.weight),
    location: getFirstValue(item, FIELD_ALIASES.location),
    poItem: [po, lineItem].filter(Boolean).join(lineItem && po ? ' / ' : ''),
    po,
    item: lineItem,
    nfArrival: getFirstValue(item, FIELD_ALIASES.nfArrival),
    raw: item,
  };
}

function runNestingAdapter(parts, stock, settings, nestingOptions) {
  return runAllocations({
    parts: parts.map((part) => ({
      ...part,
      length: part.requiredLength,
      material: part.materialGrade,
    })),
    stock,
    kerf: toNumber(nestingOptions.kerf ?? settings.kerf ?? settings.defaultKerf, 0),
    minOffcut: minReusableOffcutLength(settings),
    stockUsageStrategy: nestingOptions.stockUsageStrategy
      || settings.stockUsageStrategy
      || settings.defaultStockStrategy
      || 'best-fit',
    trim: nestingOptions.trim || settings.trim || {
      left: toNumber(settings.leftTrim ?? settings.defaultLeftTrim, 0),
      right: toNumber(settings.rightTrim ?? settings.defaultRightTrim, 0),
    },
  });
}

function normalizeNestingResult(rawResult, context, settings) {
  const result = rawResult || {};
  const stockResults = (result.stockResults || result.stockUsed || []).map(normalizeUsedStock);
  const unplacedParts = (result.unplacedParts || []).map(normalizePartResult);
  const offcutThreshold = minReusableOffcutLength(settings);
  const engineOffcuts = Array.isArray(result.generatedOffcuts) ? result.generatedOffcuts.map(normalizeOffcut) : [];
  const derivedRemainders = stockResults
    .filter((bar) => toNumber(bar.remaining, 0) > 0)
    .map((bar) => ({
      ...bar,
      sourceStockId: bar.sourceStockId || bar.id,
      length: toNumber(bar.remaining, 0),
      description: `Remaining from ${bar.description || bar.id}`,
      isOffcut: true,
    }));
  const derivedOffcuts = engineOffcuts.length
    ? []
    : derivedRemainders.filter((item) => toNumber(item.length, 0) >= offcutThreshold).map(normalizeOffcut);
  const generatedOffcuts = uniqueBy(
    [...engineOffcuts, ...derivedOffcuts],
    (item) => `${item.sourceStockId || item.id}:${item.length}:${item.traceability}`,
  );
  const engineScrap = Array.isArray(result.scrapItems) ? result.scrapItems.map(normalizeScrap) : [];
  const scrapItems = uniqueBy(
    [...engineScrap, ...derivedRemainders.filter((item) => toNumber(item.length, 0) < offcutThreshold).map(normalizeScrap)],
    (item) => `${item.sourceStockId || item.id}:${item.length}:${item.traceability}`,
  );
  const totalStockLength = toNumber(result.totalStockLength, stockResults.reduce((sum, bar) => sum + toNumber(bar.originalLength ?? bar.length, 0), 0));
  const totalRemaining = toNumber(result.totalRemaining, stockResults.reduce((sum, bar) => sum + toNumber(bar.remaining, 0), 0));
  const totalTrims = toNumber(result.totalTrims, stockResults.reduce((sum, bar) => sum + toNumber(bar.leftTrim, 0) + toNumber(bar.rightTrim, 0), 0));
  const totalNestedLength = Math.max(0, totalStockLength - totalRemaining - totalTrims);
  const utilization = totalStockLength > 0 ? (totalNestedLength / totalStockLength) * 100 : 0;

  return {
    placements: stockResults.flatMap((bar) => (bar.pieces || []).map((piece) => ({ stockId: bar.id, partId: piece.id, piece }))),
    stockResults,
    unplacedParts,
    generatedOffcuts,
    scrapItems,
    totalStockLength,
    totalNestedLength,
    totalRemaining,
    utilization,
  };
}

function normalizeUsedStock(bar) {
  return {
    ...bar,
    id: bar.id || bar.sourceStockId || bar.traceability || '',
    sourceStockId: bar.sourceStockId || bar.id || bar.traceability || '',
    length: toNumber(bar.length ?? bar.originalLength, 0),
    originalLength: toNumber(bar.originalLength ?? bar.length, 0),
    remaining: toNumber(bar.remaining, 0),
    leftTrim: toNumber(bar.leftTrim, 0),
    rightTrim: toNumber(bar.rightTrim, 0),
    pieces: (bar.pieces || []).map(normalizePartResult),
  };
}

function normalizePartResult(part) {
  return {
    ...part,
    id: part.id || '',
    sourceMtoId: part.sourceMtoId || part.id || '',
    requiredLength: toNumber(part.requiredLength ?? part.length, 0),
    length: toNumber(part.length ?? part.requiredLength, 0),
  };
}

function normalizeOffcut(item) {
  return {
    ...item,
    id: item.id || `${item.sourceStockId || item.traceability || 'OFFCUT'}-OC`,
    sourceStockId: item.sourceStockId || item.id || '',
    length: toNumber(item.length ?? item.remaining, 0),
    isOffcut: true,
  };
}

function normalizeScrap(item) {
  return {
    ...item,
    id: item.id || `${item.sourceStockId || item.traceability || 'SCRAP'}-SC`,
    sourceStockId: item.sourceStockId || item.id || '',
    length: toNumber(item.length ?? item.remaining, 0),
    isScrap: true,
  };
}

function resolveProjectData(context = {}, settings = {}) {
  const projectName = getFirstValue(settings.project || {}, ['name', 'projectName'])
    || normalizeString(settings.projectName)
    || firstFromItems(context.mtoItems, FIELD_ALIASES.projectName)
    || firstFromItems(context.stockItems, FIELD_ALIASES.projectName);
  const projectCode = normalizeString(settings.project?.code || settings.project?.projectCode || settings.projectCode)
    || resolveProjectCode(projectName, settings);
  const projectGuideRow = findGuideRows(settings, 'projectCodeGuide')
    .find((row) => normalizeGuideValue(getFirstValue(row, ['Project', 'project', 'Project Code Guide', 'name'])) === normalizeGuideValue(projectName));
  const materialType = firstMaterialType(context);
  const equipment = firstEquipment(context);
  const equipmentRow = findGuideRows(settings, 'colorCodeGuide')
    .find((row) => normalizeGuideValue(getFirstValue(row, ['Equipment / Structure', 'equipment', 'structure'])) === normalizeGuideValue(equipment));

  return {
    projectName,
    projectCode,
    projectColorCode: getFirstValue(projectGuideRow || {}, ['Project Color Code', 'projectColorCode', 'color']),
    materialShortCode: resolveMaterialShortCode(materialType, settings),
    materialType,
    equipment,
    equipmentColorCode: getFirstValue(equipmentRow || {}, ['Equip. Colour Code', 'equipmentColorCode', 'color']),
    source: projectName ? 'settings-or-selected-items' : 'fallback',
  };
}

function resolveProjectCode(projectName, settings = {}) {
  const explicit = normalizeString(settings.project?.code || settings.project?.projectCode || settings.projectCode);
  if (explicit) return sanitizeCode(explicit);
  const normalizedProject = normalizeGuideValue(projectName);
  const row = findGuideRows(settings, 'projectCodeGuide')
    .find((candidate) => normalizeGuideValue(getFirstValue(candidate, ['Project', 'project', 'Project Code Guide', 'name'])) === normalizedProject);
  const code = getFirstValue(row || {}, ['Code', 'code', 'projectCode']);
  if (code) return sanitizeCode(code);
  return abbreviation(projectName || 'PROJECT');
}

function resolveMaterialShortCode(materialType, settings = {}) {
  const normalized = normalizeGuideValue(materialType);
  const row = findGuideRows(settings, 'materialClassificationGuide')
    .find((candidate) => [
      'MATERIAL CLASS',
      'Structure Type',
      'MATERIAL TYPE',
      'materialClass',
      'structureType',
      'materialType',
    ].some((field) => normalizeGuideValue(candidate[field]) === normalized));
  const shortCode = getFirstValue(row || {}, ['SHORT CODE', 'shortCode', 'code']);
  if (shortCode) return sanitizeCode(shortCode);
  const fallbackMap = {
    PLATE: 'PL',
    PIPE: 'PI',
    'PROCESS PIPE': 'PP',
    'ROUND BAR': 'RB',
    BEAM: 'BE',
    BOLT: 'BO',
    WASHER: 'WA',
  };
  return fallbackMap[normalized] || abbreviation(materialType || 'MAT');
}

function findGuideRows(settings = {}, guideName) {
  const candidates = [
    settings.codeGuides?.[guideName],
    settings[guideName],
    settings.codeTables?.[guideName],
  ];
  const match = candidates.find(Array.isArray);
  return match ? match : [];
}

function normalizeGuideValue(value) {
  return normalizeString(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

function hasUsableOffcuts(generatedOffcuts) {
  return Array.isArray(generatedOffcuts) && generatedOffcuts.some((item) => toNumber(item.length, 0) > 0);
}

function getFirstValue(object, keys, fallback = '') {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && normalizeString(value) !== '') return value;
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const raw = normalizeString(value);
  if (!raw) return fallback;
  const decimalComma = raw.includes(',') && (!raw.includes('.') || raw.lastIndexOf(',') > raw.lastIndexOf('.'));
  const normalized = decimalComma
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveInteger(value, fallback = 1) {
  const number = Math.floor(toNumber(value, fallback));
  return number >= 0 ? number : fallback;
}

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function padSequence(sequence, length) {
  return String(toPositiveInteger(sequence, 1)).padStart(length, '0');
}

function formatDateToken(date, token) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  if (token === 'YYYY') return String(year);
  if (token === 'YY') return String(year).slice(-2);
  if (token === 'MM') return month;
  if (token === 'DD') return day;
  return '';
}

function getRequiredStockFields(settings) {
  const configured = settings.traceability?.requiredStockFields;
  return Array.isArray(configured) && configured.length ? configured : [...DEFAULT_REQUIRED_STOCK_FIELDS];
}

function minReusableOffcutLength(settings) {
  return toNumber(settings.offcuts?.minReusableLengthMm, DEFAULT_OFFCUT_MIN_LENGTH_MM);
}

function getNumberingConfig(documentType, settings) {
  return {
    ...(settings.numbering?.[documentType] || {}),
    ...(settings.documentNumbering?.[documentType] || {}),
  };
}

function getSequenceAlias(documentType, settings) {
  const value = settings.sequences?.[documentType];
  if (value && typeof value === 'object') return value.nextSequence ?? value.sequence;
  return value;
}

function firstFromItems(items = [], keys = []) {
  for (const item of items || []) {
    const value = getFirstValue(item, keys);
    if (normalizeString(value)) return normalizeString(value);
  }
  return '';
}

function firstMaterialType(context = {}) {
  return normalizeString(context.materialType)
    || firstFromItems(context.parts, ['materialType', 'itemCategory'])
    || firstFromItems(context.expandedParts, ['materialType', 'itemCategory'])
    || firstFromItems(context.mtoItems, FIELD_ALIASES.materialType)
    || firstFromItems(context.stock, ['itemCategory', 'materialType', 'category', 'type'])
    || firstFromItems(context.stockItems, FIELD_ALIASES.materialType);
}

function firstEquipment(context = {}) {
  return normalizeString(context.equipment)
    || firstFromItems(context.mtoItems, FIELD_ALIASES.equipment)
    || firstFromItems(context.stockItems, FIELD_ALIASES.equipment);
}

function sanitizeCode(value) {
  const sanitized = normalizeString(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return sanitized || 'PRJ';
}

function abbreviation(value) {
  const words = normalizeString(value).toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (!words.length) return 'PRJ';
  if (words.length === 1) return words[0].slice(0, 4);
  return words.map((word) => word[0]).join('').slice(0, 4);
}

function timestampToken(date) {
  return [
    formatDateToken(date, 'YYYY'),
    formatDateToken(date, 'MM'),
    formatDateToken(date, 'DD'),
  ].join('') + '-' + [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
}

function randomSuffix() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8).toUpperCase();
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
