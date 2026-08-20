import { MATERIAL_TRANSFORMATION_TYPES } from '../data/materialTransformations.js';
import { pieceEffectiveLengthMm } from './cuttingSheetPlanning.js';
import { classifyOffcutLength, OFFCUT_CLASSIFICATION } from './offcutClassification.js';

function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function first(...values) { return values.find((value) => value !== undefined && value !== null && value !== '') ?? ''; }

export function cuttingBarParentInventoryId(bar = {}) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
  return text(first(bar.inventoryItemId, bar.parentInventoryItemId, stock.id, stock.trace, stock.traceability, bar.trace, bar.traceability));
}

function pieceLength(piece = {}) {
  return numberValue(first(piece.actualCutLengthMm, pieceEffectiveLengthMm(piece)));
}

export function buildCuttingTransformations(cuttingSheet = {}, options = {}) {
  const bars = Array.isArray(cuttingSheet.bars) ? cuttingSheet.bars : [];
  const transformations = [];
  const errors = [];
  bars.forEach((bar, barIndex) => {
    const parentInventoryItemId = cuttingBarParentInventoryId(bar);
    const cuttingSheetBarId = text(bar.id || bar.barId || bar.barNumber || barIndex + 1);
    if (!parentInventoryItemId) {
      errors.push({ code: 'PARENT_INVENTORY_REQUIRED', barIndex, cuttingSheetBarId });
      return;
    }
    const pieces = Array.isArray(bar.pieces) ? bar.pieces : [];
    pieces.forEach((piece, pieceIndex) => transformations.push({
      projectId: cuttingSheet.projectId,
      workpackId: cuttingSheet.workpackId,
      cuttingSheetId: cuttingSheet.id,
      cuttingSheetBarId,
      materialCouponId: text(piece.materialCouponId || bar.materialCouponId || cuttingSheet.materialCouponId),
      materialCouponLineId: text(piece.materialCouponLineId || bar.materialCouponLineId),
      parentInventoryItemId,
      outputType: MATERIAL_TRANSFORMATION_TYPES.CUT_PART,
      outputId: text(piece.id || `${cuttingSheetBarId}-piece-${pieceIndex + 1}`),
      mtoItemId: text(piece.mtoItemId || piece.partId || piece.id),
      drawingRevisionId: text(piece.drawingRevisionId),
      mark: text(piece.mark),
      position: text(piece.pos || piece.position),
      quantity: numberValue(piece.qty) || 1,
      lengthMm: pieceLength(piece),
      widthMm: numberValue(piece.widthMm || piece.width),
      thicknessMm: numberValue(piece.thicknessMm || piece.thickness),
      weightKg: numberValue(piece.weightKg),
      createdBy: text(options.userName),
    }));
    const offcutLength = numberValue(first(bar.actualRemainingMm, bar.remaining, bar.offcut, bar.spareOffcut));
    if (offcutLength > 0) transformations.push({
      projectId: cuttingSheet.projectId,
      workpackId: cuttingSheet.workpackId,
      cuttingSheetId: cuttingSheet.id,
      cuttingSheetBarId,
      materialCouponId: text(bar.materialCouponId || cuttingSheet.materialCouponId),
      materialCouponLineId: text(bar.materialCouponLineId),
      parentInventoryItemId,
      outputType: classifyOffcutLength(offcutLength) === OFFCUT_CLASSIFICATION.REUSABLE
        ? MATERIAL_TRANSFORMATION_TYPES.REUSABLE_OFFCUT
        : MATERIAL_TRANSFORMATION_TYPES.SCRAP,
      outputId: text(bar.offcutId || `${cuttingSheetBarId}-offcut`),
      quantity: 1,
      lengthMm: offcutLength,
      widthMm: numberValue(bar.widthMm || bar.width),
      thicknessMm: numberValue(bar.thicknessMm || bar.thickness),
      weightKg: numberValue(bar.offcutWeightKg),
      createdBy: text(options.userName),
    });
  });
  return { valid: errors.length === 0, errors, transformations };
}
