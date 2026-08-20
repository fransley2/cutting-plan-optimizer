import assert from 'node:assert/strict';
import {
  DESCRIPTION_COLUMN_KEY,
  FOOTER_TEMPLATE_END_ROW,
  FOOTER_TEMPLATE_START_ROW,
  ITEM_END_ROW,
  ITEM_START_ROW,
  calcularLinhasNecessarias,
  planejarPaginasMaterialCoupon,
} from '../src/documents/materialCouponExcel.js';

{
  assert.equal(calcularLinhasNecessarias('ABC'), 1);
  assert.equal(calcularLinhasNecessarias('A'.repeat(36)), 1);
  assert.equal(calcularLinhasNecessarias('A'.repeat(37)), 2);
  assert.equal(calcularLinhasNecessarias('A'.repeat(90)), 3);
  assert.equal(calcularLinhasNecessarias(''), 1);
  assert.equal(calcularLinhasNecessarias(null), 1);
  assert.equal(calcularLinhasNecessarias(undefined), 1);
}

{
  const plan = planejarPaginasMaterialCoupon(Array.from({ length: 12 }, () => ({ materialDescription: 'Short' })));
  assert.equal(plan.pages.length, 1);
  assert.equal(plan.pages[0].items.length, 12);
  assert.equal(plan.warnings.length, 0);
}

{
  const plan = planejarPaginasMaterialCoupon(Array.from({ length: 13 }, () => ({ materialDescription: 'Short' })));
  assert.equal(plan.pages.length, 2);
  assert.equal(plan.pages[0].items.length, 12);
  assert.equal(plan.pages[1].items.length, 1);
}

{
  const plan = planejarPaginasMaterialCoupon([
    { materialDescription: 'Short' },
    { materialDescription: 'A'.repeat(80) },
    { materialDescription: 'Short' },
    { materialDescription: 'Short' },
  ]);
  assert.equal(plan.pages.length, 1);
  assert.equal(plan.pages[0].totalVisualLines, 6);
}

{
  const plan = planejarPaginasMaterialCoupon([
    { materialDescription: 'A'.repeat(500) },
    { materialDescription: 'Short' },
  ]);
  assert.equal(plan.pages.length, 2);
  assert.equal(plan.pages[0].items.length, 1);
  assert.equal(plan.warnings.length, 1);
}

{
  assert.equal(ITEM_START_ROW, 17);
  assert.equal(ITEM_END_ROW, 28);
  assert.equal(DESCRIPTION_COLUMN_KEY, 'E');
  assert.equal(FOOTER_TEMPLATE_START_ROW, 30);
  assert.equal(FOOTER_TEMPLATE_END_ROW, 36);
}

console.log('materialCouponExcel tests passed');
