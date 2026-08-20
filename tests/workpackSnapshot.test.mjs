import assert from 'node:assert/strict';
import { buildWorkpackReleaseSnapshot } from '../src/core/workpackSnapshot.js';

const workpack = { id: 'WP-1', wpNo: 'WP-001', projectId: 'P-1', equipmentId: 'E-1', sourceType: 'MTO_LINES', drawingIds: ['D-1'], mtoItemIds: ['M-1'], inventoryItemIds: ['I-1'], materialCouponIds: ['MC-1'], cuttingSheetIds: ['CS-1'] };
const sources = { drawings: [{ id: 'D-1', revision: 'B' }, { id: 'D-2' }], mtoItems: [{ id: 'M-1', mark: 'A' }], inventoryItems: [{ id: 'I-1', traceability: 'TR-1' }], materialCoupons: [{ id: 'MC-1' }], cuttingSheets: [{ id: 'CS-1' }] };
const snapshot = buildWorkpackReleaseSnapshot(workpack, sources, { userName: 'Planner', nowFactory: () => '2026-01-01T00:00:00.000Z' });
assert.equal(snapshot.createdBy, 'Planner');
assert.equal(snapshot.drawings[0].revision, 'B');
assert.equal(snapshot.mtoItems.length, 1);
assert.equal(snapshot.inventoryItems.length, 1);
sources.drawings[0].revision = 'C';
assert.equal(snapshot.drawings[0].revision, 'B', 'release snapshots must be immutable copies');
console.log('workpack snapshot tests passed');
