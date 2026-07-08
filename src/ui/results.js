import { safeToFixed } from '../core/utils.js';
import {
  buildPieceColorMap,
  getColorForPiece,
  getContrastTextColor,
} from '../core/pieceColors.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function kpiCard(label, value, accent = '') {
  return `<div class="kpi-card ${accent}"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div></div>`;
}

const DEFAULT_REPORT_OPTIONS = Object.freeze({
  labels: Object.freeze({
    sequence: false,
    mark: true,
    pos: true,
    length: true,
  }),
  labelFontSizePt: 9,
  useColors: true,
  includeSignatures: false,
});

function normalizeReportOptions(options = {}) {
  return {
    ...DEFAULT_REPORT_OPTIONS,
    ...options,
    labels: {
      ...DEFAULT_REPORT_OPTIONS.labels,
      ...(options.labels || {}),
    },
    labelFontSizePt: Number(options.labelFontSizePt) || DEFAULT_REPORT_OPTIONS.labelFontSizePt,
    useColors: options.useColors !== false,
    includeSignatures: options.includeSignatures === true,
  };
}

function buildPieceLabel(piece, index, options) {
  const labels = [];
  if (options.labels.sequence) labels.push(`#${index + 1}`);
  if (options.labels.mark && piece.mark) labels.push(piece.mark);
  if (options.labels.pos && piece.pos) labels.push(piece.pos);
  if (options.labels.length) labels.push(`${safeToFixed(piece.length, 0)}mm`);
  return labels.length ? labels.join(' / ') : '';
}

function buildResultsMetrics(solution) {
  const used = solution.totalStockLength - solution.totalRemaining - solution.totalTrims;
  const utilization = solution.totalStockLength > 0 ? (used / solution.totalStockLength) * 100 : 0;
  const placed = solution.allParts.length - solution.unplacedParts.length;

  return { used, utilization, placed };
}

export function renderSummary(container, solution) {
  if (!container || !solution) return;
  const { utilization, placed } = buildResultsMetrics(solution);

  container.innerHTML = `
    <div class="kpi-grid">
      ${kpiCard('Algoritmo', solution.algorithm)}
      ${kpiCard('Aproveitamento Total', `${safeToFixed(utilization, 1)}%`, utilization < 70 ? 'accent-critical' : 'accent-success')}
      ${kpiCard('Barras Utilizadas', solution.stockUsed.length, 'accent-secondary')}
      ${kpiCard('Pecas Alocadas', `${placed} / ${solution.allParts.length}`, solution.unplacedParts.length > 0 ? 'accent-critical' : 'accent-success')}
      ${kpiCard('Sobra Total', `${safeToFixed(solution.totalRemaining || 0, 0)} mm`)}
      ${kpiCard('Retalhos Gerados', (solution.generatedOffcuts || []).length)}
    </div>
    ${solution.unplacedParts.length > 0 ? `
      <div class="results-alert">
        <strong class="text-critical">Pecas nao alocadas (${solution.unplacedParts.length}):</strong> nenhuma barra de estoque com comprimento/material compativel.
      </div>` : ''}
  `;
}

function renderBarSegments(bar, solution, colorMap, options) {
  const originalLength = Number(bar.originalLength) || 1;
  let barHTML = '';
  let pos = bar.leftTrim > 0 ? (bar.leftTrim / originalLength) * 100 : 0;

  if (pos > 0) {
    barHTML += `<div class="piece piece-trim" style="left:0%;width:${pos.toFixed(3)}%;">TRIM</div>`;
  }

  (bar.pieces || []).forEach((piece, index) => {
    const width = ((Number(piece.length) || 0) / originalLength) * 100;
    const kerfWidth = (solution.kerf / originalLength) * 100;
    const color = getColorForPiece(piece, colorMap);
    const textColor = getContrastTextColor(color);
    const labelText = buildPieceLabel(piece, index, options);
    const shortLabel = labelText.length > 22 ? `${labelText.slice(0, 19)}...` : labelText;
    const colorStyle = options.useColors
      ? `background:${color};color:${textColor};`
      : '';

    barHTML += `<div class="piece" style="left:${pos.toFixed(3)}%;width:${width.toFixed(3)}%;${colorStyle}" title="${escapeHtml(`${piece.dwgNumber || ''} ${piece.mark || ''} ${piece.pos || ''}`)}">
      <span class="piece-caption">${escapeHtml(shortLabel)}</span>
    </div>`;
    pos += width;

    if (index < (bar.pieces || []).length - 1 && solution.kerf > 0) {
      barHTML += `<div class="piece piece-kerf" style="left:${pos.toFixed(3)}%;width:${kerfWidth.toFixed(3)}%;"></div>`;
      pos += kerfWidth;
    }
  });

  if (bar.remaining > 0.001) {
    const offcutWidth = (bar.remaining / originalLength) * 100;
    barHTML += `<div class="piece piece-offcut" style="left:${pos.toFixed(3)}%;width:${offcutWidth.toFixed(3)}%;">Sobra ${escapeHtml(safeToFixed(bar.remaining, 0))}mm</div>`;
  }

  if (bar.rightTrim > 0) {
    const rightTrimWidth = (bar.rightTrim / originalLength) * 100;
    barHTML += `<div class="piece piece-trim" style="left:${(100 - rightTrimWidth).toFixed(3)}%;width:${rightTrimWidth.toFixed(3)}%;">TRIM</div>`;
  }

  return barHTML;
}

function renderLegend(container, pieces, colorMap) {
  const uniquePieces = Array.from(new Map(pieces.map((piece) => [getColorForPiece(piece, colorMap), piece])).values());
  const wrapper = document.createElement('section');
  wrapper.className = 'results-panel';

  const title = document.createElement('h3');
  title.textContent = 'Legenda de Pecas';
  wrapper.appendChild(title);

  const legend = document.createElement('div');
  legend.className = 'piece-legend compact';

  if (uniquePieces.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.textContent = 'Nenhuma peca alocada.';
    wrapper.appendChild(empty);
  } else {
    uniquePieces.forEach((piece) => {
      const color = getColorForPiece(piece, colorMap);
      const qty = pieces.filter((candidate) => getColorForPiece(candidate, colorMap) === color).length;
      const item = document.createElement('div');
      item.className = 'piece-legend-row';
      item.innerHTML = `
        <span class="piece-color-dot" style="background:${color};"></span>
        <span><strong>${escapeHtml(piece.mark || '-')}</strong> / ${escapeHtml(piece.pos || '-')} / ${escapeHtml(piece.dwgNumber || '-')} / ${escapeHtml(piece.material || '-')} / ${escapeHtml(safeToFixed(piece.length, 0))}mm / x${escapeHtml(qty)}</span>`;
      legend.appendChild(item);
    });
    wrapper.appendChild(legend);
  }

  container.appendChild(wrapper);
}

function renderBarsTable(container, solution) {
  const wrapper = document.createElement('section');
  wrapper.className = 'results-panel';
  wrapper.innerHTML = `
    <h3>Tabela de Barras</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>#</th><th>PO</th><th>Item</th><th>Descricao</th><th>Material</th><th>Heat</th><th>Trace</th><th>Comp.</th><th>Pecas</th><th>Sobra</th><th>Aprov.</th></tr>
        </thead>
        <tbody>
          ${(solution.stockUsed || []).map((bar, index) => {
            const usedLength = bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim;
            const utilization = bar.originalLength > 0 ? (usedLength / bar.originalLength) * 100 : 0;
            return `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(bar.po || '-')}</td>
                <td>${escapeHtml(bar.item || '-')}</td>
                <td>${escapeHtml(bar.description || '-')}</td>
                <td>${escapeHtml(bar.materialGrade || '-')}</td>
                <td>${escapeHtml(bar.heatNumber || '-')}</td>
                <td>${escapeHtml(bar.traceability || '-')}</td>
                <td>${escapeHtml(safeToFixed(bar.originalLength, 0))}</td>
                <td>${escapeHtml((bar.pieces || []).length)}</td>
                <td>${escapeHtml(safeToFixed(bar.remaining, 0))}</td>
                <td>${escapeHtml(safeToFixed(utilization, 1))}%</td>
              </tr>`;
          }).join('') || '<tr><td colspan="11">Nenhuma barra utilizada.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  container.appendChild(wrapper);
}

function renderUnplacedTable(container, solution) {
  if ((solution.unplacedParts || []).length === 0) return;

  const wrapper = document.createElement('section');
  wrapper.className = 'results-panel results-panel-critical';
  wrapper.innerHTML = `
    <h3>Pecas Nao Alocadas</h3>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>DWG</th><th>Mark</th><th>POS</th><th>Material</th><th>Comp.</th><th>Prioridade</th></tr></thead>
        <tbody>
          ${(solution.unplacedParts || []).map((piece) => `
            <tr>
              <td>${escapeHtml(piece.dwgNumber || '-')}</td>
              <td>${escapeHtml(piece.mark || '-')}</td>
              <td>${escapeHtml(piece.pos || '-')}</td>
              <td>${escapeHtml(piece.material || '-')}</td>
              <td>${escapeHtml(safeToFixed(piece.length, 0))}</td>
              <td>${escapeHtml(piece.priority || '-')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  container.appendChild(wrapper);
}

function renderSignaturePreview(container) {
  const wrapper = document.createElement('section');
  wrapper.className = 'results-panel';
  wrapper.innerHTML = `
    <h3>Assinaturas</h3>
    <div class="results-signatures">
      <div>
        <strong>Responsavel pela emissao</strong>
        <div class="results-signature-box">Nome / Assinatura</div>
      </div>
      <div>
        <strong>Producao</strong>
        <div class="results-signature-box">Nome / Assinatura</div>
      </div>
      <div>
        <strong>Cliente / QA</strong>
        <div class="results-signature-box">Nome / Assinatura</div>
      </div>
    </div>`;
  container.appendChild(wrapper);
}

export function renderCutSheets(container, solution, reportOptions = {}) {
  if (!container || !solution) return;
  const options = normalizeReportOptions(reportOptions);
  container.replaceChildren();
  container.classList.toggle('report-monochrome', !options.useColors);
  container.style.setProperty('--report-label-font-size', `${options.labelFontSizePt}pt`);
  const allPlacedPieces = (solution.stockUsed || []).flatMap((bar) => bar.pieces || []);
  const colorMap = buildPieceColorMap(allPlacedPieces);

  const barsPanel = document.createElement('section');
  barsPanel.className = 'results-panel results-bars-panel';

  const barsTitle = document.createElement('h3');
  barsTitle.textContent = 'Diagrama Visual das Barras';
  barsPanel.appendChild(barsTitle);

  const stack = document.createElement('div');
  stack.className = 'results-bars-stack';

  (solution.stockUsed || []).forEach((bar, idx) => {
    const usedLength = bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim;
    const utilization = bar.originalLength > 0 ? (usedLength / bar.originalLength) * 100 : 0;
    const sheet = document.createElement('div');
    sheet.className = 'cut-sheet';
    sheet.innerHTML = `
      <div class="flex-between cut-sheet-header">
        <div>
          <strong>Barra ${idx + 1}</strong>
          <div class="text-muted">${escapeHtml(bar.description || '')} / ${escapeHtml(bar.materialGrade || '')} / Heat ${escapeHtml(bar.heatNumber || 'N/A')}</div>
        </div>
        <div class="text-muted cut-sheet-trace">
          PO ${escapeHtml(bar.po || 'N/A')} / Item ${escapeHtml(bar.item || 'N/A')}<br>Trace: ${escapeHtml(bar.traceability || 'N/A')}
        </div>
      </div>
      <div class="stock-bar">${renderBarSegments(bar, solution, colorMap, options)}</div>
      <div class="flex-between cut-sheet-footer">
        <span>Aproveitamento: <strong>${escapeHtml(safeToFixed(utilization, 1))}%</strong></span>
        <span>Barra: ${escapeHtml(safeToFixed(bar.originalLength, 0))}mm</span>
        <span>Sobra: ${escapeHtml(safeToFixed(bar.remaining, 0))}mm</span>
      </div>`;
    stack.appendChild(sheet);
  });

  if ((solution.stockUsed || []).length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.textContent = 'Nenhuma barra utilizada.';
    stack.appendChild(empty);
  }

  barsPanel.appendChild(stack);
  container.appendChild(barsPanel);
  renderLegend(container, allPlacedPieces, colorMap);
  renderBarsTable(container, solution);
  renderUnplacedTable(container, solution);
  if (options.includeSignatures) renderSignaturePreview(container);
}

export function renderResults({ container, summaryContainer, visualContainer, solution, reportOptions = {} }) {
  if (!container || !summaryContainer || !visualContainer || !solution) return;
  container?.classList.remove('hidden');
  renderSummary(summaryContainer, solution);
  renderCutSheets(visualContainer, solution, reportOptions);
}
