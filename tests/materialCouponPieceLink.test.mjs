import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkCuttingSheetPiece,
  listCuttingSheetPieceLinkOptions,
  syncCuttingSheetPieceCouponLinks,
  unlinkCuttingSheetPiece,
} from '../src/core/materialCouponPieceLink.js';

const sheet = {
  id: 'cs-1', number: 'CS-001', bars: [{ id: 'bar-1', materialDescription: 'PIPE', materialGrade: 'A106-B', diaMm: 168.3, pieces: [
    { id: 'piece-1', mark: 'P-01', cutLengthMm: 1200, thicknessMm: 7.1 },
    { id: 'piece-2', pos: 'P-02', length: 800 },
  ] }],
};

test('builds searchable piece options and resolves piece/bar material fields', () => {
  const [option] = listCuttingSheetPieceLinkOptions([sheet]);
  assert.deepEqual(option, {
    linkId: 'cs-1:piece-1', identifier: 'CS-001 / P-01 · piece-1', cuttingSheetId: 'cs-1', cuttingSheetNumber: 'CS-001',
    barId: 'bar-1', pieceId: 'piece-1', pieceCode: 'P-01', materialDescription: 'PIPE', materialSpec: '',
    materialGrade: 'A106-B', drawingRef: '', lengthMm: 1200, widthMm: '', thicknessMm: 7.1, diaMm: 168.3,
  });
});

test('links multiple pieces as snapshots and removes only the selected link', () => {
  const options = listCuttingSheetPieceLinkOptions([sheet]);
  const first = linkCuttingSheetPiece({ links: {} }, options[0], '2026-07-20T10:00:00.000Z');
  const second = linkCuttingSheetPiece(first, options[1], '2026-07-20T10:01:00.000Z');
  assert.deepEqual(second.links.cuttingSheetPieceIds, ['cs-1:piece-1', 'cs-1:piece-2']);
  assert.equal(second.linkedCuttingSheetPieces[0].materialDescription, 'PIPE');
  const unlinked = unlinkCuttingSheetPiece(second, 'cs-1:piece-1');
  assert.deepEqual(unlinked.links.cuttingSheetPieceIds, ['cs-1:piece-2']);
});

test('sets reciprocal piece links and clears stale links for the same coupon', () => {
  const linked = syncCuttingSheetPieceCouponLinks(sheet, {
    id: 'mc-1', number: 'MC-001', linkedCuttingSheetPieces: [{ cuttingSheetId: 'cs-1', pieceId: 'piece-1' }],
  });
  assert.equal(linked.bars[0].pieces[0].linkedMaterialCouponId, 'mc-1');
  assert.equal(linked.bars[0].pieces[0].linkedMaterialCouponNumber, 'MC-001');
  const cleared = syncCuttingSheetPieceCouponLinks(linked, { id: 'mc-1', number: 'MC-001', linkedCuttingSheetPieces: [] });
  assert.equal(cleared.bars[0].pieces[0].linkedMaterialCouponId, undefined);
});
