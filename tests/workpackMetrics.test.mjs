import assert from 'node:assert/strict';
import { calculateWorkpackMetrics } from '../src/core/workpackMetrics.js';
const items = [{ projectId:'P1', status:'DRAFT' }, { projectId:'P1', status:'MATERIAL_PENDING' }, { projectId:'P1', status:'READY_FOR_NESTING' }, { projectId:'P2', status:'IN_FABRICATION' }, { projectId:'P1', status:'COMPLETED' }, { projectId:'P1', status:'ON_HOLD' }, null];
assert.deepEqual(calculateWorkpackMetrics(items, 'P1'), { total:5, active:2, materialPending:1, readyForNesting:1, inFabrication:0, completed:1, onHold:1 });
assert.equal(calculateWorkpackMetrics(items).total, 6);
console.log('workpack metrics tests passed');
