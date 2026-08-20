import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeProjectRecord, projectDisplayName, resolveProjectId } from '../src/core/projectIdentity.js';

const projects = [{ id: 'PRJ-UUID-1', name: 'B58 GranMorgu', code: 'B58', shortCode: 'B58' }];

test('resolves a stable Project ID from legacy project aliases', () => {
  assert.equal(resolveProjectId(projects, 'B58 GranMorgu'), 'PRJ-UUID-1');
  assert.equal(resolveProjectId(projects, 'b58'), 'PRJ-UUID-1');
  assert.equal(resolveProjectId(projects, 'PRJ-UUID-1'), 'PRJ-UUID-1');
  assert.equal(projectDisplayName(projects, 'PRJ-UUID-1'), 'B58 GranMorgu');
});

test('canonicalizes top-level and plan Project references without changing display names', () => {
  const source = { name: 'PLAN-1', projectId: 'B58', projectData: { project: 'B58 GranMorgu' } };
  const result = canonicalizeProjectRecord(source, projects);
  assert.equal(result.changed, true);
  assert.equal(result.record.projectId, 'PRJ-UUID-1');
  assert.equal(result.record.projectData.projectId, 'PRJ-UUID-1');
  assert.equal(result.record.projectData.project, 'B58 GranMorgu');
  assert.equal(source.projectId, 'B58');
});

test('reports unresolved legacy references without inventing an ID', () => {
  const result = canonicalizeProjectRecord({ id: 'X', projectId: 'UNKNOWN' }, projects);
  assert.equal(result.changed, false);
  assert.equal(result.unresolved, 'UNKNOWN');
});
