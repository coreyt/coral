import { expect, test } from '@playwright/test';
import { downloadFromPalette, expectBlockedPaletteCommand, openBuffer, openSavedDocument, saveDocument, startCleanEditor,
  waitForEditorSettled } from './support/user-journey.js';

test('authored node position and pin survive source-owned export and reopen', async ({ page }) => {
  const source = '// Keep this placement comment.\n@diagram architecture\n' +
    'api service @ (120, 80) pinned\nstore database @ (-24.5, 0)\n' +
    'flow = api -> store [writes]\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'spatial-source.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const graph = await exportCandidate();
  expect(graph.nodes).toMatchObject([
    { id: 'api', position: { x: 120, y: 80 }, pinned: true },
    { id: 'store', position: { x: -24.5, y: 0 } },
  ]);
  expect(graph.nodes[1]).not.toHaveProperty('pinned');
  expect(graph.edges).toMatchObject([{ id: 'flow' }]);
  const pinnedPosition = () => page.locator('.react-flow__node[data-id="api"]')
    .evaluate((element: HTMLElement) => {
      const matrix = new DOMMatrixReadOnly(element.style.transform);
      return { x: matrix.m41, y: matrix.m42 };
    });
  await expect.poll(pinnedPosition).toEqual({ x: 120, y: 80 });
  await page.getByRole('button', { name: 'Reflow layout' }).click();
  await expect.poll(pinnedPosition).toEqual({ x: 120, y: 80 });
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(graph);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(graph);
});

test('a pin without coordinates stays saveable text and cannot export stale meaning', async ({ page }) => {
  const source = '@diagram architecture\napi service pinned\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'invalid-pin.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Show all diagnostics' }).click();
  await expect(page.getByRole('region', { name: 'All diagnostics' }))
    .toContainText('coral.node.pin.invalid');
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.(?:stale|invalid)|Export blocked/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('region', { name: 'All diagnostics' }))
    .toContainText('coral.node.pin.invalid');
});

test('keyboard moves authored positions in one source transaction with history and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '// Keep both authored coordinates.\n@diagram architecture\n' +
    'api service @ (120, 80) pinned\nstore database @ (300, 80) pinned\n' +
    'request = api -> store\n';
  const moved = source.replace('api service @ (120, 80)', 'api service @ (125, 80)')
    .replace('store database @ (300, 80)', 'store database @ (305, 80)');
  await startCleanEditor(page);
  await openBuffer(page, { name: 'keyboard-position.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const api = page.locator('.react-flow__node[data-id="api"]');
  const store = page.locator('.react-flow__node[data-id="store"]');
  await api.focus();
  await api.press('Enter');
  await page.keyboard.down('Control');
  await store.focus();
  await store.press('Enter');
  await page.keyboard.up('Control');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await store.press('ArrowRight');
  await expect(editor).toHaveValue(moved);
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const graph = await exportCandidate();
  expect(graph.nodes).toMatchObject([
    { id: 'api', position: { x: 125, y: 80 }, pinned: true },
    { id: 'store', position: { x: 305, y: 80 }, pinned: true },
  ]);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(moved);
  expect(await exportCandidate()).toEqual(graph);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: moved });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(moved);
  expect(await exportCandidate()).toEqual(graph);
});

test('keyboard move without authored position leaves source and history quiet', async ({ page }) => {
  const source = '@diagram architecture\napi service\nstore database @ (300, 80) pinned\n' +
    'request = api -> store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'unpositioned-keyboard.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const node = page.locator('.react-flow__node[data-id="api"]');
  const undoBefore = await page.getByRole('button', { name: /^Undo \(/ }).getAttribute('aria-label');
  await node.focus();
  await node.press('Enter');
  await node.press('ArrowRight');
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toHaveAttribute('aria-label', undoBefore!);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
});

test('pointer drag moves an authored node through source history and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '// Preserve this comment.\n@diagram architecture\n' +
    'api service @ (120, 80) pinned\nstore database @ (300, 80) pinned\n' +
    'request = api -> store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'pointer-position.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const api = page.locator('.react-flow__node[data-id="api"]');
  const box = await api.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + Math.min(30, box!.width / 4),
    y: box!.y + Math.min(20, box!.height / 4) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => await editor.inputValue()).not.toBe(source);
  const moved = await editor.inputValue();
  expect(moved).toMatch(/^\/\/ Preserve this comment\.\n@diagram architecture\napi service @ \([\d.-]+, [\d.-]+\) pinned\nstore database @ \(300, 80\) pinned\nrequest = api -> store\n$/);
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(graph.nodes[0].position).not.toEqual({ x: 120, y: 80 });
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(moved);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: moved });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(moved);
});

test('pointer drag without authored coordinates leaves source and history quiet', async ({ page }) => {
  const source = '@diagram architecture\napi service\nstore database @ (300, 80) pinned\n' +
    'request = api -> store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'unpositioned-pointer.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const undoBefore = await page.getByRole('button', { name: /^Undo \(/ }).getAttribute('aria-label');
  const api = page.locator('.react-flow__node[data-id="api"]');
  const position = () => api.evaluate((element: HTMLElement) => {
    const matrix = new DOMMatrixReadOnly(element.style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  const before = await position();
  const box = await api.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + Math.min(30, box!.width / 4),
    y: box!.y + Math.min(20, box!.height / 4) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(editor).toHaveValue(source);
  await expect.poll(position).toEqual(before);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toHaveAttribute('aria-label', undoBefore!);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
});

test('pointer drag moves a selected authored pair in one source history step', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '// Keep both coordinates.\n@diagram architecture\n' +
    'api service @ (120, 80) pinned\nstore database @ (300, 80) pinned\n' +
    'request = api -> store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'pointer-pair.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const api = page.locator('.react-flow__node[data-id="api"]');
  const store = page.locator('.react-flow__node[data-id="store"]');
  await api.focus();
  await api.press('Enter');
  await page.keyboard.down('Control');
  await store.focus();
  await store.press('Enter');
  await page.keyboard.up('Control');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  const box = await api.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + Math.min(30, box!.width / 4),
    y: box!.y + Math.min(20, box!.height / 4) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => await editor.inputValue()).not.toBe(source);
  const moved = await editor.inputValue();
  const graph = JSON.parse((await downloadFromPalette(page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const apiAfter = graph.nodes.find((node: { id: string }) => node.id === 'api').position;
  const storeAfter = graph.nodes.find((node: { id: string }) => node.id === 'store').position;
  const delta = { x: apiAfter.x - 120, y: apiAfter.y - 80 };
  expect(delta).not.toEqual({ x: 0, y: 0 });
  expect(storeAfter).toEqual({ x: 300 + delta.x, y: 80 + delta.y });
  expect(moved).toBe(source.replace('api service @ (120, 80)',
    `api service @ (${apiAfter.x}, ${apiAfter.y})`).replace('store database @ (300, 80)',
    `store database @ (${storeAfter.x}, ${storeAfter.y})`));
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(moved);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: moved });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(moved);
});

test('pointer drag of a grouped child writes its parent-local position', async ({ page }) => {
  const source = '@diagram architecture\nteam group @ (100, 100) {\n  api service @ (40, 60)\n}\n' +
    'store database @ (500, 100)\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'grouped-child.coral', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const child = page.locator('.react-flow__node[data-id="team.api"]');
  const position = () => child.evaluate((element: HTMLElement) => {
    const matrix = new DOMMatrixReadOnly(element.style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  expect(await position()).toEqual({ x: 140, y: 160 });
  const box = (await child.boundingBox())!;
  const start = { x: box.x + Math.min(20, box.width / 4), y: box.y + Math.min(15, box.height / 4) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(editor).not.toHaveValue(source);
  const moved = await editor.inputValue();
  const local = moved.match(/^ {2}api service @ \(([\d.-]+), ([\d.-]+)\)$/m)!;
  expect(local).not.toBeNull();
  expect(moved.replace(local[0], '  api service @ (40, 60)')).toBe(source);
  await expect.poll(async () => {
    const shown = await position();
    return Math.max(Math.abs(shown.x - 100 - Number(local[1])), Math.abs(shown.y - 100 - Number(local[2])));
  }).toBeLessThan(0.01);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(moved);
});

test('authored node and edge label placement survives portable export and reopen', async ({ page }) => {
  const source = '@diagram architecture\napi service as "API" label below offset 12\n' +
    'store database\nrequest = api -> store as "Request" label above at 0.25 offset 8\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'label-placement.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const graph = await exportCandidate();
  expect(graph.nodes[0]).toMatchObject({ id: 'api', labelPlacement: { side: 'below', offset: 12 } });
  expect(graph.edges[0]).toMatchObject({ id: 'request',
    labelPlacement: { side: 'above', at: 0.25, offset: 8 } });
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(graph);
});

test('an out-of-range label fraction stays saveable and blocks semantic export', async ({ page }) => {
  const source = '@diagram architecture\napi service\nstore database\n' +
    'request = api -> store as "Request" label above at 1.2\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'invalid-label-placement.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Show all diagnostics' }).click();
  await expect(page.getByRole('region', { name: 'All diagnostics' }))
    .toContainText('coral.label-placement.range.invalid');
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.(?:stale|invalid)|Export blocked/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
});

test('authored route waypoints survive GraphIR 4 export, Reflow, and reopen', async ({ page }) => {
  const source = '@diagram architecture\napi service\nstore database\n' +
    'request = api -> store\nroute edge request {\n' +
    '  turn = waypoint at (240, 80)\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'route-source.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await expect(page.locator('[data-coral-scene-error]')).toHaveCount(0);
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const graph = await exportCandidate();
  expect(graph.edges[0]).toMatchObject({ id: 'request',
    routeIntent: { waypoints: [{ id: 'turn', placement: { kind: 'absolute',
      position: { x: 240, y: 80 } } }] } });
  await page.getByRole('button', { name: 'Reflow layout' }).click();
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(graph);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(graph);
});

test('unresolved route target stays saveable and blocks stale export', async ({ page }) => {
  const source = '@diagram architecture\napi service\nstore database\n' +
    'request = api -> store\nroute edge missing {\n' +
    '  turn = waypoint at (240, 80)\n}\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'invalid-route.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Show all diagnostics' }).click();
  await expect(page.getByRole('region', { name: 'All diagnostics' }))
    .toContainText('coral.route.edge.unresolved');
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.(?:stale|invalid)|Export blocked/);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
});

for (const axis of ['horizontal', 'vertical', 'release'] as const) {
  test(`saved-source Shift drag ${axis} preserves its axis and one history step`, async ({ page }) => {
    const source = '@diagram architecture\napi service @ (120, 80) pinned\n' +
      'store database @ (400, 250) pinned\nrequest = api -> store\n';
    await startCleanEditor(page);
    await openBuffer(page, { name: 'shift-position.coral', buffer: Buffer.from(source) });
    await waitForEditorSettled(page);
    const editor = page.getByLabel('DSL editor', { exact: true });
    const api = page.locator('.react-flow__node[data-id="api"]');
    const box = (await api.boundingBox())!;
    const start = { x: box.x + Math.min(30, box.width / 4), y: box.y + Math.min(20, box.height / 4) };
    await page.keyboard.down('Shift');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + (axis === 'vertical' ? 18 : 80),
      start.y + (axis === 'vertical' ? 80 : 18), { steps: 8 });
    const position = () => api.evaluate((element: HTMLElement) => {
      const matrix = new DOMMatrixReadOnly(element.style.transform);
      return { x: matrix.m41, y: matrix.m42 };
    });
    const locked = await position();
    if (axis === 'vertical') {
      expect(locked.x).toBe(120);
      expect(locked.y).not.toBe(80);
    } else {
      expect(locked.y).toBe(80);
      expect(locked.x).not.toBe(120);
    }
    if (axis === 'release') {
      await page.keyboard.up('Shift');
      await page.mouse.move(start.x + 100, start.y + 40, { steps: 4 });
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(editor).not.toHaveValue(source);
    await waitForEditorSettled(page);
    const moved = await editor.inputValue();
    const final = await position();
    if (axis === 'release') {
      expect(final.x).not.toBe(120);
      expect(final.y).not.toBe(80);
    } else expect(final).toEqual(locked);
    expect(moved).toContain('store database @ (400, 250) pinned');
    await page.getByRole('button', { name: /^Undo \(/ }).click();
    await expect(editor).toHaveValue(source);
    await page.getByRole('button', { name: /^Redo \(/ }).click();
    await expect(editor).toHaveValue(moved);
  });
}
