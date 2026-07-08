import { safeToFixed } from '../core/utils.js';
import {
  buildPieceColorMap,
  getColorForPiece,
  getContrastTextColor,
} from '../core/pieceColors.js';
import { getProfile } from '../data/profile.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function getReportOptions(options = {}) {
  const reportOptions = options.reportOptions || options.options || {};
  return {
    ...DEFAULT_REPORT_OPTIONS,
    ...reportOptions,
    labels: {
      ...DEFAULT_REPORT_OPTIONS.labels,
      ...(reportOptions.labels || {}),
    },
    labelFontSizePt: Number(reportOptions.labelFontSizePt) || DEFAULT_REPORT_OPTIONS.labelFontSizePt,
    useColors: reportOptions.useColors !== false,
    includeSignatures: reportOptions.includeSignatures === true,
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
}

function kpiCard(label, value, accent = '') {
  return `
    <div class="kpi-card ${accent}">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
    </div>`;
}

function signatureBox(title, profile = {}, fallback = 'Assinatura') {
  const signatureImage = profile.signatureImage
    ? `<img class="signature-image" src="${escapeHtml(profile.signatureImage)}" alt="Assinatura de ${escapeHtml(profile.name || title)}">`
    : '';
  const name = profile.name ? `<div><strong>Nome:</strong> ${escapeHtml(profile.name)}</div>` : '';
  const role = profile.role ? `<div><strong>Funcao:</strong> ${escapeHtml(profile.role)}</div>` : '';
  const placeholder = signatureImage || name || role ? '' : escapeHtml(fallback);

  return `
    <div>
      <div><strong>${escapeHtml(title)}</strong></div>
      <div class="signature-box">
        ${signatureImage}
        ${name}
        ${role}
        ${placeholder}
      </div>
    </div>`;
}

function reportSignatureSection(profile = {}, observations = '') {
  return `
    <section class="report-block">
      <div class="report-block-title">Assinaturas</div>
      <div class="report-footer">
        ${signatureBox('Responsavel pela emissao', profile)}
        ${signatureBox('Producao / Subcontratada')}
        <div>
          <div><strong>Observacoes</strong></div>
          <div class="signature-box">${escapeHtml(observations || 'Sem observacoes.')}</div>
        </div>
      </div>
    </section>`;
}

function buildSegmentLabel(piece, index, options) {
  const labels = [];
  if (options.labels.sequence) labels.push(`#${index + 1}`);
  if (options.labels.mark && piece.mark) labels.push(piece.mark);
  if (options.labels.pos && piece.pos) labels.push(piece.pos);
  if (options.labels.length) labels.push(`${safeToFixed(piece.length, 0)} mm`);
  return labels.join(' / ');
}

function renderBarDiagram(bar, solution, colorMap, reportOptions = DEFAULT_REPORT_OPTIONS) {
  const width = bar.originalLength > 0 ? bar.originalLength : 1;
  const leftTrimPct = bar.leftTrim > 0 ? (bar.leftTrim / width) * 100 : 0;
  const rightTrimPct = bar.rightTrim > 0 ? (bar.rightTrim / width) * 100 : 0;
  const usedLength = bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim;
  const usedPct = bar.originalLength > 0 ? (usedLength / width) * 100 : 0;
  const remainingPct = bar.originalLength > 0 ? (bar.remaining / width) * 100 : 0;
  const pieces = bar.pieces || [];
  let offset = leftTrimPct;
  let html = '';

  if (bar.leftTrim > 0) {
    html += `<div class="report-segment report-trim" style="left:0%;width:${leftTrimPct.toFixed(2)}%">Aparo</div>`;
  }

  pieces.forEach((piece, index) => {
    const chunkWidth = (piece.length / width) * 100;
    const color = getColorForPiece(piece, colorMap);
    const textColor = getContrastTextColor(color);
    const label = buildSegmentLabel(piece, index, reportOptions) || piece.dwgNumber || 'P';
    const displayLabel = label.length > 8 ? `${label.slice(0, 6)}…` : label;
    const colorStyle = reportOptions.useColors ? `background:${color};color:${textColor};` : '';
    html += `<div class="report-segment" style="left:${offset.toFixed(2)}%;width:${chunkWidth.toFixed(2)}%;${colorStyle}font-size:${reportOptions.labelFontSizePt}pt">${escapeHtml(displayLabel)}</div>`;
    offset += chunkWidth;
    if (index < pieces.length - 1 && solution?.kerf) {
      const kerfPct = (solution.kerf / width) * 100;
      html += `<div class="report-segment report-kerf" style="left:${offset.toFixed(2)}%;width:${kerfPct.toFixed(2)}%"></div>`;
      offset += kerfPct;
    }
  });

  if (bar.remaining > 0.001) {
    html += `<div class="report-segment report-offcut" style="left:${offset.toFixed(2)}%;width:${remainingPct.toFixed(2)}%">Sobra</div>`;
  }

  if (bar.rightTrim > 0) {
    const rightStart = 100 - rightTrimPct;
    html += `<div class="report-segment report-trim" style="left:${rightStart.toFixed(2)}%;width:${rightTrimPct.toFixed(2)}%">Aparo</div>`;
  }

  return `
    <div class="report-bar-track">
      ${html}
    </div>
    <div class="report-bar-meta">
      <span>Aproveitamento: <strong>${safeToFixed(usedPct, 1)}%</strong></span>
      <span>Usado: <strong>${safeToFixed(usedLength, 0)} mm</strong></span>
      <span>Sobra: <strong>${safeToFixed(bar.remaining, 0)} mm</strong></span>
    </div>`;
}

export async function openCuttingReportPdf({ solution, projectData = {}, settings = {} }) {
  if (!solution) return;

  const profile = await getProfile();
  const project = projectData || {};
  const used = solution.totalStockLength - solution.totalRemaining - solution.totalTrims;
  const utilization = solution.totalStockLength > 0 ? (used / solution.totalStockLength) * 100 : 0;
  const placed = solution.allParts?.length ? solution.allParts.length - solution.unplacedParts.length : 0;
  const unplaced = solution.unplacedParts?.length || 0;
  const reportDate = new Date().toLocaleDateString('pt-BR');
  const algorithm = solution.algorithm || 'N/A';

  const allPlacedPieces = (solution.stockUsed || []).flatMap((bar) => bar.pieces || []);
  const colorMap = buildPieceColorMap(allPlacedPieces);

  const summaryCards = [
    kpiCard('Barras utilizadas', solution.stockUsed?.length || 0, 'accent-secondary'),
    kpiCard('Peças alocadas', `${placed} / ${solution.allParts?.length || 0}`, placed > 0 ? 'accent-success' : ''),
    kpiCard('Peças não alocadas', unplaced, unplaced > 0 ? 'accent-critical' : ''),
    kpiCard('Aproveitamento total', `${safeToFixed(utilization, 1)}%`, utilization < 70 ? 'accent-critical' : 'accent-success'),
    kpiCard('Sobra total', `${safeToFixed(solution.totalRemaining || 0, 0)} mm`, ''),
    kpiCard('Algoritmo', algorithm, ''),
  ].join('');

  const barRows = (solution.stockUsed || []).map((bar, index) => `
    <section class="report-block">
      <div class="report-block-title">Barra ${index + 1}</div>
      <div class="report-bar-summary">
        <div><strong>PO:</strong> ${escapeHtml(bar.po || 'N/A')}</div>
        <div><strong>Item:</strong> ${escapeHtml(bar.item || 'N/A')}</div>
        <div><strong>Material:</strong> ${escapeHtml(bar.materialGrade || 'N/A')}</div>
        <div><strong>Heat:</strong> ${escapeHtml(bar.heatNumber || 'N/A')}</div>
        <div><strong>Trace:</strong> ${escapeHtml(bar.traceability || 'N/A')}</div>
        <div><strong>Comprimento original:</strong> ${escapeHtml(safeToFixed(bar.originalLength, 0))} mm</div>
        <div><strong>Comprimento usado:</strong> ${escapeHtml(safeToFixed(bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim, 0))} mm</div>
        <div><strong>Sobra:</strong> ${escapeHtml(safeToFixed(bar.remaining, 0))} mm</div>
        <div><strong>Aproveitamento:</strong> ${escapeHtml(safeToFixed((bar.originalLength > 0 ? (bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim) / bar.originalLength : 0) * 100, 1))}%</div>
      </div>
      ${renderBarDiagram(bar, solution, colorMap)}
      <table class="report-table">
        <thead>
          <tr><th>Seq.</th><th>DWG</th><th>Mark</th><th>POS</th><th>Material</th><th>Comprimento</th><th>Prioridade</th><th>Cor</th></tr>
        </thead>
        <tbody>
          ${(bar.pieces || []).map((piece, pieceIndex) => {
            const color = getColorForPiece(piece, colorMap);
            return `
            <tr>
              <td>${pieceIndex + 1}</td>
              <td>${escapeHtml(piece.dwgNumber || '—')}</td>
              <td>${escapeHtml(piece.mark || '—')}</td>
              <td>${escapeHtml(piece.pos || '—')}</td>
              <td>${escapeHtml(piece.material || '—')}</td>
              <td>${escapeHtml(safeToFixed(piece.length, 0))} mm</td>
              <td>${escapeHtml(piece.priority || '—')}</td>
              <td><span class="part-color-dot" style="background:${color};"></span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>`).join('');

  const legendEntries = Array.from(new Map(allPlacedPieces.map((piece) => [getColorForPiece(piece, colorMap), piece])).values()).map((piece) => {
    const color = getColorForPiece(piece, colorMap);
    const totalQty = allPlacedPieces.filter((candidate) => getColorForPiece(candidate, colorMap) === color).length;
    return `
      <div class="part-legend-item">
        <span class="part-color-dot" style="background:${color};"></span>
        <span>${escapeHtml(piece.mark || '—')}</span>
        <span>${escapeHtml(piece.pos || '—')}</span>
        <span>${escapeHtml(piece.dwgNumber || '—')}</span>
        <span>${escapeHtml(piece.material || '—')}</span>
        <span>${escapeHtml(safeToFixed(piece.length, 0))} mm</span>
        <span>${escapeHtml(String(totalQty))}</span>
      </div>`;
  }).join('');

  const legendSection = `
    <section class="report-block">
      <div class="report-block-title">Legenda de Peças</div>
      <div class="part-legend">
        ${legendEntries || '<div class="text-muted">Nenhuma peça alocada.</div>'}
      </div>
    </section>`;

  const unplacedRows = (solution.unplacedParts || []).length > 0 ? `
    <section class="report-block">
      <div class="report-block-title report-block-title-critical">Peças não alocadas</div>
      <table class="report-table">
        <thead>
          <tr><th>DWG</th><th>Mark</th><th>POS</th><th>Material</th><th>Comprimento</th><th>Prioridade</th></tr>
        </thead>
        <tbody>
          ${(solution.unplacedParts || []).map((piece) => `
            <tr>
              <td>${escapeHtml(piece.dwgNumber || '—')}</td>
              <td>${escapeHtml(piece.mark || '—')}</td>
              <td>${escapeHtml(piece.pos || '—')}</td>
              <td>${escapeHtml(piece.material || '—')}</td>
              <td>${escapeHtml(safeToFixed(piece.length, 0))} mm</td>
              <td>${escapeHtml(piece.priority || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>` : '';

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório de Corte</title>
  <style>
    :root {
      --primary: #22505F;
      --secondary: #6B8F9C;
      --critical: #8B2C2C;
      --editable: #FFF2CC;
      --bg: #FFFFFF;
      --border: #D8E1E5;
      --text: #1F2937;
      --muted: #6B7280;
    }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; padding: 16px; font-family: "Arimo", "Segoe UI", Arial, sans-serif; color: var(--text); background: var(--bg); }
    .report-page { max-width: 1400px; margin: 0 auto; }
    .report-header { border-bottom: 2px solid var(--primary); padding-bottom: 12px; margin-bottom: 16px; }
    .report-header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
    .report-brand { display: flex; align-items: center; gap: 10px; }
    .report-logo-image { width: 44px; max-height: 44px; object-fit: contain; display: block; }
    .report-doc-title { text-align: right; }
    .report-doc-title h2 { margin: 0; color: var(--primary); font-size: 18px; }
    .report-doc-title p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
    .report-title { font-size: 24px; font-weight: 700; color: var(--primary); margin: 0 0 4px; }
    .report-subtitle { font-size: 13px; color: var(--secondary); margin: 0 0 8px; }
    .report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; color: var(--muted); font-size: 12px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 14px 0 18px; }
    .kpi-card { border: 1px solid var(--border); border-left: 4px solid var(--primary); background: #f8fbfc; padding: 10px 12px; border-radius: 8px; }
    .kpi-card.accent-secondary { border-left-color: var(--secondary); }
    .kpi-card.accent-critical { border-left-color: var(--critical); background: #fff7f7; }
    .kpi-card.accent-success { border-left-color: #247a4a; background: #f5fff8; }
    .kpi-label { text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; }
    .kpi-value { font-size: 20px; font-weight: 700; color: var(--text); margin-top: 4px; }
    .report-block { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 14px; background: #fff; }
    .report-block-title { font-size: 15px; font-weight: 700; color: var(--primary); margin-bottom: 10px; }
    .report-block-title-critical { color: var(--critical); }
    .report-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 8px; }
    .report-list { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
    .report-bar-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
    .report-bar-track { position: relative; height: 34px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #f7f9fa; margin-bottom: 6px; }
    .report-segment { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 700; overflow: hidden; white-space: nowrap; }
    .report-kerf { background: var(--editable) !important; border-left: 1px dashed var(--secondary); border-right: 1px dashed var(--secondary); }
    .report-offcut { background: #d8dee1 !important; color: var(--text); border: 1px solid var(--border); }
    .report-trim { background: #B8C8D0 !important; color: var(--text); }
    .report-monochrome .report-segment:not(.report-kerf):not(.report-offcut):not(.report-trim) { background: #f3f4f6 !important; color: #111827 !important; border: 1px solid #374151; }
    .report-monochrome .report-offcut { background: #ffffff !important; border: 1px dashed #374151; }
    .report-bar-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .part-legend { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .part-legend-item { display: flex; align-items: center; gap: 6px; font-size: 10px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: #f8fbfc; }
    .part-color-dot { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #d8e1e5; flex: 0 0 auto; }
    .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .report-table th, .report-table td { border: 1px solid var(--border); padding: 6px; text-align: left; }
    .report-table th { background: #f2f6f8; color: var(--primary); }
    .report-footer { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 12px; color: var(--muted); }
    .signature-box { border: 1px dashed var(--border); min-height: 56px; border-radius: 8px; padding: 8px; }
    .signature-image { display: block; max-width: 180px; max-height: 48px; object-fit: contain; margin-bottom: 6px; }
    @media print {
      body { padding: 0; }
      .report-page { max-width: none; }
      @page { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="report-page">
    <header class="report-header">
      <h1 class="report-title">Cutting Plan Optimizer</h1>
      <p class="report-subtitle">Relatório de Corte / Aproveitamento de Nesting</p>
      <div class="report-meta">
        <div><strong>Projeto:</strong> ${escapeHtml(project.project || '—')}</div>
        <div><strong>Cliente:</strong> ${escapeHtml(project.client || '—')}</div>
        <div><strong>Equipamento:</strong> ${escapeHtml(project.equipment || '—')}</div>
        <div><strong>Workpack:</strong> ${escapeHtml(project.workpack || '—')}</div>
        <div><strong>Data:</strong> ${escapeHtml(formatDate(project.reportDate || new Date().toISOString()))}</div>
        <div><strong>Emitido:</strong> ${escapeHtml(reportDate)}</div>
      </div>
    </header>

    <div class="kpi-grid">${summaryCards}</div>

    <section class="report-block">
      <div class="report-block-title">Configurações</div>
      <div class="report-grid">
        <div class="report-list">
          <div><strong>Kerf:</strong> ${escapeHtml(safeToFixed(settings.kerf ?? 0, 0))} mm</div>
          <div><strong>Retalho mínimo:</strong> ${escapeHtml(safeToFixed(settings.minOffcut ?? 0, 0))} mm</div>
          <div><strong>Estratégia de estoque:</strong> ${escapeHtml(settings.stockUsageStrategy || 'N/A')}</div>
        </div>
        <div class="report-list">
          <div><strong>Aparo esquerdo:</strong> ${escapeHtml(safeToFixed(settings.trim?.left ?? 0, 0))} mm</div>
          <div><strong>Aparo direito:</strong> ${escapeHtml(settings.trim?.right ?? 0)} mm</div>
          <div><strong>Algoritmo:</strong> ${escapeHtml(algorithm)}</div>
        </div>
      </div>
    </section>

    ${barRows}
    ${legendSection}
    ${unplacedRows}

    ${reportSignatureSection(profile, project.observations)}
  </div>
</body>
</html>`;

  const reportFrame = document.createElement('iframe');
  reportFrame.style.position = 'fixed';
  reportFrame.style.top = '-9999px';
  reportFrame.style.left = '-9999px';
  reportFrame.style.width = '0';
  reportFrame.style.height = '0';
  reportFrame.style.border = '0';
  reportFrame.setAttribute('title', 'Relatório de corte');
  document.body.appendChild(reportFrame);

  reportFrame.addEventListener('load', () => {
    const frameWindow = reportFrame.contentWindow;
    if (frameWindow) {
      frameWindow.focus();
      setTimeout(() => {
        frameWindow.print();
        setTimeout(() => reportFrame.remove(), 1000);
      }, 150);
    }
  }, { once: true });

  reportFrame.srcdoc = html;
}

function writePrintableReportWindow(reportWindow, title, bodyHtml, page = 'landscape') {
  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --primary: #22505F;
      --secondary: #6B8F9C;
      --critical: #8B2C2C;
      --editable: #FFF2CC;
      --bg: #FFFFFF;
      --border: #D8E1E5;
      --text: #1F2937;
      --muted: #6B7280;
    }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; padding: 16px; font-family: "Arimo", "Segoe UI", Arial, sans-serif; color: var(--text); background: var(--bg); }
    .report-page { max-width: 1400px; margin: 0 auto; }
    .report-header { border-bottom: 2px solid var(--primary); padding-bottom: 12px; margin-bottom: 16px; }
    .report-header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
    .report-brand { display: flex; align-items: center; gap: 10px; }
    .report-logo-image { width: 44px; max-height: 44px; object-fit: contain; display: block; }
    .report-doc-title { text-align: right; }
    .report-doc-title h2 { margin: 0; color: var(--primary); font-size: 18px; }
    .report-doc-title p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
    .report-title { font-size: 24px; font-weight: 700; color: var(--primary); margin: 0 0 4px; }
    .report-subtitle { font-size: 13px; color: var(--secondary); margin: 0; }
    .report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; color: var(--muted); font-size: 12px; margin-top: 10px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 14px 0 18px; }
    .kpi-card { border: 1px solid var(--border); border-left: 4px solid var(--primary); background: #f8fbfc; padding: 10px 12px; border-radius: 8px; }
    .kpi-card.accent-secondary { border-left-color: var(--secondary); }
    .kpi-card.accent-critical { border-left-color: var(--critical); background: #fff7f7; }
    .kpi-card.accent-success { border-left-color: #247a4a; background: #f5fff8; }
    .kpi-label { text-transform: uppercase; font-size: 10px; color: var(--muted); font-weight: 700; }
    .kpi-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
    .report-block { border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 14px; background: #fff; page-break-inside: avoid; }
    .report-block-title { font-size: 15px; font-weight: 700; color: var(--primary); margin-bottom: 10px; }
    .report-bar-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
    .report-bar-track { position: relative; height: 34px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #f7f9fa; margin-bottom: 6px; }
    .report-segment { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 700; overflow: hidden; white-space: nowrap; }
    .report-kerf { background: var(--editable) !important; border-left: 1px dashed var(--secondary); border-right: 1px dashed var(--secondary); }
    .report-offcut { background: #d8dee1 !important; color: var(--text); border: 1px solid var(--border); }
    .report-trim { background: #B8C8D0 !important; color: var(--text); }
    .report-bar-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .report-table th, .report-table td { border: 1px solid var(--border); padding: 6px; text-align: left; }
    .report-table th { background: #f2f6f8; color: var(--primary); }
    .part-color-dot { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #d8e1e5; display: inline-block; vertical-align: middle; }
    .report-footer { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .signature-box { border: 1px dashed var(--border); min-height: 64px; border-radius: 8px; padding: 8px; color: var(--muted); }
    .signature-image { display: block; max-width: 180px; max-height: 48px; object-fit: contain; margin-bottom: 6px; }
    @media print {
      body { padding: 0; }
      .report-page { max-width: none; }
      @page { margin: 10mm; }
    }
  </style>
</head>
<body>${bodyHtml}
  <script>
    window.addEventListener('load', () => {
      window.focus();
      setTimeout(() => window.print(), 150);
    });
  </script>
</body>
</html>`);
  reportWindow.document.close();
  reportWindow.focus();
  return true;
}

function openPrintableReportShell(title) {
  return window.open('', `cutting-plan-${title.toLowerCase().replace(/\s+/g, '-')}`);
}

function openPrintableReportWindow(title, bodyHtml, page = 'landscape') {
  const reportWindow = openPrintableReportShell(title);
  if (!reportWindow) return false;
  return writePrintableReportWindow(reportWindow, title, bodyHtml, page);
}

function buildReportHeader(title, subtitle, projectData, settings, solution) {
  const header = settings.reportHeader || {};
  const companyName = header.companyName || 'Saipem do Brasil';
  const documentTitle = header.documentTitle || title;
  const headerSubtitle = header.subtitle || projectData.project || subtitle;
  const logoUrl = header.logoUrl || 'https://i.ibb.co/wZZQrZW0/Saipem-logo-300px.png';
  return `
    <div class="report-page">
      <header class="report-header">
        <div class="report-header-top">
          <div class="report-brand">
            <img class="report-logo-image" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}">
            <div>
              <h1 class="report-title">${escapeHtml(companyName)}</h1>
              <p class="report-subtitle">${escapeHtml(headerSubtitle)}</p>
            </div>
          </div>
          <div class="report-doc-title">
            <h2>${escapeHtml(documentTitle)}</h2>
            <p>${escapeHtml(title)}</p>
          </div>
        </div>
        <div class="report-meta">
          <div><strong>Projeto:</strong> ${escapeHtml(projectData.project || '-')}</div>
          <div><strong>Cliente:</strong> ${escapeHtml(projectData.client || '-')}</div>
          <div><strong>Equipamento:</strong> ${escapeHtml(projectData.equipment || '-')}</div>
          <div><strong>Workpack:</strong> ${escapeHtml(projectData.workpack || '-')}</div>
          <div><strong>Kerf:</strong> ${escapeHtml(safeToFixed(settings.kerf ?? solution.kerf ?? 0, 0))} mm</div>
          <div><strong>Retalho minimo:</strong> ${escapeHtml(safeToFixed(settings.minOffcut ?? solution.minOffcut ?? 0, 0))} mm</div>
        </div>
      </header>`;
}

function buildReportKpis(solution) {
  const used = solution.totalStockLength - solution.totalRemaining - solution.totalTrims;
  const utilization = solution.totalStockLength > 0 ? (used / solution.totalStockLength) * 100 : 0;
  const placed = (solution.allParts || []).length - (solution.unplacedParts || []).length;
  return `
    <div class="kpi-grid">
      ${kpiCard('Algoritmo', solution.algorithm || '-')}
      ${kpiCard('Aproveitamento', `${safeToFixed(utilization, 1)}%`, utilization < 70 ? 'accent-critical' : 'accent-success')}
      ${kpiCard('Barras', (solution.stockUsed || []).length, 'accent-secondary')}
      ${kpiCard('Pecas alocadas', `${placed} / ${(solution.allParts || []).length}`, (solution.unplacedParts || []).length ? 'accent-critical' : 'accent-success')}
      ${kpiCard('Sobra total', `${safeToFixed(solution.totalRemaining || 0, 0)} mm`)}
      ${kpiCard('Retalhos gerados', (solution.generatedOffcuts || []).length)}
    </div>`;
}

function buildVisualBars(solution, colorMap, reportOptions) {
  return (solution.stockUsed || []).map((bar, index) => `
    <section class="report-block">
      <div class="report-block-title">Barra ${index + 1}</div>
      <div class="report-bar-summary">
        <div><strong>PO:</strong> ${escapeHtml(bar.po || 'N/A')}</div>
        <div><strong>Item:</strong> ${escapeHtml(bar.item || 'N/A')}</div>
        <div><strong>Material:</strong> ${escapeHtml(bar.materialGrade || 'N/A')}</div>
        <div><strong>Heat:</strong> ${escapeHtml(bar.heatNumber || 'N/A')}</div>
        <div><strong>Trace:</strong> ${escapeHtml(bar.traceability || 'N/A')}</div>
      </div>
      ${renderBarDiagram(bar, solution, colorMap, reportOptions)}
    </section>`).join('');
}

function buildPiecesRows(pieces, colorMap, includeBar = '') {
  return pieces.map(({ piece, barLabel = includeBar }, index) => {
    const color = colorMap ? getColorForPiece(piece, colorMap) : '';
    return `
      <tr>
        ${barLabel ? `<td>${escapeHtml(barLabel)}</td>` : ''}
        <td>${index + 1}</td>
        <td>${escapeHtml(piece.dwgNumber || '-')}</td>
        <td>${escapeHtml(piece.mark || '-')}</td>
        <td>${escapeHtml(piece.pos || '-')}</td>
        <td>${escapeHtml(piece.material || '-')}</td>
        <td>${escapeHtml(safeToFixed(piece.length, 0))}</td>
        <td>${escapeHtml(piece.priority || '-')}</td>
        ${color ? `<td><span class="part-color-dot" style="background:${color};"></span></td>` : ''}
      </tr>`;
  }).join('');
}

export async function openVisualPdfReport({ solution, projectData = {}, settings = {}, reportOptions = {} }) {
  if (!solution) return false;
  const reportWindow = openPrintableReportShell('Relatorio Visual PDF');
  if (!reportWindow) return false;
  const profile = await getProfile();
  const options = getReportOptions({ reportOptions });
  const allPlacedPieces = (solution.stockUsed || []).flatMap((bar) => bar.pieces || []);
  const colorMap = buildPieceColorMap(allPlacedPieces);
  const reportClass = options.useColors ? '' : 'report-monochrome';
  const html = `
    <div class="${reportClass}">
    ${buildReportHeader('Relatorio Visual PDF', 'Nesting visual das barras e legenda de pecas', projectData, settings, solution)}
    ${buildReportKpis(solution)}
    ${buildVisualBars(solution, colorMap, options)}
    ${options.includeSignatures ? reportSignatureSection(profile, projectData.observations) : ''}
    </div>
    </div>`;
  return writePrintableReportWindow(reportWindow, 'Relatorio Visual PDF', html, 'landscape');
}

export async function openTabularPdfReport({ solution, projectData = {}, settings = {}, reportOptions = {} }) {
  if (!solution) return false;
  const reportWindow = openPrintableReportShell('Relatorio Tabular PDF');
  if (!reportWindow) return false;
  const profile = await getProfile();
  const options = getReportOptions({ reportOptions });
  const allPlacedPieces = (solution.stockUsed || []).flatMap((bar, barIndex) => (
    (bar.pieces || []).map((piece) => ({ piece, barLabel: `Barra ${barIndex + 1}` }))
  ));
  const colorMap = buildPieceColorMap(allPlacedPieces.map((item) => item.piece));
  const rows = buildPiecesRows(allPlacedPieces, colorMap);
  const html = `
    ${buildReportHeader('Relatorio Tabular PDF', 'Tabela consolidada de cortes por barra', projectData, settings, solution)}
    ${buildReportKpis(solution)}
    <section class="report-block">
      <div class="report-block-title">Tabela de Cortes</div>
      <table class="report-table">
        <thead><tr><th>Barra</th><th>Seq.</th><th>DWG</th><th>Mark</th><th>POS</th><th>Material</th><th>Comp.</th><th>Prioridade</th><th>Cor</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9">Nenhuma peca alocada.</td></tr>'}</tbody>
      </table>
    </section>
    ${options.includeSignatures ? reportSignatureSection(profile, projectData.observations) : ''}
    </div>`;
  return writePrintableReportWindow(reportWindow, 'Relatorio Tabular PDF', html, 'landscape');
}

export async function openCuttingSheetPdfReport({ solution, projectData = {}, settings = {}, reportOptions = {} }) {
  if (!solution) return false;
  const reportWindow = openPrintableReportShell('Ficha de Corte PDF');
  if (!reportWindow) return false;
  const profile = await getProfile();
  const options = getReportOptions({ reportOptions });
  const allPlacedPieces = (solution.stockUsed || []).flatMap((bar) => bar.pieces || []);
  const colorMap = buildPieceColorMap(allPlacedPieces);
  const reportClass = options.useColors ? '' : 'report-monochrome';
  const sheets = (solution.stockUsed || []).map((bar, index) => `
    <section class="report-block">
      <div class="report-block-title">Ficha de Corte - Barra ${index + 1}</div>
      <div class="report-bar-summary">
        <div><strong>PO:</strong> ${escapeHtml(bar.po || 'N/A')}</div>
        <div><strong>Item:</strong> ${escapeHtml(bar.item || 'N/A')}</div>
        <div><strong>Descricao:</strong> ${escapeHtml(bar.description || '-')}</div>
        <div><strong>Material:</strong> ${escapeHtml(bar.materialGrade || 'N/A')}</div>
        <div><strong>Heat:</strong> ${escapeHtml(bar.heatNumber || 'N/A')}</div>
        <div><strong>Trace:</strong> ${escapeHtml(bar.traceability || 'N/A')}</div>
        <div><strong>Comprimento:</strong> ${escapeHtml(safeToFixed(bar.originalLength, 0))} mm</div>
        <div><strong>Sobra:</strong> ${escapeHtml(safeToFixed(bar.remaining, 0))} mm</div>
      </div>
      ${renderBarDiagram(bar, solution, colorMap, options)}
      <table class="report-table">
        <thead><tr><th>Seq.</th><th>DWG</th><th>Mark</th><th>POS</th><th>Material</th><th>Comp.</th><th>Prioridade</th><th>Cor</th></tr></thead>
        <tbody>${buildPiecesRows((bar.pieces || []).map((piece) => ({ piece })), colorMap) || '<tr><td colspan="8">Nenhuma peca.</td></tr>'}</tbody>
      </table>
      ${options.includeSignatures ? `<div class="signature-grid">
        ${signatureBox('Responsavel pela emissao', profile)}
        ${signatureBox('Producao')}
        <div><strong>Observacoes</strong><div class="signature-box">${escapeHtml(projectData.observations || '')}</div></div>
      </div>` : ''}
    </section>`).join('');
  const html = `
    <div class="${reportClass}">
    ${buildReportHeader('Ficha de Corte PDF', 'Ficha operacional para fabricacao', projectData, settings, solution)}
    ${sheets || '<section class="report-block">Nenhuma barra utilizada.</section>'}
    </div>
    </div>`;
  return writePrintableReportWindow(reportWindow, 'Ficha de Corte PDF', html, 'landscape');
}
