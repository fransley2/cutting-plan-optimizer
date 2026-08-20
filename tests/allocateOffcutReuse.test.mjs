import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateParts, allocatePartsWithOffcutReuse } from '../src/core/allocate.js';

// Ensures the wrapper preserves the single-pass contract when every part fits and no reusable offcut is produced.
test('returns the baseline single-pass result and complete return shape when reuse is unnecessary', () => {
  const parts = [
    { id: 'P-3000', priority: 1, length: 3000, material: 'A36' },
    { id: 'P-2994', priority: 1, length: 2994, material: 'A36' },
  ];
  const stock = [
    { id: 'S-6000', length: 6000, materialGrade: 'A36', traceability: 'TR-6000', description: 'Pipe' },
  ];

  const result = allocatePartsWithOffcutReuse(parts, stock, 3, 100, 'best-fit', 'first-fit');
  const singlePass = allocateParts(parts, stock, 3, 100, 'best-fit', 'first-fit');

  assert.deepEqual(result, singlePass);
  assert.deepEqual(Object.keys(result).sort(), [
    'generatedOffcuts',
    'minOffcut',
    'stockUsed',
    'totalRemaining',
    'totalStockLength',
    'totalTrims',
    'unplacedParts',
  ]);
  assert.equal(result.unplacedParts.length, 0);
  assert.equal(result.generatedOffcuts.length, 0);
  assert.equal(result.stockUsed[0].remaining, 3);
});

// Ensures a part blocked by the first-pass kerf consumes the generated offcut on pass 2 instead of remaining unplaced.
test('consumes a pass-1 offcut in pass 2 and removes it from available generated offcuts', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'P-4000', priority: 1, length: 4000, material: 'A36' },
      { id: 'P-1998', priority: 1, length: 1998, material: 'A36' },
    ],
    [
      { id: 'S-6000', length: 6000, materialGrade: 'A36', traceability: 'TR-6000', description: 'Pipe' },
    ],
    3,
    100,
    'best-fit',
    'first-fit',
  );

  const reusedBar = result.stockUsed.find(bar => bar.traceability === 'TR-6000_OC');
  assert.equal(result.unplacedParts.length, 0);
  assert.ok(reusedBar);
  assert.equal(reusedBar.isOffcut, true);
  assert.deepEqual(reusedBar.pieces.map(part => part.id), ['P-1998']);
  assert.equal(result.generatedOffcuts.some(bar => bar.traceability === 'TR-6000_OC'), false);
});

// Ensures an offcut-of-an-offcut is consumed on pass 3 and the hard cap prevents a fourth reuse pass.
test('uses an offcut-of-an-offcut on pass 3 and never attempts a fourth pass', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'MAIN', priority: 1, length: 90, material: 'A36' },
      { id: 'TOO-LARGE', priority: 1, length: 11, material: 'A36' },
      { id: 'A', priority: 1, length: 3, material: 'A36' },
      { id: 'B', priority: 1, length: 3, material: 'A36' },
      { id: 'C', priority: 1, length: 3, material: 'A36' },
    ],
    [
      { id: 'S-100', length: 100, materialGrade: 'A36', traceability: 'TR-100', description: 'Test bar' },
    ],
    8,
    1,
    'best-fit',
    'first-fit',
  );

  assert.deepEqual(result.stockUsed.map(bar => bar.traceability), [
    'TR-100',
    'TR-100_OC',
    'TR-100_OC_OC',
  ]);
  assert.deepEqual(result.stockUsed[2].pieces.map(part => part.id), ['B']);
  assert.deepEqual(result.unplacedParts.map(part => part.id), ['TOO-LARGE', 'C']);
  assert.equal(result.generatedOffcuts.length, 1);
  assert.equal(result.generatedOffcuts[0].traceability, 'TR-100_OC_OC_OC');
  assert.equal(result.generatedOffcuts[0].length, 4);
  assert.ok(result.generatedOffcuts[0].length >= result.unplacedParts[1].length);
});

// Ensures a reuse pass that places nothing terminates safely and retains every pass-1 offcut for later use.
test('terminates early when no remaining part fits a generated offcut', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'P-4000', priority: 1, length: 4000, material: 'A36' },
      { id: 'P-2500', priority: 1, length: 2500, material: 'A36' },
    ],
    [
      { id: 'S-6000', length: 6000, materialGrade: 'A36', traceability: 'TR-6000', description: 'Pipe' },
    ],
    3,
    100,
    'best-fit',
    'first-fit',
  );

  assert.deepEqual(result.unplacedParts.map(part => part.id), ['P-2500']);
  assert.deepEqual(result.stockUsed.map(bar => bar.traceability), ['TR-6000']);
  assert.deepEqual(result.generatedOffcuts.map(bar => [bar.traceability, bar.length]), [['TR-6000_OC', 2000]]);
});

// Ensures an unused pass-1 offcut survives consolidation alongside a fresh second-generation offcut.
test('preserves unconsumed offcuts while merging newly generated reuse offcuts', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'A-4000', priority: 1, length: 4000, material: 'A36' },
      { id: 'B-3000', priority: 1, length: 3000, material: 'B36' },
      { id: 'A-1998', priority: 2, length: 1998, material: 'A36' },
    ],
    [
      { id: 'S-A', length: 6000, materialGrade: 'A36', traceability: 'TR-A', description: 'A36 pipe' },
      { id: 'S-B', length: 5000, materialGrade: 'B36', traceability: 'TR-B', description: 'B36 pipe' },
    ],
    3,
    1,
    'best-fit',
    'first-fit',
  );

  assert.equal(result.unplacedParts.length, 0);
  assert.deepEqual(result.generatedOffcuts.map(bar => [bar.traceability, bar.length]), [
    ['TR-B_OC', 2000],
    ['TR-A_OC_OC', 2],
  ]);
  assert.equal(result.generatedOffcuts.some(bar => bar.traceability === 'TR-A_OC'), false);
});

// Ensures trim reduces only the initial stock bar and is not charged again when its offcut becomes pass-2 stock.
test('applies trim on pass 1 only and reuses the full generated offcut length', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'P-4000', priority: 1, length: 4000, material: 'A36' },
      { id: 'P-1998', priority: 1, length: 1998, material: 'A36' },
    ],
    [
      { id: 'S-6015', length: 6015, materialGrade: 'A36', traceability: 'TR-6015', description: 'Pipe' },
    ],
    3,
    100,
    'best-fit',
    'first-fit',
    { left: 10, right: 5 },
  );

  const firstPassBar = result.stockUsed[0];
  const reusedBar = result.stockUsed[1];
  assert.equal(firstPassBar.originalLength, 6015);
  assert.equal(firstPassBar.remaining, 2000);
  assert.equal(firstPassBar.leftTrim, 10);
  assert.equal(firstPassBar.rightTrim, 5);
  assert.equal(reusedBar.originalLength, 2000);
  assert.equal(reusedBar.leftTrim, 0);
  assert.equal(reusedBar.rightTrim, 0);
  assert.equal(reusedBar.remaining, 2);
  assert.deepEqual(reusedBar.pieces.map(part => part.id), ['P-1998']);
});

// Ensures consolidated totals are derived exactly once from the final stockUsed collection after reuse.
test('recomputes multi-pass totals from the final consolidated stockUsed bars', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'P-4000', priority: 1, length: 4000, material: 'A36' },
      { id: 'P-1998', priority: 1, length: 1998, material: 'A36' },
    ],
    [
      { id: 'S-6015', length: 6015, materialGrade: 'A36', traceability: 'TR-6015', description: 'Pipe' },
    ],
    3,
    100,
    'best-fit',
    'first-fit',
    { left: 10, right: 5 },
  );

  const expectedStockLength = result.stockUsed.reduce((sum, bar) => sum + bar.originalLength, 0);
  const expectedRemaining = result.stockUsed.reduce((sum, bar) => sum + bar.remaining, 0);
  const expectedTrims = result.stockUsed.reduce((sum, bar) => sum + bar.leftTrim + bar.rightTrim, 0);
  assert.equal(result.totalStockLength, expectedStockLength);
  assert.equal(result.totalRemaining, expectedRemaining);
  assert.equal(result.totalTrims, expectedTrims);
  assert.deepEqual([result.totalStockLength, result.totalRemaining, result.totalTrims], [8015, 2002, 15]);
});

// Ensures the inherited material grade still blocks an incompatible leftover part during offcut reuse.
test('enforces material-grade compatibility on generated offcuts', () => {
  const result = allocatePartsWithOffcutReuse(
    [
      { id: 'A-4000', priority: 1, length: 4000, material: 'A36' },
      { id: 'B-1998', priority: 1, length: 1998, material: 'B36' },
    ],
    [
      { id: 'S-A', length: 6000, materialGrade: 'A36', traceability: 'TR-A', description: 'A36 pipe' },
    ],
    3,
    100,
    'best-fit',
    'first-fit',
  );

  assert.deepEqual(result.unplacedParts.map(part => part.id), ['B-1998']);
  assert.equal(result.stockUsed.some(bar => bar.isOffcut === true), false);
  assert.deepEqual(result.generatedOffcuts.map(bar => [bar.traceability, bar.materialGrade]), [['TR-A_OC', 'A36']]);
});

// Ensures equal-priority, equal-length parts produce the same multi-pass allocation from independent cloned inputs.
test('produces structurally identical multi-pass results for equivalent cloned inputs', () => {
  const fixture = {
    parts: [
      { id: 'MAIN', priority: 1, length: 4000, material: 'A36' },
      { id: 'B', priority: 2, length: 1998, material: 'A36' },
      { id: 'A', priority: 2, length: 1998, material: 'A36' },
    ],
    stock: [
      { id: 'S-6000', length: 6000, materialGrade: 'A36', traceability: 'TR-6000', description: 'Pipe' },
    ],
  };

  const first = allocatePartsWithOffcutReuse(
    structuredClone(fixture.parts),
    structuredClone(fixture.stock),
    3,
    100,
    'best-fit',
    'first-fit',
  );
  const second = allocatePartsWithOffcutReuse(
    structuredClone(fixture.parts),
    structuredClone(fixture.stock),
    3,
    100,
    'best-fit',
    'first-fit',
  );

  assert.deepEqual(first, second);
  assert.deepEqual(first.stockUsed[1].pieces.map(part => part.id), ['A']);
  assert.deepEqual(first.unplacedParts.map(part => part.id), ['B']);
});
