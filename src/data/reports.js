import { getActiveProjectName } from './appSettings.js';
import { getInventoryItems } from './inventoryDB.js';
import { getAllMaterialReceiptLines, getAllMaterialReceipts, getAllMaterialUnits } from './materialReceipts.js';
import { getMtoItems } from './mtoDB.js';
import { listMtoPoItemAllocations } from './mtoPoItemAllocations.js';
import { listPoDeliveryForecasts } from './poDeliveryForecasts.js';
import { getAllProjects, getProject } from './projects.js';
import { getAllPurchaseOrderItems, getAllPurchaseOrders } from './purchaseOrders.js';
import { listEquipments } from './equipments.js';
import { listMaterialReservations } from './materialReservations.js';
import { getAllStockMovements } from './stockMovements.js';
import { getAllCuttingSheets } from './cuttingSheets.js';
import { getAllReturnMaterialVouchers } from './returnMaterialVouchers.js';
import { getAllMaterialCoupons } from './materialCoupons.js';
import { listWorkpackLinks } from './workpackLinks.js';
import { listWorkpacks } from './workpacks.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function key(value) {
  return text(value).toLocaleLowerCase();
}

function hasValue(values, value) {
  return values.has(text(value));
}

function inventoryBelongsToScope(item, links) {
  if (text(item.projectId) === links.projectId) return true;

  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  if (hasValue(links.purchaseOrderIds, metadata.purchaseOrderId)
    || hasValue(links.poItemIds, metadata.poItemId)
    || hasValue(links.receiptIds, metadata.receiptId)
    || hasValue(links.receiptLineIds, metadata.receiptLineId)
    || hasValue(links.materialUnitIds, metadata.materialUnitId)) return true;

  const sourceDocumentId = text(item.sourceDocumentId);
  if (hasValue(links.receiptIds, sourceDocumentId)
    || hasValue(links.receiptLineIds, sourceDocumentId)
    || hasValue(links.materialUnitIds, sourceDocumentId)) return true;

  const poNumber = key(item.po);
  if (poNumber && links.purchaseOrderNumbers.has(poNumber)) return true;

  const combinedPoItem = key(item.poItemPo);
  if (combinedPoItem && [...links.purchaseOrderNumbers].some((number) => (
    combinedPoItem === number || combinedPoItem.startsWith(`${number}-`) || combinedPoItem.startsWith(`${number}/`)
  ))) return true;

  const inventoryPoItem = text(item.poItem);
  if (inventoryPoItem) {
    if (hasValue(links.poItemIds, inventoryPoItem)) return true;
    const matchingPoItemIds = links.poItemNumbers.get(key(inventoryPoItem));
    if (matchingPoItemIds?.size === 1) return true;
  }
  return false;
}

function filterProjectData(data, project) {
  const projectId = text(project.id);
  const purchaseOrders = data.purchaseOrders.filter((record) => text(record.projectId) === projectId);
  const purchaseOrderIds = new Set(purchaseOrders.map((record) => text(record.id)).filter(Boolean));
  const purchaseOrderNumbers = new Set(purchaseOrders.map((record) => key(record.poNumber)).filter(Boolean));

  const poItems = data.poItems.filter((record) => (
    text(record.projectId) === projectId || hasValue(purchaseOrderIds, record.purchaseOrderId)
  ));
  const poItemIds = new Set(poItems.map((record) => text(record.id)).filter(Boolean));
  const poItemNumbers = new Map();
  poItems.forEach((record) => {
    const itemNumber = key(record.itemNumber);
    if (!itemNumber) return;
    if (!poItemNumbers.has(itemNumber)) poItemNumbers.set(itemNumber, new Set());
    poItemNumbers.get(itemNumber).add(text(record.id));
  });

  const procurementReceiptLines = data.receiptLines.filter((record) => (
    hasValue(purchaseOrderIds, record.purchaseOrderId) || hasValue(poItemIds, record.poItemId)
  ));
  const procurementReceiptIds = new Set(procurementReceiptLines.map((record) => text(record.receiptId)).filter(Boolean));
  const receipts = data.receipts.filter((record) => (
    text(record.projectId) === projectId || hasValue(procurementReceiptIds, record.id)
  ));
  const receiptIds = new Set(receipts.map((record) => text(record.id)).filter(Boolean));
  const receiptLines = data.receiptLines.filter((record) => (
    hasValue(receiptIds, record.receiptId)
    || hasValue(purchaseOrderIds, record.purchaseOrderId)
    || hasValue(poItemIds, record.poItemId)
  ));
  const receiptLineIds = new Set(receiptLines.map((record) => text(record.id)).filter(Boolean));

  const materialUnits = data.materialUnits.filter((record) => (
    text(record.projectId) === projectId
    || hasValue(poItemIds, record.poItemId)
    || hasValue(receiptLineIds, record.receiptLineId)
  ));
  const materialUnitIds = new Set(materialUnits.map((record) => text(record.id)).filter(Boolean));

  const links = {
    projectId,
    purchaseOrderIds,
    purchaseOrderNumbers,
    poItemIds,
    poItemNumbers,
    receiptIds,
    receiptLineIds,
    materialUnitIds,
  };

  const mtoItems = data.mtoItems.filter((record) => text(record.projectId) === projectId);
  const mtoItemIds = new Set(mtoItems.map((record) => text(record.id)).filter(Boolean));
  const allocations = data.allocations.filter((record) => (
    text(record.projectId) === projectId
    || hasValue(mtoItemIds, record.mtoLineId || record.mtoItemId)
    || hasValue(poItemIds, record.poItemId)
  ));
  const deliveryForecasts = data.deliveryForecasts.filter((record) => (
    text(record.projectId) === projectId || hasValue(poItemIds, record.poItemId)
  ));
  const inventoryItems = data.inventoryItems.filter((record) => inventoryBelongsToScope(record, links));
  const inventoryIds = new Set(inventoryItems.flatMap((record) => [record.id, record.trace, record.traceability]).map(text).filter(Boolean));
  const materialReservations = data.materialReservations.filter((record) => (
    text(record.projectId) === projectId
    || hasValue(mtoItemIds, record.mtoItemId)
    || hasValue(inventoryIds, record.inventoryItemId)
  ));
  const reservationIds = new Set(materialReservations.map((record) => text(record.id)).filter(Boolean));
  const stockMovements = data.stockMovements.filter((record) => {
    if (text(record.projectId) === projectId || hasValue(inventoryIds, record.inventoryItemId)) return true;
    const ids = Array.isArray(record.metadata?.reservationIds) ? record.metadata.reservationIds : [];
    return ids.some((id) => hasValue(reservationIds, id));
  });
  const cuttingSheets = data.cuttingSheets.filter((record) => text(record.projectId) === projectId);
  const returnMaterialVouchers = data.returnMaterialVouchers.filter((record) => text(record.projectId) === projectId);
  const workpacks = data.workpacks.filter((record) => text(record.projectId) === projectId);
  const workpackIds = new Set(workpacks.map((record) => text(record.id)).filter(Boolean));
  const workpackLinks = data.workpackLinks.filter((record) => (
    text(record.projectId) === projectId || hasValue(workpackIds, record.workpackId)
  ));
  const materialCoupons = data.materialCoupons.filter((record) => (
    text(record.projectId) === projectId || hasValue(workpackIds, record.workpackId)
  ));

  return {
    projects: [project],
    equipments: data.equipments.filter((record) => text(record.projectId) === projectId),
    mtoItems,
    purchaseOrders,
    poItems,
    receipts,
    receiptLines,
    materialUnits,
    inventoryItems,
    allocations,
    deliveryForecasts,
    materialReservations,
    stockMovements,
    cuttingSheets,
    returnMaterialVouchers,
    workpacks,
    workpackLinks,
    materialCoupons,
  };
}

/**
 * Loads the raw Reports datasets. An empty Active Project intentionally means
 * the all-project view; a stale non-empty setting is surfaced instead of
 * silently widening the report scope.
 */
export async function loadReportsData(options = {}) {
  void options;
  const configuredProjectName = text(await getActiveProjectName());
  const activeProject = configuredProjectName ? await getProject(configuredProjectName) : null;
  if (configuredProjectName && !activeProject) {
    const error = new Error(`Active Project not found: ${configuredProjectName}`);
    error.code = 'ACTIVE_PROJECT_NOT_FOUND';
    throw error;
  }

  const [projects, equipments, mtoItems, purchaseOrders, poItems, receipts, receiptLines, materialUnits, inventoryItems, allocations, deliveryForecasts, materialReservations, stockMovements, cuttingSheets, returnMaterialVouchers, materialCoupons, workpacks, workpackLinks] = await Promise.all([
    getAllProjects(),
    listEquipments({}),
    getMtoItems({ includeSuperseded: true }),
    getAllPurchaseOrders(),
    getAllPurchaseOrderItems(),
    getAllMaterialReceipts(),
    getAllMaterialReceiptLines(),
    getAllMaterialUnits(),
    getInventoryItems(),
    listMtoPoItemAllocations(),
    listPoDeliveryForecasts(),
    listMaterialReservations(),
    getAllStockMovements(),
    getAllCuttingSheets(),
    getAllReturnMaterialVouchers(),
    getAllMaterialCoupons(),
    listWorkpacks(),
    listWorkpackLinks(),
  ]);

  const data = {
    projects,
    equipments,
    mtoItems,
    purchaseOrders,
    poItems,
    receipts,
    receiptLines,
    materialUnits,
    inventoryItems,
    allocations,
    deliveryForecasts,
    materialReservations,
    stockMovements,
    cuttingSheets,
    returnMaterialVouchers,
    materialCoupons,
    workpacks,
    workpackLinks,
  };
  const scoped = activeProject ? filterProjectData(data, activeProject) : data;
  return {
    ...scoped,
    scope: {
      projectId: text(activeProject?.id),
      projectName: text(activeProject?.name),
      activeProjectName: configuredProjectName,
      isAllProjects: !activeProject,
    },
  };
}
