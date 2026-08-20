import { buildCutExecutionDraft, cutExecutionErrorMessage } from '../core/cutExecution.js';
import { pieceEffectiveLengthMm, pieceNominalLengthMm, pieceSobremetalMm } from '../core/cuttingSheetPlanning.js';
import { cuttingSheetBarDisplayName } from '../core/cuttingSheetPresentation.js';
import { projectDisplayName } from '../core/projectIdentity.js';
import { workpackDisplayName } from '../core/workpackRelations.js';
import { getCurrentLanguage } from '../i18n/index.js';
import { downloadCuttingSheetTraceabilityExcel } from '../reports/cuttingSheetTraceability.js';

function node(tag, className = '', value = '') { const element = document.createElement(tag); if (className) element.className = className; if (value !== '') element.textContent = String(value); return element; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR'); }

const state = { container: null, options: {}, sheets: [], coupons: [], rmvs: [], projects: [], workpacks: [], inventoryItems: [], selected: null, page: 1, paginationBound: false };
let closeActiveRowMenu = null;

function displayProject(reference) { return projectDisplayName(state.projects, reference) || reference || '—'; }
function displayWorkpack(reference, fallback = '') { return workpackDisplayName(state.workpacks, reference, fallback) || fallback || reference || '—'; }
function displayBar(bar, index) { return cuttingSheetBarDisplayName(bar, index, state.inventoryItems); }

function button(label, className, onClick) { const control = node('button', className, label); control.type = 'button'; control.addEventListener('click', onClick); return control; }

async function exportTraceabilityExcel() {
  try {
    const [mtoItems, equipments, offcuts] = await Promise.all([
      state.options.listMtoItems?.() || [],
      state.options.listEquipments?.() || [],
      state.options.listOffcuts?.() || [],
    ]);
    const exported = await downloadCuttingSheetTraceabilityExcel({
      cuttingSheets: state.sheets,
      materialCoupons: state.coupons,
      mtoItems,
      equipments,
      offcuts,
      projects: state.projects,
      workpacks: state.workpacks,
      inventoryItems: state.inventoryItems,
    }, { language: getCurrentLanguage() });
    state.options.showToast?.(
      exported ? 'Excel operacional de Folhas de Corte exportado.' : 'Não há peças de Cutting Sheet para exportar.',
      exported ? 'success' : 'warning',
    );
  } catch (error) {
    console.error(error);
    state.options.showToast?.(error?.message || 'Não foi possível exportar o Excel de rastreabilidade.', 'error');
  }
}

function renderPageState() {
  state.container?.classList.toggle('hidden', state.page !== 1);
  state.options.resultsPage?.classList.toggle('hidden', state.page !== 2);
  state.options.pageIndicator?.replaceChildren(document.createTextNode(`Página ${state.page}/2`));
  if (state.options.previousPageButton) state.options.previousPageButton.disabled = state.page === 1;
  if (state.options.nextPageButton) state.options.nextPageButton.disabled = state.page === 2;
}

async function requestPage(page) {
  const nextPage = page === 2 ? 2 : 1;
  if (nextPage === 2 && await state.options.onBeforeResultsPage?.(state.selected) === false) return false;
  state.page = nextPage;
  renderPageState();
  return true;
}

function bindPagination() {
  if (state.paginationBound) return;
  state.paginationBound = true;
  state.options.previousPageButton?.addEventListener('click', () => void requestPage(1));
  state.options.nextPageButton?.addEventListener('click', () => void requestPage(2));
}

function renderList() {
  const card = node('section', 'card cut-sheets-register');
  const header = node('div', 'card-header');
  const actions = node('div', 'cut-sheet-command-bar');
  actions.append(
    button('Exportar Excel', 'btn btn-secondary', () => void exportTraceabilityExcel()),
    button('Novo Cutting Sheet', 'btn btn-primary', () => state.options.onNewSheet?.()),
  );
  header.append(node('div', '', ''), node('strong', '', `${state.sheets.length} Cutting Sheet(s)`), actions);
  header.firstChild.append(node('h2', '', 'Cutting Sheets'), node('p', 'text-muted', 'Rascunho, otimização, emissão, execução e RMV no mesmo documento.'));
  const wrap = node('div', 'table-wrap'); const table = node('table', 'data-table'); const thead = node('thead'); const hr = node('tr');
  ['Número', 'Projeto', 'Workpack', 'Status', 'Atualizado', 'Ações'].forEach((label) => hr.append(node('th', '', label))); thead.append(hr); const tbody = node('tbody');
  const rows = state.sheets.map((item) => ({ kind: 'sheet', item, number: item.number, project: displayProject(item.projectId), workpack: displayWorkpack(item.workpackId, item.metadata?.workpack), status: item.status, updatedAt: item.updatedAt }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  rows.forEach((entry) => {
    const row = node('tr', 'cut-sheets-row'); row.tabIndex = 0;
    [entry.number, entry.project || '—', entry.workpack || '—', entry.status, formatDate(entry.updatedAt)].forEach((value) => row.append(node('td', '', value)));
    const actions = node('td', 'row-actions');
    const more = button('', 'icon-action cut-sheet-row-menu-trigger', () => openRowActions(more, entry)); more.title = 'Mais ações'; more.setAttribute('aria-label', `Ações de ${entry.number}`); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false'); more.append(node('span', 'material-symbols-outlined', 'more_horiz')); actions.append(more);
    row.append(actions);
    row.addEventListener('click', (event) => { if (!event.target.closest('button')) openWorkspace(entry); });
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter') openWorkspace(entry); }); tbody.append(row);
  });
  if (!rows.length) { const row = node('tr'); const cell = node('td', 'text-muted', 'Nenhum Cutting Sheet salvo.'); cell.colSpan = 6; row.append(cell); tbody.append(row); }
  table.append(thead, tbody); wrap.append(table); card.append(header, wrap); return card;
}

function openWorkspace(entry) { state.selected = entry; render(); }

function menuAction(label, icon, handler, className = '') {
  const item = button('', className, handler); item.setAttribute('role', 'menuitem'); item.append(node('span', 'material-symbols-outlined', icon), node('span', '', label)); return item;
}

function openRowActions(trigger, entry) {
  closeActiveRowMenu?.();
  const menu = node('div', 'mc-overflow-menu mc-row-context-menu cut-sheet-row-context-menu');
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Ações de ${entry.number}`);
  const close = ({ restoreFocus = false } = {}) => {
    menu.remove(); trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', scroll, true);
    if (closeActiveRowMenu === close) closeActiveRowMenu = null;
    if (restoreFocus) trigger.focus();
  };
  const run = (action) => async () => { close(); await action?.(); };
  menu.append(menuAction('Abrir workspace', 'open_in_full', run(() => openWorkspace(entry))));
  if (entry.item.status === 'draft') menu.append(menuAction('Editar', 'edit', run(() => state.options.onEditSheet?.(entry.item))));
  if (entry.item.planning?.solution || entry.item.metadata?.solution || entry.item.bars?.length) menu.append(menuAction('Revisar resultados', 'analytics', run(() => state.options.onOpenSheetResults?.(entry.item))));
  menu.append(node('div', 'mc-overflow-divider'), menuAction('Imprimir / PDF', 'print', run(() => state.options.onPrintSheet?.(entry.item))), menuAction('Gerar RMV', 'assignment_return', run(() => state.options.onCreateRmv?.(entry.item))));
  if (entry.item.status === 'draft') menu.append(node('div', 'mc-overflow-divider'), menuAction('Excluir', 'delete', run(() => requestDeleteSheet(entry)), 'mc-menu-danger'));
  const outside = (event) => { if (!menu.contains(event.target) && event.target !== trigger) close(); };
  const escape = (event) => { if (event.key === 'Escape') { event.preventDefault(); close({ restoreFocus: true }); } };
  const scroll = () => close();
  const rect = trigger.getBoundingClientRect(); menu.style.top = `${rect.bottom + 4}px`; menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  document.body.append(menu); trigger.setAttribute('aria-expanded', 'true'); closeActiveRowMenu = close;
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true); window.addEventListener('scroll', scroll, true);
  menu.querySelector('button:not(:disabled)')?.focus();
}

function requestDeleteSheet(entry) {
  const body = node('div', 'cut-sheet-delete-confirmation');
  body.append(
    node('p', '', `Excluir definitivamente o rascunho "${entry.number}"?`),
    node('p', 'text-muted', 'O Cutting Sheet e seus vínculos ativos de Workpack serão removidos. Documentos emitidos não podem ser excluídos aqui.'),
  );
  state.options.openConfirmation?.({
    title: 'Excluir Cutting Sheet', body, confirmLabel: 'Excluir rascunho',
    onConfirm: async () => {
      await state.options.onDeleteSheet?.(entry.item);
      if (state.selected?.item.id === entry.item.id) state.selected = null;
      await refreshCuttingSheetsPage();
    },
  });
}

function detailField(label, value, icon = '') {
  const item = node('div', 'cut-sheet-detail-field');
  const labelRow = node('span', 'cut-sheet-detail-label');
  if (icon) labelRow.append(node('span', 'material-symbols-outlined', icon));
  labelRow.append(document.createTextNode(label));
  item.append(labelRow, node('strong', '', value || '—'));
  return item;
}

function measurementInput(value, min = 0.001) {
  const input = node('input', 'input cut-execution-input');
  input.type = 'number'; input.step = '0.1'; input.min = String(min); input.value = String(value ?? 0);
  return input;
}

function createCutExecutionEditor(sheet) {
  const draft = buildCutExecutionDraft(sheet); const section = node('section', 'cut-sheet-link-card cut-execution-card');
  const heading = node('div', 'cut-execution-heading'); const title = node('div'); const badge = node('span', 'status-badge', sheet.metadata?.cutExecution?.status || 'NOT RECORDED');
  title.append(node('h3', '', 'Execução do corte — Planned vs Actual'), node('p', 'text-muted', 'Registre as medidas físicas antes de confirmar o consumo e a genealogia.')); heading.append(title, badge); section.append(heading);
  const wrap = node('div', 'table-wrap'); const table = node('table', 'data-table cut-execution-table'); const thead = node('thead'); const header = node('tr');
  ['Barra', 'Mark / Pos.', 'Nominal [mm]', 'Sobremetal [mm]', 'Total planejado [mm]', 'Real total [mm]', 'Desvio [mm]'].forEach((label) => header.append(node('th', '', label))); thead.append(header); const tbody = node('tbody'); const controls = [];
  draft.bars.forEach((barDraft, barIndex) => {
    const sourceBar = sheet.bars[barIndex] || {}; const barLabel = displayBar(sourceBar, barIndex); const pieces = [];
    barDraft.pieces.forEach((pieceDraft, pieceIndex) => {
      const sourcePiece = sourceBar.pieces?.[pieceIndex] || {};
      const nominal = pieceNominalLengthMm(sourcePiece);
      const sobremetal = pieceSobremetalMm(sourcePiece);
      const planned = pieceEffectiveLengthMm(sourcePiece);
      const actual = measurementInput(pieceDraft.actualCutLengthMm); const variance = node('td', 'cut-execution-variance', (Number(actual.value) - planned).toFixed(1)); const row = node('tr');
      row.append(
        node('td', 'cut-sheet-bar-name', pieceIndex ? '' : barLabel),
        node('td', '', [sourcePiece.mark, sourcePiece.pos || sourcePiece.position].filter(Boolean).join(' / ') || sourcePiece.id || `Peça ${pieceIndex + 1}`),
        node('td', 'mc-numeric-cell', nominal),
        node('td', sobremetal ? 'cut-execution-sobremetal-readonly' : 'text-muted', sobremetal ? `${sobremetal} mm` : '—'),
        node('td', 'mc-numeric-cell', planned),
      );
      const actualCell = node('td'); actualCell.append(actual);
      row.append(actualCell, variance); tbody.append(row);
      pieces.push({ pieceId: pieceDraft.pieceId, input: actual, hasSobremetal: pieceDraft.hasSobremetal === true, sobremetalMm: pieceDraft.sobremetalMm || 0 });
      actual.addEventListener('input', () => { variance.textContent = (Number(actual.value || 0) - planned).toFixed(1); section.dataset.dirty = 'true'; });
    });
    const plannedRemaining = Number(sourceBar.plannedRemainingMm ?? sourceBar.remaining ?? sourceBar.offcut ?? sourceBar.spareOffcut) || 0; const actualRemaining = measurementInput(barDraft.actualRemainingMm, 0);
    const remainingVariance = node('td', 'cut-execution-variance', (Number(actualRemaining.value) - plannedRemaining).toFixed(1)); const remainingRow = node('tr', 'cut-execution-offcut-row');
    remainingRow.append(
      node('td', 'cut-sheet-bar-name', barLabel),
      node('td', '', 'Sobra / Offcut'),
      node('td', 'text-muted', '—'),
      node('td', 'text-muted', '—'),
      node('td', 'mc-numeric-cell', plannedRemaining),
    );
    const remainingCell = node('td'); remainingCell.append(actualRemaining); remainingRow.append(remainingCell, remainingVariance); tbody.append(remainingRow);
    actualRemaining.addEventListener('input', () => { remainingVariance.textContent = (Number(actualRemaining.value || 0) - plannedRemaining).toFixed(1); section.dataset.dirty = 'true'; });
    controls.push({ barId: barDraft.barId, actualRemaining, pieces });
  });
  table.append(thead, tbody); wrap.append(table); section.append(wrap);
  const reasonField = node('label', 'field cut-execution-reason'); reasonField.append(node('span', '', 'Justificativa de desvio')); const reason = node('textarea', 'input'); reason.rows = 2; reason.placeholder = 'Obrigatória quando a medida real divergir do planejado.'; reason.value = draft.reason || ''; reason.addEventListener('input', () => { section.dataset.dirty = 'true'; }); reasonField.append(reason); section.append(reasonField);
  let currentSheet = sheet;
  async function saveExecution(force = false) {
    if (!force && section.dataset.dirty !== 'true' && currentSheet.metadata?.cutExecution?.status === 'RECORDED') return currentSheet;
    const executionDraft = { reason: reason.value, bars: controls.map((bar) => ({ barId: bar.barId, actualRemainingMm: bar.actualRemaining.value, pieces: bar.pieces.map((piece) => ({ pieceId: piece.pieceId, actualCutLengthMm: piece.input.value, hasSobremetal: piece.hasSobremetal, sobremetalMm: piece.sobremetalMm })) })) };
    try { currentSheet = await state.options.onSaveCutExecution?.(currentSheet, executionDraft) || currentSheet; section.dataset.dirty = 'false'; badge.textContent = 'RECORDED'; return currentSheet; }
    catch (error) { state.options.showToast?.(cutExecutionErrorMessage(error), 'error'); error.cutExecutionNotified = true; throw error; }
  }
  const footer = node('div', 'cut-execution-footer');
  footer.append(button('Salvar medidas reais', 'btn btn-secondary', async () => { try { await saveExecution(true); await refreshCuttingSheetsPage(); } catch { /* toast emitted above */ } }));
  footer.append(button('Confirmar corte', 'btn btn-primary', async () => {
    if (!globalThis.confirm?.('Confirma as medidas reais registradas e a execução física deste Cutting Sheet?')) return;
    try { const executedSheet = await saveExecution(); await state.options.onConfirmCut?.(executedSheet); await refreshCuttingSheetsPage(); }
    catch (error) { if (!error?.cutExecutionNotified) state.options.showToast?.(error?.message || 'Não foi possível confirmar o corte.', 'error'); }
  }));
  section.append(footer);
  return { element: section, saveExecution };
}

function renderPieceCouponLinks(sheet) {
  const section = node('section', 'cut-sheet-link-card');
  const heading = node('div', 'cut-sheet-section-heading');
  const title = node('div'); title.append(node('h3', '', 'Peças do Cutting Sheet'), node('p', 'text-muted', 'Identificação operacional por barra, peça e Material Coupon vinculado.'));
  heading.append(title, node('span', 'material-symbols-outlined', 'view_list'));
  section.append(heading);
  const wrap = node('div', 'table-wrap');
  const table = node('table', 'data-table cut-sheet-piece-links-table');
  const head = node('tr');
  ['Barra', 'Peça', 'Material', 'Material Coupon'].forEach((label) => head.append(node('th', '', label)));
  const thead = node('thead'); thead.append(head);
  const tbody = node('tbody');
  (sheet.bars || []).forEach((bar, barIndex) => {
    const pieces = Array.isArray(bar.pieces) ? bar.pieces : [];
    pieces.forEach((piece, pieceIndex) => {
      const row = node('tr');
      if (pieceIndex === 0) {
        const barCell = node('td', 'cut-sheet-bar-group', displayBar(bar, barIndex));
        barCell.rowSpan = pieces.length;
        row.append(barCell);
      }
      const couponCell = node('td');
      if (piece.linkedMaterialCouponId) {
        const link = button(piece.linkedMaterialCouponNumber || piece.linkedMaterialCouponId, 'status-badge cut-sheet-piece-coupon-link', () => state.options.onOpenCoupon?.(piece.linkedMaterialCouponId));
        link.title = 'Abrir Material Coupon vinculado';
        couponCell.append(link);
      } else {
        couponCell.append(node('span', 'text-muted', '—'));
      }
      row.append(
        node('td', '', [piece.mark, piece.pos || piece.position].filter(Boolean).join(' / ') || piece.id || `Peça ${pieceIndex + 1}`),
        node('td', '', piece.materialDescription || piece.material || bar.materialDescription || bar.material || '—'),
        couponCell,
      );
      tbody.append(row);
    });
  });
  if (!tbody.children.length) {
    const row = node('tr'); const empty = node('td', 'text-muted', 'Nenhuma peça registrada.'); empty.colSpan = 4; row.append(empty); tbody.append(row);
  }
  table.append(thead, tbody); wrap.append(table); section.append(wrap);
  return section;
}

function renderSheetDetail(sheet) {
  const body = node('div', 'cut-sheet-workspace'); const coupon = state.coupons.find((item) => item.id === sheet.materialCouponId); const relatedRmvs = state.rmvs.filter((item) => item.cuttingSheetId === sheet.id);
  const traceableMaterials = new Set((sheet.bars || []).map((bar) => bar.inventoryItemId).filter(Boolean)).size;
  const pieceCount = (sheet.bars || []).reduce((total, bar) => total + (bar.pieces?.length || 0), 0);
  const summary = node('div', 'cut-sheet-detail-grid');
  summary.append(
    detailField('Projeto', displayProject(sheet.projectId), 'business_center'),
    detailField('Workpack', displayWorkpack(sheet.workpackId, sheet.metadata?.workpack), 'workspaces'),
    detailField('Material Coupon', coupon?.number || sheet.metadata?.materialCouponNumber, 'confirmation_number'),
    detailField('Barras', sheet.bars?.length || 0, 'view_stream'),
    detailField('Peças', pieceCount, 'category'),
    detailField('Materiais rastreáveis', traceableMaterials, 'qr_code_2'),
    detailField('RMVs', relatedRmvs.length, 'assignment_return'),
  );
  body.append(summary);
  const linkSection = node('section', 'cut-sheet-link-card cut-sheet-coupon-card');
  const linkHeading = node('div', 'cut-sheet-section-heading');
  const linkTitle = node('div'); linkTitle.append(node('h3', '', 'Material Coupon'), node('p', 'text-muted', 'Documento de liberação de material associado a este Cutting Sheet.'));
  linkHeading.append(linkTitle, node('span', 'material-symbols-outlined', 'link'));
  linkSection.append(linkHeading);
  const field = node('div', 'cut-sheet-link-controls');
  const inputWrap = node('label', 'field'); inputWrap.append(node('span', '', 'Material Coupon vinculado'));
  const input = node('input', 'input'); input.setAttribute('list', `cut-sheet-coupons-${sheet.id}`); input.value = coupon?.number || sheet.metadata?.materialCouponNumber || ''; const datalist = node('datalist'); datalist.id = `cut-sheet-coupons-${sheet.id}`; state.coupons.filter((item) => !sheet.projectId || item.projectId === sheet.projectId).forEach((item) => { const option = node('option'); option.value = item.number; option.dataset.id = item.id; datalist.append(option); });
  const save = button('Salvar vínculo', 'btn btn-secondary', async () => { await state.options.onLinkCoupon?.(sheet, input.value); await refreshCuttingSheetsPage(); });
  save.prepend(node('span', 'material-symbols-outlined', 'save'));
  inputWrap.append(input, datalist); field.append(inputWrap, save); linkSection.append(field); body.append(linkSection, renderPieceCouponLinks(sheet));
  const rmvSection = node('section', 'cut-sheet-link-card');
  const rmvHeading = node('div', 'cut-sheet-section-heading'); const rmvTitle = node('div'); rmvTitle.append(node('h3', '', 'RMV / Retornos'), node('p', 'text-muted', 'Vouchers de devolução gerados a partir deste documento.')); rmvHeading.append(rmvTitle, node('span', 'material-symbols-outlined', 'assignment_return')); rmvSection.append(rmvHeading);
  relatedRmvs.forEach((rmv) => { const row = node('button', 'cut-sheet-document-row'); row.type = 'button'; row.append(node('strong', '', rmv.number), node('span', '', rmv.status), node('span', '', `${rmv.returnedItems?.length || 0} item(ns)`)); row.addEventListener('click', () => state.options.onOpenExistingRmv?.(rmv, sheet)); rmvSection.append(row); });
  if (!relatedRmvs.length) rmvSection.append(node('p', 'text-muted', 'Nenhum RMV emitido para este Cutting Sheet.'));
  const executionEditor = ['released', 'in_progress'].includes(String(sheet.status || '').toLowerCase()) ? createCutExecutionEditor(sheet) : null;
  if (executionEditor) body.append(executionEditor.element);
  body.append(rmvSection); return body;
}

function iconButton(label, icon, className, action) {
  const control = button(label, className, action);
  control.prepend(node('span', 'material-symbols-outlined', icon));
  return control;
}

function renderSheetWorkspaceHeader(sheet) {
  const header = node('div', 'cut-sheet-workspace-header');
  const titleBlock = node('div', 'cut-sheet-workspace-title-block');
  const back = iconButton('Voltar', 'arrow_back', 'cut-sheet-back-link', () => { state.selected = null; render(); });
  const divider = node('span', 'cut-sheet-title-divider');
  const copy = node('div', 'cut-sheet-workspace-title');
  const pieceCount = (sheet.bars || []).reduce((total, bar) => total + (bar.pieces?.length || 0), 0);
  copy.append(node('h2', '', sheet.number), node('p', 'text-muted', [displayProject(sheet.projectId), displayWorkpack(sheet.workpackId, sheet.metadata?.workpack), `${sheet.bars?.length || 0} barra(s)`, `${pieceCount} peça(s)`].filter(Boolean).join(' · ')));
  const status = node('span', `cut-sheet-status cut-sheet-status-${String(sheet.status || 'draft').toLowerCase()}`, String(sheet.status || 'draft').toUpperCase());
  titleBlock.append(back, divider, copy, status);
  const commands = node('div', 'cut-sheet-command-bar');
  if (sheet.status === 'draft') commands.append(iconButton('Editar', 'edit', 'btn btn-secondary', () => state.options.onEditSheet?.(sheet)));
  commands.append(iconButton('Revisar resultados', 'analytics', 'btn btn-primary', () => state.options.onOpenSheetResults?.(sheet)));
  header.append(titleBlock, commands);
  return header;
}

function render() {
  if (!state.container) return;
  const children = [renderList()];
  if (state.selected) {
    const card = node('section', 'card cut-sheet-workspace-card');
    card.append(renderSheetWorkspaceHeader(state.selected.item), renderSheetDetail(state.selected.item));
    children.push(card);
  }
  state.container.replaceChildren(...children);
  renderPageState();
}

export async function refreshCuttingSheetsPage() {
  [state.sheets, state.coupons, state.rmvs, state.projects, state.workpacks, state.inventoryItems] = await Promise.all([state.options.listCuttingSheets?.() || [], state.options.listCoupons?.() || [], state.options.listRmvs?.() || [], state.options.listProjects?.() || [], state.options.listWorkpacks?.() || [], state.options.listInventoryItems?.() || []]);
  if (state.selected?.kind === 'sheet') {
    const current = state.sheets.find((sheet) => sheet.id === state.selected.item.id);
    if (current) state.selected = { ...state.selected, item: current, number: current.number };
  }
  render();
}

export function showCuttingSheetsPage(page = 1) {
  state.page = page === 2 ? 2 : 1;
  renderPageState();
}

export async function initCuttingSheetsPage(container, options = {}) {
  state.container = container;
  state.options = { ...state.options, ...options };
  bindPagination();
  await refreshCuttingSheetsPage();
}
