function values(items) {
  return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [];
}

export function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function mergeUpdatedMtoItems(currentItems = [], updatedItems = []) {
  const current = values(currentItems);
  const updates = new Map(values(updatedItems).filter((item) => item.id).map((item) => [String(item.id), item]));
  const merged = current.map((item) => updates.has(String(item.id)) ? { ...item, ...updates.get(String(item.id)) } : item);
  const currentIds = new Set(current.map((item) => String(item.id || '')).filter(Boolean));
  updates.forEach((item, id) => {
    if (!currentIds.has(id)) merged.push({ ...item });
  });
  return merged;
}

export function normalizeDrawingReference(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\bREV(?:ISION)?\.?\s*[A-Z0-9._-]+.*$/i, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function compatibleDrawings(workpack = {}, drawings = []) {
  return values(drawings).filter((drawing) => (
    drawing.projectId === workpack.projectId
    && (!drawing.equipmentId || drawing.equipmentId === workpack.equipmentId)
  ));
}

export function availableMtoItems(workpack = {}, items = []) {
  return values(items).filter((item) => (
    item.projectId === workpack.projectId
    && (!item.equipmentId || item.equipmentId === workpack.equipmentId)
  ));
}

export function mtoMatchesLinkedDrawings(item = {}, drawingIds = [], drawings = []) {
  const linkedIds = new Set(uniqueIds(drawingIds));
  if (linkedIds.has(String(item.drawingId || '').trim())) return true;
  const linkedReferences = new Set(
    values(drawings)
      .filter((drawing) => linkedIds.has(String(drawing.id || '').trim()))
      .map((drawing) => normalizeDrawingReference(drawing.drawingNo))
      .filter(Boolean),
  );
  if (!linkedReferences.size) return false;
  const itemReference = normalizeDrawingReference(item.drawingNo || item.drawing || '');
  return Boolean(itemReference) && linkedReferences.has(itemReference);
}

export function compatibleMtoItems(workpack = {}, items = [], drawingIds = [], drawings = []) {
  const linkedDrawingIds = uniqueIds(drawingIds);
  const candidates = availableMtoItems(workpack, items);
  if (!linkedDrawingIds.length) return candidates;
  return candidates.filter((item) => {
    const drawingReference = String(item.drawingId || item.drawingNo || item.drawing || '').trim();
    return !drawingReference || mtoMatchesLinkedDrawings(item, linkedDrawingIds, drawings);
  });
}
