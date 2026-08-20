import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReportsPresentationHtml } from '../src/ui/reportsExport.js';

test('builds escaped A4 presentation pages with ratio percentages and chart images', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ item: `Item ${index + 1}`, description: index === 0 ? '<script>alert(1)</script>' : 'Material' }));
  const html = buildReportsPresentationHtml({
    title: 'Material Availability',
    question: 'O que eu consigo fabricar hoje?',
    kpis: [
      { key: 'coverage', label: 'Cobertura', value: 0.4, unit: '%', format: 'percent' },
      { key: 'complete', label: 'Completo', value: 1, unit: '%', format: 'percent' },
    ],
    tables: [{ title: 'Faltas', columns: [{ key: 'item', label: 'Item' }, { key: 'description', label: 'Descrição' }], rows }],
  }, {
    projectName: 'B58 <Projeto>',
    equipmentTag: 'P-101 <A>',
    generatedAt: '2026-07-22T12:00:00Z',
    chartImages: [{ title: 'Gauge', dataUrl: 'data:image/png;base64,AA==' }],
  });

  assert.match(html, /@page \{ size: A4 landscape; margin: 8mm; \}/);
  assert.match(html, /width: 281mm; height: 194mm/);
  assert.match(html, /calc\(9mm \* var\(--reports-scale\)\)/);
  assert.match(html, />40%<\/strong>/);
  assert.match(html, />100%<\/strong>/);
  assert.match(html, /data:image\/png;base64,AA==/);
  assert.match(html, /B58 &lt;Projeto&gt;/);
  assert.match(html, /<dt>TAG do equipamento<\/dt><dd>P-101 &lt;A&gt;<\/dd>/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal((html.match(/<section class="reports-page/g) || []).length, 4, 'one dashboard page plus three 12-row table pages');
});

test('renders the Reports presentation in the explicitly selected English language', () => {
  const html = buildReportsPresentationHtml({
    title: 'Recebimento',
    question: 'Quanto material já chegou?',
    tables: [{
      title: 'Status completo dos itens de PO',
      columns: [
        { key: 'materialDescription', label: 'Descrição' },
        { key: 'completionStatus', label: 'Status', format: 'completionStatus' },
        { key: 'isOverdue', label: 'Prazo', format: 'overdueStatus' },
      ],
      rows: [{ materialDescription: 'PIPE', completionStatus: 'PARTIAL', isOverdue: true }],
    }],
  }, { language: 'en', projectName: 'B58', generatedAt: '2026-07-22T12:00:00Z' });

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h1>Receiving<\/h1>/);
  assert.match(html, /How much material has already arrived\?/);
  assert.match(html, /<dt>Project<\/dt><dd>B58<\/dd>/);
  assert.match(html, /Description/);
  assert.match(html, /Partial/);
  assert.match(html, /Overdue/);
});

test('renders separated material columns and localized PO statuses in presentation mode', () => {
  const html = buildReportsPresentationHtml({
    title: 'Recebimento',
    tables: [{
      title: 'Status de PO',
      columns: [
        { key: 'identCode', label: 'IDENT CODE' },
        { key: 'materialGrade', label: 'Material / Grade' },
        { key: 'materialDescription', label: 'Descrição' },
        { key: 'completionStatus', label: 'Status', format: 'completionStatus' },
        { key: 'isOverdue', label: 'Prazo', format: 'overdueStatus' },
      ],
      rows: [{ identCode: '', materialGrade: 'S32750', materialDescription: 'PIPE', completionStatus: 'PARTIAL', isOverdue: true }],
    }],
  }, { generatedAt: '2026-07-22T12:00:00Z' });

  assert.match(html, /IDENT CODE/);
  assert.match(html, /Material \/ Grade/);
  assert.match(html, /Descri(?:ç|&ccedil;)ão/);
  assert.match(html, /Parcial/);
  assert.match(html, /Atrasado/);
  assert.doesNotMatch(html, /S32750.*IDENT CODE/);
});
