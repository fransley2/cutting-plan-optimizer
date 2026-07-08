let deps = {};
let pageState = {
  packages: [],
  selectedId: '',
  validationResult: null,
  isBusy: false,
};
let listenersBound = false;

function el(id) {
  return document.getElementById(id);
}

function node(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue != null) element.textContent = textValue;
  return element;
}

function text(value) {
  return value == null ? '' : String(value);
}

function packagePayload(record = {}) {
  return record.metadata?.cuttingPackage || record;
}

function packageStatus(record = {}) {
  return text(record.status || packagePayload(record).status || 'DRAFT').toUpperCase();
}

function packageNumber(record = {}) {
  const payload = packagePayload(record);
  return text(record.number || payload.cuttingSheetNo || payload.cuttingSheetNumber || payload.id);
}

function selectedPackage() {
  return pageState.packages.find((item) => item.id === pageState.selectedId) || null;
}

function setBusy(isBusy) {
  pageState.isBusy = isBusy;
  renderCuttingPackagesPage(pageState);
}

function setButtonState() {
  const selected = selectedPackage();
  const status = selected ? packageStatus(selected) : '';
  const valid = pageState.validationResult?.valid === true;
  const hasBlocking = pageState.validationResult?.blockingErrors?.length > 0;

  const validateButton = el('btn-validate-cutting-package');
  const releaseButton = el('btn-release-cutting-package');
  const sendButton = el('btn-send-package-to-nesting');

  if (validateButton) validateButton.disabled = !selected || pageState.isBusy;
  if (releaseButton) releaseButton.disabled = !selected || pageState.isBusy || hasBlocking || (!valid && status !== 'RELEASED');
  if (sendButton) sendButton.disabled = !selected || pageState.isBusy || (status !== 'RELEASED' && !valid);
}

async function refreshPackages() {
  const loaded = await deps.loadPackages?.();
  pageState.packages = Array.isArray(loaded) ? loaded : [];
  if (!pageState.packages.some((item) => item.id === pageState.selectedId)) {
    pageState.selectedId = pageState.packages[0]?.id || '';
    pageState.validationResult = null;
  }
  renderCuttingPackagesPage(pageState);
}

async function createPackageFromSelection() {
  const mtoItems = deps.getSelectedMtoItems?.() || [];
  const stockItems = deps.getSelectedInventoryItems?.() || [];

  if (!mtoItems.length || !stockItems.length) {
    deps.showToast?.('Selecione itens MTO e materiais do Inventario antes de criar o pacote.', 'error');
    return;
  }

  setBusy(true);
  try {
    const result = await deps.createCuttingPackage?.({ mtoItems, stockItems });
    if (!result?.record) throw new Error('Cutting package was not created.');
    await deps.savePackage?.(result.record);
    await deps.createAuditEntry?.('CUTTING_PACKAGE_CREATED', result.record, { warnings: result.warnings || [] });
    pageState.selectedId = result.record.id;
    pageState.validationResult = null;
    await refreshPackages();
    deps.showToast?.('Cutting Package criado.', 'success');
  } catch (error) {
    console.error(error);
    deps.showToast?.(error?.message || 'Nao foi possivel criar o Cutting Package.', 'error');
  } finally {
    setBusy(false);
  }
}

async function validateSelectedPackage({ audit = true } = {}) {
  const record = selectedPackage();
  if (!record) {
    deps.showToast?.('Selecione um pacote para validar.', 'error');
    return null;
  }

  const result = deps.validateCuttingPackage?.(packagePayload(record));
  pageState.validationResult = result;
  renderCuttingPackagesPage(pageState);
  if (audit) await deps.createAuditEntry?.('CUTTING_PACKAGE_VALIDATED', record, {
    valid: result?.valid === true,
    blockingErrors: result?.blockingErrors?.length || 0,
    warnings: result?.warnings?.length || 0,
  });
  deps.showToast?.(result?.valid ? 'Checklist validado sem bloqueios.' : 'Checklist possui bloqueios.', result?.valid ? 'success' : 'error');
  return result;
}

async function releaseSelectedPackage() {
  const record = selectedPackage();
  if (!record) {
    deps.showToast?.('Selecione um pacote para liberar.', 'error');
    return;
  }

  setBusy(true);
  try {
    const validation = await validateSelectedPackage({ audit: false });
    if (!validation?.valid) {
      deps.showToast?.('Corrija os bloqueios antes de liberar o pacote.', 'error');
      return;
    }

    const payload = { ...packagePayload(record), status: 'RELEASED' };
    const updated = {
      ...record,
      status: 'released',
      metadata: {
        ...(record.metadata || {}),
        validation,
        cuttingPackage: payload,
      },
    };
    await deps.updatePackage?.(record.id, updated);
    await deps.createAuditEntry?.('CUTTING_PACKAGE_RELEASED', updated, { validation });
    pageState.validationResult = validation;
    await refreshPackages();
    deps.showToast?.('Cutting Package liberado.', 'success');
  } catch (error) {
    console.error(error);
    deps.showToast?.('Nao foi possivel liberar o pacote.', 'error');
  } finally {
    setBusy(false);
  }
}

async function sendSelectedPackageToNesting() {
  const record = selectedPackage();
  if (!record) {
    deps.showToast?.('Selecione um pacote para enviar ao Nesting.', 'error');
    return;
  }

  const status = packageStatus(record);
  const validation = pageState.validationResult || deps.validateCuttingPackage?.(packagePayload(record));
  if (status !== 'RELEASED' && !validation?.valid) {
    pageState.validationResult = validation;
    renderCuttingPackagesPage(pageState);
    deps.showToast?.('Pacote precisa estar valido ou liberado antes de enviar ao Nesting.', 'error');
    return;
  }

  setBusy(true);
  try {
    await deps.sendPackageToNesting?.(record);
    const payload = { ...packagePayload(record), status: 'IN_NESTING' };
    const updated = {
      ...record,
      status: 'in_nesting',
      metadata: {
        ...(record.metadata || {}),
        cuttingPackage: payload,
      },
    };
    await deps.updatePackage?.(record.id, updated);
    await deps.createAuditEntry?.('CUTTING_PACKAGE_SENT_TO_NESTING', updated);
    await refreshPackages();
  } catch (error) {
    console.error(error);
    deps.showToast?.('Nao foi possivel enviar o pacote para o Nesting.', 'error');
  } finally {
    setBusy(false);
  }
}

function renderKpis(packages) {
  const container = el('cutting-packages-kpis');
  if (!container) return;
  const totals = {
    total: packages.length,
    draft: packages.filter((item) => packageStatus(item) === 'DRAFT').length,
    validated: packages.filter((item) => item.metadata?.validation?.valid === true).length,
    released: packages.filter((item) => packageStatus(item) === 'RELEASED').length,
    nesting: packages.filter((item) => packageStatus(item) === 'IN_NESTING').length,
  };

  container.replaceChildren(
    kpi('Total Packages', totals.total),
    kpi('Draft', totals.draft),
    kpi('Validated', totals.validated),
    kpi('Released', totals.released),
    kpi('Sent to Nesting', totals.nesting),
  );
}

function kpi(label, value) {
  const card = node('div', 'kpi-card');
  card.append(node('div', 'kpi-label', label), node('div', 'kpi-value', String(value)));
  return card;
}

function renderPackageList(packages) {
  const container = el('cutting-packages-list');
  if (!container) return;

  const table = node('table', 'data-table cutting-packages-table');
  const thead = node('thead');
  const head = node('tr');
  ['Package', 'Status', 'MTO', 'Stock', 'Created', 'Utilization'].forEach((label) => head.append(node('th', null, label)));
  thead.append(head);
  const tbody = node('tbody');

  if (!packages.length) {
    const row = node('tr');
    const empty = node('td', 'text-muted', 'Nenhum Cutting Package salvo.');
    empty.colSpan = 6;
    row.append(empty);
    tbody.append(row);
  }

  packages.forEach((record) => {
    const payload = packagePayload(record);
    const row = node('tr', record.id === pageState.selectedId ? 'selected-row' : '');
    row.tabIndex = 0;
    row.addEventListener('click', () => {
      pageState.selectedId = record.id;
      pageState.validationResult = record.metadata?.validation || null;
      renderCuttingPackagesPage(pageState);
    });
    row.append(
      node('td', null, packageNumber(record)),
      node('td', null, packageStatus(record)),
      node('td', null, String((payload.mtoItems || []).length || (record.mtoItemIds || []).length)),
      node('td', null, String((payload.stockItems || payload.stockUsed || []).length || (record.inventoryItemIds || []).length)),
      node('td', null, text(record.createdAt || payload.createdAt).slice(0, 19).replace('T', ' ')),
      node('td', null, `${Number(payload.utilization || 0).toFixed(1)}%`),
    );
    tbody.append(row);
  });

  table.append(thead, tbody);
  container.replaceChildren(table);
}

function renderDetail(record) {
  const container = el('cutting-package-detail');
  if (!container) return;
  if (!record) {
    container.replaceChildren(node('p', 'text-muted', 'Selecione um pacote para ver detalhes.'));
    return;
  }

  const payload = packagePayload(record);
  const detail = node('div', 'cutting-package-detail-grid');
  [
    ['ID', payload.id || record.id],
    ['Material Coupon', payload.materialCouponNo || payload.materialCouponNumber || '-'],
    ['Cutting Sheet', payload.cuttingSheetNo || payload.cuttingSheetNumber || '-'],
    ['RMV', payload.returnMaterialVoucherNo || payload.rmvNumber || '-'],
    ['Total Stock', payload.totalStockLength || 0],
    ['Total Nested', payload.totalNestedLength || 0],
    ['Remaining', payload.totalRemaining || 0],
    ['Unplaced', (payload.unplacedParts || payload.unallocatedParts || []).length],
  ].forEach(([label, value]) => {
    const item = node('div', 'cutting-package-detail-item');
    item.append(node('span', null, label), node('strong', null, String(value)));
    detail.append(item);
  });

  container.replaceChildren(detail);
}

export function renderCuttingPackageValidation(validationResult) {
  const container = el('cutting-package-validation-panel');
  if (!container) return;
  if (!validationResult) {
    container.replaceChildren(node('p', 'text-muted', 'Valide um pacote para ver o checklist.'));
    return;
  }

  const table = node('table', 'data-table cutting-package-validation-table');
  const thead = node('thead');
  const head = node('tr');
  ['Status', 'Checklist', 'Severity', 'Message', 'Details'].forEach((label) => head.append(node('th', null, label)));
  thead.append(head);
  const tbody = node('tbody');

  (validationResult.checklist || []).forEach((item) => {
    const row = node('tr', `validation-${text(item.status).toLowerCase()}`);
    row.append(
      node('td', null, item.status),
      node('td', null, item.label),
      node('td', null, item.severity),
      node('td', null, item.message),
      node('td', null, String((item.details || []).length)),
    );
    tbody.append(row);
  });

  table.append(thead, tbody);
  container.replaceChildren(table);
}

export function renderCuttingPackagesPage(state = pageState) {
  renderKpis(state.packages || []);
  renderPackageList(state.packages || []);
  renderCuttingPackageValidation(state.validationResult);
  renderDetail(selectedPackage());
  setButtonState();
}

export function getSelectedCuttingPackageId() {
  return pageState.selectedId;
}

export async function initCuttingPackagesPage(options = {}) {
  deps = { ...options };
  if (!listenersBound) {
    el('btn-create-cutting-package')?.addEventListener('click', createPackageFromSelection);
    el('btn-refresh-cutting-packages')?.addEventListener('click', refreshPackages);
    el('btn-validate-cutting-package')?.addEventListener('click', () => validateSelectedPackage());
    el('btn-release-cutting-package')?.addEventListener('click', releaseSelectedPackage);
    el('btn-send-package-to-nesting')?.addEventListener('click', sendSelectedPackageToNesting);
    listenersBound = true;
  }
  await refreshPackages();
}
