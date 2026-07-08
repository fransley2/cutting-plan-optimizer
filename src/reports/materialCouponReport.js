import { buildMaterialCouponDocument } from '../documents/materialCoupon.js';

const DEFAULT_REPORT_HEADER = Object.freeze({
  companyName: 'Saipem do Brasil',
  logoUrl: 'https://i.ibb.co/wZZQrZW0/Saipem-logo-300px.png',
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cell(value) {
  // Adicionado alinhamento vertical no topo para textos longos não ficarem flutuando
  return `<td>${escapeHtml(value)}</td>`;
}

function normalizeReportHeader(options = {}) {
  const reportHeader = options.reportHeader || options.settings?.reportHeader || {};
  return {
    ...DEFAULT_REPORT_HEADER,
    ...reportHeader,
    companyName: reportHeader.companyName || DEFAULT_REPORT_HEADER.companyName,
    logoUrl: reportHeader.logoUrl || DEFAULT_REPORT_HEADER.logoUrl,
  };
}

function logoHtml(reportHeader) {
  if (!reportHeader.logoUrl) {
    return `<strong>${escapeHtml(reportHeader.companyName || 'SAIPEM')}</strong>`;
  }

  return `<img class="mc-report-logo-image" src="${escapeHtml(reportHeader.logoUrl)}" alt="${escapeHtml(reportHeader.companyName || 'SAIPEM')}">`;
}

function rowsHtml(documentData) {
  if (!documentData.rows.length) {
    return '<tr><td colspan="19" class="empty-row">No material lines.</td></tr>';
  }

  return documentData.rows.map((row) => `<tr>${[
    row.serialNumber,
    row.sapCode,
    row.itemType,
    row.materialDescription,
    row.qty,
    row.unit,
    row.diaMm,
    row.thicknessMm,
    row.widthMm,
    row.lengthMm,
    row.weightKg,
    row.materialGrade,
    row.traceability,
    row.heatNo,
    row.mir,
    row.equipment,
    row.poItem,
    row.nfArrival,
    row.notes,
  ].map(cell).join('')}</tr>`).join('');
}

// Cada campo do cabeçalho (PROJECT, CLIENT, SCOPE...) mostra o rótulo em
// cima e o valor embaixo, sem borda própria - a borda (quando existir) fica
// por conta do container .mc-info-row.
// `span` é quantas colunas de um grid de 12 esse campo ocupa.
function infoFieldHtml(label, value, span) {
  return `
    <div class="mc-info-field" style="grid-column: span ${span};">
      <div class="mc-info-label">${escapeHtml(label)}</div>
      <div class="mc-info-value">${escapeHtml(value)}</div>
    </div>`;
}

// Assinaturas seguem o layout SIGNATURE / NAME / COMPANY / DATE.
// `data` é o objeto vindo de metadata.issuing / metadata.dispatch / metadata.receiving
// e precisa ter o formato { name, company, date }.
function signatureHtml(title, subtitle, data = {}) {
  const { name = '', company = '', date = '' } = data;
  return `
    <div class="mc-report-signature">
      <div class="mc-report-signature-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <div class="mc-report-signature-row signature-line">
        <span class="label">SIGNATURE:</span>
      </div>
      <div class="mc-report-signature-row">
        <span class="label">NAME:</span>
        <span class="value">${escapeHtml(name)}</span>
      </div>
      <div class="mc-report-signature-row">
        <span class="label">COMPANY:</span>
        <span class="value">${escapeHtml(company)}</span>
      </div>
      <div class="mc-report-signature-row">
        <span class="label">DATE:</span>
        <span class="value">${escapeHtml(date)}</span>
      </div>
    </div>`;
}

export function buildMaterialCouponReportHtml(coupon, options = {}) {
  const documentData = buildMaterialCouponDocument(coupon, options);
  const metadata = documentData.metadata || {};
  const reportHeader = normalizeReportHeader(options);
  const title = escapeHtml(documentData.documentNumber || 'Material Coupon');

  // Definindo as larguras das 19 colunas para a tabela não "estourar"
  // Soma total aprox. 100% (usando % para se adaptar a folha A4 paisagem)
  const colWidths = [
    '3%',  // S/N.
    '6%',  // SAP Code
    '6%',  // Item Category
    '20%', // Material Description (a maior)
    '3%',  // Qty
    '3%',  // Un.
    '4%',  // Dia
    '5%',  // Thickness
    '4%',  // Width
    '4%',  // Length
    '4%',  // Weight
    '6%',  // Mat. Grade
    '8%',  // Traceability
    '6%',  // Heat No.
    '4%',  // MIR
    '4%',  // Equipment
    '4%',  // PO ITEM
    '4%',  // NF arrival
    '6%'   // Notes
  ];
  const colgroupHtml = `<colgroup>${colWidths.map(w => `<col style="width:${w}">`).join('')}</colgroup>`;

  // Linhas do cabeçalho de informações (rótulo em cima, valor embaixo)
  const infoRow1 = [
    infoFieldHtml('PROJECT', metadata.project, 5),
    infoFieldHtml('CLIENT', metadata.client, 3),
    infoFieldHtml('SCOPE', metadata.scope, 4),
  ].join('');

  const infoRow2 = [
    infoFieldHtml('MATERIAL COUPON Nº', metadata.mcCode, 3),
    infoFieldHtml('DATE', metadata.mcDate, 2),
    infoFieldHtml('WORKPACK', metadata.workpack, 3),
    infoFieldHtml('DESTINATION', metadata.materialDestination, 4),
  ].join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      font-size: 9pt;
    }
    
    .mc-report-sheet {
      width: 100%;
      min-height: 190mm; /* Altura útil da folha A4 paisagem */
      border: 1.4pt solid #000;
      padding: 5mm;
      background: #fff;
      display: flex;
      flex-direction: column;
      zoom: 0.6; /* Reduz a escala geral de impressão em 40% */
    }
    
    /* CABEÇALHO */
    .mc-report-header {
      display: grid;
      grid-template-columns: 35mm 1fr 80mm;
      border: 0.7pt solid #000;
      margin-bottom: 3mm;
    }
    .mc-report-logo,
    .mc-report-title,
    .mc-report-meta {
      min-height: 24mm;
      border-right: 0.7pt solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mc-report-meta { border-right: 0; display: block; padding: 0; }
    .mc-report-logo strong { 
      border: 1pt solid #000; 
      padding: 3mm 4mm; 
      font-size: 14pt; 
      letter-spacing: 1px;
    }
    .mc-report-logo-image {
      display: block;
      max-width: 30mm;
      max-height: 18mm;
      object-fit: contain;
    }
    .mc-report-title { 
      flex-direction: column; 
      gap: 1mm; 
      text-align: center; 
    }
    .mc-title-form { font-weight: 700; font-size: 12pt; }
    .mc-title-company { font-weight: 400; font-size: 10pt; }
    .mc-title-doc { font-weight: 700; font-size: 16pt; }
    
    /* mc-report-meta: sem padding/borda externa, só as divisórias internas entre os campos */
    .mc-report-meta table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    .mc-report-meta th,
    .mc-report-meta td { border: none; }
    .mc-report-meta th { text-align: left; padding: 1mm; width: 30mm; background: transparent; border-right: 0.7pt solid #000; }
    .mc-report-meta td { font-weight: bold; padding: 1mm; }
    .mc-report-meta tr:not(:last-child) th,
    .mc-report-meta tr:not(:last-child) td { border-bottom: 0.7pt solid #000; }

    /* TABELAS GERAIS */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 0.7pt solid #000; padding: 1.2mm; vertical-align: top; }
    th { background: #d9d9d9; font-weight: 700; text-align: center; }
    
    /* INFO HEADER (PROJECT/CLIENT/SCOPE/MC No + DATE/WORKPACK/DESTINATION) */
    /* Linha 1: sem nenhuma borda. Linha 2: uma única borda envolvendo o bloco inteiro. */
    .mc-report-info { margin-bottom: 3mm; }
    .mc-info-row {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 2mm;
      margin-bottom: 2mm;
    }
    .mc-info-row:last-child { margin-bottom: 0; }
    .mc-info-row--boxed {
      border: 0.7pt solid #000;
      padding: 1.5mm 2mm;
    }
    .mc-info-field {
      padding: 0.5mm 1mm;
    }
    .mc-info-label {
      font-size: 9pt;
      font-weight: 400;
    }
    .mc-info-value {
      font-size: 11pt;
      font-weight: 700;
      min-height: 4mm;
    }
    
    /* MATERIAIS TABLE - sem bordas internas, só borda externa + zebrado */
    .mc-report-materials { border: 1pt solid #000; }
    .mc-report-materials th,
    .mc-report-materials td { border: none; }
    .mc-report-materials th { font-size: 10pt; font-family: "Arial Narrow", Arial, sans-serif; }
    .mc-header-spacer { background: transparent; border: none !important; }
    .mc-dimensions-caption { background: #bfbfbf !important; }

    /* Linha "DIMENSIONS" (spacers + legenda): nenhuma borda */
    .mc-report-materials thead tr:first-child th { border: none !important; }

    /* Linha de nomes de coluna (S/N., SAP Code...): só a borda externa do bloco, sem divisórias entre as células */
    .mc-report-materials thead tr:last-child th {
      border-top: 1pt solid #000;
      border-bottom: 1pt solid #000;
      border-left: none;
      border-right: none;
    }
    .mc-report-materials thead tr:last-child th:first-child { border-left: 1pt solid #000; }
    .mc-report-materials thead tr:last-child th:last-child { border-right: 1pt solid #000; }

    .mc-report-materials tbody td { 
      min-height: 8mm; 
      text-align: center; 
      vertical-align: middle;
      overflow-wrap: break-word; /* Força quebra de palavras longas */
      word-break: break-word;
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: 12pt;
    }
    .mc-report-materials td:nth-child(4),
    .mc-report-materials td:nth-child(19) { text-align: left; }
    .mc-report-materials tbody tr:nth-child(even) td { background-color: #f2f2f2; }
    .empty-row { height: 20mm; text-align: center !important; color: #555; }
    
    /* NOTAS TABLE (REFERENCE / NOTES) - sem bordas, Calibri 10pt, títulos em negrito */
    .mc-report-notes { margin-top: 3mm; font-size: 10pt; font-family: Calibri, "Segoe UI", Arial, sans-serif; }
    .mc-report-notes th,
    .mc-report-notes td { border: none; vertical-align: top; background: transparent; }
    .mc-report-notes th { width: 24mm; font-weight: 700; text-align: right; }
    .mc-report-notes td { padding-left: 2mm; text-align: left; }
    
    /* ASSINATURAS */
    .mc-report-signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4mm;
      margin-top: auto; /* Empurra para o fim da página */
      padding-top: 4mm;
      font-size: 12pt;
    }
    .mc-report-signature {
      border: 0.7pt solid #000;
      padding: 3mm;
      display: flex;
      flex-direction: column;
    }
    .mc-report-signature-title { text-align: center; margin-bottom: 2mm; }
    .mc-report-signature-title strong { display: block; font-size: 12pt; }
    .mc-report-signature-title span { display: block; font-size: 10pt; font-style: italic; }
    .mc-report-signature-row {
      display: flex;
      justify-content: flex-start;
      align-items: baseline;
      gap: 2mm;
      border-top: 0.7pt dotted #000;
      padding: 1.5mm 0;
      font-size: 10pt;
      font-weight: 400;
    }
    .mc-report-signature-row.signature-line {
      min-height: 10mm; /* Espaço para assinar à mão */
      border-top: 0.7pt solid #000;
    }
    .mc-report-signature-row .label { font-weight: 400; flex-shrink: 0; }
    .mc-report-signature-row .value { font-family: "Arial Narrow", Arial, sans-serif; font-weight: 400; }
  </style>
</head>
<body>
  <article class="mc-report-sheet">
    
    <header class="mc-report-header">
      <div class="mc-report-logo">${logoHtml(reportHeader)}</div>
      <div class="mc-report-title">
        <span class="mc-title-form">FORM</span>
        <span class="mc-title-company">${escapeHtml(reportHeader.companyName)}</span>
        <span class="mc-title-doc">MATERIAL COUPON</span>
      </div>
      <div class="mc-report-meta">
        <table><tbody>
          <tr><th>Doc. Nº</th><td>${escapeHtml(metadata.docNumber)}</td></tr>
          <tr><th>Rev.</th><td>${escapeHtml(metadata.docRevision || metadata.mcRevision)}</td></tr>
          <tr><th>Doc. Rev. Date</th><td>${escapeHtml(metadata.docRevisionDate)}</td></tr>
          <tr><th>Doc. Ref.</th><td>${escapeHtml(metadata.docReference)}</td></tr>
        </tbody></table>
      </div>
    </header>

    <section class="mc-report-info">
      <div class="mc-info-row">${infoRow1}</div>
      <div class="mc-info-row mc-info-row--boxed">${infoRow2}</div>
    </section>

    <table class="mc-report-materials">
      ${colgroupHtml}
      <thead>
        <tr>
          <th colspan="6" class="mc-header-spacer"></th>
          <th colspan="5" class="mc-dimensions-caption">DIMENSIONS</th>
          <th colspan="8" class="mc-header-spacer"></th>
        </tr>
        <tr>
          ${['S/N.', 'SAP Code', 'Item Category', 'Material Description', 'Qty', 'Un.', 'Dia [mm]', 'Thickness [mm]', 'Width [mm]', 'Length [mm]', 'Weight [Kg]', 'Mat. Grade', 'Traceability', 'Heat No.', 'MIR', 'Equipment', 'PO ITEM', 'NF arrival', 'Notes'].map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rowsHtml(documentData)}</tbody>
    </table>

    <table class="mc-report-notes"><tbody>
      <tr><th>REFERENCE</th><td>${escapeHtml(metadata.reference)}</td></tr>
      <tr><th>NOTES</th><td>${escapeHtml(metadata.notes)}</td></tr>
    </tbody></table>

    <section class="mc-report-signatures">
      ${signatureHtml('MC Issuing Responsible', '(Production Planning & Control Dept)', metadata.issuing)}
      ${signatureHtml('Material Dispatch Responsible', '(Project Warehouse)', metadata.dispatch)}
      ${signatureHtml('Material Receiving Responsible', '(CTCO Yard/Subcontractor)', metadata.receiving)}
    </section>

  </article>
</body>
</html>`;
}

export function openMaterialCouponReport(coupon, options = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  
  printWindow.document.open();
  printWindow.document.write(buildMaterialCouponReportHtml(coupon, options));
  printWindow.document.close();
  
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250); // Aumentei levemente o timeout para garantir que o CSS carregou antes de imprimir
  };
  
  return true;
}
