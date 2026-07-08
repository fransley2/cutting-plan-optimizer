import { createEntityStore } from './entityStore.js';

const store = createEntityStore('projects');

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

function normalizeProject(input = {}) {
  return {
    name: text(input.name || input.project || input.projectName).trim(),
    client: text(input.client).trim(),
    code: text(input.code || input.projectCode).trim(),
    status: normalizeStatus(input.status),
    description: text(input.description).trim(),
  };
}

export const getAllProjects = store.getAll;
export const getProject = store.get;
export const saveProject = store.save;
export const deleteProject = store.remove;

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
  const record = normalizeProject({ ...current, ...(patch || {}), name: patch.name || name });
  if (!record.name) throw new Error('Project name is required.');
  await store.save(record.name, record);
  if (record.name !== name) await store.remove(name);
  return getProject(record.name);
}
