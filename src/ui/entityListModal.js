import { openModal, closeModal } from './modal.js';

function valueAt(item, field) {
  return field.split('.').reduce((value, key) => value?.[key], item);
}

function itemMatches(item, fields, term) {
  if (!term) return true;
  return fields.some(field => String(valueAt(item, field) || '').toLowerCase().includes(term));
}

function normalizeMeta(meta) {
  if (Array.isArray(meta)) return meta;
  return meta ? [meta] : [];
}

function entityCard(item, { renderCardMeta, onLoad, onDelete }) {
  const card = document.createElement('div');
  card.className = 'plan-card';

  const details = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'plan-name';
  title.textContent = item.name;
  details.appendChild(title);

  normalizeMeta(renderCardMeta(item)).forEach((line) => {
    const meta = document.createElement('div');
    meta.className = 'plan-meta';
    meta.textContent = line;
    details.appendChild(meta);
  });

  const actions = document.createElement('div');
  actions.className = 'plan-actions';

  const loadButton = document.createElement('button');
  loadButton.className = 'btn btn-primary';
  loadButton.type = 'button';
  loadButton.textContent = 'Carregar';
  loadButton.addEventListener('click', () => onLoad(item));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'btn btn-critical';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Excluir';
  deleteButton.addEventListener('click', () => onDelete(item));

  actions.append(loadButton, deleteButton);
  card.append(details, actions);
  return card;
}

export function openEntityListModal({
  title,
  loadItems,
  searchFields,
  renderCardMeta,
  onLoad,
  onDelete,
  emptyMessage,
}) {
  const wrapper = document.createElement('div');

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar...';
  search.style.marginBottom = 'var(--space-3)';
  wrapper.appendChild(search);

  const list = document.createElement('div');
  wrapper.appendChild(list);

  const loading = document.createElement('p');
  loading.className = 'text-muted';
  loading.textContent = 'Carregando...';

  let items = [];

  function render(filterTerm = '') {
    list.replaceChildren();
    const term = filterTerm.toLowerCase();
    const filteredItems = items.filter(item => itemMatches(item, searchFields, term));

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted';
      empty.textContent = emptyMessage;
      list.appendChild(empty);
      return;
    }

    if (filteredItems.length === 0) {
      const noMatch = document.createElement('p');
      noMatch.className = 'text-muted';
      noMatch.textContent = 'Nenhum item encontrado para essa busca.';
      list.appendChild(noMatch);
      return;
    }

    filteredItems.forEach((item) => {
      list.appendChild(entityCard(item, {
        renderCardMeta,
        onLoad: async (loadedItem) => {
          await onLoad(loadedItem);
          closeModal();
        },
        onDelete: async (deletedItem) => {
          if (!confirm(`Excluir "${deletedItem.name}"?`)) return;
          await onDelete(deletedItem);
          items = await loadItems();
          render(search.value);
        },
      }));
    });
  }

  search.addEventListener('input', () => render(search.value));
  list.appendChild(loading);

  openModal({
    title,
    body: wrapper,
    wide: true,
    buttons: [{ label: 'Fechar', variant: 'btn-ghost' }],
  });

  loadItems()
    .then((loadedItems) => {
      items = loadedItems || [];
      render(search.value);
    })
    .catch(() => {
      const error = document.createElement('p');
      error.className = 'text-muted';
      error.textContent = 'Falha ao carregar os itens.';
      list.replaceChildren(error);
    });
}
