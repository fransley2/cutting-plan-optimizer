import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaterialFlowGraph, exploreMaterialGenealogy } from '../src/core/genealogyExplorer.js';

function dataset() {
  return {
    equipments: [{ id: 'EQ-1', equipmentTags: ['31-WJ-10-1010'], equipmentName: 'Jumper' }],
    mtoItems: [{ id: 'MTO-1', equipmentId: 'EQ-1', itemNo: '10', identCode: 'PP-SD-168-19' }],
    purchaseOrders: [{ id: 'PO-1', poNumber: '1520813' }],
    poItems: [{ id: 'POI-1', purchaseOrderId: 'PO-1', itemNumber: '18', identCode: 'PP-SD-168-19' }],
    allocations: [],
    inventoryItems: [{
      id: 'INV-1',
      traceability: 'AS02JU10',
      identCode: 'PP-SD-168-19',
      heatNo: 'H123456',
      metadata: { poItemId: 'POI-1' },
    }, {
      id: 'INV-2',
      traceability: 'AS02JU10-OC',
      parentStockId: 'INV-1',
    }],
    workpacks: [{ id: 'WP-1', equipmentId: 'EQ-1', wpNo: 'WP-001' }],
    workpackLinks: [
      { workpackId: 'WP-1', targetType: 'INVENTORY_ITEM', targetId: 'INV-1', status: 'ACTIVE' },
      { workpackId: 'WP-1', targetType: 'CUTTING_SHEET', targetId: 'CS-1', status: 'ACTIVE' },
    ],
    materialCoupons: [{
      id: 'MC-1',
      workpackId: 'WP-1',
      metadata: { coupon: { header: { mcCode: 'MC-001' }, lines: [{ traceability: 'AS02JU10' }] } },
    }],
    cuttingSheets: [{ id: 'CS-1', workpackId: 'WP-1', materialCouponId: 'MC-1', number: 'CS-001' }],
    materialTransformations: [{
      id: 'TRANS-1',
      workpackId: 'WP-1',
      cuttingSheetId: 'CS-1',
      materialCouponId: 'MC-1',
      parentInventoryItemId: 'INV-1',
      outputType: 'CUT_PART',
      outputId: 'PART-1',
      mtoItemId: 'MTO-1',
      mark: 'M01',
      position: 'P01',
    }],
    offcuts: [{
      id: 'OFF-1',
      parentInventoryItemId: 'INV-1',
      cuttingSheetId: 'CS-1',
      returnMaterialVoucherId: 'RMV-1',
      newInventoryItemId: 'INV-2',
      traceability: 'AS02JU10-OC',
    }],
    returnMaterialVouchers: [{
      id: 'RMV-1',
      workpackId: 'WP-1',
      cuttingSheetId: 'CS-1',
      number: 'RMV-001',
      returnedItems: [{ parentInventoryItemId: 'INV-1', inventoryItemId: 'INV-2' }],
    }],
    stockMovements: [{
      id: 'SM-1',
      inventoryItemId: 'INV-1',
      movementType: 'CONSUME_STOCK',
      timestamp: '2026-07-20T10:00:00.000Z',
      sourceDocumentId: 'CS-1',
    }],
    auditEvents: [],
  };
}

test('builds the persisted material flow and identifies automatic IDENT CODE links', () => {
  const graph = buildMaterialFlowGraph(dataset());
  assert.equal(graph.edges.some((edge) => edge.relation === 'IDENT CODE match' && edge.inferred), true);
  assert.equal(graph.edges.some((edge) => edge.relation === 'received as' && edge.method === 'poItemId'), true);
  assert.equal(graph.edges.some((edge) => edge.relation === 'consumed by' && edge.method === 'materialTransformation'), true);
  assert.equal(graph.edges.some((edge) => edge.relation === 'returned to stock'), true);
});

test('explores upstream and Where Used from physical Inventory traceability', () => {
  const result = exploreMaterialGenealogy(dataset(), { type: 'Inventory', entityId: 'INV-1' });
  assert.equal(result.anchor.label, 'AS02JU10');
  assert.equal(result.upstream.some((node) => node.type === 'PO_ITEM'), true);
  assert.equal(result.whereUsed.some((node) => node.type === 'MATERIAL_COUPON'), true);
  assert.equal(result.whereUsed.some((node) => node.type === 'CUTTING_SHEET'), true);
  assert.equal(result.nodes.some((node) => node.type === 'CUT_PART'), true);
  assert.equal(result.nodes.some((node) => node.type === 'RMV'), true);
  assert.equal(result.history[0].type, 'CONSUME_STOCK');
});

test('does not create an IDENT CODE relationship when either side has no IDENT CODE', () => {
  const data = dataset();
  data.mtoItems.push({ id: 'MTO-NO-IDENT', equipmentId: 'EQ-1' });
  data.poItems.push({ id: 'POI-NO-IDENT', purchaseOrderId: 'PO-1', itemNumber: '20' });
  const graph = buildMaterialFlowGraph(data);
  const invalid = graph.edges.find((edge) => edge.from === 'MTO:MTO-NO-IDENT' && edge.to === 'PO_ITEM:POI-NO-IDENT');
  assert.equal(invalid, undefined);
});
