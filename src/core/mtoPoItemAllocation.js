import { generateMtoIdentCode } from './mtoIdentCode.js';
import { generatePurchaseOrderIdentCode } from './purchaseOrderImport.js';

export const MTO_PO_ITEM_ALLOCATION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
});

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function unit(value) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (['M', 'METER', 'METERS', 'METRE', 'METRES'].includes(normalized)) return 'M';
  if (['EA', 'PC', 'PCS', 'PIECE', 'PIECES', 'UN'].includes(normalized)) return 'EA';
  if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(normalized)) return 'KG';
  if ([
    'M2', 'MÂ2', 'SQM',
    'SQUARE METER', 'SQUARE METERS', 'SQUARE METRE', 'SQUARE METRES',
  ].includes(normalized)) return 'M2';
  return normalized || 'EA';
}

function activeAllocation(allocation = {}) {
  return text(allocation.status || MTO_PO_ITEM_ALLOCATION_STATUS.ACTIVE).toUpperCase() === MTO_PO_ITEM_ALLOCATION_STATUS.ACTIVE;
}

function normalizedIdentCode(value) {
  return text(value).normalize('NFKC').toUpperCase();
}

function looksLikeIdentCode(value) {
  return /^[A-Z]{2}-[A-Z]{2}-\d+(?:-\d+){1,2}$/.test(normalizedIdentCode(value));
}

function mtoIdentIdentity(mtoItem = {}) {
  const explicit = normalizedIdentCode(mtoItem.identCode);
  if (explicit) return { code: explicit, source: 'IDENT_CODE', confidence: 'HIGH' };
  if (looksLikeIdentCode(mtoItem.material)) {
    return { code: normalizedIdentCode(mtoItem.material), source: 'MATERIAL_FALLBACK', confidence: 'LOW' };
  }
  const generated = normalizedIdentCode(generateMtoIdentCode(mtoItem));
  if (generated) return { code: generated, source: 'GENERATED_IDENT_CODE', confidence: 'HIGH' };
  const legacyMaterial = normalizedIdentCode(mtoItem.material);
  return { code: legacyMaterial, source: legacyMaterial ? 'MATERIAL_FALLBACK' : '', confidence: 'LOW' };
}

function mtoIdentCode(mtoItem = {}) {
  return mtoIdentIdentity(mtoItem).code;
}

function poItemIdentCode(poItem = {}) {
  return normalizedIdentCode(poItem.identCode || generatePurchaseOrderIdentCode(poItem));
}

function eligibleMtoItem(mtoItem = {}) {
  return !['CANCELLED', 'SUPERSEDED', 'INVALID'].includes(text(mtoItem.status).toUpperCase());
}

function eligiblePoItem(poItem = {}) {
  return text(poItem.status || 'OPEN').toUpperCase() !== 'CANCELLED';
}

const MTO_PO_ITEM_SUGGESTION_ISSUE_SEVERITY = Object.freeze({
  PROJECT_REQUIRED: 'BLOCKING',
  PROJECT_MISMATCH: 'BLOCKING',
  IDENT_CODE_REQUIRED: 'REVIEW',
  INSUFFICIENT_PO_BALANCE: 'REVIEW',
  NO_PO_ITEM_MATCH: 'REVIEW',
  AMBIGUOUS_PO_ITEM_MATCH: 'REVIEW',
  ALLOCATION_UNIT_CONFLICT: 'BLOCKING',
  MTO_PO_ITEM_ALREADY_LINKED: 'INFO',
});

function issue(code, projectId, matchedIdentCode, mtoItems, poItems, message) {
  return {
    code,
    severity: MTO_PO_ITEM_SUGGESTION_ISSUE_SEVERITY[code] || 'INFO',
    projectId,
    matchedIdentCode,
    mtoLineIds: mtoItems.map((item) => item.id).filter(Boolean),
    poItemIds: poItems.map((item) => item.id).filter(Boolean),
    message,
  };
}

function sum(records = [], selector = (record) => record) {
  return records.reduce((total, record) => total + numberValue(selector(record)), 0);
}

export function mtoDemandQuantity(mtoItem = {}, unitOfMeasure = 'EA') {
  const targetUnit = unit(unitOfMeasure);
  if (targetUnit === 'M') return numberValue(mtoItem.requiredLength) / 1000 || numberValue(mtoItem.qty) * numberValue(mtoItem.cutLength) / 1000;
  if (targetUnit === 'KG') return numberValue(mtoItem.weightKg);
  if (targetUnit === 'M2') return numberValue(mtoItem.externalSurfaceM2);
  return numberValue(mtoItem.qty);
}

/**
 * Builds conservative, reviewable MTO-to-PO suggestions from IDENT CODE.
 * Nothing is persisted here: callers must submit the returned suggestions to
 * the existing allocation validator and save flow.
 */
export function suggestMtoPoItemAllocationsByIdentCode({
  mtoItems = [], poItems = [], existingAllocations = [], allocations = [], drafts = [], includeReviewSuggestions = false,
} = {}) {
  const activeLinks = [...existingAllocations, ...allocations, ...drafts].filter(activeAllocation);
  const poItemById = new Map(poItems.map((item) => [text(item.id), item]));
  const allocatedByPoItem = new Map();
  const linksByMto = new Map();

  activeLinks.forEach((allocation) => {
    const poItemId = text(allocation.poItemId);
    const mtoLineId = text(allocation.mtoLineId || allocation.mtoItemId);
    allocatedByPoItem.set(poItemId, numberValue(allocatedByPoItem.get(poItemId)) + numberValue(allocation.allocatedQuantity));
    if (!linksByMto.has(mtoLineId)) linksByMto.set(mtoLineId, []);
    linksByMto.get(mtoLineId).push(allocation);
  });

  const groups = new Map();
  mtoItems.filter(eligibleMtoItem).forEach((mtoItem) => {
    const projectId = text(mtoItem.projectId);
    const matchedIdentCode = mtoIdentCode(mtoItem);
    const key = `${projectId}\u0000${matchedIdentCode}`;
    if (!groups.has(key)) groups.set(key, { projectId, matchedIdentCode, mtoItems: [] });
    groups.get(key).mtoItems.push(mtoItem);
  });

  const suggestions = [];
  const reviewSuggestions = [];
  const issues = [];
  groups.forEach((group) => {
    const { projectId, matchedIdentCode, mtoItems: groupedMtoItems } = group;
    if (!projectId || !matchedIdentCode) {
      issues.push(issue(
        !projectId ? 'PROJECT_REQUIRED' : 'IDENT_CODE_REQUIRED',
        projectId,
        matchedIdentCode,
        groupedMtoItems,
        [],
        !projectId ? 'MTO items require a Project before automatic matching.' : 'MTO items require an IDENT CODE before automatic matching.',
      ));
      return;
    }

    const matchingPoItems = poItems.filter((poItem) => eligiblePoItem(poItem)
      && text(poItem.projectId) === projectId
      && poItemIdentCode(poItem) === matchedIdentCode);
    const otherProjectMatches = poItems.filter((poItem) => eligiblePoItem(poItem)
      && text(poItem.projectId) !== projectId
      && poItemIdentCode(poItem) === matchedIdentCode);
    const poBalance = (poItem) => Math.max(0,
      numberValue(poItem.orderedQuantity) - numberValue(allocatedByPoItem.get(text(poItem.id))));
    const eligiblePoItems = matchingPoItems.filter((poItem) => poBalance(poItem) > 0.000001);

    if (!eligiblePoItems.length) {
      const hasMatchWithoutBalance = matchingPoItems.length > 0;
      issues.push(issue(
        hasMatchWithoutBalance ? 'INSUFFICIENT_PO_BALANCE' : (otherProjectMatches.length ? 'PROJECT_MISMATCH' : 'NO_PO_ITEM_MATCH'),
        projectId,
        matchedIdentCode,
        groupedMtoItems,
        hasMatchWithoutBalance ? matchingPoItems : otherProjectMatches,
        hasMatchWithoutBalance ? 'Matching PO Items have no allocable balance.' : (otherProjectMatches.length
          ? 'Matching PO Items belong to another Project.'
          : 'No PO Item matches this IDENT CODE in the same Project.'),
      ));
      return;
    }
    if (eligiblePoItems.length !== 1) {
      issues.push(issue(
        'AMBIGUOUS_PO_ITEM_MATCH',
        projectId,
        matchedIdentCode,
        groupedMtoItems,
        eligiblePoItems,
        'More than one PO Item with allocable balance matches this IDENT CODE.',
      ));
      return;
    }

    const poItem = eligiblePoItems[0];
    const unitOfMeasure = unit(poItem.unitOfMeasure);
    const remainingDemands = [];
    let conflict = false;
    let duplicatePair = false;

    groupedMtoItems.forEach((mtoItem) => {
      const linked = linksByMto.get(text(mtoItem.id)) || [];
      const linkedUnits = new Set(linked.map((allocation) => unit(
        allocation.unitOfMeasure || poItemById.get(text(allocation.poItemId))?.unitOfMeasure,
      )));
      if ([...linkedUnits].some((linkedUnit) => linkedUnit !== unitOfMeasure)) conflict = true;
      const allocatedQuantity = sum(linked, (allocation) => allocation.allocatedQuantity);
      const remainingQuantity = Math.max(0, mtoDemandQuantity(mtoItem, unitOfMeasure) - allocatedQuantity);
      if (remainingQuantity > 0.000001 && linked.some((allocation) => text(allocation.poItemId) === text(poItem.id))) duplicatePair = true;
      if (remainingQuantity > 0.000001) remainingDemands.push({ mtoItem, remainingQuantity });
    });

    if (conflict) {
      issues.push(issue(
        'ALLOCATION_UNIT_CONFLICT', projectId, matchedIdentCode, groupedMtoItems, [poItem],
        'Existing MTO allocations use a unit that conflicts with the matching PO Item.',
      ));
      return;
    }
    if (duplicatePair) {
      issues.push(issue(
        'MTO_PO_ITEM_ALREADY_LINKED', projectId, matchedIdentCode, groupedMtoItems, [poItem],
        'The matching MTO and PO Item pair already has an active allocation.',
      ));
      return;
    }

    const requiredBalance = sum(remainingDemands, (entry) => entry.remainingQuantity);
    if (poBalance(poItem) + 0.000001 < requiredBalance) {
      issues.push(issue(
        'INSUFFICIENT_PO_BALANCE', projectId, matchedIdentCode, groupedMtoItems, [poItem],
        'The matching PO Item cannot cover the full remaining MTO demand.',
      ));
      if (includeReviewSuggestions) {
        let availableBalance = poBalance(poItem);
        remainingDemands.forEach(({ mtoItem, remainingQuantity }) => {
          const allocatedQuantity = Math.min(availableBalance, remainingQuantity);
          if (allocatedQuantity <= 0.000001) return;
          const identity = mtoIdentIdentity(mtoItem);
          reviewSuggestions.push({
            projectId,
            mtoLineId: text(mtoItem.id),
            poItemId: text(poItem.id),
            allocatedQuantity,
            unitOfMeasure,
            matchMethod: 'AUTO_IDENT_CODE',
            matchedIdentCode,
            matchSource: identity.source,
            matchConfidence: 'LOW',
            reviewReason: 'INSUFFICIENT_PO_BALANCE',
          });
          availableBalance -= allocatedQuantity;
        });
      }
      return;
    }

    remainingDemands.forEach(({ mtoItem, remainingQuantity }) => {
      const identity = mtoIdentIdentity(mtoItem);
      suggestions.push({
        projectId,
        mtoLineId: text(mtoItem.id),
        poItemId: text(poItem.id),
        allocatedQuantity: remainingQuantity,
        unitOfMeasure,
        matchMethod: 'AUTO_IDENT_CODE',
        matchedIdentCode,
        matchSource: identity.source,
        matchConfidence: identity.confidence,
      });
    });
  });

  return includeReviewSuggestions ? { suggestions, reviewSuggestions, issues } : { suggestions, issues };
}

export function validateMtoPoItemAllocation({ allocation = {}, mtoItem = {}, poItem = {}, existingAllocations = [] } = {}) {
  const errors = [];
  const mtoLineId = text(allocation.mtoLineId || allocation.mtoItemId);
  const poItemId = text(allocation.poItemId);
  const allocationId = text(allocation.id);
  const allocatedQuantity = numberValue(allocation.allocatedQuantity);
  const allocationUnit = unit(poItem?.unitOfMeasure);
  const activeExisting = existingAllocations.filter((item) => activeAllocation(item) && text(item.id) !== allocationId);
  const sameMto = activeExisting.filter((item) => text(item.mtoLineId || item.mtoItemId) === mtoLineId);
  const samePoItem = activeExisting.filter((item) => text(item.poItemId) === poItemId);
  const duplicate = sameMto.find((item) => text(item.poItemId) === poItemId);
  const existingMtoUnits = new Set(sameMto.map((item) => unit(item.unitOfMeasure)).filter(Boolean));
  const demandQuantity = mtoDemandQuantity(mtoItem || {}, allocationUnit);
  const mtoAllocatedBefore = sum(sameMto, (item) => item.allocatedQuantity);
  const poAllocatedBefore = sum(samePoItem, (item) => item.allocatedQuantity);
  const mtoProjectId = text(mtoItem?.projectId);
  const poItemProjectId = text(poItem?.projectId);

  if (!mtoLineId || !mtoItem?.id) errors.push({ code: 'MTO_LINE_REQUIRED', message: 'MTO line is required.' });
  if (!poItemId || !poItem?.id) errors.push({ code: 'PO_ITEM_REQUIRED', message: 'Purchase Order item is required.' });
  if (!mtoProjectId) errors.push({ code: 'MTO_PROJECT_REQUIRED', message: 'MTO line must belong to a Project.' });
  if (!poItemProjectId) errors.push({ code: 'PO_ITEM_PROJECT_REQUIRED', message: 'Purchase Order item must belong to a Project.' });
  if (mtoProjectId && poItemProjectId && mtoProjectId !== poItemProjectId) {
    errors.push({ code: 'PROJECT_MISMATCH', message: 'MTO line and PO item must belong to the same Project.' });
  }
  if (allocatedQuantity <= 0) errors.push({ code: 'ALLOCATION_QUANTITY_INVALID', message: 'Allocated quantity must be greater than zero.' });
  if (duplicate) errors.push({ code: 'ALLOCATION_DUPLICATE', message: 'This MTO line is already linked to the selected PO item.' });
  if (existingMtoUnits.size && !existingMtoUnits.has(allocationUnit)) {
    errors.push({ code: 'ALLOCATION_UNIT_MISMATCH', message: 'All PO allocations for an MTO line must use the same unit of measure.' });
  }
  if (demandQuantity > 0 && mtoAllocatedBefore + allocatedQuantity > demandQuantity + 0.000001) {
    errors.push({ code: 'MTO_DEMAND_EXCEEDED', message: `Allocation exceeds the MTO demand balance (${Math.max(0, demandQuantity - mtoAllocatedBefore)} ${allocationUnit}).` });
  }
  const orderedQuantity = numberValue(poItem?.orderedQuantity);
  if (orderedQuantity > 0 && poAllocatedBefore + allocatedQuantity > orderedQuantity + 0.000001) {
    errors.push({ code: 'PO_ITEM_QUANTITY_EXCEEDED', message: `Allocation exceeds the PO item balance (${Math.max(0, orderedQuantity - poAllocatedBefore)} ${allocationUnit}).` });
  }

  return {
    valid: errors.length === 0,
    errors,
    unitOfMeasure: allocationUnit,
    demandQuantity,
    mtoAllocatedBefore,
    poAllocatedBefore,
  };
}

export function validateMtoPoItemAllocationBatch({ allocations = [], mtoItems = [], poItems = [], existingAllocations = [] } = {}) {
  const mtoById = new Map(mtoItems.map((item) => [text(item.id), item]));
  const poItemById = new Map(poItems.map((item) => [text(item.id), item]));
  const batchIds = new Set(allocations.map((allocation) => text(allocation.id)).filter(Boolean));
  const accepted = existingAllocations.filter((allocation) => !batchIds.has(text(allocation.id)));
  const results = allocations.map((allocation, index) => {
    const mtoLineId = text(allocation.mtoLineId || allocation.mtoItemId);
    const poItemId = text(allocation.poItemId);
    const validation = validateMtoPoItemAllocation({
      allocation,
      mtoItem: mtoById.get(mtoLineId),
      poItem: poItemById.get(poItemId),
      existingAllocations: accepted,
    });
    if (validation.valid) accepted.push({ ...allocation, status: MTO_PO_ITEM_ALLOCATION_STATUS.ACTIVE });
    return { index, allocation, ...validation };
  });
  return {
    valid: results.every((result) => result.valid),
    results,
    errors: results.flatMap((result) => result.errors.map((error) => ({ ...error, index: result.index }))),
  };
}

function receivedQuantityForUnit(line, units, unitOfMeasure, { fallbackToLine = true } = {}) {
  const targetUnit = unit(unitOfMeasure);
  if (!units.length) return fallbackToLine ? numberValue(line.receivedQuantity) : 0;
  if (targetUnit === 'M') {
    return sum(units, (materialUnit) => {
      if (numberValue(materialUnit.originalLengthMm) > 0) return numberValue(materialUnit.quantity || 1) * numberValue(materialUnit.originalLengthMm) / 1000;
      return materialUnit.quantity;
    });
  }
  return sum(units, (materialUnit) => materialUnit.quantity);
}

function procurementStatus({ demandQuantity, allocatedQuantity, receivedQuantity }) {
  if (allocatedQuantity <= 0) return 'UNALLOCATED';
  if (allocatedQuantity + 0.000001 < demandQuantity) return receivedQuantity > 0 ? 'PARTIALLY_PURCHASED_AND_RECEIVED' : 'PARTIALLY_PURCHASED';
  if (receivedQuantity <= 0) return 'AWAITING_RECEIPT';
  if (receivedQuantity + 0.000001 < allocatedQuantity) return 'PARTIALLY_RECEIVED';
  return 'RECEIVED';
}

export function buildMtoProcurementCoverage({
  mtoItems = [], purchaseOrders = [], poItems = [], allocations = [], receipts = [], receiptLines = [], materialUnits = [],
} = {}) {
  const mtoById = new Map(mtoItems.map((item) => [text(item.id), item]));
  const poItemById = new Map(poItems.map((item) => [text(item.id), item]));
  const poById = new Map(purchaseOrders.map((item) => [text(item.id), item]));
  const validReceiptIds = new Set(receipts.filter((receipt) => text(receipt.status).toUpperCase() !== 'CANCELLED').map((receipt) => text(receipt.id)));
  const unitsByLine = new Map();
  materialUnits.forEach((materialUnit) => {
    const lineId = text(materialUnit.receiptLineId);
    if (!unitsByLine.has(lineId)) unitsByLine.set(lineId, []);
    unitsByLine.get(lineId).push(materialUnit);
  });
  const receiptsByPoItem = new Map();
  receiptLines.filter((line) => validReceiptIds.has(text(line.receiptId))).forEach((line) => {
    const poItemId = text(line.poItemId);
    if (!receiptsByPoItem.has(poItemId)) receiptsByPoItem.set(poItemId, []);
    receiptsByPoItem.get(poItemId).push(line);
  });
  const activeAllocations = allocations.filter(activeAllocation);
  const allocationsByMto = new Map();
  const totalAllocatedByPoItem = new Map();
  activeAllocations.forEach((allocation) => {
    const mtoLineId = text(allocation.mtoLineId || allocation.mtoItemId);
    if (!allocationsByMto.has(mtoLineId)) allocationsByMto.set(mtoLineId, []);
    allocationsByMto.get(mtoLineId).push(allocation);
    const poItemId = text(allocation.poItemId);
    totalAllocatedByPoItem.set(poItemId, numberValue(totalAllocatedByPoItem.get(poItemId)) + numberValue(allocation.allocatedQuantity));
  });

  return mtoItems.map((mtoItem) => {
    const linkedAllocations = allocationsByMto.get(text(mtoItem.id)) || [];
    const defaultUnit = unit(poItemById.get(text(linkedAllocations[0]?.poItemId))?.unitOfMeasure || 'EA');
    const allocationDetails = linkedAllocations.map((allocation) => {
      const poItem = poItemById.get(text(allocation.poItemId)) || null;
      const unitOfMeasure = unit(poItem?.unitOfMeasure || allocation.unitOfMeasure);
      const linkedReceiptLines = receiptsByPoItem.get(text(allocation.poItemId)) || [];
      const linkedUnits = linkedReceiptLines.flatMap((line) => unitsByLine.get(text(line.id)) || []);
      const poReceived = sum(linkedReceiptLines, (line) => receivedQuantityForUnit(line, unitsByLine.get(text(line.id)) || [], unitOfMeasure));
      const poAccepted = sum(linkedReceiptLines, (line) => {
        const lineUnits = unitsByLine.get(text(line.id)) || [];
        const acceptedUnits = lineUnits.filter((materialUnit) => text(materialUnit.inspectionStatus).toUpperCase() === 'ACCEPTED');
        return receivedQuantityForUnit(line, acceptedUnits, unitOfMeasure, {
          fallbackToLine: !lineUnits.length && text(line.inspectionStatus).toUpperCase() === 'ACCEPTED',
        });
      });
      const poAllocated = numberValue(totalAllocatedByPoItem.get(text(allocation.poItemId)));
      const share = poAllocated > 0 ? numberValue(allocation.allocatedQuantity) / poAllocated : 0;
      return {
        allocation,
        poItem,
        purchaseOrder: poById.get(text(poItem?.purchaseOrderId)) || null,
        receiptLines: linkedReceiptLines,
        materialUnits: linkedUnits,
        receivedQuantity: Math.min(numberValue(allocation.allocatedQuantity), poReceived * share),
        acceptedQuantity: Math.min(numberValue(allocation.allocatedQuantity), poAccepted * share),
      };
    });
    const allocatedQuantity = sum(allocationDetails, (detail) => detail.allocation.allocatedQuantity);
    const receivedQuantity = sum(allocationDetails, (detail) => detail.receivedQuantity);
    const acceptedQuantity = sum(allocationDetails, (detail) => detail.acceptedQuantity);
    const demandQuantity = mtoDemandQuantity(mtoById.get(text(mtoItem.id)) || mtoItem, defaultUnit);
    return {
      mtoItem,
      unitOfMeasure: defaultUnit,
      demandQuantity,
      allocatedQuantity,
      receivedQuantity,
      acceptedQuantity,
      pendingPurchaseQuantity: Math.max(0, demandQuantity - allocatedQuantity),
      pendingReceiptQuantity: Math.max(0, allocatedQuantity - receivedQuantity),
      status: procurementStatus({ demandQuantity, allocatedQuantity, receivedQuantity }),
      allocations: allocationDetails,
    };
  });
}
