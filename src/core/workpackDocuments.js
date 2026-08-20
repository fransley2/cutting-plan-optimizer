import { workpackRelationIds } from './workpackRelations.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function ids(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function resolveType(workpack, records, config, workpackLinks = []) {
  const storedIds = ids(workpackRelationIds(workpack, workpackLinks, config.targetType));
  const found = new Map();
  const missing = [];
  const validRecords = Array.isArray(records) ? records.filter((record) => record && typeof record === 'object') : [];
  const byId = new Map(validRecords.map((record) => [text(config.id(record)), record]).filter(([id]) => id));

  storedIds.forEach((id) => {
    const record = byId.get(id);
    if (record) found.set(id, { record, source: 'Workpack link' });
    else missing.push({ type: config.type, id });
  });

  validRecords.forEach((record) => {
    if (text(config.workpackId(record)) === text(workpack?.id)) {
      const id = text(config.id(record));
      if (id) found.set(id, { record, source: found.has(id) ? 'Workpack link + explicit reference' : 'Explicit workpackId' });
    }
  });

  return {
    records: [...found.values()].map(({ record, source }) => ({
      id: text(config.id(record)),
      type: config.type,
      number: text(config.number(record)) || 'No document number',
      status: text(config.status(record)) || 'N/A',
      updatedAt: text(config.updatedAt(record)),
      source,
      raw: record,
    })),
    missing,
  };
}

export function resolveWorkpackDocuments(workpack = {}, sources = {}) {
  const configurations = [
    {
      type: 'Material Coupon', records: sources.materialCoupons,
      targetType: 'MATERIAL_COUPON',
      id: (record) => record.id, number: (record) => record.number,
      status: (record) => record.status, updatedAt: (record) => record.updatedAt || record.issuedAt || record.createdAt,
      workpackId: (record) => record.workpackId,
    },
    {
      type: 'Cutting Sheet', records: sources.cuttingSheets,
      targetType: 'CUTTING_SHEET',
      id: (record) => record.id, number: (record) => record.number,
      status: (record) => record.status, updatedAt: (record) => record.updatedAt || record.createdAt,
      workpackId: (record) => record.workpackId,
    },
    {
      type: 'Return Material Voucher', records: sources.returnMaterialVouchers,
      targetType: 'RETURN_MATERIAL_VOUCHER',
      id: (record) => record.id, number: (record) => record.number,
      status: (record) => record.status, updatedAt: (record) => record.updatedAt || record.issuedAt || record.createdAt,
      workpackId: (record) => record.workpackId,
    },
    {
      type: 'Task Sheet', records: sources.taskSheets,
      targetType: 'TASK_SHEET',
      id: (record) => record.id, number: (record) => record.number,
      status: (record) => record.status, updatedAt: (record) => record.updatedAt || record.createdAt,
      workpackId: (record) => record.workpackId,
    },
  ];

  const resolved = configurations.map((config) => resolveType(workpack, config.records, config, sources.workpackLinks));
  const timestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  };
  return {
    records: resolved.flatMap((entry) => entry.records).sort((a, b) => {
      const aTime = timestamp(a.updatedAt);
      const bTime = timestamp(b.updatedAt);
      if (aTime == null && bTime == null) return a.number.localeCompare(b.number);
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime - aTime;
    }),
    missing: resolved.flatMap((entry) => entry.missing),
  };
}
