import assert from 'node:assert/strict';
import { buildMaterialCouponDocument } from '../src/documents/materialCoupon.js';
import { buildCuttingSheetDocument } from '../src/documents/cuttingSheet.js';
import { buildReturnMaterialVoucherDocument } from '../src/documents/returnMaterialVoucher.js';

const options = { nowFactory: () => '2026-01-01T00:00:00.000Z' };

const samplePackage = Object.freeze({
  project: 'RAIA',
  client: 'TOTAL ENERGIES',
  equipment: 'Module A',
  workpack: 'WP-01',
  materialCouponNumber: 'MC-001',
  cuttingSheetNumber: 'CS-001',
  rmvNumber: 'RMV-001',
  destination: 'Yard',
  date: '2026-01-01',
  metadata: Object.freeze({
    preparedBy: 'Planner',
    receivedBy: 'Warehouse',
    approvedBy: 'Supervisor',
    observations: 'Handle with care',
  }),
  stockItems: Object.freeze([
    Object.freeze({
      po: 'PO-1',
      item: '10',
      traceability: 'TR-1',
      description: 'Pipe 6in',
      materialGrade: 'S355',
      heatNumber: 'H-1',
      qty: 2,
      lengthMm: 6000,
      drawing: 'DWG-1',
    }),
  ]),
  nestedBars: Object.freeze([
    Object.freeze({
      barNumber: 'B1',
      po: 'PO-1',
      item: '10',
      traceability: 'TR-1',
      description: 'Pipe 6in',
      materialGrade: 'S355',
      heatNumber: 'H-1',
      stockLength: 6000,
      remaining: 500,
      pieces: Object.freeze([
        Object.freeze({ drawingRef: 'DWG-1', mark: 'M1', pos: 'P1', cutLength: 1000, material: 'S355' }),
        Object.freeze({ drawing: 'DWG-2', mark: 'M2', position: 'P2', length: 2000, material: 'S355' }),
      ]),
    }),
  ]),
  generatedOffcuts: Object.freeze([
    Object.freeze({
      traceability: 'TR-1-OC-001',
      parentTrace: 'TR-1',
      description: 'Pipe offcut',
      materialGrade: 'S355',
      heatNumber: 'H-1',
      po: 'PO-1',
      item: '10',
      lengthMm: 500,
      qty: 1,
    }),
  ]),
});

function clone(value) {
  return structuredClone(value);
}

{
  const pkg = clone(samplePackage);
  const doc = buildMaterialCouponDocument(pkg, options);
  assert.equal(doc.documentType, 'materialCoupon');
  assert.equal(doc.title, 'Material Coupon');
  assert.equal(doc.documentNumber, 'MC-001');
  assert.equal(doc.generatedAt, options.nowFactory());
  assert.ok(Array.isArray(doc.columns));
  assert.ok(Array.isArray(doc.rows));
  assert.ok(doc.summary);
  assert.ok(Array.isArray(doc.signatureFields));
}

{
  const row = buildMaterialCouponDocument(clone(samplePackage), options).rows[0];
  assert.equal(row.po, 'PO-1');
  assert.equal(row.poItem, '10');
  assert.equal(row.traceability, 'TR-1');
  assert.equal(row.description, 'Pipe 6in');
  assert.equal(row.materialGrade, 'S355');
  assert.equal(row.heat, 'H-1');
}

{
  const doc = buildCuttingSheetDocument(clone(samplePackage), options);
  assert.equal(doc.rows.length, 2);
  assert.equal(doc.rows[0].mark, 'M1');
  assert.equal(doc.rows[1].pos, 'P2');
}

{
  const doc = buildCuttingSheetDocument(clone(samplePackage), options);
  assert.equal(doc.summary.totalBars, 1);
  assert.equal(doc.summary.totalPieces, 2);
  assert.equal(doc.summary.totalNestedLength, 3000);
  assert.equal(doc.summary.totalSpareOffcut, 500);
  assert.equal(doc.summary.utilizationPercent, 50);
}

{
  const pkg = clone(samplePackage);
  pkg.nestedBars[0].remaining = '';
  pkg.nestedBars[0].offcut = '';
  const doc = buildCuttingSheetDocument(pkg, options);
  assert.equal(doc.rows[0].spareOffcut, 3000);
}

{
  const doc = buildReturnMaterialVoucherDocument(clone(samplePackage), options);
  assert.equal(doc.rows.length, 1);
  assert.equal(doc.rows[0].rmvNumber, 'RMV-001');
  assert.equal(doc.rows[0].description, 'Pipe offcut');
}

{
  const row = buildReturnMaterialVoucherDocument(clone(samplePackage), options).rows[0];
  assert.equal(row.sketchSummary, 'Offcut from trace TR-1, length 500 mm');
}

{
  assert.equal(buildMaterialCouponDocument(clone(samplePackage), options).signatureFields.length, 3);
  assert.equal(buildCuttingSheetDocument(clone(samplePackage), options).signatureFields.length, 2);
  assert.equal(buildReturnMaterialVoucherDocument(clone(samplePackage), options).signatureFields.length, 3);
}

{
  const emptyPackage = {};
  assert.doesNotThrow(() => buildMaterialCouponDocument(emptyPackage, options));
  assert.doesNotThrow(() => buildCuttingSheetDocument(emptyPackage, options));
  assert.doesNotThrow(() => buildReturnMaterialVoucherDocument(emptyPackage, options));
}

{
  const pkg = clone(samplePackage);
  const before = JSON.stringify(pkg);
  buildMaterialCouponDocument(pkg, options);
  buildCuttingSheetDocument(pkg, options);
  buildReturnMaterialVoucherDocument(pkg, options);
  assert.equal(JSON.stringify(pkg), before);
}

console.log('documents tests passed');
