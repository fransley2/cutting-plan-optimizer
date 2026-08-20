import assert from 'node:assert/strict';
import { availableMtoItems, compatibleDrawings, compatibleMtoItems, mergeUpdatedMtoItems, mtoMatchesLinkedDrawings, normalizeDrawingReference, uniqueIds } from '../src/core/workpackScope.js';
const wp={projectId:'P',equipmentId:'E'};
assert.equal(compatibleDrawings(wp,[{id:'1',projectId:'P',equipmentId:'E'},{id:'2',projectId:'P',equipmentId:'X'},{id:'3',projectId:'P',equipmentId:''}]).length,2);
assert.equal(compatibleMtoItems(wp,[{id:'1',projectId:'P',equipmentId:'E'},{id:'2',projectId:'P',equipmentId:'X'},{id:'3',projectId:'P',equipmentId:''}]).length,2);
assert.deepEqual(
  compatibleMtoItems(
    wp,
    [{ id: '1', projectId: 'P', equipmentId: 'E', drawing: 'DWG-1' }, { id: '2', projectId: 'P', equipmentId: 'E', drawing: 'DWG-2' }, { id: '3', projectId: 'P', equipmentId: 'E' }],
    ['drawing-1'],
    [{ id: 'drawing-1', drawingNo: 'DWG-1' }],
  ).map((item) => item.id),
  ['1', '3'],
);
assert.deepEqual(uniqueIds(['a','a','',null]),['a']);
const refreshedMto = mergeUpdatedMtoItems(
  [{ id: 'MTO-1', mark: 'OLD', cutLength: 1000 }, { id: 'MTO-2', mark: 'KEEP' }],
  [{ id: 'MTO-1', mark: 'NEW', cutLength: 1250 }, { id: 'MTO-3', mark: 'ADDED' }],
);
assert.deepEqual(refreshedMto, [
  { id: 'MTO-1', mark: 'NEW', cutLength: 1250 },
  { id: 'MTO-2', mark: 'KEEP' },
  { id: 'MTO-3', mark: 'ADDED' },
]);
assert.equal(normalizeDrawingReference('263221-SGU-JU-PI-DE-004 Rev. 0'), '263221SGUJUPIDE004');
assert.equal(
  mtoMatchesLinkedDrawings(
    { drawing: '263221 SGU JU PI DE 004 REV 0' },
    ['drawing-1'],
    [{ id: 'drawing-1', drawingNo: '263221-SGU-JU-PI-DE-004' }],
  ),
  true,
);
assert.deepEqual(
  availableMtoItems(wp, [
    { id: 'drawing-match', projectId: 'P', equipmentId: 'E', drawing: 'DWG-1' },
    { id: 'drawing-pending', projectId: 'P', drawing: 'DWG-2' },
    { id: 'other-project', projectId: 'OTHER', drawing: 'DWG-1' },
  ]).map((item) => item.id),
  ['drawing-match', 'drawing-pending'],
);
console.log('workpack scope tests passed');
