import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { assertPerformanceBudget, validatePerformanceSamples } from '../../scripts/performance-policy.mjs';

const ORIGIN = 'http://coral.test';
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Render contract</title></head><body>
<script src="/load.js"></script></body></html>`;
const LOAD = `window.__loaded = new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = '/coral-browser.iife.js';
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Browser bundle failed to load'));
  document.head.append(script);
});`;

export async function openPage(context: BrowserContext, bundle: string) {
  await context.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const files: Record<string, [string, string]> = {
      '/': [HTML, 'text/html'], '/load.js': [LOAD, 'text/javascript'],
      '/coral-browser.iife.js': [bundle, 'text/javascript'],
    };
    const file = files[path];
    if (!file) throw new Error(`Unexpected request ${route.request().url()}`);
    await route.fulfill({ status: 200, body: file[0], headers: { 'content-type': `${file[1]}; charset=utf-8` } });
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => (window as unknown as { __loaded: Promise<void> }).__loaded);
  return page;
}

async function renderOnce(page: Page, source: string, measure: boolean) {
  const result = await page.evaluate(async ({ source, measure }) => {
    const started = measure ? performance.now() : 0;
    const result = await (window as unknown as { Coral: { render: (text: string) =>
      Promise<{ svg: string; graph: { nodes: unknown[] } }> } }).Coral.render(source);
    const duration = measure ? performance.now() - started : 0;
    return { duration, svg: result.svg, nodes: result.graph.nodes.length };
  }, { source, measure });
  if (measure) validatePerformanceSamples('browser render', [result.duration], 1);
  // Validation is outside the render clock, and remains blocking in both modes.
  expect(result.svg).toContain('<svg');
  expect(result.nodes).toBe(25);
  return result.duration;
}

export async function browserRenderContract(browser: Browser, measure = false) {
  // Load fixture assets only after the benchmark environment has been accepted.
  const root = resolve(__dirname, '../..');
  const bundle = readFileSync(resolve(root, 'packages/browser/dist/coral-browser.iife.js'), 'utf8');
  const source = readFileSync(resolve(root, 'packages/browser/test/fixtures/flowchart-25.coral'), 'utf8');
  const cold: number[] = [];
  for (let sample = 0; sample < (measure ? 30 : 1); sample += 1) {
    const context = await browser.newContext();
    try { cold.push(await renderOnce(await openPage(context, bundle), source, measure)); }
    finally { await context.close(); }
  }
  const context = await browser.newContext();
  const repeat: number[] = [];
  try {
    const page = await openPage(context, bundle);
    await renderOnce(page, source, measure);
    for (let sample = 0; sample < (measure ? 50 : 1); sample += 1) {
      repeat.push(await renderOnce(page, source, measure));
    }
  } finally { await context.close(); }
  if (measure) {
    assertPerformanceBudget({ name: '25-node cold render p95', samples: cold,
      expectedSamples: 30, percentile: .95, limit: 500 });
    assertPerformanceBudget({ name: '25-node repeat render p95', samples: repeat,
      expectedSamples: 50, percentile: .95, limit: 200 });
  }
}
