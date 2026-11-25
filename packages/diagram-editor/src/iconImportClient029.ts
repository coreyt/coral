import type { IconImportMeasures029 } from '@coral-viz/render/artwork-import';
import type { SvgViewBox029 } from '@coral-viz/render';
export type IconImportResult029 = { ok: true; name: string; text: string; viewBox: SvgViewBox029;
  measures: IconImportMeasures029; bounds: { overhang: number; allowance: number }; notices: string[]; elapsedMs: number }
  | { ok: false; name: string; error: string };
/** Import is worker-only. Cancellation retires the whole batch and its results. */
export function importIcons029(files: { name: string; text: string }[], signal: AbortSignal,
  factory = () => new Worker(new URL('./iconImport.worker.ts', import.meta.url), { type: 'module' })): Promise<IconImportResult029[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Import cancelled.', 'AbortError')); return; }
    if (files.length > 256 || files.reduce((n, f) => n + new TextEncoder().encode(f.text).length, 0) > 4_194_304) {
      reject(new Error('Import at most 256 files and 4 MiB per batch.')); return;
    }
    let worker: Worker;
    try { worker = factory(); } catch { reject(new Error('SVG import needs a browser worker.')); return; }
    let settled = false;
    const finish = (error?: Error, results?: IconImportResult029[]) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal.removeEventListener('abort', cancel); worker.terminate();
      if (error) reject(error); else resolve(results!);
    };
    const cancel = () => finish(new DOMException('Import cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('SVG import timed out. Try a smaller batch.')), 15_000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<{ results?: IconImportResult029[]; error?: string }>) => {
      if (event.data.results) finish(undefined, event.data.results); else finish(new Error(event.data.error ?? 'SVG import failed.'));
    };
    worker.onerror = () => finish(new Error('SVG import worker failed.'));
    try { worker.postMessage({ files }); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
