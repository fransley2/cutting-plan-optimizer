import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMtoPoAutoAllocations,
  buildMtoPoAutoAllocationReview,
  eligibleMtoItemsForAutoAllocation,
} from '../src/core/mtoPoAutoAllocation.js';

test('automatic Ident Code review separates safe, attention, ambiguous and unmatched lines', () => {
  const mtoItems = [
    { id: 'SAFE', projectId: 'P1', status: 'open', identCode: 'SAFE-CODE', qty: 2 },
    { id: 'LOW', projectId: 'P1', status: 'open', material: 'LOW-CODE', qty: 1 },
    { id: 'SHORT', projectId: 'P1', status: 'open', identCode: 'SHORT-CODE', qty: 5 },
    { id: 'AMB', projectId: 'P1', status: 'open', identCode: 'AMB-CODE', qty: 1 },
    { id: 'NONE', projectId: 'P1', status: 'open', identCode: 'NONE-CODE', qty: 1 },
  ];
  const poItems = [
    { id: 'PO-SAFE', projectId: 'P1', identCode: 'SAFE-CODE', orderedQuantity: 2, unitOfMeasure: 'EA' },
    { id: 'PO-LOW', projectId: 'P1', identCode: 'LOW-CODE', orderedQuantity: 1, unitOfMeasure: 'EA' },
    { id: 'PO-SHORT', projectId: 'P1', identCode: 'SHORT-CODE', orderedQuantity: 3, unitOfMeasure: 'EA' },
    { id: 'PO-AMB-1', projectId: 'P1', identCode: 'AMB-CODE', orderedQuantity: 1, unitOfMeasure: 'EA' },
    { id: 'PO-AMB-2', projectId: 'P1', identCode: 'AMB-CODE', orderedQuantity: 1, unitOfMeasure: 'EA' },
  ];
  const review = buildMtoPoAutoAllocationReview({ mtoItems, poItems });
  assert.equal(review.analyzed, 5);
  assert.deepEqual(review.safe.map((item) => item.mtoLineId), ['SAFE']);
  assert.deepEqual(review.attention.map((item) => item.mtoLineId).sort(), ['LOW', 'SHORT']);
  assert.equal(review.attention.find((item) => item.mtoLineId === 'SHORT').allocatedQuantity, 3);
  assert.deepEqual(review.ambiguous.map((item) => item.code).sort(), ['AMBIGUOUS_PO_ITEM_MATCH', 'INSUFFICIENT_PO_BALANCE']);
  assert.deepEqual(review.noMatch.map((item) => item.code), ['NO_PO_ITEM_MATCH']);
});

test('automatic allocation eligibility excludes invalid, non-open and already linked MTO lines', () => {
  const items = [
    { id: 'READY', projectId: 'P1', status: 'open', validationErrors: [] },
    { id: 'INVALID', projectId: 'P1', status: 'open', validationErrors: ['Drawing required'] },
    { id: 'MATCHED', projectId: 'P1', status: 'matched', validationErrors: [] },
    { id: 'LINKED', projectId: 'P1', status: 'open', validationErrors: [] },
  ];
  const allocations = [{ mtoLineId: 'LINKED', status: 'ACTIVE' }];
  assert.deepEqual(eligibleMtoItemsForAutoAllocation(items, allocations).map((item) => item.id), ['READY']);
});

test('automatic review reports an Ident Code found only in another project', () => {
  const review = buildMtoPoAutoAllocationReview({
    mtoItems: [{ id: 'MTO-P1', projectId: 'P1', status: 'open', identCode: 'CROSS-PROJECT', qty: 1 }],
    poItems: [{ id: 'PO-P2', projectId: 'P2', identCode: 'CROSS-PROJECT', orderedQuantity: 1, unitOfMeasure: 'EA' }],
  });
  assert.equal(review.safe.length, 0);
  assert.equal(review.noMatch[0].code, 'PROJECT_MISMATCH');
});

test('automatic allocation application reports per-line failures and keeps successful links', async () => {
  const allocations = [{ mtoLineId: 'OK' }, { mtoLineId: 'FAIL' }, { mtoLineId: 'OK-2' }];
  const saved = [];
  const result = await applyMtoPoAutoAllocations(allocations, async (allocation) => {
    if (allocation.mtoLineId === 'FAIL') throw new Error('PO balance changed');
    saved.push(allocation.mtoLineId);
    return { ...allocation, id: `A-${allocation.mtoLineId}` };
  });
  assert.deepEqual(saved, ['OK', 'OK-2']);
  assert.equal(result.created.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].message, 'PO balance changed');
});

test('automatic review exposes a safe match when both IDENT CODEs are derived from real descriptions', () => {
  const review = buildMtoPoAutoAllocationReview({
    mtoItems: [{
      id: 'MTO-REAL', projectId: 'P1', status: 'open', type: 'Pipe', material: 'DNV25Cr',
      description: 'TUBO D168,3 x 19,1', requiredLength: 1742.69,
    }],
    poItems: [{
      id: 'PO-REAL', projectId: 'P1', status: 'OPEN', unitOfMeasure: 'M', orderedQuantity: 7.2,
      itemType: 'PROCESS PIPE', description: 'MOTHER PIPE\nDNV 25CR\nOD: 168,3MM, WT: 19,10MM',
    }],
  });
  assert.equal(review.analyzed, 1);
  assert.equal(review.safe.length, 1);
  assert.equal(review.safe[0].matchedIdentCode, 'PP-SD-168-19');
  assert.equal(review.safe[0].matchSource, 'GENERATED_IDENT_CODE');
});
