import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { downloadFromPalette, openBuffer, openSavedDocument,
  startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

declare global {
  interface Window {
    __holdSourceLayout?: boolean;
    __heldSourceLayoutCount?: () => number;
    __releaseSourceLayout?: () => void;
  }
}

async function controlLayoutWorker(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const held: Array<() => void> = [];
    class ControlledWorker {
      private readonly worker: Worker;
      private readonly listeners = new Set<EventListener>();
      constructor(...args: ConstructorParameters<typeof Worker>) {
        this.worker = new NativeWorker(...args);
        this.worker.addEventListener('message', (event) => {
          const deliver = () => this.listeners.forEach((listener) => listener(event));
          if (window.__holdSourceLayout) held.push(deliver);
          else deliver();
        });
      }
      postMessage(value: unknown) { this.worker.postMessage(value); }
      addEventListener(type: string, listener: EventListener) {
        if (type === 'message') this.listeners.add(listener);
        else this.worker.addEventListener(type, listener);
      }
      removeEventListener(type: string, listener: EventListener) {
        if (type === 'message') this.listeners.delete(listener);
        else this.worker.removeEventListener(type, listener);
      }
      terminate() { this.worker.terminate(); }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: ControlledWorker });
    window.__heldSourceLayoutCount = () => held.length;
    window.__releaseSourceLayout = () => {
      window.__holdSourceLayout = false;
      while (held.length) held.shift()!();
    };
  });
}

test('a later source revision retires a pending parse and exact save keeps the latest draft', async ({ page }) => {
  test.setTimeout(90_000);
  const original = '@diagram flowchart\norigin process\n';
  const superseded = '@diagram flowchart\norigin process\nsuperseded process\n';
  const latest = '@diagram flowchart\norigin process\nlatest process\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'source-arbitration.coral', buffer: Buffer.from(original) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(original);
  await expect(page.locator('.react-flow__node[data-id="origin"]')).toHaveCount(1);

  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000);
  await editor.fill(superseded);
  await expect(page.getByTestId('visible-update-status')).toHaveText(
    'Updating source. Canvas editing is temporarily unavailable.');
  await editor.fill(latest);
  await expect(editor).toHaveValue(latest);
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await pendingDownload;
  const savedPath = (await download.path())!;
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: latest });

  await page.clock.resume();
  await waitForEditorSettled(page);
  await expect(page.locator('.react-flow__node[data-id="latest"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="superseded"]')).toHaveCount(0);
  await expect(editor).toHaveValue(latest);
  const graph = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(graph.nodes.map((node: { id: string }) => node.id).sort())
    .toEqual(['latest', 'origin']);
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
  await openSavedDocument(page, savedPath);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(latest);
  const reopened = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(reopened).toEqual(graph);
});

test('pointer and keyboard canvas edits are refused while a source parse is pending', async ({ page }) => {
  const original = '@diagram architecture\norigin service @ (100, 100) pinned\n';
  const pending = original + 'pending service\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'pending-parse.coral', buffer: Buffer.from(original) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const origin = page.locator('.react-flow__node[data-id="origin"]');
  const position = () => origin.evaluate((element: HTMLElement) => {
    const matrix = new DOMMatrixReadOnly(element.style.transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  const before = await position();
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000);
  await editor.fill(pending);
  const copy = 'Updating source. Canvas editing is temporarily unavailable.';
  await expect(page.getByTestId('visible-update-status')).toHaveText(copy);
  const box = (await origin.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 35, { steps: 8 });
  await page.mouse.up();
  await origin.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[role="status"][aria-live="polite"]:not([data-testid])')).toHaveText(copy);
  expect(await position()).toEqual(before);
  await expect(editor).toHaveValue(pending);
  await page.clock.resume();
  await waitForEditorSettled(page);
  await expect(page.locator('.react-flow__node[data-id="pending"]')).toHaveCount(1);
  await expect(editor).toHaveValue(pending);
});

test('a newer Coral revision survives an older held layout result and exact save/reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const original = '@diagram architecture\norigin service\nsink service\norigin -> sink\n';
  const intermediate = '@diagram architecture\norigin service\nintermediate service\n' +
    'sink service\norigin -> sink\nlane = arrange row: origin, intermediate, sink\n';
  const latest = intermediate.replaceAll('intermediate', 'latest');
  await controlLayoutWorker(page);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'held-layout.coral', buffer: Buffer.from(original) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(original);
  await page.evaluate(() => { window.__holdSourceLayout = true; });

  await editor.fill(intermediate);
  await expect.poll(() => page.evaluate(() => window.__heldSourceLayoutCount?.() ?? 0),
    { timeout: 15_000 }).toBeGreaterThan(0);
  await editor.fill(latest);
  await expect(editor).toHaveValue(latest);
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await pendingDownload;
  const savedPath = (await download.path())!;
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: latest });

  await page.evaluate(() => window.__releaseSourceLayout?.());
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(latest);
  await expect(page.locator('.react-flow__node[data-id="latest"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="intermediate"]')).toHaveCount(0);
  const graph = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(graph.nodes.map((node: { id: string }) => node.id).sort())
    .toEqual(['latest', 'origin', 'sink']);
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, savedPath);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(latest);
  const reopened = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(reopened).toEqual(graph);
});
