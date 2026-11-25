// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

/**
 * The layout worker runs where `self` exists and `document` does not. In that
 * scope elk.bundled.js used to register itself as the worker's message handler
 * and fail every layout, so the editor always fell back to the main thread.
 */
describe('layout worker', () => {
  it('lays out a request in a worker-like global scope', async () => {
    const listeners: Array<(event: { data: unknown }) => void> = [];
    const postMessage = vi.fn();
    vi.stubGlobal('self', {
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.push(listener),
      postMessage,
    });
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');

    await import('../src/layout.worker');
    for (const listener of listeners) {
      listener({ data: {
        id: 'worker-probe',
        nodes: [{ id: 'a', width: 100, height: 50 }, { id: 'b', width: 100, height: 50 }],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
        defaults: { algorithm: 'layered', direction: 'DOWN' },
      } });
    }

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalled(), { timeout: 5000 });
    const reply = postMessage.mock.calls[0][0] as { ok: boolean; error?: string; result?: { nodes: unknown[] } };
    expect(reply.error).toBeUndefined();
    expect(reply.ok).toBe(true);
    expect(reply.result?.nodes).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
