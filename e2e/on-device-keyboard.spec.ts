import { expect, test, type Locator, type Page } from '@playwright/test';
import { openBuffer, startCleanEditor } from './support/user-journey.js';

// R-066 AC-8: a keyboard-only journey from enable to Undo, against the dev
// server with the on-device fixture (playwright.onDevice.config.ts). The model
// is scripted; no worker or GPU runs. Set CORAL_ON_DEVICE_SCREENSHOTS to a
// directory to save the enable dialog, a clarification and the review.
const SOURCE = '@diagram flowchart\nstart terminal as "Start"\na group as "Team A" {\n  r process as "Review"\n}\n' +
  'b group as "Team B" {\n  r process as "Review"\n}\nstart -> a.r\n';
const screenshots = process.env.CORAL_ON_DEVICE_SCREENSHOTS;

/**
 * Press Tab (or Shift+Tab) until the target has focus; the count proves it is
 * in the tab order. The source editor keeps Tab for indentation; Escape then
 * Tab leaves it, as for any keyboard user.
 */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab', limit = 60) {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'DSL editor')) await page.keyboard.press('Escape');
    await page.keyboard.press(key);
  }
  const active = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
  throw new Error(`Not reached by ${key} within ${limit} presses; focus is on ${active}`);
}

test('enables, asks, clarifies, reviews, applies and undoes from the keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'teams.coral', buffer: Buffer.from(SOURCE) });
  const editor = page.getByLabel('DSL editor', { exact: true });
  const documentName = page.getByLabel('Document name');

  // Enable in Preferences: the nested dialog opens on its facts, and Escape closes only it.
  await documentName.focus();
  await page.keyboard.press('Control+,');
  const preferences = page.getByRole('dialog', { name: 'Preferences' });
  const checkbox = preferences.getByRole('checkbox', { name: 'On-device editing model (experimental)' });
  await tabTo(page, checkbox);
  await page.keyboard.press('Space');
  const enable = page.getByRole('dialog', { name: 'Turn on the on-device editing model' });
  await expect(enable.getByText(/^Coral downloads the model/)).toBeFocused();
  if (screenshots) await enable.screenshot({ path: `${screenshots}/enable-dialog.png` });
  await page.keyboard.press('Escape');
  await expect(enable).toHaveCount(0);
  await expect(preferences).toBeVisible();
  await expect(checkbox).toBeFocused();
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.press('Space');
  await tabTo(page, enable.getByRole('button', { name: 'Download', exact: true }));
  await page.keyboard.press('Enter');
  await expect(preferences.getByText(/Downloaded and verified/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preferences).toHaveCount(0);
  await expect(documentName).toBeFocused();

  // Ask: the AI tab, the request field, then the review heading.
  // The tab list has one tab stop, the selected tab; arrow keys move between tabs.
  await tabTo(page, page.getByRole('tablist', { name: 'Bottom panel tabs' }).getByRole('tab', { selected: true }), 'Tab', 200);
  const aiTab = page.getByRole('tab', { name: 'AI', exact: true });
  for (let presses = 0; presses < 3 && !(await aiTab.evaluate(element => element === document.activeElement)); presses++) {
    await page.keyboard.press('ArrowLeft');
  }
  await expect(aiTab).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(aiTab).toHaveAttribute('aria-selected', 'true');
  const request = page.getByLabel('Request', { exact: true });
  await tabTo(page, request);
  await page.keyboard.type('Remove the arrow');
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: 'Review the proposed change' });
  await expect(heading).toBeFocused({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Proposed changes' })).toContainText('Removed arrow from "Start" to "Review"');
  await tabTo(page, page.getByRole('button', { name: 'Apply' }));
  await page.keyboard.press('Enter');
  await expect(request).toBeFocused();
  await expect(request).toHaveValue('');
  // A fresh layout without the arrow would move the nodes, so their canvas places are written (H3).
  await expect.poll(async () => (await editor.inputValue()).replace(/ @ \([^)]*\)/g, '')).toBe(SOURCE.replace('start -> a.r\n', ''));

  // Undo from the keyboard once focus leaves the text field.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveValue(SOURCE);

  // Clarify: focus lands on the answer field; choosing moves focus to Stop, then to the review.
  await tabTo(page, request, 'Shift+Tab');
  await page.keyboard.type('Rename which Review to Approve');
  await page.keyboard.press('Enter');
  const answer = page.getByLabel('Your answer');
  await expect(answer).toBeFocused({ timeout: 15_000 });
  if (screenshots) await page.locator('.coral-on-device').screenshot({ path: `${screenshots}/clarification.png` });
  await tabTo(page, page.getByRole('button', { name: '"Review" inside "Team B"' }), 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeFocused();
  await expect(heading).toBeFocused({ timeout: 15_000 });
  if (screenshots) await page.locator('.coral-on-device').screenshot({ path: `${screenshots}/review.png` });
  await tabTo(page, page.getByRole('button', { name: 'Apply' }));
  await page.keyboard.press('Enter');
  await expect(request).toBeFocused();
  // The canvas kept its places through Apply and Undo, so they are written here too (H3).
  await expect.poll(async () => (await editor.inputValue()).replace(/ @ \([^)]*\)/g, '')).toBe(SOURCE.replace(
    'b group as "Team B" {\n  r process as "Review"', 'b group as "Team B" {\n  r process as "Approve"'));
});
