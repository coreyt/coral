import { expect, test } from '@playwright/test';

test('0.2.9 has no AI or voice entry points and recovers a stored AI tab', async ({ page, context }) => {
  let providerCalls = 0;
  await context.route(/(?:api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com)/, async (route) => {
    providerCalls += 1;
    await route.abort();
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('ai-deferral-seeded')) return;
    localStorage.setItem('coral.workspace.v1', JSON.stringify({ version: 1,
      sourceWidthPercent: 34, propertiesWidthPx: 320, bottomHeightPx: 220,
      inspectorOpen: true, bottomCollapsed: false, bottomTab: 'ai', propertiesTab: 'selection' }));
    sessionStorage.setItem('ai-deferral-seeded', 'true');
  });
  await page.goto('/coral/');
  const closeWelcome = page.getByRole('button', { name: 'Close welcome' });
  if (await closeWelcome.isVisible()) await closeWelcome.click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Diagnostics/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /AI Conversation/ })).toHaveCount(0);
  await expect(page.getByLabel('AI prompt')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: 'Preferences' });
  await expect(preferences).toBeVisible();
  await expect(preferences.getByText('AI Generation', { exact: true })).toHaveCount(0);
  await expect(preferences.getByPlaceholder('Enter API key...')).toHaveCount(0);
  await expect(preferences.getByLabel('Voice input mode')).toHaveCount(0);
  expect(providerCalls).toBe(0);
});
