import {
  LayoutExecutionError,
  computeElkLayout,
  type LayoutRequest,
  type LayoutResult,
} from '@coral-viz/render/layout';

export interface LayoutWorkerLike {
  postMessage(value: unknown): void;
  addEventListener(type: 'message' | 'error', listener: EventListener): void;
  removeEventListener(type: 'message' | 'error', listener: EventListener): void;
  terminate(): void;
}

export type LayoutWorkerFactory = () => LayoutWorkerLike;

export function countLayoutNodes(nodes: LayoutRequest['nodes']): number {
  return nodes.reduce((total, node) => total + 1 + countLayoutNodes(node.children ?? []), 0);
}

function abortError(): Error {
  const error = new Error('Layout aborted');
  error.name = 'AbortError';
  return error;
}

async function fallback(request: LayoutRequest, signal?: AbortSignal): Promise<LayoutResult> {
  if (signal?.aborted) throw abortError();
  if (countLayoutNodes(request.nodes) > 100) {
    throw new LayoutExecutionError({
      code: 'layout.worker.unavailable', severity: 'error',
      message: 'Layout worker unavailable for a graph over 100 nodes',
    });
  }
  const result = await computeElkLayout(request, { signal });
  return { ...result, diagnostics: [...result.diagnostics, {
    code: 'layout.worker.fallback', severity: 'warning',
    message: 'Layout worker unavailable; used bounded main-thread layout',
  }] };
}

function defaultWorkerFactory(): LayoutWorkerLike {
  return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }) as unknown as LayoutWorkerLike;
}

export async function runEditorLayout(
  request: LayoutRequest,
  options: { signal?: AbortSignal; workerFactory?: LayoutWorkerFactory } = {},
): Promise<LayoutResult> {
  const { signal } = options;
  if (signal?.aborted) throw abortError();
  if (!options.workerFactory && typeof Worker === 'undefined') return fallback(request, signal);

  let worker: LayoutWorkerLike;
  try {
    worker = (options.workerFactory ?? defaultWorkerFactory)();
  } catch {
    return fallback(request, signal);
  }

  return new Promise<LayoutResult>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      action();
    };
    const useFallback = () => finish(() => { void fallback(request, signal).then(resolve, reject); });
    const onMessage = ((event: MessageEvent<{ ok: boolean; result?: LayoutResult }>) => {
      if (event.data.ok && event.data.result) finish(() => resolve(event.data.result!));
      else useFallback();
    }) as EventListener;
    const onError = (() => useFallback()) as EventListener;
    const onAbort = () => finish(() => reject(abortError()));
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      worker.postMessage(request);
    } catch {
      useFallback();
    }
  });
}
