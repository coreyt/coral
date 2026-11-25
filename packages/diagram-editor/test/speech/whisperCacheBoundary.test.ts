import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Whisper online-required cache boundary', () => {
  it('disables Transformers browser and WASM caching before pipeline creation', () => {
    const source = readFileSync(join(process.cwd(), 'src/speech/whisper.worker.ts'), 'utf8');
    const browserCache = source.indexOf('env.useBrowserCache = false');
    const wasmCache = source.indexOf('env.useWasmCache = false');
    const pipeline = source.indexOf("pipeline = await createPipeline");
    expect(browserCache).toBeGreaterThan(0);
    expect(wasmCache).toBeGreaterThan(browserCache);
    expect(pipeline).toBeGreaterThan(wasmCache);
    expect(source).not.toContain("env.cacheKey = 'transformers-cache'");
  });
});
