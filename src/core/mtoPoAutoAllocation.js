import { suggestMtoPoItemAllocationsByIdentCode } from './mtoPoItemAllocation.js';

const ACTIVE = 'ACTIVE';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function activeAllocation(allocation = {}) {
  return text(allocation.status || ACTIVE).toUpperCase() === ACTIVE;
}

export function eligibleMtoItemsForAutoAllocation(items = [], existingAllocations = []) {
  const linkedIds = new Set(existingAllocations.filter(activeAllocation).map((item) => text(item.mtoLineId || item.mtoItemId)));
  return items.filter((item) => text(item.status).toUpperCase() === 'OPEN'
    && !(item.validationErrors || []).length
    && !linkedIds.has(text(item.id)));
}

export function buildMtoPoAutoAllocationReview({ mtoItems = [], poItems = [], existingAllocations = [] } = {}) {
  const eligibleItems = eligibleMtoItemsForAutoAllocation(mtoItems, existingAllocations);
  const result = suggestMtoPoItemAllocationsByIdentCode({
    mtoItems: eligibleItems,
    poItems,
    existingAllocations,
    includeReviewSuggestions: true,
  });
  const safe = result.suggestions.filter((item) => item.matchConfidence === 'HIGH');
  const attention = [
    ...result.suggestions.filter((item) => item.matchConfidence !== 'HIGH'),
    ...(result.reviewSuggestions || []),
  ];
  const ambiguousCodes = new Set(['AMBIGUOUS_PO_ITEM_MATCH', 'INSUFFICIENT_PO_BALANCE', 'ALLOCATION_UNIT_CONFLICT']);
  const ambiguous = result.issues.filter((item) => ambiguousCodes.has(item.code));
  const noMatch = result.issues.filter((item) => !ambiguousCodes.has(item.code));
  return { analyzed: eligibleItems.length, safe, attention, ambiguous, noMatch };
}

export async function applyMtoPoAutoAllocations(allocations = [], saveOne) {
  if (typeof saveOne !== 'function') throw new TypeError('saveOne is required.');
  const created = [];
  const failures = [];
  for (const allocation of allocations) {
    try {
      created.push(await saveOne(allocation));
    } catch (error) {
      failures.push({ allocation, error, message: error?.message || String(error) });
    }
  }
  return { created, failures };
}
