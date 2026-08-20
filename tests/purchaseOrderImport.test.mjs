import assert from 'node:assert/strict';
import { PURCHASE_ORDER_IMPORT_COLUMNS, findPurchaseOrderHeaderRow, generatePurchaseOrderIdentCode, inferPurchaseOrderMaterialFields, parseDelimitedPurchaseOrderText, parsePurchaseOrderPdfText, validatePurchaseOrderImportRows } from '../src/core/purchaseOrderImport.js';

const tsv = `VENDOR\tPO Number-PO Item\tTraceability\tIDENT CODE\tDRAWBACK\tEquipment Destination\tTASK\tPO Doc. Date\tPO Rev.\tPO Number\tPO Item\tItem Classification\tItem Type\tItem Description\tDiameter O.D.\tThickness ( MM )\tMaterial Grade\tLength/Area (unit)\tUn.\tPO Quantity\tPO un.
TUBACEX TUBOS INOXIDABLES S.A.\t1520813-18\tGPP1520813-18\tPP-SD-168-19\tYES\t6in DW PROD JUMPERS-T1\tB58 - SDSS PIPES\t28/05/2025\t2\t1520813\t18\tSUPERDUPLEX\tPROCESS PIPE\tCRA SMLS PIPE 6 INCH\t168,3\t19,1\tDNV25Cr\t6,1\tM\t561,2\tM`;
const rows = parseDelimitedPurchaseOrderText(tsv);
assert.equal(rows.length, 1);
assert.equal(rows[0].poNumber, '1520813');
assert.equal(rows[0].poItem, '18');
assert.equal(rows[0].poDocDate, '2025-05-28');
assert.equal(rows[0].diameterOdMm, 168.3);
assert.equal(rows[0].poQuantity, 561.2);
assert.deepEqual(validatePurchaseOrderImportRows(rows)[0], { index: 0, valid: true, errors: [] });

const excelRowsWithPreamble = [
  ['SAIPEM PURCHASE ORDER'], ['Project', 'B58'], [],
  ['VENDOR', 'PO Number', 'PO Item', 'IDENT CODE', 'PO Quantity', 'PO un.'],
  ['TUBACEX', '1520813', '18', 'PP-SD-168-19', 561.2, 'M'],
];
assert.equal(findPurchaseOrderHeaderRow(excelRowsWithPreamble), 3, 'Excel import must skip title and metadata rows');

const pdfRows = parsePurchaseOrderPdfText('Purchase Order No. 1512341, dated 27.02.2025 Revision No. 3 CARBON STEEL INDUCTION BEND OD 273,10MM / CS WT 31,75MM 10 PCS DNV 450 DSU TANGENT LENGTH 500MM RFQ ITEM 11 PR Item. 20', 'PO 1512341_R03_S.I.M.A.S. S.R.L_Supply of CARBON STEEL BENDS.pdf');
assert.equal(pdfRows[0].vendor, 'S.I.M.A.S. S.R.L');
assert.equal(pdfRows[0].poNumber, '1512341');
assert.equal(pdfRows[0].poItem, '2');
assert.equal(pdfRows[0].poQuantity, 10);
assert.equal(pdfRows[0].itemType, 'BEND');

const sapPdfText = `Purchase Order No. 1523734, dated 08.07.2025
Revision No. 2
Vendor code : 3513
Subject:
SSDS BENDS
B58 GRANMORGU
The subject Contract is hereby modified.
1 Commodity code: M0161500D
SUBSEA INDUCTION BENDS
PROD/SPK/TAG:31-WJ-10-1010 8 EA 2.732,11 21.856,88 03.04.2026
JUMPER - DESIGN
DNV 25CR
OD:168,3MM, ID: 130,1MM, WT: 19,10MM, BEND WT: 15,47MM
BEND ANGLE: 90°
BEND RADIUS: 504,9M
TANGENT LENGTH: 0,5M
MR ITEM: 1
PR 11937725 Item. 10
Rq.Center F83552 FLOWLINE PIP SYSTEM`;
const sapPdfRows = parsePurchaseOrderPdfText(sapPdfText, 'PO 1523734_R02_EQUANS SA_SSDS BENDS.PDF');
assert.equal(sapPdfRows.length, 1);
assert.equal(sapPdfRows[0].vendor, 'EQUANS SA');
assert.equal(sapPdfRows[0].vendorCode, '3513');
assert.equal(sapPdfRows[0].task, 'SSDS BENDS B58 GRANMORGU');
assert.equal(sapPdfRows[0].poItem, '1');
assert.equal(sapPdfRows[0].poQuantity, 8);
assert.equal(sapPdfRows[0].poUnit, 'EA');
assert.equal(sapPdfRows[0].unitPrice, 2732.11);
assert.equal(sapPdfRows[0].deliveryDate, '2026-04-03');
assert.match(sapPdfRows[0].itemDescription, /^PROD\/SPK\/TAG:31-WJ-10-1010/);
assert.match(sapPdfRows[0].itemDescription, /MR ITEM: 1$/);
assert.equal(sapPdfRows[0].identCode, 'BD-SD-168-19-90');
assert.equal(sapPdfRows[0].materialCode, '', 'SAP Commodity code is not the material IDENT CODE');
assert.equal(sapPdfRows[0].itemClassification, 'SUPERDUPLEX');
assert.equal(sapPdfRows[0].itemType, 'BEND');
assert.equal(sapPdfRows[0].diameterOdMm, 168.3);
assert.equal(sapPdfRows[0].thicknessMm, 19.1);
assert.equal(sapPdfRows[0].degree, 90);
assert.equal(sapPdfRows[0].materialGrade, 'DNV 25CR');
assert.equal(sapPdfRows[0].lengthArea, 0.5);
assert.equal(sapPdfRows[0].lengthAreaUnit, 'M');
assert.equal(validatePurchaseOrderImportRows(sapPdfRows)[0].valid, false, 'Drawback requires an explicit per-item decision');
assert.match(validatePurchaseOrderImportRows(sapPdfRows)[0].errors.join(' '), /DRAWBACK/);
assert.equal(PURCHASE_ORDER_IMPORT_COLUMNS.some((column) => column.key === 'poNumberItem'), false);
assert.equal(PURCHASE_ORDER_IMPORT_COLUMNS.some((column) => column.key === 'equipmentDestination'), false);

const inchMaterial = inferPurchaseOrderMaterialFields('PROCESS PIPE\nDNV 450 DSU\nOD: 6 IN, WT: 3/4 IN\nUNIT LENGTH: 12 IN');
assert.equal(inchMaterial.itemClassification, 'CARBON STEEL');
assert.equal(inchMaterial.itemType, 'PROCESS PIPE');
assert.equal(inchMaterial.diameterOdMm, 152.4);
assert.equal(inchMaterial.thicknessMm, 19.05);
assert.equal(inchMaterial.lengthArea, 304.8);
assert.equal(inchMaterial.lengthAreaUnit, 'mm');

assert.equal(generatePurchaseOrderIdentCode({ itemClassification: 'CARBON STEEL', itemType: 'PROCESS PIPE', diameterOdMm: '323,8', thicknessMm: '35,5' }), 'PP-CS-323-35');
assert.equal(generatePurchaseOrderIdentCode({ itemClassification: 'CARBON STEEL', itemType: 'BEND', diameterOdMm: '273,1', thicknessMm: '34,9', degree: 90 }), 'BD-CS-273-34-90');
assert.equal(generatePurchaseOrderIdentCode({ itemClassification: 'SUPERDUPLEX', itemType: 'BEND', diameterOdMm: '168,3', thicknessMm: '19,1', degree: 30 }), 'BD-SD-168-19-30');
assert.equal(generatePurchaseOrderIdentCode({ itemClassification: 'SUPERDUPLEX', itemType: 'BEND', diameterOdMm: 168.3, thicknessMm: 19.1 }), '', 'a bend requires its angle');
assert.deepEqual(inferPurchaseOrderMaterialFields('TUBO D168,3 x 19,1\nDNV25Cr'), {
  itemClassification: 'SUPERDUPLEX',
  itemType: 'PROCESS PIPE',
  diameterOdMm: 168.3,
  thicknessMm: 19.1,
  degree: '',
  materialGrade: 'DNV25Cr',
  lengthArea: '',
  lengthAreaUnit: '',
});
assert.equal(generatePurchaseOrderIdentCode({ itemType: 'Pipe', description: 'TUBO D168,3 x 19,1\nDNV25Cr' }), 'PP-SD-168-19');
assert.equal(generatePurchaseOrderIdentCode({ itemType: 'PROCESS PIPE', materialCategory: 'SUPERDUPLEX', diameterOdMm: 168.3, thicknessMm: 19.1 }), 'PP-SD-168-19');

console.log('purchase order import tests passed');
