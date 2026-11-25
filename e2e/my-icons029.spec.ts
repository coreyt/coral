import { expect, test } from '@playwright/test';
import { startCleanEditor, openBuffer, waitForEditorSettled } from './support/user-journey.js';
test('My Icons imports, saves, reopens and places one source-owned icon with Undo', async ({ page }) => {
  await startCleanEditor(page);
  await openBuffer(page, { name: 'icons.coral', buffer: Buffer.from('@diagram architecture\n@coralVersion "0.2.9"\na service\nb service\na -> b\n') });
  await waitForEditorSettled(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'My Icons', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'My Icons', exact: true });
  await dialog.getByLabel('Add SVG or icon bundle').setInputFiles({ name: 'Shield.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><rect x="2" y="2" width="20" height="8" fill="rgb(100%,0%,0%)"/></svg>') });
  await expect(dialog.getByRole('status')).toContainText('1 icons ready');
  await dialog.getByRole('button', { name: 'Save imported icons', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved to My Icons');
  await dialog.getByRole('button', { name: 'Place in diagram', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.reload();
  const welcome = page.getByRole('button', { name: 'Close welcome' }); if (await welcome.isVisible()) await welcome.click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'My Icons', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Shield', exact: true })).toBeVisible();
});
