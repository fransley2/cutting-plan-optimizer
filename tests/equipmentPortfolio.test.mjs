import assert from 'node:assert/strict';
import {
  compareEquipmentPortfolio,
  equipmentGeneratedCode,
  equipmentGeneratedName,
  equipmentPlannedQuantity,
  equipmentPortfolioSummary,
  equipmentTags,
  normalizeEquipmentTags,
} from '../src/core/equipmentPortfolio.js';

assert.deepEqual(
  normalizeEquipmentTags('32-WJ-10-1020\n32-wj-10-2020; 32-WJ-10-1020,32-WJ-10-3010'),
  ['32-WJ-10-1020', '32-WJ-10-2020', '32-WJ-10-3010'],
);
assert.deepEqual(equipmentTags({ clientTag: 'LEGACY-TAG' }), ['LEGACY-TAG']);
assert.equal(equipmentPlannedQuantity({ plannedQuantity: 41, equipmentTags: ['A'] }), 41);
assert.equal(equipmentPlannedQuantity({ equipmentTags: ['A', 'B'] }), 2);
assert.equal(equipmentPlannedQuantity({}), 1);
assert.equal(
  equipmentGeneratedName({ fieldLocation: 'kbd dw', system: 'production', equipmentType: 'jumper', variant: 'type 1' }),
  'KBD DW · PRODUCTION · JUMPER · TYPE 1',
);
assert.equal(
  equipmentGeneratedCode({ fieldLocation: 'KBD DW', system: 'PRODUCTION', equipmentType: 'JUMPER', variant: 'TYPE 1' }),
  'KBD-DW-PRODUCTION-JUMPER-TYPE-1',
);

assert.deepEqual(equipmentPortfolioSummary([
  { equipmentType: 'JUMPER', system: 'PRODUCTION', variant: 'TYPE 1', plannedQuantity: 3, equipmentTags: ['A', 'B', 'C'] },
  { equipmentType: 'JUMPER', system: 'PRODUCTION', variant: 'TYPE 2', plannedQuantity: 3, equipmentTags: ['D', 'E'] },
  { equipmentType: 'SPOOL', system: 'PRODUCTION', plannedQuantity: 2, equipmentTags: [] },
]), {
  groupCount: 3,
  typeCount: 2,
  plannedUnits: 8,
  registeredTags: 5,
  pendingTags: 3,
});

const sorted = [
  { fieldLocation: 'KBD DW', system: 'PRODUCTION', equipmentType: 'JUMPER', variant: 'TYPE 2' },
  { fieldLocation: 'KBD DW', system: 'PRODUCTION', equipmentType: 'JUMPER', variant: 'TYPE 1' },
].sort(compareEquipmentPortfolio);
assert.equal(sorted[0].variant, 'TYPE 1');

console.log('equipment portfolio tests passed');
