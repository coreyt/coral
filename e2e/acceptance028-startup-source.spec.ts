import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { downloadFromPalette, openBuffer, openSavedDocument, saveDocument,
  waitForEditorSettled } from './support/user-journey.js';

const source = readFileSync(join(__dirname,
  '../packages/diagram-editor/src/example-sources/flowchart.coral'), 'utf8');

test('fresh editor starts from exact Coral source and reopens that source', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  await expect(page.getByRole('radio', { name: 'Coral' })).toBeChecked();
  await expect(page.locator('[data-coral-scene-node="start"]')).toBeVisible();
  await waitForEditorSettled(page);

  const exported = JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'));
  expect(exported.nodes.map((node: { id: string }) => node.id))
    .toEqual(['start', 'review', 'decision', 'revise', 'end']);
  expect(exported.edges).toHaveLength(5);

  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\ntemporary process\n') });
  await openSavedDocument(page, saved.path);
  await waitForEditorSettled(page);
  await expect(editor).toHaveValue(source);
  expect(JSON.parse((await downloadFromPalette(page,
    'Export GraphIR 4 candidate')).bytes.toString('utf8'))).toEqual(exported);
});
