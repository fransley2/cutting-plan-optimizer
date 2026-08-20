import assert from 'node:assert/strict';
import { resolveWorkpackDocuments } from '../src/core/workpackDocuments.js';

const workpack = { id: 'WP-1', projectId: 'PROJECT-1', materialCouponIds: ['MC-1', 'MC-MISSING', 'MC-1'], cuttingSheetIds: ['CS-1'], nestingPlanIds: ['PLAN-1'] };
const result = resolveWorkpackDocuments(workpack, {
  materialCoupons: [{ id: 'MC-1', number: 'MC-001', status: 'issued', updatedAt: '2026-01-02' }, { id: 'MC-2', number: 'MC-002', workpackId: 'WP-1' }, { id: 'MC-3', number: 'MC-003', projectId: 'PROJECT-1' }, { id: 'MC-4', number: 'MC-004' }],
  cuttingSheets: [{ id: 'CS-1', number: 'CS-001', planId: 'PLAN-1' }, { id: 'CS-2', number: 'CS-002', workpackId: 'WP-1' }],
  taskSheets: [{ id: 'TS-1', number: 'WP-1-TS-001', workpackId: 'WP-1', status: 'DRAFT' }],
  workpackLinks: [{ workpackId: 'WP-1', targetType: 'MATERIAL_COUPON', targetId: 'MC-4', status: 'ACTIVE' }],
});

assert.equal(result.records.length, 5, 'relation records should replace legacy IDs while explicit document references remain readable');
assert.equal(result.records.some((record) => record.id === 'TS-1' && record.type === 'Task Sheet'), true);
assert.equal(result.records.some((record) => record.id === 'MC-4'), true, 'new Workpack relation records should resolve documents');
assert.equal(result.records.some((record) => record.id === 'MC-3'), false, 'project-only documents must not be inferred');
assert.equal(result.records.some((record) => record.id === 'MC-1'), false, 'legacy arrays must not override an established relation register');
assert.deepEqual(result.missing, []);
assert.equal(result.records.some((record) => record.type === 'Saved Plan'), false, 'Saved Plans are migrated and no longer rendered as documents');
assert.equal(result.records.some((record) => record.id === 'CS-1'), true);

console.log('workpack documents tests passed');
