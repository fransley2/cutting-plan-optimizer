export const PO_DELIVERY_STAGES = Object.freeze({
  SUPPLIER: 'SUPPLIER',
  READY_AT_ORIGIN: 'READY_AT_ORIGIN',
  INTERNATIONAL_TRANSIT: 'INTERNATIONAL_TRANSIT',
  ARRIVED_BRAZIL: 'ARRIVED_BRAZIL',
  CUSTOMS_CLEARANCE: 'CUSTOMS_CLEARANCE',
  CUSTOMS_RELEASED: 'CUSTOMS_RELEASED',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  ROAD_TRANSIT: 'ROAD_TRANSIT',
  ARRIVED_CTCO: 'ARRIVED_CTCO',
  CANCELLED: 'CANCELLED',
});

export const CUSTOMS_CHANNELS = Object.freeze({
  NOT_DEFINED: 'NOT_DEFINED',
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  GRAY: 'GRAY',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

function text(value) { return value == null ? '' : String(value).trim(); }
function upper(value) { return text(value).toUpperCase(); }
function numberValue(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }
function active(record) { return upper(record.status) !== 'CANCELLED' && upper(record.stage) !== PO_DELIVERY_STAGES.CANCELLED; }
function day(value) { const normalized = text(value).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''; }

export function validatePoDeliveryForecast({ forecast = {}, poItem = {}, existingForecasts = [] } = {}) {
  const errors = [];
  const quantity = numberValue(forecast.quantity);
  const stage = upper(forecast.stage || PO_DELIVERY_STAGES.SUPPLIER);
  const customsChannel = upper(forecast.customsChannel || CUSTOMS_CHANNELS.NOT_DEFINED);
  const otherQuantity = existingForecasts
    .filter((record) => text(record.id) !== text(forecast.id) && text(record.poItemId) === text(forecast.poItemId) && active(record))
    .reduce((total, record) => total + numberValue(record.quantity), 0);

  if (!text(forecast.poItemId) || !text(poItem.id)) errors.push({ code: 'PO_ITEM_REQUIRED', message: 'PO Item is required.' });
  if (text(poItem.id) && text(forecast.poItemId) !== text(poItem.id)) errors.push({ code: 'PO_ITEM_MISMATCH', message: 'The forecast does not belong to the selected PO Item.' });
  if (text(forecast.projectId) && text(poItem.projectId) && text(forecast.projectId) !== text(poItem.projectId)) errors.push({ code: 'PROJECT_MISMATCH', message: 'The forecast and PO Item must belong to the same Project.' });
  if (quantity <= 0) errors.push({ code: 'QUANTITY_INVALID', message: 'Partial delivery quantity must be greater than zero.' });
  if (!Object.values(PO_DELIVERY_STAGES).includes(stage)) errors.push({ code: 'STAGE_INVALID', message: 'Import logistics stage is invalid.' });
  if (!Object.values(CUSTOMS_CHANNELS).includes(customsChannel)) errors.push({ code: 'CUSTOMS_CHANNEL_INVALID', message: 'Customs channel is invalid.' });
  if (stage !== PO_DELIVERY_STAGES.ARRIVED_CTCO && !day(forecast.ctcoForecastDate)) errors.push({ code: 'CTCO_ETA_REQUIRED', message: 'ETA CTCO is required for an open partial delivery.' });
  if (stage === PO_DELIVERY_STAGES.ARRIVED_CTCO && !day(forecast.ctcoArrivalDate)) errors.push({ code: 'CTCO_ARRIVAL_REQUIRED', message: 'Actual CTCO arrival date is required for an arrived partial delivery.' });
  const orderedQuantity = numberValue(poItem.orderedQuantity);
  if (orderedQuantity > 0 && otherQuantity + quantity > orderedQuantity + 0.000001) {
    errors.push({ code: 'PO_QUANTITY_EXCEEDED', message: `Partial deliveries exceed the PO Item quantity (${Math.max(0, orderedQuantity - otherQuantity)} ${text(poItem.unitOfMeasure) || 'EA'} available).` });
  }
  return { valid: errors.length === 0, errors, plannedQuantityBefore: otherQuantity };
}

export function summarizePoItemDeliveryForecasts({ poItem = {}, forecasts = [], receivedQuantity = 0, needByDate = '' } = {}) {
  const records = forecasts.filter((record) => text(record.poItemId) === text(poItem.id) && active(record));
  const ordered = numberValue(poItem.orderedQuantity);
  const received = Math.max(0, numberValue(receivedQuantity));
  const pending = Math.max(0, ordered - received);
  const open = records.filter((record) => upper(record.stage) !== PO_DELIVERY_STAGES.ARRIVED_CTCO);
  const arrived = records.filter((record) => upper(record.stage) === PO_DELIVERY_STAGES.ARRIVED_CTCO);
  const plannedOpenQuantity = open.reduce((total, record) => total + numberValue(record.quantity), 0);
  const arrivedQuantity = arrived.reduce((total, record) => total + numberValue(record.quantity), 0);
  const arrivedPendingQuantity = Math.max(0, arrivedQuantity - received);
  const scheduledPendingQuantity = Math.min(pending, plannedOpenQuantity + arrivedPendingQuantity);
  const needBy = day(needByDate);
  const dated = open.map((record) => ({ record, date: day(record.ctcoForecastDate) })).filter((entry) => entry.date);
  const arrivedOnTimeQuantity = !needBy || arrived.some((record) => day(record.ctcoArrivalDate) && day(record.ctcoArrivalDate) <= needBy) ? arrivedPendingQuantity : 0;
  const onTimeQuantity = arrivedOnTimeQuantity + (needBy
    ? dated.filter((entry) => entry.date <= needBy).reduce((total, entry) => total + numberValue(entry.record.quantity), 0)
    : plannedOpenQuantity);
  const ctcoDates = [...dated.map((entry) => entry.date), ...arrived.map((record) => day(record.ctcoArrivalDate)).filter(Boolean)].sort();
  const nextCtcoDate = ctcoDates[0] || '';
  const lastCtcoDate = ctcoDates.at(-1) || '';
  const unscheduledQuantity = Math.max(0, pending - scheduledPendingQuantity);
  let risk = 'RECEIVED';
  if (pending > 0 && scheduledPendingQuantity <= 0) risk = 'NO_ETA';
  else if (pending > 0 && unscheduledQuantity > 0.000001) risk = 'PARTIAL_ETA';
  else if (pending > 0 && needBy && onTimeQuantity + 0.000001 < pending) risk = 'LATE';
  else if (pending > 0) risk = 'ON_TIME';
  return {
    orderedQuantity: ordered,
    receivedQuantity: received,
    pendingQuantity: pending,
    plannedOpenQuantity,
    scheduledPendingQuantity,
    unscheduledQuantity,
    onTimeQuantity: Math.min(pending, onTimeQuantity),
    onTimeRatio: pending > 0 ? Math.max(0, Math.min(1, onTimeQuantity / pending)) : 1,
    nextCtcoDate,
    lastCtcoDate,
    risk,
    openForecasts: open,
  };
}
