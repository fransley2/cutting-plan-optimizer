function text(value) { return value == null ? '' : String(value).trim(); }

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function pieceNominalLengthMm(piece = {}) {
  return nonNegativeNumber(piece.nominalLengthMm ?? piece.cutLengthMm ?? piece.cutLength ?? piece.lengthMm ?? piece.length);
}

export function pieceSobremetalMm(piece = {}) {
  return piece.hasSobremetal === true ? nonNegativeNumber(piece.sobremetalMm, 500) : 0;
}

export function pieceEffectiveLengthMm(piece = {}) {
  return nonNegativeNumber(piece.effectiveLengthMm, pieceNominalLengthMm(piece) + pieceSobremetalMm(piece));
}

export function normalizePieceSobremetal(piece = {}) {
  const nominalLengthMm = pieceNominalLengthMm(piece);
  const hasSobremetal = piece.hasSobremetal === true;
  const sobremetalMm = hasSobremetal ? pieceSobremetalMm({ ...piece, hasSobremetal: true }) : 0;
  return {
    ...structuredClone(piece),
    nominalLengthMm,
    hasSobremetal,
    sobremetalMm,
    effectiveLengthMm: nominalLengthMm + sobremetalMm,
    length: nominalLengthMm + sobremetalMm,
  };
}

export function preparePiecesForNesting(pieces = []) {
  return (Array.isArray(pieces) ? pieces : []).map(normalizePieceSobremetal);
}

export function cuttingSheetPlanningSnapshot(sheet = {}) {
  if (sheet.planning && typeof sheet.planning === 'object') return structuredClone(sheet.planning);
  return {
    projectData: structuredClone(sheet.projectData || {}),
    settings: structuredClone(sheet.settings || {}),
    stocks: structuredClone(sheet.stocks || []),
    parts: structuredClone(sheet.parts || []),
    solution: structuredClone(sheet.metadata?.solution || null),
  };
}

export function legacyPlanToCuttingSheetDraft(plan = {}, existing = null) {
  const solution = plan.solution && typeof plan.solution === 'object' ? structuredClone(plan.solution) : null;
  const planning = {
    projectData: structuredClone(plan.projectData || {}),
    settings: structuredClone(plan.settings || {}),
    stocks: structuredClone(plan.stocks || []),
    parts: structuredClone(plan.parts || []),
    solution,
  };
  return {
    ...(existing ? structuredClone(existing) : {}),
    projectId: text(existing?.projectId || plan.projectId || plan.projectData?.projectId),
    number: text(existing?.number || plan.name),
    status: text(existing?.status) || 'draft',
    workpackId: text(existing?.workpackId || plan.workpackId || plan.projectData?.workpackId),
    bars: Array.isArray(existing?.bars) && existing.bars.length
      ? structuredClone(existing.bars)
      : structuredClone(solution?.stockUsed || []),
    summary: existing?.summary && Object.keys(existing.summary).length
      ? structuredClone(existing.summary)
      : structuredClone(plan.solutionSummary || {}),
    planning,
    metadata: {
      ...(existing?.metadata || {}),
      solution: structuredClone(existing?.metadata?.solution || solution),
      migratedFromLegacyPlan: true,
      legacyPlanName: text(plan.name),
      legacyPlanSavedAt: text(plan.savedAt),
    },
  };
}
