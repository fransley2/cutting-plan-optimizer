import { assertFileAdapter } from './fileAdapter.js';

export const DEFAULT_FILE_WATCH_INTERVAL_MS = 45_000;
const WRITABLE_TEST_FILE = '.cutting-plan-write-test.tmp';

export class FileSystemAccessError extends Error {
  constructor(message, { code = 'FILE_SYSTEM_ACCESS_ERROR', cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'FileSystemAccessError';
    this.code = code;
  }
}

function normalizeRelativePath(relativePath) {
  const path = String(relativePath || '').trim().replace(/\\/g, '/');
  const segments = path.split('/').filter(Boolean);
  if (!segments.length || path.startsWith('/') || /^[a-z]:/i.test(path) || segments.some((part) => part === '..')) {
    throw new FileSystemAccessError(`Caminho relativo invalido: "${relativePath}".`, { code: 'INVALID_PATH' });
  }
  return segments;
}

function permissionState(handle, method, options) {
  if (typeof handle?.[method] !== 'function') return Promise.resolve('granted');
  return handle[method](options);
}

function accessMessage(error, action) {
  if (error?.name === 'AbortError') return 'Selecao da pasta compartilhada cancelada.';
  if (error?.name === 'NotAllowedError') return 'Permissao para acessar a pasta compartilhada foi negada ou revogada.';
  if (error?.name === 'NotFoundError') return 'A pasta compartilhada ou o arquivo nao esta acessivel.';
  return `Nao foi possivel ${action} na pasta compartilhada: ${error?.message || 'falha desconhecida'}.`;
}

export class FsApiAdapter {
  constructor({
    directoryHandle = null,
    handleStore = null,
    showDirectoryPicker = globalThis.showDirectoryPicker?.bind(globalThis),
    pollIntervalMs = DEFAULT_FILE_WATCH_INTERVAL_MS,
    setIntervalFn = globalThis.setInterval?.bind(globalThis),
    clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
  } = {}) {
    this.directoryHandle = directoryHandle;
    this.handleStore = handleStore;
    this.showDirectoryPicker = showDirectoryPicker;
    this.pollIntervalMs = pollIntervalMs;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
  }

  isSupported() {
    return typeof this.showDirectoryPicker === 'function';
  }

  async restoreDirectory() {
    if (this.directoryHandle) return this.directoryHandle;
    const saved = await this.handleStore?.load?.() || null;
    this.directoryHandle = typeof saved?.getFileHandle === 'function' ? saved : null;
    if (saved && !this.directoryHandle) await this.handleStore?.clear?.();
    return this.directoryHandle;
  }

  async selectDirectory({ onBeforeCommit } = {}) {
    if (!this.isSupported()) {
      throw new FileSystemAccessError('Este navegador nao oferece a File System Access API. Use uma versao atual do Chrome ou Edge.', { code: 'NOT_SUPPORTED' });
    }
    try {
      const handle = await this.showDirectoryPicker({ mode: 'readwrite' });
      await this.verifyWritable(handle);
      await onBeforeCommit?.({ previousHandle: this.directoryHandle, nextHandle: handle });
      this.directoryHandle = handle;
      await this.handleStore?.save?.(handle);
      return handle;
    } catch (error) {
      if (error instanceof FileSystemAccessError) throw error;
      throw new FileSystemAccessError(accessMessage(error, 'selecionar a pasta'), { code: 'DIRECTORY_SELECTION_FAILED', cause: error });
    }
  }

  async clearDirectory() {
    this.directoryHandle = null;
    await this.handleStore?.clear?.();
  }

  async queryPermission() {
    const handle = await this.restoreDirectory();
    if (!handle) return 'prompt';
    try {
      return await permissionState(handle, 'queryPermission', { mode: 'readwrite' });
    } catch (error) {
      throw new FileSystemAccessError(accessMessage(error, 'consultar a permissao'), { code: 'PERMISSION_QUERY_FAILED', cause: error });
    }
  }

  async requestPermission() {
    const handle = await this.restoreDirectory();
    if (!handle) return 'prompt';
    try {
      return await permissionState(handle, 'requestPermission', { mode: 'readwrite' });
    } catch (error) {
      throw new FileSystemAccessError(accessMessage(error, 'solicitar a permissao'), { code: 'PERMISSION_REQUEST_FAILED', cause: error });
    }
  }

  async ensureAccess({ request = false } = {}) {
    const handle = await this.restoreDirectory();
    if (!handle) {
      throw new FileSystemAccessError('Nenhuma pasta compartilhada foi configurada.', { code: 'NOT_CONFIGURED' });
    }
    const state = request ? await this.requestPermission() : await this.queryPermission();
    if (state !== 'granted') {
      throw new FileSystemAccessError('O navegador precisa de permissao para acessar a pasta compartilhada.', { code: 'PERMISSION_REQUIRED' });
    }
    return handle;
  }

  async resolveParent(relativePath, { create = false, rootHandle = null } = {}) {
    const segments = normalizeRelativePath(relativePath);
    const fileName = segments.pop();
    let directory = rootHandle || await this.ensureAccess();
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create });
    return { directory, fileName };
  }

  async getFileHandle(relativePath, { create = false, rootHandle = null } = {}) {
    const { directory, fileName } = await this.resolveParent(relativePath, { create, rootHandle });
    return directory.getFileHandle(fileName, { create });
  }

  async readFile(relativePath) {
    try {
      const handle = await this.getFileHandle(relativePath);
      return (await handle.getFile()).text();
    } catch (error) {
      if (error instanceof FileSystemAccessError) throw error;
      throw new FileSystemAccessError(accessMessage(error, `ler "${relativePath}"`), { code: 'READ_FAILED', cause: error });
    }
  }

  async writeFile(relativePath, content) {
    let writable;
    try {
      const handle = await this.getFileHandle(relativePath, { create: true });
      writable = await handle.createWritable();
      await writable.write(String(content));
      await writable.close();
    } catch (error) {
      try { await writable?.abort?.(); } catch { /* best effort */ }
      if (error instanceof FileSystemAccessError) throw error;
      throw new FileSystemAccessError(accessMessage(error, `gravar "${relativePath}"`), { code: 'WRITE_FAILED', cause: error });
    }
  }

  async exists(relativePath) {
    try {
      await this.getFileHandle(relativePath);
      return true;
    } catch (error) {
      if (error?.name === 'NotFoundError' || error?.cause?.name === 'NotFoundError') return false;
      if (error instanceof FileSystemAccessError) throw error;
      throw new FileSystemAccessError(accessMessage(error, `verificar "${relativePath}"`), { code: 'EXISTS_FAILED', cause: error });
    }
  }

  async deleteFile(relativePath) {
    try {
      const { directory, fileName } = await this.resolveParent(relativePath);
      await directory.removeEntry(fileName);
    } catch (error) {
      if (error?.name === 'NotFoundError') return;
      if (error instanceof FileSystemAccessError) throw error;
      throw new FileSystemAccessError(accessMessage(error, `remover "${relativePath}"`), { code: 'DELETE_FAILED', cause: error });
    }
  }

  async getLastModified(relativePath) {
    try {
      const handle = await this.getFileHandle(relativePath);
      return Number((await handle.getFile()).lastModified || 0);
    } catch (error) {
      if (error?.name === 'NotFoundError' || error?.cause?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  watchChanges(relativePath, callback, { intervalMs = this.pollIntervalMs } = {}) {
    if (typeof callback !== 'function') throw new TypeError('watchChanges exige um callback.');
    if (typeof this.setIntervalFn !== 'function' || typeof this.clearIntervalFn !== 'function') {
      throw new FileSystemAccessError('Timers indisponiveis para observar alteracoes.', { code: 'WATCH_NOT_SUPPORTED' });
    }
    let active = true;
    let checking = false;
    let initialized = false;
    let previous = null;
    const check = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const lastModified = await this.getLastModified(relativePath);
        if (initialized && lastModified !== previous) callback({ relativePath, lastModified, previousLastModified: previous });
        previous = lastModified;
        initialized = true;
      } catch (error) {
        callback({ relativePath, error });
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = this.setIntervalFn(check, Math.max(1_000, Number(intervalMs) || this.pollIntervalMs));
    return () => {
      active = false;
      this.clearIntervalFn(timer);
    };
  }

  async verifyWritable(handle = this.directoryHandle) {
    if (!handle) throw new FileSystemAccessError('Nenhuma pasta compartilhada foi selecionada.', { code: 'NOT_CONFIGURED' });
    let created = false;
    try {
      const permission = await permissionState(handle, 'requestPermission', { mode: 'readwrite' });
      if (permission !== 'granted') throw new FileSystemAccessError('A pasta selecionada nao concedeu permissao de gravacao.', { code: 'PERMISSION_REQUIRED' });
      const fileHandle = await handle.getFileHandle(WRITABLE_TEST_FILE, { create: true });
      created = true;
      const writable = await fileHandle.createWritable();
      await writable.write('ok');
      await writable.close();
      await handle.removeEntry(WRITABLE_TEST_FILE);
      return true;
    } catch (error) {
      if (created) {
        try { await handle.removeEntry(WRITABLE_TEST_FILE); } catch { /* best effort */ }
      }
      if (error instanceof FileSystemAccessError) throw error;
      throw new FileSystemAccessError(accessMessage(error, 'validar gravacao'), { code: 'WRITE_TEST_FAILED', cause: error });
    }
  }
}

export function createFsApiAdapter(options) {
  return assertFileAdapter(new FsApiAdapter(options));
}
