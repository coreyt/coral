/// <reference lib="webworker" />
import type { PlanPreviewReply, PlanPreviewRequest } from './stage';

// As in layout.worker.ts: a stub `document`, set before ELK loads, keeps
// elk.bundled.js a plain library instead of taking over this worker.
(globalThis as { document?: unknown }).document ??= {};
const stage = import('./stage');

self.addEventListener('message', (event: MessageEvent<PlanPreviewRequest>) => {
  void stage.then(({ runPlanPreviewTask }) => runPlanPreviewTask(event.data)).then(
    (reply) => self.postMessage(reply satisfies PlanPreviewReply),
    (error: unknown) => self.postMessage({ ok: false,
      error: error instanceof Error ? error.message : String(error) } satisfies PlanPreviewReply),
  );
});
