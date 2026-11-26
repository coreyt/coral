import { expect, test } from '@playwright/test';
import { startCleanEditor, waitForEditorSettled } from './support/user-journey.js';

test('Properties starts closed and stays closed through selection and inline editing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('coral.workspace.v1', JSON.stringify({
    version: 1, sourceWidthPercent: 34, propertiesWidthPx: 320, bottomHeightPx: 220,
    inspectorOpen: true, bottomCollapsed: false, bottomTab: 'diagnostics', propertiesTab: 'selection',
  })));
  await startCleanEditor(page);
  await waitForEditorSettled(page);
  const properties = page.getByLabel('Properties panel', { exact: true });
  await expect(properties).toHaveCount(0);
  const node = page.locator('.react-flow__node[data-id="review"]');
  await node.click();
  await expect(node).toHaveClass(/selected/);
  await expect(properties).toHaveCount(0);
  await node.dblclick();
  const label = node.locator('input[type="text"]');
  await label.fill('Reviewed request');
  await label.press('Enter');
  await waitForEditorSettled(page);
  await expect(page.getByLabel('DSL editor', { exact: true })).toHaveValue(/as "Reviewed request"/);
  await expect(properties).toHaveCount(0);
  await page.getByLabel('Show inspector', { exact: true }).click();
  await expect(properties).toBeVisible();
  await expect(properties).toContainText('Reviewed request');
  await properties.getByRole('button', { name: 'Close panel' }).click();
  await page.locator('.react-flow__node[data-id="start"]').click();
  await expect(properties).toHaveCount(0);
});
