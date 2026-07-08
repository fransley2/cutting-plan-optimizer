import assert from 'node:assert/strict';
import {
  MATERIAL_COUPON_EXTRACT_COLUMNS,
  buildMaterialCouponDocument,
  buildMaterialCouponExtractRows,
  normalizeMaterialCouponLine,
} from '../src/documents/materialCoupon.js';
import { buildMaterialCouponReportHtml } from '../src/reports/materialCouponReport.js';

const coupon = Object.freeze({
  status: 'DRAFT',
  header: Object.freeze({
    mcCode: 'MC-001',
    revision: '2',
    project: 'RAIA',
    client: 'TOTAL ENERGIES',
    scope: 'Fabrication',
    destination: 'Yard',
    date: '2026-07-05',
    workpack: 'WP-01',
    docNumber: 'FORM-1',
    docRevision: '01',
    docRevisionDate: '13/12/2025',
    docReference: 'STD-1',
    reference: 'REF',
    notes: 'NOTES',
  }),
  responsible: Object.freeze({
    issuing: 'Planner',
    dispatch: 'Warehouse',
    receiving: 'Yard',
  }),
  lines: Object.freeze([
    Object.freeze({
      sap: 'SAP-1',
      category: 'PIPE',
      description: 'Pipe 6in',
      quantity: 2,
      un: 'EA',
      od: '168.3',
      wt: '7.1',
      length: '6000',
      weight: '100',
      grade: 'S355',
      trace: 'TR-1',
      heatNumber: 'H-1',
      po: 'PO-1',
      item: '10',
      status: 'AVAILABLE',
    }),
  ]),
});

function clone(value) {
  return structuredClone(value);
}

{
  const labels = MATERIAL_COUPON_EXTRACT_COLUMNS.map((column) => column.label);
  assert.equal(labels[0], 'MC Code:');
  assert.equal(labels.at(-1), 'DRAWBACK');
  assert.ok(labels.includes('Returned Lenght [mm]'));
  assert.equal(MATERIAL_COUPON_EXTRACT_COLUMNS.length, 50);
}

{
  const rows = buildMaterialCouponExtractRows(clone(coupon));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mcCode, 'MC-001');
  assert.equal(rows[0].mcRevision, '2');
  assert.equal(rows[0].materialDestination, 'Yard');
  assert.equal(rows[0].mcDate, '2026-07-05');
}

{
  const rows = buildMaterialCouponExtractRows([clone(coupon), { ...clone(coupon), header: { ...coupon.header, mcCode: 'MC-002' } }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].mcCode, 'MC-002');
}

{
  const line = normalizeMaterialCouponLine({
    identCode: 'ID-1',
    Material: 'fallback',
    description: 'Plate',
    qty: '3',
    unit: 'M',
    materialGrade: 'A36',
    heat: 'H2',
  }, { mcCode: 'MC-X', materialDestination: 'Shop' });
  assert.equal(line.sapCode, 'ID-1');
  assert.equal(line.materialDescription, 'Plate');
  assert.equal(line.qty, '3');
  assert.equal(line.heatNo, 'H2');
}

{
  assert.doesNotThrow(() => buildMaterialCouponDocument({}, { nowFactory: () => '2026-01-01T00:00:00.000Z' }));
}

{
  const source = clone(coupon);
  const before = JSON.stringify(source);
  buildMaterialCouponExtractRows(source);
  buildMaterialCouponDocument(source);
  assert.equal(JSON.stringify(source), before);
}

{
  const html = buildMaterialCouponReportHtml(clone(coupon));
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('MC Issuing Responsible'));
  assert.ok(html.includes('Material Dispatch Responsible'));
  assert.ok(html.includes('Material Receiving Responsible'));
}

console.log('materialCouponDocument tests passed');
