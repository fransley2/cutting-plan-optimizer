import { assertFileAdapter } from './fileAdapter.js';

const MESSAGE = 'Adapter Electron nao implementado. A ponte segura para Node fs deve ser exposta pelo preload do Electron antes do uso.';

export class ElectronFsAdapter {
  constructor({ bridge = globalThis.electronFileSystem } = {}) {
    this.bridge = bridge;
  }

  notImplemented() {
    const error = new Error(MESSAGE);
    error.code = this.bridge ? 'ELECTRON_BRIDGE_NOT_IMPLEMENTED' : 'ELECTRON_CONTEXT_REQUIRED';
    throw error;
  }

  async readFile() { return this.notImplemented(); }
  async writeFile() { return this.notImplemented(); }
  async exists() { return this.notImplemented(); }
  async deleteFile() { return this.notImplemented(); }
  watchChanges() { return this.notImplemented(); }
}

export function createElectronFsAdapter(options) {
  return assertFileAdapter(new ElectronFsAdapter(options));
}
