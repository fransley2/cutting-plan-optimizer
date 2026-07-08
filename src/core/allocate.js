// Núcleo de negócio: aloca peças em barras de estoque (1D cutting stock / nesting).
// Nenhuma função aqui acessa DOM, localStorage ou UI — só dados de entrada e saída.
// Isso permite reaproveitar o mesmo motor em testes, em um Web Worker (planos grandes)
// ou até no backend futuramente, sem reescrever nada.

/**
 * @param {Array} parts     lista de peças já expandidas por Qty (uma entrada por unidade física)
 * @param {Array} stock     lista de barras de estoque já expandidas por Qty
 * @param {number} kerf     espessura de corte (mm)
 * @param {number} minOffcut comprimento mínimo para uma sobra ser considerada retalho aproveitável
 * @param {string} stockUsageStrategy 'best-fit' | 'prioritize-offcuts' | 'smallest-bars'
 * @param {string} algorithmStrategy  'first-fit' | 'best-fit'
 * @param {{left:number, right:number}} trim  aparo lateral opcional
 */
export function allocateParts(parts, stock, kerf, minOffcut, stockUsageStrategy, algorithmStrategy, trim = { left: 0, right: 0 }) {
  const { left: leftTrim = 0, right: rightTrim = 0 } = trim;

  let availableBars = structuredClone(stock).map(s => ({
    ...s,
    originalLength: s.length,
    remaining: s.length - leftTrim - rightTrim,
    leftTrim,
    rightTrim,
    pieces: [],
  }));

  if (stockUsageStrategy === 'prioritize-offcuts') {
    const offcuts = availableBars.filter(b => b.isOffcut).sort((a, b) => a.length - b.length);
    const primary = availableBars.filter(b => !b.isOffcut);
    availableBars = [...offcuts, ...primary];
  } else if (stockUsageStrategy === 'smallest-bars') {
    availableBars.sort((a, b) => a.length - b.length);
  }

  const sortedParts = [...parts].sort((a, b) => a.priority - b.priority || b.length - a.length);
  const unplacedParts = [];

  const fits = (bar, part) => {
    if (bar.materialGrade && part.material && bar.materialGrade !== part.material) return false;
    const lengthNeeded = bar.pieces.length > 0 ? part.length + kerf : part.length;
    return bar.remaining >= lengthNeeded ? lengthNeeded : null;
  };

  for (const part of sortedParts) {
    let chosenBar = null;
    let chosenLength = null;

    if (algorithmStrategy === 'first-fit') {
      for (const bar of availableBars) {
        const lengthNeeded = fits(bar, part);
        if (lengthNeeded !== null && lengthNeeded !== false) { chosenBar = bar; chosenLength = lengthNeeded; break; }
      }
    } else { // best-fit
      let bestRemaining = Infinity;
      for (const bar of availableBars) {
        const lengthNeeded = fits(bar, part);
        if (lengthNeeded === null || lengthNeeded === false) continue;
        const remainingAfter = bar.remaining - lengthNeeded;
        if (remainingAfter < bestRemaining) { bestRemaining = remainingAfter; chosenBar = bar; chosenLength = lengthNeeded; }
      }
    }

    if (chosenBar) {
      chosenBar.pieces.push(part);
      chosenBar.remaining -= chosenLength;
    } else {
      unplacedParts.push(part);
    }
  }

  const stockUsed = availableBars.filter(bar => bar.pieces.length > 0);

  const generatedOffcuts = stockUsed
    .filter(bar => bar.remaining >= minOffcut)
    .map(bar => ({
      ...bar,
      length: bar.remaining,
      qty: 1,
      description: `Offcut from ${bar.description}`,
      traceability: `${bar.traceability}_OC`,
      isOffcut: true,
      leftTrim: 0,
      rightTrim: 0,
    }));

  const totalStockLength = stockUsed.reduce((s, bar) => s + bar.originalLength, 0);
  const totalRemaining = stockUsed.reduce((s, bar) => s + bar.remaining, 0);
  const totalTrims = stockUsed.reduce((s, bar) => s + bar.leftTrim + bar.rightTrim, 0);

  return { stockUsed, unplacedParts, totalStockLength, totalRemaining, totalTrims, generatedOffcuts, minOffcut };
}

function utilizationOf(solution) {
  const used = solution.totalStockLength - solution.totalRemaining - solution.totalTrims;
  return solution.totalStockLength > 0 ? used / solution.totalStockLength : 0;
}

/**
 * Roda FFD e BFD e devolve o melhor resultado (maior aproveitamento).
 * Substitui a Promise do original — não há nada assíncrono aqui de fato,
 * então usar Promise era código morto (regra 1: does this need to exist?).
 * Se o plano for muito grande e travar a UI, mover para um Web Worker é
 * a solução correta — não uma Promise decorativa.
 */
export function runAllocations({ parts, stock, kerf, minOffcut, stockUsageStrategy, trim }) {
  if (stock.length === 0 || parts.length === 0) return null;

  const ffd = allocateParts(parts, stock, kerf, minOffcut, stockUsageStrategy, 'first-fit', trim);
  const bfd = allocateParts(parts, stock, kerf, minOffcut, stockUsageStrategy, 'best-fit', trim);

  const best = utilizationOf(bfd) >= utilizationOf(ffd)
    ? { ...bfd, algorithm: 'Best-Fit Decreasing (BFD)' }
    : { ...ffd, algorithm: 'First-Fit Decreasing (FFD)' };

  return { ...best, allParts: parts, kerf, minOffcut };
}
