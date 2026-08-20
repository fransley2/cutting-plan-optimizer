import { calculateReportsDashboard, reportEquipmentTagOptions } from './reportCalculations.js';
import { buildMtoProcurementCoverage } from './mtoPoItemAllocation.js';

function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return value == null ? '' : String(value).trim(); }
function token(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function kpiValue(dashboard, key) {
  return dashboard?.executive?.kpis?.find((item) => item.key === key)?.value ?? 0;
}

function readinessStatus(availability, criticalItems, demandItems) {
  if (!demandItems) return 'NOT_PLANNED';
  if (criticalItems > 0) return 'BLOCKED';
  if (availability >= 0.999999) return 'READY';
  return 'PARTIAL';
}

function workpackTag(workpack, equipmentsById) {
  const direct = text(workpack.equipmentTag || workpack.tag || workpack.clientTag);
  if (direct) return direct;
  const equipment = equipmentsById.get(text(workpack.equipmentId));
  const tags = list(equipment?.equipmentTags || equipment?.tags).map(text).filter(Boolean);
  return tags.length === 1 ? tags[0] : text(equipment?.clientTag);
}

export function buildOperationalReadiness(data = {}, options = {}) {
  const tagOptions = reportEquipmentTagOptions(data);
  const equipmentsById = new Map(list(data.equipments).map((item) => [text(item.id), item]));
  const rows = tagOptions.map((option) => {
    const dashboard = calculateReportsDashboard(data, { equipmentTag: option.value, today: options.today });
    const availability = Number(kpiValue(dashboard, 'materialAvailability')) || 0;
    const criticalItems = Number(kpiValue(dashboard, 'criticalItems')) || 0;
    const demandItems = Number(dashboard.assumptions?.demandItemCount) || 0;
    return {
      tag: option.value,
      equipmentId: option.equipmentId,
      equipmentName: option.equipmentName,
      availability,
      criticalItems,
      demandItems,
      status: readinessStatus(availability, criticalItems, demandItems),
    };
  });
  const byTag = new Map(rows.map((row) => [token(row.tag), row]));
  const workpackRows = list(data.workpacks).map((workpack) => ({ workpack, row: byTag.get(token(workpackTag(workpack, equipmentsById))) }))
    .filter(({ row }) => row);
  const overall = calculateReportsDashboard(data, { today: options.today });
  return {
    materialAvailability: Number(kpiValue(overall, 'materialAvailability')) || 0,
    criticalItems: Number(kpiValue(overall, 'criticalItems')) || 0,
    delayedPurchaseOrders: Number(overall.assumptions?.overduePurchaseOrders) || 0,
    readyWorkpacks: workpackRows.filter(({ row }) => row.status === 'READY').length,
    readyEquipments: rows.filter((row) => row.status === 'READY').length,
    blockedEquipments: rows.filter((row) => row.status === 'BLOCKED').length,
    partialEquipments: rows.filter((row) => row.status === 'PARTIAL').length,
    equipmentRows: rows,
  };
}

function projectName(project = {}, projectId = '') {
  return text(project.name || project.shortCode || project.code) || (projectId ? `Projeto ${projectId}` : 'Projeto não resolvido');
}

function readinessRowProjectId(row, equipmentsById, projectIdsByTag) {
  const equipmentProjectId = text(equipmentsById.get(text(row.equipmentId))?.projectId);
  if (equipmentProjectId) return equipmentProjectId;
  const tagProjectIds = projectIdsByTag.get(token(row.tag)) || new Set();
  return tagProjectIds.size === 1 ? [...tagProjectIds][0] : '';
}

export function groupEquipmentReadinessByProject(readiness = {}, data = {}) {
  const projectsById = new Map(list(data.projects).map((project) => [text(project.id), project]));
  const equipmentsById = new Map(list(data.equipments).map((equipment) => [text(equipment.id), equipment]));
  const projectIdsByTag = new Map();
  list(data.mtoItems).forEach((item) => {
    const projectId = text(item.projectId);
    list([item.tag, item.clientTag]).map(text).filter(Boolean).forEach((tag) => {
      const key = token(tag);
      if (!projectIdsByTag.has(key)) projectIdsByTag.set(key, new Set());
      if (projectId) projectIdsByTag.get(key).add(projectId);
    });
  });

  const groups = new Map();
  list(readiness.equipmentRows).forEach((row) => {
    const projectId = readinessRowProjectId(row, equipmentsById, projectIdsByTag);
    if (!groups.has(projectId)) {
      groups.set(projectId, {
        projectId,
        projectName: projectName(projectsById.get(projectId), projectId),
        totalEquipments: 0,
        criticalEquipments: 0,
        equipmentRows: [],
      });
    }
    const group = groups.get(projectId);
    const equipmentRow = {
      projectId,
      tag: row.tag,
      equipmentId: row.equipmentId,
      equipmentName: row.equipmentName,
      availability: row.availability,
      status: row.status,
      criticalItems: row.criticalItems,
      demandItems: row.demandItems,
    };
    group.totalEquipments += 1;
    if (row.status === 'BLOCKED') group.criticalEquipments += 1;
    group.equipmentRows.push(equipmentRow);
  });

  return [...groups.values()].sort((left, right) => left.projectName.localeCompare(right.projectName, 'pt-BR', { numeric: true }));
}

export function buildEquipmentReadinessByProject(data = {}, options = {}) {
  return groupEquipmentReadinessByProject(buildOperationalReadiness(data, options), data);
}

function deliveryDate(poItem = {}) {
  return text(poItem.expectedDeliveryDate || poItem.contractualDeliveryDate);
}

function linkedPoItem(detail = {}) {
  const poItem = detail.poItem || {};
  const purchaseOrder = detail.purchaseOrder || {};
  return {
    linked: true,
    poItemId: text(poItem.id),
    purchaseOrderId: text(purchaseOrder.id || poItem.purchaseOrderId),
    poNumber: text(purchaseOrder.poNumber),
    itemNumber: text(poItem.itemNumber),
    deliveryDate: deliveryDate(poItem),
    status: text(poItem.status) || 'UNKNOWN',
  };
}

function uniqueBy(records, keySelector) {
  return [...new Map(records.map((record) => [keySelector(record), record])).values()];
}

function earliestDeliveryDate(poItems) {
  return poItems.map((item) => item.deliveryDate).filter(Boolean).sort()[0] || '';
}

function equipmentRowForDemand(row, readinessByEquipmentId, readinessByTag) {
  return readinessByEquipmentId.get(text(row.equipmentId)) || readinessByTag.get(token(row.tag)) || null;
}

export function buildMaterialBottlenecks(data = {}, options = {}) {
  const readiness = buildOperationalReadiness(data, options);
  const dashboard = calculateReportsDashboard(data, options);
  const coverageByMtoId = new Map(buildMtoProcurementCoverage({
    mtoItems: list(data.mtoItems),
    purchaseOrders: list(data.purchaseOrders),
    poItems: list(data.poItems),
    allocations: list(data.allocations),
    receipts: list(data.receipts),
    receiptLines: list(data.receiptLines),
    materialUnits: list(data.materialUnits),
  }).map((coverage) => [text(coverage.mtoItem?.id), coverage]));
  const readinessByEquipmentId = new Map(readiness.equipmentRows
    .filter((row) => text(row.equipmentId))
    .map((row) => [text(row.equipmentId), row]));
  const readinessByTag = new Map(readiness.equipmentRows.map((row) => [token(row.tag), row]));
  const forecastsByPoItem = new Map();
  list(data.deliveryForecasts).filter((record) => text(record.status).toUpperCase() !== 'CANCELLED').forEach((record) => {
    const poItemId = text(record.poItemId); const date = text(record.ctcoArrivalDate || record.ctcoForecastDate);
    if (!poItemId || !date) return;
    const current = forecastsByPoItem.get(poItemId);
    if (!current || date < current.deliveryDate) forecastsByPoItem.set(poItemId, { deliveryDate: date, stage: text(record.stage), customsChannel: text(record.customsChannel) });
  });
  const equipmentGroups = new Map();
  const bottleneckGroups = new Map();

  list(dashboard.demandAnalysis?.itemRows).filter((row) => row.critical === true).forEach((row) => {
    const equipment = equipmentRowForDemand(row, readinessByEquipmentId, readinessByTag);
    if (!equipment) return;
    const coverage = coverageByMtoId.get(text(row.id));
    const poItems = uniqueBy(list(coverage?.allocations).map(linkedPoItem), (item) => item.poItemId).map((item) => ({ ...item, ...(forecastsByPoItem.get(item.poItemId) || {}) }));
    const material = {
      mtoLineId: text(row.id),
      materialKey: text(row.materialKey),
      identCode: text(row.identCode),
      materialGrade: text(row.materialGrade),
      materialDescription: text(row.materialDescription),
      shortageQty: Number(row.shortageQty) || 0,
      missingQty: Number(row.missingQty) || 0,
      poLinked: poItems.length > 0,
      poLinkStatus: poItems.length ? 'LINKED' : 'NO_LINKED_PO',
      poItems,
    };
    const equipmentKey = text(equipment.equipmentId) || token(equipment.tag);
    if (!equipmentGroups.has(equipmentKey)) {
      equipmentGroups.set(equipmentKey, {
        projectId: text(row.projectId),
        equipmentId: text(equipment.equipmentId),
        equipmentName: text(equipment.equipmentName),
        tag: text(equipment.tag),
        availability: Number(equipment.availability) || 0,
        status: text(equipment.status),
        criticalItems: Number(equipment.criticalItems) || 0,
        nextDeliveryDate: '',
        poItems: [],
        materials: [],
      });
    }
    const equipmentGroup = equipmentGroups.get(equipmentKey);
    equipmentGroup.materials.push(material);
    equipmentGroup.poItems.push(...poItems);

    const bottleneckPoItems = poItems.length ? poItems : [null];
    bottleneckPoItems.forEach((poItem) => {
      const key = poItem ? `PO_ITEM:${poItem.poNumber}:${poItem.itemNumber}` : `MATERIAL:${row.projectId}:${row.materialKey}`;
      if (!bottleneckGroups.has(key)) {
        bottleneckGroups.set(key, {
          key,
          projectId: text(row.projectId),
          materialKey: text(row.materialKey),
          identCode: text(row.identCode),
          materialGrade: text(row.materialGrade),
          poLinked: Boolean(poItem),
          poLinkStatus: poItem ? 'LINKED' : 'NO_LINKED_PO',
          poItem,
          equipmentCount: 0,
          tags: [],
          equipments: [],
        });
      }
      const group = bottleneckGroups.get(key);
      group.equipments.push({
        equipmentId: text(equipment.equipmentId),
        equipmentName: text(equipment.equipmentName),
        tag: text(equipment.tag),
      });
    });
  });

  const criticalEquipmentRows = [...equipmentGroups.values()].map((group) => {
    const poItems = uniqueBy(group.poItems, (item) => item.poItemId);
    return { ...group, nextDeliveryDate: earliestDeliveryDate(poItems), poItems };
  });
  const bottlenecks = [...bottleneckGroups.values()].map((group) => {
    const equipments = uniqueBy(group.equipments, (equipment) => text(equipment.equipmentId) || token(equipment.tag));
    return { ...group, equipmentCount: equipments.length, tags: equipments.map((equipment) => equipment.tag), equipments };
  });
  return { criticalEquipmentRows, bottlenecks };
}

function couponPayload(record = {}) { return record.metadata?.coupon || record; }

function searchableRecord(type, title, subtitle, phase, entityId, values, extra = {}) {
  return { type, title: text(title), subtitle: text(subtitle), phase, entityId: text(entityId), searchText: token(values.join(' ')), ...extra };
}

export function searchOperationalRecords(data = {}, query = '', limit = 30) {
  const needle = token(query);
  if (needle.length < 2) return [];
  const purchaseOrdersById = new Map(list(data.purchaseOrders).map((item) => [text(item.id), item]));
  const records = [];
  list(data.equipments).forEach((item) => {
    const tags = list(item.equipmentTags || item.tags).map(text).filter(Boolean);
    if (!tags.length && item.clientTag) tags.push(text(item.clientTag));
    tags.forEach((tag) => records.push(searchableRecord('Equipment', tag, item.equipmentName || item.name || item.code, 'equipments', item.id, [tag, item.code, item.equipmentName, item.name, item.system], { tag })));
  });
  list(data.drawings).forEach((item) => records.push(searchableRecord('Drawing', item.drawingNo || item.engineeringCode || item.id, item.title, 'drawings', item.id, [item.drawingNo, item.engineeringCode, item.title, item.revision, item.equipmentId])));
  list(data.mtoItems).forEach((item) => records.push(searchableRecord('MTO', item.itemNo || item.identCode || item.id, [item.identCode || item.material, item.tag || item.clientTag].filter(Boolean).join(' · '), 'mto', item.id, [item.itemNo, item.identCode, item.material, item.description, item.tag, item.clientTag, item.equipmentName])));
  list(data.purchaseOrders).forEach((item) => records.push(searchableRecord('Purchase Order', `PO ${item.poNumber || item.id}`, item.subject, 'procurement', item.id, [item.poNumber, item.subject, item.supplierId])));
  list(data.poItems).forEach((item) => {
    const po = purchaseOrdersById.get(text(item.purchaseOrderId));
    records.push(searchableRecord('PO Item', `${po?.poNumber || 'PO'} / ${item.itemNumber}`, item.identCode || item.description, 'procurement', item.id, [po?.poNumber, item.itemNumber, item.identCode, item.materialCode, item.description, item.traceability]));
  });
  list(data.inventoryItems || data.inventory).forEach((item) => records.push(searchableRecord('Inventory', item.traceability || item.trace || item.id, [item.identCode, item.heatNo || item.heatNumber, item.status].filter(Boolean).join(' · '), 'inventory', item.id, [item.id, item.traceability, item.trace, item.identCode, item.sapCode, item.heatNo, item.heatNumber, item.mir, item.po, item.poItem])));
  list(data.workpacks).forEach((item) => records.push(searchableRecord('Workpack', item.wpNo || item.id, item.title, 'workpacks', item.id, [item.wpNo, item.title, item.equipmentId, item.equipmentTag, item.tag])));
  list(data.materialCoupons).forEach((record) => {
    const item = couponPayload(record);
    records.push(searchableRecord('Material Coupon', item.header?.mcCode || record.number || record.id, item.header?.destination || item.header?.scope, 'material-coupons', record.id, [item.header?.mcCode, record.number, item.header?.reference, ...list(item.lines).flatMap((line) => [line.traceability, line.heatNo, line.tag, line.identCode, line.sapCode, line.po, line.poItem])]));
  });
  list(data.cuttingSheets).forEach((item) => records.push(searchableRecord('Cutting Sheet', item.number || item.code || item.id, item.title || item.metadata?.materialCouponNumber, 'cut-sheets', item.id, [item.number, item.code, item.title, item.workpackId, item.materialCouponId, item.metadata?.materialCouponNumber, ...list(item.pieces).flatMap((piece) => [piece.id, piece.mark, piece.position, piece.tag, piece.traceability])])));
  list(data.returnMaterialVouchers).forEach((item) => records.push(searchableRecord('RMV', item.number || item.voucherNumber || item.id, item.status, 'return-material', item.id, [item.number, item.voucherNumber, item.workpackId, item.materialCouponId, ...list(item.items || item.lines).flatMap((line) => [line.traceability, line.heatNo, line.tag, line.identCode])])));
  return records.filter((record) => record.searchText.includes(needle))
    .sort((left, right) => Number(!token(left.title).startsWith(needle)) - Number(!token(right.title).startsWith(needle)) || left.title.localeCompare(right.title, undefined, { numeric: true }))
    .slice(0, Math.max(1, Number(limit) || 30))
    .map(({ searchText, ...record }) => record);
}
