import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  listExcelSheetNames,
  readExcelFile,
  readExcelSheetPreview,
} from '../src/data/excel.js';
import { parseMtoFile } from '../src/data/mtoImport.js';

const sheets = {
  Cover: [
    ['Document', 'MTO'],
    ['Revision', 'A'],
  ],
  Data: [
    ['Generated report'],
    ['Drawing', 'Mark', 'POS', 'Quantity', 'Material', 'Length/mm'],
    ['DWG-200', 'MK-2', '20', 3, 'A36', 1250],
  ],
};

class FileReaderMock {
  readAsArrayBuffer() {
    this.onload?.({ target: { result: new ArrayBuffer(1) } });
  }
}

function rowsToObjects(rows, range = 0) {
  const selected = rows.slice(range);
  const headers = selected[0] || [];
  return selected.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? '']),
  ));
}

before(() => {
  globalThis.FileReader = FileReaderMock;
  globalThis.XLSX = {
    read() {
      return {
        SheetNames: ['Cover', 'Data'],
        Sheets: { Cover: { rows: sheets.Cover }, Data: { rows: sheets.Data } },
      };
    },
    utils: {
      sheet_to_json(worksheet, options = {}) {
        const range = Number.isInteger(options.range) ? options.range : 0;
        if (options.header === 1) return worksheet.rows.slice(range).map((row) => [...row]);
        return rowsToObjects(worksheet.rows, range);
      },
    },
  };
});

after(() => {
  delete globalThis.FileReader;
  delete globalThis.XLSX;
});

test('lists every worksheet name in workbook order', async () => {
  assert.deepEqual(await listExcelSheetNames({}), ['Cover', 'Data']);
});

test('returns a raw preview from the requested worksheet', async () => {
  assert.deepEqual(await readExcelSheetPreview({}, 'Data', 2), [
    ['Generated report'],
    ['Drawing', 'Mark', 'POS', 'Quantity', 'Material', 'Length/mm'],
  ]);
});

test('parses an explicit worksheet with a header outside the first row', async () => {
  const parsed = await parseMtoFile({ name: 'mto.xlsx', size: 10, type: '' }, {
    sheetName: 'Data',
    headerRowIndex: 1,
    projectId: 'project-1',
  });

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].drawing, 'DWG-200');
  assert.equal(parsed.items[0].mark, 'MK-2');
  assert.equal(parsed.items[0].pos, '20');
  assert.equal(parsed.items[0].material, 'A36');
  assert.equal(parsed.items[0].qty, 3);
  assert.equal(parsed.items[0].cutLength, 1250);
});

test('keeps the legacy first-sheet and first-row behavior when options are omitted', async () => {
  assert.deepEqual(await readExcelFile({}), [
    { Document: 'Revision', MTO: 'A' },
  ]);
});
