import assert from 'node:assert/strict';
import { buildRmvGeneralNotesDraft, buildRmvReferenceDraft, cuttingSheetRmvCandidates, estimateReturnedWeight, nextReturnMaterialVoucherNumber, normalizeRmvLine, deriveRmvStatus, RMV_LINE_STATUS } from '../src/core/returnMaterialVoucher.js';
import { matchesProjectDocumentNumber, nextCuttingSheetNumber, nextNestingPlanNumber } from '../src/core/documentNumbering.js';

assert.equal(estimateReturnedWeight({ lengthMm: 6000, weightKg: 600 }, 1500), 150);
assert.equal(estimateReturnedWeight({ lengthMm: 0, weightKg: 600 }, 1500), 0);
assert.equal(nextReturnMaterialVoucherNumber([{ number: 'B58_FAB_RMV-001' }, { number: 'B58_FAB_RMV-009' }], 'B58'), 'B58_FAB_RMV-010');
assert.equal(nextCuttingSheetNumber([{ number: 'B58_FAB_CS-002' }], 'B58'), 'B58_FAB_CS-003');
assert.equal(nextNestingPlanNumber([{ name: 'B58_FAB_CS-001' }, { number: 'B58_FAB_CS-003' }], 'B58'), 'B58_FAB_CS-004');
assert.equal(matchesProjectDocumentNumber('B58_FAB_CS-004', 'B58', 'CS'), true);
assert.equal(matchesProjectDocumentNumber('P79_FAB_CS-004', 'B58', 'CS'), false);

const reference = buildRmvReferenceDraft({ drawingReference: 'DWG-001', workpackNumber: 'WP-01', materialCouponNumber: 'B58_FAB_MC-001', cuttingSheetNumber: 'B58_FAB_CS-001' }, '* CLIENT REFERENCE: REF-9');
assert.match(reference, /\* DESIGN DRAWING: DWG-001/);
assert.match(reference, /\* WORKPACK: WP-01/);
assert.match(reference, /\* MATERIAL COUPON: B58_FAB_MC-001/);
assert.match(reference, /\* CUTTING SHEET: B58_FAB_CS-001/);
assert.match(reference, /\* CLIENT REFERENCE: REF-9/);
const notes = buildRmvGeneralNotesDraft({ origin: 'PREFAB', destination: 'WAREHOUSE', cuttingSheetNumber: 'B58_FAB_CS-001' }, '- HANDLE WITH CARE');
assert.match(notes, /FROM "PREFAB" TO "WAREHOUSE" RELATED TO CUTTING SHEET B58_FAB_CS-001/);
assert.match(notes, /TRACEABILITY VERIFIED UPON RECEIPT/);
assert.match(notes, /HANDLE WITH CARE/);

const line = normalizeRmvLine({ lengthMm: 1200 }, { id: 'INV-1', traceability: 'TR-1', lengthMm: 6000, weightKg: 300, sapCode: 'SAP-1', po: 'PO-1', poItem: '10' });
assert.equal(line.parentInventoryItemId, 'INV-1');
assert.equal(line.weightKg, 60);
assert.equal(line.sapCode, 'SAP-1');
assert.equal(line.poItem, '10');
assert.equal(deriveRmvStatus([line]), 'issued');
assert.equal(deriveRmvStatus([{ ...line, status: RMV_LINE_STATUS.RECEIVED }, line]), 'partially_received');
assert.equal(deriveRmvStatus([{ ...line, status: RMV_LINE_STATUS.RECEIVED }]), 'returned');

const forecastSheet = { id: 'CS-FORECAST', bars: [{ id: 'BAR-1', inventoryItemId: 'INV-1', remaining: 850, materialGrade: 'A36' }] };
const forecastCandidates = cuttingSheetRmvCandidates(forecastSheet, []);
assert.equal(forecastCandidates.length, 1);
assert.equal(forecastCandidates[0].lengthMm, 850);
assert.equal(forecastCandidates[0].metadata.generatedFrom, 'CUTTING_SHEET_FORECAST');
assert.equal(cuttingSheetRmvCandidates({ id: 'CS-SCRAP-FORECAST', bars: [{ inventoryItemId: 'INV-1', remaining: 499 }] }, []).length, 0);

const persistedCandidates = cuttingSheetRmvCandidates(forecastSheet, [
  { id: 'OC-1', cuttingSheetId: 'CS-FORECAST', status: 'reusable', length: 700 },
  { id: 'OC-2', cuttingSheetId: 'CS-FORECAST', status: 'scrap', length: 150 },
  { id: 'OC-3', cuttingSheetId: 'CS-FORECAST', status: 'draft', length: 499 },
]);
assert.deepEqual(persistedCandidates.map((item) => item.id), ['OC-1']);
assert.deepEqual(cuttingSheetRmvCandidates(forecastSheet, [
  { id: 'OC-SCRAP', cuttingSheetId: 'CS-FORECAST', status: 'scrap', length: 850 },
]), [], 'processed scrap must not be recreated from the forecast remainder');
console.log('return material voucher core tests passed');
