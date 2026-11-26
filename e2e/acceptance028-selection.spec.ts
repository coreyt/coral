import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument, startCleanEditor,
  waitForEditorSettled } from './support/user-journey.js';

test('Escape clears source-owned node selection without changing Coral text', async ({ page }) => {
  const source = '@diagram architecture\nalpha service\nbeta database\nalpha -> beta [writes]';
  await page.goto('/');
  const editor = page.getByLabel('DSL editor', { exact: true });
  await editor.fill(source);
  const node = page.locator('.react-flow__node[data-id="alpha"]');
  await expect(node).toBeVisible();
  await node.focus();
  await node.press('Enter');
  await expect(node).toHaveClass(/selected/);
  await node.press('Escape');
  await expect(node).not.toHaveClass(/selected/);
  await expect(editor).toHaveValue(source);
});

test('Shift drag saves constrained coordinates and Escape only clears selection', async ({ page }) => {
  const source = '@diagram architecture\nalpha service\nbeta database\nalpha -> beta [writes]';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'selection.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const node = page.locator('.react-flow__node[data-id="alpha"]');
  const position = () => node.evaluate((element: HTMLElement) => {
    const matrix = new DOMMatrixReadOnly(element.style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  const before = await position();
  const box = (await node.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 15, { steps: 4 });
  const target = await position();
  expect(target.x).not.toBe(before.x);
  expect(target.y).toBe(before.y);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(editor).toHaveValue(/alpha service @ \(/);
  const moved = await editor.inputValue();
  expect(moved.replace(/alpha service @ \([^)]+\)/, 'alpha service')).toBe(source);
  await waitForEditorSettled(page);
  const distanceFromTarget = async () => {
    const current = await position();
    return Math.hypot(current.x - target.x, current.y - target.y);
  };
  // CSS transforms round displayed coordinates; source keeps the full drag precision.
  await expect.poll(distanceFromTarget).toBeLessThan(0.001);
  await expect(node).toHaveClass(/selected/);
  await expect(page.getByLabel('Properties panel', { exact: true })).toHaveCount(0);
  const undoBeforeEscape = await page.getByRole('button', { name: /^Undo \(/ }).getAttribute('aria-label');
  await node.press('Escape');
  await expect(node).not.toHaveClass(/selected/);
  await expect(editor).toHaveValue(moved);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toHaveAttribute('aria-label', undoBeforeEscape!);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: moved });
  await editor.fill('@diagram architecture\nother service');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(moved);
  await expect.poll(distanceFromTarget).toBeLessThan(0.001);
});

test('canceled source-owned pointer drag rejects its late release without changing source or meaning', async ({ page }) => {
  const source = '// Keep authored source exact.\n@diagram architecture\n' +
    'alpha service\nbeta database\nalpha -> beta [writes]\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'canceled-drag.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const node = page.locator('.react-flow__node[data-id="alpha"]');
  await expect(node).toBeVisible();
  const position = () => node.evaluate((element: HTMLElement) => {
    const matrix = new DOMMatrixReadOnly(element.style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  const beforePosition = await position();
  const undoBefore = await page.getByRole('button', { name: /^Undo \(/ }).getAttribute('aria-label');
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const beforeMeaning = await exportCandidate();
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 12, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(start.x + 85, start.y + 35, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(position).toEqual(beforePosition);
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toHaveAttribute('aria-label', undoBefore!);
  expect(await exportCandidate()).toEqual(beforeMeaning);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(beforeMeaning);
});

test('keyboard multi-selection keeps source and successor meaning through save and reopen', async ({ page }) => {
  const source = '// Keep this source comment.\n@diagram architecture\n' +
    'alpha service\nbeta database\nalpha -> beta [writes]\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'keyboard-selection.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const alpha = page.locator('.react-flow__node[data-id="alpha"]');
  const beta = page.locator('.react-flow__node[data-id="beta"]');
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const before = await exportCandidate();
  const undoBefore = await page.getByRole('button', { name: /^Undo \(/ }).getAttribute('aria-label');

  await alpha.focus();
  await alpha.press('Enter');
  await expect(alpha).toHaveClass(/selected/);
  await page.keyboard.down('Control');
  await beta.focus();
  await beta.press('Enter');
  await page.keyboard.up('Control');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await beta.press('Escape');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toHaveAttribute('aria-label', undoBefore!);
  expect(await exportCandidate()).toEqual(before);

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(before);
});

test('Shift box selection keeps a saved Coral diagram unchanged', async ({ page }) => {
  const source = '// Exact author source.\n@diagram architecture\n' +
    'alpha service\nbeta database\nalpha -> beta [writes]\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'box-selection.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const before = await exportCandidate();
  const undoBefore = await page.getByRole('button', { name: /^Undo \(/ }).getAttribute('aria-label');
  await page.getByRole('button', { name: 'Fit diagram to view' }).click();
  // Keep the entire gesture outside React Flow's 40px edge auto-pan zone.
  // Panning during the drag invalidates the node bounds measured below.
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(() => page.locator('.react-flow__node').evaluateAll(nodes => {
    const canvas = nodes[0]?.closest('.react-flow')?.getBoundingClientRect();
    if (!canvas || nodes.length !== 2) return false;
    return nodes.every(node => {
      const box = node.getBoundingClientRect();
      return box.left - 15 > canvas.left + 40 && box.top - 15 > canvas.top + 40
        && box.right + 15 < canvas.right - 40 && box.bottom + 15 < canvas.bottom - 40;
    });
  })).toBe(true);
  const alpha = await page.locator('.react-flow__node[data-id="alpha"]').boundingBox();
  const beta = await page.locator('.react-flow__node[data-id="beta"]').boundingBox();
  expect(alpha).not.toBeNull();
  expect(beta).not.toBeNull();
  const start = { x: Math.min(alpha!.x, beta!.x) - 15, y: Math.min(alpha!.y, beta!.y) - 15 };
  const end = { x: Math.max(alpha!.x + alpha!.width, beta!.x + beta!.width) + 15,
    y: Math.max(alpha!.y + alpha!.height, beta!.y + beta!.height) + 15 };
  await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toHaveAttribute('aria-label', undoBefore!);
  expect(await exportCandidate()).toEqual(before);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(before);
});

test('Backspace deletes a selected connected node through one Coral source transaction', async ({ page }) => {
  const source = '// Keep this comment.\n@diagram architecture\n' +
    'alpha service\nbeta database\nlink = alpha -> beta [writes]\n';
  const deleted = '// Keep this comment.\n@diagram architecture\nbeta database\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'keyboard-delete.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  const alpha = page.locator('.react-flow__node[data-id="alpha"]');
  const exportCandidate = async () => JSON.parse((await downloadFromPalette(
    page, 'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  const before = await exportCandidate();
  await alpha.focus();
  await alpha.press('Enter');
  await expect(alpha).toHaveClass(/selected/);
  await alpha.press('Backspace');
  await expect(editor).toHaveValue(deleted);
  await expect(alpha).toHaveCount(0);
  const after = await exportCandidate();
  expect(after.nodes.map((node: { id: string }) => node.id)).toEqual(['beta']);
  expect(after.edges).toEqual([]);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(source);
  expect(await exportCandidate()).toEqual(before);
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveValue(deleted);
  expect(await exportCandidate()).toEqual(after);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: deleted });
  await editor.fill('@diagram architecture\ntemporary service\n');
  await waitForEditorSettled(page);
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(deleted);
  expect(await exportCandidate()).toEqual(after);
});

test('Escape clears GraphIR node selection after a completed Shift drag', async ({ page }) => {
  await page.goto('/');
  const document = {
    schemaVersion: '1.0.0',
    metadata: { name: 'Selection', created: '2026-10-15T00:00:00.000Z',
      modified: '2026-10-15T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: {
      version: '3.0.0', id: 'selection',
      nodes: [{ id: 'alpha', type: 'service', position: { x: 100, y: 200 } }], edges: [],
    } },
    settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
  };
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: 'selection.coral.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const node = page.locator('.react-flow__node[data-id="alpha"]');
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 15, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(node).toHaveClass(/selected/);
  await node.press('Escape');
  await expect(node).not.toHaveClass(/selected/);
});
