import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { showProperties, openBuffer, openSavedDocument, saveDocument, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol gate {', '  name "Gate"',
  '  size 40 x 40', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#286699"/></svg>',
  '"""', '}', 'g service [symbol: "local.gate"]', 'a service', 'a -> g', '// PRIVATE_ACCEPTANCE029', ''].join('\n');

test('user-symbol edits save and reopen locally before frozen export and raw candidate refusal', async ({ page }) => {
  const writes: string[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()) || request.url().includes('PRIVATE_ACCEPTANCE029')) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await startCleanEditor(page);
  await showProperties(page);
  await openBuffer(page, { name: 'symbols.coral', buffer: Buffer.from(SOURCE) });
  await expect(page.locator('[data-coral-artwork="local.gate"] use')).toHaveCount(1);
  await page.locator('.react-flow__node[data-id="g"]').click();
  await page.getByRole('button', { name: 'Edit symbol', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Gateway');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await waitForEditorSettled(page);
  const edited = await page.getByLabel('DSL editor', { exact: true }).inputValue();
  expect(edited).toContain('name "Gateway"');
  expect(edited).toContain('PRIVATE_ACCEPTANCE029');
  const saved = await saveDocument(page);
  expect(saved.document.content.text).toBe(edited);
  await openBuffer(page, { name: 'other.coral', buffer: Buffer.from('@diagram architecture\na service\n') });
  await openSavedDocument(page, saved.path);
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(edited);
  await expect(page.locator('[data-coral-artwork="local.gate"] use')).toHaveCount(1);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Export GraphIR 4 candidate', exact: true }).click();
  const download = await pending;
  const text = await readFile((await download.path())!, 'utf8');
  const value = JSON.parse(text);
  expect(value.documentCatalog).toHaveLength(1);
  expect(value.documentCatalog[0]).toMatchObject({ id: 'local.gate', name: 'Gateway',
    artwork: { profile: { id: 'coral.svg-artwork', version: '1' } } });
  expect(value.documentCatalog[0].digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  // C7 explicitly retains the editor's raw GraphIR 4 refusal. The supported
  // GraphIR-to-source writer is covered unmocked by renderer interchange tests.
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({
    name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text),
  });
  await expect(page.getByRole('alert')).toContainText('Unsupported GraphIR document version: 4.0.0');
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(edited);
  const recoveredText = `${edited}// Recovery keeps PRIVATE_ACCEPTANCE029 local\n`;
  await page.getByLabel('DSL editor', { exact: true }).fill(recoveredText);
  await expect.poll(() => page.evaluate(() => {
    const value = localStorage.getItem('coral-diagram-recovery');
    return value ? JSON.parse(value).dsl : undefined;
  })).toBe(recoveredText);
  await page.reload();
  await page.getByRole('button', { name: /recover your work/i }).click();
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(recoveredText);
  await waitForEditorSettled(page);
  expect(writes).toEqual([]);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.locator('[data-coral-artwork="local.gate"] use')).toHaveCount(1);
});
