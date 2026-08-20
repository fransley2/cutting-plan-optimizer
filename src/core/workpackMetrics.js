function records(value) { return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []; }
export function calculateWorkpackMetrics(workpacks, projectId = '') {
  const visible = records(workpacks).filter((item) => !projectId || item.projectId === projectId);
  const status = (value) => visible.filter((item) => item.status === value).length;
  return { total: visible.length, active: visible.filter((item) => !['DRAFT', 'COMPLETED', 'CANCELLED', 'ON_HOLD'].includes(item.status)).length, materialPending: status('MATERIAL_PENDING'), readyForNesting: status('READY_FOR_NESTING'), inFabrication: status('IN_FABRICATION'), completed: status('COMPLETED'), onHold: status('ON_HOLD') };
}
