import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openBuffer, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

const source = '@diagram architecture\napi service as "API"\ndb database as "Store"\napi -> db';

async function openExport(page: import('@playwright/test').Page, command: string) {
  await startCleanEditor(page);
  await openBuffer(page, { name: 'text-export.coral', buffer: Buffer.from(source) });
  await waitForEditorSettled(page);
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search commands').fill(command);
  await page.getByRole('option', { name: command, exact: true }).click();
}

test('plain-text export downloads API-identical A4 bytes through the editor', async ({ page }) => {
  const { renderText } = await import('@coral-viz/render');
  const expected = await renderText(source, { page: 'a4' });
  await openExport(page, 'Export Plain Text (.txt)');
  await page.getByLabel('Page size').selectOption('a4');
  await expect(page.getByLabel('Page 1', { exact: true })).toHaveText(expected.pages[0]);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .txt', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
  expect(await readFile((await download.path())!, 'utf8')).toBe(expected.text);
});

test('code-comment export copies Unicode and ASCII through the editor', async ({ page, context }) => {
  const { renderText } = await import('@coral-viz/render');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openExport(page, 'Copy as Code Comment');
  await page.getByLabel('Comment syntax').selectOption('hash');
  await page.getByLabel('Columns').selectOption('72');
  for (const charset of ['utf8-box', 'ascii'] as const) {
    await page.getByLabel('Character set').selectOption(charset);
    const expected = await renderText(source, { profile: 'comment', commentStyle: 'hash', columns: 72, charset });
    await expect(page.getByLabel('Page 1', { exact: true })).toHaveText(expected.text);
    await page.getByRole('button', { name: 'Copy comment', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected.text);
  }
});

for (const [family, input] of [
  ['flowchart', 'flowchart LR\n A[Alpha] --> B[Beta]'],
  ['sequence', 'sequenceDiagram\n participant A\n participant B\n A->>B: Request'],
  ['class', 'classDiagram\n class Animal\n class Dog\n Animal <|-- Dog'],
  ['erd', 'erDiagram\n CUSTOMER ||--o{ ORDER : places'],
  ['state', 'stateDiagram-v2\n [*] --> Ready\n Ready --> [*]'],
]) {
  test(`editor converts Mermaid ${family} to the same Coral as the API`, async ({ page }) => {
    const { transpileAndVerifyMermaidToCoral } = await import('@coral-viz/render');
    const expected = transpileAndVerifyMermaidToCoral(input);
    expect(expected.ok).toBe(true);
    await startCleanEditor(page);
    await waitForEditorSettled(page);
    if (family === 'sequence') {
      await openBuffer(page, { name: 'draft.mmd', buffer: Buffer.from('flowchart LR\n A --> B') });
      await page.getByLabel('DSL editor', { exact: true }).fill(input);
      await waitForEditorSettled(page);
    } else {
      await openBuffer(page, { name: 'convert.mmd', buffer: Buffer.from(input) });
    }
    await page.getByRole('button', { name: 'Convert to Editable Coral', exact: true }).click();
    if (expected.lossSummary.lossy) {
      await page.getByRole('button', { name: /^Convert Anyway/ }).click();
    }
    await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(expected.coral!);
  });
}
