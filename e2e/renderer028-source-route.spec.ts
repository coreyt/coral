import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

for (const kind of ['absolute', 'written-ends', 'node-anchor'] as const) {
  test(`authored ${kind} route executes on canvas, SVG, Reflow and reopen`, async ({ page }) => {
    const waypointSource = kind === 'absolute' ? '  turn = waypoint at (240, 180)\n  next = waypoint at (360, 180)\n'
      : kind === 'written-ends' ? '  leave = waypoint relative to first offset (20, 80)\n  arrive = waypoint relative to second offset (-20, 80)\n'
        : '  turn = waypoint relative to node api offset (120, 100)\n';
    const source = '@diagram architecture\napi service @ (20, 20) pinned\nstore service @ (500, 20) pinned\n' +
      `request = api ${kind === 'written-ends' ? '<-' : '->'} store\nroute edge request {\n${waypointSource}}\n`;
    await startCleanEditor(page);
    await openBuffer(page, { name: `route-${kind}-v1.coral`, buffer: Buffer.from(source) });
    await page.getByLabel('Diagram style', { exact: true }).selectOption('hifi');
    await waitForEditorSettled(page);
    const editor = page.getByLabel('DSL editor', { exact: true });
    const route = page.locator('.react-flow [data-coral-part-id="request:shaft"]');
    await expect(route).toBeVisible();
    const check = async () => {
      const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
      const d = await route.getAttribute('d');
      const exported = await page.evaluate((text) => new DOMParser().parseFromString(text, 'image/svg+xml')
        .querySelector('[data-coral-part-id="request:shaft"]')!.getAttribute('d'), svg);
      expect(d).toBe(exported);
      const numbers = [...d!.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map((match) => Number(match[0]));
      const points = Array.from({ length: numbers.length / 2 }, (_, index) => ({ x: numbers[index * 2], y: numbers[index * 2 + 1] }));
      if (kind === 'absolute') expect(points.slice(1, -1)).toEqual([{ x: 264, y: 204 }, { x: 384, y: 204 }]);
      if (kind === 'written-ends') {
        expect(points[1].x - points[0].x).toBeCloseTo(20, 2);
        expect(points[1].y - points[0].y).toBeCloseTo(80, 2);
        expect(points.at(-2)!.x - points.at(-1)!.x).toBeCloseTo(-20, 2);
        expect(points.at(-2)!.y - points.at(-1)!.y).toBeCloseTo(80, 2);
      }
      if (kind === 'node-anchor') {
        const node = await page.locator('.react-flow__node[data-id="api"]').evaluate((element: HTMLElement) => {
          const transform = new DOMMatrixReadOnly(element.style.transform);
          return { x: transform.m41, y: transform.m42, width: parseFloat(element.style.width), height: parseFloat(element.style.height) };
        });
        expect(points[1].x).toBeCloseTo(node.x + node.width / 2 + 120 + 24, 2);
        expect(points[1].y).toBeCloseTo(node.y + node.height / 2 + 100 + 24, 2);
      }
      await expect(editor).toHaveValue(source);
    };
    await check();
    const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
    expect(graph.edges[0].routeIntent.waypoints).toHaveLength(kind === 'node-anchor' ? 1 : 2);
    if (kind === 'written-ends') expect(graph.edges[0]).toMatchObject({ direction: 'second-to-first', routeIntent: { waypoints: [
      { placement: { anchor: { kind: 'first' } } }, { placement: { anchor: { kind: 'second' } } },
    ] } });
    await page.getByRole('button', { name: 'Reflow layout' }).click();
    await waitForEditorSettled(page);
    await check();
    const saved = await saveDocument(page);
    expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    await editor.fill('@diagram architecture\ntemporary service\n');
    await waitForEditorSettled(page);
    await openSavedDocument(page, saved.path);
    await waitForEditorSettled(page);
    await check();
    expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'))).toEqual(graph);
  });
}

test('an authored route geometry refusal keeps exact source saveable and reopenable', async ({ page }) => {
  const source = '@diagram architecture\napi service as "API" label below offset 12 @ (20, 20) pinned\n' +
    'store service @ (500, 20) pinned\nrequest = api -> store\nroute edge request {\n' +
    '  collision = waypoint at (71, 110)\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'route-caption-conflict-v1.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Show all diagnostics' }).click();
  await expect(page.getByRole('region', { name: 'All diagnostics' })).toContainText(/Authored route request crosses node api label/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('region', { name: 'All diagnostics' })).toContainText(/Authored route request crosses node api label/);
});

test('a semantic-port route keeps its authored anchor through SVG export and reopen', async ({ page }) => {
  const source = '@diagram architecture\napi service {\n' +
    '  outbound port [direction: out, anchor: E]\n}\nstore database\n' +
    'request = api:outbound -> store\nroute edge request {\n' +
    '  bend = waypoint relative to port api:outbound offset (20, 0)\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'route-semantic-port-v1.coral', buffer: Buffer.from(source) });
  await page.getByLabel('Diagram style', { exact: true }).selectOption('hifi');
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const route = page.locator('.react-flow [data-coral-part-id="request:shaft"]');
  await expect(route).toBeVisible();
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(graph.edges[0].routeIntent.waypoints[0].placement).toEqual({ kind: 'relative',
    anchor: { kind: 'port', nodeId: 'api', portId: 'outbound' }, offset: { x: 20, y: 0 } });
  const check = async () => {
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const canvasPath = await route.getAttribute('d');
    const exportPath = await page.evaluate((text) => new DOMParser().parseFromString(text, 'image/svg+xml')
      .querySelector('[data-coral-part-id="request:shaft"]')!.getAttribute('d'), svg);
    expect(canvasPath).toBe(exportPath);
    expect([...canvasPath!.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].length).toBeGreaterThanOrEqual(6);
    await expect(editor).toHaveValue(source);
  };
  await check();
  await page.getByRole('button', { name: 'Reflow layout' }).click();
  await waitForEditorSettled(page);
  await check();
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await check();
  expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8')))
    .toEqual(graph);
});

test('an unknown semantic-port route anchor stays saveable as exact source', async ({ page }) => {
  const source = '@diagram architecture\napi service {\n' +
    '  outbound port [direction: out, anchor: E]\n}\nstore database\n' +
    'request = api:outbound -> store\nroute edge request {\n' +
    '  bend = waypoint relative to port api:absent offset (20, 0)\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'route-missing-port-v1.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
});

test('a catalog port used only by a route waypoint remains available to layout', async ({ page }) => {
  const source = '@diagram architecture\napi service @ (20, 20) pinned\n' +
    'store database @ (500, 20) pinned\nrequest = api -> store\n' +
    'route edge request {\n' +
    '  bend = waypoint relative to port api:out offset (20, 20)\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'route-catalog-only-port-v1.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const route = page.locator('.react-flow [data-coral-part-id="request:shaft"]');
  await expect(route).toBeVisible();
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(graph.edges[0].routeIntent.waypoints[0].placement).toEqual({ kind: 'relative',
    anchor: { kind: 'port', nodeId: 'api', portId: 'out' }, offset: { x: 20, y: 20 } });
  const check = async () => {
    const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
    const canvasPath = await route.getAttribute('d');
    const exportedPath = await page.evaluate((text) => new DOMParser().parseFromString(text, 'image/svg+xml')
      .querySelector('[data-coral-part-id="request:shaft"]')!.getAttribute('d'), svg);
    expect(canvasPath).toBe(exportedPath);
    expect([...canvasPath!.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].length).toBeGreaterThanOrEqual(6);
    await expect(editor).toHaveValue(source);
  };
  await check();
  await page.getByLabel('Diagram style', { exact: true }).selectOption('hifi');
  await waitForEditorSettled(page);
  await check();
  await page.getByRole('button', { name: 'Reflow layout' }).click();
  await waitForEditorSettled(page);
  await check();
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(route).toBeVisible();
  await check();
  expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8')))
    .toEqual(graph);
});
