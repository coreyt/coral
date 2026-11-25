import { expect, test, type Page } from '@playwright/test';
import { benchmarkEnvironment } from '../scripts/performance-policy.mjs';
import { waypointPaintSource029 } from '../packages/render/test/fixtures/waypointPaint029.js';
import { openBuffer, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

// Keep continuous recording outside measured interaction work, as in the
// shared performance configuration. Functional waypoint cases run separately in normal browser CI.
test.use({ trace: 'off', video: 'off' });
const SAMPLE_COUNT = Number.parseInt(process.env.CORAL_SCENE_SAMPLES ?? '20', 10);
const percentile = (samples: number[], fraction: number): number => {
  const values = [...samples].sort((a, b) => a - b);
  return values[Math.ceil(values.length * fraction) - 1]!;
};

async function nextPaint(page: Page, type: 'pointermove' | 'click') {
  await page.evaluate((eventType) => {
    const target = eventType === 'click'
      ? document.querySelector('[aria-label="Zoom in"]') : document;
    const state = window as unknown as { __scenePaint?: Promise<number>;
      __scenePaintStage?: string };
    state.__scenePaintStage = 'armed';
    state.__scenePaint = Promise.race([
      new Promise<number>((resolve) => target?.addEventListener(eventType, (event) => {
        state.__scenePaintStage = 'event';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          state.__scenePaintStage = 'paint';
          resolve(performance.now() - event.timeStamp);
        }));
      }, { once: true, capture: true })),
      new Promise<number>((resolve) => setTimeout(() => resolve(-1), 5000)),
    ]);
  }, type);
}

async function afterTwoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test('waypoint routing with twelve connectors keeps drag input-to-paint p95 within 45 ms', async ({ page, browser }) => {
  const policy = benchmarkEnvironment({ browserVersion: browser.version() });
  test.skip(!policy.measure, policy.reason);
  test.setTimeout(90_000);
  await startCleanEditor(page);
  // A saved transient editor checkpoint on a plain imported edge exercises
  // the manager. Durable source route sections stay owned by shared layout.
  const { parseInstalledDocument028 } = await import('@coral-viz/render');
  const graph = parseInstalledDocument028(waypointPaintSource029.split('route edge start0')[0]!).graph!;
  const document = { schemaVersion: '1.0.0', metadata: { name: 'Waypoint paint',
    created: '2026-10-17T00:00:00.000Z', modified: '2026-10-17T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: graph }, settings: { notation: 'block', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    edgeRouting: { start0: { isPinned: true, bendPoints: [{ x: 180, y: 120 }], waypoints: [{ id: 'edit', x: 180, y: 120, type: 'corner' }] } } };
  await openBuffer(page, { name: 'waypoint-paint029.coral.json', buffer: Buffer.from(JSON.stringify(document)) });
  await page.getByLabel('Diagram style', { exact: true }).selectOption('hifi');
  await waitForEditorSettled(page);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  await afterTwoFrames(page);
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(12);
  const edge = page.locator('.react-flow__edge[data-id="start0"]');
  await edge.focus();
  await page.keyboard.press('Enter');
  const handle = page.locator('[data-waypoint-id="edit"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const origin = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.mouse.move(origin.x, origin.y);
  await handle.evaluate((element) => element.addEventListener('pointerdown', (event) => {
    element.setAttribute('data-benchmark-pointer', String((event as PointerEvent).pointerId));
  }, { once: true, capture: true }));
  await page.mouse.down();
  const pointerId = Number(await handle.getAttribute('data-benchmark-pointer'));
  expect(pointerId).toBeGreaterThan(0);
  expect(await handle.evaluate((element, id) => element.hasPointerCapture(id), pointerId)).toBe(true);
  const samples: number[] = [];
  const shaft = page.locator('[data-coral-part-id="start0:shaft"]');
  for (let sample = 0; sample <= SAMPLE_COUNT; sample++) {
    const previous = await shaft.getAttribute('d');
    const sign = sample % 2 ? -1 : 1;
    await nextPaint(page, 'pointermove');
    await page.mouse.move(origin.x + sign * 12, origin.y + sign * 8);
    const duration = await page.evaluate(() => (window as unknown as { __scenePaint: Promise<number> }).__scenePaint);
    expect(duration).toBeGreaterThan(0);
    expect(await shaft.getAttribute('d')).not.toBe(previous);
    await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
    if (sample > 0) samples.push(duration);
  }
  await page.mouse.up();
  await waitForEditorSettled(page);
  await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(12);
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  const p95 = percentile(samples, .95);
  console.info('WAYPOINT_INPUT_TO_PAINT', JSON.stringify({ browser: browser.version(), nodes: 8, edges: 12, samples, p95 }));
  expect(p95).toBeLessThanOrEqual(45);
});
