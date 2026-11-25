/**
 * Exchange lifecycle for the on-device editing model (R-066 AC-5, AC-6;
 * coralsmol integration plan W-7 and W-10). Ported from
 * dev/experiments/coralsmol/browser/client.mjs.
 *
 * Each exchange gets a fresh worker that loads the verified model, generates
 * one reply and is ended. One exchange runs at a time. Stop, the load and
 * generation timeouts, and worker or GPU loss end the worker at once. Ending
 * an exchange detaches its handlers and terminates its worker, so a late
 * reply cannot settle a newer exchange.
 */
import type { GpuChoice } from './gpu';
import type { ModelFile } from './storage';
import type { ChatMessage } from './translator';
import type { AdapterInfo, WorkerReply, WorkerRequest } from './model.worker';

export const LOAD_TIMEOUT_MS = 180_000;
export const GENERATION_TIMEOUT_MS = 60_000;

export type ExchangeResult =
  | { status: 'ok'; text: string; adapter: AdapterInfo }
  | { status: 'truncated' }
  | { status: 'cancelled' }
  | { status: 'timeout'; phase: 'loading' | 'working' }
  | { status: 'worker-lost' }
  | { status: 'busy' }
  | { status: 'error'; code: string; message: string; adapter?: AdapterInfo };

export interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export interface ClientOptions {
  directory: string;
  files: ModelFile[];
  tokenCaps: { input: number; output: number };
  createWorker?: () => WorkerLike;
  /** Acceptance harnesses only: the worker refuses any other adapter architecture before loading. */
  requireArchitecture?: string;
  /** The GPU chosen in Preferences, read at each exchange. */
  gpu?: () => GpuChoice | null;
  /** Called with the adapter each worker chose, before it reads a model file. */
  onAdapter?: (adapter: AdapterInfo) => void;
}

interface Active { worker: WorkerLike; timer: ReturnType<typeof setTimeout>; resolve: (result: ExchangeResult) => void }

export class OnDeviceModelClient {
  private active: Active | null = null;
  private readonly createWorker: () => WorkerLike;

  constructor(private readonly options: ClientOptions) {
    this.createWorker = options.createWorker
      ?? (() => new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
  }

  get busy() { return this.active !== null; }

  /** Runs one exchange in a fresh worker; the worker always ends afterwards. */
  run(messages: ChatMessage[]): Promise<ExchangeResult> {
    if (this.active) return Promise.resolve({ status: 'busy' });
    let worker: WorkerLike;
    try { worker = this.createWorker(); } catch (error) {
      return Promise.resolve({ status: 'error', code: 'worker-create', message: (error as Error).message });
    }
    return new Promise(resolve => {
      const active: Active = { worker, resolve,
        timer: setTimeout(() => this.end(active, { status: 'timeout', phase: 'loading' }), LOAD_TIMEOUT_MS) };
      this.active = active;
      worker.onmessage = ({ data }) => {
        if (data.type === 'adapter') { this.options.onAdapter?.(data.adapter); return; }
        if (data.type === 'working') {
          clearTimeout(active.timer);
          active.timer = setTimeout(() => this.end(active, { status: 'timeout', phase: 'working' }), GENERATION_TIMEOUT_MS);
          return;
        }
        const result = data.result;
        if (result.status === 'error') this.end(active, result);
        else if (result.finish === 'length') this.end(active, { status: 'truncated' });
        else this.end(active, { status: 'ok', text: result.text, adapter: result.adapter });
      };
      worker.onerror = event => { event.preventDefault?.(); this.end(active, { status: 'worker-lost' }); };
      worker.onmessageerror = () => this.end(active, { status: 'worker-lost' });
      const gpu = this.options.gpu?.();
      try {
        worker.postMessage({ directory: this.options.directory, files: this.options.files, messages,
          maxNewTokens: this.options.tokenCaps.output, maxInputTokens: this.options.tokenCaps.input,
          ...(this.options.requireArchitecture ? { requireArchitecture: this.options.requireArchitecture } : {}),
          ...(gpu ? { gpu } : {}) });
      } catch (error) {
        this.end(active, { status: 'error', code: 'worker-send', message: (error as Error).message });
      }
    });
  }

  /** **Stop**: ends the worker; the next request reloads from OPFS. */
  stop() {
    if (this.active) this.end(this.active, { status: 'cancelled' });
  }

  private end(active: Active, result: ExchangeResult) {
    if (this.active !== active) return;
    this.active = null;
    clearTimeout(active.timer);
    active.worker.onmessage = active.worker.onerror = active.worker.onmessageerror = null;
    active.worker.terminate();
    active.resolve(result);
  }
}
