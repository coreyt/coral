/// <reference lib="webworker" />
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasmUrl from '@resvg/resvg-wasm/index_bg.wasm?url';
import { prepareSvgIconImport029, checkSvgIconBounds029 } from '@coral-viz/render/artwork-import';
const ready = initWasm(fetch(wasmUrl));
self.onmessage = async (event: MessageEvent<{ files: { name: string; text: string }[] }>) => {
  try {
    await ready;
    const results = event.data.files.map((file) => {
      const started = performance.now();
      try {
        const prepared = prepareSvgIconImport029(file.text);
        const bounds = checkSvgIconBounds029(prepared.artwork, (text) => new Resvg(text));
        return { ok: true as const, name: file.name, text: prepared.artwork.canonicalText,
          viewBox: prepared.artwork.viewBox, measures: prepared.measures, bounds,
          notices: prepared.notices, elapsedMs: performance.now() - started };
      } catch (error) { return { ok: false as const, name: file.name, error: String(error instanceof Error ? error.message : error) }; }
    });
    self.postMessage({ results });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
