function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function value(data, key) {
  return escapeHtml(data?.[key] || '');
}

function field(name, label, data = {}, type = 'text') {
  return `
    <label class="mc-edit-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${value(data, name)}">
    </label>`;
}

function textareaField(name, label, data = {}) {
  return `
    <label class="mc-edit-field mc-edit-field-wide">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}" rows="3">${value(data, name)}</textarea>
    </label>`;
}

function renderLogo(data = {}) {
  if (data.logoUrl) {
    return `<img class="mc-logo-img" src="${value(data, 'logoUrl')}" alt="SAIPEM">`;
  }
  return '<div class="mc-logo-fallback">SAIPEM</div>';
}

function renderMeta(data = {}) {
  return `
    <table class="mc-meta-table">
      <tbody>
        <tr><th>Doc. Nº</th><td>${value(data, 'docNo')}</td></tr>
        <tr><th>Rev.</th><td>${value(data, 'rev')}</td></tr>
        <tr><th>Doc. Rev. Date</th><td>${value(data, 'docRevDate')}</td></tr>
        <tr><th>Doc. Ref.</th><td>${value(data, 'docRef')}</td></tr>
        <tr><th>Page</th><td>${value(data, 'page')}</td></tr>
      </tbody>
    </table>`;
}

function renderProjectInfo(data = {}) {
  const fields = [
    ['PROJECT', 'project'],
    ['CLIENT', 'client'],
    ['SCOPE', 'scope'],
    ['MATERIAL COUPON Nº', 'materialCouponNo'],
    ['DATE', 'date'],
    ['WORKPACK', 'workpack'],
    ['DESTINATION', 'destination'],
  ];

  return `
    <table class="mc-project-table">
      <tbody>
        <tr>
          ${fields.slice(0, 4).map(([label, key]) => `<th>${escapeHtml(label)}</th><td>${value(data, key)}</td>`).join('')}
        </tr>
        <tr>
          ${fields.slice(4).map(([label, key]) => `<th>${escapeHtml(label)}</th><td>${value(data, key)}</td>`).join('')}
          <th></th><td></td>
        </tr>
      </tbody>
    </table>`;
}

const MATERIAL_HEADERS = [
  'S/N.',
  'SAP Code',
  'Item Category',
  'Material Description',
  'Qty',
  'Un.',
  'Dia [mm]',
  'Thickness [mm]',
  'Width [mm]',
  'Length [mm]',
  'Weight [Kg]',
  'Mat. Grade',
  'Traceability',
  'Heat No.',
  'MIR',
  'Equipment',
  'PO ITEM',
  'NF arrival',
  'Notes',
];

function materialCells(row) {
  return [
    row.serial,
    row.sapCode,
    row.itemCategory,
    row.materialDescription,
    row.qty,
    row.unit,
    row.dia,
    row.thickness,
    row.width,
    row.length,
    row.weight,
    row.matGrade,
    row.traceability,
    row.heatNo,
    row.mir,
    row.equipment,
    row.poItem,
    row.nfArrival,
    row.notes,
  ].map((cellValue) => `<td>${escapeHtml(cellValue)}</td>`).join('');
}

function expandedRows(item) {
  const rows = [{ ...item }];
  (item.cuts || []).forEach((cut) => {
    rows.push({
      serial: '',
      sapCode: '',
      itemCategory: '',
      materialDescription: '',
      qty: '',
      unit: '',
      dia: '',
      thickness: '',
      width: '',
      length: cut.length,
      weight: cut.weight,
      matGrade: '',
      traceability: '',
      heatNo: '',
      mir: '',
      equipment: '',
      poItem: '',
      nfArrival: '',
      notes: cut.notes || '',
    });
  });
  return rows;
}

function renderMaterialTable(items = []) {
  const rows = items.flatMap(expandedRows);
  const body = rows.length
    ? rows.map((row) => `<tr>${materialCells(row)}</tr>`).join('')
    : `<tr><td colspan="19" class="mc-empty-table">No selected material.</td></tr>`;

  return `
    <table class="mc-material-table">
      <colgroup>
        <col class="mc-col-sn"><col class="mc-col-sap"><col class="mc-col-cat"><col class="mc-col-desc">
        <col class="mc-col-qty"><col class="mc-col-un"><col class="mc-col-dia"><col class="mc-col-thk">
        <col class="mc-col-width"><col class="mc-col-length"><col class="mc-col-weight"><col class="mc-col-grade">
        <col class="mc-col-trace"><col class="mc-col-heat"><col class="mc-col-mir"><col class="mc-col-equip">
        <col class="mc-col-po"><col class="mc-col-nf"><col class="mc-col-notes">
      </colgroup>
      <thead>
        <tr>
          <th colspan="6"></th>
          <th colspan="5" class="mc-dimensions-caption">DIMENSIONS</th>
          <th colspan="8"></th>
        </tr>
        <tr>${MATERIAL_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderNotes(data = {}) {
  return `
    <table class="mc-notes-table">
      <tbody>
        <tr><th>REFERENCE</th><td>${value(data, 'reference')}</td></tr>
        <tr><th>NOTES</th><td>${value(data, 'notes')}</td></tr>
      </tbody>
    </table>`;
}

function renderSignatureBox(title, department, name, company, date) {
  return `
    <div class="mc-signature-box">
      <div class="mc-signature-title">${escapeHtml(title)}</div>
      <div class="mc-signature-dept">${escapeHtml(department)}</div>
      <table>
        <tbody>
          <tr><th>SIGNATURE</th><td></td></tr>
          <tr><th>NAME</th><td>${escapeHtml(name)}</td></tr>
          <tr><th>COMPANY</th><td>${escapeHtml(company)}</td></tr>
          <tr><th>DATE</th><td>${escapeHtml(date)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function renderSignatures(data = {}) {
  return `
    <section class="mc-signatures">
      ${renderSignatureBox('MC Issuing Responsible', 'Production Planning & Control Dept', data.issuingName, data.issuingCompany, data.issuingDate)}
      ${renderSignatureBox('Material Dispatch Responsible', 'Project Warehouse', data.dispatchName, data.dispatchCompany, data.dispatchDate)}
      ${renderSignatureBox('Material Receiving Responsible', 'CTCO Yard/Subcontractor', data.receivingName, data.receivingCompany, data.receivingDate)}
    </section>`;
}

export function renderMaterialCoupon(couponData = {}) {
  const items = Array.isArray(couponData.items) ? couponData.items : [];
  return `
    <article class="mc-sheet" aria-label="Material Coupon">
      <header class="mc-header">
        <div class="mc-logo-cell">${renderLogo(couponData)}</div>
        <div class="mc-title-cell">
          <div>FORM</div>
          <strong>SAIPEM DO BRASIL</strong>
          <span>MATERIAL COUPON</span>
        </div>
        <div class="mc-meta-cell">${renderMeta(couponData)}</div>
      </header>
      ${renderProjectInfo(couponData)}
      ${renderMaterialTable(items)}
      ${renderNotes(couponData)}
      ${renderSignatures(couponData)}
    </article>`;
}

export function renderMaterialCouponForm(initialData = {}) {
  return `
    <form class="mc-edit-form" id="material-coupon-form">
      <section class="mc-edit-section">
        <h2>Coupon Data</h2>
        <div class="mc-edit-grid">
          ${field('project', 'Project', initialData)}
          ${field('client', 'Client', initialData)}
          ${field('scope', 'Scope', initialData)}
          ${field('materialCouponNo', 'Material Coupon Nº', initialData)}
          ${field('date', 'Date', initialData, 'date')}
          ${field('workpack', 'Workpack', initialData)}
          ${field('destination', 'Destination', initialData)}
          ${field('docNo', 'Doc. Nº', initialData)}
          ${field('rev', 'Rev.', initialData)}
          ${field('docRevDate', 'Doc. Rev. Date', initialData)}
          ${field('docRef', 'Doc. Ref.', initialData)}
          ${textareaField('reference', 'Reference', initialData)}
          ${textareaField('notes', 'Notes', initialData)}
        </div>
      </section>
      <section class="mc-edit-section">
        <h2>Signatures</h2>
        <div class="mc-edit-grid">
          ${field('issuingName', 'Issuing responsible name', initialData)}
          ${field('issuingCompany', 'Issuing company', initialData)}
          ${field('issuingDate', 'Issuing date', initialData)}
          ${field('dispatchName', 'Dispatch responsible name', initialData)}
          ${field('dispatchCompany', 'Dispatch company', initialData)}
          ${field('dispatchDate', 'Dispatch date', initialData)}
          ${field('receivingName', 'Receiving responsible name', initialData)}
          ${field('receivingCompany', 'Receiving company', initialData)}
          ${field('receivingDate', 'Receiving date', initialData)}
        </div>
      </section>
    </form>`;
}

export function renderMaterialCouponPage(state = {}) {
  const itemCount = Array.isArray(state.selectedMaterials) ? state.selectedMaterials.length : 0;
  return `
    <div class="material-coupon-page">
      <div class="page-header mc-page-header no-print">
        <div>
          <p class="eyebrow">Material Management</p>
          <h1>Material Coupon</h1>
          <p class="text-muted">${itemCount ? `${itemCount} material(is) selecionado(s).` : 'Selecione materiais antes de gerar o cupom.'}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" type="button" data-mc-action="back">Back</button>
          <button class="btn btn-secondary" type="button" data-mc-action="refresh" ${itemCount ? '' : 'disabled'}>Refresh Preview</button>
          <button class="btn btn-primary" type="button" data-mc-action="print" ${itemCount ? '' : 'disabled'}>Print / Save PDF</button>
        </div>
      </div>
      ${itemCount ? '' : '<section class="card mc-empty-state no-print"><h2>No material selected</h2><p class="text-muted">Go back to Inventory or Results and select material to generate a Material Coupon.</p></section>'}
      <div class="mc-workspace">
        <section class="card mc-editor no-print">
          ${renderMaterialCouponForm(state.formData || {})}
        </section>
        <section class="mc-preview" data-mc-preview>
          ${renderMaterialCoupon(state.couponData || {})}
        </section>
      </div>
    </div>`;
}
