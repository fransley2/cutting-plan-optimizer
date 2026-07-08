import { getProfile, saveProfile, fileToBase64, MAX_SIGNATURE_BYTES } from '../data/profile.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

function createField(labelText, input) {
  const field = document.createElement('div');
  field.className = 'field profile-field';

  const label = document.createElement('label');
  label.textContent = labelText;

  field.append(label, input);
  return field;
}

function createTextInput(value = '') {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  return input;
}

function updatePreview(preview, signatureImage) {
  preview.replaceChildren();

  if (!signatureImage) {
    const empty = document.createElement('span');
    empty.className = 'text-muted';
    empty.textContent = 'Nenhuma assinatura carregada.';
    preview.appendChild(empty);
    return;
  }

  const image = document.createElement('img');
  image.src = signatureImage;
  image.alt = 'Preview da assinatura';
  preview.appendChild(image);
}

export async function openProfileModal({ onSave } = {}) {
  const profile = await getProfile();
  let signatureImage = profile.signatureImage;

  const wrapper = document.createElement('div');
  wrapper.className = 'profile-modal-body';

  const nameInput = createTextInput(profile.name);
  const roleInput = createTextInput(profile.role);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';

  const preview = document.createElement('div');
  preview.className = 'signature-preview';
  updatePreview(preview, signatureImage);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIGNATURE_BYTES) {
      fileInput.value = '';
      showToast('Imagem muito grande, use ate 500KB', 'error');
      return;
    }

    signatureImage = await fileToBase64(file);
    updatePreview(preview, signatureImage);
  });

  wrapper.append(
    createField('Nome', nameInput),
    createField('Funcao / Cargo', roleInput),
    createField('Imagem de assinatura', fileInput),
    preview
  );

  openModal({
    title: 'Gerenciador de Perfil',
    body: wrapper,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Salvar',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          await saveProfile({
            name: nameInput.value.trim(),
            role: roleInput.value.trim(),
            signatureImage,
          });
          await onSave?.();
          showToast('Perfil salvo.', 'success');
          closeModal();
        },
      },
    ],
  });
}
