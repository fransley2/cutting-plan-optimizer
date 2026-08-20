export const MATERIAL_COUPON_ACTIONS = Object.freeze({
  SUBMIT: 'SUBMIT', APPROVE: 'APPROVE', REJECT: 'REJECT', ISSUE: 'ISSUE',
  DISPATCH: 'DISPATCH', RECEIVE: 'RECEIVE', CLOSE: 'CLOSE', REOPEN: 'REOPEN',
  CANCEL: 'CANCEL', RELEASE: 'RELEASE', DELETE: 'DELETE', NEW_REVISION: 'NEW_REVISION',
});

const RULES = Object.freeze({
  SUBMIT: { statuses: ['DRAFT'], nextApproval: 'PENDING_APPROVAL' },
  APPROVE: { statuses: ['DRAFT'], approvalStatuses: ['PENDING_APPROVAL'], nextApproval: 'APPROVED' },
  REJECT: { statuses: ['DRAFT'], approvalStatuses: ['PENDING_APPROVAL'], nextApproval: 'REJECTED' },
  ISSUE: { statuses: ['DRAFT'], nextStatus: 'ISSUED' },
  DISPATCH: { statuses: ['ISSUED'], nextStatus: 'DISPATCHED' },
  RECEIVE: { statuses: ['ISSUED', 'DISPATCHED'], nextStatus: 'RECEIVED' },
  CLOSE: { statuses: ['RECEIVED'], nextStatus: 'CLOSED' },
  REOPEN: { statuses: ['CLOSED'], nextStatus: 'RECEIVED' },
  CANCEL: { statuses: ['DRAFT', 'ISSUED'], nextStatus: 'CANCELLED' },
  RELEASE: { statuses: ['ISSUED'], nextStatus: 'DRAFT' },
  DELETE: { statuses: ['DRAFT', 'CANCELLED'] },
  NEW_REVISION: { statuses: ['ISSUED', 'DISPATCHED', 'RECEIVED', 'CLOSED', 'CANCELLED'], nextStatus: 'DRAFT' },
});

function text(value) { return value == null ? '' : String(value).trim().toUpperCase(); }

export function couponApprovalStatus(coupon = {}) {
  return text(coupon.approval?.status || coupon.metadata?.coupon?.approval?.status);
}

export function canMaterialCouponAction(coupon = {}, action) {
  const rule = RULES[action];
  if (!rule) return false;
  const status = text(coupon.status || coupon.metadata?.coupon?.status || 'DRAFT');
  if (!rule.statuses.includes(status)) return false;
  if (rule.approvalStatuses && !rule.approvalStatuses.includes(couponApprovalStatus(coupon))) return false;
  return true;
}

export function applyMaterialCouponAction(coupon = {}, action, actor = '', reason = '') {
  if (!canMaterialCouponAction(coupon, action)) throw new Error(`INVALID_MATERIAL_COUPON_TRANSITION:${action}`);
  const rule = RULES[action];
  const timestamp = new Date().toISOString();
  const approval = { ...(coupon.approval || {}) };
  const responsible = { ...(coupon.responsible || {}) };
  if (rule.nextApproval) {
    approval.status = rule.nextApproval;
    approval.updatedAt = timestamp;
    approval.updatedBy = actor;
    approval.reason = reason;
  }
  if (action === MATERIAL_COUPON_ACTIONS.ISSUE) {
    responsible.issuing = actor || responsible.issuing || '';
    responsible.issuingDate = timestamp.slice(0, 10);
  }
  if (action === MATERIAL_COUPON_ACTIONS.DISPATCH) {
    responsible.dispatch = actor || responsible.dispatch || '';
    responsible.dispatchDate = timestamp.slice(0, 10);
  }
  if (action === MATERIAL_COUPON_ACTIONS.RECEIVE) {
    responsible.receiving = actor || responsible.receiving || '';
    responsible.receivingDate = timestamp.slice(0, 10);
  }
  return { ...coupon, status: rule.nextStatus || text(coupon.status || 'DRAFT'), approval, responsible, updatedAt: timestamp };
}

export function nextMaterialCouponRevision(coupon = {}) {
  const currentRevision = Number.parseInt(String(coupon.header?.revision ?? '0'), 10);
  const revision = Number.isFinite(currentRevision) ? String(currentRevision + 1) : '1';
  return {
    ...coupon,
    status: 'DRAFT',
    header: { ...(coupon.header || {}), revision },
    approval: {},
    issuedAt: '',
    issuedBy: '',
    updatedAt: new Date().toISOString(),
  };
}
