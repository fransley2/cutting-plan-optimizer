import { suggestWorkpackMaterials } from '../core/workpackQuickCreate.js';
import { openModal, closeModal } from './modal.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function node(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue != null) element.textContent = textValue;
  return element;
}

function mtoProject(item = {}) {
  return text(item.projectId);
}

function sameText(left, right) {
  return text(left).toLocaleUpperCase() === text(right).toLocaleUpperCase();
}

function mtoLabel(item = {}) {
  return [
    item.drawing || item.drawingNo || '—',
    item.mark || item.clientTag || '—',
    item.pos || item.position || '—',
    `${Number(item.cutLength || item.length || 0)} mm × ${Number(item.qty || item.quantity || 1)}`,
    item.material || item.materialGrade || '—',
  ].join(' · ');
}

function equipmentLabel(item = {}) {
  return [item.code, item.name || item.equipmentName].filter(Boolean).join(' - ') || text(item.id);
}

function createField(labelText, control) {
  const field = node('label', 'field');
  field.append(node('span', null, labelText), control);
  return field;
}

function createSelect(options, value = '') {
  const select = document.createElement('select');
  select.className = 'input';
  options.forEach(({ value: optionValue, label }) => {
    const option = new Option(label, optionValue);
    option.selected = optionValue === value;
    select.append(option);
  });
  return select;
}

function formatLength(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('pt-BR')} mm`;
}

export function openWorkpackQuickCreateModal({
  selectedMtoItems = [],
  allMtoItems = [],
  inventoryItems = [],
  projects = [],
  equipments = [],
  defaultProjectId = '',
  onCreate,
  showToast,
} = {}) {
  const initialItems = selectedMtoItems.filter((item) => item?.id);
  if (!initialItems.length) {
    showToast?.('Selecione pelo menos uma linha MTO válida.', 'error');
    return;
  }

  const mtoById = new Map([...allMtoItems, ...initialItems]
    .filter((item) => item?.id)
    .map((item) => [item.id, item]));
  const selectedMtoIds = new Set(initialItems.map((item) => item.id));
  const projectValue = (project = {}) => text(project.id || project.name);
  const projectKeys = (project = {}) => [project.name, project.id].map(text).filter(Boolean);
  const resolveProjectValue = (value) => projectValue(projects.find((project) => projectKeys(project).some((key) => sameText(key, value))) || {});
  const initialProjectId = resolveProjectValue(mtoProject(initialItems[0]) || defaultProjectId) || text(defaultProjectId);
  const body = node('div', 'quick-workpack-modal');
  const form = node('div', 'quick-workpack-form');
  const status = node('p', 'quick-workpack-status text-muted');
  const projectSelect = createSelect([
    { value: '', label: 'Selecione um projeto' },
    ...projects.map((project) => ({ value: projectValue(project), label: text(project.name || project.id) })),
  ], initialProjectId);
  const equipmentSelect = createSelect([{ value: '', label: 'Selecione um equipamento' }]);
  const wpNo = document.createElement('input');
  wpNo.className = 'input';
  wpNo.type = 'text';
  wpNo.placeholder = 'Ex.: WP-001';
  const title = document.createElement('input');
  title.className = 'input';
  title.type = 'text';
  title.placeholder = 'Ex.: Corte de spools';
  form.append(
    createField('Projeto *', projectSelect),
    createField('Equipamento *', equipmentSelect),
    createField('WP No *', wpNo),
    createField('Título', title),
  );

  const piecesSection = node('section', 'quick-workpack-section');
  piecesSection.append(node('h3', null, 'Peças MTO'));
  const piecesToolbar = node('div', 'quick-workpack-actions');
  const selectVisible = node('button', 'btn btn-secondary', 'Selecionar visíveis');
  selectVisible.type = 'button';
  const clearPieces = node('button', 'btn btn-ghost', 'Limpar seleção');
  clearPieces.type = 'button';
  piecesToolbar.append(selectVisible, clearPieces);
  const piecesList = node('div', 'quick-workpack-list');
  const piecesSummary = node('p', 'text-muted');
  piecesSection.append(piecesToolbar, piecesSummary, piecesList);

  const materialsSection = node('section', 'quick-workpack-section');
  materialsSection.append(node('h3', null, 'Materiais sugeridos'));
  const materialNotice = node('p', 'text-muted', 'Sugestão apenas: materiais vinculados ao Workpack não são reservados ou consumidos. Retalhos disponíveis são priorizados.');
  const materialsList = node('div', 'quick-workpack-materials');
  materialsSection.append(materialNotice, materialsList);
  body.append(form, status, piecesSection, materialsSection);

  let selectedInventoryIds = new Set();

  function selectedPieces() {
    return [...selectedMtoIds].map((id) => mtoById.get(id)).filter(Boolean);
  }

  function mtoMatchesProject(item, projectId) {
    const itemProject = mtoProject(item);
    if (!itemProject) return selectedMtoIds.has(item.id);
    const project = projects.find((candidate) => sameText(projectValue(candidate), projectId));
    return project ? projectKeys(project).some((key) => sameText(key, itemProject)) : sameText(itemProject, projectId);
  }

  function refreshEquipments() {
    const projectId = projectSelect.value;
    const current = equipmentSelect.value;
    equipmentSelect.replaceChildren(new Option('Selecione um equipamento', ''));
    equipments
      .filter((equipment) => !projectId || sameText(equipment.projectId, projectId))
      .forEach((equipment) => equipmentSelect.append(new Option(equipmentLabel(equipment), equipment.id)));
    if ([...equipmentSelect.options].some((option) => option.value === current)) equipmentSelect.value = current;
    const inferred = [...new Set(selectedPieces().map((item) => text(item.equipmentId)).filter(Boolean))];
    if (inferred.length === 1 && [...equipmentSelect.options].some((option) => option.value === inferred[0])) {
      equipmentSelect.value = inferred[0];
    }
  }

  function visiblePieces() {
    const projectId = projectSelect.value;
    return [...mtoById.values()].filter((item) => !projectId || mtoMatchesProject(item, projectId));
  }

  function renderMaterials() {
    const suggestions = suggestWorkpackMaterials(selectedPieces(), inventoryItems);
    const candidateIds = new Set(suggestions.flatMap((group) => group.candidates.map((candidate) => candidate.id)));
    if (!selectedInventoryIds.size) selectedInventoryIds = new Set(suggestions.flatMap((group) => group.suggestedIds));
    else selectedInventoryIds = new Set([...selectedInventoryIds].filter((id) => candidateIds.has(id)));
    materialsList.replaceChildren();
    if (!suggestions.length) {
      materialsList.append(node('p', 'text-muted', 'Selecione peças MTO para receber sugestões de material.'));
      return;
    }
    suggestions.forEach((group) => {
      const groupEl = node('section', 'quick-workpack-material-group');
      groupEl.append(node('h4', null, group.material));
      groupEl.append(node('p', 'text-muted', `Necessário com margem: ${formatLength(group.requiredLength)}.`));
      if (group.remainingLength > 0) groupEl.append(node('p', 'text-critical', `Estoque insuficiente: faltam ${formatLength(group.remainingLength)}.`));
      if (!group.candidates.length) {
        groupEl.append(node('p', 'text-muted', 'Nenhum material disponível compatível.'));
      } else {
        const list = node('div', 'quick-workpack-list');
        group.candidates.forEach((candidate) => {
          const label = node('label', `quick-workpack-material${candidate.kind === 'OFFCUT' ? ' is-offcut' : ''}`);
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = selectedInventoryIds.has(candidate.id);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedInventoryIds.add(candidate.id);
            else selectedInventoryIds.delete(candidate.id);
          });
          const kind = candidate.kind === 'OFFCUT' ? 'Retalho' : 'Barra nova';
          label.append(checkbox, node('span', null, `${kind} · ${candidate.id} · ${formatLength(candidate.length)} × ${candidate.balance}`));
          list.append(label);
        });
        groupEl.append(list);
      }
      materialsList.append(groupEl);
    });
  }

  function renderPieces() {
    const availablePieces = visiblePieces();
    piecesList.replaceChildren();
    availablePieces.forEach((item) => {
      const label = node('label', `quick-workpack-piece${selectedMtoIds.has(item.id) ? ' is-selected' : ''}`);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedMtoIds.has(item.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedMtoIds.add(item.id);
        else selectedMtoIds.delete(item.id);
        renderPieces();
        renderMaterials();
      });
      label.append(checkbox, node('span', null, mtoLabel(item)));
      piecesList.append(label);
    });
    piecesSummary.textContent = `${selectedPieces().length} peça(s) selecionada(s). Desmarque e marque outras linhas para trocar toda ou parte da seleção.`;
  }

  selectVisible.addEventListener('click', () => {
    visiblePieces().forEach((item) => selectedMtoIds.add(item.id));
    renderPieces();
    renderMaterials();
  });
  clearPieces.addEventListener('click', () => {
    selectedMtoIds.clear();
    renderPieces();
    renderMaterials();
  });
  projectSelect.addEventListener('change', () => {
    refreshEquipments();
    renderPieces();
    renderMaterials();
  });
  refreshEquipments();
  renderPieces();
  renderMaterials();

  openModal({
    title: 'Criar Workpack a partir da MTO',
    body,
    wide: true,
    buttons: [
      { label: 'Cancelar' },
      {
        label: 'Criar Workpack',
        variant: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          const pieces = selectedPieces();
          const projectId = text(projectSelect.value);
          const equipmentId = text(equipmentSelect.value);
          if (!pieces.length) { status.textContent = 'Selecione pelo menos uma peça MTO.'; return; }
          if (!projectId || pieces.some((item) => mtoProject(item) && !mtoMatchesProject(item, projectId))) { status.textContent = 'Todas as peças com projeto informado devem pertencer ao projeto escolhido.'; return; }
          if (!equipmentId) { status.textContent = 'Selecione o equipamento do Workpack.'; return; }
          if (!text(wpNo.value)) { status.textContent = 'WP No é obrigatório.'; return; }
          status.textContent = '';
          try {
            const created = await onCreate?.({
              projectId,
              equipmentId,
              wpNo: text(wpNo.value),
              title: text(title.value),
              workpackType: 'CUTTING',
              sourceType: 'MTO_LINES',
              status: 'PLANNED',
              priority: 'NORMAL',
              mtoItemIds: pieces.map((item) => item.id),
              inventoryItemIds: [...selectedInventoryIds],
            });
            if (!created) { status.textContent = 'Não foi possível criar o Workpack. Revise os campos obrigatórios e o número do WP.'; return; }
            closeModal();
          } catch (error) {
            status.textContent = error?.message || 'Não foi possível criar o Workpack.';
          }
        },
      },
    ],
  });
}
