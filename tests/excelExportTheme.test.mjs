import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportMaterialCouponControlDatabase,
  exportMaterialCouponExcel,
  exportMaterialCouponExtract,
  exportMtoItemsExcel,
  exportReturnMaterialVoucherExcel,
  exportSolutionToExcel,
} from '../src/data/excel.js';
import {
  DEFAULT_EXCEL_REPORT_THEME,
  EXCEL_EXPORT_IDS,
  EXCEL_EXPORT_THEME_OVERRIDES,
  resolveExcelExportTheme,
} from '../src/data/excelReportTheme.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const baseOptions = Object.freeze({ ExcelJS: FakeExcelJS, download: false, language: 'en' });

test('registers every Excel export profile and isolates a single runtime override', () => {
  assert.deepEqual(Object.keys(EXCEL_EXPORT_THEME_OVERRIDES).sort(), Object.values(EXCEL_EXPORT_IDS).sort());
  const custom = resolveExcelExportTheme(EXCEL_EXPORT_IDS.MTO_ITEMS, { palette: { primary: '#123456' } });
  const inventory = resolveExcelExportTheme(EXCEL_EXPORT_IDS.INVENTORY_DATABASE);
  const future = resolveExcelExportTheme('future-export');
  assert.equal(custom.palette.primary, '123456');
  assert.equal(inventory.palette.primary, DEFAULT_EXCEL_REPORT_THEME.palette.primary);
  assert.equal(future.palette.primary, DEFAULT_EXCEL_REPORT_THEME.palette.primary, 'new exports safely inherit the global theme even before registration');
});

test('applies the shared title theme to every remaining operational and document export', async () => {
  const exports = await Promise.all([
    exportSolutionToExcel({
      stockUsed: [{
        description: 'Bar', traceability: 'TRACE-1', materialGrade: 'S32750', originalLength: 6000, remaining: 500,
        leftTrim: 0, rightTrim: 0, pieces: [{ dwgNumber: 'DWG-1', mark: 'M1', pos: '1', length: 1000 }],
      }],
      generatedOffcuts: [],
    }, baseOptions),
    exportMaterialCouponExtract([], baseOptions),
    exportMaterialCouponControlDatabase([], baseOptions),
    exportMaterialCouponExcel({ number: 'MC-1', metadata: { coupon: { header: { mcCode: 'MC-1' }, lines: [] } } }, baseOptions),
    exportReturnMaterialVoucherExcel({ number: 'RMV-1', returnedItems: [] }, baseOptions),
  ]);
  exports.forEach(({ workbook }) => {
    assert.equal(workbook.worksheets[0].getCell('A1').fill.fgColor.argb, 'FF22505F');
    assert.equal(workbook.worksheets[0].getCell('A1').font.name, 'Segoe UI');
  });
});

test('allows one export to override the palette without affecting the next export', async () => {
  const custom = await exportMtoItemsExcel([], {
    ...baseOptions,
    theme: { palette: { primary: '#123456', secondary: '#789ABC' } },
  });
  const standard = await exportMtoItemsExcel([], baseOptions);
  assert.equal(custom.workbook.worksheets[0].getCell('A1').fill.fgColor.argb, 'FF123456');
  assert.equal(custom.workbook.worksheets[0].getCell('A4').fill.fgColor.argb, 'FF789ABC');
  assert.equal(standard.workbook.worksheets[0].getCell('A1').fill.fgColor.argb, 'FF22505F');
  assert.equal(standard.workbook.worksheets[0].getCell('A4').fill.fgColor.argb, 'FF6B8F9C');
});
