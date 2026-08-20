import assert from 'node:assert/strict';
import {
  buildProjectReferenceIssues,
  filterProjectReferenceIssues,
  inspectProjectRecord,
  summarizeProjectReferenceIssues,
} from '../src/core/projectDataQuality.js';

const projects = [
  { id: 'project-1', name: 'B58', code: 'B58-FAB', shortCode: 'B58' },
  { id: 'project-2', name: 'RAIA', code: 'RAIA-FAB', shortCode: 'RAIA' },
];

assert.equal(inspectProjectRecord('workpacks', { id: 'wp-1', projectId: 'project-1' }, projects), null);

const legacy = inspectProjectRecord('workpacks', { id: 'wp-2', wpNo: 'WP-002', projectId: 'B58' }, projects);
assert.equal(legacy.issueType, 'LEGACY_PROJECT_ALIAS');
assert.equal(legacy.suggestedProjectId, 'project-1');

const unresolved = inspectProjectRecord('inventory', { trace: 'MAT-01', projectId: 'UNKNOWN' }, projects);
assert.equal(unresolved.issueType, 'UNRESOLVED_PROJECT');
assert.equal(unresolved.suggestedProjectId, '');

const conflict = inspectProjectRecord('plans', {
  name: 'Plan 1', projectId: 'project-1', projectData: { projectId: 'project-2', project: 'RAIA' },
}, projects);
assert.equal(conflict.issueType, 'PROJECT_CONFLICT');

const issues = buildProjectReferenceIssues({
  workpacks: [{ id: 'wp-1', projectId: 'project-1' }, { id: 'wp-2', projectId: 'B58' }],
  inventory: [{ trace: 'MAT-01', projectId: 'UNKNOWN' }],
  plans: [{ name: 'Plan 1', projectId: 'project-1', projectData: { projectId: 'project-2' } }],
}, projects);
assert.equal(issues.length, 3);
assert.equal(filterProjectReferenceIssues(issues, { storeName: 'inventory' }).length, 1);
assert.equal(filterProjectReferenceIssues(issues, { search: 'wp-2' }).length, 1);
assert.deepEqual(summarizeProjectReferenceIssues(issues), {
  total: 3,
  unresolved: 1,
  legacyAliases: 1,
  conflicts: 1,
  affectedStores: 3,
});

console.log('project data quality tests passed');
