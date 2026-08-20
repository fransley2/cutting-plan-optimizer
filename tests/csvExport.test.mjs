import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCsv, csvCell } from '../src/data/csvExport.js';

function legacyCsv(rows, columns) {
  const legacyCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    columns.map(legacyCell).join(','),
    ...rows.map((row) => columns.map((key) => legacyCell(row[key])).join(',')),
  ].join('\r\n');
}

test('escapes cells exactly like the previous Audit and Data Quality implementations', () => {
  assert.equal(csvCell('A "quoted", value'), '"A ""quoted"", value"');
  assert.equal(csvCell(null), '""');
});

test('preserves the exact Audit CSV content format', () => {
  const columns = ['timestamp', 'kind', 'action', 'projectId', 'entityType', 'entityId', 'inventoryItemId', 'sourceDocumentType', 'sourceDocumentId', 'previousStatus', 'nextStatus', 'userName', 'reason'];
  const rows = [{ timestamp: '2026-08-01T12:00:00Z', kind: 'AUDIT', action: 'UPDATED', projectId: 'P-1', reason: 'Value, with "quotes"' }];
  assert.equal(buildCsv(rows, columns), legacyCsv(rows, columns));
});

test('preserves the exact Data Quality CSV content format', () => {
  const columns = ['domain', 'issueType', 'storeName', 'recordId', 'recordLabel', 'referenceField', 'reference', 'targetType', 'suggestedReferenceId', 'detail'];
  const rows = [{ domain: 'PROJECT', issueType: 'BROKEN_REFERENCE', storeName: 'cuttingSheets', recordId: 'CS-1', detail: 'Line 1\nLine 2' }];
  assert.equal(buildCsv(rows, columns), legacyCsv(rows, columns));
});
