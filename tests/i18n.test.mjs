import assert from 'node:assert/strict';
import {
  DEFAULT_LANGUAGE,
  getCurrentLanguage,
  normalizeLanguage,
  setLanguage,
  SUPPORTED_LANGUAGES,
  t,
} from '../src/i18n/index.js';

assert.equal(DEFAULT_LANGUAGE, 'pt-BR');
assert.deepEqual(SUPPORTED_LANGUAGES.map(({ code }) => code), ['pt-BR', 'en']);

assert.equal(normalizeLanguage('pt-br'), 'pt-BR');
assert.equal(normalizeLanguage('pt_BR'), 'pt-BR');
assert.equal(normalizeLanguage('en-US'), 'en');
assert.equal(normalizeLanguage('unsupported'), 'pt-BR');

assert.equal(setLanguage('en-US', { root: null }), 'en');
assert.equal(getCurrentLanguage(), 'en');
assert.equal(setLanguage('pt-BR', { root: null }), 'pt-BR');

assert.equal(t('Projects', {}, 'pt-BR'), 'Projetos');
assert.equal(t('Projetos', {}, 'en'), 'Projects');
assert.equal(t('Material Coupon', {}, 'pt-BR'), 'Material Coupon');
assert.equal(t('Folha de Corte', {}, 'en'), 'Cutting Sheet');
assert.equal(t('Sobras de Material', {}, 'en'), 'Material Offcuts');
assert.equal(t('Recebimento', {}, 'en'), 'Receiving');
assert.equal(t('Prazo', {}, 'en'), 'Deadline');
assert.equal(t('{count} record(s) in the selected scope.', { count: 12 }, 'pt-BR'), '12 registro(s) no escopo selecionado.');
assert.equal(t('Unregistered domain value', {}, 'pt-BR'), 'Unregistered domain value');

console.log('i18n tests passed');
