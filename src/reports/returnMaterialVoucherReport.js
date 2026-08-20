import { buildReturnMaterialVoucherDocument } from '../documents/returnMaterialVoucher.js';
import {
  DEFAULT_REPORT_HEADER,
  DEFAULT_RETURN_MATERIAL_VOUCHER_FORM,
  normalizeReportHeader,
} from '../data/appSettings.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const RETURN_MATERIAL_VOUCHER_REPORT_COLUMNS = Object.freeze([
  ['serialNumber', 'S/N.', 3],
  ['sapCode', 'SAP Code', 7],
  ['itemCategory', 'Item Category', 6],
  ['description', 'Material Description', 20],
  ['quantity', 'Qty Return.', 4],
  ['unit', 'Un.', 3],
  ['diaMm', 'Dia [mm]', 4],
  ['thicknessMm', 'Thickness [mm]', 5],
  ['lengthMm', 'Length [mm]', 5],
  ['weightKg', 'Weight [Kg]', 5],
  ['condition', 'Condition', 6],
  ['traceability', 'Original Traceability', 10],
  ['heat', 'Heat No.', 6],
  ['materialCouponNumber', 'Ref. MC', 6],
  ['cuttingSheetNumber', 'Cutting Plan', 7],
  ['notes', 'Notes', 6],
].map(([key, label, width]) => Object.freeze({ key, label, width })));

export function resolveReturnMaterialVoucherReportColumns(rmv = {}, documentData = {}, options = {}) {
  const layout = Array.isArray(rmv.reportColumnLayout)
    ? rmv.reportColumnLayout
    : Array.isArray(options.reportColumnLayout)
      ? options.reportColumnLayout
      : [];
  const overrides = new Map(layout.map((item) => [item.key, item]));
  const documentColumns = new Map((documentData.columns || []).map((column) => [column.key, column]));
  const columns = RETURN_MATERIAL_VOUCHER_REPORT_COLUMNS.map((reportColumn) => {
    const documentColumn = documentColumns.get(reportColumn.key);
    if (!documentColumn) return null;
    const override = overrides.get(reportColumn.key) || {};
    return {
      ...documentColumn,
      ...reportColumn,
      visible: override.visible !== false,
      width: Math.max(reportColumn.key === 'sapCode' ? 7 : 1, Number(override.width) || reportColumn.width),
    };
  }).filter((column) => column?.visible);
  const total = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  return columns.map((column) => ({
    ...column,
    normalizedWidth: `${(column.width / total * 100).toFixed(3)}%`,
  }));
}

function resolveReportHeader(options = {}) {
  return normalizeReportHeader(options.reportHeader || options.settings?.reportHeader || {});
}

function resolveDocumentMetadata(metadata = {}, options = {}) {
  const configured = options.returnMaterialVoucherForm || options.settings?.returnMaterialVoucherForm || {};
  return {
    ...DEFAULT_RETURN_MATERIAL_VOUCHER_FORM,
    ...configured,
    ...metadata,
    docNumber: metadata.docNumber || configured.docNumber || DEFAULT_RETURN_MATERIAL_VOUCHER_FORM.docNumber,
    docRevision: metadata.docRevision || configured.docRevision || DEFAULT_RETURN_MATERIAL_VOUCHER_FORM.docRevision,
    docRevisionDate: metadata.docRevisionDate || configured.docRevisionDate || DEFAULT_RETURN_MATERIAL_VOUCHER_FORM.docRevisionDate,
    docReference: metadata.docReference || configured.docReference || DEFAULT_RETURN_MATERIAL_VOUCHER_FORM.docReference,
  };
}

function logoHtml(reportHeader) {
  if (!reportHeader.logoUrl) {
    return `<strong>${escapeHtml(reportHeader.companyName || DEFAULT_REPORT_HEADER.companyName)}</strong>`;
  }
  return `<img class="rmv-report-logo-image" src="${escapeHtml(reportHeader.logoUrl)}" alt="${escapeHtml(reportHeader.companyName || DEFAULT_REPORT_HEADER.companyName)}">`;
}

function formatMeasurement(value) {
  if (value === '' || value == null) return '';
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false })
    : value;
}

function cellHtml(value, columnKey) {
  const displayValue = ['lengthMm', 'weightKg'].includes(columnKey) ? formatMeasurement(value) : value;
  return `<td class="rmv-column-${escapeHtml(columnKey)}">${escapeHtml(displayValue)}</td>`;
}

function rowsHtml(rows, columns) {
  if (!rows.length) {
    return `<tr><td colspan="${columns.length}" class="empty-row">No returned materials.</td></tr>`;
  }
  return rows.map((row) => `<tr>${columns.map((column) => cellHtml(row[column.key], column.key)).join('')}</tr>`).join('');
}

function infoFieldHtml(label, value, span) {
  return `
    <div class="rmv-info-field" style="grid-column: span ${span};">
      <div class="rmv-info-label">${escapeHtml(label)}</div>
      <div class="rmv-info-value">${escapeHtml(value)}</div>
    </div>`;
}

function formatPageNumber(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(2, '0');
}

function headerHtml({ reportHeader, documentTitle, documentData, pageIndex = 1, totalPages = 1 }) {
  const metadata = documentData.metadata || {};
  const companyName = reportHeader.companyName || DEFAULT_REPORT_HEADER.companyName;
  return `
    <header class="rmv-report-header rmv-header">
      <div class="rmv-report-logo">${logoHtml(reportHeader)}</div>
      <div class="rmv-report-title">
        <span class="rmv-title-form">FORM</span>
        <span class="rmv-title-company">${escapeHtml(companyName).toUpperCase()}</span>
        <span class="rmv-title-doc">${escapeHtml(documentTitle)}</span>
      </div>
      <div class="rmv-report-meta">
        <table>
          <colgroup><col class="rmv-meta-label"><col><col class="rmv-meta-label-wide"><col></colgroup>
          <tbody>
            <tr><th>Doc. Nº:</th><td colspan="3">${escapeHtml(metadata.docNumber)}</td></tr>
            <tr class="rmv-report-meta-paired"><th>Rev.:</th><td>${escapeHtml(metadata.docRevision)}</td><th>Doc. Ver. Date:</th><td>${escapeHtml(metadata.docRevisionDate)}</td></tr>
            <tr><th>Ref. Doc. :</th><td colspan="3">${escapeHtml(metadata.docReference)}</td></tr>
            <tr><th>Page:</th><td colspan="3" data-rmv-page>${formatPageNumber(pageIndex)} of ${formatPageNumber(totalPages)}</td></tr>
          </tbody>
        </table>
      </div>
    </header>`;
}

function infoSectionHtml(metadata = {}, documentNumber = '') {
  const generalInformation = [
    infoFieldHtml('PROJECT:', metadata.project, 5),
    infoFieldHtml('CLIENT:', metadata.client, 3),
    infoFieldHtml('SCOPE:', metadata.scope, 4),
  ].join('');
  const movementInformation = [
    infoFieldHtml('RMV Nº:', documentNumber || metadata.rmvNumber, 2),
    infoFieldHtml('DATE:', metadata.date, 2),
    infoFieldHtml('ORIGIN', metadata.origin, 2),
    infoFieldHtml('DESTINATION:', metadata.destination, 2),
    infoFieldHtml('DESIGN DRAWING REF.:', metadata.drawingReference, 4),
  ].join('');
  return `
    <section class="rmv-report-info">
      <div class="rmv-info-row">${generalInformation}</div>
      <div class="rmv-info-row rmv-info-row--boxed">${movementInformation}</div>
    </section>`;
}

function dimensionsHeaderHtml(columns) {
  const dimensions = new Set(['diaMm', 'thicknessMm', 'lengthMm', 'weightKg']);
  const first = columns.findIndex((column) => dimensions.has(column.key));
  const count = columns.filter((column) => dimensions.has(column.key)).length;
  const after = Math.max(0, columns.length - Math.max(0, first) - count);
  return `${first > 0 ? `<th colspan="${first}" class="rmv-header-spacer"></th>` : ''}${count ? `<th colspan="${count}" class="rmv-dimensions-caption">DIMENSIONS RETURNED</th>` : ''}${after ? `<th colspan="${after}" class="rmv-header-spacer"></th>` : ''}`;
}

function returnedMaterialsTableHtml(rows, columns, colgroupHtml) {
  return `
    <table class="rmv-report-materials">
      ${colgroupHtml}
      <thead>
        <tr>${dimensionsHeaderHtml(columns)}</tr>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
      </thead>
      <tbody>${rowsHtml(rows, columns)}</tbody>
    </table>`;
}

function notesHtml(metadata = {}) {
  const referenceLines = String(metadata.reference || '').trim().split(/\r?\n/).filter(Boolean);
  const addReference = (label, value) => {
    const text = String(value || '').trim();
    if (text && !referenceLines.some((line) => line.includes(text))) referenceLines.push(`* ${label}: ${text}`);
  };
  addReference('Material Coupon', metadata.materialCouponNumber);
  addReference('Cutting Plan', metadata.cuttingSheetNumber);
  return `
    <table class="rmv-report-notes"><tbody>
      <tr><th>REFERENCE</th><td>${escapeHtml(referenceLines.join('\n'))}</td></tr>
      <tr><th>GENERAL NOTES</th><td>${escapeHtml(metadata.notes)}</td></tr>
    </tbody></table>`;
}

function signatureHtml(item = {}) {
  const { label = '', name = '', company = '', date = '' } = item;
  const subtitles = {
    'MC Issuing Responsible': '(Production Planning & Control Dept)',
    'Material Dispatch Responsible': '(CTCO Yard/Subcontractor)',
    'Material Receiving Responsible': '(Project Warehouse)',
  };
  const subtitle = subtitles[label] || item.role || '';
  const signatureImage = item.signatureImage || item.signature || '';
  const signatureImageHtml = signatureImage
    ? `<img class="rmv-report-signature-image" src="${escapeHtml(signatureImage)}" alt="Signature of ${escapeHtml(name)}">`
    : '';
  return `
    <div class="rmv-report-signature">
      <div class="rmv-report-signature-title">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <div class="rmv-report-signature-row signature-line">
        <span class="label">SIGNATURE:</span>
        ${signatureImageHtml}
      </div>
      <div class="rmv-report-signature-row">
        <span class="label">NAME:</span>
        <span class="value">${escapeHtml(name)}</span>
      </div>
      <div class="rmv-report-signature-row">
        <span class="label">COMPANY:</span>
        <span class="value">${escapeHtml(company)}</span>
      </div>
      <div class="rmv-report-signature-row">
        <span class="label">DATE:</span>
        <span class="value">${escapeHtml(date)}</span>
      </div>
    </div>`;
}

function signaturesHtml(signatureFields = []) {
  const columnCount = Math.min(3, Math.max(1, signatureFields.length));
  return `
    <section class="rmv-report-signatures" style="--rmv-signature-columns: ${columnCount};">
      ${signatureFields.map(signatureHtml).join('')}
    </section>`;
}

function reportSheetHtml({ documentData, columns, colgroupHtml, reportHeader, documentTitle, rows = documentData.rows, pageIndex = 1, totalPages = 1, measurement = false }) {
  const measurementAttributes = measurement ? ' id="rmv-report-measurement" aria-hidden="true"' : '';
  const measurementClass = measurement ? ' rmv-report-sheet--measurement' : '';
  return `<article class="rmv-report-sheet${measurementClass}"${measurementAttributes}>
    ${headerHtml({ reportHeader, documentTitle, documentData, pageIndex, totalPages })}
    ${infoSectionHtml(documentData.metadata, documentData.documentNumber)}
    ${returnedMaterialsTableHtml(rows, columns, colgroupHtml)}
    ${notesHtml(documentData.metadata)}
    ${signaturesHtml(documentData.signatureFields)}
  </article>`;
}

function paginationScriptHtml() {
  return `<script>
  (() => {
    const PAGE_HEIGHT_MM = 194;
    const PAGE_SAFETY_MARGIN_MM = 3;

    const signalDone = () => {
      window.__rmvPaginationDone = true;
      document.dispatchEvent(new Event('rmv-pagination-done'));
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
        sheet.querySelector('.rmv-report-header'),
        sheet.querySelector('.rmv-report-info'),
        sheet.querySelector('.rmv-report-materials thead'),
        sheet.querySelector('.rmv-report-notes'),
        sheet.querySelector('.rmv-report-signatures'),
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
      document.querySelectorAll('.rmv-report-sheet:not(.rmv-report-sheet--measurement)').forEach((sheet) => sheet.remove());
      const totalPages = pageGroups.length;
      const fragment = document.createDocumentFragment();
      const sheets = pageGroups.map((rowGroup, index) => {
        const sheet = measurementSheet.cloneNode(true);
        sheet.removeAttribute('id');
        sheet.removeAttribute('aria-hidden');
        sheet.classList.remove('rmv-report-sheet--measurement');
        if (index === totalPages - 1) sheet.classList.add('rmv-report-sheet--last');
        sheet.querySelector('[data-rmv-page]').textContent = String(index + 1).padStart(2, '0') + ' of ' + String(totalPages).padStart(2, '0');
        sheet.querySelector('.rmv-report-materials tbody').replaceChildren(...rowGroup.map((row) => row.cloneNode(true)));
        fragment.append(sheet);
        return sheet;
      });
      document.body.append(fragment);
      return sheets;
    };

    const paginate = () => {
      const measurementSheet = document.getElementById('rmv-report-measurement');
      if (!measurementSheet) {
        signalDone();
        return;
      }

      try {
        const tbody = measurementSheet.querySelector('.rmv-report-materials tbody');
        const sourceRows = Array.from(tbody.rows);
        const rowHeights = sourceRows.map((row) => row.getBoundingClientRect().height);
        const rowAreaHeight = availableRowsHeight(measurementSheet);
        if (rowAreaHeight <= 0) {
          console.warn('RMV fixed page content is taller than the available A4 content area; rows will be placed one per page.');
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
            console.warn('RMV row is taller than the available page content area and will be placed alone.', index + 1);
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
            console.warn('RMV page still overflows with a single row; the row cannot be rebalanced further.', overflowingPageIndex + 1);
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
          console.warn('RMV pagination reached its rebalancing limit with content still overflowing.');
        }

        measurementSheet.remove();
      } catch (error) {
        console.error('RMV pagination failed; using the unpaginated report.', error);
        measurementSheet.removeAttribute('id');
        measurementSheet.removeAttribute('aria-hidden');
        measurementSheet.classList.remove('rmv-report-sheet--measurement');
        measurementSheet.classList.add('rmv-report-sheet--last');
      } finally {
        signalDone();
      }
    };

    const startPagination = async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch (error) {
        console.warn('RMV pagination could not wait for document fonts.', error);
      }
      requestAnimationFrame(() => requestAnimationFrame(paginate));
    };

    if (document.readyState === 'complete') startPagination();
    else window.addEventListener('load', startPagination, { once: true });
  })();
  </script>`;
}

export function buildReturnMaterialVoucherReportHtml(rmv = {}, options = {}) {
  const builtDocument = buildReturnMaterialVoucherDocument(rmv, options);
  const documentData = {
    ...builtDocument,
    metadata: resolveDocumentMetadata(builtDocument.metadata, options),
  };
  const reportHeader = resolveReportHeader(options);
  const documentTitle = String(reportHeader.documentTitles?.returnMaterialVoucher || '').trim()
    || DEFAULT_REPORT_HEADER.documentTitles.returnMaterialVoucher;
  const columns = resolveReturnMaterialVoucherReportColumns(rmv, documentData, options);
  const colgroupHtml = `<colgroup>${columns.map((column) => `<col style="width:${column.normalizedWidth}">`).join('')}</colgroup>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(documentData.documentNumber || 'RMV')}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    :root { --rmv-scale: 0.7; }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      font-size: calc(9pt * var(--rmv-scale));
    }
    .rmv-report-sheet {
      width: 281mm;
      height: 194mm;
      border: 1.4pt solid #000;
      padding: calc(5mm * var(--rmv-scale));
      background: #fff;
      display: flex;
      flex-direction: column;
      break-after: page;
      page-break-after: always;
    }
    .rmv-report-sheet--last { break-after: auto; page-break-after: auto; }
    .rmv-report-sheet--measurement {
      position: absolute;
      top: 0;
      left: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .rmv-report-sheet--measurement .rmv-report-signatures { margin-top: 0; }
    .rmv-report-header {
      display: grid;
      grid-template-columns: calc(35mm * var(--rmv-scale)) 1fr calc(80mm * var(--rmv-scale));
      border: 0.7pt solid #000;
      margin-bottom: calc(3mm * var(--rmv-scale));
    }
    .rmv-header { box-shadow: 0 calc(2px * var(--rmv-scale)) calc(4px * var(--rmv-scale)) rgba(0, 0, 0, 0.25); }
    .rmv-report-logo,
    .rmv-report-title,
    .rmv-report-meta {
      min-height: calc(24mm * var(--rmv-scale));
      border-right: 0.7pt solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rmv-report-meta { border-right: 0; display: block; padding: 0; }
    .rmv-report-logo strong {
      border: 1pt solid #000;
      padding: calc(3mm * var(--rmv-scale)) calc(4mm * var(--rmv-scale));
      font-size: calc(14pt * var(--rmv-scale));
      letter-spacing: 1px;
    }
    .rmv-report-logo-image {
      display: block;
      max-width: calc(30mm * var(--rmv-scale));
      max-height: calc(18mm * var(--rmv-scale));
      object-fit: contain;
    }
    .rmv-report-title {
      flex-direction: column;
      gap: calc(1mm * var(--rmv-scale));
      text-align: center;
    }
    .rmv-title-form { font-weight: 700; font-size: calc(12pt * var(--rmv-scale)); }
    .rmv-title-company { font-weight: 400; font-size: calc(10pt * var(--rmv-scale)); }
    .rmv-title-doc { font-weight: 700; font-size: calc(16pt * var(--rmv-scale)); }
    .rmv-report-meta table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: calc(8.5pt * var(--rmv-scale)); }
    .rmv-report-meta col.rmv-meta-label { width: calc(18mm * var(--rmv-scale)); }
    .rmv-report-meta col.rmv-meta-label-wide { width: calc(27mm * var(--rmv-scale)); }
    .rmv-report-meta th,
    .rmv-report-meta td { border: none; }
    .rmv-report-meta th { text-align: left; padding: calc(1mm * var(--rmv-scale)); background: transparent; border-right: 0.7pt solid #000; }
    .rmv-report-meta td { font-weight: bold; padding: calc(1mm * var(--rmv-scale)); }
    .rmv-report-meta tr:not(:last-child) th,
    .rmv-report-meta tr:not(:last-child) td { border-bottom: 0.7pt solid #000; }
    .rmv-report-meta-paired td:first-of-type { border-right: 0.7pt solid #000; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 0.7pt solid #000; padding: calc(1.2mm * var(--rmv-scale)); vertical-align: top; }
    th { background: #d9d9d9; font-weight: 700; text-align: center; }
    .rmv-report-info { margin-bottom: calc(3mm * var(--rmv-scale)); }
    .rmv-info-row {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: calc(2mm * var(--rmv-scale));
      margin-bottom: calc(2mm * var(--rmv-scale));
    }
    .rmv-info-row:last-child { margin-bottom: 0; }
    .rmv-info-row--boxed {
      border: 0.7pt solid #000;
      padding: calc(1.5mm * var(--rmv-scale)) calc(2mm * var(--rmv-scale));
    }
    .rmv-info-field { padding: calc(0.5mm * var(--rmv-scale)) calc(1mm * var(--rmv-scale)); }
    .rmv-info-label { font-size: calc(9pt * var(--rmv-scale)); font-weight: 400; }
    .rmv-info-value { font-size: calc(11pt * var(--rmv-scale)); font-weight: 700; min-height: calc(4mm * var(--rmv-scale)); }
    .rmv-report-materials { border: none; }
    .rmv-report-materials th,
    .rmv-report-materials td { border: none; }
    .rmv-report-materials th { font-size: calc(10pt * var(--rmv-scale)); font-family: "Arial Narrow", Arial, sans-serif; }
    .rmv-report-materials thead th {
      text-align: center;
      vertical-align: middle;
      overflow-wrap: break-word;
      word-break: break-word;
      white-space: normal;
    }
    .rmv-header-spacer { background: transparent; border: none !important; }
    .rmv-dimensions-caption { background: #f2f2f2 !important; }
    .rmv-report-materials thead tr:first-child th { border: none !important; }
    .rmv-report-materials thead tr:last-child th {
      border-top: 1pt solid #000;
      border-bottom: 1pt solid #000;
      border-left: none;
      border-right: none;
      background: transparent;
    }
    .rmv-report-materials thead tr:last-child th:first-child { border-left: 1pt solid #000; }
    .rmv-report-materials thead tr:last-child th:last-child { border-right: 1pt solid #000; }
    .rmv-report-materials tbody td {
      min-height: calc(8mm * var(--rmv-scale));
      text-align: center;
      vertical-align: middle;
      overflow-wrap: break-word;
      word-break: break-word;
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: calc(12pt * var(--rmv-scale));
    }
    .rmv-report-materials tbody td.rmv-column-description,
    .rmv-report-materials tbody td.rmv-column-notes { text-align: left; }
    .rmv-report-materials .rmv-column-sapCode { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
    .rmv-report-materials tbody tr:nth-child(odd) td { background-color: #f2f2f2; }
    .rmv-report-materials tbody td:first-child { border-left: 1pt solid #000; }
    .rmv-report-materials tbody td:last-child { border-right: 1pt solid #000; }
    .rmv-report-materials tbody tr:last-child td { border-bottom: 1pt solid #000; }
    .empty-row { height: calc(20mm * var(--rmv-scale)); text-align: center !important; color: #555; }
    .rmv-report-notes {
      margin-top: calc(3mm * var(--rmv-scale));
      font-size: calc(10pt * var(--rmv-scale));
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
    }
    .rmv-report-notes th,
    .rmv-report-notes td { border: none; vertical-align: top; background: transparent; }
    .rmv-report-notes th { width: calc(28mm * var(--rmv-scale)); font-weight: 700; text-align: right; }
    .rmv-report-notes td { padding-left: calc(2mm * var(--rmv-scale)); text-align: left; white-space: pre-wrap; line-height: 1.35; }
    .rmv-report-signatures {
      display: grid;
      grid-template-columns: repeat(var(--rmv-signature-columns), minmax(0, 1fr));
      gap: calc(4mm * var(--rmv-scale));
      margin-top: auto;
      padding-top: calc(4mm * var(--rmv-scale));
      font-size: calc(12pt * var(--rmv-scale));
    }
    .rmv-report-signature {
      border: 0.7pt solid #000;
      padding: calc(3mm * var(--rmv-scale));
      display: flex;
      flex-direction: column;
    }
    .rmv-report-signature-title { text-align: center; margin-bottom: calc(2mm * var(--rmv-scale)); }
    .rmv-report-signature-title strong { display: block; font-size: calc(12pt * var(--rmv-scale)); }
    .rmv-report-signature-title span { display: block; font-size: calc(10pt * var(--rmv-scale)); font-style: italic; }
    .rmv-report-signature-row {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: calc(2mm * var(--rmv-scale));
      border-top: 0.7pt dotted #000;
      min-height: calc(8mm * var(--rmv-scale));
      padding: calc(2mm * var(--rmv-scale)) 0;
      font-size: calc(11pt * var(--rmv-scale));
      font-weight: 400;
      text-align: center;
    }
    .rmv-report-signature-row.signature-line { min-height: calc(12mm * var(--rmv-scale)); border-top: 0.7pt solid #000; }
    .rmv-report-signature-image {
      display: block;
      max-width: calc(100% - (34mm * var(--rmv-scale)));
      max-height: calc(14mm * var(--rmv-scale));
      margin: 0 auto;
      object-fit: contain;
      object-position: center;
    }
    .rmv-report-signature-row .label {
      position: absolute;
      left: 0;
      flex-shrink: 0;
      font-size: calc(10.5pt * var(--rmv-scale));
      font-weight: 400;
    }
    .rmv-report-signature-row .value {
      width: 100%;
      padding-inline: calc(28mm * var(--rmv-scale));
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: calc(12pt * var(--rmv-scale));
      font-weight: 600;
      text-align: center;
    }
    @media screen and (max-width: 900px) {
      .rmv-report-signatures { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${reportSheetHtml({ documentData, columns, colgroupHtml, reportHeader, documentTitle, measurement: true })}
  ${paginationScriptHtml()}
</body>
</html>`;
}

export function openReturnMaterialVoucherReport(rmv, options = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(buildReturnMaterialVoucherReportHtml(rmv, options));
  printWindow.document.close();

  let printStarted = false;
  const printReport = () => {
    if (printStarted) return;
    printStarted = true;
    clearInterval(paginationPoll);
    clearTimeout(paginationTimeout);
    if (printWindow.closed) return;
    printWindow.document.removeEventListener('rmv-pagination-done', printReport);
    printWindow.focus();
    printWindow.print();
  };
  const paginationPoll = setInterval(() => {
    if (printWindow.closed || printWindow.__rmvPaginationDone) printReport();
  }, 50);
  const paginationTimeout = setTimeout(() => {
    console.warn('RMV pagination timed out; printing the current report after the fallback delay.');
    printReport();
  }, 2000);
  printWindow.document.addEventListener('rmv-pagination-done', printReport, { once: true });
  if (printWindow.__rmvPaginationDone) printReport();

  return true;
}
