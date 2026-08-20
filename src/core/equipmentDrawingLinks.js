function text(value) {
  return value == null ? '' : String(value);
}

export function drawingsLinkedToEquipment(drawings = [], equipmentId = '', { currentOnly = true } = {}) {
  const targetId = text(equipmentId).trim();
  if (!targetId) return [];
  return (Array.isArray(drawings) ? drawings : [])
    .filter((drawing) => text(drawing.equipmentId).trim() === targetId
      && (!currentOnly || drawing.isCurrentRevision !== false))
    .sort((left, right) => text(left.drawingNo).localeCompare(text(right.drawingNo), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) || text(left.revision).localeCompare(text(right.revision), undefined, {
      numeric: true,
      sensitivity: 'base',
    }));
}

export function drawingDesignReference(drawing = {}, equipment = {}) {
  return text(equipment.designDrawingNo).trim() || text(drawing.engineeringCode).trim();
}
