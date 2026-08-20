import { openEntityListModal } from './entityListModal.js';

export function showLoadPlanModal(plansSource, { onLoad, onDelete }) {
  const source = typeof plansSource === 'function'
    ? plansSource
    : () => Promise.resolve(plansSource);
  const loadPlans = async () => (await source() || []).map((item) => ({ ...item, name: item.name || item.number || '' }));

  openEntityListModal({
    title: 'Cutting Sheets em rascunho',
    loadItems: loadPlans,
    searchFields: ['name', 'number', 'planning.projectData.project', 'planning.projectData.client', 'planning.projectData.equipment'],
    renderCardMeta: (plan) => {
      const p = plan.planning?.projectData || {};
      return `Projeto: ${p.project || 'N/A'} - Equipamento: ${p.equipment || 'N/A'} - Cliente: ${p.client || 'N/A'}`;
    },
    onLoad: (plan) => onLoad(plan.id),
    onDelete: (plan) => onDelete(plan.id),
    emptyMessage: 'Nenhum Cutting Sheet em rascunho.',
  });
}
