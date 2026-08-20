import assert from 'node:assert/strict';
import { inventoryReservationAvailability, isInventoryAvailableForReservation, validateMaterialCouponReservation } from '../src/core/materialCouponReservation.js';
import { MATERIAL_COUPON_CONTROL_COLUMNS, buildMaterialCouponControlRows, filterMaterialCouponControlRows } from '../src/core/materialCouponControl.js';
import { exportMaterialCouponControlDatabase } from '../src/data/excel.js';
import { FakeExcelJS } from './helpers/fakeExcelJs.mjs';

const availableLegacy = { id: 'INV-1', trace: 'TRACE-1', status: 'N/A', balanceQty: 4 };
assert.equal(isInventoryAvailableForReservation(availableLegacy), true);
assert.equal(validateMaterialCouponReservation([{ inventoryItemId: 'INV-1', qty: 2 }], [availableLegacy]).valid, true);
assert.equal(validateMaterialCouponReservation([{ manualLine: true, qty: 2 }], []).valid, true);
assert.equal(validateMaterialCouponReservation([{ qty: 2 }], []).valid, false);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, status: 'reserved' }), false);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, balanceQty: 0 }), false);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, qualityStatus: 'QUARANTINE' }), false);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, qualityStatus: 'REJECTED' }), false);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, qualityStatus: 'ACCEPTED' }), true);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, inspectionStatus: 'PENDING' }), false);
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, inspectionStatus: 'REJECTED', qualityStatus: 'ACCEPTED' }), false);
assert.equal(inventoryReservationAvailability({ ...availableLegacy, inspectionStatus: 'HOLD' }).code, 'INVENTORY_INSPECTION_NOT_ACCEPTED');
assert.equal(isInventoryAvailableForReservation({ ...availableLegacy, acceptanceStatus: 'REJECTED' }), false);
assert.equal(inventoryReservationAvailability({ ...availableLegacy, balanceQty: 0 }).code, 'INVENTORY_BALANCE_EMPTY');
assert.equal(inventoryReservationAvailability({ ...availableLegacy, status: 'reserved', reservedQty: 1 }).code, 'INVENTORY_ALREADY_RESERVED');
assert.equal(validateMaterialCouponReservation([{ inventoryItemId: 'INV-1', qty: 2 }], [{ ...availableLegacy, balanceQty: 0 }]).errors[0].code, 'INVENTORY_BALANCE_EMPTY');

const issuedCoupon = {
  id: 'MC-1', status: 'issued', workpackId: 'WP-ID', metadata: { coupon: {
    status: 'ISSUED', header: { mcCode: 'MC-001', project: 'B58', destination: 'PREFAB', date: '2026-07-12' },
    responsible: {}, links: { workpackId: 'WP-ID' },
    lines: [{ id: 'MC-LINE-1', inventoryItemId: 'INV-1', serialNumber: '1', sapCode: 'SAP-1', materialDescription: 'Pipe', qty: '1', unit: 'EA', traceability: 'TRACE-1', notes: 'Cut test' }],
  } },
};
const draftCoupon = { id: 'MC-2', status: 'draft', metadata: { coupon: { status: 'DRAFT', header: { mcCode: 'MC-002' }, lines: [{ qty: '1' }] } } };
const relatedData = {
  workpacks: [{ id: 'WP-ID', wpNo: 'WP_0004', drawingIds: ['DWG-ID'] }],
  drawings: [{ id: 'DWG-ID', drawingNo: 'DWG-100' }],
  cuttingSheets: [{
    id: 'CS-1', materialCouponId: 'MC-1', number: 'NEST-001',
    bars: [{ inventoryItemId: 'INV-1', pieces: [{ drawingNo: 'DWG-200' }] }],
  }, { id: 'CS-2', workpackId: 'WP-ID', number: 'NEST-002' }],
  returnMaterialVouchers: [{
    id: 'RMV-1', cuttingSheetId: 'CS-1', number: 'RMV-001', destination: 'RETURN BAY', drawingReference: 'RMV-DWG-300',
    returnedItems: [{ parentInventoryItemId: 'INV-1', location: 'RETURN RACK A', qty: 1, widthMm: 120, lengthMm: 500, receivedBy: 'Warehouse Receiver' }],
  }, {
    id: 'RMV-2', projectId: 'P-1', status: 'returned', number: 'RMV-002', workpackId: 'WP-ID',
    cuttingSheetId: 'CS-2', drawingReference: 'RMV-DWG-900', destination: 'RETURN BAY',
    metadata: { project: 'B58' },
    returnedItems: [{
      id: 'RMV-2-L1', traceability: 'RETURNED-002', receivedBy: 'Material Receiver',
      location: 'RETURN RACK', qty: 2, widthMm: 250, lengthMm: 900,
    }],
  }],
  inventoryItems: [{ id: 'INV-1', traceability: 'TRACE-1', location: 'ORIGINAL RACK' }],
  auditEvents: [
    { eventType: 'MATERIAL_COUPON_ISSUED', entityId: 'MC-1', userName: 'Issuer' },
    { eventType: 'MATERIAL_COUPON_DISPATCH', sourceDocumentId: 'MC-1', userName: 'Dispatch' },
    { eventType: 'MATERIAL_COUPON_RECEIVE', entityId: 'MC-1', userName: 'Receiver' },
  ],
};
const rows = buildMaterialCouponControlRows([issuedCoupon, draftCoupon], relatedData);
assert.equal(rows.length, 1);
assert.equal(rows[0].mcCode, 'MC-001');
assert.equal(rows[0].mcIssuingResponsible, 'Issuer');
assert.equal(rows[0].materialDispatchResponsible, 'Dispatch');
assert.equal(rows[0].materialReceivingResponsible, 'Warehouse Receiver');
assert.equal(rows[0].workpack, 'WP_0004');
assert.equal(rows[0].drawingUse, 'DWG-200, DWG-100, RMV-DWG-300');
assert.equal(rows[0].rmvCode, 'RMV-001');
assert.equal(rows[0].local, 'RETURN RACK A');
assert.equal(rows[0].returnedQty, 1);
assert.equal(rows[0].returnedWidthMm, '120');
assert.equal(rows[0].returnedLengthMm, '500');
assert.equal(rows[0].nesting, 'NEST-001');
assert.equal(rows[0].couponStatus, 'ISSUED');
assert.equal(rows.some((row) => row.rmvCode === 'RMV-002'), false);
assert.equal(filterMaterialCouponControlRows(rows, { project: 'B58' }).length, 1);
assert.equal(filterMaterialCouponControlRows(rows, { workpack: 'missing' }).length, 0);
const legacyWorkpackCoupon = structuredClone(issuedCoupon);
delete legacyWorkpackCoupon.workpackId;
delete legacyWorkpackCoupon.metadata.coupon.links.workpackId;
legacyWorkpackCoupon.metadata.coupon.header.workpack = 'wp_0004';
const legacyWorkpackRows = buildMaterialCouponControlRows([legacyWorkpackCoupon], relatedData);
assert.equal(legacyWorkpackRows[0].workpack, 'WP_0004');
const mixedData = structuredClone(relatedData);
mixedData.returnMaterialVouchers[0].returnedItems.push({
  id: 'RMV-1-UNMATCHED', parentInventoryItemId: 'INV-X', receivedBy: 'Second Receiver',
  qty: 1, widthMm: 80, lengthMm: 300,
});
mixedData.returnMaterialVouchers.push({
  id: 'RMV-EMPTY', status: 'draft', number: 'RMV-EMPTY', workpackId: 'WP-ID',
  cuttingSheetId: 'CS-2', metadata: { project: 'B58' }, returnedItems: [],
});
const mixedRows = buildMaterialCouponControlRows([issuedCoupon, draftCoupon], mixedData);
assert.equal(mixedRows.length, 1);
assert.equal(mixedRows.some((row) => row.rmvCode.includes('RMV-EMPTY')), false);
assert.equal(MATERIAL_COUPON_CONTROL_COLUMNS[0].key, 'mcCode');
assert.equal(MATERIAL_COUPON_CONTROL_COLUMNS[2].key, 'couponStatus');
assert.equal(MATERIAL_COUPON_CONTROL_COLUMNS.at(-1).key, 'nesting');

const exported = await exportMaterialCouponControlDatabase([issuedCoupon, draftCoupon], {
  ...relatedData, filename: 'Issued_Materials.xlsx', ExcelJS: FakeExcelJS, download: false, language: 'en',
});
const columnIndex = Object.fromEntries(MATERIAL_COUPON_CONTROL_COLUMNS.map((column, index) => [column.key, index]));
const sheet = exported.workbook.worksheets[0];
const value = (key) => sheet.getCell(5, columnIndex[key] + 1).value;
assert.equal(value('mcIssuingResponsible'), 'Issuer');
assert.equal(value('materialDispatchResponsible'), 'Dispatch');
assert.equal(value('materialReceivingResponsible'), 'Warehouse Receiver');
assert.equal(value('workpack'), 'WP_0004');
assert.equal(value('drawingUse'), 'DWG-200, DWG-100, RMV-DWG-300');
assert.equal(value('rmvCode'), 'RMV-001');
assert.equal(value('local'), 'RETURN RACK A');
assert.equal(value('returnedQty'), 1);
assert.equal(value('returnedWidthMm'), 120);
assert.equal(value('returnedLengthMm'), 500);
assert.equal(value('nesting'), 'NEST-001');
assert.equal([...sheet.cells.values()].some((cell) => cell.value === 'RMV-002'), false);
assert.equal(exported.filename, 'Issued_Materials.xlsx');

console.log('materialCouponControl tests passed');
