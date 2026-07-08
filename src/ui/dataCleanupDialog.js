import { clearMtoData } from '../data/mtoDB.js';
import { clearInventoryItems } from '../data/inventoryDB.js';
import { clearAuditEvents } from '../data/auditLog.js';
import { clearStockMovements } from '../data/stockMovements.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

function createEl(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue != null) element.textContent = textValue;
  return element;
}

const CLEANUP_OPTIONS = [
  { id: 'mto', label: 'MTO', clear: clearMtoData },
  { id: 'inventory', label: 'Inventory', clear: clearInventoryItems },
  { id: 'audit', label: 'Audit log', clear: clearAuditEvents },
  { id: 'stockMovements', label: 'Stock movements', clear: clearStockMovements },
];

export async function openDataCleanupDialog(options = {}) {
  const body = createEl('div', 'data-cleanup-dialog');
  body.append(createEl(
    'p',
    'text-muted',
    'Escolha quais dados locais deseja excluir. Esta acao nao pode ser desfeita.',
  ));

  const list = createEl('div', 'data-cleanup-options');
  CLEANUP_OPTIONS.forEach((item) => {
    const label = createEl('label', 'data-cleanup-option');
    const checkbox = createEl('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.id;
    label.append(checkbox, createEl('span', null, item.label));
    list.append(label);
  });

  const confirmation = createEl('input');
  confirmation.type = 'text';
  confirmation.placeholder = 'Digite LIMPAR para confirmar';

  const confirmationField = createEl('label', 'field');
  confirmationField.append(createEl('span', null, 'Confirmacao'), confirmation);

  body.append(list, confirmationField);

  openModal({
    title: 'Excluir dados locais',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Limpar agora',
        variant: 'btn-critical',
        closeOnClick: false,
        onClick: async () => {
          const selected = [...list.querySelectorAll('input[type="checkbox"]:checked')]
            .map((input) => CLEANUP_OPTIONS.find((item) => item.id === input.value))
            .filter(Boolean);
          if (!selected.length) {
            showToast('Selecione ao menos uma area para limpar.', 'error');
            return;
          }
          if (confirmation.value.trim() !== 'LIMPAR') {
            showToast('Digite LIMPAR para confirmar.', 'error');
            return;
          }

          try {
            await Promise.all(selected.map((item) => item.clear()));
            await options.onCleanup?.(selected.map((item) => item.id));
            closeModal();
            showToast('Dados locais selecionados foram limpos.', 'success');
          } catch (error) {
            console.error(error);
            showToast('Falha ao limpar dados locais.', 'error');
          }
        },
      },
    ],
  });
  setTimeout(() => confirmation.focus(), 50);
}
