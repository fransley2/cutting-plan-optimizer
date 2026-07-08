import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';
import { saveInventoryItems, getInventoryItems } from '../data/inventoryDB.js';
import { parseInventoryRows, mapInventoryItemToStockRow } from '../data/inventoryImport.js';
import { readExcelFile } from '../data/excel.js';

let inventoryItems = [];
let activeModal = null;
let selectedTraces = new Set();
let visibleInventoryItems = [];

function text(value) {
  return value == null ? '' : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inventoryMatchesSearch(item, term = '') {
  const tokens = text(term).trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const searchable = [
    item.trace,
    item.traceability,
    item.category,
    item.po,
    item.item,
    item.material,
    item.desc,
    item.description,
    item.length,
    item.thkMm ?? item.refF,
    item.diaOdMm ?? item.refG,
    item.widthMm ?? item.refH,
    item.heat,
    item.status,
  ].join(' ').toLowerCase();
  return tokens.every((token) => searchable.includes(token));
}

function buildRowMarkup(item) {
  const status = item.status || 'available';
  const statusClass = `inventory-status-${String(status).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  return `
    <tr>
      <td><input type="checkbox" class="inventory-checkbox" data-trace="${escapeHtml(item.trace)}"></td>
      <td>${escapeHtml(item.trace)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml([item.po, item.item].filter(Boolean).join(' / '))}</td>
      <td>${escapeHtml(item.material)}</td>
      <td>${escapeHtml(item.desc || item.description)}</td>
      <td>${escapeHtml(item.thkMm ?? item.refF)}</td>
      <td>${escapeHtml(item.diaOdMm ?? item.refG)}</td>
      <td>${escapeHtml(item.widthMm ?? item.refH)}</td>
      <td>${escapeHtml(item.length)}</td>
      <td>${escapeHtml(item.heat)}</td>
      <td><span class="inventory-status ${statusClass}">${escapeHtml(status)}</span></td>
    </tr>`;
}

function renderInventoryTable(bodyEl, items) {
  visibleInventoryItems = items;
  bodyEl.innerHTML = '';
  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 12;
    cell.textContent = 'Nenhum material encontrado. Faca upload do Excel.';
    row.appendChild(cell);
    bodyEl.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = buildRowMarkup(item);
    fragment.appendChild(row);
  });
  bodyEl.appendChild(fragment);
}

function syncSelectionState() {
  const checkboxes = activeModal?.querySelectorAll('.inventory-checkbox');
  checkboxes?.forEach((checkbox) => {
    checkbox.checked = selectedTraces.has(checkbox.dataset.trace);
  });
  const selectAll = activeModal?.querySelector('#select-all-inventory');
  if (selectAll) {
    const visibleTraces = visibleInventoryItems.map((item) => item.trace).filter(Boolean);
    const selectedVisibleCount = visibleTraces.filter((trace) => selectedTraces.has(trace)).length;
    selectAll.checked = visibleTraces.length > 0 && selectedVisibleCount === visibleTraces.length;
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleTraces.length;
  }
}

async function importInventoryFile(file, fileLabelEl, bodyEl) {
  try {
    const rows = await readExcelFile(file, { raw: true });
    const parsedItems = parseInventoryRows(rows);
    await saveInventoryItems(parsedItems);
    inventoryItems = parsedItems;
    fileLabelEl.textContent = `${file.name} (${parsedItems.length} itens carregados)`;
    selectedTraces = new Set();
    renderInventoryTable(bodyEl, inventoryItems);
    syncSelectionState();
    showToast('Inventario salvo no banco de dados local!', 'success');
  } catch (error) {
    console.error(error);
    showToast('Erro ao ler o arquivo. Verifique o formato.', 'error');
  }
}

export async function openInventoryModal({ onAddToStock }) {
  const body = document.createElement('div');
  body.className = 'inventory-modal-body';
  body.innerHTML = `
    <div class="inventory-modal-controls">
      <button class="btn btn-secondary" id="upload-inventory-btn">Importar Excel</button>
      <input type="file" id="inventory-file-input" class="hidden" accept=".xlsx,.csv">
    </div>
    <div class="text-muted" id="inventory-file-name"></div>
    <div class="inventory-modal-filters">
      <input type="text" id="inventory-search" placeholder="Buscar PO, item, material, trace...">
      <label class="gap-2"><input type="checkbox" id="select-all-inventory"> Selecionar visiveis</label>
    </div>
    <div class="inventory-modal-table-wrap">
      <table class="data-table inventory-modal-table">
        <thead>
          <tr>
            <th></th><th>Trace</th><th>Categoria</th><th>PO / Item</th><th>Material</th><th>Descricao</th><th>Thk (mm)</th><th>Dia. (OD) (mm)</th><th>Width (mm)</th><th>Compr.</th><th>Heat</th><th>Status</th>
          </tr>
        </thead>
        <tbody id="inventory-table-body"></tbody>
      </table>
    </div>`;

  activeModal = body;
  const modal = openModal({
    title: 'Inventario Material (IndexedDB)',
    body,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Adicionar ao Estoque',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: () => {
          const selectedItems = inventoryItems.filter((item) => selectedTraces.has(item.trace));
          if (!selectedItems.length) {
            showToast('Selecione pelo menos um material.', 'error');
            return;
          }
          selectedItems.forEach((item) => onAddToStock?.(mapInventoryItemToStockRow(item)));
          showToast(`${selectedItems.length} material(is) adicionado(s) ao estoque.`, 'success');
          closeModal();
        },
      },
    ],
  });
  const fileLabelEl = body.querySelector('#inventory-file-name');
  const tableBody = body.querySelector('#inventory-table-body');
  const searchInput = body.querySelector('#inventory-search');
  const selectAllCheckbox = body.querySelector('#select-all-inventory');
  const uploadBtn = body.querySelector('#upload-inventory-btn');
  const fileInput = body.querySelector('#inventory-file-input');

  inventoryItems = await getInventoryItems();
  renderInventoryTable(tableBody, inventoryItems);
  syncSelectionState();

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importInventoryFile(file, fileLabelEl, tableBody);
    event.target.value = '';
  });

  searchInput.addEventListener('input', (event) => {
    renderInventoryTable(tableBody, inventoryItems.filter((item) => inventoryMatchesSearch(item, event.target.value)));
    syncSelectionState();
  });

  selectAllCheckbox.addEventListener('change', (event) => {
    const checked = event.target.checked;
    visibleInventoryItems.forEach((item) => {
      if (!item.trace) return;
      if (checked) selectedTraces.add(item.trace);
      else selectedTraces.delete(item.trace);
    });
    syncSelectionState();
  });

  tableBody.addEventListener('change', (event) => {
    if (!event.target.matches('.inventory-checkbox')) return;
    const trace = event.target.dataset.trace;
    if (event.target.checked) selectedTraces.add(trace);
    else selectedTraces.delete(trace);
    syncSelectionState();
  });
}
