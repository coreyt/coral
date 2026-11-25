import { test } from '@playwright/test';
import { benchmarkEnvironment } from '../scripts/performance-policy.mjs';
import { browserRenderContract } from './support/browserRenderContract.js';

test('25-node flowchart renders within 500 ms cold p95 and 200 ms repeat p95', async ({ browser }) => {
  const policy = benchmarkEnvironment({ browserVersion: browser.version() });
  test.skip(!policy.measure, policy.reason);
  test.setTimeout(300_000);
  await browserRenderContract(browser, true);
});
