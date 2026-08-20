import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allPoItemStatusRows,
  buildMaterialDeliveryTimeline,
  buildMaterialUtilizationSummary,
  buildPoItemStatusBreakdown,
  calculateReportsDashboard,
  normalizeReportUnit,
  reportEquipmentTagOptions,
  reportIsoWeek,
  reportMaterialKey,
  reportWeekStart,
} from '../src/core/reportCalculations.js';

function baseData(overrides = {}) {
  return {
    projects: [{ id: 'P1', name: 'Block 58' }],
    equipments: [],
    mtoItems: [],
    purchaseOrders: [],
    poItems: [],
    receipts: [],
    receiptLines: [],
    materialUnits: [],
    inventoryItems: [],
    allocations: [],
    materialReservations: [],
    stockMovements: [],
    cuttingSheets: [],
    returnMaterialVouchers: [],
    scope: { projectId: 'P1', projectName: 'Block 58', isAllProjects: false },
    ...overrides,
  };
}

test('excludes placeholder values from Equipment Tag report filters', () => {
  const options = reportEquipmentTagOptions(baseData({
    equipments: [
      { id: 'E1', equipmentTags: ['_', 'TAG-01'] },
      { id: 'E2', clientTag: 'N/A' },
    ],
    mtoItems: [{ id: 'M1', qty: 1, tag: '-' }],
  }));
  assert.deepEqual(options.map((option) => option.value), ['TAG-01']);
});

test('aggregates useful nesting utilization by stock length instead of averaging sheet percentages', () => {
  const result = buildMaterialUtilizationSummary(baseData({
    cuttingSheets: [
      { id: 'CS1', status: 'released', summary: { totalNestedLength: 100 }, planning: { solution: { totalStockLength: 100, totalTrims: 5 } }, bars: [{ leftTrim: 2, rightTrim: 3 }] },
      { id: 'CS2', status: 'released', summary: { totalNestedLength: 450 }, planning: { solution: { totalStockLength: 900, totalTrims: 20 } }, bars: [{ leftTrim: 10, rightTrim: 10 }] },
    ],
  }));

  assert.equal(result.nestingUtilization, 0.55);
  assert.notEqual(result.nestingUtilization, 0.75, 'must not use the simple average of 100% and 50%');
  assert.equal(result.trimQty, 4);
  assert.equal(result.trimLengthMm, 25);
});

test('sums non-cancelled RMV lines and estimates missing returned weight from parent Inventory', () => {
  const result = buildMaterialUtilizationSummary(baseData({
    inventoryItems: [{ id: 'INV1', lengthMm: 1000, weightKg: 100 }],
    returnMaterialVouchers: [
      { id: 'RMV1', status: 'returned', returnedItems: [{ qty: 2, lengthMm: 200, weightKg: 30 }, { qty: 1, lengthMm: 500, parentInventoryItemId: 'INV1' }] },
      { id: 'RMV2', status: 'cancelled', returnedItems: [{ qty: 10, lengthMm: 1000, weightKg: 100 }] },
    ],
  }));

  assert.equal(result.returnedQty, 3);
  assert.equal(result.returnedLengthMm, 700);
  assert.equal(result.returnedWeightKg, 80);
  assert.equal(Object.keys(result).some((key) => key.toLowerCase().includes('scrap')), false);
});

test('uses procurement metric precedence for consumed, reserved and stock quantities', () => {
  const result = buildMaterialUtilizationSummary(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'ISSUED' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 10, weightKg: 100, status: 'OPEN' }],
    inventoryItems: [{ id: 'INV1', projectId: 'P1', qty: 10, balanceQty: 4, reservedQty: 2, issuedQty: 4, weightKg: 100, metadata: { poItemId: 'PI1' } }],
    materialReservations: [{ poItemId: 'PI1', status: 'ACTIVE', quantity: 9 }],
    stockMovements: [{ poItemId: 'PI1', movementType: 'CONSUME_STOCK', quantityDelta: -7 }],
  }));

  assert.equal(result.consumedQty, 4);
  assert.equal(result.reservedQty, 2);
  assert.equal(result.stockQty, 6);
  assert.equal(result.consumedWeightKg, 40);
  assert.equal(result.reservedWeightKg, 20);
  assert.equal(result.stockWeightKg, 60);
});

function kpiValue(dashboard, key) {
  return dashboard.kpis.find((item) => item.key === key)?.value;
}

test('calculates immediate availability, pending PO coverage and overdue ranking without double counting receipts', () => {
  const result = calculateReportsDashboard(baseData({
    mtoItems: [{ id: 'M1', projectId: 'P1', qty: 10, weightKg: 100, identCode: 'SAP-1', material: 'A36', status: 'open', drawing: 'D1', mark: 'M1', pos: '1' }],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001', status: 'OPEN' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '10', identCode: 'SAP-1', orderedQuantity: 10, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN' }],
    receipts: [{ id: 'R1', projectId: 'P1', arrivalDate: '2026-07-14', status: 'INSPECTED' }],
    receiptLines: [{ id: 'RL1', receiptId: 'R1', poItemId: 'PI1', receivedQuantity: 3, unitOfMeasure: 'EA' }],
    materialUnits: [{ id: 'U1', projectId: 'P1', receiptLineId: 'RL1', weightKg: 30 }],
    inventoryItems: [{ id: 'I1', projectId: 'P1', identCode: 'SAP-1', qty: 4, balanceQty: 4, receivedQty: 4, weightKg: 40, status: 'available', qualityStatus: 'ACCEPTED', mir: 'MIR-1', metadata: { poItemId: 'PI1' } }],
    allocations: [{ id: 'A1', projectId: 'P1', mtoLineId: 'M1', poItemId: 'PI1', allocatedQuantity: 10, status: 'ACTIVE' }],
  }), { today: '2026-07-22' });

  assert.equal(kpiValue(result.executive, 'materialAvailability'), 0.4);
  assert.equal(kpiValue(result.executive, 'missingWeightKg'), 60);
  assert.equal(kpiValue(result.executive, 'criticalItems'), 0);
  const received = result.receiving.kpis.find((item) => item.key === 'totalReceived');
  assert.equal(received.value, '4 EA', 'Inventory and receipt quantities must be reconciled with max(), not added');
  assert.deepEqual(received.breakdown, [{ unit: 'EA', value: 4 }]);
  assert.equal(kpiValue(result.receiving, 'mirIssued'), 1);
  assert.deepEqual(result.availability.charts.byProject[0], {
    projectId: 'P1',
    projectName: 'Block 58',
    required: 10,
    available: 4,
    inTransit: 6,
    missing: 0,
    percentage: 0.4,
  });
  assert.equal(result.executive.tables[2].rows[0].daysOverdue, 21);
  assert.deepEqual(result.receiving.charts.weeklyReceipts[0], {
    week: '2026-W29',
    weekLabel: 'W29',
    weekYear: 2026,
    weekStart: '2026-07-13',
    receiptCount: 1,
    quantitiesByUnit: [{ unit: 'EA', value: 3 }],
    quantitySummary: '3 EA',
    receivedQuantity: 3,
    weightKg: 30,
  });
});

test('keeps MTO IDENT CODE, material grade and description as separate report fields', () => {
  const result = calculateReportsDashboard(baseData({
    mtoItems: [{
      id: 'M1', projectId: 'P1', qty: 1, identCode: 'IDENT-10', material: 'S32750',
      description: 'PIPE 10 IN', status: 'OPEN',
    }],
  }));
  const shortage = result.executive.tables[0].rows[0];
  const criticalMaterial = result.executive.tables[1].rows[0];

  assert.equal(shortage.identCode, 'IDENT-10');
  assert.equal(shortage.materialGrade, 'S32750');
  assert.equal(shortage.materialDescription, 'PIPE 10 IN');
  assert.equal(Object.hasOwn(shortage, 'material'), false);
  assert.equal(criticalMaterial.identCode, 'IDENT-10');
  assert.equal(criticalMaterial.materialGrade, 'S32750');
  assert.equal(criticalMaterial.materialDescription, 'PIPE 10 IN');
  assert.equal(Object.hasOwn(criticalMaterial, 'material'), false);
});

test('does not substitute an MTO material grade for a missing IDENT CODE', () => {
  const result = calculateReportsDashboard(baseData({
    mtoItems: [{ id: 'M1', projectId: 'P1', qty: 1, material: 'A36', status: 'OPEN' }],
  }));
  const shortage = result.executive.tables[0].rows[0];

  assert.equal(shortage.identCode, '');
  assert.equal(shortage.materialGrade, 'A36');
  assert.equal(shortage.materialDescription, '');
  assert.equal(Object.hasOwn(shortage, 'material'), false);
});

test('keeps overdue PO identity, material grade and description in their own fields', () => {
  const result = calculateReportsDashboard(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001', status: 'OPEN' }],
    poItems: [{
      id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '10',
      identCode: 'IDENT-10', materialCode: 'MAT-10', sapCode: 'SAP-10',
      materialGrade: 'S32750', description: 'DNV SMLS 450 DSU', orderedQuantity: 2,
      unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN',
    }],
  }), { today: '2026-07-22' });
  const overdue = result.executive.tables[2].rows[0];

  assert.equal(overdue.identCode, 'IDENT-10');
  assert.equal(overdue.materialCode, 'MAT-10');
  assert.equal(overdue.sapCode, 'SAP-10');
  assert.equal(overdue.materialGrade, 'S32750');
  assert.equal(overdue.materialDescription, 'DNV SMLS 450 DSU');
  assert.equal(Object.hasOwn(overdue, 'material'), false);
});

test('classifies all PO Item balances independently from overdue status', () => {
  const data = baseData({
    purchaseOrders: [
      { id: 'PO1', projectId: 'P1', poNumber: 'PO-1', status: 'OPEN' },
      { id: 'PO-CLOSED', projectId: 'P1', poNumber: 'PO-2', status: 'CLOSED' },
    ],
    poItems: [
      { id: 'NOT-STARTED', purchaseOrderId: 'PO1', itemNumber: '10', orderedQuantity: 10, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-08-10', status: 'OPEN' },
      { id: 'PARTIAL-OVERDUE', purchaseOrderId: 'PO1', itemNumber: '20', orderedQuantity: 10, unitOfMeasure: 'EA', contractualDeliveryDate: '2026-07-01', status: 'OPEN' },
      { id: 'COMPLETE-RECEIVED', purchaseOrderId: 'PO1', itemNumber: '30', orderedQuantity: 10, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN' },
      { id: 'COMPLETE-CLOSED', purchaseOrderId: 'PO-CLOSED', itemNumber: '40', orderedQuantity: 10, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN' },
    ],
    receiptLines: [
      { id: 'RL-PARTIAL', poItemId: 'PARTIAL-OVERDUE', receivedQuantity: 4, unitOfMeasure: 'EA' },
      { id: 'RL-COMPLETE', poItemId: 'COMPLETE-RECEIVED', receivedQuantity: 10, unitOfMeasure: 'EA' },
    ],
  });
  const rows = allPoItemStatusRows(data, { today: '2026-07-22' });
  const byItem = new Map(rows.map((row) => [row.itemNumber, row]));

  assert.equal(byItem.get('10').completionStatus, 'NOT_STARTED');
  assert.equal(byItem.get('10').isOverdue, false);
  assert.equal(byItem.get('20').completionStatus, 'PARTIAL');
  assert.equal(byItem.get('20').isOverdue, true);
  assert.equal(byItem.get('20').pendingQty, 6);
  assert.equal(byItem.get('30').completionStatus, 'COMPLETE');
  assert.equal(byItem.get('30').isOverdue, false);
  assert.equal(byItem.get('40').completionStatus, 'COMPLETE');
  assert.equal(byItem.get('40').pendingQty, 0);
  assert.equal(byItem.get('40').isOverdue, false);
});

test('returns every active PO Item status row without a top-10 truncation', () => {
  const poItems = Array.from({ length: 12 }, (_, index) => ({
    id: `PI-${index + 1}`,
    purchaseOrderId: 'PO1',
    itemNumber: String(index + 1),
    orderedQuantity: 1,
    unitOfMeasure: 'EA',
    status: 'OPEN',
  }));
  poItems.push({ id: 'PI-CANCELLED', purchaseOrderId: 'PO1', itemNumber: '99', orderedQuantity: 1, unitOfMeasure: 'EA', status: 'CANCELLED' });
  const rows = allPoItemStatusRows(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: 'PO-1', status: 'OPEN' }],
    poItems,
  }), { today: '2026-07-22' });

  assert.equal(rows.length, 12);
  assert.ok(rows.length > 10);
  assert.equal(rows.some((row) => row.itemNumber === '99'), false);
});

test('exposes separated material columns and the complete PO Item table in the dashboard', () => {
  const poItems = Array.from({ length: 12 }, (_, index) => ({
    id: `PI-${index + 1}`, purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: String(index + 1),
    identCode: `IDENT-${index + 1}`, materialGrade: 'S32750', description: 'DNV SMLS 450 DSU',
    orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN',
  }));
  const result = calculateReportsDashboard(baseData({
    mtoItems: [{ id: 'M1', projectId: 'P1', qty: 1, identCode: 'IDENT-1', material: 'S32750', description: 'PIPE', status: 'OPEN' }],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: 'PO-1', status: 'OPEN' }],
    poItems,
  }), { today: '2026-07-22' });
  const expectedMaterialKeys = ['identCode', 'materialGrade', 'materialDescription'];

  result.executive.tables.slice(0, 3).forEach((table) => {
    expectedMaterialKeys.forEach((key) => assert.ok(table.columns.some((column) => column.key === key)));
    assert.equal(table.columns.some((column) => column.key === 'material'), false);
  });
  const statusTable = result.receiving.tables.find((table) => table.key === 'poItemStatus');
  assert.equal(result.receiving.poItemStatusRows.length, 12);
  assert.equal(statusTable.rows, result.receiving.poItemStatusRows);
  assert.equal(statusTable.showAll, true);
});

test('marks an MTO row critical only when stock plus pending PO is still insufficient', () => {
  const result = calculateReportsDashboard(baseData({
    mtoItems: [
      { id: 'M1', projectId: 'P1', qty: 12, weightKg: 120, identCode: 'SAP-1', status: 'open' },
      { id: 'M-OLD', projectId: 'P1', qty: 99, weightKg: 990, identCode: 'SAP-1', status: 'superseded' },
      { id: 'M-CANCEL', projectId: 'P1', qty: 99, weightKg: 990, identCode: 'SAP-1', status: 'cancelled' },
    ],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: 'PO-1', status: 'OPEN' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', identCode: 'SAP-1', orderedQuantity: 3, unitOfMeasure: 'EA', status: 'OPEN' }],
    inventoryItems: [{ id: 'I1', projectId: 'P1', identCode: 'SAP-1', qty: 2, balanceQty: 2, weightKg: 20, status: 'available', qualityStatus: 'ACCEPTED' }],
  }));

  assert.equal(kpiValue(result.executive, 'criticalItems'), 1);
  assert.equal(result.executive.tables[1].rows[0].missingQty, 7);
  assert.equal(result.executive.tables[0].rows[0].shortageQty, 10);
  assert.equal(kpiValue(result.executive, 'missingWeightKg'), 100);
});

test('does not use unresolved all-project inventory to cover a named project demand', () => {
  const result = calculateReportsDashboard(baseData({
    scope: { projectId: '', projectName: '', isAllProjects: true },
    mtoItems: [{ id: 'M1', projectId: 'P1', qty: 5, identCode: 'SAP-1', status: 'open' }],
    inventoryItems: [{ id: 'I-UNSCOPED', identCode: 'SAP-1', qty: 5, balanceQty: 5, status: 'available', qualityStatus: 'ACCEPTED' }],
  }));

  assert.equal(kpiValue(result.executive, 'materialAvailability'), 0);
  assert.equal(result.assumptions.unresolvedInventoryItems, 1);
  assert.equal(kpiValue(result.executive, 'criticalItems'), 1);
});

test('consolidates piece aliases as EA while keeping dimensional units separate', () => {
  const result = calculateReportsDashboard(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'OPEN' }],
    poItems: [
      { id: 'EA1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 5, unitOfMeasure: 'EA', status: 'OPEN' },
      { id: 'PCS1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 3, unitOfMeasure: 'PCS', status: 'OPEN' },
      { id: 'UN1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 2, unitOfMeasure: 'UN', status: 'OPEN' },
      { id: 'M1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 100, unitOfMeasure: 'M', status: 'OPEN' },
    ],
  }));

  const purchased = result.receiving.kpis.find((item) => item.key === 'totalPurchased');
  assert.equal(purchased.value, '10 EA · 100 M');
  assert.deepEqual(purchased.breakdown, [{ unit: 'EA', value: 10 }, { unit: 'M', value: 100 }]);
  assert.match(purchased.note, /consolidados como EA/);
  assert.deepEqual(result.receiving.charts.poBalanceByUnit, [
    { unit: 'EA', purchased: 10, received: 0, pending: 10 },
    { unit: 'M', purchased: 100, received: 0, pending: 100 },
  ]);
  assert.equal(normalizeReportUnit('PCS'), 'EA');
  assert.equal(normalizeReportUnit('M'), 'M');
});

test('converts allocated PO balances back to equivalent MTO pieces for non-EA units', () => {
  const result = calculateReportsDashboard(baseData({
    mtoItems: [{ id: 'M1', projectId: 'P1', qty: 10, weightKg: 100, identCode: 'SAP-KG', status: 'open' }],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'OPEN' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', identCode: 'SAP-KG', orderedQuantity: 100, unitOfMeasure: 'KG', status: 'OPEN' }],
    receipts: [{ id: 'R1', projectId: 'P1', status: 'INSPECTED' }],
    receiptLines: [{ id: 'RL1', receiptId: 'R1', poItemId: 'PI1', receivedQuantity: 50, unitOfMeasure: 'KG' }],
    allocations: [{ id: 'A1', projectId: 'P1', mtoLineId: 'M1', poItemId: 'PI1', allocatedQuantity: 100, unitOfMeasure: 'KG', status: 'ACTIVE' }],
  }));

  assert.equal(kpiValue(result.executive, 'criticalItems'), 1);
  assert.equal(result.executive.tables[1].rows[0].inTransitQty, 5);
  assert.equal(result.executive.tables[1].rows[0].missingQty, 5);
});

test('normalizes material identity and ISO week boundaries deterministically', () => {
  assert.equal(reportMaterialKey({ identCode: ' SAP 01 ' }), 'ident:sap01');
  assert.equal(reportMaterialKey({ material: 'S355 KL', profile: 'PIPE' }), 'fallback:s355kl|pipe');
  assert.equal(reportWeekStart('2026-07-19'), '2026-07-13');
  assert.equal(reportWeekStart('2026-07-20'), '2026-07-20');
  assert.deepEqual(reportIsoWeek(46159), {
    key: '2026-W20', label: 'W20', year: 2026, weekNumber: 20, startDate: '2026-05-11',
  });
});

test('uses the legacy MTO material field as IDENT CODE for safe automatic PO coverage', () => {
  const result = calculateReportsDashboard(baseData({
    mtoItems: [{ id: 'M1', projectId: 'P1', qty: 5, material: 'IDENT-77', status: 'OPEN' }],
    purchaseOrders: [
      { id: 'PO1', projectId: 'P1', status: 'OPEN' },
      { id: 'PO-CANCELLED', projectId: 'P1', status: 'CANCELLED' },
    ],
    poItems: [
      { id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', identCode: 'IDENT-77', orderedQuantity: 5, unitOfMeasure: 'EA', status: 'OPEN' },
      { id: 'PI-CANCELLED', purchaseOrderId: 'PO-CANCELLED', projectId: 'P1', identCode: 'IDENT-77', orderedQuantity: 5, unitOfMeasure: 'EA', status: 'OPEN' },
    ],
  }));

  assert.equal(kpiValue(result.executive, 'criticalItems'), 0);
  assert.equal(result.availability.charts.byProject[0].inTransit, 5);
  assert.equal(result.assumptions.automaticIdentCodeLinks, 1);
});

test('groups legacy Inventory Excel serial dates as ISO weeks instead of calendar years', () => {
  const result = calculateReportsDashboard(baseData({
    inventoryItems: [
      { id: 'I-46159', projectId: 'P1', receivedDate: 46159, qty: 1, unit: 'PCS', weightKg: 10 },
      { id: 'I-46160', projectId: 'P1', receivedDate: '46160', qty: 2, unit: 'EA', weightKg: 20 },
      { id: 'I-46198', projectId: 'P1', receivedDate: 46198, qty: 3, unit: 'M', weightKg: 30 },
    ],
  }));

  assert.deepEqual(result.receiving.charts.weeklyReceipts.map((row) => [row.weekLabel, row.weekYear, row.receiptCount]), [
    ['W20', 2026, 1],
    ['W21', 2026, 1],
    ['W26', 2026, 1],
  ]);
  assert.equal(result.receiving.charts.weeklyReceipts[0].quantitySummary, '1 EA');
  assert.equal(result.receiving.charts.weeklyReceipts[2].quantitySummary, '3 M');
});

test('filters a shared PO by Equipment Tag and uses physical issue traceability when available', () => {
  const data = baseData({
    equipments: [
      { id: 'EQ-A', projectId: 'P1', equipmentName: 'Pump A', equipmentTags: ['TAG-A'] },
      { id: 'EQ-B', projectId: 'P1', equipmentName: 'Pump B', equipmentTags: ['TAG-B'] },
    ],
    mtoItems: [
      { id: 'M-A', projectId: 'P1', equipmentId: 'EQ-A', tag: 'TAG-A', identCode: 'ID-1', qty: 40, status: 'OPEN' },
      { id: 'M-B', projectId: 'P1', equipmentId: 'EQ-B', tag: 'TAG-B', identCode: 'ID-1', qty: 60, status: 'OPEN' },
    ],
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'OPEN' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', identCode: 'ID-1', orderedQuantity: 100, unitOfMeasure: 'EA', status: 'OPEN' }],
    receiptLines: [{ id: 'RL1', poItemId: 'PI1', receivedQuantity: 50, unitOfMeasure: 'EA' }],
    inventoryItems: [
      { id: 'INV-A', projectId: 'P1', identCode: 'ID-1', qty: 30, receivedQty: 30, weightKg: 300, status: 'issued', metadata: { poItemId: 'PI1' }, mir: 'MIR-A' },
      { id: 'INV-B', projectId: 'P1', identCode: 'ID-1', qty: 20, receivedQty: 20, weightKg: 200, status: 'issued', metadata: { poItemId: 'PI1' }, mir: 'MIR-B' },
    ],
    allocations: [
      { id: 'A-A', mtoLineId: 'M-A', poItemId: 'PI1', allocatedQuantity: 40, status: 'ACTIVE' },
      { id: 'A-B', mtoLineId: 'M-B', poItemId: 'PI1', allocatedQuantity: 60, status: 'ACTIVE' },
    ],
    materialReservations: [
      { id: 'R-A', inventoryItemId: 'INV-A', mtoItemId: 'M-A', status: 'CONSUMED' },
      { id: 'R-B', inventoryItemId: 'INV-B', mtoItemId: 'M-B', status: 'CONSUMED' },
    ],
    stockMovements: [
      { id: 'SM-A', movementType: 'ISSUE_MATERIAL', inventoryItemId: 'INV-A', metadata: { reservationIds: ['R-A'] } },
      { id: 'SM-B', movementType: 'ISSUE_MATERIAL', inventoryItemId: 'INV-B', metadata: { reservationIds: ['R-B'] } },
    ],
  });

  assert.deepEqual(reportEquipmentTagOptions(data).map((item) => item.value), ['TAG-A', 'TAG-B']);
  const result = calculateReportsDashboard(data, { equipmentTag: 'TAG-A' });
  assert.equal(result.assumptions.equipmentTag, 'TAG-A');
  assert.equal(kpiValue(result.receiving, 'totalPurchased'), '40 EA');
  assert.equal(kpiValue(result.receiving, 'totalReceived'), '20 EA');
  assert.equal(kpiValue(result.receiving, 'receivedWeightKg'), 300, 'physical issue link must override a shared PO ratio');
  assert.equal(kpiValue(result.receiving, 'mirIssued'), 1);
});

test('groups expected and received material delivery by ISO week', () => {
  const rows = buildMaterialDeliveryTimeline(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'OPEN' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 150, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-08-05', status: 'OPEN' }],
    receipts: [{ id: 'R1', projectId: 'P1', arrivalDate: '2026-08-06', status: 'RECEIVED' }],
    receiptLines: [{ id: 'RL1', receiptId: 'R1', poItemId: 'PI1', receivedQuantity: 120, unitOfMeasure: 'EA' }],
    materialUnits: [{ id: 'U1', receiptLineId: 'RL1', quantity: 120, unitOfMeasure: 'EA', weightKg: 120000, inspectionStatus: 'ACCEPTED' }],
  }), { granularity: 'week' });

  assert.deepEqual(rows, [{
    key: '2026-W32', label: 'Semana 32/2026', granularity: 'week', startDate: '2026-08-03',
    expectedQty: 30, expectedWeightKg: null, expectedQuantitiesByUnit: [{ unit: 'EA', value: 30 }],
    receivedQty: 120, receivedWeightKg: 120000, receivedQuantitiesByUnit: [{ unit: 'EA', value: 120 }],
  }]);
});

test('groups month periods containing only expected or only received quantities', () => {
  const rows = buildMaterialDeliveryTimeline(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'OPEN' }],
    poItems: [{ id: 'PI1', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 50, unitOfMeasure: 'EA', contractualDeliveryDate: '2026-08-20', status: 'OPEN' }],
    receipts: [{ id: 'R1', projectId: 'P1', arrivalDate: '2026-07-15', status: 'RECEIVED' }],
    receiptLines: [{ id: 'RL1', receiptId: 'R1', poItemId: 'LEGACY', receivedQuantity: 20, unitOfMeasure: 'EA' }],
  }), { granularity: 'month' });

  assert.deepEqual(rows.map((row) => [row.key, row.expectedQty, row.receivedQty]), [
    ['2026-07', 0, 20],
    ['2026-08', 50, 0],
  ]);
  assert.equal(rows[0].receivedWeightKg, null);
  assert.equal(rows[1].label, 'Agosto/2026');
});

test('sorts material delivery periods chronologically regardless of input order', () => {
  const rows = buildMaterialDeliveryTimeline(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'OPEN' }],
    poItems: [
      { id: 'SEP', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-09-01', status: 'OPEN' },
      { id: 'JUL', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN' },
      { id: 'AUG', purchaseOrderId: 'PO1', projectId: 'P1', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-08-01', status: 'OPEN' },
    ],
  }), { granularity: 'month' });

  assert.deepEqual(rows.map((row) => row.key), ['2026-07', '2026-08', '2026-09']);
});

test('groups active PO Items by nominal status with overdue as a separate dimension', () => {
  const result = buildPoItemStatusBreakdown(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', status: 'ISSUED' }],
    poItems: [
      { id: 'OPEN', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '10', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-07-01', status: 'OPEN' },
      { id: 'PRODUCTION', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '20', orderedQuantity: 1, unitOfMeasure: 'EA', expectedDeliveryDate: '2026-09-01', status: 'IN_PRODUCTION' },
      { id: 'SHIPPED', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '30', orderedQuantity: 1, unitOfMeasure: 'EA', status: 'SHIPPED' },
      { id: 'PARTIAL', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '40', orderedQuantity: 2, unitOfMeasure: 'EA', status: 'PARTIALLY_RECEIVED' },
      { id: 'RECEIVED', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '50', orderedQuantity: 1, unitOfMeasure: 'EA', status: 'RECEIVED' },
      { id: 'CLOSED', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '60', orderedQuantity: 1, unitOfMeasure: 'EA', status: 'CLOSED' },
      { id: 'CANCELLED', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '70', orderedQuantity: 1, unitOfMeasure: 'EA', status: 'CANCELLED' },
    ],
  }), { today: '2026-08-04' });

  assert.deepEqual(result, {
    totalItems: 6,
    buckets: [
      { key: 'RECEIVED_BUCKET', count: 2, percentage: 2 / 6, overdueCount: 0 },
      { key: 'IN_TRANSIT_BUCKET', count: 2, percentage: 2 / 6, overdueCount: 0 },
      { key: 'IN_PRODUCTION_BUCKET', count: 2, percentage: 2 / 6, overdueCount: 1 },
    ],
    inconsistencies: [],
  });
});

test('never reports a nominally received PO Item as overdue despite a past raw date', () => {
  const result = buildPoItemStatusBreakdown(baseData({
    purchaseOrders: [{ id: 'PO1', projectId: 'P1', poNumber: '450001', status: 'ISSUED' }],
    poItems: [{
      id: 'RECEIVED', purchaseOrderId: 'PO1', projectId: 'P1', itemNumber: '10', orderedQuantity: 10,
      unitOfMeasure: 'EA', expectedDeliveryDate: '2020-01-01', status: 'RECEIVED',
    }],
  }), { today: '2026-08-04' });

  assert.equal(result.buckets[0].count, 1);
  assert.equal(result.buckets[0].overdueCount, 0);
  assert.deepEqual(result.inconsistencies, []);
});
