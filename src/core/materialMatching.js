const DEFAULT_SETTINGS = Object.freeze({
  applyKerf: false,
  kerfMm: 0,
  allowOffcuts: true,
  preferOffcuts: true,
  allowReservedStock: false,
  allowIssuedStock: false,
  allowScrap: false,
  requireTraceability: false,
  requireExactMaterial: true,
  includeIdentCodeInKey: true,
  includeRejectedCandidates: false,
  multiplyByQuantity: true,
  materialAliases: {},
});

export const COVERAGE_STATUS = Object.freeze({
  OK: 'OK',
  PARTIAL: 'PARTIAL',
  NO_STOCK: 'NO_STOCK',
});

export const STOCK_MATCH_STATUS = Object.freeze({
  USABLE: 'USABLE',
  WARNING: 'WARNING',
  REJECTED: 'REJECTED',
});

function withDefaults(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function firstValue(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return '';
}

function hasText(value) {
  return normalizeText(value) !== '';
}

function getInventoryId(item) {
  return String(firstValue(item, ['id', 'inventoryItemId', 'trace', 'traceability', 'item', 'po']) || '');
}

function getMtoId(item) {
  return String(firstValue(item, ['id', 'mtoItemId', 'mark', 'pos']) || '');
}

function getIdentCode(item) {
  return firstValue(item, ['identCode', 'IdentCode', 'Ident Code', 'code', 'itemCode']);
}

function getTraceability(item) {
  return firstValue(item, ['traceability', 'trace', 'Traceability', 'Trace']);
}

function getHeat(item) {
  return firstValue(item, ['heatNo', 'heat', 'Heat']);
}

function getGrade(item) {
  return firstValue(item, ['materialGrade', 'material', 'grade', 'Material', 'Grade']);
}

function getTypeProfileCategory(item) {
  return firstValue(item, ['type', 'profile', 'category', 'materialDescription', 'description', 'Type', 'Profile', 'Category', 'Description']);
}

function getDimension(item) {
  const values = [
    firstValue(item, ['diameter', 'od', 'OD', 'outsideDiameter']),
    firstValue(item, ['thickness', 'wallThickness', 'Thickness']),
    firstValue(item, ['width', 'Width']),
    firstValue(item, ['dimensional', 'dimension', 'size']),
  ].map(normalizeText).filter(Boolean);
  return values.join('x');
}

function includesAny(text, tokens) {
  const normalized = normalizeText(text);
  return tokens.some(token => normalized.includes(token));
}

function describesPipe(item) {
  const text = [
    item?.type,
    item?.profile,
    item?.category,
    item?.description,
    item?.Type,
    item?.Profile,
    item?.Category,
    item?.Description,
  ].map(normalizeText).join(' ');
  return includesAny(text, ['pipe', 'tubo', 'tube']);
}

function describesFitting(item) {
  const text = [
    item?.type,
    item?.profile,
    item?.category,
    item?.description,
    item?.Type,
    item?.Profile,
    item?.Category,
    item?.Description,
  ].map(normalizeText).join(' ');
  return includesAny(text, ['curva', 'elbow', 'bend', 'fitting']);
}

function normalizeAliasMap(materialAliases = {}) {
  const groups = [];
  for (const [key, values] of Object.entries(materialAliases || {})) {
    const group = new Set([normalizeMaterialGrade(key)]);
    const list = Array.isArray(values) ? values : [values];
    for (const value of list) {
      group.add(normalizeMaterialGrade(value));
    }
    groups.push(group);
  }
  return groups;
}

function compareStrings(a, b) {
  return String(a).localeCompare(String(b));
}

function getStatusOrder(status) {
  if (status === STOCK_MATCH_STATUS.USABLE) return 0;
  if (status === STOCK_MATCH_STATUS.WARNING) return 1;
  return 2;
}

function getCoverageOrder(status) {
  if (status === COVERAGE_STATUS.NO_STOCK) return 0;
  if (status === COVERAGE_STATUS.PARTIAL) return 1;
  return 2;
}

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.+/#-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeMaterialGrade(value) {
  return normalizeText(value).replace(/[\s._+/#-]+/g, '');
}

export function normalizeNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  let text = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(mm|kg|m2|m²|m)\b/g, '')
    .replace(/[a-z]+/g, '')
    .replace(/\s+/g, '')
    .trim();

  if (!text) return 0;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    text = text.replace(',', '.');
  }

  text = text.replace(/[^0-9.+-]/g, '');
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeInventoryStatus(value) {
  const status = normalizeText(value);
  if (!status) return 'available';

  const aliases = {
    'em estoque': 'available',
    'n/a': 'available',
    'n a': 'available',
    na: 'available',
    available: 'available',
    reserved: 'reserved',
    reservado: 'reserved',
    issued: 'issued',
    emitido: 'issued',
    consumed: 'consumed',
    consumido: 'consumed',
    scrap: 'scrap',
    sucata: 'scrap',
    returned: 'returned',
    retorno: 'returned',
    quarantine: 'quarantine',
    quarantined: 'quarantine',
    'on-hold': 'on-hold',
    'on hold': 'on-hold',
  };

  return aliases[status] || status;
}

export function isInventoryStatusUsable(status, settings = {}) {
  const options = withDefaults(settings);
  const normalized = normalizeInventoryStatus(status);

  if (normalized === 'available' || normalized === 'returned') return true;
  if (normalized === 'reserved') return options.allowReservedStock === true;
  if (normalized === 'issued') return options.allowIssuedStock === true;
  if (normalized === 'scrap') return options.allowScrap === true;
  if (normalized === 'quarantine') return options.allowQuarantineStock === true;
  if (normalized === 'on-hold') return options.allowOnHoldStock === true;
  return false;
}

export function getMtoRequiredLength(item, settings = {}) {
  const options = withDefaults(settings);
  const baseLength = normalizeNumber(firstValue(item, [
    'cutLength',
    'length',
    'requiredLength',
    'Length/mm',
    'comprimento',
  ]));
  const quantity = normalizeNumber(firstValue(item, ['qty', 'quantity', 'Quantity'])) || 1;
  const kerf = options.applyKerf ? normalizeNumber(options.kerfMm || options.kerf) : 0;
  const requiredLength = baseLength + kerf;

  return options.multiplyByQuantity === true ? requiredLength * quantity : requiredLength;
}

export function getInventoryAvailableLength(item) {
  return normalizeNumber(item?.lengthMm);
}

export function getMaterialKeyFromMto(item, settings = {}) {
  const options = withDefaults(settings);
  const parts = [
    normalizeMaterialGrade(getGrade(item)),
    options.includeIdentCodeInKey !== false ? normalizeMaterialGrade(getIdentCode(item)) : '',
    normalizeText(getTypeProfileCategory(item)),
    getDimension(item),
  ];
  return parts.join('|');
}

export function getMaterialKeyFromInventory(item, settings = {}) {
  const options = withDefaults(settings);
  const parts = [
    normalizeMaterialGrade(getGrade(item)),
    options.includeIdentCodeInKey !== false ? normalizeMaterialGrade(getIdentCode(item)) : '',
    normalizeText(getTypeProfileCategory(item)),
    getDimension(item),
  ];
  return parts.join('|');
}

export function areMaterialGradesCompatible(requiredGrade, stockGrade, settings = {}) {
  const required = normalizeMaterialGrade(requiredGrade);
  const stock = normalizeMaterialGrade(stockGrade);

  if (!required || !stock) return false;
  if (required === stock) return true;

  for (const group of normalizeAliasMap(settings.materialAliases)) {
    if (group.has(required) && group.has(stock)) return true;
  }

  return false;
}

export function areProfilesCompatible(mtoItem, inventoryItem, settings = {}) {
  const options = withDefaults(settings);
  const mtoIdent = normalizeMaterialGrade(getIdentCode(mtoItem));
  const inventoryIdent = normalizeMaterialGrade(getIdentCode(inventoryItem));
  if (mtoIdent && inventoryIdent && mtoIdent === inventoryIdent) return true;

  const mtoDescriptors = [
    mtoItem?.type,
    mtoItem?.profile,
    mtoItem?.category,
    mtoItem?.description,
  ].map(normalizeText).filter(Boolean);
  const inventoryDescriptors = [
    inventoryItem?.type,
    inventoryItem?.profile,
    inventoryItem?.category,
    inventoryItem?.materialDescription,
  ].map(normalizeText).filter(Boolean);

  if (mtoDescriptors.length === 0 && inventoryDescriptors.length === 0) return true;

  const exactMatch = mtoDescriptors.some(value => inventoryDescriptors.includes(value));
  if (exactMatch) return true;

  const mtoFitting = describesFitting(mtoItem);
  const inventoryPipe = describesPipe(inventoryItem);
  if (mtoFitting && inventoryPipe && options.allowFittingsFromPipe !== true) return false;

  if (describesPipe(mtoItem) && inventoryPipe) return true;

  return false;
}

export function evaluateStockCandidate(mtoItem, inventoryItem, settings = {}) {
  const options = withDefaults(settings);
  const reasons = [];
  const warnings = [];
  const requiredLength = getMtoRequiredLength(mtoItem, { ...options, multiplyByQuantity: false });
  const availableLength = getInventoryAvailableLength(inventoryItem);
  const isOffcut = inventoryItem?.isOffcut === true;
  const inventoryStatus = normalizeInventoryStatus(inventoryItem?.status);
  const materialCompatible = areMaterialGradesCompatible(getGrade(mtoItem), getGrade(inventoryItem), options);
  const profileCompatible = areProfilesCompatible(mtoItem, inventoryItem, options);
  const statusUsable = isInventoryStatusUsable(inventoryStatus, options);
  const lengthEnough = availableLength >= requiredLength && requiredLength > 0;
  const traceabilityMissing = !hasText(getTraceability(inventoryItem));
  const heatMissing = !hasText(getHeat(inventoryItem));

  if (isOffcut && options.allowOffcuts !== true) reasons.push('Offcut usage disabled');
  if (!materialCompatible) reasons.push('Material mismatch');
  if (!profileCompatible) reasons.push('Profile/type mismatch');
  if (!statusUsable) reasons.push('Inventory status not usable');
  if (!lengthEnough) reasons.push('Insufficient length');

  if (heatMissing) warnings.push('Missing heat');
  if (traceabilityMissing && options.requireTraceability === true) {
    reasons.push('Missing traceability');
  } else if (traceabilityMissing) {
    warnings.push('Missing traceability');
  }

  if (statusUsable && inventoryStatus === 'reserved') warnings.push('Reserved stock');
  if (statusUsable && inventoryStatus === 'issued') warnings.push('Issued stock');
  if (statusUsable && (inventoryStatus === 'quarantine' || inventoryStatus === 'on-hold')) {
    warnings.push('Controlled stock status');
  }

  const status = reasons.length > 0
    ? STOCK_MATCH_STATUS.REJECTED
    : warnings.length > 0
      ? STOCK_MATCH_STATUS.WARNING
      : STOCK_MATCH_STATUS.USABLE;

  let score = 0;
  if (materialCompatible) score += 1000;
  if (normalizeMaterialGrade(getIdentCode(mtoItem)) && normalizeMaterialGrade(getIdentCode(mtoItem)) === normalizeMaterialGrade(getIdentCode(inventoryItem))) {
    score += 200;
  }
  if (profileCompatible) score += 100;
  if (lengthEnough) score += 50;
  if (isOffcut) score += options.preferOffcuts ? 25 : -5;
  score += Math.max(0, 100 - Math.max(0, availableLength - requiredLength) / 100);
  score -= warnings.length * 20;
  score -= reasons.length * 1000;

  return {
    mtoItemId: getMtoId(mtoItem),
    inventoryItemId: getInventoryId(inventoryItem),
    materialKey: getMaterialKeyFromMto(mtoItem, options),
    status,
    reasons,
    warnings,
    score,
    requiredLength,
    availableLength,
    remainingLength: availableLength - requiredLength,
    isOffcut,
    materialCompatible,
    profileCompatible,
    statusUsable,
    lengthEnough,
  };
}

export function analyzeMaterialCoverage(mtoItems = [], inventoryItems = [], settings = {}) {
  const options = withDefaults(settings);
  const sourceMtoItems = Array.isArray(mtoItems) ? mtoItems : [];
  const sourceInventoryItems = Array.isArray(inventoryItems) ? inventoryItems : [];
  const groups = new Map();

  for (const item of sourceMtoItems) {
    const materialKey = getMaterialKeyFromMto(item, options);
    if (!groups.has(materialKey)) {
      groups.set(materialKey, []);
    }
    groups.get(materialKey).push(item);
  }

  const matchedGroups = [];
  const shortages = [];
  const warnings = [];

  for (const [materialKey, requiredItems] of groups.entries()) {
    const bestCandidatesByStock = new Map();
    const groupWarnings = new Set();
    const totalRequiredLength = requiredItems.reduce((sum, item) => sum + getMtoRequiredLength(item, options), 0);

    for (const stockItem of sourceInventoryItems) {
      let bestCandidate = null;
      for (const mtoItem of requiredItems) {
        const candidate = evaluateStockCandidate(mtoItem, stockItem, options);
        if (!bestCandidate || candidate.score > bestCandidate.score) {
          bestCandidate = candidate;
        }
      }
      if (bestCandidate) {
        const stockId = bestCandidate.inventoryItemId || `stock-${bestCandidatesByStock.size}`;
        bestCandidatesByStock.set(stockId, bestCandidate);
      }
    }

    const allCandidates = Array.from(bestCandidatesByStock.values()).sort((a, b) => {
      const statusDiff = getStatusOrder(a.status) - getStatusOrder(b.status);
      if (statusDiff !== 0) return statusDiff;
      if (b.score !== a.score) return b.score - a.score;
      return a.remainingLength - b.remainingLength;
    });

    for (const candidate of allCandidates) {
      for (const warning of candidate.warnings) groupWarnings.add(warning);
      if (candidate.reasons.includes('Offcut usage disabled')) groupWarnings.add('Offcuts ignored');
      if (
        candidate.reasons.includes('Inventory status not usable')
        && normalizeInventoryStatus(sourceInventoryItems.find(item => getInventoryId(item) === candidate.inventoryItemId)?.status) === 'reserved'
      ) {
        groupWarnings.add('Reserved stock ignored');
      }
    }

    const usableCandidates = allCandidates.filter(candidate => candidate.status !== STOCK_MATCH_STATUS.REJECTED);
    const totalAvailableLength = usableCandidates.reduce((sum, candidate) => sum + candidate.availableLength, 0);
    const coverageStatus = usableCandidates.length === 0
      ? COVERAGE_STATUS.NO_STOCK
      : totalAvailableLength >= totalRequiredLength
        ? COVERAGE_STATUS.OK
        : COVERAGE_STATUS.PARTIAL;

    if (coverageStatus === COVERAGE_STATUS.PARTIAL) groupWarnings.add('Partial coverage');
    if (coverageStatus === COVERAGE_STATUS.NO_STOCK) groupWarnings.add('No usable stock');

    const group = {
      materialKey,
      requiredItems,
      candidateStock: options.includeRejectedCandidates ? allCandidates : usableCandidates,
      totalRequiredLength,
      totalAvailableLength,
      coverageStatus,
      warnings: Array.from(groupWarnings),
    };
    matchedGroups.push(group);

    if (coverageStatus !== COVERAGE_STATUS.OK) {
      shortages.push({
        materialKey,
        coverageStatus,
        totalRequiredLength,
        totalAvailableLength,
        missingLength: Math.max(0, totalRequiredLength - totalAvailableLength),
        requiredItems,
      });
    }

    for (const warning of group.warnings) {
      warnings.push({ materialKey, message: warning });
    }
  }

  matchedGroups.sort((a, b) => {
    const statusDiff = getCoverageOrder(a.coverageStatus) - getCoverageOrder(b.coverageStatus);
    return statusDiff !== 0 ? statusDiff : compareStrings(a.materialKey, b.materialKey);
  });

  return { matchedGroups, shortages, warnings };
}
