import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDefaultMtoImportPlan } from '../src/data/mtoImportPlan.js';
import { commitMtoThenCreateDrawings } from '../src/data/mtoImportWorkflow.js';

function item(id, revision = 'A') {
  return { id, drawing: 'D-1', mark: id, pos: '1', revision };
}

function entry(newItem) {
  return { newItem, existingItem: item(`OLD-${newItem.id || newItem.mark}`) };
}

test('imports a brand-new item', () => {
  const brandNew = item('NEW');
  const plan = buildDefaultMtoImportPlan([brandNew], { brandNew: [brandNew] });
  assert.deepEqual(plan.itemsToImport, [brandNew]);
  assert.equal(plan.counts.brandNew, 1);
});

test('imports a proven newer revision', () => {
  const newer = item('NEWER', 'B');
  const plan = buildDefaultMtoImportPlan([newer], { revisions: [entry(newer)] });
  assert.deepEqual(plan.itemsToImport, [newer]);
  assert.equal(plan.counts.newerRevisions, 1);
});

test('copies only impact.toSupersede into the supersede plan', () => {
  const newer = item('NEWER', 'B');
  const pending = item('PENDING', 'IFC');
  const plan = buildDefaultMtoImportPlan([newer, pending], {
    revisions: [entry(newer)], unknownRevisions: [entry(pending)], toSupersede: ['OLD-NEWER'],
  });
  assert.deepEqual(plan.itemsToSupersede, ['OLD-NEWER']);
});

test('excludes an identical duplicate', () => {
  const duplicate = item('DUP');
  const plan = buildDefaultMtoImportPlan([duplicate], { duplicates: [entry(duplicate)] });
  assert.deepEqual(plan.itemsToImport, []);
  assert.equal(plan.ignoredDuplicates.length, 1);
});

test('excludes sameRevisionChanged and records it as pending', () => {
  const changed = item('CHANGED');
  const plan = buildDefaultMtoImportPlan([changed], { sameRevisionChanged: [entry(changed)] });
  assert.deepEqual(plan.itemsToImport, []);
  assert.deepEqual(plan.pendingDecisions.sameRevisionChanged.map(({ newItem }) => newItem.id), ['CHANGED']);
});

test('excludes an older revision and records it as pending', () => {
  const older = item('OLDER', 'A');
  const plan = buildDefaultMtoImportPlan([older], { olderRevisions: [entry(older)] });
  assert.deepEqual(plan.itemsToImport, []);
  assert.equal(plan.pendingDecisions.olderRevisions.length, 1);
});

test('excludes an unknown revision and records it as pending', () => {
  const unknown = item('UNKNOWN', 'IFC');
  const plan = buildDefaultMtoImportPlan([unknown], { unknownRevisions: [entry(unknown)] });
  assert.deepEqual(plan.itemsToImport, []);
  assert.equal(plan.pendingDecisions.unknownRevisions.length, 1);
});

test('excludes rows conflicting inside the file and records them as pending', () => {
  const first = item('CONFLICT-1');
  const second = item('CONFLICT-2');
  const plan = buildDefaultMtoImportPlan([first, second], {
    conflictingRowsInsideFile: [entry(first), entry(second)],
    toSupersede: [],
  });
  assert.deepEqual(plan.itemsToImport, []);
  assert.deepEqual(plan.itemsToSupersede, []);
  assert.deepEqual(
    plan.pendingDecisions.conflictingRowsInsideFile.map(({ newItem }) => newItem.id),
    ['CONFLICT-1', 'CONFLICT-2'],
  );
});

test('returns correct counts for all seven categories', () => {
  const values = ['BRAND', 'NEWER', 'DUP', 'CHANGED', 'OLDER', 'UNKNOWN', 'CONFLICT'].map((id) => item(id));
  const [brand, newer, duplicate, changed, older, unknown, conflict] = values;
  const plan = buildDefaultMtoImportPlan(values, {
    brandNew: [brand], revisions: [entry(newer)], duplicates: [entry(duplicate)],
    sameRevisionChanged: [entry(changed)], olderRevisions: [entry(older)], unknownRevisions: [entry(unknown)],
    conflictingRowsInsideFile: [entry(conflict)],
    toSupersede: ['OLD-NEWER'],
  });
  assert.deepEqual(plan.counts, {
    total: 7, itemsToImport: 2, brandNew: 1, newerRevisions: 1, duplicates: 1,
    sameRevisionChanged: 1, olderRevisions: 1, unknownRevisions: 1,
    conflictingRowsInsideFile: 1, pendingDecisions: 4, itemsToSupersede: 1,
  });
});

test('does not modify received objects or arrays', () => {
  const values = [item('SAFE'), item('DUP')];
  const impact = { brandNew: [values[0]], duplicates: [entry(values[1])], toSupersede: [] };
  const beforeItems = structuredClone(values);
  const beforeImpact = structuredClone(impact);
  buildDefaultMtoImportPlan(values, impact);
  assert.deepEqual(values, beforeItems);
  assert.deepEqual(impact, beforeImpact);
});

test('accepts empty and partial impact objects defensively', () => {
  const safe = item('SAFE');
  assert.deepEqual(buildDefaultMtoImportPlan([safe]).itemsToImport, [safe]);
  assert.deepEqual(buildDefaultMtoImportPlan(undefined, { duplicates: undefined }).itemsToImport, []);
});

test('matches cloned blocked items by id or revision identity', () => {
  const byId = item('BY-ID');
  const byRevisionKey = { drawing: 'D-2', mark: 'M-2', pos: '2', revision: 'C' };
  const plan = buildDefaultMtoImportPlan([byId, byRevisionKey], {
    duplicates: [entry(structuredClone(byId))],
    unknownRevisions: [entry(structuredClone(byRevisionKey))],
  });
  assert.deepEqual(plan.itemsToImport, []);
});

test('reports pending-only input without importable items', () => {
  const pending = item('PENDING');
  const plan = buildDefaultMtoImportPlan([pending], { olderRevisions: [entry(pending)] });
  assert.equal(plan.itemsToImport.length, 0);
  assert.equal(plan.hasPendingDecisions, true);
});

test('imports only safe items in a mixed safe and pending input', () => {
  const safe = item('SAFE');
  const pending = item('PENDING');
  const plan = buildDefaultMtoImportPlan([safe, pending], {
    brandNew: [safe], sameRevisionChanged: [entry(pending)],
  });
  assert.deepEqual(plan.itemsToImport.map(({ id }) => id), ['SAFE']);
  assert.equal(plan.hasPendingDecisions, true);
});

test('passes only planned imports and supersedes to the commit workflow', async () => {
  const safe = item('SAFE');
  const pending = item('PENDING');
  const plan = buildDefaultMtoImportPlan([safe, pending], {
    brandNew: [safe], unknownRevisions: [entry(pending)], toSupersede: ['OLD-SAFE'],
  });
  let committedPayload;
  await commitMtoThenCreateDrawings({
    importPayload: { batch: { id: 'BATCH-PLAN' }, items: plan.itemsToImport, itemsToSupersede: plan.itemsToSupersede },
    items: plan.itemsToImport,
    projectId: 'PROJECT-1',
    saveImport: async (payload) => {
      committedPayload = payload;
      return { batch: payload.batch, items: payload.items, itemsToSupersede: payload.itemsToSupersede };
    },
    createDrawings: async () => [],
  });
  assert.deepEqual(committedPayload.items.map(({ id }) => id), ['SAFE']);
  assert.deepEqual(committedPayload.itemsToSupersede, ['OLD-SAFE']);
});
