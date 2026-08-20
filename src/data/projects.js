import { createEntityStore } from './entityStore.js';
import { projectTraceabilityCode } from '../core/materialTraceability.js';

const store = createEntityStore('projects');

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const PROJECT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  HOLD: 'HOLD',
  INACTIVE: 'INACTIVE',
});

function text(value) {
  return value == null ? '' : String(value);
}

function normalizeStatus(status) {
  const value = text(status).trim().toUpperCase();
  return Object.values(PROJECT_STATUS).includes(value) ? value : PROJECT_STATUS.ACTIVE;
}

function normalizeProject(input = {}, existing = null) {
  const shortCode = text(input.shortCode || input.projectShortCode).trim().toUpperCase();
  const explicitTraceabilityCode = text(input.traceabilityCode || input.materialTraceabilityCode || input.materialShortCode).trim().toUpperCase();
  return {
    id: text(input.id || existing?.id).trim() || createId(),
    name: text(input.name || input.project || input.projectName).trim(),
    client: text(input.client).trim(),
    code: text(input.code || input.projectCode).trim(),
    shortCode,
    traceabilityCode: explicitTraceabilityCode || projectTraceabilityCode({ ...input, shortCode }) || shortCode,
    status: normalizeStatus(input.status),
    description: text(input.description).trim(),
  };
}

export const deleteProject = store.remove;

async function persistMissingProjectId(project) {
  if (!project || project.id) return project;
  const normalized = normalizeProject(project, project);
  await store.save(normalized.name, normalized);
  return normalized;
}

export async function getAllProjects() {
  const projects = await store.getAll();
  return Promise.all(projects.map(persistMissingProjectId));
}

export async function getProject(identifier) {
  if (!identifier) return null;
  const direct = await store.get(identifier);
  if (direct) return persistMissingProjectId(direct);
  const projects = await getAllProjects();
  return projects.find((project) => project.id === identifier || project.code === identifier || project.shortCode === identifier) || null;
}

export async function saveProject(name, data = {}) {
  const current = await getProject(name);
  const record = normalizeProject({ ...(data || {}), name: data?.name || name }, current);
  if (!record.name) throw new Error('Project name is required.');
  await store.save(record.name, record);
  if (current?.name && current.name !== record.name) await store.remove(current.name);
  return getProject(record.name);
}

export async function createProject(input = {}) {
  const record = normalizeProject(input);
  if (!record.name) throw new Error('Project name is required.');
  await store.save(record.name, record);
  return getProject(record.name);
}

export async function updateProject(name, patch = {}) {
  if (!name) return null;
  const current = await getProject(name);
  if (!current) return null;
  const record = normalizeProject({ ...current, ...(patch || {}), name: patch.name || name }, current);
  if (!record.name) throw new Error('Project name is required.');
  await store.save(record.name, record);
  if (record.name !== name) await store.remove(name);
  return getProject(record.name);
}
