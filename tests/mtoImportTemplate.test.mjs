import assert from 'node:assert/strict';
import { MTO_IMPORT_TEMPLATE_COLUMNS, exportMtoImportTemplateExcel } from '../src/data/excel.js';
import { normalizeMtoRow, validateMtoItem } from '../src/data/mtoImport.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const requiredLabels = MTO_IMPORT_TEMPLATE_COLUMNS.filter((column) => column.required).map((column) => column.label);
assert.deepEqual(requiredLabels, ['Drawing', 'Mark', 'Position', 'Quantity', 'Length/mm', 'Material']);
assert.equal(MTO_IMPORT_TEMPLATE_COLUMNS.some((column) => /(^|\s)(ID|Metadata)(\s|$)/i.test(column.label)), false);

const exampleRow = Object.fromEntries(MTO_IMPORT_TEMPLATE_COLUMNS.map((column) => [column.label, column.example]));
const normalizedExample = normalizeMtoRow(exampleRow);
assert.deepEqual(validateMtoItem(normalizedExample), [], 'the documented examples must satisfy the real MTO parser');
assert.equal(normalizedExample.drawing, '263221-SGU-JU-PI-DA-001');
assert.equal(normalizedExample.cutLength, 1742.69);
assert.equal(normalizedExample.material, 'DNV25Cr');

const { workbook, filename } = await exportMtoImportTemplateExcel({ ExcelJS: FakeExcelJS, download: false, language: 'pt-BR' });
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['MTO Template', 'Instructions']);
assert.deepEqual(
  MTO_IMPORT_TEMPLATE_COLUMNS.map((column, index) => workbook.worksheets[0].getCell(1, index + 1).value),
  MTO_IMPORT_TEMPLATE_COLUMNS.map((column) => column.label),
);
assert.equal(workbook.worksheets[0].getCell('A2').value, null, 'the import sheet must not contain an example row that can be imported accidentally');
assert.equal(workbook.worksheets[1].getCell('A1').value, 'MTO IMPORT TEMPLATE');
assert.equal(workbook.worksheets[1].getCell('A7').value, 'Column');
assert.equal(workbook.worksheets[1].getCell('B8').value, 'Sim');
assert.equal(filename, 'MTO_Import_Template.xlsx');

console.log('MTO import template tests passed');
