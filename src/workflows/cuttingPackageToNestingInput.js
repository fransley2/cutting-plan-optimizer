function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value);
  if (!raw) return fallback;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function firstValue(source, keys, fallback = '') {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && text(value) !== '') return value;
  }
  return fallback;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function sourcePackage(cuttingPackage = {}) {
  return cuttingPackage.metadata?.cuttingPackage || cuttingPackage;
}

function stockSource(cuttingPackage) {
  const pkg = sourcePackage(cuttingPackage);
  return arrayValue(pkg.stockItems).length
    ? pkg.stockItems
    : arrayValue(pkg.selectedStock).length
      ? pkg.selectedStock
      : arrayValue(pkg.stockUsed);
}

function mtoSource(cuttingPackage) {
  const pkg = sourcePackage(cuttingPackage);
  return arrayValue(pkg.mtoItems).length
    ? pkg.mtoItems
    : arrayValue(pkg.requiredItems).length
      ? pkg.requiredItems
      : arrayValue(pkg.selectedMtoItems);
}

export function cuttingPackageToNestingInput(cuttingPackage = {}) {
  const stockItems = stockSource(cuttingPackage).map((item) => ({
    po: firstValue(item, ['po', 'purchaseOrder', 'poNumber']),
    item: firstValue(item, ['item', 'poItem', 'itemPo']),
    qty: numberValue(firstValue(item, ['qty', 'quantity']), 1) || 1,
    length: numberValue(firstValue(item, ['length', 'lengthMm', 'availableLengthMm', 'availableLength', 'remainingLength', 'originalLength'])),
    materialGrade: firstValue(item, ['materialGrade', 'material', 'grade']),
    heatNumber: firstValue(item, ['heatNumber', 'heat']),
    description: firstValue(item, ['description', 'desc']),
    traceability: firstValue(item, ['traceability', 'trace', 'traceNo', 'id']),
  }));

  const parts = mtoSource(cuttingPackage).map((item) => ({
    dwgNumber: firstValue(item, ['dwgNumber', 'drawing', 'drawingNumber', 'drawingRef']),
    mark: firstValue(item, ['mark', 'Mark']),
    pos: firstValue(item, ['pos', 'position', 'POS']),
    qty: numberValue(firstValue(item, ['qty', 'quantity']), 1) || 1,
    length: numberValue(firstValue(item, ['length', 'lengthMm', 'cutLength', 'cutLengthMm', 'requiredLength'])),
    material: firstValue(item, ['material', 'materialGrade', 'grade']),
    priority: firstValue(item, ['priority'], 2),
  }));

  return { stockItems, parts };
}
