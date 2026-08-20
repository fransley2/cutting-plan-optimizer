import test from 'node:test';
import assert from 'node:assert/strict';
import { exportReportsDashboardExcel } from '../src/data/excel.js';
import { exportActiveReportExcel } from '../src/ui/reportsExport.js';

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
  constructor(name, options = {}) {
    this.name = name; this.options = options; this.pageSetup = options.pageSetup || {}; this.cells = new Map();
    this.rows = new Map(); this.columns = new Map(); this.rowCount = 0; this.columnCount = 0; this.properties = {};
  }
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

const ExcelJS = { Workbook: FakeWorkbook };

test('exports every Reports dashboard through the shared formatted Excel standard', async () => {
  const { workbook, filename } = await exportReportsDashboardExcel({
    title: 'Material Availability',
    kpis: [
      { key: 'availability', label: 'Material Availability', value: 75.5, type: 'percent' },
      { key: 'receivedWeight', label: 'Peso recebido', value: 1234.5, type: 'weight', unit: 'kg' },
    ],
    tables: [
      {
        title: 'Top / Itens',
        columns: [
          { key: 'material', label: 'Material' },
          { key: 'coverage', label: 'Cobertura', type: 'percent' },
          { key: 'missingWeightKg', label: 'Peso faltante', type: 'number' },
        ],
        rows: [{ material: 'S355', coverage: 40, missingWeightKg: 82.75 }],
      },
      { title: 'Top / Itens', rows: [{ po: '450001' }] },
    ],
  }, {
    ExcelJS,
    download: false,
    language: 'pt-BR',
    projectName: 'B58 / GranMorgu',
    generatedAt: new Date('2026-07-22T12:00:00.000Z'),
  });

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Resumo', 'Top Itens', 'Top Itens 2']);
  const summary = workbook.worksheets[0];
  assert.equal(summary.getCell('B4').value, 'B58 / GranMorgu');
  assert.equal(summary.getCell('A9').value, 0.755, 'whole percentages must be stored as Excel ratios');
  assert.equal(summary.getCell('A9').numFmt, '0.0%');
  assert.equal(summary.getCell('B9').value, 1234.5);
  assert.equal(summary.getCell('B9').numFmt, '#,##0.00 "kg"');
  assert.equal(summary.getCell('A1').fill.fgColor.argb, 'FF22505F');
  const table = workbook.worksheets[1];
  assert.deepEqual(['A4', 'B4', 'C4'].map((cell) => table.getCell(cell).value), ['Material', 'Cobertura', 'Peso faltante']);
  assert.equal(table.getCell('B5').value, 0.4);
  assert.equal(table.getCell('B5').numFmt, '0.0%');
  assert.equal(table.getCell('C5').value, 82.75);
  assert.equal(table.getCell('C5').numFmt, '#,##0.00');
  assert.equal(filename, 'Reports_B58_GranMorgu_Material_Availability_2026-07-22.xlsx');
});

test('uses the active English language in Excel titles, columns, statuses and dates', async () => {
  const { workbook, filename } = await exportActiveReportExcel({
    title: 'Recebimento',
    tables: [{
      title: 'Status PO',
      columns: [
        { key: 'identCode', label: 'IDENT CODE' },
        { key: 'materialGrade', label: 'Material / Grade' },
        { key: 'materialDescription', label: 'Descrição' },
        { key: 'completionStatus', label: 'Status', format: 'completionStatus' },
        { key: 'isOverdue', label: 'Prazo', format: 'overdueStatus' },
      ],
      rows: [{ identCode: '', materialGrade: 'S32750', materialDescription: 'PIPE', completionStatus: 'PARTIAL', isOverdue: true }],
    }],
  }, {
    ExcelJS,
    download: false,
    language: 'en',
    projectName: 'B58 / GranMorgu',
    equipmentTag: 'P-101',
    generatedAt: new Date('2026-07-22T12:00:00.000Z'),
    theme: { palette: { primary: '#123456' } },
  });

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Status PO']);
  const summary = workbook.worksheets[0];
  assert.equal(summary.getCell('A1').value, 'REPORTS — Receiving');
  assert.equal(summary.getCell('B4').value, 'B58 / GranMorgu | TAG P-101');
  assert.equal(summary.getCell('B5').numFmt, 'mm/dd/yyyy hh:mm');
  assert.equal(summary.getCell('A1').fill.fgColor.argb, 'FF123456', 'one theme override changes the shared palette');
  const statusSheet = workbook.worksheets[1];
  assert.deepEqual(['A4', 'B4', 'C4', 'D4', 'E4'].map((cell) => statusSheet.getCell(cell).value), ['IDENT CODE', 'Material / Grade', 'Description', 'Status', 'Deadline']);
  assert.deepEqual(['A5', 'B5', 'C5', 'D5', 'E5'].map((cell) => statusSheet.getCell(cell).value), [null, 'S32750', 'PIPE', 'Partial', 'Overdue']);
  assert.equal(statusSheet.getCell('D5').font.bold, true);
  assert.equal(filename, 'Reports_B58_GranMorgu_TAG_P-101_Recebimento_2026-07-22.xlsx');
});
