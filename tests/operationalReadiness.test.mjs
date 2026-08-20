import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEquipmentReadinessByProject,
  buildMaterialBottlenecks,
  buildOperationalReadiness,
  groupEquipmentReadinessByProject,
  searchOperationalRecords,
} from '../src/core/operationalReadiness.js';

function data(overrides = {}) {
  return {
    projects: [{ id: 'P1', name: 'B58' }],
    equipments: [{ id: 'EQ1', projectId: 'P1', equipmentName: 'Production Jumper', equipmentTags: ['31-WJ-10-1010'] }],
    mtoItems: [], purchaseOrders: [], poItems: [], receipts: [], receiptLines: [], materialUnits: [], inventoryItems: [], allocations: [], materialReservations: [], stockMovements: [],
    workpacks: [], drawings: [], materialCoupons: [], cuttingSheets: [], returnMaterialVouchers: [],
    scope: { projectId: 'P1', projectName: 'B58', isAllProjects: false },
    ...overrides,
  };
}

test('classifies a physical Equipment TAG as ready and counts its Workpack', () => {
  const result = buildOperationalReadiness(data({
    mtoItems: [{ id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: '31-WJ-10-1010', identCode: 'PP-SD-168-19', qty: 2, status: 'OPEN' }],
    inventoryItems: [{ id: 'INV1', projectId: 'P1', identCode: 'PP-SD-168-19', qty: 2, balanceQty: 2, status: 'available', qualityStatus: 'ACCEPTED' }],
    workpacks: [{ id: 'WP1', projectId: 'P1', equipmentId: 'EQ1', equipmentTag: '31-WJ-10-1010' }],
  }));

  assert.equal(result.materialAvailability, 1);
  assert.equal(result.readyEquipments, 1);
  assert.equal(result.blockedEquipments, 0);
  assert.equal(result.readyWorkpacks, 1);
  assert.equal(result.equipmentRows[0].status, 'READY');
});

test('marks a TAG blocked when its MTO demand has no stock or pending PO', () => {
  const result = buildOperationalReadiness(data({
    mtoItems: [{ id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: '31-WJ-10-1010', identCode: 'BD-SD-168-19-90', qty: 1, status: 'OPEN' }],
  }));
  assert.equal(result.blockedEquipments, 1);
  assert.equal(result.criticalItems, 1);
  assert.equal(result.equipmentRows[0].status, 'BLOCKED');
});

test('groups Equipment readiness by Project and counts blocked Equipment', () => {
  const source = data({
    projects: [{ id: 'P1', name: 'B58' }, { id: 'P2', name: 'B59' }],
    equipments: [
      { id: 'EQ1', projectId: 'P1', equipmentName: 'Ready Jumper', equipmentTags: ['TAG-01'] },
      { id: 'EQ2', projectId: 'P1', equipmentName: 'Blocked Jumper', equipmentTags: ['TAG-02'] },
      { id: 'EQ3', projectId: 'P2', equipmentName: 'Unplanned Jumper', equipmentTags: ['TAG-03'] },
    ],
    mtoItems: [
      { id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: 'TAG-01', identCode: 'PP-SD-168-19', qty: 1, status: 'OPEN' },
      { id: 'M2', projectId: 'P1', equipmentId: 'EQ2', tag: 'TAG-02', identCode: 'BD-SD-168-19-90', qty: 1, status: 'OPEN' },
    ],
    inventoryItems: [{ id: 'INV1', projectId: 'P1', identCode: 'PP-SD-168-19', qty: 1, balanceQty: 1, status: 'available', qualityStatus: 'ACCEPTED' }],
    scope: { projectId: '', projectName: '', isAllProjects: true },
  });

  const groups = buildEquipmentReadinessByProject(source);

  assert.deepEqual(groups.map((group) => ({
    projectId: group.projectId,
    totalEquipments: group.totalEquipments,
    criticalEquipments: group.criticalEquipments,
  })), [
    { projectId: 'P1', totalEquipments: 2, criticalEquipments: 1 },
    { projectId: 'P2', totalEquipments: 1, criticalEquipments: 0 },
  ]);
  assert.deepEqual(groups[0].equipmentRows.map((row) => [row.tag, row.status]), [['TAG-01', 'READY'], ['TAG-02', 'BLOCKED']]);
  assert.equal(groups[1].equipmentRows[0].status, 'NOT_PLANNED');
});

test('does not add a Project without Equipment to grouped readiness', () => {
  const source = data({ projects: [{ id: 'P1', name: 'B58' }, { id: 'EMPTY', name: 'No Equipment' }] });
  const readiness = buildOperationalReadiness(source);
  const groups = groupEquipmentReadinessByProject(readiness, source);

  assert.deepEqual(groups.map((group) => group.projectId), ['P1']);
  assert.equal(groups[0].totalEquipments, 1);
  assert.equal(groups[0].criticalEquipments, 0);
});

test('builds a critical Equipment row with its linked PO Item delivery and status', () => {
  const result = buildMaterialBottlenecks(data({
    mtoItems: [{ id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: '31-WJ-10-1010', identCode: 'PP-SD-168-19', material: 'S32750', qty: 2, status: 'OPEN' }],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001', status: 'OPEN' }],
    poItems: [{ id: 'PI1', projectId: 'P1', purchaseOrderId: 'PO1', itemNumber: '10', identCode: 'PP-SD-168-19', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-09-10', status: 'IN_PRODUCTION' }],
    allocations: [{ id: 'A1', projectId: 'P1', mtoLineId: 'M1', poItemId: 'PI1', allocatedQuantity: 1, unitOfMeasure: 'EA', status: 'ACTIVE' }],
  }));

  assert.equal(result.criticalEquipmentRows[0].materials[0].poLinkStatus, 'LINKED');
  assert.equal(result.criticalEquipmentRows[0].nextDeliveryDate, '2026-09-10');
  assert.deepEqual(result.criticalEquipmentRows[0].poItems[0], {
    linked: true, poItemId: 'PI1', purchaseOrderId: 'PO1', poNumber: '450001', itemNumber: '10',
    deliveryDate: '2026-09-10', status: 'IN_PRODUCTION',
  });
});

test('uses the partial ETA CTCO instead of the generic PO item delivery date for Equipment bottlenecks', () => {
  const result = buildMaterialBottlenecks(data({
    mtoItems: [{ id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: '31-WJ-10-1010', identCode: 'PP-SD-168-19', qty: 2, status: 'OPEN' }],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001', status: 'OPEN' }],
    poItems: [{ id: 'PI1', projectId: 'P1', purchaseOrderId: 'PO1', itemNumber: '10', identCode: 'PP-SD-168-19', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-09-10' }],
    allocations: [{ id: 'A1', projectId: 'P1', mtoLineId: 'M1', poItemId: 'PI1', allocatedQuantity: 1, status: 'ACTIVE' }],
    deliveryForecasts: [{ id: 'F1', poItemId: 'PI1', quantity: 1, stage: 'CUSTOMS_CLEARANCE', customsChannel: 'YELLOW', ctcoForecastDate: '2026-09-18', status: 'ACTIVE' }],
  }));

  assert.equal(result.criticalEquipmentRows[0].nextDeliveryDate, '2026-09-18');
  assert.equal(result.criticalEquipmentRows[0].poItems[0].stage, 'CUSTOMS_CLEARANCE');
  assert.equal(result.criticalEquipmentRows[0].poItems[0].customsChannel, 'YELLOW');
});

test('marks a critical Equipment material without a persisted PO allocation', () => {
  const result = buildMaterialBottlenecks(data({
    mtoItems: [{ id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: '31-WJ-10-1010', identCode: 'BD-SD-168-19-90', qty: 1, status: 'OPEN' }],
  }));

  assert.equal(result.criticalEquipmentRows[0].materials[0].poLinked, false);
  assert.equal(result.criticalEquipmentRows[0].materials[0].poLinkStatus, 'NO_LINKED_PO');
  assert.deepEqual(result.criticalEquipmentRows[0].materials[0].poItems, []);
  assert.equal(result.bottlenecks[0].poItem, null);
  assert.equal(result.bottlenecks[0].poLinkStatus, 'NO_LINKED_PO');
});

test('groups two critical Equipments sharing the same persisted PO Item bottleneck', () => {
  const result = buildMaterialBottlenecks(data({
    equipments: [
      { id: 'EQ1', projectId: 'P1', equipmentName: 'Jumper 1', equipmentTags: ['TAG-01'] },
      { id: 'EQ2', projectId: 'P1', equipmentName: 'Jumper 2', equipmentTags: ['TAG-02'] },
    ],
    mtoItems: [
      { id: 'M1', projectId: 'P1', equipmentId: 'EQ1', tag: 'TAG-01', identCode: 'PP-SD-168-19', qty: 2, status: 'OPEN' },
      { id: 'M2', projectId: 'P1', equipmentId: 'EQ2', tag: 'TAG-02', identCode: 'PP-SD-168-19', qty: 2, status: 'OPEN' },
    ],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001', status: 'OPEN' }],
    poItems: [{ id: 'PI1', projectId: 'P1', purchaseOrderId: 'PO1', itemNumber: '10', identCode: 'PP-SD-168-19', orderedQuantity: 2, unitOfMeasure: 'EA', status: 'OPEN' }],
    allocations: [
      { id: 'A1', projectId: 'P1', mtoLineId: 'M1', poItemId: 'PI1', allocatedQuantity: 1, unitOfMeasure: 'EA', status: 'ACTIVE' },
      { id: 'A2', projectId: 'P1', mtoLineId: 'M2', poItemId: 'PI1', allocatedQuantity: 1, unitOfMeasure: 'EA', status: 'ACTIVE' },
    ],
  }));

  assert.equal(result.bottlenecks.length, 1);
  assert.equal(result.bottlenecks[0].equipmentCount, 2);
  assert.deepEqual(result.bottlenecks[0].tags, ['TAG-01', 'TAG-02']);
});

test('excludes a critical MTO material with no associable Equipment', () => {
  const result = buildMaterialBottlenecks(data({
    equipments: [],
    mtoItems: [{ id: 'M1', projectId: 'P1', identCode: 'UNASSIGNED', qty: 1, status: 'OPEN' }],
  }));

  assert.deepEqual(result, { criticalEquipmentRows: [], bottlenecks: [] });
});

test('searches operational objects by traceability, heat and TAG', () => {
  const source = data({
    drawings: [{ id: 'D1', drawingNo: '263221-SGU-JU-PI-DA-028', title: 'Production Jumper' }],
    inventoryItems: [{ id: 'INV1', traceability: 'AS02JU10', heatNo: 'H123456', identCode: 'PP-SD-168-19' }],
    materialCoupons: [{ id: 'MC1', number: 'MC-021', items: [{ traceability: 'AS02JU10', tag: '31-WJ-10-1010' }] }],
  });
  assert.equal(searchOperationalRecords(source, 'AS02JU10').some((item) => item.type === 'Inventory'), true);
  assert.equal(searchOperationalRecords(source, 'H123456')[0].phase, 'inventory');
  assert.equal(searchOperationalRecords(source, '31-WJ-10-1010').some((item) => item.type === 'Equipment'), true);
});
