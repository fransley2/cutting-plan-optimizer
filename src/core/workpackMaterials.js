import {
  getInventoryAvailableLength,
  isInventoryStatusUsable,
  normalizeInventoryStatus,
  normalizeMaterialGrade,
  normalizeNumber,
} from './materialMatching.js';
import { allocateParts } from './allocate.js';

export function uniqueMaterialIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
}

function inventoryId(item = {}) {
  return String(item.trace || item.traceability || item.id || '').trim();
}

function identCode(item = {}) {
  return normalizeMaterialGrade(item.identCode || item.IdentCode || item['IDENT CODE'] || item.sapCode);
}

export function isNonLinearMtoItem(item = {}) {
  const code = String(item.identCode || item.IdentCode || item['IDENT CODE'] || '').trim().toUpperCase();
  const description = [item.description, item.type, item.profile]
    .map((value) => String(value || '').trim().toUpperCase())
    .join(' ');
  return /^(BD|EL|FT)[-_.]/.test(code)
    || /\b(CURVA|BEND|ELBOW|FITTING|FLANGE|TEE|REDUCER|VALVE)\b/.test(description);
}

export function filterWorkpackNestingInputs(mtoItems = [], inventoryItems = []) {
  const linearMtoItems = (Array.isArray(mtoItems) ? mtoItems : []).filter((item) => !isNonLinearMtoItem(item));
  const linearIdentCodes = new Set(linearMtoItems.map(identCode).filter(Boolean));
  const linearInventoryItems = (Array.isArray(inventoryItems) ? inventoryItems : [])
    .filter((item) => linearIdentCodes.has(identCode(item)) && getInventoryAvailableLength(item) > 0);
  return {
    mtoItems: linearMtoItems,
    inventoryItems: linearInventoryItems,
    excludedMtoItems: (Array.isArray(mtoItems) ? mtoItems : []).filter((item) => isNonLinearMtoItem(item)),
    excludedInventoryItems: (Array.isArray(inventoryItems) ? inventoryItems : []).filter((item) => !linearInventoryItems.includes(item)),
  };
}

function isOffcut(item = {}) {
  return Boolean(
    item.isOffcut
    || item.parentTrace
    || item.parentTraceability
    || item.parentInventoryItemId
    || String(item.source || item.sourceType || '').toUpperCase() === 'OFFCUT'
    || String(item.type || '').toUpperCase() === 'OFFCUT',
  );
}

function inventoryCapacity(item = {}) {
  return getInventoryAvailableLength(item) * Math.max(1, normalizeNumber(item.balanceQty ?? item.qty));
}

function inventoryQuantity(item = {}) {
  return Math.max(0, Math.floor(normalizeNumber(item.balanceQty ?? item.qty)));
}

function groupParts(group) {
  return group.items.flatMap((item) => {
    const length = Math.max(0, normalizeNumber(item.cutLength || item.length));
    const quantity = Math.max(1, Math.floor(normalizeNumber(item.qty || item.quantity || 1)));
    return Array.from({ length: quantity }, (_, index) => ({
      id: `${item.id || group.identCode}-${index + 1}`,
      length,
      material: normalizeMaterialGrade(item.material || item.materialGrade || ''),
      priority: 2,
    }));
  });
}

function stockFromCandidates(candidates) {
  return candidates.flatMap((item) => Array.from({ length: inventoryQuantity(item) }, (_, index) => ({
    id: `${inventoryId(item)}-${index + 1}`,
    sourceInventoryId: inventoryId(item),
    length: getInventoryAvailableLength(item),
    materialGrade: normalizeMaterialGrade(item.materialGrade || item.material || ''),
    description: String(item.materialDescription || ''),
    traceability: inventoryId(item),
    isOffcut: isOffcut(item),
  })));
}

function allocationForGroup(group, candidates, kerfMm, trim) {
  const parts = groupParts(group);
  const stock = stockFromCandidates(candidates);
  if (!parts.length || !stock.length) return { unplacedParts: parts };
  return allocateParts(parts, stock, kerfMm, 0, 'prioritize-offcuts', 'best-fit', trim);
}

function hasAvailableInventoryStatus(item = {}) {
  const status = normalizeInventoryStatus(item.status);
  if (isInventoryStatusUsable(status)) return true;
  return ['n/a', 'n a', 'na'].includes(status) && normalizeNumber(item.reservedQty) <= 0;
}

function availableForAutomaticSelection(item = {}, { requireLength = true } = {}) {
  return Boolean(inventoryId(item))
    && Boolean(identCode(item))
    && normalizeNumber(item.balanceQty ?? item.qty) > 0
    && (!requireLength || getInventoryAvailableLength(item) > 0)
    && hasAvailableInventoryStatus(item);
}

function selectNonLinearInventory(group, available) {
  const candidates = available.filter((item) => identCode(item) === group.identCode);
  const requiredQuantity = group.items.reduce(
    (total, item) => total + Math.max(1, Math.floor(normalizeNumber(item.qty || item.quantity || 1))),
    0,
  );
  const selectedInventoryIds = [];
  let selectedQuantity = 0;
  for (const item of candidates) {
    selectedInventoryIds.push(inventoryId(item));
    selectedQuantity += inventoryQuantity(item);
    if (selectedQuantity >= requiredQuantity) break;
  }
  return {
    ...group,
    kind: 'non-linear',
    candidateCount: candidates.length,
    requiredQuantity,
    selectedQuantity,
    selectedInventoryIds,
    remainingQuantity: Math.max(0, requiredQuantity - selectedQuantity),
  };
}

export function resolveWorkpackMaterials(ids, inventory) {
  const byId = new Map((Array.isArray(inventory) ? inventory : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => [inventoryId(item), item]));
  return uniqueMaterialIds(ids).map((id) => ({ inventoryId: id, item: byId.get(id) || null }));
}

export function materialWarnings(link) {
  const item = link?.item;
  if (!item) return ['Missing from Inventory'];
  const warnings = [];
  if (normalizeNumber(item.balanceQty) <= 0) warnings.push('Zero balance');
  if (!hasAvailableInventoryStatus(item)) warnings.push(`Status: ${item.status || 'missing'}`);
  return warnings;
}

export function automaticWorkpackMaterialSelection(linkedIds = [], mtoItems = [], inventoryItems = [], { kerfMm = 5, trim = { left: 0, right: 0 } } = {}) {
  const linkedMtoIds = new Set(uniqueMaterialIds(linkedIds));
  const groups = new Map();
  const nonLinearGroups = new Map();
  (Array.isArray(mtoItems) ? mtoItems : []).forEach((item) => {
    if (!linkedMtoIds.has(String(item?.id || '').trim())) return;
    const code = identCode(item);
    if (!code) return;
    if (isNonLinearMtoItem(item)) {
      const group = nonLinearGroups.get(code) || { identCode: code, mtoItemIds: [], items: [] };
      group.mtoItemIds.push(item.id);
      group.items.push(item);
      nonLinearGroups.set(code, group);
      return;
    }
    const group = groups.get(code) || { identCode: code, mtoItemIds: [], items: [], requiredLength: 0 };
    group.mtoItemIds.push(item.id);
    group.items.push(item);
    group.requiredLength += Math.max(0, normalizeNumber(item.cutLength || item.length)) * Math.max(1, normalizeNumber(item.qty || item.quantity || 1));
    groups.set(code, group);
  });

  const available = (Array.isArray(inventoryItems) ? inventoryItems : [])
    .filter((item) => item && typeof item === 'object' && availableForAutomaticSelection(item));
  const availableNonLinear = (Array.isArray(inventoryItems) ? inventoryItems : [])
    .filter((item) => item && typeof item === 'object' && availableForAutomaticSelection(item, { requireLength: false }));
  const selectedInventoryIds = new Set();
  const matchedGroups = [];
  const unmatchedGroups = [];

  groups.forEach((group) => {
    const candidates = available
      .filter((item) => identCode(item) === group.identCode)
      .sort((left, right) => {
        if (isOffcut(left) !== isOffcut(right)) return isOffcut(left) ? -1 : 1;
        return getInventoryAvailableLength(left) - getInventoryAvailableLength(right);
      });
    const allocation = allocationForGroup(group, candidates, kerfMm, trim);
    const selectedIds = [...new Set((allocation.stockUsed || []).map((stock) => stock.sourceInventoryId).filter(Boolean))];
    const selected = candidates.filter((item) => selectedIds.includes(inventoryId(item)));
    const remainingLength = allocation.unplacedParts.reduce((total, part) => total + Number(part.length || 0), 0);
    const result = { ...group, candidateCount: candidates.length, selectedInventoryIds: selectedIds, remainingLength };
    if (selected.length) {
      selectedIds.forEach((id) => selectedInventoryIds.add(id));
    }
    if (selected.length && allocation.unplacedParts.length === 0) {
      matchedGroups.push(result);
    } else {
      unmatchedGroups.push(result);
    }
  });

  const resolvedNonLinearGroups = [];
  nonLinearGroups.forEach((group) => {
    const result = selectNonLinearInventory(group, availableNonLinear);
    resolvedNonLinearGroups.push(result);
    result.selectedInventoryIds.forEach((id) => selectedInventoryIds.add(id));
    if (result.remainingQuantity === 0) matchedGroups.push(result);
    else unmatchedGroups.push(result);
  });

  return {
    selectedInventoryIds: [...selectedInventoryIds],
    matchedGroups,
    unmatchedGroups,
    nonLinearGroups: resolvedNonLinearGroups,
    ignoredGroups: [],
  };
}
