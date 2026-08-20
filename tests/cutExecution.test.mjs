import assert from 'node:assert/strict';
import {
  actualPieceLengthMm,
  actualRemainingLengthMm,
  applyCutExecution,
  buildCutExecutionDraft,
} from '../src/core/cutExecution.js';
import { normalizeCuttingSheet } from '../src/data/cuttingSheets.js';
import { buildCuttingTransformations } from '../src/core/materialGenealogy.js';

const sheet = {
  id: 'CS-ACTUAL-1', projectId: 'P-1', workpackId: 'WP-1', status: 'released',
  bars: [{
    id: 'BAR-1', inventoryItemId: 'INV-1', originalLength: 6000, remaining: 500,
    pieces: [{ id: 'PIECE-1', mark: 'M1', pos: 'P1', cutLength: 1000 }],
  }],
};

const initialDraft = buildCutExecutionDraft(sheet);
assert.equal(initialDraft.bars[0].actualRemainingMm, 500);
assert.equal(initialDraft.bars[0].pieces[0].actualCutLengthMm, 1000);
assert.equal(initialDraft.bars[0].pieces[0].hasSobremetal, false);
assert.equal(initialDraft.bars[0].pieces[0].sobremetalMm, 0);

const sobremetalSheet = {
  ...sheet,
  bars: [{
    ...sheet.bars[0],
    pieces: [{ id: 'PIECE-SM', mark: 'M-SM', nominalLengthMm: 1000, hasSobremetal: true, sobremetalMm: 500 }],
  }],
};
const sobremetalDraft = buildCutExecutionDraft(sobremetalSheet);
assert.equal(sobremetalDraft.bars[0].pieces[0].actualCutLengthMm, 1500, 'cut execution uses nominal + sobremetal as the physical total');
const sobremetalGenealogy = buildCuttingTransformations(sobremetalSheet);
assert.equal(sobremetalGenealogy.transformations.find((item) => item.outputType === 'CUT_PART').lengthMm, 1500);

await assert.rejects(async () => applyCutExecution(sheet, {
  reason: '', bars: [{ barId: 'BAR-1', actualRemainingMm: 497, pieces: [{ pieceId: 'PIECE-1', actualCutLengthMm: 1002 }] }],
}), /CUT_EXECUTION_VARIANCE_REASON_REQUIRED/);

const executed = applyCutExecution(sheet, {
  reason: 'Ajuste dimensional medido após o corte.',
  bars: [{ barId: 'BAR-1', actualRemainingMm: 497, pieces: [{ pieceId: 'PIECE-1', actualCutLengthMm: 1002, hasSobremetal: true, sobremetalMm: 500 }] }],
}, { userName: 'Operator', nowFactory: () => '2026-07-16T21:00:00.000Z' });
assert.equal(actualPieceLengthMm(executed.bars[0].pieces[0]), 1002);
assert.equal(actualRemainingLengthMm(executed.bars[0]), 497);
assert.equal(executed.bars[0].pieces[0].cutVarianceMm, 2);
assert.equal(executed.bars[0].pieces[0].hasSobremetal, true);
assert.equal(executed.bars[0].pieces[0].sobremetalMm, 500);
assert.equal(executed.bars[0].remainingVarianceMm, -3);
assert.equal(executed.metadata.cutExecution.varianceCount, 2);
assert.equal(executed.metadata.cutExecution.recordedBy, 'Operator');

const genealogy = buildCuttingTransformations(executed);
assert.equal(genealogy.transformations.find((item) => item.outputType === 'CUT_PART').lengthMm, 1002);
assert.equal(genealogy.transformations.find((item) => item.outputType === 'SCRAP').lengthMm, 497);

assert.throws(() => applyCutExecution(sheet, {
  bars: [{ barId: 'BAR-1', actualRemainingMm: -1, pieces: [{ pieceId: 'PIECE-1', actualCutLengthMm: 1000 }] }],
}), /CUT_EXECUTION_INVALID_REMAINING/);
assert.throws(() => applyCutExecution(sheet, {
  reason: 'Invalid measurement', bars: [{ barId: 'BAR-1', actualRemainingMm: 500, pieces: [{ pieceId: 'PIECE-1', actualCutLengthMm: 5800 }] }],
}), /CUT_EXECUTION_OUTPUT_EXCEEDS_STOCK/);
assert.throws(() => applyCutExecution(sheet, {
  bars: [{ barId: 'BAR-1', actualRemainingMm: 500, pieces: [{ pieceId: 'PIECE-1', actualCutLengthMm: 1000, hasSobremetal: true, sobremetalMm: -1 }] }],
}), /CUT_EXECUTION_INVALID_SOBREMETAL/);
assert.throws(() => applyCutExecution({ ...sheet, status: 'cut' }, initialDraft), /CUT_EXECUTION_STATUS_NOT_EDITABLE/);

const normalized = normalizeCuttingSheet({
  id: 'CS-SOBREMETAL', bars: [{ id: 'BAR-1', pieces: [
    { id: 'P-1', hasSobremetal: true },
    { id: 'P-2', hasSobremetal: false, sobremetalMm: 750 },
  ] }],
});
assert.equal(normalized.bars[0].pieces[0].sobremetalMm, 500);
assert.equal(normalized.bars[0].pieces[1].sobremetalMm, 0);

console.log('cut execution tests passed');
