import { calculateWorkpackProgress } from './workpackProgress.js';
import { WORKPACK_RELATION_TYPES, workpackRelationIds } from './workpackRelations.js';
import { calculatePoItemMetrics } from './procurementMetrics.js';
import { summarizePoItemDeliveryForecasts } from './poDeliveryForecast.js';

const TERMINAL_WORKPACK_STATUSES = new Set(['COMPLETED', 'CANCELLED']);
const EXECUTION_WORKPACK_STATUSES = new Set(['RELEASED_FOR_CUTTING', 'IN_FABRICATION']);
const READY_WORKPACK_STATUSES = new Set(['MATERIAL_RESERVED', 'READY_FOR_NESTING', 'IN_NESTING', 'NESTED', 'RELEASED_FOR_CUTTING']);
const MATERIAL_COUPON_READY_STATUSES = new Set(['ISSUED', 'DISPATCHED', 'RECEIVED', 'CLOSED']);
const CUTTING_SHEET_READY_STATUSES = new Set(['RELEASED', 'CUT', 'CLOSED']);
const PRIORITY_ORDER = Object.freeze({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 });
const PPC_STATUS_ORDER = Object.freeze({ BLOCKED: 0, AT_RISK: 1, READY: 2, IN_PROGRESS: 3, DATA_ISSUE: 4, NOT_PLANNED: 5, COMPLETE: 6 });

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return value == null ? '' : String(value).trim(); }
function upper(value) { return text(value).toUpperCase(); }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function sum(records, selector) { return list(records).reduce((total, record) => total + numberValue(selector(record)), 0); }
function ratio(value, total) { return total > 0 ? Math.max(0, Math.min(1, value / total)) : 0; }

function parseReportDate(value) {
  const normalized = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function usableEquipmentTag(value) {
  const tag = upper(value);
  return tag && !['_', '-', '—', 'N/A', 'NA', 'NONE', 'SEM TAG'].includes(tag);
}

function equipmentTags(equipment = {}) {
  const values = Array.isArray(equipment.equipmentTags || equipment.tags)
    ? equipment.equipmentTags || equipment.tags
    : text(equipment.equipmentTags || equipment.tags || equipment.clientTag).split(/[\n;,]+/);
  return [...new Set(values.map(text).filter(usableEquipmentTag))];
}

function workpackTag(workpack = {}, equipmentsById = new Map()) {
  const direct = text(workpack.equipmentTag || workpack.tag || workpack.clientTag);
  if (usableEquipmentTag(direct)) return direct;
  const equipment = equipmentsById.get(text(workpack.equipmentId));
  const tags = equipmentTags(equipment);
  return tags.length === 1 ? tags[0] : text(equipment?.clientTag);
}

function relationIds(workpack, links, targetType) {
  return workpackRelationIds(workpack, links, targetType);
}

function linkedRecords(records, workpack, links, targetType) {
  const ids = new Set(relationIds(workpack, links, targetType));
  return list(records).filter((record) => text(record.workpackId) === text(workpack.id) || ids.has(text(record.id)));
}

function latestStatus(records = []) {
  const values = list(records).map((record) => upper(record.status)).filter(Boolean);
  return values[values.length - 1] || '';
}

function documentStatus(workpack, data) {
  const coupons = linkedRecords(data.materialCoupons, workpack, data.workpackLinks, WORKPACK_RELATION_TYPES.MATERIAL_COUPON);
  const cuttingSheets = linkedRecords(data.cuttingSheets, workpack, data.workpackLinks, WORKPACK_RELATION_TYPES.CUTTING_SHEET);
  const couponReady = coupons.some((record) => MATERIAL_COUPON_READY_STATUSES.has(upper(record.status)));
  const cuttingSheetReady = cuttingSheets.some((record) => CUTTING_SHEET_READY_STATUSES.has(upper(record.status)));
  return {
    couponStatus: latestStatus(coupons) || 'NÃO EMITIDO',
    cuttingSheetStatus: latestStatus(cuttingSheets) || 'NÃO EMITIDA',
    couponReady,
    cuttingSheetReady,
    summary: `MC: ${latestStatus(coupons) || 'pendente'} · CS: ${latestStatus(cuttingSheets) || 'pendente'}`,
  };
}

function workpackProcurementSchedule(mtoIds, plannedStart, data) {
  const mtoSet = new Set(mtoIds.map(text));
  const allocations = list(data.allocations).filter((record) => upper(record.status) !== 'CANCELLED' && mtoSet.has(text(record.mtoLineId || record.mtoItemId)));
  if (!allocations.length) return { linkedPoItems: 0, etaCtco: '', etaRisk: 'UNLINKED', onTimeRatio: 0 };
  const poItemsById = new Map(list(data.poItems).map((record) => [text(record.id), record]));
  const purchaseOrdersById = new Map(list(data.purchaseOrders).map((record) => [text(record.id), record]));
  const summaries = new Map();
  allocations.forEach((allocation) => {
    const poItem = poItemsById.get(text(allocation.poItemId));
    if (!poItem || summaries.has(poItem.id)) return;
    const metrics = calculatePoItemMetrics({
      item: poItem, purchaseOrder: purchaseOrdersById.get(text(poItem.purchaseOrderId)), receipts: data.receipts, receiptLines: data.receiptLines,
      materialUnits: data.materialUnits, inventoryItems: data.inventoryItems || data.inventory, reservations: data.materialReservations, stockMovements: data.stockMovements,
    });
    summaries.set(poItem.id, summarizePoItemDeliveryForecasts({ poItem, forecasts: data.deliveryForecasts, receivedQuantity: metrics.received, needByDate: plannedStart }));
  });
  const weighted = allocations.reduce((result, allocation) => {
    const weight = Math.max(0, numberValue(allocation.allocatedQuantity));
    const summary = summaries.get(text(allocation.poItemId));
    result.total += weight; result.onTime += weight * numberValue(summary?.onTimeRatio); return result;
  }, { total: 0, onTime: 0 });
  const riskOrder = ['NO_ETA', 'PARTIAL_ETA', 'LATE', 'ON_TIME', 'RECEIVED'];
  const etaRisk = [...summaries.values()].map((summary) => summary.risk).sort((left, right) => riskOrder.indexOf(left) - riskOrder.indexOf(right))[0] || 'NO_ETA';
  const dates = [...summaries.values()].map((summary) => summary.nextCtcoDate).filter(Boolean).sort();
  return { linkedPoItems: summaries.size, etaCtco: dates[0] || '', etaRisk, onTimeRatio: weighted.total > 0 ? weighted.onTime / weighted.total : 0 };
}

function workpackMaterialState(workpack, data, reportRowsByMtoId, readinessByEquipmentId, readinessByTag, plannedStart = '') {
  const mtoIds = relationIds(workpack, data.workpackLinks, WORKPACK_RELATION_TYPES.MTO_ITEM);
  const rows = mtoIds.map((id) => reportRowsByMtoId.get(text(id))).filter(Boolean);
  if (rows.length) {
    const required = sum(rows, (row) => row.requiredQty);
    const available = sum(rows, (row) => row.availableQty);
    const procurement = workpackProcurementSchedule(mtoIds, plannedStart, data);
    return {
      mtoIds,
      demandItems: rows.length,
      availability: ratio(available, required),
      criticalItems: rows.filter((row) => row.critical === true).length,
      inTransitQty: sum(rows, (row) => row.inTransitQty),
      dataIssue: false,
      ...procurement,
    };
  }

  const tag = workpackTag(workpack, new Map(list(data.equipments).map((item) => [text(item.id), item])));
  const readiness = readinessByEquipmentId.get(text(workpack.equipmentId)) || readinessByTag.get(upper(tag));
  if (readiness && numberValue(readiness.demandItems) > 0) {
    return {
      mtoIds: [],
      demandItems: numberValue(readiness.demandItems),
      availability: numberValue(readiness.availability),
      criticalItems: numberValue(readiness.criticalItems),
      inTransitQty: 0,
      dataIssue: false,
      linkedPoItems: 0,
      etaCtco: '',
      etaRisk: 'UNLINKED',
      onTimeRatio: 0,
    };
  }
  return { mtoIds: [], demandItems: 0, availability: 0, criticalItems: 0, inTransitQty: 0, dataIssue: true, linkedPoItems: 0, etaCtco: '', etaRisk: 'UNLINKED', onTimeRatio: 0 };
}

function plannedWindow(workpack, today, horizonEnd) {
  const start = parseReportDate(workpack.plannedStartDate || workpack.plannedStart);
  const finish = parseReportDate(workpack.plannedFinishDate || workpack.plannedFinish);
  const status = upper(workpack.status);
  const executing = EXECUTION_WORKPACK_STATUSES.has(status);
  const inHorizon = executing || Boolean(start && start <= horizonEnd && (!finish || finish >= today || finish < today));
  return {
    start,
    finish,
    inHorizon,
    overdue: Boolean(finish && finish < today && !TERMINAL_WORKPACK_STATUSES.has(status)),
  };
}

function blockerFor(row) {
  if (row.workpackStatus === 'ON_HOLD') return 'Workpack em HOLD';
  if (!row.plannedStart) return 'Data de início não informada';
  if (row.material.dataIssue) return 'MTO não vinculada ao Workpack';
  if (row.material.criticalItems > 0) return `${row.material.criticalItems} item(ns) sem cobertura`;
  if (row.material.availability < 0.999999 && row.material.inTransitQty > 0) {
    if (row.material.etaRisk === 'NO_ETA') return 'PO vinculada sem ETA CTCO';
    if (row.material.etaRisk === 'PARTIAL_ETA') return 'ETA CTCO cobre apenas parte da compra';
    if (row.material.etaRisk === 'LATE') return 'ETA CTCO após o início planejado';
    return row.material.etaCtco ? `Material em trânsito · ETA ${row.material.etaCtco}` : 'Material em trânsito';
  }
  if (row.material.availability < 0.999999) return 'Material ainda não disponível';
  if (['DRAFT', 'PLANNED', 'MTO_PENDING'].includes(row.workpackStatus)) return 'Preparação do Workpack pendente';
  if (row.workpackStatus === 'MATERIAL_PENDING') return 'Reserva de material pendente';
  if (!row.documents.couponReady) return 'Material Coupon pendente';
  if (['IN_NESTING', 'NESTED', 'RELEASED_FOR_CUTTING', 'IN_FABRICATION'].includes(row.workpackStatus) && !row.documents.cuttingSheetReady) return 'Cutting Sheet pendente';
  if (row.overdue) return 'Término planejado vencido';
  return 'Sem bloqueio crítico';
}

function ppcStatusFor(row) {
  if (row.workpackStatus === 'COMPLETED') return 'COMPLETE';
  if (!row.inHorizon) return 'NOT_PLANNED';
  if (row.workpackStatus === 'IN_FABRICATION') return 'IN_PROGRESS';
  if (row.material.dataIssue) return 'DATA_ISSUE';
  if (row.workpackStatus === 'ON_HOLD' || row.material.criticalItems > 0) return 'BLOCKED';
  if (row.material.availability < 0.999999 && row.material.inTransitQty > 0 && ['NO_ETA', 'PARTIAL_ETA', 'LATE'].includes(row.material.etaRisk)) return 'BLOCKED';
  if (READY_WORKPACK_STATUSES.has(row.workpackStatus) && row.material.availability >= 0.999999) return 'READY';
  return 'AT_RISK';
}

function workpackRows(data, options) {
  const baseDashboard = options.baseDashboard || {};
  const equipmentsById = new Map(list(data.equipments).map((item) => [text(item.id), item]));
  const reportRowsByMtoId = new Map(list(baseDashboard.demandAnalysis?.itemRows).map((row) => [text(row.id), row]));
  const readinessRows = list(options.equipmentReadinessByProject).flatMap((group) => list(group.equipmentRows));
  const readinessByEquipmentId = new Map(readinessRows.filter((row) => text(row.equipmentId)).map((row) => [text(row.equipmentId), row]));
  const readinessByTag = new Map(readinessRows.filter((row) => text(row.tag)).map((row) => [upper(row.tag), row]));
  const today = parseReportDate(options.today) || parseReportDate(new Date().toISOString()) || new Date();
  const horizonDays = Math.max(1, numberValue(options.horizonDays) || 28);
  const horizonEnd = addDays(today, horizonDays);
  const selectedTag = upper(options.equipmentTag);

  return list(data.workpacks)
    .filter((workpack) => upper(workpack.status) !== 'CANCELLED')
    .filter((workpack) => !selectedTag || upper(workpackTag(workpack, equipmentsById)) === selectedTag)
    .map((workpack) => {
      const window = plannedWindow(workpack, today, horizonEnd);
      const progress = calculateWorkpackProgress(workpack);
      const material = workpackMaterialState(workpack, data, reportRowsByMtoId, readinessByEquipmentId, readinessByTag, text(workpack.plannedStartDate || workpack.plannedStart));
      const documents = documentStatus(workpack, data);
      const equipment = equipmentsById.get(text(workpack.equipmentId));
      const row = {
        id: text(workpack.id),
        workpackNo: text(workpack.wpNo) || text(workpack.id),
        title: text(workpack.title),
        equipmentTag: workpackTag(workpack, equipmentsById) || '—',
        equipmentName: text(workpack.equipmentName || equipment?.equipmentName || equipment?.name),
        priority: upper(workpack.priority) || 'NORMAL',
        responsible: text(workpack.responsible) || '—',
        fabricationArea: text(workpack.fabricationArea) || 'Não definida',
        shift: text(workpack.shift) || '—',
        plannedStart: text(workpack.plannedStartDate || workpack.plannedStart),
        plannedFinish: text(workpack.plannedFinishDate || workpack.plannedFinish),
        plannedManHours: numberValue(workpack.plannedManHours),
        actualManHours: numberValue(workpack.actualManHours),
        progress: numberValue(progress.effectiveProgress),
        workpackStatus: upper(workpack.status) || 'PLANNED',
        material,
        documents,
        ...window,
      };
      row.ppcStatus = ppcStatusFor(row);
      row.blocker = blockerFor(row);
      row.materialCoverage = material.demandItems ? material.availability : null;
      row.documentStatus = documents.summary;
      row.isOverdue = window.overdue;
      return row;
    })
    .sort((left, right) => (
      (PPC_STATUS_ORDER[left.ppcStatus] ?? 99) - (PPC_STATUS_ORDER[right.ppcStatus] ?? 99)
      || (PRIORITY_ORDER[left.priority] ?? 99) - (PRIORITY_ORDER[right.priority] ?? 99)
      || text(left.plannedStart).localeCompare(text(right.plannedStart))
      || left.workpackNo.localeCompare(right.workpackNo, 'pt-BR', { numeric: true })
    ));
}

function kpi(key, label, value, options = {}) { return { key, label, value, ...options }; }

function workpackTableRows(rows) {
  return rows.filter((row) => row.ppcStatus !== 'COMPLETE').map((row) => ({
    priority: row.priority,
    workpackNo: row.workpackNo,
    equipmentTag: row.equipmentTag,
    plannedStart: row.plannedStart,
    plannedFinish: row.plannedFinish,
    workpackStatus: row.workpackStatus,
    ppcStatus: row.ppcStatus,
    materialCoverage: row.materialCoverage,
    etaCtco: row.material.etaCtco,
    poMtoLinks: row.material.linkedPoItems,
    blocker: row.blocker,
    responsible: row.responsible,
    isOverdue: row.isOverdue,
  }));
}

function aggregateMaterialBlockers(data, rows, baseDashboard, bottlenecks = {}) {
  const workpackByMtoId = new Map();
  rows.forEach((row) => row.material.mtoIds.forEach((id) => {
    if (!workpackByMtoId.has(id)) workpackByMtoId.set(id, []);
    workpackByMtoId.get(id).push(row);
  }));
  const poByMaterial = new Map();
  list(bottlenecks.bottlenecks).forEach((item) => {
    const key = `${text(item.projectId)}|${text(item.materialKey)}`;
    if (!poByMaterial.has(key)) poByMaterial.set(key, new Set());
    if (item.poItem?.poNumber) poByMaterial.get(key).add(`PO ${item.poItem.poNumber} / ${item.poItem.itemNumber || '—'}`);
  });
  const groups = new Map();
  list(baseDashboard.demandAnalysis?.itemRows).filter((row) => row.critical === true).forEach((row) => {
    const key = `${text(row.projectId)}|${text(row.materialKey)}`;
    if (!groups.has(key)) groups.set(key, {
      projectName: text(row.projectName), identCode: text(row.identCode), materialGrade: text(row.materialGrade),
      materialDescription: text(row.materialDescription), shortageQty: 0, workpacks: new Set(), tags: new Set(),
    });
    const group = groups.get(key);
    group.shortageQty += numberValue(row.shortageQty);
    list(workpackByMtoId.get(text(row.id))).forEach((workpack) => {
      group.workpacks.add(workpack.workpackNo);
      if (workpack.equipmentTag && workpack.equipmentTag !== '—') group.tags.add(workpack.equipmentTag);
    });
    if (row.tag) group.tags.add(text(row.tag));
  });
  return [...groups.entries()].map(([key, group]) => ({
    projectName: group.projectName,
    identCode: group.identCode,
    materialGrade: group.materialGrade,
    materialDescription: group.materialDescription,
    shortageQty: group.shortageQty,
    affectedWorkpacks: [...group.workpacks].join(', ') || '—',
    affectedTags: [...group.tags].join(', ') || '—',
    purchaseOrder: [...(poByMaterial.get(key) || [])].join(' · ') || 'Sem PO vinculada',
  })).sort((left, right) => right.shortageQty - left.shortageQty);
}

function statusFlow(rows) {
  const definitions = [
    ['PLANNED', 'Planejados', (row) => ['DRAFT', 'PLANNED', 'MTO_PENDING'].includes(row.workpackStatus)],
    ['MATERIAL', 'Material pendente', (row) => ['MATERIAL_PENDING', 'MATERIAL_RESERVED'].includes(row.workpackStatus)],
    ['NESTING', 'Nesting', (row) => ['READY_FOR_NESTING', 'IN_NESTING', 'NESTED'].includes(row.workpackStatus)],
    ['CUTTING', 'Liberados para corte', (row) => row.workpackStatus === 'RELEASED_FOR_CUTTING'],
    ['FABRICATION', 'Em fabricação', (row) => row.workpackStatus === 'IN_FABRICATION'],
    ['COMPLETE', 'Concluídos', (row) => row.workpackStatus === 'COMPLETED'],
  ];
  return definitions.map(([key, label, predicate]) => ({ key, label, value: rows.filter(predicate).length }));
}

function inventoryBalance(item = {}) {
  const explicit = ['balanceQty', 'availableQty', 'quantityAvailable'].map((field) => Number(item[field])).find(Number.isFinite);
  if (explicit != null) return Math.max(0, explicit);
  return Math.max(0, numberValue(item.qty || item.quantity) - numberValue(item.reservedQty) - numberValue(item.issuedQty));
}

function inventoryStatus(item = {}) { return upper(item.status || 'AVAILABLE'); }

function stockSummaryRows(data) {
  const groups = new Map();
  list(data.inventoryItems || data.inventory).forEach((item) => {
    const status = inventoryStatus(item);
    if (!groups.has(status)) groups.set(status, { status, records: 0, availableQty: 0, reservedQty: 0, weightKg: 0 });
    const row = groups.get(status);
    row.records += 1;
    row.availableQty += inventoryBalance(item);
    row.reservedQty += Math.max(0, numberValue(item.reservedQty));
    row.weightKg += Math.max(0, numberValue(item.weightKg));
  });
  return [...groups.values()].sort((left, right) => right.records - left.records || left.status.localeCompare(right.status));
}

function inspectionExceptionRows(data) {
  return list(data.materialUnits).map((unit) => ({
    traceability: text(unit.traceability || unit.trace || unit.id),
    identCode: text(unit.identCode),
    materialGrade: text(unit.materialGrade || unit.material),
    heatNo: text(unit.heatNo || unit.heatNumber),
    purchaseOrder: text(unit.poNumber || unit.po),
    inspectionStatus: upper(unit.inspectionStatus || unit.status || 'PENDING'),
    receivedDate: text(unit.receivedDate || unit.arrivalDate),
  })).filter((row) => !['ACCEPTED', 'CANCELLED'].includes(row.inspectionStatus));
}

function capacityRows(rows) {
  const groups = new Map();
  rows.filter((row) => !['COMPLETE', 'NOT_PLANNED'].includes(row.ppcStatus)).forEach((row) => {
    const key = `${row.fabricationArea}|${row.shift}`;
    if (!groups.has(key)) groups.set(key, { fabricationArea: row.fabricationArea, shift: row.shift, workpacks: 0, plannedManHours: 0, actualManHours: 0, remainingManHours: 0 });
    const group = groups.get(key);
    group.workpacks += 1;
    group.plannedManHours += row.plannedManHours;
    group.actualManHours += row.actualManHours;
    group.remainingManHours += Math.max(0, row.plannedManHours - row.actualManHours);
  });
  return [...groups.values()].sort((left, right) => right.remainingManHours - left.remainingManHours);
}

function productionRows(rows) {
  return rows.filter((row) => row.workpackStatus !== 'CANCELLED').map((row) => ({
    priority: row.priority,
    workpackNo: row.workpackNo,
    equipmentTag: row.equipmentTag,
    fabricationArea: row.fabricationArea,
    shift: row.shift,
    plannedStart: row.plannedStart,
    plannedFinish: row.plannedFinish,
    workpackStatus: row.workpackStatus,
    progress: row.progress / 100,
    plannedManHours: row.plannedManHours,
    actualManHours: row.actualManHours,
    responsible: row.responsible,
    isOverdue: row.isOverdue,
  }));
}

function importLogistics(data) {
  const purchaseOrdersById = new Map(list(data.purchaseOrders).map((record) => [text(record.id), record]));
  const activeAllocations = list(data.allocations).filter((record) => upper(record.status) !== 'CANCELLED');
  const linksByPoItem = new Map();
  activeAllocations.forEach((record) => linksByPoItem.set(text(record.poItemId), numberValue(linksByPoItem.get(text(record.poItemId))) + 1));
  const rows = []; let noEta = 0; let partialEta = 0;
  list(data.poItems).forEach((poItem) => {
    const purchaseOrder = purchaseOrdersById.get(text(poItem.purchaseOrderId));
    const metrics = calculatePoItemMetrics({
      item: poItem, purchaseOrder, receipts: data.receipts, receiptLines: data.receiptLines, materialUnits: data.materialUnits,
      inventoryItems: data.inventoryItems || data.inventory, reservations: data.materialReservations, stockMovements: data.stockMovements,
    });
    if (metrics.pending <= 0) return;
    const forecasts = list(data.deliveryForecasts).filter((record) => text(record.poItemId) === text(poItem.id) && upper(record.status) !== 'CANCELLED');
    const summary = summarizePoItemDeliveryForecasts({ poItem, forecasts, receivedQuantity: metrics.received });
    if (summary.risk === 'NO_ETA') noEta += 1;
    if (summary.risk === 'PARTIAL_ETA') partialEta += 1;
    forecasts.forEach((forecast) => rows.push({
      purchaseOrder: text(purchaseOrder?.poNumber), itemNumber: text(poItem.itemNumber), identCode: text(poItem.identCode),
      shipmentReference: text(forecast.shipmentReference), quantity: numberValue(forecast.quantity), unitOfMeasure: text(poItem.unitOfMeasure),
      stage: upper(forecast.stage), customsChannel: upper(forecast.customsChannel), portEtaDate: text(forecast.portEtaDate),
      customsReleaseForecastDate: text(forecast.customsReleaseForecastDate), pickupForecastDate: text(forecast.pickupForecastDate),
      ctcoForecastDate: text(forecast.ctcoArrivalDate || forecast.ctcoForecastDate), scheduleStatus: summary.risk,
      poMtoLinks: numberValue(linksByPoItem.get(text(poItem.id))),
    }));
    if (!forecasts.length || summary.unscheduledQuantity > 0.000001) rows.push({
      purchaseOrder: text(purchaseOrder?.poNumber), itemNumber: text(poItem.itemNumber), identCode: text(poItem.identCode), shipmentReference: 'Saldo sem programação',
      quantity: summary.unscheduledQuantity || metrics.pending, unitOfMeasure: text(poItem.unitOfMeasure), stage: 'SEM_PREVISÃO', customsChannel: '', portEtaDate: '',
      customsReleaseForecastDate: '', pickupForecastDate: '', ctcoForecastDate: '', scheduleStatus: summary.risk, poMtoLinks: numberValue(linksByPoItem.get(text(poItem.id))),
    });
  });
  return { rows: rows.sort((left, right) => text(left.ctcoForecastDate || '9999').localeCompare(text(right.ctcoForecastDate || '9999')) || left.purchaseOrder.localeCompare(right.purchaseOrder)), noEta, partialEta };
}

const PPC_QUEUE_COLUMNS = Object.freeze([
  { key: 'priority', label: 'Prioridade' }, { key: 'workpackNo', label: 'Workpack' }, { key: 'equipmentTag', label: 'Equipment Tag' },
  { key: 'plannedStart', label: 'Início planejado', format: 'date' }, { key: 'plannedFinish', label: 'Fim planejado', format: 'date' },
  { key: 'ppcStatus', label: 'Status PPC', format: 'operationalStatus' }, { key: 'materialCoverage', label: 'Cobertura material', format: 'percentNullable' },
  { key: 'etaCtco', label: 'ETA CTCO', format: 'date' }, { key: 'poMtoLinks', label: 'PO Items vinculados', format: 'number' },
  { key: 'blocker', label: 'Próxima pendência' }, { key: 'responsible', label: 'Responsável' },
]);

/** Builds meeting-oriented dashboards without changing any operational source of truth. */
export function buildPpcReports(data = {}, options = {}) {
  const rows = workpackRows(data, options);
  const horizonRows = rows.filter((row) => row.inHorizon && row.ppcStatus !== 'COMPLETE');
  const blockerRows = aggregateMaterialBlockers(data, rows, options.baseDashboard || {}, options.materialBottlenecks);
  const inspectionRows = inspectionExceptionRows(data);
  const logistics = importLogistics(data);
  const inventory = list(data.inventoryItems || data.inventory);
  const ready = horizonRows.filter((row) => row.ppcStatus === 'READY').length;
  const atRisk = horizonRows.filter((row) => row.ppcStatus === 'AT_RISK').length;
  const blocked = horizonRows.filter((row) => row.ppcStatus === 'BLOCKED').length;
  const inProgress = horizonRows.filter((row) => row.ppcStatus === 'IN_PROGRESS').length;
  const noPlan = rows.filter((row) => row.ppcStatus === 'NOT_PLANNED').length;
  const availableInventory = inventory.filter((item) => inventoryBalance(item) > 0 && !['REJECTED', 'CANCELLED', 'SCRAPPED'].includes(inventoryStatus(item)));
  const reservedInventory = inventory.filter((item) => numberValue(item.reservedQty) > 0);
  const holdUnits = list(data.materialUnits).filter((unit) => upper(unit.inspectionStatus || unit.status) === 'HOLD').length;
  const rejectedUnits = list(data.materialUnits).filter((unit) => upper(unit.inspectionStatus || unit.status) === 'REJECTED').length;
  const inspectionPending = list(data.materialUnits).filter((unit) => !['ACCEPTED', 'HOLD', 'REJECTED', 'CANCELLED'].includes(upper(unit.inspectionStatus || unit.status))).length;
  const fabricationRows = rows.filter((row) => row.workpackStatus !== 'CANCELLED');
  const inFabrication = fabricationRows.filter((row) => row.workpackStatus === 'IN_FABRICATION').length;
  const releasedForCutting = fabricationRows.filter((row) => row.workpackStatus === 'RELEASED_FOR_CUTTING').length;
  const overdue = fabricationRows.filter((row) => row.isOverdue).length;
  const plannedHours = sum(horizonRows, (row) => row.plannedManHours);
  const actualHours = sum(horizonRows, (row) => row.actualManHours);
  const legacyTables = list(options.baseDashboard?.executive?.tables).map((table) => ({ ...table, section: 'analysis' }));

  return {
    executive: {
      id: 'executive',
      title: 'PPC Control Tower',
      question: `Quais Workpacks podem avançar nos próximos ${numberValue(options.horizonDays) || 28} dias?`,
      kpis: [
        kpi('workpacksInHorizon', 'Workpacks no horizonte', horizonRows.length, { format: 'integer', note: 'Escopo planejado e em execução' }),
        kpi('readyWorkpacks', 'Prontos para avançar', ready, { format: 'integer', tone: 'positive' }),
        kpi('atRiskWorkpacks', 'Em risco', atRisk, { format: 'integer', tone: atRisk ? 'attention' : 'positive' }),
        kpi('blockedWorkpacks', 'Bloqueados', blocked, { format: 'integer', tone: blocked ? 'critical' : 'positive' }),
        kpi('inProgressWorkpacks', 'Em fabricação', inProgress, { format: 'integer' }),
        kpi('notPlannedWorkpacks', 'Sem planejamento', noPlan, { format: 'integer', tone: noPlan ? 'attention' : '' }),
      ],
      statusFlow: statusFlow(rows),
      tables: [
        { key: 'ppcWorkpackQueue', title: 'Fila PPC — próximas liberações', description: 'Workpacks priorizados por bloqueio, risco, prioridade e data planejada.', columns: PPC_QUEUE_COLUMNS, rows: workpackTableRows(rows), showAll: true, section: 'operational' },
        { key: 'consolidatedMaterialBlockers', title: 'Bloqueios materiais consolidados', description: 'Uma linha por material, com impacto sobre Workpacks e Equipment Tags.', columns: [
          { key: 'identCode', label: 'IDENT CODE' }, { key: 'materialGrade', label: 'Material / Grade' }, { key: 'materialDescription', label: 'Descrição' },
          { key: 'shortageQty', label: 'Falta total', format: 'number' }, { key: 'affectedWorkpacks', label: 'Workpacks afetados' },
          { key: 'affectedTags', label: 'Equipment Tags' }, { key: 'purchaseOrder', label: 'PO vinculada' },
        ], rows: blockerRows, showAll: true, section: 'operational' },
        ...legacyTables,
      ],
    },
    warehouse: {
      id: 'warehouse',
      title: 'Warehouse Readiness',
      question: 'O material físico está aceito, disponível e preparado para atender o plano?',
      kpis: [
        kpi('availableInventoryRecords', 'Itens com saldo disponível', availableInventory.length, { format: 'integer', tone: 'positive', note: 'Registros físicos de Inventory' }),
        kpi('reservedInventoryRecords', 'Itens reservados', reservedInventory.length, { format: 'integer' }),
        kpi('inspectionPending', 'Aguardando inspeção', inspectionPending, { format: 'integer', tone: inspectionPending ? 'attention' : 'positive' }),
        kpi('holdMaterialUnits', 'Material em HOLD', holdUnits, { format: 'integer', tone: holdUnits ? 'critical' : 'positive' }),
        kpi('rejectedMaterialUnits', 'Material rejeitado', rejectedUnits, { format: 'integer', tone: rejectedUnits ? 'critical' : 'positive' }),
        kpi('readyKits', 'Kits de Workpack prontos', ready, { format: 'integer', tone: 'positive', note: `${atRisk + blocked} kit(s) ainda requerem ação` }),
        kpi('poItemsWithoutEtaCtco', 'PO Items sem ETA CTCO', logistics.noEta, { format: 'integer', tone: logistics.noEta ? 'critical' : 'positive' }),
        kpi('poItemsWithPartialEta', 'PO Items com ETA parcial', logistics.partialEta, { format: 'integer', tone: logistics.partialEta ? 'attention' : 'positive' }),
      ],
      statusFlow: [
        { key: 'AVAILABLE', label: 'Disponível', value: availableInventory.length },
        { key: 'RESERVED', label: 'Reservado', value: reservedInventory.length },
        { key: 'PENDING', label: 'Inspeção pendente', value: inspectionPending },
        { key: 'HOLD', label: 'HOLD', value: holdUnits },
        { key: 'REJECTED', label: 'Rejeitado', value: rejectedUnits },
      ],
      tables: [
        { key: 'warehouseKitting', title: 'Kitting por Workpack', description: 'Prontidão do material vinculada à sequência planejada de fabricação.', columns: PPC_QUEUE_COLUMNS, rows: workpackTableRows(rows), showAll: true },
        { key: 'importLogistics', title: 'Importação e ETA CTCO por parcela', description: 'Marcos logísticos das compras ainda pendentes e vínculo com a demanda MTO.', columns: [
          { key: 'purchaseOrder', label: 'PO' }, { key: 'itemNumber', label: 'Item' }, { key: 'identCode', label: 'IDENT CODE' }, { key: 'shipmentReference', label: 'Parcela / embarque' },
          { key: 'quantity', label: 'Quantidade', format: 'number' }, { key: 'unitOfMeasure', label: 'Un.' }, { key: 'stage', label: 'Etapa', format: 'operationalStatus' },
          { key: 'customsChannel', label: 'Canal', format: 'operationalStatus' }, { key: 'portEtaDate', label: 'ETA porto', format: 'date' },
          { key: 'customsReleaseForecastDate', label: 'ETA liberação', format: 'date' }, { key: 'pickupForecastDate', label: 'ETA coleta', format: 'date' },
          { key: 'ctcoForecastDate', label: 'ETA CTCO', format: 'date' }, { key: 'scheduleStatus', label: 'Cobertura da previsão', format: 'operationalStatus' },
          { key: 'poMtoLinks', label: 'Vínculos MTO', format: 'integer' },
        ], rows: logistics.rows, showAll: true, emptyMessage: 'Nenhuma compra pendente com fluxo logístico.' },
        { key: 'inspectionExceptions', title: 'Exceções de recebimento e inspeção', columns: [
          { key: 'traceability', label: 'Rastreabilidade' }, { key: 'identCode', label: 'IDENT CODE' }, { key: 'materialGrade', label: 'Material / Grade' },
          { key: 'heatNo', label: 'Heat No.' }, { key: 'purchaseOrder', label: 'PO' }, { key: 'inspectionStatus', label: 'Status de inspeção', format: 'operationalStatus' },
          { key: 'receivedDate', label: 'Data de recebimento', format: 'date' },
        ], rows: inspectionRows, showAll: true, emptyMessage: 'Nenhuma exceção de inspeção encontrada.' },
        { key: 'warehouseStockStatus', title: 'Estoque por status físico', columns: [
          { key: 'status', label: 'Status', format: 'operationalStatus' }, { key: 'records', label: 'Registros', format: 'integer' },
          { key: 'availableQty', label: 'Saldo disponível', format: 'number' }, { key: 'reservedQty', label: 'Reservado', format: 'number' },
          { key: 'weightKg', label: 'Peso registrado', format: 'kg' },
        ], rows: stockSummaryRows(data), showAll: true },
      ],
    },
    fabrication: {
      id: 'fabrication',
      title: 'Fabrication Control',
      question: 'O plano liberado está avançando no prazo e com capacidade visível?',
      kpis: [
        kpi('releasedForCutting', 'Liberados para corte', releasedForCutting, { format: 'integer', tone: 'positive' }),
        kpi('inFabrication', 'Em fabricação', inFabrication, { format: 'integer' }),
        kpi('overdueWorkpacks', 'Workpacks atrasados', overdue, { format: 'integer', tone: overdue ? 'critical' : 'positive' }),
        kpi('plannedManHours', 'HH planejadas no horizonte', plannedHours, { format: 'number' }),
        kpi('actualManHours', 'HH realizadas no horizonte', actualHours, { format: 'number' }),
        kpi('remainingManHours', 'HH remanescentes', Math.max(0, plannedHours - actualHours), { format: 'number', tone: plannedHours > actualHours ? 'attention' : 'positive' }),
      ],
      statusFlow: statusFlow(rows),
      tables: [
        { key: 'fabricationControl', title: 'Controle de fabricação por Workpack', description: 'Datas, progresso, homem-hora e responsáveis do plano de produção.', columns: [
          { key: 'priority', label: 'Prioridade' }, { key: 'workpackNo', label: 'Workpack' }, { key: 'equipmentTag', label: 'Equipment Tag' },
          { key: 'fabricationArea', label: 'Área' }, { key: 'shift', label: 'Turno' }, { key: 'plannedStart', label: 'Início', format: 'date' },
          { key: 'plannedFinish', label: 'Fim', format: 'date' }, { key: 'workpackStatus', label: 'Status', format: 'operationalStatus' },
          { key: 'progress', label: 'Progresso', format: 'percent' }, { key: 'plannedManHours', label: 'HH planejada', format: 'number' },
          { key: 'actualManHours', label: 'HH realizada', format: 'number' }, { key: 'responsible', label: 'Responsável' },
        ], rows: productionRows(fabricationRows), showAll: true },
        { key: 'fabricationCapacity', title: 'Carga por área e turno', description: 'Carga registrada; não substitui um calendário formal de capacidade.', columns: [
          { key: 'fabricationArea', label: 'Área de fabricação' }, { key: 'shift', label: 'Turno' }, { key: 'workpacks', label: 'Workpacks', format: 'integer' },
          { key: 'plannedManHours', label: 'HH planejada', format: 'number' }, { key: 'actualManHours', label: 'HH realizada', format: 'number' },
          { key: 'remainingManHours', label: 'HH remanescente', format: 'number' },
        ], rows: capacityRows(rows), showAll: true },
        { key: 'fabricationDocuments', title: 'Gates documentais de fabricação', columns: [
          { key: 'workpackNo', label: 'Workpack' }, { key: 'equipmentTag', label: 'Equipment Tag' }, { key: 'workpackStatus', label: 'Status', format: 'operationalStatus' },
          { key: 'documentStatus', label: 'Material Coupon / Cutting Sheet' }, { key: 'blocker', label: 'Próxima pendência' },
        ], rows: rows.filter((row) => row.ppcStatus !== 'COMPLETE').map((row) => ({ workpackNo: row.workpackNo, equipmentTag: row.equipmentTag, workpackStatus: row.workpackStatus, documentStatus: row.documentStatus, blocker: row.blocker })), showAll: true },
      ],
    },
  };
}
