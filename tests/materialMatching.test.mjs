import assert from 'node:assert/strict';
import {
  COVERAGE_STATUS,
  STOCK_MATCH_STATUS,
  analyzeMaterialCoverage,
  evaluateStockCandidate,
  getMaterialKeyFromMto,
  normalizeMaterialGrade,
  normalizeNumber,
} from '../src/core/materialMatching.js';

function clone(value) {
  return structuredClone(value);
}

const baseMto = {
  id: 'mto-1',
  material: 'DNV25Cr',
  identCode: 'PP-SD-168-19',
  type: 'Pipe',
  mark: 'AS01JU04',
  pos: '1A',
  qty: 1,
  cutLength: 1742.69,
};

const baseStock = {
  id: 'stock-1',
  material: 'DNV 25Cr',
  identCode: 'PP-SD-168-19',
  type: 'Pipe',
  length: 6100,
  status: 'available',
  traceability: 'TR-001',
  heat: 'H-001',
};

function run() {
  assert.equal(normalizeMaterialGrade('DNV 25Cr'), normalizeMaterialGrade('DNV25Cr'));
  assert.equal(normalizeMaterialGrade('A106 Gr B'), 'a106grb');

  assert.equal(normalizeNumber('1742,69'), 1742.69);
  assert.equal(normalizeNumber('1742,69 mm'), 1742.69);
  assert.equal(normalizeNumber('invalid'), 0);

  const exactCandidate = evaluateStockCandidate(baseMto, baseStock);
  assert.equal(exactCandidate.status, STOCK_MATCH_STATUS.USABLE);
  assert.equal(exactCandidate.materialCompatible, true);
  assert.equal(exactCandidate.profileCompatible, true);
  assert.equal(exactCandidate.lengthEnough, true);

  const shortCandidate = evaluateStockCandidate(baseMto, { ...baseStock, length: 1000 });
  assert.equal(shortCandidate.status, STOCK_MATCH_STATUS.REJECTED);
  assert.ok(shortCandidate.reasons.includes('Insufficient length'));

  const mismatchCandidate = evaluateStockCandidate(baseMto, { ...baseStock, material: 'A36' });
  assert.equal(mismatchCandidate.status, STOCK_MATCH_STATUS.REJECTED);
  assert.ok(mismatchCandidate.reasons.includes('Material mismatch'));

  const reservedCandidate = evaluateStockCandidate(baseMto, { ...baseStock, status: 'reserved' });
  assert.equal(reservedCandidate.status, STOCK_MATCH_STATUS.REJECTED);
  assert.ok(reservedCandidate.reasons.includes('Inventory status not usable'));

  const offcutCandidate = evaluateStockCandidate(baseMto, { ...baseStock, isOffcut: true }, { allowOffcuts: false });
  assert.equal(offcutCandidate.status, STOCK_MATCH_STATUS.REJECTED);
  assert.ok(offcutCandidate.reasons.includes('Offcut usage disabled'));

  const missingTraceWarning = evaluateStockCandidate(baseMto, { ...baseStock, traceability: '' });
  assert.equal(missingTraceWarning.status, STOCK_MATCH_STATUS.WARNING);
  assert.ok(missingTraceWarning.warnings.includes('Missing traceability'));

  const missingTraceRejected = evaluateStockCandidate(baseMto, { ...baseStock, traceability: '' }, { requireTraceability: true });
  assert.equal(missingTraceRejected.status, STOCK_MATCH_STATUS.REJECTED);
  assert.ok(missingTraceRejected.reasons.includes('Missing traceability'));

  const okCoverage = analyzeMaterialCoverage([baseMto], [baseStock]);
  assert.equal(okCoverage.matchedGroups.length, 1);
  assert.equal(okCoverage.matchedGroups[0].coverageStatus, COVERAGE_STATUS.OK);
  assert.equal(okCoverage.shortages.length, 0);

  const partialCoverage = analyzeMaterialCoverage(
    [{ ...baseMto, qty: 3 }],
    [{ ...baseStock, length: 3000 }],
  );
  assert.equal(partialCoverage.matchedGroups[0].coverageStatus, COVERAGE_STATUS.PARTIAL);
  assert.equal(partialCoverage.shortages.length, 1);
  assert.ok(Math.abs(partialCoverage.shortages[0].missingLength - 2228.07) < 0.0001);

  const noStockCoverage = analyzeMaterialCoverage([baseMto], [{ ...baseStock, material: 'A36' }]);
  assert.equal(noStockCoverage.matchedGroups[0].coverageStatus, COVERAGE_STATUS.NO_STOCK);
  assert.equal(noStockCoverage.shortages.length, 1);

  const grouped = analyzeMaterialCoverage([
    baseMto,
    { ...baseMto, id: 'mto-2', mark: 'AS01JU05', pos: '1B' },
    { ...baseMto, id: 'mto-3', identCode: 'PP-SD-219-10' },
  ], [baseStock]);
  assert.equal(grouped.matchedGroups.length, 2);
  assert.equal(
    getMaterialKeyFromMto(baseMto) === getMaterialKeyFromMto({ ...baseMto, id: 'mto-2' }),
    true,
  );
  assert.notEqual(
    getMaterialKeyFromMto(baseMto),
    getMaterialKeyFromMto({ ...baseMto, identCode: 'PP-SD-219-10' }),
  );

  const mtoItems = [baseMto];
  const inventoryItems = [baseStock];
  const beforeMto = clone(mtoItems);
  const beforeInventory = clone(inventoryItems);
  analyzeMaterialCoverage(mtoItems, inventoryItems);
  assert.deepEqual(mtoItems, beforeMto);
  assert.deepEqual(inventoryItems, beforeInventory);

  console.log('materialMatching tests passed');
}

run();
