/// <reference lib="webworker" />
import type { LayoutRequest } from '@coral-viz/render/layout';

// elk.bundled.js decides it *is* the ELK worker when it sees a global `self`
// without `document`: it takes over `self.onmessage` and exports no fake
// worker, so every `new ELK()` here failed and layout fell back to the main
// thread. A stub `document`, set before ELK loads, keeps it a plain library.
(globalThis as { document?: unknown }).document ??= {};
const layout = import('@coral-viz/render/layout');

self.addEventListener('message', (event: MessageEvent<LayoutRequest>) => {
  void layout.then(({ computeElkLayout }) => computeElkLayout(event.data)).then(
    (result) => self.postMessage({ ok: true, result }),
    (error: unknown) => self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
});
