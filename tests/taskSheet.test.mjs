import assert from 'node:assert/strict';
import { buildTaskSheetDraft, taskSheetWorkstationDefinition, validateTaskSheet } from '../src/core/taskSheet.js';
import { buildTaskSheetDocument } from '../src/documents/taskSheet.js';

const workpack = { id: 'WP-1', projectId: 'P-1', equipmentId: 'E-1', wpNo: 'B58-0016', title: 'JUMPER 7' };
const mtoItems = [
  { id: 'MTO-1', drawing: 'DWG-019', revision: '0', mark: 'AS01JU07', pos: '1A', description: 'TUBO D168,3 x 19,1', cutLength: 1743, weightKg: 122.48, tag: '32-WJ-10-2010', type: 'Pipe' },
  { id: 'MTO-2', drawing: 'DWG-019', revision: '0', mark: 'AS01JU07', pos: '2A', description: 'TUBO D168,3 x 19,1', cutLength: 5086, weightKg: 357.44, tag: '32-WJ-10-2010', type: 'Pipe' },
];
const cuttingSheets = [{
  id: 'CS-1', workpackId: 'WP-1', bars: [{ inventoryItemId: 'INV-1', pieces: [
    { id: 'P-1', mtoItemId: 'MTO-1', drawing: 'DWG-019', mark: 'AS01JU07', pos: '1A', cutLength: 1743 },
  ] }],
}];
const inventoryItems = [{ id: 'INV-1', traceability: 'GPP1520813-18-053' }];

const draft = buildTaskSheetDraft({
  workpack, mtoItems, cuttingSheets, inventoryItems,
  workstations: ['CUTTING', 'BEVELING', 'CLEANING'],
  plannedDates: { CUTTING: '2026-07-16', BEVELING: '2026-08-04', CLEANING: '2026-08-10' },
});

assert.equal(draft.number, 'B58-0016-TS-001');
assert.equal(draft.lines.filter((line) => line.workstation === 'CUTTING').length, 1, 'cutting must follow Cutting Sheet pieces when available');
assert.equal(draft.lines.filter((line) => line.workstation === 'BEVELING').length, 2, 'beveling must follow linked MTO scope');
assert.equal(draft.lines.find((line) => line.workstation === 'CUTTING').traceability, 'GPP1520813-18-053');
assert.equal(draft.lines.find((line) => line.workstation === 'CUTTING').plannedDate, '2026-07-16');
assert.equal(draft.lines.find((line) => line.workstation === 'BEVELING').durationHours, 4);
assert.equal(taskSheetWorkstationDefinition('CLEANING').hoursPerAction, 0.5);
assert.deepEqual(validateTaskSheet(draft), []);

const documentData = buildTaskSheetDocument(draft);
assert.equal(documentData.sections.length, 3);
assert.equal(documentData.summary.totalLines, 5);
assert.equal(documentData.sections[0].quantityLabel, 'Qtd. Cortes');
assert.equal(typeof documentData.sections[0].lines[0].lengthMm, 'number');

console.log('taskSheet tests passed');
