import { closeModal, openModal } from './modal.js';

const DOCUMENT_SHORTCUTS = Object.freeze([
  { label: 'Material Coupon', icon: 'confirmation_number', status: 'Available', phase: 'material-coupons' },
  { label: 'Return Material Voucher', icon: 'assignment_return', status: 'Available', phase: 'return-material' },
  { label: 'Cutting Sheet', icon: 'content_cut', status: 'Available', phase: 'cut-sheets' },
  { label: 'Workpack Report', icon: 'workspaces', status: 'Partial', phase: 'workpacks' },
  { label: 'Inventory Extract', icon: 'warehouse', status: 'Available through Inventory', phase: 'inventory' },
  { label: 'Material Traceability Report', icon: 'fact_check', status: 'Available through Inventory', phase: 'inventory' },
  { label: 'Offcut Disposition Report', icon: 'content_cut', status: 'Not implemented' },
  { label: 'Scrap Report', icon: 'delete', status: 'Not implemented' },
  { label: 'Material Receiving Report (MRR)', icon: 'inventory', status: 'Not implemented' },
]);

function element(tag, className, value = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function renderShortcut(shortcut, onNavigate) {
  const button = element('button', 'new-document-shortcut');
  const icon = element('span', 'material-symbols-outlined', shortcut.icon);
  const copy = element('span', 'new-document-shortcut-copy');
  const label = element('strong', null, shortcut.label);
  const status = element('small', null, shortcut.status);

  button.type = 'button';
  icon.setAttribute('aria-hidden', 'true');
  copy.append(label, status);
  button.append(icon, copy);

  if (!shortcut.phase) {
    button.disabled = true;
    button.title = 'Not available yet';
    button.setAttribute('aria-label', `${shortcut.label} - not available yet`);
    status.textContent = 'Not implemented - not available yet';
    return button;
  }

  button.addEventListener('click', () => {
    closeModal();
    onNavigate?.(shortcut.phase);
  });
  return button;
}

export function openNewDocumentModal({ onNavigate } = {}) {
  const body = element('div', 'new-document-modal');
  body.append(...DOCUMENT_SHORTCUTS.map((shortcut) => renderShortcut(shortcut, onNavigate)));
  openModal({ title: 'Novo documento', body, wide: true });
}
