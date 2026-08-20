import { cuttingSheetBarPoItem } from '../core/cuttingSheetPresentation.js';
import { operationalWorkpackValue } from '../core/workpackRelations.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function first(...values) {
  return values.find((value) => text(value)) ?? '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLength(value) {
  return `${Math.round(number(value))} mm`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString('pt-BR');
}

function barReference(bar, index) {
  return text(first(bar.barNumber, bar.barNo, bar.number, index + 1));
}

export const PIMACO_LABEL_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'a4-a4250', code: 'A4050 / A4250 / A4350', name: 'Pimaco A4 — 10 etiquetas', paper: 'A4', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 99, labelHeightMm: 55.8, pitchWidthMm: 101.6, columns: 2, rows: 5, marginLeftMm: 4.7, marginTopMm: 9, density: 'standard', recommended: true }),
  Object.freeze({ id: 'a4-a4365', code: 'A4265 / A4365', name: 'Pimaco A4 — 8 etiquetas', paper: 'A4', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 99, labelHeightMm: 67.7, pitchWidthMm: 101.6, columns: 2, rows: 4, marginLeftMm: 4.7, marginTopMm: 13, density: 'standard' }),
  Object.freeze({ id: 'a4-a4256', code: 'A4056 / A4256 / A4356', name: 'Pimaco A4 — 33 etiquetas', paper: 'A4', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 63.5, labelHeightMm: 25.4, pitchWidthMm: 66.1, columns: 3, rows: 11, marginLeftMm: 7.2, marginTopMm: 8.8, density: 'compact' }),
  Object.freeze({ id: 'letter-6183', code: '6083 / 6183 / 6283', name: 'Pimaco Carta — 10 etiquetas', paper: 'Letter', pageWidthMm: 215.9, pageHeightMm: 279.4, labelWidthMm: 101.6, labelHeightMm: 50.8, pitchWidthMm: 106.8, columns: 2, rows: 5, marginLeftMm: 4, marginTopMm: 12.7, density: 'standard', recommended: true }),
  Object.freeze({ id: 'letter-6184', code: '6084 / 6184 / 6284', name: 'Pimaco Carta — 6 etiquetas', paper: 'Letter', pageWidthMm: 215.9, pageHeightMm: 279.4, labelWidthMm: 101.6, labelHeightMm: 84.67, pitchWidthMm: 106.8, columns: 2, rows: 3, marginLeftMm: 4, marginTopMm: 12.7, density: 'standard' }),
  Object.freeze({ id: 'letter-6181', code: '6081 / 6181 / 6281 / 62581', name: 'Pimaco Carta — 20 etiquetas', paper: 'Letter', pageWidthMm: 215.9, pageHeightMm: 279.4, labelWidthMm: 101.6, labelHeightMm: 25.4, pitchWidthMm: 106.8, columns: 2, rows: 10, marginLeftMm: 4, marginTopMm: 12.7, density: 'compact' }),
  Object.freeze({ id: 'letter-6180', code: '6080 / 6180 / 6280 / 62580', name: 'Pimaco Carta — 30 etiquetas', paper: 'Letter', pageWidthMm: 215.9, pageHeightMm: 279.4, labelWidthMm: 66.7, labelHeightMm: 25.4, pitchWidthMm: 69.8, columns: 3, rows: 10, marginLeftMm: 4.8, marginTopMm: 12.7, density: 'compact' }),
]);

export function getPimacoLabelTemplate(templateId) {
  return PIMACO_LABEL_TEMPLATES.find((template) => template.id === templateId) || PIMACO_LABEL_TEMPLATES[0];
}

function labelFromPiece(piece, bar, barIndex, pieceIndex, projectData, generatedAt) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || bar;
  return {
    id: `${String(barIndex + 1).padStart(2, '0')}-${String(pieceIndex + 1).padStart(2, '0')}`,
    project: text(first(projectData.project, projectData.projectName)),
    equipment: text(projectData.equipment),
    workpack: operationalWorkpackValue(projectData.workpack),
    cuttingSheet: text(first(projectData.cuttingSheetNumber, projectData.cuttingSheetNo)),
    drawing: text(first(piece.drawingRef, piece.drawing, piece.dwgNumber)),
    mark: text(piece.mark),
    pos: text(first(piece.pos, piece.position)),
    material: text(first(piece.material, piece.materialGrade, piece.grade, stock.materialGrade, bar.materialGrade)),
    cutLength: number(first(piece.cutLength, piece.cutLengthMm, piece.length, piece.lengthMm)),
    bar: barReference(bar, barIndex),
    traceability: text(first(stock.traceability, stock.trace, stock.traceNo, bar.traceability, bar.trace, bar.traceNo)),
    heat: text(first(stock.heatNo, stock.heatNumber, bar.heatNo, bar.heatNumber)),
    po: text(first(stock.po, stock.purchaseOrder, bar.po, bar.purchaseOrder)),
    poItem: cuttingSheetBarPoItem(bar),
    generatedAt,
  };
}

export function buildPhysicalPieceLabels(solution = {}, projectData = {}, options = {}) {
  const generatedAt = text(options.generatedAt) || new Date().toISOString();
  const template = getPimacoLabelTemplate(options.templateId);
  const labels = [];
  (solution.stockUsed || []).forEach((bar, barIndex) => {
    (bar.pieces || []).forEach((piece, pieceIndex) => {
      labels.push(labelFromPiece(piece, bar, barIndex, pieceIndex, projectData, generatedAt));
    });
  });
  return {
    title: 'Etiquetas de Peças Cortadas',
    generatedAt,
    template,
    labels,
    summary: { labelCount: labels.length, barCount: (solution.stockUsed || []).filter((bar) => (bar.pieces || []).length).length },
    warnings: labels.length ? [] : ['Nenhuma peça alocada para gerar etiquetas.'],
  };
}

function field(label, value, wide = false) {
  return `<div class="piece-label-field${wide ? ' piece-label-field-wide' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(text(value) || '—')}</strong></div>`;
}

function renderCompactLabel(label) {
  return `<article class="piece-label piece-label-compact">
    <header class="piece-label-header"><div><span>PEÇA CORTADA</span><strong>${escapeHtml(label.project || 'Projeto não informado')}</strong></div><b>${escapeHtml(label.id)}</b></header>
    <div class="piece-label-compact-main"><div><span>MARK / POS</span><strong>${escapeHtml(label.mark || '—')} / ${escapeHtml(label.pos || '—')}</strong></div><b>${escapeHtml(formatLength(label.cutLength))}</b></div>
    <div class="piece-label-compact-meta"><span>${escapeHtml(label.drawing || '—')} · ${escapeHtml(label.material || '—')}</span><strong>${escapeHtml(label.traceability || 'SEM TRACE')}</strong></div>
  </article>`;
}

function renderLabel(label, template) {
  if (template.density === 'compact') return renderCompactLabel(label);
  const heightClass = template.labelHeightMm <= 56 ? ' piece-label-tight' : '';
  const poReference = [label.po, label.poItem].filter(Boolean).join(' / ');
  return `<article class="piece-label${heightClass}">
    <header class="piece-label-header">
      <div><span>PEÇA CORTADA</span><strong>${escapeHtml(label.project || 'Projeto não informado')}</strong></div>
      <b>${escapeHtml(label.id)}</b>
    </header>
    <div class="piece-label-primary">
      <div><span>MARK</span><strong>${escapeHtml(label.mark || '—')}</strong></div>
      <div><span>POS</span><strong>${escapeHtml(label.pos || '—')}</strong></div>
      <div class="piece-label-length"><span>COMPRIMENTO</span><strong>${escapeHtml(formatLength(label.cutLength))}</strong></div>
    </div>
    <div class="piece-label-grid">
      ${field('Drawing', label.drawing, true)}
      ${field('Material', label.material, true)}
      ${field('Equipamento', label.equipment)}
      ${field('Workpack', label.workpack)}
      ${field('Barra', label.bar)}
      ${field('Heat', label.heat)}
      ${field('PO / Item', poReference)}
      ${field('Cutting Sheet', label.cuttingSheet)}
    </div>
    <footer class="piece-label-footer">
      <div><span>RASTREABILIDADE DA MATÉRIA-PRIMA</span><strong>${escapeHtml(label.traceability || 'NÃO INFORMADA')}</strong></div>
      <time>${escapeHtml(formatDate(label.generatedAt))}</time>
    </footer>
  </article>`;
}

export function buildPhysicalPieceLabelsHtml(documentData = {}) {
  const labels = Array.isArray(documentData.labels) ? documentData.labels : [];
  const template = getPimacoLabelTemplate(documentData.template?.id);
  const perSheet = template.columns * template.rows;
  const sheets = [];
  for (let index = 0; index < labels.length; index += perSheet) sheets.push(labels.slice(index, index + perSheet));
  const pageSize = template.paper === 'Letter' ? 'Letter' : 'A4';
  const columnGapMm = Math.round(Math.max(0, template.pitchWidthMm - template.labelWidthMm) * 1000) / 1000;
  const sheetStyle = `width:${template.pageWidthMm}mm;height:${template.pageHeightMm}mm;padding:${template.marginTopMm}mm 0 0 ${template.marginLeftMm}mm;grid-template-columns:repeat(${template.columns},${template.labelWidthMm}mm);grid-template-rows:repeat(${template.rows},${template.labelHeightMm}mm);column-gap:${columnGapMm}mm;`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(documentData.title || 'Etiquetas de Peças')}</title>
  <style>
    *{box-sizing:border-box} body{margin:0;background:#fff;color:#172b34;font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif}
    .piece-label-sheet{display:grid;gap:0;align-content:start;justify-content:start;overflow:hidden;break-after:page;page-break-after:always}.piece-label-sheet:last-child{break-after:auto;page-break-after:auto}
    .piece-label{margin:1.2mm;border:.35mm solid #22505f;overflow:hidden;display:flex;flex-direction:column;break-inside:avoid;page-break-inside:avoid;background:#fff}
    .piece-label-header{min-height:9mm;padding:1.3mm 2.2mm;background:#22505f;color:#fff;display:flex;justify-content:space-between;align-items:center}
    .piece-label-header div{display:flex;flex-direction:column;min-width:0}.piece-label-header span{font-size:6.5pt;letter-spacing:.12em}.piece-label-header strong{font-size:10pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.piece-label-header b{font-size:10pt;border:1px solid rgba(255,255,255,.55);padding:1mm 1.5mm;border-radius:1mm}
    .piece-label-primary{display:grid;grid-template-columns:1fr 1fr 1.45fr;border-bottom:1px solid #9fb2b9}.piece-label-primary>div{padding:1.2mm 1.8mm;border-right:1px solid #c8d3d7;display:flex;flex-direction:column}.piece-label-primary>div:last-child{border-right:0}.piece-label-primary span,.piece-label-field span,.piece-label-footer span{font-size:5.8pt;color:#607681;text-transform:uppercase;letter-spacing:.07em}.piece-label-primary strong{font-size:14pt;line-height:1.05}.piece-label-length strong{color:#8b2c2c;font-size:14pt}
    .piece-label-grid{display:grid;grid-template-columns:repeat(2,1fr);flex:1;min-height:0}.piece-label-field{min-width:0;padding:1.1mm 2.2mm;border-right:1px solid #dce3e6;border-bottom:1px solid #dce3e6;display:flex;flex-direction:column}.piece-label-field:nth-child(even){border-right:0}.piece-label-field-wide{grid-column:1/-1;border-right:0}.piece-label-field strong{font-size:8pt;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .piece-label-footer{min-height:7mm;padding:.8mm 1.6mm;display:flex;align-items:center;justify-content:space-between;background:#edf3f5}.piece-label-footer div{display:flex;flex-direction:column;min-width:0}.piece-label-footer strong{font-family:ui-monospace,"Cascadia Mono",monospace;font-size:7.8pt;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.piece-label-footer time{font-size:6pt;color:#607681;margin-left:2mm}
    .piece-label-tight .piece-label-header{min-height:7.4mm;padding:.7mm 1.6mm}.piece-label-tight .piece-label-header span{font-size:5pt}.piece-label-tight .piece-label-header strong{font-size:8.5pt}.piece-label-tight .piece-label-header b{font-size:8pt;padding:.6mm 1mm}.piece-label-tight .piece-label-primary>div{padding:.65mm 1.4mm}.piece-label-tight .piece-label-primary span{font-size:4.8pt}.piece-label-tight .piece-label-primary strong{font-size:12pt}.piece-label-tight .piece-label-length strong{font-size:12pt}.piece-label-tight .piece-label-grid{grid-template-rows:repeat(5,minmax(0,1fr))}.piece-label-tight .piece-label-field{min-height:0;padding:.25mm 1.5mm;justify-content:center}.piece-label-tight .piece-label-field span{font-size:4.4pt;line-height:1}.piece-label-tight .piece-label-field strong{font-size:6.8pt;line-height:1.05}.piece-label-tight .piece-label-footer{min-height:5.8mm;padding:.35mm 1.4mm}.piece-label-tight .piece-label-footer span{font-size:4.3pt}.piece-label-tight .piece-label-footer strong{font-size:6.4pt}.piece-label-tight .piece-label-footer time{font-size:4.8pt}
    .piece-label-compact{margin:.7mm;padding:0}.piece-label-compact .piece-label-header{min-height:6mm;padding:.7mm 1.3mm}.piece-label-compact .piece-label-header span{font-size:4.8pt}.piece-label-compact .piece-label-header strong{font-size:6.3pt}.piece-label-compact .piece-label-header b{font-size:6.3pt;padding:.4mm .8mm}.piece-label-compact-main{display:flex;align-items:center;justify-content:space-between;padding:.6mm 1.3mm 0}.piece-label-compact-main div{display:flex;flex-direction:column;min-width:0}.piece-label-compact-main span{font-size:4.8pt;color:#607681;letter-spacing:.07em}.piece-label-compact-main strong{font-size:11.5pt;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.piece-label-compact-main b{font-size:11pt;color:#8b2c2c;white-space:nowrap;margin-left:1mm}.piece-label-compact-meta{display:flex;flex-direction:column;padding:0 1.3mm;min-width:0}.piece-label-compact-meta span{font-size:5.4pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.piece-label-compact-meta strong{font-family:ui-monospace,"Cascadia Mono",monospace;font-size:6.4pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @page{size:${pageSize} portrait;margin:0}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body>${sheets.map((sheet) => `<main class="piece-label-sheet" style="${sheetStyle}">${sheet.map((label) => renderLabel(label, template)).join('')}</main>`).join('')}</body></html>`;
}

export function openPhysicalPieceLabelsReport(reportData = {}) {
  const documentData = buildPhysicalPieceLabels(reportData.solution, reportData.projectData, reportData.options);
  if (!documentData.labels.length) return null;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;
  printWindow.addEventListener('load', async () => {
    try {
      if (printWindow.document.fonts?.ready) await printWindow.document.fonts.ready;
    } catch (error) {
      console.warn('Physical labels could not wait for document fonts.', error);
    }
    await Promise.all([...printWindow.document.images].map((image) => {
      if (image.complete) return typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
    await new Promise((resolve) => printWindow.requestAnimationFrame(resolve));
    await new Promise((resolve) => printWindow.requestAnimationFrame(resolve));
    if (printWindow.closed) return;
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  printWindow.document.open();
  printWindow.document.write(buildPhysicalPieceLabelsHtml(documentData));
  printWindow.document.close();
  return printWindow;
}
