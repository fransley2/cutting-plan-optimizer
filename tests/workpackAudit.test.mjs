import assert from 'node:assert/strict';
import { persistWorkpackAudit } from '../src/core/workpackAudit.js';

const success = await persistWorkpackAudit(async (payload) => ({ id: 'AUD-1', ...payload }), { eventType: 'WORKPACK_CREATED' });
assert.equal(success.ok, true);
assert.equal(success.event.id, 'AUD-1');

let warning = null;
const failure = await persistWorkpackAudit(async () => { throw new Error('audit unavailable'); }, { eventType: 'WORKPACK_UPDATED' }, (error) => { warning = error; });
assert.equal(failure.ok, false, 'audit failure must be isolated from the completed workpack action');
assert.equal(warning?.message, 'audit unavailable');

console.log('workpack audit tests passed');
