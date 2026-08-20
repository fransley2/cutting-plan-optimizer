import assert from 'node:assert/strict';
import { exportTaskSheetExcel } from '../src/data/excel.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const { workbook, filename } = await exportTaskSheetExcel({
  number: 'B58-0016-TS-001', title: 'WORKPACK B58-0016 - TASK SHEET', revision: '00', documentDate: '2026-07-15',
  lines: [
    { workstation: 'CUTTING', drawingNo: 'DWG-019', lengthMm: 1743, weightKg: 122.48, actionQuantity: 1, durationHours: 1, plannedDate: '2026-07-16', completed: false },
    { workstation: 'BEVELING', drawingNo: 'DWG-019', lengthMm: 1743, weightKg: 122.48, actionQuantity: 2, durationHours: 4, plannedDate: '2026-08-04', completed: true },
  ],
}, { ExcelJS: FakeExcelJS, download: false, language: 'en' });

assert.equal(filename, 'B58-0016-TS-001.xlsx');
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Cutting', 'Beveling']);
assert.equal(workbook.worksheets[0].getCell(8, 7).value, 1743, 'length must remain numeric');
assert.equal(workbook.worksheets[0].getCell(8, 13).value, 1, 'duration must remain numeric');
assert.ok(workbook.worksheets[0].getCell(8, 14).value instanceof Date, 'planned date must be exported as a typed date');
assert.equal(workbook.worksheets[0].getCell('A1').fill.fgColor.argb, 'FF22505F');

console.log('taskSheet export tests passed');
