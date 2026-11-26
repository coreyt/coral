import { expect, test } from '@playwright/test';
import { showProperties, openBuffer, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

// Slice 60 C5, R-065 AC-2 and AC-5: a keyboard-only journey through the
// Symbol list, the inspector Symbol summary, the symbol editor and a port
// label edit, each undone through the existing history.

const ARTWORK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>';
const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  tags "sensor"', '  size 60 x 40', '  outline ellipse', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  deep port [direction: out, anchor: core]', '  artwork svg """', ARTWORK, '"""', '}',
  'g service [symbol: "local.probe"]', 'vault database {', '  ingest port [direction: in]', '}', 'g:deep -> vault:ingest',
  ''].join('\n');

test('a user symbol is placed, inspected and edited from the keyboard with Undo', async ({ page }) => {
  test.setTimeout(90_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'probe.coral', buffer: Buffer.from(SOURCE) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(SOURCE);
  await waitForEditorSettled(page);
  await expect(page.locator('.react-flow__node[data-id="g"] [data-coral-artwork="local.probe"]')).toHaveCount(1);

  // Place from the Symbol list.
  await page.locator('.react-flow__node[data-id="g"]').focus();
  await page.keyboard.press('Control+Alt+n');
  const dialog = page.getByRole('dialog', { name: 'Create node' });
  await expect(dialog.getByLabel('Node ID')).toBeFocused();
  await page.keyboard.type('h');
  await dialog.getByLabel('Search symbols').focus();
  await page.keyboard.type('sensor');
  await expect(dialog.getByText('1 of')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('radio', { name: 'Probe' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Create node', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  const placed = /h service \[symbol: "local\.probe"\]/;
  await expect(editor).toHaveValue(placed);
  await waitForEditorSettled(page);
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(SOURCE);
  await waitForEditorSettled(page);

  const artworkReferences = await page.locator('[data-coral-artwork] use').evaluateAll((uses) =>
    uses.map((use) => {
      const href = use.getAttribute('href');
      return href?.startsWith('#') && document.getElementById(href.slice(1))?.localName === 'symbol';
    }));
  expect(artworkReferences.length).toBeGreaterThan(0);
  expect(artworkReferences.every(Boolean)).toBe(true);

  // Inspect the symbol and rename it in the symbol editor.
  await page.locator('.react-flow__node[data-id="g"]').focus();
  await page.keyboard.press('Enter');
  await showProperties(page);
  const inspector = page.getByLabel('Properties panel');
  const summary = inspector.getByRole('group', { name: 'Symbol' });
  await expect(summary.getByText(/^sha256:[0-9a-f]{64}$/)).toBeVisible();
  await summary.getByRole('button', { name: 'Edit symbol' }).focus();
  await page.keyboard.press('Enter');
  await expect(inspector.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Sensor');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveValue(SOURCE.replace('name "Probe"', 'name "Sensor"'));
  await waitForEditorSettled(page);
  await expect(inspector.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(inspector.getByRole('button', { name: 'Back to node' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(summary.getByRole('button', { name: 'Edit symbol' })).toBeFocused();
  await page.locator('.react-flow__node[data-id="g"]').focus();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(SOURCE);
  await waitForEditorSettled(page);

  // Label a node-local port.
  await page.locator('.react-flow__node[data-id="vault"]').focus();
  await page.keyboard.press('Enter');
  const label = inspector.getByLabel('Label for port ingest');
  await label.focus();
  await page.keyboard.type('Writes');
  await page.keyboard.press('Enter');
  await expect(editor).toHaveValue(SOURCE.replace('ingest port [direction: in]',
    'ingest port [direction: in, label: "Writes"]'));
  await waitForEditorSettled(page);
  await expect(label).toBeFocused();
  await page.locator('.react-flow__node[data-id="vault"]').focus();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(SOURCE);
});
