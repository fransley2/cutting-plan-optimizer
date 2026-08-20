import { closeModal, openModal } from './modal.js';

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function openSobremetalModal({ piece = {}, onSave } = {}) {
  const body = node('div', 'sobremetal-editor');
  const description = node('p', 'text-muted', 'O valor será somado ao comprimento nominal e permanecerá unido à peça durante a otimização.');
  const toggleLabel = node('label', 'sobremetal-editor-toggle');
  const toggle = node('input'); toggle.type = 'checkbox'; toggle.checked = piece.hasSobremetal === true;
  toggleLabel.append(toggle, node('span', '', 'Aplicar sobremetal nesta peça'));
  const amountField = node('label', 'field'); amountField.append(node('span', '', 'Sobremetal [mm]'));
  const amount = node('input', 'input'); amount.type = 'number'; amount.min = '0'; amount.step = '0.1'; amount.value = String(toggle.checked ? Number(piece.sobremetalMm ?? 500) : 500);
  amountField.append(amount);
  const total = node('div', 'sobremetal-editor-total');
  const nominal = Number(piece.length ?? piece.nominalLengthMm ?? 0) || 0;
  const refresh = () => {
    amount.disabled = !toggle.checked;
    const extra = toggle.checked ? Math.max(0, Number(amount.value) || 0) : 0;
    total.textContent = `Comprimento para nesting: ${nominal} + ${extra} = ${nominal + extra} mm`;
  };
  toggle.addEventListener('change', refresh);
  amount.addEventListener('input', refresh);
  body.append(description, toggleLabel, amountField, total);
  refresh();
  openModal({
    title: [piece.mark, piece.pos].filter(Boolean).length ? `Sobremetal — ${[piece.mark, piece.pos].filter(Boolean).join(' / ')}` : 'Configurar sobremetal',
    body,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Aplicar', variant: 'btn-primary', closeOnClick: false,
        onClick: () => {
          const value = Number(amount.value);
          if (toggle.checked && (!Number.isFinite(value) || value < 0)) {
            amount.classList.add('input-error'); amount.focus(); return;
          }
          onSave?.({ hasSobremetal: toggle.checked, sobremetalMm: toggle.checked ? value : 0 });
          closeModal();
        },
      },
    ],
  });
}
