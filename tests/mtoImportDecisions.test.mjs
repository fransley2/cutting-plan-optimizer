import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDefaultMtoImportPlan } from '../src/data/mtoImportPlan.js';
import {
  MTO_IMPORT_DECISION,
  applyMtoImportDecisions,
  canConsolidateMtoConflict,
  consolidateMtoConflict,
  createMtoImportDecisionState,
  describeMtoItemChanges,
  getZeroMtoImportOutcome,
} from '../src/data/mtoImportDecisions.js';

function item(id, revision, extra = {}) {
  return { id, projectId: 'P-1', drawing: 'D-1', mark: id, pos: '1', revision, qty: 1, cutLength: 1000, material: 'A36', description: '', ...extra };
}

function setup(category, importedRevision = 'A', existingRevision = 'A', safeItems = []) {
  const newItem = item(`NEW-${category}`, importedRevision);
  const existingItem = item(`OLD-${category}`, existingRevision);
  const entry = { newItem, existingItem };
  const impact = { brandNew: safeItems, [category]: [entry], toSupersede: [] };
  const items = [...safeItems, newItem];
  return { newItem, existingItem, entry, impact, items, importPlan: buildDefaultMtoImportPlan(items, impact) };
}

function choose(state, decision, newRevision = '') {
  return [{ ...state[0], decision, newRevision }];
}

function duplicateConflictFixture(overrides = {}) {
  const first = item('DUPLICATE-1', 'A', { mark: 'SPOOL-1', pos: '1A', sourceRowNumber: 10, ...overrides.first });
  const second = item('DUPLICATE-2', 'A', { mark: 'SPOOL-1', pos: '1A', sourceRowNumber: 11, ...overrides.second });
  const conflictingItems = [first, second];
  const entries = conflictingItems.map((newItem) => ({ newItem, existingItem: null, conflictingItems }));
  const impact = { conflictingRowsInsideFile: entries };
  return {
    items: conflictingItems,
    impact,
    importPlan: buildDefaultMtoImportPlan(conflictingItems, impact),
  };
}

const neverAnalyze = async () => { throw new Error('reanálise não esperada'); };

test('creates UNRESOLVED decisions for every pending category', () => {
  const categories = ['sameRevisionChanged', 'olderRevisions', 'unknownRevisions', 'conflictingRowsInsideFile'];
  const pendingDecisions = Object.fromEntries(categories.map((category) => [category, [setup(category).entry]]));
  const state = createMtoImportDecisionState({ pendingDecisions });
  assert.equal(state.length, 4);
  assert.ok(state.every(({ decision }) => decision === MTO_IMPORT_DECISION.UNRESOLVED));
});

for (const category of ['sameRevisionChanged', 'olderRevisions', 'unknownRevisions']) {
  test(`KEEP_EXISTING for ${category} neither imports nor supersedes`, async () => {
    const fixture = setup(category);
    const state = createMtoImportDecisionState(fixture.importPlan);
    const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.KEEP_EXISTING), analyzeImpact: neverAnalyze });
    assert.deepEqual(result.itemsToImport, []);
    assert.deepEqual(result.itemsToSupersede, []);
    assert.equal(result.keptExisting.length, 1);
  });
}

test('keeps rows conflicting inside the file unresolved and outside persistence', async () => {
  const fixture = setup('conflictingRowsInsideFile', 'A', '');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: state, analyzeImpact: neverAnalyze });
  assert.deepEqual(result.itemsToImport, []);
  assert.deepEqual(result.itemsToSupersede, []);
  assert.equal(result.unresolvedDecisions[0].category, 'conflictingRowsInsideFile');
});

test('consolidates identical extracted rows by summing quantity into one import item', async () => {
  const fixture = duplicateConflictFixture({ second: { qty: 2 } });
  const state = createMtoImportDecisionState(fixture.importPlan);
  assert.equal(state.length, 1);
  assert.equal(state[0].rowCount, 2);
  assert.equal(canConsolidateMtoConflict(state[0]), true);
  assert.equal(consolidateMtoConflict(state[0]).qty, 3);

  const result = await applyMtoImportDecisions({
    ...fixture,
    decisions: choose(state, MTO_IMPORT_DECISION.MERGE_QUANTITIES),
    analyzeImpact: async ([candidate]) => ({ brandNew: [candidate] }),
  });
  assert.equal(result.itemsToImport.length, 1);
  assert.equal(result.itemsToImport[0].qty, 3);
  assert.equal(result.itemsToImport[0].requiredLength, 3000);
  assert.equal(result.counts.consolidatedConflicts, 1);
  assert.equal(result.counts.discardedDuplicateRows, 1);
});

test('can discard repeated extraction rows while keeping one import item', async () => {
  const fixture = duplicateConflictFixture();
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({
    ...fixture,
    decisions: choose(state, MTO_IMPORT_DECISION.KEEP_FIRST),
    analyzeImpact: async ([candidate]) => ({ brandNew: [candidate] }),
  });
  assert.equal(result.itemsToImport.length, 1);
  assert.equal(result.itemsToImport[0].qty, 1);
  assert.equal(result.itemsToImport[0].metadata.importDecision.discardedRowCount, 1);
});

test('blocks quantity consolidation when technical fields differ', async () => {
  const fixture = duplicateConflictFixture({ second: { cutLength: 1200 } });
  const state = createMtoImportDecisionState(fixture.importPlan);
  assert.equal(canConsolidateMtoConflict(state[0]), false);
  const result = await applyMtoImportDecisions({
    ...fixture,
    decisions: choose(state, MTO_IMPORT_DECISION.MERGE_QUANTITIES),
    analyzeImpact: neverAnalyze,
  });
  assert.equal(result.itemsToImport.length, 0);
  assert.ok(result.unresolvedDecisions[0].errors.some((error) => error.includes('dados tecnicos diferentes')));
});

test('keeps unresolved decisions outside persistence', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const result = await applyMtoImportDecisions({ ...fixture, decisions: [], analyzeImpact: neverAnalyze });
  assert.equal(result.itemsToImport.length, 0);
  assert.equal(result.unresolvedDecisions.length, 1);
});

test('rejects an empty corrected revision', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION), analyzeImpact: neverAnalyze });
  assert.ok(result.unresolvedDecisions[0].errors.includes('Informe a nova revisao.'));
});

test('rejects a corrected revision equal to the existing revision', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION, 'A'), analyzeImpact: neverAnalyze });
  assert.ok(result.unresolvedDecisions[0].errors.some((error) => error.includes('revisao existente')));
});

test('rejects a corrected revision equal to the imported revision', async () => {
  const fixture = setup('sameRevisionChanged', 'A', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.IMPORT_AS_NEW_REVISION, 'A'), analyzeImpact: neverAnalyze });
  assert.ok(result.unresolvedDecisions[0].errors.some((error) => error.includes('revisao importada')));
});

test('imports and supersedes a corrected revision only when reanalysis proves it newer', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const analyzeImpact = async ([corrected]) => ({ revisions: [{ newItem: corrected, existingItem: fixture.existingItem }], toSupersede: [fixture.existingItem.id] });
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION, 'B'), analyzeImpact });
  assert.equal(result.itemsToImport[0].revision, 'B');
  assert.deepEqual(result.itemsToSupersede, [fixture.existingItem.id]);
  assert.equal(result.canCommit, true);
});

test('keeps a still-unknown corrected revision blocked', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION, 'ZZ'), analyzeImpact: async ([newItem]) => ({ unknownRevisions: [{ newItem, existingItem: fixture.existingItem }] }) });
  assert.equal(result.itemsToImport.length, 0);
  assert.ok(result.unresolvedDecisions[0].errors[0].includes('nao pode ser comparada'));
});

test('keeps an older corrected revision blocked', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'B');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION, '0'), analyzeImpact: async ([newItem]) => ({ olderRevisions: [{ newItem, existingItem: fixture.existingItem }] }) });
  assert.equal(result.itemsToSupersede.length, 0);
  assert.ok(result.unresolvedDecisions[0].errors[0].includes('mais antiga'));
});

test('preserves safe items from the default plan', async () => {
  const safe = item('SAFE', 'A');
  const fixture = setup('olderRevisions', '0', 'A', [safe]);
  const result = await applyMtoImportDecisions({ ...fixture, analyzeImpact: neverAnalyze });
  assert.deepEqual(result.itemsToImport.map(({ id }) => id), ['SAFE']);
});

test('does not modify original items or decisions', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const decisions = choose(state, MTO_IMPORT_DECISION.SET_REVISION, 'B');
  const beforeItem = structuredClone(fixture.newItem);
  const beforeDecisions = structuredClone(decisions);
  await applyMtoImportDecisions({ ...fixture, decisions, analyzeImpact: async ([newItem]) => ({ revisions: [{ newItem }], toSupersede: ['OLD'] }) });
  assert.deepEqual(fixture.newItem, beforeItem);
  assert.deepEqual(decisions, beforeDecisions);
});

test('rejects a decision not allowed for its category', async () => {
  const fixture = setup('olderRevisions', '0', 'A');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION, 'B'), analyzeImpact: neverAnalyze });
  assert.ok(result.unresolvedDecisions[0].errors[0].includes('nao permitida'));
});

test('sets canCommit false without safe items and true with one safe item', async () => {
  const onlyPending = setup('olderRevisions', '0', 'A');
  const noCommit = await applyMtoImportDecisions({ ...onlyPending, analyzeImpact: neverAnalyze });
  const withSafe = setup('olderRevisions', '0', 'A', [item('SAFE', 'A')]);
  const canCommit = await applyMtoImportDecisions({ ...withSafe, analyzeImpact: neverAnalyze });
  assert.equal(noCommit.canCommit, false);
  assert.equal(canCommit.canCommit, true);
});

test('records corrected revision metadata without losing original metadata', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  fixture.newItem.metadata = { originalRow: { Revision: 'IFC' }, numericParsing: { qty: { rawValue: '1' } } };
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.SET_REVISION, 'B'), analyzeImpact: async ([newItem]) => ({ revisions: [{ newItem }], toSupersede: ['OLD'] }) });
  assert.deepEqual(result.itemsToImport[0].metadata.importDecision, { category: 'unknownRevisions', decision: 'SET_REVISION', originalRevision: 'IFC', correctedRevision: 'B' });
  assert.equal(result.itemsToImport[0].metadata.originalRow.Revision, 'IFC');
});

test('audit summary contains no item snapshots', async () => {
  const fixture = setup('sameRevisionChanged');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const result = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.KEEP_EXISTING), analyzeImpact: neverAnalyze });
  assert.equal('newItem' in result.auditSummary.decisions[0], false);
  assert.equal('existingItem' in result.auditSummary.decisions[0], false);
  assert.equal('originalRow' in result.auditSummary.decisions[0], false);
});

test('matches cloned decisions by stable identity', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const cloned = structuredClone(createMtoImportDecisionState(fixture.importPlan)[0]);
  cloned.decision = MTO_IMPORT_DECISION.KEEP_EXISTING;
  const result = await applyMtoImportDecisions({ ...fixture, decisions: [cloned], analyzeImpact: neverAnalyze });
  assert.equal(result.keptExisting.length, 1);
});

test('describes only allowed content differences', () => {
  const changes = describeMtoItemChanges(
    { qty: 4, cutLength: 1000, material: 'S32750', description: 'Old', metadata: { secret: 1 } },
    { qty: 6, cutLength: 1000, material: 'S32760', description: 'New', metadata: { secret: 2 } },
  );
  assert.deepEqual(changes.map(({ field }) => field), ['qty', 'material', 'description']);
});

test('describes zero safe lines with unresolved decisions as a blocking outcome', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const effectivePlan = await applyMtoImportDecisions({ ...fixture, analyzeImpact: neverAnalyze });
  const outcome = getZeroMtoImportOutcome('apply', effectivePlan);
  assert.equal(outcome.keepDecisionModalOpen, true);
  assert.equal(outcome.successful, false);
  assert.equal(outcome.message, 'Nenhuma linha pode ser importada enquanto houver pendências não resolvidas. Resolva ao menos uma linha ou mantenha os itens existentes.');
});

test('describes continuing with zero safe lines as an informative outcome', async () => {
  const fixture = setup('unknownRevisions', 'IFC', 'A');
  const effectivePlan = await applyMtoImportDecisions({ ...fixture, analyzeImpact: neverAnalyze });
  const outcome = getZeroMtoImportOutcome('continue', effectivePlan);
  assert.equal(outcome.keepDecisionModalOpen, false);
  assert.equal(outcome.successful, true);
  assert.equal(outcome.message, 'Nenhum item foi importado. Todas as linhas permanecem pendentes e nenhum item existente foi alterado.');
});

test('describes all KEEP_EXISTING decisions as successful without new items', async () => {
  const fixture = setup('sameRevisionChanged');
  const state = createMtoImportDecisionState(fixture.importPlan);
  const effectivePlan = await applyMtoImportDecisions({ ...fixture, decisions: choose(state, MTO_IMPORT_DECISION.KEEP_EXISTING), analyzeImpact: neverAnalyze });
  const outcome = getZeroMtoImportOutcome('apply', effectivePlan);
  assert.equal(effectivePlan.counts.keptExisting, 1);
  assert.equal(outcome.successful, true);
  assert.equal(outcome.message, 'Importação concluída sem novos itens. Os itens existentes foram mantidos.');
});

test('imports one proven corrected revision while keeping two other decisions unresolved', async () => {
  const corrected = setup('unknownRevisions', 'IFC', 'A');
  const older = setup('olderRevisions', '0', 'A');
  const changed = setup('sameRevisionChanged', 'A', 'A');
  const items = [corrected.newItem, older.newItem, changed.newItem];
  const impact = {
    unknownRevisions: [corrected.entry],
    olderRevisions: [older.entry],
    sameRevisionChanged: [changed.entry],
    toSupersede: [],
  };
  const importPlan = buildDefaultMtoImportPlan(items, impact);
  const state = createMtoImportDecisionState(importPlan);
  const correction = state.find(({ category }) => category === 'unknownRevisions');
  const decisions = [{ ...correction, decision: MTO_IMPORT_DECISION.SET_REVISION, newRevision: 'B' }];
  const effectivePlan = await applyMtoImportDecisions({
    items, impact, importPlan, decisions,
    analyzeImpact: async ([newItem]) => ({ revisions: [{ newItem, existingItem: corrected.existingItem }], toSupersede: [corrected.existingItem.id] }),
  });
  assert.deepEqual(effectivePlan.itemsToImport.map(({ id }) => id), [corrected.newItem.id]);
  assert.deepEqual(effectivePlan.itemsToSupersede, [corrected.existingItem.id]);
  assert.equal(effectivePlan.unresolvedDecisions.length, 2);
});
