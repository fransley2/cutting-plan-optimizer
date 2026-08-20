function text(value) {
  return value == null ? '' : String(value).trim();
}

function timestampValue(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function searchableMetadata(value) {
  if (!value || typeof value !== 'object') return '';
  try { return JSON.stringify(value); } catch { return ''; }
}

function auditRow(event = {}) {
  return {
    id: text(event.id),
    kind: 'AUDIT',
    action: text(event.eventType) || 'AUDIT_EVENT',
    timestamp: text(event.timestamp),
    projectId: text(event.projectId),
    entityType: text(event.entityType),
    entityId: text(event.entityId),
    inventoryItemId: text(event.metadata?.inventoryItemId || event.metadata?.traceability),
    sourceDocumentType: text(event.sourceDocumentType),
    sourceDocumentId: text(event.sourceDocumentId),
    userName: text(event.userName),
    reason: text(event.reason),
    previousStatus: text(event.before?.status || event.metadata?.previousStatus),
    nextStatus: text(event.after?.status || event.metadata?.nextStatus),
    before: event.before ?? null,
    after: event.after ?? null,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
  };
}

function movementRow(movement = {}) {
  return {
    id: text(movement.id),
    kind: 'MOVEMENT',
    action: text(movement.movementType) || 'STOCK_MOVEMENT',
    timestamp: text(movement.timestamp),
    projectId: text(movement.projectId),
    entityType: 'Inventory',
    entityId: text(movement.inventoryItemId),
    inventoryItemId: text(movement.inventoryItemId),
    sourceDocumentType: text(movement.sourceDocumentType),
    sourceDocumentId: text(movement.sourceDocumentId),
    userName: text(movement.userName),
    reason: text(movement.reason),
    previousStatus: text(movement.previousStatus),
    nextStatus: text(movement.nextStatus),
    quantityDelta: Number(movement.quantityDelta) || 0,
    lengthDelta: Number(movement.lengthDelta) || 0,
    before: movement.before ?? null,
    after: movement.after ?? null,
    metadata: movement.metadata && typeof movement.metadata === 'object' ? movement.metadata : {},
  };
}

export function buildAuditHistoryRows(auditEvents = [], stockMovements = []) {
  return [
    ...(Array.isArray(auditEvents) ? auditEvents.map(auditRow) : []),
    ...(Array.isArray(stockMovements) ? stockMovements.map(movementRow) : []),
  ].sort((a, b) => timestampValue(b.timestamp) - timestampValue(a.timestamp));
}

function endOfDay(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function filterAuditHistoryRows(rows = [], filters = {}) {
  const query = text(filters.search).toLowerCase();
  const from = startOfDay(filters.from);
  const to = endOfDay(filters.to);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (filters.kind && row.kind !== filters.kind) return false;
    if (filters.projectId && row.projectId !== filters.projectId) return false;
    if (filters.action && row.action !== filters.action) return false;
    if (filters.entityType && row.entityType !== filters.entityType) return false;
    const timestamp = new Date(row.timestamp);
    if (from && timestamp < from) return false;
    if (to && timestamp > to) return false;
    if (!query) return true;
    return [
      row.action, row.projectId, row.entityType, row.entityId, row.inventoryItemId,
      row.sourceDocumentType, row.sourceDocumentId, row.userName, row.reason,
      row.previousStatus, row.nextStatus, searchableMetadata(row.metadata),
    ].join(' ').toLowerCase().includes(query);
  });
}

export function summarizeAuditHistory(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    total: list.length,
    auditEvents: list.filter((row) => row.kind === 'AUDIT').length,
    stockMovements: list.filter((row) => row.kind === 'MOVEMENT').length,
    materials: new Set(list.map((row) => row.inventoryItemId).filter(Boolean)).size,
  };
}
