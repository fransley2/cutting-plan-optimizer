import {
  DOCUMENT_TEMPLATE_TYPES,
} from '../data/documentTemplates.js';

let deps = {};
let modalState = {
  template: null,
  loading: false,
};

function showMessage(message, type = 'success') {
  if (typeof deps.showToast === 'function') {
    deps.showToast(message, type);
  } else {
    console[type === 'error' ? 'error' : 'info'](message);
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR');
}

function node(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function ensureDialog() {
  let dialog = document.getElementById('material-coupon-template-dialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'material-coupon-template-dialog';
  dialog.className = 'export-dialog';
  document.body.appendChild(dialog);
  return dialog;
}

function createField(label, value) {
  const wrapper = node('div', 'mc-field');
  const labelEl = node('span', '', label);
  const valueEl = node('strong', '', value || '-');
  wrapper.append(labelEl, valueEl);
  return wrapper;
}

export function renderMaterialCouponTemplateModal(state = modalState) {
  const dialog = ensureDialog();
  dialog.replaceChildren();

  const header = node('header', 'export-dialog-header');
  const titleWrap = node('div');
  titleWrap.append(
    node('h2', '', 'Configurar Template de Material Coupon'),
    node('p', 'text-muted', 'Salve um arquivo .xlsx base para gerar Material Coupons mantendo o layout original.')
  );
  const closeButton = node('button', 'modal-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Fechar');
  closeButton.dataset.action = 'close';
  header.append(titleWrap, closeButton);

  const body = node('section', 'mc-tab-panel');
  const statusText = state.template ? 'Template configurado' : 'Não configurado';
  const status = node('div', 'placeholder-panel');
  status.append(
    node('strong', '', statusText),
    node('p', '', state.template
      ? 'Este template será usado nos testes locais de Material Coupon em Excel.'
      : 'Faça upload de um arquivo .xlsx para configurar o template.')
  );

  const fileInput = document.createElement('input');
  fileInput.id = 'material-coupon-template-file';
  fileInput.type = 'file';
  fileInput.accept = '.xlsx';
  fileInput.className = 'hidden';

  const grid = node('div', 'mc-form-grid');
  grid.append(
    createField('Arquivo salvo', state.template?.fileName || ''),
    createField('Última atualização', formatDate(state.template?.updatedAt)),
    createField('Tamanho', state.template?.size ? `${state.template.size} bytes` : '')
  );

  body.append(status, grid, fileInput);

  const footer = node('footer', 'modal-footer');
  const uploadButton = node('button', 'btn btn-primary', 'Upload Template');
  uploadButton.type = 'button';
  uploadButton.dataset.action = 'upload';

  const testButton = node('button', 'btn btn-secondary', 'Gerar Teste');
  testButton.type = 'button';
  testButton.dataset.action = 'test';
  testButton.disabled = !state.template || state.loading;

  const removeButton = node('button', 'btn btn-secondary', 'Remover Template');
  removeButton.type = 'button';
  removeButton.dataset.action = 'remove';
  removeButton.disabled = !state.template || state.loading;

  const closeFooterButton = node('button', 'btn btn-secondary', 'Fechar');
  closeFooterButton.type = 'button';
  closeFooterButton.dataset.action = 'close';

  footer.append(uploadButton, testButton, removeButton, closeFooterButton);
  dialog.append(header, body, footer);
  bindMaterialCouponTemplateEvents();
  return dialog;
}

async function refreshTemplateState() {
  modalState.loading = true;
  try {
    modalState.template = await deps.getDocumentTemplate?.(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON);
  } finally {
    modalState.loading = false;
  }
}

async function handleUpload(file) {
  if (!file) return;
  try {
    await deps.saveDocumentTemplate?.(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON, file);
    showMessage('Template de Material Coupon salvo.', 'success');
    await refreshTemplateState();
    renderMaterialCouponTemplateModal(modalState);
  } catch (error) {
    console.error(error);
    showMessage(error?.message || 'Não foi possível salvar o template.', 'error');
  }
}

async function handleRemove() {
  try {
    await deps.deleteDocumentTemplate?.(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON);
    showMessage('Template removido.', 'success');
    await refreshTemplateState();
    renderMaterialCouponTemplateModal(modalState);
  } catch (error) {
    console.error(error);
    showMessage(error?.message || 'Não foi possível remover o template.', 'error');
  }
}

async function handleTest() {
  try {
    const template = await deps.getDocumentTemplate?.(DOCUMENT_TEMPLATE_TYPES.MATERIAL_COUPON);
    if (!template?.arrayBuffer) {
      showMessage('Nenhum template configurado.', 'error');
      return;
    }
    await deps.generateMaterialCouponTemplateTest?.({
      templateArrayBuffer: template.arrayBuffer,
      download: true,
    });
    showMessage('Arquivo de teste gerado.', 'success');
  } catch (error) {
    console.error(error);
    showMessage(error?.message || 'Não foi possível gerar o teste.', 'error');
  }
}

export function bindMaterialCouponTemplateEvents() {
  const dialog = ensureDialog();
  const fileInput = dialog.querySelector('#material-coupon-template-file');

  dialog.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (action === 'close') dialog.close();
      if (action === 'upload') fileInput?.click();
      if (action === 'remove') await handleRemove();
      if (action === 'test') await handleTest();
    });
  });

  fileInput?.addEventListener('change', async (event) => {
    await handleUpload(event.target.files?.[0]);
    event.target.value = '';
  });
}

export async function openMaterialCouponTemplateModal(options = {}) {
  deps = { ...deps, ...options };
  await refreshTemplateState();
  const dialog = renderMaterialCouponTemplateModal(modalState);
  if (!dialog.open) dialog.showModal();
  return dialog;
}

export function initMaterialCouponTemplateModal(options = {}) {
  deps = { ...options };
  renderMaterialCouponTemplateModal(modalState);
}
