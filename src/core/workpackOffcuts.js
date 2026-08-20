import { workpackRelationIds, WORKPACK_RELATION_TYPES } from './workpackRelations.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function ids(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function value(record, fields) {
  for (const field of fields) {
    const candidate = record?.[field];
    if (candidate != null && candidate !== '') return text(candidate);
  }
  return '';
}

export function resolveWorkpackOffcuts(workpack = {}, offcuts = [], workpackLinks = []) {
  const storedIds = ids(workpackRelationIds(workpack, workpackLinks, WORKPACK_RELATION_TYPES.OFFCUT));
  const validOffcuts = Array.isArray(offcuts) ? offcuts.filter((record) => record && typeof record === 'object') : [];
  const byId = new Map(validOffcuts.map((record) => [text(record.id), record]).filter(([id]) => id));
  const found = new Map();
  const missing = [];

  storedIds.forEach((id) => {
    const record = byId.get(id);
    if (record) found.set(id, { record, source: 'Workpack link' });
    else missing.push(id);
  });
  validOffcuts.forEach((record) => {
    const explicitWorkpackId = text(record.workpackId || record.metadata?.workpackId);
    if (explicitWorkpackId === text(workpack.id) && text(record.id)) {
      const id = text(record.id);
      found.set(id, { record, source: found.has(id) ? 'Workpack link + explicit reference' : 'Explicit workpackId' });
    }
  });

  return {
    records: [...found.entries()].map(([id, { record, source }]) => ({
      id,
      traceability: value(record, ['traceability', 'trace']),
      parentTraceability: value(record, ['parentTraceability', 'parentTrace', 'parentInventoryItemId']),
      material: value(record, ['material', 'materialGrade']),
      heat: value(record, ['heat', 'heatNumber']),
      dimensions: value(record, ['dimensions', 'dimension']),
      length: value(record, ['length', 'cutLength']),
      quantity: value(record, ['qty', 'quantity']),
      status: value(record, ['status']) || 'N/A',
      disposition: value(record, ['disposition']) || '—',
      source,
      raw: record,
    })),
    missing,
  };
}
