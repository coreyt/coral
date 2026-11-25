import { test } from '@playwright/test';
import { sceneContract } from './support/sceneContract.js';
import { largeDocumentContract } from './support/largeDocumentContract.js';
import { browserRenderContract } from './support/browserRenderContract.js';

test('350-node scene loads, renders connectors, drags, and restores zoom', async ({ page }) => {
  test.setTimeout(90_000);
  await sceneContract(page);
});
test('500-node document preserves drag undo and recovery checkpoints', async ({ page }) => {
  test.setTimeout(90_000);
  await largeDocumentContract(page);
});
test('25-node browser rendering works in fresh and reused contexts', async ({ browser }) => {
  test.setTimeout(60_000);
  await browserRenderContract(browser);
});
