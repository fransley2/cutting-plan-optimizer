import { buildMaterialCouponDocument } from '../documents/materialCoupon.js';
import { DEFAULT_REPORT_HEADER, normalizeReportHeader } from '../data/appSettings.js';
import { getActiveUser } from '../data/userSession.js';
import { getUser } from '../data/users.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cell(value) {
  // Adicionado alinhamento vertical no topo para textos longos não ficarem flutuando
  return `<td>${escapeHtml(value)}</td>`;
}

export const MATERIAL_COUPON_REPORT_COLUMNS = Object.freeze([
  ['serialNumber','S/N.',3],['sapCode','SAP Code',6],['itemType','Item Category',6],['materialDescription','Material Description',20],
  ['qty','Qty',3],['unit','Un.',3],['diaMm','Dia [mm]',4],['thicknessMm','Thickness [mm]',5],['widthMm','Width [mm]',4],
  ['lengthMm','Length [mm]',4],['weightKg','Weight [Kg]',4],['materialGrade','Mat. Grade',6],['traceability','Traceability',8],
  ['heatNo','Heat No.',6],['mir','MIR',4],['equipment','Equipment',4],['poItem','PO ITEM',4],['nfArrival','NF arrival',4],['notes','Notes',6],
].map(([key,label,width]) => Object.freeze({ key, label, width })));

export function resolveMaterialCouponReportColumns(coupon = {}, documentData = {}, options = {}) {
  const layout = Array.isArray(coupon.reportColumnLayout) ? coupon.reportColumnLayout : Array.isArray(options.reportColumnLayout) ? options.reportColumnLayout : [];
  const overrides = new Map(layout.map((item) => [item.key, item]));
  const widthHasValues = (documentData.rows || []).some((row) => String(row.widthMm ?? '').trim() && Number(row.widthMm) !== 0);
  const columns = MATERIAL_COUPON_REPORT_COLUMNS.map((column) => {
    const override = overrides.get(column.key) || {};
    return { ...column, visible: override.visible == null ? column.key !== 'widthMm' || widthHasValues : override.visible !== false, width: Math.max(1, Number(override.width) || column.width) };
  }).filter((column) => column.visible);
  const total = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  return columns.map((column) => ({ ...column, normalizedWidth: `${(column.width / total * 100).toFixed(3)}%` }));
}

function resolveReportHeader(options = {}) {
  return normalizeReportHeader(options.reportHeader || options.settings?.reportHeader || {});
}

function logoHtml(reportHeader) {
  if (!reportHeader.logoUrl) {
    return `<strong>${escapeHtml(reportHeader.companyName || 'SAIPEM')}</strong>`;
  }

  return `<img class="mc-report-logo-image" src="${escapeHtml(reportHeader.logoUrl)}" alt="${escapeHtml(reportHeader.companyName || 'SAIPEM')}">`;
}

function rowsHtml(rows, columns) {
  if (!rows.length) {
    return `<tr><td colspan="${columns.length}" class="empty-row">No material lines.</td></tr>`;
  }
  return rows.map((row) => `<tr>${columns.map((column) => cell(row[column.key])).join('')}</tr>`).join('');
}

// Cada campo do cabeçalho (PROJECT, CLIENT, SCOPE...) mostra o rótulo em
// cima e o valor embaixo, sem borda própria - a borda (quando existir) fica
// por conta do container .mc-info-row.
// `span` é quantas colunas de um grid de 12 esse campo ocupa.
function infoFieldHtml(label, value, span) {
  return `
    <div class="mc-info-field" style="grid-column: span ${span};">
      <div class="mc-info-label">${escapeHtml(label)}</div>
      <div class="mc-info-value">${escapeHtml(value)}</div>
    </div>`;
}

// Assinaturas seguem o layout SIGNATURE / NAME / COMPANY / DATE.
// `data` é o objeto vindo de metadata.issuing / metadata.dispatch / metadata.receiving
// e precisa ter o formato { name, company, date }.
function signatureHtml(title, subtitle, data = {}) {
  const { name = '', company = '', date = '', signatureImage = '' } = data;
  const signatureImageHtml = signatureImage
    ? `<img class="mc-report-signature-image" src="${escapeHtml(signatureImage)}" alt="Assinatura de ${escapeHtml(name)}">`
    : '';
  return `
    <div class="mc-report-signature">
      <div class="mc-report-signature-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <div class="mc-report-signature-row signature-line">
        <span class="label">SIGNATURE:</span>
        ${signatureImageHtml}
      </div>
      <div class="mc-report-signature-row">
        <span class="label">NAME:</span>
        <span class="value">${escapeHtml(name)}</span>
      </div>
      <div class="mc-report-signature-row">
        <span class="label">COMPANY:</span>
        <span class="value">${escapeHtml(company)}</span>
      </div>
      <div class="mc-report-signature-row">
        <span class="label">DATE:</span>
        <span class="value">${escapeHtml(date)}</span>
      </div>
    </div>`;
}

function formatPageNumber(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(2, '0');
}

function headerHtml({ reportHeader, materialCouponTitle, metadata, pageIndex = 1, totalPages = 1 }) {
  return `
    <header class="mc-report-header">
      <div class="mc-report-logo">${logoHtml(reportHeader)}</div>
      <div class="mc-report-title">
        <span class="mc-title-form">FORM</span>
        <span class="mc-title-company">${escapeHtml(reportHeader.companyName)}</span>
        <span class="mc-title-doc">${escapeHtml(materialCouponTitle)}</span>
      </div>
      <div class="mc-report-meta">
        <table>
          <colgroup><col class="mc-meta-label"><col><col class="mc-meta-label-wide"><col></colgroup>
          <tbody>
            <tr><th>Doc. Nº</th><td colspan="3">${escapeHtml(metadata.docNumber)}</td></tr>
            <tr class="mc-report-meta-paired"><th>Rev.</th><td>${escapeHtml(metadata.docRevision || metadata.mcRevision)}</td><th>Doc. Rev. Date</th><td>${escapeHtml(metadata.docRevisionDate)}</td></tr>
            <tr><th>Doc. Ref.</th><td colspan="3">${escapeHtml(metadata.docReference)}</td></tr>
            <tr><th>Page</th><td colspan="3" data-mc-page>${formatPageNumber(pageIndex)} of ${formatPageNumber(totalPages)}</td></tr>
          </tbody>
        </table>
      </div>
    </header>`;
}

function infoSectionHtml(metadata) {
  const workpack = operationalWorkpackValue(metadata.workpack);
  const infoRow1 = [
    infoFieldHtml('PROJECT', metadata.project, 5),
    infoFieldHtml('CLIENT', metadata.client, 3),
    infoFieldHtml('SCOPE', metadata.scope, 4),
  ].join('');
  const infoRow2 = [
    infoFieldHtml('MATERIAL COUPON Nº', metadata.mcCode, 3),
    infoFieldHtml('DATE', metadata.mcDate, 2),
    infoFieldHtml('WORKPACK', workpack, 3),
    infoFieldHtml('DESTINATION', metadata.materialDestination, 4),
  ].join('');

  return `
    <section class="mc-report-info">
      <div class="mc-info-row">${infoRow1}</div>
      <div class="mc-info-row mc-info-row--boxed">${infoRow2}</div>
    </section>`;
}

function dimensionsHeaderHtml(columns) {
  const dimensions = new Set(['diaMm', 'thicknessMm', 'widthMm', 'lengthMm', 'weightKg']);
  const first = columns.findIndex((column) => dimensions.has(column.key));
  const count = columns.filter((column) => dimensions.has(column.key)).length;
  const after = Math.max(0, columns.length - Math.max(0, first) - count);
  return `${first > 0 ? `<th colspan="${first}" class="mc-header-spacer"></th>` : ''}${count ? `<th colspan="${count}" class="mc-dimensions-caption">DIMENSIONS</th>` : ''}${after ? `<th colspan="${after}" class="mc-header-spacer"></th>` : ''}`;
}

function materialsTableHtml(rows, columns, colgroupHtml) {
  return `
    <table class="mc-report-materials">
      ${colgroupHtml}
      <thead>
        <tr>${dimensionsHeaderHtml(columns)}</tr>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
      </thead>
      <tbody>${rowsHtml(rows, columns)}</tbody>
    </table>`;
}

function notesHtml(metadata) {
  return `
    <table class="mc-report-notes"><tbody>
      <tr><th>REFERENCE</th><td>${escapeHtml(metadata.reference)}</td></tr>
      <tr><th>NOTES</th><td>${escapeHtml(metadata.notes)}</td></tr>
    </tbody></table>`;
}

function signaturesHtml(metadata, issuerSignature) {
  return `
    <section class="mc-report-signatures">
      ${signatureHtml('MC Issuing Responsible', issuerSignature.role || '(Production Planning & Control Dept)', issuerSignature)}
      ${signatureHtml('Material Dispatch Responsible', metadata.dispatchSignature?.role || '(Project Warehouse)', metadata.dispatchSignature)}
      ${signatureHtml('Material Receiving Responsible', metadata.receivingSignature?.role || '(CTCO Yard/Subcontractor)', metadata.receivingSignature)}
    </section>`;
}

function reportSheetHtml({ documentData, columns, colgroupHtml, reportHeader, materialCouponTitle, issuerSignature, rows = documentData.rows, pageIndex = 1, totalPages = 1, measurement = false }) {
  const metadata = documentData.metadata || {};
  const measurementAttributes = measurement ? ' id="mc-report-measurement" aria-hidden="true"' : '';
  const measurementClass = measurement ? ' mc-report-sheet--measurement' : '';
  return `<article class="mc-report-sheet${measurementClass}"${measurementAttributes}>
    ${headerHtml({ reportHeader, materialCouponTitle, metadata, pageIndex, totalPages })}
    ${infoSectionHtml(metadata)}
    ${materialsTableHtml(rows, columns, colgroupHtml)}
    ${notesHtml(metadata)}
    ${signaturesHtml(metadata, issuerSignature)}
  </article>`;
}

function paginationScriptHtml() {
  return `<script>
  (() => {
    const PAGE_HEIGHT_MM = 194;
    // Screen-measured layout can differ slightly from print rendering; reserve space to prevent last-row overflow.
    const PAGE_SAFETY_MARGIN_MM = 3;

    const signalDone = () => {
      window.__mcPaginationDone = true;
      document.dispatchEvent(new Event('mc-pagination-done'));
    };

    const outerHeight = (element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height
        + (Number.parseFloat(style.marginTop) || 0)
        + (Number.parseFloat(style.marginBottom) || 0);
    };

    const contentBoxHeight = (sheet) => {
      const style = getComputedStyle(sheet);
      return sheet.clientHeight
        - (Number.parseFloat(style.paddingTop) || 0)
        - (Number.parseFloat(style.paddingBottom) || 0);
    };

    const availableRowsHeight = (sheet) => {
      const fixedHeight = [
        sheet.querySelector('.mc-report-header'),
        sheet.querySelector('.mc-report-info'),
        sheet.querySelector('.mc-report-materials thead'),
        sheet.querySelector('.mc-report-notes'),
        sheet.querySelector('.mc-report-signatures'),
      ].reduce((total, element) => total + outerHeight(element), 0);
      const pixelsPerMm = sheet.getBoundingClientRect().height / PAGE_HEIGHT_MM;
      return contentBoxHeight(sheet) - fixedHeight - (PAGE_SAFETY_MARGIN_MM * pixelsPerMm);
    };

    const pageOverflows = (sheet) => {
      const requiredHeight = Array.from(sheet.children)
        .reduce((total, element) => total + outerHeight(element), 0);
      return requiredHeight > contentBoxHeight(sheet) + 0.5;
    };

    const renderPages = (measurementSheet, pageGroups) => {
      document.querySelectorAll('.mc-report-sheet:not(.mc-report-sheet--measurement)').forEach((sheet) => sheet.remove());
      const totalPages = pageGroups.length;
      const fragment = document.createDocumentFragment();
      const sheets = pageGroups.map((rowGroup, index) => {
        const sheet = measurementSheet.cloneNode(true);
        sheet.removeAttribute('id');
        sheet.removeAttribute('aria-hidden');
        sheet.classList.remove('mc-report-sheet--measurement');
        if (index === totalPages - 1) sheet.classList.add('mc-report-sheet--last');
        sheet.querySelector('[data-mc-page]').textContent = String(index + 1).padStart(2, '0') + ' of ' + String(totalPages).padStart(2, '0');
        sheet.querySelector('.mc-report-materials tbody').replaceChildren(...rowGroup.map((row) => row.cloneNode(true)));
        fragment.append(sheet);
        return sheet;
      });
      document.body.append(fragment);
      return sheets;
    };

    const paginate = () => {
      const measurementSheet = document.getElementById('mc-report-measurement');
      if (!measurementSheet) {
        signalDone();
        return;
      }

      try {
        const tbody = measurementSheet.querySelector('.mc-report-materials tbody');
        const sourceRows = Array.from(tbody.rows);
        const rowHeights = sourceRows.map((row) => row.getBoundingClientRect().height);
        const rowAreaHeight = availableRowsHeight(measurementSheet);
        if (rowAreaHeight <= 0) {
          console.warn('Material Coupon fixed page content is taller than the available A4 content area; rows will be placed one per page.');
        }
        const pageGroups = [];
        let currentGroup = [];
        let currentHeight = 0;

        sourceRows.forEach((row, index) => {
          const rowHeight = rowHeights[index];
          if (currentGroup.length && currentHeight + rowHeight > rowAreaHeight) {
            pageGroups.push(currentGroup);
            currentGroup = [];
            currentHeight = 0;
          }
          if (rowHeight > rowAreaHeight) {
            console.warn('Material Coupon row is taller than the available page content area and will be placed alone.', index + 1);
          }
          currentGroup.push(row);
          currentHeight += rowHeight;
        });
        if (currentGroup.length || !pageGroups.length) pageGroups.push(currentGroup);

        const rebalanceLimit = Math.max(1, sourceRows.length);
        let sheets = renderPages(measurementSheet, pageGroups);
        let paginationFits = false;
        let rebalanceIterations = 0;
        let stoppedForOversizedRow = false;
        for (let iteration = 0; iteration < rebalanceLimit; iteration += 1) {
          const overflowingPageIndex = sheets.findIndex(pageOverflows);
          if (overflowingPageIndex === -1) {
            paginationFits = true;
            break;
          }

          const overflowingGroup = pageGroups[overflowingPageIndex];
          if (overflowingGroup.length <= 1) {
            console.warn('Material Coupon page still overflows with a single row; the row cannot be rebalanced further.', overflowingPageIndex + 1);
            stoppedForOversizedRow = true;
            break;
          }

          const movedRow = overflowingGroup.pop();
          if (pageGroups[overflowingPageIndex + 1]) pageGroups[overflowingPageIndex + 1].unshift(movedRow);
          else pageGroups.push([movedRow]);
          sheets = renderPages(measurementSheet, pageGroups);
          rebalanceIterations += 1;
        }

        if (!paginationFits && !stoppedForOversizedRow && rebalanceIterations >= rebalanceLimit
          && sheets.some(pageOverflows)) {
          console.warn('Material Coupon pagination reached its rebalancing limit with content still overflowing.');
        }

        measurementSheet.remove();
      } catch (error) {
        console.error('Material Coupon pagination failed; using the unpaginated report.', error);
        measurementSheet.removeAttribute('id');
        measurementSheet.removeAttribute('aria-hidden');
        measurementSheet.classList.remove('mc-report-sheet--measurement');
        measurementSheet.classList.add('mc-report-sheet--last');
      } finally {
        signalDone();
      }
    };

    const startPagination = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch (error) {
        console.warn('Material Coupon pagination could not wait for document fonts.', error);
      }
      requestAnimationFrame(() => requestAnimationFrame(paginate));
    };

    if (document.readyState === 'complete') startPagination();
    else window.addEventListener('load', startPagination, { once: true });
  })();
  </script>`;
}

export function getIssuerSignatureData(profile = {}) {
  const name = String(profile?.name || '').trim();
  if (!name) return { name: '', role: '', company: '', date: '', signatureImage: '' };
  return {
    name,
    role: String(profile.role || '').trim(),
    company: String(profile.company || '').trim(),
    date: '',
    signatureImage: String(profile.signatureImage || ''),
  };
}

export function buildMaterialCouponReportHtml(coupon, options = {}) {
  const documentData = buildMaterialCouponDocument(coupon, options);
  const metadata = documentData.metadata || {};
  const reportHeader = resolveReportHeader(options);
  const materialCouponTitle = String(reportHeader.documentTitles?.materialCoupon || '').trim()
    || DEFAULT_REPORT_HEADER.documentTitles.materialCoupon;
  const issuerSignature = { ...getIssuerSignatureData(options.profile), date: metadata.mcDate || '' };
  const title = escapeHtml(documentData.documentNumber || 'Material Coupon');

  const columns = resolveMaterialCouponReportColumns(coupon, documentData, options);
  const colgroupHtml = `<colgroup>${columns.map((column) => `<col style="width:${column.normalizedWidth}">`).join('')}</colgroup>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    :root {
      /* Real dimensions keep screen measurement and Chrome print rendering consistent. */
      --mc-scale: 0.7;
    }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      font-size: calc(9pt * var(--mc-scale));
    }
    
    .mc-report-sheet {
      width: 281mm;
      height: 194mm;
      border: 1.4pt solid #000;
      padding: calc(5mm * var(--mc-scale));
      background: #fff;
      display: flex;
      flex-direction: column;
    }
    .mc-report-sheet { break-after: page; page-break-after: always; }
    .mc-report-sheet--last { break-after: auto; page-break-after: auto; }
    .mc-report-sheet--measurement {
      position: absolute;
      top: 0;
      left: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .mc-report-sheet--measurement .mc-report-signatures { margin-top: 0; }
    
    /* CABEÇALHO */
    .mc-report-header {
      display: grid;
      grid-template-columns: calc(35mm * var(--mc-scale)) 1fr calc(80mm * var(--mc-scale));
      border: 0.7pt solid #000;
      margin-bottom: calc(3mm * var(--mc-scale));
    }
    .mc-report-logo,
    .mc-report-title,
    .mc-report-meta {
      min-height: calc(24mm * var(--mc-scale));
      border-right: 0.7pt solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mc-report-meta { border-right: 0; display: block; padding: 0; }
    .mc-report-logo strong { 
      border: 1pt solid #000; 
      padding: calc(3mm * var(--mc-scale)) calc(4mm * var(--mc-scale));
      font-size: calc(14pt * var(--mc-scale));
      letter-spacing: 1px;
    }
    .mc-report-logo-image {
      display: block;
      max-width: calc(30mm * var(--mc-scale));
      max-height: calc(18mm * var(--mc-scale));
      object-fit: contain;
    }
    .mc-report-title { 
      flex-direction: column; 
      gap: calc(1mm * var(--mc-scale));
      text-align: center; 
    }
    .mc-title-form { font-weight: 700; font-size: calc(12pt * var(--mc-scale)); }
    .mc-title-company { font-weight: 400; font-size: calc(10pt * var(--mc-scale)); }
    .mc-title-doc { font-weight: 700; font-size: calc(16pt * var(--mc-scale)); }
    
    /* mc-report-meta: sem padding/borda externa, só as divisórias internas entre os campos */
    .mc-report-meta table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: calc(8.5pt * var(--mc-scale)); }
    .mc-report-meta col.mc-meta-label { width: calc(18mm * var(--mc-scale)); }
    .mc-report-meta col.mc-meta-label-wide { width: calc(27mm * var(--mc-scale)); }
    .mc-report-meta th,
    .mc-report-meta td { border: none; }
    .mc-report-meta th { text-align: left; padding: calc(1mm * var(--mc-scale)); background: transparent; border-right: 0.7pt solid #000; }
    .mc-report-meta td { font-weight: bold; padding: calc(1mm * var(--mc-scale)); }
    .mc-report-meta tr:not(:last-child) th,
    .mc-report-meta tr:not(:last-child) td { border-bottom: 0.7pt solid #000; }
    .mc-report-meta-paired td:first-of-type { border-right: 0.7pt solid #000; }

    /* TABELAS GERAIS */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 0.7pt solid #000; padding: calc(1.2mm * var(--mc-scale)); vertical-align: top; }
    th { background: #d9d9d9; font-weight: 700; text-align: center; }
    
    /* INFO HEADER (PROJECT/CLIENT/SCOPE/MC No + DATE/WORKPACK/DESTINATION) */
    /* Linha 1: sem nenhuma borda. Linha 2: uma única borda envolvendo o bloco inteiro. */
    .mc-report-info { margin-bottom: calc(3mm * var(--mc-scale)); }
    .mc-info-row {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 2mm;
      margin-bottom: 2mm;
    }
    .mc-info-row:last-child { margin-bottom: 0; }
    .mc-info-row--boxed {
      border: 0.7pt solid #000;
      padding: calc(1.5mm * var(--mc-scale)) calc(2mm * var(--mc-scale));
    }
    .mc-info-field {
      padding: calc(0.5mm * var(--mc-scale)) calc(1mm * var(--mc-scale));
    }
    .mc-info-label {
      font-size: calc(9pt * var(--mc-scale));
      font-weight: 400;
    }
    .mc-info-value {
      font-size: calc(11pt * var(--mc-scale));
      font-weight: 700;
      min-height: calc(4mm * var(--mc-scale));
    }
    
    /* MATERIAIS TABLE - sem bordas internas, só borda externa + zebrado */
    .mc-report-materials { border: none; }
    .mc-report-materials th,
    .mc-report-materials td { border: none; }
    .mc-report-materials th { font-size: calc(10pt * var(--mc-scale)); font-family: "Arial Narrow", Arial, sans-serif; }
    .mc-report-materials thead th {
      text-align: center;
      vertical-align: middle;
      overflow-wrap: break-word;
      word-break: break-word;
      white-space: normal;
    }
    .mc-header-spacer { background: transparent; border: none !important; }
    .mc-dimensions-caption { background: #f2f2f2 !important; }

    /* Linha "DIMENSIONS" (spacers + legenda): nenhuma borda */
    .mc-report-materials thead tr:first-child th { border: none !important; }

    /* Linha de nomes de coluna (S/N., SAP Code...): só a borda externa do bloco, sem divisórias entre as células */
    .mc-report-materials thead tr:last-child th {
      border-top: 1pt solid #000;
      border-bottom: 1pt solid #000;
      border-left: none;
      border-right: none;
      background: transparent;
    }
    .mc-report-materials thead tr:last-child th:first-child { border-left: 1pt solid #000; }
    .mc-report-materials thead tr:last-child th:last-child { border-right: 1pt solid #000; }

    .mc-report-materials tbody td { 
      min-height: calc(8mm * var(--mc-scale));
      text-align: center; 
      vertical-align: middle;
      overflow-wrap: break-word; /* Força quebra de palavras longas */
      word-break: break-word;
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: calc(12pt * var(--mc-scale));
    }
    .mc-report-materials td:nth-child(4),
    .mc-report-materials td:nth-child(19) { text-align: left; }
    .mc-report-materials tbody tr:nth-child(odd) td { background-color: #f2f2f2; }
    .mc-report-materials tbody td:first-child { border-left: 1pt solid #000; }
    .mc-report-materials tbody td:last-child { border-right: 1pt solid #000; }
    .mc-report-materials tbody tr:last-child td { border-bottom: 1pt solid #000; }
    .empty-row { height: calc(20mm * var(--mc-scale)); text-align: center !important; color: #555; }
    
    /* NOTAS TABLE (REFERENCE / NOTES) - sem bordas, Calibri 10pt, títulos em negrito */
    .mc-report-notes { margin-top: calc(3mm * var(--mc-scale)); font-size: calc(10pt * var(--mc-scale)); font-family: Calibri, "Segoe UI", Arial, sans-serif; }
    .mc-report-notes th,
    .mc-report-notes td { border: none; vertical-align: top; background: transparent; }
    .mc-report-notes th { width: calc(24mm * var(--mc-scale)); font-weight: 700; text-align: right; }
    .mc-report-notes td { padding-left: calc(2mm * var(--mc-scale)); text-align: left; white-space: pre-wrap; }
    
    /* ASSINATURAS */
    .mc-report-signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: calc(4mm * var(--mc-scale));
      margin-top: auto; /* Empurra para o fim da página */
      padding-top: calc(4mm * var(--mc-scale));
      font-size: calc(12pt * var(--mc-scale));
    }
    .mc-report-signature {
      border: 0.7pt solid #000;
      padding: calc(3mm * var(--mc-scale));
      display: flex;
      flex-direction: column;
    }
    .mc-report-signature-title { text-align: center; margin-bottom: calc(2mm * var(--mc-scale)); }
    .mc-report-signature-title strong { display: block; font-size: calc(12pt * var(--mc-scale)); }
    .mc-report-signature-title span { display: block; font-size: calc(10pt * var(--mc-scale)); font-style: italic; }
    .mc-report-signature-row {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: calc(2mm * var(--mc-scale));
      border-top: 0.7pt dotted #000;
      min-height: calc(8mm * var(--mc-scale));
      padding: calc(2mm * var(--mc-scale)) 0;
      font-size: calc(11pt * var(--mc-scale));
      font-weight: 400;
      text-align: center;
    }
    .mc-report-signature-row.signature-line {
      min-height: calc(12mm * var(--mc-scale));
      border-top: 0.7pt solid #000;
    }
    .mc-report-signature-image {
      display: block;
      max-width: calc(100% - (34mm * var(--mc-scale)));
      max-height: calc(14mm * var(--mc-scale));
      margin: 0 auto;
      object-fit: contain;
      object-position: center;
    }
    .mc-report-signature-row .label {
      position: absolute;
      left: 0;
      flex-shrink: 0;
      font-size: calc(10.5pt * var(--mc-scale));
      font-weight: 400;
    }
    .mc-report-signature-row .value {
      width: 100%;
      padding-inline: calc(28mm * var(--mc-scale));
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: calc(12pt * var(--mc-scale));
      font-weight: 600;
      text-align: center;
    }

  </style>
</head>
<body>
  ${reportSheetHtml({ documentData, columns, colgroupHtml, reportHeader, materialCouponTitle, issuerSignature, measurement: true })}
  ${paginationScriptHtml()}
</body>
</html>`;
}

export async function buildMaterialCouponReportHtmlWithProfile(coupon, options = {}) {
  let profile = options.profile;
  if (!profile) {
    try {
      profile = coupon?.createdBy ? await getUser(coupon.createdBy) : null;
      if (!profile && coupon?.createdByName) profile = { name: coupon.createdByName };
      if (!profile) profile = await getActiveUser();
    } catch (error) {
      console.warn('Could not resolve the Material Coupon creator for its signature.', error);
      profile = null;
    }
  }
  return buildMaterialCouponReportHtml(coupon, { ...options, profile });
}

export async function openMaterialCouponReport(coupon, options = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  
  printWindow.document.open();
  printWindow.document.write(await buildMaterialCouponReportHtmlWithProfile(coupon, options));
  printWindow.document.close();

  let printStarted = false;
  const printReport = () => {
    if (printStarted) return;
    printStarted = true;
    clearInterval(paginationPoll);
    clearTimeout(paginationTimeout);
    if (printWindow.closed) return;
    printWindow.document.removeEventListener('mc-pagination-done', printReport);
    printWindow.focus();
    printWindow.print();
  };
  const paginationPoll = setInterval(() => {
    if (printWindow.closed || printWindow.__mcPaginationDone) printReport();
  }, 50);
  const paginationTimeout = setTimeout(() => {
    console.warn('Material Coupon pagination timed out; printing the current report after the fallback delay.');
    printReport();
  }, 2000);
  printWindow.document.addEventListener('mc-pagination-done', printReport, { once: true });
  if (printWindow.__mcPaginationDone) printReport();
  
  return true;
}
import { operationalWorkpackValue } from '../core/workpackRelations.js';
