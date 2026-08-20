function text(value) {
  return value == null ? '' : String(value).trim();
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function resolveWorkpackActivity(events = [], workpackId = '') {
  const id = text(workpackId);
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && typeof event === 'object')
    .filter((event) => {
      const entityType = text(event.entityType || event.entity?.type).toUpperCase();
      const entityId = text(event.entityId || event.entity?.id);
      const metadataWorkpackId = text(event.workpackId || event.metadata?.workpackId);
      return (entityType === 'WORKPACK' && entityId === id) || metadataWorkpackId === id;
    })
    .map((event) => ({
      id: text(event.id),
      event: text(event.eventType || event.action || event.type) || 'Event',
      user: text(event.userName || event.user || event.createdBy),
      timestamp: text(event.timestamp || event.updatedAt || event.createdAt || event.date),
      summary: text(event.reason || event.summary || event.metadata?.summary || event.metadata?.source),
      source: text(event.sourceDocumentType || event.source || event.metadata?.source) || 'Audit log',
      raw: event,
    }))
    .sort((a, b) => {
      const aTime = timestamp(a.timestamp);
      const bTime = timestamp(b.timestamp);
      if (aTime == null && bTime == null) return a.event.localeCompare(b.event);
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime - aTime;
    });
}
