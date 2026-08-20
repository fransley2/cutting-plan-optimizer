import assert from 'node:assert/strict';
import { buildCuttingTransformations } from '../src/core/materialGenealogy.js';
import { confirmCuttingSheet } from '../src/workflows/confirmCuttingSheet.js';

const sheet = {
  id: 'CS-1', projectId: 'P-1', workpackId: 'WP-1', materialCouponId: 'MC-1', status: 'released',
  bars: [{ id: 'BAR-1', inventoryItemId: 'INV-1', offcutId: 'OFF-1', remaining: 500, pieces: [{ id: 'PIECE-1', mtoItemId: 'MTO-1', mark: 'M1', pos: 'P1', cutLength: 1000 }] }],
};

const genealogy = buildCuttingTransformations(sheet, { userName: 'Tester' });
assert.equal(genealogy.valid, true);
assert.equal(genealogy.transformations.length, 2);
assert.equal(genealogy.transformations[0].outputType, 'CUT_PART');
assert.equal(genealogy.transformations[1].outputType, 'REUSABLE_OFFCUT');
assert.equal(genealogy.transformations[0].parentInventoryItemId, 'INV-1');

const inventory = new Map([['INV-1', { id: 'INV-1', trace: 'INV-1', status: 'issued' }]]);
const transformations = [];
const movements = [];
const audits = [];
let savedSheet = sheet;
const offcuts = [{ id: 'OFF-1', cuttingSheetId: 'CS-1', status: 'draft', metadata: {} }];
const result = await confirmCuttingSheet(sheet, { userName: 'Tester', nowFactory: () => '2026-01-01T00:00:00.000Z' }, {
  createTransformation: async (value) => { const record = { ...value, id: `T-${transformations.length + 1}` }; transformations.push(record); return record; },
  deleteTransformation: async () => {},
  getInventoryItem: async (id) => inventory.get(id),
  updateInventoryItem: async (id, patch) => { const next = { ...inventory.get(id), ...patch }; inventory.set(id, next); return next; },
  createStockMovement: async (value) => { const record = { ...value, id: `SM-${movements.length + 1}` }; movements.push(record); return record; },
  deleteStockMovement: async () => {},
  updateCuttingSheet: async (id, patch) => { savedSheet = { ...savedSheet, ...patch, id }; return savedSheet; },
  createAuditEvent: async (value) => { audits.push(value); return value; },
  listOffcuts: async () => structuredClone(offcuts),
  updateOffcut: async (id, patch) => { const index = offcuts.findIndex((item) => item.id === id); offcuts[index] = { ...offcuts[index], ...patch }; return structuredClone(offcuts[index]); },
});

assert.equal(result.cuttingSheet.status, 'cut');
assert.equal(inventory.get('INV-1').status, 'consumed');
assert.equal(transformations.length, 2);
assert.equal(movements[0].movementType, 'CONSUME_STOCK');
assert.equal(audits.length, 1);
assert.equal(offcuts[0].status, 'reusable');
assert.equal(offcuts[0].metadata.materialTransformationId, transformations[1].id);
assert.deepEqual(audits[0].metadata.offcutIds, ['OFF-1']);

assert.equal(buildCuttingTransformations({ id: 'CS-2', bars: [{ pieces: [] }] }).valid, false);

console.log('material genealogy tests passed');
