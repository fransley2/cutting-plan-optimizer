import { createDrawing, listDrawings, updateDrawing } from './drawings.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function drawingKey(value) {
  return text(value).toUpperCase();
}

function singleValue(values) {
  const unique = [...new Set(values.map(text).filter(Boolean))];
  return unique.length === 1 ? unique[0] : '';
}

export async function ensureDrawingsForMtoItems(items = [], options = {}) {
  const projectId = text(options.projectId || items.find((item) => text(item?.projectId))?.projectId);
  if (!projectId) return [];

  const list = options.listDrawings || listDrawings;
  const create = options.createDrawing || createDrawing;
  const existing = await list({ projectId });
  const knownDrawingNos = new Set(existing.map((drawing) => drawingKey(drawing.drawingNo)).filter(Boolean));
  const candidates = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const drawingNo = text(item?.drawing);
    const key = drawingKey(drawingNo);
    if (!key || knownDrawingNos.has(key)) return;
    if (!candidates.has(key)) candidates.set(key, { drawingNo, equipmentIds: [], engineeringCodes: [] });
    const candidate = candidates.get(key);
    candidate.equipmentIds.push(item?.equipmentId);
    candidate.engineeringCodes.push(item?.constructionActivity);
  });

  const created = [];
  for (const candidate of candidates.values()) {
    const drawing = await create({
      projectId,
      equipmentId: singleValue(candidate.equipmentIds),
      drawingNo: candidate.drawingNo,
      templateDrawingNo: '',
      engineeringCode: singleValue(candidate.engineeringCodes),
      revision: '',
      title: '',
      discipline: '',
      clientReference: '',
      fileUrl: '',
      status: 'DRAFT',
    });
    created.push(drawing);
    knownDrawingNos.add(drawingKey(candidate.drawingNo));
  }
  return created;
}

export async function linkDrawingsForMtoItemsToEquipment(items = [], equipmentId, options = {}) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const destinationEquipmentId = text(equipmentId);
  const projectId = text(options.projectId || normalizedItems.find((item) => text(item?.projectId))?.projectId);
  if (!projectId || !destinationEquipmentId) return [];

  const list = options.listDrawings || listDrawings;
  const create = options.createDrawing || createDrawing;
  const update = options.updateDrawing || updateDrawing;
  const linkedItems = normalizedItems
    .filter((item) => drawingKey(item?.drawing))
    .map((item) => ({ ...item, projectId, equipmentId: destinationEquipmentId }));
  if (!linkedItems.length) return [];

  await ensureDrawingsForMtoItems(linkedItems, { projectId, listDrawings: list, createDrawing: create });
  const drawingKeys = new Set(linkedItems.map((item) => drawingKey(item.drawing)));
  const drawings = await list({ projectId });

  return Promise.all(drawings
    .filter((drawing) => drawingKeys.has(drawingKey(drawing.drawingNo)))
    .map((drawing) => (
      text(drawing.equipmentId) === destinationEquipmentId
        ? drawing
        : update(drawing.id, { equipmentId: destinationEquipmentId })
    )));
}
