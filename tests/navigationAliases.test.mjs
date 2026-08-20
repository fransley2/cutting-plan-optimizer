import assert from 'node:assert/strict';
import { normalizePhase } from '../src/core/navigation.js';

assert.equal(normalizePhase('stock'), 'planner');
assert.equal(normalizePhase('cutting-packages'), 'workpacks');
assert.equal(normalizePhase('material-coupon'), 'material-coupons');
assert.equal(normalizePhase('inventory'), 'inventory');
assert.equal(normalizePhase(''), '');
assert.equal(normalizePhase('unknown'), 'unknown');
console.log('navigation aliases tests passed');
