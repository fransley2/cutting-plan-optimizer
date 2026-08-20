import assert from 'node:assert/strict';
import {
  buildMtoProcurementCoverage,
  mtoDemandQuantity,
  suggestMtoPoItemAllocationsByIdentCode,
  validateMtoPoItemAllocation,
  validateMtoPoItemAllocationBatch,
} from '../src/core/mtoPoItemAllocation.js';

assert.equal(mtoDemandQuantity({ qty: 10 }, 'EA'), 10);
assert.equal(mtoDemandQuantity({ qty: 10, cutLength: 6000, requiredLength: 60000 }, 'M'), 60);
assert.equal(mtoDemandQuantity({ weightKg: 1250 }, 'KG'), 1250);
[
  'M²',
  'M2',
  'm2',
  'm²',
  'SQM',
  'M² ',
  'MÂ²',
  'square   meters',
].forEach((unitOfMeasure) => {
  assert.equal(
    mtoDemandQuantity({ qty: 7, externalSurfaceM2: 12 }, unitOfMeasure),
    12,
    `${unitOfMeasure} must use the MTO external surface demand`,
  );
});

const mtoItem = { id: 'MTO-1', projectId: 'P-1', qty: 10, cutLength: 6000, requiredLength: 60000 };
const poItem = { id: 'POI-1', projectId: 'P-1', orderedQuantity: 100, unitOfMeasure: 'M' };
const valid = validateMtoPoItemAllocation({
  allocation: { id: 'A-1', mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: 40 },
  mtoItem,
  poItem,
});
assert.equal(valid.valid, true);
assert.equal(valid.demandQuantity, 60);
assert.equal(valid.unitOfMeasure, 'M');

const exceededDemand = validateMtoPoItemAllocation({
  allocation: { id: 'A-2', mtoLineId: mtoItem.id, poItemId: 'POI-2', allocatedQuantity: 25 },
  mtoItem,
  poItem: { ...poItem, id: 'POI-2' },
  existingAllocations: [{ id: 'A-1', mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: 40, unitOfMeasure: 'M', status: 'ACTIVE' }],
});
assert.equal(exceededDemand.valid, false);
assert.equal(exceededDemand.errors.some((error) => error.code === 'MTO_DEMAND_EXCEEDED'), true);

const exceededPo = validateMtoPoItemAllocation({
  allocation: { id: 'A-3', mtoLineId: 'MTO-2', poItemId: poItem.id, allocatedQuantity: 11 },
  mtoItem: { ...mtoItem, id: 'MTO-2', requiredLength: 20000 },
  poItem,
  existingAllocations: [{ id: 'A-1', mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: 90, unitOfMeasure: 'M', status: 'ACTIVE' }],
});
assert.equal(exceededPo.errors.some((error) => error.code === 'PO_ITEM_QUANTITY_EXCEEDED'), true);

const duplicate = validateMtoPoItemAllocation({
  allocation: { id: 'A-NEW', mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: 10 },
  mtoItem,
  poItem,
  existingAllocations: [{ id: 'A-OLD', mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: 10, unitOfMeasure: 'M', status: 'ACTIVE' }],
});
assert.equal(duplicate.errors.some((error) => error.code === 'ALLOCATION_DUPLICATE'), true);

const projectMismatch = validateMtoPoItemAllocation({
  allocation: { mtoLineId: mtoItem.id, poItemId: poItem.id, allocatedQuantity: 1 },
  mtoItem,
  poItem: { ...poItem, projectId: 'P-2' },
});
assert.equal(projectMismatch.errors.some((error) => error.code === 'PROJECT_MISMATCH'), true);

const projectValidationCases = [
  { mtoProjectId: '', poItemProjectId: 'P-1', expectedCodes: ['MTO_PROJECT_REQUIRED'] },
  { mtoProjectId: 'P-1', poItemProjectId: '', expectedCodes: ['PO_ITEM_PROJECT_REQUIRED'] },
  { mtoProjectId: '', poItemProjectId: '', expectedCodes: ['MTO_PROJECT_REQUIRED', 'PO_ITEM_PROJECT_REQUIRED'] },
  { mtoProjectId: 'P-1', poItemProjectId: 'P-1', expectedCodes: [] },
  { mtoProjectId: 'P-1', poItemProjectId: 'P-2', expectedCodes: ['PROJECT_MISMATCH'] },
];
projectValidationCases.forEach(({ mtoProjectId, poItemProjectId, expectedCodes }) => {
  const validation = validateMtoPoItemAllocation({
    allocation: { mtoLineId: 'MTO-PROJECT-CHECK', poItemId: 'POI-PROJECT-CHECK', allocatedQuantity: 1 },
    mtoItem: { id: 'MTO-PROJECT-CHECK', projectId: mtoProjectId, qty: 1 },
    poItem: { id: 'POI-PROJECT-CHECK', projectId: poItemProjectId, orderedQuantity: 1, unitOfMeasure: 'EA' },
  });
  assert.deepEqual(
    validation.errors
      .map((error) => error.code)
      .filter((code) => code === 'MTO_PROJECT_REQUIRED' || code === 'PO_ITEM_PROJECT_REQUIRED' || code === 'PROJECT_MISMATCH'),
    expectedCodes,
  );
  assert.equal(validation.valid, expectedCodes.length === 0);
});

const manyToMany = validateMtoPoItemAllocationBatch({
  mtoItems: [
    { id: 'MTO-A', projectId: 'P-1', qty: 60 },
    { id: 'MTO-B', projectId: 'P-1', qty: 40 },
  ],
  poItems: [
    { id: 'POI-A', projectId: 'P-1', orderedQuantity: 50, unitOfMeasure: 'EA' },
    { id: 'POI-B', projectId: 'P-1', orderedQuantity: 50, unitOfMeasure: 'EA' },
  ],
  allocations: [
    { id: 'A-A1', mtoLineId: 'MTO-A', poItemId: 'POI-A', allocatedQuantity: 30 },
    { id: 'A-A2', mtoLineId: 'MTO-A', poItemId: 'POI-B', allocatedQuantity: 30 },
    { id: 'A-B1', mtoLineId: 'MTO-B', poItemId: 'POI-A', allocatedQuantity: 20 },
    { id: 'A-B2', mtoLineId: 'MTO-B', poItemId: 'POI-B', allocatedQuantity: 20 },
  ],
});
assert.equal(manyToMany.valid, true, 'the batch must support many MTO marks across many PO items');

const batchOverAllocation = validateMtoPoItemAllocationBatch({
  mtoItems: [{ id: 'MTO-C', projectId: 'P-1', qty: 20 }],
  poItems: [{ id: 'POI-C', projectId: 'P-1', orderedQuantity: 10, unitOfMeasure: 'EA' }],
  allocations: [
    { id: 'A-C1', mtoLineId: 'MTO-C', poItemId: 'POI-C', allocatedQuantity: 6 },
    { id: 'A-C2', mtoLineId: 'MTO-C', poItemId: 'POI-C', allocatedQuantity: 6 },
  ],
});
assert.equal(batchOverAllocation.valid, false);
assert.equal(batchOverAllocation.errors.some((error) => error.code === 'ALLOCATION_DUPLICATE' || error.code === 'PO_ITEM_QUANTITY_EXCEEDED'), true);

const coverage = buildMtoProcurementCoverage({
  mtoItems: [
    { id: 'MTO-PIPE-1', projectId: 'P-1', qty: 10, cutLength: 6000, requiredLength: 60000 },
    { id: 'MTO-PIPE-2', projectId: 'P-1', qty: 10, cutLength: 4000, requiredLength: 40000 },
    { id: 'MTO-UNALLOCATED', projectId: 'P-1', qty: 2 },
  ],
  purchaseOrders: [{ id: 'PO-1', projectId: 'P-1', poNumber: '1520813' }],
  poItems: [{ id: 'POI-PIPE', purchaseOrderId: 'PO-1', projectId: 'P-1', orderedQuantity: 100, unitOfMeasure: 'M' }],
  allocations: [
    { id: 'ALLOC-1', mtoLineId: 'MTO-PIPE-1', poItemId: 'POI-PIPE', allocatedQuantity: 60, unitOfMeasure: 'M', status: 'ACTIVE' },
    { id: 'ALLOC-2', mtoLineId: 'MTO-PIPE-2', poItemId: 'POI-PIPE', allocatedQuantity: 40, unitOfMeasure: 'M', status: 'ACTIVE' },
    { id: 'ALLOC-CANCELLED', mtoLineId: 'MTO-UNALLOCATED', poItemId: 'POI-PIPE', allocatedQuantity: 2, unitOfMeasure: 'M', status: 'CANCELLED' },
  ],
  receipts: [{ id: 'R-1', status: 'RECEIVED' }],
  receiptLines: [{ id: 'RL-1', receiptId: 'R-1', poItemId: 'POI-PIPE', receivedQuantity: 50, unitOfMeasure: 'M' }],
  materialUnits: Array.from({ length: 5 }, (_, index) => ({
    id: `UNIT-${index + 1}`,
    receiptLineId: 'RL-1',
    poItemId: 'POI-PIPE',
    quantity: 1,
    originalLengthMm: 10000,
    inspectionStatus: index < 4 ? 'ACCEPTED' : 'HOLD',
  })),
});

assert.equal(coverage.length, 3);
assert.deepEqual(
  coverage.slice(0, 2).map((item) => ({ allocated: item.allocatedQuantity, received: item.receivedQuantity, accepted: item.acceptedQuantity })),
  [
    { allocated: 60, received: 30, accepted: 24 },
    { allocated: 40, received: 20, accepted: 16 },
  ],
  'partial receipts must be distributed proportionally without double counting the PO receipt',
);
assert.equal(coverage[0].status, 'PARTIALLY_RECEIVED');
assert.equal(coverage[2].status, 'UNALLOCATED');
assert.equal(coverage[2].pendingPurchaseQuantity, 2);

const legacyLineCoverage = buildMtoProcurementCoverage({
  mtoItems: [{ id: 'MTO-EA', qty: 5 }],
  poItems: [{ id: 'POI-EA', unitOfMeasure: 'EA', orderedQuantity: 5 }],
  allocations: [{ id: 'ALLOC-EA', mtoLineId: 'MTO-EA', poItemId: 'POI-EA', allocatedQuantity: 5, status: 'ACTIVE' }],
  receipts: [{ id: 'R-EA', status: 'RECEIVED' }],
  receiptLines: [{ id: 'RL-EA', receiptId: 'R-EA', poItemId: 'POI-EA', receivedQuantity: 5, inspectionStatus: 'ACCEPTED' }],
});
assert.equal(legacyLineCoverage[0].acceptedQuantity, 5, 'accepted legacy receipt lines without Material Units must remain visible');

const autoSuggestions = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [
    { id: 'MTO-AUTO-1', projectId: 'P-1', identCode: ' pp-sd-168-19 ', qty: 2, status: 'OPEN' },
    { id: 'MTO-AUTO-2', projectId: 'P-1', identCode: 'PP-SD-168-19', qty: 3, status: 'OPEN' },
    { id: 'MTO-CANCELLED', projectId: 'P-1', identCode: 'PP-SD-168-19', qty: 99, status: 'CANCELLED' },
  ],
  poItems: [{ id: 'POI-AUTO', projectId: 'P-1', identCode: 'PP-SD-168-19', orderedQuantity: 5, unitOfMeasure: 'EA', status: 'OPEN' }],
});
assert.deepEqual(autoSuggestions, {
  suggestions: [
    { projectId: 'P-1', mtoLineId: 'MTO-AUTO-1', poItemId: 'POI-AUTO', allocatedQuantity: 2, unitOfMeasure: 'EA', matchMethod: 'AUTO_IDENT_CODE', matchedIdentCode: 'PP-SD-168-19', matchSource: 'IDENT_CODE', matchConfidence: 'HIGH' },
    { projectId: 'P-1', mtoLineId: 'MTO-AUTO-2', poItemId: 'POI-AUTO', allocatedQuantity: 3, unitOfMeasure: 'EA', matchMethod: 'AUTO_IDENT_CODE', matchedIdentCode: 'PP-SD-168-19', matchSource: 'IDENT_CODE', matchConfidence: 'HIGH' },
  ],
  issues: [],
});

const legacyMaterialSuggestion = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-LEGACY-IDENT', projectId: 'P-1', identCode: '   ', material: 'BD-SD-168-19-90', qty: 1 }],
  poItems: [{ id: 'POI-LEGACY-IDENT', projectId: 'P-1', identCode: 'BD-SD-168-19-90', orderedQuantity: 1, unitOfMeasure: 'EA' }],
});
assert.equal(legacyMaterialSuggestion.suggestions[0].mtoLineId, 'MTO-LEGACY-IDENT');
assert.equal(legacyMaterialSuggestion.suggestions[0].matchedIdentCode, 'BD-SD-168-19-90');
assert.equal(legacyMaterialSuggestion.suggestions[0].matchSource, 'MATERIAL_FALLBACK');
assert.equal(legacyMaterialSuggestion.suggestions[0].matchConfidence, 'LOW');

const generatedIdentSuggestion = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{
    id: 'MTO-GENERATED-IDENT', projectId: 'P-1', status: 'OPEN', type: 'Pipe', material: 'DNV25Cr',
    description: 'TUBO D168,3 x 19,1', requiredLength: 1742.69,
  }],
  poItems: [{
    id: 'POI-GENERATED-IDENT', projectId: 'P-1', status: 'OPEN', unitOfMeasure: 'M', orderedQuantity: 7.2,
    itemType: 'PROCESS PIPE', description: 'MOTHER PIPE\nDNV 25CR\nOD: 168,3MM, WT: 19,10MM',
  }],
});
assert.equal(generatedIdentSuggestion.issues.length, 0);
assert.equal(generatedIdentSuggestion.suggestions[0].matchedIdentCode, 'PP-SD-168-19');
assert.equal(generatedIdentSuggestion.suggestions[0].matchSource, 'GENERATED_IDENT_CODE');
assert.equal(generatedIdentSuggestion.suggestions[0].matchConfidence, 'HIGH');
assert.equal(generatedIdentSuggestion.suggestions[0].allocatedQuantity, 1.74269);

const punctuationIsIdentity = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-PUNCTUATION', projectId: 'P-1', identCode: 'AB-12', qty: 1 }],
  poItems: [{ id: 'POI-PUNCTUATION', projectId: 'P-1', identCode: 'AB12', orderedQuantity: 1, unitOfMeasure: 'EA' }],
});
assert.equal(punctuationIsIdentity.suggestions.length, 0);
assert.equal(punctuationIsIdentity.issues[0].code, 'NO_PO_ITEM_MATCH');

const ambiguousIdent = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-AMBIGUOUS', projectId: 'P-1', identCode: 'SAME-CODE', qty: 1 }],
  poItems: [
    { id: 'POI-AMBIGUOUS-A', projectId: 'P-1', identCode: 'SAME-CODE', orderedQuantity: 1, unitOfMeasure: 'EA' },
    { id: 'POI-AMBIGUOUS-B', projectId: 'P-1', identCode: 'SAME-CODE', orderedQuantity: 1, unitOfMeasure: 'EA' },
  ],
});
assert.equal(ambiguousIdent.suggestions.length, 0);
assert.equal(ambiguousIdent.issues[0].code, 'AMBIGUOUS_PO_ITEM_MATCH');
assert.equal(ambiguousIdent.issues[0].severity, 'REVIEW');

const insufficientBalance = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-SHORT', projectId: 'P-1', identCode: 'SHORT-CODE', qty: 3 }],
  poItems: [{ id: 'POI-SHORT', projectId: 'P-1', identCode: 'SHORT-CODE', orderedQuantity: 3, unitOfMeasure: 'EA' }],
  existingAllocations: [{ id: 'ALLOC-OTHER-MTO', mtoLineId: 'OTHER-MTO', poItemId: 'POI-SHORT', allocatedQuantity: 1, unitOfMeasure: 'EA', status: 'ACTIVE' }],
});
assert.equal(insufficientBalance.suggestions.length, 0);
assert.equal(insufficientBalance.issues[0].code, 'INSUFFICIENT_PO_BALANCE');

const remainingDemandSuggestion = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-REMAINING', projectId: 'P-1', identCode: 'REMAINING-CODE', qty: 5 }],
  poItems: [
    { id: 'POI-OTHER', projectId: 'P-1', identCode: 'OTHER-CODE', orderedQuantity: 2, unitOfMeasure: 'EA' },
    { id: 'POI-REMAINING', projectId: 'P-1', identCode: 'REMAINING-CODE', orderedQuantity: 3, unitOfMeasure: 'EA' },
  ],
  drafts: [{ mtoLineId: 'MTO-REMAINING', poItemId: 'POI-OTHER', allocatedQuantity: 2, unitOfMeasure: 'EA' }],
});
assert.equal(remainingDemandSuggestion.suggestions[0].allocatedQuantity, 3);

const unitConflict = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-UNIT-CONFLICT', projectId: 'P-1', identCode: 'UNIT-CODE', qty: 5, requiredLength: 5000 }],
  poItems: [
    { id: 'POI-KG-LINK', projectId: 'P-1', identCode: 'OTHER-KG', orderedQuantity: 1, unitOfMeasure: 'KG' },
    { id: 'POI-M-MATCH', projectId: 'P-1', identCode: 'UNIT-CODE', orderedQuantity: 5, unitOfMeasure: 'M' },
  ],
  existingAllocations: [{ mtoLineId: 'MTO-UNIT-CONFLICT', poItemId: 'POI-KG-LINK', allocatedQuantity: 1, unitOfMeasure: 'KG', status: 'ACTIVE' }],
});
assert.equal(unitConflict.suggestions.length, 0);
assert.equal(unitConflict.issues[0].code, 'ALLOCATION_UNIT_CONFLICT');
assert.equal(unitConflict.issues[0].severity, 'BLOCKING');

const alreadyLinked = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-ALREADY-LINKED', projectId: 'P-1', identCode: 'LINKED-CODE', qty: 2 }],
  poItems: [{ id: 'POI-ALREADY-LINKED', projectId: 'P-1', identCode: 'LINKED-CODE', orderedQuantity: 2, unitOfMeasure: 'EA' }],
  existingAllocations: [{
    id: 'ALLOC-ALREADY-LINKED', mtoLineId: 'MTO-ALREADY-LINKED', poItemId: 'POI-ALREADY-LINKED',
    allocatedQuantity: 1, unitOfMeasure: 'EA', status: 'ACTIVE',
  }],
});
assert.equal(alreadyLinked.suggestions.length, 0);
assert.equal(alreadyLinked.issues[0].code, 'MTO_PO_ITEM_ALREADY_LINKED');
assert.equal(alreadyLinked.issues[0].severity, 'INFO');

const sameIdentOtherProject = suggestMtoPoItemAllocationsByIdentCode({
  mtoItems: [{ id: 'MTO-PROJECT', projectId: 'P-1', identCode: 'PROJECT-CODE', qty: 1 }],
  poItems: [{ id: 'POI-PROJECT', projectId: 'P-2', identCode: 'PROJECT-CODE', orderedQuantity: 1, unitOfMeasure: 'EA' }],
});
assert.equal(sameIdentOtherProject.suggestions.length, 0);
assert.equal(sameIdentOtherProject.issues[0].code, 'PROJECT_MISMATCH');
assert.equal(sameIdentOtherProject.issues[0].severity, 'BLOCKING');

console.log('MTO to PO item allocation tests passed');
