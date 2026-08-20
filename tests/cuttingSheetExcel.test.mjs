import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCuttingSheetTraceabilityExcel } from '../src/data/excel.js';

function columnIndex(label) {
  return [...label].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

class FakeCell { constructor() { this.value = null; } }

class FakeRow {
  constructor(sheet, index) { this.sheet = sheet; this.index = index; this.height = 0; }
  set values(values) { values.forEach((value, index) => { this.sheet.getCell(this.index, index + 1).value = value; }); }
  eachCell(options, callback) {
    const handler = typeof options === 'function' ? options : callback;
    for (let column = 1; column <= this.sheet.columnCount; column += 1) handler(this.sheet.getCell(this.index, column), column);
  }
}

class FakeWorksheet {
  constructor(name, options = {}) { this.name = name; this.options = options; this.pageSetup = options.pageSetup || {}; this.cells = new Map(); this.rows = new Map(); this.columns = new Map(); this.rowCount = 0; this.columnCount = 0; this.properties = {}; }
  mergeCells() {}
  getCell(row, column) {
    let rowIndex = row; let columnNumber = column;
    if (typeof row === 'string') {
      const match = /^([A-Z]+)(\d+)$/.exec(row);
      columnNumber = columnIndex(match[1]); rowIndex = Number(match[2]);
    }
    this.rowCount = Math.max(this.rowCount, rowIndex); this.columnCount = Math.max(this.columnCount, columnNumber);
    const key = `${rowIndex}:${columnNumber}`;
    if (!this.cells.has(key)) this.cells.set(key, new FakeCell());
    return this.cells.get(key);
  }
  getRow(index) { if (!this.rows.has(index)) this.rows.set(index, new FakeRow(this, index)); return this.rows.get(index); }
  getColumn(index) { if (!this.columns.has(index)) this.columns.set(index, {}); return this.columns.get(index); }
  addRow(values) { const row = this.getRow(this.rowCount + 1); row.values = values; return row; }
}

class FakeWorkbook {
  constructor() { this.worksheets = []; this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) }; }
  addWorksheet(name, options) { const sheet = new FakeWorksheet(name, options); this.worksheets.push(sheet); return sheet; }
}

test('exports typed and formatted Cutting Sheet and offcut worksheets', async () => {
  const createdAt = new Date('2026-07-27T20:48:00.000Z');
  const { workbook, filename } = await exportCuttingSheetTraceabilityExcel({
    cuttingSheetColumns: [
      { key: 'workpack', label: 'Workpack', width: 20 },
      { key: 'createdAt', label: 'Criada em', width: 19, type: 'date' },
      { key: 'nominalLengthMm', label: 'Comprimento nominal (mm)', width: 20, type: 'number' },
    ],
    cuttingSheetRows: [{ workpack: 'Selecione um Workpack', createdAt, nominalLengthMm: 1742.69 }],
    offcutColumns: [{ key: 'classification', label: 'Classificação', width: 18 }, { key: 'lengthMm', label: 'Comprimento (mm)', width: 18, type: 'number' }],
    offcutRows: [{ classification: 'Reaproveitável', lengthMm: 500 }, { classification: 'Scrap', lengthMm: 499 }],
  }, { ExcelJS: { Workbook: FakeWorkbook }, download: false, generatedAt: createdAt });

  assert.equal(filename.endsWith('.xlsx'), true);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Resumo', 'Folhas de Corte', 'Sobras de Material']);
  const cuttingSheets = workbook.worksheets[1];
  assert.equal(cuttingSheets.getCell(5, 1).value, null, 'Workpack placeholder must be blank');
  assert.ok(cuttingSheets.getCell(5, 2).value instanceof Date, 'date must remain typed');
  assert.equal(cuttingSheets.getCell(5, 2).numFmt, 'dd/mm/yyyy hh:mm');
  assert.equal(cuttingSheets.getCell(5, 3).value, 1742.69, 'decimal length must remain numeric');
  assert.equal(cuttingSheets.getCell(5, 3).numFmt, '#,##0.00');
  assert.equal(cuttingSheets.options.views[0].ySplit, 4);
  assert.equal(cuttingSheets.getCell(1, 1).fill.fgColor.argb, 'FF22505F');
  const offcuts = workbook.worksheets[2];
  assert.equal(offcuts.getCell(5, 2).value, 500);
  assert.equal(offcuts.getCell(6, 2).value, 499);
  assert.equal(offcuts.getCell(5, 1).font.bold, true);
});

test('localizes the complete Cutting Sheet workbook when English is active', async () => {
  const { workbook, filename } = await exportCuttingSheetTraceabilityExcel({
    cuttingSheetColumns: [
      { key: 'cuttingSheetNumber', label: 'Folha de Corte', width: 20 },
      { key: 'cuttingSheetStatus', label: 'Status', width: 16, statusStyle: true, translateValues: true },
      { key: 'createdAt', label: 'Criada em', width: 19, type: 'date' },
    ],
    cuttingSheetRows: [{ cuttingSheetNumber: 'B58_FAB_CS-001', cuttingSheetStatus: 'Rascunho', createdAt: new Date('2026-07-27T20:48:00.000Z') }],
    offcutColumns: [
      { key: 'classification', label: 'Classificação', width: 18, statusStyle: true, translateValues: true },
      { key: 'lengthMm', label: 'Comprimento (mm)', width: 18, type: 'number' },
    ],
    offcutRows: [{ classification: 'Reaproveitável', lengthMm: 500 }],
  }, { ExcelJS: { Workbook: FakeWorkbook }, download: false, language: 'en' });

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Cutting Sheets', 'Material Offcuts']);
  assert.equal(workbook.worksheets[0].getCell('A1').value, 'CUTTING SHEETS — OPERATIONAL SUMMARY');
  assert.equal(workbook.worksheets[1].getCell('A4').value, 'Cutting Sheet');
  assert.equal(workbook.worksheets[1].getCell('B5').value, 'Draft');
  assert.equal(workbook.worksheets[1].getCell('C5').numFmt, 'mm/dd/yyyy hh:mm');
  assert.equal(workbook.worksheets[2].getCell('A4').value, 'Classification');
  assert.equal(workbook.worksheets[2].getCell('A5').value, 'Reusable');
  assert.equal(filename.startsWith('Cutting_Sheets_'), true);
});
