import { test } from '@playwright/test';
import { benchmarkEnvironment } from '../scripts/performance-policy.mjs';
import { sceneContract } from './support/sceneContract.js';

test('350-node scene drag p95 stays within 45 ms and zoom p95 within 55 ms', async ({ page, browser }) => {
  const policy = benchmarkEnvironment({ browserVersion: browser.version() });
  test.skip(!policy.measure, policy.reason);
  test.setTimeout(480_000);
  await sceneContract(page, true);
});
