import assert from 'node:assert/strict';
import { buildPieceColorMap, getColorForPiece, getPieceColorKey } from '../src/core/pieceColors.js';

const sameMarkPieces = [
  { mark: 'A-01', pos: 'P-01', dwgNumber: 'DWG-1', material: 'A36', length: 1000 },
  { mark: 'A-01', pos: 'P-02', dwgNumber: 'DWG-2', material: 'A36', length: 1200 },
  { mark: 'A-01', pos: 'P-03', dwgNumber: 'DWG-3', material: 'A36', length: 1400 },
];

const twentyDifferentPieces = Array.from({ length: 20 }, (_, index) => ({
  mark: `M-${index + 1}`,
  pos: `POS-${index + 1}`,
  dwgNumber: `DWG-${index + 1}`,
  material: 'A36',
  length: 1000 + index,
}));

function run() {
  const sameMap = buildPieceColorMap(sameMarkPieces);
  const colors = sameMarkPieces.map((piece) => getColorForPiece(piece, sameMap));
  assert.equal(colors[0], colors[1]);
  assert.equal(colors[1], colors[2]);

  const uniqueMap = buildPieceColorMap(twentyDifferentPieces);
  const uniqueColors = twentyDifferentPieces.map((piece) => getColorForPiece(piece, uniqueMap));
  const uniqueColorCount = new Set(uniqueColors).size;
  assert.equal(uniqueColorCount, twentyDifferentPieces.length);

  const key = getPieceColorKey({ mark: '  a-01  ', pos: 'p-1', dwgNumber: 'dwg-1', material: 'A36', length: 1000 });
  assert.equal(key, 'A-01');

  const fallbackKey = getPieceColorKey({ mark: '', pos: 'P-02', dwgNumber: 'D-01', material: 'A36', length: 1000, id: 'abc' });
  assert.equal(fallbackKey, 'P-02');

  console.log('pieceColors tests passed');
}

run();
