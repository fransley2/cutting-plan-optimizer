import { mtoDemandQuantity, suggestMtoPoItemAllocationsByIdentCode } from './mtoPoItemAllocation.js';
import { calculatePoItemMetrics, inventoryMatchesPoItem } from './procurementMetrics.js';
import { estimateReturnedWeight } from './returnMaterialVoucher.js';
import { isInventoryAvailableForReservation } from './materialCouponReservation.js';

const INACTIVE_MTO_STATUSES = new Set(['CANCELLED', 'SUPERSEDED', 'INVALID']);
const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'VOID']);
const CLOSED_PO_STATUSES = new Set(['CLOSED', 'COMPLETED', 'RECEIVED']);
const ACTIVE_ALLOCATION_STATUS = new Set(['', 'ACTIVE']);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  if (value === '' || value == null) return 0;
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function token(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.+/#-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactToken(value) {
  return token(value).replace(/[\s._+/#-]+/g, '');
}

export function normalizeReportUnit(value) {
  const normalized = text(value).toUpperCase().replace(/\s+/g, '');
  if (['EA', 'EACH', 'PC', 'PCS', 'PCE', 'PIECE', 'PIECES', 'UN', 'UND', 'UNIT', 'UNITS'].includes(normalized)) return 'EA';
  if (['M', 'MT', 'METER', 'METERS', 'METRE', 'METRES'].includes(normalized)) return 'M';
  if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(normalized)) return 'KG';
  if (['M2', 'M²', 'SQM'].includes(normalized)) return 'M2';
  return normalized || 'EA';
}

function mtoIdentCode(record = {}) {
  return text(record.identCode) || text(record.material);
}

function status(value) {
  return text(value).toUpperCase();
}

function sum(values, selector = (value) => value) {
  return list(values).reduce((total, value) => total + numberValue(selector(value)), 0);
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
}

function projectName(projectsById, projectId) {
  const project = projectsById.get(text(projectId));
  return project?.name || project?.shortCode || project?.code || (projectId ? `Projeto ${projectId}` : 'Projeto não resolvido');
}

/**
 * Builds a conservative cross-store material identity. IDENT/material/SAP codes
 * are authoritative. Grade + profile/category is an explicit legacy fallback.
 */
export function reportMaterialKey(record = {}) {
  const ident = compactToken(record.identCode || record.materialCode || record.sapCode);
  if (ident) return `ident:${ident}`;
  const grade = compactToken(record.material || record.materialGrade || record.grade);
  const profile = compactToken(record.type || record.category || record.materialCategory || record.profile);
  const description = compactToken(record.description || record.materialDescription);
  if (grade && profile) return `fallback:${grade}|${profile}`;
  if (grade && description) return `fallback:${grade}|${description}`;
  if (grade) return `fallback:${grade}`;
  if (profile && description) return `fallback:${profile}|${description}`;
  return `unresolved:${description || profile || 'unknown'}`;
}

function reportMtoMaterialKey(record = {}) {
  const ident = compactToken(mtoIdentCode(record));
  return ident ? `ident:${ident}` : reportMaterialKey(record);
}

function isFallbackMaterialKey(key) {
  return text(key).startsWith('fallback:') || text(key).startsWith('unresolved:');
}

function activeMtoItems(items) {
  return list(items).filter((item) => numberValue(item.qty) > 0 && !INACTIVE_MTO_STATUSES.has(status(item.status)));
}

function tagToken(value) {
  return text(value).normalize('NFKC').toLocaleUpperCase().replace(/\s+/g, ' ');
}

function tagValues(value) {
  const source = Array.isArray(value) ? value : text(value).split(/[\n;,]+/);
  const placeholders = new Set(['_', '-', '—', 'N/A', 'NA', 'NONE', 'SEM TAG']);
  return [...new Set(source.map(text).filter((tag) => tag && !placeholders.has(tagToken(tag))))];
}

function equipmentTags(equipment = {}) {
  return tagValues(equipment.equipmentTags || equipment.tags || equipment.clientTag);
}

function mtoTags(item = {}, equipmentsById = new Map()) {
  const explicit = tagValues([item.tag, item.clientTag]);
  if (explicit.length) return explicit;
  const linkedTags = equipmentTags(equipmentsById.get(text(item.equipmentId)) || {});
  return linkedTags.length === 1 ? linkedTags : [];
}

export function reportEquipmentTagOptions(data = {}) {
  const equipments = list(data.equipments).filter((equipment) => status(equipment.status || 'ACTIVE') !== 'INACTIVE');
  const equipmentsById = new Map(equipments.map((equipment) => [text(equipment.id), equipment]));
  const options = new Map();
  equipments.forEach((equipment) => equipmentTags(equipment).forEach((tag) => {
    options.set(tagToken(tag), {
      value: tag,
      label: tag,
      equipmentId: text(equipment.id),
      equipmentName: text(equipment.equipmentName || equipment.name || equipment.code),
    });
  }));
  activeMtoItems(data.mtoItems).forEach((item) => mtoTags(item, equipmentsById).forEach((tag) => {
    if (!options.has(tagToken(tag))) options.set(tagToken(tag), { value: tag, label: tag, equipmentId: text(item.equipmentId), equipmentName: text(item.equipmentName) });
  }));
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, 'pt-BR', { numeric: true }));
}

function activePurchaseOrders(orders) {
  return list(orders).filter((order) => !CANCELLED_STATUSES.has(status(order.status)));
}

function activePoItems(items, purchaseOrdersById) {
  return list(items).filter((item) => {
    if (numberValue(item.orderedQuantity) <= 0 || CANCELLED_STATUSES.has(status(item.status))) return false;
    const order = purchaseOrdersById.get(text(item.purchaseOrderId));
    return !order || !CANCELLED_STATUSES.has(status(order.status));
  });
}

function validReceipts(receipts) {
  return list(receipts).filter((receipt) => !CANCELLED_STATUSES.has(status(receipt.status)));
}

function utilizationSolution(sheet = {}) {
  return sheet.planning?.solution || sheet.metadata?.solution || {};
}

function cuttingSheetTotal(sheet = {}, field) {
  const solution = utilizationSolution(sheet);
  return Math.max(0, numberValue(solution[field] ?? sheet.summary?.[field]));
}

function poItemWeightPerUnit(item, purchaseOrder, inventoryItems) {
  const ordered = Math.max(0, numberValue(item.orderedQuantity));
  const itemWeight = Math.max(0, numberValue(item.weightKg));
  if (itemWeight > 0 && ordered > 0) return itemWeight / ordered;
  const inventory = list(inventoryItems).filter((record) => inventoryMatchesPoItem(item, purchaseOrder, record));
  const inventoryQty = sum(inventory, (record) => Math.max(0, numberValue(record.qty)));
  return inventoryQty > 0 ? sum(inventory, (record) => Math.max(0, numberValue(record.weightKg))) / inventoryQty : 0;
}

export function buildMaterialUtilizationSummary(data = {}, options = {}) {
  void options;
  const purchaseOrders = activePurchaseOrders(data.purchaseOrders);
  const purchaseOrdersById = new Map(purchaseOrders.map((order) => [text(order.id), order]));
  const poItems = activePoItems(data.poItems, purchaseOrdersById);
  const receipts = validReceipts(data.receipts);
  const inventoryItems = list(data.inventoryItems || data.inventory);
  const totals = {
    consumedQty: 0,
    consumedWeightKg: 0,
    reservedQty: 0,
    reservedWeightKg: 0,
    stockQty: 0,
    stockWeightKg: 0,
  };

  poItems.forEach((item) => {
    const purchaseOrder = purchaseOrdersById.get(text(item.purchaseOrderId)) || {};
    const metrics = calculatePoItemMetrics({
      item,
      purchaseOrder,
      receipts,
      receiptLines: list(data.receiptLines),
      materialUnits: list(data.materialUnits),
      inventoryItems,
      reservations: list(data.materialReservations),
      stockMovements: list(data.stockMovements),
    });
    const weightPerUnit = poItemWeightPerUnit(item, purchaseOrder, inventoryItems);
    totals.consumedQty += metrics.used;
    totals.consumedWeightKg += metrics.used * weightPerUnit;
    totals.reservedQty += metrics.reserved;
    totals.reservedWeightKg += metrics.reserved * weightPerUnit;
    totals.stockQty += metrics.stockOnHand;
    totals.stockWeightKg += metrics.stockOnHand * weightPerUnit;
  });

  const inventoryById = new Map(inventoryItems.flatMap((item) => (
    [item.id, item.trace, item.traceability].filter(Boolean).map((id) => [text(id), item])
  )));
  const rmvLines = list(data.returnMaterialVouchers)
    .filter((voucher) => !CANCELLED_STATUSES.has(status(voucher.status)))
    .flatMap((voucher) => list(voucher.returnedItems));
  const returnedQty = sum(rmvLines, (line) => line.qty);
  const returnedLengthMm = sum(rmvLines, (line) => line.lengthMm);
  const returnedWeightKg = sum(rmvLines, (line) => {
    const directWeight = Math.max(0, numberValue(line.weightKg));
    if (directWeight > 0) return directWeight;
    const parent = inventoryById.get(text(line.parentInventoryItemId || line.parentStockId || line.parentTraceability)) || {};
    return estimateReturnedWeight(parent, line.lengthMm);
  });

  const cuttingSheets = list(data.cuttingSheets).filter((sheet) => !CANCELLED_STATUSES.has(status(sheet.status)));
  const totalStockLength = sum(cuttingSheets, (sheet) => cuttingSheetTotal(sheet, 'totalStockLength'));
  const totalNestedLength = sum(cuttingSheets, (sheet) => (
    Math.max(0, numberValue(sheet.summary?.totalNestedLength ?? sheet.summary?.totalNested))
  ));
  const trimLengthMm = sum(cuttingSheets, (sheet) => cuttingSheetTotal(sheet, 'totalTrims'));
  const trimQty = sum(cuttingSheets, (sheet) => list(sheet.bars).reduce((count, bar) => (
    count + (numberValue(bar.leftTrim) > 0 ? 1 : 0) + (numberValue(bar.rightTrim) > 0 ? 1 : 0)
  ), 0));

  return {
    ...totals,
    returnedQty,
    returnedLengthMm,
    returnedWeightKg,
    nestingUtilization: totalStockLength > 0 ? totalNestedLength / totalStockLength : 0,
    trimQty,
    trimLengthMm,
  };
}

function inventoryAvailableQuantity(item = {}) {
  if (item.balanceQty != null && text(item.balanceQty) !== '') return Math.max(0, numberValue(item.balanceQty));
  return Math.max(0, numberValue(item.qty));
}

function inventoryIsUsable(item = {}) {
  return isInventoryAvailableForReservation({
    ...item,
    status: token(item.status || 'available') === 'em estoque' ? 'available' : item.status,
    balanceQty: inventoryAvailableQuantity(item),
  });
}

function availableInventoryWeight(item = {}) {
  const weight = Math.max(0, numberValue(item.weightKg));
  const quantity = Math.max(0, numberValue(item.qty));
  const balance = inventoryAvailableQuantity(item);
  if (weight <= 0 || balance <= 0) return 0;
  return quantity > 0 ? weight * Math.min(1, balance / quantity) : weight;
}

function poItemProjectId(item, purchaseOrdersById) {
  return text(item.projectId) || text(purchaseOrdersById.get(text(item.purchaseOrderId))?.projectId);
}

function buildPoLookup(purchaseOrders, poItems) {
  const purchaseOrdersById = new Map(purchaseOrders.map((order) => [text(order.id), order]));
  const poItemsById = new Map(poItems.map((item) => [text(item.id), item]));
  const purchaseOrdersByNumber = new Map();
  purchaseOrders.forEach((order) => {
    const number = token(order.poNumber);
    if (!number) return;
    if (!purchaseOrdersByNumber.has(number)) purchaseOrdersByNumber.set(number, []);
    purchaseOrdersByNumber.get(number).push(order);
  });
  const poItemsByOrderAndNumber = new Map();
  poItems.forEach((item) => {
    const itemNumber = token(item.itemNumber);
    if (!itemNumber) return;
    const lookupKey = `${text(item.purchaseOrderId)}|${itemNumber}`;
    if (!poItemsByOrderAndNumber.has(lookupKey)) poItemsByOrderAndNumber.set(lookupKey, []);
    poItemsByOrderAndNumber.get(lookupKey).push(item);
  });
  return { purchaseOrdersById, poItemsById, purchaseOrdersByNumber, poItemsByOrderAndNumber };
}

function inferInventoryPoItemId(item, lookup) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const directId = text(metadata.poItemId);
  if (directId && lookup.poItemsById.has(directId)) return directId;
  const legacyId = text(item.poItem);
  if (legacyId && lookup.poItemsById.has(legacyId)) return legacyId;

  let poNumber = token(item.po);
  let itemNumber = token(item.poItem);
  const combined = token(item.poItemPo);
  if ((!poNumber || !itemNumber) && combined) {
    const matches = [...lookup.purchaseOrdersByNumber.entries()]
      .filter(([number]) => combined === number || combined.startsWith(`${number}-`) || combined.startsWith(`${number}/`))
      .sort(([left], [right]) => right.length - left.length);
    if (matches.length) {
      poNumber ||= matches[0][0];
      itemNumber ||= combined.slice(matches[0][0].length).replace(/^[-/\s]+/, '');
    }
  }
  if (!poNumber || !itemNumber) return '';
  const orders = lookup.purchaseOrdersByNumber.get(poNumber) || [];
  const candidates = orders.flatMap((order) => lookup.poItemsByOrderAndNumber.get(`${text(order.id)}|${itemNumber}`) || []);
  return candidates.length === 1 ? text(candidates[0].id) : '';
}

function inferInventoryProjectId(item, lookup, materialUnitsById, scope = {}) {
  if (text(item.projectId)) return text(item.projectId);
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const poItemId = inferInventoryPoItemId(item, lookup);
  if (poItemId) return poItemProjectId(lookup.poItemsById.get(poItemId) || {}, lookup.purchaseOrdersById);
  const purchaseOrderId = text(metadata.purchaseOrderId);
  if (purchaseOrderId) return text(lookup.purchaseOrdersById.get(purchaseOrderId)?.projectId);
  const sourceDocumentId = text(item.sourceDocumentId || metadata.materialUnitId);
  if (sourceDocumentId && materialUnitsById.has(sourceDocumentId)) return text(materialUnitsById.get(sourceDocumentId)?.projectId);
  const poNumber = token(item.po);
  const matchingOrders = poNumber ? lookup.purchaseOrdersByNumber.get(poNumber) || [] : [];
  const matchingProjectIds = [...new Set(matchingOrders.map((order) => text(order.projectId)).filter(Boolean))];
  if (matchingProjectIds.length === 1) return matchingProjectIds[0];
  return scope.projectId && !scope.isAllProjects ? text(scope.projectId) : '';
}

function calculatePoBalances({ purchaseOrders, poItems, receipts, receiptLines, inventoryItems, lookup, today }) {
  const validReceiptIds = new Set(validReceipts(receipts).map((receipt) => text(receipt.id)));
  const receivedByPoItem = new Map();
  receiptLines.forEach((line) => {
    const receiptId = text(line.receiptId);
    if (receiptId && !validReceiptIds.has(receiptId)) return;
    const poItemId = text(line.poItemId);
    if (!poItemId) return;
    receivedByPoItem.set(poItemId, (receivedByPoItem.get(poItemId) || 0) + numberValue(line.receivedQuantity));
  });

  const inventoryReceivedByPoItem = new Map();
  inventoryItems.forEach((item) => {
    const poItemId = inferInventoryPoItemId(item, lookup);
    if (!poItemId) return;
    const quantity = numberValue(item.receivedQty) || numberValue(item.qty);
    inventoryReceivedByPoItem.set(poItemId, (inventoryReceivedByPoItem.get(poItemId) || 0) + Math.max(0, quantity));
  });

  const ordersById = new Map(purchaseOrders.map((order) => [text(order.id), order]));
  return poItems.map((item) => {
    const order = ordersById.get(text(item.purchaseOrderId)) || {};
    const ordered = Math.max(0, numberValue(item.orderedQuantity));
    const received = Math.min(ordered, Math.max(receivedByPoItem.get(text(item.id)) || 0, inventoryReceivedByPoItem.get(text(item.id)) || 0));
    const closed = CLOSED_PO_STATUSES.has(status(item.status)) || CLOSED_PO_STATUSES.has(status(order.status));
    const pending = closed ? 0 : Math.max(0, ordered - received);
    const balance = {
      item,
      order,
      ordered,
      received,
      pending,
      unit: normalizeReportUnit(item.unitOfMeasure),
      projectId: poItemProjectId(item, lookup.purchaseOrdersById),
      completionStatus: poItemCompletionStatus({ ordered, received, pending }),
    };
    return {
      ...balance,
      isOverdue: isPoBalanceOverdue(balance, today),
    };
  });
}

function allocationPendingByMto(allocations, poBalancesById, mtoItemsById) {
  const active = list(allocations).filter((allocation) => ACTIVE_ALLOCATION_STATUS.has(status(allocation.status)) && numberValue(allocation.allocatedQuantity) > 0);
  const byPoItem = new Map();
  active.forEach((allocation) => {
    const poItemId = text(allocation.poItemId);
    if (!byPoItem.has(poItemId)) byPoItem.set(poItemId, []);
    byPoItem.get(poItemId).push(allocation);
  });
  const result = new Map();
  const allocatedPoItemIds = new Set();
  byPoItem.forEach((records, poItemId) => {
    const balance = poBalancesById.get(poItemId);
    if (!balance) return;
    allocatedPoItemIds.add(poItemId);
    const totalAllocated = sum(records, (record) => record.allocatedQuantity);
    records.forEach((record) => {
      const allocated = numberValue(record.allocatedQuantity);
      const receivedShare = totalAllocated > 0 ? balance.received * (allocated / totalAllocated) : 0;
      const pending = Math.max(0, allocated - Math.min(allocated, receivedShare));
      const mtoId = text(record.mtoLineId || record.mtoItemId);
      const mtoItem = mtoItemsById.get(mtoId) || {};
      const demandInPoUnit = mtoDemandQuantity(mtoItem, balance.unit);
      const pendingEquivalentQty = demandInPoUnit > 0
        ? pending / demandInPoUnit * numberValue(mtoItem.qty)
        : 0;
      if (mtoId) result.set(mtoId, (result.get(mtoId) || 0) + pendingEquivalentQty);
    });
  });
  return { pendingByMto: result, allocatedPoItemIds };
}

function poBalancesForMtoScope(poBalances, allocations, selectedMtoIds, isTagFiltered) {
  if (!isTagFiltered) {
    return { poBalances, poItemFactors: new Map(poBalances.map((balance) => [text(balance.item.id), 1])) };
  }
  const totals = new Map();
  const selected = new Map();
  list(allocations).filter((allocation) => ACTIVE_ALLOCATION_STATUS.has(status(allocation.status)) && numberValue(allocation.allocatedQuantity) > 0)
    .forEach((allocation) => {
      const poItemId = text(allocation.poItemId);
      const quantity = numberValue(allocation.allocatedQuantity);
      totals.set(poItemId, (totals.get(poItemId) || 0) + quantity);
      if (selectedMtoIds.has(text(allocation.mtoLineId || allocation.mtoItemId))) {
        selected.set(poItemId, (selected.get(poItemId) || 0) + quantity);
      }
    });
  const poItemFactors = new Map();
  const scoped = poBalances.flatMap((balance) => {
    const poItemId = text(balance.item.id);
    const total = totals.get(poItemId) || 0;
    const scopedQuantity = selected.get(poItemId) || 0;
    if (total <= 0 || scopedQuantity <= 0) return [];
    const factor = Math.min(1, scopedQuantity / total);
    poItemFactors.set(poItemId, factor);
    return [{
      ...balance,
      ordered: balance.ordered * factor,
      received: balance.received * factor,
      pending: balance.pending * factor,
    }];
  });
  return { poBalances: scoped, poItemFactors };
}

function groupKey(projectId, materialKey) {
  return `${text(projectId)}\u0000${materialKey}`;
}

function buildDemandAnalysis(data, context) {
  const demands = new Map();
  context.mtoItems.forEach((item) => {
    const projectId = text(item.projectId);
    const materialKey = reportMtoMaterialKey(item);
    const key = groupKey(projectId, materialKey);
    if (!demands.has(key)) {
      demands.set(key, {
        key,
        projectId,
        materialKey,
        identCode: text(item.identCode),
        materialGrade: text(item.material),
        materialDescription: text(item.description),
        requiredQty: 0,
        requiredWeightKg: 0,
        hasCompleteWeights: true,
        items: [],
      });
    }
    const group = demands.get(key);
    group.requiredQty += numberValue(item.qty);
    const itemWeightKg = Math.max(0, numberValue(item.weightKg));
    group.requiredWeightKg += itemWeightKg;
    if (itemWeightKg <= 0) group.hasCompleteWeights = false;
    group.items.push(item);
  });

  const stockByGroup = new Map();
  context.inventoryItems.filter(inventoryIsUsable).forEach((item) => {
    const projectId = inferInventoryProjectId(item, context.lookup, context.materialUnitsById, data.scope || {});
    if (!projectId) return;
    const key = groupKey(projectId, reportMaterialKey(item));
    const current = stockByGroup.get(key) || { quantity: 0, weightKg: 0 };
    current.quantity += inventoryAvailableQuantity(item);
    current.weightKg += availableInventoryWeight(item);
    stockByGroup.set(key, current);
  });

  const unallocatedPendingByGroup = new Map();
  context.poBalances.forEach((balance) => {
    if (balance.pending <= 0 || balance.unit !== 'EA' || context.allocatedPoItemIds.has(text(balance.item.id))) return;
    const key = groupKey(balance.projectId, reportMaterialKey(balance.item));
    unallocatedPendingByGroup.set(key, (unallocatedPendingByGroup.get(key) || 0) + balance.pending);
  });

  const itemRows = [];
  const materialRows = [];
  demands.forEach((group) => {
    let availablePool = stockByGroup.get(group.key)?.quantity || 0;
    let fallbackPendingPool = unallocatedPendingByGroup.get(group.key) || 0;
    let available = 0;
    let inTransit = 0;
    let missing = 0;
    let shortageWeightKg = 0;

    group.items.forEach((item) => {
      const requiredQty = numberValue(item.qty);
      const availableQty = Math.min(requiredQty, availablePool);
      availablePool = Math.max(0, availablePool - availableQty);
      const shortageQty = Math.max(0, requiredQty - availableQty);
      const hasAllocation = context.pendingByMto.has(text(item.id));
      const pendingPool = hasAllocation ? context.pendingByMto.get(text(item.id)) || 0 : fallbackPendingPool;
      const inTransitQty = Math.min(shortageQty, pendingPool);
      if (!hasAllocation) fallbackPendingPool = Math.max(0, fallbackPendingPool - inTransitQty);
      const missingQty = Math.max(0, shortageQty - inTransitQty);
      const itemWeight = Math.max(0, numberValue(item.weightKg));
      const itemShortageWeight = requiredQty > 0 ? itemWeight * (shortageQty / requiredQty) : 0;
      const itemAvailableWeight = requiredQty > 0 ? itemWeight * (availableQty / requiredQty) : 0;
      available += availableQty;
      inTransit += inTransitQty;
      missing += missingQty;
      shortageWeightKg += itemShortageWeight;
      itemRows.push({
        id: text(item.id),
        projectId: group.projectId,
        projectName: projectName(context.projectsById, group.projectId),
        equipmentId: text(item.equipmentId),
        tag: text(item.tag || item.clientTag),
        materialKey: group.materialKey,
        identCode: text(item.identCode),
        materialGrade: text(item.material),
        materialDescription: text(item.description),
        drawing: text(item.drawing),
        mark: text(item.mark),
        position: text(item.pos),
        requiredQty,
        availableQty,
        inTransitQty,
        shortageQty,
        missingQty,
        availableWeightKg: itemAvailableWeight,
        shortageWeightKg: itemShortageWeight,
        critical: missingQty > 0.000001,
      });
    });

    materialRows.push({
      projectId: group.projectId,
      projectName: projectName(context.projectsById, group.projectId),
      materialKey: group.materialKey,
      identCode: group.identCode,
      materialGrade: group.materialGrade,
      materialDescription: group.materialDescription,
      requiredQty: group.requiredQty,
      requiredWeightKg: group.requiredWeightKg,
      hasCompleteWeights: group.hasCompleteWeights,
      availableQty: available,
      availableStockQty: stockByGroup.get(group.key)?.quantity || 0,
      availableStockWeightKg: stockByGroup.get(group.key)?.weightKg || 0,
      inTransitQty: inTransit,
      missingQty: missing,
      shortageQty: Math.max(0, group.requiredQty - available),
      shortageWeightKg,
      coverage: ratio(available, group.requiredQty),
      critical: missing > 0.000001,
    });
  });

  return { itemRows, materialRows };
}

function requiredCoverage(materialRows) {
  const rows = list(materialRows);
  const hasCompleteWeights = rows.length > 0 && rows.every((row) => row.hasCompleteWeights === true && row.requiredWeightKg > 0);
  if (hasCompleteWeights) {
    const requiredWeight = sum(rows, (row) => row.requiredWeightKg);
    const coveredWeight = sum(rows, (row) => row.requiredWeightKg * row.coverage);
    return { value: ratio(coveredWeight, requiredWeight), basis: 'WEIGHT' };
  }
  return {
    value: ratio(sum(rows, (row) => row.availableQty), sum(rows, (row) => row.requiredQty)),
    basis: 'QUANTITY',
  };
}

function projectBreakdown(materialRows, projects, scope = {}) {
  const aggregates = new Map();
  list(projects).forEach((project) => aggregates.set(text(project.id), {
    projectId: text(project.id),
    projectName: project.name || project.shortCode || project.code || text(project.id),
    required: 0,
    available: 0,
    inTransit: 0,
    missing: 0,
  }));
  materialRows.forEach((row) => {
    if (!aggregates.has(row.projectId)) aggregates.set(row.projectId, {
      projectId: row.projectId,
      projectName: row.projectName,
      required: 0,
      available: 0,
      inTransit: 0,
      missing: 0,
    });
    const target = aggregates.get(row.projectId);
    target.required += row.requiredQty;
    target.available += row.availableQty;
    target.inTransit += row.inTransitQty;
    target.missing += row.missingQty;
  });
  let rows = [...aggregates.values()].map((row) => ({ ...row, percentage: ratio(row.available, row.required) }));
  if (scope.isAllProjects) rows = rows.filter((row) => row.required > 0);
  return rows.sort((left, right) => left.projectName.localeCompare(right.projectName, 'pt-BR'));
}

function parseDate(value) {
  const source = text(value);
  if (!source) return null;
  const excelSerial = Number(source.replace(',', '.'));
  if (Number.isFinite(excelSerial) && excelSerial >= 20000 && excelSerial < 100000) {
    return new Date(Math.round((excelSerial - 25569) * 86400000));
  }
  const dayFirst = source.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const normalized = dayFirst
    ? `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}T00:00:00Z`
    : (source.length === 10 ? `${source}T00:00:00Z` : source);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function poItemCompletionStatus({ ordered, received, pending }) {
  if (pending === 0) return 'COMPLETE';
  if (received === 0 && (pending > 0 || ordered > 0)) return 'NOT_STARTED';
  return 'PARTIAL';
}

function poBalanceExpectedDate(balance = {}) {
  return parseDate(balance.item?.expectedDeliveryDate || balance.item?.contractualDeliveryDate);
}

function isPoBalanceOverdue(balance = {}, today) {
  const reference = parseDate(today) || new Date();
  const expected = poBalanceExpectedDate(balance);
  return balance.pending > 0 && Boolean(expected && expected < reference);
}

export function reportWeekStart(value) {
  const date = parseDate(value);
  if (!date) return '';
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

export function reportIsoWeek(value) {
  const date = parseDate(value);
  if (!date) return null;
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - (firstThursday.getUTCDay() || 7));
  const weekNumber = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
  const weekLabel = `W${String(weekNumber).padStart(2, '0')}`;
  return {
    key: `${isoYear}-${weekLabel}`,
    label: weekLabel,
    year: isoYear,
    weekNumber,
    startDate: reportWeekStart(date.toISOString()),
  };
}

const REPORT_MONTH_LABELS = Object.freeze([
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]);

function deliveryPeriod(value, granularity) {
  const date = parseDate(value);
  if (!date) return null;
  if (granularity === 'week') {
    const week = reportIsoWeek(date);
    return { key: week.key, label: `Semana ${week.weekNumber}/${week.year}`, startDate: week.startDate };
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: `${REPORT_MONTH_LABELS[month]}/${year}`,
    startDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
  };
}

function quantityBreakdown(quantities) {
  return [...quantities.entries()]
    .map(([unit, value]) => ({ unit, value }))
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

export function buildMaterialDeliveryTimeline(data = {}, options = {}) {
  const granularity = text(options.granularity || 'month').toLowerCase();
  if (!['week', 'month'].includes(granularity)) throw new Error(`Unsupported delivery timeline granularity: ${granularity}`);
  const allPurchaseOrders = list(data.purchaseOrders);
  const purchaseOrders = activePurchaseOrders(allPurchaseOrders);
  const lookupSeed = buildPoLookup(allPurchaseOrders, list(data.poItems));
  const poItems = activePoItems(data.poItems, lookupSeed.purchaseOrdersById);
  const lookup = buildPoLookup(purchaseOrders, poItems);
  const receipts = validReceipts(data.receipts);
  const receiptById = new Map(receipts.map((receipt) => [text(receipt.id), receipt]));
  const validReceiptIds = new Set(receiptById.keys());
  const receiptLines = list(data.receiptLines).filter((line) => validReceiptIds.has(text(line.receiptId)));
  const poBalances = calculatePoBalances({
    purchaseOrders, poItems, receipts, receiptLines,
    inventoryItems: list(data.inventoryItems || data.inventory), lookup, today: options.today,
  });
  const materialUnitsByLine = new Map();
  list(data.materialUnits).filter((unit) => !['REJECTED', 'CANCELLED'].includes(status(unit.inspectionStatus || unit.status)))
    .forEach((unit) => {
      const lineId = text(unit.receiptLineId);
      if (!materialUnitsByLine.has(lineId)) materialUnitsByLine.set(lineId, []);
      materialUnitsByLine.get(lineId).push(unit);
    });
  const periods = new Map();
  const ensure = (period) => {
    if (!periods.has(period.key)) periods.set(period.key, {
      ...period,
      granularity,
      expectedQuantities: new Map(),
      receivedQuantities: new Map(),
      receivedWeightKg: 0,
      receivedWeightComplete: true,
    });
    return periods.get(period.key);
  };

  poBalances.filter((balance) => balance.pending > 0).forEach((balance) => {
    const period = deliveryPeriod(balance.item.expectedDeliveryDate || balance.item.contractualDeliveryDate, granularity);
    if (!period) return;
    const target = ensure(period);
    target.expectedQuantities.set(balance.unit, (target.expectedQuantities.get(balance.unit) || 0) + balance.pending);
  });

  receiptLines.forEach((line) => {
    const period = deliveryPeriod(receiptById.get(text(line.receiptId))?.arrivalDate, granularity);
    if (!period) return;
    const target = ensure(period);
    const unit = normalizeReportUnit(line.unitOfMeasure);
    target.receivedQuantities.set(unit, (target.receivedQuantities.get(unit) || 0) + numberValue(line.receivedQuantity));
    const lineUnits = materialUnitsByLine.get(text(line.id)) || [];
    const lineWeightKg = sum(lineUnits, (materialUnit) => Math.max(0, numberValue(materialUnit.weightKg)));
    if (!lineUnits.length || lineWeightKg <= 0) target.receivedWeightComplete = false;
    target.receivedWeightKg += lineWeightKg;
  });

  return [...periods.values()]
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .map((period) => {
      const expectedQuantitiesByUnit = quantityBreakdown(period.expectedQuantities);
      const receivedQuantitiesByUnit = quantityBreakdown(period.receivedQuantities);
      return {
        key: period.key,
        label: period.label,
        granularity: period.granularity,
        startDate: period.startDate,
        expectedQty: expectedQuantitiesByUnit.length === 1 ? expectedQuantitiesByUnit[0].value : 0,
        expectedWeightKg: null,
        expectedQuantitiesByUnit,
        receivedQty: receivedQuantitiesByUnit.length === 1 ? receivedQuantitiesByUnit[0].value : 0,
        receivedWeightKg: period.receivedWeightComplete && receivedQuantitiesByUnit.length ? period.receivedWeightKg : null,
        receivedQuantitiesByUnit,
      };
    });
}

function overdueRows(poBalances, today) {
  const reference = parseDate(today) || new Date();
  return poBalances
    .filter((balance) => isPoBalanceOverdue(balance, today))
    .map((balance) => poItemStatusRow(balance, reference))
    .sort((left, right) => right.daysOverdue - left.daysOverdue || right.pendingQty - left.pendingQty);
}

function poItemStatusRow(balance, reference) {
  const expected = poBalanceExpectedDate(balance);
  return {
    poNumber: text(balance.order.poNumber),
    itemNumber: text(balance.item.itemNumber),
    identCode: text(balance.item.identCode),
    materialCode: text(balance.item.materialCode),
    sapCode: text(balance.item.sapCode),
    materialGrade: text(balance.item.materialGrade),
    materialDescription: text(balance.item.description),
    expectedDeliveryDate: expected ? expected.toISOString().slice(0, 10) : '',
    daysOverdue: balance.isOverdue && expected
      ? Math.max(1, Math.floor((reference.getTime() - expected.getTime()) / 86400000))
      : 0,
    orderedQty: balance.ordered,
    receivedQty: balance.received,
    pendingQty: balance.pending,
    unit: balance.unit,
    nominalStatus: status(balance.item.status || 'OPEN'),
    completionStatus: balance.completionStatus,
    isOverdue: balance.isOverdue,
  };
}

export function allPoItemStatusRows(data = {}, options = {}) {
  const allPurchaseOrders = list(data.purchaseOrders);
  const purchaseOrders = activePurchaseOrders(allPurchaseOrders);
  const lookupSeed = buildPoLookup(allPurchaseOrders, list(data.poItems));
  const poItems = activePoItems(data.poItems, lookupSeed.purchaseOrdersById);
  const lookup = buildPoLookup(purchaseOrders, poItems);
  const balances = calculatePoBalances({
    purchaseOrders,
    poItems,
    receipts: list(data.receipts),
    receiptLines: list(data.receiptLines),
    inventoryItems: list(data.inventoryItems || data.inventory),
    lookup,
    today: options.today,
  });
  const reference = parseDate(options.today) || new Date();
  return balances.map((balance) => poItemStatusRow(balance, reference));
}

const PO_ITEM_STATUS_BUCKETS = Object.freeze([
  { key: 'RECEIVED_BUCKET', statuses: new Set(['RECEIVED', 'CLOSED']) },
  { key: 'IN_TRANSIT_BUCKET', statuses: new Set(['SHIPPED', 'PARTIALLY_RECEIVED']) },
  { key: 'IN_PRODUCTION_BUCKET', statuses: new Set(['OPEN', 'IN_PRODUCTION']) },
]);

export function buildPoItemStatusBreakdown(data = {}, options = {}) {
  const rows = allPoItemStatusRows(data, options);
  const buckets = PO_ITEM_STATUS_BUCKETS.map(({ key }) => ({ key, count: 0, percentage: 0, overdueCount: 0 }));
  const bucketsByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const inconsistencies = [];

  rows.forEach((row) => {
    const definition = PO_ITEM_STATUS_BUCKETS.find((bucket) => bucket.statuses.has(row.nominalStatus));
    if (!definition) throw new Error(`Unsupported active PO Item status: ${row.nominalStatus}`);
    const bucket = bucketsByKey.get(definition.key);
    bucket.count += 1;
    if (definition.key === 'RECEIVED_BUCKET' && row.isOverdue) {
      inconsistencies.push({ poNumber: row.poNumber, itemNumber: row.itemNumber, nominalStatus: row.nominalStatus, issue: 'RECEIVED_ITEM_MARKED_OVERDUE' });
      return;
    }
    if (row.isOverdue) bucket.overdueCount += 1;
  });

  const totalItems = buckets.reduce((total, bucket) => total + bucket.count, 0);
  buckets.forEach((bucket) => { bucket.percentage = totalItems ? bucket.count / totalItems : 0; });
  return { totalItems, buckets, inconsistencies };
}

function weeklyReceiptRows(context) {
  const receiptById = new Map(context.receipts.map((receipt) => [text(receipt.id), receipt]));
  const lineById = new Map(context.receiptLines.map((line) => [text(line.id), line]));
  const groups = new Map();
  const poBalanceById = new Map(context.poBalances.map((balance) => [text(balance.item.id), balance]));
  const ensure = (weekInfo) => {
    if (!groups.has(weekInfo.key)) groups.set(weekInfo.key, {
      week: weekInfo.key,
      weekLabel: weekInfo.label,
      weekYear: weekInfo.year,
      weekStart: weekInfo.startDate,
      receiptIds: new Set(),
      quantities: new Map(),
      weightKg: 0,
    });
    return groups.get(weekInfo.key);
  };
  const addQuantity = (group, unitOfMeasure, quantity) => {
    const normalizedUnit = normalizeReportUnit(unitOfMeasure);
    const amount = Math.max(0, numberValue(quantity));
    if (amount <= 0) return;
    group.quantities.set(normalizedUnit, (group.quantities.get(normalizedUnit) || 0) + amount);
  };

  context.receiptLines.forEach((line) => {
    const receipt = receiptById.get(text(line.receiptId));
    if (!receipt) return;
    const factor = context.poItemFactors?.get(text(line.poItemId)) ?? (context.isTagFiltered ? 0 : 1);
    if (factor <= 0) return;
    const week = reportIsoWeek(receipt.arrivalDate || receipt.receivedDate);
    if (!week) return;
    const group = ensure(week);
    group.receiptIds.add(text(receipt.id));
    addQuantity(group, line.unitOfMeasure || poBalanceById.get(text(line.poItemId))?.unit, numberValue(line.receivedQuantity) * factor);
  });
  context.materialUnits.forEach((unit) => {
    const line = lineById.get(text(unit.receiptLineId));
    const receipt = line ? receiptById.get(text(line.receiptId)) : null;
    const week = reportIsoWeek(receipt?.arrivalDate || receipt?.receivedDate);
    const factor = context.poItemFactors?.get(text(unit.poItemId || line?.poItemId)) ?? (context.isTagFiltered ? 0 : 1);
    if (week && factor > 0) ensure(week).weightKg += Math.max(0, numberValue(unit.weightKg)) * factor;
  });

  const postedUnitIds = new Set(context.materialUnits.flatMap((unit) => [unit.id, unit.inventoryItemId]).map(text).filter(Boolean));
  const materialUnitByIdentity = new Map();
  context.materialUnits.forEach((unit) => [unit.id, unit.inventoryItemId].map(text).filter(Boolean)
    .forEach((identity) => materialUnitByIdentity.set(identity, unit)));
  const knownReceiptIds = new Set(context.receipts.map((receipt) => text(receipt.id)).filter(Boolean));
  const knownReceiptLineIds = new Set(context.receiptLines.map((line) => text(line.id)).filter(Boolean));
  context.inventoryItems.forEach((item) => {
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const inventoryIdentity = text(item.id || item.trace || item.traceability);
    const alreadyCounted = postedUnitIds.has(text(metadata.materialUnitId))
      || postedUnitIds.has(inventoryIdentity)
      || knownReceiptIds.has(text(item.sourceDocumentId || metadata.receiptId))
      || knownReceiptLineIds.has(text(metadata.receiptLineId));
    const materialUnit = materialUnitByIdentity.get(text(metadata.materialUnitId))
      || materialUnitByIdentity.get(inventoryIdentity);
    const linkedLine = lineById.get(text(metadata.receiptLineId || materialUnit?.receiptLineId));
    const linkedReceipt = linkedLine ? receiptById.get(text(linkedLine.receiptId)) : null;
    const poItemId = inferInventoryPoItemId(item, context.lookup);
    const factor = context.inventoryTagFactors?.has(inventoryIdentity)
      ? context.inventoryTagFactors.get(inventoryIdentity)
      : (context.poItemFactors?.get(poItemId) ?? (context.isTagFiltered ? 0 : 1));
    if (factor <= 0) return;
    const week = reportIsoWeek(item.receivedDate || linkedReceipt?.arrivalDate || linkedReceipt?.receivedDate);
    if (!week) return;
    const group = ensure(week);
    if (!materialUnit || numberValue(materialUnit.weightKg) <= 0) {
      group.weightKg += Math.max(0, numberValue(item.weightKg)) * factor;
    }
    if (!alreadyCounted) {
      addQuantity(group, item.unit, (numberValue(item.receivedQty) || numberValue(item.qty)) * factor);
      const legacyReceiptId = text(item.mir || item.mrr || item.nfArrival || item.sourceDocumentId || inventoryIdentity);
      if (legacyReceiptId) group.receiptIds.add(`legacy:${legacyReceiptId}`);
    }
  });

  return [...groups.values()]
    .map((row) => {
      const quantitiesByUnit = [...row.quantities.entries()]
        .map(([unit, value]) => ({ unit, value }))
        .sort((left, right) => left.unit.localeCompare(right.unit));
      return {
        week: row.week,
        weekLabel: row.weekLabel,
        weekYear: row.weekYear,
        weekStart: row.weekStart,
        receiptCount: row.receiptIds.size,
        quantitiesByUnit,
        quantitySummary: quantitiesByUnit.map(({ unit, value }) => `${Number(value.toFixed(3))} ${unit}`).join(' · ') || '—',
        receivedQuantity: quantitiesByUnit.length === 1 ? quantitiesByUnit[0].value : 0,
        weightKg: row.weightKg,
      };
    })
    .sort((left, right) => left.week.localeCompare(right.week));
}

function quantitiesByUnit(poBalances, selector) {
  const totals = new Map();
  poBalances.forEach((balance) => {
    const unit = normalizeReportUnit(balance.unit);
    const value = Math.max(0, numberValue(selector(balance)));
    totals.set(unit, (totals.get(unit) || 0) + value);
  });
  return [...totals.entries()]
    .map(([unit, value]) => ({ unit, value }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

function measureByUnit(poBalances, selector) {
  const breakdown = quantitiesByUnit(poBalances, selector);
  return {
    value: breakdown.map(({ unit, value }) => `${Number(value.toFixed(3))} ${unit}`).join(' · ') || '0',
    unit: '',
    format: 'uom',
    breakdown,
    note: 'PCS/PC/UN consolidados como EA; unidades dimensionais permanecem separadas.',
  };
}

function poBalanceByUnit(poBalances) {
  const units = new Map();
  poBalances.forEach((balance) => {
    const unit = normalizeReportUnit(balance.unit);
    const row = units.get(unit) || { unit, purchased: 0, received: 0, pending: 0 };
    row.purchased += balance.ordered;
    row.received += balance.received;
    row.pending += balance.pending;
    units.set(unit, row);
  });
  return [...units.values()].filter((row) => row.purchased > 0).sort((left, right) => left.unit.localeCompare(right.unit));
}

function issuedInventoryTagFactors(data, selectedMtoIds, isTagFiltered) {
  if (!isTagFiltered) return new Map();
  const reservationsById = new Map(list(data.materialReservations).map((reservation) => [text(reservation.id), reservation]));
  const factors = new Map();
  list(data.stockMovements)
    .filter((movement) => status(movement.movementType) === 'ISSUE_MATERIAL')
    .forEach((movement) => {
      const reservationIds = Array.isArray(movement.metadata?.reservationIds) ? movement.metadata.reservationIds : [];
      const linkedReservations = reservationIds.map((id) => reservationsById.get(text(id))).filter(Boolean);
      if (!linkedReservations.length) return;
      const selected = linkedReservations.some((reservation) => selectedMtoIds.has(text(reservation.mtoItemId)));
      factors.set(text(movement.inventoryItemId), selected ? 1 : 0);
    });
  return factors;
}

function inventoryFactor(item, lookup, poItemFactors, isTagFiltered, inventoryTagFactors = new Map()) {
  if (!isTagFiltered) return 1;
  const issuedFactor = [item.id, item.trace, item.traceability]
    .map(text)
    .find((identity) => inventoryTagFactors.has(identity));
  if (issuedFactor) return inventoryTagFactors.get(issuedFactor);
  const poItemId = inferInventoryPoItemId(item, lookup);
  return poItemFactors.get(poItemId) || 0;
}

function kpi(key, label, value, options = {}) {
  return { key, label, value, ...options };
}

const SHORTAGE_COLUMNS = Object.freeze([
  { key: 'projectName', label: 'Projeto' },
  { key: 'identCode', label: 'IDENT CODE' },
  { key: 'materialGrade', label: 'Material / Grade' },
  { key: 'materialDescription', label: 'Descrição' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'mark', label: 'Mark' },
  { key: 'position', label: 'Posição' },
  { key: 'requiredQty', label: 'Requerido', format: 'number' },
  { key: 'availableQty', label: 'Disponível', format: 'number' },
  { key: 'shortageQty', label: 'Falta hoje', format: 'number' },
  { key: 'shortageWeightKg', label: 'Peso faltante (kg)', format: 'kg' },
]);

const CRITICAL_COLUMNS = Object.freeze([
  { key: 'projectName', label: 'Projeto' },
  { key: 'identCode', label: 'IDENT CODE' },
  { key: 'materialGrade', label: 'Material / Grade' },
  { key: 'materialDescription', label: 'Descrição' },
  { key: 'requiredQty', label: 'Requerido', format: 'number' },
  { key: 'availableQty', label: 'Disponível', format: 'number' },
  { key: 'inTransitQty', label: 'Em trânsito', format: 'number' },
  { key: 'missingQty', label: 'Sem cobertura', format: 'number' },
]);

const OVERDUE_COLUMNS = Object.freeze([
  { key: 'poNumber', label: 'PO' },
  { key: 'itemNumber', label: 'Item' },
  { key: 'identCode', label: 'IDENT CODE' },
  { key: 'materialGrade', label: 'Material / Grade' },
  { key: 'materialDescription', label: 'Descrição' },
  { key: 'expectedDeliveryDate', label: 'Entrega prevista', format: 'date' },
  { key: 'daysOverdue', label: 'Dias em atraso', format: 'integer' },
  { key: 'pendingQty', label: 'Pendente', format: 'number' },
  { key: 'unit', label: 'Un.' },
]);

const PO_ITEM_STATUS_COLUMNS = Object.freeze([
  { key: 'poNumber', label: 'PO' },
  { key: 'itemNumber', label: 'Item' },
  { key: 'identCode', label: 'IDENT CODE' },
  { key: 'materialGrade', label: 'Material / Grade' },
  { key: 'orderedQty', label: 'Pedido', format: 'number' },
  { key: 'receivedQty', label: 'Recebido', format: 'number' },
  { key: 'pendingQty', label: 'Pendente', format: 'number' },
  { key: 'completionStatus', label: 'Status', format: 'completionStatus' },
  { key: 'isOverdue', label: 'Prazo', format: 'overdueStatus' },
]);

/**
 * Pure Phase 1 Reports calculation. It consumes raw arrays and returns a UI/
 * export view model without reading IndexedDB or the DOM.
 */
export function calculateReportsDashboard(data = {}, options = {}) {
  const projects = list(data.projects);
  const equipmentsById = new Map(list(data.equipments).map((equipment) => [text(equipment.id), equipment]));
  const selectedTag = text(options.equipmentTag);
  const selectedTagToken = tagToken(selectedTag);
  const isTagFiltered = Boolean(selectedTagToken);
  const allPurchaseOrders = list(data.purchaseOrders);
  const purchaseOrders = activePurchaseOrders(allPurchaseOrders);
  const lookupSeed = buildPoLookup(allPurchaseOrders, list(data.poItems));
  const poItems = activePoItems(data.poItems, lookupSeed.purchaseOrdersById);
  const lookup = buildPoLookup(purchaseOrders, poItems);
  const receipts = validReceipts(data.receipts);
  const validReceiptIds = new Set(receipts.map((receipt) => text(receipt.id)));
  const receiptLines = list(data.receiptLines).filter((line) => !text(line.receiptId) || validReceiptIds.has(text(line.receiptId)));
  const materialUnits = list(data.materialUnits).filter((unit) => !['REJECTED', 'CANCELLED'].includes(status(unit.inspectionStatus || unit.status)));
  const inventoryItems = list(data.inventoryItems || data.inventory);
  const allMtoItems = activeMtoItems(data.mtoItems);
  const automaticMatch = suggestMtoPoItemAllocationsByIdentCode({
    mtoItems: allMtoItems,
    poItems,
    existingAllocations: list(data.allocations),
  });
  const effectiveAllocations = [
    ...list(data.allocations),
    ...automaticMatch.suggestions.map((allocation) => ({
      ...allocation,
      id: `AUTO:${allocation.mtoLineId}:${allocation.poItemId}`,
      status: 'ACTIVE',
    })),
  ];
  const mtoItems = isTagFiltered
    ? allMtoItems.filter((item) => mtoTags(item, equipmentsById).some((tag) => tagToken(tag) === selectedTagToken))
    : allMtoItems;
  const projectsById = new Map(projects.map((project) => [text(project.id), project]));
  const mtoItemsById = new Map(mtoItems.map((item) => [text(item.id), item]));
  const materialUnitsById = new Map(materialUnits.map((unit) => [text(unit.id), unit]));
  const poBalances = calculatePoBalances({ purchaseOrders, poItems, receipts, receiptLines, inventoryItems, lookup, today: options.today });
  const poBalancesById = new Map(poBalances.map((balance) => [text(balance.item.id), balance]));
  const allocationState = allocationPendingByMto(effectiveAllocations, poBalancesById, mtoItemsById);
  const selectedMtoIds = new Set(mtoItems.map((item) => text(item.id)));
  const scopedProcurement = poBalancesForMtoScope(poBalances, effectiveAllocations, selectedMtoIds, isTagFiltered);
  const inventoryTagFactors = issuedInventoryTagFactors(data, selectedMtoIds, isTagFiltered);
  const reportingPoBalances = scopedProcurement.poBalances;
  const context = {
    projectsById,
    lookup,
    materialUnitsById,
    mtoItems,
    inventoryItems,
    purchaseOrders,
    poItems,
    receipts,
    receiptLines,
    materialUnits,
    poBalances: reportingPoBalances,
    poItemFactors: scopedProcurement.poItemFactors,
    inventoryTagFactors,
    isTagFiltered,
    ...allocationState,
  };
  const { itemRows, materialRows } = buildDemandAnalysis(data, context);
  const coverage = requiredCoverage(materialRows);
  const byProject = projectBreakdown(materialRows, projects, data.scope || {});
  const topShortages = itemRows
    .filter((row) => row.shortageQty > 0.000001)
    .sort((left, right) => right.shortageWeightKg - left.shortageWeightKg || right.shortageQty - left.shortageQty)
    .slice(0, 10);
  const topCriticalMaterials = materialRows
    .filter((row) => row.critical)
    .sort((left, right) => right.missingQty - left.missingQty || right.shortageWeightKg - left.shortageWeightKg)
    .slice(0, 10);
  const overdue = overdueRows(reportingPoBalances, options.today);
  const receivedWeightKg = sum(
    inventoryItems.filter((item) => item.isOffcut !== true && !text(item.parentStockId)),
    (item) => Math.max(0, numberValue(item.weightKg)) * inventoryFactor(item, lookup, scopedProcurement.poItemFactors, isTagFiltered, inventoryTagFactors),
  );
  const availableWeightKg = sum(itemRows, (row) => row.availableWeightKg);
  const missingWeightKg = sum(itemRows, (row) => row.shortageWeightKg);
  const criticalItems = itemRows.filter((row) => row.critical).length;
  const coveredMaterials = materialRows.filter((row) => row.coverage >= 0.999999).length;
  const pendingPoIds = new Set(reportingPoBalances
    .filter((balance) => balance.pending > 0)
    .map((balance) => text(balance.item.purchaseOrderId))
    .filter(Boolean));
  const reportingPoIds = new Set(reportingPoBalances.map((balance) => text(balance.item.purchaseOrderId)).filter(Boolean));
  const openPoCount = purchaseOrders.filter((order) => (!isTagFiltered || reportingPoIds.has(text(order.id))) && !CLOSED_PO_STATUSES.has(status(order.status))).length;
  const mirIssued = new Set(inventoryItems
    .filter((item) => inventoryFactor(item, lookup, scopedProcurement.poItemFactors, isTagFiltered, inventoryTagFactors) > 0)
    .map((item) => token(item.mir)).filter(Boolean)).size;
  const weeklyReceipts = weeklyReceiptRows(context);
  const purchasedMeasure = measureByUnit(reportingPoBalances, (balance) => balance.ordered);
  const receivedMeasure = measureByUnit(reportingPoBalances, (balance) => balance.received);
  const poUnitRows = poBalanceByUnit(reportingPoBalances);
  const poItemStatusRows = allPoItemStatusRows(data, options);
  const basisNote = coverage.basis === 'WEIGHT' ? 'Base: peso MTO' : 'Base: quantidade MTO';

  return {
    demandAnalysis: { itemRows, materialRows },
    executive: {
      id: 'executive',
      title: 'Dashboard Executivo',
      question: 'O que podemos fabricar hoje?',
      kpis: [
        kpi('materialAvailability', 'Material Availability', coverage.value, { unit: '%', format: 'percent', note: basisNote }),
        kpi('receivedWeightKg', 'Peso Recebido', receivedWeightKg, { unit: 'kg', format: 'kg' }),
        kpi('missingWeightKg', 'Peso Faltante', missingWeightKg, { unit: 'kg', format: 'kg' }),
        kpi('criticalItems', 'Itens Críticos', criticalItems, { format: 'integer' }),
      ],
      charts: { manufacturableByProject: byProject },
      tables: [
        { key: 'shortages', title: 'Top 10 itens em falta', columns: SHORTAGE_COLUMNS, rows: topShortages },
        { key: 'criticalMaterials', title: 'Top 10 materiais críticos', columns: CRITICAL_COLUMNS, rows: topCriticalMaterials },
        { key: 'overduePurchaseOrders', title: 'Top 10 POs atrasadas', columns: OVERDUE_COLUMNS, rows: overdue.slice(0, 10) },
      ],
    },
    availability: {
      id: 'availability',
      title: 'Material Availability',
      question: 'O que eu consigo fabricar hoje?',
      kpis: [
        kpi('mtoCoverage', 'MTO coberta', coverage.value, { unit: '%', format: 'percent', note: basisNote }),
        kpi('materialsCovered', 'Materiais disponíveis x requeridos', `${coveredMaterials} / ${materialRows.length}`, { note: 'Grupos de material totalmente cobertos' }),
        kpi('availableWeightKg', 'Peso disponível', availableWeightKg, { unit: 'kg', format: 'kg' }),
        kpi('missingWeightKg', 'Peso faltante', missingWeightKg, { unit: 'kg', format: 'kg' }),
        kpi('pendingPurchaseOrders', 'POs pendentes', pendingPoIds.size, { format: 'integer' }),
        kpi('criticalItems', 'Itens críticos', criticalItems, { format: 'integer' }),
      ],
      charts: { overallPercent: coverage.value, byProject },
      tables: [{ key: 'shortages', title: 'Top 10 faltas', columns: SHORTAGE_COLUMNS, rows: topShortages }],
    },
    receiving: {
      id: 'receiving',
      title: 'Recebimento',
      question: 'Quanto material já chegou?',
      kpis: [
        kpi('totalPurchased', 'Total comprado', purchasedMeasure.value, purchasedMeasure),
        kpi('totalReceived', 'Total recebido', receivedMeasure.value, receivedMeasure),
        kpi('receivedWeightKg', 'Peso recebido', receivedWeightKg, { unit: 'kg', format: 'kg' }),
        kpi('openPurchaseOrders', 'POs abertas', openPoCount, { format: 'integer' }),
        kpi('mirIssued', 'MIR emitidos', mirIssued, { format: 'integer' }),
      ],
      charts: { weeklyReceipts, poBalanceByUnit: poUnitRows },
      poItemStatusRows,
      tables: [
        {
          key: 'weeklyReceipts',
          title: 'Recebimentos por semana',
          columns: [
            { key: 'weekLabel', label: 'Semana ISO' },
            { key: 'weekYear', label: 'Ano', format: 'integer' },
            { key: 'receiptCount', label: 'Recebimentos', format: 'integer' },
            { key: 'quantitySummary', label: 'Quantidades recebidas' },
            { key: 'weightKg', label: 'Peso (kg)', format: 'kg' },
          ],
          rows: weeklyReceipts,
        },
        {
          key: 'poBalance',
          title: 'PO Recebido x Pendente',
          columns: [
            { key: 'unit', label: 'Unidade' },
            { key: 'purchased', label: 'Comprado', format: 'number' },
            { key: 'received', label: 'Recebido', format: 'number' },
            { key: 'pending', label: 'Pendente', format: 'number' },
          ],
          rows: poUnitRows,
        },
        {
          key: 'poItemStatus',
          title: 'Status completo dos itens de PO',
          description: 'Acompanhamento nominal de todos os itens ativos, incluindo recebimento e prazo contratual.',
          columns: PO_ITEM_STATUS_COLUMNS,
          rows: poItemStatusRows,
          showAll: true,
          emptyMessage: 'Nenhum item de PO ativo encontrado.',
        },
      ],
    },
    assumptions: {
      equipmentTag: selectedTag,
      coverageBasis: coverage.basis,
      automaticIdentCodeLinks: automaticMatch.suggestions.length,
      automaticIdentCodeIssues: automaticMatch.issues.length,
      issuedInventoryTagLinks: [...inventoryTagFactors.values()].filter((factor) => factor > 0).length,
      demandItemCount: itemRows.length,
      overduePurchaseOrders: overdue.length,
      fallbackMaterialGroups: materialRows.filter((row) => isFallbackMaterialKey(row.materialKey)).length,
      unresolvedInventoryItems: inventoryItems.filter((item) => !inferInventoryProjectId(item, lookup, materialUnitsById, data.scope || {})).length,
      overdueDateField: 'expectedDeliveryDate || contractualDeliveryDate',
    },
  };
}
