export const OFFCUT_REUSE_MIN_LENGTH_MM = 500;

export const OFFCUT_CLASSIFICATION = Object.freeze({
  REUSABLE: 'REUSABLE',
  SCRAP: 'SCRAP',
});

function lengthValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function classifyOffcutLength(lengthMm, thresholdMm = OFFCUT_REUSE_MIN_LENGTH_MM) {
  const length = lengthValue(lengthMm);
  if (!length) return '';
  return length >= lengthValue(thresholdMm) ? OFFCUT_CLASSIFICATION.REUSABLE : OFFCUT_CLASSIFICATION.SCRAP;
}

export function offcutClassificationLabel(lengthMm, thresholdMm = OFFCUT_REUSE_MIN_LENGTH_MM) {
  return classifyOffcutLength(lengthMm, thresholdMm) === OFFCUT_CLASSIFICATION.REUSABLE
    ? 'Reaproveitável'
    : lengthValue(lengthMm) ? 'Scrap' : '';
}

export function buildFinalMaterialRemainders(solution = {}) {
  const bars = Array.isArray(solution.stockUsed) ? solution.stockUsed : [];
  const consumedRemainderTraces = new Set(bars.map((bar) => String(bar.traceability || bar.trace || '')).filter(Boolean));
  return bars.flatMap((bar, index) => {
    const length = lengthValue(bar.actualRemainingMm ?? bar.remaining ?? bar.offcut ?? bar.spareOffcut);
    if (!length) return [];
    const parentTrace = bar.traceability || bar.trace || bar.inventoryItemId || bar.id || '';
    const traceability = parentTrace ? `${parentTrace}_OC` : `OFFCUT-${index + 1}`;
    if (consumedRemainderTraces.has(traceability)) return [];
    const sourceCandidateKey = `${parentTrace || index + 1}|${length}`;
    return [{
      length,
      lengthMm: length,
      qty: 1,
      materialGrade: bar.materialGrade || bar.material || '',
      heatNo: bar.heatNo || bar.heat || '',
      widthMm: bar.widthMm || bar.width || 0,
      thicknessMm: bar.thicknessMm || bar.thickness || 0,
      description: `Sobra de ${bar.description || parentTrace || `barra ${index + 1}`}`,
      traceability,
      parentTrace,
      parentTraceability: parentTrace,
      parentInventoryItemId: bar.inventoryItemId || parentTrace,
      sourceCandidateKey,
      metadata: {
        sourceCandidateKey,
        parentTrace,
        generatedFrom: 'CURRENT_NESTING_RESULT',
        classification: classifyOffcutLength(length),
      },
    }];
  });
}
