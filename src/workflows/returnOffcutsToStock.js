// src/workflows/returnOffcutsToStock.js

export const RETURN_OFFCUT_MODES = Object.freeze({
  OPERATIONAL_STOCK: "OPERATIONAL_STOCK",
  SCRAP: "SCRAP",
  FISCAL_RETURN_PENDING: "FISCAL_RETURN_PENDING"
});

export const RETURN_OFFCUT_STATUS = Object.freeze({
  AVAILABLE_OFFCUT: "AVAILABLE_OFFCUT",
  SCRAP: "SCRAP",
  PENDING_RMV: "PENDING_RMV"
});

const DEFAULT_SETTINGS = Object.freeze({
  traceSuffix: "OC",
  traceSeparator: "-",
  tracePadSize: 3,
  traceStartIndex: 1,
  scrapReason: "Offcut returned as scrap",
  requireRmvId: false,
  idPrefix: "offcut",
  auditEntityType: "OFFCUT_RETURN"
});

function nowIso(settings = {}) {
  if (typeof settings.nowFactory === "function") return settings.nowFactory();
  return new Date().toISOString();
}

function createId(settings = {}) {
  if (typeof settings.idFactory === "function") return settings.idFactory();

  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${settings.idPrefix || DEFAULT_SETTINGS.idPrefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeReturnMode(returnMode) {
  const value = cleanText(returnMode).toUpperCase();

  if (Object.values(RETURN_OFFCUT_MODES).includes(value)) {
    return value;
  }

  throw new Error(
    `Invalid returnMode "${returnMode}". Expected OPERATIONAL_STOCK, SCRAP, or FISCAL_RETURN_PENDING.`
  );
}

function normalizeNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = cleanText(value);
  if (!text) return fallback;

  const normalized = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getParentStock(parentCuttingPackage = {}) {
  return (
    parentCuttingPackage.stockItem ||
    parentCuttingPackage.inventoryItem ||
    parentCuttingPackage.parentStock ||
    parentCuttingPackage.stock ||
    {}
  );
}

function getParentTrace(parentCuttingPackage = {}, offcut = {}) {
  const parentStock = getParentStock(parentCuttingPackage);

  return cleanText(
    pickFirst(
      offcut.parentTrace,
      offcut.parentTraceability,
      parentCuttingPackage.parentTrace,
      parentCuttingPackage.parentTraceability,
      parentCuttingPackage.traceability,
      parentStock.traceability,
      parentStock.trace,
      parentStock.id
    )
  );
}

function getRmvId(parentCuttingPackage = {}, offcut = {}, settings = {}) {
  return cleanText(
    pickFirst(
      offcut.rmvId,
      offcut.returnMaterialVoucherId,
      parentCuttingPackage.rmvId,
      parentCuttingPackage.returnMaterialVoucherId,
      parentCuttingPackage.rmv?.id,
      settings.rmvId,
      settings.returnMaterialVoucherId
    )
  );
}

export function createOffcutTraceability(parentTrace, index, settings = {}) {
  const cfg = { ...DEFAULT_SETTINGS, ...settings };

  const baseTrace = cleanText(
    pickFirst(cfg.tracePrefix, parentTrace, "TRACE")
  );

  const numericIndex = normalizeNumber(index, cfg.traceStartIndex);
  const paddedIndex = String(numericIndex).padStart(cfg.tracePadSize, "0");

  return [
    baseTrace,
    cfg.traceSuffix,
    paddedIndex
  ].filter(Boolean).join(cfg.traceSeparator);
}

function buildCommonOffcutFields(offcut, parentCuttingPackage, index, settings) {
  const parentStock = getParentStock(parentCuttingPackage);
  const parentTrace = getParentTrace(parentCuttingPackage, offcut);
  const createdAt = nowIso(settings);

  const po = pickFirst(
    offcut.po,
    parentCuttingPackage.po,
    parentStock.po
  );

  const item = pickFirst(
    offcut.item,
    parentCuttingPackage.item,
    parentStock.item
  );

  const heat = pickFirst(
    offcut.heat,
    offcut.heatNumber,
    parentCuttingPackage.heat,
    parentCuttingPackage.heatNumber,
    parentStock.heat,
    parentStock.heatNumber
  );

  const material = pickFirst(
    offcut.material,
    offcut.materialGrade,
    parentCuttingPackage.material,
    parentCuttingPackage.materialGrade,
    parentStock.material,
    parentStock.materialGrade,
    parentStock.grade
  );

  const description = pickFirst(
    offcut.description,
    parentCuttingPackage.description,
    parentStock.description
  );

  return {
    id: createId(settings),
    sourceOffcutId: offcut.id ?? null,
    parentCuttingPackageId: parentCuttingPackage.id ?? null,
    parentInventoryId: parentStock.id ?? null,
    parentTrace,
    po: po ?? "",
    item: item ?? "",
    heat: heat ?? "",
    heatNumber: heat ?? "",
    material: material ?? "",
    materialGrade: material ?? "",
    description: description ?? "",
    length: normalizeNumber(
      pickFirst(offcut.length, offcut.lengthMm, offcut.remainingLength, offcut.offcutLength),
      0
    ),
    lengthMm: normalizeNumber(
      pickFirst(offcut.lengthMm, offcut.length, offcut.remainingLength, offcut.offcutLength),
      0
    ),
    width: normalizeNumber(pickFirst(offcut.width, offcut.widthMm), 0),
    widthMm: normalizeNumber(pickFirst(offcut.widthMm, offcut.width), 0),
    thickness: normalizeNumber(
      pickFirst(offcut.thickness, offcut.thicknessMm, offcut.thk),
      0
    ),
    thicknessMm: normalizeNumber(
      pickFirst(offcut.thicknessMm, offcut.thickness, offcut.thk),
      0
    ),
    quantity: normalizeNumber(pickFirst(offcut.quantity, offcut.qty), 1),
    qty: normalizeNumber(pickFirst(offcut.qty, offcut.quantity), 1),
    weightKg: normalizeNumber(offcut.weightKg, 0),
    isOffcut: true,
    createdAt,
    updatedAt: createdAt,
    metadata: {
      ...(offcut.metadata || {}),
      generatedFrom: "NESTING",
      parentCuttingPackageId: parentCuttingPackage.id ?? null,
      parentTrace,
      originalOffcut: { ...offcut },
      sequence: index
    }
  };
}

function createAuditEntry(action, item, returnMode, details, settings) {
  const createdAt = nowIso(settings);

  return {
    id: createId({ ...settings, idPrefix: "audit" }),
    entityType: DEFAULT_SETTINGS.auditEntityType,
    entityId: item.id,
    action,
    returnMode,
    status: item.status,
    parentTrace: item.parentTrace ?? "",
    traceability: item.traceability ?? "",
    createdAt,
    timestamp: createdAt,
    details: {
      ...details,
      sourceOffcutId: item.sourceOffcutId ?? null,
      parentCuttingPackageId: item.parentCuttingPackageId ?? null
    }
  };
}

export function returnOffcutsToStock(
  generatedOffcuts = [],
  parentCuttingPackage = {},
  returnMode = RETURN_OFFCUT_MODES.OPERATIONAL_STOCK,
  settings = {}
) {
  const cfg = { ...DEFAULT_SETTINGS, ...settings };
  const mode = normalizeReturnMode(returnMode);

  const inventoryItemsToAdd = [];
  const scrapItems = [];
  const rmvItems = [];
  const auditEntries = [];

  const offcuts = toArray(generatedOffcuts);

  offcuts.forEach((offcut, arrayIndex) => {
    const sequence = cfg.traceStartIndex + arrayIndex;
    const common = buildCommonOffcutFields(
      offcut,
      parentCuttingPackage,
      sequence,
      cfg
    );

    if (mode === RETURN_OFFCUT_MODES.OPERATIONAL_STOCK) {
      const inventoryItem = {
        ...common,
        traceability: createOffcutTraceability(common.parentTrace, sequence, cfg),
        status: RETURN_OFFCUT_STATUS.AVAILABLE_OFFCUT,
        source: "OFFCUT_RETURN",
        availableLength: common.lengthMm,
        availableLengthMm: common.lengthMm
      };

      inventoryItemsToAdd.push(inventoryItem);

      auditEntries.push(
        createAuditEntry(
          "OFFCUT_RETURNED_TO_OPERATIONAL_STOCK",
          inventoryItem,
          mode,
          {
            message: "Offcut converted into available inventory item."
          },
          cfg
        )
      );

      return;
    }

    if (mode === RETURN_OFFCUT_MODES.SCRAP) {
      const scrapItem = {
        ...common,
        traceability: createOffcutTraceability(common.parentTrace, sequence, cfg),
        status: RETURN_OFFCUT_STATUS.SCRAP,
        scrapReason: cleanText(
          pickFirst(offcut.scrapReason, offcut.reason, cfg.scrapReason)
        ),
        availableLength: 0,
        availableLengthMm: 0
      };

      scrapItems.push(scrapItem);

      auditEntries.push(
        createAuditEntry(
          "OFFCUT_MARKED_AS_SCRAP",
          scrapItem,
          mode,
          {
            message: "Offcut marked as scrap and not returned to available stock.",
            scrapReason: scrapItem.scrapReason
          },
          cfg
        )
      );

      return;
    }

    if (mode === RETURN_OFFCUT_MODES.FISCAL_RETURN_PENDING) {
      const rmvId = getRmvId(parentCuttingPackage, offcut, cfg);

      if (cfg.requireRmvId && !rmvId) {
        throw new Error(
          "returnMode FISCAL_RETURN_PENDING requires rmvId or returnMaterialVoucherId."
        );
      }

      const rmvItem = {
        ...common,
        traceability: createOffcutTraceability(common.parentTrace, sequence, cfg),
        status: RETURN_OFFCUT_STATUS.PENDING_RMV,
        rmvId,
        returnMaterialVoucherId: rmvId,
        availableLength: 0,
        availableLengthMm: 0
      };

      rmvItems.push(rmvItem);

      auditEntries.push(
        createAuditEntry(
          "OFFCUT_PENDING_FISCAL_RETURN",
          rmvItem,
          mode,
          {
            message: "Offcut linked to RMV and marked as pending fiscal return.",
            rmvId
          },
          cfg
        )
      );
    }
  });

  return {
    inventoryItemsToAdd,
    scrapItems,
    rmvItems,
    auditEntries
  };
}
