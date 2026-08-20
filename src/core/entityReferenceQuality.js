export const ENTITY_REFERENCE_CONTRACTS = Object.freeze({
  EQUIPMENT: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'equipmentTypeId']),
    snapshotFields: Object.freeze(['equipmentType']),
    compatibilityFields: Object.freeze(['name', 'clientTag', 'designDrawingNo']),
  }),
  DRAWING_REVISION: Object.freeze({
    idFields: Object.freeze(['id', 'documentId', 'projectId', 'equipmentId']),
    snapshotFields: Object.freeze(['drawingNo', 'revision', 'engineeringCode', 'title']),
    compatibilityFields: Object.freeze(['workpackId', 'templateDrawingNo', 'clientReference']),
  }),
  MTO_ITEM: Object.freeze({
    idFields: Object.freeze(['id', 'batchId', 'projectId', 'equipmentId', 'drawingRevisionId']),
    snapshotFields: Object.freeze(['drawing', 'revision', 'equipmentName', 'tag']),
    compatibilityFields: Object.freeze([]),
  }),
  WORKPACK: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'equipmentId']),
    snapshotFields: Object.freeze(['equipmentName']),
    compatibilityFields: Object.freeze(['drawingId', 'matchIds']),
  }),
  PURCHASE_ORDER_ITEM: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'purchaseOrderId']),
    snapshotFields: Object.freeze(['equipmentDestination']),
    compatibilityFields: Object.freeze([]),
  }),
  MTO_PO_ITEM_ALLOCATION: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'mtoLineId', 'poItemId']),
    snapshotFields: Object.freeze([]),
    compatibilityFields: Object.freeze(['mtoItemId']),
  }),
  PO_DELIVERY_FORECAST: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'purchaseOrderId', 'poItemId']),
    snapshotFields: Object.freeze(['shipmentReference', 'trackingReference']),
    compatibilityFields: Object.freeze([]),
  }),
  MATERIAL_UNIT: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'poItemId', 'receiptLineId', 'inventoryItemId']),
    snapshotFields: Object.freeze(['traceability', 'heatNumber']),
    compatibilityFields: Object.freeze([]),
  }),
  INVENTORY_ITEM: Object.freeze({
    idFields: Object.freeze(['id', 'projectId', 'metadata.materialUnitId', 'metadata.poItemId']),
    snapshotFields: Object.freeze(['vendor', 'po', 'poItem', 'mrr', 'receivedDate']),
    compatibilityFields: Object.freeze(['trace', 'traceability']),
  }),
});

function text(value) {
  return value == null ? '' : String(value).trim();
}

function identity(value) {
  return text(value).toLocaleUpperCase();
}

function recordId(record = {}) {
  return text(record.id || record.trace || record.name || record.number);
}

function recordLabel(record = {}) {
  return text(record.wpNo || record.drawingNo || record.itemNo || record.itemNumber
    || record.traceability || record.trace || record.name || record.number || record.id);
}

function issue(storeName, record, issueType, options = {}) {
  const referenceField = text(options.referenceField);
  const reference = text(options.reference);
  return {
    id: `${storeName}:${recordId(record) || reference}:${referenceField}:${issueType}`,
    domain: 'ENTITY_REFERENCE',
    storeName,
    recordId: recordId(record),
    recordLabel: recordLabel(record),
    issueType,
    referenceField,
    reference,
    targetType: text(options.targetType),
    suggestedReferenceId: text(options.suggestedReferenceId),
    detail: text(options.detail),
  };
}

function valuesForEquipment(equipment = {}) {
  return [
    equipment.id,
    equipment.code,
    equipment.equipmentName,
    equipment.name,
    equipment.clientTag,
    ...(Array.isArray(equipment.equipmentTags) ? equipment.equipmentTags : []),
  ].map(identity).filter(Boolean);
}

function equipmentCandidates(item, equipments) {
  const hints = [item.equipmentName, item.tag].map(identity).filter(Boolean);
  if (!hints.length) return [];
  return equipments.filter((equipment) => (
    (!item.projectId || !equipment.projectId || equipment.projectId === item.projectId)
    && hints.some((hint) => valuesForEquipment(equipment).includes(hint))
  ));
}

function drawingCandidates(item, drawings) {
  const drawingNo = identity(item.drawing);
  if (!drawingNo) return [];
  const revision = identity(item.revision);
  return drawings.filter((drawing) => (
    identity(drawing.drawingNo) === drawingNo
    && (!revision || identity(drawing.revision) === revision)
    && (!item.projectId || !drawing.projectId || drawing.projectId === item.projectId)
    && (!item.equipmentId || !drawing.equipmentId || drawing.equipmentId === item.equipmentId)
    && (revision || drawing.isCurrentRevision !== false)
  ));
}

function inventoryIdentityValues(item = {}) {
  return [item.id, item.trace, item.traceability].map(text).filter(Boolean);
}

function ids(records = [], identityValues = (record) => [record?.id]) {
  return new Set(records.flatMap(identityValues).map(text).filter(Boolean));
}

function missingSnapshotIssue(storeName, record, referenceField, reference, targetType, candidates) {
  if (candidates.length === 1) {
    return issue(storeName, record, 'MISSING_CANONICAL_ID', {
      referenceField,
      reference,
      targetType,
      suggestedReferenceId: candidates[0].id,
      detail: `O snapshot corresponde a um único ${targetType}; grave o ID estável e preserve o texto apenas como histórico de origem.`,
    });
  }
  if (candidates.length > 1) {
    return issue(storeName, record, 'AMBIGUOUS_SNAPSHOT', {
      referenceField,
      reference,
      targetType,
      detail: `O snapshot corresponde a mais de um ${targetType}; selecione explicitamente o registro correto.`,
    });
  }
  return issue(storeName, record, 'UNRESOLVED_SNAPSHOT', {
    referenceField,
    reference,
    targetType,
    detail: `O snapshot não corresponde a nenhum ${targetType} cadastrado. O texto foi preservado e nenhum ID foi inventado.`,
  });
}

function inspectMtoItems(sources, issues) {
  const equipments = sources.equipments || [];
  const drawings = sources.drawings || [];
  const equipmentIds = ids(equipments);
  const drawingIds = ids(drawings);
  (sources.mtoItems || []).forEach((item) => {
    if (item.equipmentId && !equipmentIds.has(text(item.equipmentId))) {
      issues.push(issue('mtoItems', item, 'BROKEN_REFERENCE', {
        referenceField: 'equipmentId', reference: item.equipmentId, targetType: 'EQUIPMENT',
        detail: 'O Equipment ID não existe no cadastro de Equipamentos.',
      }));
    } else if (!item.equipmentId && text(item.equipmentName || item.tag)) {
      issues.push(missingSnapshotIssue('mtoItems', item, 'equipmentId', item.equipmentName || item.tag, 'EQUIPMENT', equipmentCandidates(item, equipments)));
    }

    if (item.drawingRevisionId && !drawingIds.has(text(item.drawingRevisionId))) {
      issues.push(issue('mtoItems', item, 'BROKEN_REFERENCE', {
        referenceField: 'drawingRevisionId', reference: item.drawingRevisionId, targetType: 'DRAWING_REVISION',
        detail: 'O Drawing Revision ID não existe no cadastro de Drawings.',
      }));
    } else if (!item.drawingRevisionId && text(item.drawing)) {
      issues.push(missingSnapshotIssue('mtoItems', item, 'drawingRevisionId', item.drawing, 'DRAWING_REVISION', drawingCandidates(item, drawings)));
    }
  });
}

function inspectEquipments(sources, issues) {
  const equipmentTypes = sources.equipmentTypes || [];
  const typeIds = ids(equipmentTypes);
  (sources.equipments || []).forEach((equipment) => {
    if (equipment.equipmentTypeId && !typeIds.has(text(equipment.equipmentTypeId))) {
      issues.push(issue('equipments', equipment, 'BROKEN_REFERENCE', {
        referenceField: 'equipmentTypeId', reference: equipment.equipmentTypeId, targetType: 'EQUIPMENT_TYPE',
        detail: 'O Equipment Type ID não existe no catálogo de tipos.',
      }));
      return;
    }
    if (equipment.equipmentTypeId || !text(equipment.equipmentType)) return;
    const candidates = equipmentTypes.filter((type) => identity(type.name) === identity(equipment.equipmentType)
      && (!type.projectId || type.projectId === equipment.projectId));
    issues.push(missingSnapshotIssue('equipments', equipment, 'equipmentTypeId', equipment.equipmentType, 'EQUIPMENT_TYPE', candidates));
  });
}

function inspectDrawings(sources, issues) {
  const equipmentIds = ids(sources.equipments || []);
  const workpackIds = ids(sources.workpacks || []);
  (sources.drawings || []).forEach((drawing) => {
    if (!text(drawing.equipmentId)) {
      issues.push(issue('drawings', drawing, 'MISSING_CANONICAL_ID', {
        referenceField: 'equipmentId', targetType: 'EQUIPMENT',
        detail: 'O Drawing deve pertencer a um Equipment por ID; referências textuais não substituem esse vínculo.',
      }));
    } else if (!equipmentIds.has(text(drawing.equipmentId))) {
      issues.push(issue('drawings', drawing, 'BROKEN_REFERENCE', {
        referenceField: 'equipmentId', reference: drawing.equipmentId, targetType: 'EQUIPMENT',
        detail: 'O Equipment ID do Drawing não existe.',
      }));
    }
    if (drawing.workpackId && !workpackIds.has(text(drawing.workpackId))) {
      issues.push(issue('drawings', drawing, 'BROKEN_REFERENCE', {
        referenceField: 'workpackId', reference: drawing.workpackId, targetType: 'WORKPACK',
        detail: 'O Workpack ID legado do Drawing não existe.',
      }));
    }
  });
}

function inspectWorkpacks(sources, issues) {
  const equipmentIds = ids(sources.equipments || []);
  const drawingIds = ids(sources.drawings || []);
  const activeLinks = (sources.workpackLinks || []).filter((link) => text(link.status).toUpperCase() !== 'INACTIVE');
  (sources.workpacks || []).forEach((workpack) => {
    if (!text(workpack.equipmentId)) {
      issues.push(issue('workpacks', workpack, 'MISSING_CANONICAL_ID', {
        referenceField: 'equipmentId', reference: workpack.equipmentName, targetType: 'EQUIPMENT',
        detail: 'O Workpack exige um Equipment ID; equipmentName é somente snapshot de exibição.',
      }));
    } else if (!equipmentIds.has(text(workpack.equipmentId))) {
      issues.push(issue('workpacks', workpack, 'BROKEN_REFERENCE', {
        referenceField: 'equipmentId', reference: workpack.equipmentId, targetType: 'EQUIPMENT',
        detail: 'O Equipment ID do Workpack não existe.',
      }));
    }
    if (!workpack.drawingId) return;
    if (!drawingIds.has(text(workpack.drawingId))) {
      issues.push(issue('workpacks', workpack, 'BROKEN_REFERENCE', {
        referenceField: 'drawingId', reference: workpack.drawingId, targetType: 'DRAWING_REVISION',
        detail: 'O Drawing ID legado do Workpack não existe.',
      }));
      return;
    }
    const linked = activeLinks.some((link) => link.workpackId === workpack.id
      && link.targetType === 'DRAWING_REVISION' && link.targetId === workpack.drawingId);
    if (!linked) {
      issues.push(issue('workpacks', workpack, 'LEGACY_RELATION', {
        referenceField: 'drawingId', reference: workpack.drawingId, targetType: 'WORKPACK_LINK',
        suggestedReferenceId: workpack.drawingId,
        detail: 'O Drawing está apenas no campo legado drawingId e ainda não possui Workpack Link equivalente.',
      }));
    }
  });
}

function inspectMaterialUnits(sources, issues) {
  const poItemIds = ids(sources.purchaseOrderItems || []);
  const receiptLineIds = ids(sources.materialReceiptLines || []);
  const inventoryIds = ids(sources.inventory || [], inventoryIdentityValues);
  (sources.materialUnits || []).forEach((unit) => {
    [
      ['poItemId', unit.poItemId, 'PURCHASE_ORDER_ITEM', poItemIds],
      ['receiptLineId', unit.receiptLineId, 'MATERIAL_RECEIPT_LINE', receiptLineIds],
      ['inventoryItemId', unit.inventoryItemId, 'INVENTORY_ITEM', inventoryIds],
    ].forEach(([referenceField, reference, targetType, knownIds]) => {
      if (!reference || knownIds.has(text(reference))) return;
      issues.push(issue('materialUnits', unit, 'BROKEN_REFERENCE', {
        referenceField, reference, targetType,
        detail: `O ${referenceField} da unidade recebida não existe no respectivo cadastro.`,
      }));
    });
  });
}

function inspectMtoPoItemAllocations(sources, issues) {
  const mtoItemIds = ids(sources.mtoItems || []);
  const poItemIds = ids(sources.purchaseOrderItems || []);
  (sources.mtoPoItemAllocations || [])
    .filter((allocation) => text(allocation.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .forEach((allocation) => {
      [
        ['mtoLineId', allocation.mtoLineId || allocation.mtoItemId, 'MTO_ITEM', mtoItemIds],
        ['poItemId', allocation.poItemId, 'PURCHASE_ORDER_ITEM', poItemIds],
      ].forEach(([referenceField, reference, targetType, knownIds]) => {
        if (reference && knownIds.has(text(reference))) return;
        issues.push(issue('mtoPoItemAllocations', allocation, 'BROKEN_REFERENCE', {
          referenceField,
          reference,
          targetType,
          detail: `A alocação entre demanda e compra aponta para um ${targetType} inexistente.`,
        }));
      });
    });
}

function inspectPoDeliveryForecasts(sources, issues) {
  const poItemIds = ids(sources.purchaseOrderItems || []);
  (sources.poDeliveryForecasts || []).filter((forecast) => text(forecast.status || 'ACTIVE').toUpperCase() !== 'CANCELLED').forEach((forecast) => {
    if (forecast.poItemId && poItemIds.has(text(forecast.poItemId))) return;
    issues.push(issue('poDeliveryForecasts', forecast, 'BROKEN_REFERENCE', {
      referenceField: 'poItemId', reference: forecast.poItemId, targetType: 'PURCHASE_ORDER_ITEM',
      detail: 'A previsão logística aponta para um PO Item inexistente.',
    }));
  });
}

function inspectInventory(sources, issues) {
  const materialUnitIds = ids(sources.materialUnits || []);
  const poItemIds = ids(sources.purchaseOrderItems || []);
  (sources.inventory || []).forEach((item) => {
    const references = [
      ['metadata.materialUnitId', item.metadata?.materialUnitId, 'MATERIAL_UNIT', materialUnitIds],
      ['metadata.poItemId', item.metadata?.poItemId, 'PURCHASE_ORDER_ITEM', poItemIds],
    ];
    references.forEach(([referenceField, reference, targetType, knownIds]) => {
      if (!reference || knownIds.has(text(reference))) return;
      issues.push(issue('inventory', item, 'BROKEN_REFERENCE', {
        referenceField, reference, targetType,
        detail: `A referência ${referenceField} do Inventory não existe. O item foi preservado para revisão manual.`,
      }));
    });
  });
}

function workpackLinkTargets(sources) {
  return {
    DRAWING_REVISION: ids(sources.drawings || []),
    MTO_ITEM: ids(sources.mtoItems || []),
    INVENTORY_ITEM: ids(sources.inventory || [], inventoryIdentityValues),
    NESTING_PLAN: ids(sources.plans || [], (record) => [record.id, record.name]),
    MATERIAL_COUPON: ids(sources.materialCoupons || []),
    CUTTING_SHEET: ids(sources.cuttingSheets || []),
    RETURN_MATERIAL_VOUCHER: ids(sources.returnMaterialVouchers || []),
    OFFCUT: ids(sources.offcuts || []),
  };
}

function inspectWorkpackLinks(sources, issues) {
  const workpackIds = ids(sources.workpacks || []);
  const targets = workpackLinkTargets(sources);
  (sources.workpackLinks || []).filter((link) => text(link.status).toUpperCase() !== 'INACTIVE').forEach((link) => {
    if (!workpackIds.has(text(link.workpackId))) {
      issues.push(issue('workpackLinks', link, 'BROKEN_REFERENCE', {
        referenceField: 'workpackId', reference: link.workpackId, targetType: 'WORKPACK',
        detail: 'O Workpack Link aponta para um Workpack inexistente.',
      }));
    }
    const targetIds = targets[text(link.targetType).toUpperCase()];
    if (!targetIds || targetIds.has(text(link.targetId))) return;
    issues.push(issue('workpackLinks', link, 'BROKEN_REFERENCE', {
      referenceField: 'targetId', reference: link.targetId, targetType: link.targetType,
      detail: `O Workpack Link aponta para um registro ${link.targetType} inexistente.`,
    }));
  });
}

export function buildEntityReferenceIssues(sources = {}) {
  const issues = [];
  inspectEquipments(sources, issues);
  inspectMtoItems(sources, issues);
  inspectDrawings(sources, issues);
  inspectWorkpacks(sources, issues);
  inspectMtoPoItemAllocations(sources, issues);
  inspectPoDeliveryForecasts(sources, issues);
  inspectMaterialUnits(sources, issues);
  inspectInventory(sources, issues);
  inspectWorkpackLinks(sources, issues);
  return issues.sort((left, right) => left.storeName.localeCompare(right.storeName)
    || left.recordLabel.localeCompare(right.recordLabel)
    || left.referenceField.localeCompare(right.referenceField));
}
