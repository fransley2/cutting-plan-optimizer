const WORKSTATION_DEFINITIONS = Object.freeze({
  CUTTING: { label: 'Cutting', activity: 'Cutting', quantityLabel: 'Qtd. Cortes', defaultQuantity: 1, hoursPerAction: 1 },
  BEVELING: { label: 'Beveling', activity: 'Beveling', quantityLabel: 'Qtd. Bisel', defaultQuantity: 2, hoursPerAction: 2 },
  CLEANING: { label: 'Cleaning', activity: 'Cleaning', quantityLabel: 'Qtd. Limpeza', defaultQuantity: 1, hoursPerAction: 0.5 },
});

export const TASK_SHEET_WORKSTATIONS = Object.freeze(Object.keys(WORKSTATION_DEFINITIONS));

function text(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function first(...values) { return values.find((value) => value !== undefined && value !== null && value !== '') ?? ''; }
function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }

function normalizeWorkstation(value) {
  const normalized = text(value).toUpperCase();
  return TASK_SHEET_WORKSTATIONS.includes(normalized) ? normalized : 'CUTTING';
}

function pieceLength(piece = {}) {
  return number(first(piece.actualCutLengthMm, piece.cutLengthMm, piece.cutLength, piece.lengthMm, piece.length));
}

function mtoLength(item = {}) {
  return number(first(item.cutLength, item.requiredLength, item.lengthMm, item.length));
}

function drawingNumber(item = {}) {
  return text(first(item.drawing, item.drawingNo, item.dwgNumber, item.drawingRef));
}

function position(item = {}) { return text(first(item.pos, item.position)); }

function sourceKey(item = {}) {
  return [drawingNumber(item), text(item.mark), position(item), text(item.id)].join('|');
}

function buildMtoLookup(items = []) {
  const lookup = new Map();
  items.forEach((item) => {
    if (item.id) lookup.set(`id:${text(item.id)}`, item);
    lookup.set(`key:${sourceKey(item)}`, item);
    lookup.set(`short:${drawingNumber(item)}|${text(item.mark)}|${position(item)}`, item);
  });
  return lookup;
}

function findMtoItem(piece, lookup) {
  const directId = text(first(piece.mtoItemId, piece.partId));
  return lookup.get(`id:${directId}`)
    || lookup.get(`short:${drawingNumber(piece)}|${text(piece.mark)}|${position(piece)}`)
    || null;
}

function barTraceability(bar = {}, inventoryById = new Map()) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
  const inventoryId = text(first(bar.inventoryItemId, bar.parentInventoryItemId, stock.id));
  const inventory = inventoryById.get(inventoryId) || {};
  return text(first(bar.traceability, bar.trace, stock.traceability, stock.trace, inventory.traceability, inventory.trace));
}

function lineFromSource(source = {}, context = {}) {
  const workstation = normalizeWorkstation(context.workstation);
  const definition = WORKSTATION_DEFINITIONS[workstation];
  const quantity = number(context.actionQuantity) || definition.defaultQuantity;
  const sourcePosition = position(source);
  return {
    id: createId(),
    workstation,
    sourceMtoItemId: text(context.mtoItem?.id || source.mtoItemId),
    sourceCuttingSheetId: text(context.cuttingSheetId),
    sourcePieceId: text(context.pieceId || source.id),
    drawingNo: drawingNumber(context.mtoItem || source),
    revision: text(first(context.mtoItem?.revision, source.revision)),
    description: text(first(context.mtoItem?.description, source.description, source.materialDescription)),
    mark: text(first(context.mtoItem?.mark, source.mark)),
    position: text(first(context.mtoItem?.pos, context.mtoItem?.position, sourcePosition)),
    lengthMm: number(context.lengthMm || mtoLength(context.mtoItem || source)),
    traceability: text(context.traceability),
    weightKg: number(first(source.weightKg, context.mtoItem?.weightKg)),
    tag: text(first(context.mtoItem?.tag, source.tag, context.defaultTag)),
    activity: `${definition.activity} - ${text(first(context.mtoItem?.type, source.type, 'Material')) || 'Material'}${sourcePosition ? ` pos ${sourcePosition}` : ''}`,
    actionQuantity: quantity,
    durationHours: number(context.durationHours) || quantity * definition.hoursPerAction,
    plannedDate: text(context.plannedDate),
    actualDate: '',
    completed: false,
    note: text(context.note),
  };
}

function cuttingSourceLines(cuttingSheets, mtoLookup, inventoryById, context) {
  return cuttingSheets.flatMap((sheet) => (Array.isArray(sheet.bars) ? sheet.bars : []).flatMap((bar) => {
    const traceability = barTraceability(bar, inventoryById);
    return (Array.isArray(bar.pieces) ? bar.pieces : []).map((piece) => {
      const mtoItem = findMtoItem(piece, mtoLookup);
      return lineFromSource(piece, {
        ...context,
        workstation: 'CUTTING',
        cuttingSheetId: sheet.id,
        pieceId: piece.id,
        mtoItem,
        traceability,
        lengthMm: pieceLength(piece),
      });
    });
  }));
}

function stationLines(workstation, mtoItems, cuttingLines, context) {
  if (workstation === 'CUTTING' && cuttingLines.length) return cuttingLines;
  if (!mtoItems.length && cuttingLines.length) return cuttingLines.map((line) => lineFromSource(line, {
    ...context,
    workstation,
    mtoItem: line,
    traceability: line.traceability,
    lengthMm: line.lengthMm,
  }));
  const traceByMtoId = new Map(cuttingLines.filter((line) => line.sourceMtoItemId).map((line) => [line.sourceMtoItemId, line.traceability]));
  return mtoItems.map((item) => lineFromSource(item, {
    ...context,
    workstation,
    mtoItem: item,
    traceability: traceByMtoId.get(text(item.id)) || text(first(item.traceability, item.trace)),
  }));
}

export function taskSheetWorkstationDefinition(value) {
  return { ...WORKSTATION_DEFINITIONS[normalizeWorkstation(value)] };
}

export function buildTaskSheetDraft(input = {}) {
  const workpack = input.workpack || {};
  const workstations = [...new Set((input.workstations || TASK_SHEET_WORKSTATIONS).map(normalizeWorkstation))];
  const mtoItems = Array.isArray(input.mtoItems) ? input.mtoItems : [];
  const cuttingSheets = (Array.isArray(input.cuttingSheets) ? input.cuttingSheets : [])
    .filter((sheet) => sheet.workpackId === workpack.id || (input.cuttingSheetIds || []).includes(sheet.id));
  const inventoryById = new Map((Array.isArray(input.inventoryItems) ? input.inventoryItems : []).flatMap((item) => [item.id, item.trace, item.traceability]
    .filter(Boolean).map((id) => [text(id), item])));
  const mtoLookup = buildMtoLookup(mtoItems);
  const defaultTag = text(first(input.tag, workpack.tag, workpack.title, workpack.equipmentName));
  const shared = { defaultTag };
  const cuttingLines = cuttingSourceLines(cuttingSheets, mtoLookup, inventoryById, {
    ...shared,
    plannedDate: text(input.plannedDates?.CUTTING || input.plannedDate),
  });
  const lines = workstations.flatMap((workstation) => stationLines(workstation, mtoItems, cuttingLines, {
    ...shared,
    plannedDate: text(input.plannedDates?.[workstation] || input.plannedDate),
  }));
  return {
    projectId: text(workpack.projectId),
    workpackId: text(workpack.id),
    equipmentId: text(workpack.equipmentId),
    number: text(input.number || `${workpack.wpNo || 'WORKPACK'}-TS-001`),
    revision: text(input.revision || '00'),
    title: text(input.title || `${workpack.wpNo || 'WORKPACK'} - ${workpack.title || ''} - TASK SHEET`),
    documentDate: text(input.documentDate || new Date().toISOString().slice(0, 10)),
    status: 'DRAFT',
    lines,
  };
}

export function validateTaskSheet(taskSheet = {}) {
  const errors = [];
  if (!text(taskSheet.workpackId)) errors.push('Workpack is required.');
  if (!text(taskSheet.number)) errors.push('Task Sheet number is required.');
  if (!Array.isArray(taskSheet.lines) || !taskSheet.lines.length) errors.push('At least one task line is required.');
  (taskSheet.lines || []).forEach((line, index) => {
    if (!text(line.workstation)) errors.push(`Line ${index + 1}: workstation is required.`);
    if (!text(line.activity)) errors.push(`Line ${index + 1}: activity is required.`);
    if (number(line.actionQuantity) <= 0) errors.push(`Line ${index + 1}: action quantity must be greater than zero.`);
  });
  return errors;
}
