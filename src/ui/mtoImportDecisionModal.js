import { openModal, closeModal } from './modal.js';
import {
  MTO_IMPORT_DECISION,
  canConsolidateMtoConflict,
  createMtoImportDecisionState,
  describeMtoItemChanges,
} from '../data/mtoImportDecisions.js';

const CATEGORY_LABELS = Object.freeze({
  sameRevisionChanged: 'Mesma revisao alterada',
  olderRevisions: 'Revisao mais antiga',
  unknownRevisions: 'Revisao nao reconhecida',
  conflictingRowsInsideFile: 'Linhas conflitantes no arquivo',
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function decisionOptions(decision) {
  const { category } = decision;
  if (category === 'conflictingRowsInsideFile') {
    const items = decision.conflictingItems || [];
    const totalQty = items.reduce((total, item) => total + (Number(item?.qty) || 0), 0);
    return [
      { value: MTO_IMPORT_DECISION.UNRESOLVED, label: 'Deixar pendente' },
      ...(canConsolidateMtoConflict(decision)
        ? [{ value: MTO_IMPORT_DECISION.MERGE_QUANTITIES, label: `Somar quantidades (${totalQty})` }]
        : []),
      { value: MTO_IMPORT_DECISION.KEEP_FIRST, label: 'Descartar repetidas e manter 1 linha' },
    ];
  }
  const correction = category === 'sameRevisionChanged'
    ? [{ value: MTO_IMPORT_DECISION.IMPORT_AS_NEW_REVISION, label: 'Corrigir como nova revisao' }]
    : category === 'unknownRevisions'
      ? [{ value: MTO_IMPORT_DECISION.SET_REVISION, label: 'Corrigir revisao' }]
      : [];
  return [
    { value: MTO_IMPORT_DECISION.UNRESOLVED, label: 'Deixar pendente' },
    { value: MTO_IMPORT_DECISION.KEEP_EXISTING, label: 'Manter existente' },
    ...correction,
  ];
}

function isCorrection(decision) {
  return decision === MTO_IMPORT_DECISION.IMPORT_AS_NEW_REVISION
    || decision === MTO_IMPORT_DECISION.SET_REVISION;
}

function renderDecisionRow(decision, rerender, groupSize = 1) {
  const row = element('article', 'mto-import-decision-row');
  const identity = element('div', 'mto-import-decision-identity');
  identity.append(
    element('strong', null, decision.newItem?.drawing || '-'),
    element('span', null, `Mark: ${decision.newItem?.mark || '-'}`),
    element('span', null, `POS: ${decision.newItem?.pos || '-'}`),
    element('span', 'status-badge', CATEGORY_LABELS[decision.category]),
  );
  if (groupSize > 1) identity.append(element('span', 'status-badge', `${groupSize} linhas`));
  row.append(identity);
  if (decision.newItem?.description) row.append(element('small', 'text-muted', decision.newItem.description));

  const revisions = element('div', 'mto-import-decision-revisions');
  revisions.append(
    element('span', null, `Revisao existente: ${decision.existingItem?.revision || '-'}`),
    element('span', null, `Revisao importada: ${decision.newItem?.revision || '-'}`),
  );
  row.append(revisions);

  if (decision.category === 'sameRevisionChanged') {
    const changes = element('ul', 'mto-import-decision-changes');
    describeMtoItemChanges(decision.existingItem, decision.newItem).forEach((change) => {
      changes.append(element('li', null, `${change.label}: ${change.before || '-'} → ${change.after || '-'}`));
    });
    row.append(changes);
  }

  if (decision.category === 'conflictingRowsInsideFile') {
    const quantities = (decision.conflictingItems || []).map((item) => Number(item?.qty) || 0);
    row.append(element(
      'small',
      canConsolidateMtoConflict(decision) ? 'text-muted' : 'text-critical',
      canConsolidateMtoConflict(decision)
        ? `Quantidades encontradas: ${quantities.join(' + ')}. Os dados tecnicos das linhas sao iguais.`
        : 'Existem diferencas tecnicas entre as linhas. A soma automatica nao esta disponivel.',
    ));
  }

  const controls = element('div', 'mto-import-decision-controls');
  const selectLabel = element('label', null, 'Decisao');
  const select = element('select');
  select.setAttribute('aria-label', `Decisao para ${decision.newItem?.drawing || ''} ${decision.newItem?.mark || ''}`);
  decisionOptions(decision).forEach(({ value, label }) => {
    const option = element('option', null, label);
    option.value = value;
    option.selected = decision.decision === value;
    select.append(option);
  });
  select.addEventListener('change', () => {
    decision.decision = select.value;
    decision.errors = [];
    rerender();
  });
  selectLabel.append(select);
  controls.append(selectLabel);

  if (isCorrection(decision.decision)) {
    const revisionLabel = element('label', null, 'Nova revisao');
    const input = element('input');
    input.type = 'text';
    input.value = decision.newRevision || '';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Nova revisao para ${decision.newItem?.drawing || ''} ${decision.newItem?.mark || ''}`);
    input.addEventListener('input', () => { decision.newRevision = input.value; });
    revisionLabel.append(input);
    controls.append(revisionLabel);
  }
  row.append(controls);

  const messages = [...(decision.errors || [])];
  if (isCorrection(decision.decision) && !String(decision.newRevision || '').trim()) messages.push('Informe a nova revisao antes de aplicar.');
  messages.forEach((message) => row.append(element('p', 'text-critical', message)));
  return row;
}

function groupedVisibleDecisions(decisions = []) {
  const groups = new Map();
  decisions.forEach((decision) => {
    const groupKey = decision.category === 'conflictingRowsInsideFile'
      ? `${decision.category}:${decision.key}`
      : `${decision.category}:${decision.key}:${groups.size}`;
    const group = groups.get(groupKey) || { decision, size: 0 };
    group.size += 1;
    groups.set(groupKey, group);
  });
  return [...groups.values()];
}

export function createMtoImportDecisionReview(importPlan, initialDecisions, options = {}) {
  const decisions = (initialDecisions || createMtoImportDecisionState(importPlan)).map((decision) => ({ ...decision, errors: [...(decision.errors || [])] }));
  let filter = 'all';
  let settled = false;
  let outcomeMessage = '';
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const body = element('div', 'mto-import-decisions-modal');

  const finish = (action, effectivePlan) => {
    if (settled) return;
    settled = true;
    resolveResult({ action, decisions, ...(effectivePlan ? { effectivePlan } : {}) });
  };

  const render = () => {
      const resolved = decisions.filter((decision) => decision.decision !== MTO_IMPORT_DECISION.UNRESOLVED).length;
      const kept = decisions.filter((decision) => decision.decision === MTO_IMPORT_DECISION.KEEP_EXISTING).length;
      const corrected = decisions.filter((decision) => isCorrection(decision.decision)).length;
      const conflictDecisions = decisions.filter((decision) => decision.category === 'conflictingRowsInsideFile');
      const conflicts = conflictDecisions.reduce((total, decision) => total + (decision.rowCount || 1), 0);
      const header = element('section', 'mto-import-decisions-intro');
      header.append(element('p', null, 'Resolva somente as excecoes necessarias. Pendencias nao resolvidas ficam fora da importacao segura.'));
      if (outcomeMessage) header.append(element('p', 'text-critical', outcomeMessage));
      const summary = element('div', 'mto-import-decisions-summary');
      [
        ['Total pendente', decisions.length],
        ['Resolvido', resolved],
        ['Nao resolvido', decisions.length - resolved],
        ['Manter existente', kept],
        ['Correcao de revisao', corrected],
      ].forEach(([label, value]) => summary.append(element('span', 'status-badge', `${label}: ${value}`)));
      header.append(summary);

      if (conflicts) {
        const conflictNotice = element('div', 'mto-import-conflict-notice');
        conflictNotice.append(
          element('strong', null, `${conflicts} linha(s) conflitante(s) dentro do arquivo`),
          element('span', 'text-muted', 'Elas foram agrupadas por Drawing + Mark + POS e nao serao gravadas ao continuar com os itens seguros.'),
        );
        header.append(conflictNotice);
      }

      const filters = element('div', 'mto-import-decisions-filters');
      const filterOptions = [
        ['all', 'Todos'],
        ['sameRevisionChanged', 'Mesma revisao alterada'],
        ['olderRevisions', 'Revisao mais antiga'],
        ['unknownRevisions', 'Revisao nao reconhecida'],
        ['conflictingRowsInsideFile', 'Linhas conflitantes no arquivo'],
        ['unresolved', 'Nao resolvidos'],
        ['resolved', 'Resolvidos'],
      ];
      filterOptions.forEach(([value, label]) => {
        const button = element('button', `btn btn-sm ${filter === value ? 'btn-primary' : 'btn-secondary'}`, label);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(filter === value));
        button.addEventListener('click', () => { filter = value; render(); });
        filters.append(button);
      });

      const visible = decisions.filter((decision) => {
        if (filter === 'all') return true;
        if (filter === 'resolved') return decision.decision !== MTO_IMPORT_DECISION.UNRESOLVED;
        if (filter === 'unresolved') return decision.decision === MTO_IMPORT_DECISION.UNRESOLVED;
        return decision.category === filter;
      });
      const bulk = element('div', 'mto-import-decisions-bulk');
      const bulkEligible = visible.filter((decision) => decision.category !== 'conflictingRowsInsideFile');
      const mergeEligible = visible.filter((decision) => (
        decision.category === 'conflictingRowsInsideFile' && canConsolidateMtoConflict(decision)
      ));
      const duplicateGroups = visible.filter((decision) => decision.category === 'conflictingRowsInsideFile');
      const keepVisible = element('button', 'btn btn-sm btn-secondary', `Manter existentes visiveis (${bulkEligible.length})`);
      keepVisible.type = 'button';
      keepVisible.disabled = bulkEligible.length === 0;
      keepVisible.addEventListener('click', () => {
        bulkEligible.forEach((decision) => {
          decision.decision = MTO_IMPORT_DECISION.KEEP_EXISTING;
          decision.newRevision = '';
          decision.errors = [];
        });
        render();
      });
      const resetVisible = element('button', 'btn btn-sm btn-ghost', `Deixar visiveis pendentes (${visible.length})`);
      resetVisible.type = 'button';
      resetVisible.disabled = visible.length === 0;
      resetVisible.addEventListener('click', () => {
        visible.forEach((decision) => {
          decision.decision = MTO_IMPORT_DECISION.UNRESOLVED;
          decision.newRevision = '';
          decision.errors = [];
        });
        render();
      });
      const mergeVisible = element('button', 'btn btn-sm btn-secondary', `Somar duplicadas compativeis (${mergeEligible.length})`);
      mergeVisible.type = 'button';
      mergeVisible.disabled = mergeEligible.length === 0;
      mergeVisible.addEventListener('click', () => {
        mergeEligible.forEach((decision) => {
          decision.decision = MTO_IMPORT_DECISION.MERGE_QUANTITIES;
          decision.errors = [];
        });
        render();
      });
      const keepFirstVisible = element('button', 'btn btn-sm btn-secondary', `Descartar repetidas (${duplicateGroups.length})`);
      keepFirstVisible.type = 'button';
      keepFirstVisible.disabled = duplicateGroups.length === 0;
      keepFirstVisible.addEventListener('click', () => {
        duplicateGroups.forEach((decision) => {
          decision.decision = MTO_IMPORT_DECISION.KEEP_FIRST;
          decision.errors = [];
        });
        render();
      });
      bulk.append(
        element('strong', null, 'Acao em lote'),
        mergeVisible,
        keepFirstVisible,
        keepVisible,
        resetVisible,
      );

      const list = element('div', 'mto-import-decisions-list');
      groupedVisibleDecisions(visible).forEach(({ decision, size }) => list.append(renderDecisionRow(decision, render, decision.rowCount || size)));

      const actions = element('div', 'mto-import-decisions-actions');
      const cancelButton = element('button', 'btn btn-ghost', 'Cancelar importacao');
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', () => finish('cancel'));
      const continueButton = element('button', 'btn btn-secondary', `Continuar com itens seguros (${importPlan?.counts?.itemsToImport || 0})`);
      continueButton.type = 'button';
      continueButton.addEventListener('click', () => finish('continue'));
      const applyButton = element('button', 'btn btn-primary', 'Aplicar decisoes');
      applyButton.type = 'button';
      applyButton.disabled = resolved === 0;
      applyButton.addEventListener('click', async () => {
        applyButton.disabled = true;
        const effectivePlan = await options.applyDecisions?.(decisions);
        applyButton.disabled = false;
        if (!effectivePlan) return;
        effectivePlan.unresolvedDecisions.forEach((unresolved) => {
          const current = decisions.find((decision) => decision.key === unresolved.key);
          if (current) current.errors = [...unresolved.errors];
        });
        const zeroOutcome = options.getZeroOutcome?.('apply', effectivePlan);
        if (zeroOutcome?.keepDecisionModalOpen) {
          outcomeMessage = zeroOutcome.message;
          render();
          return;
        }
        finish('apply', effectivePlan);
      });
      actions.append(cancelButton, continueButton, applyButton);
      body.replaceChildren(header, filters, bulk, list, actions);
  };
  render();

  return {
    element: body,
    result,
    decisions,
    cancel: () => finish('cancel'),
  };
}

export function openMtoImportDecisionModal(importPlan, initialDecisions, options = {}) {
  const review = createMtoImportDecisionReview(importPlan, initialDecisions, options);
  openModal({
    title: 'Revisar conflitos da importacao',
    body: review.element,
    wide: true,
    onClose: review.cancel,
  });
  return review.result.then((value) => {
    closeModal();
    return value;
  });
}
