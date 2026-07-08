function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calculateUtilizationFromSolution(solution) {
  if (!solution) return null;
  const totalStockLength = numberOrNull(solution.totalStockLength);
  const totalRemaining = numberOrNull(solution.totalRemaining) ?? 0;
  const totalTrims = numberOrNull(solution.totalTrims) ?? 0;
  if (!totalStockLength || totalStockLength <= 0) return null;
  return ((totalStockLength - totalRemaining - totalTrims) / totalStockLength) * 100;
}

function formatRelativeDate(value, now = new Date()) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return 'Agora';
  if (diffMinutes < 60) return `Ha ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Ha ${diffHours} hora${diffHours === 1 ? '' : 's'}`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Ha ${diffDays} dias`;

  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function projectLabel(plan) {
  const project = plan.projectData?.project || 'Sem projeto';
  const client = plan.projectData?.client;
  return client ? `${project} / ${client}` : project;
}

function utilizationTone(utilization) {
  if (utilization === null) return 'neutral';
  return utilization >= 60 ? 'ok' : 'warning';
}

export function formatRecentPlans(plans, now = new Date()) {
  return [...(plans || [])]
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))
    .map((plan) => {
      const utilization = calculateUtilizationFromSolution(plan.solutionSummary || plan.solution);
      return {
        name: plan.name,
        modified: formatRelativeDate(plan.savedAt, now),
        projectClient: projectLabel(plan),
        utilization,
        utilizationLabel: utilization === null ? 'Sem calculo' : `${utilization.toFixed(1)}%`,
        utilizationTone: utilizationTone(utilization),
      };
    });
}

export function buildPlanKpis(plans) {
  const recentPlans = formatRecentPlans(plans);
  const withUtilization = recentPlans.filter(plan => plan.utilization !== null);
  const averageUtilization = withUtilization.length
    ? withUtilization.reduce((sum, plan) => sum + plan.utilization, 0) / withUtilization.length
    : null;

  return {
    totalPlans: recentPlans.length,
    calculatedPlans: withUtilization.length,
    averageUtilization,
  };
}
