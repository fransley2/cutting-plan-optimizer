import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultsWindowHtml, openResultsWindow } from '../src/ui/resultsWindow.js';

test('resultsWindow module is deprecated and does not open external results windows', () => {
  assert.equal(buildResultsWindowHtml(), '');
  assert.equal(openResultsWindow(), false);
});
