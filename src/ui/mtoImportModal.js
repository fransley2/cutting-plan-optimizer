import { parseMtoFile } from '../data/mtoImport.js';
import { saveMtoImport } from '../data/mtoDB.js';
import { openModal, closeModal } from './modal.js';
import { showToast } from './toast.js';

function el(tagName, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function td(value, className = '') {
  const cell = el('td', className);
  cell.textContent = value == null ? '' : String(value);
  return cell;
}

function renderSummary(container, file, parsed) {
  container.replaceChildren();
  const items = [
    ['Arquivo', file?.name || '-'],
    ['Total', parsed?.batch?.rowCount || 0],
    ['Aceitas', parsed?.batch?.acceptedCount || 0],
    ['Rejeitadas', parsed?.batch?.rejectedCount || 0],
  ];
  items.forEach(([label, value]) => {
    const card = el('div', 'mto-import-summary-card');
    const labelEl = el('span');
    labelEl.textContent = label;
    const valueEl = el('strong');
    valueEl.textContent = value;
    card.append(labelEl, valueEl);
    container.appendChild(card);
  });
}

function renderPreview(tbody, items) {
  tbody.replaceChildren();
  if (!items.length) {
    const row = document.createElement('tr');
    const cell = td('Selecione um arquivo MTO para visualizar os itens.');
    cell.colSpan = 13;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  items.slice(0, 100).forEach((item) => {
    const row = document.createElement('tr');
    const rejected = item.validationErrors.length > 0;
    row.className = rejected ? 'mto-import-row-rejected' : '';
    row.append(
      td(rejected ? 'Rejected' : 'Accepted'),
      td(item.drawing),
      td(item.revision),
      td(item.mark),
      td(item.pos),
      td(item.qty),
      td(item.description),
      td(item.cutLength),
      td(item.identCode),
      td(item.material),
      td(item.type),
      td(item.discipline),
      td(item.validationErrors.join('; '), 'mto-import-errors')
    );
    tbody.appendChild(row);
  });
}

function buildPreviewTable() {
  const wrap = el('div', 'table-wrap mto-import-table-wrap');
  const table = el('table', 'data-table mto-import-table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  [
    'Status',
    'Drawing',
    'Rev',
    'Mark',
    'POS',
    'Qty',
    'Description',
    'Length/mm',
    'IdentCode',
    'Material',
    'Type',
    'Discipline',
    'Errors',
  ].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  wrap.appendChild(table);
  return { wrap, tbody };
}

export function openMtoImportModal(options = {}) {
  let parsed = null;
  let selectedFile = null;

  const body = el('div', 'mto-import-modal');
  const controls = el('div', 'mto-import-controls');
  const selectButton = el('button', 'btn btn-secondary');
  selectButton.type = 'button';
  selectButton.textContent = 'Selecionar arquivo MTO';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,.xls,.xlsx';
  fileInput.className = 'hidden';
  const fileName = el('span', 'text-muted');
  fileName.textContent = 'Nenhum arquivo selecionado.';
  controls.append(selectButton, fileName, fileInput);

  const summary = el('div', 'mto-import-summary');
  renderSummary(summary, null, null);

  const { wrap, tbody } = buildPreviewTable();
  renderPreview(tbody, []);

  body.append(controls, summary, wrap);

  selectButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      selectedFile = file;
      parsed = await parseMtoFile(file, {
        projectId: options.projectId || '',
      });
      fileName.textContent = file.name;
      renderSummary(summary, file, parsed);
      renderPreview(tbody, parsed.items);
    } catch (error) {
      console.error(error);
      showToast('Falha ao ler o arquivo MTO.', 'error');
    } finally {
      fileInput.value = '';
    }
  });

  openModal({
    title: 'Importar MTO',
    body,
    wide: true,
    buttons: [
      { label: 'Cancelar', variant: 'btn-ghost' },
      {
        label: 'Import MTO',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          if (!parsed || !selectedFile) {
            showToast('Selecione um arquivo MTO antes de importar.', 'error');
            return;
          }
          try {
            const result = await saveMtoImport({
              batch: {
                projectId: options.projectId || '',
                fileName: selectedFile.name,
                importedBy: options.importedBy || '',
                rowCount: parsed.batch.rowCount,
                acceptedCount: parsed.batch.acceptedCount,
                rejectedCount: parsed.batch.rejectedCount,
                metadata: {
                  file: parsed.file,
                },
              },
              items: parsed.items,
            });
            await options.onImported?.(result);
            showToast(`MTO importado: ${result.items.length} item(ns).`, 'success');
            closeModal();
          } catch (error) {
            console.error(error);
            showToast('Falha ao salvar o MTO.', 'error');
          }
        },
      },
    ],
  });
}
