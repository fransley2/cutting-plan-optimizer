import { safeToFixed } from '../core/utils.js';
import {
  buildPieceColorMap,
  getColorForPiece,
  getContrastTextColor,
} from '../core/pieceColors.js';
import { getProfile } from '../data/profile.js';
import { DEFAULT_REPORT_HEADER, normalizeReportHeader } from '../data/appSettings.js';
import { pieceNominalLengthMm, pieceSobremetalMm } from '../core/cuttingSheetPlanning.js';
import { cuttingSheetBarPoItem } from '../core/cuttingSheetPresentation.js';
import { operationalWorkpackValue } from '../core/workpackRelations.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reportValue(value, fallback = '—') {
  const text = String(value ?? '').trim();
  if (!text || /^(selecione|select)\b/i.test(text)) return fallback;
  return text;
}

function getBarMetrics(bar = {}) {
  const originalLength = Number(bar.originalLength) || 0;
  const remaining = Number(bar.remaining) || 0;
  const leftTrim = Number(bar.leftTrim) || 0;
  const rightTrim = Number(bar.rightTrim) || 0;
  const usedLength = Math.max(0, originalLength - remaining - leftTrim - rightTrim);
  const utilization = originalLength > 0 ? (usedLength / originalLength) * 100 : 0;
  return { originalLength, remaining, leftTrim, rightTrim, usedLength, utilization };
}

function pieceLengthLabel(piece, unit = ' mm') {
  const nominal = safeToFixed(pieceNominalLengthMm(piece), 0);
  const extra = pieceSobremetalMm(piece);
  return extra ? `${nominal}${unit} + ${safeToFixed(extra, 0)}${unit} SM` : `${nominal}${unit}`;
}

const DEFAULT_REPORT_OPTIONS = Object.freeze({
  labels: Object.freeze({
    sequence: true,
    mark: true,
    pos: true,
    length: true,
  }),
  labelFontSizePt: 9,
  colorMode: 'ink',
  useColors: false,
  includeSignatures: false,
});

function getReportOptions(options = {}) {
  const reportOptions = options.reportOptions || options.options || {};
  const requestedColorMode = ['color', 'grayscale', 'ink'].includes(reportOptions.colorMode)
    ? reportOptions.colorMode
    : (Object.hasOwn(reportOptions, 'useColors')
      ? (reportOptions.useColors === false ? 'grayscale' : 'color')
      : DEFAULT_REPORT_OPTIONS.colorMode);
  return {
    ...DEFAULT_REPORT_OPTIONS,
    ...reportOptions,
    labels: {
      ...DEFAULT_REPORT_OPTIONS.labels,
      ...(reportOptions.labels || {}),
    },
    labelFontSizePt: Math.max(7, Math.min(12, Number(reportOptions.labelFontSizePt) || DEFAULT_REPORT_OPTIONS.labelFontSizePt)),
    colorMode: requestedColorMode,
    useColors: requestedColorMode === 'color',
    includeSignatures: reportOptions.includeSignatures === true,
  };
}

function reportColorClass(options) {
  if (options.colorMode === 'color') return '';
  return options.colorMode === 'grayscale'
    ? 'report-monochrome report-grayscale'
    : 'report-monochrome report-ink';
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
  if (options.labels.length) labels.push(pieceLengthLabel(piece));
  return labels.join(' / ');
}

function renderBarDiagram(bar, solution, colorMap, reportOptions = DEFAULT_REPORT_OPTIONS) {
  const metrics = getBarMetrics(bar);
  const width = metrics.originalLength > 0 ? metrics.originalLength : 1;
  const leftTrimPct = metrics.leftTrim > 0 ? (metrics.leftTrim / width) * 100 : 0;
  const rightTrimPct = metrics.rightTrim > 0 ? (metrics.rightTrim / width) * 100 : 0;
  const usedPct = metrics.utilization;
  const remainingPct = metrics.originalLength > 0 ? (metrics.remaining / width) * 100 : 0;
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
    const densityClass = chunkWidth < 9 ? 'report-segment-narrow' : (chunkWidth < 18 ? 'report-segment-compact' : 'report-segment-wide');
    const colorStyle = reportOptions.useColors ? `background:${color};color:${textColor};` : '';
    const primaryLabels = [
      reportOptions.labels.sequence ? `<b class="report-segment-sequence">#${index + 1}</b>` : '',
      reportOptions.labels.mark && piece.mark ? `<span class="report-segment-mark">${escapeHtml(piece.mark)}</span>` : '',
    ].filter(Boolean).join('');
    const secondaryLabels = [
      reportOptions.labels.pos && piece.pos ? `<span class="report-segment-pos">POS ${escapeHtml(piece.pos)}</span>` : '',
      reportOptions.labels.length ? `<strong class="report-segment-measure">${escapeHtml(pieceLengthLabel(piece))}</strong>` : '',
    ].filter(Boolean).join('');
    html += `<div class="report-segment report-segment-tone-${index % 4} ${densityClass}" title="${escapeHtml(label)}" style="left:${offset.toFixed(2)}%;width:${chunkWidth.toFixed(2)}%;${colorStyle}font-size:${reportOptions.labelFontSizePt}pt"><span class="report-segment-content">${primaryLabels ? `<span class="report-segment-primary">${primaryLabels}</span>` : ''}${secondaryLabels ? `<span class="report-segment-secondary">${secondaryLabels}</span>` : ''}</span></div>`;
    offset += chunkWidth;
    if (index < pieces.length - 1 && solution?.kerf) {
      const kerfPct = (solution.kerf / width) * 100;
      html += `<div class="report-segment report-kerf" style="left:${offset.toFixed(2)}%;width:${kerfPct.toFixed(2)}%"></div>`;
      offset += kerfPct;
    }
  });

  if (metrics.remaining > 0.001) {
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
      <span>Usado: <strong>${safeToFixed(metrics.usedLength, 0)} mm</strong></span>
      <span>Sobra: <strong>${safeToFixed(metrics.remaining, 0)} mm</strong></span>
    </div>`;
}

function writePrintableReportWindow(reportWindow, title, bodyHtml, page = 'landscape') {
  const pageOrientation = page === 'portrait' ? 'portrait' : 'landscape';
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
    .report-segment-content { width: 100%; min-width: 0; display: grid; gap: 3px; padding: 3px 6px; overflow: hidden; }
    .report-segment-primary, .report-segment-secondary { min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; overflow: hidden; white-space: nowrap; }
    .report-segment-primary { line-height: 1.05; }
    .report-segment-secondary { font-size: .76em; font-weight: 500; line-height: 1; }
    .report-segment-sequence { flex: 0 0 auto; padding: 1px 4px; border: 1px solid currentColor; border-radius: 2px; font-size: .8em; }
    .report-segment-mark { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .report-segment-measure { flex: 0 0 auto; }
    .report-segment-compact .report-segment-pos { display: none; }
    .report-segment-narrow .report-segment-mark, .report-segment-narrow .report-segment-pos { display: none; }
    .report-segment-narrow .report-segment-content { padding-inline: 2px; }
    .report-segment-narrow .report-segment-primary, .report-segment-narrow .report-segment-secondary { gap: 2px; }
    .report-kerf { background: var(--editable) !important; border-left: 1px dashed var(--secondary); border-right: 1px dashed var(--secondary); }
    .report-offcut { background: #d8dee1 !important; color: var(--text); border: 1px solid var(--border); }
    .report-trim { background: #B8C8D0 !important; color: var(--text); }
    .report-monochrome .report-segment:not(.report-kerf):not(.report-offcut):not(.report-trim) { background-color: #fff !important; color: #111827 !important; border: 1px solid #4b5563; }
    .report-grayscale .report-segment-tone-1 { background-color: #f0f0f0 !important; }
    .report-grayscale .report-segment-tone-2 { background-color: #e3e3e3 !important; }
    .report-grayscale .report-segment-tone-3 { background-color: #f7f7f7 !important; }
    /* Sparse hatching distinguishes cuts without covering the page in toner. */
    .report-ink .report-segment-tone-1 { background-image: repeating-linear-gradient(135deg, transparent 0, transparent 11px, #d1d5db 11px, #d1d5db 12px) !important; }
    .report-ink .report-segment-tone-2 { background-image: repeating-linear-gradient(90deg, transparent 0, transparent 13px, #d1d5db 13px, #d1d5db 14px) !important; }
    .report-ink .report-segment-tone-3 { background-image: repeating-linear-gradient(45deg, transparent 0, transparent 15px, #d1d5db 15px, #d1d5db 16px) !important; }
    .report-ink .report-kerf { min-width: 2px; background: #111827 !important; border: 0; }
    .report-monochrome .report-offcut { background: #fff !important; border: 1px dashed #4b5563; }
    .report-monochrome .report-logo-image { filter: grayscale(1); }
    .report-monochrome .cutting-sheet-company,
    .report-monochrome .cutting-sheet-document strong,
    .report-monochrome .cutting-sheet-trace strong,
    .report-monochrome .cutting-sheet-diagram-title,
    .report-monochrome .cutting-sheet-table-title,
    .report-monochrome .report-table th { color: #111827; }
    .report-monochrome .cutting-sheet-header { border-bottom-color: #111827; }
    .report-ink .cutting-sheet-context > div,
    .report-ink .cutting-sheet-material-grid > div,
    .report-ink .cutting-sheet-description,
    .report-ink .report-table th { background: #fff; }
    .report-ink .cutting-sheet-material-grid > div { border-left-color: #374151; }
    .report-ink .cutting-sheet-bar-index { color: #111827; background: #fff; border: 2px solid #111827; }
    .report-ink .cutting-sheet-swatch-piece { background: #fff; border-color: #111827; }
    .report-ink .cutting-sheet-swatch-kerf { background: #111827; border-color: #111827; }
    .report-grayscale .cutting-sheet-bar-index { background: #4b5563; }
    .report-grayscale .cutting-sheet-material-grid > div { border-left-color: #6b7280; }
    .report-grayscale .cutting-sheet-swatch-piece { background: #6b7280; }
    .report-grayscale .cutting-sheet-swatch-kerf { background: #374151; border-color: #374151; }
    .report-bar-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .report-table th, .report-table td { border: 1px solid var(--border); padding: 6px; text-align: left; }
    .report-table th { background: #f2f6f8; color: var(--primary); }
    .part-color-dot { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #d8e1e5; display: inline-block; vertical-align: middle; }
    .report-footer { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
    .signature-box { border: 1px dashed var(--border); min-height: 64px; border-radius: 8px; padding: 8px; color: var(--muted); }
    .signature-image { display: block; max-width: 180px; max-height: 48px; object-fit: contain; margin-bottom: 6px; }
    .cutting-sheet-report { max-width: 1400px; margin: 0 auto; }
    .cutting-sheet-page { min-height: 194mm; display: flex; flex-direction: column; gap: 10px; break-after: page; page-break-after: always; }
    .cutting-sheet-page:last-child { break-after: auto; page-break-after: auto; }
    .cutting-sheet-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; padding-bottom: 9px; border-bottom: 2px solid var(--primary); }
    .cutting-sheet-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .cutting-sheet-brand .report-logo-image { width: 42px; max-height: 42px; }
    .cutting-sheet-company { margin: 0; color: var(--primary); font-size: 17px; line-height: 1.15; }
    .cutting-sheet-project { margin: 3px 0 0; color: var(--secondary); font-size: 11px; font-weight: 700; }
    .cutting-sheet-document { min-width: 245px; text-align: right; }
    .cutting-sheet-document-label { display: block; color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
    .cutting-sheet-document strong { display: block; margin-top: 2px; color: var(--primary); font-size: 18px; }
    .cutting-sheet-document small { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; }
    .cutting-sheet-context { display: grid; grid-template-columns: 1.25fr 1.25fr 1fr 1fr 1fr; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .cutting-sheet-context > div { min-width: 0; padding: 6px 8px; border-right: 1px solid var(--border); background: #f8fbfc; }
    .cutting-sheet-context > div:last-child { border-right: 0; }
    .cutting-sheet-field-label { display: block; margin-bottom: 2px; color: var(--muted); font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .cutting-sheet-field-value { display: block; overflow: hidden; color: var(--text); font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .cutting-sheet-bar { flex: 1; display: flex; flex-direction: column; gap: 9px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #fff; }
    .cutting-sheet-bar-heading { display: grid; grid-template-columns: auto minmax(250px, 1fr) auto; align-items: center; gap: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .cutting-sheet-bar-index { min-width: 92px; padding: 7px 10px; border-radius: 6px; color: #fff; background: var(--primary); text-align: center; }
    .cutting-sheet-bar-index span { display: block; font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .cutting-sheet-bar-index strong { display: block; margin-top: 1px; font-size: 19px; line-height: 1; }
    .cutting-sheet-trace strong { display: block; color: var(--primary); font-size: 16px; letter-spacing: .02em; }
    .cutting-sheet-po-item { color: var(--muted); font-size: 11px; text-align: right; }
    .cutting-sheet-po-item strong { color: var(--text); font-size: 13px; }
    .cutting-sheet-material-grid { display: grid; grid-template-columns: 1.25fr .85fr .8fr .8fr .8fr .8fr; gap: 6px; }
    .cutting-sheet-material-grid > div { min-width: 0; padding: 6px 8px; border-left: 3px solid var(--secondary); background: #f4f7f8; }
    .cutting-sheet-description { margin: 0; padding: 7px 9px; border: 1px solid var(--border); border-radius: 5px; color: #374151; background: #fbfcfd; font-size: 9px; line-height: 1.35; }
    .cutting-sheet-description strong { color: var(--primary); }
    .cutting-sheet-diagram-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: -3px; color: var(--primary); font-size: 10px; font-weight: 700; }
    .cutting-sheet-diagram-title span { color: var(--muted); font-size: 8px; font-weight: 400; }
    .cutting-sheet-bar .report-bar-track { height: 48px; margin-bottom: 4px; border-radius: 5px; }
    .cutting-sheet-bar .report-bar-meta { margin-bottom: 0; font-size: 10px; }
    .cutting-sheet-legend { display: flex; align-items: center; justify-content: flex-end; gap: 12px; color: var(--muted); font-size: 8px; }
    .cutting-sheet-legend span { display: inline-flex; align-items: center; gap: 4px; }
    .cutting-sheet-swatch { width: 13px; height: 7px; border: 1px solid var(--border); display: inline-block; }
    .cutting-sheet-swatch-piece { background: var(--primary); }
    .cutting-sheet-swatch-kerf { background: var(--editable); }
    .cutting-sheet-swatch-offcut { background: #d8dee1; }
    .cutting-sheet-table-title { margin: 1px 0 -4px; color: var(--primary); font-size: 10px; font-weight: 700; }
    .cutting-sheet-bar .report-table { font-size: 9px; table-layout: fixed; }
    .cutting-sheet-bar .report-table th, .cutting-sheet-bar .report-table td { padding: 5px; overflow-wrap: anywhere; }
    .cutting-sheet-bar .report-table th:nth-child(1), .cutting-sheet-bar .report-table td:nth-child(1),
    .cutting-sheet-bar .report-table th:nth-child(8), .cutting-sheet-bar .report-table td:nth-child(8),
    .cutting-sheet-bar .report-table th:nth-child(9), .cutting-sheet-bar .report-table td:nth-child(9) { width: 6%; text-align: center; }
    .cutting-sheet-bar .report-table th:nth-child(2) { width: 19%; }
    .cutting-sheet-bar .report-table th:nth-child(3) { width: 18%; }
    .cutting-sheet-bar .report-table th:nth-child(4) { width: 8%; }
    .cutting-sheet-bar .report-table th:nth-child(5) { width: 12%; }
    .cutting-sheet-bar .report-table th:nth-child(6), .cutting-sheet-bar .report-table th:nth-child(7) { width: 12%; }
    .cutting-sheet-page-footer { display: flex; justify-content: space-between; gap: 12px; padding-top: 6px; border-top: 1px solid var(--border); color: var(--muted); font-size: 8px; }
    .cutting-sheet-page .signature-grid { margin-top: auto; }
    @media print {
      body { padding: 0; }
      .report-page { max-width: none; }
      .cutting-sheet-report { max-width: none; }
      @page { size: A4 ${pageOrientation}; margin: 8mm; }
    }
  </style>
</head>
<body>${bodyHtml}
  <script>
    const waitForImage = (image) => {
      if (image.complete) return typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    };
    const printWhenReady = async () => {
      try { if (document.fonts?.ready) await document.fonts.ready; } catch (error) { console.warn('Cutting report could not wait for fonts.', error); }
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
  const header = normalizeReportHeader(settings.reportHeader || {});
  const companyName = header.companyName || DEFAULT_REPORT_HEADER.companyName;
  const cuttingPlanTitle = header.documentTitles.cuttingPlan || title;
  const headerSubtitle = header.subtitle || projectData.project || subtitle;
  const logoUrl = header.logoUrl || DEFAULT_REPORT_HEADER.logoUrl;
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
            <h2>${escapeHtml(cuttingPlanTitle)}</h2>
            <p>${escapeHtml(title)}</p>
          </div>
        </div>
        <div class="report-meta">
          <div><strong>Projeto:</strong> ${escapeHtml(projectData.project || '-')}</div>
          <div><strong>Cliente:</strong> ${escapeHtml(projectData.client || '-')}</div>
          <div><strong>Equipamento:</strong> ${escapeHtml(projectData.equipment || '-')}</div>
          <div><strong>Workpack:</strong> ${escapeHtml(operationalWorkpackValue(projectData.workpack) || '-')}</div>
          ${projectData.cuttingSheetNumber ? `<div><strong>Cutting Sheet:</strong> ${escapeHtml(projectData.cuttingSheetNumber)}</div>` : ''}
          ${projectData.materialCouponNumber ? `<div><strong>Material Coupon:</strong> ${escapeHtml(projectData.materialCouponNumber)}</div>` : ''}
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
        <div><strong>Item:</strong> ${escapeHtml(cuttingSheetBarPoItem(bar) || 'N/A')}</div>
        <div><strong>Material:</strong> ${escapeHtml(bar.materialGrade || 'N/A')}</div>
        <div><strong>Heat:</strong> ${escapeHtml(bar.heatNo || 'N/A')}</div>
        <div><strong>Trace:</strong> ${escapeHtml(bar.traceability || 'N/A')}</div>
      </div>
      ${renderBarDiagram(bar, solution, colorMap, reportOptions)}
    </section>`).join('');
}

function buildPiecesRows(pieces, colorMap, includeBar = '', includeColor = Boolean(colorMap)) {
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
        <td>${escapeHtml(safeToFixed(pieceNominalLengthMm(piece), 0))}</td>
        <td>${piece.hasSobremetal === true ? escapeHtml(safeToFixed(piece.sobremetalMm, 0)) : '-'}</td>
        <td>${escapeHtml(piece.priority || '-')}</td>
        ${includeColor && color ? `<td><span class="part-color-dot" style="background:${color};"></span></td>` : ''}
      </tr>`;
  }).join('');
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
        <thead><tr><th>Barra</th><th>Seq.</th><th>DWG</th><th>Mark</th><th>POS</th><th>Material</th><th>Comp.</th><th>Sobremetal [mm]</th><th>Prioridade</th><th>Cor</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10">Nenhuma peca alocada.</td></tr>'}</tbody>
      </table>
    </section>
    ${options.includeSignatures ? reportSignatureSection(profile, projectData.observations) : ''}
    </div>`;
  return writePrintableReportWindow(reportWindow, 'Relatorio Tabular PDF', html, 'landscape');
}

function buildCuttingSheetPageHeader({ projectData, settings, solution, pageNumber, pageCount }) {
  const header = normalizeReportHeader(settings.reportHeader || {});
  const companyName = header.companyName || DEFAULT_REPORT_HEADER.companyName;
  const documentTitle = header.documentTitles.cuttingPlan || 'Cutting Plan Report';
  const project = reportValue(projectData.project);
  const cuttingSheetNumber = reportValue(projectData.cuttingSheetNumber, 'Ficha de Corte');
  const logoUrl = header.logoUrl || DEFAULT_REPORT_HEADER.logoUrl;

  return `
    <header class="cutting-sheet-header">
      <div class="cutting-sheet-brand">
        <img class="report-logo-image" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}">
        <div>
          <h1 class="cutting-sheet-company">${escapeHtml(companyName)}</h1>
          <p class="cutting-sheet-project">${escapeHtml(project)}</p>
        </div>
      </div>
      <div class="cutting-sheet-document">
        <span class="cutting-sheet-document-label">Ficha de Corte</span>
        <strong>${escapeHtml(cuttingSheetNumber)}</strong>
        <small>${escapeHtml(documentTitle)} · Barra ${pageNumber} de ${pageCount}</small>
      </div>
    </header>
    <div class="cutting-sheet-context">
      <div><span class="cutting-sheet-field-label">Projeto</span><span class="cutting-sheet-field-value">${escapeHtml(project)}</span></div>
      <div><span class="cutting-sheet-field-label">Cliente</span><span class="cutting-sheet-field-value">${escapeHtml(reportValue(projectData.client))}</span></div>
      <div><span class="cutting-sheet-field-label">Equipamento</span><span class="cutting-sheet-field-value">${escapeHtml(reportValue(projectData.equipment))}</span></div>
      <div><span class="cutting-sheet-field-label">Workpack</span><span class="cutting-sheet-field-value">${escapeHtml(reportValue(operationalWorkpackValue(projectData.workpack)))}</span></div>
      <div><span class="cutting-sheet-field-label">Parâmetros</span><span class="cutting-sheet-field-value">Kerf ${escapeHtml(safeToFixed(settings.kerf ?? solution.kerf ?? 0, 0))} mm · Retalho ${escapeHtml(safeToFixed(settings.minOffcut ?? solution.minOffcut ?? 0, 0))} mm</span></div>
    </div>`;
}

export function buildCuttingSheetReportBody({ solution, projectData = {}, settings = {}, reportOptions = {}, profile = {} } = {}) {
  if (!solution) return '';
  const options = getReportOptions({ reportOptions });
  const allPlacedPieces = (solution.stockUsed || []).flatMap((bar) => bar.pieces || []);
  const colorMap = buildPieceColorMap(allPlacedPieces);
  const reportClass = reportColorClass(options);
  const bars = solution.stockUsed || [];
  const sheets = bars.map((bar, index) => {
    const metrics = getBarMetrics(bar);
    const pageNumber = index + 1;
    const isLastPage = pageNumber === bars.length;
    const barLabel = String(pageNumber).padStart(2, '0');
    const po = reportValue(bar.po, 'N/A');
    const item = reportValue(cuttingSheetBarPoItem(bar), 'N/A');
    const traceability = reportValue(bar.traceability, 'N/A');
    return `
      <article class="cutting-sheet-page">
        ${buildCuttingSheetPageHeader({ projectData, settings, solution, pageNumber, pageCount: bars.length })}
        <section class="cutting-sheet-bar">
          <div class="cutting-sheet-bar-heading">
            <div class="cutting-sheet-bar-index"><span>Barra</span><strong>${barLabel}</strong></div>
            <div class="cutting-sheet-trace">
              <span class="cutting-sheet-field-label">Rastreabilidade do material</span>
              <strong>${escapeHtml(traceability)}</strong>
            </div>
            <div class="cutting-sheet-po-item">PO <strong>${escapeHtml(po)}</strong> · Item <strong>${escapeHtml(item)}</strong></div>
          </div>
          <div class="cutting-sheet-material-grid">
            <div><span class="cutting-sheet-field-label">Material</span><span class="cutting-sheet-field-value">${escapeHtml(reportValue(bar.materialGrade, 'N/A'))}</span></div>
            <div><span class="cutting-sheet-field-label">Heat</span><span class="cutting-sheet-field-value">${escapeHtml(reportValue(bar.heatNo, 'N/A'))}</span></div>
            <div><span class="cutting-sheet-field-label">Comprimento</span><span class="cutting-sheet-field-value">${escapeHtml(safeToFixed(metrics.originalLength, 0))} mm</span></div>
            <div><span class="cutting-sheet-field-label">Usado</span><span class="cutting-sheet-field-value">${escapeHtml(safeToFixed(metrics.usedLength, 0))} mm</span></div>
            <div><span class="cutting-sheet-field-label">Sobra</span><span class="cutting-sheet-field-value">${escapeHtml(safeToFixed(metrics.remaining, 0))} mm</span></div>
            <div><span class="cutting-sheet-field-label">Aproveitamento</span><span class="cutting-sheet-field-value">${escapeHtml(safeToFixed(metrics.utilization, 1))}%</span></div>
          </div>
          <p class="cutting-sheet-description"><strong>Descrição técnica:</strong> ${escapeHtml(reportValue(bar.description))}</p>
          <div class="cutting-sheet-diagram-title">Sequência de corte <span>Representação proporcional ao comprimento da barra</span></div>
          ${renderBarDiagram(bar, solution, colorMap, options)}
          <div class="cutting-sheet-legend">
            <span><i class="cutting-sheet-swatch cutting-sheet-swatch-piece"></i>Peças</span>
            <span><i class="cutting-sheet-swatch cutting-sheet-swatch-kerf"></i>Kerf</span>
            <span><i class="cutting-sheet-swatch cutting-sheet-swatch-offcut"></i>Sobra / retalho</span>
          </div>
          <div class="cutting-sheet-table-title">Lista de peças — executar na sequência indicada</div>
          <table class="report-table">
            <thead><tr><th>Seq.</th><th>Desenho</th><th>Marca</th><th>POS</th><th>Material</th><th>Comprimento [mm]</th><th>Sobremetal [mm]</th><th>Prioridade</th>${options.colorMode === 'color' ? '<th>Cor</th>' : ''}</tr></thead>
            <tbody>${buildPiecesRows((bar.pieces || []).map((piece) => ({ piece })), colorMap, '', options.colorMode === 'color') || `<tr><td colspan="${options.colorMode === 'color' ? 9 : 8}">Nenhuma peça.</td></tr>`}</tbody>
          </table>
          ${options.includeSignatures && isLastPage ? `<div class="signature-grid">
            ${signatureBox('Responsável pela emissão', profile)}
            ${signatureBox('Produção')}
            <div><strong>Observações</strong><div class="signature-box">${escapeHtml(projectData.observations || '')}</div></div>
          </div>` : ''}
        </section>
        <footer class="cutting-sheet-page-footer">
          <span>Documento operacional — confirmar rastreabilidade e medidas antes do corte.</span>
          <strong>${escapeHtml(reportValue(projectData.cuttingSheetNumber, 'Ficha de Corte'))} · Barra ${barLabel}/${String(bars.length).padStart(2, '0')}</strong>
        </footer>
      </article>`;
  }).join('');

  return `<div class="cutting-sheet-report ${reportClass}">${sheets || '<section class="report-block">Nenhuma barra utilizada.</section>'}</div>`;
}

export async function openCuttingSheetPdfReport({ solution, projectData = {}, settings = {}, reportOptions = {} }) {
  if (!solution) return false;
  const reportWindow = openPrintableReportShell('Ficha de Corte PDF');
  if (!reportWindow) return false;
  const profile = await getProfile();
  const html = buildCuttingSheetReportBody({ solution, projectData, settings, reportOptions, profile });
  return writePrintableReportWindow(reportWindow, 'Ficha de Corte PDF', html, 'landscape');
}
