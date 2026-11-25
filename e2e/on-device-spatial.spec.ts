import { expect, test, type Page } from '@playwright/test';
import { openBuffer, startCleanEditor } from './support/user-journey.js';

// R-066 with OD-7: a spatial request through the on-device panel, before and
// after another applied edit, against the scripted model (no worker or GPU).
// The diagram is the P5 release smoke's.
const SOURCE = '@diagram flowchart\nstart terminal as "Begin Quillon"\n' +
  'a group as "Team Alder" {\n  r process as "Review Zephyr"\n}\nb group as "Team Birch" {\n  r process as "Review Zephyr"\n}\n' +
  'ledger database as "Ledger Okapi"\nship process as "Ship Marmot"\nstart -> a.r\na.r -> ship\n';

const status = (page: Page) => page.getByTestId('on-device-status');

async function ask(page: Page, text: string, outcome: 'review' | RegExp = 'review') {
  const request = page.getByLabel('Request', { exact: true });
  await request.fill(text);
  await request.press('Enter');
  const heading = page.getByRole('heading', { name: 'Review the proposed change' });
  await expect(heading.or(status(page).getByText(/cannot be applied/))).toBeVisible({ timeout: 30_000 });
  if (outcome !== 'review') return expect(status(page)).toHaveText(outcome);
  await expect(heading, await status(page).textContent() ?? '').toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(request).toHaveValue('');
}

// After an applied edit the canvas keeps its positions, which a fresh layout
// may not reproduce. The placement keeps the canvas as shown (H3): no Reflow,
// and the rest of the diagram does not move on Apply.
test('after an applied edit, places the node without moving the rest', async ({ page }) => {
  test.setTimeout(120_000);
  await startCleanEditor(page);
  await openBuffer(page, { name: 'smoke.coral', buffer: Buffer.from(SOURCE) });
  await page.keyboard.press('Control+,');
  const preferences = page.getByRole('dialog', { name: 'Preferences' });
  await preferences.getByRole('checkbox', { name: 'On-device editing model (experimental)' }).click();
  await page.getByRole('dialog', { name: 'Turn on the on-device editing model' }).getByRole('button', { name: 'Download', exact: true }).click();
  await expect(preferences.getByText(/Downloaded and verified/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const editor = page.getByLabel('DSL editor', { exact: true });
  const places = () => page.locator('.react-flow__node').evaluateAll(nodes => Object.fromEntries(nodes
    .map(node => [node.getAttribute('data-id'), (node as HTMLElement).style.transform])));

  await ask(page, 'Rename "Ship Marmot" to "Deliver Marmot"');
  const before = await places();
  await ask(page, 'Place "Ledger Okapi" below "Deliver Marmot"');
  await expect(editor).toHaveValue(/ledger database as "Ledger Okapi" @ \(/);
  const after = await places();
  const unmoved = Object.keys(before).filter(id => id !== 'ledger');
  expect(Object.fromEntries(unmoved.map(id => [id, after[id]]))).toEqual(Object.fromEntries(unmoved.map(id => [id, before[id]])));
});
