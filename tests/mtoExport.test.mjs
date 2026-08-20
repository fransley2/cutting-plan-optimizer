import assert from 'node:assert/strict';
import { exportMtoItemsExcel, MTO_EXPORT_COLUMNS } from '../src/data/excel.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const { workbook, filename } = await exportMtoItemsExcel([{
  id: 'mto-1',
  batchId: 'batch-1',
  projectId: 'project-b58',
  drawingRevisionId: 'drawing-revision-1',
  equipmentId: 'equipment-1',
  drawing: '263221-SGU-JU-PI-DA-005',
  revision: '02',
  mark: 'MK-01',
  pos: '01',
  qty: 4,
  cutLength: 1250.5,
  equipmentName: 'Gas Injection Skid',
  sourceRowNumber: 14,
  validationErrors: ['INVALID_IDENT', 'MISSING_EQUIPMENT'],
  metadata: { source: 'test', originalRow: { internal: true } },
}], { projectName: 'B58 / GranMorgu', ExcelJS: FakeExcelJS, download: false, language: 'en' });

assert.equal(workbook.worksheets.length, 1);
assert.equal(workbook.worksheets[0].name, 'MTO');
assert.equal(filename, 'MTO_Export_B58_GranMorgu.xlsx');

const keyIndex = (key) => MTO_EXPORT_COLUMNS.findIndex((column) => column.key === key);
const forbiddenKeys = ['id', 'batchId', 'projectId', 'drawingRevisionId', 'equipmentId', 'sourceRowNumber', 'validationErrors', 'metadata'];
forbiddenKeys.forEach((key) => assert.equal(keyIndex(key), -1, `${key} must not be exposed in the operational MTO export`));
assert.deepEqual(MTO_EXPORT_COLUMNS.slice(0, 5).map((column) => column.label), ['Free', 'Drawing', 'Revision', 'Mark', 'Position']);
const cell = (key) => workbook.worksheets[0].getCell(5, keyIndex(key) + 1).value;
assert.equal(cell('drawing'), '263221-SGU-JU-PI-DA-005');
assert.equal(cell('revision'), '02');
assert.equal(cell('qty'), 4, 'quantity must remain numeric in Excel');
assert.equal(cell('cutLength'), 1250.5, 'dimensions must remain numeric in Excel');
assert.equal(cell('equipmentName'), 'Gas Injection Skid');
const exportedValues = [...workbook.worksheets[0].cells.values()].map((entry) => entry?.value).filter((value) => value != null);
assert.equal(exportedValues.some((value) => ['mto-1', 'batch-1', 'project-b58', 'drawing-revision-1', 'equipment-1'].includes(value)), false);
assert.equal(exportedValues.some((value) => String(value).includes('originalRow')), false);

console.log('mto export tests passed');
