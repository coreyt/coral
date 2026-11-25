import { expect, test } from '@playwright/test';
import { openBuffer, openSavedDocument, saveDocument, startCleanEditor } from './support/user-journey.js';

test('malformed raw Mermaid remains saveable text through browser reopen', async ({ page }) => {
  test.setTimeout(90_000);
  const source = 'gantt\n  title Project';
  await startCleanEditor(page);
  await openBuffer(page, { name: 'unfinished.mmd', buffer: Buffer.from(source) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveValue(source);
  const saved = await saveDocument(page);
  expect(saved.document.content).toEqual({ format: 'dsl', dslType: 'mermaid', text: source });
  await openBuffer(page, { name: 'temporary.coral',
    buffer: Buffer.from('@diagram flowchart\na = process as "A"\n') });
  await openSavedDocument(page, saved.path);
  await expect(editor).toHaveValue(source);
  expect((await saveDocument(page)).document.content)
    .toEqual({ format: 'dsl', dslType: 'mermaid', text: source });
});
