import assert from 'node:assert/strict';
import test from 'node:test';

import { selectMtoImportFile } from '../src/ui/mtoPage.js';

test('requires an active project before opening the MTO import wizard', async () => {
  const notifications = [];
  let opened = false;
  const file = await selectMtoImportFile({
    openWizard: async () => { opened = true; return { name: 'mto.xlsx' }; },
    notify: (...args) => notifications.push(args),
  });

  assert.equal(file, null);
  assert.equal(opened, false);
  assert.deepEqual(notifications, [['Selecione um projeto ativo antes de importar a MTO.', 'error']]);
});

test('passes the active project to the wizard and returns its import selection', async () => {
  const selected = {
    file: { name: 'mto.xlsx', size: 1024 },
    sheetName: 'MTO',
    headerRowIndex: 2,
  };
  let receivedOptions;
  const file = await selectMtoImportFile({
    projectId: 'PROJECT-1',
    projectName: 'PRJ-01',
    openWizard: async (options) => { receivedOptions = options; return selected; },
  });

  assert.equal(file, selected);
  assert.deepEqual(receivedOptions, { projectId: 'PROJECT-1', projectName: 'PRJ-01' });
});

test('returns null without side effects when the wizard is cancelled', async () => {
  const notifications = [];
  const file = await selectMtoImportFile({
    projectId: 'PROJECT-1',
    openWizard: async () => null,
    notify: (...args) => notifications.push(args),
  });

  assert.equal(file, null);
  assert.deepEqual(notifications, []);
});
