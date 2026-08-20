import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPhysicalPieceLabels, buildPhysicalPieceLabelsHtml, getPimacoLabelTemplate, PIMACO_LABEL_TEMPLATES } from '../src/reports/labels.js';

const solution = {
  stockUsed: [{
    traceability: 'TRACE-001', heatNo: 'HEAT-9', po: '450001', poItem: '10', materialGrade: 'A36',
    pieces: [
      { dwgNumber: 'DWG-01', mark: 'M-01', pos: 'P-1', material: 'A36', length: 1250 },
      { dwgNumber: 'DWG-01', mark: 'M-01', pos: 'P-2', material: 'A36', length: 900 },
    ],
  }],
};

test('builds one physical label for every allocated piece with parent stock traceability', () => {
  const documentData = buildPhysicalPieceLabels(solution, {
    project: 'PROJECT-1', equipment: 'EQUIPMENT-1', workpack: 'WP-1', cuttingSheetNumber: 'CS-1',
  }, { generatedAt: '2026-07-14T12:00:00.000Z' });

  assert.equal(documentData.labels.length, 2);
  assert.equal(documentData.summary.labelCount, 2);
  assert.equal(documentData.summary.barCount, 1);
  assert.equal(documentData.labels[0].traceability, 'TRACE-001');
  assert.equal(documentData.labels[0].heat, 'HEAT-9');
  assert.equal(documentData.labels[0].po, '450001');
  assert.equal(documentData.labels[0].poItem, '10');
  assert.equal(documentData.labels[0].cutLength, 1250);
  assert.equal(documentData.labels[1].id, '01-02');
});

test('recovers a legacy PO Item for physical labels', () => {
  const documentData = buildPhysicalPieceLabels({
    stockUsed: [{
      po: '1450848',
      traceability: 'GBE1450848-43-001',
      pieces: [{ mark: 'M-01', pos: 'P-1', length: 1000 }],
    }],
  });
  assert.equal(documentData.labels[0].po, '1450848');
  assert.equal(documentData.labels[0].poItem, '43');
  assert.match(buildPhysicalPieceLabelsHtml(documentData), /1450848 \/ 43/);
});

test('renders printable A4 Pimaco labels and escapes imported values', () => {
  const documentData = buildPhysicalPieceLabels({
    stockUsed: [{ traceability: '<TRACE>', pieces: [{ mark: '<script>', length: 500 }] }],
  }, { project: 'P & P' }, { generatedAt: '2026-07-14T12:00:00.000Z', templateId: 'a4-a4250' });
  const html = buildPhysicalPieceLabelsHtml(documentData);

  assert.match(html, /@page\{size:A4 portrait/);
  assert.match(html, /grid-template-columns:repeat\(2,99mm\)/);
  assert.match(html, /grid-template-rows:repeat\(5,55.8mm\)/);
  assert.match(html, /\.piece-label\{margin:1\.2mm/);
  assert.match(html, /class="piece-label piece-label-tight"/);
  assert.match(html, /\.piece-label-tight \.piece-label-primary strong\{font-size:12pt/);
  assert.match(html, /grid-template-rows:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(html, /P &amp; P/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('supports selectable A4 and Letter Pimaco templates with exact sheet capacity', () => {
  assert.ok(PIMACO_LABEL_TEMPLATES.some((template) => template.paper === 'A4'));
  assert.ok(PIMACO_LABEL_TEMPLATES.some((template) => template.paper === 'Letter'));
  const carta = getPimacoLabelTemplate('letter-6183');
  assert.equal(carta.columns * carta.rows, 10);
  assert.equal(carta.labelWidthMm, 101.6);
  assert.equal(carta.labelHeightMm, 50.8);
  const html = buildPhysicalPieceLabelsHtml(buildPhysicalPieceLabels(solution, {}, { templateId: carta.id }));
  assert.match(html, /@page\{size:Letter portrait/);
  assert.match(html, /padding:12.7mm 0 0 4mm/);
  assert.match(html, /column-gap:5.2mm/);
  const compactHtml = buildPhysicalPieceLabelsHtml(buildPhysicalPieceLabels(solution, {}, { templateId: 'a4-a4256' }));
  assert.match(compactHtml, /MARK \/ POS/);
  assert.match(compactHtml, /\.piece-label-compact\{margin:\.7mm/);
  assert.match(compactHtml, /\.piece-label-compact-main strong\{font-size:11\.5pt/);
  const tallHtml = buildPhysicalPieceLabelsHtml(buildPhysicalPieceLabels(solution, {}, { templateId: 'a4-a4365' }));
  assert.doesNotMatch(tallHtml, /class="piece-label piece-label-tight"/);
  assert.match(tallHtml, /\.piece-label-primary strong\{font-size:14pt/);
});

test('reports an empty allocation without generating labels', () => {
  const documentData = buildPhysicalPieceLabels({ stockUsed: [] });
  assert.equal(documentData.labels.length, 0);
  assert.equal(documentData.warnings.length, 1);
});
