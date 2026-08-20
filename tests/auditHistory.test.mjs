import assert from 'node:assert/strict';
import { buildAuditHistoryRows, filterAuditHistoryRows, summarizeAuditHistory } from '../src/core/auditHistory.js';

const rows = buildAuditHistoryRows([
  { id: 'A-1', eventType: 'MATERIAL_COUPON_ISSUED', timestamp: '2026-07-15T10:00:00.000Z', projectId: 'B58', entityType: 'MaterialCoupon', entityId: 'MC-1', userName: 'User A' },
  { id: 'A-2', eventType: 'GENERATE_RMV', timestamp: '2026-07-14T10:00:00.000Z', projectId: 'B58', entityType: 'RMV', entityId: 'RMV-1', metadata: { inventoryItemId: 'INV-1' } },
], [
  { id: 'M-1', movementType: 'RESERVE_STOCK', timestamp: '2026-07-15T11:00:00.000Z', projectId: 'B58', inventoryItemId: 'INV-1', sourceDocumentType: 'MaterialCoupon', sourceDocumentId: 'MC-1', previousStatus: 'available', nextStatus: 'reserved' },
]);

assert.equal(rows.length, 3);
assert.equal(rows[0].id, 'M-1');
assert.equal(rows[0].kind, 'MOVEMENT');
assert.equal(filterAuditHistoryRows(rows, { kind: 'AUDIT' }).length, 2);
assert.equal(filterAuditHistoryRows(rows, { search: 'mc-1' }).length, 2);
assert.equal(filterAuditHistoryRows(rows, { action: 'GENERATE_RMV' }).length, 1);
assert.equal(filterAuditHistoryRows(rows, { from: '2026-07-15', to: '2026-07-15' }).length, 2);
assert.deepEqual(summarizeAuditHistory(rows), { total: 3, auditEvents: 2, stockMovements: 1, materials: 1 });

console.log('audit history tests passed');
