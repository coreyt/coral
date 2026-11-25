import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { benchmarkEnvironment, validatePerformanceSamples } from '../scripts/performance-policy.mjs';
import { CALIBRATION_ARTWORKS_029, calibrationDocument029 } from '../packages/render/test/fixtures/svgArtworkCalibration029.js';
import { openPage } from './support/browserRenderContract.js';

// coral.svg-artwork 1 budget calibration M4 (calibration-design.md): the
// browser package draws 1, 100 and 500 artwork instances in Chromium, and the
// drawing is zoomed. Report-only.

const SAMPLES = 10;
const percentile = (values: number[], fraction: number) =>
  Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!);

/** Milliseconds from a host transform change to the second animation frame,
 * and to a completed screenshot, which waits for a rasterized frame. */
async function zoomOnce(page: Page, scale: number): Promise<[number, number]> {
  const started = Date.now();
  const frame = await page.evaluate((value) => {
    const begin = performance.now();
    document.getElementById('host')!.style.transform = `scale(${value})`;
    return new Promise<number>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - begin))));
  }, scale);
  await page.screenshot();
  return [frame, Date.now() - started];
}

test('SVG artwork calibration: browser drawing and zoom with 1, 100 and 500 instances', async ({ browser }) => {
  const policy = benchmarkEnvironment({ browserVersion: browser.version() });
  test.skip(!policy.measure, policy.reason);
  test.setTimeout(900_000);
  const bundle = readFileSync(resolve(__dirname, '../packages/browser/dist/coral-browser.iife.js'), 'utf8');
  const observations = [];
  for (const [name, artwork] of Object.entries(CALIBRATION_ARTWORKS_029)) {
    for (const instances of [1, 100, 500]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      try {
        const page = await openPage(context, bundle);
        const drawMs = await page.evaluate(async (source) => {
          const host = Object.assign(document.createElement('div'), { id: 'host' });
          host.style.transformOrigin = '0 0';
          document.body.append(host);
          const begin = performance.now();
          await (window as unknown as { Coral: { renderTo: (target: Element, text: string) => Promise<unknown> } })
            .Coral.renderTo(host, source);
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          return performance.now() - begin;
        }, calibrationDocument029([artwork()], instances));
        const drawn = await page.evaluate(() => {
          const host = document.getElementById('host')!;
          const root = host.shadowRoot ?? host.querySelector('span[data-coral-surface]')?.shadowRoot;
          const svg = root?.querySelector('svg');
          const box = svg?.getBoundingClientRect();
          return { uses: root?.querySelectorAll('[data-coral-artwork] use').length ?? 0,
            symbols: root?.querySelectorAll('symbol').length ?? 0,
            fit: box ? Math.min(1, 1280 / box.width, 720 / box.height) : 1 };
        });
        expect(drawn.uses).toBe(instances);
        expect(drawn.symbols).toBe(1);
        const zoom: number[][] = [];
        for (let sample = 0; sample <= SAMPLES; sample++) {
          const timing = await zoomOnce(page, drawn.fit * (sample % 2 ? 1 : 1.25));
          if (sample > 0) zoom.push(timing);
        }
        const frames = zoom.map(([frame]) => frame!), shots = zoom.map(([, shot]) => shot!);
        validatePerformanceSamples('artwork zoom frame', frames, SAMPLES);
        validatePerformanceSamples('artwork zoom screenshot', shots, SAMPLES);
        observations.push({ artwork: name, instances, drawMs: Math.round(drawMs),
          zoomFrameP95Ms: percentile(frames, 0.95), zoomScreenshotP50Ms: percentile(shots, 0.5),
          zoomScreenshotP95Ms: percentile(shots, 0.95) });
      } finally { await context.close(); }
    }
  }
  console.info('SVG_ARTWORK_BROWSER_ZOOM', JSON.stringify({ browser: browser.version(), observations }));
});
