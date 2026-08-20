function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sum(records, field = 'quantity') {
  return records.reduce((total, record) => total + numberValue(record[field]), 0);
}

function upper(value) { return String(value || '').trim().toUpperCase(); }

function reference(value) {
  return upper(value).replace(/[\s/\\–—]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function inventoryMatchesPoItem(item = {}, purchaseOrder = {}, inventoryItem = {}) {
  if (inventoryItem.projectId && item.projectId && inventoryItem.projectId !== item.projectId) return false;
  if (inventoryItem.metadata?.poItemId === item.id) return true;
  const poNumber = upper(purchaseOrder.poNumber);
  const itemNumber = upper(item.itemNumber);
  if (!poNumber || !itemNumber) return false;
  if (upper(inventoryItem.po) === poNumber && upper(inventoryItem.poItem) === itemNumber) return true;
  return reference(inventoryItem.poItemPo) === reference(`${poNumber}-${itemNumber}`);
}

function inventoryQuantity(item, inventoryItem, field) {
  const quantity = numberValue(inventoryItem[field]);
  if (upper(item.unitOfMeasure) !== 'M' || inventoryItem.metadata?.isIndividuallySerialized !== true) return quantity;
  return quantity * numberValue(inventoryItem.lengthMm) / 1000;
}

function sumInventory(item, records, field) {
  return records.reduce((total, record) => total + inventoryQuantity(item, record, field), 0);
}

export function calculateInventoryReceivedQuantity(item = {}, inventoryItems = []) {
  const unitTotal = sumInventory(item, inventoryItems, 'qty');
  const reportedTotal = inventoryItems.reduce((highest, inventoryItem) => (
    Math.max(highest, inventoryQuantity(item, inventoryItem, 'receivedQty'))
  ), 0);
  return Math.max(unitTotal, reportedTotal);
}

export function calculatePoItemMetrics({
  item = {}, purchaseOrder = {}, receipts = [], receiptLines = [], materialUnits = [], inventoryItems = [], reservations = [], stockMovements = [],
} = {}) {
  const validReceiptIds = new Set(receipts.filter((receipt) => upper(receipt.status) !== 'CANCELLED').map((receipt) => receipt.id));
  const lines = receiptLines.filter((line) => line.poItemId === item.id && validReceiptIds.has(line.receiptId));
  const lineIds = new Set(lines.map((line) => line.id));
  const units = materialUnits.filter((unit) => unit.poItemId === item.id && lineIds.has(unit.receiptLineId));
  const unitInventoryIds = new Set(units.flatMap((unit) => [unit.id, unit.inventoryItemId]).filter(Boolean));
  const inventory = inventoryItems.filter((inventoryItem) => inventoryMatchesPoItem(item, purchaseOrder, inventoryItem)
    || unitInventoryIds.has(inventoryItem.id) || unitInventoryIds.has(inventoryItem.trace) || unitInventoryIds.has(inventoryItem.traceability));
  inventory.forEach((inventoryItem) => [inventoryItem.id, inventoryItem.trace, inventoryItem.traceability].filter(Boolean).forEach((id) => unitInventoryIds.add(id)));
  const ordered = numberValue(item.orderedQuantity);
  const receiptLineReceived = sum(lines, 'receivedQuantity');
  const inventoryReceived = calculateInventoryReceivedQuantity(item, inventory);
  const received = Math.max(receiptLineReceived, inventoryReceived);
  const accepted = sum(units.filter((unit) => upper(unit.inspectionStatus) === 'ACCEPTED'));
  const hold = sum(units.filter((unit) => upper(unit.inspectionStatus) === 'HOLD'));
  const rejected = sum(units.filter((unit) => upper(unit.inspectionStatus) === 'REJECTED'));
  const available = sumInventory(item, inventory, 'balanceQty');
  const inventoryReserved = sumInventory(item, inventory, 'reservedQty');
  const reservationQuantity = sum(reservations.filter((reservation) => upper(reservation.status) === 'ACTIVE'
    && (reservation.poItemId === item.id || unitInventoryIds.has(reservation.inventoryItemId))));
  const reserved = inventory.length ? inventoryReserved : reservationQuantity;
  const issued = Math.abs(sum(stockMovements.filter((movement) => upper(movement.movementType) === 'ISSUE_MATERIAL'
    && (movement.poItemId === item.id || unitInventoryIds.has(movement.inventoryItemId))), 'quantityDelta'));
  const consumed = Math.abs(sum(stockMovements.filter((movement) => upper(movement.movementType) === 'CONSUME_STOCK'
    && (movement.poItemId === item.id || unitInventoryIds.has(movement.inventoryItemId))), 'quantityDelta'));
  const returned = sum(stockMovements.filter((movement) => upper(movement.movementType) === 'RETURN_OFFCUT'
    && (movement.poItemId === item.id || unitInventoryIds.has(movement.inventoryItemId))), 'quantityDelta');
  const inventoryIssued = sumInventory(item, inventory, 'issuedQty');
  const used = inventory.length ? inventoryIssued : Math.max(issued, consumed);
  return {
    ordered, received, accepted, hold, rejected, available, reserved, stockOnHand: available + reserved, issued, consumed, used, returned,
    pending: Math.max(0, ordered - received),
    inspectionPending: Math.max(0, received - accepted - hold - rejected),
  };
}

export function derivePoItemStatus(metrics = {}, currentStatus = 'OPEN') {
  if (upper(currentStatus) === 'CANCELLED') return 'CANCELLED';
  if (numberValue(metrics.ordered) > 0 && numberValue(metrics.received) >= numberValue(metrics.ordered)) return 'RECEIVED';
  if (numberValue(metrics.received) > 0) return 'PARTIALLY_RECEIVED';
  return upper(currentStatus) || 'OPEN';
}

export function derivePurchaseOrderStatus(items = [], metricsByItem = new Map(), currentStatus = 'DRAFT') {
  if (['CANCELLED', 'CLOSED'].includes(upper(currentStatus))) return upper(currentStatus);
  if (!items.length) return upper(currentStatus) || 'DRAFT';
  const metrics = items.map((item) => metricsByItem.get(item.id) || {});
  if (metrics.every((item) => numberValue(item.ordered) > 0 && numberValue(item.received) >= numberValue(item.ordered))) return 'RECEIVED';
  if (metrics.some((item) => numberValue(item.received) > 0)) return 'PARTIALLY_RECEIVED';
  return upper(currentStatus) || 'DRAFT';
}

export function summarizeProcurement({ purchaseOrders = [], items = [], metricsByItem = new Map(), receipts = [], materialUnits = [] } = {}) {
  const metrics = items.map((item) => metricsByItem.get(item.id) || {});
  return {
    purchaseOrders: purchaseOrders.length,
    ordered: metrics.reduce((total, item) => total + numberValue(item.ordered), 0),
    received: metrics.reduce((total, item) => total + numberValue(item.received), 0),
    accepted: metrics.reduce((total, item) => total + numberValue(item.accepted), 0),
    hold: metrics.reduce((total, item) => total + numberValue(item.hold), 0),
    available: metrics.reduce((total, item) => total + numberValue(item.available), 0),
    reserved: metrics.reduce((total, item) => total + numberValue(item.reserved), 0),
    stockOnHand: metrics.reduce((total, item) => total + numberValue(item.stockOnHand), 0),
    used: metrics.reduce((total, item) => total + numberValue(item.used), 0),
    pending: metrics.reduce((total, item) => total + numberValue(item.pending), 0),
    receipts: receipts.length,
    physicalUnits: materialUnits.length,
  };
}
