import assert from 'node:assert/strict';
import { buildMaterialCouponNotesDraft, buildMaterialCouponReferenceDraft, materialCouponStorageLocations, nextMaterialCouponCode } from '../src/features/materialCoupon/materialCouponService.js';

const couponLines = { lines: [{ drawingUse: 'LINE-DWG-01', equipment: 'EQUIPMENT-LINE', tag: 'TAG-LINE' }] };
const workpack = { drawingIds: ['drawing-1'], mtoItemIds: ['mto-1'] };
const drawings = [{ id: 'drawing-1', drawingNo: 'WP-DWG-01', title: 'Workpack Drawing' }];
const mtoItems = [{ id: 'mto-1', tag: 'TAG-01', mark: 'MK-01', pos: 'POS-01' }, { id: 'other', tag: 'IGNORE-TAG', mark: 'IGNORE' }];

const linked = buildMaterialCouponReferenceDraft(couponLines, workpack, drawings, mtoItems);
assert.match(linked, /DESIGN DRAWING:\n- WP-DWG-01 — Workpack Drawing/);
assert.match(linked, /TAGS:\n- TAG-01/);
assert.doesNotMatch(linked, /MK-01|POS-01|TAG-LINE|IGNORE/);

const linkedWithCuttingSheets = buildMaterialCouponReferenceDraft(couponLines, workpack, drawings, mtoItems, [
  { id: 'cs-1', number: 'B58_CS-001', bars: [{ pieces: [{ mark: 'MK-10', pos: '01' }, { mark: 'MK-10', position: '02' }] }] },
  { id: 'cs-2', number: 'B58_CS-002', planning: { solution: { allParts: [{ mark: 'MK-20', pos: '03' }] } } },
]);
assert.match(linkedWithCuttingSheets, /CUTTING SHEET: B58_CS-001\nMARK \/ POSITION:\n- MK-10 \/ 01\n- MK-10 \/ 02\n\nCUTTING SHEET: B58_CS-002\nMARK \/ POSITION:\n- MK-20 \/ 03/);

const workpackWithoutScope = buildMaterialCouponReferenceDraft(couponLines, { drawingIds: [], mtoItemIds: [] }, [], mtoItems);
assert.match(workpackWithoutScope, /DESIGN DRAWING:\n- LINE-DWG-01/);
assert.match(workpackWithoutScope, /TAG-LINE/);

const withoutWorkpack = buildMaterialCouponReferenceDraft(couponLines, null, [], []);
assert.match(withoutWorkpack, /LINE-DWG-01/);
assert.match(withoutWorkpack, /TAG-LINE/);

const placeholders = buildMaterialCouponReferenceDraft({ lines: [] }, null, [], []);
assert.equal(placeholders, '');

const storageLocations = materialCouponStorageLocations({ lines: [
  { inventoryItemId: 'INV-1' },
  { inventoryItemId: 'INV-2' },
  { inventoryItemId: 'INV-3' },
] }, [
  { id: 'INV-1', location: 'PREFAB' },
  { trace: 'INV-2', location: 'QUADJOINT' },
  { traceability: 'INV-3', location: 'prefab' },
]);
assert.deepEqual(storageLocations, ['PREFAB', 'QUADJOINT']);

const notes = buildMaterialCouponNotesDraft({ materialDestination: 'YARD 1', scope: 'SPOOL FABRICATION' }, storageLocations);
assert.match(notes, /FROM PREFAB\/QUADJOINT TO "YARD 1" FOR SPOOL FABRICATION/);
assert.match(notes, /SUBCONTRACTORS TO SIGN AND RETURN A COPY TO SAIPEM/);

const notePlaceholders = buildMaterialCouponNotesDraft({});
assert.match(notePlaceholders, /\[STORAGE\].*"\[DESTINATION\]".*\[SCOPE\]/);

assert.equal(nextMaterialCouponCode('B58', [
  { number: 'B58_FAB_MC-001' },
  { metadata: { coupon: { header: { mcCode: 'B58_FAB_MC-006' } } } },
  { number: 'OTHER_FAB_MC-099' },
]), 'B58_FAB_MC-007');
assert.equal(nextMaterialCouponCode('b58', []), 'B58_FAB_MC-001');
assert.equal(nextMaterialCouponCode('', []), '');

console.log('material coupon notes draft tests passed');
