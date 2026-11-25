import { vi } from 'vitest';
import type { ExchangeResult } from '../../src/onDeviceModel/client';
import type { OnDeviceModel } from '../../src/onDeviceModel/index';
import { MODEL_MANIFEST, type StoredModelState } from '../../src/onDeviceModel/storage';
import type { ChatMessage } from '../../src/onDeviceModel/translator';

/** A scripted model: each run waits until the test replies or Stop cancels it. */
export function fakeModel(initial: StoredModelState = 'ready') {
  let state = initial;
  let pending: ((result: ExchangeResult) => void) | null = null;
  let hold = false; let release: (() => void) | null = null; let failDownload: ((error: Error) => void) | null = null;
  const calls: ChatMessage[][] = [];
  const total = MODEL_MANIFEST.totalBytes;
  const model = {
    // A published revision, as a release build has.
    manifest: { ...MODEL_MANIFEST, source: { ...MODEL_MANIFEST.source, repository: 'coral/test-model', revision: 'abc123' } },
    probe: vi.fn(async () => ({ ok: true as const })),
    gpus: vi.fn(async () => [{ powerPreference: 'high-performance' as const, vendor: 'nvidia', architecture: 'ampere', description: '', name: 'NVIDIA · Ampere' }]),
    estimate: vi.fn(async () => ({ ok: true, freeBytes: 10 * total, neededBytes: total })),
    stored: vi.fn(async () => state),
    storedBytes: vi.fn(async () => (state === 'none' ? 0 : total)),
    download: vi.fn(async (options?: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void }):
      Promise<void | 'busy' | 'in-use'> => {
      options?.onProgress?.(total / 2, total);
      if (hold) await new Promise<void>((resolve, reject) => {
        release = resolve;
        failDownload = reject;
        options?.signal?.addEventListener('abort', () => reject(new Error('Download cancelled')), { once: true });
      });
      options?.onProgress?.(total, total);
      state = 'ready';
    }),
    remove: vi.fn(async () => { state = 'none'; }),
    run: vi.fn((messages: ChatMessage[]) => {
      calls.push(messages);
      return new Promise<ExchangeResult>(resolve => { pending = resolve; });
    }),
    stop: vi.fn(() => { pending?.({ status: 'cancelled' }); pending = null; }),
  } satisfies OnDeviceModel;
  return {
    model,
    calls,
    /** The snapshot text the model received in the latest run. */
    snapshot: () => calls[calls.length - 1][2].content,
    /** Downloads stop halfway until finished, failed or cancelled. */
    holdDownloads() { hold = true; },
    finishDownload() { release!(); },
    failDownload(message: string) { failDownload!(new Error(message)); },
    settle(result: ExchangeResult) { const resolve = pending; pending = null; resolve!(result); },
    reply(text: string) { this.settle({ status: 'ok', text, adapter: { vendor: 'test', architecture: 'test' } }); },
  };
}

/** The handle of the node whose snapshot line ends `id ID`, optionally inside a given parent handle. */
export function nodeHandle(snapshot: string, id: string, parent?: string): string {
  const line = snapshot.split('\n').find(text => text.endsWith(` id ${id}`) && (!parent || text.includes(` in ${parent} `)));
  if (!line) throw new Error(`No node ${id} in\n${snapshot}`);
  return line.split(' ')[0];
}
