import { expect, test, type Page } from '@playwright/test';
import { fieldByLabel, saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

// Waypoint gestures and Diagram-tab controls that 0.2.9 admits only
// for GraphIR interchange documents, plus the Shift axis lock, which saved
// Coral source admits but does not hold (Slice 70 matrix G-32).

interface DocumentNode { id: string; type: string; label?: string; position?: { x: number; y: number } }

async function openInterchange(page: Page, nodes: DocumentNode[],
  edges: Array<{ id: string; source: string; target: string }>) {
  await startCleanEditor(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: 'interchange.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { name: 'Interchange', created: '2026-10-31T00:00:00.000Z',
        modified: '2026-10-31T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: { version: '3.0.0', id: 'interchange', nodes, edges } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'DOWN' } },
    })),
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes.length);
  await waitForEditorSettled(page);
}

const positioned = [
  { id: 'api', type: 'service', position: { x: 100, y: 200 } },
  { id: 'store', type: 'database', position: { x: 600, y: 400 } },
];
const link = [{ id: 'link', source: 'api', target: 'store' }];

const editor = (page: Page) => page.getByLabel('DSL editor', { exact: true });
const undo = (page: Page) => page.getByRole('button', { name: /^Undo \(/ });
const history = async (page: Page) => Number((await undo(page).getAttribute('aria-label'))!.match(/\d+/)![0]);
const positions = (page: Page) => page.locator('.react-flow__node').evaluateAll((nodes) =>
  Object.fromEntries(nodes.map((node) => {
    const matrix = new DOMMatrixReadOnly((node as HTMLElement).style.transform);
    return [node.getAttribute('data-id')!, { x: matrix.m41, y: matrix.m42 }];
  })));

for (const axis of ['horizontal', 'vertical'] as const) {
  test(`Shift ${axis} drag locks the dominant axis in one history step`, async ({ page }) => {
    await openInterchange(page, positioned, link);
    const before = await editor(page).inputValue();
    const box = (await page.locator('.react-flow__node[data-id="api"]').boundingBox())!;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + (axis === 'horizontal' ? 80 : 18),
      start.y + (axis === 'horizontal' ? 18 : 80), { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(editor(page)).not.toHaveValue(before);
    const moved = await editor(page).inputValue();
    expect(moved).toMatch(axis === 'horizontal'
      ? /service "api" @ \((?!100,)[\d.]+, 200\)/ : /service "api" @ \(100, (?!200\))[\d.]+\)/);
    expect(moved).toContain('database "store" @ (600, 400)');
    expect(await history(page)).toBe(1);
    await undo(page).click();
    await expect(editor(page)).toHaveValue(before);
    await page.getByRole('button', { name: /^Redo \(/ }).click();
    await expect(editor(page)).toHaveValue(moved);
  });
}

test('waypoint add, move and remove are each one history step', async ({ page }) => {
  await openInterchange(page, positioned, link);
  const hit = page.locator('[data-coral-edge-hit="link"]');
  const point = await hit.evaluate((path: SVGPathElement) => {
    for (const fraction of [0.5, 0.3, 0.7]) {
      const screen = path.getPointAtLength(path.getTotalLength() * fraction)
        .matrixTransform(path.getScreenCTM()!);
      if (document.elementFromPoint(screen.x, screen.y) === path) return { x: screen.x, y: screen.y };
    }
    throw new Error('No exposed connection point for a real pointer double-click');
  });
  const original = await editor(page).inputValue();
  await page.mouse.dblclick(point.x, point.y);
  await expect(editor(page)).toHaveValue(/api -> store as link via waypoint "[^"]+" at \(/);
  const added = await editor(page).inputValue();
  expect(await history(page)).toBe(1);

  const connection = page.locator('.react-flow__edge[data-id="link"]');
  await connection.focus();
  await page.keyboard.press('Enter');
  await expect(connection).toHaveClass(/selected/);
  const handle = page.locator('[data-waypoint-id]');
  await expect(handle).toHaveCount(1);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect(editor(page)).not.toHaveValue(added);
  const moved = await editor(page).inputValue();
  expect(moved).toMatch(/via waypoint "[^"]+" at \(/);
  expect(await history(page)).toBe(2);

  const after = (await handle.boundingBox())!;
  await page.mouse.click(after.x + after.width / 2, after.y + after.height / 2, { button: 'right' });
  await expect(editor(page)).toHaveValue(original);
  await expect(handle).toHaveCount(0);
  expect(await history(page)).toBe(3);
  await undo(page).click();
  await expect(editor(page)).toHaveValue(moved);
  await undo(page).click();
  await expect(editor(page)).toHaveValue(added);
});

test('Apply Layout direction reorients the diagram and saves the layout settings', async ({ page }) => {
  await openInterchange(page, ['one', 'two', 'three'].map((id) => ({ id, type: 'service' })),
    [{ id: 'first', source: 'one', target: 'two' }, { id: 'second', source: 'two', target: 'three' }]);
  const horizontal = async () => {
    const value = await positions(page);
    return Math.abs(value.three.x - value.one.x) > Math.abs(value.three.y - value.one.y);
  };
  expect(await horizontal()).toBe(false);
  const text = await editor(page).inputValue();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  const inspector = page.getByLabel('Properties panel');
  await fieldByLabel(inspector, 'Direction').selectOption('RIGHT');
  await inspector.getByRole('button', { name: 'Apply Layout' }).click();
  await expect.poll(horizontal).toBe(true);
  await expect(editor(page)).toHaveValue(text);
  const saved = await saveDocument(page);
  expect(saved.document.settings.layout).toMatchObject({ algorithm: 'layered', direction: 'RIGHT' });
});

test('annotation suppression clears the canvas mark but keeps the diagnostic', async ({ page }) => {
  await openInterchange(page, [{ id: 'user', type: 'actor', position: { x: 0, y: 0 } },
    { id: 'store', type: 'database', position: { x: 300, y: 0 } }],
  [{ id: 'reads', source: 'user', target: 'store' }]);
  const hit = page.locator('[data-coral-edge-hit="reads"]');
  await expect(hit).toHaveAttribute('aria-label', /not allowed by this notation/);
  await page.getByRole('tab', { name: /^Diagnostics/ }).click();
  const diagnostic = page.getByTestId('bottom-panel').getByText(/cannot connect/i).first();
  await expect(diagnostic).toBeVisible();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  const suppress = page.getByLabel('Suppress error annotations');
  await suppress.check();
  await expect(hit).not.toHaveAttribute('aria-label', /not allowed/);
  await expect(diagnostic).toBeVisible();
  await suppress.uncheck();
  await expect(hit).toHaveAttribute('aria-label', /not allowed by this notation/);
});

test('zoom, fit and pointer pan change the visible viewport', async ({ page }) => {
  await openInterchange(page, positioned, link);
  const viewport = page.locator('.react-flow__viewport');
  const transform = () => viewport.getAttribute('style');
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  const fitted = await transform();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(transform).not.toBe(fitted);
  const zoomed = await transform();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(transform).not.toBe(zoomed);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  const beforePan = await transform();
  await page.mouse.move(pane.x + 25, pane.y + 25);
  await page.mouse.down();
  await page.mouse.move(pane.x + 90, pane.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(transform).not.toBe(beforePan);
});

test('Notation select re-renders the document in the chosen notation', async ({ page }) => {
  await openInterchange(page, [{ id: 'choice', type: 'decision', label: 'Choice' }], []);
  await expect(page.getByRole('group', { name: 'Choice, decision' })).toBeVisible();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await fieldByLabel(page.getByLabel('Properties panel'), 'Notation').selectOption('flowchart');
  await expect(page.getByRole('group', { name: 'Choice, Decision' })).toBeVisible();
  await expect(editor(page)).toHaveValue(/"notation":"flowchart"/);
});
