function text(value) {
  return value == null ? '' : String(value);
}

function createId(options = {}) {
  if (typeof options.createId === 'function') return options.createId();
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

/**
 * Creates an unsaved Equipment draft without mutating its source record.
 */
export function createEquipmentDuplicate(sourceEquipment, options = {}) {
  if (!sourceEquipment || typeof sourceEquipment !== 'object') {
    throw new TypeError('A source equipment record is required.');
  }

  const draft = structuredClone(sourceEquipment);
  const sourceName = text(sourceEquipment.equipmentName || sourceEquipment.name).trim() || 'EQUIPMENT';
  const sourceCode = text(sourceEquipment.code).trim();

  draft.id = createId(options);
  draft.equipmentName = `${sourceName}-COPY`;
  draft.name = draft.equipmentName;
  draft.code = sourceCode ? `${sourceCode}-COPY` : '';
  draft.clientTag = '';
  draft.equipmentTags = [];
  draft.createdAt = '';
  draft.updatedAt = '';

  [
    'drawings', 'drawingId', 'drawingIds', 'linkedDrawingIds',
    'mto', 'mtoId', 'mtoIds', 'mtoItemIds', 'linkedMtoItemIds',
    'workpacks', 'workpackId', 'workpackIds', 'linkedWorkpackIds', 'relationships',
  ].forEach((key) => delete draft[key]);

  return draft;
}
