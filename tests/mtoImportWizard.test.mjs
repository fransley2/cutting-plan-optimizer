import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MTO_IMPORT_MAX_FILE_SIZE_BYTES,
  buildMtoImportMappingState,
  buildMtoImportConfirmationSummary,
  createMtoImportSheetState,
  mtoImportFileExtension,
  prepareMtoImportReview,
  selectMtoImportSheet,
  setMtoImportHeaderRow,
  transitionMtoImportConfirmation,
  validateMtoImportFile,
} from '../src/ui/mtoImportWizard.js';

function file(name, size) {
  return { name, size };
}

test('extracts a case-insensitive MTO import extension', () => {
  assert.equal(mtoImportFileExtension('MTO.REV.02.XLSX'), '.xlsx');
  assert.equal(mtoImportFileExtension('mto.csv'), '.csv');
  assert.equal(mtoImportFileExtension('without-extension'), '');
});

test('accepts non-empty xlsx, xls, and csv files within the size limit', () => {
  for (const extension of ['xlsx', 'xls', 'csv']) {
    const result = validateMtoImportFile(file(`mto.${extension}`, 1024));
    assert.equal(result.valid, true, `${extension} should be accepted`);
    assert.deepEqual(result.errors, []);
  }
});

test('requires a file', () => {
  const result = validateMtoImportFile(null);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(({ code }) => code), ['FILE_REQUIRED']);
});

test('rejects an unsupported extension', () => {
  const result = validateMtoImportFile(file('mto.txt', 1024));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(({ code }) => code === 'FILE_EXTENSION_INVALID'));
});

test('rejects an empty file without treating a valid extension as invalid', () => {
  const result = validateMtoImportFile(file('mto.csv', 0));
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(({ code }) => code), ['FILE_EMPTY']);
});

test('rejects a file larger than the documented 25 MiB limit', () => {
  const result = validateMtoImportFile(file('mto.xlsx', MTO_IMPORT_MAX_FILE_SIZE_BYTES + 1));
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(({ code }) => code), ['FILE_TOO_LARGE']);
});

test('supports a smaller injected limit without changing the default', () => {
  const result = validateMtoImportFile(file('mto.xls', 2048), { maxSizeBytes: 1024 });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'FILE_TOO_LARGE');
  assert.equal(MTO_IMPORT_MAX_FILE_SIZE_BYTES, 25 * 1024 * 1024);
});

test('starts Step 2 with the first sheet and header row 1 mapped to index 0', () => {
  assert.deepEqual(createMtoImportSheetState(['Cover', 'MTO']), {
    sheetNames: ['Cover', 'MTO'],
    selectedSheetName: 'Cover',
    headerRowInput: '1',
    headerRowIndex: 0,
  });
});

test('selects only a worksheet present in the Step 2 state', () => {
  const initial = createMtoImportSheetState(['Cover', 'MTO']);
  assert.equal(selectMtoImportSheet(initial, 'MTO').selectedSheetName, 'MTO');
  assert.equal(selectMtoImportSheet(initial, 'Unknown'), initial);
});

test('converts the displayed 1-based header row to a zero-based index', () => {
  const initial = createMtoImportSheetState(['MTO']);
  assert.deepEqual(setMtoImportHeaderRow(initial, '3'), {
    ...initial,
    headerRowInput: '3',
    headerRowIndex: 2,
  });
  assert.equal(setMtoImportHeaderRow(initial, '0').headerRowIndex, null);
  assert.equal(setMtoImportHeaderRow(initial, '1.5').headerRowIndex, null);
});

test('builds Step 2 autocorrection from the selected header row', () => {
  const result = buildMtoImportMappingState([
    ['Relatorio MTO'],
    ['Shop Drawing Name', 'SPOOL', 'Position', 'Qty', 'Material Description Detail', 'Lenght (mm)', 'IDENT (Mark for Gemapi)', 'Line Specification'],
  ], 1);
  assert.equal(result.columnMapping.drawing, 'Shop Drawing Name');
  assert.equal(result.columnMapping.mark, 'SPOOL');
  assert.equal(result.columnMapping.material, 'Line Specification');
  assert.equal(result.suggestions.find(({ field }) => field === 'material').confidence, 'review');
});

test('orchestrates parse, impact, decisions, and returns a ready effective plan', async () => {
  const calls = [];
  const file = { name: 'mto.xlsx' };
  const parsed = { items: [{ id: 'item-1' }], rejectedItems: [], batch: { rowCount: 1 } };
  const importPlan = { hasPendingDecisions: true, counts: {}, pendingDecisions: {} };
  const effectivePlan = {
    itemsToImport: [{ id: 'item-1' }],
    itemsToSupersede: ['old-1'],
    unresolvedDecisions: [],
    counts: { itemsToImport: 1 },
    canCommit: true,
    auditSummary: { decisions: [] },
  };

  const result = await prepareMtoImportReview({
    file,
    sheetName: 'MTO',
    headerRowIndex: 2,
    projectId: 'project-1',
    parseFile: async (receivedFile, options) => {
      calls.push(['parse', receivedFile, options]);
      return parsed;
    },
    prepareItems: async (items) => { calls.push(['prepare', items]); return items; },
    analyzeImpact: async (items, options) => { calls.push(['impact', items, options]); return { brandNew: items }; },
    buildImportPlan: (items, impact) => { calls.push(['build', items, impact]); return importPlan; },
    createDecisionState: () => [{ key: 'decision-1' }],
    applyDecisions: async (input) => { calls.push(['apply', input.decisions]); return effectivePlan; },
    openDecisionModal: async (plan, decisions, options) => {
      calls.push(['decision', plan, decisions]);
      const resolvedPlan = await options.applyDecisions(decisions);
      return { action: 'apply', decisions, effectivePlan: resolvedPlan };
    },
  });

  assert.deepEqual(calls.map(([name]) => name), ['parse', 'prepare', 'impact', 'build', 'decision', 'apply']);
  assert.deepEqual(calls[0][2], {
    projectId: 'project-1',
    metadata: { sourceFileName: 'mto.xlsx' },
    sheetName: 'MTO',
    headerRowIndex: 2,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.parsed, parsed);
  assert.equal(result.effectivePlan, effectivePlan);
  assert.equal(result.itemsToImport, effectivePlan.itemsToImport);
  assert.equal(result.itemsToSupersede, effectivePlan.itemsToSupersede);
  assert.equal(result.auditSummary, effectivePlan.auditSummary);
});

test('stops before impact when parsing returns rejected rows', async () => {
  let analyzed = false;
  const result = await prepareMtoImportReview({
    file: { name: 'invalid.xlsx' },
    parseFile: async () => ({
      items: [],
      batch: {},
      rejectedItems: [{ sourceRowNumber: 4, validationErrors: ['Missing material'] }],
    }),
    analyzeImpact: async () => { analyzed = true; },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(analyzed, false);
  assert.deepEqual(result.validationErrors, [{ rowNumber: 4, errors: ['Missing material'] }]);
});

test('turns cancellation from the decision modal into a cancelled wizard result', async () => {
  let applied = false;
  const result = await prepareMtoImportReview({
    file: { name: 'mto.xlsx' },
    parseFile: async () => ({ items: [{}], rejectedItems: [], batch: {} }),
    analyzeImpact: async () => ({}),
    buildImportPlan: () => ({ hasPendingDecisions: true }),
    createDecisionState: () => [{}],
    openDecisionModal: async () => ({ action: 'cancel', decisions: [] }),
    applyDecisions: async () => { applied = true; },
  });

  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(applied, false);
});

test('stops orchestration after an in-flight parse when the wizard was cancelled', async () => {
  let cancelled = false;
  let analyzed = false;
  const result = await prepareMtoImportReview({
    file: { name: 'mto.xlsx' },
    parseFile: async () => {
      cancelled = true;
      return { items: [{}], rejectedItems: [], batch: {} };
    },
    isCancelled: () => cancelled,
    analyzeImpact: async () => { analyzed = true; },
  });

  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(analyzed, false);
});

test('builds the Step 4 summary with the same import counts and revision details', () => {
  const summary = buildMtoImportConfirmationSummary({
    counts: {
      itemsToImport: 4,
      itemsToSupersede: 2,
      duplicates: 1,
      keptExisting: 3,
      unresolvedDecisions: 2,
      olderRevisions: 1,
      unknownRevisions: 1,
      sameRevisionChanged: 1,
      conflictingRowsInsideFile: 1,
    },
    pendingDecisions: {
      olderRevisions: [{
        newItem: { drawing: 'D-1', mark: 'M-1', pos: '10', revision: 'A' },
        existingItem: { revision: 'B' },
      }],
    },
  });

  assert.deepEqual(summary.lines, [
    '4 linha(s) segura(s) serao importadas',
    '2 item(ns) serao superseded',
    '1 duplicado(s) identico(s) serao ignorados',
    '3 item(ns) serao mantidos existentes',
    '2 item(ns) permanecem aguardando decisao',
  ]);
  assert.equal(summary.alerts.length, 4);
  assert.deepEqual(summary.olderRevisions, [{
    identity: 'D-1 | M-1 | 10',
    existingRevision: 'B',
    importedRevision: 'A',
  }]);
});

test('enters Step 4 and going back preserves the calculated plan', () => {
  const review = { effectivePlan: { itemsToImport: [{}] } };
  const confirmation = transitionMtoImportConfirmation({ currentStep: 2, review }, 'continue');
  const returned = transitionMtoImportConfirmation(confirmation, 'back');

  assert.equal(confirmation.currentStep, 3);
  assert.equal(returned.currentStep, 2);
  assert.equal(returned.review, review);
  assert.equal(returned.result, undefined);
});

test('confirmation releases the plan to the save caller while cancellation never saves', async () => {
  const review = { effectivePlan: { itemsToImport: [{ id: 'item-1' }] } };
  const saveCalls = [];
  const confirm = transitionMtoImportConfirmation({ currentStep: 3, review }, 'confirm');
  if (confirm.result) saveCalls.push(confirm.result);
  const cancel = transitionMtoImportConfirmation({ currentStep: 3, review }, 'cancel');
  if (cancel.result) saveCalls.push(cancel.result);

  assert.equal(confirm.result, review);
  assert.equal(cancel.result, null);
  assert.deepEqual(saveCalls, [review]);
});
