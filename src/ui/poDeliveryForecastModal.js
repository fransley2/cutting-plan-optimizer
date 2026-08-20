import { CUSTOMS_CHANNELS, PO_DELIVERY_STAGES, summarizePoItemDeliveryForecasts } from '../core/poDeliveryForecast.js';
import { closeModal, openModal } from './modal.js';

const STAGES = Object.freeze([
  [PO_DELIVERY_STAGES.SUPPLIER, 'No fornecedor'], [PO_DELIVERY_STAGES.READY_AT_ORIGIN, 'Pronto na origem'],
  [PO_DELIVERY_STAGES.INTERNATIONAL_TRANSIT, 'Transporte internacional'], [PO_DELIVERY_STAGES.ARRIVED_BRAZIL, 'Chegou ao Brasil'],
  [PO_DELIVERY_STAGES.CUSTOMS_CLEARANCE, 'Desembaraço aduaneiro'], [PO_DELIVERY_STAGES.CUSTOMS_RELEASED, 'Liberado pela alfândega'],
  [PO_DELIVERY_STAGES.INVOICE_ISSUED, 'Nota fiscal emitida'], [PO_DELIVERY_STAGES.PICKUP_SCHEDULED, 'Coleta agendada'],
  [PO_DELIVERY_STAGES.ROAD_TRANSIT, 'Em transporte ao CTCO'], [PO_DELIVERY_STAGES.ARRIVED_CTCO, 'Chegou ao CTCO'],
]);
const CHANNELS = Object.freeze([
  [CUSTOMS_CHANNELS.NOT_DEFINED, 'Não parametrizado'], [CUSTOMS_CHANNELS.GREEN, 'Verde'], [CUSTOMS_CHANNELS.YELLOW, 'Amarelo'],
  [CUSTOMS_CHANNELS.RED, 'Vermelho'], [CUSTOMS_CHANNELS.GRAY, 'Cinza'], [CUSTOMS_CHANNELS.NOT_APPLICABLE, 'Não aplicável'],
]);

function node(tag, className = '', value = '') { const element = document.createElement(tag); if (className) element.className = className; if (value !== '') element.textContent = String(value); return element; }
function text(value) { return value == null ? '' : String(value).trim(); }
function formatNumber(value) { const number = Number(value); return (Number.isFinite(number) ? number : 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); }
function formatDate(value) { if (!value) return '—'; const date = new Date(`${text(value).slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString('pt-BR'); }
function field(label, name, value = '', type = 'text', options = {}) { const wrapper = node('label', 'field'); wrapper.append(node('span', '', label)); const input = type === 'textarea' ? node('textarea', 'input') : node('input', 'input'); input.name = name; input.value = text(value); if (type !== 'textarea') input.type = type; if (options.required) input.required = true; if (options.min != null) input.min = String(options.min); if (options.step != null) input.step = String(options.step); wrapper.append(input); return wrapper; }
function selectField(label, name, value, records, required = false) { const wrapper = node('label', 'field'); wrapper.append(node('span', '', label)); const select = node('select', 'input'); select.name = name; select.required = required; records.forEach(([key, caption]) => select.append(new Option(caption, key))); select.value = text(value); wrapper.append(select); return wrapper; }
function button(label, className, handler, icon = '') { const control = node('button', className); control.type = 'button'; if (icon) control.append(node('span', 'material-symbols-outlined', icon)); control.append(document.createTextNode(label)); control.addEventListener('click', handler); return control; }
function actionGroup(...controls) { const group = node('div', 'procurement-action-group'); group.append(...controls); return group; }
function formGrid(...children) { const form = node('form', 'procurement-form-grid'); form.append(...children); return form; }
function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
function labelFor(records, value) { return records.find(([key]) => key === text(value).toUpperCase())?.[1] || value || '—'; }
function mtoLabel(item = {}) { return [item.drawing, item.mark || item.pos, item.identCode || item.material].filter(Boolean).join(' · ') || item.id || 'MTO'; }

export function openPoDeliveryForecastModal({ po = {}, item = {}, metrics = {}, forecasts = [], allocations = [], mtoItems = [], allMtoItems = [], dependencies = {}, editingId = '', onChanged = async () => {} } = {}) {
  const activeForecasts = forecasts.filter((record) => record.poItemId === item.id && record.status !== 'CANCELLED').sort((left, right) => text(left.ctcoForecastDate).localeCompare(text(right.ctcoForecastDate)));
  const activeAllocations = allocations.filter((record) => record.poItemId === item.id && record.status !== 'CANCELLED');
  const summary = summarizePoItemDeliveryForecasts({ poItem: item, forecasts: activeForecasts, receivedQuantity: metrics.received });
  const mtoById = new Map(mtoItems.map((record) => [record.id, record]));
  const editing = activeForecasts.find((record) => record.id === editingId) || null;
  const body = node('div', 'procurement-logistics-modal');

  const hero = node('section', 'procurement-logistics-hero'); const heroCopy = node('div');
  heroCopy.append(node('span', 'eyebrow', `PO ${po.poNumber} · Item ${item.itemNumber}`), node('h3', '', item.identCode || item.materialCode || 'Material comprado'), node('p', 'text-muted', item.description || 'Sem descrição'));
  const heroMetrics = node('div', 'procurement-logistics-kpis');
  [['Falta receber', `${formatNumber(summary.pendingQuantity)} ${item.unitOfMeasure}`], ['Com programação', `${formatNumber(summary.scheduledPendingQuantity)} ${item.unitOfMeasure}`], ['Próxima ETA CTCO', formatDate(summary.nextCtcoDate)]].forEach(([label, value]) => { const card = node('div'); card.append(node('span', '', label), node('strong', '', value)); heroMetrics.append(card); });
  hero.append(heroCopy, heroMetrics); body.append(hero);

  const linkSection = node('section', 'procurement-logistics-section'); const linkHeader = node('div', 'procurement-section-heading'); const linkCopy = node('div');
  linkCopy.append(node('h4', '', 'Cobertura PO × MTO'), node('p', 'text-muted', 'O IDENT CODE cria vínculos automáticos; exceções continuam revisáveis na tela MTO.'));
  linkHeader.append(linkCopy, button('Vincular por IDENT CODE', 'btn btn-secondary btn-sm', async () => {
    const result = dependencies.suggestMtoPoItemAllocationsByIdentCode?.({ mtoItems: allMtoItems, poItems: [item], existingAllocations: allocations }) || { suggestions: [], issues: [] };
    if (!result.suggestions.length) return dependencies.showToast?.(result.issues[0]?.message || 'Nenhuma demanda MTO elegível encontrada para este IDENT CODE.', 'warning');
    try {
      await dependencies.saveMtoPoItemAllocations?.(result.suggestions.map((record) => ({ ...record, createdBy: dependencies.currentUserName || '' })));
      dependencies.showToast?.(`${result.suggestions.length} vínculo(s) PO × MTO criado(s).`, 'success'); closeModal(); await onChanged({ reopen: true });
    } catch (error) { console.error(error); dependencies.showToast?.(error?.message || 'Falha ao vincular PO × MTO.', 'error'); }
  }, 'link'));
  const linkList = node('div', 'procurement-logistics-links');
  activeAllocations.forEach((allocation) => { const row = node('div'); row.append(node('strong', '', mtoLabel(mtoById.get(allocation.mtoLineId))), node('span', 'text-muted', `${formatNumber(allocation.allocatedQuantity)} ${allocation.unitOfMeasure || item.unitOfMeasure}`)); linkList.append(row); });
  if (!activeAllocations.length) linkList.append(node('p', 'text-muted', 'Ainda não existe demanda MTO vinculada a este item.'));
  linkSection.append(linkHeader, linkList); body.append(linkSection);

  const scheduleSection = node('section', 'procurement-logistics-section'); const scheduleCopy = node('div', 'procurement-section-heading'); const scheduleTitle = node('div');
  scheduleTitle.append(node('h4', '', 'Parcelas e marcos logísticos'), node('p', 'text-muted', 'Cada parcela tem quantidade, etapa atual e ETA final no CTCO.')); scheduleCopy.append(scheduleTitle); scheduleSection.append(scheduleCopy);
  const scheduleList = node('div', 'procurement-logistics-schedule');
  activeForecasts.forEach((forecast) => {
    const card = node('article', 'procurement-logistics-card'); const copy = node('div');
    copy.append(node('strong', '', `${forecast.shipmentReference || 'Parcela'} · ${formatNumber(forecast.quantity)} ${forecast.unitOfMeasure}`), node('span', '', labelFor(STAGES, forecast.stage)), node('small', 'text-muted', `ETA CTCO ${formatDate(forecast.ctcoForecastDate || forecast.ctcoArrivalDate)} · Canal ${labelFor(CHANNELS, forecast.customsChannel)}`));
    card.append(copy, actionGroup(
      button('Editar', 'btn btn-row-edit btn-sm', () => openPoDeliveryForecastModal({ po, item, metrics, forecasts, allocations, mtoItems, allMtoItems, dependencies, editingId: forecast.id, onChanged }), 'edit'),
      button('Cancelar', 'btn btn-row-delete btn-sm', async () => {
        try { await dependencies.cancelPoDeliveryForecast?.(forecast.id, { reason: 'Previsão parcial cancelada no Procurement.', userName: dependencies.currentUserName || '' }); dependencies.showToast?.('Previsão cancelada.', 'success'); closeModal(); await onChanged({ reopen: true }); }
        catch (error) { console.error(error); dependencies.showToast?.(error?.message || 'Falha ao cancelar a previsão.', 'error'); }
      }, 'close'),
    )); scheduleList.append(card);
  });
  if (!activeForecasts.length) scheduleList.append(node('p', 'text-muted', 'Nenhuma parcela prevista. Cadastre abaixo a primeira ETA CTCO.'));
  scheduleSection.append(scheduleList); body.append(scheduleSection);

  const editor = node('section', 'procurement-logistics-section'); editor.append(node('h4', '', editing ? 'Editar parcela' : 'Nova parcela'));
  const form = formGrid(
    field('Referência da parcela / embarque', 'shipmentReference', editing?.shipmentReference),
    field(`Quantidade [${item.unitOfMeasure}]`, 'quantity', editing?.quantity || Math.max(0, summary.unscheduledQuantity), 'number', { required: true, min: 0.000001, step: 'any' }),
    selectField('Etapa atual', 'stage', editing?.stage || PO_DELIVERY_STAGES.SUPPLIER, STAGES, true), field('ETA CTCO', 'ctcoForecastDate', editing?.ctcoForecastDate, 'date', { required: !editing?.ctcoArrivalDate }),
    selectField('Canal aduaneiro', 'customsChannel', editing?.customsChannel || CUSTOMS_CHANNELS.NOT_DEFINED, CHANNELS), field('País de origem', 'originCountry', editing?.originCountry),
    field('Porto de chegada', 'portOfArrival', editing?.portOfArrival), field('Tracking / DI / DUIMP', 'trackingReference', editing?.trackingReference),
    field('ETA porto', 'portEtaDate', editing?.portEtaDate, 'date'), field('Chegada real no porto', 'portArrivalDate', editing?.portArrivalDate, 'date'),
    field('Previsão liberação aduaneira', 'customsReleaseForecastDate', editing?.customsReleaseForecastDate, 'date'), field('Liberação aduaneira real', 'customsReleasedDate', editing?.customsReleasedDate, 'date'),
    field('Emissão da nota', 'invoiceDate', editing?.invoiceDate, 'date'), field('Previsão de coleta', 'pickupForecastDate', editing?.pickupForecastDate, 'date'),
    field('Coleta real', 'pickupDate', editing?.pickupDate, 'date'), field('Chegada real no CTCO', 'ctcoArrivalDate', editing?.ctcoArrivalDate, 'date'),
    field('Responsável', 'responsible', editing?.responsible || dependencies.currentUserName), field('Observações / impedimentos', 'notes', editing?.notes, 'textarea'),
  );
  function syncArrivalRequirements() {
    const arrived = form.elements.stage.value === PO_DELIVERY_STAGES.ARRIVED_CTCO;
    form.elements.ctcoForecastDate.required = !arrived;
    form.elements.ctcoArrivalDate.required = arrived;
  }
  form.elements.stage.addEventListener('change', syncArrivalRequirements);
  syncArrivalRequirements();
  editor.append(form); body.append(editor);

  openModal({ title: 'Logística de importação e ETA CTCO', body, wide: true, buttons: [
    { label: 'Fechar', variant: 'btn-ghost' },
    { label: editing ? 'Salvar alterações' : 'Adicionar parcela', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
      if (!form.reportValidity()) return;
      try {
        await dependencies.savePoDeliveryForecast?.({ ...formValues(form), id: editing?.id || '', projectId: item.projectId, purchaseOrderId: po.id, poItemId: item.id, unitOfMeasure: item.unitOfMeasure, createdBy: dependencies.currentUserName || '', updatedBy: dependencies.currentUserName || '' });
        dependencies.showToast?.(editing ? 'Previsão atualizada.' : 'Parcela adicionada.', 'success'); closeModal(); await onChanged({ reopen: true });
      } catch (error) { console.error(error); dependencies.showToast?.(error?.message || 'Falha ao salvar a previsão.', 'error'); }
    } },
  ] });
}
