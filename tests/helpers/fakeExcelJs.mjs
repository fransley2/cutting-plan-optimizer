function columnIndex(label) {
  return [...label].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

export class FakeExcelCell {
  constructor() { this.value = null; }
}

export class FakeExcelRow {
  constructor(sheet, index) { this.sheet = sheet; this.index = index; this.height = 0; }
  set values(values) { values.forEach((value, index) => { this.sheet.getCell(this.index, index + 1).value = value; }); }
  eachCell(options, callback) {
    const handler = typeof options === 'function' ? options : callback;
    for (let column = 1; column <= this.sheet.columnCount; column += 1) handler(this.sheet.getCell(this.index, column), column);
  }
}

export class FakeExcelWorksheet {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.pageSetup = options.pageSetup || {};
    this.cells = new Map();
    this.rows = new Map();
    this.columns = new Map();
    this.rowCount = 0;
    this.columnCount = 0;
    this.properties = {};
  }
  mergeCells() {}
  getCell(row, column) {
    let rowIndex = row;
    let columnNumber = column;
    if (typeof row === 'string') {
      const match = /^([A-Z]+)(\d+)$/.exec(row);
      columnNumber = columnIndex(match[1]);
      rowIndex = Number(match[2]);
    }
    this.rowCount = Math.max(this.rowCount, rowIndex);
    this.columnCount = Math.max(this.columnCount, columnNumber);
    const key = `${rowIndex}:${columnNumber}`;
    if (!this.cells.has(key)) this.cells.set(key, new FakeExcelCell());
    return this.cells.get(key);
  }
  getRow(index) {
    if (!this.rows.has(index)) this.rows.set(index, new FakeExcelRow(this, index));
    return this.rows.get(index);
  }
  getColumn(index) {
    if (!this.columns.has(index)) this.columns.set(index, {});
    return this.columns.get(index);
  }
  addRow(values) {
    const row = this.getRow(this.rowCount + 1);
    row.values = values;
    return row;
  }
}

export class FakeExcelWorkbook {
  constructor() {
    this.worksheets = [];
    this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) };
  }
  addWorksheet(name, options) {
    const sheet = new FakeExcelWorksheet(name, options);
    this.worksheets.push(sheet);
    return sheet;
  }
}

export const FakeExcelJS = Object.freeze({ Workbook: FakeExcelWorkbook });
