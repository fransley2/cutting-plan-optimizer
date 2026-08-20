import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compareRevisions } from '../src/data/mtoDB.js';
import { parseMtoCsvText, parseMtoRows } from '../src/data/mtoImport.js';

const fixtureUrl = (name) => new URL(`./fixtures/${name}`, import.meta.url);

async function readFixture(name) {
  const bytes = await readFile(fileURLToPath(fixtureUrl(name)));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.equal(text.includes('\uFFFD'), false, `${name} must remain valid UTF-8`);
  assert.equal(text.split(/\r?\n/, 1)[0].includes(';'), true, `${name} must use semicolon delimiters`);
  return text;
}

test('controlled decision fixtures parse as valid UTF-8 semicolon-separated MTO rows', async () => {
  const baseText = await readFixture('mto-decisions-base.csv');
  const conflictText = await readFixture('mto-decisions-conflicts.csv');
  const base = parseMtoRows(parseMtoCsvText(baseText));
  const conflicts = parseMtoRows(parseMtoCsvText(conflictText));

  assert.equal(base.items.length, 3);
  assert.equal(conflicts.items.length, 3);
  assert.equal(base.rejectedItems.length, 0);
  assert.equal(conflicts.rejectedItems.length, 0);
  assert.ok(base.items.some((item) => item.description.includes('Descrição')));
});

test('each conflict preserves the base drawing, mark, and POS business identity', async () => {
  const base = parseMtoRows(parseMtoCsvText(await readFixture('mto-decisions-base.csv'))).items;
  const conflicts = parseMtoRows(parseMtoCsvText(await readFixture('mto-decisions-conflicts.csv'))).items;
  const identity = (item) => [item.drawing, item.mark, item.pos].join('|');

  assert.deepEqual(conflicts.map(identity), base.map(identity));
  assert.equal(new Set(base.map(identity)).size, 3);
});

test('fixtures produce one same changed, one older, and one unknown revision scenario', async () => {
  const base = parseMtoRows(parseMtoCsvText(await readFixture('mto-decisions-base.csv'))).items;
  const conflicts = parseMtoRows(parseMtoCsvText(await readFixture('mto-decisions-conflicts.csv'))).items;
  const comparisons = conflicts.map((item, index) => compareRevisions(base[index].revision, item.revision));

  assert.deepEqual(comparisons, ['same', 'older', 'unknown']);
  assert.notDeepEqual(
    ['qty', 'cutLength', 'material', 'description'].map((field) => base[0][field]),
    ['qty', 'cutLength', 'material', 'description'].map((field) => conflicts[0][field]),
    'the same revision fixture must have changed content',
  );
  assert.deepEqual(
    ['qty', 'cutLength', 'material', 'description'].map((field) => base[1][field]),
    ['qty', 'cutLength', 'material', 'description'].map((field) => conflicts[1][field]),
    'the older fixture must differ only by revision',
  );
  assert.deepEqual(
    ['qty', 'cutLength', 'material', 'description'].map((field) => base[2][field]),
    ['qty', 'cutLength', 'material', 'description'].map((field) => conflicts[2][field]),
    'the unknown fixture must differ only by revision',
  );
});
