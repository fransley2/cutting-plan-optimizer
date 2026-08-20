export function clampProgress(value) { return Math.min(100, Math.max(0, Number(value) || 0)); }
const MILESTONES = Object.freeze({ DRAFT: 0, PLANNED: 5, MTO_PENDING: 10, MATERIAL_PENDING: 20, MATERIAL_RESERVED: 30, READY_FOR_NESTING: 40, IN_NESTING: 50, NESTED: 60, RELEASED_FOR_CUTTING: 70, IN_FABRICATION: 80, COMPLETED: 100, CANCELLED: 0 });
export function calculateWorkpackProgress(workpack = {}) {
  const operations = Array.isArray(workpack.operations) ? workpack.operations.filter((item) => item?.status !== 'CANCELLED') : [];
  let calculated;
  if (operations.length) calculated = operations.reduce((sum, item) => sum + (item.status === 'COMPLETED' ? 100 : item.status === 'IN_PROGRESS' ? clampProgress(item.progress || 50) : 0), 0) / operations.length;
  else if (workpack.status === 'ON_HOLD') calculated = clampProgress(workpack.calculatedProgress || MILESTONES.IN_FABRICATION);
  else calculated = MILESTONES[workpack.status] ?? 0;
  calculated = clampProgress(calculated);
  const manual = Number(workpack.manualProgress);
  const effective = Number.isFinite(manual) && String(workpack.progressOverrideReason || '').trim() ? clampProgress(manual) : calculated;
  return { calculatedProgress: calculated, effectiveProgress: effective };
}
