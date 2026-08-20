import { nextProjectDocumentNumber } from './documentNumbering.js';
import { OFFCUT_CLASSIFICATION, classifyOffcutLength } from './offcutClassification.js';

export const RMV_LINE_STATUS = Object.freeze({
  PENDING: 'pending',
  RECEIVED: 'received',
});

function text(value) {
  return value == null ? '' : String(value).trim();
}

function uniqueLines(values = []) {
  const seen = new Set();
  return values.flatMap((value) => text(value).split(/\r?\n/)).map(text).filter((line) => {
    const key = line.toLocaleUpperCase();
    if (!line || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildRmvReferenceDraft(context = {}, configuredText = '') {
  const references = [
    ['DESIGN DRAWING', context.drawingReference],
    ['WORKPACK', context.workpackNumber || context.workpack],
    ['MATERIAL COUPON', context.materialCouponNumber],
    ['CUTTING SHEET', context.cuttingSheetNumber],
  ].filter(([, value]) => text(value));
  const generated = references.length
    ? references.map(([label, value]) => `* ${label}: ${text(value)}`)
    : ['* DESIGN DRAWING: [DRAWING NUMBER]', '* WORKPACK: [WORKPACK]', '* MATERIAL COUPON: [MC NUMBER]', '* CUTTING SHEET: [CS NUMBER]'];
  return uniqueLines([...generated, configuredText]).join('\n');
}

export function buildRmvGeneralNotesDraft(context = {}, configuredText = '') {
  const origin = text(context.origin) || '[ORIGIN]';
  const destination = text(context.destination) || '[DESTINATION]';
  const cuttingSheet = text(context.cuttingSheetNumber);
  const movement = `* RETURN OF MATERIALS FROM "${origin}" TO "${destination}"${cuttingSheet ? ` RELATED TO CUTTING SHEET ${cuttingSheet}` : ''}`;
  return uniqueLines([
    movement,
    '- MATERIALS TO BE INSPECTED AND TRACEABILITY VERIFIED UPON RECEIPT',
    configuredText,
  ]).join('\n');
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function rounded(value) {
  return Math.round(number(value) * 1e6) / 1e6;
}

const RMV_CANDIDATE_STATUSES = new Set(['draft', 'reusable', 'pending_rmv']);

function parentInventoryReference(bar = {}) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
  return text(bar.inventoryItemId || bar.parentInventoryItemId || stock.id || stock.trace || stock.traceability || bar.trace || bar.traceability);
}

export function cuttingSheetRmvCandidates(cuttingSheet = {}, offcuts = []) {
  const related = (Array.isArray(offcuts) ? offcuts : []).filter((offcut) => text(offcut.cuttingSheetId) === text(cuttingSheet.id));
  if (related.length) {
    return related.filter((offcut) => RMV_CANDIDATE_STATUSES.has(text(offcut.status).toLowerCase())
      && classifyOffcutLength(offcut.lengthMm ?? offcut.length ?? offcut.remaining) === OFFCUT_CLASSIFICATION.REUSABLE);
  }
  return (Array.isArray(cuttingSheet.bars) ? cuttingSheet.bars : []).flatMap((bar, index) => {
    const lengthMm = number(bar.actualRemainingMm ?? bar.remaining ?? bar.offcut ?? bar.spareOffcut);
    const parentInventoryItemId = parentInventoryReference(bar);
    if (classifyOffcutLength(lengthMm) !== OFFCUT_CLASSIFICATION.REUSABLE || !parentInventoryItemId) return [];
    const sourceCandidateKey = text(bar.offcutId) || `${text(cuttingSheet.id)}|${text(bar.id || bar.barId || index + 1)}|${lengthMm}`;
    return [{
      id: text(bar.offcutId),
      cuttingSheetId: text(cuttingSheet.id),
      sourceCandidateKey,
      parentInventoryItemId,
      parentTrace: text(bar.traceability || bar.trace),
      materialDescription: text(bar.materialDescription || bar.description),
      materialGrade: text(bar.materialGrade || bar.material),
      heatNo: text(bar.heatNo || bar.heat),
      diaMm: number(bar.diaMm || bar.diameterMm),
      thicknessMm: number(bar.thicknessMm || bar.thickness),
      widthMm: number(bar.widthMm || bar.width),
      lengthMm,
      qty: 1,
      status: 'draft',
      metadata: { sourceCandidateKey, generatedFrom: 'CUTTING_SHEET_FORECAST' },
    }];
  });
}

export function estimateReturnedWeight(parent = {}, returnedLengthMm = 0) {
  const originalLength = number(parent.lengthMm || parent.length);
  const originalWeight = number(parent.weightKg);
  const returnedLength = number(returnedLengthMm);
  if (originalLength <= 0 || originalWeight <= 0 || returnedLength <= 0) return 0;
  return rounded(originalWeight * Math.min(returnedLength, originalLength) / originalLength);
}

export function nextReturnMaterialVoucherNumber(records = [], projectShortCode = '') {
  return nextProjectDocumentNumber(records, projectShortCode, 'RMV');
}

export function normalizeRmvLine(input = {}, parentInventory = {}) {
  const lengthMm = number(input.lengthMm || input.length || input.remaining);
  return {
    id: text(input.id) || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    sourceOffcutId: text(input.sourceOffcutId || input.offcutId || input.id || input.sourceCandidateKey || input.metadata?.sourceCandidateKey),
    parentInventoryItemId: text(input.parentInventoryItemId || input.parentStockId || parentInventory.id || parentInventory.trace),
    parentTraceability: text(input.parentTraceability || input.parentTrace || parentInventory.traceability || parentInventory.trace),
    traceability: text(input.traceability),
    sapCode: text(input.sapCode || parentInventory.sapCode),
    po: text(input.po || parentInventory.po),
    poItem: text(input.poItem || input.item || parentInventory.poItem),
    itemCategory: text(input.itemCategory || input.category || parentInventory.category),
    materialDescription: text(input.materialDescription || input.description || parentInventory.materialDescription),
    materialGrade: text(input.materialGrade || input.material || parentInventory.materialGrade),
    qty: number(input.qty || input.quantity) || 1,
    unit: text(input.unit || parentInventory.unit) || 'EA',
    diaMm: number(input.diaMm || input.diameterMm || parentInventory.diaMm),
    thicknessMm: number(input.thicknessMm || input.thickness || parentInventory.thicknessMm),
    widthMm: number(input.widthMm || input.width || parentInventory.widthMm),
    lengthMm,
    weightKg: number(input.weightKg) || estimateReturnedWeight(parentInventory, lengthMm),
    condition: text(input.condition) || 'GOOD',
    heatNo: text(input.heatNo || input.heat || parentInventory.heatNo),
    materialCouponNumber: text(input.materialCouponNumber || input.materialCouponNo || parentInventory.materialCouponNo),
    cuttingSheetNumber: text(input.cuttingSheetNumber),
    notes: text(input.notes),
    status: text(input.status) || RMV_LINE_STATUS.PENDING,
    receivedAt: text(input.receivedAt),
    receivedBy: text(input.receivedBy),
    inventoryItemId: text(input.inventoryItemId),
  };
}

export function deriveRmvStatus(lines = [], statuses = {}) {
  const items = Array.isArray(lines) ? lines : [];
  const received = items.filter((line) => line.status === RMV_LINE_STATUS.RECEIVED).length;
  if (items.length && received === items.length) return statuses.returned || 'returned';
  if (received > 0) return statuses.partiallyReceived || 'partially_received';
  return statuses.issued || 'issued';
}
