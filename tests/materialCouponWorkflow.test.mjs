import assert from 'node:assert/strict';
import { MATERIAL_COUPON_ACTIONS as A, applyMaterialCouponAction, canMaterialCouponAction, nextMaterialCouponRevision } from '../src/core/materialCouponWorkflow.js';

const draft = { status: 'DRAFT', header: { revision: '2' }, approval: {} };
assert.equal(canMaterialCouponAction(draft, A.ISSUE), true);
const issued = applyMaterialCouponAction(draft, A.ISSUE, 'Planner');
assert.equal(issued.status, 'ISSUED');
assert.equal(issued.responsible.issuing, 'Planner');
assert.equal(canMaterialCouponAction(issued, A.RECEIVE), true);
assert.equal(applyMaterialCouponAction(issued, A.RECEIVE, 'Receiver').responsible.receiving, 'Receiver');
assert.equal(applyMaterialCouponAction(issued, A.DISPATCH, 'Dispatcher').responsible.dispatch, 'Dispatcher');
assert.equal(canMaterialCouponAction({ status: 'DISPATCHED' }, A.CANCEL), false, 'physically dispatched material cannot be restored by cancelling the document');
assert.equal(canMaterialCouponAction({ status: 'DISPATCHED' }, A.RELEASE), false, 'physically dispatched material requires a return flow');
assert.equal(applyMaterialCouponAction(issued, A.CANCEL).status, 'CANCELLED');
assert.equal(applyMaterialCouponAction(issued, A.RELEASE).status, 'DRAFT');
assert.equal(canMaterialCouponAction({ status: 'RECEIVED' }, A.RECEIVE), false);
assert.equal(canMaterialCouponAction(issued, A.DELETE), false);
assert.equal(canMaterialCouponAction({ status: 'CANCELLED' }, A.DELETE), true);

const submitted = applyMaterialCouponAction(draft, A.SUBMIT, 'Planner');
assert.equal(submitted.approval.status, 'PENDING_APPROVAL');
assert.equal(canMaterialCouponAction(submitted, A.APPROVE), true);
assert.equal(applyMaterialCouponAction(submitted, A.APPROVE, 'Approver').approval.status, 'APPROVED');
assert.equal(applyMaterialCouponAction(submitted, A.REJECT, 'Approver', 'Needs correction').approval.status, 'REJECTED');

const revision = nextMaterialCouponRevision({ ...issued, header: { revision: '2' }, approval: { status: 'APPROVED' } });
assert.equal(revision.status, 'DRAFT');
assert.equal(revision.header.revision, '3');
assert.deepEqual(revision.approval, {});
console.log('materialCouponWorkflow tests passed');
