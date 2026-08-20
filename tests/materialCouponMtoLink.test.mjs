import test from 'node:test';
import assert from 'node:assert/strict';

import { linkMaterialCouponLinesToEquipmentTags, linkMaterialCouponLinesToMto, materialCouponEquipmentTagOptions } from '../src/core/materialCouponIssue.js';

const workpack = { id: 'WP-1', projectId: 'P-1' };
const workpackLinks = [
  { workpackId: 'WP-1', targetType: 'MTO_ITEM', targetId: 'MTO-1', status: 'ACTIVE' },
  { workpackId: 'WP-1', targetType: 'MTO_ITEM', targetId: 'MTO-2', status: 'ACTIVE' },
];
const mtoItems = [
  { id: 'MTO-1', projectId: 'P-1', identCode: 'ID-100', tag: 'TAG-01', equipmentId: 'EQ-1' },
  { id: 'MTO-2', projectId: 'P-1', material: 'ID-200', tag: 'TAG-02', equipmentId: 'EQ-2' },
  { id: 'MTO-OUT', projectId: 'P-1', identCode: 'ID-100', tag: 'TAG-OUT' },
];

test('links a Coupon inventory line through its active PO allocation within the Workpack', () => {
  const result = linkMaterialCouponLinesToMto({
    lines: [{ id: 'L-1', inventoryItemId: 'INV-1' }],
    inventoryItems: [{ id: 'INV-1', identCode: 'ID-200', metadata: { poItemId: 'POI-1' } }],
    mtoItems,
    allocations: [{ mtoLineId: 'MTO-1', poItemId: 'POI-1', status: 'ACTIVE' }],
    workpack,
    workpackLinks,
    projectId: 'P-1',
  });

  assert.equal(result.lines[0].mtoItemId, 'MTO-1');
  assert.equal(result.lines[0].tag, 'TAG-01');
  assert.equal(result.lines[0].mtoLinkMethod, 'AUTO_PO_ALLOCATION');
  assert.equal(result.linkedCount, 1);
});

test('falls back to IDENT CODE, including the legacy MTO material field', () => {
  const result = linkMaterialCouponLinesToMto({
    lines: [{ inventoryItemId: 'INV-2' }],
    inventoryItems: [{ id: 'INV-2', identCode: ' id-200 ' }],
    mtoItems,
    workpack,
    workpackLinks,
    projectId: 'P-1',
  });

  assert.equal(result.lines[0].mtoItemId, 'MTO-2');
  assert.equal(result.lines[0].mtoLinkMethod, 'AUTO_IDENT_CODE');
});

test('does not choose when IDENT CODE is ambiguous inside the Workpack', () => {
  const result = linkMaterialCouponLinesToMto({
    lines: [{ inventoryItemId: 'INV-1' }],
    inventoryItems: [{ id: 'INV-1', identCode: 'ID-100' }],
    mtoItems: [...mtoItems, { id: 'MTO-3', projectId: 'P-1', identCode: 'ID-100', tag: 'TAG-03' }],
    workpack,
    workpackLinks: [...workpackLinks, { workpackId: 'WP-1', targetType: 'MTO_ITEM', targetId: 'MTO-3', status: 'ACTIVE' }],
    projectId: 'P-1',
  });

  assert.equal(result.lines[0].mtoItemId, undefined);
  assert.equal(result.ambiguousCount, 1);
});

test('preserves an existing manual MTO link', () => {
  const result = linkMaterialCouponLinesToMto({
    lines: [{ inventoryItemId: 'INV-1', mtoItemId: 'MTO-2' }],
    inventoryItems: [{ id: 'INV-1', metadata: { poItemId: 'POI-1' } }],
    mtoItems,
    allocations: [{ mtoLineId: 'MTO-1', poItemId: 'POI-1', status: 'ACTIVE' }],
    workpack,
    workpackLinks,
    projectId: 'P-1',
  });

  assert.equal(result.lines[0].mtoItemId, 'MTO-2');
  assert.equal(result.lines[0].mtoLinkMethod, 'MANUAL');
});

test('suggests the physical Equipment TAG from the linked MTO item', () => {
  const equipments = [
    { id: 'EQ-1', projectId: 'P-1', equipmentName: 'Production Jumper', equipmentTags: ['TAG-01', 'TAG-02'] },
    { id: 'EQ-OUT', projectId: 'P-2', equipmentName: 'Other project', equipmentTags: ['TAG-OUT'] },
  ];
  const result = linkMaterialCouponLinesToEquipmentTags({
    lines: [{ mtoItemId: 'MTO-1' }],
    mtoItems,
    equipments,
    projectId: 'P-1',
  });

  assert.deepEqual(materialCouponEquipmentTagOptions(equipments, 'P-1').map((option) => option.tag), ['TAG-01', 'TAG-02']);
  assert.equal(result.lines[0].tag, 'TAG-01');
  assert.equal(result.lines[0].equipmentId, 'EQ-1');
  assert.equal(result.lines[0].equipmentTagLinkMethod, 'AUTO_MTO');
});

test('keeps a manual Equipment TAG selection ahead of the MTO suggestion', () => {
  const result = linkMaterialCouponLinesToEquipmentTags({
    lines: [{ mtoItemId: 'MTO-1', tag: 'TAG-02', equipmentTagLinkMethod: 'MANUAL' }],
    mtoItems,
    equipments: [{ id: 'EQ-1', projectId: 'P-1', equipmentName: 'Production Jumper', equipmentTags: ['TAG-01', 'TAG-02'] }],
    projectId: 'P-1',
  });

  assert.equal(result.lines[0].tag, 'TAG-02');
  assert.equal(result.lines[0].equipmentTagLinkMethod, 'MANUAL');
});
