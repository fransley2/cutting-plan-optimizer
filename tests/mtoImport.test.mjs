import assert from 'node:assert/strict';
import {
  decodeMtoTextFromArrayBuffer,
  normalizeMtoHeaderKey,
  parseMtoCsvText,
  normalizeMtoRow,
  parseMtoRows,
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

console.log('mtoImport tests passed');
