export const PHASE_ALIASES = Object.freeze({
  stock: 'planner',
  'cutting-packages': 'workpacks',
  'material-coupon': 'material-coupons',
});

export function normalizePhase(phase) {
  return PHASE_ALIASES[phase] || phase;
}
