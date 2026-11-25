import { expect, test } from '@playwright/test';
import { openBuffer, startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

test('structured diagnostics, scroll sync, highlighting, formats, themes, and paint baseline', async ({ page }) => {
  test.setTimeout(60_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'editor-features.coral',
    buffer: Buffer.from('@diagram flowchart\nbad =\nalso =\n') });
  const editor = page.getByLabel('DSL editor', { exact: true });
  await expect(editor).toHaveAttribute('data-language', 'coral');
  const markers = page.getByRole('button', { name: /^Error:/ });
  await expect(markers).toHaveCount(2, { timeout: 10_000 });
  await markers.first().focus();
  await expect(page.getByRole('tooltip')).toContainText(
    '[coral.syntax.node.kind-required] Node declaration requires a kind');

  await editor.fill('@diagram flowchart\n' +
    Array.from({ length: 60 }, (_, index) => `bad_${index}_${'x'.repeat(180)} =`).join('\n'));
  await expect(markers).toHaveCount(60, { timeout: 10_000 });
  await editor.evaluate((element) => {
    element.scrollTop = 20;
    element.scrollLeft = 10;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(() => page.locator('[data-testid="text-editor-overlay"]').evaluate((element) => ({
    top: element.scrollTop,
    left: element.scrollLeft,
  }))).toEqual({ top: 20, left: 10 });
  await expect.poll(() => page.locator('[data-testid="text-editor-marker-gutter"]').evaluate((element) => ({
    top: element.scrollTop,
    left: element.scrollLeft,
  }))).toEqual({ top: 20, left: 0 });

  await page.getByRole('button', { name: 'Preferences' }).click();
  const highlighting = page.getByLabel('Entity highlighting');
  await expect(highlighting).not.toBeChecked();
  await highlighting.check();
  await page.getByLabel('Close preferences').click();

  const source = '@diagram flowchart\napi process as "API"\ndb process as "DB"\napi -> db';
  await editor.fill(source);
  await expect(markers).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('[data-entity-id="api"]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByLabel('Entity highlighting').uncheck();
  await page.getByLabel('Close preferences').click();
  await expect(page.locator('[data-entity-id]')).toHaveCount(0);
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByLabel('Entity highlighting').check();
  await page.getByLabel('Close preferences').click();
  await expect(page.locator('[data-entity-id="api"]')).toHaveCount(2, { timeout: 10_000 });

  await editor.press('End');
  await editor.press(' ');
  await expect(editor).toHaveValue(`${source} `);
  await editor.press('Control+z');
  await expect(editor).toHaveValue(source);
  // The canvas label edit below is refused until Undo's source update publishes.
  await waitForEditorSettled(page);

  const apiNode = page.locator('.react-flow__node[data-id="api"]');
  await apiNode.locator('[role="group"]').dblclick();
  const labelInput = apiNode.locator('input[type="text"]');
  await labelInput.fill('API v2');
  await labelInput.press('Enter');
  await expect(editor).toHaveValue(source.replace('api process as "API"',
    'api process as "API v2"'), { timeout: 10_000 });
  await expect(page.locator('[data-entity-id="api"]')).toHaveCount(2);

  const lightColor = await page.locator('[data-entity-id="api"]').first().evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('dialog', { name: 'Preferences' }).locator('select').first().selectOption('dark');
  await page.getByLabel('Close preferences').click();
  await expect.poll(() => page.locator('[data-entity-id="api"]').first().evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightColor);

  await page.getByRole('radio', { name: 'Mermaid' }).click();
  await expect(editor).toHaveAttribute('data-language', 'coral');
  await expect(editor).toHaveValue(source.replace('api process as "API"',
    'api process as "API v2"'));
  await expect(page.locator('[data-entity-id]').first()).toBeVisible({ timeout: 10_000 });
});
