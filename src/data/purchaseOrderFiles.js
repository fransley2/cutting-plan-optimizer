import { readExcelFile } from './excel.js';
import { findPurchaseOrderHeaderRow, parseDelimitedPurchaseOrderText, parsePurchaseOrderPdfText, parsePurchaseOrderRows } from '../core/purchaseOrderImport.js';

function extension(name = '') { return String(name).toLowerCase().split('.').pop(); }

async function readPdfText(file) {
  if (!globalThis.pdfjsLib?.getDocument) throw new Error('PDF_READER_NOT_AVAILABLE');
  globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const document = await globalThis.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    content.items.filter((item) => String(item.str || '').trim()).forEach((item) => {
      const x = Number(item.transform?.[4]) || 0; const y = Number(item.transform?.[5]) || 0;
      let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push({ x, value: item.str });
    });
    pages.push(lines.sort((left, right) => right.y - left.y)
      .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.value).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean).join('\n'));
  }
  return pages.join('\n');
}

export async function readPurchaseOrderFile(file) {
  const type = extension(file?.name);
  if (['xlsx', 'xls'].includes(type)) {
    const sheetRows = await readExcelFile(file, { raw: true });
    const headerRowIndex = findPurchaseOrderHeaderRow(sheetRows);
    return { fileName: file.name, sourceType: 'EXCEL', headerRowIndex, rows: parsePurchaseOrderRows(sheetRows.slice(headerRowIndex)) };
  }
  if (['csv', 'tsv', 'txt'].includes(type)) return { fileName: file.name, sourceType: type.toUpperCase(), rows: parseDelimitedPurchaseOrderText(await file.text()) };
  if (type === 'pdf') {
    const extractedText = await readPdfText(file);
    return { fileName: file.name, sourceType: 'PDF', rows: parsePurchaseOrderPdfText(extractedText, file.name), extractedText };
  }
  throw new Error('Formato não suportado. Use PDF, XLSX, XLS, CSV ou TSV.');
}
