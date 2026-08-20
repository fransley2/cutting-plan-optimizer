import assert from 'node:assert/strict';
import { buildReturnMaterialVoucherReportHtml, resolveReturnMaterialVoucherReportColumns } from '../src/reports/returnMaterialVoucherReport.js';
import { buildMaterialCouponReportHtml } from '../src/reports/materialCouponReport.js';

const rmvHtml = buildReturnMaterialVoucherReportHtml({
  number: 'B58_FAB_RMV-001', project: 'B58', client: 'Client', scope: 'Fabrication', date: '2026-01-06',
  origin: 'YARD', destination: 'WAREHOUSE', drawingReference: 'DWG-1', materialCouponNumber: 'MC-1', cuttingSheetNumber: 'CS-1',
  reference: '* Existing reference', notes: '* General note',
  returnedItems: [{ sapCode: '10001470691', po: 'PO-1', poItem: '10', materialDescription: 'Pipe', lengthMm: 3189.7099999999996, weightKg: 146.142857, condition: 'GOOD', parentTraceability: 'TR-1', heatNo: 'H1' }],
}, {
  reportHeader: { documentTitles: { returnMaterialVoucher: 'CUSTOM RMV TITLE' } },
  returnMaterialVoucherForm: { docNumber: 'FORM-CUSTOM', docRevision: '02', docRevisionDate: '07/01/2026', docReference: 'STD-CUSTOM' },
});
assert.match(rmvHtml, /A4 landscape/);
assert.match(rmvHtml, /10001470691/);
assert.match(rmvHtml, /rmv-column-lengthMm">3189,71</);
assert.match(rmvHtml, /rmv-column-weightKg">146,14</);
assert.match(rmvHtml, /rmv-column-sapCode \{ white-space: nowrap/);
assert.equal(resolveReturnMaterialVoucherReportColumns({}, { columns: [{ key: 'sapCode' }] })[0].width, 7);
assert.equal(resolveReturnMaterialVoucherReportColumns({ reportColumnLayout: [{ key: 'sapCode', width: 6 }] }, { columns: [{ key: 'sapCode' }] })[0].width, 7);
assert.match(rmvHtml, />Material Description</);
assert.match(rmvHtml, />Qty Return\.</);
assert.doesNotMatch(rmvHtml, />Width \[mm\]</);
assert.doesNotMatch(rmvHtml, />PO \/ Item</);
assert.match(rmvHtml, /DIMENSIONS RETURNED/);
assert.match(rmvHtml, /CUSTOM RMV TITLE/);
assert.match(rmvHtml, /Doc\. Ver\. Date:/);
assert.match(rmvHtml, /Ref\. Doc\. :/);
assert.match(rmvHtml, /FORM-CUSTOM/);
assert.match(rmvHtml, /\* Material Coupon: MC-1/);
assert.match(rmvHtml, /\* Cutting Plan: CS-1/);
assert.match(rmvHtml, /\(Production Planning &amp; Control Dept\)/);
assert.match(rmvHtml, /\(CTCO Yard\/Subcontractor\)/);
assert.match(rmvHtml, /\(Project Warehouse\)/);
assert.match(rmvHtml, /\.rmv-header \{ box-shadow:/);
assert.match(rmvHtml, /tbody tr:nth-child\(odd\)/);
assert.match(rmvHtml, /rmv-pagination-done/);

const coupon = { header:{mcCode:'MC-1'}, lines:[{serialNumber:'1',materialDescription:'Pipe',widthMm:'',lengthMm:'1000'}] };
const couponHtml = buildMaterialCouponReportHtml(coupon, { reportColumnLayout:[{key:'notes',visible:false,width:6}] });
assert.doesNotMatch(couponHtml, />Width \[mm\]</); assert.doesNotMatch(couponHtml, />Notes</); assert.match(couponHtml, /tbody tr:nth-child\(odd\)/);
console.log('return material voucher report tests passed');
