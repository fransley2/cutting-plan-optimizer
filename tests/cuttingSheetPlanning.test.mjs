import assert from 'node:assert/strict';
import { cuttingSheetPlanningSnapshot, legacyPlanToCuttingSheetDraft, normalizePieceSobremetal, preparePiecesForNesting } from '../src/core/cuttingSheetPlanning.js';
import { runAllocations } from '../src/core/allocate.js';

const prepared = normalizePieceSobremetal({ mark: 'P1', length: 1000, hasSobremetal: true, sobremetalMm: 500 });
assert.equal(prepared.nominalLengthMm, 1000);
assert.equal(prepared.sobremetalMm, 500);
assert.equal(prepared.effectiveLengthMm, 1500);
assert.equal(prepared.length, 1500);
assert.deepEqual(preparePiecesForNesting([{ length: 1000 }, { length: 700, hasSobremetal: true }]).map((item) => item.length), [1000, 1200]);

const nested = runAllocations({
  parts: preparePiecesForNesting([{ id: 'P1', length: 1000, material: 'A36', priority: 1, hasSobremetal: true, sobremetalMm: 500 }]),
  stock: [{ id: 'B1', length: 2000, materialGrade: 'A36' }],
  kerf: 5, minOffcut: 0, stockUsageStrategy: 'best-fit', trim: { left: 0, right: 0 },
});
assert.equal(nested.stockUsed[0].pieces.length, 1, 'sobremetal remains part of one continuous piece');
assert.equal(nested.stockUsed[0].pieces[0].nominalLengthMm, 1000);
assert.equal(nested.stockUsed[0].pieces[0].length, 1500);
assert.equal(nested.stockUsed[0].remaining, 500);

const migrated = legacyPlanToCuttingSheetDraft({
  name: 'B58_FAB_CS-001', projectId: 'PROJECT-1', savedAt: '2026-07-20T10:00:00.000Z',
  projectData: { projectId: 'PROJECT-1', workpackId: 'WP-1' }, settings: { kerf: 5 },
  stocks: [{ id: 'S1' }], parts: [{ mark: 'P1' }],
  solution: { stockUsed: [{ id: 'BAR-1', pieces: [{ id: 'P1' }] }] }, solutionSummary: { stockUsedCount: 1 },
});
assert.equal(migrated.number, 'B58_FAB_CS-001');
assert.equal(migrated.status, 'draft');
assert.equal(migrated.workpackId, 'WP-1');
assert.equal(migrated.metadata.migratedFromLegacyPlan, true);
assert.equal(cuttingSheetPlanningSnapshot(migrated).parts[0].mark, 'P1');

const issued = legacyPlanToCuttingSheetDraft({ name: 'B58_FAB_CS-001', solution: { stockUsed: [{ id: 'LEGACY' }] } }, {
  id: 'CS-1', number: 'B58_FAB_CS-001', status: 'released', bars: [{ id: 'ISSUED' }], metadata: {}, summary: {},
});
assert.equal(issued.status, 'released');
assert.equal(issued.bars[0].id, 'ISSUED');

console.log('cutting sheet planning tests passed');
