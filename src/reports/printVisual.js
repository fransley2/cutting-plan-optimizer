import { safeToFixed } from '../core/utils.js';
import { pieceNominalLengthMm, pieceSobremetalMm } from '../core/cuttingSheetPlanning.js';
import {
  buildPieceColorMap,
  getColorForPiece,
} from '../core/pieceColors.js';
import { normalizeReportHeader } from '../data/appSettings.js';
import { cuttingSheetBarPoItem } from '../core/cuttingSheetPresentation.js';
import { operationalWorkpackValue } from '../core/workpackRelations.js';

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatInteger(value) {
  return safeToFixed(numberValue(value), 0);
}

function formatMmValue(value) {
  return `${formatInteger(value)}mm`;
}

function formatMeters(value) {
  return `${safeToFixed(numberValue(value) / 1000, 1)}m`;
}

function formatPercent(value) {
  return `${safeToFixed(numberValue(value), 1)}%`;
}

function formatDate(value) {
  if (!value) return new Date().toLocaleDateString('pt-BR');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
}

function getBaseHref() {
  const href = window.location.href;
  return href.slice(0, href.lastIndexOf('/') + 1);
}

function normalizeReportOptions(reportData = {}) {
  const options = reportData.reportOptions || reportData.options || {};
  return {
    ...DEFAULT_REPORT_OPTIONS,
    ...options,
    labels: {
      ...DEFAULT_REPORT_OPTIONS.labels,
      ...(options.labels || {}),
    },
    labelFontSizePt: numberValue(options.labelFontSizePt, DEFAULT_REPORT_OPTIONS.labelFontSizePt),
    useColors: options.useColors !== false,
    includeSignatures: options.includeSignatures === true,
  };
}

function getSolution(reportData) {
  return reportData.solution || reportData.results || reportData;
}

function getProjectData(reportData) {
  const projectData = reportData.projectData || {};
  return {
    project: reportData.project || projectData.project || '',
    client: reportData.client || projectData.client || '',
    equipment: reportData.equipment || projectData.equipment || '',
    workpack: operationalWorkpackValue(reportData.workpack || projectData.workpack),
    materialCoupon: reportData.materialCoupon
      || reportData.coupon
      || projectData.materialCoupon
      || projectData.coupon
      || '',
    reportDate: reportData.date || reportData.reportDate || projectData.reportDate || new Date().toISOString(),
  };
}

function getBars(solution) {
  return (solution?.stockUsed || solution?.bars || solution?.stock || [])
    .filter((bar) => getPieces(bar).length > 0);
}

function getPieces(bar) {
  return bar?.pieces || bar?.parts || [];
}

function getBarLength(bar) {
  return numberValue(bar?.originalLength ?? bar?.stockLength ?? bar?.length, 0);
}

function getPieceLength(piece) {
  return numberValue(piece?.length ?? piece?.cutLength ?? piece?.cutLengthMm, 0);
}

function getKerf(solution, reportData) {
  return numberValue(solution?.kerf ?? reportData.settings?.kerf, 0);
}

function getUsedLength(bar) {
  return Math.max(
    0,
    getBarLength(bar)
      - numberValue(bar?.remaining)
      - numberValue(bar?.leftTrim)
      - numberValue(bar?.rightTrim)
  );
}

function getUtilization(bar) {
  const length = getBarLength(bar);
  return length > 0 ? (getUsedLength(bar) / length) * 100 : 0;
}

function getSummary(solution, bars) {
  const totalStockLength = numberValue(
    solution?.totalStockLength,
    bars.reduce((sum, bar) => sum + getBarLength(bar), 0)
  );
  const totalRemaining = numberValue(
    solution?.totalRemaining,
    bars.reduce((sum, bar) => sum + numberValue(bar?.remaining), 0)
  );
  const totalTrims = numberValue(
    solution?.totalTrims,
    bars.reduce((sum, bar) => sum + numberValue(bar?.leftTrim) + numberValue(bar?.rightTrim), 0)
  );
  const used = Math.max(0, totalStockLength - totalRemaining - totalTrims);
  const allParts = solution?.allParts || bars.flatMap(getPieces);
  const unplaced = solution?.unplacedParts || [];
  const placed = allParts.length ? allParts.length - unplaced.length : bars.flatMap(getPieces).length;

  return {
    utilization: totalStockLength > 0 ? (used / totalStockLength) * 100 : 0,
    barsUsed: bars.length,
    partsPlaced: placed,
    totalParts: allParts.length || placed,
    totalOffcut: totalRemaining,
  };
}

function getAlgorithmName(solution, reportData) {
  return solution?.algorithm
    || reportData.settings?.algorithm
    || reportData.settings?.stockUsageStrategy
    || 'N/A';
}

function getReportHeader(reportData, project) {
  const header = normalizeReportHeader(reportData.reportHeader || reportData.settings?.reportHeader || {});
  return {
    ...header,
    companyName: reportData.companyName
      || reportData.profile?.company
      || reportData.reportHeader?.companyName
      || reportData.settings?.reportHeader?.companyName
      || header.companyName,
    subtitle: reportData.reportHeader?.subtitle
      || reportData.settings?.reportHeader?.subtitle
      || project.project
      || 'Cutting Plan Optimizer',
    documentTitles: header.documentTitles,
    logoUrl: reportData.reportHeader?.logoUrl
      || reportData.settings?.reportHeader?.logoUrl
      || header.logoUrl,
  };
}

function fallback(value, emptyValue = 'N/A') {
  const text = String(value ?? '').trim();
  return text || emptyValue;
}

function sheetLetter(index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < alphabet.length) return alphabet[index];
  return String(index + 1);
}

function renderLogo(reportHeader) {
  return `
    <img class="report-logo-image" src="${escapeAttribute(reportHeader.logoUrl)}" alt="${escapeAttribute(reportHeader.companyName)}">`;
}

function renderHeader(project, reportData, solution) {
  const reportHeader = getReportHeader(reportData, project);
  return `
    <div class="report-header">
      <div class="logo-section">
        ${renderLogo(reportHeader)}
        <div class="company-info">
          <h1>${escapeHtml(reportHeader.companyName)}</h1>
          <p>${escapeHtml(reportHeader.subtitle)}</p>
        </div>
      </div>

      <div class="doc-title">
        <h2>${escapeHtml(reportHeader.documentTitles.cuttingPlan)}</h2>
        <p class="date">${escapeHtml(formatDate(project.reportDate))}</p>
      </div>
    </div>

    <div class="project-info">
      <div class="info-item"><label>Project</label><span>${escapeHtml(fallback(project.project))}</span></div>
      <div class="info-item"><label>Client</label><span>${escapeHtml(fallback(project.client))}</span></div>
      <div class="info-item"><label>Equipment</label><span>${escapeHtml(fallback(project.equipment))}</span></div>
      <div class="info-item"><label>Workpack</label><span>${escapeHtml(fallback(project.workpack))}</span></div>
      <div class="info-item"><label>Material Coupon</label><span>${escapeHtml(fallback(project.materialCoupon))}</span></div>
      <div class="info-item"><label>Best Algorithm</label><span>${escapeHtml(getAlgorithmName(solution, reportData))}</span></div>
    </div>`;
}

function renderStats(summary) {
  return `
    <div class="stats-grid">
      <div class="stat-card blue">
        <label>Total Utilization</label>
        <span class="value">${escapeHtml(formatPercent(summary.utilization))}</span>
      </div>
      <div class="stat-card green">
        <label>Bars Used</label>
        <span class="value">${escapeHtml(summary.barsUsed)}</span>
      </div>
      <div class="stat-card orange">
        <label>Parts Placed</label>
        <span class="value">${escapeHtml(`${summary.partsPlaced}/${summary.totalParts}`)}</span>
      </div>
      <div class="stat-card purple">
        <label>Total Offcut</label>
        <span class="value">${escapeHtml(formatMeters(summary.totalOffcut))}</span>
      </div>
    </div>`;
}

function buildPieceLabelHtml(piece, index, options) {
  const mainLabels = [];
  if (options.labels.sequence) mainLabels.push(`#${index + 1}`);
  if (options.labels.mark && piece?.mark) mainLabels.push(piece.mark);
  if (options.labels.pos && piece?.pos) mainLabels.push(piece.pos);

  const mainText = mainLabels.join(' / ');
  const nominal = pieceNominalLengthMm(piece);
  const sobremetal = pieceSobremetalMm(piece);
  const lengthHtml = options.labels.length
    ? `<span class="piece-length">(${escapeHtml(formatMmValue(nominal))}${sobremetal ? ` + ${escapeHtml(formatMmValue(sobremetal))} SM` : ''})</span>`
    : '';
  const mainHtml = mainText
    ? `<span class="piece-mark">${escapeHtml(mainText)}</span>`
    : '';

  return `${mainHtml}${lengthHtml}`;
}

function renderPiece(piece, index, left, width, color, options) {
  return `
    <div class="piece" style="left: ${left.toFixed(12)}%; width: ${width.toFixed(12)}%; background-color: ${escapeAttribute(color)};">
      ${buildPieceLabelHtml(piece, index, options)}
    </div>`;
}

function renderKerf(left, width) {
  if (width <= 0) return '';
  return `<div class="kerf" style="left: ${left.toFixed(12)}%; width: ${width.toFixed(12)}%;"></div>`;
}

function renderOffcut(left, width, length) {
  if (width <= 0 || length <= 0) return '';
  return `
    <div class="offcut" style="left: ${left.toFixed(12)}%; width: ${width.toFixed(12)}%;">
      <span>Offcut</span>
      <span class="offcut-length">(${escapeHtml(formatMmValue(length))})</span>
    </div>`;
}

function renderBarPieces(bar, solution, reportData, colorMap, options) {
  const barLength = Math.max(getBarLength(bar), 1);
  const kerf = getKerf(solution, reportData);
  const pieces = getPieces(bar);
  const offcut = Math.max(0, numberValue(bar?.remaining ?? bar?.offcut ?? bar?.offcutLength));
  let offset = Math.max(0, numberValue(bar?.leftTrim));
  let html = '';

  pieces.forEach((piece, index) => {
    const pieceLength = getPieceLength(piece);
    const left = (offset / barLength) * 100;
    const width = (pieceLength / barLength) * 100;
    const color = getColorForPiece(piece, colorMap);
    html += renderPiece(piece, index, left, width, color, options);
    offset += pieceLength;

    if (kerf > 0 && index < pieces.length - 1) {
      html += renderKerf((offset / barLength) * 100, (kerf / barLength) * 100);
      offset += kerf;
    }
  });

  html += renderOffcut((offset / barLength) * 100, (offcut / barLength) * 100, offcut);
  return html;
}

function renderCutRows(bar) {
  const rows = getPieces(bar).map((piece, index) => `
    <tr>
      <td>${escapeHtml(index + 1)}</td>
      <td>${escapeHtml(piece?.dwgNumber || piece?.drawing || '-')}</td>
      <td>${escapeHtml(piece?.mark || '-')}</td>
      <td>${escapeHtml(piece?.pos || '-')}</td>
      <td class="text-right">${escapeHtml(formatInteger(getPieceLength(piece)))}</td>
    </tr>`).join('');

  return rows || '<tr><td colspan="5">No placed parts.</td></tr>';
}

function renderCutSheet(bar, index, solution, reportData, colorMap, options) {
  const barLength = getBarLength(bar);
  const utilization = getUtilization(bar);
  const offcut = Math.max(0, numberValue(bar?.remaining ?? bar?.offcut ?? bar?.offcutLength));
  const material = bar?.materialGrade || bar?.material || 'N/A';
  const heat = bar?.heatNo || 'N/A';
  const traceability = bar?.traceability || bar?.trace || 'N/A';
  const po = bar?.po || 'N/A';
  const item = cuttingSheetBarPoItem(bar) || 'N/A';
  const subtitle = bar?.description || bar?.stockDescription || bar?.profile || bar?.type || 'Stock material';

  return `
    <div class="cut-sheet">
      <div class="sheet-header">
        <div>
          <h3 class="sheet-title">Cut Sheet ${escapeHtml(sheetLetter(index))}</h3>
          <p class="sheet-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <div class="sheet-meta">
          <div><strong>PO:</strong> ${escapeHtml(po)} / <strong>Item:</strong> ${escapeHtml(item)}</div>
          <div><strong>Material:</strong> ${escapeHtml(material)} / <strong>Heat:</strong> ${escapeHtml(heat)}</div>
          <div><strong>Traceability:</strong> ${escapeHtml(traceability)}</div>
        </div>
      </div>

      <div class="bar-section">
        <div class="bar-label">Bar Length (mm): ${escapeHtml(formatMmValue(barLength))}</div>
        <div class="stock-bar">
          ${renderBarPieces(bar, solution, reportData, colorMap, options)}
        </div>
      </div>

      <div class="parts-section">
        <table class="parts-table">
          <thead>
            <tr>
              <th>Seq.</th>
              <th>DWG Number</th>
              <th>Mark</th>
              <th>POS</th>
              <th class="text-right">Cut L. (mm)</th>
            </tr>
          </thead>
          <tbody>${renderCutRows(bar)}</tbody>
        </table>
      </div>

      <div class="sheet-footer">
        <div>Utilization: <span class="utilization-value">${escapeHtml(formatPercent(utilization))}</span></div>
        <div>Offcut: <span class="offcut-value">${escapeHtml(formatMmValue(offcut))}</span></div>
      </div>
    </div>`;
}

function renderUnplaced(solution) {
  const rows = (solution?.unplacedParts || []).map((piece) => `
    <tr>
      <td>${escapeHtml(piece?.dwgNumber || piece?.drawing || '-')}</td>
      <td>${escapeHtml(piece?.mark || '-')}</td>
      <td>${escapeHtml(piece?.pos || '-')}</td>
      <td class="text-right">${escapeHtml(formatInteger(getPieceLength(piece)))}</td>
    </tr>`).join('');

  if (!rows) return '';

  return `
    <div class="cut-sheet">
      <div class="sheet-header">
        <div>
          <h3 class="sheet-title">Unallocated Parts</h3>
          <p class="sheet-subtitle">Parts that could not be placed in available stock.</p>
        </div>
      </div>
      <div class="parts-section unplaced-section">
        <table class="parts-table">
          <thead><tr><th>DWG Number</th><th>Mark</th><th>POS</th><th class="text-right">Cut L. (mm)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderSignatures() {
  return `
    <div class="signatures">
      <div class="signature-box">
        <div class="signature-line"></div>
        <p><strong>Issued By (PPC)</strong></p>
        <p class="role">Name / Signature / Date</p>
      </div>

      <div class="signature-box">
        <div class="signature-line"></div>
        <p><strong>Production Supervisor (CTCO/Sub)</strong></p>
        <p class="role">Name / Signature / Date</p>
      </div>
    </div>`;
}

function renderStyles() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      background: #ffffff;
      color: #1d1d1f;
      font-size: 10pt;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }

    @page {
      margin: 12mm 10mm;
    }

    .cutting-report-page {
      width: 100%;
      height: 100%;
      background: #ffffff;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e5e7;
    }

    .logo-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .report-logo-image {
      width: 40px;
      height: 48px;
      object-fit: contain;
    }

    .company-info h1 {
      margin: 0;
      color: #1d1d1f;
      font-size: 14pt;
      font-weight: 600;
      letter-spacing: -0.3px;
    }

    .company-info p {
      margin: 0;
      color: #86868b;
      font-size: 9pt;
      font-weight: 400;
    }

    .doc-title {
      text-align: right;
    }

    .doc-title h2 {
      margin: 0 0 2px;
      color: #1d1d1f;
      font-size: 12pt;
      font-weight: 600;
    }

    .doc-title .date,
    .doc-title p {
      margin: 0;
      color: #86868b;
      font-size: 9pt;
    }

    .project-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 6px 12px;
      margin-bottom: 12px;
      padding: 8px 10px;
      background: #f5f5f7;
      border-radius: 10px;
    }

    .info-item {
      font-size: 8.5pt;
    }

    .info-item label {
      display: block;
      margin-bottom: 2px;
      color: #86868b;
      font-size: 7pt;
      font-weight: 500;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .info-item span {
      display: block;
      color: #1d1d1f;
      font-size: 8.5pt;
      font-weight: 600;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 6px;
      margin-bottom: 12px;
    }

    .stat-card {
      padding: 8px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-card.blue {
      background: linear-gradient(135deg, #e8f4fd 0%, #d6ecfc 100%);
    }

    .stat-card.green,
    .stat-card.accent-success {
      background: linear-gradient(135deg, #e7f7ef 0%, #d3f1e3 100%);
    }

    .stat-card.orange,
    .stat-card.accent-secondary {
      background: linear-gradient(135deg, #fff4e6 0%, #ffe8cc 100%);
    }

    .stat-card.purple {
      background: linear-gradient(135deg, #f3ebff 0%, #e8deff 100%);
    }

    .stat-card.accent-critical {
      background: linear-gradient(135deg, #fff0ef 0%, #ffdeda 100%);
    }

    .stat-card label,
    .kpi-label {
      display: block;
      margin-bottom: 2px;
      color: #86868b;
      font-size: 7pt;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .stat-card .value,
    .kpi-value {
      display: block;
      color: #1d1d1f;
      font-size: 14pt;
      font-weight: 700;
      line-height: 1;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 6px;
      margin-bottom: 12px;
    }

    .kpi-card {
      padding: 8px;
      border-radius: 8px;
      text-align: center;
      background: #f5f5f7;
    }

    .cut-sheet {
      margin-bottom: 16px;
      overflow: hidden;
      background: #ffffff;
      border: 1px solid #e5e5e7;
      border-radius: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .sheet-header,
    .cut-sheet-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px;
      background: linear-gradient(to bottom, #fafafa 0%, #f5f5f7 100%);
      border-bottom: 1px solid #e5e5e7;
    }

    .sheet-title {
      margin: 0 0 2px;
      color: #1d1d1f;
      font-size: 11pt;
      font-weight: 600;
    }

    .sheet-subtitle {
      margin: 0;
      color: #86868b;
      font-size: 8.5pt;
    }

    .sheet-meta {
      color: #86868b;
      font-size: 7.5pt;
      line-height: 1.6;
      text-align: right;
    }

    .sheet-meta strong,
    .cut-sheet-header strong {
      color: #1d1d1f;
      font-weight: 600;
    }

    .text-muted {
      color: #86868b;
      font-size: 8pt;
      line-height: 1.35;
    }

    .cut-sheet-trace {
      text-align: right;
    }

    .bar-section,
    .diagram-section {
      padding: 14px;
    }

    .bar-label {
      margin-bottom: 8px;
      color: #86868b;
      font-size: 8pt;
      font-weight: 500;
    }

    .stock-bar {
      position: relative;
      height: 44px;
      overflow: hidden;
      background: #f5f5f7;
      border: 1px solid #e5e5e7;
      border-radius: 8px;
    }

    .piece,
    .kerf,
    .offcut,
    .piece-kerf,
    .piece-offcut,
    .piece-trim {
      position: absolute;
      top: 0;
      height: 100%;
    }

    .piece {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-right: 1px solid rgba(255, 255, 255, 0.3);
      color: #ffffff;
      font-size: var(--report-label-font-size, 9pt);
      font-weight: 600;
      line-height: 1.2;
      text-align: center;
      overflow: hidden;
    }

    .piece-mark,
    .piece-caption {
      max-width: 100%;
      overflow: hidden;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .piece-length {
      display: block;
      max-width: 100%;
      overflow: hidden;
      font-size: 0.8em;
      font-weight: 400;
      opacity: 0.9;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .kerf,
    .piece-kerf {
      background: #999 !important;
    }

    .offcut,
    .piece-offcut {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: repeating-linear-gradient(
        45deg,
        #e5e5e7,
        #e5e5e7 8px,
        #d1d1d6 8px,
        #d1d1d6 16px
      ) !important;
      color: #86868b !important;
      font-size: var(--report-label-font-size, 9pt);
      font-weight: 600;
      line-height: 1.2;
      text-align: center;
    }

    .offcut-length {
      display: block;
      margin-top: 2px;
      font-size: 0.8em;
      font-weight: 400;
      opacity: 0.9;
    }

    .piece-trim {
      background: repeating-linear-gradient(
        45deg,
        #fecaca,
        #fecaca 8px,
        #fee2e2 8px,
        #fee2e2 16px
      ) !important;
      color: #991b1b !important;
    }

    .parts-section,
    .cut-list {
      padding: 0 14px 14px;
    }

    .parts-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 8.5pt;
    }

    .parts-table thead th {
      padding: 8px 10px;
      background: #f5f5f7;
      border-bottom: 1px solid #e5e5e7;
      color: #86868b;
      font-size: 7.5pt;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-align: left;
      text-transform: uppercase;
    }

    .parts-table thead th:first-child {
      border-top-left-radius: 6px;
    }

    .parts-table thead th:last-child {
      border-top-right-radius: 6px;
    }

    .parts-table tbody td {
      padding: 2px 10px;
      border-bottom: 1px solid #f5f5f7;
      color: #1d1d1f;
    }

    .parts-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      font-size: 8pt;
    }

    .data-table th,
    .data-table td {
      padding: 4px 6px;
      border: 1px solid #e5e5e7;
      text-align: left;
      vertical-align: top;
    }

    .data-table th {
      background: #f5f5f7;
      color: #86868b;
      font-size: 7pt;
      font-weight: 600;
      text-transform: uppercase;
    }

    .text-right {
      text-align: right;
    }

    .sheet-footer,
    .cut-sheet-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 14px;
      background: #fafafa;
      border-top: 1px solid #e5e5e7;
      color: #1d1d1f;
      font-size: 9pt;
    }

    .sheet-footer div,
    .cut-sheet-footer span {
      font-weight: 600;
    }

    .utilization-value {
      color: #34c759;
      font-weight: 700;
    }

    .offcut-value {
      color: #ff9500;
      font-weight: 700;
    }

    .piece-legend {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 6px;
    }

    .piece-legend-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      background: #fafafa;
      border: 1px solid #e5e5e7;
      border-radius: 6px;
      color: #1d1d1f;
      font-size: 8pt;
    }

    .piece-color-dot {
      width: 12px;
      height: 12px;
      flex: 0 0 12px;
      border: 1px solid #d1d1d6;
      border-radius: 2px;
    }

    .signatures {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e7;
    }

    .signature-line {
      height: 40px;
      margin-bottom: 8px;
      border-bottom: 1px solid #1d1d1f;
    }

    .signature-box p {
      margin: 0 0 2px;
      color: #1d1d1f;
      font-size: 8.5pt;
    }

    .signature-box .role {
      margin-top: 4px;
      color: #86868b;
      font-size: 7.5pt;
    }

    .report-monochrome .piece {
      background: #ffffff !important;
      color: #1d1d1f !important;
      border: 1px solid #1d1d1f !important;
    }

    .report-monochrome .offcut,
    .report-monochrome .piece-offcut,
    .report-monochrome .piece-trim {
      background: repeating-linear-gradient(
        45deg,
        #ffffff,
        #ffffff 8px,
        #e5e5e7 8px,
        #e5e5e7 16px
      ) !important;
      color: #1d1d1f !important;
      border: 1px dashed #1d1d1f !important;
    }

    .report-monochrome .kerf,
    .report-monochrome .piece-kerf {
      background: #1d1d1f !important;
    }

    .report-monochrome .stat-card,
    .report-monochrome .kpi-card {
      background: #ffffff !important;
      border: 1px solid #d1d1d6;
    }

    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .cut-sheet,
      .results-panel,
      .stats-grid,
      .kpi-grid {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }`;
}

function buildReportHtml(reportData) {
  const solution = getSolution(reportData);
  const project = getProjectData(reportData);
  const bars = getBars(solution);
  const summary = getSummary(solution, bars);
  const options = normalizeReportOptions(reportData);
  const colorMap = buildPieceColorMap(bars.flatMap(getPieces));
  const bodyClass = options.useColors ? '' : 'report-monochrome';
  const labelSize = Math.max(6, Math.min(16, options.labelFontSizePt));

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeAttribute(getBaseHref())}">
  <title>Cutting Plan Report</title>
  <style>${renderStyles()}</style>
</head>
<body class="${bodyClass}">
  <div class="cutting-report-page" style="--report-label-font-size: ${escapeAttribute(labelSize)}pt;">
    ${renderHeader(project, reportData, solution)}
    ${renderStats(summary)}
    ${bars.length
      ? bars.map((bar, index) => renderCutSheet(bar, index, solution, reportData, colorMap, options)).join('')
      : '<div class="cut-sheet"><div class="sheet-header"><div><h3 class="sheet-title">Cut Sheet</h3><p class="sheet-subtitle">No used stock bars.</p></div></div></div>'}
    ${renderUnplaced(solution)}
    ${options.includeSignatures ? renderSignatures() : ''}
  </div>
  <script>
    const waitForImage = (image) => {
      if (image.complete) return typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    };
    const printWhenReady = async () => {
      try { if (document.fonts?.ready) await document.fonts.ready; } catch (error) { console.warn('Visual report could not wait for fonts.', error); }
      await Promise.all([...document.images].map(waitForImage));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      window.focus();
      window.print();
    };
    if (document.readyState === 'complete') printWhenReady();
    else window.addEventListener('load', printWhenReady, { once: true });
  </script>
</body>
</html>`;
}

export function printVisualReport(reportData) {
  const reportWindow = window.open('', 'cutting-plan-visual-report');
  if (!reportWindow) return false;
  reportWindow.document.open();
  reportWindow.document.write(buildReportHtml({ ...(reportData || {}) }));
  reportWindow.document.close();
  reportWindow.focus();
  return true;
}
