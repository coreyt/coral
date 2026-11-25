import { expect, type Page } from '@playwright/test';
import { assertPerformanceBudget, validatePerformanceSamples } from '../../scripts/performance-policy.mjs';


const SAMPLE_COUNT = 20;


function sceneFixture() {
  const regular = Array.from({ length: 348 }, (_, index) => ({
    id: `n${index}`, type: 'process', symbol: 'flowchart-process',
    label: `Review account provision workflow step ${index}`,
    dimensions: { width: 210, height: 82 },
    position: { x: (index % 25) * 240, y: Math.floor(index / 25) * 125 },
  }));
  const nested = { id: 'nested', type: 'process', symbol: 'flowchart-process',
    label: 'Nested review and long-label content',
    dimensions: { width: 250, height: 165 },
    position: { x: 25 * 240, y: 13 * 125 },
    children: [{ id: 'nested-child', type: 'process', symbol: 'flowchart-process',
      label: 'Nested approval', position: { x: 25, y: 70 },
      dimensions: { width: 190, height: 70 } }],
  };
  const edges = Array.from({ length: 350 }, (_, index) => ({
    id: `e${index}`, source: `n${index % 348}`,
    target: `n${(index + 1 + (index >= 347 ? 7 : 0)) % 348}`,
    label: `transition ${index}: approved or review required`,
    targetEnd: { marker: { kind: 'arrow', fill: 'filled' } },
  }));
  const nodes = [...regular, nested];
  return {
    schemaVersion: '1.0.0',
    metadata: { name: '0.2.8 scene performance',
      created: '2026-10-13T00:00:00.000Z', modified: '2026-10-13T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: { version: '3.0.0', id: 'scene-350',
      metadata: { notation: 'flowchart' }, nodes, edges } },
    settings: { notation: 'flowchart',
      layout: { algorithm: 'layered', direction: 'DOWN',
        spacing: { nodeNode: 50, layerSpacing: 70 } } },
    nodePositions: Object.fromEntries(regular.map((node) => [node.id, node.position])),
  };
}

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

export async function sceneContract(page: Page, measure = false) {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'scene-350.coral.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sceneFixture())),
  });
  const summary = page.locator('.coral-document-summary');
  await expect(summary).toContainText('350 nodes', { timeout: 60_000 });
  await expect(summary).toContainText('350 edges');
  await expect(page.locator('.react-flow__node')).toHaveCount(350);
  await expect(page.locator('[data-coral-scene-edge]')).toHaveCount(350, { timeout: 30_000 });
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  await afterTwoFrames(page);
  const nodeId = await page.locator('.react-flow__node').evaluateAll((elements) => {
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    return elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.getAttribute('data-id'), rect,
        distance: Math.hypot(rect.x + rect.width / 2 - center.x,
          rect.y + rect.height / 2 - center.y) };
    }).filter(({ id, rect }) => id && rect.left >= 0 && rect.right <= innerWidth &&
      rect.top >= 48 && rect.bottom <= innerHeight - 48)
      .sort((a, b) => a.distance - b.distance)[0]?.id;
  });
  expect(nodeId).toBeTruthy();
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  const drag: number[] = [];
  for (let sample = 0; sample < (measure ? SAMPLE_COUNT + 1 : 1); sample += 1) {
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const direction = sample % 2 ? -1 : 1;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24 * direction, y + 12 * direction, { steps: 4 });
    if (sample === 0) await expect(page.getByLabel('Diagram editor'))
      .toHaveAttribute('data-coral-scene-transient', 'true');
    await afterTwoFrames(page);
    if (measure) await nextPaint(page, 'pointermove');
    await page.mouse.move(x + 32 * direction, y + 16 * direction);
    const duration = measure ? await page.evaluate(() =>
      (window as unknown as { __scenePaint: Promise<number> }).__scenePaint) : 0;
    if (duration < 0) throw new Error(`Drag sample ${sample} had no paint; stage ${
      await page.evaluate(() => (window as unknown as { __scenePaintStage?: string }).__scenePaintStage)}`);
    if (measure) validatePerformanceSamples('scene drag input-to-frame', [duration], 1);
    await page.mouse.up();
    await afterTwoFrames(page);
    if (measure && sample > 0) drag.push(duration);
  }
  await expect(page.getByLabel('Diagram editor'))
    .toHaveAttribute('data-coral-scene-transient', 'false');
  const zoom: number[] = [];
  const viewport = page.locator('.react-flow__viewport');
  for (let sample = 0; sample < (measure ? SAMPLE_COUNT + 1 : 1); sample += 1) {
    const before = await viewport.getAttribute('style');
    if (measure) await nextPaint(page, 'click');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const duration = measure ? await page.evaluate(() =>
      (window as unknown as { __scenePaint: Promise<number> }).__scenePaint) : 0;
    if (duration < 0) throw new Error(`Zoom sample ${sample} had no paint`);
    if (measure) validatePerformanceSamples('scene zoom input-to-frame', [duration], 1);
    await expect.poll(() => viewport.getAttribute('style')).not.toBe(before);
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect.poll(() => viewport.getAttribute('style')).toBe(before);
    await afterTwoFrames(page);
    if (measure && sample > 0) zoom.push(duration);
  }
  if (measure) {
    assertPerformanceBudget({ name: '350-node drag input-to-frame p95', samples: drag,
      expectedSamples: SAMPLE_COUNT, percentile: .95, limit: 45 });
    assertPerformanceBudget({ name: '350-node zoom input-to-frame p95', samples: zoom,
      expectedSamples: SAMPLE_COUNT, percentile: .95, limit: 55 });
  }
}
