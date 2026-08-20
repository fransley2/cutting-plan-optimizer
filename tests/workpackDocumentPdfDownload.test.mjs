import assert from 'node:assert/strict';
import { downloadLinkedWorkpackDocumentsPdf } from '../src/ui/workpackPage.js';

const calls = [];
const records = [
  { type: 'Task Sheet', number: 'TS-001', raw: { id: 'TS-1' } },
  { type: 'Material Coupon', number: 'MC-001', raw: { id: 'MC-1' } },
  { type: 'Cutting Sheet', number: 'CS-001', raw: { id: 'CS-1', planId: 'MISSING-PLAN', bars: [{ id: 'BAR-1' }] } },
  { type: 'Cutting Sheet', number: 'CS-002', raw: { id: 'CS-2', planId: 'MISSING-PLAN', bars: [] } },
];

const result = await downloadLinkedWorkpackDocumentsPdf(records, {
  printMaterialCouponPdf: async (coupon) => { calls.push(coupon.id); return true; },
  printCuttingSheetPdf: async (sheet) => { calls.push(sheet.id); return true; },
}, { materialCouponDelayMs: 0, reportDelayMs: 0 });

assert.deepEqual(calls, ['MC-1', 'CS-1'], 'available reports must open sequentially in table order');
assert.deepEqual(result.downloaded.map((record) => record.number), ['MC-001', 'CS-001']);
assert.equal(result.unavailable.length, 2);
assert.match(result.unavailable.find(({ record }) => record.number === 'TS-001').reason, /ainda não disponível/);
assert.match(result.unavailable.find(({ record }) => record.number === 'CS-002').reason, /sem barras ou snapshot/);

const blocked = await downloadLinkedWorkpackDocumentsPdf([
  { type: 'Material Coupon', number: 'MC-BLOCKED', raw: { id: 'MC-BLOCKED' } },
], {
  printMaterialCouponPdf: async () => false,
}, { materialCouponDelayMs: 0, reportDelayMs: 0 });

assert.equal(blocked.downloaded.length, 0);
assert.match(blocked.unavailable[0].reason, /bloqueada pelo navegador/);

console.log('workpack document PDF download tests passed');
