import { openEntityListModal } from './entityListModal.js';

export function showLoadPlanModal(plansSource, { onLoad, onDelete }) {
  const loadPlans = typeof plansSource === 'function'
    ? plansSource
    : () => Promise.resolve(plansSource);

  openEntityListModal({
    title: 'Planos Salvos',
    loadItems: loadPlans,
    searchFields: ['name', 'projectData.project', 'projectData.client', 'projectData.equipment'],
    renderCardMeta: (plan) => {
      const p = plan.projectData || {};
      return `Projeto: ${p.project || 'N/A'} - Equipamento: ${p.equipment || 'N/A'} - Cliente: ${p.client || 'N/A'}`;
    },
    onLoad: (plan) => onLoad(plan.name),
    onDelete: (plan) => onDelete(plan.name),
    emptyMessage: 'Nenhum plano salvo ainda.',
  });
}
