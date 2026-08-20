function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function hasValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) && object[key] != null && object[key] !== '';
}

function reliableInventoryQuantity(source = {}) {
  const qty = number(source.qty);
  const balanceQty = number(source.balanceQty);
  if (qty <= 0) return balanceQty;
  if (qty === 1 && balanceQty > 1) return balanceQty;
  return qty;
}

function originalDimension(source, key) {
  if (key === 'qty') return reliableInventoryQuantity(source);
  if (key === 'lengthMm') return number(source.lengthMm);
  if (key === 'widthMm') return number(source.widthMm);
  return 0;
}

function validateConsumedDimension(source, consumedValues, key, errorCode) {
  if (!hasValue(consumedValues, key)) return null;
  const original = originalDimension(source, key);
  const consumed = number(consumedValues[key]);
  if (consumed <= 0 || consumed >= original) throw new Error(errorCode);
  return { original, consumed, remainder: original - consumed };
}

function roundedWeight(value) {
  return Math.round(value * 1e6) / 1e6;
}

export function nextInventoryRemainderTraceability(source = {}, inventoryItems = []) {
  const base = text(source.traceability || source.trace || source.id) || 'INVENTORY';
  const existing = new Set((Array.isArray(inventoryItems) ? inventoryItems : [])
    .flatMap((item) => [item?.id, item?.trace, item?.traceability])
    .map((value) => text(value).toLowerCase())
    .filter(Boolean));
  let revision = 1;
  while (existing.has(`${base}-R${revision}`.toLowerCase())) revision += 1;
  return `${base}-R${revision}`;
}

export function splitInventoryItem(source = {}, consumedValues = {}, childTraceability) {
  const childTrace = text(childTraceability);
  if (!childTrace) throw new Error('CHILD_TRACEABILITY_REQUIRED');

  const qty = validateConsumedDimension(source, consumedValues, 'qty', 'INVALID_SPLIT_QTY');
  const length = validateConsumedDimension(source, consumedValues, 'lengthMm', 'INVALID_SPLIT_LENGTH');
  const width = validateConsumedDimension(source, consumedValues, 'widthMm', 'INVALID_SPLIT_WIDTH');
  if (!qty && !length && !width) throw new Error('SPLIT_DIMENSION_REQUIRED');

  const original = { ...source };
  const child = {
    ...source,
    id: childTrace,
    trace: childTrace,
    traceability: childTrace,
    parentStockId: text(source.id || source.trace),
    parentTraceability: text(source.traceability || source.trace),
    reservedQty: 0,
    status: 'available',
    materialCouponNo: '',
    exitDate: '',
  };

  if (qty) {
    original.qty = qty.consumed;
    original.balanceQty = qty.consumed;
    child.qty = qty.remainder;
    child.balanceQty = qty.remainder;
  }
  if (length) {
    original.lengthMm = length.consumed;
    child.lengthMm = length.remainder;
  }
  if (width) {
    original.widthMm = width.consumed;
    child.widthMm = width.remainder;
  }

  const sourceWeight = number(source.weightKg);
  const weightRatio = length
    ? length.consumed / length.original
    : qty
      ? qty.consumed / qty.original
      : 0;
  const weightBasis = length ? 'length' : qty ? 'qty' : '';
  if (sourceWeight > 0 && weightRatio > 0) {
    original.weightKg = roundedWeight(sourceWeight * weightRatio);
    child.weightKg = roundedWeight(sourceWeight - original.weightKg);
  } else if (sourceWeight > 0) {
    original.weightKg = sourceWeight;
    child.weightKg = 0;
  }

  return { original, child, weightBasis };
}

export function splitInventoryLength(source = {}, selectedLength, childTraceability) {
  return splitInventoryItem(source, { lengthMm: selectedLength }, childTraceability);
}

function inventoryItemId(line = {}) {
  return text(line.inventoryItemId || line.inventoryId);
}

function findInventoryItem(items, id) {
  return items.find((item) => [item?.id, item?.trace, item?.traceability].some((value) => text(value) === id));
}

export function planMaterialCouponInventorySplits(lines = [], inventoryItems = []) {
  const items = Array.isArray(inventoryItems) ? inventoryItems : [];
  const traces = [...items];
  const plannedIds = new Set();
  const plans = [];

  (Array.isArray(lines) ? lines : []).forEach((line, lineIndex) => {
    const id = inventoryItemId(line);
    if (!id || plannedIds.has(id)) return;
    const source = findInventoryItem(items, id);
    if (!source) return;

    const consumedValues = {};
    const lineQty = number(line.qty);
    const sourceQty = originalDimension(source, 'qty');
    if (lineQty > 0 && sourceQty > 0 && lineQty < sourceQty) consumedValues.qty = lineQty;

    const lineLength = number(line.lengthMm);
    const sourceLength = originalDimension(source, 'lengthMm');
    if (lineLength > 0 && sourceLength > 0 && lineLength < sourceLength) consumedValues.lengthMm = lineLength;

    const lineWidth = number(line.widthMm);
    const sourceWidth = originalDimension(source, 'widthMm');
    if (lineWidth > 0 && sourceWidth > 0 && lineWidth < sourceWidth) consumedValues.widthMm = lineWidth;

    if (!Object.keys(consumedValues).length) return;
    const childTraceability = nextInventoryRemainderTraceability(source, traces);
    const split = splitInventoryItem(source, consumedValues, childTraceability);
    plans.push({ lineIndex, inventoryItemId: id, source, consumedValues, ...split });
    plannedIds.add(id);
    traces.push(split.child);
  });

  return plans;
}
