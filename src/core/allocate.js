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

  const sortedParts = [...parts].sort((a, b) => {
    const priorityOrLength = a.priority - b.priority || b.length - a.length;
    if (priorityOrLength) return priorityOrLength;
    const aTieBreaker = String(a.id ?? a.traceability ?? '');
    const bTieBreaker = String(b.id ?? b.traceability ?? '');
    return aTieBreaker < bTieBreaker ? -1 : aTieBreaker > bTieBreaker ? 1 : 0;
  });
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
        const fitResult = fits(bar, part);
        const lengthNeeded = fitResult === false ? null : fitResult;
        if (lengthNeeded !== null) { chosenBar = bar; chosenLength = lengthNeeded; break; }
      }
    } else { // best-fit
      let bestRemaining = Infinity;
      for (const bar of availableBars) {
        const fitResult = fits(bar, part);
        const lengthNeeded = fitResult === false ? null : fitResult;
        if (lengthNeeded === null) continue;
        const remainingAfter = bar.remaining - lengthNeeded;
        const prefersOffcut = remainingAfter === bestRemaining
          && bar.isOffcut === true
          && chosenBar?.isOffcut !== true;
        if (remainingAfter < bestRemaining || prefersOffcut) {
          bestRemaining = remainingAfter;
          chosenBar = bar;
          chosenLength = lengthNeeded;
        }
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

/**
 * Reaproveita os retalhos gerados em até três passadas puras de alocação.
 * A primeira passada respeita os aparos informados; as passadas de retalho usam
 * aparos zerados porque o comprimento disponível já representa a sobra real.
 * O resultado consolidado mantém o mesmo contrato de allocateParts.
 */
export function allocatePartsWithOffcutReuse(parts, stock, kerf, minOffcut, stockUsageStrategy, algorithmStrategy, trim = { left: 0, right: 0 }) {
  const reuseMarker = '__allocateOffcutReuseIndex';
  const withoutReuseMarker = (bar) => {
    const cleanBar = { ...bar };
    delete cleanBar[reuseMarker];
    return cleanBar;
  };

  const stockUsed = [];
  const retainedOffcuts = [];
  let currentParts = parts;
  let currentStock = stock;
  let currentTrim = trim;
  let generatedOffcuts = [];

  for (let pass = 0; pass < 3; pass += 1) {
    const isReusePass = pass > 0;
    const passStock = isReusePass
      ? currentStock.map((bar, index) => ({ ...bar, [reuseMarker]: index }))
      : currentStock;
    const result = allocateParts(
      currentParts,
      passStock,
      kerf,
      minOffcut,
      stockUsageStrategy,
      algorithmStrategy,
      currentTrim,
    );
    const placedCount = currentParts.length - result.unplacedParts.length;

    stockUsed.push(...result.stockUsed.map(withoutReuseMarker));

    if (isReusePass) {
      const consumedOffcutIndexes = new Set(result.stockUsed.map(bar => bar[reuseMarker]));
      retainedOffcuts.push(...currentStock.filter((bar, index) => !consumedOffcutIndexes.has(index)));
    }

    currentParts = result.unplacedParts;
    generatedOffcuts = result.generatedOffcuts.map(withoutReuseMarker);

    if (placedCount === 0 || currentParts.length === 0 || generatedOffcuts.length === 0 || pass === 2) break;

    currentStock = generatedOffcuts;
    currentTrim = { left: 0, right: 0 };
  }

  generatedOffcuts = [...retainedOffcuts, ...generatedOffcuts];
  const totalStockLength = stockUsed.reduce((sum, bar) => sum + bar.originalLength, 0);
  const totalRemaining = stockUsed.reduce((sum, bar) => sum + bar.remaining, 0);
  const totalTrims = stockUsed.reduce((sum, bar) => sum + bar.leftTrim + bar.rightTrim, 0);

  return { stockUsed, unplacedParts: currentParts, totalStockLength, totalRemaining, totalTrims, generatedOffcuts, minOffcut };
}

function utilizationOf(solution) {
  const used = solution.totalStockLength - solution.totalRemaining - solution.totalTrims;
  return solution.totalStockLength > 0 ? used / solution.totalStockLength : 0;
}

/**
 * Explora FFD e BFD com as três estratégias de uso de estoque e devolve
 * o melhor dos seis resultados, sempre com reaproveitamento de retalhos.
 * A estratégia recebida inicia a exploração e vence empates entre estratégias,
 * mas não limita mais as alternativas avaliadas.
 * Substitui a Promise do original — não há nada assíncrono aqui de fato,
 * então usar Promise era código morto (regra 1: does this need to exist?).
 * Se o plano for muito grande e travar a UI, mover para um Web Worker é
 * a solução correta — não uma Promise decorativa.
 */
export function runAllocations({ parts, stock, kerf, minOffcut, stockUsageStrategy, trim }) {
  if (stock.length === 0 || parts.length === 0) return null;

  const availableStockStrategies = ['best-fit', 'prioritize-offcuts', 'smallest-bars'];
  const stockStrategies = availableStockStrategies.includes(stockUsageStrategy)
    ? [stockUsageStrategy, ...availableStockStrategies.filter(strategy => strategy !== stockUsageStrategy)]
    : availableStockStrategies;
  let best = null;

  for (const strategy of stockStrategies) {
    const ffd = allocatePartsWithOffcutReuse(parts, stock, kerf, minOffcut, strategy, 'first-fit', trim);
    const bfd = allocatePartsWithOffcutReuse(parts, stock, kerf, minOffcut, strategy, 'best-fit', trim);
    const strategyBest = utilizationOf(bfd) >= utilizationOf(ffd)
      ? { ...bfd, algorithm: `Best-Fit Decreasing (BFD) + ${strategy}` }
      : { ...ffd, algorithm: `First-Fit Decreasing (FFD) + ${strategy}` };

    if (!best || utilizationOf(strategyBest) > utilizationOf(best)) best = strategyBest;
  }

  return { ...best, allParts: parts, kerf, minOffcut };
}
