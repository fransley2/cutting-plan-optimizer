// Tabela editável reutilizável. No arquivo original, "Available Stock" e
// "Required Parts" tinham ~80 linhas cada de HTML quase idêntico
// (createStockRow / createPartRow), só variando as colunas.
// Aqui isso vira UMA implementação + duas listas de configuração (colunas).
//
// Uso:
//   const stockTable = createDataTable(tbody, STOCK_COLUMNS);
//   stockTable.addRow({ po: 'PO123', length: 6000, ... });
//   stockTable.getRows() -> [{ po, item, qty, length, ... }]

export function createDataTable(tbody, columns) {

  function parseNumberInput(rawValue, col) {
    const parsedValue = col.isInt ? parseInt(rawValue, 10) : parseFloat(rawValue);
    return {
      parsedValue,
      valid: Number.isFinite(parsedValue) && parsedValue > 0,
    };
  }

  function syncNumberInputValidation(input, col) {
    const { valid } = parseNumberInput(input.value, col);
    input.classList.toggle('input-error', !valid);
    return valid;
  }

  function buildCell(col, value) {
    if (col.type === 'select') {
      const opts = col.options.map(o => `<option value="${o.value}" ${String(o.value) === String(value ?? col.default) ? 'selected' : ''}>${o.label}</option>`).join('');
      return `<select data-key="${col.key}">${opts}</select>`;
    }
    const inputType = col.type === 'number' ? 'number' : 'text';
    const min = col.type === 'number' ? 'min="0"' : '';
    const list = col.list ? `list="${col.list}"` : '';
    return `<input type="${inputType}" data-key="${col.key}" value="${value ?? col.default ?? ''}" ${min} ${list} style="${col.width ? `width:${col.width}` : ''}">`;
  }

  function addRow(data = {}) {
    const tr = document.createElement('tr');
    const cells = columns.map(col => `<td>${buildCell(col, data[col.key])}</td>`).join('');
    tr.innerHTML = `${cells}<td class="row-actions">
        <button class="btn-copy" title="Duplicar linha">⧉</button>
        <button class="btn-remove" title="Excluir linha">✕</button>
      </td>`;
    columns.filter(col => col.type === 'number').forEach(col => {
      const input = tr.querySelector(`[data-key="${col.key}"]`);
      input?.addEventListener('blur', () => syncNumberInputValidation(input, col));
    });
    tbody.appendChild(tr);
    return tr;
  }

  function readRow(tr, { validate = true } = {}) {
    const row = {};
    let valid = true;
    columns.forEach(col => {
      const el = tr.querySelector(`[data-key="${col.key}"]`);
      const rawValue = el.value;
      let value = rawValue;
      if (col.type === 'number') {
        const { parsedValue, valid: numericValid } = parseNumberInput(rawValue, col);
        if (!numericValid) {
          if (validate) {
            el.classList.add('input-error');
            valid = false;
          }
          value = rawValue === '' ? '' : rawValue;
        } else {
          value = parsedValue;
          if (validate) el.classList.remove('input-error');
        }
      }
      row[col.key] = value;
    });
    row.__valid = valid;
    return row;
  }

  // Expande cada linha em N itens conforme a coluna `qty` (mesma regra do original:
  // uma peça/barra com Qty=3 vira 3 unidades individuais para o algoritmo de alocação).
  function getRows({ expandQty = true, includeInvalid = false } = {}) {
    const result = [];
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      const row = readRow(tr, { validate: !includeInvalid });
      if (!includeInvalid && !row.__valid) return;
      const { __valid, ...cleanRow } = row;
      if (!expandQty) {
        result.push(cleanRow);
        return;
      }
      const qty = Number.isFinite(Number(cleanRow.qty)) && Number(cleanRow.qty) > 0 ? Number(cleanRow.qty) : 1;
      for (let i = 0; i < qty; i++) result.push({ ...cleanRow });
    });
    return result;
  }

  function validate() {
    let allValid = true;
    [...tbody.querySelectorAll('tr')].forEach(tr => { if (!readRow(tr).__valid) allValid = false; });
    return allValid;
  }

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (btn.classList.contains('btn-remove')) tr.remove();
    if (btn.classList.contains('btn-copy')) {
      const data = readRow(tr);
      tr.insertAdjacentElement('afterend', addRow(data) && tr.nextElementSibling);
    }
  });

  // Colar de planilha (Excel/Sheets): tab-separated, expande linhas conforme necessário.
  tbody.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();

    const active = document.activeElement;
    if (!tbody.contains(active)) return;
    const startRow = active.closest('tr');
    const startColIndex = columns.findIndex(c => c.key === active.dataset.key);

    const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
    let currentRow = startRow;
    rows.forEach((rowStr, rowIdx) => {
      if (!currentRow) return;
      rowStr.split('\t').forEach((cellStr, cellIdx) => {
        const col = columns[startColIndex + cellIdx];
        if (!col) return;
        const input = currentRow.querySelector(`[data-key="${col.key}"]`);
        if (input) {
          input.value = cellStr.trim();
          if (col.type === 'number') syncNumberInputValidation(input, col);
        }
      });
      if (rowIdx < rows.length - 1) {
        currentRow = currentRow.nextElementSibling || addRow();
      }
    });
  });

  return { addRow, getRows, validate, tbody };
}
