import { inferPurchaseOrderMaterialFields, materialTypeIdentCode } from './purchaseOrderImport.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function traceabilityValues(record) {
  if (typeof record === 'string') return [record];
  if (!record || typeof record !== 'object') return [];
  return [record.traceability, record.trace, record.id];
}

const PROJECT_TRACEABILITY_CODES = Object.freeze([
  [['GRANMORGU', 'B58'], 'G'], [['LULA'], 'LU'], [['CAIBUNAS'], 'CA'], [['BUZIOS5', 'BUZIOS 5'], 'B5'],
  [['BUZIOS7', 'BUZIOS 7'], 'B7'], [['LAPASW', 'LAPA SW'], 'LA'], [['RAIABMC33', 'RAIA BMC33'], 'RA'],
]);

function upper(value) { return text(value).toUpperCase(); }
function compact(value) { return upper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ''); }

export function projectTraceabilityCode(project = {}) {
  const explicit = compact(project.traceabilityCode || project.materialTraceabilityCode || project.materialShortCode);
  if (explicit) return explicit;
  const values = [project.name, project.code, project.shortCode].map(upper).filter(Boolean);
  const matched = PROJECT_TRACEABILITY_CODES.find(([aliases]) => aliases.some((alias) => values.some((value) => compact(value).includes(compact(alias)))));
  return matched?.[1] || '';
}

export function materialTypeTraceabilityCode(item = {}) {
  const identPrefix = upper(item.identCode).match(/^([A-Z]{2})(?:-|$)/)?.[1];
  if (identPrefix) return identPrefix;
  const inferredType = inferPurchaseOrderMaterialFields(item.description).itemType;
  return materialTypeIdentCode(item.itemType || item.materialType || inferredType);
}

export function derivePoItemBaseTraceability({ project = {}, purchaseOrder = {}, item = {} } = {}) {
  const poNumber = text(purchaseOrder.poNumber);
  const itemNumber = text(item.itemNumber);
  if (!poNumber || !itemNumber) throw new Error('TRACEABILITY_PO_ITEM_REQUIRED');
  const projectCode = projectTraceabilityCode(project);
  const materialCode = materialTypeTraceabilityCode(item);
  if (projectCode && materialCode) return `${projectCode}${materialCode}${poNumber}-${itemNumber}`;
  const imported = text(item.traceability);
  if (/^[A-Z]/i.test(imported) && upper(imported).endsWith(upper(`${poNumber}-${itemNumber}`))) return imported;
  if (!projectCode) throw new Error('TRACEABILITY_PROJECT_CODE_REQUIRED');
  if (!materialCode) throw new Error('TRACEABILITY_MATERIAL_TYPE_CODE_REQUIRED');
  return '';
}

export function highestSequentialTraceability(baseTraceability, existingRecords = []) {
  const base = text(baseTraceability);
  if (!base) throw new Error('BASE_TRACEABILITY_REQUIRED');
  const pattern = new RegExp(`^${escapeRegExp(base)}-(\\d{3,})$`, 'i');
  return (Array.isArray(existingRecords) ? existingRecords : [])
    .flatMap(traceabilityValues)
    .map((value) => text(value).match(pattern))
    .filter(Boolean)
    .reduce((highest, match) => Math.max(highest, Number(match[1])), 0);
}

export function generateSequentialTraceabilities(baseTraceability, quantity, existingRecords = []) {
  const count = Number(quantity);
  if (!Number.isInteger(count) || count <= 0) throw new Error('SEQUENTIAL_TRACEABILITY_QUANTITY_INVALID');
  const base = text(baseTraceability);
  const firstSequence = highestSequentialTraceability(base, existingRecords) + 1;
  return Array.from({ length: count }, (_, index) => `${base}-${String(firstSequence + index).padStart(3, '0')}`);
}
