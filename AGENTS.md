# AGENTS.md

## Project

This is a browser-based Cutting Plan Optimizer for Material Management and Fabrication workflows.

The application must feel like a mix of Microsoft 365, Power BI and SharePoint Modern UI.

## Core rule before writing any code

Before generating or changing code, apply this decision chain:

1. Does this need to exist?

   * If no, skip it. YAGNI.

2. Already in this codebase?

   * If yes, reuse it. Do not rewrite.

3. Stdlib does it?

   * If yes, use the standard library.

4. Native platform feature?

   * If yes, use the browser/native platform feature.

5. Installed dependency?

   * If yes, use the existing dependency.

6. One line?

   * If yes, keep it one line.

7. Only then:

   * Write the minimum code that works.

   Nunca adicione uma biblioteca nova, um framework, ou um padrão genérico "para o
futuro" sem justificar por que as 6 perguntas acima não resolveram.

## Architecture rules

* Do not create a monolithic HTML file.
* Do not mix business logic with DOM rendering.
* Do not read input values inside optimizer functions.
* Optimizer functions must be pure and testable.
* UI functions may render data, but must not calculate business logic.
* Data import/export must stay isolated from UI.
* IndexedDB schema ownership must stay centralized in `src/data/database.js`.
* Inventory persistence must stay isolated in `src/data/inventoryDB.js`.
* Excel import/export must stay isolated in `src/data/excel.js`.
* If Excel handling is split later, use `src/data/excelImport.js` and `src/data/excelExport.js`.

## FMS Expansion Rules

* Do not turn plans into the source of truth for FMS documents.
* Plans are optimization snapshots only.
* MTO, Material Coupon, Cutting Sheet, RMV, stock movements, and audit events must be represented as separate data concepts.
* Every material status change must be auditable.
* Do not update inventory quantities/status without creating an audit or stock movement record once the audit layer exists.
* Offcuts returned from cutting must become new inventory items with `parentStockId` linking back to the original stock item.
* MTO matching must be implemented outside `src/core/allocate.js`.
* `src/core/allocate.js` must remain a pure nesting/optimization engine.
* Reports must read from document data and must not calculate nesting.

## Planned FMS Modules

* `src/core/materialMatch.js`
* `src/core/materialStatus.js`
* `src/core/documentNumbering.js`

* `src/data/mtoImport.js`
* `src/data/mtoDB.js`
* `src/data/stockMovements.js`
* `src/data/auditLog.js`
* `src/data/materialCoupons.js`
* `src/data/cuttingSheets.js`
* `src/data/returnMaterialVouchers.js`

* `src/ui/mtoImportModal.js`
* `src/ui/mtoMatchModal.js`
* `src/ui/materialCouponModal.js`
* `src/ui/cuttingSheetModal.js`
* `src/ui/returnVoucherModal.js`
* `src/ui/auditHistoryModal.js`

* `src/reports/printVisual.js`
* `src/reports/printCuttingSheet.js`
* `src/reports/materialCouponReport.js`
* `src/reports/returnVoucherReport.js`
* `src/reports/auditReport.js`

## Safe FMS Implementation Order

1. Documentation alignment.
2. Audit log and stock movement data layer.
3. MTO import parser and MTO persistence.
4. MTO x inventory matching.
5. Adapter from matched MTO/inventory to the existing nesting flow.
6. Material Coupon document.
7. Cutting Sheet document and printable report.
8. Return Material Voucher and reusable offcut return.
9. Audit history UI.
10. Full FMS backup/export/import coverage.

## Design rules

Use:

* Segoe UI Variable, Segoe UI, system-ui, sans-serif
* Deep Teal `#22505F` as primary brand color
* Blue Grey `#6B8F9C` as secondary color
* Editable fields with `#FFF2CC` background
* Technical red `#8B2C2C` for critical alerts
* Clean white background
* Fluent UI inspired cards
* Power BI inspired dashboards
* Audit-friendly layouts
* Responsive design
* Professional data tables
* Filter panel
* Material Management and Fabrication workflow language

Do not use:

* Emoji icons
* Decorative gradients without purpose
* Excessive shadows
* Random color palette
* Tailwind CDN
* Font Awesome CDN
* Bootstrap
* UI frameworks unless explicitly requested

## Code style

* Use native JavaScript ES Modules.
* Do not migrate to TypeScript unless explicitly requested.
* Do not add a build step unless a future requirement makes it necessary.
* Prefer named functions over large anonymous blocks.
* Prefer `const`.
* Use `crypto.randomUUID()` instead of custom UUID code.
* Use `structuredClone()` instead of JSON stringify/parse cloning.
* Use `<dialog>` for modals unless there is a strong reason not to.
* Use `<template>` for repeated HTML fragments.
* Use CSS variables for design tokens.
* Keep files small and focused.
* Avoid `innerHTML` with user/imported data.
* Prefer `textContent`, `replaceChildren`, and `createElement`.
* Every exported function must have a clear single responsibility.

## Testing

* The optimizer must be testable without the browser DOM.
* Add tests for:

  * kerf calculation
  * trim calculation
  * material mismatch
  * unallocated parts
  * best-fit vs first-fit
  * generated offcuts
  * minimum offcut rule

## Refactoring rule

When refactoring legacy code:

1. Preserve behavior first.
2. Move code into modules.
3. Add tests around the optimizer.
4. Replace unsafe rendering.
5. Improve UI only after behavior is stable.

Never rewrite the whole app in one uncontrolled pass.

## Legacy reference

The file `legacy/original.html` is the frozen legacy reference.

Rules:

* Do not import `legacy/original.html`.
* Do not execute code from `legacy/original.html`.
* Do not copy large blocks from the legacy file.
* Use it only to understand existing behavior.
* When migrating a feature, extract behavior, not structure.
* Every migrated feature must be placed in the correct module:

  * calculation/optimization: `src/core/`
  * Excel, storage, persistence: `src/data/`
  * rendering and user interaction: `src/ui/`
  * reports and printing: `src/reports/`
  * translations: `src/i18n/`
* Update `legacy/MIGRATION.md` after each migrated feature.
