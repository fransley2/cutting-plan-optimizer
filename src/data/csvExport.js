export function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function columnDescriptor(column) {
  return typeof column === 'string' ? { key: column, label: column } : column;
}

export function buildCsv(rows = [], columns = []) {
  const descriptors = (Array.isArray(columns) ? columns : []).map(columnDescriptor);
  const header = descriptors.map((column) => csvCell(column.label)).join(',');
  const body = (Array.isArray(rows) ? rows : []).map((row) => (
    descriptors.map((column) => csvCell(row?.[column.key])).join(',')
  ));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(csv, filename) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${String(csv ?? '')}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
