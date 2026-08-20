function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return value == null ? '' : String(value).trim(); }
function normalized(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }

const TYPE_ALIASES = Object.freeze({
  Equipment: 'EQUIPMENT',
  Drawing: 'DRAWING',
  MTO: 'MTO',
  'Purchase Order': 'PO',
  'PO Item': 'PO_ITEM',
  Inventory: 'INVENTORY',
  Workpack: 'WORKPACK',
  'Material Coupon': 'MATERIAL_COUPON',
  'Cutting Sheet': 'CUTTING_SHEET',
  RMV: 'RMV',
});

const TARGET_TYPES = Object.freeze({
  DRAWING_REVISION: 'DRAWING',
  MTO_ITEM: 'MTO',
  INVENTORY_ITEM: 'INVENTORY',
  MATERIAL_COUPON: 'MATERIAL_COUPON',
  CUTTING_SHEET: 'CUTTING_SHEET',
  RETURN_MATERIAL_VOUCHER: 'RMV',
});

const STAGES = Object.freeze({
  EQUIPMENT: 0,
  DRAWING: 0,
  MTO: 1,
  PO: 2,
  PO_ITEM: 2,
  INVENTORY: 3,
  MATERIAL_COUPON: 4,
  WORKPACK: 4,
  CUTTING_SHEET: 5,
  CUT_PART: 6,
  OFFCUT: 6,
  RMV: 7,
  RETURNED_INVENTORY: 8,
});

function nodeKey(type, id) { return `${type}:${text(id)}`; }
function recordId(record = {}) { return text(record.id || record.traceability || record.trace); }
function couponPayload(record = {}) { return record.metadata?.coupon || record; }

function equipmentTags(record = {}) {
  return unique([
    ...list(record.equipmentTags || record.tags),
    record.clientTag,
    record.tag,
  ]);
}

function inventoryAliases(record = {}) {
  return unique([record.id, record.inventoryItemId, record.traceability, record.trace, record.trackNumber]);
}

function inventoryPoItemId(record = {}) {
  return text(record.metadata?.poItemId || record.poItemId);
}

function createGraph() {
  const nodes = new Map();
  const edges = new Map();

  function addNode(type, id, source = {}, overrides = {}) {
    const cleanId = text(id);
    if (!cleanId) return '';
    const key = nodeKey(type, cleanId);
    if (!nodes.has(key)) {
      nodes.set(key, {
        key,
        type,
        id: cleanId,
        label: text(overrides.label || cleanId),
        subtitle: text(overrides.subtitle),
        phase: text(overrides.phase),
        status: text(overrides.status || source.status),
        source,
        stage: STAGES[type] ?? 4,
      });
    }
    return key;
  }

  function addEdge(from, to, relation, options = {}) {
    if (!from || !to || from === to || !nodes.has(from) || !nodes.has(to)) return;
    const id = `${from}|${to}|${relation}`;
    if (!edges.has(id)) edges.set(id, {
      id,
      from,
      to,
      relation: text(relation),
      method: text(options.method),
      inferred: Boolean(options.inferred),
    });
  }

  return { nodes, edges, addNode, addEdge };
}

function addPrimaryNodes(graph, data) {
  const references = {
    equipment: new Map(),
    drawing: new Map(),
    mto: new Map(),
    po: new Map(),
    poItem: new Map(),
    inventory: new Map(),
    workpack: new Map(),
    coupon: new Map(),
    cuttingSheet: new Map(),
    rmv: new Map(),
    offcut: new Map(),
  };

  list(data.equipments).forEach((record) => {
    const key = graph.addNode('EQUIPMENT', recordId(record), record, {
      label: equipmentTags(record).join(', ') || record.code || recordId(record),
      subtitle: record.equipmentName || record.name,
      phase: 'equipments',
    });
    references.equipment.set(recordId(record), key);
  });
  list(data.drawings).forEach((record) => {
    const key = graph.addNode('DRAWING', recordId(record), record, {
      label: record.drawingNo || record.engineeringCode || recordId(record),
      subtitle: record.title || record.revision,
      phase: 'drawings',
    });
    references.drawing.set(recordId(record), key);
  });
  list(data.mtoItems).forEach((record) => {
    const key = graph.addNode('MTO', recordId(record), record, {
      label: record.itemNo || record.identCode || recordId(record),
      subtitle: record.identCode || record.material || record.description,
      phase: 'mto',
    });
    references.mto.set(recordId(record), key);
  });
  list(data.purchaseOrders).forEach((record) => {
    const key = graph.addNode('PO', recordId(record), record, {
      label: `PO ${text(record.poNumber || recordId(record))}`,
      subtitle: record.subject || record.supplierName,
      phase: 'procurement',
    });
    references.po.set(recordId(record), key);
  });
  list(data.poItems).forEach((record) => {
    const key = graph.addNode('PO_ITEM', recordId(record), record, {
      label: record.itemNumber ? `Item ${record.itemNumber}` : recordId(record),
      subtitle: record.identCode || record.description,
      phase: 'procurement',
    });
    references.poItem.set(recordId(record), key);
  });
  list(data.inventoryItems || data.inventory).forEach((record) => {
    const id = recordId(record);
    const key = graph.addNode('INVENTORY', id, record, {
      label: record.traceability || record.trace || id,
      subtitle: [record.identCode, record.heatNo || record.heatNumber].map(text).filter(Boolean).join(' · '),
      phase: 'inventory',
    });
    inventoryAliases(record).forEach((alias) => references.inventory.set(alias, key));
  });
  list(data.workpacks).forEach((record) => {
    const key = graph.addNode('WORKPACK', recordId(record), record, {
      label: record.wpNo || recordId(record),
      subtitle: record.title,
      phase: 'workpacks',
    });
    references.workpack.set(recordId(record), key);
  });
  list(data.materialCoupons).forEach((record) => {
    const coupon = couponPayload(record);
    const key = graph.addNode('MATERIAL_COUPON', recordId(record), record, {
      label: coupon.header?.mcCode || record.number || recordId(record),
      subtitle: coupon.header?.destination || coupon.header?.scope,
      phase: 'material-coupons',
    });
    references.coupon.set(recordId(record), key);
  });
  list(data.cuttingSheets).forEach((record) => {
    const key = graph.addNode('CUTTING_SHEET', recordId(record), record, {
      label: record.number || record.code || recordId(record),
      subtitle: record.title || record.metadata?.materialCouponNumber,
      phase: 'cut-sheets',
    });
    references.cuttingSheet.set(recordId(record), key);
  });
  list(data.returnMaterialVouchers).forEach((record) => {
    const key = graph.addNode('RMV', recordId(record), record, {
      label: record.number || record.rmvNo || record.voucherNumber || recordId(record),
      subtitle: 'Return Material Voucher',
      phase: 'return-material',
    });
    references.rmv.set(recordId(record), key);
  });
  list(data.offcuts).forEach((record) => {
    const key = graph.addNode('OFFCUT', recordId(record), record, {
      label: record.traceability || recordId(record),
      subtitle: record.material || record.description || 'Reusable offcut',
      phase: 'return-material',
    });
    references.offcut.set(recordId(record), key);
  });
  return references;
}

function connectEngineering(graph, data, refs) {
  const equipments = new Map(list(data.equipments).map((record) => [recordId(record), record]));
  list(data.drawings).forEach((record) => {
    graph.addEdge(refs.equipment.get(text(record.equipmentId)), refs.drawing.get(recordId(record)), 'defined by', { method: 'equipmentId' });
  });
  list(data.mtoItems).forEach((record) => {
    const equipment = equipments.get(text(record.equipmentId));
    const direct = equipment ? refs.equipment.get(recordId(equipment)) : '';
    if (direct) graph.addEdge(direct, refs.mto.get(recordId(record)), 'requires', { method: 'equipmentId' });
  });
  list(data.workpacks).forEach((record) => {
    graph.addEdge(refs.equipment.get(text(record.equipmentId)), refs.workpack.get(recordId(record)), 'fabricated by', { method: 'equipmentId' });
  });
}

function connectProcurement(graph, data, refs) {
  list(data.poItems).forEach((record) => {
    graph.addEdge(refs.po.get(text(record.purchaseOrderId)), refs.poItem.get(recordId(record)), 'contains', { method: 'purchaseOrderId' });
  });

  const explicitPairs = new Set();
  list(data.allocations).forEach((record) => {
    const mtoId = text(record.mtoLineId || record.mtoItemId);
    const poItemId = text(record.poItemId);
    const from = refs.mto.get(mtoId);
    const to = refs.poItem.get(poItemId);
    graph.addEdge(from, to, 'procured as', { method: record.matchMethod || 'allocation' });
    if (from && to) explicitPairs.add(`${mtoId}|${poItemId}`);
  });

  const mtoByIdent = new Map();
  list(data.mtoItems).forEach((record) => {
    const ident = normalized(record.identCode);
    if (!ident) return;
    const key = `${normalized(record.projectId)}|${ident}`;
    if (!mtoByIdent.has(key)) mtoByIdent.set(key, []);
    mtoByIdent.get(key).push(record);
  });
  list(data.poItems).forEach((record) => {
    const poItemId = recordId(record);
    const key = `${normalized(record.projectId)}|${normalized(record.identCode)}`;
    list(mtoByIdent.get(key)).forEach((mto) => {
      const mtoId = recordId(mto);
      if (explicitPairs.has(`${mtoId}|${poItemId}`)) return;
      graph.addEdge(refs.mto.get(mtoId), refs.poItem.get(poItemId), 'IDENT CODE match', {
        method: 'identCode',
        inferred: true,
      });
    });
  });

  const poByNumber = new Map(list(data.purchaseOrders).map((record) => [normalized(record.poNumber), record]));
  const poItemsByNumber = new Map();
  list(data.poItems).forEach((record) => {
    const po = list(data.purchaseOrders).find((item) => recordId(item) === text(record.purchaseOrderId));
    const key = `${normalized(po?.poNumber)}|${normalized(record.itemNumber)}`;
    if (key !== '|') poItemsByNumber.set(key, record);
  });
  list(data.inventoryItems || data.inventory).forEach((record) => {
    const inventoryKey = refs.inventory.get(recordId(record));
    let poItemKey = refs.poItem.get(inventoryPoItemId(record));
    if (!poItemKey) {
      const legacy = poItemsByNumber.get(`${normalized(record.po)}|${normalized(record.poItem)}`);
      poItemKey = refs.poItem.get(recordId(legacy || {}));
    }
    if (poItemKey) graph.addEdge(poItemKey, inventoryKey, 'received as', { method: inventoryPoItemId(record) ? 'poItemId' : 'PO/item' });
    const po = poByNumber.get(normalized(record.po));
    if (!poItemKey && po) graph.addEdge(refs.po.get(recordId(po)), inventoryKey, 'received as', { method: 'PO number' });
  });
}

function connectWorkpacks(graph, data, refs) {
  list(data.workpackLinks).filter((link) => normalized(link.status || 'active') !== 'inactive').forEach((link) => {
    const targetType = TARGET_TYPES[text(link.targetType).toUpperCase()];
    const targetMap = {
      DRAWING: refs.drawing,
      MTO: refs.mto,
      INVENTORY: refs.inventory,
      MATERIAL_COUPON: refs.coupon,
      CUTTING_SHEET: refs.cuttingSheet,
      RMV: refs.rmv,
    }[targetType];
    const target = targetMap?.get(text(link.targetId));
    graph.addEdge(refs.workpack.get(text(link.workpackId)), target, 'linked document', { method: 'workpackLink' });
  });

  [
    ['materialCoupons', refs.coupon],
    ['cuttingSheets', refs.cuttingSheet],
    ['returnMaterialVouchers', refs.rmv],
  ].forEach(([collection, map]) => list(data[collection]).forEach((record) => {
    graph.addEdge(refs.workpack.get(text(record.workpackId)), map.get(recordId(record)), 'owns', { method: 'workpackId' });
  }));
}

function connectFabrication(graph, data, refs) {
  list(data.materialCoupons).forEach((record) => {
    const couponKey = refs.coupon.get(recordId(record));
    const coupon = couponPayload(record);
    const traceabilities = unique(list(coupon.lines).flatMap((line) => [line.inventoryItemId, line.traceability, line.trace]));
    traceabilities.forEach((id) => graph.addEdge(refs.inventory.get(id), couponKey, 'issued on coupon', { method: 'coupon line' }));
  });

  list(data.cuttingSheets).forEach((record) => {
    const sheetKey = refs.cuttingSheet.get(recordId(record));
    graph.addEdge(refs.coupon.get(text(record.materialCouponId)), sheetKey, 'planned by', { method: 'materialCouponId' });
    list(record.bars).forEach((bar) => {
      const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
      const parent = text(bar.inventoryItemId || bar.parentInventoryItemId || stock.id || stock.traceability || stock.trace || bar.traceability || bar.trace);
      graph.addEdge(refs.inventory.get(parent), sheetKey, 'cut on', { method: 'cutting bar' });
    });
  });

  list(data.materialTransformations).forEach((record) => {
    const sheetKey = refs.cuttingSheet.get(text(record.cuttingSheetId));
    const parentKey = refs.inventory.get(text(record.parentInventoryItemId));
    graph.addEdge(parentKey, sheetKey, 'consumed by', { method: 'materialTransformation' });
    graph.addEdge(refs.coupon.get(text(record.materialCouponId)), sheetKey, 'authorized', { method: 'materialTransformation' });
    const outputType = text(record.outputType).toUpperCase();
    if (outputType === 'CUT_PART') {
      const partKey = graph.addNode('CUT_PART', record.id || record.outputId, record, {
        label: [record.mark, record.position].map(text).filter(Boolean).join(' / ') || record.outputId || 'Cut part',
        subtitle: record.mtoItemId || record.drawingRevisionId,
        phase: 'cut-sheets',
        status: 'PRODUCED',
      });
      graph.addEdge(sheetKey, partKey, 'produces', { method: 'materialTransformation' });
      graph.addEdge(refs.mto.get(text(record.mtoItemId)), partKey, 'fulfils', { method: 'mtoItemId' });
    } else if (outputType === 'REUSABLE_OFFCUT') {
      graph.addEdge(sheetKey, refs.offcut.get(text(record.outputId)), 'produces', { method: 'materialTransformation' });
    }
  });
}

function connectReturns(graph, data, refs) {
  list(data.offcuts).forEach((record) => {
    const offcutKey = refs.offcut.get(recordId(record));
    graph.addEdge(refs.inventory.get(text(record.parentInventoryItemId)), offcutKey, 'leaves offcut', { method: 'parentInventoryItemId' });
    graph.addEdge(refs.cuttingSheet.get(text(record.cuttingSheetId)), offcutKey, 'produces', { method: 'cuttingSheetId' });
    graph.addEdge(refs.rmv.get(text(record.returnMaterialVoucherId)), offcutKey, 'returns', { method: 'returnMaterialVoucherId' });
    const returned = refs.inventory.get(text(record.newInventoryItemId));
    if (returned) {
      const node = graph.nodes.get(returned);
      if (node) {
        node.type = 'RETURNED_INVENTORY';
        node.stage = STAGES.RETURNED_INVENTORY;
      }
      graph.addEdge(offcutKey, returned, 'returned to stock', { method: 'newInventoryItemId' });
    }
  });
  list(data.returnMaterialVouchers).forEach((record) => {
    const rmvKey = refs.rmv.get(recordId(record));
    graph.addEdge(refs.cuttingSheet.get(text(record.cuttingSheetId)), rmvKey, 'return document', { method: 'cuttingSheetId' });
    list(record.returnedItems || record.items || record.lines).forEach((line) => {
      graph.addEdge(refs.inventory.get(text(line.parentInventoryItemId || line.parentTraceability)), rmvKey, 'returned through', { method: 'RMV line' });
      graph.addEdge(rmvKey, refs.inventory.get(text(line.inventoryItemId)), 'received back as', { method: 'RMV line' });
    });
  });
}

export function buildMaterialFlowGraph(data = {}) {
  const graph = createGraph();
  const references = addPrimaryNodes(graph, data);
  connectEngineering(graph, data, references);
  connectProcurement(graph, data, references);
  connectWorkpacks(graph, data, references);
  connectFabrication(graph, data, references);
  connectReturns(graph, data, references);
  return {
    nodes: [...graph.nodes.values()],
    edges: [...graph.edges.values()],
  };
}

function selectedNodeKey(graph, selection = {}) {
  const type = TYPE_ALIASES[selection.type] || text(selection.entityType).toUpperCase();
  const direct = nodeKey(type, selection.entityId || selection.id);
  if (graph.nodes.some((node) => node.key === direct)) return direct;
  const value = normalized(selection.entityId || selection.id || selection.title || selection.query);
  return graph.nodes.find((node) => normalized(node.id) === value || normalized(node.label) === value)?.key || '';
}

export function exploreMaterialGenealogy(data = {}, selection = {}, options = {}) {
  const graph = buildMaterialFlowGraph(data);
  const anchorKey = selectedNodeKey(graph, selection);
  if (!anchorKey) return { anchor: null, nodes: [], edges: [], groups: [], whereUsed: [], upstream: [], history: [], warnings: ['Selected record is not present in the current project scope.'] };
  const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const connected = new Map();
  graph.edges.forEach((edge) => {
    if (!connected.has(edge.from)) connected.set(edge.from, []);
    if (!connected.has(edge.to)) connected.set(edge.to, []);
    connected.get(edge.from).push({ key: edge.to, edge });
    connected.get(edge.to).push({ key: edge.from, edge });
  });
  const maximum = Math.max(20, Number(options.limit) || 200);
  const visited = new Set([anchorKey]);
  const queue = [anchorKey];
  while (queue.length && visited.size < maximum) {
    const current = queue.shift();
    list(connected.get(current)).forEach(({ key }) => {
      if (visited.size >= maximum || visited.has(key)) return;
      visited.add(key);
      queue.push(key);
    });
  }
  const nodes = [...visited].map((key) => nodesByKey.get(key)).filter(Boolean);
  const edges = graph.edges.filter((edge) => visited.has(edge.from) && visited.has(edge.to));
  const anchor = nodesByKey.get(anchorKey);
  const groups = [...new Set(nodes.map((node) => node.stage))].sort((a, b) => a - b).map((stage) => ({
    stage,
    nodes: nodes.filter((node) => node.stage === stage),
  }));
  const whereUsedKeys = new Set(edges.filter((edge) => edge.from === anchorKey).map((edge) => edge.to));
  const upstreamKeys = new Set(edges.filter((edge) => edge.to === anchorKey).map((edge) => edge.from));
  const relatedIds = new Set(nodes.flatMap((node) => [
    node.id,
    node.source?.id,
    node.source?.traceability,
    node.source?.trace,
  ]).map(text).filter(Boolean));
  const history = [
    ...list(data.stockMovements).filter((record) => relatedIds.has(text(record.inventoryItemId))).map((record) => ({
      id: text(record.id),
      timestamp: text(record.timestamp),
      type: text(record.movementType) || 'STOCK_MOVEMENT',
      title: text(record.reason || record.sourceDocumentType || record.movementType),
      reference: text(record.sourceDocumentId || record.inventoryItemId),
    })),
    ...list(data.auditEvents).filter((record) => (
      relatedIds.has(text(record.entityId)) || relatedIds.has(text(record.sourceDocumentId))
    )).map((record) => ({
      id: text(record.id),
      timestamp: text(record.timestamp || record.createdAt),
      type: text(record.eventType) || 'AUDIT_EVENT',
      title: text(record.reason || record.eventType),
      reference: text(record.sourceDocumentId || record.entityId),
    })),
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).slice(0, 50);
  return {
    anchor,
    nodes,
    edges,
    groups,
    whereUsed: nodes.filter((node) => whereUsedKeys.has(node.key)),
    upstream: nodes.filter((node) => upstreamKeys.has(node.key)),
    history,
    warnings: visited.size >= maximum ? [`Genealogy limited to ${maximum} related records.`] : [],
  };
}
