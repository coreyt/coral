import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerReply, WorkerRequest } from '../../src/onDeviceModel/model.worker';

// The worker must run the model on the adapter it chose: ONNX Runtime's WebGPU
// EP ignores env.webgpu.adapter and requests its own adapter unless the EP
// options carry a device. It reports the adapter before reading any model file.
const runtime = vi.hoisted(() => ({ fromPretrained: vi.fn(), tokenizer: vi.fn() }));
vi.mock('@huggingface/transformers', () => ({
  env: { backends: { onnx: { wasm: {}, webgpu: {} } } },
  AutoTokenizer: { from_pretrained: runtime.tokenizer },
  AutoModelForCausalLM: { from_pretrained: runtime.fromPretrained },
}));

function adapter(architecture: string) {
  const device = { lost: new Promise(() => {}) };
  return {
    info: { vendor: 'nvidia', architecture, description: '', isFallbackAdapter: false },
    limits: { maxBufferSize: 4_294_967_296, maxStorageBufferBindingSize: 2_147_483_648, label: 'not a number' },
    features: new Set(['shader-f16', 'timestamp-query']),
    requestDevice: vi.fn(async () => device), device,
  };
}
const request: WorkerRequest = { directory: 'model', files: [], messages: [{ role: 'user', content: 'Delete the arrow' }],
  maxNewTokens: 8, maxInputTokens: 64, requireArchitecture: 'ampere' };

describe('on-device model worker adapter', () => {
  let posted: WorkerReply[];
  let getDirectory: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules();
    posted = [];
    vi.stubGlobal('postMessage', (reply: WorkerReply) => posted.push(reply));
    vi.spyOn(self, 'postMessage').mockImplementation(((reply: WorkerReply) => { posted.push(reply); }) as typeof self.postMessage);
    getDirectory = vi.fn(async () => { throw new Error('stop after the adapter check'); });
    runtime.fromPretrained.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const run = async (chosen: ReturnType<typeof adapter>) => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn(async () => chosen) }, storage: { getDirectory } });
    await import('../../src/onDeviceModel/model.worker');
    await (self.onmessage as (event: MessageEvent<WorkerRequest>) => Promise<void>)({ data: request } as MessageEvent<WorkerRequest>);
  };

  it('reports the adapter, then refuses one the run does not allow before reading any model file', async () => {
    const quadro = adapter('maxwell');
    await run(quadro);
    expect(posted[0]).toEqual({ type: 'adapter', adapter: { vendor: 'nvidia', architecture: 'maxwell', description: '' } });
    expect(posted[1]).toMatchObject({ type: 'result', result: { status: 'error', code: 'gpu-adapter',
      adapter: { architecture: 'maxwell' } } });
    expect(quadro.requestDevice).not.toHaveBeenCalled();
    expect(getDirectory).not.toHaveBeenCalled();
    expect(runtime.fromPretrained).not.toHaveBeenCalled();
  });

  it('creates the device from its own adapter, with every limit and feature, before reading model files', async () => {
    const ampere = adapter('ampere');
    await run(ampere);
    expect(posted[0]).toEqual({ type: 'adapter', adapter: { vendor: 'nvidia', architecture: 'ampere', description: '' } });
    expect(ampere.requestDevice).toHaveBeenCalledWith({
      requiredLimits: { maxBufferSize: 4_294_967_296, maxStorageBufferBindingSize: 2_147_483_648 },
      requiredFeatures: ['shader-f16', 'timestamp-query'] });
    expect(getDirectory).toHaveBeenCalled();
  });

  it('asks for the GPU chosen in Preferences and refuses another before reading any model file', async () => {
    const ampere = adapter('ampere');
    const requestAdapter = vi.fn(async () => ampere);
    vi.stubGlobal('navigator', { gpu: { requestAdapter }, storage: { getDirectory } });
    await import('../../src/onDeviceModel/model.worker');
    const chosen = { ...request, requireArchitecture: undefined, gpu: { powerPreference: 'low-power' as const, vendor: 'intel', architecture: 'xe' } };
    await (self.onmessage as (event: MessageEvent<WorkerRequest>) => Promise<void>)({ data: chosen } as MessageEvent<WorkerRequest>);
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'low-power' });
    expect(posted[1]).toMatchObject({ type: 'result', result: { status: 'error', code: 'gpu-changed',
      message: 'This browser now offers NVIDIA · Ampere instead of Intel · Xe.' } });
    expect(ampere.requestDevice).not.toHaveBeenCalled();
    expect(getDirectory).not.toHaveBeenCalled();
  });

  it('hands that device to ONNX Runtime in the WebGPU EP options', async () => {
    const ampere = adapter('ampere');
    const file = { getSize: () => 4, read: () => 0, close: vi.fn() };
    const handle = { createSyncAccessHandle: async () => file, getFile: async () => new Blob() };
    getDirectory.mockImplementation(async () => ({ getDirectoryHandle: async () => ({ getFileHandle: async () => handle }) }));
    runtime.tokenizer.mockResolvedValue({ apply_chat_template: () => ({ input_ids: { data: [1, 2] } }), eos_token_id: 2 });
    runtime.fromPretrained.mockRejectedValue(new Error('no model in a unit test'));
    request.files = [{ path: 'onnx/model_q4.onnx_data', bytes: 4, sha256: '' }];
    await run(ampere);
    const options = runtime.fromPretrained.mock.calls[0][1] as { session_options: { executionProviders: { name: string; device: unknown }[] } };
    expect(options.session_options.executionProviders[0]).toMatchObject({ name: 'webgpu', device: ampere.device });
    expect(posted.at(-1)).toMatchObject({ type: 'result', result: { status: 'error', adapter: { architecture: 'ampere' } } });
  });
});
