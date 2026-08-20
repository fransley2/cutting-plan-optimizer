import assert from 'node:assert/strict';
import test from 'node:test';

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.children = [];
    this.textContent = '';
    this.style = {};
    this.attributes = {};
  }

  append(...children) { this.children.push(...children); }
  addEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
}

globalThis.document = { createElement: (tagName) => new ElementStub(tagName) };

const { executiveEquipmentKpis, renderEquipmentReadinessProjects, renderMaterialBottlenecks, renderMaterialDeliveryTimeline, renderMaterialUtilizationSummary, renderOperationalFlow, renderPoItemStatusBreakdown } = await import('../src/ui/reportsUI.js');

function descendants(element) {
  return [element, ...element.children.flatMap((child) => descendants(child))];
}

test('renders every equipment inside its project card without top-N truncation', () => {
  const equipmentRows = Array.from({ length: 12 }, (_, index) => ({
    tag: `TAG-${index + 1}`,
    equipmentName: `Equipment ${index + 1}`,
    availability: index === 0 ? 1 : 0.5,
    status: index === 0 ? 'READY' : index === 1 ? 'BLOCKED' : 'PARTIAL',
    criticalItems: index === 1 ? 2 : 0,
    demandItems: 3,
  }));
  const groups = [{ projectId: 'P1', projectName: 'Project Alpha', totalEquipments: 12, criticalEquipments: 1, equipmentRows }];
  const rendered = renderEquipmentReadinessProjects(groups);
  const all = descendants(rendered);

  assert.equal(all.filter((element) => element.className.includes('reports-equipment-row ')).length, 12);
  assert.ok(all.some((element) => element.textContent === 'Project Alpha'));
  assert.ok(all.some((element) => element.textContent === 'TAG-12'));
  assert.deepEqual(executiveEquipmentKpis(groups).map((kpi) => kpi.value), ['1 / 12', 1]);
});

test('renders material utilization indicators with aparas terminology', () => {
  const rendered = renderMaterialUtilizationSummary({
    consumedQty: 10, consumedWeightKg: 100,
    reservedQty: 3, reservedWeightKg: 30,
    stockQty: 7, stockWeightKg: 70,
    returnedQty: 2, returnedLengthMm: 1500, returnedWeightKg: 15,
    nestingUtilization: 0.82, trimQty: 4, trimLengthMm: 120,
  });
  const texts = descendants(rendered).map((element) => element.textContent);
  assert.ok(texts.includes('Aproveitamento de nesting'));
  assert.ok(texts.includes('Aparas'));
  assert.ok(texts.includes('82%'));
  assert.equal(descendants(rendered).filter((element) => element.className.includes('reports-utilization-card')).length, 6);
});

test('renders the complete PPC operational flow without chart dependencies', () => {
  const rendered = renderOperationalFlow([
    { key: 'PLANNED', label: 'Planejados', value: 4 },
    { key: 'BLOCKED', label: 'Bloqueados', value: 2 },
    { key: 'READY', label: 'Prontos', value: 3 },
  ]);
  const all = descendants(rendered);
  assert.equal(all.filter((element) => element.className.includes('reports-flow-card')).length, 3);
  assert.ok(all.some((element) => element.textContent === 'Bloqueados'));
  assert.ok(all.some((element) => element.textContent === '3'));
});

test('renders PO overdue counts inside their nominal status bucket', () => {
  const rendered = renderPoItemStatusBreakdown({
    totalItems: 6,
    buckets: [
      { key: 'RECEIVED_BUCKET', count: 2, percentage: 2 / 6, overdueCount: 0 },
      { key: 'IN_TRANSIT_BUCKET', count: 1, percentage: 1 / 6, overdueCount: 0 },
      { key: 'IN_PRODUCTION_BUCKET', count: 3, percentage: 3 / 6, overdueCount: 2 },
    ],
  });
  const texts = descendants(rendered).map((element) => element.textContent);
  assert.ok(texts.includes('Em produção'));
  assert.ok(texts.includes('2 atrasado(s) neste status'));
  assert.equal(descendants(rendered).filter((element) => element.className.includes('reports-po-status-card')).length, 3);
});

test('renders every material delivery period in chronological input order', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    label: `Mês ${index + 1}`,
    expectedQty: index + 1,
    receivedQty: index,
    expectedWeightKg: null,
    receivedWeightKg: null,
    expectedQuantitiesByUnit: [{ unit: 'EA', value: index + 1 }],
    receivedQuantitiesByUnit: [{ unit: 'EA', value: index }],
  }));
  const rendered = renderMaterialDeliveryTimeline(rows, 'month');
  const all = descendants(rendered);
  assert.ok(all.some((element) => element.textContent === 'Mês 12'));
  assert.equal(all.filter((element) => element.tagName === 'TR').length, 13);
});

test('renders critical equipment and makes multi-equipment bottlenecks explicit', () => {
  const rendered = renderMaterialBottlenecks({
    criticalEquipmentRows: [{
      tag: 'TAG-A', equipmentName: 'Pump A', availability: 0.25, nextDeliveryDate: '2026-09-10',
      materials: [{ identCode: 'ID-01', shortageQty: 4, poLinked: false, poItems: [] }],
    }],
    bottlenecks: [{
      identCode: 'ID-01', poLinked: true, poItem: { linked: true, poNumber: '450001', itemNumber: '10' },
      equipmentCount: 2, tags: ['TAG-A', 'TAG-B'],
    }],
  });
  const texts = descendants(rendered).map((element) => element.textContent);
  assert.ok(texts.includes('Sem PO vinculada'));
  assert.ok(texts.includes('Bloqueia 2 equipamento(s)'));
  assert.ok(texts.includes('TAG-A, TAG-B'));
});
