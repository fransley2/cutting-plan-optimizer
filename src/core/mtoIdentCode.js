import { generatePurchaseOrderIdentCode } from './purchaseOrderImport.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

export function generateMtoIdentCode(item = {}) {
  const description = [text(item.description), text(item.material)].filter(Boolean).join('\n');
  return generatePurchaseOrderIdentCode({
    ...item,
    itemDescription: description,
    itemType: item.itemType || item.type,
  });
}

export function generateMissingMtoIdentCodes(items = []) {
  let generatedCount = 0;
  const generatedItems = (Array.isArray(items) ? items : []).map((item) => {
    if (text(item?.identCode)) return item;
    const identCode = generateMtoIdentCode(item);
    if (!identCode) return item;
    generatedCount += 1;
    return { ...item, identCode };
  });
  return { items: generatedItems, generatedCount };
}
