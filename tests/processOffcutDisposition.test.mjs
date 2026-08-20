import assert from 'node:assert/strict';
import { processOffcutDisposition } from '../src/workflows/processOffcutDisposition.js';
import { RETURN_OFFCUT_MODES } from '../src/workflows/returnOffcutsToStock.js';
import { OFFCUT_STATUS } from '../src/data/offcuts.js';
import { STOCK_MOVEMENT_TYPES } from '../src/data/stockMovements.js';
import { AUDIT_EVENT_TYPES } from '../src/data/auditLog.js';

const parent = {
  id: 'INV-PARENT', trace: 'TRACE-PARENT', traceability: 'TRACE-PARENT', projectId: 'P1',
  po: 'PO-1', poItem: '10', materialGrade: 'A36', heatNo: 'H1', materialDescription: 'Pipe',
};
const inventory = [];
const offcutRecords = [];
const movements = [];
const audits = [];
const dependencies = {
  getInventoryItem: async (id) => id === 'TRACE-PARENT' || id === 'INV-PARENT' ? parent : null,
  createInventoryItem: async (item) => { inventory.push(structuredClone(item)); return item; },
  saveOffcut: async (item) => { const saved = { ...item, id: item.id || `OFFCUT-${offcutRecords.length + 1}` }; offcutRecords.push(structuredClone(saved)); return saved; },
  listOffcuts: async () => structuredClone(offcutRecords),
  createStockMovement: async (item) => { const saved = { ...item, id: `MOV-${movements.length + 1}` }; movements.push(structuredClone(saved)); return saved; },
  createAuditEvent: async (item) => { const saved = { ...item, id: `AUD-${audits.length + 1}` }; audits.push(structuredClone(saved)); return saved; },
};

const source = {
  traceability: 'TRACE-PARENT_OC', parentTrace: 'TRACE-PARENT', parentInventoryItemId: 'INV-PARENT',
  length: 850, qty: 1, materialGrade: 'A36', heatNo: 'H1', description: 'Offcut from Pipe',
};
const returned = await processOffcutDisposition({
  offcuts: [source], mode: RETURN_OFFCUT_MODES.OPERATIONAL_STOCK,
  context: { projectId: 'P1', workpackId: 'WP1', sourceDocumentType: 'NESTING_RESULT', sourceDocumentId: 'PLAN1', userName: 'Tester' },
  dependencies,
});
assert.equal(returned.processed.length, 1);
assert.equal(returned.inventoryItems.length, 1);
assert.equal(inventory[0].traceability, 'TRACE-PARENT-OC-001');
assert.equal(inventory[0].parentStockId, 'INV-PARENT');
assert.equal(inventory[0].status, 'available');
assert.equal(inventory[0].isOffcut, true);
assert.equal(offcutRecords[0].status, OFFCUT_STATUS.RETURNED_TO_STOCK);
assert.equal(offcutRecords[0].newInventoryItemId, 'TRACE-PARENT-OC-001');
assert.equal(movements[0].movementType, STOCK_MOVEMENT_TYPES.RETURN_OFFCUT);
assert.equal(movements[0].lengthDelta, 850);
assert.equal(audits[0].eventType, AUDIT_EVENT_TYPES.RETURN_OFFCUT);

const duplicate = await processOffcutDisposition({ offcuts: [source], mode: RETURN_OFFCUT_MODES.OPERATIONAL_STOCK, dependencies });
assert.equal(duplicate.processed.length, 0);
assert.equal(duplicate.skipped.length, 1);
assert.equal(inventory.length, 1, 'reprocessing the same generated offcut must not duplicate Inventory');

const scrapSource = { ...source, traceability: 'TRACE-PARENT_OC_2', length: 200, scrapReason: 'Too short' };
const scrapped = await processOffcutDisposition({
  offcuts: [scrapSource], mode: RETURN_OFFCUT_MODES.SCRAP,
  context: { projectId: 'P1', sourceDocumentType: 'NESTING_RESULT', sourceDocumentId: 'PLAN1', userName: 'Tester' },
  dependencies,
});
assert.equal(scrapped.processed.length, 1);
assert.equal(scrapped.inventoryItems.length, 0);
assert.equal(offcutRecords.at(-1).status, OFFCUT_STATUS.SCRAP);
assert.equal(movements.at(-1).movementType, STOCK_MOVEMENT_TYPES.SCRAP_OFFCUT);
assert.equal(audits.at(-1).eventType, AUDIT_EVENT_TYPES.SCRAP_OFFCUT);

const fiscalSource = { ...source, traceability: 'TRACE-PARENT_OC_RMV', length: 700 };
const movementCountBeforeFiscal = movements.length;
const fiscal = await processOffcutDisposition({
  offcuts: [fiscalSource], mode: RETURN_OFFCUT_MODES.FISCAL_RETURN_PENDING,
  context: { projectId: 'P1', returnMaterialVoucherId: 'RMV-1', sourceDocumentType: 'RETURN_MATERIAL_VOUCHER', sourceDocumentId: 'RMV-1', userName: 'Tester' },
  dependencies,
});
assert.equal(fiscal.processed.length, 1);
assert.equal(fiscal.inventoryItems.length, 0);
assert.equal(fiscal.processed[0].status, OFFCUT_STATUS.PENDING_RMV);
assert.equal(fiscal.processed[0].returnMaterialVoucherId, 'RMV-1');
assert.equal(movements.length, movementCountBeforeFiscal, 'pending RMV must not create an Inventory movement before receipt');
assert.equal(audits.at(-1).eventType, AUDIT_EVENT_TYPES.GENERATE_RMV);
await assert.rejects(() => processOffcutDisposition({
  offcuts: [{ ...source, traceability: 'TRACE-SHORT', length: 499 }],
  mode: RETURN_OFFCUT_MODES.OPERATIONAL_STOCK,
  dependencies,
}), /500 mm ou mais/);
console.log('process offcut disposition tests passed');
