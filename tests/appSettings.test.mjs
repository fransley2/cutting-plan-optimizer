import assert from 'node:assert/strict';
import {
  DEFAULT_REPORT_HEADER,
  DEFAULT_RETURN_MATERIAL_VOUCHER_FORM,
  normalizeReportHeader,
} from '../src/data/appSettings.js';

assert.equal(Object.isFrozen(DEFAULT_REPORT_HEADER), true);
assert.equal(Object.isFrozen(DEFAULT_REPORT_HEADER.documentTitles), true);

assert.deepEqual(normalizeReportHeader({}), {
  companyName: 'Saipem do Brasil',
  subtitle: '',
  logoUrl: 'https://i.ibb.co/wZZQrZW0/Saipem-logo-300px.png',
  documentTitles: {
    cuttingPlan: 'Cutting Plan Report',
    materialCoupon: 'MATERIAL COUPON',
    returnMaterialVoucher: 'RETURNED MATERIAL VOUCHER',
  },
});

const legacy = normalizeReportHeader({
  companyName: 'Client Company',
  documentTitle: 'Legacy Cutting Plan Title',
  documentTitles: { materialCoupon: 'Custom Coupon' },
});
assert.equal(legacy.documentTitles.cuttingPlan, 'Legacy Cutting Plan Title');
assert.equal(legacy.documentTitles.materialCoupon, 'Custom Coupon');
assert.equal(legacy.documentTitles.returnMaterialVoucher, 'RETURNED MATERIAL VOUCHER');
assert.equal('documentTitle' in legacy, false);

const modern = normalizeReportHeader({
  documentTitle: 'Legacy Title',
  documentTitles: { cuttingPlan: 'Modern Cutting Plan' },
});
assert.equal(modern.documentTitles.cuttingPlan, 'Modern Cutting Plan');
assert.equal(modern.documentTitles.materialCoupon, 'MATERIAL COUPON');
assert.equal(modern.documentTitles.returnMaterialVoucher, 'RETURNED MATERIAL VOUCHER');

const blankTitles = normalizeReportHeader({
  documentTitles: { cuttingPlan: '   ', materialCoupon: '   ', returnMaterialVoucher: '   ' },
});
assert.equal(blankTitles.documentTitles.cuttingPlan, 'Cutting Plan Report');
assert.equal(blankTitles.documentTitles.materialCoupon, 'MATERIAL COUPON');
assert.equal(blankTitles.documentTitles.returnMaterialVoucher, 'RETURNED MATERIAL VOUCHER');
assert.deepEqual(DEFAULT_RETURN_MATERIAL_VOUCHER_FORM, {
  docNumber: 'FORM-SDB-EXE-FAB-019-E-R01',
  docRevision: '01',
  docRevisionDate: '06/01/2026',
  docReference: 'STD_GR-SDB-EXE-FAB-008-E',
  origin: '',
  destination: '',
  reference: '',
  notes: '',
});

console.log('appSettings tests passed');
