import assert from 'node:assert/strict';
import {
  MATERIAL_COUPON_EXTRACT_COLUMNS,
  buildMaterialCouponDocument,
  buildMaterialCouponExtractRows,
  enrichMaterialCouponLines,
  mergeMaterialCouponInventoryDetails,
  normalizeMaterialCouponLine,
} from '../src/documents/materialCoupon.js';
import { buildMaterialCouponReportHtml, getIssuerSignatureData } from '../src/reports/materialCouponReport.js';

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
      sapCode: 'SAP-1',
      itemType: 'PIPE',
      materialDescription: 'Pipe 6in',
      qty: 2,
      unit: 'EA',
      diaMm: '168.3',
      thicknessMm: '7.1',
      lengthMm: '6000',
      weightKg: '100',
      materialGrade: 'S355',
      traceability: 'TR-1',
      heatNo: 'H-1',
      po: 'PO-1',
      poItem: '10',
      status: 'AVAILABLE',
    }),
  ]),
});

function clone(value) {
  return structuredClone(value);
}

{
  const html = buildMaterialCouponReportHtml({
    ...clone(coupon),
    header: { ...coupon.header, workpack: 'Selecione um Workpack' },
  });
  assert.doesNotMatch(html, /Selecione um Workpack/i);
  assert.match(html, />WORKPACK</);
}

{
  const labels = MATERIAL_COUPON_EXTRACT_COLUMNS.map((column) => column.label);
  assert.equal(labels[0], 'MC Code:');
  assert.equal(labels.at(-1), 'DRAWBACK');
  assert.ok(labels.includes('Returned Lenght [mm]'));
  assert.equal(MATERIAL_COUPON_EXTRACT_COLUMNS.length, 48);
  assert.ok(!MATERIAL_COUPON_EXTRACT_COLUMNS.some(({ key }) => ['poItemNumber', 'remarksNotes'].includes(key)));
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
  const rows = buildMaterialCouponExtractRows({
    lines: [{ serialNumber: 'MTC-123', notes: 'MC receiving observation' }],
  });
  assert.equal(rows[0].serialNumber, '1');
  assert.equal(rows[0].notes, 'MC receiving observation');
}

{
  const line = normalizeMaterialCouponLine({
    identCode: 'ID-1',
    materialDescription: 'Plate',
    qty: '3',
    unit: 'M',
    materialGrade: 'A36',
    heatNo: 'H2',
  }, { mcCode: 'MC-X', materialDestination: 'Shop' });
  assert.equal(line.sapCode, 'ID-1');
  assert.equal(line.materialDescription, 'Plate');
  assert.equal(line.qty, '3');
  assert.equal(line.heatNo, 'H2');
}

{
  const sourceLines = [{ inventoryItemId: 'INV-1', traceability: 'TR-1', qty: '1' }];
  const inventoryItems = [{ id: 'INV-1', sapCode: '10001589845', category: 'PIPE', materialDescription: 'CRA SMLS PIPE 6', diaMm: '168.3', thicknessMm: '19.1', lengthMm: 6100, weightKg: 428.7, materialGrade: 'DNV25Cr', heatNo: '62373', mir: 'MIR-B58-001', equipment: 'Jumper', po: '1520813', poItem: '18', nfArrival: '7897', notes: 'Available' }];
  const enriched = enrichMaterialCouponLines(sourceLines, inventoryItems);
  const line = normalizeMaterialCouponLine(enriched[0]);
  assert.equal(line.sapCode, '10001589845');
  assert.equal(line.itemType, 'PIPE');
  assert.equal(line.materialDescription, 'CRA SMLS PIPE 6');
  assert.equal(line.equipment, 'Jumper');
  assert.equal(line.po, '1520813');
  assert.equal(line.poItem, '18');
  assert.deepEqual(sourceLines, [{ inventoryItemId: 'INV-1', traceability: 'TR-1', qty: '1' }]);
}

{
  const bars = [{ traceability: 'TR-RESULT', originalLength: 6100, remaining: 1200, pieces: [{}] }];
  const inventory = [{ trace: 'TR-RESULT', sapCode: '10001589845', po: '1520813', poItem: '18', heatNo: '62373', mir: 'MIR-B58-001', diaMm: '168.3', thicknessMm: '19.1', weightKg: 428.7 }];
  const [material] = mergeMaterialCouponInventoryDetails(bars, inventory);
  assert.equal(material.sapCode, '10001589845');
  assert.equal(material.po, '1520813');
  assert.equal(material.poItem, '18');
  assert.equal(material.lengthMm, 6100);
  assert.equal(material.heatNo, '62373');
  assert.deepEqual(bars, [{ traceability: 'TR-RESULT', originalLength: 6100, remaining: 1200, pieces: [{}] }]);
}

{
  const line = normalizeMaterialCouponLine({
    sapCode: '10001589845',
    category: 'PIPE',
    materialDescription: 'CRA SMLS PIPE 6',
    diaMm: '168.3',
    thicknessMm: '19.1',
    widthMm: '0',
    lengthMm: '6100',
    weightKg: '428.7',
    materialGrade: 'DNV25Cr',
    trace: 'GPP1520813-18-001',
    heatNo: '62373',
    mir: 'MIR-B58-001',
    equipment: 'Jumper',
    poItem: '18',
    nfArrival: '7897',
    notes: 'Available',
  });
  assert.equal(line.sapCode, '10001589845');
  assert.equal(line.itemType, 'PIPE');
  assert.equal(line.diaMm, '168.3');
  assert.equal(line.thicknessMm, '19.1');
  assert.equal(line.weightKg, '428.7');
  assert.equal(line.mir, 'MIR-B58-001');
  assert.equal(line.equipment, 'Jumper');
  assert.equal(line.nfArrival, '7897');
  assert.equal(line.notes, 'Available');
  assert.deepEqual(Object.keys(line), MATERIAL_COUPON_EXTRACT_COLUMNS.map(({ key }) => key));
  assert.ok(!('poItemNumber' in line));
  assert.ok(!('remarksNotes' in line));
  assert.ok(!('description' in line));
  assert.ok(!('dimensions' in line));
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
  assert.ok(!html.includes('zoom'));
  assert.ok(html.includes('--mc-scale: 0.7'));
  assert.ok(html.includes('width: 281mm'));
  assert.ok(html.includes('height: 194mm'));
  assert.ok(html.includes('font-size: calc(12pt * var(--mc-scale))'));
  assert.ok(!html.includes('renderedScale'));
  assert.ok(html.includes('overflow-wrap: break-word'));
  assert.ok(html.includes('white-space: normal'));
  assert.ok(html.includes('PAGE_SAFETY_MARGIN_MM = 3'));
  assert.ok(!html.includes('mc-report-page-height-probe'));
  assert.ok(html.includes('MC Issuing Responsible'));
  assert.ok(html.includes('Material Dispatch Responsible'));
  assert.ok(html.includes('Material Receiving Responsible'));
  assert.ok(html.includes('background: transparent;'));
  assert.ok(html.includes('font-size: calc(12pt * var(--mc-scale));'));
  assert.ok(html.includes('object-position: center;'));
}

{
  const issuer = getIssuerSignatureData({
    name: 'Maria Silva',
    role: 'PPC Planner',
    company: 'Saipem do Brasil',
    signatureImage: 'data:image/png;base64,signature',
  });
  assert.equal(issuer.name, 'Maria Silva');
  assert.equal(issuer.role, 'PPC Planner');
  assert.equal(issuer.company, 'Saipem do Brasil');
  assert.equal(issuer.signatureImage, 'data:image/png;base64,signature');
  assert.deepEqual(getIssuerSignatureData({ company: 'Ignored without name' }), {
    name: '', role: '', company: '', date: '', signatureImage: '',
  });
}

{
  const html = buildMaterialCouponReportHtml(clone(coupon), {
    profile: {
      name: 'Maria Silva',
      role: 'PPC Planner',
      company: 'Saipem do Brasil',
      signatureImage: 'data:image/png;base64,signature',
    },
  });
  assert.ok(html.includes('Maria Silva'));
  assert.ok(html.includes('Saipem do Brasil'));
  assert.ok(html.includes('PPC Planner'));
  assert.ok(html.includes('mc-report-signature-image'));
  assert.ok(html.includes('min-height: calc(12mm * var(--mc-scale));'));
  assert.ok(html.includes('max-height: calc(14mm * var(--mc-scale));'));
}

{
  const html = buildMaterialCouponReportHtml(clone(coupon), {
    reportHeader: { documentTitles: { materialCoupon: 'Cupom de Material' } },
  });
  assert.ok(html.includes('Cupom de Material'));
}

console.log('materialCouponDocument tests passed');
