import assert from 'node:assert/strict';
import {
  buildPurchaseOrderExportData,
  buildPurchaseOrderProgressExportData,
} from '../src/core/procurementExport.js';
import { exportPurchaseOrderDatabaseExcel, exportPurchaseOrderProgressExcel } from '../src/data/excel.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const data = {
  projects: [{ id: 'project-b58', shortCode: 'B58', name: 'B58 GranMorgu' }],
  organizations: [{ id: 'supplier-1', vendorCode: '3513', legalName: 'EQUANS SA' }],
  purchaseOrders: [{ id: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', projectId: 'project-b58', poNumber: '1523734', currentRevision: '2', supplierId: 'supplier-1', subject: 'SSDS BENDS', orderDate: '2025-07-08', status: 'ISSUED', currency: 'EUR', sourceSystem: 'PDF' }],
  revisions: [
    { id: '3bf7a1f5-93fa-4aa5-a200-787a63114263', purchaseOrderId: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', revision: '1', issueDate: '2025-06-08', isCurrent: false },
    { id: 'da1340a4-d4ab-41da-a50b-f4beff18ed9a', purchaseOrderId: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', revision: '2', issueDate: '2025-07-08', isCurrent: true, documentRevisionId: 'f297ed29-ab15-4666-9d13-9931130218e5', supersedesRevisionId: '3bf7a1f5-93fa-4aa5-a200-787a63114263' },
  ],
  items: [
    { id: '0296e06e-41fb-4760-8ddb-a8a28fb77801', projectId: 'project-b58', purchaseOrderId: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', itemNumber: '1', description: 'SSDS bend', identCode: 'BD-SD-168-19-90', orderedQuantity: 10, unitOfMeasure: 'EA', materialGrade: 'DNV25Cr', status: 'OPEN' },
    { id: '02a1023a-fb1e-4a5e-bcb8-49e80e4ff84a', projectId: 'project-b58', purchaseOrderId: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', itemNumber: '2', description: 'Mother pipe', orderedQuantity: 12.2, unitOfMeasure: 'M', status: 'OPEN' },
  ],
  receipts: [{ id: 'receipt-1', projectId: 'project-b58', supplierId: 'supplier-1', receiptNumber: 'REC-001', status: 'INSPECTED', arrivalDate: '2026-04-03', invoiceNumber: 'NF-100' }],
  receiptLines: [{ id: 'e31351a4-4b2f-4bda-985b-200c80a9d505', receiptId: 'receipt-1', purchaseOrderId: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', poItemId: '0296e06e-41fb-4760-8ddb-a8a28fb77801', receivedQuantity: 6, unitOfMeasure: 'EA', heatNumber: 'HT-01', inspectionStatus: 'ACCEPTED' }],
  materialUnits: [
    { id: '014924c7-9ed5-424b-9e5f-47929461cad3', projectId: 'project-b58', poItemId: '0296e06e-41fb-4760-8ddb-a8a28fb77801', receiptLineId: 'e31351a4-4b2f-4bda-985b-200c80a9d505', supplierId: 'supplier-1', manufacturerId: 'supplier-1', traceability: 'GTR-001', quantity: 4, unitOfMeasure: 'EA', inspectionStatus: 'ACCEPTED', inventoryStatus: 'AVAILABLE', inventoryItemId: 'b8a43e9d-d3a4-4900-a729-c56b99fdd333', postedBy: '62b47f10-0571-448a-8bd2-b5b959276398' },
    { id: '083ac740-084c-4a5d-9b8f-abab3245c24e', projectId: 'project-b58', poItemId: '0296e06e-41fb-4760-8ddb-a8a28fb77801', receiptLineId: 'e31351a4-4b2f-4bda-985b-200c80a9d505', supplierId: 'supplier-1', manufacturerId: 'supplier-1', traceability: 'GTR-002', quantity: 2, unitOfMeasure: 'EA', inspectionStatus: 'HOLD', inventoryStatus: 'PENDING_POSTING' },
  ],
  inventoryItems: [{ id: 'b8a43e9d-d3a4-4900-a729-c56b99fdd333', traceability: 'GTR-001' }],
  reservations: [],
  stockMovements: [{ poItemId: '0296e06e-41fb-4760-8ddb-a8a28fb77801', movementType: 'CONSUME_STOCK', quantityDelta: -1 }],
};

const detailed = buildPurchaseOrderExportData(data, { projectId: 'project-b58' });
assert.equal(detailed.poRows.length, 1);
assert.equal(detailed.itemRows.length, 2);
assert.equal(detailed.itemRows[0].vendor, 'EQUANS SA');
assert.equal(detailed.itemRows[0].received, 6);
assert.equal(detailed.itemRows[0].pending, 4);
assert.equal(detailed.itemRows[0].consumed, 1);
assert.equal(detailed.itemRows[0].arrivalPercent, 0.6);
assert.equal(detailed.receiptRows[0].receiptNumber, 'REC-001');
assert.equal(detailed.receiptRows[0].heatNumber, 'HT-01');
assert.equal(detailed.materialUnitRows.length, 2);
assert.equal(detailed.materialUnitRows[0].inventoryReference, 'GTR-001');
assert.equal(detailed.materialUnitRows[0].postedBy, '');
assert.equal(detailed.revisionRows[1].revision, '2');
assert.equal(detailed.revisionRows[1].supersedesRevision, '1');
assert.equal(detailed.revisionRows[1].documentReference, '');

const internalKeys = new Set(['purchaseOrderId', 'poItemId', 'receiptId', 'receiptLineId', 'materialUnitId', 'inventoryItemId', 'revisionId', 'supersedesRevisionId']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Object.values(detailed).flat().forEach((row) => {
  Object.keys(row).forEach((key) => assert.equal(internalKeys.has(key), false, `internal key leaked: ${key}`));
  Object.values(row).forEach((value) => assert.equal(uuidPattern.test(String(value || '')), false, `internal UUID leaked: ${value}`));
});

const progress = buildPurchaseOrderProgressExportData(data, { projectId: 'project-b58' });
assert.equal(progress.progressRows.length, 2, 'quantities with different units must not be added together');
const eaProgress = progress.progressRows.find((row) => row.unit === 'EA');
const metreProgress = progress.progressRows.find((row) => row.unit === 'M');
assert.equal(eaProgress.ordered, 10);
assert.equal(eaProgress.received, 6);
assert.equal(eaProgress.pending, 4);
assert.equal(eaProgress.arrivalPercent, 0.6);
assert.equal(eaProgress.consumed, 1);
assert.equal(metreProgress.ordered, 12.2);
assert.equal(metreProgress.received, 0);

const databaseExport = await exportPurchaseOrderDatabaseExcel(data, {
  ExcelJS: FakeExcelJS, download: false, language: 'en', projectId: 'project-b58', purchaseOrderId: '067a5d8d-50e8-4390-a2d2-f758a5fe6ceb', purchaseOrderNumber: '1523734',
});
assert.deepEqual(databaseExport.workbook.worksheets.map((entry) => entry.name), ['Procurement Summary', 'Purchase Orders', 'PO Items', 'Receipts', 'Material Units', 'PO Revisions']);
assert.equal(databaseExport.filename, 'Procurement_PO_Database_1523734.xlsx');
databaseExport.workbook.worksheets.forEach((worksheet) => {
  const headers = Array.from({ length: worksheet.columnCount }, (_, index) => worksheet.getCell(4, index + 1).value);
  assert.equal(headers.some((header) => /\b(?:ID|Identifier)\b/i.test(String(header || ''))), false, `${worksheet.name} exposed an internal identifier column`);
});

const portugueseExport = await exportPurchaseOrderDatabaseExcel(data, {
  ExcelJS: FakeExcelJS, download: false, language: 'pt-BR', projectId: 'project-b58',
});
assert.equal(portugueseExport.workbook.worksheets[0].name, 'Resumo de Suprimentos');
assert.equal(portugueseExport.workbook.worksheets[1].getCell(4, 1).value, 'Projeto');

const progressExport = await exportPurchaseOrderProgressExcel(data, { ExcelJS: FakeExcelJS, download: false, language: 'en', projectId: 'project-b58' });
assert.deepEqual(progressExport.workbook.worksheets.map((entry) => entry.name), ['PO Progress', 'Item Progress']);
assert.equal(progressExport.filename, 'Procurement_Arrival_Progress.xlsx');

console.log('procurement export tests passed');
