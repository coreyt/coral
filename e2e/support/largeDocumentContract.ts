import { expect, type Page } from '@playwright/test';
import { assertPerformanceBudget, validatePerformanceSamples } from '../../scripts/performance-policy.mjs';



function documentFixture() {
  const nodes = Array.from({ length: 500 }, (_, index) => ({
    id: `n${index}`,
    type: 'process',
    label: `Node ${index}`,
    dimensions: { width: 80, height: 40 },
    position: { x: (index % 25) * 120, y: Math.floor(index / 25) * 80 },
  }));
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Slice 60 performance', created: '2026-09-10T00:00:00.000Z',
      modified: '2026-09-10T00:00:00.000Z',
    },
    content: {
      format: 'graph-ir',
      graphIR: {
        version: '2.0.0', id: 'slice60-performance', nodes,
        edges: [],
      },
    },
    settings: {
      notation: 'flowchart',
      layout: { algorithm: 'layered', direction: 'DOWN', spacing: { nodeNode: 50, layerSpacing: 70 } },
    },
    nodePositions: Object.fromEntries(nodes.map((node) => [node.id, node.position])),
  };
}

async function armNextPaint(page: Page, eventType: 'pointermove' | 'click') {
  await page.evaluate((type) => {
    const target = type === 'click'
      ? document.querySelector('[aria-label="Zoom in"]')
      : document;
    (window as unknown as { __slice60Paint?: Promise<number> }).__slice60Paint = new Promise((resolve) => {
      target?.addEventListener(type, (event) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - event.timeStamp)));
      }, { once: true, capture: true });
    });
  }, eventType);
}

async function readPaint(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __slice60Paint: Promise<number> }).__slice60Paint);
}

async function afterTwoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

interface RecoveryCheckpoint {
  timestamp: number;
  position: { x: number; y: number };
}

async function recoveryCheckpoint(page: Page, nodeId: string): Promise<RecoveryCheckpoint | null> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem('coral-diagram-recovery');
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      timestamp?: number;
      nodePositions?: Record<string, { x: number; y: number }>;
    };
    const position = data.nodePositions?.[id];
    return typeof data.timestamp === 'number' && position
      ? { timestamp: data.timestamp, position }
      : null;
  }, nodeId);
}

export async function largeDocumentContract(page: Page, measure = false) {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'slice60-performance.coral.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(documentFixture())),
  });
  await expect(page.getByTestId('status-bar')).toContainText('Loaded: 500 nodes, 0 edges', { timeout: 20_000 });
  await expect(page.locator('.react-flow__node')).toHaveCount(500);
  // Loaded documents are clean; a real metadata edit enables auto-recovery
  // before the checkpoint wait and equivalent-state measurement loop.
  await page.getByLabel('Document name').fill('Slice 80 performance');
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  await afterTwoFrames(page);

  const nodeId = await page.locator('.react-flow__node').evaluateAll((elements) => {
    const center = { x: innerWidth * 0.55, y: innerHeight * 0.5 };
    return elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.getAttribute('data-id'),
          rect,
          distance: Math.hypot(rect.x + rect.width / 2 - center.x, rect.y + rect.height / 2 - center.y),
        };
      })
      .filter(({ id, rect }) => id && rect.left >= 0 && rect.right <= innerWidth
        && rect.top >= 48 && rect.bottom <= innerHeight - 48)
      .sort((a, b) => a.distance - b.distance)[0]?.id;
  });
  expect(nodeId).toBeTruthy();
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  await expect.poll(() => recoveryCheckpoint(page, nodeId!)).not.toBeNull();
  let settledRecovery = (await recoveryCheckpoint(page, nodeId!))!;
  const dragSamples: number[] = [];
  for (let index = -1; index < (measure ? 20 : 0); index += 1) {
    const before = await node.evaluate((element) => (element as HTMLElement).style.transform);
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Cross React Flow's drag threshold before timing a steady-state update.
    await page.mouse.move(x + 24, y + 12, { steps: 4 });
    await afterTwoFrames(page);
    if (measure) await armNextPaint(page, 'pointermove');
    await page.mouse.move(x + 32, y + 16);
    const duration = measure ? await readPaint(page) : 0;
    if (measure) validatePerformanceSamples('input-to-frame', [duration], 1);
    await page.mouse.up();
    await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(before);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.transform)).toBe(before);
    const previousRecovery = settledRecovery;
    await expect.poll(async () => {
      const current = await recoveryCheckpoint(page, nodeId!);
      return current && current.timestamp > previousRecovery.timestamp
        && current.position.x === previousRecovery.position.x
        && current.position.y === previousRecovery.position.y;
    }, { timeout: 10_000 }).toBe(true);
    settledRecovery = (await recoveryCheckpoint(page, nodeId!))!;
    await afterTwoFrames(page);
    if (measure && index >= 0) dragSamples.push(duration);
  }

  const zoomSamples: number[] = [];
  const viewport = page.locator('.react-flow__viewport');
  for (let index = -1; index < (measure ? 20 : 0); index += 1) {
    const before = await viewport.getAttribute('style');
    if (measure) await armNextPaint(page, 'click');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const duration = measure ? await readPaint(page) : 0;
    if (measure) validatePerformanceSamples('input-to-frame', [duration], 1);
    await expect.poll(() => viewport.getAttribute('style')).not.toBe(before);
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect.poll(() => viewport.getAttribute('style')).toBe(before);
    await afterTwoFrames(page);
    if (measure && index >= 0) zoomSamples.push(duration);
  }

  if (measure) {
    assertPerformanceBudget({ name: '500-node drag input-to-frame p95', samples: dragSamples,
      expectedSamples: 20, percentile: .95, limit: 45 });
    assertPerformanceBudget({ name: '500-node zoom input-to-frame p95', samples: zoomSamples,
      expectedSamples: 20, percentile: .95, limit: 55 });
  }
}
