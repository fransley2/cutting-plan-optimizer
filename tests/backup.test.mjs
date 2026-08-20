import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  addBackupIntegrity,
  deserializeBackupValue,
  getBackupSummary,
  importFullBackup,
  normalizeBackupPayload,
  serializeBackupValue,
  verifyBackupIntegrity,
} from '../src/data/backup.js';

const binary = new Uint8Array([1, 2, 3, 255]).buffer;
const encoded = serializeBackupValue({ template: binary });
const decoded = deserializeBackupValue(encoded);
assert.deepEqual([...new Uint8Array(decoded.template)], [1, 2, 3, 255]);

const storedDate = new Date('2026-07-20T12:30:00.000Z');
const decodedDate = deserializeBackupValue(serializeBackupValue({ createdAt: storedDate }));
assert.ok(decodedDate.createdAt instanceof Date);
assert.equal(decodedDate.createdAt.toISOString(), storedDate.toISOString());

const modern = normalizeBackupPayload({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: '2026-07-12T00:00:00.000Z',
  stores: { inventory: [{ trace: 'T-1' }], documentTemplates: encoded.template ? [{ id: 'template', arrayBuffer: encoded.template }] : [] },
});
assert.equal(modern.stores.inventory.length, 1);
assert.ok(modern.stores.documentTemplates[0].arrayBuffer instanceof ArrayBuffer);

const legacy = normalizeBackupPayload({
  version: 1,
  plans: [{ name: 'Plan 1' }],
  projects: [{ name: 'Project 1' }],
  inventory: [{ trace: 'T-1' }],
  appSettings: { id: 'appSettings' },
  profile: { id: 'profile' },
});
assert.equal(legacy.stores.plans.length, 1);
assert.equal(legacy.stores.settings.length, 2);

const summary = getBackupSummary(modern);
assert.equal(summary.totalRecords, 2);
assert.equal(summary.stores.find((store) => store.name === 'inventory').count, 1);

const signed = await addBackupIntegrity({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: '2026-07-20T12:00:00.000Z',
  databaseVersion: 22,
  stores: { inventory: [{ trace: 'T-1' }] },
});
assert.equal((await verifyBackupIntegrity(signed)).verified, true);

const tampered = structuredClone(signed);
tampered.stores.inventory[0].trace = 'ALTERED';
await assert.rejects(() => verifyBackupIntegrity(tampered), /integridade falhou/i);

await assert.rejects(
  () => importFullBackup({ text: async () => JSON.stringify({ ...signed, version: BACKUP_VERSION + 1, integrity: null }) }),
  /Atualize o aplicativo/i,
);

assert.throws(
  () => normalizeBackupPayload({ format: BACKUP_FORMAT, version: BACKUP_VERSION, stores: { inventory: {} } }),
  /lista válida/i,
);
assert.throws(() => normalizeBackupPayload({ version: 1 }), /nenhuma store/i);

console.log('backup tests passed');
