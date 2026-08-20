import { getDB } from './database.js';
import { idbGetAll, idbPut, idbDelete, idbClear } from './idb.js';

const STORE_NAME = 'materialTransformations';

export const MATERIAL_TRANSFORMATION_TYPES = Object.freeze({
  CUT_PART: 'CUT_PART', REUSABLE_OFFCUT: 'REUSABLE_OFFCUT', SCRAP: 'SCRAP',
  PROCESS_LOSS: 'PROCESS_LOSS', UNUSED_MATERIAL: 'UNUSED_MATERIAL',
});

function createId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function text(value) { return value == null ? '' : String(value).trim(); }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

export function normalizeMaterialTransformation(input = {}) {
  return {
    id: text(input.id) || createId(),
    projectId: text(input.projectId),
    workpackId: text(input.workpackId),
    cuttingSheetId: text(input.cuttingSheetId),
    cuttingSheetBarId: text(input.cuttingSheetBarId),
    materialCouponId: text(input.materialCouponId),
    materialCouponLineId: text(input.materialCouponLineId),
    parentInventoryItemId: text(input.parentInventoryItemId),
    outputType: text(input.outputType).toUpperCase(),
    outputId: text(input.outputId),
    mtoItemId: text(input.mtoItemId),
    drawingRevisionId: text(input.drawingRevisionId),
    mark: text(input.mark),
    position: text(input.position),
    quantity: numberValue(input.quantity),
    lengthMm: numberValue(input.lengthMm),
    widthMm: numberValue(input.widthMm),
    thicknessMm: numberValue(input.thicknessMm),
    weightKg: numberValue(input.weightKg),
    createdAt: text(input.createdAt) || new Date().toISOString(),
    createdBy: text(input.createdBy),
    metadata: input.metadata && typeof input.metadata === 'object' ? structuredClone(input.metadata) : {},
  };
}

export async function createMaterialTransformation(input = {}) {
  const db = await getDB();
  const record = normalizeMaterialTransformation(input);
  if (!record.cuttingSheetId) throw new Error('cuttingSheetId is required for material genealogy.');
  if (!record.parentInventoryItemId) throw new Error('parentInventoryItemId is required for material genealogy.');
  if (!Object.values(MATERIAL_TRANSFORMATION_TYPES).includes(record.outputType)) throw new Error('Invalid material transformation type.');
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function listMaterialTransformations(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => ['projectId', 'workpackId', 'cuttingSheetId', 'parentInventoryItemId', 'outputType', 'outputId', 'mtoItemId']
    .every((field) => filters[field] == null || filters[field] === '' || record[field] === String(filters[field])));
}

export async function deleteMaterialTransformation(id) {
  const db = await getDB();
  return idbDelete(db, STORE_NAME, id);
}

export async function clearMaterialTransformations() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
