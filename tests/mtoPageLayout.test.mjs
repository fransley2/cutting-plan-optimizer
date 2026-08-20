import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countActiveMtoFilters,
  getMtoTabItems,
  mtoHasPoAllocation,
  summarizeMtoTabs,
} from '../src/ui/mtoPage.js';

const items = [
  { id: 'OPEN', status: 'open', material: 'A106', validationErrors: [] },
  { id: 'MISSING', status: 'open', material: '', validationErrors: [] },
  { id: 'INVALID', status: 'invalid', material: 'A36', validationErrors: ['Drawing obrigatório'] },
  { id: 'MATCHED', status: 'matched', material: 'A36', validationErrors: [] },
  { id: 'RESERVED', status: 'reserved', material: 'A36', validationErrors: [] },
  { id: 'NESTED', status: 'nested', material: 'A36', validationErrors: [] },
  { id: 'OLD', status: 'superseded', material: 'A36', validationErrors: [] },
];

test('MTO tabs expose operational counters without duplicating superseded lines', () => {
  assert.deepEqual(summarizeMtoTabs(items), {
    total: 7,
    valid: 5,
    rejected: 1,
    requiredLength: 0,
    weight: 0,
    missingMaterial: 1,
    readyForMatch: 2,
    tracked: 3,
    superseded: 1,
    active: 6,
  });
});

test('MTO status tabs keep superseded isolated while the all view can opt in', () => {
  assert.deepEqual(getMtoTabItems(items).map((item) => item.id), ['OPEN', 'MISSING', 'INVALID', 'MATCHED', 'RESERVED', 'NESTED']);
  assert.deepEqual(getMtoTabItems(items, { activeTab: 'tracked' }).map((item) => item.id), ['MATCHED', 'RESERVED', 'NESTED']);
  assert.deepEqual(getMtoTabItems(items, { activeTab: 'superseded' }).map((item) => item.id), ['OLD']);
  assert.equal(getMtoTabItems(items, { includeSuperseded: true }).length, 7);
});

test('advanced filter badge ignores the always-visible search field', () => {
  assert.equal(countActiveMtoFilters({ search: 'DWG-01' }), 0);
  assert.equal(countActiveMtoFilters({ drawing: 'DWG-01', material: 'A36', includeSuperseded: true }), 3);
});

test('PO link action changes to edit only when the MTO line has an allocation', () => {
  const item = { id: 'MTO-1' };
  assert.equal(mtoHasPoAllocation(item, new Map()), false);
  assert.equal(mtoHasPoAllocation(item, new Map([['MTO-1', { status: 'UNALLOCATED', allocatedQuantity: 0 }]])), false);
  assert.equal(mtoHasPoAllocation(item, new Map([['MTO-1', { status: 'PURCHASED', allocatedQuantity: 1 }]])), true);
});

test('MTO tab counters move an allocated open line from Ready for Match to tracked', () => {
  const coverage = new Map([['OPEN', { status: 'PURCHASED', allocatedQuantity: 1 }]]);
  const summary = summarizeMtoTabs(items, coverage);
  assert.equal(summary.readyForMatch, 1);
  assert.equal(summary.tracked, 4);
  assert.deepEqual(getMtoTabItems(items, { activeTab: 'ready-match', coverageByMto: coverage }).map((item) => item.id), ['MISSING']);
  assert.deepEqual(getMtoTabItems(items, { activeTab: 'tracked', coverageByMto: coverage }).map((item) => item.id), ['OPEN', 'MATCHED', 'RESERVED', 'NESTED']);
});
