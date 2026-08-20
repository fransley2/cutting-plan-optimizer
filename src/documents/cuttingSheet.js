import { pieceEffectiveLengthMm, pieceNominalLengthMm, pieceSobremetalMm } from '../core/cuttingSheetPlanning.js';
import { operationalWorkpackValue } from '../core/workpackRelations.js';

const COLUMNS = Object.freeze([
  { key: 'cuttingSheetNumber', label: 'Cutting Sheet No.' },
  { key: 'materialCouponNumber', label: 'Material Coupon No.' },
  { key: 'barNumber', label: 'Bar No.' },
  { key: 'po', label: 'PO' },
  { key: 'poItem', label: 'Item' },
  { key: 'traceability', label: 'Traceability' },
  { key: 'description', label: 'Description' },
  { key: 'materialGrade', label: 'Material' },
  { key: 'heat', label: 'Heat' },
  { key: 'stockLength', label: 'Stock Length' },
  { key: 'drawingRef', label: 'Drawing Ref.' },
  { key: 'mark', label: 'Mark' },
  { key: 'pos', label: 'POS' },
  { key: 'cutLength', label: 'Cut Length' },
  { key: 'sobremetalMm', label: 'Sobremetal [mm]' },
  { key: 'totalNested', label: 'Total Nested' },
  { key: 'spareOffcut', label: 'Spare / Offcut' },
]);

function safeText(value) {
  return value == null ? '' : String(value);
}

function safeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = safeText(value).trim();
  if (!text) return 0;
  const normalized = text.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function pickFirst(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  return value ?? '';
}

function formatDimensions(item = {}) {
  const length = safeNumber(pickFirst(item.length, item.lengthMm, item.cutLength, item.cutLengthMm));
  const width = safeNumber(pickFirst(item.width, item.widthMm));
  const thickness = safeNumber(pickFirst(item.thickness, item.thicknessMm, item.thk));
  return [
    length ? `L=${length}` : '',
    width ? `W=${width}` : '',
    thickness ? `T=${thickness}` : '',
  ].filter(Boolean).join(' x ');
}

function createGeneratedAt(options = {}) {
  const value = typeof options.nowFactory === 'function' ? options.nowFactory() : new Date().toISOString();
  return safeText(value);
}

function getPackageMetadata(cuttingPackage = {}) {
  const metadata = cuttingPackage.metadata || {};
  return {
    project: safeText(pickFirst(metadata.project, cuttingPackage.project, cuttingPackage.projectData?.projectName)),
    client: safeText(pickFirst(metadata.client, cuttingPackage.client)),
    equipment: safeText(pickFirst(metadata.equipment, cuttingPackage.equipment, cuttingPackage.projectData?.equipment)),
    workpack: operationalWorkpackValue(pickFirst(metadata.workpack, cuttingPackage.workpack)),
    destination: safeText(pickFirst(metadata.destination, cuttingPackage.destination)),
    date: safeText(pickFirst(metadata.date, cuttingPackage.date, cuttingPackage.createdAt)),
    materialCouponNumber: safeText(pickFirst(metadata.materialCouponNumber, cuttingPackage.materialCouponNumber, cuttingPackage.materialCouponNo)),
    cuttingSheetNumber: safeText(pickFirst(metadata.cuttingSheetNumber, cuttingPackage.cuttingSheetNumber, cuttingPackage.cuttingSheetNo)),
    rmvNumber: safeText(pickFirst(metadata.rmvNumber, cuttingPackage.rmvNumber, cuttingPackage.returnMaterialVoucherNo)),
    preparedBy: safeText(metadata.preparedBy),
    receivedBy: safeText(metadata.receivedBy),
    approvedBy: safeText(metadata.approvedBy),
    observations: safeText(metadata.observations),
  };
}

function nestedBars(cuttingPackage = {}) {
  if (Array.isArray(cuttingPackage.nestedBars)) return cuttingPackage.nestedBars;
  if (Array.isArray(cuttingPackage.stockUsed)) return cuttingPackage.stockUsed;
  return [];
}

function barStock(bar = {}) {
  return bar.stockItem || bar.inventoryItem || bar.stock || bar;
}

function barNumber(bar = {}, index = 0) {
  return safeText(pickFirst(bar.barNumber, bar.barNo, bar.number, index + 1));
}

function stockLength(bar = {}) {
  const stock = barStock(bar);
  return safeNumber(pickFirst(bar.stockLength, bar.originalLength, bar.length, stock.length, stock.lengthMm));
}

function cutLength(piece = {}) {
  return pieceNominalLengthMm(piece);
}

function totalNestedLength(bar = {}) {
  return (Array.isArray(bar.pieces) ? bar.pieces : []).reduce((sum, piece) => sum + pieceEffectiveLengthMm(piece), 0);
}

function spareOffcut(bar = {}, totalNested = 0) {
  const length = stockLength(bar);
  const explicit = pickFirst(bar.remaining, bar.offcut, bar.spareOffcut);
  if (explicit !== '') return safeNumber(explicit);
  return Math.max(0, length - totalNested);
}

function rowFromPiece(bar = {}, piece = {}, index = 0, metadata = {}) {
  const stock = barStock(bar);
  const totalNested = totalNestedLength(bar);
  return {
    cuttingSheetNumber: metadata.cuttingSheetNumber,
    materialCouponNumber: metadata.materialCouponNumber,
    barNumber: barNumber(bar, index),
    po: safeText(pickFirst(stock.po, bar.po, bar.purchaseOrder)),
    poItem: safeText(pickFirst(stock.poItem, bar.poItem, bar.itemPo)),
    traceability: safeText(pickFirst(stock.traceability, stock.trace, stock.traceNo, bar.traceability, bar.trace, bar.traceNo)),
    description: safeText(pickFirst(stock.materialDescription, bar.materialDescription, bar.description)),
    materialGrade: safeText(pickFirst(piece.material, piece.materialGrade, piece.grade, stock.materialGrade, bar.material, bar.materialGrade, bar.grade)),
    heat: safeText(pickFirst(stock.heatNo, bar.heatNo)),
    stockLength: stockLength(bar),
    drawingRef: safeText(pickFirst(piece.drawingRef, piece.drawing, piece.dwgNumber)),
    mark: safeText(piece.mark),
    pos: safeText(pickFirst(piece.pos, piece.position)),
    cutLength: cutLength(piece),
    sobremetalMm: pieceSobremetalMm(piece),
    totalNested,
    spareOffcut: spareOffcut(bar, totalNested),
  };
}

function rowsFromBar(bar = {}, index = 0, metadata = {}) {
  const pieces = Array.isArray(bar.pieces) ? bar.pieces : [];
  if (!pieces.length) return [rowFromPiece(bar, {}, index, metadata)];
  return pieces.map((piece) => rowFromPiece(bar, piece, index, metadata));
}

function signatureFields(metadata = {}) {
  return [
    { role: 'PPC', label: 'PPC Signature', name: metadata.preparedBy || '', date: metadata.date || '', signature: '' },
    { role: 'Production', label: 'Production / Supervisor Signature', name: metadata.approvedBy || '', date: '', signature: '' },
  ];
}

export function buildCuttingSheetDocument(cuttingPackage = {}, options = {}) {
  const metadata = getPackageMetadata(cuttingPackage);
  const bars = nestedBars(cuttingPackage);
  const warnings = [];
  const rows = bars.flatMap((bar, index) => {
    if (!Array.isArray(bar.pieces) || !bar.pieces.length) warnings.push(`Nested bar ${barNumber(bar, index)} has no pieces.`);
    return rowsFromBar(bar, index, metadata);
  });
  if (!bars.length) warnings.push('No nested bars found for Cutting Sheet.');

  const totalBars = bars.length;
  const totalPieces = bars.reduce((sum, bar) => sum + (Array.isArray(bar.pieces) ? bar.pieces.length : 0), 0);
  const totalNested = bars.reduce((sum, bar) => sum + totalNestedLength(bar), 0);
  const totalSpare = bars.reduce((sum, bar) => sum + spareOffcut(bar, totalNestedLength(bar)), 0);
  const totalStock = bars.reduce((sum, bar) => sum + stockLength(bar), 0);

  return {
    documentType: 'cuttingSheet',
    title: 'Cutting Sheet',
    documentNumber: safeText(pickFirst(options.cuttingSheetNumber, metadata.cuttingSheetNumber)),
    generatedAt: createGeneratedAt(options),
    metadata,
    columns: COLUMNS.map((column) => ({ ...column })),
    rows,
    summary: {
      totalBars,
      totalPieces,
      totalNestedLength: totalNested,
      totalSpareOffcut: totalSpare,
      utilizationPercent: totalStock > 0 ? (totalNested / totalStock) * 100 : 0,
      kerfTotal: safeNumber(cuttingPackage.kerfTotal),
    },
    signatureFields: signatureFields(metadata),
    warnings,
  };
}
