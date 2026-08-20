import assert from 'node:assert/strict';
import { normalizeOrganization } from '../src/data/organizations.js';
import { normalizePurchaseOrder, normalizePurchaseOrderItem } from '../src/data/purchaseOrders.js';
import { buildMaterialUnits, normalizeMaterialReceipt, normalizeMaterialReceiptLine } from '../src/data/materialReceipts.js';
import { buildInventoryItemFromMaterialUnit, getMaterialUnitPostingEligibility } from '../src/core/materialUnitPosting.js';
import { vendorProfileCompleteness, vendorQualificationSummary } from '../src/core/vendorProfile.js';

const supplier = normalizeOrganization({ legalName: 'Tubacex', organizationType: 'supplier, manufacturer', vendorCode: '12345' });
assert.equal(supplier.legalName, 'Tubacex');
assert.deepEqual(supplier.organizationType, ['SUPPLIER', 'MANUFACTURER']);
const qualifiedSupplier = normalizeOrganization({
  ...supplier,
  taxId: 'BR-123', country: 'Brazil', primaryEmail: 'vendor@example.com', primaryPhone: '+55 21 99999-0000',
  supplyCategories: 'Pipe, Bend, Pipe', qualificationStatus: 'qualified', qualificationExpiry: '2027-12-31', certifications: 'ISO 9001, ISO 14001',
});
assert.deepEqual(qualifiedSupplier.supplyCategories, ['Pipe', 'Bend']);
assert.deepEqual(qualifiedSupplier.certifications, ['ISO 9001', 'ISO 14001']);
assert.equal(vendorProfileCompleteness(qualifiedSupplier).percent, 100);
assert.equal(vendorQualificationSummary(qualifiedSupplier, new Date('2027-01-01T00:00:00')), 'QUALIFIED');
assert.equal(vendorQualificationSummary(qualifiedSupplier, new Date('2028-01-01T00:00:00')), 'EXPIRED');

const po = normalizePurchaseOrder({ projectId: 'p-1', poNumber: '1520813', supplierId: supplier.id, currentRevision: '03' });
const item = normalizePurchaseOrderItem({ projectId: 'p-1', purchaseOrderId: po.id, itemNumber: '42', orderedQuantity: '5', unitOfMeasure: 'ea', unitPrice: '2732.11', expectedDeliveryDate: '2026-04-03', itemType: 'BEND', materialCategory: 'SUPERDUPLEX', diameterOdMm: 168.3, thicknessMm: 19.1, lengthArea: 0.5, lengthAreaUnit: 'M', drawback: 'YES' });
assert.equal(po.currentRevision, '03');
assert.equal(item.orderedQuantity, 5);
assert.equal(item.unitOfMeasure, 'EA');
assert.equal(item.unitPrice, 2732.11);
assert.equal(item.expectedDeliveryDate, '2026-04-03');

const receipt = normalizeMaterialReceipt({ projectId: 'p-1', receiptNumber: '7901', supplierId: supplier.id, arrivalDate: '2026-06-01' });
const line = normalizeMaterialReceiptLine({ receiptId: receipt.id, purchaseOrderId: po.id, poItemId: item.id, receivedQuantity: 3, unitOfMeasure: 'EA', inspectionStatus: 'ACCEPTED', remarks: 'Packing checked', visualCheck: true, markingCheck: true, documentsCheck: false, quantityCheck: true });
const units = buildMaterialUnits(receipt, line, { physicalUnitCount: 3, traceabilityPrefix: 'GTR1520813-42', originalDiameterMm: 170, originalLengthMm: 6100, originalThicknessMm: 20, weightKg: 50 });
assert.equal(units.length, 3);
assert.equal(units.reduce((total, unit) => total + unit.quantity, 0), 3);
assert.equal(units[0].traceability, 'GTR1520813-42-001');
assert.equal(units[0].inspectionStatus, 'ACCEPTED');
assert.equal(units[0].inventoryStatus, 'PENDING_POSTING', 'accepted receipt must not become Inventory automatically');
assert.equal(units[0].postingStatus, 'PENDING');
assert.equal(units[0].originalDiameterMm, 170);
assert.equal(units[0].originalThicknessMm, 20);
assert.equal(units[0].weightKg, 50);
assert.equal(line.remarks, 'Packing checked');
assert.equal(line.documentsCheck, false);
const sequentialUnits = buildMaterialUnits(receipt, line, { traceabilities: ['GBD1523734-1-013', 'GBD1523734-1-014', 'GBD1523734-1-015'] });
assert.equal(sequentialUnits.length, 3);
assert.deepEqual(sequentialUnits.map((unit) => unit.quantity), [1, 1, 1]);
assert.deepEqual(sequentialUnits.map((unit) => unit.traceability), ['GBD1523734-1-013', 'GBD1523734-1-014', 'GBD1523734-1-015']);
assert.deepEqual(sequentialUnits.map((unit) => unit.isIndividuallySerialized), [true, true, true]);
assert.deepEqual(getMaterialUnitPostingEligibility(units[0]), { eligible: true, code: '' });
assert.equal(getMaterialUnitPostingEligibility({ ...units[0], inspectionStatus: 'HOLD' }).code, 'MATERIAL_UNIT_NOT_ACCEPTED');

const inventoryItem = buildInventoryItemFromMaterialUnit({
  unit: units[0], poItem: { ...item, description: 'Pipe SDSS', materialCategory: 'PIPE', identCode: 'PIPE-SDSS' },
  purchaseOrder: { ...po, subject: 'Super Duplex Pipes' }, receipt, supplier: { tradeName: 'TUBACEX' }, timestamp: '2026-07-16T10:00:00.000Z',
});
assert.equal(inventoryItem.trace, units[0].traceability);
assert.equal(inventoryItem.status, 'available');
assert.equal(inventoryItem.qualityStatus, 'ACCEPTED');
assert.equal(inventoryItem.metadata.materialUnitId, units[0].id);
assert.equal(inventoryItem.diaMm, 170);
assert.equal(inventoryItem.thicknessMm, 20);
assert.equal(inventoryItem.weightKg, 50);
assert.equal(inventoryItem.itemType, 'BEND');
assert.equal(inventoryItem.drawback, 'YES');

const serializedInventoryItem = buildInventoryItemFromMaterialUnit({
  unit: sequentialUnits[0], poItem: item, purchaseOrder: po, receipt, supplier,
});
assert.equal(serializedInventoryItem.metadata.isIndividuallySerialized, true);

const inheritedDimensions = buildInventoryItemFromMaterialUnit({
  unit: { ...units[0], originalLengthMm: 0 }, poItem: item, purchaseOrder: po, receipt, supplier,
});
assert.equal(inheritedDimensions.lengthMm, 500, 'received material inherits PO item length when the physical unit has no override');

console.log('procurement data tests passed');
