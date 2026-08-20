# FMS Material Traceability

## Compatibility boundary

- `src/data/inventoryImport.js` and `src/data/mtoImport.js` keep their current input contracts.
- New identifiers and workflow metadata are added after parsing, in persistence and workflow modules.
- Legacy Workpack ID arrays are migrated idempotently on Workpack load. New and updated Workpack records no longer persist relationship arrays; `workpackLinks` is authoritative, including inactive links.
- Child records use the stable Project ID. Existing project-name references are migrated idempotently during application startup; names remain display metadata only.

## Operational chain

```text
Project -> Equipment -> Drawing revision -> MTO item
        -> MTO/PO allocation -> PO Item -> Material Receipt -> Physical Unit
        -> Inspection -> Inventory -> Reservation -> Material Coupon -> Dispatch
        -> Cutting Sheet -> Cut confirmation -> Material transformation
        -> Part / reusable offcut / scrap -> RMV -> Inventory
```

## Physical events

| Event | Inventory effect | Register |
| --- | --- | --- |
| Accepted Material Unit posted | Create available Inventory item from the physical receipt unit | `RECEIVE_MATERIAL` |
| Coupon issued | Reserve available quantity | `materialReservations`, `RESERVE_STOCK` |
| Coupon dispatched | Transfer warehouse custody to fabrication | `ISSUE_MATERIAL` |
| Cutting Sheet confirmed | Mark parent stock consumed and create genealogy | `CONSUME_STOCK`, `materialTransformations` |
| RMV received | Create child Inventory item with `parentStockId` | `RETURN_OFFCUT` |
| Scrap confirmed | Do not create available Inventory | `SCRAP_OFFCUT` |

## Sources of truth

- Documents own their header, status and embedded lines.
- Every embedded document line has a stable ID.
- `workpackLinks` owns Workpack-to-record relationships.
- `stockMovements` owns quantitative and custody history.
- `materialTransformations` owns parent-to-output genealogy.
- `auditLog` owns actor, time and reason evidence.
- Nesting plans remain optimization snapshots and never own physical stock state.

## Release controls

- Workpacks can originate from `MTO_LINES`, `CUTTING_SHEETS`, `DOCUMENTS_ONLY` or `FREE_LINE`.
- Moving a Workpack to `RELEASED_FOR_CUTTING` creates a snapshot of linked engineering, MTO, Inventory and document records.
- Drawing revision changes create a new record and mark the previous revision `SUPERSEDED`.
- A Material Coupon is linked to a Cutting Sheet only by an explicit reference; sharing a Workpack is not sufficient.
- Inventory Quality values explicitly marked pending, rejected or quarantined cannot be reserved.
- Material Receipt records physical arrival only. Accepted `materialUnits` remain `PENDING_POSTING` until the user explicitly posts them; the atomic workflow then creates the Inventory item and `RECEIVE_MATERIAL` movement and changes the unit to `POSTED` / `AVAILABLE`.
- Purchase Order revisions are append-only; creating a new revision supersedes the current revision without deleting its history.
- Procurement accepts reviewed PO data from PDF, Excel, CSV, TSV or an editable paste grid. SAP PDF extraction reads the PO header and material-item blocks, including Material Details, quantity, unit, unit price and delivery date. Missing Traceability and IDENT CODE must be confirmed instead of invented.
- Procurement infers material classification, item type, OD, thickness, grade and length only from explicit description evidence; explicit inch measurements are converted to millimeters. Drawback is an explicit YES/NO decision per PO Item, with a bulk action for a common regime. Equipment destination is not owned by the PO import and is reserved for PO Item-to-MTO allocation.
- Receiving is navigated as PO card -> PO Item list -> item batch modal. A batch records physical receipt data, QC decision and checklist, traceability, location and measured dimensions. Even an ACCEPTED batch remains pending Inventory posting until the explicit posting transaction is confirmed.
- PO Database keeps the operational list separate from the selected PO detail. New PO imports run in the shared application modal, and spreadsheet files may contain introductory rows before the recognized 21-column header.
- The 21-column PO register is persisted at PO/PO Item level; the operational PO list exposes only the fields needed for daily control.

## Next increments

1. Move the remaining cross-store workflows to native multi-store IndexedDB transactions. Cutting Sheet confirmation, Material Coupon inventory actions, Material Unit posting and the complete RMV issue/receipt/cancellation lifecycle are now atomic.
2. Add MTO Line x PO Item allocation management and Drawing-level procurement coverage.
3. Expand Data Quality beyond Project identity to cover orphan Workpack links, missing document sources and incomplete material genealogy.
