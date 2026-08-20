import { buildCsv, downloadCsv } from '../data/csvExport.js';
import { exportCuttingSheetTraceabilityExcel } from '../data/excel.js';
import { equipmentTags } from '../core/equipmentPortfolio.js';
import { offcutClassificationLabel } from '../core/offcutClassification.js';
import { pieceEffectiveLengthMm, pieceNominalLengthMm, pieceSobremetalMm } from '../core/cuttingSheetPlanning.js';
import { cuttingSheetBarDisplayName, relatedCuttingSheetInventoryItem } from '../core/cuttingSheetPresentation.js';
import { projectDisplayName, resolveProject } from '../core/projectIdentity.js';
import { operationalWorkpackValue, workpackDisplayName } from '../core/workpackRelations.js';

export const CUTTING_SHEET_TRACEABILITY_COLUMNS = Object.freeze([
  ['cuttingSheetNumber', 'Folha de Corte', 23], ['cuttingSheetStatus', 'Status', 15], ['project', 'Projeto', 22],
  ['workpack', 'Workpack', 20], ['materialCouponNumber', 'Material Coupon', 23], ['responsible', 'Responsável pela Folha', 24],
  ['createdAt', 'Criada em', 19, 'date'], ['drawing', 'Desenho', 30], ['mark', 'Marca / Spool', 28], ['pos', 'Posição', 12],
  ['pieceQty', 'Quantidade de peças', 16, 'integer'], ['nominalLengthMm', 'Comprimento nominal (mm)', 20, 'number'],
  ['sobremetalMm', 'Sobremetal (mm)', 16, 'number'], ['effectiveLengthMm', 'Comprimento total de corte (mm)', 23, 'number'],
  ['pieceMaterial', 'Material da peça', 20], ['stockMaterialGrade', 'Grau do material em estoque', 23],
  ['stockReference', 'Material / Barra de origem', 27], ['equipmentLabel', 'Equipamento', 25],
  ['equipmentTag', 'TAG do equipamento', 21], ['location', 'Localização do equipamento', 24], ['mtoLinkStatus', 'Vínculo com MTO', 17],
].map(([key, label, width, type = 'text']) => ({
  key,
  label,
  width,
  type,
  statusStyle: ['cuttingSheetStatus', 'mtoLinkStatus'].includes(key),
  translateValues: ['cuttingSheetStatus', 'mtoLinkStatus'].includes(key),
})));

export const CUTTING_SHEET_TRACEABILITY_CSV_COLUMNS = CUTTING_SHEET_TRACEABILITY_COLUMNS;

export const OFFCUT_EXPORT_COLUMNS = Object.freeze([
  ['cuttingSheetNumber', 'Folha de Corte', 23], ['project', 'Projeto', 22], ['workpack', 'Workpack', 20],
  ['classification', 'Classificação', 18], ['operationalStatus', 'Status operacional', 24],
  ['traceability', 'Rastreabilidade da sobra', 28], ['parentTraceability', 'Rastreabilidade de origem', 28],
  ['material', 'Material', 20], ['heat', 'Heat Number', 18], ['lengthMm', 'Comprimento (mm)', 18, 'number'],
  ['qty', 'Quantidade', 12, 'integer'], ['disposition', 'Destino / Disposição', 22],
  ['materialCouponNumber', 'Material Coupon', 23], ['createdAt', 'Gerada em', 19, 'date'],
  ['updatedAt', 'Atualizada em', 19, 'date'], ['responsible', 'Responsável', 22],
].map(([key, label, width, type = 'text']) => ({
  key,
  label,
  width,
  type,
  statusStyle: ['classification', 'operationalStatus'].includes(key),
  translateValues: ['classification', 'operationalStatus', 'disposition'].includes(key),
})));

const CUTTING_SHEET_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  released: 'Emitida',
  cut: 'Cortada',
  cancelled: 'Cancelada',
  closed: 'Encerrada',
  in_progress: 'Em execução',
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value);
}

function firstText(...values) {
  return values.map(text).find((value) => value.trim()) || '';
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value).trim());
}

function operationalText(...values) {
  return values.map(text).map((value) => value.trim()).find((value) => value && !isUuid(value)) || '';
}

function statusLabel(value) {
  const normalized = text(value).trim().toLowerCase();
  return CUTTING_SHEET_STATUS_LABELS[normalized] || operationalText(value);
}

function dateValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date;
}

function positiveMeasurement(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : '';
}

function couponLines(coupon = {}) {
  if (Array.isArray(coupon.metadata?.coupon?.lines)) return coupon.metadata.coupon.lines;
  return list(coupon.items);
}

function couponNumber(coupon = {}) {
  return firstText(coupon.number, coupon.metadata?.coupon?.header?.mcCode);
}

function pieceQuantity(piece = {}) {
  return Object.hasOwn(piece, 'qty') && piece.qty != null ? piece.qty : 1;
}

/**
 * Builds one traceability row per persisted Cutting Sheet piece.
 * The caller owns persistence; this function only joins the supplied snapshots.
 */
export function buildCuttingSheetTraceabilityRows({
  cuttingSheets = [],
  materialCoupons = [],
  mtoItems = [],
  equipments = [],
  projects = [],
  workpacks = [],
  inventoryItems = [],
} = {}) {
  const couponsById = new Map(list(materialCoupons).map((coupon) => [text(coupon?.id), coupon]));
  const mtoById = new Map(list(mtoItems).map((item) => [text(item?.id), item]));
  const equipmentsById = new Map(list(equipments).map((equipment) => [text(equipment?.id), equipment]));

  return list(cuttingSheets).flatMap((cuttingSheet) => {
    const materialCouponId = text(cuttingSheet?.materialCouponId);
    const coupon = couponsById.get(materialCouponId);
    const linesById = new Map(couponLines(coupon).map((line) => [text(line?.id), line]));

    const resolvedProject = resolveProject(projects, cuttingSheet?.projectId);
    const resolvedWorkpack = list(workpacks).find((item) => [item?.id, item?.wpNo, item?.title]
      .map(text).includes(text(cuttingSheet?.workpackId)));
    const project = operationalText(
      resolvedProject ? projectDisplayName(projects, cuttingSheet?.projectId) : '',
      cuttingSheet?.metadata?.projectShortCode,
      cuttingSheet?.metadata?.project,
    );
    const workpack = operationalText(
      resolvedWorkpack ? workpackDisplayName(workpacks, cuttingSheet?.workpackId) : '',
      operationalWorkpackValue(cuttingSheet?.metadata?.workpack),
    );
    const responsible = operationalText(cuttingSheet?.createdBy, cuttingSheet?.releasedBy, cuttingSheet?.updatedBy);

    return list(cuttingSheet?.bars).flatMap((bar, barIndex) => list(bar?.pieces).map((piece) => {
      const materialCouponLineId = firstText(piece?.materialCouponLineId, bar?.materialCouponLineId);
      const couponLine = linesById.get(materialCouponLineId);
      const mtoItem = couponLine ? mtoById.get(text(couponLine.mtoItemId)) : null;
      const mtoLinkResolved = Boolean(mtoItem);
      const equipmentId = text(couponLine?.equipmentId);
      const equipment = equipmentsById.get(equipmentId);
      const inventoryItem = relatedCuttingSheetInventoryItem(bar, inventoryItems) || {};
      const stock = bar?.stockItem || bar?.inventoryItem || bar?.stock || {};
      const nominalLengthMm = positiveMeasurement(pieceNominalLengthMm(piece));
      const effectiveLengthMm = positiveMeasurement(pieceEffectiveLengthMm(piece));

      return {
        cuttingSheetNumber: text(cuttingSheet?.number),
        cuttingSheetStatus: statusLabel(cuttingSheet?.status),
        project,
        workpack,
        materialCouponNumber: operationalText(couponNumber(coupon), cuttingSheet?.metadata?.materialCouponNumber),
        responsible,
        createdAt: dateValue(cuttingSheet?.createdAt),
        drawing: mtoLinkResolved
          ? firstText(mtoItem.drawing, piece?.drawing, piece?.drawingRef, piece?.dwgNumber)
          : firstText(piece?.drawing, piece?.drawingRef, piece?.dwgNumber),
        mark: mtoLinkResolved ? firstText(mtoItem.mark, piece?.mark) : text(piece?.mark),
        pos: mtoLinkResolved ? firstText(mtoItem.pos, piece?.pos, piece?.position) : firstText(piece?.pos, piece?.position),
        pieceQty: pieceQuantity(piece),
        nominalLengthMm,
        sobremetalMm: nominalLengthMm ? pieceSobremetalMm(piece) : '',
        effectiveLengthMm,
        pieceMaterial: mtoLinkResolved ? firstText(mtoItem.material, piece?.material) : text(piece?.material),
        stockMaterialGrade: firstText(bar?.materialGrade, inventoryItem?.materialGrade, inventoryItem?.material, stock?.materialGrade, stock?.material),
        stockReference: cuttingSheetBarDisplayName(bar, barIndex, inventoryItems),
        equipmentLabel: operationalText(equipment?.equipmentName, equipment?.name, equipment?.code, couponLine?.equipment),
        equipmentTag: operationalText(equipmentTags(equipment).join(', '), couponLine?.equipmentTag, couponLine?.tag),
        location: operationalText(equipment?.fieldLocation, couponLine?.location),
        mtoLinkStatus: mtoLinkResolved ? 'Vinculado' : 'Não vinculado',
      };
    }));
  });
}

const OFFCUT_STATUS_LABELS = Object.freeze({
  draft: 'Aguardando confirmação do corte',
  reusable: 'Disponível para destinação',
  pending_rmv: 'Vinculada a RMV',
  returned_to_stock: 'Retornada ao estoque',
  scrap: 'Scrap confirmado',
  cancelled: 'Cancelada',
});

const OFFCUT_DISPOSITION_LABELS = Object.freeze({
  OPERATIONAL_STOCK: 'Estoque operacional',
  FISCAL_RETURN_PENDING: 'Aguardando retorno fiscal',
  SCRAP: 'Scrap',
});

export function buildOffcutExportRows({
  offcuts = [],
  cuttingSheets = [],
  materialCoupons = [],
  projects = [],
  workpacks = [],
  inventoryItems = [],
} = {}) {
  const sheetsById = new Map(list(cuttingSheets).map((sheet) => [text(sheet?.id), sheet]));
  const couponsById = new Map(list(materialCoupons).map((coupon) => [text(coupon?.id), coupon]));
  const inventoryByReference = new Map(list(inventoryItems).flatMap((item) => [item?.id, item?.trace, item?.traceability]
    .filter(Boolean).map((reference) => [text(reference), item])));

  return list(offcuts).map((offcut) => {
    const cuttingSheet = sheetsById.get(text(offcut?.cuttingSheetId)) || {};
    const coupon = couponsById.get(text(cuttingSheet?.materialCouponId));
    const parent = inventoryByReference.get(text(offcut?.parentInventoryItemId)) || {};
    const resolvedProject = resolveProject(projects, offcut?.projectId || cuttingSheet?.projectId);
    const workpackReference = offcut?.workpackId || cuttingSheet?.workpackId;
    const resolvedWorkpack = list(workpacks).find((item) => [item?.id, item?.wpNo, item?.title]
      .map(text).includes(text(workpackReference)));
    const lengthMm = positiveMeasurement(offcut?.length ?? offcut?.lengthMm);
    const classification = offcutClassificationLabel(lengthMm);
    const status = text(offcut?.status).toLowerCase();

    return {
      cuttingSheetNumber: operationalText(cuttingSheet?.number, offcut?.metadata?.cuttingSheetNumber),
      project: operationalText(
        resolvedProject ? projectDisplayName(projects, offcut?.projectId || cuttingSheet?.projectId) : '',
        cuttingSheet?.metadata?.projectShortCode,
        cuttingSheet?.metadata?.project,
      ),
      workpack: operationalText(
        resolvedWorkpack ? workpackDisplayName(workpacks, workpackReference) : '',
        operationalWorkpackValue(cuttingSheet?.metadata?.workpack),
      ),
      classification,
      operationalStatus: classification === 'Scrap' && !['returned_to_stock', 'pending_rmv', 'cancelled'].includes(status)
        ? 'Scrap confirmado'
        : OFFCUT_STATUS_LABELS[status] || operationalText(offcut?.status),
      traceability: operationalText(offcut?.traceability, offcut?.trace),
      parentTraceability: operationalText(offcut?.metadata?.parentTrace, offcut?.parentTrace, offcut?.parentTraceability, parent?.traceability, parent?.trace),
      material: operationalText(offcut?.material, offcut?.materialGrade, parent?.materialGrade, parent?.material),
      heat: operationalText(offcut?.heat, offcut?.heatNo, parent?.heatNo, parent?.heat),
      lengthMm,
      qty: Number(offcut?.qty) || 1,
      disposition: OFFCUT_DISPOSITION_LABELS[text(offcut?.disposition).toUpperCase()] || (classification === 'Scrap' ? 'Scrap' : ''),
      materialCouponNumber: operationalText(couponNumber(coupon), cuttingSheet?.metadata?.materialCouponNumber),
      createdAt: dateValue(offcut?.createdAt),
      updatedAt: dateValue(offcut?.updatedAt),
      responsible: operationalText(offcut?.updatedBy, offcut?.createdBy, cuttingSheet?.metadata?.cutConfirmedBy),
    };
  });
}

export function buildCuttingSheetTraceabilityCsv(input = {}) {
  return buildCsv(buildCuttingSheetTraceabilityRows(input), CUTTING_SHEET_TRACEABILITY_CSV_COLUMNS);
}

export function downloadCuttingSheetTraceabilityCsv(input = {}, options = {}) {
  const rows = buildCuttingSheetTraceabilityRows(input);
  if (!rows.length) return false;
  const filename = options.filename || `folhas-de-corte-rastreabilidade-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCsv(buildCsv(rows, CUTTING_SHEET_TRACEABILITY_CSV_COLUMNS), filename);
  return true;
}

export async function downloadCuttingSheetTraceabilityExcel(input = {}, options = {}) {
  const cuttingSheetRows = buildCuttingSheetTraceabilityRows(input);
  if (!cuttingSheetRows.length) return false;
  const offcutRows = buildOffcutExportRows(input);
  await exportCuttingSheetTraceabilityExcel({
    cuttingSheetRows,
    cuttingSheetColumns: CUTTING_SHEET_TRACEABILITY_COLUMNS,
    offcutRows,
    offcutColumns: OFFCUT_EXPORT_COLUMNS,
  }, options);
  return true;
}
