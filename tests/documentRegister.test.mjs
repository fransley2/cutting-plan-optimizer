import assert from 'node:assert/strict';
import { normalizeDocumentRegister } from '../src/core/documentRegister.js';

const records = normalizeDocumentRegister({
  materialCoupons: [{ id: 'mc-1', number: 'MC-1', projectId: 'P1', workpackId: 'WP-MC', status: 'issued', updatedAt: '2026-01-02T00:00:00Z' }],
  cuttingSheets: [{ id: 'cs-1', number: 'CS-1', projectId: 'P2', workpackId: 'WP-1', status: 'draft', updatedAt: 'invalid' }],
  workpacks: [{ id: 'wp-1', wpNo: '', projectId: '', status: 'ACTIVE', updatedAt: '2026-01-01T00:00:00Z' }, null],
});
assert.deepEqual(records.map((record) => record.documentType), ['Material Coupon', 'Workpack', 'Cutting Sheet']);
assert.equal(records[1].documentNumber, 'No document number');
assert.equal(records[0].workpackId, 'WP-MC');
assert.equal(records[1].projectId, '');
assert.equal(records[2].workpackId, 'WP-1');
assert.deepEqual(normalizeDocumentRegister(), []);
console.log('document register tests passed');
