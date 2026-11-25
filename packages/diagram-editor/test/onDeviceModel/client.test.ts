import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_TIMEOUT_MS, LOAD_TIMEOUT_MS, OnDeviceModelClient, type WorkerLike } from '../../src/onDeviceModel/client';
import type { WorkerReply, WorkerRequest, WorkerResult } from '../../src/onDeviceModel/model.worker';

// Ported from dev/experiments/coralsmol/browser/client.test.mjs: Stop,
// timeouts, worker loss, late replies and busy, for the per-exchange worker.
interface FakeWorker extends WorkerLike { sent: WorkerRequest[]; terminated: boolean; emit(reply: WorkerReply): void }

function setup(extra: Partial<ConstructorParameters<typeof OnDeviceModelClient>[0]> = {}) {
  const workers: FakeWorker[] = [];
  const client = new OnDeviceModelClient({
    directory: 'model', files: [], tokenCaps: { input: 2048, output: 1024 }, ...extra,
    createWorker: () => {
      const worker: FakeWorker = {
        sent: [], terminated: false, onmessage: null, onerror: null, onmessageerror: null,
        postMessage(message) { this.sent.push(message); },
        terminate() { this.terminated = true; },
        emit(reply) { this.onmessage?.({ data: reply } as MessageEvent<WorkerReply>); },
      };
      workers.push(worker); return worker;
    },
  });
  return { client, workers };
}
const ok: WorkerResult = { status: 'ok', text: 'delete e1', finish: 'eos', adapter: { vendor: 'nvidia', architecture: 'ampere', description: '' } };
const messages = [{ role: 'user' as const, content: 'Delete the arrow' }];

describe('on-device model client', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs one exchange in a fresh worker and ends the worker afterwards', async () => {
    const { client, workers } = setup();
    const first = client.run(messages);
    expect(workers[0].sent[0]).toMatchObject({ messages, maxNewTokens: 1024, maxInputTokens: 2048 });
    workers[0].emit({ type: 'working' });
    workers[0].emit({ type: 'result', result: ok });
    expect(await first).toMatchObject({ status: 'ok', text: 'delete e1' });
    expect(workers[0].terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const second = client.run(messages);
    expect(workers).toHaveLength(2);
    workers[1].emit({ type: 'result', result: ok });
    expect((await second).status).toBe('ok');
  });

  it('passes a required architecture to each worker and reports each worker\'s adapter before loading', async () => {
    const seen: unknown[] = [];
    const { client, workers } = setup({ requireArchitecture: 'ampere', onAdapter: adapter => seen.push(adapter) });
    const first = client.run(messages);
    expect(workers[0].sent[0]).toMatchObject({ requireArchitecture: 'ampere' });
    const maxwell = { vendor: 'nvidia', architecture: 'maxwell', description: '' };
    workers[0].emit({ type: 'adapter', adapter: maxwell });
    expect(seen).toEqual([maxwell]);
    workers[0].emit({ type: 'result', result: { status: 'error', code: 'gpu-adapter', message: 'refused', adapter: maxwell } });
    expect(await first).toEqual({ status: 'error', code: 'gpu-adapter', message: 'refused', adapter: maxwell });
    expect(setup().client).toBeTruthy();
  });

  it('allows one exchange at a time', async () => {
    const { client, workers } = setup();
    const first = client.run(messages);
    expect(await client.run(messages)).toEqual({ status: 'busy' });
    expect(workers).toHaveLength(1);
    workers[0].emit({ type: 'result', result: ok });
    expect((await first).status).toBe('ok');
  });

  it('Stop ends the worker and detaches it, so a late reply cannot settle the next exchange', async () => {
    const { client, workers } = setup();
    const first = client.run(messages);
    client.stop();
    expect(await first).toEqual({ status: 'cancelled' });
    expect(workers[0].terminated).toBe(true);
    expect(workers[0].onmessage).toBeNull();
    const second = client.run(messages);
    workers[0].emit({ type: 'result', result: { ...ok, text: 'late' } });
    expect(client.busy).toBe(true);
    workers[1].emit({ type: 'result', result: ok });
    expect(await second).toMatchObject({ status: 'ok', text: 'delete e1' });
  });

  it('times out after 180 s of loading or 60 s of generation', async () => {
    for (const phase of ['loading', 'working'] as const) {
      const { client, workers } = setup();
      const run = client.run(messages);
      if (phase === 'working') { vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1); workers[0].emit({ type: 'working' }); }
      vi.advanceTimersByTime((phase === 'loading' ? LOAD_TIMEOUT_MS : GENERATION_TIMEOUT_MS) - 1);
      expect(client.busy).toBe(true);
      vi.advanceTimersByTime(1);
      expect(await run).toEqual({ status: 'timeout', phase });
      expect(workers[0].terminated).toBe(true);
    }
  });

  it('worker loss ends the exchange', async () => {
    for (const event of ['error', 'messageerror'] as const) {
      const { client, workers } = setup();
      const run = client.run(messages);
      if (event === 'error') workers[0].onerror?.({ preventDefault() {} } as ErrorEvent);
      else workers[0].onmessageerror?.({} as MessageEvent);
      expect(await run).toEqual({ status: 'worker-lost' });
      expect(workers[0].terminated).toBe(true);
      expect(client.busy).toBe(false);
    }
  });

  it('rejects a reply that reached the output cap and reports worker errors', async () => {
    const { client, workers } = setup();
    const truncated = client.run(messages);
    workers[0].emit({ type: 'result', result: { ...ok, finish: 'length' } });
    expect(await truncated).toEqual({ status: 'truncated' });
    const failed = client.run(messages);
    workers[1].emit({ type: 'result', result: { status: 'error', code: 'gpu-lost', message: 'Device lost' } });
    expect(await failed).toEqual({ status: 'error', code: 'gpu-lost', message: 'Device lost' });
  });

  it('reports a worker that cannot be created', async () => {
    const client = new OnDeviceModelClient({ directory: 'model', files: [], tokenCaps: { input: 1, output: 1 },
      createWorker: () => { throw new Error('blocked'); } });
    expect(await client.run(messages)).toEqual({ status: 'error', code: 'worker-create', message: 'blocked' });
    expect(client.busy).toBe(false);
  });
});
