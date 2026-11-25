import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// R-066 AC-2: until the user opts in, no model or runtime code loads. Product
// modules reach src/onDeviceModel/ only by dynamic import, from AppView,
// behind ON_DEVICE_MODEL_AVAILABLE (on for 0.2.10, owner 2026-11-15); the
// model worker, Transformers.js and ONNX Runtime start only with a request.
const src = join(import.meta.dirname, '../../src');
const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))
  .filter(path => /\.(ts|tsx|mts|mjs)$/.test(path));
const outside = files(src).filter(path => !relative(src, path).startsWith('onDeviceModel'));

describe('on-device model module graph', () => {
  it('no product module imports it statically', () => {
    const importers = outside.filter(path => /from\s+['"][^'"]*onDeviceModel/.test(readFileSync(path, 'utf8')));
    expect(importers.map(path => relative(src, path))).toEqual([]);
  });

  it('only AppView imports it, dynamically, and renders it only behind the build constant', () => {
    const importers = outside.filter(path => /import\(\s*['"][^'"]*onDeviceModel/.test(readFileSync(path, 'utf8')));
    expect(importers.map(path => relative(src, path))).toEqual(['AppView.tsx']);
    const view = readFileSync(join(src, 'AppView.tsx'), 'utf8');
    expect(view.match(/import\(\s*'\.\/onDeviceModel/g)).toHaveLength(2);
    expect(view.match(/= ON_DEVICE_MODEL_AVAILABLE \? lazy\(\(\) => import\('\.\/onDeviceModel\/ui\/OnDevice(Panel|Preference)'\)\) : null;/g)).toHaveLength(2);
  });

  it('starts the model worker only for a request, never when the client is made', () => {
    const client = readFileSync(join(src, 'onDeviceModel/client.ts'), 'utf8');
    expect(client.match(/new Worker\(/g)).toHaveLength(1);
    expect(client).toMatch(/this\.createWorker = options\.createWorker\s*\?\? \(\(\) => new Worker\(/);
    expect(client).toMatch(/run\(messages: ChatMessage\[\]\)[^]*?worker = this\.createWorker\(\)/);
  });

  // Run after `npm run build`: the main chunk holds no feature code and reaches
  // the feature's UI chunks only by dynamic import; the runtime is further away.
  const dist = join(import.meta.dirname, '../../dist');
  it.skipIf(!existsSync(join(dist, 'index.html')))('the built main chunk neither contains nor statically imports the feature', () => {
    const entry = /<script[^>]+src="[^"]*\/(assets\/[^"]+\.js)"/.exec(readFileSync(join(dist, 'index.html'), 'utf8'))![1];
    const main = readFileSync(join(dist, entry), 'utf8');
    for (const marker of ['coralsmol-compact', 'model.worker', 'transformers', 'ort-wasm']) expect(main, marker).not.toContain(marker);
    expect(main).not.toMatch(/from\s*["'`]\.\/(OnDevice|sharedModel)/);
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).not.toMatch(/OnDevice|sharedModel|model\.worker|transformers|ort-wasm/);
  });
});
