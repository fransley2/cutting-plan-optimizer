import { pieceEffectiveLengthMm } from './cuttingSheetPlanning.js';

function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) {
  if (value === '' || value == null) return null;
  const number = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(number) ? number : null;
}
function firstNumber(...values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number != null) return number;
  }
  return 0;
}
function round(value) { return Math.round(value * 1e6) / 1e6; }
function itemId(item = {}, fallback = '') { return text(item.id || item.barId || item.barNumber || fallback); }

export function plannedPieceLengthMm(piece = {}) {
  return firstNumber(piece.plannedCutLengthMm, pieceEffectiveLengthMm(piece));
}

export function actualPieceLengthMm(piece = {}) {
  return firstNumber(piece.actualCutLengthMm, plannedPieceLengthMm(piece));
}

export function plannedRemainingLengthMm(bar = {}) {
  return firstNumber(bar.plannedRemainingMm, bar.remaining, bar.offcut, bar.spareOffcut);
}

export function actualRemainingLengthMm(bar = {}) {
  return firstNumber(bar.actualRemainingMm, plannedRemainingLengthMm(bar));
}

export function buildCutExecutionDraft(cuttingSheet = {}) {
  return {
    reason: text(cuttingSheet.metadata?.cutExecution?.reason),
    bars: (Array.isArray(cuttingSheet.bars) ? cuttingSheet.bars : []).map((bar, barIndex) => ({
      barId: itemId(bar, barIndex + 1),
      actualRemainingMm: actualRemainingLengthMm(bar),
      pieces: (Array.isArray(bar.pieces) ? bar.pieces : []).map((piece, pieceIndex) => ({
        pieceId: itemId(piece, `${barIndex + 1}-${pieceIndex + 1}`),
        actualCutLengthMm: actualPieceLengthMm(piece),
        hasSobremetal: piece.hasSobremetal === true,
        sobremetalMm: piece.hasSobremetal === true ? firstNumber(piece.sobremetalMm, 500) : 0,
      })),
    })),
  };
}

export function applyCutExecution(cuttingSheet = {}, draft = {}, context = {}) {
  const status = text(cuttingSheet.status).toLowerCase();
  if (!['released', 'in_progress'].includes(status)) throw new Error('CUT_EXECUTION_STATUS_NOT_EDITABLE');
  const toleranceMm = Math.max(0, numberValue(context.toleranceMm) ?? 0.5);
  const draftBars = new Map((Array.isArray(draft.bars) ? draft.bars : []).map((bar) => [text(bar.barId), bar]));
  const errors = [];
  const variances = [];

  const bars = (Array.isArray(cuttingSheet.bars) ? cuttingSheet.bars : []).map((bar, barIndex) => {
    const barId = itemId(bar, barIndex + 1);
    const input = draftBars.get(barId);
    if (!input) { errors.push(`CUT_EXECUTION_BAR_MISSING:${barId}`); return structuredClone(bar); }
    const plannedRemainingMm = plannedRemainingLengthMm(bar);
    const actualRemainingMm = numberValue(input.actualRemainingMm);
    const originalLengthMm = firstNumber(bar.originalLengthMm, bar.originalLength, bar.lengthMm, bar.length);
    if (actualRemainingMm == null || actualRemainingMm < 0) errors.push(`CUT_EXECUTION_INVALID_REMAINING:${barId}`);
    if (actualRemainingMm != null && originalLengthMm > 0 && actualRemainingMm > originalLengthMm) {
      errors.push(`CUT_EXECUTION_REMAINING_EXCEEDS_STOCK:${barId}`);
    }
    const inputPieces = new Map((Array.isArray(input.pieces) ? input.pieces : []).map((piece) => [text(piece.pieceId), piece]));
    const pieces = (Array.isArray(bar.pieces) ? bar.pieces : []).map((piece, pieceIndex) => {
      const pieceId = itemId(piece, `${barIndex + 1}-${pieceIndex + 1}`);
      const pieceInput = inputPieces.get(pieceId);
      const plannedCutLengthMm = plannedPieceLengthMm(piece);
      const actualCutLength = numberValue(pieceInput?.actualCutLengthMm);
      const hasSobremetal = pieceInput?.hasSobremetal === true;
      const enteredSobremetal = numberValue(pieceInput?.sobremetalMm);
      const sobremetalValue = hasSobremetal && enteredSobremetal == null ? 500 : enteredSobremetal;
      if (!pieceInput) errors.push(`CUT_EXECUTION_PIECE_MISSING:${pieceId}`);
      if (actualCutLength == null || actualCutLength <= 0) errors.push(`CUT_EXECUTION_INVALID_PIECE_LENGTH:${pieceId}`);
      if (hasSobremetal && (sobremetalValue == null || sobremetalValue < 0)) errors.push(`CUT_EXECUTION_INVALID_SOBREMETAL:${pieceId}`);
      const actualCutLengthMm = actualCutLength == null ? plannedCutLengthMm : actualCutLength;
      const cutVarianceMm = round(actualCutLengthMm - plannedCutLengthMm);
      if (Math.abs(cutVarianceMm) > toleranceMm) variances.push({ type: 'PIECE', barId, pieceId, varianceMm: cutVarianceMm });
      return { ...piece, plannedCutLengthMm, actualCutLengthMm, cutVarianceMm, hasSobremetal, sobremetalMm: hasSobremetal ? sobremetalValue : 0 };
    });
    const actualPieceTotalMm = pieces.reduce((total, piece) => total + (piece.actualCutLengthMm * (numberValue(piece.qty) || 1)), 0);
    if (originalLengthMm > 0 && actualPieceTotalMm + (actualRemainingMm ?? plannedRemainingMm) > originalLengthMm + toleranceMm) {
      errors.push(`CUT_EXECUTION_OUTPUT_EXCEEDS_STOCK:${barId}`);
    }
    const remainingVarianceMm = round((actualRemainingMm ?? plannedRemainingMm) - plannedRemainingMm);
    if (Math.abs(remainingVarianceMm) > toleranceMm) variances.push({ type: 'OFFCUT', barId, varianceMm: remainingVarianceMm });
    return { ...bar, plannedRemainingMm, actualRemainingMm: actualRemainingMm ?? plannedRemainingMm, remainingVarianceMm, pieces };
  });

  if (errors.length) {
    const error = new Error(errors[0]);
    error.errors = errors;
    throw error;
  }
  const reason = text(draft.reason);
  if (variances.length && !reason) throw new Error('CUT_EXECUTION_VARIANCE_REASON_REQUIRED');
  const recordedAt = typeof context.nowFactory === 'function' ? context.nowFactory() : new Date().toISOString();
  const totalAbsoluteVarianceMm = round(variances.reduce((total, item) => total + Math.abs(item.varianceMm), 0));
  return {
    ...cuttingSheet,
    bars,
    metadata: {
      ...(cuttingSheet.metadata || {}),
      cutExecution: {
        status: 'RECORDED',
        recordedAt,
        recordedBy: text(context.userName),
        toleranceMm,
        reason,
        varianceCount: variances.length,
        totalAbsoluteVarianceMm,
        variances,
      },
    },
  };
}

export function cutExecutionErrorMessage(error) {
  const code = text(error?.message || error).split(':')[0];
  const messages = {
    CUT_EXECUTION_STATUS_NOT_EDITABLE: 'As medidas reais só podem ser registradas antes da confirmação do corte.',
    CUT_EXECUTION_BAR_MISSING: 'Informe as medidas reais de todas as barras.',
    CUT_EXECUTION_INVALID_REMAINING: 'A sobra real deve ser um número maior ou igual a zero.',
    CUT_EXECUTION_REMAINING_EXCEEDS_STOCK: 'A sobra real não pode ser maior que o material original.',
    CUT_EXECUTION_OUTPUT_EXCEEDS_STOCK: 'A soma das peças e da sobra real não pode exceder o comprimento do material original.',
    CUT_EXECUTION_PIECE_MISSING: 'Informe o comprimento real de todas as peças.',
    CUT_EXECUTION_INVALID_PIECE_LENGTH: 'O comprimento real de cada peça deve ser maior que zero.',
    CUT_EXECUTION_INVALID_SOBREMETAL: 'Informe um sobremetal válido, maior ou igual a zero.',
    CUT_EXECUTION_VARIANCE_REASON_REQUIRED: 'Informe uma justificativa para as diferenças entre o planejado e o realizado.',
  };
  return messages[code] || text(error?.message || error) || 'Não foi possível registrar as medidas reais.';
}
