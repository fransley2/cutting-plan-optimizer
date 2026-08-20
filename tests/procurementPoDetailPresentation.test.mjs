import assert from 'node:assert/strict';
import test from 'node:test';
import { poItemTechnicalPresentation } from '../src/core/poItemPresentation.js';
import { poItemPendingPresentation } from '../src/ui/procurementPage.js';

test('PO detail parser structures a long bend description without exposing the raw block', () => {
  const presentation = poItemTechnicalPresentation({
    itemNumber: '7',
    description: `PROD/SPK/TAG 31-WJ-10-1020
JUMPER - DESIGN
DNV 25CR
OD: 168,3MM, ID: 130,1MM, WT: 19,10MM, BEND WT: 15,47MM
BEND ANGLE: 90°
BEND RADIUS: 504,9M
TANGENT LENGTH: 0,5M
MR ITEM: 7`,
  });
  assert.equal(presentation.tag, '31-WJ-10-1020');
  assert.equal(presentation.type, 'JUMPER - DESIGN');
  assert.equal(presentation.material, 'DNV 25CR');
  assert.equal(presentation.dimensions, '168,3 x 19,1');
  assert.deepEqual(presentation.details.map((field) => field.label), [
    'OD', 'ID', 'WT', 'Bend WT', 'Bend angle', 'Bend radius', 'Tangent length', 'MR item',
  ]);
  assert.ok(!presentation.summary.includes('BEND ANGLE'));
});

test('PO detail parser omits bend fields for mother pipe items', () => {
  const presentation = poItemTechnicalPresentation({
    description: `MOTHER PIPE - WELDING & ND LAB
DNV 25CR
OD: 168,3MM, ID: 130,1MM, WT: 19,10MM
MR ITEM: 20`,
  });
  const labels = presentation.details.map((field) => field.label);
  assert.equal(presentation.type, 'MOTHER PIPE - WELDING & ND LAB');
  assert.ok(!labels.includes('Bend WT'));
  assert.ok(!labels.includes('Bend angle'));
  assert.ok(!labels.includes('Bend radius'));
  assert.ok(!labels.includes('Tangent length'));
  assert.ok(labels.includes('MR item'));
});

test('PO pending badge reuses calculated pending quantity and ETA', () => {
  assert.deepEqual(poItemPendingPresentation({ pending: 0, received: 8, ordered: 8 }, {}), {
    status: 'received', pending: 0, etaDate: '', label: 'Recebido',
  });
  assert.deepEqual(poItemPendingPresentation({ pending: 3 }, {}), {
    status: 'no-eta', pending: 3, etaDate: '', label: 'Sem ETA',
  });
  assert.deepEqual(poItemPendingPresentation({ pending: 3 }, { nextCtcoDate: '2026-09-10' }), {
    status: 'eta', pending: 3, etaDate: '2026-09-10', label: 'ETA',
  });
});
