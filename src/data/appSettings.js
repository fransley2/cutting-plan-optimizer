import { getDB } from './database.js';
import { idbGet, idbPut } from './idb.js';

const STORE_NAME = 'settings';
const SETTINGS_ID = 'appSettings';

export const CUTTING_METHOD_PRESETS = [
  { id: 'laser', label: 'Laser', kerf: 1 },
  { id: 'plasma', label: 'Plasma', kerf: 4 },
  { id: 'oxyfuel', label: 'Oxicorte', kerf: 6 },
  { id: 'bandsaw', label: 'Serra de Fita', kerf: 3 },
];

export const DEFAULT_MATERIALS_CATALOG = [
  'API 5L X52', 'API 5L X60', 'A36', 'A106 Gr B',
  'A333 Gr 6', 'AISI 316L', 'AISI 304', 'A516 Gr 70',
];

const DEFAULTS = {
  id: SETTINGS_ID,
  defaultKerf: 5,
  defaultMinOffcut: 500,
  defaultStockStrategy: 'best-fit',
  defaultTrimEnabled: false,
  defaultLeftTrim: 0,
  defaultRightTrim: 0,
  requireTraceability: false,
  activeProjectName: '',
  materialsCatalog: DEFAULT_MATERIALS_CATALOG,
};

export async function getAppSettings() {
  const db = await getDB();
  const saved = await idbGet(db, STORE_NAME, SETTINGS_ID);
  return { ...DEFAULTS, ...(saved || {}) };
}

export async function saveAppSettings(partialSettings) {
  const current = await getAppSettings();
  const db = await getDB();
  const updated = { ...current, ...partialSettings, id: SETTINGS_ID };
  await idbPut(db, STORE_NAME, updated);
  return updated;
}

export async function getActiveProjectName() {
  const settings = await getAppSettings();
  return settings.activeProjectName || '';
}

export async function setActiveProjectName(name) {
  const settings = await saveAppSettings({ activeProjectName: name || '' });
  return settings.activeProjectName || '';
}
