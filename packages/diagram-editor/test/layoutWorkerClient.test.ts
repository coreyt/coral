import { describe, expect, it, vi } from 'vitest';
import { countLayoutNodes, runEditorLayout, type LayoutWorkerLike } from '../src/layoutWorkerClient';
import type { LayoutRequest } from '@coral-viz/render/layout';

const request = (count = 1): LayoutRequest => ({
  id: 'g', defaults: { algorithm: 'layered', direction: 'DOWN' }, edges: [],
  nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, width: 10, height: 10 })),
});

class FakeWorker implements LayoutWorkerLike {
  listeners = new Map<string, Set<EventListener>>();
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener]));
  }
  removeEventListener(type: string, listener: EventListener) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, value: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: value } as Event);
  }
}

describe('private editor layout worker client', () => {
  it('counts descendants for the fallback cap', () => {
    expect(countLayoutNodes([{ id: 'p', width: 1, height: 1, children: [
      { id: 'c', width: 1, height: 1 },
    ] }])).toBe(2);
  });

  it('settles once and terminates after success', async () => {
    const worker = new FakeWorker();
    const pending = runEditorLayout(request(), { workerFactory: () => worker });
    worker.emit('message', { ok: true, result: { nodes: [], edges: [], width: 0, height: 0, effectiveOptions: {}, diagnostics: [] } });
    await expect(pending).resolves.toMatchObject({ nodes: [] });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect([...worker.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('aborts silently without starting fallback', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = runEditorLayout(request(), { workerFactory: () => worker, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('refuses main-thread fallback over 100 recursive nodes', async () => {
    await expect(runEditorLayout(request(101), { workerFactory: () => { throw new Error('no worker'); } }))
      .rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: 'layout.worker.unavailable' })] });
  });

  it.each(['execution', 'message'])('uses diagnosed bounded fallback for %s failure', async (kind) => {
    const worker = new FakeWorker();
    if (kind === 'message') worker.postMessage.mockImplementation(() => { throw new Error('clone'); });
    const pending = runEditorLayout(request(), { workerFactory: () => worker });
    if (kind === 'execution') worker.emit('message', { ok: false });
    await expect(pending).resolves.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'layout.worker.fallback' })]),
    });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
