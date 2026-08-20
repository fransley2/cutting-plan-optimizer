export const FILE_ADAPTER_METHODS = Object.freeze([
  'readFile',
  'writeFile',
  'exists',
  'deleteFile',
  'watchChanges',
]);

/**
 * Validates the small file-access contract consumed by SyncManager.
 * Concrete adapters may expose extra onboarding/permission methods.
 */
export function assertFileAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('Um adapter de arquivos deve ser informado.');
  }
  const missing = FILE_ADAPTER_METHODS.filter((method) => typeof adapter[method] !== 'function');
  if (missing.length) {
    throw new TypeError(`Adapter de arquivos incompleto: ${missing.join(', ')}.`);
  }
  return adapter;
}
