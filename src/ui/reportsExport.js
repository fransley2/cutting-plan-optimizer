import { exportReportsDashboardExcel } from '../data/excel.js';
import { getCurrentLanguage, normalizeLanguage, t } from '../i18n/index.js';

function reportLanguage(context = {}) {
  return normalizeLanguage(context.language || getCurrentLanguage());
}

function reportText(value, language, variables = {}) {
  return t(value, variables, language);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function titleFromKey(value) {
  return text(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function presentationKpis(kpis = {}, language = 'pt-BR') {
  const entries = Array.isArray(kpis)
    ? kpis.map((item, index) => [item?.key || item?.id || String(index + 1), item])
    : Object.entries(kpis || {});
  return entries.map(([key, input]) => {
    const item = input && typeof input === 'object' && !Array.isArray(input) ? input : { value: input };
    const raw = item.displayValue ?? item.formattedValue ?? item.value ?? item.rawValue ?? '';
    const unit = text(item.unit);
    const isPercentage = unit === '%' || text(item.format || item.type).toLowerCase().includes('percent');
    const displayNumber = isPercentage && typeof raw === 'number' && Math.abs(raw) <= 1 ? raw * 100 : raw;
    const numeric = typeof displayNumber === 'number' && Number.isFinite(displayNumber)
      ? displayNumber.toLocaleString(language, { maximumFractionDigits: 2 })
      : displayNumber;
    return {
      label: reportText(item.label || item.title || item.name || titleFromKey(key) || 'Indicator', language),
      value: `${numeric}${unit === '%' ? '%' : ''}`,
      unit: unit && unit !== '%' ? unit : '',
      note: item.note || item.description || '',
    };
  });
}

function presentationTables(tables = []) {
  if (Array.isArray(tables)) return tables;
  return Object.entries(tables || {}).map(([title, table]) => (
    Array.isArray(table) ? { title, rows: table } : { title, ...(table || {}) }
  ));
}

function normalizePresentationTable(table = {}, index = 0, language = 'pt-BR') {
  const rows = Array.isArray(table.rows) ? table.rows : Array.isArray(table.records) ? table.records : Array.isArray(table.data) ? table.data : [];
  const suppliedColumns = Array.isArray(table.columns) ? table.columns : [];
  const columns = suppliedColumns.length
    ? suppliedColumns.map((column) => typeof column === 'string'
      ? { key: column, label: reportText(titleFromKey(column), language) }
      : { ...column, label: reportText(column.label || column.title || titleFromKey(column.key), language) })
    : [...new Set(rows.flatMap((row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : []))].map((key) => ({ key, label: reportText(titleFromKey(key), language) }));
  return {
    title: reportText(table.title || table.label || table.name || 'Table {number}', language, { number: index + 1 }),
    columns,
    rows,
  };
}

function tableCell(row, column, columnIndex, language = 'pt-BR') {
  const value = Array.isArray(row) ? row[columnIndex] : row?.[column.key];
  if (column.format === 'completionStatus') return reportText(({ NOT_STARTED: 'Not started', PARTIAL: 'Partial', COMPLETE: 'Complete' })[value] || '—', language);
  if (column.format === 'overdueStatus') return reportText(value ? 'Overdue' : 'On time', language);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const formatted = value.toLocaleString(language, { maximumFractionDigits: 2 });
    return `${formatted}${text(column.unit) === '%' ? '%' : ''}`;
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? '';
}

function chartImages(images = []) {
  return (Array.isArray(images) ? images : []).map((image, index) => {
    const dataUrl = typeof image === 'string' ? image : image?.dataUrl || image?.src || image?.image || '';
    if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(text(dataUrl))) return null;
    return {
      title: typeof image === 'string' ? `Gráfico ${index + 1}` : image.title || image.label || `Gráfico ${index + 1}`,
      dataUrl,
    };
  }).filter(Boolean);
}

function formatGeneratedAt(value, language = 'pt-BR') {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toLocaleString(language) : date.toLocaleString(language);
}

function chunkRows(rows, size) {
  if (!rows.length) return [[]];
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

function firstPageHtml(dashboard, context) {
  const language = reportLanguage(context);
  const kpis = presentationKpis(dashboard.kpis, language);
  const images = chartImages(context.chartImages || dashboard.chartImages);
  const chartContent = images.length
    ? images.map((image) => `<figure class="reports-chart"><figcaption>${escapeHtml(image.title)}</figcaption><img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.title)}"></figure>`).join('')
    : `<div class="reports-chart-empty">${escapeHtml(reportText('No chart available for this presentation.', language))}</div>`;
  return `<section class="reports-page">
    <header class="reports-header">
      <div><span class="reports-eyebrow">PPC CONTROL TOWER</span><h1>${escapeHtml(reportText(dashboard.title || dashboard.label || dashboard.name || 'Reports', language))}</h1><p>${escapeHtml(reportText(dashboard.question || dashboard.subtitle || '', language))}</p></div>
      <dl><div><dt>${escapeHtml(reportText('Project', language))}</dt><dd>${escapeHtml(context.projectName || reportText('All projects', language))}</dd></div>${context.equipmentTag ? `<div><dt>${escapeHtml(reportText('Equipment TAG', language))}</dt><dd>${escapeHtml(context.equipmentTag)}</dd></div>` : ''}<div><dt>${escapeHtml(reportText('Generated at', language))}</dt><dd>${escapeHtml(formatGeneratedAt(context.generatedAt, language))}</dd></div></dl>
    </header>
    <div class="reports-kpis">${kpis.map((kpi) => `<article><span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(kpi.value)}</strong>${kpi.unit ? `<b>${escapeHtml(kpi.unit)}</b>` : ''}${kpi.note ? `<small>${escapeHtml(kpi.note)}</small>` : ''}</article>`).join('')}</div>
    <div class="reports-charts">${chartContent}</div>
    <footer>Cutting Plan Optimizer · Material Management &amp; Fabrication</footer>
  </section>`;
}

function tablePagesHtml(dashboard, context) {
  const language = reportLanguage(context);
  const rowsPerPage = Math.max(1, Math.trunc(Number(context.rowsPerTablePage) || 12));
  return presentationTables(dashboard.tables).map((table, index) => normalizePresentationTable(table, index, language)).flatMap((table) => (
    chunkRows(table.rows, rowsPerPage).map((rows, pageIndex, pages) => `<section class="reports-page reports-table-page">
      <header class="reports-header reports-header-compact">
        <div><span class="reports-eyebrow">${escapeHtml(reportText(dashboard.title || dashboard.label || 'Reports', language))}</span><h1>${escapeHtml(table.title)}</h1></div>
        <dl><div><dt>${escapeHtml(reportText('Project', language))}</dt><dd>${escapeHtml(context.projectName || reportText('All projects', language))}</dd></div>${context.equipmentTag ? `<div><dt>${escapeHtml(reportText('Equipment TAG', language))}</dt><dd>${escapeHtml(context.equipmentTag)}</dd></div>` : ''}<div><dt>${escapeHtml(reportText('Page', language))}</dt><dd>${pageIndex + 1} / ${pages.length}</dd></div></dl>
      </header>
      <div class="reports-table-wrap"><table><thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${table.columns.map((column, columnIndex) => `<td>${escapeHtml(tableCell(row, column, columnIndex, language))}</td>`).join('')}</tr>`).join('') : `<tr><td class="reports-empty" colspan="${Math.max(1, table.columns.length)}">${escapeHtml(reportText('No records.', language))}</td></tr>`}</tbody></table></div>
      <footer>Cutting Plan Optimizer · ${escapeHtml(formatGeneratedAt(context.generatedAt, language))}</footer>
    </section>`)
  )).join('');
}

export function buildReportsPresentationHtml(dashboard = {}, context = {}) {
  const language = reportLanguage(context);
  const resolvedContext = {
    ...context,
    language,
    projectName: text(context.projectName || context.scope?.projectName || dashboard.projectName) || reportText('All projects', language),
    equipmentTag: text(context.equipmentTag || context.scope?.equipmentTag),
    generatedAt: context.generatedAt || new Date(),
  };
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(reportText(dashboard.title || dashboard.label || 'Reports', language))}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    :root { --reports-scale: .7; }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; color: #172b34; font-family: "Segoe UI Variable", "Segoe UI", Arial, sans-serif; }
    body { font-size: calc(10pt * var(--reports-scale)); }
    .reports-page { width: 281mm; height: 194mm; padding: calc(9mm * var(--reports-scale)); border: 1px solid #c7d4d9; background: #fff; display: flex; flex-direction: column; break-after: page; page-break-after: always; overflow: hidden; }
    .reports-page:last-child { break-after: auto; page-break-after: auto; }
    .reports-header { display: flex; justify-content: space-between; gap: calc(8mm * var(--reports-scale)); padding-bottom: calc(5mm * var(--reports-scale)); border-bottom: calc(1.2mm * var(--reports-scale)) solid #22505f; }
    .reports-eyebrow { color: #6b8f9c; font-size: calc(8pt * var(--reports-scale)); font-weight: 700; letter-spacing: .12em; }
    h1 { margin: calc(1.5mm * var(--reports-scale)) 0 calc(1mm * var(--reports-scale)); color: #22505f; font-size: calc(24pt * var(--reports-scale)); line-height: 1.1; }
    .reports-header p { margin: 0; color: #52666e; font-size: calc(11pt * var(--reports-scale)); }
    .reports-header dl { min-width: calc(68mm * var(--reports-scale)); margin: 0; border: 1px solid #c7d4d9; align-self: flex-start; }
    .reports-header dl div { display: grid; grid-template-columns: calc(22mm * var(--reports-scale)) 1fr; border-bottom: 1px solid #dce5e8; }
    .reports-header dl div:last-child { border-bottom: 0; }
    .reports-header dt, .reports-header dd { margin: 0; padding: calc(2mm * var(--reports-scale)); }
    .reports-header dt { background: #edf3f5; color: #52666e; font-weight: 600; }
    .reports-header dd { font-weight: 700; }
    .reports-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(38mm * var(--reports-scale)), 1fr)); gap: calc(3mm * var(--reports-scale)); margin: calc(6mm * var(--reports-scale)) 0; }
    .reports-kpis article { min-height: calc(30mm * var(--reports-scale)); padding: calc(4mm * var(--reports-scale)); border: 1px solid #cad8dc; border-top: calc(1.2mm * var(--reports-scale)) solid #22505f; background: #f8fbfc; }
    .reports-kpis span, .reports-kpis small { display: block; color: #52666e; }
    .reports-kpis strong { display: inline-block; margin-top: calc(2mm * var(--reports-scale)); color: #172b34; font-size: calc(22pt * var(--reports-scale)); }
    .reports-kpis b { margin-left: calc(1mm * var(--reports-scale)); color: #52666e; }
    .reports-kpis small { margin-top: calc(1mm * var(--reports-scale)); }
    .reports-charts { min-height: 0; flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: calc(4mm * var(--reports-scale)); }
    .reports-chart { min-width: 0; min-height: 0; margin: 0; padding: calc(3mm * var(--reports-scale)); border: 1px solid #cad8dc; display: flex; flex-direction: column; }
    .reports-chart figcaption { margin-bottom: calc(2mm * var(--reports-scale)); font-weight: 700; color: #22505f; }
    .reports-chart img { width: 100%; min-height: 0; flex: 1; object-fit: contain; }
    .reports-chart-empty { display: grid; place-items: center; border: 1px dashed #9fb2b9; color: #6c7e85; }
    .reports-header-compact { padding-bottom: calc(3mm * var(--reports-scale)); }
    .reports-header-compact h1 { font-size: calc(18pt * var(--reports-scale)); }
    .reports-table-wrap { min-height: 0; flex: 1; margin-top: calc(5mm * var(--reports-scale)); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: calc(2mm * var(--reports-scale)); border: 1px solid #b9c9cf; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #22505f; color: #fff; font-size: calc(9pt * var(--reports-scale)); }
    tbody tr:nth-child(even) { background: #f2f6f7; }
    .reports-empty { text-align: center; color: #6c7e85; }
    footer { margin-top: calc(3mm * var(--reports-scale)); padding-top: calc(2mm * var(--reports-scale)); border-top: 1px solid #dce5e8; color: #6c7e85; font-size: calc(8pt * var(--reports-scale)); }
    @media screen { body { padding: 8mm; background: #e8eef0; } .reports-page { margin: 0 auto 8mm; box-shadow: 0 4px 16px rgba(34, 80, 95, .16); } }
    @media print { body { background: #fff; } }
  </style>
</head>
<body>
  ${firstPageHtml(dashboard, resolvedContext)}
  ${tablePagesHtml(dashboard, resolvedContext)}
  <script>
  (() => {
    let started = false;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const waitForImage = (image) => {
      if (image.complete) return typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    };
    const printWhenReady = async () => {
      if (started) return;
      started = true;
      try { if (document.fonts?.ready) await document.fonts.ready; } catch (error) { console.warn('Reports could not wait for fonts.', error); }
      await Promise.all([...document.images].map(waitForImage));
      await nextFrame();
      await nextFrame();
      window.focus();
      window.print();
    };
    if (document.readyState === 'complete') printWhenReady();
    else window.addEventListener('load', printWhenReady, { once: true });
  })();
  <\/script>
</body>
</html>`;
}

export async function exportActiveReportExcel(dashboard, context = {}) {
  const language = reportLanguage(context);
  const projectName = text(context.projectName || context.scope?.projectName || dashboard?.projectName);
  const equipmentTag = text(context.equipmentTag || context.scope?.equipmentTag);
  const excelDashboard = {
    ...dashboard,
    tables: presentationTables(dashboard?.tables).map((table) => ({
      ...table,
      rows: (Array.isArray(table.rows) ? table.rows : []).map((row) => {
        const copy = { ...row };
        (table.columns || []).forEach((column) => {
          if (column.format === 'completionStatus') copy[column.key] = reportText(({ NOT_STARTED: 'Not started', PARTIAL: 'Partial', COMPLETE: 'Complete' })[row?.[column.key]] || '—', language);
          if (column.format === 'overdueStatus') copy[column.key] = reportText(row?.[column.key] ? 'Overdue' : 'On time', language);
        });
        return copy;
      }),
    })),
  };
  return exportReportsDashboardExcel(excelDashboard, {
    ...context,
    language,
    projectName: equipmentTag ? `${projectName || reportText('All projects', language)} | TAG ${equipmentTag}` : projectName,
  });
}

export function openReportsPresentation(dashboard, context = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildReportsPresentationHtml(dashboard, { ...context, language: reportLanguage(context) }));
  printWindow.document.close();
  return true;
}
