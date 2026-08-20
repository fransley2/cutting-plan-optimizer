function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasProject(record, projectName) {
  if (!projectName) return true;
  return String(record?.projectId || '').trim() === projectName;
}

function countScoped(records, projectName) {
  return asArray(records).filter((record) => hasProject(record, projectName)).length;
}

function validTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function aggregateDashboardMetrics(data = {}, activeProjectName = '') {
  const project = String(activeProjectName || '').trim();
  return {
    equipments: countScoped(data.equipments, project),
    drawings: countScoped(data.drawings, project),
    workpacks: countScoped(data.workpacks, project),
    mtoItems: countScoped(data.mtoItems, project),
    materialCoupons: countScoped(data.materialCoupons, project),
    offcuts: countScoped(data.offcuts, project),
    inventory: asArray(data.inventory).length,
  };
}

export function recentDashboardActivity(events, activeProjectName = '', limit = 10) {
  const project = String(activeProjectName || '').trim();
  return asArray(events)
    .filter((event) => !project || String(event?.projectId || '').trim() === project)
    .map((event, index) => ({ event, index, date: validTimestamp(event?.timestamp || event?.createdAt || event?.date) }))
    .sort((a, b) => {
      if (!a.date && !b.date) return a.index - b.index;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    })
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(({ event }) => event);
}
