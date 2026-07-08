export const CHECK_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  WARNING: "WARNING",
  NOT_APPLICABLE: "NOT_APPLICABLE"
});

export const CHECK_SEVERITY = Object.freeze({
  BLOCKING: "BLOCKING",
  WARNING: "WARNING",
  INFO: "INFO"
});

const CHECK_LABELS = Object.freeze({
  PROJECT_REQUIRED: "Todos os itens possuem projeto",
  DRAWING_REQUIRED: "Todos os itens possuem drawing number",
  MARK_OR_POS_REQUIRED: "Todos os itens possuem mark ou pos",
  LENGTH_REQUIRED: "Todos os itens possuem comprimento",
  MATERIAL_GRADE_REQUIRED: "Todos os itens possuem material grade",
  STOCK_TRACEABILITY_REQUIRED: "Estoque possui traceability",
  STOCK_PO_ITEM_REQUIRED: "Estoque possui PO e item PO",
  STOCK_HEAT_REQUIRED: "Estoque possui heat quando aplicavel",
  MATERIAL_COMPATIBILITY: "Material da MTO e compativel com estoque",
  REQUIRED_QUANTITY_COVERED: "Quantidade requerida foi atendida",
  UNALLOCATED_PARTS_LISTED: "Pecas nao alocadas foram listadas",
  OFFCUTS_CLASSIFIED: "Retalhos foram classificados como aproveitaveis, sucata ou retorno pendente",
  DOCUMENT_NUMBERS_UNIQUE: "Material Coupon, Cutting Sheet e RMV possuem numeracao unica",
  DOCUMENTS_LINKED_TO_PACKAGE: "Documentos estao vinculados ao mesmo CuttingPackage ID",
  AUDIT_LOG_GENERATED: "Audit log foi gerado"
});

const VALID_OFFCUT_CLASSIFICATIONS = new Set([
  "USABLE",
  "OPERATIONAL_STOCK",
  "SCRAP",
  "FISCAL_RETURN_PENDING",
  "AVAILABLE_OFFCUT",
  "PENDING_RMV"
]);

export function validateCuttingPackage(cuttingPackage = {}, options = {}) {
  const checklist = [
    checkProjectRequired(cuttingPackage),
    checkDrawingRequired(cuttingPackage),
    checkMarkOrPosRequired(cuttingPackage),
    checkLengthRequired(cuttingPackage),
    checkMaterialGradeRequired(cuttingPackage),
    checkStockTraceabilityRequired(cuttingPackage),
    checkStockPoItemRequired(cuttingPackage),
    checkStockHeatRequired(cuttingPackage, options),
    checkMaterialCompatibility(cuttingPackage, options),
    checkRequiredQuantityCovered(cuttingPackage),
    checkUnallocatedPartsListed(cuttingPackage),
    checkOffcutsClassified(cuttingPackage),
    checkDocumentNumbersUnique(cuttingPackage),
    checkDocumentsLinkedToPackage(cuttingPackage),
    checkAuditLogGenerated(cuttingPackage)
  ];

  const blockingErrors = checklist
    .filter((item) => item.status === CHECK_STATUS.FAIL && item.severity === CHECK_SEVERITY.BLOCKING)
    .map(({ id, message, details }) => ({ id, message, details }));

  const warnings = checklist
    .filter((item) => item.status === CHECK_STATUS.WARNING || item.severity === CHECK_SEVERITY.WARNING)
    .map(({ id, message, details }) => ({ id, message, details }));

  return {
    valid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    checklist
  };
}

function checkProjectRequired(cuttingPackage) {
  const items = getMtoItems(cuttingPackage);
  const packageProject = getPackageProject(cuttingPackage);
  const missing = items
    .map((item, index) => ({ index, itemId: getItemId(item, index), project: getItemProject(item) || packageProject }))
    .filter((detail) => !detail.project);

  return blockingCheck(
    "PROJECT_REQUIRED",
    missing,
    "Todos os itens de MTO possuem projeto.",
    "Itens de MTO sem projeto."
  );
}

function checkDrawingRequired(cuttingPackage) {
  const missing = getMtoItems(cuttingPackage)
    .map((item, index) => ({ index, itemId: getItemId(item, index), drawing: getDrawing(item) }))
    .filter((detail) => !detail.drawing);

  return blockingCheck(
    "DRAWING_REQUIRED",
    missing,
    "Todos os itens de MTO possuem drawing number.",
    "Itens de MTO sem drawing number."
  );
}

function checkMarkOrPosRequired(cuttingPackage) {
  const missing = getMtoItems(cuttingPackage)
    .map((item, index) => ({
      index,
      itemId: getItemId(item, index),
      mark: safeText(pickFirst(item.mark, item.Mark)),
      pos: safeText(pickFirst(item.pos, item.position, item.POS))
    }))
    .filter((detail) => !detail.mark && !detail.pos);

  return blockingCheck(
    "MARK_OR_POS_REQUIRED",
    missing,
    "Todos os itens de MTO possuem mark ou pos.",
    "Itens de MTO sem mark e sem pos."
  );
}

function checkLengthRequired(cuttingPackage) {
  const missing = getMtoItems(cuttingPackage)
    .map((item, index) => ({ index, itemId: getItemId(item, index), length: getLength(item) }))
    .filter((detail) => detail.length <= 0);

  return blockingCheck(
    "LENGTH_REQUIRED",
    missing,
    "Todos os itens de MTO possuem comprimento positivo.",
    "Itens de MTO sem comprimento positivo."
  );
}

function checkMaterialGradeRequired(cuttingPackage) {
  const missing = getMtoItems(cuttingPackage)
    .map((item, index) => ({ index, itemId: getItemId(item, index), materialGrade: getMaterialGrade(item) }))
    .filter((detail) => !detail.materialGrade);

  return blockingCheck(
    "MATERIAL_GRADE_REQUIRED",
    missing,
    "Todos os itens de MTO possuem material grade.",
    "Itens de MTO sem material grade."
  );
}

function checkStockTraceabilityRequired(cuttingPackage) {
  const missing = getStockItems(cuttingPackage)
    .map((stock, index) => ({ index, stockId: getStockId(stock, index), traceability: getTraceability(stock) }))
    .filter((detail) => !detail.traceability);

  return blockingCheck(
    "STOCK_TRACEABILITY_REQUIRED",
    missing,
    "Todos os itens de estoque possuem traceability.",
    "Itens de estoque sem traceability."
  );
}

function checkStockPoItemRequired(cuttingPackage) {
  const missing = getStockItems(cuttingPackage)
    .map((stock, index) => ({
      index,
      stockId: getStockId(stock, index),
      po: getPo(stock),
      poItem: getPoItem(stock)
    }))
    .filter((detail) => !detail.po || !detail.poItem);

  return blockingCheck(
    "STOCK_PO_ITEM_REQUIRED",
    missing,
    "Todos os itens de estoque possuem PO e item PO.",
    "Itens de estoque sem PO ou item PO."
  );
}

function checkStockHeatRequired(cuttingPackage, options) {
  const applicable = getStockItems(cuttingPackage).filter((stock) => stock?.requiresHeat !== false);

  if (applicable.length === 0) {
    return makeChecklistItem(
      "STOCK_HEAT_REQUIRED",
      CHECK_LABELS.STOCK_HEAT_REQUIRED,
      CHECK_STATUS.NOT_APPLICABLE,
      CHECK_SEVERITY.INFO,
      "Heat nao aplicavel aos itens de estoque selecionados.",
      []
    );
  }

  const missing = applicable
    .map((stock, index) => ({ index, stockId: getStockId(stock, index), heat: getHeat(stock) }))
    .filter((detail) => !detail.heat);

  if (missing.length === 0) {
    return passCheck("STOCK_HEAT_REQUIRED", "Todos os itens de estoque aplicaveis possuem heat.");
  }

  if (options.requireHeat === false) {
    return makeChecklistItem(
      "STOCK_HEAT_REQUIRED",
      CHECK_LABELS.STOCK_HEAT_REQUIRED,
      CHECK_STATUS.WARNING,
      CHECK_SEVERITY.WARNING,
      "Existem itens de estoque sem heat, mas heat nao esta bloqueante pelas opcoes.",
      missing
    );
  }

  return makeChecklistItem(
    "STOCK_HEAT_REQUIRED",
    CHECK_LABELS.STOCK_HEAT_REQUIRED,
    CHECK_STATUS.FAIL,
    CHECK_SEVERITY.BLOCKING,
    "Itens de estoque sem heat quando aplicavel.",
    missing
  );
}

function checkMaterialCompatibility(cuttingPackage, options) {
  const requiredMaterials = uniqueNonEmpty(getMtoItems(cuttingPackage).map(getMaterialGrade));
  const stockMaterials = uniqueNonEmpty(getStockItems(cuttingPackage).map(getMaterialGrade));

  const missing = requiredMaterials
    .filter((required) => !stockMaterials.some((stock) => isMaterialCompatible(required, stock, options)))
    .map((materialGrade) => ({ materialGrade }));

  return blockingCheck(
    "MATERIAL_COMPATIBILITY",
    missing,
    "Todos os grupos de material da MTO possuem estoque compativel.",
    "Existem materiais de MTO sem estoque compativel."
  );
}

function checkRequiredQuantityCovered(cuttingPackage) {
  const requiredQuantity = getRequiredQuantity(cuttingPackage);
  const nestedQuantity = getNestedQuantity(cuttingPackage);
  const details = [{ requiredQuantity, nestedQuantity, shortage: Math.max(0, requiredQuantity - nestedQuantity) }];

  if (requiredQuantity <= nestedQuantity) {
    return passCheck("REQUIRED_QUANTITY_COVERED", "Quantidade requerida foi atendida.", details);
  }

  return makeChecklistItem(
    "REQUIRED_QUANTITY_COVERED",
    CHECK_LABELS.REQUIRED_QUANTITY_COVERED,
    CHECK_STATUS.FAIL,
    CHECK_SEVERITY.BLOCKING,
    "Quantidade requerida maior que a quantidade alocada/nested.",
    details
  );
}

function checkUnallocatedPartsListed(cuttingPackage) {
  const requiredQuantity = getRequiredQuantity(cuttingPackage);
  const nestedQuantity = getNestedQuantity(cuttingPackage);
  const unallocatedParts = getUnallocatedParts(cuttingPackage);
  const details = [{ requiredQuantity, nestedQuantity, unallocatedCount: unallocatedParts.length }];

  if (requiredQuantity <= nestedQuantity && unallocatedParts.length === 0) {
    return passCheck("UNALLOCATED_PARTS_LISTED", "Nao ha pecas nao alocadas pendentes.", details);
  }

  if (requiredQuantity > nestedQuantity && unallocatedParts.length > 0) {
    return makeChecklistItem(
      "UNALLOCATED_PARTS_LISTED",
      CHECK_LABELS.UNALLOCATED_PARTS_LISTED,
      CHECK_STATUS.WARNING,
      CHECK_SEVERITY.WARNING,
      "Quantidade nao atendida, com pecas nao alocadas listadas para revisao.",
      details
    );
  }

  if (requiredQuantity <= nestedQuantity && unallocatedParts.length > 0) {
    return makeChecklistItem(
      "UNALLOCATED_PARTS_LISTED",
      CHECK_LABELS.UNALLOCATED_PARTS_LISTED,
      CHECK_STATUS.WARNING,
      CHECK_SEVERITY.WARNING,
      "Existem pecas nao alocadas listadas mesmo com quantidade aparentemente atendida.",
      details
    );
  }

  return makeChecklistItem(
    "UNALLOCATED_PARTS_LISTED",
    CHECK_LABELS.UNALLOCATED_PARTS_LISTED,
    CHECK_STATUS.FAIL,
    CHECK_SEVERITY.BLOCKING,
    "Quantidade nao atendida e lista de pecas nao alocadas esta vazia.",
    details
  );
}

function checkOffcutsClassified(cuttingPackage) {
  const offcuts = getGeneratedOffcuts(cuttingPackage);

  if (offcuts.length === 0) {
    return makeChecklistItem(
      "OFFCUTS_CLASSIFIED",
      CHECK_LABELS.OFFCUTS_CLASSIFIED,
      CHECK_STATUS.NOT_APPLICABLE,
      CHECK_SEVERITY.INFO,
      "Nao ha retalhos gerados.",
      []
    );
  }

  const unclassified = offcuts
    .map((offcut, index) => ({
      index,
      offcutId: getItemId(offcut, index),
      classification: normalizeText(pickFirst(offcut.classification, offcut.status))
    }))
    .filter((detail) => !VALID_OFFCUT_CLASSIFICATIONS.has(detail.classification));

  return blockingCheck(
    "OFFCUTS_CLASSIFIED",
    unclassified,
    "Todos os retalhos gerados possuem classificacao.",
    "Retalhos gerados sem classificacao/status valido."
  );
}

function checkDocumentNumbersUnique(cuttingPackage) {
  const numbers = getDocumentNumbers(cuttingPackage);
  const missing = numbers.filter((entry) => !entry.number);
  const seen = new Map();
  const duplicates = [];

  numbers.forEach((entry) => {
    if (!entry.number) return;
    const key = normalizeText(entry.number);
    if (seen.has(key)) {
      duplicates.push({ documentType: entry.type, documentNumber: entry.number, duplicatesWith: seen.get(key) });
      return;
    }
    seen.set(key, entry.type);
  });

  const details = [...missing.map((entry) => ({ documentType: entry.type, issue: "MISSING" })), ...duplicates];

  return blockingCheck(
    "DOCUMENT_NUMBERS_UNIQUE",
    details,
    "Material Coupon, Cutting Sheet e RMV possuem numeros preenchidos e unicos.",
    "Numeracao documental ausente ou duplicada."
  );
}

function checkDocumentsLinkedToPackage(cuttingPackage) {
  const packageId = safeText(cuttingPackage.id);
  const documents = getExistingDocuments(cuttingPackage);

  if (documents.length === 0) {
    return makeChecklistItem(
      "DOCUMENTS_LINKED_TO_PACKAGE",
      CHECK_LABELS.DOCUMENTS_LINKED_TO_PACKAGE,
      CHECK_STATUS.NOT_APPLICABLE,
      CHECK_SEVERITY.INFO,
      "Nao ha documentos gerados para validar vinculo.",
      []
    );
  }

  if (!packageId) {
    return makeChecklistItem(
      "DOCUMENTS_LINKED_TO_PACKAGE",
      CHECK_LABELS.DOCUMENTS_LINKED_TO_PACKAGE,
      CHECK_STATUS.FAIL,
      CHECK_SEVERITY.BLOCKING,
      "CuttingPackage sem ID para validar vinculo dos documentos.",
      documents.map((document) => ({ documentType: document.type }))
    );
  }

  const invalid = documents
    .map(({ type, document }) => ({
      documentType: type,
      cuttingPackageId: safeText(pickFirst(document.cuttingPackageId, document.packageId, document.metadata?.cuttingPackageId))
    }))
    .filter((detail) => detail.cuttingPackageId !== packageId);

  return blockingCheck(
    "DOCUMENTS_LINKED_TO_PACKAGE",
    invalid,
    "Todos os documentos estao vinculados ao mesmo CuttingPackage ID.",
    "Existem documentos sem vinculo ou vinculados a outro CuttingPackage."
  );
}

function checkAuditLogGenerated(cuttingPackage) {
  const auditEntries = [
    ...toArray(cuttingPackage.auditEntries),
    ...toArray(cuttingPackage.auditLog),
    ...toArray(cuttingPackage.metadata?.auditEntries)
  ];

  return blockingCheck(
    "AUDIT_LOG_GENERATED",
    auditEntries.length > 0 ? [] : [{ auditEntries: 0 }],
    "Audit log gerado.",
    "Nenhum audit log encontrado."
  );
}

function blockingCheck(id, failedDetails, passMessage, failMessage) {
  if (failedDetails.length === 0) {
    return passCheck(id, passMessage);
  }

  return makeChecklistItem(
    id,
    CHECK_LABELS[id],
    CHECK_STATUS.FAIL,
    CHECK_SEVERITY.BLOCKING,
    failMessage,
    failedDetails
  );
}

function passCheck(id, message, details = []) {
  return makeChecklistItem(id, CHECK_LABELS[id], CHECK_STATUS.PASS, CHECK_SEVERITY.INFO, message, details);
}

function makeChecklistItem(id, label, status, severity, message, details = []) {
  return { id, label, status, severity, message, details };
}

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/([^\w\s])\1+/g, "$1")
    .trim();
}

function normalizeMaterialText(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = safeText(value);
  if (!text) return 0;

  const normalized = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && safeText(value) !== "");
}

function getMtoItems(cuttingPackage) {
  return firstNonEmptyArray(cuttingPackage.mtoItems, cuttingPackage.requiredItems, cuttingPackage.selectedMtoItems);
}

function getStockItems(cuttingPackage) {
  return firstNonEmptyArray(cuttingPackage.stockItems, cuttingPackage.selectedStock, cuttingPackage.inventoryItems);
}

function getNestedPieces(cuttingPackage) {
  const allocatedPieces = toArray(cuttingPackage.allocatedPieces);
  if (allocatedPieces.length > 0) return allocatedPieces;

  return toArray(cuttingPackage.nestedBars).flatMap((bar) => toArray(bar?.pieces));
}

function getGeneratedOffcuts(cuttingPackage) {
  return toArray(cuttingPackage.generatedOffcuts);
}

function getUnallocatedParts(cuttingPackage) {
  return toArray(cuttingPackage.unallocatedParts);
}

function getDocumentNumbers(cuttingPackage) {
  return [
    {
      type: "materialCoupon",
      number: safeText(pickFirst(
        cuttingPackage.materialCouponNumber,
        cuttingPackage.metadata?.materialCouponNumber,
        cuttingPackage.materialCoupon?.documentNumber,
        cuttingPackage.documents?.materialCoupon?.documentNumber
      ))
    },
    {
      type: "cuttingSheet",
      number: safeText(pickFirst(
        cuttingPackage.cuttingSheetNumber,
        cuttingPackage.metadata?.cuttingSheetNumber,
        cuttingPackage.cuttingSheet?.documentNumber,
        cuttingPackage.documents?.cuttingSheet?.documentNumber
      ))
    },
    {
      type: "returnMaterialVoucher",
      number: safeText(pickFirst(
        cuttingPackage.rmvNumber,
        cuttingPackage.metadata?.rmvNumber,
        cuttingPackage.returnMaterialVoucher?.documentNumber,
        cuttingPackage.documents?.returnMaterialVoucher?.documentNumber
      ))
    }
  ];
}

function isMaterialCompatible(required, stock, options = {}) {
  const requiredValues = materialAliasSet(required, options);
  const stockValues = materialAliasSet(stock, options);
  if (requiredValues.size === 0 || stockValues.size === 0) return false;

  return [...requiredValues].some((requiredValue) => stockValues.has(requiredValue));
}

function materialAliasSet(value, options) {
  const base = normalizeMaterialText(value);
  const values = new Set(base ? [base] : []);
  const aliases = options.materialAliases || {};

  Object.entries(aliases).forEach(([canonical, aliasValues]) => {
    const normalizedCanonical = normalizeMaterialText(canonical);
    const normalizedAliases = toArray(aliasValues).map(normalizeMaterialText).filter(Boolean);
    const group = [normalizedCanonical, ...normalizedAliases].filter(Boolean);

    if (group.includes(base)) {
      group.forEach((entry) => values.add(entry));
    }
  });

  return values;
}

function getPackageProject(cuttingPackage) {
  return safeText(pickFirst(cuttingPackage.project, cuttingPackage.metadata?.project));
}

function getItemProject(item) {
  return safeText(pickFirst(item?.project, item?.projectName));
}

function getDrawing(item) {
  return safeText(pickFirst(item?.drawing, item?.drawingNumber, item?.dwgNumber, item?.drawingRef));
}

function getLength(item) {
  return normalizeNumber(pickFirst(item?.length, item?.lengthMm, item?.cutLength, item?.cutLengthMm, item?.requiredLength));
}

function getMaterialGrade(item) {
  return safeText(pickFirst(item?.materialGrade, item?.material, item?.grade));
}

function getTraceability(stock) {
  return safeText(pickFirst(stock?.traceability, stock?.trace, stock?.traceNo, stock?.id));
}

function getPo(stock) {
  return safeText(pickFirst(stock?.po, stock?.purchaseOrder, stock?.poNumber));
}

function getPoItem(stock) {
  return safeText(pickFirst(stock?.item, stock?.poItem, stock?.itemPo));
}

function getHeat(stock) {
  return safeText(pickFirst(stock?.heat, stock?.heatNumber));
}

function getItemId(item, index) {
  return safeText(pickFirst(item?.id, item?.mtoId, item?.lineId, item?.mark, item?.Mark, item?.pos, item?.position)) || String(index + 1);
}

function getStockId(stock, index) {
  return safeText(pickFirst(stock?.id, stock?.stockId, stock?.materialId, stock?.traceability, stock?.trace)) || String(index + 1);
}

function getRequiredQuantity(cuttingPackage) {
  return getMtoItems(cuttingPackage).reduce((total, item) => {
    const quantity = normalizeNumber(pickFirst(item?.qty, item?.quantity));
    return total + (quantity > 0 ? quantity : 1);
  }, 0);
}

function getNestedQuantity(cuttingPackage) {
  return getNestedPieces(cuttingPackage).reduce((total, piece) => {
    const quantity = normalizeNumber(pickFirst(piece?.qty, piece?.quantity));
    return total + (quantity > 0 ? quantity : 1);
  }, 0);
}

function getExistingDocuments(cuttingPackage) {
  const entries = [
    ["materialCoupon", cuttingPackage.materialCoupon],
    ["cuttingSheet", cuttingPackage.cuttingSheet],
    ["returnMaterialVoucher", cuttingPackage.returnMaterialVoucher],
    ["documents.materialCoupon", cuttingPackage.documents?.materialCoupon],
    ["documents.cuttingSheet", cuttingPackage.documents?.cuttingSheet],
    ["documents.returnMaterialVoucher", cuttingPackage.documents?.returnMaterialVoucher]
  ];

  return entries
    .filter(([, document]) => document && typeof document === "object" && Object.keys(document).length > 0)
    .map(([type, document]) => ({ type, document }));
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map(safeText).filter(Boolean))];
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length > 0) || [];
}
