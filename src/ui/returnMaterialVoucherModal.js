import { openModal, closeModal } from './modal.js';
import { RMV_STATUS } from '../data/returnMaterialVouchers.js';
import { buildRmvGeneralNotesDraft, buildRmvReferenceDraft, RMV_LINE_STATUS } from '../core/returnMaterialVoucher.js';

function node(tag, className = '', value = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== '') element.textContent = String(value);
  return element;
}

function formatMeasurement(value) {
  if (value === '' || value == null) return '';
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false })
    : String(value);
}

function field(label, value, name, editable = true, type = 'text') {
  const wrapper = node('label', 'field');
  wrapper.append(node('span', '', label));
  const input = node(type === 'textarea' ? 'textarea' : 'input', 'input');
  if (input instanceof HTMLInputElement) input.type = type;
  input.name = name; input.value = value || ''; input.disabled = !editable;
  if (input instanceof HTMLTextAreaElement) input.rows = 3;
  wrapper.append(input);
  return wrapper;
}

function readHeader(body, rmv) {
  const value = (name) => body.querySelector(`[name="${name}"]`)?.value?.trim() || '';
  return { ...rmv, date: value('date'), origin: value('origin'), destination: value('destination'), drawingReference: value('drawingReference'), reference: value('reference'), notes: value('notes') };
}

function selectedLineIds(body) {
  return [...body.querySelectorAll('[data-rmv-line]:checked')].map((input) => input.value);
}

function statusLabel(status) {
  return ({ draft: 'Rascunho', issued: 'Aguardando recebimento', partially_received: 'Recebimento parcial', returned: 'Recebido', cancelled: 'Cancelado', closed: 'Fechado' })[status] || status;
}

function generateNarrative(body, rmv) {
  const current = readHeader(body, rmv);
  const configured = rmv.metadata?.reportOptions?.returnMaterialVoucherForm || {};
  const context = {
    ...rmv.metadata,
    origin: current.origin,
    destination: current.destination,
    drawingReference: current.drawingReference,
  };
  const generated = {
    reference: buildRmvReferenceDraft(context, configured.reference),
    notes: buildRmvGeneralNotesDraft(context, configured.notes),
  };
  const applyGenerated = () => {
    body.querySelector('[name="reference"]').value = generated.reference;
    body.querySelector('[name="notes"]').value = generated.notes;
  };
  if (!current.reference && !current.notes) { applyGenerated(); return; }
  if (current.reference === generated.reference && current.notes === generated.notes) return;
  const confirmation = node('div', 'rmv-generate-confirmation');
  confirmation.append(
    node('p', '', 'Reference ou General Notes já possuem conteúdo.'),
    node('p', 'text-muted', 'Deseja substituir os dois campos pelo texto gerado a partir dos vínculos atuais?'),
  );
  openModal({
    title: 'Gerar Reference e General Notes', body: confirmation, stacked: true,
    buttons: [
      { label: 'Manter conteúdo atual', variant: 'btn-ghost' },
      { label: 'Substituir pelos textos gerados', variant: 'btn-primary', onClick: applyGenerated },
    ],
  });
}

function renderBody(rmv) {
  const body = node('div', 'rmv-workspace');
  const summary = node('section', 'rmv-summary');
  const received = rmv.returnedItems.filter((line) => line.status === RMV_LINE_STATUS.RECEIVED).length;
  [['RMV', rmv.number], ['Status', statusLabel(rmv.status)], ['Materiais', rmv.returnedItems.length], ['Recebidos', `${received}/${rmv.returnedItems.length}`]].forEach(([label, value]) => {
    const card = node('div', 'rmv-summary-card'); card.append(node('span', '', label), node('strong', '', value || '—')); summary.append(card);
  });
  const editable = rmv.status === RMV_STATUS.DRAFT;
  const logistics = node('section', 'rmv-section');
  const logisticsHeading = node('div', 'rmv-section-heading');
  logisticsHeading.append(node('h4', '', 'Logística e referências'));
  if (editable) {
    const generate = node('button', 'btn btn-secondary rmv-generate-narrative');
    generate.type = 'button';
    generate.append(node('span', 'material-symbols-outlined', 'auto_awesome'), document.createTextNode('Gerar Reference e General Notes'));
    generate.addEventListener('click', () => generateNarrative(body, rmv));
    logisticsHeading.append(generate);
  }
  logistics.append(logisticsHeading);
  const grid = node('div', 'rmv-form-grid');
  grid.append(field('Data', rmv.date, 'date', editable, 'date'), field('Origem', rmv.origin, 'origin', editable && rmv.metadata?.originLocked !== true), field('Destino', rmv.destination, 'destination', editable), field('Drawing de referência', rmv.drawingReference, 'drawingReference', editable), field('Referência', rmv.reference, 'reference', editable, 'textarea'), field('Notas gerais', rmv.notes, 'notes', editable, 'textarea'));
  logistics.append(grid);

  const materials = node('section', 'rmv-section');
  const title = node('div', 'rmv-section-heading'); title.append(node('h4', '', 'Materiais devolvidos'), node('span', 'text-muted', editable ? 'Selecione as linhas que farão parte da emissão.' : 'Selecione linhas pendentes para registrar o recebimento.')); materials.append(title);
  const wrap = node('div', 'table-wrap'); const table = node('table', 'data-table rmv-materials-table');
  const head = node('thead'); const header = node('tr'); ['✓', 'SAP', 'PO / Item', 'Descrição', 'Dimensões', 'Peso', 'Heat', 'Rastreabilidade', 'Condição', 'Status'].forEach((label) => header.append(node('th', '', label))); head.append(header);
  const tbody = node('tbody');
  rmv.returnedItems.forEach((line) => {
    const row = node('tr'); const selectCell = node('td'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.value = line.id; checkbox.dataset.rmvLine = 'true'; checkbox.disabled = !editable && line.status === RMV_LINE_STATUS.RECEIVED; selectCell.append(checkbox); row.append(selectCell);
    const dimensions = [line.diaMm && `Ø${line.diaMm}`, line.thicknessMm && `t${line.thicknessMm}`, line.widthMm && `w${line.widthMm}`, line.lengthMm && `L${formatMeasurement(line.lengthMm)}`].filter(Boolean).join(' × ');
    [line.sapCode, [line.po, line.poItem].filter(Boolean).join(' / '), line.materialDescription, dimensions, line.weightKg ? `${formatMeasurement(line.weightKg)} kg` : '—', line.heatNo, line.parentTraceability || line.traceability, line.condition, line.status].forEach((value) => row.append(node('td', '', value || '—')));
    tbody.append(row);
  });
  table.append(head, tbody); wrap.append(table); materials.append(wrap);
  body.append(summary, logistics, materials);
  return body;
}

export function openReturnMaterialVoucherModal(rmv, dependencies = {}) {
  const body = renderBody(rmv);
  const reopen = (next) => { closeModal(); openReturnMaterialVoucherModal(next, dependencies); };
  const buttons = [{ label: 'Fechar', variant: 'btn-ghost' }];
  buttons.push({ label: 'Exportar Excel', variant: 'btn-secondary', closeOnClick: false, onClick: async () => {
    try { await dependencies.exportExcel?.(readHeader(body, rmv)); }
    catch (error) { console.error(error); dependencies.showToast?.(error?.message || 'Não foi possível exportar o RMV.', 'error'); }
  } });
  buttons.push({ label: 'Imprimir / PDF', variant: 'btn-secondary', closeOnClick: false, onClick: () => dependencies.printReport?.(readHeader(body, rmv)) });
  if (rmv.status === RMV_STATUS.DRAFT) {
    buttons.push({ label: 'Salvar rascunho', variant: 'btn-secondary', closeOnClick: false, onClick: async () => reopen(await dependencies.saveRmv?.(readHeader(body, rmv))) });
    buttons.push({ label: 'Emitir RMV', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
      try { const draft = await dependencies.saveRmv?.(readHeader(body, rmv)); reopen(await dependencies.issueRmv?.(draft, selectedLineIds(body))); }
      catch (error) { dependencies.showToast?.(error.message || 'Não foi possível emitir o RMV.', 'error'); }
    } });
  }
  if ([RMV_STATUS.ISSUED, RMV_STATUS.PARTIALLY_RECEIVED].includes(rmv.status)) {
    buttons.push({ label: 'Cancelar RMV', variant: 'btn-critical', closeOnClick: false, onClick: async () => {
      try { reopen(await dependencies.cancelRmv?.(rmv)); } catch (error) { dependencies.showToast?.(error.message, 'error'); }
    } });
    buttons.push({ label: 'Registrar recebimento', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
      try { reopen(await dependencies.receiveLines?.(rmv, selectedLineIds(body))); } catch (error) { dependencies.showToast?.(error.message || 'Não foi possível receber os materiais.', 'error'); }
    } });
  }
  openModal({ title: `Returned Material Voucher — ${rmv.number}`, body, buttons, wide: true });
}
