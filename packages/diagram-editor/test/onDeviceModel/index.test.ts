import { afterEach, describe, expect, it, vi } from 'vitest';
import { ON_DEVICE_MODEL_AVAILABLE, composeOnDeviceModel, createOnDeviceModel, probeCapability } from '../../src/onDeviceModel';
import type { WorkerLike } from '../../src/onDeviceModel/client';
import { BASE_URL, FakeDirectory, fakeLocks, serveFile, testManifest } from './fakes';

const nav = (gpu: unknown, extra: object = {}) => ({ storage: { getDirectory: async () => ({}) }, locks: {}, gpu, ...extra }) as unknown as Navigator;
const messages = [{ role: 'user' as const, content: 'Delete the arrow' }];

/** A composed model over in-memory OPFS and Web Locks; its worker never replies. */
async function composed({ downloaded = true } = {}) {
  const { locks, held } = fakeLocks();
  vi.stubGlobal('navigator', { locks });
  const root = new FakeDirectory();
  const workers: WorkerLike[] = [];
  const createWorker = vi.fn(() => {
    const worker = { onmessage: null, onerror: null, onmessageerror: null, postMessage() {}, terminate: vi.fn() } as unknown as WorkerLike;
    workers.push(worker); return worker;
  });
  const options = { manifest: testManifest, baseUrl: BASE_URL, fetch: (async (url: string) => serveFile(url)) as unknown as typeof fetch,
    root: async () => root as unknown as FileSystemDirectoryHandle, createWorker };
  const model = composeOnDeviceModel(options);
  if (downloaded) await model.download();
  return { model, held, createWorker, workers, other: composeOnDeviceModel(options) };
}

describe('on-device model entry point', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is in the 0.2.10 build (owner, 2026-11-15); creating it starts no worker', () => {
    expect(ON_DEVICE_MODEL_AVAILABLE).toBe(true);
    const worker = vi.fn();
    vi.stubGlobal('Worker', worker);
    expect(() => createOnDeviceModel()).not.toThrow();
    expect(worker).not.toHaveBeenCalled();
  });

  it('probes for WebGPU with a real adapter, OPFS and Web Locks', async () => {
    vi.stubGlobal('Worker', class {});
    expect(await probeCapability(nav({ requestAdapter: async () => ({ info: { isFallbackAdapter: false } }) }))).toEqual({ ok: true });
    expect(await probeCapability(nav({ requestAdapter: async () => ({ info: { isFallbackAdapter: true } }) }))).toEqual({ ok: false, reason: 'fallback-adapter' });
    expect(await probeCapability(nav({ requestAdapter: async () => null }))).toEqual({ ok: false, reason: 'no-webgpu' });
    expect(await probeCapability(nav(undefined))).toEqual({ ok: false, reason: 'no-webgpu' });
    expect(await probeCapability(nav(undefined, { locks: undefined }))).toEqual({ ok: false, reason: 'no-locks' });
    expect(await probeCapability(nav(undefined, { storage: {} }))).toEqual({ ok: false, reason: 'no-opfs' });
  });

  it('refuses an exchange until the model is downloaded and verified, and creates no worker', async () => {
    const { model, createWorker } = await composed({ downloaded: false });
    expect(await model.stored()).toBe('none');
    expect(await model.run(messages)).toMatchObject({ status: 'error', code: 'not-ready' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('holds the lock for an exchange: this tab gets busy, another tab in-use, and Stop releases it', async () => {
    const { model, held, workers, other } = await composed();
    expect(await model.stored()).toBe('ready');
    const run = model.run(messages);
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    expect(held.size).toBe(1);
    expect(await model.run(messages)).toEqual({ status: 'busy' });
    expect(await model.download()).toBe('busy');
    expect(await other.run(messages)).toBe('in-use');
    model.stop();
    expect(await run).toEqual({ status: 'cancelled' });
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(held.size).toBe(0);
    expect(await other.remove()).toBeUndefined();
  });

  it('Stop before the worker starts cancels the exchange instead of letting it run', async () => {
    const { model, createWorker, held } = await composed();
    const run = model.run(messages);
    model.stop();
    expect(await run).toEqual({ status: 'cancelled' });
    expect(createWorker).not.toHaveBeenCalled();
    expect(held.size).toBe(0);
  });
});
