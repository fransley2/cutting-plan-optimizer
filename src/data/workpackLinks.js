import { getDB } from './database.js';
import { idbGetAll, idbGet, idbPut, idbDelete, idbClear, idbRequest, idbTransaction } from './idb.js';
import { legacyWorkpackRelationInputs, stripLegacyWorkpackRelations } from '../core/workpackRelations.js';

const STORE_NAME = 'workpackLinks';

export const WORKPACK_LINK_TARGETS = Object.freeze({
  DRAWING_REVISION: 'DRAWING_REVISION',
  MTO_ITEM: 'MTO_ITEM',
  INVENTORY_ITEM: 'INVENTORY_ITEM',
  NESTING_PLAN: 'NESTING_PLAN',
  MATERIAL_COUPON: 'MATERIAL_COUPON',
  CUTTING_SHEET: 'CUTTING_SHEET',
  RETURN_MATERIAL_VOUCHER: 'RETURN_MATERIAL_VOUCHER',
  OFFCUT: 'OFFCUT',
});

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function text(value) { return value == null ? '' : String(value).trim(); }
function nowIso() { return new Date().toISOString(); }

function normalizeWorkpackLink(input = {}, existing = null) {
  return {
    id: text(input.id) || existing?.id || createId(),
    projectId: text(input.projectId || existing?.projectId),
    workpackId: text(input.workpackId || existing?.workpackId),
    targetType: text(input.targetType || existing?.targetType).toUpperCase(),
    targetId: text(input.targetId || existing?.targetId),
    relationType: text(input.relationType || existing?.relationType || 'CONTAINS').toUpperCase(),
    status: text(input.status || existing?.status || 'ACTIVE').toUpperCase(),
    linkedAt: text(input.linkedAt || existing?.linkedAt) || nowIso(),
    linkedBy: text(input.linkedBy || existing?.linkedBy),
    unlinkedAt: text(input.unlinkedAt !== undefined ? input.unlinkedAt : existing?.unlinkedAt),
    unlinkedBy: text(input.unlinkedBy !== undefined ? input.unlinkedBy : existing?.unlinkedBy),
    metadata: input.metadata && typeof input.metadata === 'object'
      ? structuredClone(input.metadata)
      : structuredClone(existing?.metadata || {}),
  };
}

function validateLink(record) {
  if (!record.workpackId) throw new Error('workpackId is required for a Workpack link.');
  if (!record.targetType) throw new Error('targetType is required for a Workpack link.');
  if (!record.targetId) throw new Error('targetId is required for a Workpack link.');
}

function matches(record, filters = {}) {
  const upperFields = new Set(['targetType', 'relationType', 'status']);
  return ['projectId', 'workpackId', 'targetType', 'targetId', 'relationType', 'status'].every((field) => {
    if (filters[field] == null || filters[field] === '') return true;
    const expected = text(filters[field]);
    return record[field] === (upperFields.has(field) ? expected.toUpperCase() : expected);
  });
}

export async function saveWorkpackLink(input = {}) {
  const db = await getDB();
  const existing = input.id ? await idbGet(db, STORE_NAME, input.id) : null;
  const record = normalizeWorkpackLink(input, existing);
  validateLink(record);
  await idbPut(db, STORE_NAME, record);
  return record;
}

export async function ensureWorkpackLink(input = {}) {
  const records = await listWorkpackLinks({ workpackId: input.workpackId });
  const targetType = text(input.targetType).toUpperCase();
  const targetId = text(input.targetId);
  const relationType = text(input.relationType || 'CONTAINS').toUpperCase();
  const existing = records.find((item) => item.targetType === targetType
    && item.targetId === targetId && item.relationType === relationType && item.status === 'ACTIVE');
  return existing || saveWorkpackLink(input);
}

function targetIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

export async function replaceWorkpackTargetLinks(input = {}) {
  const workpackId = text(input.workpackId);
  const targetType = text(input.targetType).toUpperCase();
  const desiredIds = new Set(targetIds(input.targetIds));
  if (!workpackId) throw new Error('workpackId is required to replace Workpack links.');
  if (!targetType) throw new Error('targetType is required to replace Workpack links.');
  const allLinks = await listWorkpackLinks();
  if (targetType === WORKPACK_LINK_TARGETS.INVENTORY_ITEM) {
    const conflicts = allLinks.filter((link) => text(link.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
      && link.targetType === targetType && link.workpackId !== workpackId && desiredIds.has(text(link.targetId)));
    if (conflicts.length) {
      const error = new Error('WORKPACK_INVENTORY_ITEM_CONFLICT');
      error.code = 'WORKPACK_INVENTORY_ITEM_CONFLICT';
      error.inventoryItemIds = targetIds(conflicts.map((link) => link.targetId));
      error.workpackIds = targetIds(conflicts.map((link) => link.workpackId));
      throw error;
    }
  }
  const current = allLinks.filter((link) => link.workpackId === workpackId && link.targetType === targetType);
  const handled = new Set();
  for (const link of current) {
    const targetId = text(link.targetId);
    if (handled.has(targetId)) {
      if (text(link.status || 'ACTIVE').toUpperCase() === 'ACTIVE') await unlinkWorkpackTarget(link.id, input.linkedBy);
      continue;
    }
    handled.add(targetId);
    if (desiredIds.has(targetId)) {
      if (text(link.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
        await saveWorkpackLink({ ...link, status: 'ACTIVE', linkedAt: nowIso(), linkedBy: input.linkedBy, unlinkedAt: '', unlinkedBy: '' });
      }
    } else if (text(link.status || 'ACTIVE').toUpperCase() === 'ACTIVE') {
      await unlinkWorkpackTarget(link.id, input.linkedBy);
    }
  }
  for (const targetId of desiredIds) {
    if (handled.has(targetId)) continue;
    await ensureWorkpackLink({
      projectId: input.projectId,
      workpackId,
      targetType,
      targetId,
      relationType: input.relationType || 'CONTAINS',
      linkedBy: input.linkedBy,
    });
  }
  return listWorkpackLinks({ workpackId });
}

export async function migrateLegacyWorkpackLinks(workpacks = [], actor = '') {
  const db = await getDB();
  const candidates = Array.isArray(workpacks) ? workpacks : [];
  const migratedCount = await idbTransaction(db, [STORE_NAME, 'workpacks'], 'readwrite', async (stores) => {
    const existing = await idbRequest(stores[STORE_NAME].getAll());
    let count = 0;
    for (const workpack of candidates) {
      const inputs = legacyWorkpackRelationInputs(workpack, existing);
      for (const input of inputs) {
        const saved = normalizeWorkpackLink({ ...input, linkedBy: actor });
        validateLink(saved);
        await idbRequest(stores[STORE_NAME].put(saved));
        existing.push(saved);
        count += 1;
      }
      const canonical = stripLegacyWorkpackRelations(workpack);
      if (Object.keys(canonical).length !== Object.keys(workpack).length) {
        await idbRequest(stores.workpacks.put(canonical));
      }
    }
    return count;
  });
  return { migratedCount, links: await listWorkpackLinks() };
}

export async function listWorkpackLinks(filters = {}) {
  const db = await getDB();
  const records = await idbGetAll(db, STORE_NAME);
  return records.filter((record) => matches(record, filters));
}

export async function unlinkWorkpackTarget(id, actor = '') {
  const db = await getDB();
  const current = await idbGet(db, STORE_NAME, id);
  if (!current) return null;
  return saveWorkpackLink({ ...current, status: 'INACTIVE', unlinkedAt: nowIso(), unlinkedBy: actor });
}

export async function clearWorkpackLinks() {
  const db = await getDB();
  return idbClear(db, STORE_NAME);
}
