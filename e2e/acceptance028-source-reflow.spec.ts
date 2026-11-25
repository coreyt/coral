import { expect, test, type Page } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument,
  saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

declare global {
  interface Window {
    __holdReflowLayout?: boolean;
    __heldReflowLayouts?: () => number;
    __releaseReflowLayouts?: () => void;
  }
}

async function holdLayoutResponses(page: Page) {
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
          if (window.__holdReflowLayout) held.push(deliver);
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
    window.__heldReflowLayouts = () => held.length;
    window.__releaseReflowLayouts = () => {
      window.__holdReflowLayout = false;
      while (held.length) held.shift()!();
    };
  });
}

test('manual Reflow refreshes a spatial Coral display without rewriting source', async ({ page }) => {
  test.setTimeout(90_000);
  const source = '@diagram architecture\n// Keep this comment\n' +
    'api service as "API"\nstore database as "Store"\n' +
    'link = api -> store [reads] as "Read"\nrow = arrange row: api, store\n';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'reflow.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const reflow = page.getByRole('button', { name: 'Reflow layout' });
  await expect(reflow).toBeEnabled();
  const before = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));

  await reflow.click();
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  await expect(page.locator('.react-flow__node[data-id="api"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="store"]')).toHaveCount(1);
  const after = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(after).toEqual(before);

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  const reopened = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(reopened).toEqual(before);
});

test('a newer Coral edit retires a held manual Reflow result', async ({ page }) => {
  test.setTimeout(90_000);
  const original = '@diagram architecture\norigin service\nsink database\norigin -> sink\n';
  const latest = '@diagram architecture\norigin service\nlatest service\n' +
    'sink database\norigin -> latest\nlatest -> sink\n';
  await holdLayoutResponses(page);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'reflow-overlap.coral', buffer: Buffer.from(original) });
  await waitForEditorSettled(page);
  const editor = page.getByLabel('DSL editor', { exact: true });
  await page.evaluate(() => { window.__holdReflowLayout = true; });
  await page.getByRole('button', { name: 'Reflow layout' }).click();
  await expect.poll(() => page.evaluate(() => window.__heldReflowLayouts?.() ?? 0),
    { timeout: 15_000 }).toBeGreaterThan(0);
  // Hold only the Reflow's result: the newer edit routes through the worker too.
  await page.evaluate(() => { window.__holdReflowLayout = false; });
  await editor.fill(latest);
  await expect(editor).toHaveValue(latest);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: latest });

  await page.evaluate(() => window.__releaseReflowLayouts?.());
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(latest);
  await expect(page.locator('.react-flow__node[data-id="latest"]')).toHaveCount(1);
  const exported = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(exported.nodes.map((node: { id: string }) => node.id).sort())
    .toEqual(['latest', 'origin', 'sink']);
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram architecture\ntemporary service\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(latest);
  const reopened = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(reopened).toEqual(exported);
});
