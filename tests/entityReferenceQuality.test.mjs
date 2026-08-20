import assert from 'node:assert/strict';
import {
  buildEntityReferenceIssues,
  ENTITY_REFERENCE_CONTRACTS,
} from '../src/core/entityReferenceQuality.js';

assert.deepEqual(ENTITY_REFERENCE_CONTRACTS.MTO_ITEM.idFields, [
  'id', 'batchId', 'projectId', 'equipmentId', 'drawingRevisionId',
]);
assert.ok(ENTITY_REFERENCE_CONTRACTS.MTO_ITEM.snapshotFields.includes('equipmentName'));
assert.ok(ENTITY_REFERENCE_CONTRACTS.WORKPACK.compatibilityFields.includes('drawingId'));
assert.ok(ENTITY_REFERENCE_CONTRACTS.EQUIPMENT.idFields.includes('equipmentTypeId'));
assert.ok(ENTITY_REFERENCE_CONTRACTS.EQUIPMENT.snapshotFields.includes('equipmentType'));
assert.deepEqual(ENTITY_REFERENCE_CONTRACTS.MTO_PO_ITEM_ALLOCATION.idFields, ['id', 'projectId', 'mtoLineId', 'poItemId']);
assert.deepEqual(ENTITY_REFERENCE_CONTRACTS.PO_DELIVERY_FORECAST.idFields, ['id', 'projectId', 'purchaseOrderId', 'poItemId']);

const typeIssues = buildEntityReferenceIssues({
  equipmentTypes: [{ id: 'TYPE-1', name: 'PRODUCTION JUMPER', projectId: '' }],
  equipments: [{ id: 'EQ-TYPE-1', projectId: 'P-1', equipmentType: 'PRODUCTION JUMPER' }],
});
assert.equal(typeIssues.length, 1);
assert.equal(typeIssues[0].referenceField, 'equipmentTypeId');
assert.equal(typeIssues[0].suggestedReferenceId, 'TYPE-1');

const sources = {
  equipments: [{ id: 'EQ-1', projectId: 'P-1', equipmentName: 'KBD DW · PRODUCTION JUMPER · TYPE 1', equipmentTags: ['32-WJ-10-1020'] }],
  drawings: [{ id: 'DWG-REV-1', documentId: 'DWG-1', projectId: 'P-1', equipmentId: 'EQ-1', drawingNo: 'DA-011', revision: '00', isCurrentRevision: true }],
  mtoItems: [{ id: 'MTO-1', projectId: 'P-1', equipmentName: 'KBD DW · PRODUCTION JUMPER · TYPE 1', drawing: 'DA-011', revision: '00' }],
  workpacks: [{ id: 'WP-1', projectId: 'P-1', equipmentId: 'EQ-1', drawingId: 'DWG-REV-1', wpNo: 'WP-001' }],
  workpackLinks: [],
  purchaseOrderItems: [{ id: 'POI-1' }],
  mtoPoItemAllocations: [{ id: 'ALLOC-1', mtoLineId: 'MTO-1', poItemId: 'POI-1', status: 'ACTIVE' }],
  materialReceiptLines: [{ id: 'RL-1' }],
  materialUnits: [{ id: 'UNIT-1', poItemId: 'POI-1', receiptLineId: 'RL-1', inventoryItemId: 'INV-MISSING', traceability: 'GBD-001' }],
  inventory: [],
};

const issues = buildEntityReferenceIssues(sources);
const equipmentSuggestion = issues.find((item) => item.recordId === 'MTO-1' && item.referenceField === 'equipmentId');
assert.equal(equipmentSuggestion.issueType, 'MISSING_CANONICAL_ID');
assert.equal(equipmentSuggestion.suggestedReferenceId, 'EQ-1');

const drawingSuggestion = issues.find((item) => item.recordId === 'MTO-1' && item.referenceField === 'drawingRevisionId');
assert.equal(drawingSuggestion.issueType, 'MISSING_CANONICAL_ID');
assert.equal(drawingSuggestion.suggestedReferenceId, 'DWG-REV-1');

const legacyWorkpackDrawing = issues.find((item) => item.recordId === 'WP-1' && item.issueType === 'LEGACY_RELATION');
assert.equal(legacyWorkpackDrawing.suggestedReferenceId, 'DWG-REV-1');

const brokenInventoryLink = issues.find((item) => item.recordId === 'UNIT-1' && item.referenceField === 'inventoryItemId');
assert.equal(brokenInventoryLink.issueType, 'BROKEN_REFERENCE');

const brokenAllocationIssues = buildEntityReferenceIssues({
  mtoItems: [{ id: 'MTO-1' }],
  purchaseOrderItems: [{ id: 'POI-1' }],
  mtoPoItemAllocations: [{ id: 'ALLOC-BROKEN', mtoLineId: 'MTO-MISSING', poItemId: 'POI-1', status: 'ACTIVE' }],
});
assert.equal(brokenAllocationIssues[0].storeName, 'mtoPoItemAllocations');
assert.equal(brokenAllocationIssues[0].referenceField, 'mtoLineId');

const brokenForecastIssues = buildEntityReferenceIssues({
  purchaseOrderItems: [{ id: 'POI-1' }],
  poDeliveryForecasts: [{ id: 'ETA-BROKEN', poItemId: 'POI-MISSING', status: 'ACTIVE' }],
});
assert.equal(brokenForecastIssues[0].storeName, 'poDeliveryForecasts');
assert.equal(brokenForecastIssues[0].referenceField, 'poItemId');

const linkedSources = {
  ...sources,
  mtoItems: [{ ...sources.mtoItems[0], equipmentId: 'EQ-1', drawingRevisionId: 'DWG-REV-1' }],
  workpackLinks: [{ id: 'LINK-1', workpackId: 'WP-1', targetType: 'DRAWING_REVISION', targetId: 'DWG-REV-1', status: 'ACTIVE' }],
  inventory: [{ id: 'INV-1', trace: 'INV-MISSING', traceability: 'INV-MISSING' }],
};
assert.deepEqual(buildEntityReferenceIssues(linkedSources), []);

console.log('entity reference quality tests passed');
