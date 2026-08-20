function text(value) {
  return value == null ? '' : String(value);
}

function upper(value) {
  return text(value).trim().toUpperCase();
}

const EQUIPMENT_TYPE_ALIASES = Object.freeze({
  'PLEM MODULE': { equipmentType: 'PLEM' },
  'PLET MODULE': { equipmentType: 'PLET' },
  'MANIFOLD MODULE': { equipmentType: 'MANIFOLD' },
  'JUMPER GAS': { equipmentType: 'JUMPER', system: 'GAS INJECTION' },
  'GAS JUMPER': { equipmentType: 'JUMPER', system: 'GAS INJECTION' },
  'JUMPER WATER INJECTION': { equipmentType: 'JUMPER', system: 'WATER INJECTION' },
  'WATER INJECTION JUMPER': { equipmentType: 'JUMPER', system: 'WATER INJECTION' },
  'PRODUCTION JUMPER': { equipmentType: 'JUMPER', system: 'PRODUCTION' },
  'PRODUCTION SPOOL': { equipmentType: 'SPOOL', system: 'PRODUCTION' },
  'WATER INJECTION SPOOL': { equipmentType: 'SPOOL', system: 'WATER INJECTION' },
  'GAS INJECTION SPOOL': { equipmentType: 'SPOOL', system: 'GAS INJECTION' },
  'HYBRID LOOP': { equipmentType: 'LOOP', system: 'HYBRID' },
  'SPOOL PIECE': { equipmentType: 'SPOOL' },
});

const EQUIPMENT_SERVICE_ALIASES = Object.freeze({
  'PRODUCTION JUMPER': 'PRODUCTION',
  'PRODUCTION SPOOL': 'PRODUCTION',
  'JUMPER GAS': 'GAS INJECTION',
  'GAS JUMPER': 'GAS INJECTION',
  'GAS INJECTION SPOOL': 'GAS INJECTION',
  'JUMPER WATER INJECTION': 'WATER INJECTION',
  'WATER INJECTION JUMPER': 'WATER INJECTION',
  'WATER INJECTION SPOOL': 'WATER INJECTION',
  'HYBRID LOOP': 'HYBRID',
  GAS: 'GAS INJECTION',
});

export const EQUIPMENT_SERVICE_OPTIONS = Object.freeze([
  'PRODUCTION',
  'WATER INJECTION',
  'GAS INJECTION',
  'CHEMICAL INJECTION',
  'UTILITY',
  'HYDRAULIC',
  'ELECTRICAL',
  'HYBRID',
]);

export const LEGACY_EQUIPMENT_TYPE_NAMES = Object.freeze(Object.keys(EQUIPMENT_TYPE_ALIASES));

export function isLegacyEquipmentTypeName(value) {
  return Object.hasOwn(EQUIPMENT_TYPE_ALIASES, upper(value));
}

export function normalizeEquipmentClassification(input = {}) {
  const originalType = upper(input.equipmentType);
  const typeAlias = EQUIPMENT_TYPE_ALIASES[originalType] || null;
  const originalSystem = upper(input.system || input.service);
  const system = EQUIPMENT_SERVICE_ALIASES[originalSystem]
    || originalSystem
    || typeAlias?.system
    || '';

  return {
    equipmentType: typeAlias?.equipmentType || originalType,
    system,
  };
}
