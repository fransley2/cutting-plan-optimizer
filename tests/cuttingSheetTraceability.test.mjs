import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCuttingSheetTraceabilityCsv,
  buildCuttingSheetTraceabilityRows,
  buildOffcutExportRows,
} from '../src/reports/cuttingSheetTraceability.js';

test('resolves a piece through its Coupon line to the stable MTO item', () => {
  const rows = buildCuttingSheetTraceabilityRows({
    cuttingSheets: [{
      id: 'CS-1', number: 'CS-001', status: 'cut', createdBy: 'USER-1', projectId: 'P-1', materialCouponId: 'MC-1',
      workpackId: 'WP-1', bars: [{ materialGrade: 'STOCK-GRADE', traceability: 'TR-001', pieces: [{ materialCouponLineId: 'MC-L1', drawing: 'SNAP-DWG', mark: 'SNAP-M', pos: 'SNAP-P', material: 'SNAP-MAT', qty: 2, nominalLengthMm: 1000, hasSobremetal: true, sobremetalMm: 500 }] }],
    }],
    materialCoupons: [{
      id: 'MC-1', number: 'MC-001',
      items: [{ id: 'MC-L1', mtoItemId: 'STALE-COPY' }],
      metadata: { coupon: { lines: [{ id: 'MC-L1', mtoItemId: 'MTO-1', equipmentId: 'EQ-1', equipment: 'Production Jumper' }] } },
    }],
    mtoItems: [{ id: 'MTO-1', drawing: 'DWG-100', mark: 'M-10', pos: 'P-20', material: 'A36' }],
    equipments: [{ id: 'EQ-1', name: 'Production Jumper', equipmentTags: ['TAG-01'], fieldLocation: 'PREFAB' }],
    projects: [{ id: 'P-1', name: 'B58' }],
    workpacks: [{ id: 'WP-1', wpNo: 'B58-WP-001' }],
  });

  assert.deepEqual(rows, [{
    cuttingSheetNumber: 'CS-001', cuttingSheetStatus: 'Cortada', project: 'B58', workpack: 'B58-WP-001', materialCouponNumber: 'MC-001',
    responsible: 'USER-1', createdAt: '', drawing: 'DWG-100', mark: 'M-10', pos: 'P-20', pieceQty: 2,
    nominalLengthMm: 1000, sobremetalMm: 500, effectiveLengthMm: 1500, pieceMaterial: 'A36', stockMaterialGrade: 'STOCK-GRADE',
    stockReference: 'TR-001', equipmentLabel: 'Production Jumper', equipmentTag: 'TAG-01', location: 'PREFAB', mtoLinkStatus: 'Vinculado',
  }]);
});

test('uses the piece snapshot when the MTO link cannot be resolved', () => {
  const [row] = buildCuttingSheetTraceabilityRows({
    cuttingSheets: [{ id: 'CS-2', materialCouponId: 'MC-2', bars: [{ materialGrade: 'S355', pieces: [{ materialCouponLineId: 'MC-L2', dwgNumber: 'DWG-S', mark: 'M-S', position: 'POS-S', material: 'MAT-S' }] }] }],
    materialCoupons: [{ id: 'MC-2', metadata: { coupon: { header: { mcCode: 'MC-002' }, lines: [{ id: 'MC-L2', mtoItemId: 'MISSING', equipmentId: 'EQ-2', equipment: 'Snapshot Equipment' }] } } }],
    mtoItems: [],
  });

  assert.equal(row.mtoLinkStatus, 'Não vinculado');
  assert.equal(row.drawing, 'DWG-S');
  assert.equal(row.mark, 'M-S');
  assert.equal(row.pos, 'POS-S');
  assert.equal(row.pieceMaterial, 'MAT-S');
  assert.equal(row.materialCouponNumber, 'MC-002');
  assert.equal(row.equipmentLabel, 'Snapshot Equipment');
  assert.equal(row.pieceQty, 1);
  assert.equal(Object.hasOwn(row, 'equipmentId'), false);
});

test('keeps a Cutting Sheet without materialCouponId reportable', () => {
  const [row] = buildCuttingSheetTraceabilityRows({
    cuttingSheets: [{ id: 'CS-3', number: 'CS-003', status: 'draft', projectId: 'P-3', bars: [{ pieces: [{ drawing: 'DWG-3', material: 'A572' }] }] }],
    materialCoupons: [],
    mtoItems: [],
  });

  assert.equal(row.materialCouponNumber, '');
  assert.equal(row.equipmentLabel, '');
  assert.equal(row.mtoLinkStatus, 'Não vinculado');
  assert.equal(row.drawing, 'DWG-3');
  assert.equal(row.cuttingSheetStatus, 'Rascunho');
  assert.equal(Object.hasOwn(row, 'cuttingSheetId'), false);
  assert.equal(Object.hasOwn(row, 'projectId'), false);
  assert.equal(Object.hasOwn(row, 'materialCouponId'), false);
});

test('creates one correctly resolved row for each of multiple pieces', () => {
  const rows = buildCuttingSheetTraceabilityRows({
    cuttingSheets: [{
      id: 'CS-4', materialCouponId: 'MC-4',
      bars: [{ materialGrade: 'BAR-GRADE', pieces: [
        { id: 'P-1', materialCouponLineId: 'L-1' },
        { id: 'P-2', materialCouponLineId: 'L-2', qty: 3 },
      ] }],
    }],
    materialCoupons: [{ id: 'MC-4', items: [
      { id: 'L-1', mtoItemId: 'MTO-A', equipmentId: 'EQ-A', equipment: 'Equipment A' },
      { id: 'L-2', mtoItemId: 'MTO-B', equipmentId: 'EQ-B', equipment: 'Equipment B' },
    ] }],
    mtoItems: [
      { id: 'MTO-A', drawing: 'DWG-A', mark: 'MARK-A', pos: 'POS-A', material: 'MAT-A' },
      { id: 'MTO-B', drawing: 'DWG-B', mark: 'MARK-B', pos: 'POS-B', material: 'MAT-B' },
    ],
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ drawing, mark, pos, pieceMaterial, equipmentLabel, pieceQty, mtoLinkStatus }) => (
    { drawing, mark, pos, pieceMaterial, equipmentLabel, pieceQty, mtoLinkStatus }
  )), [
    { drawing: 'DWG-A', mark: 'MARK-A', pos: 'POS-A', pieceMaterial: 'MAT-A', equipmentLabel: 'Equipment A', pieceQty: 1, mtoLinkStatus: 'Vinculado' },
    { drawing: 'DWG-B', mark: 'MARK-B', pos: 'POS-B', pieceMaterial: 'MAT-B', equipmentLabel: 'Equipment B', pieceQty: 3, mtoLinkStatus: 'Vinculado' },
  ]);
});

test('resolves Equipment fieldLocation only for a matching supplied equipment', () => {
  const input = {
    cuttingSheets: [{ id: 'CS-5', materialCouponId: 'MC-5', bars: [{ pieces: [{ materialCouponLineId: 'L-5' }] }] }],
    materialCoupons: [{ id: 'MC-5', items: [{ id: 'L-5', equipmentId: 'EQ-5', equipment: 'Equipment Five' }] }],
    mtoItems: [],
  };

  assert.equal(buildCuttingSheetTraceabilityRows(input)[0].location, '');
  assert.equal(buildCuttingSheetTraceabilityRows({ ...input, equipments: [{ id: 'EQ-OTHER', fieldLocation: 'YARD B' }] })[0].location, '');
  assert.equal(buildCuttingSheetTraceabilityRows({ ...input, equipments: [{ id: 'EQ-5', fieldLocation: 'YARD A' }] })[0].location, 'YARD A');
});

test('builds traceability CSV with Portuguese headers and escaped values', () => {
  const csv = buildCuttingSheetTraceabilityCsv({
    cuttingSheets: [{
      id: '1c257884-8332-454d-a11c-c61705890f8e',
      projectId: 'ab252099-a228-4a86-ad5d-df84cf453957',
      materialCouponId: 'da98bd47-dd31-4f6b-9160-5b89756fe9f1',
      number: 'CS,"006"', status: 'draft', bars: [{ pieces: [{}] }],
    }],
  });

  assert.ok(csv.startsWith('"Folha de Corte","Status","Projeto","Workpack","Material Coupon"'));
  assert.ok(csv.includes('"CS,""006"""'));
  assert.equal(csv.includes('ID Cutting Sheet'), false);
  assert.equal(csv.includes('ID Projeto'), false);
  assert.equal(csv.includes('ID Material Coupon'), false);
  assert.equal(csv.includes('ID Equipment'), false);
  assert.equal(csv.includes('1c257884-8332-454d-a11c-c61705890f8e'), false);
  assert.equal(csv.includes('ab252099-a228-4a86-ad5d-df84cf453957'), false);
  assert.equal(csv.includes('true'), false);
  assert.equal(csv.includes('false'), false);
  assert.ok(csv.includes('"Rascunho"'));
  assert.ok(csv.includes('"Não vinculado"'));
  assert.equal(csv.split('\r\n').length, 2);
});

test('builds an operational offcut list without internal ids or Workpack placeholders', () => {
  const rows = buildOffcutExportRows({
    cuttingSheets: [{
      id: '1c257884-8332-454d-a11c-c61705890f8e', number: 'B58_FAB_CS-003', projectId: 'P-1', workpackId: '',
      materialCouponId: 'MC-1', metadata: { workpack: 'Selecione um Workpack', materialCouponNumber: 'B58_FAB_MC-006' },
    }],
    offcuts: [
      { cuttingSheetId: '1c257884-8332-454d-a11c-c61705890f8e', projectId: 'P-1', length: 500, status: 'reusable', traceability: 'TR-1-OC', metadata: { parentTrace: 'TR-1' } },
      { cuttingSheetId: '1c257884-8332-454d-a11c-c61705890f8e', projectId: 'P-1', length: 499, status: 'scrap', traceability: 'TR-2-OC', metadata: { parentTrace: 'TR-2' } },
    ],
    projects: [{ id: 'P-1', name: 'GRANMORGU_B58' }],
  });

  assert.deepEqual(rows.map(({ classification, operationalStatus, lengthMm }) => ({ classification, operationalStatus, lengthMm })), [
    { classification: 'Reaproveitável', operationalStatus: 'Disponível para destinação', lengthMm: 500 },
    { classification: 'Scrap', operationalStatus: 'Scrap confirmado', lengthMm: 499 },
  ]);
  assert.equal(rows[0].workpack, '');
  assert.equal(rows[0].cuttingSheetNumber, 'B58_FAB_CS-003');
  assert.equal(rows[0].materialCouponNumber, 'B58_FAB_MC-006');
  assert.equal(Object.hasOwn(rows[0], 'cuttingSheetId'), false);
  assert.equal(Object.hasOwn(rows[0], 'projectId'), false);
});
