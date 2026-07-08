/**
 * ExcelJS is used here because Material Coupon generation must preserve
 * an existing XLSX template with styles, row heights, column widths and merges.
 *
 * Known limitation:
 * copying worksheet drawings/images/logos between generated pages may not be
 * fully supported depending on the ExcelJS version loaded in the browser.
 * Page 1 reuses the original template sheet to preserve the original layout
 * as much as possible. Extra pages copy cells/styles/merges and may not copy
 * embedded images.
 */

export const TEMPLATE_TYPE_MATERIAL_COUPON = 'MATERIAL_COUPON';
export const TEMPLATE_ID_MATERIAL_COUPON = 'material_coupon';

export const PRINT_START_ROW = 1;
export const PRINT_END_ROW = 38;

export const HEADER_START_ROW = 1;
export const HEADER_END_ROW = 15;

export const TABLE_HEADER_ROW = 16;

export const ITEM_START_ROW = 17;
export const ITEM_END_ROW = 28;
export const MAX_VISUAL_LINES_PER_PAGE = 12;
export const DESCRIPTION_CHARS_PER_LINE = 36;
export const DESCRIPTION_COLUMN_KEY = 'E';
export const DESCRIPTION_ROW_HEIGHT_PT = 20;

export const FOOTER_TEMPLATE_START_ROW = 30;
export const FOOTER_TEMPLATE_END_ROW = 36;

export const MATERIAL_COUPON_TEMPLATE_MAP = Object.freeze({
  projectName: 'B8',
  clientName: 'E8',
  scope: 'F8',
  couponNo: 'B12',
  issueDate: 'E12',
  workpack: 'F12',
  destination: 'K12',
  page: 'T5',
});

export const MATERIAL_COUPON_ITEM_COLUMN_MAP = Object.freeze({
  sequence: 'B',
  sapCode: 'C',
  itemCategory: 'D',
  description: 'E',
  qty: 'F',
  unit: 'G',
  diaMm: 'H',
  thicknessMm: 'I',
  widthMm: 'J',
  lengthMm: 'K',
  weightKg: 'L',
  materialGrade: 'M',
  traceability: 'N',
  heatNo: 'O',
  mir: 'P',
  equipment: 'Q',
  poItem: 'R',
  nfArrival: 'S',
  notes: 'T',
});

function text(value) {
  return value == null ? '' : String(value);
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && text(value).trim() !== '') ?? '';
}

function getExcelJS() {
  const ExcelJSRef = globalThis.ExcelJS;
  if (!ExcelJSRef) {
    throw new Error('ExcelJS is required to generate Material Coupon from template.');
  }
  return ExcelJSRef;
}

function cloneExcelObject(value) {
  if (value === undefined || value === null) return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {
    // Fall through to JSON clone for ExcelJS style/value objects.
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function columnLettersToNumber(letters) {
  return text(letters).toUpperCase().split('').reduce((sum, char) => (
    sum * 26 + char.charCodeAt(0) - 64
  ), 0);
}

function columnNumberToLetters(number) {
  let value = Number(number);
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters || 'A';
}

function parseCellAddress(address) {
  const match = text(address).replaceAll('$', '').match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    col: columnLettersToNumber(match[1]),
    row: Number(match[2]),
  };
}

function parseRange(range) {
  const [startAddress, endAddress = startAddress] = text(range).split(':');
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return null;
  return {
    top: Math.min(start.row, end.row),
    bottom: Math.max(start.row, end.row),
    left: Math.min(start.col, end.col),
    right: Math.max(start.col, end.col),
  };
}

function formatRange(range) {
  const start = `${columnNumberToLetters(range.left)}${range.top}`;
  const end = `${columnNumberToLetters(range.right)}${range.bottom}`;
  return start === end ? start : `${start}:${end}`;
}

function getMergeRanges(sheet) {
  const merges = sheet?._merges;
  if (!merges) return [];

  const mergeValues = merges instanceof Map ? [...merges.values()] : Object.values(merges);
  return mergeValues
    .map((merge) => merge?.range || merge?.model?.range || text(merge))
    .filter(Boolean);
}

function applyBasicSheetSettings(source, target) {
  target.properties = cloneExcelObject(source.properties || {});
  target.pageSetup = cloneExcelObject(source.pageSetup || {});
  target.pageSetup.printArea = target.pageSetup.printArea || 'A1:U38';
  target.pageMargins = cloneExcelObject(source.pageMargins || {});
  target.views = cloneExcelObject(source.views || []);
  target.headerFooter = cloneExcelObject(source.headerFooter || {});

  for (let columnIndex = columnLettersToNumber('A'); columnIndex <= columnLettersToNumber('U'); columnIndex += 1) {
    const sourceColumn = source.getColumn(columnIndex);
    const targetColumn = target.getColumn(columnIndex);
    if (sourceColumn.width) targetColumn.width = sourceColumn.width;
    if (sourceColumn.hidden) targetColumn.hidden = sourceColumn.hidden;
    if (sourceColumn.style) targetColumn.style = cloneExcelObject(sourceColumn.style);
  }
}

export function calcularLinhasNecessarias(descricao) {
  const length = text(descricao).length;
  return Math.max(1, Math.ceil(length / DESCRIPTION_CHARS_PER_LINE));
}

export function copiarIntervaloCelulas(
  origem,
  destino,
  linhaInicio,
  linhaFim,
  linhaDestinoInicio
) {
  const start = Number(linhaInicio);
  const end = Number(linhaFim);
  const targetStart = Number(linhaDestinoInicio);
  const columnCount = columnLettersToNumber('U');
  const rowSnapshots = [];

  for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
    const row = origem.getRow(rowNumber);
    const cells = [];
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cells.push({
        columnIndex,
        value: cloneExcelObject(cell.value),
        style: cloneExcelObject(cell.style),
        numFmt: cell.numFmt,
        font: cloneExcelObject(cell.font),
        fill: cloneExcelObject(cell.fill),
        border: cloneExcelObject(cell.border),
        alignment: cloneExcelObject(cell.alignment),
        protection: cloneExcelObject(cell.protection),
      });
    }
    rowSnapshots.push({
      offset: rowNumber - start,
      height: row.height,
      hidden: row.hidden,
      outlineLevel: row.outlineLevel,
      cells,
    });
  }

  applyBasicSheetSettings(origem, destino);

  rowSnapshots.forEach((snapshot) => {
    const targetRow = destino.getRow(targetStart + snapshot.offset);
    if (snapshot.height) targetRow.height = snapshot.height;
    targetRow.hidden = snapshot.hidden;
    targetRow.outlineLevel = snapshot.outlineLevel || 0;

    snapshot.cells.forEach((sourceCell) => {
      const targetCell = targetRow.getCell(sourceCell.columnIndex);
      targetCell.value = sourceCell.value;
      targetCell.style = sourceCell.style || {};
      if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
      if (sourceCell.font) targetCell.font = sourceCell.font;
      if (sourceCell.fill) targetCell.fill = sourceCell.fill;
      if (sourceCell.border) targetCell.border = sourceCell.border;
      if (sourceCell.alignment) targetCell.alignment = sourceCell.alignment;
      if (sourceCell.protection) targetCell.protection = sourceCell.protection;
    });

    targetRow.commit?.();
  });

  const rowShift = targetStart - start;
  getMergeRanges(origem).forEach((rangeText) => {
    const range = parseRange(rangeText);
    if (!range || range.top < start || range.bottom > end) return;
    const shiftedRange = {
      ...range,
      top: range.top + rowShift,
      bottom: range.bottom + rowShift,
    };
    try {
      destino.mergeCells(formatRange(shiftedRange));
    } catch {
      // Ignore duplicate/overlapping merges already present in the template.
    }
  });
}

export function preencherCabecalhoMaterialCoupon(sheet, dadosCabecalho = {}) {
  Object.entries(MATERIAL_COUPON_TEMPLATE_MAP).forEach(([key, address]) => {
    sheet.getCell(address).value = dadosCabecalho[key] ?? '';
  });
}

export function preencherItemMaterialCoupon(sheet, rowNumber, item = {}, sequence = 1) {
  const values = {
    sequence,
    sapCode: pickFirst(item.sapCode),
    itemCategory: pickFirst(item.itemCategory, item.itemType, item.category),
    description: pickFirst(item.materialDescription, item.description),
    qty: pickFirst(item.qty, item.quantity),
    unit: pickFirst(item.unit, item.un),
    diaMm: pickFirst(item.diaMm, item.diameterMm, item.diameter),
    thicknessMm: pickFirst(item.thicknessMm, item.thickness, item.thk),
    widthMm: pickFirst(item.widthMm, item.width),
    lengthMm: pickFirst(item.lengthMm, item.length),
    weightKg: pickFirst(item.weightKg, item.weight),
    materialGrade: pickFirst(item.materialGrade, item.material, item.grade),
    traceability: pickFirst(item.traceability, item.trace, item.traceNo),
    heatNo: pickFirst(item.heatNo, item.heat, item.heatNumber),
    mir: pickFirst(item.mir),
    equipment: pickFirst(item.equipment, item.equipmentName),
    poItem: pickFirst(item.poItem, item.poItemNumber, item.item, item.itemPo),
    nfArrival: pickFirst(item.nfArrival),
    notes: pickFirst(item.notes, item.remarks),
  };

  Object.entries(MATERIAL_COUPON_ITEM_COLUMN_MAP).forEach(([key, column]) => {
    sheet.getCell(`${column}${rowNumber}`).value = values[key] ?? '';
  });

  const description = text(values.description);
  const descriptionCell = sheet.getCell(`${DESCRIPTION_COLUMN_KEY}${rowNumber}`);
  descriptionCell.font = { name: 'Arial Narrow', size: 12 };
  descriptionCell.alignment = { wrapText: true, vertical: 'top' };
  const row = sheet.getRow(rowNumber);
  const visualLines = calcularLinhasNecessarias(description);
  row.height = Math.max(row.height || 33, visualLines * DESCRIPTION_ROW_HEIGHT_PT);
}

export function inserirRodape(sheet, templateSheet, linhaDestinoInicio) {
  copiarIntervaloCelulas(
    templateSheet,
    sheet,
    FOOTER_TEMPLATE_START_ROW,
    FOOTER_TEMPLATE_END_ROW,
    linhaDestinoInicio
  );
}

export function criarNovaPagina(workbook, templateSheet, pageNumber) {
  const sheet = workbook.addWorksheet(`Page ${pageNumber}`);
  copiarIntervaloCelulas(templateSheet, sheet, PRINT_START_ROW, PRINT_END_ROW, PRINT_START_ROW);
  applyBasicSheetSettings(templateSheet, sheet);
  return sheet;
}

export function limparAreaItensMaterialCoupon(sheet) {
  for (let rowNumber = ITEM_START_ROW; rowNumber <= ITEM_END_ROW; rowNumber += 1) {
    for (
      let columnIndex = columnLettersToNumber('B');
      columnIndex <= columnLettersToNumber('T');
      columnIndex += 1
    ) {
      sheet.getRow(rowNumber).getCell(columnIndex).value = null;
    }
  }
}

export function copiarPaginaTemplate(workbook, templateSheet, pageNumber) {
  const sheet = criarNovaPagina(workbook, templateSheet, pageNumber);
  limparAreaItensMaterialCoupon(sheet);
  return sheet;
}

export function planejarPaginasMaterialCoupon(items = []) {
  const sourceItems = Array.isArray(items) ? items : [];
  const pages = [];
  const warnings = [];
  let currentPage = { pageNumber: 1, items: [], totalVisualLines: 0 };

  sourceItems.forEach((item, index) => {
    const visualLines = calcularLinhasNecessarias(item?.materialDescription ?? item?.description);
    if (visualLines > MAX_VISUAL_LINES_PER_PAGE) {
      warnings.push(`Item ${index + 1} exceeds the visual line limit and was kept on a dedicated page.`);
    }

    if (
      currentPage.items.length > 0 &&
      currentPage.totalVisualLines + visualLines > MAX_VISUAL_LINES_PER_PAGE
    ) {
      pages.push(currentPage);
      currentPage = { pageNumber: pages.length + 1, items: [], totalVisualLines: 0 };
    }

    currentPage.items.push({ item, visualLines });
    currentPage.totalVisualLines += visualLines;
  });

  if (currentPage.items.length || pages.length === 0) {
    pages.push(currentPage);
  }

  return { pages, warnings };
}

function formatPageLabel(pageNumber, totalPages) {
  return `${String(pageNumber).padStart(2, '0')} of ${String(totalPages).padStart(2, '0')}`;
}

function toArrayBuffer(bufferLike) {
  if (bufferLike instanceof ArrayBuffer) return bufferLike;
  if (ArrayBuffer.isView(bufferLike)) {
    return bufferLike.buffer.slice(
      bufferLike.byteOffset,
      bufferLike.byteOffset + bufferLike.byteLength
    );
  }
  return bufferLike;
}

export async function gerarMaterialCouponExcelBuffer({
  templateArrayBuffer,
  header = {},
  items = [],
  fileName = 'Material_Coupon.xlsx',
} = {}) {
  if (!templateArrayBuffer || Number(templateArrayBuffer.byteLength || 0) <= 0) {
    throw new Error('Template file is empty.');
  }

  const ExcelJSRef = getExcelJS();
  const workbook = new ExcelJSRef.Workbook();
  await workbook.xlsx.load(templateArrayBuffer);

  const templateSheet = workbook.worksheets[0];
  if (!templateSheet) throw new Error('Material Coupon template has no worksheet.');
  templateSheet.pageSetup = templateSheet.pageSetup || {};
  templateSheet.pageSetup.printArea = templateSheet.pageSetup.printArea || 'A1:U38';

  const plan = planejarPaginasMaterialCoupon(items);
  const sheets = [];
  templateSheet.name = 'Page 1';
  limparAreaItensMaterialCoupon(templateSheet);
  sheets.push(templateSheet);

  for (let index = 1; index < plan.pages.length; index += 1) {
    sheets.push(copiarPaginaTemplate(workbook, templateSheet, index + 1));
  }

  const sequenceStarts = [];
  let nextSequence = 1;
  plan.pages.forEach((page, pageIndex) => {
    sequenceStarts[pageIndex] = nextSequence;
    nextSequence += page.items.length;
  });

  const renderPage = (pageIndex) => {
    const page = plan.pages[pageIndex];
    const sheet = sheets[pageIndex];
    preencherCabecalhoMaterialCoupon(sheet, {
      ...header,
      page: formatPageLabel(pageIndex + 1, plan.pages.length),
    });
    page.items.forEach(({ item }, itemIndex) => {
      preencherItemMaterialCoupon(
        sheet,
        ITEM_START_ROW + itemIndex,
        item,
        sequenceStarts[pageIndex] + itemIndex
      );
    });
  };

  plan.pages.forEach((_, index) => renderPage(index));

  const output = await workbook.xlsx.writeBuffer();
  return {
    arrayBuffer: toArrayBuffer(output),
    fileName,
    warnings: plan.warnings,
  };
}

export function downloadArrayBufferAsFile(
  arrayBuffer,
  fileName,
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
) {
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'Material_Coupon.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function gerarMaterialCouponExcel({
  templateArrayBuffer,
  header = {},
  items = [],
  fileName = 'Material_Coupon.xlsx',
  download = true,
} = {}) {
  const result = await gerarMaterialCouponExcelBuffer({
    templateArrayBuffer,
    header,
    items,
    fileName,
  });
  if (download !== false) {
    downloadArrayBufferAsFile(result.arrayBuffer, result.fileName);
  }
  return result;
}

export function generateMaterialCouponTemplateTestData() {
  const descriptions = [
    'CRA SMLS PIPE 6 IN',
    'Short pipe spool material for fabrication release',
    'Long material description prepared to validate wrapping behavior inside the Material Coupon template item description column.',
    'Very long material description prepared to consume multiple visual lines inside the Excel template and force pagination across generated worksheet pages for local validation.',
  ];

  const items = Array.from({ length: 35 }, (_, index) => {
    const description = descriptions[index % descriptions.length];
    return {
      po: `15208${String(index + 1).padStart(2, '0')}`,
      sapCode: `SAP-${String(index + 1).padStart(5, '0')}`,
      itemCategory: index % 2 ? 'PIPE' : 'PLATE',
      materialDescription: description,
      qty: 1,
      unit: 'EA',
      diaMm: index % 2 ? `${168.3 + index}` : '',
      thicknessMm: `${6 + (index % 4)}`,
      widthMm: index % 2 ? '' : `${500 + index}`,
      lengthMm: `${6000 - index * 10}`,
      weightKg: `${100 + index}`,
      materialGrade: index % 2 ? 'S355' : 'DNV25Cr',
      traceability: `GPP1520813-18-${String(index + 1).padStart(3, '0')}`,
      heatNo: `H-${String(62000 + index)}`,
      mir: `MIR-${String(index + 1).padStart(3, '0')}`,
      equipment: `EQ-${String((index % 4) + 1).padStart(2, '0')}`,
      poItem: String(10 + index),
      nfArrival: `NF-${String(9000 + index)}`,
      notes: index % 5 === 0 ? 'Generated test line' : '',
    };
  });

  return {
    header: {
      couponNo: 'MC-TEST-001',
      projectName: 'GRANMORGU B58',
      clientName: 'TOTAL ENERGIES',
      scope: 'Fabrication',
      workpack: 'WP-TEST',
      issueDate: '2026-07-05',
      destination: 'CTCO Yard',
      page: '01 of 01',
    },
    items,
    fileName: 'Material_Coupon_TEST.xlsx',
  };
}

export async function generateMaterialCouponTemplateTest({
  templateArrayBuffer,
  download = true,
} = {}) {
  const testData = generateMaterialCouponTemplateTestData();
  return gerarMaterialCouponExcel({
    templateArrayBuffer,
    header: testData.header,
    items: testData.items,
    fileName: testData.fileName,
    download,
  });
}
