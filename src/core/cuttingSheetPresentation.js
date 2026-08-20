function text(value) { return value == null ? '' : String(value).trim(); }
function firstText(...values) { return values.map(text).find(Boolean) || ''; }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)); }

function identifiers(record = {}) {
  return [record.id, record.inventoryItemId, record.sourceInventoryId, record.trace, record.traceability]
    .map(text)
    .filter(Boolean);
}

export function relatedCuttingSheetInventoryItem(bar = {}, inventoryItems = []) {
  const references = new Set(identifiers(bar));
  return (Array.isArray(inventoryItems) ? inventoryItems : []).find((item) => identifiers(item).some((value) => references.has(value))) || null;
}

function operationalValue(...values) {
  return values.map(text).find((value) => value && !isUuid(value)) || '';
}

function poItemFromReference(reference, po) {
  const source = text(reference);
  const poNumber = text(po);
  if (!source || !poNumber) return '';
  const escapedPo = poNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text(source.match(new RegExp(`${escapedPo}\\s*[-/\\\\]\\s*([^-/\\\\\\s]+)`, 'i'))?.[1]);
}

export function cuttingSheetBarDisplayName(bar = {}, barIndex = 0, inventoryItems = []) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
  const inventory = relatedCuttingSheetInventoryItem(bar, inventoryItems) || {};
  const named = operationalValue(
    bar.barName, bar.name, bar.label, bar.barNumber, bar.number,
    stock.barName, stock.name, stock.label, stock.barNumber, stock.number,
    inventory.barName, inventory.name, inventory.tag, inventory.serialNumber,
  );
  if (named) return named;

  const traceability = operationalValue(
    inventory.traceability, inventory.trace,
    stock.traceability, stock.trace,
    bar.traceability, bar.trace,
  );
  if (traceability) return traceability;

  const po = firstText(inventory.po, stock.po, bar.po);
  const item = firstText(inventory.poItem, stock.poItem, bar.poItem);
  if (po || item) return [po && `PO ${po}`, item && `Item ${item}`].filter(Boolean).join(' / ');

  const description = operationalValue(
    inventory.materialDescription, inventory.description,
    stock.materialDescription, stock.description,
    bar.materialDescription, bar.description,
  );
  return description || `Barra ${Number(barIndex) + 1}`;
}

export function cuttingSheetBarPoItem(bar = {}) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
  const explicit = firstText(bar.poItem, stock.poItem, bar.itemPo, stock.itemPo, bar.item, stock.item);
  if (explicit) return explicit;
  const po = firstText(bar.po, stock.po);
  return firstText(
    poItemFromReference(bar.poItemPo, po),
    poItemFromReference(stock.poItemPo, po),
    poItemFromReference(bar.traceability, po),
    poItemFromReference(bar.trace, po),
    poItemFromReference(stock.traceability, po),
    poItemFromReference(stock.trace, po),
  );
}
