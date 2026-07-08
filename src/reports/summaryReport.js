const SUMMARY_REPORT_CSS = `
@page {
  margin: 12mm 10mm;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}

body {
  color: #1d1d1f;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.cutting-report-page,
.summary-report-page {
  width: 100%;
  height: 100%;
  background: #ffffff;
}

.report-header,
.summary-report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e5e7;
}

.logo-section,
.summary-logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.report-logo-image,
.summary-logo-image {
  width: 40px;
  height: 48px;
  object-fit: contain;
  display: block;
}

.company-info h1,
.summary-company-info h1 {
  margin: 0;
  color: #1d1d1f;
  font-size: 14pt;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.company-info p,
.summary-company-info p {
  margin: 0;
  color: #86868b;
  font-size: 9pt;
  font-weight: 400;
}

.doc-title,
.summary-doc-title {
  text-align: right;
}

.doc-title h2,
.summary-doc-title h2 {
  margin: 0 0 2px;
  color: #1d1d1f;
  font-size: 12pt;
  font-weight: 600;
}

.doc-title .date,
.doc-title p,
.summary-doc-title p {
  margin: 0;
  color: #86868b;
  font-size: 9pt;
}

.report-body {
  width: 100%;
}

.card {
  width: 100%;
  border: 0;
  box-shadow: none;
  background: transparent;
}

#results-summary,
.results-summary {
  margin-bottom: 12px;
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

.stats-grid,
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}

.stat-card,
.kpi-card {
  padding: 8px;
  border-radius: 8px;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
  background: #f5f5f7;
}

.stat-card.blue {
  background: linear-gradient(135deg, #e8f4fd 0%, #d6ecfc 100%);
}

.stat-card.green,
.kpi-card.accent-success {
  background: linear-gradient(135deg, #e7f7ef 0%, #d3f1e3 100%);
}

.stat-card.orange,
.kpi-card.accent-secondary {
  background: linear-gradient(135deg, #fff4e6 0%, #ffe8cc 100%);
}

.stat-card.purple {
  background: linear-gradient(135deg, #f3ebff 0%, #e8deff 100%);
}

.kpi-card.accent-critical {
  background: linear-gradient(135deg, #fff0ef 0%, #ffdeda 100%);
}

.stat-card label,
.kpi-label {
  display: block;
  margin-bottom: 3px;
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
  overflow-wrap: anywhere;
}

.results-visual {
  width: 100%;
}

.results-panel {
  margin-bottom: 16px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.results-panel h3 {
  margin: 0 0 8px;
  color: #1d1d1f;
  font-size: 11pt;
  font-weight: 600;
}

.results-bars-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cut-sheet {
  margin-bottom: 16px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #e5e5e7;
  border-radius: 12px;
  break-inside: avoid;
  page-break-inside: avoid;
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

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  width: 100%;
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
  border-right: 1px solid rgba(255, 255, 255, 0.4);
  color: #ffffff;
  font-size: var(--report-label-font-size, 9pt);
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  overflow: hidden;
}

.piece-mark,
.piece-caption,
.piece-length {
  max-width: 100%;
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.piece-length {
  display: block;
  font-size: 0.8em;
  font-weight: 400;
  opacity: 0.9;
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
  min-width: 0;
  padding: 4px 6px;
  background: #fafafa;
  border: 1px solid #e5e5e7;
  border-radius: 6px;
  color: #1d1d1f;
  font-size: 8pt;
}

.piece-legend-row span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.piece-color-dot {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  border: 1px solid #d1d1d6;
  border-radius: 2px;
}

.table-wrap {
  width: 100%;
  overflow: visible;
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

.summary-signatures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 40px;
  margin-top: 28px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.summary-signature-box {
  padding-top: 8px;
  border-top: 1px solid #1d1d1f;
}

.summary-signature-line {
  display: none;
}

.summary-signature-box p {
  margin: 0 0 3px;
  color: #1d1d1f;
  font-size: 8.5pt;
}

.summary-signature-name {
  color: #86868b !important;
  font-size: 8pt !important;
}

.report-monochrome .kpi-card,
.report-monochrome .piece-legend-row {
  background: #ffffff !important;
  border-color: #9ca3af !important;
}

.report-monochrome .piece {
  background: #ffffff !important;
  color: #1d1d1f !important;
  border: 1px solid #1d1d1f !important;
}

.report-monochrome .kerf,
.report-monochrome .piece-kerf {
  background: #1d1d1f !important;
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

.report-monochrome .piece-color-dot {
  background: #ffffff !important;
}

@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .no-print,
  button,
  input,
  select,
  textarea {
    display: none !important;
  }

  .summary-report-header,
  .kpi-card,
  .stats-grid,
  .kpi-grid,
  .results-panel,
  .cut-sheet,
  .summary-signatures {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatReportDate(dateString, currentLang = 'pt-BR') {
  if (!dateString) {
    return new Date().toLocaleDateString(currentLang.replace('_', '-'));
  }

  const [year, month, day] = String(dateString).split('-');
  if (!year || !month || !day) return String(dateString);

  return `${day}/${month}/${year}`;
}

const DEFAULT_REPORT_HEADER = Object.freeze({
  companyName: 'Saipem do Brasil',
  subtitle: '',
  documentTitle: 'Cutting Plan Report',
  logoUrl: 'https://i.ibb.co/wZZQrZW0/Saipem-logo-300px.png',
});

function normalizeReportHeader(projectData = {}, reportHeader = {}) {
  return {
    ...DEFAULT_REPORT_HEADER,
    ...reportHeader,
    companyName: reportHeader.companyName || DEFAULT_REPORT_HEADER.companyName,
    subtitle: reportHeader.subtitle || projectData.project || 'Projeto Nao Informado',
    documentTitle: reportHeader.documentTitle || DEFAULT_REPORT_HEADER.documentTitle,
    logoUrl: reportHeader.logoUrl || DEFAULT_REPORT_HEADER.logoUrl,
  };
}

function signatureHtml(projectData = {}) {
  return `
    <div class="summary-signatures">
      <div class="summary-signature-box">
        <div class="summary-signature-line"></div>
        <p><strong>Issued By (PPC)</strong></p>
        <p class="summary-signature-name">${escapeHtml(projectData.preparedBy || '')}</p>
      </div>

      <div class="summary-signature-box">
        <div class="summary-signature-line"></div>
        <p><strong>Production Supervisor (CTCO/Sub)</strong></p>
        <p class="summary-signature-name">${escapeHtml(projectData.receivedBy || '')}</p>
      </div>
    </div>`;
}

export function openSummaryReport({
  reportBodyHtml = '',
  projectData = {},
  labelFontSizePt = 9,
  isMonochrome = false,
  includeSignatures = false,
  currentLang = 'pt-BR',
  title = 'Summary Report',
  reportHeader = {},
} = {}) {
  const printWindow = window.open('', 'cutting-plan-summary-report');
  if (!printWindow) return false;

  const currentFontSize = Number(labelFontSizePt) || 9;
  const rootClass = isMonochrome ? 'summary-report-page report-monochrome' : 'summary-report-page';
  const header = normalizeReportHeader(projectData, reportHeader);
  const reportContent = `<!DOCTYPE html>
<html lang="${escapeHtml(currentLang)}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>${SUMMARY_REPORT_CSS}</style>
</head>
<body>
  <div class="${rootClass}" style="--report-label-font-size: ${escapeHtml(currentFontSize)}pt;">
    <header class="summary-report-header">
      <div class="summary-logo-section">
        <img class="summary-logo-image" src="${escapeHtml(header.logoUrl)}" alt="${escapeHtml(header.companyName)}">

        <div class="summary-company-info">
          <h1>${escapeHtml(header.companyName)}</h1>
          <p>${escapeHtml(header.subtitle)}</p>
        </div>
      </div>

      <div class="summary-doc-title">
        <h2>${escapeHtml(header.documentTitle)}</h2>
        <p>${escapeHtml(formatReportDate(projectData.date || projectData.reportDate, currentLang))}</p>
      </div>
    </header>

    ${reportBodyHtml}

    ${includeSignatures ? signatureHtml(projectData) : ''}
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(reportContent);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 150);
  };

  return true;
}
