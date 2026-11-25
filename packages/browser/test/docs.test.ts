import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
// Exercise shipped ESM in Node, without Vitest transforming the built bundle.
async function nativeConsumer(code: string, cwd: string) {
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd, timeout: 5000, maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

it('executes the exact documented ESM example against the built package', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const built = resolve(root, 'packages/browser/dist/coral-browser.js');
  if (!existsSync(built)) throw new Error('Build @coral-viz/browser before running the documentation example.');
  const exampleUrl = pathToFileURL(resolve(root, 'docs/embed/examples/browser-esm.mjs')).href;
  const example = await nativeConsumer(`
    const { source, result } = await import(${JSON.stringify(exampleUrl)});
    process.stdout.write(JSON.stringify({ source, result }));
  `, root) as { source: string; result: { svg: string; diagnostics: unknown[] } };
  expect(example.source).toMatch(/^@diagram architecture\n/);
  expect(example.source).toContain('api -> orders');
  expect(example.result.svg).toContain('<svg');
  expect(example.result.svg).toContain('Order service');
  expect(example.result.diagnostics).toEqual([]);
});

it('renders both documented script-tag Coral sources with the current grammar', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const built = resolve(root, 'packages/browser/dist/coral-browser.js');
  if (!existsSync(built)) throw new Error('Build @coral-viz/browser before running the documentation example.');
  const html = readFileSync(resolve(root, 'docs/embed/examples/browser-script.html'), 'utf8');
  const snippets = [
    html.match(/<pre data-coral>\n([\s\S]*?)\n<\/pre>/)?.[1],
    html.match(/<coral-diagram>([\s\S]*?)<\/coral-diagram>/)?.[1],
  ];
  const results = await nativeConsumer(`
    const browser = await import(${JSON.stringify(pathToFileURL(built).href)});
    const results = [];
    for (const source of ${JSON.stringify(snippets)}) results.push(await browser.render(source));
    process.stdout.write(JSON.stringify(results));
  `, root) as Array<{ svg: string; diagnostics: unknown[] }>;
  expect(results).toHaveLength(snippets.length);
  for (const [index, source] of snippets.entries()) {
    expect(source).toMatch(/^@diagram architecture\n/);
    const result = results[index]!;
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('<svg');
  }
});
