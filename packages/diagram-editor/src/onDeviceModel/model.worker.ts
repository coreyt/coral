/**
 * Dedicated module worker for the on-device editing model (R-066; coralsmol
 * integration plan W-7 and W-13). One worker serves one exchange: the client
 * ends it afterwards, which bounds memory (R-066 AC-6).
 *
 * The P1 runtime: WebGPU on a real adapter, Q4 weights, one ONNX Runtime
 * thread, `lazyRelease` buffers, greedy decoding with repetition penalty 1.0.
 * Ported from dev/experiments/coralsmol/browser/model-worker.mjs without its
 * diagnostics.
 *
 * Every model file comes from the verified OPFS copy. Transformers.js reads
 * the small files through a read-only cache, its own fetch is disabled, and
 * the weights are read synchronously from OPFS into one reused buffer. The
 * ONNX Runtime files are served from Coral's origin.
 */
import { AutoModelForCausalLM, AutoTokenizer, env } from '@huggingface/transformers';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { inputCapMessage } from './eligibility';
import { gpuName, type GpuChoice } from './gpu';
import { storedName, type ModelFile } from './storage';
import type { ChatMessage } from './translator';

export interface WorkerRequest {
  directory: string;
  files: ModelFile[];
  messages: ChatMessage[];
  maxNewTokens: number;
  maxInputTokens: number;
  /** Refuse any other adapter architecture before a model file is read (acceptance harnesses). */
  requireArchitecture?: string;
  /** The GPU chosen in Preferences; another adapter is refused before a model file is read. */
  gpu?: GpuChoice;
}
export interface AdapterInfo { vendor: string; architecture: string; description: string }
export type WorkerReply =
  /** Sent before any model file is read or placed on the GPU. */
  | { type: 'adapter'; adapter: AdapterInfo }
  | { type: 'working' }
  | { type: 'result'; result: WorkerResult };
export type WorkerResult =
  | { status: 'ok'; text: string; finish: 'eos' | 'length'; adapter: AdapterInfo }
  | { status: 'error'; code: string; message: string; adapter?: AdapterInfo };

const MODEL_ID = 'coral/on-device-model';
const EOS_TEXT = '<|im_end|>';
class WorkerFailure extends Error { constructor(readonly code: string, message: string) { super(message); } }

function configure(directory: FileSystemDirectoryHandle, files: ModelFile[]) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true; // Required when remote loading is off; every read is served by the cache below.
  env.useBrowserCache = false;
  env.useWasmCache = false;
  env.fetch = () => Promise.reject(new Error('The on-device model loads only from its verified local copy'));
  env.useCustomCache = true;
  env.customCache = {
    async match(key: string) {
      const file = files.find(f => key.endsWith(`/${f.path}`));
      if (!file || file.path.endsWith('_data')) return undefined;
      return new Response(await (await directory.getFileHandle(storedName(file.path))).getFile());
    },
    async put() { /* read-only */ },
  };
  const onnx = env.backends.onnx as unknown as { wasm: Record<string, unknown>; webgpu: Record<string, unknown> };
  onnx.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
  onnx.wasm.numThreads = 1;
  onnx.wasm.proxy = false;
}

/** Reads each weight initializer from OPFS into one reused scratch buffer. */
async function opfsWeights(directory: FileSystemDirectoryHandle, file: ModelFile) {
  const handle = await directory.getFileHandle(storedName(file.path));
  if (!('createSyncAccessHandle' in handle)) throw new WorkerFailure('opfs-sync-unavailable', 'This browser cannot read the model files synchronously');
  const access = await handle.createSyncAccessHandle();
  if (access.getSize() !== file.bytes) { access.close(); throw new WorkerFailure('size', 'Stored weights have the wrong size'); }
  let scratch = new Uint8Array(0);
  class FileBytes extends Uint8Array {
    get byteLength() { return file.bytes; }
    subarray(start: number, end: number) {
      if (end - start > scratch.length) scratch = new Uint8Array(end - start);
      const view = new Uint8Array(scratch.buffer, 0, end - start);
      if (access.read(view, { at: start }) !== view.length) throw new Error('Short weights read');
      return view as unknown as Uint8Array<ArrayBuffer>;
    }
  }
  return { data: new FileBytes(0), close: () => access.close() };
}

/**
 * The device ONNX Runtime runs on, from the adapter this worker chose. ORT's
 * WebGPU EP ignores `env.webgpu.adapter` and requests its own adapter unless
 * the EP options carry a device, so the device is created here, with every
 * limit and feature the adapter offers (a superset of what ORT asks for).
 */
export async function requestModelDevice(adapter: GPUAdapter): Promise<GPUDevice> {
  const requiredLimits: Record<string, number> = {};
  for (const key in adapter.limits) {
    const value = adapter.limits[key as keyof GPUSupportedLimits];
    if (typeof value === 'number') requiredLimits[key] = value;
  }
  return adapter.requestDevice({ requiredLimits, requiredFeatures: [...adapter.features] as GPUFeatureName[] });
}

let chosen: AdapterInfo | undefined;

async function run(request: WorkerRequest): Promise<WorkerResult> {
  const powerPreference = request.gpu?.powerPreference ?? 'high-performance';
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference });
  if (!adapter || adapter.info.isFallbackAdapter) throw new WorkerFailure('gpu-adapter', 'A real WebGPU adapter is required');
  const info = chosen = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description };
  self.postMessage({ type: 'adapter', adapter: info } satisfies WorkerReply);
  if (request.requireArchitecture && info.architecture !== request.requireArchitecture) {
    throw new WorkerFailure('gpu-adapter', `This run requires a ${request.requireArchitecture} adapter, not ${info.architecture}`);
  }
  if (request.gpu && (info.vendor !== request.gpu.vendor || info.architecture !== request.gpu.architecture)) {
    throw new WorkerFailure('gpu-changed', `This browser now offers ${gpuName(info)} instead of ${gpuName(request.gpu)}.`);
  }
  const device = await requestModelDevice(adapter);
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(request.directory);
  configure(directory, request.files);
  const webgpu = (env.backends.onnx as unknown as { webgpu: Record<string, unknown> }).webgpu;
  webgpu.adapter = adapter;
  webgpu.powerPreference = powerPreference;

  const weightsFile = request.files.find(f => f.path.endsWith('model_q4.onnx_data'));
  if (!weightsFile) throw new WorkerFailure('manifest', 'The manifest names no weights file');
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { local_files_only: true });
  // Refuse an over-long prompt before the costly model load.
  const inputs = tokenizer.apply_chat_template(request.messages, {
    add_generation_prompt: true, tokenize: true, return_tensor: true, return_dict: true, truncation: false, padding: false,
  }) as { input_ids: { data: ArrayLike<bigint | number> } };
  const inputIds = Array.from(inputs.input_ids.data, Number);
  if (inputIds.length > request.maxInputTokens) {
    throw new WorkerFailure('input-cap', inputCapMessage(inputIds.length, request.maxInputTokens));
  }
  const weights = await opfsWeights(directory, weightsFile);
  let model;
  try {
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      device: 'webgpu', dtype: 'q4', local_files_only: true, use_external_data_format: false,
      session_options: {
        executionProviders: [{ name: 'webgpu', device, storageBufferCacheMode: 'lazyRelease', uniformBufferCacheMode: 'lazyRelease',
          queryResolveBufferCacheMode: 'lazyRelease', defaultBufferCacheMode: 'lazyRelease' }],
        externalData: [{ path: 'model_q4.onnx_data', data: weights.data }],
      } as never,
    });
  } finally { weights.close(); }
  // GPU device loss ends the worker; the client reports that the model stopped.
  void Promise.resolve(device)
    .then(device => device?.lost.then(info => {
      self.postMessage({ type: 'result',
        result: { status: 'error', code: 'gpu-lost', message: info.message || 'The GPU device was lost' } } satisfies WorkerReply);
      self.close();
    }))
    .catch(() => {});
  self.postMessage({ type: 'working' } satisfies WorkerReply);

  const eos = (model.generation_config as { eos_token_id?: number | number[] } | null)?.eos_token_id ?? tokenizer.eos_token_id;
  const eosIds = (Array.isArray(eos) ? eos : [eos]) as number[];
  const output = await model.generate({ ...inputs, max_new_tokens: request.maxNewTokens, min_new_tokens: 0,
    do_sample: false, num_beams: 1, repetition_penalty: 1.0, return_dict_in_generate: false } as never) as { data: ArrayLike<bigint | number> };
  const all = Array.from(output.data, Number);
  if (!inputIds.every((token, i) => all[i] === token)) throw new WorkerFailure('runtime-output', 'Generation did not keep the prompt');
  const generated = all.slice(inputIds.length);
  const finish = eosIds.includes(generated[generated.length - 1]) ? 'eos' : 'length';
  // Special tokens are kept; only a final end-of-sequence marker is trimmed.
  let text = tokenizer.decode(generated, { skip_special_tokens: false, clean_up_tokenization_spaces: false });
  if (finish === 'eos' && text.endsWith(EOS_TEXT)) text = text.slice(0, -EOS_TEXT.length);
  return { status: 'ok', text, finish, adapter: info };
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let result: WorkerResult;
  try { result = await run(data); } catch (error) {
    result = { status: 'error', code: error instanceof WorkerFailure ? error.code : 'runtime', message: (error as Error).message,
      ...(chosen ? { adapter: chosen } : {}) };
  }
  self.postMessage({ type: 'result', result } satisfies WorkerReply);
};
