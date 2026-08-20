import { workpackRelationIds, WORKPACK_RELATION_TYPES } from './workpackRelations.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function inventoryIdentity(item = {}) {
  return text(item.id || item.inventoryItemId || item.traceability || item.trace);
}

function inventoryTrace(item = {}) {
  return text(item.traceability || item.trace || item.trackNumber || item.id);
}

function dimensions(record = {}) {
  return {
    lengthMm: numberValue(record.lengthMm ?? record.length),
    widthMm: numberValue(record.widthMm ?? record.width),
    thicknessMm: numberValue(record.thicknessMm ?? record.thickness),
  };
}

function createNode(id, type, source = {}, overrides = {}) {
  const size = dimensions(source);
  return {
    id,
    type,
    label: text(overrides.label),
    reference: text(overrides.reference),
    status: text(overrides.status || source.status),
    quantity: numberValue(overrides.quantity ?? source.quantity ?? source.qty),
    ...size,
    sourceId: text(overrides.sourceId || source.id),
    children: [],
  };
}

function findRmvLine(rmvs, offcutId, returnedInventoryItemId) {
  for (const rmv of rmvs) {
    const line = (Array.isArray(rmv.returnedItems) ? rmv.returnedItems : []).find((item) => {
      return (offcutId && text(item.sourceOffcutId) === offcutId)
        || (returnedInventoryItemId && text(item.inventoryItemId) === returnedInventoryItemId);
    });
    if (line) return { rmv, line };
  }
  return null;
}

function collectWorkpackCuttingSheetIds(workpack, cuttingSheets, workpackLinks) {
  const explicit = workpackRelationIds(workpack, workpackLinks, WORKPACK_RELATION_TYPES.CUTTING_SHEET);
  cuttingSheets.forEach((sheet) => {
    if (text(sheet.workpackId) === text(workpack.id)) explicit.push(text(sheet.id));
  });
  return new Set(unique(explicit));
}

/**
 * Builds a read-only physical genealogy for one Workpack.
 * Project equality is deliberately insufficient: only explicit Workpack or
 * Cutting Sheet relationships may bring a transformation into the tree.
 */
export function buildWorkpackGenealogy(workpack = {}, sources = {}) {
  const workpackId = text(workpack.id);
  const inventory = Array.isArray(sources.inventoryItems) ? sources.inventoryItems : [];
  const cuttingSheets = Array.isArray(sources.cuttingSheets) ? sources.cuttingSheets : [];
  const transformations = Array.isArray(sources.materialTransformations) ? sources.materialTransformations : [];
  const offcuts = Array.isArray(sources.offcuts) ? sources.offcuts : [];
  const rmvs = Array.isArray(sources.returnMaterialVouchers) ? sources.returnMaterialVouchers : [];
  const workpackLinks = Array.isArray(sources.workpackLinks) ? sources.workpackLinks : [];
  const sheetIds = collectWorkpackCuttingSheetIds(workpack, cuttingSheets, workpackLinks);
  const scopedTransformations = transformations.filter((record) => {
    return (workpackId && text(record.workpackId) === workpackId)
      || (text(record.cuttingSheetId) && sheetIds.has(text(record.cuttingSheetId)));
  });
  const inventoryById = new Map();
  inventory.forEach((item) => {
    const keys = unique([inventoryIdentity(item), item.traceability, item.trace, item.trackNumber]);
    keys.forEach((key) => inventoryById.set(key, item));
  });
  const offcutsById = new Map(offcuts.map((offcut) => [text(offcut.id), offcut]).filter(([id]) => id));
  const rmvsById = new Map(rmvs.map((rmv) => [text(rmv.id), rmv]).filter(([id]) => id));
  const roots = [];
  const rootByParent = new Map();
  const warnings = [];
  const counts = { materials: 0, cutParts: 0, offcuts: 0, rmvs: 0, returnedStock: 0, missingReferences: 0 };

  function ensureRoot(parentId) {
    if (rootByParent.has(parentId)) return rootByParent.get(parentId);
    const stock = inventoryById.get(parentId);
    const missing = !stock;
    const node = createNode(`inventory:${parentId || 'missing'}`, missing ? 'MISSING_STOCK' : 'STOCK', stock || {}, {
      label: missing ? 'Material de origem não encontrado' : inventoryTrace(stock),
      reference: missing ? parentId || 'ID não informado' : text(stock.description || stock.material || stock.identCode),
      status: missing ? 'MISSING_REFERENCE' : stock.status,
      sourceId: parentId,
    });
    rootByParent.set(parentId, node);
    roots.push(node);
    counts.materials += 1;
    if (missing) {
      counts.missingReferences += 1;
      warnings.push(`Material de origem ${parentId || '(sem ID)'} não foi encontrado no Inventory.`);
    }
    return node;
  }

  scopedTransformations.forEach((transformation) => {
    const parentId = text(transformation.parentInventoryItemId);
    const root = ensureRoot(parentId);
    const outputType = text(transformation.outputType).toUpperCase();
    if (outputType === 'CUT_PART') {
      const part = createNode(`part:${text(transformation.id) || text(transformation.outputId)}`, 'CUT_PART', transformation, {
        label: [text(transformation.mark), text(transformation.position)].filter(Boolean).join(' / ') || text(transformation.outputId) || 'Peça cortada',
        reference: text(transformation.metadata?.drawingNumber || transformation.drawingRevisionId || transformation.mtoItemId),
        status: 'PRODUCED',
      });
      root.children.push(part);
      counts.cutParts += 1;
      return;
    }
    if (outputType !== 'REUSABLE_OFFCUT') return;

    const outputId = text(transformation.outputId);
    const metadata = transformation.metadata && typeof transformation.metadata === 'object' ? transformation.metadata : {};
    const offcutId = text(metadata.sourceOffcutId || outputId);
    const offcut = offcutsById.get(offcutId) || offcuts.find((item) => text(item.newInventoryItemId) === outputId) || {};
    const offcutNode = createNode(`offcut:${offcutId || text(transformation.id)}`, 'OFFCUT', { ...transformation, ...offcut }, {
      label: text(offcut.traceability || metadata.traceability || outputId) || 'Retalho reutilizável',
      reference: text(offcut.material || offcut.description),
      status: text(offcut.status || 'GENERATED'),
      sourceId: offcutId || transformation.id,
      quantity: offcut.qty ?? offcut.quantity ?? transformation.quantity,
    });
    root.children.push(offcutNode);
    counts.offcuts += 1;

    const returnedInventoryId = text(metadata.returnedInventoryItemId || offcut.newInventoryItemId);
    const matched = findRmvLine(rmvs, offcutId, returnedInventoryId);
    const rmvId = text(metadata.returnMaterialVoucherId || offcut.returnMaterialVoucherId || matched?.rmv?.id);
    const rmv = rmvsById.get(rmvId) || matched?.rmv;
    let returnParent = offcutNode;
    if (rmv) {
      const rmvNode = createNode(`rmv:${text(rmv.id)}`, 'RMV', rmv, {
        label: text(rmv.rmvNo || rmv.returnVoucherNumber || rmv.id),
        reference: 'Return Material Voucher',
        status: rmv.status,
      });
      offcutNode.children.push(rmvNode);
      returnParent = rmvNode;
      counts.rmvs += 1;
    } else if (rmvId) {
      counts.missingReferences += 1;
      warnings.push(`RMV ${rmvId} vinculado ao retalho ${offcutId || outputId} não foi encontrado.`);
    }

    const lineInventoryId = text(matched?.line?.inventoryItemId);
    const childId = returnedInventoryId || lineInventoryId;
    if (!childId) return;
    const returnedStock = inventoryById.get(childId);
    const returnedNode = createNode(`returned:${childId}`, 'RETURNED_STOCK', returnedStock || matched?.line || transformation, {
      label: returnedStock ? inventoryTrace(returnedStock) : childId,
      reference: text(returnedStock?.description || returnedStock?.material || matched?.line?.traceability),
      status: text(returnedStock?.status || matched?.line?.status || 'RETURNED'),
      sourceId: childId,
    });
    returnParent.children.push(returnedNode);
    counts.returnedStock += 1;
    if (!returnedStock) {
      counts.missingReferences += 1;
      warnings.push(`Retalho devolvido ${childId} não foi encontrado no Inventory.`);
    }
  });

  return { roots, summary: counts, warnings: unique(warnings), transformationCount: scopedTransformations.length };
}
