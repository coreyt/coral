import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/** Slice 55: every entry point opens a file through one pipeline (R-064). */

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const THREE_ERRORS = '@diagram flowchart\na process\nb process\n' +
  'a -> b [label: "x", label: "y"]\nfirst =\nsecond =';

async function start(page: Page) {
  await page.goto('/coral/');
  await page.evaluate(key => {
    localStorage.setItem(key, 'true');
    localStorage.removeItem('coral-diagram-recovery');
  }, `coral-welcome-seen:${version}`);
  await page.reload();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

const headerInput = (page: Page) => page.locator('.coral-file-controls input[type="file"]');
const editor = (page: Page) => page.getByLabel('DSL editor', { exact: true });

test('Load keeps malformed 0.2.8 Coral text exact and blocks semantic export', async ({ page }) => {
  await start(page);
  await headerInput(page).setInputFiles({ name: 'broken.coral', mimeType: 'text/plain', buffer: Buffer.from(THREE_ERRORS) });

  await expect(editor(page)).toHaveValue(THREE_ERRORS);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await expect(page.getByRole('button', { name: /^Error: \[coral\.syntax\.label\.duplicate\]/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Error: \[coral\.syntax\.node\.kind-required\]/ })).toHaveCount(2);
  await expect(page.getByTestId('status-bar')).toContainText('Recovered graph — 3 errors');

  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill('Export SVG');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Recovered graph: 3 errors' })).toBeVisible();

  // The source-draft save keeps the exact text, and reopening it restores it.
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = JSON.parse(await readFile((await (await downloadPromise).path())!, 'utf8'));
  expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: THREE_ERRORS });
  await headerInput(page).setInputFiles({ name: 'broken.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(editor(page)).toHaveValue(THREE_ERRORS);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});

test('legacy text-only recovery keeps retired Coral spelling as an exact saveable draft', async ({ page }) => {
  const legacyText = 'service "Alpha"\ndatabase "Beta"\nalpha -> beta [dashed]';
  await page.goto('/coral/');
  await page.evaluate((text) => {
    localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: 'Recovered text', dslType: 'coral',
      dsl: text, notation: 'flowchart', nodePositions: {},
    }));
  }, legacyText);
  await page.reload();
  const recover = page.getByRole('button', { name: /recover your work/i });
  await expect(recover).toBeVisible();
  await recover.click();
  await expect(editor(page)).toHaveValue(legacyText);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await expect(page.getByText('header.diagram.required').first()).toBeVisible();
  expect(await page.locator('.react-flow__node[data-id="alpha"]').count()).toBe(0);

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = JSON.parse(await readFile((await (await downloadPromise).path())!, 'utf8'));
  expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: legacyText });
  await headerInput(page).setInputFiles({
    name: 'recovered.coral.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(editor(page)).toHaveValue(legacyText);
});

test('GraphIR recovery regenerates a stale Coral preview from its authoritative graph', async ({ page }) => {
  const document = {
    schemaVersion: '1.0.0',
    metadata: { name: 'Recovered graph', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: {
      version: '3.0.0', id: 'recovered-graph',
      nodes: [{ id: 'api', type: 'service', label: 'Renamed' }], edges: [],
    } },
    settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
  };
  await page.goto('/coral/');
  await page.evaluate((saved) => {
    localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: saved.metadata.name, dslType: 'coral',
      dsl: '@diagram architecture\napi service as "Stale preview"', notation: 'architecture',
      nodePositions: {}, document: saved,
    }));
  }, document);
  await page.reload();
  await page.getByRole('button', { name: /recover your work/i }).click();
  await expect(page.locator('.react-flow__node[data-id="api"]')).toBeVisible();
  await expect(editor(page)).toHaveValue(/Renamed/);
  await expect(editor(page)).not.toHaveValue(/Stale preview/);
  await expect(editor(page)).not.toBeEditable();

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const saved = JSON.parse(await readFile((await (await downloadPromise).path())!, 'utf8'));
  expect(saved.content.format).toBe('graph-ir');
  expect(saved.content.graphIR.nodes.find((node: { id: string }) => node.id === 'api').label).toBe('Renamed');
});

test('a blocked open lists every reason visibly and keeps current work', async ({ page }) => {
  await start(page);
  const before = await editor(page).inputValue();
  await headerInput(page).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ nope') });
  const notice = page.getByRole('alert').filter({ hasText: 'Could not open bad.json' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('coral.open.format.unrecognized');
  await expect(notice).toContainText('Invalid JSON');
  await expect(editor(page)).toHaveValue(before);
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toHaveCount(0);
});

test('a GraphIR 2 file opens with its migration notices', async ({ page }) => {
  await start(page);
  const legacy = { version: '2.0.0', id: 'legacy', nodes: [{ id: 'a', type: 'service', label: 'A' }], edges: [] };
  await headerInput(page).setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await expect(page.getByText(/legacy\.json: GraphIR 2\.0\.0 → 3\.0\.0/).first()).toBeVisible();
});

test('Ctrl+O, Welcome, and drag and drop share the open pipeline', async ({ page }) => {
  await start(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.react-flow').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+o');
  await (await chooser).setFiles({ name: 'keyed.mmd', mimeType: 'text/plain', buffer: Buffer.from('flowchart LR\n  K1[Keyed] --> K2[Opened]') });
  await expect(editor(page)).toHaveValue(/Keyed/);
  await expect(editor(page)).toHaveAttribute('data-language', 'mermaid');

  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('button', { name: 'Open Welcome and examples' }).click();
  const welcome = page.getByRole('dialog', { name: 'Welcome to Coral' });
  await welcome.getByLabel('Choose a diagram file').setInputFiles({ name: 'welcome.dot', mimeType: 'text/plain', buffer: Buffer.from('digraph G { w1 -> w2 }') });
  await expect(welcome).toHaveCount(0);
  await expect(editor(page)).toHaveValue(/w1/);

  await page.evaluate((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'dropped.coral', { type: 'text/plain' }));
    const shell = document.querySelector('.coral-app-shell')!;
    shell.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    shell.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, '@diagram flowchart\ndropped process as "Dropped"\n');
  await expect(editor(page)).toHaveValue('@diagram flowchart\ndropped process as "Dropped"\n');
  await expect(page).toHaveURL(/\/coral\//);
});
