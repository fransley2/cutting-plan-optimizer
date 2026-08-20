import assert from 'node:assert/strict';
import {
  INVENTORY_MOVEMENT_COLUMNS,
  INVENTORY_PENDING_ARRIVAL_COLUMNS,
  INVENTORY_REGISTER_COLUMNS,
  buildInventoryExportData,
} from '../src/core/inventoryExport.js';
import { exportInventoryDatabaseExcel } from '../src/data/excel.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const data = {
  projects: [{ id: 'P-1', shortCode: 'B58', name: 'B58 Project' }],
  organizations: [{ id: 'SUP-1', legalName: 'S.I.M.A.S. S.R.L' }],
  purchaseOrders: [{ id: 'PO-1', projectId: 'P-1', poNumber: '1512341', supplierId: 'SUP-1', subject: 'B58 - BENDS', status: 'ISSUED' }],
  items: [{
    id: 'POI-1', projectId: 'P-1', purchaseOrderId: 'PO-1', itemNumber: '33', materialCode: '10001591904', identCode: 'PIPE-10',
    description: '10 inch mother pipe', materialCategory: 'TEST RING', itemClassification: 'CARBON STEEL', materialGrade: 'DNV 450 DSU',
    orderedQuantity: 10, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-08-10', status: 'OPEN', drawback: 'USO E CONSUMO',
  }],
  receipts: [{ id: 'REC-1', projectId: 'P-1', supplierId: 'SUP-1', receiptNumber: 'MRR-B58-001', arrivalDate: '2026-08-01', invoiceNumber: '7899', status: 'INSPECTED' }],
  receiptLines: [{ id: 'RL-1', receiptId: 'REC-1', purchaseOrderId: 'PO-1', poItemId: 'POI-1', receivedQuantity: 6, unitOfMeasure: 'EA', heatNumber: '950865', inspectionStatus: 'ACCEPTED' }],
  materialUnits: [
    { id: 'MU-1', projectId: 'P-1', poItemId: 'POI-1', receiptLineId: 'RL-1', supplierId: 'SUP-1', inventoryItemId: 'INV-1', traceability: 'GTR1512341-33-001', quantity: 1, unitOfMeasure: 'EA', originalDiameterMm: 273.1, originalLengthMm: 600, originalThicknessMm: 28.58, inspectionStatus: 'ACCEPTED' },
    { id: 'MU-2', projectId: 'P-1', poItemId: 'POI-1', receiptLineId: 'RL-1', supplierId: 'SUP-1', traceability: 'GTR1512341-33-002', quantity: 1, unitOfMeasure: 'EA', inspectionStatus: 'PENDING', inventoryStatus: 'PENDING_POSTING' },
  ],
  inventoryItems: [{
    id: 'INV-1', projectId: 'P-1', trace: 'GTR1512341-33-001', traceability: 'GTR1512341-33-001', status: 'issued', qualityStatus: 'ACCEPTED',
    qty: 1, receivedQty: 1, issuedQty: 1, balanceQty: 0, unit: 'EA', location: 'PREFAB', materialDescription: '10 inch mother pipe',
  }],
  stockMovements: [
    { id: 'MOV-1', projectId: 'P-1', timestamp: '2026-08-01T10:00:00.000Z', movementType: 'RECEIVE_MATERIAL', inventoryItemId: 'INV-1', quantityDelta: 1, previousStatus: 'PENDING', nextStatus: 'available', sourceDocumentType: 'MATERIAL_RECEIPT', sourceDocumentId: 'REC-1' },
    { id: 'MOV-2', projectId: 'P-1', timestamp: '2026-08-15T12:00:00.000Z', movementType: 'ISSUE_MATERIAL', inventoryItemId: 'INV-1', quantityDelta: -1, previousStatus: 'reserved', nextStatus: 'issued', sourceDocumentType: 'MaterialCoupon', sourceDocumentId: 'MC-1', metadata: { workpackId: 'WP-1' }, userName: 'Storekeeper' },
  ],
  materialCoupons: [{
    id: 'MC-1', projectId: 'P-1', number: 'B58_FAB_MC-011', status: 'issued', workpackId: 'WP-1',
    metadata: { coupon: { header: { mcCode: 'B58_FAB_MC-011' }, links: { workpackId: 'WP-1' }, lines: [{ inventoryItemId: 'INV-1', traceability: 'GTR1512341-33-001', drawing: 'DWG-200', mark: 'MK-04', pos: 'P-17', equipment: 'Gas Injection Skid', tag: 'SK-101' }] } },
  }],
  cuttingSheets: [{ id: 'CS-1', projectId: 'P-1', number: 'CS-B58-001', materialCouponId: 'MC-1', workpackId: 'WP-1', bars: [{ inventoryItemId: 'INV-1', pieces: [{ drawingNo: 'DWG-200', mark: 'MK-04', pos: 'P-17' }] }] }],
  returnMaterialVouchers: [],
  workpacks: [{ id: 'WP-1', projectId: 'P-1', wpNo: 'WP-004', equipmentId: 'EQ-1', equipmentName: 'Gas Injection Skid' }],
  drawings: [{ id: 'DWG-1', projectId: 'P-1', workpackId: 'WP-1', drawingNo: 'DWG-200' }],
  equipments: [{ id: 'EQ-1', projectId: 'P-1', equipmentName: 'Gas Injection Skid', equipmentTags: ['SK-101'] }],
  workpackLinks: [{ id: 'LINK-1', projectId: 'P-1', workpackId: 'WP-1', targetType: 'DRAWING_REVISION', targetId: 'DWG-1', status: 'ACTIVE' }],
  reservations: [],
};

const exported = buildInventoryExportData(data, { now: new Date('2026-08-19T12:00:00.000Z') });
assert.equal(exported.registerRows.length, 2, 'received Material Units must remain visible before Inventory posting');
const registered = exported.registerRows.find((row) => row.inventoryItemId === 'INV-1');
const pendingPosting = exported.registerRows.find((row) => row.materialUnitId === 'MU-2');
assert.equal(registered.vendor, 'S.I.M.A.S. S.R.L');
assert.equal(registered.poItemPo, '1512341-33');
assert.equal(registered.receivedQty, 1, 'the physical register must use the Material Unit quantity');
assert.equal(registered.materialCouponNo, 'B58_FAB_MC-011');
assert.equal(registered.availability, 'Não disponível');
assert.equal(pendingPosting.traceability, 'GTR1512341-33-002');
assert.equal(pendingPosting.status, 'pending_posting');

assert.equal(exported.movementRows.length, 2);
const issue = exported.movementRows.find((row) => row.movementType === 'ISSUE_MATERIAL');
assert.equal(issue.sourceDocumentNumber, 'B58_FAB_MC-011');
assert.equal(issue.workpack, 'WP-004');
assert.equal(issue.drawing, 'DWG-200');
assert.equal(issue.mark, 'MK-04');
assert.equal(issue.position, 'P-17');
assert.equal(issue.equipment, 'Gas Injection Skid');
assert.equal(issue.equipmentTag, 'SK-101');
assert.match(issue.fabricationLinkSource, /MATERIAL_COUPON_LINE/);

assert.equal(exported.pendingArrivalRows.length, 1);
assert.equal(exported.pendingArrivalRows[0].missing, 4);
assert.equal(exported.pendingArrivalRows[0].daysOverdue, 9);
assert.equal(exported.pendingArrivalRows[0].arrivalStatus, 'OVERDUE');
assert.equal(exported.summary.unitRows[0].unit, 'EA');
assert.equal(exported.summary.unitRows[0].ordered, 10);
assert.equal(exported.summary.unitRows[0].received, 6);
assert.equal(exported.summary.unitRows[0].missing, 4);
assert.equal(exported.summary.unitRows[0].arrivalPercent, 0.6);
assert.equal(exported.summary.unitRows[0].traceabilities, 2);

const { workbook, filename } = await exportInventoryDatabaseExcel(data, {
  ExcelJS: FakeExcelJS,
  download: false,
  language: 'en',
  generatedAt: new Date('2026-08-19T12:00:00.000Z'),
  now: new Date('2026-08-19T12:00:00.000Z'),
});
assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Inventory Register', 'Movements', 'Summary', 'Pending Arrival']);
assert.equal(workbook.worksheets[0].getCell('A4').value, INVENTORY_REGISTER_COLUMNS[0].label);
assert.equal(workbook.worksheets[1].getCell('A4').value, INVENTORY_MOVEMENT_COLUMNS[0].label);
assert.equal(workbook.worksheets[3].getCell('A4').value, INVENTORY_PENDING_ARRIVAL_COLUMNS[0].label);
assert.equal(workbook.worksheets[0].getCell('A1').fill.fgColor.argb, 'FF22505F');
assert.equal(filename, 'Inventory_Material_Flow.xlsx');

console.log('inventory export tests passed');
