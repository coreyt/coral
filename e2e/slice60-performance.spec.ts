import { test } from '@playwright/test';
import { benchmarkEnvironment } from '../scripts/performance-policy.mjs';
import { largeDocumentContract } from './support/largeDocumentContract.js';

test('500-node drag p95 stays within 45 ms and zoom p95 within 55 ms', async ({ page, browser }) => {
  const policy = benchmarkEnvironment({ browserVersion: browser.version() });
  test.skip(!policy.measure, policy.reason);
  test.setTimeout(180_000);
  await largeDocumentContract(page, true);
});
