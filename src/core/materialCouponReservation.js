function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function inventoryId(line = {}) { return text(line.inventoryItemId || line.inventoryId || line.traceability || line.trace); }
function requestedQuantity(line = {}) { return number(line.reservationQty ?? line.qty); }

function normalized(value) {
  return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isInventoryAvailableForReservation(item = {}) {
  return inventoryReservationAvailability(item).available;
}

export function inventoryReservationAvailability(item = {}) {
  const status = normalized(item.status);
  const inspectionStatus = normalized(item.inspectionStatus);
  const qualityStatus = normalized(item.qualityStatus || item.acceptanceStatus || 'accepted');
  const inspectionAccepted = ['', 'accepted', 'approved', 'released', 'aceito', 'liberado', 'n/a', 'na', 'n a'].includes(inspectionStatus);
  const qualityAccepted = ['accepted', 'approved', 'released', 'liberado', 'aceito', '', 'n/a', 'na', 'n a'].includes(qualityStatus);
  const availableStatus = status === 'available' || ['', 'n/a', 'na', 'n a'].includes(status);
  if (!inspectionAccepted) return { available: false, code: 'INVENTORY_INSPECTION_NOT_ACCEPTED', status, inspectionStatus, qualityStatus };
  if (!qualityAccepted) return { available: false, code: 'INVENTORY_QUALITY_NOT_ACCEPTED', status, qualityStatus };
  if (!availableStatus) return { available: false, code: status === 'reserved' ? 'INVENTORY_ALREADY_RESERVED' : 'INVENTORY_STATUS_NOT_AVAILABLE', status, qualityStatus };
  if (number(item.reservedQty) > 0) return { available: false, code: 'INVENTORY_ALREADY_RESERVED', status, qualityStatus };
  if (number(item.balanceQty) <= 0) return { available: false, code: 'INVENTORY_BALANCE_EMPTY', status, qualityStatus };
  return { available: true, code: '', status, qualityStatus };
}

export function validateMaterialCouponReservation(lines = [], inventoryItems = []) {
  const byId = new Map((Array.isArray(inventoryItems) ? inventoryItems : []).filter(Boolean).flatMap((item) => [[text(item.id), item], [text(item.trace), item], [text(item.traceability), item]]).filter(([id]) => id));
  const seen = new Set(); const errors = []; const reservations = [];
  (Array.isArray(lines) ? lines : []).forEach((line, index) => {
    const id = inventoryId(line); const quantity = requestedQuantity(line);
    if (!id && line?.manualLine === true) return;
    if (!id) { errors.push({ code: 'INVENTORY_ITEM_NOT_FOUND', index }); return; }
    if (seen.has(id)) { errors.push({ code: 'DUPLICATE_INVENTORY_LINE', index, inventoryItemId: id }); return; }
    seen.add(id); const item = byId.get(id);
    if (!item) { errors.push({ code: 'INVENTORY_ITEM_NOT_FOUND', index, inventoryItemId: id }); return; }
    const availability = inventoryReservationAvailability(item);
    if (!availability.available) { errors.push({ ...availability, index, inventoryItemId: id }); return; }
    if (quantity <= 0) { errors.push({ code: 'INVALID_RESERVATION_QUANTITY', index, inventoryItemId: id }); return; }
    if (number(item.balanceQty) < quantity) { errors.push({ code: 'INSUFFICIENT_INVENTORY_BALANCE', index, inventoryItemId: id }); return; }
    reservations.push({ inventoryItemId: text(item.id || item.trace), traceability: text(item.traceability || item.trace), quantity, line });
  });
  return { valid: errors.length === 0, errors, reservations };
}

export function applyMaterialCouponReservation(item = {}, quantity) {
  const reservedQty = number(item.reservedQty) + number(quantity);
  const balanceQty = number(item.balanceQty) - number(quantity);
  return { ...item, reservedQty, balanceQty, status: 'reserved' };
}
