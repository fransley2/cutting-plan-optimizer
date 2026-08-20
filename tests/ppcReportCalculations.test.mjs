import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPpcReports } from '../src/core/ppcReportCalculations.js';

function fixture() {
  return {
    projects: [{ id: 'P1', name: 'Project One' }],
    equipments: [{ id: 'E1', projectId: 'P1', equipmentTags: ['TAG-01'], equipmentName: 'Equipment 01' }],
    workpacks: [
      { id: 'W1', projectId: 'P1', equipmentId: 'E1', wpNo: 'WP-001', priority: 'HIGH', status: 'MATERIAL_RESERVED', plannedStartDate: '2026-08-20', plannedFinishDate: '2026-08-25', plannedManHours: 40, actualManHours: 8 },
      { id: 'W2', projectId: 'P1', equipmentId: 'E1', wpNo: 'WP-002', priority: 'CRITICAL', status: 'MATERIAL_PENDING', plannedStartDate: '2026-08-21', plannedFinishDate: '2026-08-28', plannedManHours: 60, actualManHours: 0 },
      { id: 'W3', projectId: 'P1', equipmentId: 'E1', wpNo: 'WP-003', status: 'PLANNED' },
      { id: 'W4', projectId: 'P1', equipmentId: 'E1', wpNo: 'WP-004', status: 'IN_FABRICATION', plannedManHours: 20, actualManHours: 10 },
    ],
    workpackLinks: [
      { id: 'L1', workpackId: 'W1', targetType: 'MTO_ITEM', targetId: 'M1', status: 'ACTIVE' },
      { id: 'L2', workpackId: 'W2', targetType: 'MTO_ITEM', targetId: 'M2', status: 'ACTIVE' },
    ],
    materialCoupons: [{ id: 'MC1', projectId: 'P1', workpackId: 'W1', status: 'issued' }],
    cuttingSheets: [],
    materialUnits: [
      { id: 'U1', inspectionStatus: 'PENDING', identCode: 'ID-01' },
      { id: 'U2', inspectionStatus: 'HOLD', identCode: 'ID-02' },
    ],
    inventoryItems: [
      { id: 'I1', status: 'AVAILABLE', balanceQty: 3, reservedQty: 0, weightKg: 20 },
      { id: 'I2', status: 'RESERVED', balanceQty: 1, reservedQty: 1, weightKg: 10 },
    ],
  };
}

function baseDashboard() {
  return {
    demandAnalysis: {
      itemRows: [
        { id: 'M1', projectId: 'P1', projectName: 'Project One', materialKey: 'ID-01', identCode: 'ID-01', materialGrade: 'A', requiredQty: 2, availableQty: 2, inTransitQty: 0, shortageQty: 0, critical: false },
        { id: 'M2', projectId: 'P1', projectName: 'Project One', materialKey: 'ID-02', identCode: 'ID-02', materialGrade: 'B', requiredQty: 4, availableQty: 1, inTransitQty: 0, shortageQty: 3, critical: true },
      ],
    },
    executive: { tables: [{ key: 'legacy', title: 'Existing report', rows: [] }] },
  };
}

test('builds a Workpack-centered PPC queue with separate ready, blocked and unplanned states', () => {
  const reports = buildPpcReports(fixture(), { today: '2026-08-19', horizonDays: 28, baseDashboard: baseDashboard() });
  const rows = reports.executive.tables.find((table) => table.key === 'ppcWorkpackQueue').rows;

  assert.equal(reports.executive.kpis.find((item) => item.key === 'workpacksInHorizon').value, 3);
  assert.equal(reports.executive.kpis.find((item) => item.key === 'readyWorkpacks').value, 1);
  assert.equal(reports.executive.kpis.find((item) => item.key === 'blockedWorkpacks').value, 1);
  assert.equal(reports.executive.kpis.find((item) => item.key === 'notPlannedWorkpacks').value, 1);
  assert.equal(rows.find((row) => row.workpackNo === 'WP-001').ppcStatus, 'READY');
  assert.equal(rows.find((row) => row.workpackNo === 'WP-002').ppcStatus, 'BLOCKED');
  assert.equal(rows.find((row) => row.workpackNo === 'WP-003').ppcStatus, 'NOT_PLANNED');
  assert.equal(rows.find((row) => row.workpackNo === 'WP-004').ppcStatus, 'IN_PROGRESS');
  assert.equal(reports.executive.tables.at(-1).key, 'legacy');
});

test('consolidates material blockers and exposes Warehouse and Fabrication control tables', () => {
  const reports = buildPpcReports(fixture(), { today: '2026-08-19', horizonDays: 28, baseDashboard: baseDashboard() });
  const blocker = reports.executive.tables.find((table) => table.key === 'consolidatedMaterialBlockers').rows[0];

  assert.equal(blocker.identCode, 'ID-02');
  assert.equal(blocker.shortageQty, 3);
  assert.equal(blocker.affectedWorkpacks, 'WP-002');
  assert.equal(reports.warehouse.kpis.find((item) => item.key === 'inspectionPending').value, 1);
  assert.equal(reports.warehouse.kpis.find((item) => item.key === 'holdMaterialUnits').value, 1);
  assert.equal(reports.warehouse.tables.find((table) => table.key === 'inspectionExceptions').rows.length, 2);
  assert.equal(reports.fabrication.kpis.find((item) => item.key === 'inFabrication').value, 1);
  assert.ok(reports.fabrication.tables.some((table) => table.key === 'fabricationCapacity'));
});

test('uses partial ETA CTCO linked through PO × MTO to block a late fabrication start', () => {
  const data = fixture();
  Object.assign(data, {
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001' }],
    poItems: [{ id: 'POI1', projectId: 'P1', purchaseOrderId: 'PO1', orderedQuantity: 2, unitOfMeasure: 'EA' }],
    allocations: [{ id: 'A1', projectId: 'P1', mtoLineId: 'M1', poItemId: 'POI1', allocatedQuantity: 2, status: 'ACTIVE' }],
    deliveryForecasts: [{ id: 'F1', projectId: 'P1', poItemId: 'POI1', quantity: 2, stage: 'INTERNATIONAL_TRANSIT', ctcoForecastDate: '2026-08-24', status: 'ACTIVE' }],
    receipts: [], receiptLines: [], materialReservations: [], stockMovements: [],
  });
  const dashboard = baseDashboard();
  Object.assign(dashboard.demandAnalysis.itemRows[0], { availableQty: 0, inTransitQty: 2, critical: false });
  const reports = buildPpcReports(data, { today: '2026-08-19', horizonDays: 28, baseDashboard: dashboard });
  const row = reports.executive.tables.find((table) => table.key === 'ppcWorkpackQueue').rows.find((item) => item.workpackNo === 'WP-001');

  assert.equal(row.ppcStatus, 'BLOCKED');
  assert.equal(row.etaCtco, '2026-08-24');
  assert.equal(row.poMtoLinks, 1);
  assert.equal(row.blocker, 'ETA CTCO após o início planejado');
  const logistics = reports.warehouse.tables.find((table) => table.key === 'importLogistics');
  assert.equal(logistics.rows[0].purchaseOrder, '450001');
  assert.equal(logistics.rows[0].ctcoForecastDate, '2026-08-24');
  assert.equal(logistics.rows[0].poMtoLinks, 1);
});
