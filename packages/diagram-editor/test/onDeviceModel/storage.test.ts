import { describe, expect, it, vi } from 'vitest';
import {
  MODEL_DIRECTORY, MODEL_MANIFEST, ModelStoreError, downloadModel, publishedBaseUrl, removeModel, storageEstimate,
  storedBytes, storedModelState, withModelLock,
} from '../../src/onDeviceModel/storage';
import { BASE_URL, CONTENT, FakeDirectory, FakeFileHandle, fakeLocks, serveFile, sha, testManifest as manifest } from './fakes';

function setup(serve: (url: string) => Response = serveFile) {
  const root = new FakeDirectory();
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => serve(url));
  const options = { baseUrl: BASE_URL, fetch: fetch as unknown as typeof globalThis.fetch,
    root: async () => root as unknown as FileSystemDirectoryHandle };
  return { root, fetch, options, stored: () => storedModelState(manifest, options.root) };
}
const serveTokenizer = (response: (data: Uint8Array) => Response) => (url: string) =>
  (url.endsWith('tokenizer.json') ? response(CONTENT['tokenizer.json']) : serveFile(url));

describe('on-device model download and storage', () => {
  it('downloads each file once without referrer or credentials, verifies it and then writes the marker', async () => {
    const { root, fetch, options, stored } = setup();
    const progress: number[] = [];
    expect(await stored()).toBe('none');
    await downloadModel(manifest, { ...options, onProgress: loaded => progress.push(loaded) });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) expect(init).toMatchObject({ referrerPolicy: 'no-referrer', credentials: 'omit' });
    expect(fetch.mock.calls[0][0]).toBe(`${BASE_URL}onnx/model_q4.onnx_data`);
    expect(progress[progress.length - 1]).toBe(manifest.totalBytes);
    const directory = root.entries.get(MODEL_DIRECTORY) as FakeDirectory;
    expect([...directory.entries.keys()]).toEqual(['onnx--model_q4.onnx_data', 'tokenizer.json', 'verified.json']);
    expect(await stored()).toBe('ready');
    expect(await storedBytes(options.root)).toBeGreaterThan(manifest.totalBytes);
    await removeModel(options.root);
    expect(await stored()).toBe('none');
  });

  it.each([
    ['corrupt', 'hash', (data: Uint8Array) => { const copy = data.slice(); copy[0] ^= 1; return new Response(copy); }],
    ['short', 'size', (data: Uint8Array) => new Response(data.slice(1))],
    ['missing', 'download', () => new Response('not found', { status: 404 })],
  ] as const)('a %s file never reaches ready and the partial files are deleted', async (_name, code, serve) => {
    const { root, options, stored } = setup(serveTokenizer(serve));
    await expect(downloadModel(manifest, options)).rejects.toMatchObject({ code });
    expect(root.entries.has(MODEL_DIRECTORY)).toBe(false);
    expect(await stored()).toBe('none');
  });

  it('a file longer than the manifest stops at once and its stream is cancelled', async () => {
    const cancel = vi.fn();
    const long = () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(64)); }, cancel,
    }));
    const { root, options } = setup(serveTokenizer(long));
    await expect(downloadModel(manifest, options)).rejects.toMatchObject({ code: 'size' });
    expect(cancel).toHaveBeenCalled();
    expect(root.entries.has(MODEL_DIRECTORY)).toBe(false);
  });

  it('a network failure never reaches ready', async () => {
    const { root, options } = setup(() => { throw new TypeError('Failed to fetch'); });
    await expect(downloadModel(manifest, options)).rejects.toMatchObject({ code: 'download' });
    expect(root.entries.has(MODEL_DIRECTORY)).toBe(false);
  });

  it('an aborted download reports cancelled and deletes the partial files', async () => {
    const controller = new AbortController();
    const { root, options } = setup(url => { controller.abort(); return serveFile(url); });
    await expect(downloadModel(manifest, { ...options, signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(root.entries.has(MODEL_DIRECTORY)).toBe(false);
  });

  it('a full disk reports a storage error and deletes the partial files', async () => {
    const { root, options } = setup();
    const original = root.getDirectoryHandle.bind(root);
    root.getDirectoryHandle = async (name, create) => {
      const directory = await original(name, create);
      directory.onCreateFile = (_file, handle: FakeFileHandle) => { handle.failWrite = 'QuotaExceededError'; };
      return directory;
    };
    await expect(downloadModel(manifest, options)).rejects.toMatchObject({ code: 'storage' });
    expect(root.entries.has(MODEL_DIRECTORY)).toBe(false);
  });

  it('reports the original failure even when cleanup fails, and wraps a failed removal', async () => {
    const { root, options } = setup(serveTokenizer(() => new Response('not found', { status: 404 })));
    const original = root.removeEntry.bind(root);
    let removals = 0;
    root.removeEntry = async name => { if (removals++ > 0) throw Object.assign(new Error('busy'), { name: 'NoModificationAllowedError' }); return original(name); };
    await expect(downloadModel(manifest, options)).rejects.toMatchObject({ code: 'download' });
    expect(await storedModelState(manifest, options.root)).toBe('other');
    root.failRemove = 'NoModificationAllowedError';
    const removal = removeModel(options.root);
    await expect(removal).rejects.toBeInstanceOf(ModelStoreError);
    await expect(removal).rejects.toMatchObject({ code: 'storage' });
  });

  it('refuses a model whose contract hash differs, before any request', async () => {
    const { fetch, options, stored } = setup();
    const wrong = { ...manifest, contract: { ...manifest.contract, sha256: '0'.repeat(64) } };
    await expect(downloadModel(wrong, options)).rejects.toMatchObject({ code: 'contract-mismatch' });
    expect(fetch).not.toHaveBeenCalled();
    expect(await stored()).toBe('none');
  });

  it('refuses an unpublished manifest and builds the pinned Hugging Face URL once published', async () => {
    const { options } = setup();
    await expect(downloadModel(manifest, { ...options, baseUrl: undefined })).rejects.toMatchObject({ code: 'unpublished' });
    expect(publishedBaseUrl({ ...manifest, source: { ...manifest.source, repository: null, revision: null } })).toBeNull();
    expect(publishedBaseUrl(MODEL_MANIFEST))
      .toBe('https://huggingface.co/coreyt/coral-diagrams-lfm2.5-230m/resolve/bf57f7016a3c438d6fb1ac2a8f98430a19ce4b43/');
    expect(publishedBaseUrl({ ...manifest, source: { host: 'huggingface.co', repository: 'coral/model', revision: 'a'.repeat(40) } }))
      .toBe(`https://huggingface.co/coral/model/resolve/${'a'.repeat(40)}/`);
  });

  it('reports files from another manifest or with a changed size as not ready', async () => {
    const { root, options } = setup();
    await downloadModel(manifest, options);
    const changed = { ...manifest, files: manifest.files.map(f => ({ ...f, sha256: sha(`${f.sha256}x`) })) };
    expect(await storedModelState(changed, options.root)).toBe('other');
    const directory = root.entries.get(MODEL_DIRECTORY) as FakeDirectory;
    (directory.entries.get('tokenizer.json') as FakeFileHandle).data = new Uint8Array(2);
    expect(await storedModelState(manifest, options.root)).toBe('other');
  });

  it('a new download replaces whatever was stored before it starts', async () => {
    const { root, options } = setup();
    const directory = await root.getDirectoryHandle(MODEL_DIRECTORY, { create: true });
    await directory.getFileHandle('stale-file', { create: true });
    await downloadModel(manifest, options);
    expect((root.entries.get(MODEL_DIRECTORY) as FakeDirectory).entries.has('stale-file')).toBe(false);
  });

  it('the storage estimate fails below the manifest total, counting a model it would replace as free', async () => {
    const { options } = setup();
    const estimate = (quota: number, usage: number) => ({ estimate: async () => ({ quota, usage }) }) as unknown as StorageManager;
    expect(await storageEstimate(manifest, estimate(manifest.totalBytes + 10, 10), options.root)).toMatchObject({ ok: true });
    expect(await storageEstimate(manifest, estimate(manifest.totalBytes + 10, 11), options.root))
      .toMatchObject({ ok: false, neededBytes: manifest.totalBytes });
    await downloadModel(manifest, options);
    const full = estimate(manifest.totalBytes * 2, manifest.totalBytes * 2);
    expect(await storageEstimate(manifest, full, options.root)).toMatchObject({ ok: true });
  });

  it('the model lock reports in-use when another tab holds it', async () => {
    const { locks } = fakeLocks();
    let inner: unknown;
    expect(await withModelLock(async () => { inner = await withModelLock(async () => 'nested', locks); return 'outer'; }, locks)).toBe('outer');
    expect(inner).toBe('in-use');
  });
});
