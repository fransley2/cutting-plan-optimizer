function text(value) {
  return value == null ? '' : String(value);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function normalizeEquipmentTags(value) {
  const source = Array.isArray(value) ? value : text(value).split(/[\n,;]+/);
  const seen = new Set();
  return source.reduce((tags, item) => {
    const tag = text(item).trim().toUpperCase();
    if (!tag || seen.has(tag)) return tags;
    seen.add(tag);
    tags.push(tag);
    return tags;
  }, []);
}

export function equipmentTags(equipment = {}) {
  const tags = normalizeEquipmentTags(equipment.equipmentTags || equipment.tags);
  if (tags.length) return tags;
  return normalizeEquipmentTags(equipment.clientTag);
}

export function equipmentPlannedQuantity(equipment = {}) {
  const configured = positiveInteger(equipment.plannedQuantity || equipment.quantity);
  if (configured) return configured;
  return Math.max(equipmentTags(equipment).length, 1);
}

export function equipmentGeneratedName(equipment = {}) {
  return [equipment.fieldLocation, equipment.system, equipment.equipmentType, equipment.variant]
    .map((value) => text(value).trim().toUpperCase())
    .filter(Boolean)
    .join(' · ');
}

export function equipmentLegacyGeneratedName(equipment = {}) {
  return [equipment.fieldLocation, equipment.equipmentType, equipment.variant]
    .map((value) => text(value).trim().toUpperCase())
    .filter(Boolean)
    .join(' · ');
}

export function equipmentGeneratedCode(equipment = {}) {
  return equipmentGeneratedName(equipment)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function equipmentPortfolioSummary(equipments = []) {
  const records = Array.isArray(equipments) ? equipments : [];
  const equipmentTypes = new Set();
  let plannedUnits = 0;
  let registeredTags = 0;

  records.forEach((equipment) => {
    const type = text(equipment.equipmentType || equipment.equipmentClass).trim().toUpperCase();
    if (type) equipmentTypes.add(type);
    const planned = equipmentPlannedQuantity(equipment);
    const tags = equipmentTags(equipment).length;
    plannedUnits += planned;
    registeredTags += tags;
  });

  return {
    groupCount: records.length,
    typeCount: equipmentTypes.size,
    plannedUnits,
    registeredTags,
    pendingTags: Math.max(plannedUnits - registeredTags, 0),
  };
}

export function equipmentPortfolioGroupKey(equipment = {}) {
  return [equipment.projectId, equipment.fieldLocation, equipment.equipmentType]
    .map((value) => text(value).trim().toUpperCase())
    .join('|');
}

export function compareEquipmentPortfolio(a = {}, b = {}) {
  const fields = ['projectId', 'fieldLocation', 'system', 'equipmentType', 'variant', 'equipmentName', 'code'];
  for (const field of fields) {
    const comparison = text(a[field]).localeCompare(text(b[field]), undefined, { numeric: true, sensitivity: 'base' });
    if (comparison) return comparison;
  }
  return 0;
}
