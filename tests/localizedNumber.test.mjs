import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLocalizedNumber } from '../src/core/utils.js';

const cases = [
  ['12,5', 12.5, 'pt-BR'],
  ['1.234,56', 1234.56, 'pt-BR'],
  ['1,234.56', 1234.56, 'en-US'],
  ['6000', 6000, 'plain'],
  ['6 000', 6000, 'plain'],
  ['6\u00A0000', 6000, 'plain'],
  ['6000 mm', 6000, 'plain'],
];

test('parses supported localized numeric formats without losing the raw value', () => {
  cases.forEach(([rawValue, parsedValue, detectedFormat]) => {
    assert.deepEqual(parseLocalizedNumber(rawValue), {
      rawValue,
      parsedValue,
      valid: true,
      detectedFormat,
    });
  });
});

test('returns null instead of zero for an unrecognized numeric value', () => {
  assert.deepEqual(parseLocalizedNumber('not-a-number'), {
    rawValue: 'not-a-number',
    parsedValue: null,
    valid: false,
    detectedFormat: 'unrecognized',
  });
});
