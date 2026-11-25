import { createHash } from 'node:crypto';
import { MODEL_MANIFEST, type ModelManifest } from '../../src/onDeviceModel/storage';

// Minimal in-memory stand-ins for the OPFS directory API and Web Locks.
const domError = (name: string) => Object.assign(new Error(name), { name });

export class FakeFileHandle {
  readonly kind = 'file';
  data = new Uint8Array(0);
  /** Set to make the next write throw, for example QuotaExceededError. */
  failWrite: string | null = null;
  async getFile() {
    const data = this.data;
    return { size: data.length, arrayBuffer: async () => data.slice().buffer, text: async () => new TextDecoder().decode(data) };
  }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return {
      write: async (chunk: Uint8Array | string) => {
        if (this.failWrite) throw domError(this.failWrite);
        chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      },
      close: async () => {
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let at = 0;
        for (const c of chunks) { out.set(c, at); at += c.length; }
        this.data = out;
      },
      abort: async () => {},
    };
  }
}

export class FakeDirectory {
  readonly kind = 'directory';
  entries = new Map<string, FakeDirectory | FakeFileHandle>();
  /** Set to make removeEntry throw, as OPFS does while a file is still open. */
  failRemove: string | null = null;
  /** Called before each new file handle is created. */
  onCreateFile: ((name: string, handle: FakeFileHandle) => void) | null = null;
  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    if (!this.entries.has(name)) { if (!options.create) throw domError('NotFoundError'); this.entries.set(name, new FakeDirectory()); }
    return this.entries.get(name) as FakeDirectory;
  }
  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    if (!this.entries.has(name)) {
      if (!options.create) throw domError('NotFoundError');
      const handle = new FakeFileHandle(); this.onCreateFile?.(name, handle); this.entries.set(name, handle);
    }
    return this.entries.get(name) as FakeFileHandle;
  }
  async removeEntry(name: string) {
    if (this.failRemove) throw domError(this.failRemove);
    if (!this.entries.delete(name)) throw domError('NotFoundError');
  }
  async *values() { yield* this.entries.values(); }
}

/** A LockManager with real exclusivity; `held` shows the names held now. */
export function fakeLocks() {
  const held = new Set<string>();
  const locks = {
    async request(name: string, _options: unknown, callback: (lock: unknown) => unknown) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  } as unknown as LockManager;
  return { locks, held };
}

const bytes = (text: string) => new TextEncoder().encode(text);
export const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
export const CONTENT: Record<string, Uint8Array> = {
  'onnx/model_q4.onnx_data': bytes('weights '.repeat(64)), 'tokenizer.json': bytes('{"tokens":[]}'),
};
export const testManifest: ModelManifest = {
  ...MODEL_MANIFEST,
  source: { host: 'huggingface.co', repository: null, revision: null },
  files: Object.entries(CONTENT).map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) })),
  totalBytes: Object.values(CONTENT).reduce((n, d) => n + d.length, 0),
};
export const BASE_URL = 'http://127.0.0.1:1/model/';
export const serveFile = (url: string) => new Response(CONTENT[new URL(url).pathname.replace(/^\/model\//, '')].slice());
