import assert from 'node:assert/strict';
import {
  EQUIPMENT_SERVICE_OPTIONS,
  isLegacyEquipmentTypeName,
  normalizeEquipmentClassification,
} from '../src/core/equipmentClassification.js';

assert.deepEqual(
  normalizeEquipmentClassification({ equipmentType: 'Production Jumper' }),
  { equipmentType: 'JUMPER', system: 'PRODUCTION' },
);
assert.deepEqual(
  normalizeEquipmentClassification({ equipmentType: 'Water Injection Spool' }),
  { equipmentType: 'SPOOL', system: 'WATER INJECTION' },
);
assert.deepEqual(
  normalizeEquipmentClassification({ equipmentType: 'Jumper Gas', system: 'Utility' }),
  { equipmentType: 'JUMPER', system: 'UTILITY' },
  'an explicitly selected service should take precedence over a legacy type-derived service',
);
assert.deepEqual(
  normalizeEquipmentClassification({ equipmentType: 'Flexible Jumper', system: 'Hydraulic' }),
  { equipmentType: 'FLEXIBLE JUMPER', system: 'HYDRAULIC' },
  'physical equipment types should remain unchanged',
);
assert.equal(isLegacyEquipmentTypeName('PRODUCTION JUMPER'), true);
assert.equal(isLegacyEquipmentTypeName('JUMPER'), false);
assert.ok(EQUIPMENT_SERVICE_OPTIONS.includes('GAS INJECTION'));

console.log('equipment classification tests passed');
