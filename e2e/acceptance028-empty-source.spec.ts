import { expect, test } from '@playwright/test';
import { openBuffer, openSavedDocument, saveDocument, startCleanEditor,
  waitForEditorSettled } from './support/user-journey.js';

test('clearing Coral source remains exact through browser save and reopen', async ({ page }) => {
  test.setTimeout(90_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'clear.coral',
    buffer: Buffer.from('@diagram flowchart\na = process as "A"\n') });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(page.locator('[data-coral-scene-node="a"]')).toBeVisible();
  await editor.fill('');
  await waitForEditorSettled(page);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: '' });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\nb = process as "B"\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue('');
  expect((await saveDocument(page)).document.content).toEqual({ format: 'dsl', dslType: 'coral', text: '' });
});
