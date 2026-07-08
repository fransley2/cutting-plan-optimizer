// Usa a dependência já instalada (SheetJS via CDN, global `XLSX`) — regra 5.
// Não reimplementamos parsing de planilha: isso seria reinventar a roda.
import {
  MATERIAL_COUPON_EXTRACT_COLUMNS,
  buildMaterialCouponDocument,
  buildMaterialCouponExtractRows,
} from '../documents/materialCoupon.js';

export function readExcelFile(file, { raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(raw ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : XLSX.utils.sheet_to_json(ws));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function exportSolutionToExcel(solution, filename = 'Optimized_Cutting_Plan.xlsx') {
  const wb = XLSX.utils.book_new();
  solution.stockUsed.forEach((bar, i) => {
    const rows = [
      ['Cut Sheet:', i + 1],
      ['Description:', bar.description], ['Traceability:', bar.traceability], ['Material:', bar.materialGrade], [],
      ['DWG Number', 'Mark', 'POS', 'Cut Length (mm)'],
      ...bar.pieces.map(p => [p.dwgNumber, p.mark, p.pos, p.length]),
      [],
      ['Utilization (%):', (((bar.originalLength - bar.remaining - bar.leftTrim - bar.rightTrim) / bar.originalLength) * 100).toFixed(1)],
      ['Usable Offcut (mm):', bar.remaining.toFixed(0)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Cut_${i + 1}`);
  });
  if (solution.generatedOffcuts.length) {
    const rows = [['Length', 'Material', 'Description', 'Traceability'], ...solution.generatedOffcuts.map(o => [o.length, o.materialGrade, o.description, o.traceability])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Offcuts');
  }
  XLSX.writeFile(wb, filename);
}

function ensureXlsx() {
  if (!globalThis.XLSX) throw new Error('XLSX helper is not available.');
  return globalThis.XLSX;
}

function filenameSafe(value, fallback) {
  const safe = String(value || fallback).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

export function exportMaterialCouponExtract(coupons, options = {}) {
  const xlsx = ensureXlsx();
  const rows = buildMaterialCouponExtractRows(coupons);
  const header = MATERIAL_COUPON_EXTRACT_COLUMNS.map((column) => column.label);
  const body = rows.map((row) => MATERIAL_COUPON_EXTRACT_COLUMNS.map((column) => row[column.key] ?? ''));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([header, ...body]), 'MC Extract');
  xlsx.writeFile(workbook, options.filename || 'Material_Coupon_Extract.xlsx');
}

export function exportMaterialCouponExcel(coupon, options = {}) {
  const xlsx = ensureXlsx();
  const documentData = buildMaterialCouponDocument(coupon);
  const workbook = xlsx.utils.book_new();
  const rows = [
    ['Material Coupon', documentData.documentNumber],
    ['Project', documentData.metadata.project],
    ['Client', documentData.metadata.client],
    ['Destination', documentData.metadata.materialDestination],
    ['Date', documentData.metadata.mcDate],
    [],
    documentData.columns.map((column) => column.label),
    ...documentData.rows.map((row) => documentData.columns.map((column) => row[column.key] ?? '')),
  ];
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), 'Material Coupon');
  xlsx.writeFile(workbook, options.filename || `${filenameSafe(documentData.documentNumber, 'Material_Coupon')}.xlsx`);
}
