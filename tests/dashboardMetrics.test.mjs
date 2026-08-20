import assert from 'node:assert/strict';
import { aggregateDashboardMetrics, recentDashboardActivity } from '../src/core/dashboardMetrics.js';

const records = {
  equipments: [{ projectId: 'P1' }, { projectId: 'P2' }, { name: 'legacy' }],
  drawings: [{ projectId: 'P1' }, { projectId: 'P2' }],
  workpacks: [{ projectId: 'P1' }],
  mtoItems: [{ projectId: 'P1' }, { projectId: '' }],
  cuttingPackages: [{ projectId: 'P1' }, { projectId: 'P2' }],
  materialCoupons: [{ projectId: 'P1' }],
  offcuts: [{ projectId: 'P2' }],
  inventory: [{ trace: 'GLOBAL-1' }, { trace: 'GLOBAL-2' }],
};

assert.deepEqual(aggregateDashboardMetrics(records), {
  equipments: 3, drawings: 2, workpacks: 1, mtoItems: 2,
  materialCoupons: 1, offcuts: 1, inventory: 2,
});
assert.deepEqual(aggregateDashboardMetrics(records, 'P1'), {
  equipments: 1, drawings: 1, workpacks: 1, mtoItems: 1,
  materialCoupons: 1, offcuts: 0, inventory: 2,
});
assert.deepEqual(aggregateDashboardMetrics({}, 'P1'), {
  equipments: 0, drawings: 0, workpacks: 0, mtoItems: 0,
  materialCoupons: 0, offcuts: 0, inventory: 0,
});

const events = [
  { id: 'old', timestamp: '2025-01-01T00:00:00Z', projectId: 'P1' },
  { id: 'bad', timestamp: 'invalid', projectId: 'P1' },
  { id: 'new', timestamp: '2026-01-01T00:00:00Z', projectId: 'P1' },
  { id: 'other', timestamp: '2027-01-01T00:00:00Z', projectId: 'P2' },
];
assert.deepEqual(recentDashboardActivity(events, 'P1', 10).map((event) => event.id), ['new', 'old', 'bad']);
assert.deepEqual(recentDashboardActivity(null), []);
console.log('dashboard metrics tests passed');
