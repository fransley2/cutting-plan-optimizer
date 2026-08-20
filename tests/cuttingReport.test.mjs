import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCuttingSheetReportBody } from '../src/reports/cuttingReport.js';

function piece(mark, pos, length, dwgNumber) {
  return {
    id: `${mark}-${pos}`,
    mark,
    pos,
    length,
    material: 'DNV25Cr',
    priority: 1,
    dwgNumber,
  };
}

test('builds one operational cutting-sheet page per bar without UI placeholders', () => {
  const solution = {
    kerf: 5,
    minOffcut: 500,
    stockUsed: [
      {
        po: '1520813',
        poItem: '42',
        description: 'C.R.A. seamless pipe <25Cr>',
        materialGrade: 'DNV25Cr',
        heatNo: '62513',
        traceability: 'GTR1520813-42-001',
        originalLength: 4400,
        remaining: 2657,
        leftTrim: 0,
        rightTrim: 0,
        pieces: [piece('AS01JU01 (SPOOL A)', '1A', 1743, '263221-SGU-JU-PI-DA-001')],
      },
      {
        po: '1520813',
        poItem: '42',
        description: 'C.R.A. seamless pipe',
        materialGrade: 'DNV25Cr',
        heatNo: '62513',
        traceability: 'GTR1520813-42-002',
        originalLength: 6100,
        remaining: 253,
        leftTrim: 0,
        rightTrim: 0,
        pieces: [
          piece('AS04JU01 (SPOOL D)', '1D', 5179, '263221-SGU-JU-PI-DA-002'),
          piece('AS02JU01 (SPOOL B)', '2B', 663, '263221-SGU-JU-PI-DA-001'),
        ],
      },
    ],
  };

  const html = buildCuttingSheetReportBody({
    solution,
    projectData: {
      project: 'GRANMORGU_B58',
      client: 'TOTAL ENERGIES',
      equipment: '-',
      workpack: 'Selecione um Workpack',
      cuttingSheetNumber: 'B58_FAB_CS-003',
    },
    settings: { kerf: 5, minOffcut: 500 },
    reportOptions: { includeSignatures: true },
  });

  assert.equal((html.match(/class="cutting-sheet-page"/g) || []).length, 2);
  assert.doesNotMatch(html, /Selecione um Workpack/);
  assert.match(html, /B58_FAB_CS-003/);
  assert.match(html, /PO <strong>1520813<\/strong> · Item <strong>42<\/strong>/);
  assert.match(html, /GTR1520813-42-002/);
  assert.match(html, /class="cutting-sheet-report report-monochrome report-ink"/);
  assert.match(html, /title="#1 \/ AS04JU01 \(SPOOL D\) \/ 1D \/ 5179 mm"/);
  assert.match(html, /class="report-segment-sequence">#2<\/b>/);
  assert.match(html, /class="report-segment-measure">663 mm<\/strong>/);
  assert.doesNotMatch(html, /<th>Cor<\/th>/);
  assert.match(html, /C\.R\.A\. seamless pipe &lt;25Cr&gt;/);
  assert.equal((html.match(/Responsável pela emissão/g) || []).length, 1);
  assert.match(html, /Barra 02\/02/);
});

test('supports grayscale and legacy color options without losing the cut labels', () => {
  const solution = {
    kerf: 3,
    stockUsed: [{
      originalLength: 1000,
      remaining: 200,
      leftTrim: 0,
      rightTrim: 0,
      pieces: [piece('MK-01', 'P1', 800, 'DWG-01')],
    }],
  };

  const grayscale = buildCuttingSheetReportBody({ solution, reportOptions: { colorMode: 'grayscale' } });
  assert.match(grayscale, /report-monochrome report-grayscale/);
  assert.match(grayscale, /POS P1/);

  const legacyColor = buildCuttingSheetReportBody({ solution, reportOptions: { useColors: true } });
  assert.doesNotMatch(legacyColor, /report-monochrome/);
  assert.match(legacyColor, /<th>Cor<\/th>/);
});
