import test from 'node:test';
import assert from 'node:assert/strict';
import { FsApiAdapter } from '../src/core/fileAdapters/fsApiAdapter.js';

function notFound() {
  return Object.assign(new Error('not found'), { name: 'NotFoundError' });
}

class FakeFileHandle {
  constructor(name) {
    this.name = name;
    this.content = '';
    this.lastModified = 1;
  }

  async getFile() {
    return {
      lastModified: this.lastModified,
      text: async () => this.content,
    };
  }

  async createWritable() {
    return {
      write: async (content) => { this.content = String(content); },
      close: async () => { this.lastModified += 1; },
      abort: async () => {},
    };
  }
}

class FakeDirectoryHandle {
  constructor() {
    this.files = new Map();
    this.permission = 'granted';
  }

  async queryPermission() { return this.permission; }
  async requestPermission() { return this.permission; }

  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name) && !create) throw notFound();
    if (!this.files.has(name)) this.files.set(name, new FakeFileHandle(name));
    return this.files.get(name);
  }

  async getDirectoryHandle() { throw notFound(); }

  async removeEntry(name) {
    if (!this.files.delete(name)) throw notFound();
  }
}

test('onboarding selects a writable folder, validates it and persists its handle', async () => {
  const directory = new FakeDirectoryHandle();
  let pickerCalls = 0;
  let savedHandle = null;
  const handleStore = {
    load: async () => savedHandle,
    save: async (handle) => { savedHandle = handle; },
    clear: async () => { savedHandle = null; },
  };
  const adapter = new FsApiAdapter({
    handleStore,
    showDirectoryPicker: async () => { pickerCalls += 1; return directory; },
  });

  assert.equal(await adapter.selectDirectory(), directory);
  assert.equal(pickerCalls, 1);
  assert.equal(savedHandle, directory);
  assert.equal(directory.files.has('.cutting-plan-write-test.tmp'), false);

  await adapter.writeFile('mto.json', '{"ok":true}');
  assert.equal(await adapter.exists('mto.json'), true);
  assert.equal(await adapter.readFile('mto.json'), '{"ok":true}');
  await adapter.deleteFile('mto.json');
  assert.equal(await adapter.exists('mto.json'), false);

  const restored = new FsApiAdapter({ handleStore, showDirectoryPicker: async () => { throw new Error('picker should not open'); } });
  assert.equal(await restored.restoreDirectory(), directory);
  assert.equal(await restored.queryPermission(), 'granted');
});

test('onboarding rejects a folder without write permission', async () => {
  const directory = new FakeDirectoryHandle();
  directory.permission = 'denied';
  const adapter = new FsApiAdapter({ showDirectoryPicker: async () => directory });

  await assert.rejects(adapter.selectDirectory(), (error) => error.code === 'PERMISSION_REQUIRED');
});

test('default showDirectoryPicker keeps globalThis as the native invocation receiver', async () => {
  const directory = new FakeDirectoryHandle();
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'showDirectoryPicker');
  let receivedThis = null;
  Object.defineProperty(globalThis, 'showDirectoryPicker', {
    configurable: true,
    writable: true,
    value: function showDirectoryPicker() {
      receivedThis = this;
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return directory;
    },
  });

  try {
    const adapter = new FsApiAdapter();
    assert.equal(await adapter.selectDirectory(), directory);
    assert.equal(receivedThis, globalThis);
  } finally {
    if (previousDescriptor) Object.defineProperty(globalThis, 'showDirectoryPicker', previousDescriptor);
    else delete globalThis.showDirectoryPicker;
  }
});
