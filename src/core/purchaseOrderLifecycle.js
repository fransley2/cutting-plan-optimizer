function text(value) {
  return value == null ? '' : String(value).trim();
}

function sameProject(record = {}, projectId = '') {
  return !text(record.projectId) || !text(projectId) || text(record.projectId) === text(projectId);
}

function inventoryMatchesItem(inventoryItem = {}, purchaseOrder = {}, item = {}) {
  if (!sameProject(inventoryItem, item.projectId || purchaseOrder.projectId)) return false;
  if (text(inventoryItem.poItemId) === text(item.id)) return true;
  if (text(inventoryItem.purchaseOrderId) === text(purchaseOrder.id)
    && text(inventoryItem.poItem || inventoryItem.poItemNumber || inventoryItem.item) === text(item.itemNumber)) return true;
  const poNumber = text(inventoryItem.po || inventoryItem.purchaseOrder || inventoryItem.purchaseOrderNumber);
  const itemNumber = text(inventoryItem.poItem || inventoryItem.poItemNumber || inventoryItem.item);
  return Boolean(poNumber && itemNumber
    && poNumber === text(purchaseOrder.poNumber)
    && itemNumber === text(item.itemNumber));
}

export function purchaseOrderItemDeletionBlockers(item = {}, purchaseOrder = {}, data = {}) {
  const blockers = [];
  const receiptLines = Array.isArray(data.receiptLines) ? data.receiptLines : [];
  const materialUnits = Array.isArray(data.materialUnits) ? data.materialUnits : [];
  const inventoryItems = Array.isArray(data.inventoryItems) ? data.inventoryItems : [];
  const allocations = Array.isArray(data.allocations) ? data.allocations : [];
  const deliveryForecasts = Array.isArray(data.deliveryForecasts) ? data.deliveryForecasts : [];

  if (receiptLines.some((line) => text(line.poItemId) === text(item.id)
    || (text(line.purchaseOrderId) === text(purchaseOrder.id) && text(line.poItemNumber) === text(item.itemNumber)))) {
    blockers.push({ code: 'PO_ITEM_HAS_RECEIPTS', label: 'possui recebimentos registrados' });
  }
  if (materialUnits.some((unit) => text(unit.poItemId) === text(item.id))) {
    blockers.push({ code: 'PO_ITEM_HAS_MATERIAL_UNITS', label: 'possui unidades físicas rastreáveis' });
  }
  if (inventoryItems.some((inventoryItem) => inventoryMatchesItem(inventoryItem, purchaseOrder, item))) {
    blockers.push({ code: 'PO_ITEM_HAS_INVENTORY', label: 'possui material no Inventory' });
  }
  if (allocations.some((allocation) => text(allocation.poItemId) === text(item.id))) {
    blockers.push({ code: 'PO_ITEM_HAS_MTO_ALLOCATIONS', label: 'está vinculado à MTO' });
  }
  if (deliveryForecasts.some((forecast) => text(forecast.poItemId) === text(item.id))) {
    blockers.push({ code: 'PO_ITEM_HAS_DELIVERY_FORECASTS', label: 'possui previsoes logisticas registradas' });
  }
  return blockers;
}

export function purchaseOrderDeletionBlockers(purchaseOrder = {}, items = [], data = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => text(item.purchaseOrderId) === text(purchaseOrder.id))
    .flatMap((item) => purchaseOrderItemDeletionBlockers(item, purchaseOrder, data)
      .map((blocker) => ({ ...blocker, itemId: item.id, itemNumber: item.itemNumber })));
}
