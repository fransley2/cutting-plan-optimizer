import assert from 'node:assert/strict';
import { resetMaterialCouponDraftControls } from '../src/features/materialCoupon/materialCouponService.js';

function classList(...initial) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    remove: (...items) => items.forEach((item) => values.delete(item)),
  };
}

function control({ automatic = false } = {}) {
  return {
    dataset: { mcField: automatic ? 'project' : 'destination' },
    classList: classList(...(automatic ? ['mc-automatic-input'] : [])),
    disabled: true,
    readOnly: true,
    focused: false,
    focus() { this.focused = true; },
    matches(selector) {
      return selector === '[data-mc-field]:not(.mc-automatic-input)'
        && !this.classList.contains('mc-automatic-input');
    },
  };
}

const destination = control();
const notes = control();
const automaticProject = control({ automatic: true });
const addRow = { disabled: true, matches: () => false };
const attributes = new Set(['inert', 'aria-busy']);
const workspace = {
  classList: classList('is-locked'),
  removeAttribute: (name) => attributes.delete(name),
  querySelectorAll: () => [destination, notes, automaticProject, addRow],
};

// Issued coupon after save/print/close: editable controls are still locked.
assert.equal(destination.disabled, true);
assert.equal(destination.readOnly, true);

// New Coupon path resets the reused workspace and focuses its first editable field.
const editableFields = resetMaterialCouponDraftControls(workspace, { focusFirst: true });

assert.equal(workspace.classList.contains('is-locked'), false);
assert.equal(attributes.has('inert'), false);
assert.equal(attributes.has('aria-busy'), false);
assert.deepEqual(editableFields, [destination, notes]);
editableFields.forEach((field) => {
  assert.equal(field.disabled, false);
  assert.equal(field.readOnly, false);
});
assert.equal(destination.focused, true);
assert.equal(addRow.disabled, false);
assert.equal(automaticProject.disabled, false);
assert.equal(automaticProject.readOnly, true);

console.log('Material Coupon New Coupon DOM smoke test passed');
