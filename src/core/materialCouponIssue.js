import { planMaterialCouponInventorySplits } from './inventorySplit.js';
import { validateMaterialCouponReservation } from './materialCouponReservation.js';
import { workpackRelationIds, WORKPACK_RELATION_TYPES } from './workpackRelations.js';
import { normalizeEquipmentTags } from './equipmentPortfolio.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function identities(item = {}) {
  return [item.id, item.trace, item.traceability].map(text).filter(Boolean);
}

function normalizedIdentCode(value) {
  return text(value).normalize('NFKC').toUpperCase();
}

function mtoIdentCode(item = {}) {
  return normalizedIdentCode(text(item.identCode) || item.material);
}

function inventoryIdentCode(item = {}, line = {}) {
  return normalizedIdentCode(item.identCode || item.sapCode || line.identCode || line.sapCode);
}

function activeRecord(record = {}) {
  return text(record.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
}

function activeMtoItem(item = {}) {
  return !['CANCELLED', 'SUPERSEDED', 'INVALID'].includes(text(item.status).toUpperCase());
}

function uniqueMtoCandidates(items = []) {
  return [...new Map(items.map((item) => [text(item.id), item]).filter(([id]) => id)).values()];
}

function lineTag(line = {}) {
  return normalizedIdentCode(line.tag || line.clientTag);
}

function filterByExplicitTag(candidates, line) {
  const expected = lineTag(line);
  if (!expected) return candidates;
  const tagged = candidates.filter((item) => [item.tag, item.clientTag]
    .some((value) => normalizedIdentCode(value) === expected));
  return tagged.length ? tagged : candidates;
}

function linkedLine(line, mtoItem, method) {
  return {
    ...line,
    mtoItemId: text(mtoItem.id),
    identCode: text(line.identCode) || text(mtoItem.identCode) || text(mtoItem.material),
    tag: text(line.tag) || text(mtoItem.tag || mtoItem.clientTag),
    equipmentId: text(line.equipmentId) || text(mtoItem.equipmentId),
    equipment: text(line.equipment) || text(mtoItem.equipmentName),
    mtoLinkMethod: text(line.mtoLinkMethod) || method,
  };
}

/**
 * Conservatively connects physical Coupon lines to MTO demand before issue.
 * Existing/manual MTO links always win. Automatic resolution is restricted to
 * MTO items in the linked Workpack and only accepts a single candidate.
 */
export function linkMaterialCouponLinesToMto({
  lines = [],
  inventoryItems = [],
  mtoItems = [],
  allocations = [],
  workpack = {},
  workpackLinks = [],
  projectId = '',
} = {}) {
  const inventoryByIdentity = new Map();
  inventoryItems.forEach((item) => identities(item).forEach((id) => inventoryByIdentity.set(id, item)));

  const workpackMtoIds = new Set(workpackRelationIds(workpack, workpackLinks, WORKPACK_RELATION_TYPES.MTO_ITEM));
  const scopedMtoItems = mtoItems.filter((item) => activeMtoItem(item)
    && workpackMtoIds.has(text(item.id))
    && (!text(projectId) || !text(item.projectId) || text(item.projectId) === text(projectId)));
  const scopedMtoById = new Map(scopedMtoItems.map((item) => [text(item.id), item]));
  const allocationsByPoItem = new Map();
  allocations.filter(activeRecord).forEach((allocation) => {
    const poItemId = text(allocation.poItemId);
    const mtoItem = scopedMtoById.get(text(allocation.mtoLineId || allocation.mtoItemId));
    if (!poItemId || !mtoItem) return;
    if (!allocationsByPoItem.has(poItemId)) allocationsByPoItem.set(poItemId, []);
    allocationsByPoItem.get(poItemId).push(mtoItem);
  });

  const resolutions = [];
  const linkedLines = lines.map((line, index) => {
    const existingMtoId = text(line.mtoItemId || line.mtoId);
    if (existingMtoId) {
      const mtoItem = scopedMtoById.get(existingMtoId)
        || mtoItems.find((item) => text(item.id) === existingMtoId);
      resolutions.push({ index, status: 'LINKED', method: 'EXISTING', mtoItemId: existingMtoId });
      return mtoItem ? linkedLine(line, mtoItem, text(line.mtoLinkMethod) || 'MANUAL') : { ...line, mtoItemId: existingMtoId };
    }

    const inventoryId = text(line.inventoryItemId || line.traceability || line.trace);
    const inventoryItem = inventoryByIdentity.get(inventoryId);
    if (!inventoryItem || !scopedMtoItems.length) {
      resolutions.push({ index, status: 'UNRESOLVED', method: inventoryItem ? 'WORKPACK_SCOPE' : 'INVENTORY' });
      return line;
    }

    const metadata = inventoryItem.metadata && typeof inventoryItem.metadata === 'object' ? inventoryItem.metadata : {};
    const poItemId = text(metadata.poItemId);
    let candidates = filterByExplicitTag(uniqueMtoCandidates(allocationsByPoItem.get(poItemId) || []), line);
    let method = 'AUTO_PO_ALLOCATION';

    if (!candidates.length) {
      const identCode = inventoryIdentCode(inventoryItem, line);
      candidates = filterByExplicitTag(scopedMtoItems.filter((item) => identCode && mtoIdentCode(item) === identCode), line);
      method = 'AUTO_IDENT_CODE';
    }

    if (candidates.length === 1) {
      resolutions.push({ index, status: 'LINKED', method, mtoItemId: text(candidates[0].id) });
      return linkedLine(line, candidates[0], method);
    }
    resolutions.push({
      index,
      status: candidates.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED',
      method,
      candidateMtoItemIds: candidates.map((item) => text(item.id)),
    });
    return line;
  });

  return {
    lines: linkedLines,
    resolutions,
    linkedCount: resolutions.filter((item) => item.status === 'LINKED').length,
    ambiguousCount: resolutions.filter((item) => item.status === 'AMBIGUOUS').length,
    unresolvedCount: resolutions.filter((item) => item.status === 'UNRESOLVED').length,
  };
}

export function materialCouponEquipmentTagOptions(equipments = [], projectId = '') {
  return (Array.isArray(equipments) ? equipments : [])
    .filter((equipment) => !text(projectId) || !text(equipment.projectId) || text(equipment.projectId) === text(projectId))
    .flatMap((equipment) => normalizeEquipmentTags([
      ...normalizeEquipmentTags(equipment.equipmentTags || equipment.tags),
      equipment.clientTag,
    ]).map((tag) => ({
      tag,
      equipmentId: text(equipment.id),
      equipment: text(equipment.equipmentName || equipment.name || equipment.code),
    })))
    .sort((left, right) => left.tag.localeCompare(right.tag, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Enriches Coupon lines with their physical Equipment TAG. An explicit line TAG
 * wins; otherwise the linked MTO TAG is used. Unknown and ambiguous TAGs remain
 * untouched so the UI can ask for a manual selection.
 */
export function linkMaterialCouponLinesToEquipmentTags({ lines = [], mtoItems = [], equipments = [], projectId = '' } = {}) {
  const options = materialCouponEquipmentTagOptions(equipments, projectId);
  const optionsByTag = new Map();
  options.forEach((option) => {
    const key = normalizedIdentCode(option.tag);
    if (!optionsByTag.has(key)) optionsByTag.set(key, []);
    optionsByTag.get(key).push(option);
  });
  const mtoById = new Map((Array.isArray(mtoItems) ? mtoItems : []).map((item) => [text(item.id), item]));
  const resolutions = [];
  const linkedLines = (Array.isArray(lines) ? lines : []).map((line, index) => {
    const mtoItem = mtoById.get(text(line.mtoItemId || line.mtoId));
    const candidateTag = text(line.tag || line.clientTag || mtoItem?.tag || mtoItem?.clientTag);
    const matches = optionsByTag.get(normalizedIdentCode(candidateTag)) || [];
    if (matches.length !== 1) {
      resolutions.push({ index, status: matches.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED', tag: candidateTag });
      return line;
    }
    const option = matches[0];
    resolutions.push({ index, status: 'LINKED', tag: option.tag, equipmentId: option.equipmentId });
    return {
      ...line,
      tag: option.tag,
      equipmentId: option.equipmentId,
      equipment: option.equipment || text(line.equipment),
      equipmentTagLinkMethod: text(line.tag || line.clientTag) ? (text(line.equipmentTagLinkMethod) || 'MANUAL') : 'AUTO_MTO',
    };
  });
  return { lines: linkedLines, resolutions, linkedCount: resolutions.filter((item) => item.status === 'LINKED').length };
}

function projectedInventoryAfterSplits(inventoryItems, splitPlans) {
  const replacements = new Map();
  splitPlans.forEach((plan) => {
    identities(plan.source).forEach((id) => replacements.set(id, plan.original));
  });

  const projected = inventoryItems.map((item) => {
    const replacement = identities(item).map((id) => replacements.get(id)).find(Boolean);
    return replacement || item;
  });
  projected.push(...splitPlans.map((plan) => plan.child));
  return projected;
}

// Pure preparation: validates the exact post-split inventory view without writing to IndexedDB.
export function prepareMaterialCouponIssue(lines = [], inventoryItems = []) {
  const inventory = Array.isArray(inventoryItems) ? inventoryItems : [];
  const splitPlans = planMaterialCouponInventorySplits(lines, inventory);
  const projectedInventory = projectedInventoryAfterSplits(inventory, splitPlans);
  const reservation = validateMaterialCouponReservation(lines, projectedInventory);
  return { ...reservation, splitPlans, projectedInventory };
}
