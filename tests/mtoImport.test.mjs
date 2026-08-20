import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeMtoTextFromArrayBuffer,
  mtoColumnMappingFromSuggestions,
  normalizeMtoHeaderKey,
  parseMtoCsvText,
  normalizeMtoRow,
  parseMtoRows,
  suggestMtoColumnMappings,
  validateMtoItem,
} from '../src/data/mtoImport.js';

const header = 'Free;DrawingNº;Revision;Mark;Position;Quantity;Description;Length/mm;IdentCode;Tag;Weight/kg;ExternalSurface/m2;PaintingSurface/m2;Icone;PositionStatus;ConstructionActivity;Material;Line;Type;Mount/Erection;Instrument;Discipline;Rev,Type;Rev,Code;ABSS;ABSSubssemblydraw;ABSSubssemblydrawrev,;ABSA;ABSAssemblydraw;ABSAssemblydrawrev,;ABSB;ABSBlockdraw;ABSBlockdrawrev,;ABSW;ABSWorkPackdraw;ABSWorkPackdrawrev,;ABSE;ABSErectionBlockdraw;ABSErectionBlockdrawrev,;SBSWorkpack;SBSArea;SBSClass;SBSFunctionalGroup';
const row = 'A;263221-SGU-JU-PI-DA-013;A;AS01JU04;1A;1;TUBO D168,3 x 19,1;1742,69;PP-SD-168-19;;122,25;0,92;0,92;1A;;C.CNS.2487;DNV25Cr;LINE-1;Pipe;;;Piping;REVTYPE;REVCODE;ABSS1;SUBDRAW;SUBREV;ABSA1;ASSDRAW;ASSREV;ABSB1;BLOCKDRAW;BLOCKREV;ABSW1;WORKDRAW;WORKREV;ABSE1;ERECDRAW;ERECREV;WP-01;AREA-01;CLASS-A;FG-01';
const engineeringCsv = [header, row].join('\n');

const cp1252HeaderBytes = Uint8Array.from([
  ...Buffer.from('Free;DrawingN', 'latin1'),
  0xBA,
  ...Buffer.from(';Revision', 'latin1'),
]);
const decoded = decodeMtoTextFromArrayBuffer(cp1252HeaderBytes.buffer);
assert.equal(decoded, 'Free;DrawingNº;Revision');

assert.equal(normalizeMtoHeaderKey('DrawingNº'), normalizeMtoHeaderKey('DrawingNo'));
assert.equal(normalizeMtoHeaderKey('DrawingN°'), normalizeMtoHeaderKey('DrawingNo'));
assert.equal(normalizeMtoHeaderKey('Drawing Nº'), normalizeMtoHeaderKey('DrawingNo'));
assert.equal(normalizeMtoHeaderKey('DrawingN�'), 'drawingn');

const rows = parseMtoCsvText(engineeringCsv);
assert.equal(rows.length, 1);
assert.equal(rows[0]['DrawingNº'], '263221-SGU-JU-PI-DA-013');
assert.equal(rows[0].SBSFunctionalGroup, 'FG-01');

const trailing = parseMtoCsvText('A;B;C;\n1;;;\n');
assert.deepEqual(trailing[0], { A: '1', B: '', C: '', '': '' });

const normalized = normalizeMtoRow(rows[0], { batchId: 'B-1', projectId: 'P-1', sourceRowNumber: 7 });
assert.equal(normalized.drawing, '263221-SGU-JU-PI-DA-013');
assert.equal(normalized.revision, 'A');
assert.equal(normalized.mark, 'AS01JU04');
assert.equal(normalized.pos, '1A');
assert.equal(normalized.qty, 1);
assert.equal(normalized.description, 'TUBO D168,3 x 19,1');
assert.equal(normalized.cutLength, 1742.69);
assert.equal(normalized.requiredLength, 1742.69);
assert.equal(normalized.identCode, 'PP-SD-168-19');
assert.equal(normalized.weightKg, 122.25);
assert.equal(normalized.externalSurfaceM2, 0.92);
assert.equal(normalized.paintingSurfaceM2, 0.92);
assert.equal(normalized.icon, '1A');
assert.equal(normalized.constructionActivity, 'C.CNS.2487');
assert.equal(normalized.material, 'DNV25Cr');
assert.equal(normalized.type, 'Pipe');
assert.equal(normalized.discipline, 'Piping');
assert.equal(normalized.profile, 'TUBO D168,3 x 19,1');
assert.equal(normalized.metadata.originalRow['DrawingNº'], rows[0]['DrawingNº']);
assert.equal(normalized.metadata.engineering.SBSWorkpack, 'WP-01');
assert.equal(normalized.metadata.engineering.ABSW, 'ABSW1');

const replacementHeader = normalizeMtoRow({ 'DrawingN�': 'D-1', Mark: 'M-1', Position: 'P-1', Quantity: '1', Material: 'A36', 'Length/mm': '1000' });
assert.equal(replacementHeader.drawing, 'D-1');

test('suggests and applies the Shop Drawing MTO column mapping', () => {
  const sourceRow = {
    'Shop Drawing Name': '263221-SGU-JU-PI-DA-001',
    'Shop Drawing Revision Number': '0',
    SPOOL: 'AS01JU01',
    Position: '1A',
    Qty: '1',
    'Material Description Detail': 'TUBO D168,3 x 19,1',
    'Lenght (mm)': '1742,69',
    'IDENT (Mark for Gemapi)': 'PP-SD-168-19',
    'Line Specification': 'DNV25Cr',
    Notes: '31-WJ-10-1010',
    Type: 'PIPE',
    'Prefabrication / Erection': 'FAB',
    'Discipline (Piping)': 'PIPING',
  };
  const suggestions = suggestMtoColumnMappings(Object.keys(sourceRow));
  const mapping = mtoColumnMappingFromSuggestions(suggestions);
  assert.equal(mapping.drawing, 'Shop Drawing Name');
  assert.equal(mapping.mark, 'SPOOL');
  assert.equal(mapping.cutLength, 'Lenght (mm)');
  assert.equal(mapping.material, 'Line Specification');
  assert.equal(suggestions.find(({ field }) => field === 'material').confidence, 'review');

  const item = normalizeMtoRow(sourceRow, { columnMapping: mapping });
  assert.equal(item.drawing, '263221-SGU-JU-PI-DA-001');
  assert.equal(item.mark, 'AS01JU01');
  assert.equal(item.description, 'TUBO D168,3 x 19,1');
  assert.equal(item.cutLength, 1742.69);
  assert.equal(item.material, 'DNV25Cr');
  assert.equal(item.line, '31-WJ-10-1010');
  assert.deepEqual(validateMtoItem(item), []);
});

const withUnit = normalizeMtoRow({ Drawing: 'D', Mark: 'M', Position: 'P', Quantity: 2, Material: 'A36', 'Length/mm': '1500 mm' });
assert.equal(withUnit.cutLength, 1500);
assert.equal(withUnit.requiredLength, 3000);

const withEquipmentName = normalizeMtoRow({
  Drawing: 'D',
  Mark: 'M',
  Position: 'P',
  Quantity: 1,
  Material: 'A36',
  'Length/mm': '1000',
  'Equipment Name': 'PLEM MODULE',
});
assert.equal(withEquipmentName.equipmentName, 'PLEM MODULE');

const errors = validateMtoItem({ drawing: '', mark: '', pos: '', qty: 0, material: '', cutLength: 0 });
assert.deepEqual(errors, [
  'Missing drawing',
  'Missing mark',
  'Missing POS',
  'Missing material',
  'Invalid quantity',
  'Invalid cut length',
]);

const inputRows = [
  { 'DrawingNº': 'D-1', Mark: 'M-1', Position: 'P-1', Quantity: '1', Material: 'A36', 'Length/mm': '1000' },
  { 'DrawingNº': '', Mark: 'M-2', Position: 'P-2', Quantity: '0', Material: 'A36', 'Length/mm': '0' },
];
const before = JSON.stringify(inputRows);
const parsed = parseMtoRows(inputRows, { batchId: 'B-2', projectId: 'P-2' });
assert.equal(parsed.batch.rowCount, 2);
assert.equal(parsed.batch.acceptedCount, 1);
assert.equal(parsed.batch.rejectedCount, 1);
assert.equal(parsed.acceptedItems.length, 1);
assert.equal(parsed.rejectedItems.length, 1);
assert.equal(parsed.acceptedItems[0].requiredLength, 1000);
assert.equal(parsed.acceptedItems[0].validationErrors.length, 0);
assert.equal(parsed.rejectedItems[0].status, 'invalid');
assert.equal(parsed.acceptedItems[0].metadata.originalRow['DrawingNº'], 'D-1');
assert.equal(JSON.stringify(inputRows), before);

const engineeringParsed = parseMtoRows(rows);
assert.equal(engineeringParsed.acceptedItems.length, 1);
assert.equal(engineeringParsed.rejectedItems.length, 0);

const validBaseRow = {
  Drawing: 'D-LOCALIZED',
  Mark: 'M-LOCALIZED',
  Position: 'P-LOCALIZED',
  Quantity: '1',
  Material: 'A36',
  'Length/mm': '1000',
};

test('normalizes localized MTO engineering measurements and preserves parsing evidence', () => {
  const localized = normalizeMtoRow({
    ...validBaseRow,
    Quantity: '1.234,56',
    'Length/mm': '6 000',
    'Weight/kg': '12,5',
    'ExternalSurface/m2': '1,234.56',
    'PaintingSurface/m2': `6\u00A0000`,
  });

  assert.equal(localized.qty, 1234.56);
  assert.equal(localized.cutLength, 6000);
  assert.equal(localized.weightKg, 12.5);
  assert.equal(localized.externalSurfaceM2, 1234.56);
  assert.equal(localized.paintingSurfaceM2, 6000);
  assert.equal(localized.requiredLength, 1234.56 * 6000);
  assert.deepEqual(localized.metadata.numericParsing.qty, {
    rawValue: '1.234,56', parsedValue: 1234.56, valid: true, detectedFormat: 'pt-BR',
  });
  assert.equal(localized.metadata.originalRow.Quantity, '1.234,56');
});

test('accepts a cut length followed by a unit', () => {
  const item = normalizeMtoRow({ ...validBaseRow, 'Length/mm': '6000 mm' });
  assert.equal(item.cutLength, 6000);
  assert.equal(item.metadata.numericParsing.cutLength.rawValue, '6000 mm');
  assert.equal(item.metadata.numericParsing.cutLength.valid, true);
});

test('distinguishes invalid, missing, zero, and negative quantity values', () => {
  const cases = [
    ['abc', null, 'Invalid quantity format'],
    ['', null, 'Missing quantity'],
    ['0', 0, 'Invalid quantity'],
    ['-2', -2, 'Invalid quantity'],
  ];
  cases.forEach(([rawValue, parsedValue, expectedError]) => {
    const item = normalizeMtoRow({ ...validBaseRow, Quantity: rawValue });
    assert.equal(item.qty, parsedValue);
    assert.deepEqual(validateMtoItem(item).filter((error) => error.includes('quantity')), [expectedError]);
  });
});

test('distinguishes invalid and missing cut length values without calculating required length', () => {
  const invalid = normalizeMtoRow({ ...validBaseRow, 'Length/mm': 'abc' });
  const missing = normalizeMtoRow({ ...validBaseRow, 'Length/mm': '' });
  assert.equal(invalid.cutLength, null);
  assert.equal(invalid.requiredLength, null);
  assert.equal(invalid.metadata.numericParsing.cutLength.rawValue, 'abc');
  assert.equal(invalid.metadata.numericParsing.cutLength.valid, false);
  assert.ok(validateMtoItem(invalid).includes('Invalid cut length format'));
  assert.ok(validateMtoItem(missing).includes('Missing cut length'));
  assert.equal(validateMtoItem(missing).includes('Invalid cut length format'), false);
});

test('parses an explicit localized required length and strictly normalizes source row numbers', () => {
  const explicit = normalizeMtoRow(validBaseRow, { requiredLength: '1.234,56', sourceRowNumber: '7' });
  assert.equal(explicit.requiredLength, 1234.56);
  assert.equal(explicit.metadata.numericParsing.requiredLength.detectedFormat, 'pt-BR');
  assert.equal(explicit.sourceRowNumber, 7);
  assert.equal(normalizeMtoRow(validBaseRow, { sourceRowNumber: '1,000' }).sourceRowNumber, 0);
  assert.equal(normalizeMtoRow(validBaseRow, { sourceRowNumber: '7.5' }).sourceRowNumber, 0);
  assert.equal(normalizeMtoRow(validBaseRow, { sourceRowNumber: '7 mm' }).sourceRowNumber, 0);
});

test('keeps a file with any invalid numeric line in the rejected set', () => {
  const result = parseMtoRows([
    validBaseRow,
    { ...validBaseRow, Mark: 'M-INVALID', Quantity: 'abc' },
  ]);
  assert.equal(result.acceptedItems.length, 1);
  assert.equal(result.rejectedItems.length, 1);
  assert.equal(result.batch.rejectedCount, 1);
  assert.ok(result.rejectedItems[0].validationErrors.includes('Invalid quantity format'));
});

console.log('mtoImport tests passed');
