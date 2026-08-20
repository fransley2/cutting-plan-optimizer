import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizePoItemDeliveryForecasts, validatePoDeliveryForecast } from '../src/core/poDeliveryForecast.js';

const poItem = { id: 'POI-1', projectId: 'P-1', orderedQuantity: 10, unitOfMeasure: 'EA' };

test('validates partial deliveries without exceeding the PO item quantity', () => {
  const result = validatePoDeliveryForecast({
    poItem,
    forecast: { id: 'F-2', projectId: 'P-1', poItemId: 'POI-1', quantity: 7, stage: 'INTERNATIONAL_TRANSIT', customsChannel: 'YELLOW', ctcoForecastDate: '2026-09-10' },
    existingForecasts: [{ id: 'F-1', poItemId: 'POI-1', quantity: 4, stage: 'SUPPLIER', status: 'ACTIVE' }],
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'PO_QUANTITY_EXCEEDED');
});

test('summarizes partial ETA coverage against the fabrication need date', () => {
  const summary = summarizePoItemDeliveryForecasts({
    poItem,
    receivedQuantity: 2,
    needByDate: '2026-09-15',
    forecasts: [
      { id: 'F-1', poItemId: 'POI-1', quantity: 4, stage: 'CUSTOMS_CLEARANCE', ctcoForecastDate: '2026-09-10', status: 'ACTIVE' },
      { id: 'F-2', poItemId: 'POI-1', quantity: 4, stage: 'INTERNATIONAL_TRANSIT', ctcoForecastDate: '2026-09-20', status: 'ACTIVE' },
    ],
  });
  assert.equal(summary.pendingQuantity, 8);
  assert.equal(summary.onTimeQuantity, 4);
  assert.equal(summary.onTimeRatio, 0.5);
  assert.equal(summary.risk, 'LATE');
  assert.equal(summary.nextCtcoDate, '2026-09-10');
});

test('distinguishes missing and partial ETA schedules', () => {
  assert.equal(summarizePoItemDeliveryForecasts({ poItem, receivedQuantity: 0 }).risk, 'NO_ETA');
  assert.equal(summarizePoItemDeliveryForecasts({
    poItem, receivedQuantity: 0, forecasts: [{ poItemId: 'POI-1', quantity: 4, stage: 'SUPPLIER', ctcoForecastDate: '2026-09-01' }],
  }).risk, 'PARTIAL_ETA');
});

test('does not offer an already arrived but not yet received partial delivery as unscheduled', () => {
  const summary = summarizePoItemDeliveryForecasts({
    poItem, receivedQuantity: 0,
    forecasts: [{ poItemId: 'POI-1', quantity: 4, stage: 'ARRIVED_CTCO', ctcoArrivalDate: '2026-09-01' }],
  });
  assert.equal(summary.scheduledPendingQuantity, 4);
  assert.equal(summary.unscheduledQuantity, 6);
});
