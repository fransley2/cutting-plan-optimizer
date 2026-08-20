import {
  DEFAULT_USER_COMPANY,
  MAX_SIGNATURE_BYTES,
  deactivateUser,
  deleteUser,
  fileToBase64,
  getUser,
  listUsers,
  reactivateUser,
  saveUser,
} from '../data/users.js';
import { clearActiveUserId, getActiveUser, setActiveUserId } from '../data/userSession.js';
import { closeModal, openModal } from './modal.js';
import { showToast } from './toast.js';

function node(tag, className, textContent) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent != null) element.textContent = textContent;
  return element;
}

function field(labelText, control) {
  const wrapper = node('label', 'field user-field');
  wrapper.append(node('span', null, labelText), control);
  return wrapper;
}

function textInput(value = '') {
  const input = node('input');
  input.type = 'text';
  input.value = value;
  return input;
}

function dataUrlSize(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  return payload ? Math.floor((payload.length * 3) / 4) : 0;
}

function formatFileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function updateSignaturePreview(preview, signatureImage, fileInfo = {}) {
  preview.replaceChildren();
  if (!signatureImage) {
    preview.append(node('span', 'text-muted', 'Nenhuma assinatura carregada.'));
    return;
  }
  const image = node('img');
  image.src = signatureImage;
  image.alt = 'Pré-visualização da assinatura';
  const size = fileInfo.size ?? dataUrlSize(signatureImage);
  preview.append(image, node('span', 'signature-preview-details', [fileInfo.name || 'Imagem de assinatura', formatFileSize(size)].join(' · ')));
}

function buildUserForm(user = {}, { compact = false } = {}) {
  let signatureImage = user.signatureImage || null;
  let uploadError = '';
  let fileInfo = {};
  const form = node('div', compact ? 'user-form user-form-compact' : 'user-form');
  const identity = node('div', 'user-identity-grid');
  const nameInput = textInput(user.name);
  const roleInput = textInput(user.role);
  const companyInput = textInput(user.company || DEFAULT_USER_COMPANY);
  identity.append(field('Nome', nameInput), field('Função / Cargo', roleInput), field('Empresa', companyInput));

  const signature = node('section', 'user-signature-section');
  signature.append(node('h4', null, 'Assinatura'));
  const fileInput = node('input', 'hidden');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  const preview = node('div', 'signature-preview');
  const validation = node('p', 'user-validation-error hidden');
  validation.setAttribute('role', 'alert');
  const actions = node('div', 'user-signature-actions');
  const choose = node('button', 'btn btn-secondary', signatureImage ? 'Trocar' : 'Selecionar imagem');
  choose.type = 'button';
  choose.addEventListener('click', () => fileInput.click());
  const remove = node('button', 'btn btn-ghost', 'Remover');
  remove.type = 'button';
  remove.disabled = !signatureImage;
  remove.addEventListener('click', () => {
    signatureImage = null;
    fileInfo = {};
    uploadError = '';
    choose.textContent = 'Selecionar imagem';
    remove.disabled = true;
    updateSignaturePreview(preview, signatureImage);
    validation.classList.add('hidden');
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) uploadError = 'Selecione um arquivo de imagem válido.';
    else if (file.size > MAX_SIGNATURE_BYTES) uploadError = 'A imagem deve ter no máximo 500 KB.';
    else {
      try {
        signatureImage = await fileToBase64(file);
        fileInfo = { name: file.name, size: file.size };
        uploadError = '';
        choose.textContent = 'Trocar';
        remove.disabled = false;
        updateSignaturePreview(preview, signatureImage, fileInfo);
      } catch {
        uploadError = 'Não foi possível ler a imagem de assinatura.';
      }
    }
    validation.textContent = uploadError;
    validation.classList.toggle('hidden', !uploadError);
    fileInput.value = '';
  });
  actions.append(choose, remove);
  updateSignaturePreview(preview, signatureImage);
  signature.append(fileInput, preview, validation, actions);
  form.append(identity, signature);

  return {
    element: form,
    focus: () => nameInput.focus(),
    save: async () => {
      if (uploadError) throw new Error(uploadError);
      return saveUser({ ...user, name: nameInput.value, role: roleInput.value, company: companyInput.value, signatureImage });
    },
  };
}

export async function openUserEditor(userId, { onSave } = {}) {
  const user = userId ? await getUser(userId) : null;
  const form = buildUserForm(user || {});
  openModal({
    title: user ? 'Editar perfil' : 'Adicionar usuário',
    body: form.element,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      { label: 'Salvar', variant: 'btn-primary', closeOnClick: false, onClick: async () => {
        try {
          const saved = await form.save();
          await onSave?.(saved);
          showToast('Usuário salvo.', 'success');
          closeModal();
        } catch (error) {
          showToast(error.message || 'Não foi possível salvar o usuário.', 'error');
        }
      } },
    ],
  });
  form.focus();
}

export async function openCurrentUserEditor(options = {}) {
  const user = await getActiveUser();
  if (!user) return null;
  return openUserEditor(user.id, options);
}

export async function openUsersManager({ onChange } = {}) {
  let selectedId = (await getActiveUser())?.id || '';
  const body = node('div', 'users-manager');

  async function render() {
    const users = await listUsers();
    const selected = users.find((user) => user.id === selectedId) || null;
    const navigation = node('aside', 'users-manager-nav');
    const add = node('button', 'btn btn-primary users-add-button', 'Adicionar usuário');
    add.type = 'button';
    add.addEventListener('click', () => { selectedId = ''; void render(); });
    navigation.append(add);
    const list = node('div', 'users-manager-list');
    users.forEach((user) => {
      const button = node('button', `users-manager-item${user.id === selectedId ? ' active' : ''}`);
      button.type = 'button';
      button.append(
        node('strong', null, user.name),
        node('span', 'text-muted', [user.role, user.company].filter(Boolean).join(' · ') || 'Sem função informada'),
        node('span', `status-chip ${user.active === false ? 'status-neutral' : 'status-ok'}`, user.active === false ? 'Inativo' : 'Ativo'),
      );
      button.addEventListener('click', () => { selectedId = user.id; void render(); });
      list.append(button);
    });
    navigation.append(list);

    const content = node('section', 'users-manager-content');
    const form = buildUserForm(selected || {});
    content.append(node('h3', null, selected ? 'Dados do usuário' : 'Novo usuário'), form.element);
    const actions = node('div', 'users-manager-actions');
    if (selected) {
      const deleteMessage = node('p', 'users-delete-message hidden');
      let deleteArmed = false;
      const deleteAction = node('button', 'btn btn-ghost users-delete-button', 'Apagar usuário');
      deleteAction.type = 'button';
      deleteAction.addEventListener('click', async () => {
        if (!deleteArmed) {
          deleteArmed = true;
          deleteAction.textContent = 'Confirmar exclusão';
          deleteAction.className = 'btn btn-critical users-delete-button';
          deleteMessage.textContent = 'Esta ação é definitiva. Usuários vinculados a Material Coupons não podem ser apagados.';
          deleteMessage.classList.remove('hidden');
          return;
        }
        const result = await deleteUser(selected.id);
        if (!result.deleted) {
          deleteArmed = false;
          deleteAction.textContent = 'Apagar usuário';
          deleteAction.className = 'btn btn-ghost users-delete-button';
          deleteMessage.textContent = result.reason === 'referenced'
            ? `Não é possível apagar: ${result.references.length} Material Coupon(s) preservam este usuário no histórico. Desative-o.`
            : 'Este usuário não foi encontrado.';
          deleteMessage.classList.remove('hidden');
          return;
        }
        selectedId = '';
        await onChange?.({ ...selected, deleted: true });
        showToast('Usuário apagado definitivamente.', 'success');
        await render();
      });
      const statusAction = node('button', selected.active === false ? 'btn btn-secondary' : 'btn btn-critical', selected.active === false ? 'Reativar' : 'Desativar');
      statusAction.type = 'button';
      statusAction.addEventListener('click', async () => {
        const changed = selected.active === false ? await reactivateUser(selected.id) : await deactivateUser(selected.id);
        await onChange?.(changed);
        showToast(selected.active === false ? 'Usuário reativado.' : 'Usuário desativado.', 'success');
        await render();
      });
      actions.append(deleteMessage, deleteAction, statusAction);
    }
    const save = node('button', 'btn btn-primary', 'Salvar');
    save.type = 'button';
    save.addEventListener('click', async () => {
      try {
        const saved = await form.save();
        selectedId = saved.id;
        await onChange?.(saved);
        showToast('Usuário salvo.', 'success');
        await render();
      } catch (error) {
        showToast(error.message || 'Não foi possível salvar o usuário.', 'error');
      }
    });
    actions.append(save);
    content.append(actions);
    body.replaceChildren(navigation, content);
  }

  await render();
  openModal({ title: 'Usuários', body, wide: true, buttons: [{ label: 'Fechar', variant: 'btn-ghost' }] });
}

function userChoice(user, groupName) {
  const label = node('label', 'user-selector-choice');
  const radio = node('input');
  radio.type = 'radio';
  radio.name = groupName;
  radio.value = user.id;
  const content = node('span', 'user-selector-choice-content');
  content.append(node('strong', null, user.name), node('span', null, [user.role, user.company].filter(Boolean).join(' · ') || 'Sem função informada'));
  label.append(radio, content);
  return { label, radio };
}

export async function selectUserForSession() {
  return new Promise(async (resolve) => {
    const overlay = node('div', 'user-selector-overlay');
    const panel = node('section', 'user-selector-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'user-selector-title');
    const brand = node('div', 'user-selector-brand');
    brand.append(node('span', 'material-symbols-outlined', 'badge'), node('span', null, 'Fabrication Portal'));
    const title = node('h1', null, 'Selecionar usuário');
    title.id = 'user-selector-title';
    const description = node('p', 'text-muted', 'Escolha quem está operando nesta aba. Esta seleção serve para atribuição, não para controle de acesso.');
    const choices = node('div', 'user-selector-choices');
    const enter = node('button', 'btn btn-primary user-selector-enter', 'Entrar');
    enter.type = 'button';
    enter.disabled = true;
    const groupName = `user-selector-${Date.now()}`;

    async function renderChoices() {
      const users = await listUsers({ activeOnly: true });
      choices.replaceChildren();
      users.forEach((user) => {
        const choice = userChoice(user, groupName);
        choice.radio.addEventListener('change', () => { enter.disabled = false; });
        choices.append(choice.label);
      });
      const other = userChoice({ id: '__other__', name: 'Outro usuário', role: 'Adicionar novo usuário' }, groupName);
      const inline = node('div', 'user-selector-inline-form hidden');
      other.radio.addEventListener('change', () => {
        enter.disabled = true;
        inline.classList.remove('hidden');
        if (!inline.childElementCount) {
          const form = buildUserForm({}, { compact: true });
          const add = node('button', 'btn btn-primary', 'Adicionar e entrar');
          add.type = 'button';
          add.addEventListener('click', async () => {
            try {
              const saved = await form.save();
              setActiveUserId(saved.id);
              overlay.remove();
              resolve(saved);
            } catch (error) {
              showToast(error.message || 'Não foi possível adicionar o usuário.', 'error');
            }
          });
          inline.append(form.element, add);
          form.focus();
        }
      });
      choices.append(other.label, inline);
      if (!users.length) other.radio.click();
    }

    enter.addEventListener('click', async () => {
      const selectedId = choices.querySelector('input[type="radio"]:checked')?.value;
      if (!selectedId || selectedId === '__other__') return;
      setActiveUserId(selectedId);
      const selected = await getUser(selectedId);
      overlay.remove();
      resolve(selected);
    });
    panel.append(brand, title, description, choices, enter);
    overlay.append(panel);
    document.body.append(overlay);
    await renderChoices();
  });
}

export function openActiveUserMenu(anchor, { onSwitch, onEditSaved } = {}) {
  document.querySelector('.active-user-menu')?.remove();
  const menu = node('div', 'active-user-menu');
  menu.setAttribute('role', 'menu');
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    anchor.setAttribute('aria-expanded', 'false');
  };
  const outside = (event) => { if (!menu.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) close(); };
  const escape = (event) => { if (event.key === 'Escape') close(); };
  const action = (label, iconName, handler) => {
    const button = node('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.append(node('span', 'material-symbols-outlined', iconName), node('span', null, label));
    button.addEventListener('click', async () => { close(); await handler(); });
    return button;
  };
  menu.append(
    action('Trocar usuário', 'switch_account', async () => { clearActiveUserId(); await onSwitch?.(); }),
    action('Editar perfil', 'manage_accounts', async () => openCurrentUserEditor({ onSave: onEditSaved })),
  );
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  document.body.append(menu);
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape, true);
  anchor.setAttribute('aria-expanded', 'true');
  menu.querySelector('button')?.focus();
}
