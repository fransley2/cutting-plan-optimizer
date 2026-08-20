import assert from 'node:assert/strict';
import { cancelRmv, createOrReuseRmvDraft, issueRmv, receiveRmvLines } from '../src/workflows/returnMaterialVoucherWorkflow.js';
import { RMV_STATUS } from '../src/data/returnMaterialVouchers.js';

const parent = { id: 'INV-1', trace: 'TR-1', traceability: 'TR-1', projectId: 'P1', lengthMm: 6000, weightKg: 600, materialDescription: 'Pipe', materialGrade: 'A36', sapCode: 'SAP-1', po: 'PO-1', poItem: '10', heatNo: 'H1' };
const rmvs = [];
const saveRmv = async (value) => { const record = { ...value, id: value.id || `RMV-${rmvs.length + 1}` }; const index = rmvs.findIndex((item) => item.id === record.id); if (index >= 0) rmvs[index] = structuredClone(record); else rmvs.push(structuredClone(record)); return structuredClone(record); };
let committedIssue = null; let committedReceipt = null; let committedCancellation = null;
const deps = {
  listRmvs: async () => structuredClone(rmvs), saveRmv, listInventory: async () => [parent],
  commitIssue: async (rmv, ids, context) => {
    committedIssue = { rmvId: rmv.id, ids: [...ids], userName: context.userName };
    return {
      ...rmv, status: RMV_STATUS.ISSUED,
      returnedItems: rmv.returnedItems.filter((line) => ids.includes(line.id))
        .map((line, index) => ({ ...line, sourceOffcutId: `OFF-${index + 1}`, traceability: `TR-1-OC-${String(index + 1).padStart(3, '0')}` })),
    };
  },
  commitReceipt: async (rmv, ids, context) => {
    committedReceipt = { rmvId: rmv.id, ids: [...ids], userName: context.userName };
    return {
      ...rmv,
      status: RMV_STATUS.RETURNED,
      returnedItems: rmv.returnedItems.map((line) => ids.includes(line.id)
        ? { ...line, status: 'received', inventoryItemId: line.traceability }
        : line),
    };
  },
  commitCancel: async (rmv, context) => {
    committedCancellation = { rmvId: rmv.id, userName: context.userName };
    return { ...rmv, status: RMV_STATUS.CANCELLED };
  },
};
const sheet = { id: 'CS-1', projectId: 'P1', workpackId: 'WP1', number: 'B58_FAB_CS-001', status: 'cut' };
const forecastDraft = await createOrReuseRmvDraft({ cuttingSheet: { ...sheet, status: 'released' }, offcuts: [{ parentInventoryItemId: 'INV-1', lengthMm: 1000 }], dependencies: deps });
assert.equal(forecastDraft.status, RMV_STATUS.DRAFT);
rmvs.length = 0;
const draft = await createOrReuseRmvDraft({ cuttingSheet: sheet, offcuts: [{ sourceCandidateKey: 'OC-A', parentInventoryItemId: 'INV-1', lengthMm: 1000 }], context: { projectShortCode: 'B58', destination: 'WAREHOUSE', reportOptions: { reportHeader: { companyName: 'Snapshot Company' } } }, dependencies: deps });
assert.equal(draft.number, 'B58_FAB_RMV-001'); assert.equal(draft.returnedItems[0].weightKg, 100);
assert.equal(draft.metadata.reportOptions.reportHeader.companyName, 'Snapshot Company');
assert.match(draft.reference, /B58_FAB_CS-001/);
assert.match(draft.notes, /TO "WAREHOUSE"/);
const duplicate = await createOrReuseRmvDraft({ cuttingSheet: sheet, offcuts: [], context: { projectShortCode: 'B58' }, dependencies: deps });
assert.equal(duplicate.id, draft.id);

const separateDraft = await createOrReuseRmvDraft({
  cuttingSheet: sheet,
  offcuts: [{ sourceCandidateKey: 'OC-B', parentInventoryItemId: 'INV-1', lengthMm: 500 }],
  context: { projectShortCode: 'B58', origin: 'Offcut', destination: 'Scrap', originLocked: true, reuseExisting: false },
  dependencies: deps,
});
assert.notEqual(separateDraft.id, draft.id);
assert.equal(separateDraft.number, 'B58_FAB_RMV-002');
assert.equal(separateDraft.origin, 'Offcut');
assert.equal(separateDraft.destination, 'Scrap');
assert.equal(separateDraft.metadata.originLocked, true);
const draftWithoutSnapshot = structuredClone(draft); delete draftWithoutSnapshot.metadata.reportOptions;
const issued = await issueRmv(draftWithoutSnapshot, [draft.returnedItems[0].id], { userName: 'Planner', nowFactory: () => '2026-07-15T10:00:00.000Z', reportOptions: { reportHeader: { companyName: 'Issue Snapshot' } } }, deps);
assert.equal(issued.status, RMV_STATUS.ISSUED); assert.equal(issued.returnedItems[0].traceability, 'TR-1-OC-001');
assert.equal(issued.metadata.reportOptions.reportHeader.companyName, 'Issue Snapshot');
assert.deepEqual(committedIssue, { rmvId: draft.id, ids: [draft.returnedItems[0].id], userName: 'Planner' });
const received = await receiveRmvLines(issued, [issued.returnedItems[0].id], { userName: 'Warehouse' }, deps);
assert.equal(received.status, RMV_STATUS.RETURNED);
assert.deepEqual(committedReceipt, { rmvId: issued.id, ids: [issued.returnedItems[0].id], userName: 'Warehouse' });
await assert.rejects(receiveRmvLines(issued, [issued.returnedItems[0].id], {}, {}), /Missing RMV dependency: commitReceipt/);
const cancelled = await cancelRmv(issued, { userName: 'Planner' }, deps);
assert.equal(cancelled.status, RMV_STATUS.CANCELLED);
assert.deepEqual(committedCancellation, { rmvId: issued.id, userName: 'Planner' });
console.log('return material voucher workflow tests passed');
