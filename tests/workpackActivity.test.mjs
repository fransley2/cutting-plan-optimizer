import assert from 'node:assert/strict';
import { resolveWorkpackActivity } from '../src/core/workpackActivity.js';

const events = resolveWorkpackActivity([
  { id: '1', entityType: 'WORKPACK', entityId: 'WP-1', eventType: 'WORKPACK_UPDATED', userName: 'Operator', timestamp: '2026-01-02T00:00:00.000Z' },
  { id: '2', entity: { type: 'workpack', id: 'WP-1' }, action: 'LEGACY_ACTION', user: 'Legacy user', createdAt: '2026-01-03T00:00:00.000Z' },
  { id: '3', metadata: { workpackId: 'WP-1', source: 'legacy' }, type: 'METADATA_LINK', timestamp: 'invalid' },
  { id: '4', entityType: 'WORKPACK', entityId: 'WP-2', eventType: 'OTHER', timestamp: '2026-01-04T00:00:00.000Z' },
  null,
], 'WP-1');

assert.deepEqual(events.map((event) => event.id), ['2', '1', '3'], 'valid timestamps must be newest first and invalid timestamps last');
assert.equal(events[1].user, 'Operator');
assert.equal(events[2].source, 'legacy');

console.log('workpack activity tests passed');
