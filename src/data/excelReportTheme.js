export const DEFAULT_EXCEL_REPORT_THEME = Object.freeze({
  fontFamily: 'Segoe UI',
  palette: Object.freeze({
    primary: '22505F',
    secondary: '6B8F9C',
    text: '263238',
    mutedText: '52656D',
    surface: 'FFFFFF',
    alternateRow: 'F5F8F9',
    border: 'D9E2E5',
    warningBackground: 'FFF2CC',
    warningText: '7F6000',
    dangerBackground: 'FCE4D6',
    dangerText: '8B2C2C',
    successBackground: 'E2F0D9',
    successText: '2F6B2F',
    infoBackground: 'DDEBF7',
  }),
});

export const EXCEL_EXPORT_IDS = Object.freeze({
  CUTTING_PLAN: 'cutting-plan',
  CUTTING_SHEET_TRACEABILITY: 'cutting-sheet-traceability',
  INVENTORY_DATABASE: 'inventory-database',
  MATERIAL_COUPON: 'material-coupon',
  MATERIAL_COUPON_CONTROL: 'material-coupon-control',
  MATERIAL_COUPON_EXTRACT: 'material-coupon-extract',
  MTO_IMPORT_TEMPLATE: 'mto-import-template',
  MTO_ITEMS: 'mto-items',
  PROCUREMENT_DATABASE: 'procurement-database',
  PROCUREMENT_PROGRESS: 'procurement-progress',
  REPORTS_DASHBOARD: 'reports-dashboard',
  RETURN_MATERIAL_VOUCHER: 'return-material-voucher',
  TASK_SHEET: 'task-sheet',
});

/**
 * Change only the desired entry to customize one export without affecting the
 * global theme or any other workbook. Runtime options.theme still has priority.
 */
export const EXCEL_EXPORT_THEME_OVERRIDES = Object.freeze({
  [EXCEL_EXPORT_IDS.CUTTING_PLAN]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.CUTTING_SHEET_TRACEABILITY]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.INVENTORY_DATABASE]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.MATERIAL_COUPON]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.MATERIAL_COUPON_CONTROL]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.MATERIAL_COUPON_EXTRACT]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.MTO_IMPORT_TEMPLATE]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.MTO_ITEMS]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.PROCUREMENT_DATABASE]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.PROCUREMENT_PROGRESS]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.REPORTS_DASHBOARD]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.RETURN_MATERIAL_VOUCHER]: Object.freeze({}),
  [EXCEL_EXPORT_IDS.TASK_SHEET]: Object.freeze({}),
});

function color(value, fallback) {
  const normalized = String(value || fallback || '').trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

export function createExcelReportTheme(overrides = {}) {
  const paletteOverrides = overrides?.palette || {};
  const palette = Object.fromEntries(Object.entries(DEFAULT_EXCEL_REPORT_THEME.palette).map(([key, value]) => (
    [key, color(paletteOverrides[key], value)]
  )));
  return {
    ...DEFAULT_EXCEL_REPORT_THEME,
    ...overrides,
    fontFamily: String(overrides?.fontFamily || DEFAULT_EXCEL_REPORT_THEME.fontFamily),
    palette,
  };
}

export function resolveExcelExportTheme(exportId, runtimeOverride = {}) {
  const configured = EXCEL_EXPORT_THEME_OVERRIDES[exportId] || {};
  return createExcelReportTheme({
    ...configured,
    ...runtimeOverride,
    palette: {
      ...(configured.palette || {}),
      ...(runtimeOverride?.palette || {}),
    },
  });
}

export function createExcelExportWorkbook(ExcelJSRef, {
  exportId,
  theme,
  creator = 'Cutting Plan Optimize',
  generatedAt = new Date(),
} = {}) {
  if (!ExcelJSRef?.Workbook) throw new Error('ExcelJS helper is not available.');
  const workbook = new ExcelJSRef.Workbook();
  const validDate = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime()) ? generatedAt : new Date();
  workbook.creator = creator;
  workbook.created = validDate;
  workbook.modified = validDate;
  workbook.calcProperties = { ...(workbook.calcProperties || {}), fullCalcOnLoad: true };
  return { workbook, theme: resolveExcelExportTheme(exportId, theme), generatedAt: validDate };
}

export function excelArgb(value) {
  return `FF${color(value, '000000')}`;
}

export function excelColumnLetter(index) {
  let label = '';
  let value = index;
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function normalizedStatus(value) {
  return String(value || '').trim().toLocaleLowerCase('en')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function excelReportStatusStyle(value, themeInput = {}) {
  const theme = createExcelReportTheme(themeInput);
  const status = normalizedStatus(value);
  if (['reaproveitavel', 'reusable', 'vinculado', 'linked', 'cortada', 'cut', 'retornada ao estoque', 'returned to stock', 'complete', 'completo'].includes(status)) {
    return { fill: theme.palette.successBackground, font: theme.palette.successText };
  }
  if (status.includes('scrap') || ['cancelada', 'cancelled', 'nao vinculado', 'not linked', 'atrasado', 'overdue', 'blocked', 'bloqueado'].includes(status)) {
    return { fill: theme.palette.dangerBackground, font: theme.palette.dangerText };
  }
  if (status.includes('rascunho') || status.includes('draft') || status.includes('aguardando') || status.includes('waiting') || status === 'partial' || status === 'parcial') {
    return { fill: theme.palette.warningBackground, font: theme.palette.warningText };
  }
  if (status.includes('emitida') || status.includes('issued') || status.includes('rmv') || status.includes('execucao') || status.includes('progress')) {
    return { fill: theme.palette.infoBackground, font: theme.palette.primary };
  }
  return null;
}

export function applyExcelReportTitle(worksheet, { title, subtitle, lastColumn, theme: themeInput } = {}) {
  const theme = createExcelReportTheme(themeInput);
  const endColumn = Math.max(1, lastColumn || 1);
  worksheet.mergeCells(1, 1, 1, endColumn);
  worksheet.mergeCells(2, 1, 2, endColumn);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title || '';
  titleCell.font = { name: theme.fontFamily, size: 16, bold: true, color: { argb: excelArgb(theme.palette.surface) } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.primary) } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = subtitle || '';
  subtitleCell.font = { name: theme.fontFamily, size: 10, italic: true, color: { argb: excelArgb(theme.palette.mutedText) } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  worksheet.getRow(2).height = 22;
}

export function applyExcelReportHeader(row, themeInput = {}) {
  const theme = createExcelReportTheme(themeInput);
  row.height = 34;
  row.eachCell((cell) => {
    cell.font = { name: theme.fontFamily, size: 10, bold: true, color: { argb: excelArgb(theme.palette.surface) } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.secondary) } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: excelArgb(theme.palette.primary) } } };
  });
}

export function applyExcelReportDataRow(row, columns, rowIndex, themeInput = {}) {
  const theme = createExcelReportTheme(themeInput);
  row.height = 20;
  row.eachCell({ includeEmpty: true }, (cell, columnIndex) => {
    const column = columns[columnIndex - 1] || {};
    cell.font = { name: theme.fontFamily, size: 10, color: { argb: excelArgb(theme.palette.text) } };
    cell.alignment = { vertical: 'middle', horizontal: ['number', 'integer', 'percent'].includes(column.type) ? 'right' : 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: excelArgb(theme.palette.border) } } };
    if (rowIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.alternateRow) } };
    if (column.type === 'date' && cell.value) cell.numFmt = column.dateFormat || 'dd/mm/yyyy hh:mm';
    if (column.type === 'number' && cell.value != null) cell.numFmt = column.numberFormat || '#,##0.00';
    if (column.type === 'integer' && cell.value != null) cell.numFmt = column.numberFormat || '#,##0';
    if (column.type === 'percent' && cell.value != null) cell.numFmt = column.numberFormat || '0.0%';
    const statusStyle = column.statusStyle ? excelReportStatusStyle(cell.value, theme) : null;
    if (statusStyle) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(statusStyle.fill) } };
      cell.font = { ...cell.font, bold: true, color: { argb: excelArgb(statusStyle.font) } };
    }
  });
}

export function applyExcelReportCard(labelCell, valueCell, { critical = false, theme: themeInput } = {}) {
  const theme = createExcelReportTheme(themeInput);
  labelCell.font = { name: theme.fontFamily, size: 10, bold: true, color: { argb: excelArgb(theme.palette.surface) } };
  labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.secondary) } };
  labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  valueCell.font = { name: theme.fontFamily, size: 18, bold: true, color: { argb: excelArgb(critical ? theme.palette.dangerText : theme.palette.primary) } };
  valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function typedExcelValue(value, type) {
  if (value === '' || value == null) return null;
  if (type === 'date') {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (['number', 'integer', 'percent'].includes(type)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (type === 'boolean') return Boolean(value);
  return String(value);
}

export function addThemedTableWorksheet(workbook, {
  name,
  title,
  subtitle = '',
  columns = [],
  rows = [],
  metadata = [],
  compact = false,
  theme: themeInput,
  valueFor = (record, column) => record?.[column.key],
} = {}) {
  const theme = createExcelReportTheme(themeInput);
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: compact ? 1 : metadata.length + 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const lastColumn = Math.max(columns.length, 2);
  if (!compact) applyExcelReportTitle(worksheet, { title, subtitle, lastColumn, theme });
  if (!compact) metadata.forEach((item, index) => {
    const rowNumber = index + 4;
    const labelCell = worksheet.getCell(rowNumber, 1);
    const valueCell = worksheet.getCell(rowNumber, 2);
    labelCell.value = item.label || '';
    valueCell.value = typedExcelValue(item.value, item.type || 'text');
    labelCell.font = { name: theme.fontFamily, size: 10, bold: true, color: { argb: excelArgb(theme.palette.mutedText) } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelArgb(theme.palette.alternateRow) } };
    valueCell.font = { name: theme.fontFamily, size: 10, color: { argb: excelArgb(theme.palette.text) } };
    if (item.type === 'date' && valueCell.value) valueCell.numFmt = item.dateFormat || 'dd/mm/yyyy hh:mm';
  });
  const headerRowNumber = compact ? 1 : metadata.length + 4;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.values = columns.map((column) => column.label);
  applyExcelReportHeader(headerRow, theme);
  columns.forEach((column, index) => { worksheet.getColumn(index + 1).width = column.width || 14; });
  rows.forEach((record, rowIndex) => {
    const row = worksheet.addRow(columns.map((column, columnIndex) => typedExcelValue(
      valueFor(record, column, columnIndex),
      column.type || 'text',
    )));
    applyExcelReportDataRow(row, columns, rowIndex, theme);
  });
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: Math.max(headerRowNumber, headerRowNumber + rows.length), column: Math.max(1, columns.length) },
  };
  worksheet.pageSetup.printTitlesRow = compact ? '1:1' : `1:${headerRowNumber}`;
  return worksheet;
}

export async function finalizeExcelExport(workbook, filename, { download = true } = {}) {
  if (download === false) return { workbook, filename };
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return { workbook, filename };
}
