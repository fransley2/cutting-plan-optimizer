import { openModal } from './modal.js';
import { PIMACO_LABEL_TEMPLATES } from '../reports/labels.js';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

export function openPieceLabelTemplateModal({ labelCount = 0, onSelect } = {}) {
  const body = node('div', 'piece-label-template-modal');
  const intro = node('p', 'text-muted', 'Selecione o código da folha carregada na impressora. O layout usa as medidas reais do template.');
  const list = node('div', 'piece-label-template-list');
  let selectedId = PIMACO_LABEL_TEMPLATES.find((template) => template.recommended)?.id || PIMACO_LABEL_TEMPLATES[0].id;

  PIMACO_LABEL_TEMPLATES.forEach((template) => {
    const option = node('label', 'piece-label-template-option');
    const radio = node('input');
    radio.type = 'radio';
    radio.name = 'pieceLabelTemplate';
    radio.value = template.id;
    radio.checked = template.id === selectedId;
    radio.addEventListener('change', () => { selectedId = template.id; });
    const content = node('span', 'piece-label-template-copy');
    const title = node('strong', null, template.name);
    const code = node('span', 'piece-label-template-code', template.code);
    const details = node('small', 'text-muted', `${template.labelWidthMm} × ${template.labelHeightMm} mm · ${template.columns} col. × ${template.rows} linhas · ${Math.ceil(labelCount / (template.columns * template.rows)) || 0} folha(s)`);
    content.append(title, code, details);
    if (template.recommended) content.append(node('em', 'piece-label-template-badge', 'Recomendado para rastreabilidade completa'));
    option.append(radio, content);
    list.append(option);
  });

  const note = node('div', 'piece-label-print-note');
  note.append(node('strong', null, 'Configuração da impressora'), node('span', null, 'Use escala 100% / Tamanho real e margens Nenhuma. Desative “Ajustar à página”.'));
  body.append(intro, list, note);

  openModal({
    title: 'Template da etiqueta Pimaco',
    body,
    wide: true,
    buttons: [
      { label: 'Cancelar' },
      { label: `Imprimir ${labelCount} etiqueta(s)`, variant: 'btn-primary', onClick: () => onSelect?.(selectedId) },
    ],
  });
}
