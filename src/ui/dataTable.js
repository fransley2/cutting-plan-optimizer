// Tabela editável reutilizável para o Planner. Mantém a edição inline,
// duplicação, exclusão e colagem tabular sem interpolar valores no HTML.

export function createDataTable(tbody, columns, options = {}) {
  function configureColumnWidths() {
    const table = tbody.closest('table');
    if (!table) return;
    table.querySelector(':scope > colgroup.planner-column-widths')?.remove();

    const colgroup = document.createElement('colgroup');
    colgroup.className = 'planner-column-widths';
    columns.forEach((column) => {
      const col = document.createElement('col');
      if (column.width) col.style.width = column.width;
      colgroup.append(col);
    });
    const actionsCol = document.createElement('col');
    actionsCol.style.width = options.enableSobremetal ? '108px' : '72px';
    colgroup.append(actionsCol);
    table.insertBefore(colgroup, table.firstChild);
  }

  configureColumnWidths();

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

  function createEditor(col, value) {
    const editor = document.createElement(col.type === 'select' ? 'select' : 'input');
    editor.dataset.key = col.key;
    editor.classList.add('planner-cell-editor');
    if (col.type === 'number') editor.classList.add('planner-cell-editor--number');

    if (col.type === 'select') {
      const selectedValue = String(value ?? col.default ?? '');
      col.options.forEach((optionData) => {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label;
        option.selected = String(optionData.value) === selectedValue;
        editor.append(option);
      });
      return editor;
    }

    editor.type = col.type === 'number' ? 'number' : 'text';
    editor.value = value ?? col.default ?? '';
    if (col.type === 'number') editor.min = '0';
    if (col.list) editor.setAttribute('list', col.list);
    return editor;
  }

  function createActionButton(className, icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `planner-row-action ${className}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    const symbol = document.createElement('span');
    symbol.className = 'material-symbols-outlined';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = icon;
    button.append(symbol);
    return button;
  }

  function setSobremetalState(tr, input = {}, { notify = false } = {}) {
    const hasSobremetal = input.hasSobremetal === true;
    const entered = Number(input.sobremetalMm);
    const sobremetalMm = hasSobremetal && Number.isFinite(entered) && entered >= 0 ? entered : (hasSobremetal ? 500 : 0);
    tr.dataset.hasSobremetal = String(hasSobremetal);
    tr.dataset.sobremetalMm = String(sobremetalMm);
    const action = tr.querySelector('.btn-sobremetal');
    if (action) {
      action.classList.toggle('active', hasSobremetal);
      action.title = hasSobremetal ? `Sobremetal: ${sobremetalMm} mm` : 'Configurar sobremetal';
      action.setAttribute('aria-label', action.title);
    }
    if (notify) tr.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function addRow(data = {}) {
    const tr = document.createElement('tr');
    tr.className = 'planner-data-row';
    columns.forEach((col) => {
      const td = document.createElement('td');
      td.dataset.column = col.key;
      if (col.align === 'end' || col.type === 'number') td.classList.add('planner-cell--number');
      const editor = createEditor(col, data[col.key]);
      if (col.type === 'number') editor.addEventListener('blur', () => syncNumberInputValidation(editor, col));
      td.append(editor);
      tr.append(td);
    });

    const actionsCell = document.createElement('td');
    actionsCell.className = 'row-actions planner-row-actions';
    actionsCell.append(createActionButton('btn-copy', 'content_copy', 'Duplicar linha'));
    if (options.enableSobremetal) actionsCell.append(createActionButton('btn-sobremetal', 'straighten', 'Configurar sobremetal'));
    actionsCell.append(createActionButton('btn-remove', 'delete', 'Excluir linha'));
    tr.append(actionsCell);
    if (options.enableSobremetal) setSobremetalState(tr, data);
    tbody.append(tr);
    return tr;
  }

  function readRow(tr, { validate = true } = {}) {
    const row = {};
    let valid = true;
    columns.forEach((col) => {
      const editor = tr.querySelector(`[data-key="${col.key}"]`);
      const rawValue = editor?.value ?? '';
      let value = rawValue;
      if (col.type === 'number') {
        const { parsedValue, valid: numericValid } = parseNumberInput(rawValue, col);
        if (!numericValid) {
          if (validate) {
            editor?.classList.add('input-error');
            valid = false;
          }
          value = rawValue === '' ? '' : rawValue;
        } else {
          value = parsedValue;
          if (validate) editor?.classList.remove('input-error');
        }
      }
      row[col.key] = value;
    });
    if (options.enableSobremetal) {
      row.hasSobremetal = tr.dataset.hasSobremetal === 'true';
      row.sobremetalMm = row.hasSobremetal ? Number(tr.dataset.sobremetalMm || 500) : 0;
    }
    row.__valid = valid;
    return row;
  }

  function getRows({ expandQty = true, includeInvalid = false } = {}) {
    const result = [];
    [...tbody.querySelectorAll('tr')].forEach((tr) => {
      const row = readRow(tr, { validate: !includeInvalid });
      if (!includeInvalid && !row.__valid) return;
      const { __valid, ...cleanRow } = row;
      if (!expandQty) {
        result.push(cleanRow);
        return;
      }
      const qty = Number.isFinite(Number(cleanRow.qty)) && Number(cleanRow.qty) > 0 ? Number(cleanRow.qty) : 1;
      for (let index = 0; index < qty; index += 1) result.push({ ...cleanRow });
    });
    return result;
  }

  function validate() {
    return [...tbody.querySelectorAll('tr')].every((tr) => readRow(tr).__valid);
  }

  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const tr = button.closest('tr');
    if (!tr) return;
    if (button.classList.contains('btn-remove')) tr.remove();
    if (button.classList.contains('btn-sobremetal')) {
      const { __valid, ...row } = readRow(tr, { validate: false });
      options.onConfigureSobremetal?.({
        row,
        update: (values) => setSobremetalState(tr, values, { notify: true }),
      });
    }
    if (button.classList.contains('btn-copy')) {
      const duplicate = addRow(readRow(tr));
      tr.insertAdjacentElement('afterend', duplicate);
    }
  });

  tbody.addEventListener('paste', (event) => {
    const text = (event.clipboardData || window.clipboardData).getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    const active = document.activeElement;
    if (!tbody.contains(active)) return;
    const startRow = active.closest('tr');
    const startColIndex = columns.findIndex((column) => column.key === active.dataset.key);
    if (!startRow || startColIndex < 0) return;

    event.preventDefault();
    const rows = text.split(/\r?\n/).filter((row) => row.trim() !== '');
    let currentRow = startRow;
    rows.forEach((rowText, rowIndex) => {
      rowText.split('\t').forEach((cellText, cellIndex) => {
        const column = columns[startColIndex + cellIndex];
        const editor = currentRow?.querySelector(`[data-key="${column?.key}"]`);
        if (!column || !editor) return;
        editor.value = cellText.trim();
        if (column.type === 'number') syncNumberInputValidation(editor, column);
      });
      if (rowIndex < rows.length - 1) currentRow = currentRow.nextElementSibling || addRow();
    });
  });

  return { addRow, getRows, validate, tbody };
}
