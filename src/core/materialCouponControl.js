import { buildMaterialCouponExtractRows } from '../documents/materialCoupon.js';
import { workpackRelationIds, WORKPACK_RELATION_TYPES } from './workpackRelations.js';

const INCLUDED_STATUSES = new Set(['ISSUED', 'DISPATCHED', 'RECEIVED', 'CLOSED']);

export const MATERIAL_COUPON_CONTROL_COLUMNS = Object.freeze([
  ['mcCode', 'MC Code'], ['sapCode', 'SAP Code'], ['couponStatus', 'Status'], ['mcRevision', 'MC Rev.'], ['materialDestination', 'Destination'], ['mcDate', 'MC Date'], ['serialNumber', 'Material Coupon S/N.'], ['itemType', 'Item Type'], ['materialDescription', 'Material Description'], ['qty', 'Qty'], ['unit', 'Un.'], ['diaMm', 'Dia\n[mm]'], ['thicknessMm', 'Thickness\n[mm]'], ['widthMm', 'Width\n[mm]'], ['lengthMm', 'Length\n[mm]'], ['weightKg', 'Weight\n[Kg]'], ['materialGrade', 'Mat. Grade'], ['traceability', 'Traceability'], ['heatNo', 'Heat No.'], ['mir', 'MIR'], ['equipment', 'Equipment'], ['poItem', '[po-item]'], ['nfArrival', 'NF arrival'], ['notes', 'Notes'], ['materialProject', 'Mat. Project'], ['totalSurfaceM2', 'Total Surf.\n[m2]'], ['po', 'PO'], ['mcIssuingResponsible', 'MC Issuing Responsible'], ['materialDispatchResponsible', 'Material Dispatch Responsible'], ['materialReceivingResponsible', 'Material Receiving Responsible'], ['workpack', 'Workpack'], ['drawingUse', 'Drawing Use'], ['rmvCode', 'RMV Code'], ['local', 'Local'], ['returnedQty', 'Returned Qty'], ['returnedWidthMm', 'Returned Width [mm]'], ['returnedLengthMm', 'Returned Lenght [mm]'], ['nesting', 'Nesting Code (Cutting Sheet)'],
].map(([key, label]) => Object.freeze({ key, label })));

function text(value) { return value == null ? '' : String(value).trim(); }
function statusOf(coupon = {}) { return text(coupon.metadata?.coupon?.status || coupon.status).toUpperCase(); }
function validDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }

function payloadOf(coupon = {}) { return coupon.metadata?.coupon || coupon; }
function linesOf(coupon = {}) {
  const payload = payloadOf(coupon);
  return [payload.lines, payload.items, coupon.items].find((items) => Array.isArray(items)) || [];
}
function uniqueText(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }
function joined(values = []) { return uniqueText(values).join(', '); }
function referencesOf(item = {}) {
  return uniqueText([
    item.id,
    item.inventoryItemId,
    item.materialCouponLineId,
    item.trace,
    item.traceability,
    item.parentInventoryItemId,
    item.parentTraceability,
    item.sourceInventoryItemId,
    item.sourceTraceability,
  ]);
}
function referencesIntersect(left = {}, right = {}) {
  const rightReferences = new Set(referencesOf(right));
  return referencesOf(left).some((reference) => rightReferences.has(reference));
}
function actorFor(events = [], couponId, eventTypes = []) {
  const allowed = new Set(eventTypes);
  return text(events.find((event) => allowed.has(text(event.eventType).toUpperCase())
    && [event.entityId, event.sourceDocumentId].some((id) => text(id) === text(couponId)))?.userName);
}
function relatedCuttingSheets(coupon, cuttingSheets = []) {
  const payload = payloadOf(coupon);
  const linkedIds = new Set([payload.links?.cuttingSheetId, ...(payload.links?.cuttingSheetIds || [])].map(text).filter(Boolean));
  return cuttingSheets.filter((sheet) => text(sheet.materialCouponId) === text(coupon.id) || linkedIds.has(text(sheet.id)));
}
function relatedRmvs(coupon, sheets, rmvs = []) {
  const payload = payloadOf(coupon);
  const linkedIds = new Set([payload.links?.rmvId, ...(payload.links?.rmvIds || [])].map(text).filter(Boolean));
  const sheetIds = new Set(sheets.map((sheet) => text(sheet.id)));
  return rmvs.filter((rmv) => text(rmv.materialCouponId) === text(coupon.id)
    || linkedIds.has(text(rmv.id)) || sheetIds.has(text(rmv.cuttingSheetId)));
}
function workpackFor(coupon, row, workpacks = []) {
  const payload = payloadOf(coupon);
  const references = uniqueText([
    coupon.workpackId,
    payload.links?.workpackId,
    payload.header?.workpack,
    payload.workpack,
    coupon.metadata?.workpack,
    coupon.workpack,
    row.workpack,
  ]).map((value) => value.toLocaleUpperCase());
  return workpacks.find((workpack) => [workpack.id, workpack.wpNo, workpack.title]
    .map((value) => text(value).toLocaleUpperCase())
    .some((value) => value && references.includes(value)));
}
function drawingNumbersFor(coupon, line, workpack, sheets, drawings = [], workpackLinks = []) {
  const drawingIds = new Set(workpackRelationIds(workpack, workpackLinks, WORKPACK_RELATION_TYPES.DRAWING_REVISION));
  const linkedDrawings = drawings.filter((drawing) => drawingIds.has(text(drawing.id))
    || (workpack?.id && text(drawing.workpackId) === text(workpack.id)));
  const barDrawings = sheets.flatMap((sheet) => (sheet.bars || [])
    .filter((bar) => !referencesOf(line).length || referencesIntersect(line, bar))
    .flatMap((bar) => (bar.pieces || []).flatMap((piece) => [piece.dwgNumber, piece.drawingNo, piece.drawingUse])));
  const sheetDrawings = sheets.flatMap((sheet) => [
    sheet.drawingReference,
    sheet.metadata?.drawingReference,
    sheet.metadata?.drawingNo,
  ]);
  return joined([...barDrawings, ...sheetDrawings, ...linkedDrawings.map((drawing) => drawing.drawingNo)]);
}
function nestingCodes(sheets = []) {
  return joined(sheets.flatMap((sheet) => [
    sheet.metadata?.nestingCode,
    sheet.metadata?.nestingNumber,
    sheet.metadata?.planNumber,
    sheet.number,
  ]));
}
function returnedValues(line, rmvs = [], events = []) {
  const matches = rmvs.flatMap((rmv) => (rmv.returnedItems || [])
    .filter((returnedLine) => referencesIntersect(line, returnedLine))
    .map((returnedLine) => ({ ...returnedLine, rmv })));
  const quantities = matches.map((item) => Number(item.qty || item.quantity)).filter((value) => Number.isFinite(value));
  const matchedRmvs = [...new Map(matches.map((item) => [text(item.rmv.id), item.rmv]).filter(([id]) => id)).values()];
  return {
    rmvIds: matchedRmvs.map((rmv) => text(rmv.id)),
    rmvCode: joined(matchedRmvs.map((rmv) => rmv.number)),
    receivingResponsible: joined(matches.map((item) => item.receivedBy || item.rmv.returnedBy
      || actorFor(events, item.rmv.id, ['RMV_RECEIPT', 'RETURN_OFFCUT']))),
    drawingUse: joined(matches.map((item) => item.rmv.drawingReference)),
    local: joined(matches.map((item) => item.location || item.storageLocationId || item.rmv.destination)),
    returnedQty: quantities.length ? quantities.reduce((total, value) => total + value, 0) : '',
    returnedWidthMm: joined(matches.map((item) => item.widthMm)),
    returnedLengthMm: joined(matches.map((item) => item.lengthMm)),
  };
}

function enrichControlRow(row, coupon, line, options = {}) {
  const workpack = workpackFor(coupon, row, options.workpacks || []);
  const sheets = relatedCuttingSheets(coupon, options.cuttingSheets || []);
  const rmvs = relatedRmvs(coupon, sheets, options.returnMaterialVouchers || []);
  const returned = returnedValues(line, rmvs, options.auditEvents || []);
  const inventory = (options.inventoryItems || []).find((item) => referencesIntersect(line, item));
  const events = options.auditEvents || [];
  return {
    ...row,
    mcIssuingResponsible: row.mcIssuingResponsible || text(coupon.issuedBy)
      || actorFor(events, coupon.id, ['MATERIAL_COUPON_ISSUED']),
    materialDispatchResponsible: row.materialDispatchResponsible
      || actorFor(events, coupon.id, ['MATERIAL_COUPON_DISPATCH']),
    materialReceivingResponsible: returned.receivingResponsible || row.materialReceivingResponsible
      || actorFor(events, coupon.id, ['MATERIAL_COUPON_RECEIVE', 'MATERIAL_COUPON_RECEIVED']),
    workpack: text(workpack?.wpNo || workpack?.title || workpack?.id) || row.workpack,
    drawingUse: joined([
      row.drawingUse,
      drawingNumbersFor(coupon, line, workpack, sheets, options.drawings || [], options.workpackLinks || []),
      returned.drawingUse,
    ]),
    rmvIds: returned.rmvIds,
    rmvCode: row.rmvCode || returned.rmvCode,
    local: returned.local || row.local || text(inventory?.location),
    returnedQty: row.returnedQty || returned.returnedQty,
    returnedWidthMm: row.returnedWidthMm || returned.returnedWidthMm,
    returnedLengthMm: row.returnedLengthMm || returned.returnedLengthMm,
    nesting: row.nesting || nestingCodes(sheets),
  };
}

export function buildMaterialCouponControlRows(coupons = [], options = {}) {
  return (Array.isArray(coupons) ? coupons : [])
    .filter((coupon) => INCLUDED_STATUSES.has(statusOf(coupon)))
    .flatMap((coupon) => buildMaterialCouponExtractRows(coupon).map((row, index) => enrichControlRow({
      ...row,
      couponStatus: statusOf(coupon),
      couponId: coupon.id || '',
    }, coupon, linesOf(coupon)[index] || {}, options)));
}

export function filterMaterialCouponControlRows(rows = [], filters = {}) {
  const query = text(filters.search).toLowerCase();
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (filters.project && row.materialProject !== filters.project) return false;
    if (filters.workpack && row.workpack !== filters.workpack) return false;
    if (filters.status && row.couponStatus !== filters.status) return false;
    const date = validDate(row.mcDate);
    if (from && (!date || date < from)) return false;
    if (to && (!date || date > to)) return false;
    return !query || Object.values(row).some((value) => text(value).toLowerCase().includes(query));
  });
}
