import assert from 'node:assert/strict';
import test from 'node:test';
import { poItemTechnicalPresentation } from '../src/core/poItemPresentation.js';

const bendDescription = `PROD/SPK/TAG:31-WJ-10-1010
JUMPER - DESIGN
DNV 25CR
OD:168,3MM, ID: 130,1MM, WT: 19,10MM, BEND WT: 15,47MM
BEND ANGLE: 90°
BEND RADIUS: 504,9M
TANGENT LENGTH: 0,5M
MR ITEM: 1`;

test('structures the long PO 1523734 bend specification without leaking raw text into the summary', () => {
  const presentation = poItemTechnicalPresentation({
    itemNumber: '1', itemType: 'BEND', materialGrade: 'DNV 25CR',
    diameterOdMm: 168.3, thicknessMm: 19.1, degree: 90, description: bendDescription,
  });

  assert.equal(presentation.tag, '31-WJ-10-1010');
  assert.equal(presentation.mrItem, '1');
  assert.equal(presentation.summary, 'JUMPER - DESIGN · DNV 25CR · D168,3 x 19,1');
  assert.equal(presentation.summary.includes('\n'), false);
  assert.deepEqual(presentation.details, [
    { label: 'OD', value: '168,3 mm' },
    { label: 'ID', value: '130,1 mm' },
    { label: 'WT', value: '19,1 mm' },
    { label: 'Bend WT', value: '15,47 mm' },
    { label: 'Bend angle', value: '90 °' },
    { label: 'Bend radius', value: '504,9 m' },
    { label: 'Tangent length', value: '0,5 m' },
    { label: 'MR item', value: '1' },
  ]);
});

test('omits bend-only fields when a mother-pipe description does not contain them', () => {
  const presentation = poItemTechnicalPresentation({
    itemNumber: '20', itemType: 'PROCESS PIPE', materialGrade: 'DNV 450 DSU',
    diameterOdMm: 273.1, thicknessMm: 33,
    description: `PROD/KBD/TAG:31-MP-20-0001
MOTHER PIPE - DESIGN
DNV 450 DSU
OD:273,1MM, ID:207,1MM, WT:33MM
MR ITEM: 20`,
  });

  assert.equal(presentation.summary, 'MOTHER PIPE - DESIGN · DNV 450 DSU · D273,1 x 33');
  assert.deepEqual(presentation.details.map(({ label }) => label), ['OD', 'ID', 'WT', 'MR item']);
});

test('keeps a 30-item long-spec PO searchable by item, TAG, MR item and material', () => {
  const presentations = Array.from({ length: 30 }, (_, index) => poItemTechnicalPresentation({
    itemNumber: String(index + 1), itemType: 'BEND', materialGrade: 'DNV 25CR',
    diameterOdMm: 168.3, thicknessMm: 19.1, degree: 90,
    description: bendDescription
      .replace('31-WJ-10-1010', `31-WJ-10-${String(index + 1).padStart(4, '0')}`)
      .replace('MR ITEM: 1', `MR ITEM: ${index + 1}`),
  }));

  assert.equal(presentations.length, 30);
  const target = presentations[24];
  ['25', '31-wj-10-0025', 'dnv 25cr'].forEach((query) => assert.match(target.searchText, new RegExp(query)));
  assert.equal(presentations.every(({ summary }) => !summary.includes('OD:') && !summary.includes('\n')), true);
});
