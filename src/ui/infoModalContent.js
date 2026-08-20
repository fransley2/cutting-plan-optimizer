function text(value) {
  return value == null || value === '' ? '-' : String(value);
}

function createDetails(details = []) {
  const grid = document.createElement('dl');
  grid.className = 'entity-info-grid';
  details.forEach(({ label, value }) => {
    const item = document.createElement('div');
    item.className = 'entity-info-field';
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = text(value);
    item.append(term, description);
    grid.appendChild(item);
  });
  return grid;
}

function createPhoto(imageUrl, imageAlt, placeholderIcon) {
  const frame = document.createElement('div');
  frame.className = 'entity-info-photo';
  const showPlaceholder = () => {
    frame.replaceChildren();
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined entity-info-photo-placeholder';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = placeholderIcon;
    frame.appendChild(icon);
  };
  if (!imageUrl) {
    showPlaceholder();
    return frame;
  }
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = imageAlt;
  image.addEventListener('error', showPlaceholder, { once: true });
  frame.appendChild(image);
  return frame;
}

function createRelatedList(title, columns = [], rows = []) {
  const section = document.createElement('section');
  section.className = 'entity-info-related';
  const heading = document.createElement('h4');
  heading.textContent = title;
  section.appendChild(heading);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted entity-info-empty';
    empty.textContent = 'Nenhum drawing vinculado.';
    section.appendChild(empty);
    return section;
  }
  const list = document.createElement('div');
  list.className = 'entity-info-related-list';
  if (columns.length) {
    const header = document.createElement('div');
    header.className = 'entity-info-related-header';
    columns.forEach((column) => {
      const cell = document.createElement('span');
      cell.textContent = column;
      header.appendChild(cell);
    });
    list.appendChild(header);
  }
  rows.forEach(({ values, label, onClick }) => {
    const row = document.createElement('button');
    row.className = 'entity-info-related-row';
    row.type = 'button';
    row.setAttribute('aria-label', label);
    values.forEach((value) => {
      const cell = document.createElement('span');
      cell.textContent = text(value);
      row.appendChild(cell);
    });
    row.addEventListener('click', onClick);
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

export function createInfoModalContent({
  imageUrl = '',
  imageAlt = '',
  placeholderIcon = 'description',
  details = [],
  relatedTitle = '',
  relatedColumns = [],
  relatedRows = [],
} = {}) {
  const body = document.createElement('div');
  body.className = `entity-info-modal${imageUrl || imageAlt ? ' entity-info-modal-with-photo' : ''}`;
  if (imageUrl || imageAlt) body.appendChild(createPhoto(imageUrl, imageAlt, placeholderIcon));
  body.appendChild(createDetails(details));
  if (relatedTitle) body.appendChild(createRelatedList(relatedTitle, relatedColumns, relatedRows));
  return body;
}
