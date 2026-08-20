// Usa a dependência já instalada (SheetJS via CDN, global `XLSX`) — regra 5.
// Não reimplementamos parsing de planilha: isso seria reinventar a roda.
import {
  MATERIAL_COUPON_EXTRACT_COLUMNS,
  buildMaterialCouponDocument,
  buildMaterialCouponExtractRows,
} from '../documents/materialCoupon.js';
import { MATERIAL_COUPON_CONTROL_COLUMNS, buildMaterialCouponControlRows } from '../core/materialCouponControl.js';
import { buildReturnMaterialVoucherDocument } from '../documents/returnMaterialVoucher.js';
import { buildTaskSheetDocument } from '../documents/taskSheet.js';
import {
  PROCUREMENT_ITEM_COLUMNS,
  PROCUREMENT_PO_COLUMNS,
  PROCUREMENT_PROGRESS_COLUMNS,
  PROCUREMENT_RECEIPT_COLUMNS,
  PROCUREMENT_REVISION_COLUMNS,
  PROCUREMENT_UNIT_COLUMNS,
  buildPurchaseOrderExportData,
  buildPurchaseOrderProgressExportData,
} from '../core/procurementExport.js';
import { getCurrentLanguage, normalizeLanguage, t } from '../i18n/index.js';
import {
  EXCEL_EXPORT_IDS,
  addThemedTableWorksheet,
  applyExcelReportCard,
  applyExcelReportTitle,
  createExcelExportWorkbook,
  createExcelReportTheme,
  excelArgb,
  excelColumnLetter,
  finalizeExcelExport,
} from './excelReportTheme.js';
import {
  INVENTORY_MOVEMENT_COLUMNS,
  INVENTORY_PENDING_ARRIVAL_COLUMNS,
  INVENTORY_REGISTER_COLUMNS,
  INVENTORY_SUMMARY_UNIT_COLUMNS,
  buildInventoryExportData,
} from '../core/inventoryExport.js';
import { operationalWorkpackValue } from '../core/workpackRelations.js';

function readExcelWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array' }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function excelWorksheet(workbook, sheetName) {
  const selectedName = sheetName ?? workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedName];
  if (!worksheet) throw new Error(`Worksheet not found: ${selectedName}`);
  return worksheet;
}

export async function listExcelSheetNames(file) {
  const workbook = await readExcelWorkbook(file);
  return [...workbook.SheetNames];
}

export async function readExcelSheetPreview(file, sheetName, maxRows = 15) {
  const workbook = await readExcelWorkbook(file);
  const worksheet = excelWorksheet(workbook, sheetName);
  const rowLimit = Number.isInteger(maxRows) && maxRows >= 0 ? maxRows : 15;
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: true,
  }).slice(0, rowLimit);
}

export async function readExcelFile(file, { raw = false, sheetName, headerRowIndex } = {}) {
  const workbook = await readExcelWorkbook(file);
  const worksheet = excelWorksheet(workbook, sheetName);
  const range = Number.isInteger(headerRowIndex) && headerRowIndex >= 0
    ? { range: headerRowIndex }
    : {};
  return raw
    ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', ...range })
    : XLSX.utils.sheet_to_json(worksheet, range);
}

export async function exportSolutionToExcel(solution, filenameOrOptions = 'Optimized_Cutting_Plan.xlsx') {
  const options = typeof filenameOrOptions === 'string' ? { filename: filenameOrOptions } : (filenameOrOptions || {});
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.CUTTING_PLAN, options);
  const pieceColumns = [
    { key: 'dwgNumber', label: 'DWG Number', width: 28 },
    { key: 'mark', label: 'Mark', width: 20 },
    { key: 'pos', label: 'Position', width: 14 },
    { key: 'length', label: 'Cut Length (mm)', width: 18, type: 'number' },
  ];
  solution.stockUsed.forEach((bar, index) => {
    const utilization = bar.originalLength > 0
      ? (bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim) / bar.originalLength
      : 0;
    addExportTable(workbook, {
      name: `Cut ${index + 1}`,
      title: `Cut Sheet ${index + 1}`,
      subtitle: 'Calculated nesting data for workshop execution.',
      columns: pieceColumns,
      rows: bar.pieces || [],
      metadata: [
        { label: 'Description', value: bar.description },
        { label: 'Traceability', value: bar.traceability },
        { label: 'Material', value: bar.materialGrade },
        { label: 'Utilization', value: utilization, type: 'percent' },
        { label: 'Usable Offcut (mm)', value: bar.remaining, type: 'number' },
      ],
    }, { language, theme });
  });
  if (solution.generatedOffcuts?.length) {
    addExportTable(workbook, {
      name: 'Offcuts',
      title: 'Material Offcuts',
      columns: [
        { key: 'length', label: 'Length (mm)', width: 18, type: 'number' },
        { key: 'materialGrade', label: 'Material', width: 22 },
        { key: 'description', label: 'Description', width: 42 },
        { key: 'traceability', label: 'Traceability', width: 28 },
      ],
      rows: solution.generatedOffcuts,
    }, { language, theme });
  }
  if (!workbook.worksheets.length) throw new Error('Cutting plan has no data to export.');
  return finalizeExcelExport(workbook, options.filename || 'Optimized_Cutting_Plan.xlsx', options);
}

function ensureExcelJs(options = {}) {
  const excelJs = options.ExcelJS || globalThis.ExcelJS;
  if (!excelJs?.Workbook) throw new Error('ExcelJS helper is not available.');
  return excelJs;
}

function filenameSafe(value, fallback) {
  const safe = String(value || fallback).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function excelJsTypedValue(value, type) {
  if (value === '' || value == null) return null;
  if (type === 'date') {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (type === 'number' || type === 'integer' || type === 'percent') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return String(value);
}

function excelReportLanguage(language) {
  return normalizeLanguage(language || getCurrentLanguage());
}

function excelReportText(value, language, variables = {}) {
  return t(value, variables, excelReportLanguage(language));
}

function localizedExcelColumns(columns = [], language) {
  const dateFormat = excelReportLanguage(language) === 'en' ? 'mm/dd/yyyy hh:mm' : 'dd/mm/yyyy hh:mm';
  return columns.map((column) => ({
    ...column,
    label: excelReportText(column.label, language),
    dateFormat: column.dateFormat || dateFormat,
    statusStyle: column.statusStyle ?? /status|classifica[cç][aã]o|classification|v[ií]nculo|link/i.test(`${column.key} ${column.label}`),
    translateValues: column.translateValues ?? false,
  }));
}

function inferExcelColumnType(column = {}) {
  const rawKey = String(column.key || '');
  const key = rawKey.toLowerCase();
  const format = String(column.type || column.format || '').toLowerCase();
  if (format === 'date' || /date|time/.test(format) || /(^|_)(date|timestamp)$/.test(key) || /(Date|At|Timestamp)$/.test(rawKey)) return 'date';
  if (format.includes('%') || /percent$/.test(key)) return 'percent';
  if (format === 'integer' || /(^|_)(count|days|sequence)$/.test(key) || /(count|days|sequence|itemcount|traceabilities)$/.test(key)) return 'integer';
  if (['number', 'weight', 'quantity', 'decimal', 'kg'].includes(format)
    || /(qty|quantity|length|width|height|thickness|diameter|weight|surface|price|duration|ordered|received|missing|available|reserved|issued|consumed|returned|pending|accepted|rejected|hold|balance|utilization)/.test(key)) return 'number';
  return column.type || 'text';
}

function exportExcelColumns(columns = [], language) {
  return localizedExcelColumns(columns.map((column) => {
    const type = inferExcelColumnType(column);
    return {
      ...column,
      type,
      numberFormat: column.numberFormat || (String(column.format || '').includes('%') ? column.format : undefined),
      statusStyle: column.statusStyle ?? /status|availability|inspection|acceptance|classification|current/i.test(`${column.key} ${column.label}`),
    };
  }), language);
}

function createExportWorkbook(exportId, options = {}) {
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date(options.generatedAt || Date.now());
  return createExcelExportWorkbook(ensureExcelJs(options), {
    exportId,
    theme: options.theme,
    creator: options.creator,
    generatedAt,
  });
}

function addExportTable(workbook, {
  name,
  title,
  subtitle,
  columns,
  rows,
  metadata,
  compact,
}, { language, theme } = {}) {
  const localizedColumns = exportExcelColumns(columns, language);
  return addThemedTableWorksheet(workbook, {
    name: excelReportText(name, language),
    title: excelReportText(title || name, language),
    subtitle: excelReportText(subtitle || '{count} record(s) in the selected scope.', language, { count: rows.length }),
    columns: localizedColumns,
    rows,
    metadata: (metadata || []).map((item) => ({ ...item, label: excelReportText(item.label, language) })),
    compact,
    theme,
    valueFor: (record, column) => (/workpack/i.test(`${column.key} ${column.label}`)
      ? operationalWorkpackValue(record?.[column.key])
      : record?.[column.key]),
  });
}

function appendFormattedExcelJsSheet(workbook, {
  name,
  title,
  subtitle,
  columns,
  rows,
  language,
  theme: themeInput,
}) {
  const theme = createExcelReportTheme(themeInput);
  const localizedColumns = localizedExcelColumns(columns, language);
  return addThemedTableWorksheet(workbook, {
    name,
    title,
    subtitle,
    columns: localizedColumns,
    rows,
    theme,
    valueFor: (record, column) => (
      column.translateValues
        ? excelReportText(record[column.key], language)
        : (/workpack/i.test(`${column.key} ${column.label}`) ? operationalWorkpackValue(record[column.key]) : record[column.key])
    ),
  });
}

function appendCuttingSheetSummary(workbook, cuttingSheetRows, cuttingSheetColumns, offcutRows, offcutColumns, generatedAt, { language, theme: themeInput, sheetNames } = {}) {
  const theme = createExcelReportTheme(themeInput);
  const worksheet = workbook.addWorksheet(sheetNames.summary, { views: [{ showGridLines: false }] });
  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = excelReportText('CUTTING SHEETS — OPERATIONAL SUMMARY', language);
  worksheet.getCell('A1').font = { name: theme.fontFamily, size: 16, bold: true, color: { argb: excelArgb(theme.palette.surface) } };
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.primary) } };
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;
  worksheet.getCell('A2').value = excelReportText('Generated at', language);
  worksheet.getCell('B2').value = generatedAt;
  worksheet.getCell('B2').numFmt = excelReportLanguage(language) === 'en' ? 'mm/dd/yyyy hh:mm' : 'dd/mm/yyyy hh:mm';
  const uniqueSheets = new Set(cuttingSheetRows.map((row) => row.cuttingSheetNumber).filter(Boolean)).size;
  const reusable = offcutRows.filter((row) => row.classification === 'Reaproveitável');
  const scrap = offcutRows.filter((row) => row.classification === 'Scrap');
  const cuttingSheetColumn = excelColumnLetter(Math.max(1, cuttingSheetColumns.findIndex((column) => column.key === 'cuttingSheetNumber') + 1));
  const classificationColumn = excelColumnLetter(Math.max(1, offcutColumns.findIndex((column) => column.key === 'classification') + 1));
  const offcutLengthColumn = excelColumnLetter(Math.max(1, offcutColumns.findIndex((column) => column.key === 'lengthMm') + 1));
  const cuttingSheetEndRow = Math.max(5, cuttingSheetRows.length + 4);
  const offcutEndRow = Math.max(5, offcutRows.length + 4);
  const reusableLabel = excelReportText('Reusable', language);
  const cards = [
    [excelReportText('Cutting Sheets', language), { formula: `SUMPRODUCT(('${sheetNames.cuttingSheets}'!${cuttingSheetColumn}5:${cuttingSheetColumn}${cuttingSheetEndRow}<>"")/COUNTIF('${sheetNames.cuttingSheets}'!${cuttingSheetColumn}5:${cuttingSheetColumn}${cuttingSheetEndRow},'${sheetNames.cuttingSheets}'!${cuttingSheetColumn}5:${cuttingSheetColumn}${cuttingSheetEndRow}&""))`, result: uniqueSheets }],
    [excelReportText('Exported parts', language), { formula: `COUNTA('${sheetNames.cuttingSheets}'!${cuttingSheetColumn}5:${cuttingSheetColumn}${cuttingSheetEndRow})`, result: cuttingSheetRows.length }],
    [excelReportText('Reusable offcuts', language), { formula: `COUNTIF('${sheetNames.offcuts}'!${classificationColumn}5:${classificationColumn}${offcutEndRow},"${reusableLabel}")`, result: reusable.length }],
    [excelReportText('Scrap', language), { formula: `COUNTIF('${sheetNames.offcuts}'!${classificationColumn}5:${classificationColumn}${offcutEndRow},"Scrap")`, result: scrap.length }],
    [excelReportText('Reusable length (mm)', language), { formula: `SUMIF('${sheetNames.offcuts}'!${classificationColumn}5:${classificationColumn}${offcutEndRow},"${reusableLabel}",'${sheetNames.offcuts}'!${offcutLengthColumn}5:${offcutLengthColumn}${offcutEndRow})`, result: reusable.reduce((sum, row) => sum + (Number(row.lengthMm) || 0), 0) }],
    [excelReportText('Scrap length (mm)', language), { formula: `SUMIF('${sheetNames.offcuts}'!${classificationColumn}5:${classificationColumn}${offcutEndRow},"Scrap",'${sheetNames.offcuts}'!${offcutLengthColumn}5:${offcutLengthColumn}${offcutEndRow})`, result: scrap.reduce((sum, row) => sum + (Number(row.lengthMm) || 0), 0) }],
  ];
  cards.forEach(([label, value], index) => {
    const column = index + 1;
    const labelCell = worksheet.getCell(4, column);
    const valueCell = worksheet.getCell(5, column);
    labelCell.value = label;
    valueCell.value = value;
    applyExcelReportCard(labelCell, valueCell, { critical: index === 3 || index === 5, theme });
    valueCell.numFmt = index >= 4 ? '#,##0.00' : '#,##0';
    worksheet.getColumn(column).width = index >= 4 ? 25 : 20;
  });
  worksheet.getRow(4).height = 36;
  worksheet.getRow(5).height = 32;
  worksheet.mergeCells('A8:F8');
  worksheet.getCell('A8').value = excelReportText('Operational rule: offcuts of 500 mm or more are reusable; offcuts below 500 mm are classified as scrap.', language);
  worksheet.getCell('A8').font = { name: theme.fontFamily, size: 10, italic: true, color: { argb: excelArgb(theme.palette.mutedText) } };
  worksheet.getCell('A8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.warningBackground) } };
  worksheet.getCell('A8').alignment = { vertical: 'middle', wrapText: true };
  worksheet.getRow(8).height = 28;
  return worksheet;
}

export async function exportCuttingSheetTraceabilityExcel(data = {}, options = {}) {
  const ExcelJSRef = ensureExcelJs(options);
  const language = excelReportLanguage(options.language);
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date(options.generatedAt || Date.now());
  const { workbook, theme } = createExcelExportWorkbook(ExcelJSRef, {
    exportId: EXCEL_EXPORT_IDS.CUTTING_SHEET_TRACEABILITY,
    theme: options.theme,
    creator: options.creator,
    generatedAt,
  });
  const cuttingSheetRows = Array.isArray(data.cuttingSheetRows) ? data.cuttingSheetRows : [];
  const offcutRows = Array.isArray(data.offcutRows) ? data.offcutRows : [];
  const sheetNames = {
    summary: excelReportText('Summary', language),
    cuttingSheets: excelReportText('Cutting Sheets', language),
    offcuts: excelReportText('Material Offcuts', language),
  };
  appendCuttingSheetSummary(workbook, cuttingSheetRows, data.cuttingSheetColumns || [], offcutRows, data.offcutColumns || [], generatedAt, { language, theme, sheetNames });
  appendFormattedExcelJsSheet(workbook, {
    name: sheetNames.cuttingSheets,
    title: excelReportText('CUTTING SHEETS — OPERATIONAL TRACEABILITY', language),
    subtitle: excelReportText('{count} exported piece(s). Length values remain numeric in millimeters.', language, { count: cuttingSheetRows.length }),
    columns: data.cuttingSheetColumns || [],
    rows: cuttingSheetRows,
    language,
    theme,
  });
  appendFormattedExcelJsSheet(workbook, {
    name: sheetNames.offcuts,
    title: excelReportText('MATERIAL OFFCUTS — REUSABLE AND SCRAP', language),
    subtitle: excelReportText('{count} registered offcut(s). Reusable ≥ 500 mm; Scrap < 500 mm.', language, { count: offcutRows.length }),
    columns: data.offcutColumns || [],
    rows: offcutRows,
    language,
    theme,
  });
  const filename = options.filename || `${language === 'en' ? 'Cutting_Sheets' : 'Folhas_de_Corte'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return finalizeExcelExport(workbook, filename, options);
}

function appendInventorySummaryWorksheet(workbook, summary = {}, generatedAt = new Date(), { language, theme } = {}) {
  const kpis = Array.isArray(summary.kpis) ? summary.kpis : [];
  const unitRows = Array.isArray(summary.unitRows) ? summary.unitRows : [];
  return addExportTable(workbook, {
    name: 'Summary',
    title: 'INVENTORY & MATERIAL FLOW SUMMARY',
    subtitle: 'Consolidated inventory, arrival and material-flow indicators.',
    columns: INVENTORY_SUMMARY_UNIT_COLUMNS,
    rows: unitRows,
    metadata: [
      { label: 'Generated at', value: generatedAt, type: 'date' },
      ...kpis.map((kpi) => ({ label: kpi.metric, value: kpi.value, type: typeof kpi.value === 'number' ? 'number' : 'text' })),
    ],
  }, { language, theme });
}

export const MTO_EXPORT_COLUMNS = Object.freeze([
  ['free', 'Free', 10], ['drawing', 'Drawing', 26], ['revision', 'Revision', 16], ['mark', 'Mark', 16], ['pos', 'Position', 14],
  ['qty', 'Quantity', 12], ['description', 'Description', 42], ['cutLength', 'Cut Length [mm]', 18], ['requiredLength', 'Required Length [mm]', 20],
  ['identCode', 'IDENT CODE', 22], ['tag', 'Tag', 18], ['weightKg', 'Weight [kg]', 14], ['externalSurfaceM2', 'External Surface [m²]', 20],
  ['paintingSurfaceM2', 'Painting Surface [m²]', 20], ['icon', 'Icon', 12], ['positionStatus', 'Position Status', 18],
  ['constructionActivity', 'Construction Activity', 24], ['equipmentName', 'Equipment', 28],
  ['material', 'Material', 22], ['line', 'Line', 18], ['type', 'Type', 18], ['mountErection', 'Mount / Erection', 18],
  ['instrument', 'Instrument', 18], ['discipline', 'Discipline', 16], ['profile', 'Profile', 24], ['priority', 'Priority', 12],
  ['status', 'Status', 16],
].map(([key, label, width]) => ({ key, label, width })));

export const MTO_IMPORT_TEMPLATE_COLUMNS = Object.freeze([
  ['drawing', 'Drawing', 28, true, '263221-SGU-JU-PI-DA-001', 'Número do desenho de fabricação.'],
  ['revision', 'Revision', 12, false, '00', 'Revisão do desenho.'],
  ['mark', 'Mark', 22, true, 'AS01JU01 (SPOOL A)', 'Marca ou spool da peça.'],
  ['pos', 'Position', 14, true, '1A', 'Posição única da peça dentro da marca.'],
  ['qty', 'Quantity', 14, true, 1, 'Quantidade de peças. Deve ser maior que zero.'],
  ['description', 'Description', 44, false, 'TUBO D168,3 x 19,1', 'Descrição técnica do item.'],
  ['cutLength', 'Length/mm', 16, true, 1742.69, 'Comprimento unitário de corte em milímetros.'],
  ['material', 'Material', 20, true, 'DNV25Cr', 'Material ou grau aplicável.'],
  ['identCode', 'IdentCode', 22, false, 'PP-SD-168-19', 'Código de identificação do material.'],
  ['tag', 'Tag', 18, false, 'SK-101', 'TAG físico do equipamento, quando disponível.'],
  ['equipmentName', 'Equipment', 28, false, 'Gas Injection Skid', 'Nome do equipamento.'],
  ['weightKg', 'Weight/kg', 14, false, 122.25, 'Peso total da linha em quilogramas.'],
  ['externalSurfaceM2', 'ExternalSurface/m2', 20, false, 0.92, 'Área de superfície externa em m².'],
  ['paintingSurfaceM2', 'PaintingSurface/m2', 20, false, 0.92, 'Área de pintura em m².'],
  ['constructionActivity', 'ConstructionActivity', 24, false, 'C.CNS.2488', 'Atividade de construção.'],
  ['discipline', 'Discipline', 16, false, 'PIPING', 'Disciplina responsável.'],
  ['line', 'Line', 18, false, '10-GI-001', 'Número da linha.'],
  ['type', 'Type', 16, false, 'PIPE', 'Tipo do item.'],
  ['mountErection', 'Mount/Erection', 18, false, 'SHOP', 'Indicação de montagem ou ereção.'],
  ['instrument', 'Instrument', 18, false, '', 'Instrumento relacionado, quando aplicável.'],
  ['profile', 'Profile', 20, false, 'PIPE', 'Perfil ou seção do material.'],
  ['priority', 'Priority', 14, false, 'NORMAL', 'Prioridade operacional.'],
  ['free', 'Free', 10, false, 'A', 'Campo livre da origem.'],
  ['icon', 'Icone', 12, false, '1A', 'Referência visual ou ícone da posição.'],
  ['positionStatus', 'PositionStatus', 18, false, 'OPEN', 'Status da posição na origem.'],
].map(([key, label, width, required, example, guidance]) => ({ key, label, width, required, example, guidance })));

function appendMtoImportInstructionsWorksheet(workbook, { language, theme } = {}) {
  return addExportTable(workbook, {
    name: 'Instructions',
    title: 'MTO IMPORT TEMPLATE',
    subtitle: 'Fill in the MTO Template sheet and keep its headers on row 1.',
    columns: [
      { key: 'column', label: 'Column', width: 24 },
      { key: 'required', label: 'Required', width: 14 },
      { key: 'example', label: 'Example', width: 30 },
      { key: 'guidance', label: 'Guidance', width: 64 },
    ],
    rows: MTO_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
      column: column.label,
      required: excelReportText(column.required ? 'Yes' : 'No', language),
      example: column.example,
      guidance: column.guidance,
    })),
    metadata: [
      { label: 'Important', value: 'Do not rename, remove or merge headers. Do not add titles above row 1.' },
      { label: 'Required fields', value: 'Drawing, Mark, Position, Quantity, Length/mm and Material.' },
      { label: 'Numeric values', value: 'Quantity and Length/mm must be greater than zero. Use numeric values without formulas.' },
    ],
  }, { language, theme });
}

export async function exportMtoImportTemplateExcel(options = {}) {
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.MTO_IMPORT_TEMPLATE, options);
  addExportTable(workbook, {
    name: 'MTO Template',
    title: 'MTO Template',
    columns: MTO_IMPORT_TEMPLATE_COLUMNS,
    rows: [],
    compact: true,
  }, { language: 'en', theme });
  appendMtoImportInstructionsWorksheet(workbook, { language, theme });
  return finalizeExcelExport(workbook, options.filename || 'MTO_Import_Template.xlsx', options);
}

export async function exportMtoItemsExcel(items = [], options = {}) {
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.MTO_ITEMS, options);
  const rows = Array.isArray(items) ? items : [];
  addExportTable(workbook, { name: 'MTO', title: 'MTO — OPERATIONAL EXPORT', columns: MTO_EXPORT_COLUMNS, rows }, { language, theme });
  const project = options.projectName || options.projectId;
  return finalizeExcelExport(workbook, options.filename || `MTO_Export${project ? `_${filenameSafe(project, 'Project')}` : ''}.xlsx`, options);
}

function excelDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date;
}

export async function exportTaskSheetExcel(taskSheet, options = {}) {
  const documentData = buildTaskSheetDocument(taskSheet);
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.TASK_SHEET, options);
  documentData.sections.forEach((section) => {
    const columns = documentData.columns.map((column) => column.key === 'actionQuantity'
      ? { ...column, label: section.quantityLabel }
      : column);
    const rows = section.lines.map((line) => ({
      ...line,
      plannedDate: excelDate(line.plannedDate),
      actualDate: excelDate(line.actualDate),
    }));
    addExportTable(workbook, {
      name: section.label.slice(0, 31),
      title: documentData.title,
      subtitle: `WORKSTATION: ${section.label.toUpperCase()}`,
      columns,
      rows,
      metadata: [
        { label: 'Task Sheet', value: documentData.documentNumber },
        { label: 'Revision', value: documentData.revision },
        { label: 'Date', value: excelDate(documentData.documentDate), type: 'date' },
      ],
    }, { language, theme });
  });
  if (!documentData.sections.length) throw new Error('Task Sheet has no lines to export.');
  return finalizeExcelExport(workbook, options.filename || `${filenameSafe(documentData.documentNumber, 'Task_Sheet')}.xlsx`, options);
}

export async function exportPurchaseOrderDatabaseExcel(data, options = {}) {
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.PROCUREMENT_DATABASE, options);
  const exported = buildPurchaseOrderExportData(data, options);
  const progress = buildPurchaseOrderProgressExportData(data, options);
  [
    ['Procurement Summary', 'PROCUREMENT — OPERATIONAL SUMMARY', 'Consolidated quantities and arrival status by Purchase Order and unit of measure.', PROCUREMENT_PROGRESS_COLUMNS, progress.progressRows],
    ['Purchase Orders', 'PURCHASE ORDERS — MASTER DATA', 'Operational Purchase Order references without internal system identifiers.', PROCUREMENT_PO_COLUMNS, exported.poRows],
    ['PO Items', 'PURCHASE ORDER ITEMS', 'Ordered, received, accepted and pending quantities by PO item.', PROCUREMENT_ITEM_COLUMNS, exported.itemRows],
    ['Receipts', 'MATERIAL RECEIPTS', 'Receipt, invoice, quality and delivered quantity records.', PROCUREMENT_RECEIPT_COLUMNS, exported.receiptRows],
    ['Material Units', 'RECEIVED MATERIAL UNITS', 'Physical traceability, dimensions, stock status and storage position.', PROCUREMENT_UNIT_COLUMNS, exported.materialUnitRows],
    ['PO Revisions', 'PURCHASE ORDER REVISION HISTORY', 'Revision history represented by operational references.', PROCUREMENT_REVISION_COLUMNS, exported.revisionRows],
  ].forEach(([name, title, subtitle, columns, rows]) => addExportTable(workbook, { name, title, subtitle, columns, rows }, { language, theme }));
  const scope = options.purchaseOrderNumber ? `_${filenameSafe(options.purchaseOrderNumber, 'PO')}` : '';
  return finalizeExcelExport(workbook, options.filename || `Procurement_PO_Database${scope}.xlsx`, options);
}

export async function exportPurchaseOrderProgressExcel(data, options = {}) {
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.PROCUREMENT_PROGRESS, options);
  const exported = buildPurchaseOrderProgressExportData(data, options);
  addExportTable(workbook, { name: 'PO Progress', title: 'PO Progress', columns: PROCUREMENT_PROGRESS_COLUMNS, rows: exported.progressRows }, { language, theme });
  addExportTable(workbook, { name: 'Item Progress', title: 'Item Progress', columns: PROCUREMENT_ITEM_COLUMNS, rows: exported.itemRows }, { language, theme });
  const scope = options.purchaseOrderNumber ? `_${filenameSafe(options.purchaseOrderNumber, 'PO')}` : '';
  return finalizeExcelExport(workbook, options.filename || `Procurement_Arrival_Progress${scope}.xlsx`, options);
}

export async function exportInventoryDatabaseExcel(data, options = {}) {
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.INVENTORY_DATABASE, options);
  const generatedAt = options.generatedAt || new Date();
  const exported = buildInventoryExportData(data, { ...options, now: options.now || generatedAt });
  addExportTable(workbook, { name: 'Inventory Register', title: 'Inventory Register', columns: INVENTORY_REGISTER_COLUMNS, rows: exported.registerRows }, { language, theme });
  addExportTable(workbook, { name: 'Movements', title: 'Inventory Movements', columns: INVENTORY_MOVEMENT_COLUMNS, rows: exported.movementRows }, { language, theme });
  appendInventorySummaryWorksheet(workbook, exported.summary, generatedAt, { language, theme });
  addExportTable(workbook, { name: 'Pending Arrival', title: 'Pending Arrival', columns: INVENTORY_PENDING_ARRIVAL_COLUMNS, rows: exported.pendingArrivalRows }, { language, theme });
  const scope = options.projectName || options.projectId;
  const suffix = scope ? `_${filenameSafe(scope, 'Project')}` : '';
  return finalizeExcelExport(workbook, options.filename || `Inventory_Material_Flow${suffix}.xlsx`, options);
}

export async function exportMaterialCouponExtract(coupons, options = {}) {
  const rows = buildMaterialCouponExtractRows(coupons);
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.MATERIAL_COUPON_EXTRACT, options);
  addExportTable(workbook, { name: 'MC Extract', title: 'Material Coupon Extract', columns: MATERIAL_COUPON_EXTRACT_COLUMNS, rows }, { language, theme });
  return finalizeExcelExport(workbook, options.filename || 'Material_Coupon_Extract.xlsx', options);
}

export async function exportMaterialCouponControlDatabase(coupons, options = {}) {
  const rows = buildMaterialCouponControlRows(coupons, options);
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.MATERIAL_COUPON_CONTROL, options);
  addExportTable(workbook, { name: 'MC Control Database', title: 'Material Coupon Control Database', columns: MATERIAL_COUPON_CONTROL_COLUMNS, rows }, { language, theme });
  return finalizeExcelExport(workbook, options.filename || 'Material_Coupon_Control_Database.xlsx', options);
}

export async function exportMaterialCouponExcel(coupon, options = {}) {
  const documentData = buildMaterialCouponDocument(coupon);
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.MATERIAL_COUPON, options);
  addExportTable(workbook, {
    name: 'Material Coupon',
    title: `Material Coupon — ${documentData.documentNumber}`,
    columns: documentData.columns,
    rows: documentData.rows,
    metadata: [
      { label: 'Project', value: documentData.metadata.project },
      { label: 'Client', value: documentData.metadata.client },
      { label: 'Destination', value: documentData.metadata.materialDestination },
      { label: 'Date', value: excelDate(documentData.metadata.mcDate), type: 'date' },
    ],
  }, { language, theme });
  return finalizeExcelExport(workbook, options.filename || `${filenameSafe(documentData.documentNumber, 'Material_Coupon')}.xlsx`, options);
}

export async function exportReturnMaterialVoucherExcel(rmv, options = {}) {
  const documentData = buildReturnMaterialVoucherDocument(rmv);
  const language = excelReportLanguage(options.language);
  const { workbook, theme } = createExportWorkbook(EXCEL_EXPORT_IDS.RETURN_MATERIAL_VOUCHER, options);
  addExportTable(workbook, {
    name: 'RMV',
    title: `Returned Material Voucher — ${documentData.documentNumber}`,
    columns: documentData.columns.map((column) => ({ ...column, width: ['description', 'notes', 'traceability'].includes(column.key) ? 24 : 14 })),
    rows: documentData.rows,
    metadata: [
      { label: 'Project', value: documentData.metadata.project },
      { label: 'Origin', value: documentData.metadata.origin },
      { label: 'Destination', value: documentData.metadata.destination },
      { label: 'Date', value: excelDate(documentData.metadata.date), type: 'date' },
    ],
  }, { language, theme });
  return finalizeExcelExport(workbook, options.filename || `${filenameSafe(documentData.documentNumber, 'RMV')}.xlsx`, options);
}

function reportTitle(value, fallback = 'Campo') {
  const words = String(value || fallback)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function reportPercentage(column = {}) {
  const format = String(column.type || column.format || column.excelFormat || '').toLowerCase();
  return format === 'percent' || format.includes('%')
    || String(column.unit || '').trim() === '%';
}

function reportExcelFormat(column = {}) {
  if (column.excelFormat) return column.excelFormat;
  if (reportPercentage(column)) return '0.0%';
  const semanticFormat = String(column.type || column.format || column.unit || '').trim().toLowerCase();
  if (['number', 'weight', 'quantity', 'decimal', 'kg'].includes(semanticFormat)) return '#,##0.00';
  if (['integer', 'count'].includes(semanticFormat)) return '#,##0';
  return '';
}

function reportExcelType(column = {}) {
  if (reportPercentage(column)) return 'percent';
  const semanticFormat = String(column.type || column.format || column.unit || '').trim().toLowerCase();
  if (semanticFormat === 'date' || semanticFormat.includes('datetime')) return 'date';
  if (['integer', 'count'].includes(semanticFormat)) return 'integer';
  if (['number', 'weight', 'quantity', 'decimal', 'kg'].includes(semanticFormat)) return 'number';
  return 'text';
}

function reportCellValue(value, column = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value ?? '';
  if (!reportPercentage(column)) return value;
  return Math.abs(value) > 1 ? value / 100 : value;
}

function normalizeReportKpis(kpis = {}) {
  const entries = Array.isArray(kpis)
    ? kpis.map((item, index) => [item?.key || item?.id || String(index + 1), item])
    : Object.entries(kpis || {});
  return entries.map(([key, input]) => {
    const item = input && typeof input === 'object' && !Array.isArray(input) ? input : { value: input };
    const formatSource = {
      type: item.type || item.kind,
      format: item.format,
      excelFormat: item.excelFormat,
      unit: item.unit,
    };
    const rawValue = item.rawValue ?? item.numericValue ?? item.value ?? '';
    return {
      indicator: item.label || item.title || item.name || reportTitle(key, 'Indicador'),
      value: reportCellValue(rawValue, formatSource),
      unit: item.unit || (reportPercentage(formatSource) ? '%' : ''),
      excelFormat: reportExcelFormat(formatSource),
    };
  });
}

function reportTables(tables = []) {
  if (Array.isArray(tables)) return tables;
  return Object.entries(tables || {}).map(([title, table]) => (
    Array.isArray(table) ? { title, rows: table } : { title, ...(table || {}) }
  ));
}

function normalizeReportTable(table = {}, index = 0) {
  const rows = Array.isArray(table.rows) ? table.rows : Array.isArray(table.records) ? table.records : Array.isArray(table.data) ? table.data : [];
  const suppliedColumns = Array.isArray(table.columns) ? table.columns : [];
  const keys = suppliedColumns.length
    ? suppliedColumns.map((column) => typeof column === 'string' ? column : column.key).filter(Boolean)
    : [...new Set(rows.flatMap((row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : []))];
  const columns = keys.map((key, columnIndex) => {
    const supplied = suppliedColumns.find((column) => (typeof column === 'string' ? column : column.key) === key) || {};
    const descriptor = typeof supplied === 'string' ? { key: supplied } : supplied;
    return {
      key,
      label: descriptor.label || descriptor.title || reportTitle(key),
      width: descriptor.width || 18,
      type: reportExcelType(descriptor),
      numberFormat: reportExcelFormat(descriptor),
      statusStyle: /status|prazo|availability|readiness/i.test(`${key} ${descriptor.label || descriptor.title || ''}`),
      translateValues: /status|prazo|availability|readiness/i.test(`${key} ${descriptor.label || descriptor.title || ''}`),
      percentage: reportPercentage(descriptor),
      columnIndex,
    };
  });
  const records = rows.map((row) => Object.fromEntries(columns.map((column, columnIndex) => {
    const value = Array.isArray(row) ? row[columnIndex] : row?.[column.key];
    return [column.key, reportCellValue(value, column.percentage ? { type: 'percent' } : column)];
  })));
  return {
    title: table.title || table.label || table.name || `Tabela ${index + 1}`,
    columns: columns.map(({ percentage, columnIndex, ...column }) => column),
    records,
  };
}

function safeWorksheetName(value, fallback, usedNames) {
  const base = String(value || fallback).replace(/[\\/?*\[\]:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || fallback;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    const marker = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

function appendReportsDashboardSummary(workbook, dashboard, kpis, {
  language,
  theme: themeInput,
  generatedAt,
  projectName,
  usedNames,
} = {}) {
  const theme = createExcelReportTheme(themeInput);
  const name = safeWorksheetName(excelReportText('Summary', language), excelReportText('Summary', language), usedNames);
  const worksheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] });
  applyExcelReportTitle(worksheet, {
    title: `REPORTS — ${excelReportText(dashboard.title || dashboard.label || dashboard.name || 'Dashboard', language)}`,
    subtitle: excelReportText('Executive and operational summary for the selected scope.', language),
    lastColumn: 4,
    theme,
  });
  const metadata = [
    [excelReportText('Project', language), projectName],
    [excelReportText('Generated at', language), generatedAt],
  ];
  metadata.forEach(([label, value], index) => {
    const row = index + 4;
    const labelCell = worksheet.getCell(row, 1);
    const valueCell = worksheet.getCell(row, 2);
    labelCell.value = label;
    valueCell.value = value;
    labelCell.font = { name: theme.fontFamily, size: 10, bold: true, color: { argb: excelArgb(theme.palette.mutedText) } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.alternateRow) } };
    valueCell.font = { name: theme.fontFamily, size: 10, bold: true, color: { argb: excelArgb(theme.palette.text) } };
    if (value instanceof Date) valueCell.numFmt = excelReportLanguage(language) === 'en' ? 'mm/dd/yyyy hh:mm' : 'dd/mm/yyyy hh:mm';
  });
  worksheet.getColumn(1).width = 24;
  worksheet.getColumn(2).width = 34;

  if (!kpis.length) {
    worksheet.getCell('A8').value = excelReportText('No indicators available for this report.', language);
    worksheet.getCell('A8').font = { name: theme.fontFamily, italic: true, color: { argb: excelArgb(theme.palette.mutedText) } };
    return worksheet;
  }
  kpis.forEach((kpi, index) => {
    const column = (index % 4) + 1;
    const row = 8 + Math.floor(index / 4) * 3;
    const labelCell = worksheet.getCell(row, column);
    const valueCell = worksheet.getCell(row + 1, column);
    labelCell.value = excelReportText(kpi.indicator, language);
    valueCell.value = excelJsTypedValue(kpi.value, kpi.excelFormat === '0.0%' ? 'percent' : (typeof kpi.value === 'number' ? 'number' : 'text'));
    applyExcelReportCard(labelCell, valueCell, { theme });
    valueCell.numFmt = kpi.excelFormat || (typeof kpi.value === 'number' ? '#,##0.00' : '@');
    if (kpi.unit && kpi.unit !== '%' && typeof valueCell.value === 'number') valueCell.numFmt = `${valueCell.numFmt} "${kpi.unit}"`;
    worksheet.getColumn(column).width = Math.max(worksheet.getColumn(column).width || 0, 24);
    worksheet.getRow(row).height = 34;
    worksheet.getRow(row + 1).height = 32;
  });
  return worksheet;
}

/**
 * Exports the active Reports dashboard through the shared formatted workbook
 * standard. KPIs may be an array or object; tables may be descriptors or an
 * object keyed by table title.
 */
export async function exportReportsDashboardExcel(dashboard = {}, options = {}) {
  const usedNames = new Set();
  const language = excelReportLanguage(options.language);
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date(options.generatedAt || Date.now());
  const validGeneratedAt = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
  const projectName = String(options.projectName || '').trim() || excelReportText('All projects', language);
  const kpis = normalizeReportKpis(dashboard.kpis);
  const { workbook, theme } = createExcelExportWorkbook(ensureExcelJs(options), {
    exportId: EXCEL_EXPORT_IDS.REPORTS_DASHBOARD,
    theme: options.theme,
    creator: options.creator,
    generatedAt: validGeneratedAt,
  });
  appendReportsDashboardSummary(workbook, dashboard, kpis, {
    language,
    theme,
    generatedAt: validGeneratedAt,
    projectName,
    usedNames,
  });

  reportTables(dashboard.tables).map(normalizeReportTable).forEach((table, index) => {
    const localizedTitle = excelReportText(table.title, language);
    const sheetName = safeWorksheetName(localizedTitle, excelReportText('Table {number}', language, { number: index + 1 }), usedNames);
    appendFormattedExcelJsSheet(workbook, {
      name: sheetName,
      title: localizedTitle,
      subtitle: excelReportText('{count} record(s) in the selected scope.', language, { count: table.records.length }),
      columns: table.columns,
      rows: table.records,
      language,
      theme,
    });
  });

  const datePart = validGeneratedAt.toISOString().slice(0, 10);
  const defaultFilename = `Reports_${filenameSafe(projectName, 'All_Projects')}_${filenameSafe(dashboard.title || dashboard.label, 'Dashboard')}_${datePart}.xlsx`;
  return finalizeExcelExport(workbook, options.filename || defaultFilename, options);
}
