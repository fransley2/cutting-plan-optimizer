import { CUSTOMS_CHANNELS, PO_DELIVERY_STAGES, validatePoDeliveryForecast } from '../core/poDeliveryForecast.js';
import { createAuditEvent } from './auditLog.js';
import { getDB } from './database.js';
import { idbGet, idbGetAll, idbPut, idbRequest, idbTransaction } from './idb.js';

const STORE_NAME = 'poDeliveryForecasts';

function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }
function nowIso() { return new Date().toISOString(); }

export function normalizePoDeliveryForecast(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId || existing?.projectId),
    purchaseOrderId: text(input.purchaseOrderId || existing?.purchaseOrderId),
    poItemId: text(input.poItemId || existing?.poItemId),
    shipmentReference: text(input.shipmentReference ?? existing?.shipmentReference),
    quantity: numberValue(input.quantity ?? existing?.quantity),
    unitOfMeasure: text(input.unitOfMeasure || existing?.unitOfMeasure).toUpperCase() || 'EA',
    stage: text(input.stage || existing?.stage || PO_DELIVERY_STAGES.SUPPLIER).toUpperCase(),
    customsChannel: text(input.customsChannel || existing?.customsChannel || CUSTOMS_CHANNELS.NOT_DEFINED).toUpperCase(),
    originCountry: text(input.originCountry ?? existing?.originCountry),
    portOfArrival: text(input.portOfArrival ?? existing?.portOfArrival),
    trackingReference: text(input.trackingReference ?? existing?.trackingReference),
    portEtaDate: text(input.portEtaDate ?? existing?.portEtaDate),
    portArrivalDate: text(input.portArrivalDate ?? existing?.portArrivalDate),
    customsReleaseForecastDate: text(input.customsReleaseForecastDate ?? existing?.customsReleaseForecastDate),
    customsReleasedDate: text(input.customsReleasedDate ?? existing?.customsReleasedDate),
    invoiceDate: text(input.invoiceDate ?? existing?.invoiceDate),
    pickupForecastDate: text(input.pickupForecastDate ?? existing?.pickupForecastDate),
    pickupDate: text(input.pickupDate ?? existing?.pickupDate),
    ctcoForecastDate: text(input.ctcoForecastDate ?? existing?.ctcoForecastDate),
    ctcoArrivalDate: text(input.ctcoArrivalDate ?? existing?.ctcoArrivalDate),
    responsible: text(input.responsible ?? existing?.responsible),
    notes: text(input.notes ?? existing?.notes),
    status: text(input.status || existing?.status || 'ACTIVE').toUpperCase(),
    createdBy: text(input.createdBy || existing?.createdBy),
    updatedBy: text(input.updatedBy || input.createdBy || existing?.updatedBy),
    createdAt: text(input.createdAt) || existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    cancelledAt: text(input.cancelledAt || existing?.cancelledAt),
    cancelledBy: text(input.cancelledBy || existing?.cancelledBy),
    cancellationReason: text(input.cancellationReason || existing?.cancellationReason),
  };
}

async function auditForecast(eventType, record, before = null, reason = '') {
  return createAuditEvent({
    eventType, entityType: 'PO_DELIVERY_FORECAST', entityId: record.id, projectId: record.projectId,
    userName: record.cancelledBy || record.updatedBy || record.createdBy,
    sourceDocumentType: 'PURCHASE_ORDER_ITEM', sourceDocumentId: record.poItemId,
    reason, before, after: record,
    metadata: { purchaseOrderId: record.purchaseOrderId, poItemId: record.poItemId, quantity: record.quantity, stage: record.stage, customsChannel: record.customsChannel, ctcoForecastDate: record.ctcoForecastDate },
  });
}

export async function savePoDeliveryForecast(input = {}) {
  const db = await getDB();
  const result = await idbTransaction(db, [STORE_NAME, 'purchaseOrderItems'], 'readwrite', async (stores) => {
    const before = input.id ? await idbRequest(stores[STORE_NAME].get(input.id)) : null;
    const draft = normalizePoDeliveryForecast(input, before);
    const [poItem, existingForecasts] = await Promise.all([
      idbRequest(stores.purchaseOrderItems.get(draft.poItemId)),
      idbRequest(stores[STORE_NAME].getAll()),
    ]);
    const record = normalizePoDeliveryForecast({ ...draft, projectId: poItem?.projectId, purchaseOrderId: poItem?.purchaseOrderId, unitOfMeasure: poItem?.unitOfMeasure }, before);
    const validation = validatePoDeliveryForecast({ forecast: record, poItem, existingForecasts });
    if (!validation.valid) throw new Error(validation.errors[0].message);
    await idbRequest(stores[STORE_NAME].put(record));
    return { record, before };
  });
  await auditForecast(result.before ? 'PO_DELIVERY_FORECAST_UPDATED' : 'PO_DELIVERY_FORECAST_CREATED', result.record, result.before, 'Partial delivery forecast updated for Procurement planning.');
  return result.record;
}

export async function cancelPoDeliveryForecast(id, { reason = '', userName = '' } = {}) {
  const db = await getDB();
  const before = await idbGet(db, STORE_NAME, id);
  if (!before) return null;
  const record = normalizePoDeliveryForecast({ ...before, status: 'CANCELLED', stage: PO_DELIVERY_STAGES.CANCELLED, cancelledAt: nowIso(), cancelledBy: userName, cancellationReason: reason }, before);
  await idbPut(db, STORE_NAME, record);
  await auditForecast('PO_DELIVERY_FORECAST_CANCELLED', record, before, reason || 'Partial delivery forecast cancelled.');
  return record;
}

export async function listPoDeliveryForecasts(filters = {}) {
  return (await idbGetAll(await getDB(), STORE_NAME)).filter((record) => (
    (!filters.projectId || record.projectId === String(filters.projectId))
    && (!filters.purchaseOrderId || record.purchaseOrderId === String(filters.purchaseOrderId))
    && (!filters.poItemId || record.poItemId === String(filters.poItemId))
    && (!filters.status || record.status === String(filters.status).toUpperCase())
  ));
}
