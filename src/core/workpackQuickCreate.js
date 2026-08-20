const UNAVAILABLE_STATUSES = new Set(['RESERVED', 'CONSUMED', 'CUT', 'SCRAPPED', 'DISPATCHED', 'CANCELLED']);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inventoryReference(item = {}) {
  return text(item.id || item.trace || item.traceability);
}

export function inventoryLength(item = {}) {
  return Math.max(0, number(item.lengthMm));
}

export function inventoryBalance(item = {}) {
  return Math.max(0, number(item.balanceQty ?? item.qty));
}

export function normalizedMaterial(value) {
  return text(value).toUpperCase().replace(/\s+/g, ' ');
}

export function isInventoryAvailableForWorkpack(item = {}) {
  const status = text(item.status).toUpperCase();
  const availableStatus = status === '' || status === 'AVAILABLE' || ['N/A', 'NA', 'N A'].includes(status);
  return Boolean(inventoryReference(item))
    && !UNAVAILABLE_STATUSES.has(status)
    && availableStatus
    && number(item.reservedQty) <= 0
    && inventoryLength(item) > 0
    && inventoryBalance(item) > 0;
}

export function isOffcutInventoryItem(item = {}) {
  const source = text(item.source || item.sourceType).toUpperCase();
  const type = text(item.type).toUpperCase();
  return Boolean(
    item.isOffcut
    || item.parentTrace
    || item.parentTraceability
    || item.parentInventoryItemId
    || source === 'OFFCUT'
    || type === 'OFFCUT',
  );
}

export function pieceRequiredLength(item = {}) {
  return Math.max(0, number(item.cutLength || item.length || item.requiredLength) * Math.max(1, number(item.qty || item.quantity || 1)));
}

export function suggestWorkpackMaterials(mtoItems = [], inventoryItems = [], { safetyMargin = 1.1 } = {}) {
  const safeMargin = Math.max(1, number(safetyMargin) || 1);
  const pieces = Array.isArray(mtoItems) ? mtoItems.filter((item) => item && typeof item === 'object') : [];
  const available = (Array.isArray(inventoryItems) ? inventoryItems : [])
    .filter((item) => item && typeof item === 'object' && isInventoryAvailableForWorkpack(item));
  const groups = new Map();

  pieces.forEach((piece) => {
    const material = normalizedMaterial(piece.material || piece.materialGrade) || 'UNSPECIFIED';
    const group = groups.get(material) || { material, pieces: [], requiredLength: 0 };
    group.pieces.push(piece);
    group.requiredLength += pieceRequiredLength(piece);
    groups.set(material, group);
  });

  return [...groups.values()].map((group) => {
    const requiredLength = Math.ceil(group.requiredLength * safeMargin);
    const candidates = available
      .filter((item) => normalizedMaterial(item.materialGrade) === group.material)
      .map((item) => ({
        id: inventoryReference(item),
        item,
        kind: isOffcutInventoryItem(item) ? 'OFFCUT' : 'NEW_BAR',
        length: inventoryLength(item),
        balance: inventoryBalance(item),
      }));
    const offcuts = candidates.filter((candidate) => candidate.kind === 'OFFCUT').sort((a, b) => a.length - b.length);
    const newBars = candidates.filter((candidate) => candidate.kind === 'NEW_BAR').sort((a, b) => b.length - a.length);
    let remaining = requiredLength;
    const suggestions = [];
    [...offcuts, ...newBars].forEach((candidate) => {
      if (remaining <= 0) return;
      const quantity = Math.min(candidate.balance, Math.ceil(remaining / candidate.length));
      if (quantity <= 0) return;
      const allocatedLength = candidate.length * quantity;
      suggestions.push({ ...candidate, quantity, allocatedLength });
      remaining -= allocatedLength;
    });
    return {
      ...group,
      requiredLength,
      candidates,
      suggestions,
      suggestedIds: suggestions.map((suggestion) => suggestion.id),
      remainingLength: Math.max(0, remaining),
    };
  });
}
