export function validateTraceability(inventoryItems, settings) {
  if (!settings.requireTraceability) return { valid: true };

  const missing = inventoryItems.filter((item) => !String(item.traceability || '').trim());
  return missing.length > 0
    ? { valid: false, missing }
    : { valid: true };
}
