function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function stableItemIdentity(item) {
  const id = text(item?.id);
  if (id) return `id:${id}`;
  const parts = ['drawing', 'mark', 'pos', 'revision'].map((field) => text(item?.[field]));
  return parts.some(Boolean) ? `revision:${parts.join('|')}` : '';
}

export function buildDefaultMtoImportPlan(items = [], impact = {}) {
  const sourceItems = arrayValue(items);
  const brandNew = arrayValue(impact?.brandNew);
  const revisions = arrayValue(impact?.revisions);
  const duplicates = arrayValue(impact?.duplicates);
  const sameRevisionChanged = arrayValue(impact?.sameRevisionChanged);
  const olderRevisions = arrayValue(impact?.olderRevisions);
  const unknownRevisions = arrayValue(impact?.unknownRevisions);
  const conflictingRowsInsideFile = arrayValue(impact?.conflictingRowsInsideFile);
  const blockedEntries = [
    ...duplicates,
    ...sameRevisionChanged,
    ...olderRevisions,
    ...unknownRevisions,
    ...conflictingRowsInsideFile,
  ];
  const blockedIdentities = new Set();
  const blockedReferences = new Set();

  blockedEntries.forEach((entry) => {
    const newItem = entry?.newItem;
    const identity = stableItemIdentity(newItem);
    if (identity) blockedIdentities.add(identity);
    else if (newItem && typeof newItem === 'object') blockedReferences.add(newItem);
  });

  const itemsToImport = sourceItems.filter((item) => {
    const identity = stableItemIdentity(item);
    return identity ? !blockedIdentities.has(identity) : !blockedReferences.has(item);
  });
  const itemsToSupersede = [...arrayValue(impact?.toSupersede)];
  const pendingDecisions = {
    sameRevisionChanged: [...sameRevisionChanged],
    olderRevisions: [...olderRevisions],
    unknownRevisions: [...unknownRevisions],
    conflictingRowsInsideFile: [...conflictingRowsInsideFile],
  };
  const pendingDecisionCount = sameRevisionChanged.length
    + olderRevisions.length
    + unknownRevisions.length
    + conflictingRowsInsideFile.length;
  const counts = {
    total: sourceItems.length,
    itemsToImport: itemsToImport.length,
    brandNew: brandNew.length,
    newerRevisions: revisions.length,
    duplicates: duplicates.length,
    sameRevisionChanged: sameRevisionChanged.length,
    olderRevisions: olderRevisions.length,
    unknownRevisions: unknownRevisions.length,
    conflictingRowsInsideFile: conflictingRowsInsideFile.length,
    pendingDecisions: pendingDecisionCount,
    itemsToSupersede: itemsToSupersede.length,
  };

  return {
    itemsToImport,
    itemsToSupersede,
    ignoredDuplicates: [...duplicates],
    pendingDecisions,
    counts,
    hasPendingDecisions: pendingDecisionCount > 0,
  };
}
