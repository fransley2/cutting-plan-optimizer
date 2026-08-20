import { analyzeImportImpact } from './mtoDB.js';

export const MTO_IMPORT_DECISION = Object.freeze({
  UNRESOLVED: 'UNRESOLVED',
  KEEP_EXISTING: 'KEEP_EXISTING',
  IMPORT_AS_NEW_REVISION: 'IMPORT_AS_NEW_REVISION',
  SET_REVISION: 'SET_REVISION',
  MERGE_QUANTITIES: 'MERGE_QUANTITIES',
  KEEP_FIRST: 'KEEP_FIRST',
});

export const MTO_ZERO_IMPORT_OUTCOME = Object.freeze({
  UNRESOLVED: 'UNRESOLVED',
  CONTINUED_PENDING: 'CONTINUED_PENDING',
  KEPT_EXISTING: 'KEPT_EXISTING',
  NO_NEW_ITEMS: 'NO_NEW_ITEMS',
});

const PENDING_CATEGORIES = Object.freeze([
  'sameRevisionChanged',
  'olderRevisions',
  'unknownRevisions',
  'conflictingRowsInsideFile',
]);

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

export function mtoImportDecisionKey(item = {}) {
  const id = text(item.id);
  if (id) return `id:${id}`;
  return `revision:${['drawing', 'mark', 'pos', 'revision'].map((field) => text(item[field])).join('|')}`;
}

function mtoConflictDecisionKey(item = {}) {
  return `conflict:${['drawing', 'mark', 'pos'].map((field) => text(item[field])).join('|')}`;
}

export function createMtoImportDecisionState(importPlan = {}) {
  return PENDING_CATEGORIES.flatMap((category) => {
    const entries = arrayValue(importPlan?.pendingDecisions?.[category]);
    if (category !== 'conflictingRowsInsideFile') {
      return entries.map(({ newItem, existingItem }) => ({
        key: mtoImportDecisionKey(newItem),
        category,
        decision: MTO_IMPORT_DECISION.UNRESOLVED,
        newRevision: '',
        newItem,
        existingItem,
        errors: [],
      }));
    }
    const groups = new Map();
    entries.forEach(({ newItem, existingItem, conflictingItems }) => {
      const key = mtoConflictDecisionKey(newItem);
      if (groups.has(key)) return;
      const groupItems = arrayValue(conflictingItems).length
        ? [...conflictingItems]
        : entries.filter((entry) => mtoConflictDecisionKey(entry.newItem) === key).map((entry) => entry.newItem);
      groups.set(key, {
        key,
        category,
        decision: MTO_IMPORT_DECISION.UNRESOLVED,
        newRevision: '',
        newItem,
        existingItem,
        conflictingItems: groupItems,
        rowCount: groupItems.length,
        errors: [],
      });
    });
    return [...groups.values()];
  });
}

const CONSOLIDATION_FIELDS = Object.freeze([
  'drawing', 'revision', 'mark', 'pos', 'description', 'cutLength', 'material',
  'identCode', 'tag', 'type', 'discipline', 'profile', 'equipmentName', 'line',
  'mountErection', 'instrument', 'positionStatus',
]);

export function canConsolidateMtoConflict(decision = {}) {
  const items = arrayValue(decision.conflictingItems);
  if (items.length < 2) return false;
  const first = items[0];
  return items.every((item) => (
    CONSOLIDATION_FIELDS.every((field) => text(item?.[field]) === text(first?.[field]))
    && Number.isFinite(Number(item?.qty))
    && Number(item.qty) > 0
  ));
}

export function consolidateMtoConflict(decision = {}) {
  if (!canConsolidateMtoConflict(decision)) return null;
  const items = decision.conflictingItems;
  const first = items[0];
  const qty = items.reduce((total, item) => total + Number(item.qty), 0);
  return {
    ...first,
    qty,
    requiredLength: qty * Number(first.cutLength),
    metadata: {
      ...(first.metadata || {}),
      importDecision: {
        category: decision.category,
        decision: MTO_IMPORT_DECISION.MERGE_QUANTITIES,
        mergedRowCount: items.length,
        sourceRowNumbers: items.map((item) => item.sourceRowNumber).filter(Boolean),
      },
    },
  };
}

function allowedDecision(category, decision) {
  if (decision === MTO_IMPORT_DECISION.UNRESOLVED) return true;
  if (category === 'conflictingRowsInsideFile') {
    return decision === MTO_IMPORT_DECISION.MERGE_QUANTITIES
      || decision === MTO_IMPORT_DECISION.KEEP_FIRST;
  }
  if (decision === MTO_IMPORT_DECISION.KEEP_EXISTING) return true;
  if (category === 'sameRevisionChanged') return decision === MTO_IMPORT_DECISION.IMPORT_AS_NEW_REVISION;
  if (category === 'unknownRevisions') return decision === MTO_IMPORT_DECISION.SET_REVISION;
  return false;
}

function firstMtoConflictItem(decision = {}) {
  const first = arrayValue(decision.conflictingItems)[0] || decision.newItem;
  return {
    ...first,
    metadata: {
      ...(first?.metadata || {}),
      importDecision: {
        category: decision.category,
        decision: MTO_IMPORT_DECISION.KEEP_FIRST,
        discardedRowCount: Math.max(0, arrayValue(decision.conflictingItems).length - 1),
      },
    },
  };
}

function correctedItemFor(decision) {
  const correctedRevision = text(decision.newRevision);
  return {
    ...decision.newItem,
    revision: correctedRevision,
    metadata: {
      ...(decision.newItem?.metadata || {}),
      importDecision: {
        category: decision.category,
        decision: decision.decision,
        originalRevision: text(decision.newItem?.revision),
        correctedRevision,
      },
    },
  };
}

function decisionAudit(decisions, keptExisting, correctedRevisionCount, unresolvedDecisions, conflictResolution) {
  return {
    keptExistingCount: keptExisting.length,
    correctedRevisionCount,
    consolidatedConflictCount: conflictResolution.consolidatedConflictCount,
    discardedDuplicateRowCount: conflictResolution.discardedDuplicateRowCount,
    unresolvedCount: unresolvedDecisions.length,
    decisions: decisions.map((decision) => ({
      key: decision.key,
      category: decision.category,
      decision: decision.decision,
      originalRevision: text(decision.newItem?.revision),
      correctedRevision: text(decision.newRevision),
    })),
  };
}

function pendingByCategory(decisions) {
  const pending = Object.fromEntries(PENDING_CATEGORIES.map((category) => [category, []]));
  decisions.forEach((decision) => pending[decision.category]?.push(decision));
  return pending;
}

export async function applyMtoImportDecisions({
  items = [],
  impact = {},
  importPlan = {},
  decisions = [],
  analyzeImpact = analyzeImportImpact,
} = {}) {
  const decisionInputs = new Map(arrayValue(decisions).map((decision) => [decision.key, decision]));
  const decisionState = createMtoImportDecisionState(importPlan).map((base) => ({
    ...base,
    ...(decisionInputs.get(base.key) || {}),
    newItem: base.newItem,
    existingItem: base.existingItem,
    errors: [],
  }));
  const itemsToImport = [...arrayValue(importPlan.itemsToImport)];
  const itemsToSupersede = [...arrayValue(importPlan.itemsToSupersede)];
  const keptExisting = [];
  const resolvedDecisions = [];
  const unresolvedDecisions = [];
  let correctedRevisionCount = 0;
  let consolidatedConflictCount = 0;
  let discardedDuplicateRowCount = 0;

  for (const decision of decisionState) {
    if (!allowedDecision(decision.category, decision.decision)) {
      decision.errors.push('Decisao nao permitida para esta categoria.');
      unresolvedDecisions.push(decision);
      continue;
    }
    if (decision.decision === MTO_IMPORT_DECISION.UNRESOLVED) {
      unresolvedDecisions.push(decision);
      continue;
    }
    if (decision.category === 'conflictingRowsInsideFile') {
      const candidate = decision.decision === MTO_IMPORT_DECISION.MERGE_QUANTITIES
        ? consolidateMtoConflict(decision)
        : firstMtoConflictItem(decision);
      if (!candidate) {
        decision.errors.push('As linhas possuem dados tecnicos diferentes e nao podem ter as quantidades somadas.');
        unresolvedDecisions.push(decision);
        continue;
      }
      const candidateImpact = await analyzeImpact([candidate], {
        ...(candidate.projectId ? { projectId: candidate.projectId } : {}),
      });
      const importable = arrayValue(candidateImpact?.brandNew).length > 0
        || arrayValue(candidateImpact?.revisions).length > 0;
      if (importable) {
        itemsToImport.push(candidate);
        itemsToSupersede.push(...arrayValue(candidateImpact.toSupersede));
      } else if (!arrayValue(candidateImpact?.duplicates).length) {
        decision.errors.push('O item consolidado ainda conflita com outra revisao e permanece pendente.');
        unresolvedDecisions.push(decision);
        continue;
      }
      if (decision.decision === MTO_IMPORT_DECISION.MERGE_QUANTITIES) consolidatedConflictCount += 1;
      discardedDuplicateRowCount += Math.max(0, arrayValue(decision.conflictingItems).length - 1);
      resolvedDecisions.push({ ...decision, resolvedItem: candidate });
      continue;
    }
    if (decision.decision === MTO_IMPORT_DECISION.KEEP_EXISTING) {
      keptExisting.push(decision);
      resolvedDecisions.push(decision);
      continue;
    }

    const correctedRevision = text(decision.newRevision);
    const existingRevision = text(decision.existingItem?.revision);
    const importedRevision = text(decision.newItem?.revision);
    if (!correctedRevision) decision.errors.push('Informe a nova revisao.');
    if (correctedRevision && correctedRevision === existingRevision) decision.errors.push('A nova revisao deve ser diferente da revisao existente.');
    if (correctedRevision && correctedRevision === importedRevision) decision.errors.push('A nova revisao deve ser diferente da revisao importada.');
    if (decision.errors.length) {
      unresolvedDecisions.push(decision);
      continue;
    }

    const correctedItem = correctedItemFor(decision);
    const correctedImpact = await analyzeImpact([correctedItem], {
      ...(correctedItem.projectId ? { projectId: correctedItem.projectId } : {}),
    });
    const provenNewer = arrayValue(correctedImpact?.revisions)
      .some((entry) => mtoImportDecisionKey(entry?.newItem) === mtoImportDecisionKey(correctedItem));
    if (!provenNewer) {
      if (arrayValue(correctedImpact?.olderRevisions).length) decision.errors.push('A revisao corrigida ainda e mais antiga que a existente.');
      else if (arrayValue(correctedImpact?.unknownRevisions).length) decision.errors.push('A revisao corrigida ainda nao pode ser comparada.');
      else decision.errors.push('A revisao corrigida nao foi comprovada como mais nova.');
      unresolvedDecisions.push(decision);
      continue;
    }

    itemsToImport.push(correctedItem);
    itemsToSupersede.push(...arrayValue(correctedImpact.toSupersede));
    correctedRevisionCount += 1;
    resolvedDecisions.push({ ...decision, correctedItem });
  }

  const uniqueSupersedes = [...new Set(itemsToSupersede.filter(Boolean))];
  const pendingDecisions = pendingByCategory(unresolvedDecisions);
  const counts = {
    ...(importPlan.counts || {}),
    itemsToImport: itemsToImport.length,
    itemsToSupersede: uniqueSupersedes.length,
    ignoredDuplicates: arrayValue(importPlan.ignoredDuplicates).length,
    keptExisting: keptExisting.length,
    resolvedDecisions: resolvedDecisions.length,
    unresolvedDecisions: unresolvedDecisions.length,
    pendingDecisions: unresolvedDecisions.length,
    correctedRevision: correctedRevisionCount,
    consolidatedConflicts: consolidatedConflictCount,
    discardedDuplicateRows: discardedDuplicateRowCount,
  };
  const auditSummary = decisionAudit(decisionState, keptExisting, correctedRevisionCount, unresolvedDecisions, {
    consolidatedConflictCount,
    discardedDuplicateRowCount,
  });

  return {
    itemsToImport,
    itemsToSupersede: uniqueSupersedes,
    ignoredDuplicates: [...arrayValue(importPlan.ignoredDuplicates)],
    keptExisting,
    resolvedDecisions,
    unresolvedDecisions,
    pendingDecisions,
    counts,
    canCommit: itemsToImport.length > 0,
    auditSummary,
  };
}

export function describeMtoItemChanges(existingItem = {}, newItem = {}) {
  const labels = { qty: 'Quantidade', cutLength: 'Comprimento', material: 'Material', description: 'Descricao' };
  return Object.keys(labels).flatMap((field) => (
    String(existingItem?.[field] ?? '') === String(newItem?.[field] ?? '')
      ? []
      : [{ field, label: labels[field], before: existingItem?.[field] ?? '', after: newItem?.[field] ?? '' }]
  ));
}

export function getZeroMtoImportOutcome(action, effectivePlan = {}) {
  if (arrayValue(effectivePlan.itemsToImport).length > 0) return null;
  if (action === 'continue') {
    return {
      code: MTO_ZERO_IMPORT_OUTCOME.CONTINUED_PENDING,
      message: 'Nenhum item foi importado. Todas as linhas permanecem pendentes e nenhum item existente foi alterado.',
      successful: true,
      keepDecisionModalOpen: false,
    };
  }
  if (arrayValue(effectivePlan.unresolvedDecisions).length > 0) {
    return {
      code: MTO_ZERO_IMPORT_OUTCOME.UNRESOLVED,
      message: 'Nenhuma linha pode ser importada enquanto houver pendências não resolvidas. Resolva ao menos uma linha ou mantenha os itens existentes.',
      successful: false,
      keepDecisionModalOpen: action === 'apply',
    };
  }
  if (arrayValue(effectivePlan.keptExisting).length > 0) {
    return {
      code: MTO_ZERO_IMPORT_OUTCOME.KEPT_EXISTING,
      message: 'Importação concluída sem novos itens. Os itens existentes foram mantidos.',
      successful: true,
      keepDecisionModalOpen: false,
    };
  }
  return {
    code: MTO_ZERO_IMPORT_OUTCOME.NO_NEW_ITEMS,
    message: 'Nenhum item novo para importar.',
    successful: true,
    keepDecisionModalOpen: false,
  };
}
