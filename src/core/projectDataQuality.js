import { resolveProject, resolveProjectId } from './projectIdentity.js';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function recordId(record = {}) {
  return text(record.id || record.trace || record.name || record.number || record.code);
}

function recordLabel(record = {}) {
  return text(record.number || record.wpNo || record.drawingNo || record.code || record.traceability || record.trace || record.name || record.id);
}

function topReference(record = {}) {
  return text(record.projectId || record.project || record.projectName);
}

function nestedReference(record = {}) {
  return text(record.projectData?.projectId || record.projectData?.project || record.projectData?.projectName);
}

function issue(storeName, record, issueType, reference, suggestedProjectId = '', detail = '') {
  return {
    id: `${storeName}:${recordId(record) || reference}:${issueType}`,
    storeName,
    recordId: recordId(record),
    recordLabel: recordLabel(record),
    issueType,
    reference: text(reference),
    suggestedProjectId: text(suggestedProjectId),
    detail: text(detail),
  };
}

export function inspectProjectRecord(storeName, record = {}, projects = []) {
  const top = topReference(record);
  const nested = nestedReference(record);
  const reference = top || nested;
  if (!reference) return null;

  const topProject = top ? resolveProject(projects, top) : null;
  const nestedProject = nested ? resolveProject(projects, nested) : null;
  if (top && nested && topProject && nestedProject && topProject.id !== nestedProject.id) {
    return issue(storeName, record, 'PROJECT_CONFLICT', `${top} / ${nested}`, '', 'Top-level and nested Project references resolve to different projects.');
  }

  const projectId = resolveProjectId(projects, reference);
  if (!projectId) {
    const nestedSuggestion = nestedProject?.id || '';
    return issue(storeName, record, 'UNRESOLVED_PROJECT', reference, nestedSuggestion, 'Project reference does not match any registered Project ID, name, code or short code.');
  }

  const nestedNeedsId = record.projectData && nested && record.projectData.projectId !== projectId;
  if (record.projectId !== projectId || nestedNeedsId) {
    return issue(storeName, record, 'LEGACY_PROJECT_ALIAS', reference, projectId, 'Reference can be replaced automatically with the stable Project ID.');
  }
  return null;
}

export function buildProjectReferenceIssues(recordsByStore = {}, projects = []) {
  return Object.entries(recordsByStore || {}).flatMap(([storeName, records]) => (
    (Array.isArray(records) ? records : [])
      .map((record) => inspectProjectRecord(storeName, record, projects))
      .filter(Boolean)
  )).sort((left, right) => left.storeName.localeCompare(right.storeName)
    || left.recordLabel.localeCompare(right.recordLabel));
}

export function filterProjectReferenceIssues(issues = [], filters = {}) {
  const query = text(filters.search).toLocaleLowerCase();
  return (Array.isArray(issues) ? issues : []).filter((item) => {
    if (filters.storeName && item.storeName !== filters.storeName) return false;
    if (filters.issueType && item.issueType !== filters.issueType) return false;
    if (!query) return true;
    return [item.storeName, item.recordId, item.recordLabel, item.reference, item.suggestedProjectId, item.detail]
      .join(' ').toLocaleLowerCase().includes(query);
  });
}

export function summarizeProjectReferenceIssues(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  return {
    total: list.length,
    unresolved: list.filter((item) => item.issueType === 'UNRESOLVED_PROJECT').length,
    legacyAliases: list.filter((item) => item.issueType === 'LEGACY_PROJECT_ALIAS').length,
    conflicts: list.filter((item) => item.issueType === 'PROJECT_CONFLICT').length,
    affectedStores: new Set(list.map((item) => item.storeName)).size,
  };
}
