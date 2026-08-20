import assert from 'node:assert/strict';
import { PURCHASE_ORDER_IMPORT_COLUMNS, findPurchaseOrderHeaderRow, inferPurchaseOrderMaterialFields, parseDelimitedPurchaseOrderText, parsePurchaseOrderPdfText, validatePurchaseOrderImportRows } from '../src/core/purchaseOrderImport.js';

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
assert.equal(sapPdfRows[0].itemClassification, 'SUPERDUPLEX');
assert.equal(sapPdfRows[0].itemType, 'BEND');
assert.equal(sapPdfRows[0].diameterOdMm, 168.3);
assert.equal(sapPdfRows[0].thicknessMm, 19.1);
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

console.log('purchase order import tests passed');

const saipemPricingListText = `Purchase Order No. 1524494, dated 18.07.2025
Revision No. 2
VAT registr.No. : 02149710168
Vendor code
: 7895
DALMINE S.P.A.
Subject:
Supply of CS Seamless Line Pipes, Test Rings & Pup Pieces
The subject Contract is hereby modified.
Item Description Quantity UM Price Amount Delivery
Date
USD USD
________________________________________________________________________________________________________
53 FLOWLINE (SINGLE PIPE) / PRODUCTION DELETED 12.102,16
INSTALLATION AIDS - INSTALLATION AIDS FOR PLR
FIELD LOCATION: KBD DW
DNV SMLS 450 SDU
OD: 273,1MM / ID: 207,1MM & WT: 33MM
MR ITEM: 1.8.D
UNIT LENGTH: 12,20M
COATING: BARE
PO 1501339 ITEM 108
1 FLOWLINE (SINGLE PIPE / PUP PIECE / 6,3 M 10.787,31 67.960,05 09.06.2026
TEST RING PIPE)/GAS INJECTION - TESTING - WELDING &
NDT/TESTING - WELDING & NDT
DNV SMLS 450 DSU
OD: 273.10MM/ID: 215,94MM & WT: 28,58MM
COATING: BARE
PO 1501339 ITEM 46
Vendor
7895
DALMINE S.P.A.
Purchase Order No. 1524494
Pg. 2
of 72
Item Description Quantity UM Price Amount Delivery
Date
USD USD
________________________________________________________________________________________________________
109 FIELD LOCATION: KBD DW/PRODUCTION 12,2 M 495,99 6.051,08 15.10.2025
TESTING - WELDING & NDT - SUBCONTRACTOR
CONNECTOR/SPOOL (PUP PIECE/TEST RING PIPE)
DNV 450 DSU
OD: 273,10MM/ID: 207,10MM & WT: 33,00MM
RFQ ITEM: 3.18.A
UNIT LENGTH: 12,2M
COATING: BARE
PO 1501339 ITEM 245
Total supply 7.672.700,32 USD
211 GENERAL EXTRAPRICE 13.875,30 USD
MACHINING OF ITEM 79 AS PER VOR 008
Total extra costs 26.538,43 USD
Total order 7.699.238,75 USD`;

const saipemRows = parsePurchaseOrderPdfText(saipemPricingListText, '1524494_1.pdf');
assert.equal(saipemRows.length, 3, 'must extract every pricing-list item, not just the first one');
assert.deepEqual(saipemRows.map((row) => row.poItem), ['53', '1', '109']);
assert.equal(saipemRows.every((row) => row.vendor === 'DALMINE S.P.A.'), true, 'vendor must be inferred from the letterhead when the filename has no vendor segment');
assert.equal(saipemRows.every((row) => row.poNumber === '1524494'), true);
assert.equal(saipemRows.every((row) => row.vendorCode === '7895'), true);
assert.equal(saipemRows.some((row) => /GENERAL EXTRAPRICE/i.test(row.itemDescription)), false, 'extra-cost lines (211/223/224 style) must not be imported as material items');

const deletedRow = saipemRows.find((row) => row.poItem === '53');
assert.equal(deletedRow.poQuantity, 0, 'DELETED pricing-list rows have no quantity');
assert.equal(deletedRow.materialGrade, 'DNV SMLS 450 SDU');
assert.equal(deletedRow.diameterOdMm, 273.1);
assert.equal(deletedRow.thicknessMm, 33);

const normalRow = saipemRows.find((row) => row.poItem === '1');
assert.equal(normalRow.poQuantity, 6.3);
assert.equal(normalRow.poUnit, 'M');
assert.equal(normalRow.unitPrice, 10787.31);
assert.equal(normalRow.deliveryDate, '2026-06-09');

const fieldLocationRow = saipemRows.find((row) => row.poItem === '109');
assert.equal(fieldLocationRow.poQuantity, 12.2);
assert.equal(fieldLocationRow.unitPrice, 495.99);
assert.equal(fieldLocationRow.deliveryDate, '2025-10-15');
assert.match(fieldLocationRow.itemDescription, /^FIELD LOCATION: KBD DW\/PRODUCTION/, 'description-first-column items (no material keyword in the first line) must still be captured');

console.log('saipem pricing-list pdf tests passed');
