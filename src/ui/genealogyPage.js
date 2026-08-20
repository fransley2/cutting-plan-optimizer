import { exploreMaterialGenealogy } from '../core/genealogyExplorer.js';
import { searchOperationalRecords } from '../core/operationalReadiness.js';

const STAGE_LABELS = Object.freeze({
  0: 'Engineering',
  1: 'MTO demand',
  2: 'Procurement',
  3: 'Inventory',
  4: 'Issue & Workpack',
  5: 'Cutting',
  6: 'Fabrication output',
  7: 'Return Material',
  8: 'Returned stock',
});

const TYPE_LABELS = Object.freeze({
  EQUIPMENT: 'Equipment',
  DRAWING: 'Drawing',
  MTO: 'MTO',
  PO: 'Purchase Order',
  PO_ITEM: 'PO Item',
  INVENTORY: 'Inventory',
  RETURNED_INVENTORY: 'Returned Inventory',
  WORKPACK: 'Workpack',
  MATERIAL_COUPON: 'Material Coupon',
  CUTTING_SHEET: 'Cutting Sheet',
  CUT_PART: 'Cut Part',
  OFFCUT: 'Offcut',
  RMV: 'RMV',
});

function node(tag, className = '', value = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== '') element.textContent = String(value);
  return element;
}

function resultSelection(result) {
  return { type: result.type, entityId: result.entityId, title: result.title };
}

function openRecord(record, options) {
  if (!record) return;
  if (record.type === 'EQUIPMENT') {
    const tags = record.source?.equipmentTags || record.source?.tags || [];
    options.onOpenEquipment?.(record.id, tags[0] || record.source?.clientTag || '');
    return;
  }
  if (record.phase) options.onNavigate?.(record.phase, {
    type: TYPE_LABELS[record.type] || record.type,
    entityId: record.id,
    title: record.label,
    source: record.source,
  });
}

function relationForNode(exploration, record) {
  const outgoing = exploration.edges.filter((edge) => edge.from === record.key);
  const incoming = exploration.edges.filter((edge) => edge.to === record.key);
  return [...incoming, ...outgoing][0] || null;
}

function renderFlowNode(record, exploration, selectedKey, onSelect, options) {
  const button = node('button', `genealogy-flow-node${record.key === selectedKey ? ' active' : ''}`);
  button.type = 'button';
  const heading = node('span', 'genealogy-flow-node-heading');
  heading.append(
    node('span', 'genealogy-flow-type', TYPE_LABELS[record.type] || record.type),
    record.status ? node('span', 'genealogy-flow-status', record.status) : document.createTextNode(''),
  );
  const relation = relationForNode(exploration, record);
  const meta = node('span', 'genealogy-flow-meta');
  if (record.subtitle) meta.append(node('span', '', record.subtitle));
  if (relation) {
    const relationLabel = relation.inferred ? `${relation.relation} · automatic` : relation.relation;
    meta.append(node('span', relation.inferred ? 'genealogy-link-inferred' : '', relationLabel));
  }
  button.append(heading, node('strong', '', record.label), meta);
  button.addEventListener('click', () => onSelect({
    entityType: record.type,
    entityId: record.id,
    title: record.label,
  }));
  button.addEventListener('dblclick', () => openRecord(record, options));
  return button;
}

function renderRelatedList(title, records, emptyText, onSelect) {
  const section = node('section', 'genealogy-related-panel');
  section.append(node('h3', '', title));
  if (!records.length) {
    section.append(node('p', 'text-muted', emptyText));
    return section;
  }
  const list = node('div', 'genealogy-related-list');
  records.forEach((record) => {
    const button = node('button', 'genealogy-related-item');
    button.type = 'button';
    button.append(
      node('span', 'genealogy-result-type', TYPE_LABELS[record.type] || record.type),
      node('strong', '', record.label),
    );
    button.addEventListener('click', () => onSelect({ entityType: record.type, entityId: record.id, title: record.label }));
    list.append(button);
  });
  section.append(list);
  return section;
}

function renderHistory(records) {
  const section = node('section', 'genealogy-history');
  section.append(node('h3', '', 'Full history'));
  if (!records.length) {
    section.append(node('p', 'text-muted', 'No stock movement or audit event is linked to this material chain yet.'));
    return section;
  }
  const list = node('ol', 'genealogy-history-list');
  records.forEach((record) => {
    const item = node('li', 'genealogy-history-item');
    const date = record.timestamp ? new Date(record.timestamp) : null;
    const formatted = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      : record.timestamp || 'No date';
    const copy = node('span');
    copy.append(node('strong', '', record.type), node('small', 'text-muted', record.title || record.reference));
    item.append(node('time', '', formatted), copy, node('span', 'genealogy-history-reference', record.reference));
    list.append(item);
  });
  section.append(list);
  return section;
}

function renderExplorer(container, data, selection, options) {
  const exploration = exploreMaterialGenealogy(data, selection);
  container.replaceChildren();
  if (!exploration.anchor) {
    container.append(node('p', 'genealogy-search-empty text-muted', exploration.warnings[0] || 'Nenhuma genealogia disponível para este registro.'));
    return;
  }

  const header = node('header', 'genealogy-explorer-header');
  const copy = node('div');
  copy.append(
    node('p', 'eyebrow', TYPE_LABELS[exploration.anchor.type] || exploration.anchor.type),
    node('h2', '', exploration.anchor.label),
    node('p', 'text-muted', exploration.anchor.subtitle || 'Physical material genealogy'),
  );
  const openButton = node('button', 'secondary-button');
  openButton.type = 'button';
  openButton.append(
    node('span', 'material-symbols-outlined', 'open_in_new'),
    node('span', '', exploration.anchor.type === 'EQUIPMENT' ? 'Open equipment' : 'Open module'),
  );
  openButton.addEventListener('click', () => openRecord(exploration.anchor, options));
  header.append(copy, openButton);

  const summary = node('div', 'genealogy-summary-strip');
  [
    ['Related records', exploration.nodes.length],
    ['Explicit links', exploration.edges.filter((edge) => !edge.inferred).length],
    ['IDENT CODE matches', exploration.edges.filter((edge) => edge.inferred).length],
    ['Where used', exploration.whereUsed.length],
  ].forEach(([label, value]) => {
    const item = node('span');
    item.append(node('strong', '', value), document.createTextNode(` ${label}`));
    summary.append(item);
  });

  const flow = node('section', 'genealogy-flow');
  flow.append(node('h3', '', 'Material flow'));
  const track = node('div', 'genealogy-flow-track');
  exploration.groups.forEach((group, index) => {
    const stage = node('section', 'genealogy-flow-stage');
    stage.append(node('h4', '', STAGE_LABELS[group.stage] || 'Related records'));
    const records = node('div', 'genealogy-flow-stage-records');
    group.nodes.forEach((record) => records.append(renderFlowNode(
      record,
      exploration,
      exploration.anchor.key,
      (next) => renderExplorer(container, data, next, options),
      options,
    )));
    stage.append(records);
    track.append(stage);
    if (index < exploration.groups.length - 1) track.append(node('span', 'material-symbols-outlined genealogy-flow-arrow', 'arrow_forward'));
  });
  flow.append(track);

  const related = node('div', 'genealogy-related-grid');
  related.append(
    renderRelatedList('Source / upstream', exploration.upstream, 'No direct upstream record found.', (next) => renderExplorer(container, data, next, options)),
    renderRelatedList('Where used?', exploration.whereUsed, 'No direct downstream use found.', (next) => renderExplorer(container, data, next, options)),
  );

  const note = node('p', 'genealogy-method-note');
  note.append(
    node('span', 'material-symbols-outlined', 'verified'),
    document.createTextNode(' Solid links come from persisted document references. “Automatic” links are MTO ↔ PO candidates matched by IDENT CODE.'),
  );
  container.append(header, summary, flow, related, renderHistory(exploration.history), note);
}

function renderResults(container, explorer, data, query, options) {
  const results = searchOperationalRecords(data, query, 50);
  container.replaceChildren();
  explorer.replaceChildren(node('p', 'genealogy-search-empty text-muted', 'Select a record to inspect its complete material flow and Where Used relationships.'));
  if (query.trim().length < 2) {
    container.append(node('p', 'genealogy-search-empty text-muted', 'Digite ao menos dois caracteres para pesquisar toda a cadeia do material.'));
    return;
  }
  if (!results.length) {
    container.append(node('p', 'genealogy-search-empty text-muted', 'Nenhum vínculo encontrado nas bases atuais.'));
    return;
  }
  container.append(node('p', 'text-muted', `${results.length} registro(s) rastreável(is) encontrado(s).`));
  const list = node('div', 'genealogy-result-list');
  results.forEach((result) => {
    const button = node('button', 'genealogy-result-card');
    button.type = 'button';
    const copy = node('span', 'genealogy-result-copy');
    copy.append(node('strong', '', result.title), node('small', 'text-muted', result.subtitle || result.entityId));
    button.append(node('span', 'genealogy-result-type', result.type), copy, node('span', 'material-symbols-outlined', 'account_tree'));
    button.addEventListener('click', () => {
      [...list.querySelectorAll('.genealogy-result-card.active')].forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderExplorer(explorer, data, resultSelection(result), options);
    });
    list.append(button);
  });
  container.append(list);
}

export async function renderGenealogyPage(container, options = {}) {
  container.replaceChildren(node('p', 'text-muted', 'Carregando relações de rastreabilidade...'));
  try {
    const data = await options.loadData?.() || {};
    const page = node('div', 'genealogy-page');
    const header = node('header', 'genealogy-header');
    header.append(
      node('p', 'eyebrow', 'Material Genealogy'),
      node('h1', '', 'Traceability Search'),
      node('p', 'text-muted', 'Pesquise TAG, IDENT CODE, Traceability, Heat, PO, MTO, Workpack, Coupon, Cutting Sheet ou RMV e acompanhe o fluxo físico do material.'),
    );
    const field = node('label', 'genealogy-search-field');
    field.append(node('span', 'material-symbols-outlined', 'manage_search'));
    const input = node('input');
    input.type = 'search';
    input.placeholder = 'Search anything';
    input.setAttribute('aria-label', 'Traceability Search');
    field.append(input);
    const workspace = node('div', 'genealogy-workspace');
    const results = node('section', 'genealogy-results');
    const explorer = node('section', 'genealogy-explorer');
    workspace.append(results, explorer);
    input.addEventListener('input', () => renderResults(results, explorer, data, input.value, options));
    page.append(header, field, workspace);
    container.replaceChildren(page);
    renderResults(results, explorer, data, '', options);
    input.focus();
  } catch (error) {
    console.error(error);
    container.replaceChildren(node('p', 'text-muted', 'Não foi possível carregar a pesquisa genealógica.'));
  }
}
