import { normalizeDocumentRegister } from '../core/documentRegister.js';
import { projectDisplayName } from '../core/projectIdentity.js';
import { t } from '../i18n/index.js';

function element(tag, className, value = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function renderRegister(records, projects = []) {
  const section = element('section', 'documents-register');
  section.appendChild(element('h2', null, 'Document Register'));
  const filters = element('div', 'filter-row');
  const search = element('input', 'input');
  search.type = 'search';
  search.placeholder = 'Search documents';
  const typeFilter = element('select', 'input');
  typeFilter.appendChild(new Option('All document types', ''));
  [...new Set(records.map((record) => record.documentType))].forEach((type) => typeFilter.appendChild(new Option(type, type)));
  const statusFilter = element('select', 'input');
  statusFilter.appendChild(new Option('All statuses', ''));
  [...new Set(records.map((record) => record.status))].forEach((status) => statusFilter.appendChild(new Option(status, status)));
  filters.append(search, typeFilter, statusFilter);
  const table = element('table', 'data-table documents-register-table');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Document Type', 'Document Number', 'Project', 'Workpack', 'Status', 'Updated', 'Source'].forEach((label) => header.appendChild(element('th', null, label)));
  head.appendChild(header);
  const body = document.createElement('tbody');
  table.append(head, body);
  const empty = element('p', 'text-muted documents-register-empty', 'No real document records found.');
  function refresh() {
    const term = search.value.trim().toLowerCase();
    const type = typeFilter.value;
    const visible = records.filter((record) => (!type || record.documentType === type)
      && (!statusFilter.value || record.status === statusFilter.value)
      && (!term || Object.values(record).join(' ').toLowerCase().includes(term)));
    const rows = visible.map((record) => {
      const row = document.createElement('tr');
      [record.documentType, record.documentNumber, projectDisplayName(projects, record.projectId) || t('Unassigned'), record.workpackId || '—', record.status, record.updatedAt || t('Invalid or missing date'), record.sourceEntityType].forEach((value) => row.appendChild(element('td', null, value)));
      return row;
    });
    body.replaceChildren(...rows);
    empty.classList.toggle('hidden', rows.length > 0);
    table.classList.toggle('hidden', rows.length === 0);
  }
  search.addEventListener('input', refresh);
  typeFilter.addEventListener('change', refresh);
  statusFilter.addEventListener('change', refresh);
  section.append(filters, empty, table);
  refresh();
  return section;
}

export async function renderDocumentsPage(container, options = {}) {
  container.replaceChildren(element('p', 'text-muted', 'Loading documents...'));
  try {
    const data = await options.loadDocuments?.() || {};
    const page = element('div', 'documents-hub');
    page.append(renderRegister(normalizeDocumentRegister(data), data.projects));
    container.replaceChildren(page);
  } catch (error) {
    console.error(error);
    container.replaceChildren(element('p', 'text-muted', 'Unable to load the Document Register.'));
  }
}
