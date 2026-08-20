function text(value) {
  return value == null ? '' : String(value).trim();
}

function identity(value) {
  return text(value).toLocaleUpperCase();
}

export function projectAliases(project = {}) {
  return [...new Set([project.id, project.name, project.project, project.projectName, project.code, project.shortCode]
    .map(text).filter(Boolean))];
}

export function resolveProject(projects = [], reference = '') {
  const expected = identity(reference);
  if (!expected) return null;
  return (Array.isArray(projects) ? projects : []).find((project) => (
    projectAliases(project).some((alias) => identity(alias) === expected)
  )) || null;
}

export function resolveProjectId(projects = [], reference = '') {
  return text(resolveProject(projects, reference)?.id);
}

export function projectDisplayName(projects = [], reference = '') {
  const project = resolveProject(projects, reference);
  return text(project?.name || project?.project || project?.projectName || reference);
}

export function canonicalizeProjectRecord(record = {}, projects = []) {
  if (!record || typeof record !== 'object') return { record, changed: false, unresolved: '' };
  const reference = text(record.projectId || record.project || record.projectName
    || record.projectData?.projectId || record.projectData?.project || record.projectData?.projectName);
  if (!reference) return { record, changed: false, unresolved: '' };
  const projectId = resolveProjectId(projects, reference);
  if (!projectId) return { record, changed: false, unresolved: reference };
  const projectData = record.projectData && typeof record.projectData === 'object'
    ? { ...record.projectData, projectId }
    : record.projectData;
  const changed = record.projectId !== projectId || (projectData && record.projectData?.projectId !== projectId);
  return {
    record: changed ? { ...record, projectId, ...(projectData ? { projectData } : {}) } : record,
    changed,
    unresolved: '',
  };
}
