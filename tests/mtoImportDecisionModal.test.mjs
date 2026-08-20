import assert from 'node:assert/strict';
import test, { after } from 'node:test';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  values() {
    return this.owner.className.split(/\s+/).filter(Boolean);
  }

  contains(value) {
    return this.values().includes(value);
  }

  add(...values) {
    this.owner.className = [...new Set([...this.values(), ...values])].join(' ');
  }

  remove(...values) {
    const removed = new Set(values);
    this.owner.className = this.values().filter((value) => !removed.has(value)).join(' ');
  }

  toggle(value, force) {
    const present = this.contains(value);
    const enabled = force === undefined ? !present : Boolean(force);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.parentElement = null;
    this.childNodes = [];
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.listeners = new Map();
    this.id = '';
    this.value = '';
    this.type = '';
    this.selected = false;
    this.disabled = false;
    this._textContent = '';
  }

  get children() {
    return this.childNodes;
  }

  get lastElementChild() {
    return this.children.at(-1) || null;
  }

  get options() {
    return this.tagName === 'SELECT' ? this.children : undefined;
  }

  get textContent() {
    if (this.childNodes.length) return this.childNodes.map((child) => child.textContent).join('');
    return this._textContent;
  }

  set textContent(value) {
    this.replaceChildren();
    this._textContent = value == null ? '' : String(value);
  }

  set innerHTML(value) {
    this.replaceChildren();
    this._textContent = '';
    if (!value) return;
    if (String(value).includes('class="modal"')) this.append(buildModalSkeleton());
  }

  append(...nodes) {
    nodes.forEach((node) => {
      if (node == null) return;
      if (!(node instanceof FakeElement)) throw new TypeError('The fake DOM accepts element nodes only.');
      node.parentElement = this;
      this.childNodes.push(node);
    });
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.childNodes.forEach((node) => { node.parentElement = null; });
    this.childNodes = [];
    this._textContent = '';
    this.append(...nodes);
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { configurable: true, value: this });
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName === selector.toUpperCase();
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function buildModalSkeleton() {
  const modal = new FakeElement('div');
  modal.className = 'modal';
  const header = new FakeElement('header');
  header.className = 'modal-header';
  const title = new FakeElement('h3');
  title.id = 'modal-title';
  const close = new FakeElement('button');
  close.className = 'modal-close';
  close.setAttribute('aria-label', 'Fechar');
  const body = new FakeElement('div');
  body.id = 'modal-body';
  const footer = new FakeElement('footer');
  footer.id = 'modal-footer';
  header.append(title, close);
  modal.append(header, body, footer);
  return modal;
}

const document = {
  body: new FakeElement('body'),
  createElement: (tagName) => new FakeElement(tagName),
};

globalThis.document = document;

const {
  MTO_IMPORT_DECISION,
  canConsolidateMtoConflict,
} = await import('../src/data/mtoImportDecisions.js');
const {
  createMtoImportDecisionReview,
  openMtoImportDecisionModal,
} = await import('../src/ui/mtoImportDecisionModal.js');

after(() => {
  delete globalThis.document;
});

function entry(category, suffix, revision = 'A') {
  return {
    newItem: {
      id: `NEW-${suffix}`,
      drawing: `DWG-${suffix}`,
      mark: `MARK-${suffix}`,
      pos: suffix,
      revision,
      qty: 1,
      cutLength: 1000,
      material: 'A36',
      description: `Imported ${category}`,
    },
    existingItem: {
      id: `OLD-${suffix}`,
      drawing: `DWG-${suffix}`,
      mark: `MARK-${suffix}`,
      pos: suffix,
      revision: 'A',
      qty: 1,
      cutLength: 1000,
      material: 'A36',
      description: `Existing ${category}`,
    },
  };
}

function importPlan() {
  return {
    pendingDecisions: {
      sameRevisionChanged: [entry('sameRevisionChanged', 'SAME')],
      olderRevisions: [entry('olderRevisions', 'OLDER', '0')],
      unknownRevisions: [entry('unknownRevisions', 'UNKNOWN', '???')],
      conflictingRowsInsideFile: [entry('conflictingRowsInsideFile', 'CONFLICT', 'B')],
    },
  };
}

function button(label) {
  return document.body.querySelectorAll('button').find((candidate) => candidate.textContent === label);
}

function row(label) {
  return document.body.querySelectorAll('.mto-import-decision-row')
    .find((candidate) => candidate.textContent.includes(label));
}

function optionLabels(decisionRow) {
  return decisionRow.querySelector('select').options.map((option) => option.textContent);
}

test('renders the decision options allowed for each pending category', async () => {
  const resultPromise = openMtoImportDecisionModal(importPlan());

  assert.deepEqual(optionLabels(row('Mesma revisao alterada')), [
    'Deixar pendente',
    'Manter existente',
    'Corrigir como nova revisao',
  ]);
  assert.deepEqual(optionLabels(row('Revisao mais antiga')), [
    'Deixar pendente',
    'Manter existente',
  ]);
  assert.deepEqual(optionLabels(row('Revisao nao reconhecida')), [
    'Deixar pendente',
    'Manter existente',
    'Corrigir revisao',
  ]);
  assert.deepEqual(optionLabels(row('Linhas conflitantes no arquivo')), [
    'Deixar pendente',
    'Descartar repetidas e manter 1 linha',
  ]);

  button('Cancelar importacao').click();
  await resultPromise;
});

test('updates a decision and resolves the promise when applying', async () => {
  let appliedDecisions = null;
  const resultPromise = openMtoImportDecisionModal(importPlan(), null, {
    applyDecisions: async (decisions) => {
      appliedDecisions = decisions;
      return {
        itemsToImport: [{ id: 'SAFE' }],
        unresolvedDecisions: [],
        keptExisting: decisions.filter((decision) => decision.decision === MTO_IMPORT_DECISION.KEEP_EXISTING),
      };
    },
    getZeroOutcome: () => null,
  });
  const decisionSelect = row('Mesma revisao alterada').querySelector('select');
  decisionSelect.value = MTO_IMPORT_DECISION.KEEP_EXISTING;
  decisionSelect.dispatchEvent({ type: 'change', target: decisionSelect });

  button('Aplicar decisoes').click();
  const result = await resultPromise;

  assert.equal(result.action, 'apply');
  assert.equal(result.decisions[0].decision, MTO_IMPORT_DECISION.KEEP_EXISTING);
  assert.equal(appliedDecisions[0].decision, MTO_IMPORT_DECISION.KEEP_EXISTING);
  assert.deepEqual(result.effectivePlan.itemsToImport, [{ id: 'SAFE' }]);
});

test('cancels without applying or persisting a decision', async () => {
  let applyCalls = 0;
  const resultPromise = openMtoImportDecisionModal(importPlan(), null, {
    applyDecisions: async () => {
      applyCalls += 1;
      return { itemsToImport: [], unresolvedDecisions: [] };
    },
  });

  button('Cancelar importacao').click();
  const result = await resultPromise;

  assert.equal(result.action, 'cancel');
  assert.equal(applyCalls, 0);
  assert.ok(result.decisions.every((decision) => decision.decision === MTO_IMPORT_DECISION.UNRESOLVED));
});

test('groups repeated file conflicts and applies a bulk decision only to eligible rows', async () => {
  const plan = importPlan();
  plan.pendingDecisions.conflictingRowsInsideFile.push(entry('conflictingRowsInsideFile', 'CONFLICT', 'B'));
  const review = createMtoImportDecisionReview(plan);
  const conflictRows = review.element.querySelectorAll('.mto-import-decision-row')
    .filter((candidate) => candidate.textContent.includes('Linhas conflitantes no arquivo'));
  assert.equal(conflictRows.length, 1);
  assert.ok(conflictRows[0].textContent.includes('2 linhas'));
  assert.equal(canConsolidateMtoConflict(
    review.decisions.find(({ category }) => category === 'conflictingRowsInsideFile'),
  ), true);

  const keepBulk = review.element.querySelectorAll('button')
    .find((candidate) => candidate.textContent.startsWith('Manter existentes visiveis'));
  keepBulk.click();
  assert.ok(review.decisions
    .filter(({ category }) => category !== 'conflictingRowsInsideFile')
    .every(({ decision }) => decision === MTO_IMPORT_DECISION.KEEP_EXISTING));
  assert.ok(review.decisions
    .filter(({ category }) => category === 'conflictingRowsInsideFile')
    .every(({ decision }) => decision === MTO_IMPORT_DECISION.UNRESOLVED));
  const mergeBulk = review.element.querySelectorAll('button')
    .find((candidate) => candidate.textContent.startsWith('Somar duplicadas compativeis'));
  mergeBulk.click();
  assert.ok(review.decisions
    .filter(({ category }) => category === 'conflictingRowsInsideFile')
    .every(({ decision }) => decision === MTO_IMPORT_DECISION.MERGE_QUANTITIES));
  review.cancel();
  await review.result;
});
