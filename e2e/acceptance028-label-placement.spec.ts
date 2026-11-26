import { expect, test } from '@playwright/test';
import { showProperties, downloadFromPalette, openBuffer, openSavedDocument, saveDocument, startCleanEditor,
  waitForEditorSettled } from './support/user-journey.js';

test('source-owned label placement handle and Properties share exact history, export and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\n// Keep all spelling.\n' +
    "api service as 'API' label below offset 12 @ (120, 80) pinned\n" +
    'store database @ (500, 80) pinned\n';
  await startCleanEditor(page);
  await showProperties(page);
  await openBuffer(page, { name: 'label-placement.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await page.locator('.react-flow__node[data-id="api"]').click();
  await expect(page.getByLabel('Label side', { exact: true })).toHaveValue('below');
  await expect(page.getByLabel('Label offset', { exact: true })).toHaveValue('12');
  const handle = page.getByRole('button', { name: 'Move label for api', exact: true });
  await page.getByRole('button', { name: 'Fit diagram to view', exact: true }).click();
  await expect(handle).toBeVisible();
  await expect.poll(() => handle.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === element;
  })).toBe(true);
  const box = (await handle.boundingBox())!;
  const zoom = await page.locator('.react-flow__viewport').evaluate((element) =>
    new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20 * zoom, { steps: 5 });
  await page.mouse.up();
  const moved = source.replace('offset 12', 'offset 32');
  await expect(editor).toHaveValue(moved);
  await expect(page.getByLabel('Label offset', { exact: true })).toHaveValue('32');
  await page.getByLabel('Label side', { exact: true }).selectOption('right');
  await page.getByLabel('Label offset', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Apply label placement', exact: true }).click();
  const edited = source.replace('label below offset 12', 'label right offset 20');
  await expect(editor).toHaveValue(edited);
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(exported.nodes[0]).toMatchObject({ id: 'api', label: 'API', labelPlacement: { side: 'right', offset: 20 },
    position: { x: 120, y: 80 }, pinned: true });
  const svg = (await downloadFromPalette(page, 'Export SVG')).bytes.toString('utf8');
  expect(svg).toContain('API');
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(moved);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(moved);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(edited);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
  await openBuffer(page, { name: 'temporary.coral', buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(edited);
  expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'))).toEqual(exported);
});

test('typed spatial source keeps controls, identity, style, Reflow and located invalid drafts across reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\n' +
    'layout [algorithm: layered, direction: RIGHT, edgeRouting: POLYLINE, nodeNode: 40, layerSpacing: 60]\n' +
    'api service as "API" @ (120, 100) pinned\nstore database as "Store" @ (500, 100) pinned\n' +
    'request = api -> store as "Request"\n' +
    'constraint caption: label node api above edge request [preferred, gap: 8]\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'typed-spatial.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  for (const style of ['hifi', 'lowfi']) {
    await page.getByLabel('Diagram style', { exact: true }).selectOption(style);
    await waitForEditorSettled(page);
    await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
    await expect(editor).toHaveValue(source);
  }
  await page.getByRole('button', { name: 'Reflow layout', exact: true }).click();
  await waitForEditorSettled(page);
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  const exported = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(exported.constraints).toEqual([{ id: 'caption', kind: 'relative', subject: { kind: 'node-label', nodeId: 'api' },
    target: { kind: 'edge', edgeId: 'request' }, relation: 'above', strength: 'preferred', gap: 8 }]);
  expect(exported.layoutOptions).toEqual({ algorithm: 'layered', direction: 'RIGHT', edgeRouting: 'POLYLINE',
    spacing: { nodeNode: 40, layerSpacing: 60 } });
  expect(JSON.stringify(exported)).not.toMatch(/labelBounds028|spatialConstraints028|routeIntents028|layoutOptions028/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await openBuffer(page, { name: 'temporary.coral', buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'))).toEqual(exported);

  const invalid = source.replace('above edge request', 'above edge missing');
  await editor.fill(invalid);
  await waitForEditorSettled(page);
  await page.getByRole('button', { name: 'Show all diagnostics', exact: true }).click();
  await expect(page.getByRole('region', { name: 'All diagnostics' })).toContainText('coral.constraint.reference.unresolved');
  const draft = await saveDocument(page);
  expect(draft.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });
  await openBuffer(page, { name: 'temporary.coral', buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, draft.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(invalid);
});
