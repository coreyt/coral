import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  canvasGeometry, expectBlockedPaletteCommand, openBuffer,
  startCleanEditor, waitForEditorSettled,
} from './support/user-journey.js';

declare global {
  interface Window {
    __slice94HoldLayoutMessages?: boolean;
    __slice94ReleaseLayoutMessages?: () => void;
  }
}

async function holdNextLayoutWorker(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const held: MessageEvent[] = [];
    const listeners = new Set<EventListener>();
    class ControlledWorker {
      private readonly worker: Worker;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        this.worker = new NativeWorker(...args);
        this.worker.addEventListener('message', (event) => {
          if (window.__slice94HoldLayoutMessages) held.push(event);
          else listeners.forEach((listener) => listener(event));
        });
      }
      postMessage(value: unknown) { this.worker.postMessage(value); }
      addEventListener(type: string, listener: EventListener) {
        if (type === 'message') listeners.add(listener);
        else this.worker.addEventListener(type, listener);
      }
      removeEventListener(type: string, listener: EventListener) {
        if (type === 'message') listeners.delete(listener);
        else this.worker.removeEventListener(type, listener);
      }
      terminate() { this.worker.terminate(); }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: ControlledWorker });
    window.__slice94ReleaseLayoutMessages = () => {
      window.__slice94HoldLayoutMessages = false;
      while (held.length) listeners.forEach((listener) => listener(held.shift()!));
    };
  });
}

const SOURCE_COPY = 'Updating source. Canvas editing is temporarily unavailable.';

/** The shell guidance live region, which announces each refused attempt once. */
function guidance(page: Page) {
  return page.locator('[role="status"][aria-live="polite"]:not([data-testid])');
}

/** Slice 94 browser evidence for timing-independent update ownership. */
test('S94: a source update shows its Properties chip without moving the Close control', async ({ page }) => {
  await startCleanEditor(page);
  await openBuffer(page, { name: 'chip.coral',
    buffer: Buffer.from('@diagram flowchart\nalpha process\n') });
  await page.locator('.react-flow__node[data-id="alpha"]').click();
  const panel = page.getByLabel('Properties panel');
  const close = panel.getByRole('button', { name: 'Close panel' });
  await expect(close).toBeVisible();
  const stable = await close.boundingBox();
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000);
  await page.getByLabel('DSL editor', { exact: true }).fill(
    '@diagram flowchart\nalpha process\nbeta process\nalpha -> beta\n');
  await expect(page.getByTestId('visible-update-status')).toHaveText(SOURCE_COPY);
  await expect(panel.getByText('Updating source', { exact: true })).toBeVisible();
  expect(await close.boundingBox()).toEqual(stable);
  await page.clock.resume();
  await expect(page.getByTestId('visible-update-status')).toHaveCount(0);
  await expect(panel.getByText('Updating source', { exact: true })).toHaveCount(0);
  expect(await close.boundingBox()).toEqual(stable);
});

const HELD_TEXT = '@diagram architecture\nalpha service as "Alpha"\n' +
  'beta database as "Beta"\ndraft service as "Draft only"\nalpha -> beta\n';

/** Save while the layout is held; the download must be the exact source draft. */
async function expectExactDraftSave(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await pending;
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: HELD_TEXT });
}

test('S94 GraphIR interchange: a drag during first layout keeps the opened document', async ({ page }) => {
  const other = {
    name: 'other.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { name: 'Other', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'other',
        nodes: [
          { id: 'xray', type: 'service', label: 'Xray', position: { x: 0, y: 0 } },
          { id: 'yankee', type: 'database', label: 'Yankee', position: { x: 400, y: 0 } },
        ],
        edges: [{ id: 'xy', source: 'xray', target: 'yankee' }],
        constraints: [{
          id: 'yankee-right-of-xray', kind: 'relative', strength: 'preferred',
          subject: { kind: 'node', nodeId: 'yankee' }, relation: 'right-of',
          target: { kind: 'node', nodeId: 'xray' }, gap: 10,
        }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    })),
  };
  const canvasIds = (page: Page) => page.locator('.react-flow__node')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')).sort());
  await holdNextLayoutWorker(page);
  await startCleanEditor(page);
  const source = page.getByLabel('DSL editor', { exact: true });

  // Hold the open's first layout, then drag before it lands (CR94-C4-F1).
  await page.evaluate(() => { window.__slice94HoldLayoutMessages = true; });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles(other);
  const xray = page.locator('.react-flow__node[data-id="xray"]');
  await expect(xray).toHaveCount(1);
  const box = (await xray.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();

  // Its print-back asks for a held resolution; the canvas keeps this document.
  await expect(source).toHaveValue(/"Xray" @ \(/);
  expect(await canvasIds(page)).toEqual(['xray', 'yankee']);
  await page.evaluate(() => window.__slice94ReleaseLayoutMessages?.());
  await waitForEditorSettled(page);
  expect(await canvasIds(page)).toEqual(['xray', 'yankee']);
  await expect(source).toHaveValue(/"Xray"[\s\S]*"Yankee"/);
});

test('S94: a text open and a draft recovery save their exact source while the layout is held', async ({ page }) => {
  await holdNextLayoutWorker(page);
  await startCleanEditor(page);
  const source = page.getByLabel('DSL editor', { exact: true });
  const draftNode = page.locator('.react-flow__node[data-id="draft"]');

  // Open a Coral text file whose layout is held: it is only source until then.
  await page.evaluate(() => { window.__slice94HoldLayoutMessages = true; });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: 'held.coral', mimeType: 'text/plain', buffer: Buffer.from(HELD_TEXT),
  });
  await expect(source).toHaveValue(HELD_TEXT);
  await expect(draftNode).toHaveCount(0);
  await expectExactDraftSave(page);
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.stale|current source has rendered successfully/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('visible-update-status')).toHaveText(SOURCE_COPY);
  await page.evaluate(() => window.__slice94ReleaseLayoutMessages?.());
  await expect(draftNode).toHaveCount(1);
  await waitForEditorSettled(page);

  // Recover a source draft whose layout is held: the same rules apply.
  await page.evaluate((text) => {
    localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: 'Recovered draft', dslType: 'coral', dsl: text,
      notation: 'architecture', nodePositions: {},
      document: {
        schemaVersion: '1.0.0',
        metadata: { name: 'Recovered draft', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
        content: { format: 'dsl', dslType: 'coral', text },
        settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
      },
    }));
  }, HELD_TEXT);
  await page.reload();
  const recover = page.getByRole('button', { name: /recover your work/i });
  await expect(recover).toBeVisible();
  await waitForEditorSettled(page);
  await page.evaluate(() => { window.__slice94HoldLayoutMessages = true; });
  page.once('dialog', (dialog) => dialog.accept());
  await recover.click();
  await expect(source).toHaveValue(HELD_TEXT);
  await expect(draftNode).toHaveCount(0);
  await expectExactDraftSave(page);
  await expectBlockedPaletteCommand(page, 'Export GraphIR 4 candidate',
    /coral\.editor\.source-export\.stale|current source has rendered successfully/);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__slice94ReleaseLayoutMessages?.());
  await expect(draftNode).toHaveCount(1);
  await waitForEditorSettled(page);
});

test('S94 GraphIR interchange: refused Open retains input until update settles', async ({ page }) => {
  const OPEN_REFUSAL = 'Finish the current diagram update before opening another document.';
  const loaded = {
    name: 'loaded.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      schemaVersion: '1.0.0',
      metadata: { name: 'Loaded', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'loaded', nodes: [{ id: 'loaded', type: 'service', label: 'Loaded wins' }], edges: [],
      } },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    })),
  };
  await holdNextLayoutWorker(page);
  await startCleanEditor(page);
  const source = page.getByLabel('DSL editor', { exact: true });
  const typed = 'flowchart TD\n  alpha[Alpha] --> beta[Beta]';
  await page.evaluate(() => { window.__slice94HoldLayoutMessages = true; });
  await source.fill(typed);
  await expect(page.getByTestId('visible-update-status')).toHaveText(SOURCE_COPY);
  const before = await canvasGeometry(page);

  // TR94-C4-F2: a file chosen while the source update is live is refused
  // without a dialog, and nothing changes.
  let dialogs = 0;
  const countDialog = () => { dialogs += 1; };
  page.on('dialog', countDialog);
  const fileInput = page.locator('.coral-file-controls input[type="file"]');
  await fileInput.setInputFiles(loaded);
  await expect(guidance(page)).toHaveText(OPEN_REFUSAL);
  await expect(source).toHaveValue(typed);
  expect(await canvasGeometry(page)).toEqual(before);
  expect(dialogs).toBe(0);
  page.off('dialog', countDialog);

  // After the update settles, the stale refusal is gone and Open succeeds.
  await page.evaluate(() => window.__slice94ReleaseLayoutMessages?.());
  await expect(page.getByTestId('visible-update-status')).toHaveCount(0);
  await expect(guidance(page)).not.toHaveText(OPEN_REFUSAL);
  await waitForEditorSettled(page);
  page.once('dialog', (dialog) => dialog.accept());
  await fileInput.setInputFiles(loaded);
  await expect(page.locator('.react-flow__node[data-id="loaded"]')).toHaveCount(1);
  await waitForEditorSettled(page);

});
