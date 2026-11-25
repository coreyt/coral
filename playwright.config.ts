import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const port = process.env.CORAL_E2E_PORT ?? '4173';
const origin = `http://127.0.0.1:${port}`;
const phase = process.env.CORAL_E2E_PHASE;
if (phase && !['smoke', 'full'].includes(phase)) throw new Error(`Invalid CORAL_E2E_PHASE: ${phase}`);
const smoke = ['acceptance028-selection.spec.ts', 'acceptance028-empty-source.spec.ts',
  'slice55-open.spec.ts', 'slice80-browser-package.spec.ts'];

/**
 * Browser-level coverage (R-029).
 *
 * jsdom cannot exercise the things this suite is for: pointer gestures on the
 * canvas, a real file download, focus order across panes, and a worker loading
 * lazily. Those are the cases the roadmap named, and they are the ones here.
 */
export default defineConfig({
  testDir: './e2e',
  // on-device-*.spec.ts runs under playwright.onDevice.config.ts, with the feature on.
  testIgnore: ['on-device-*.spec.ts', 'slice60-performance.spec.ts', 'slice80-browser-performance.spec.ts',
    'slice028-scene-performance.spec.ts', 'spatial-waypoint-performance029.spec.ts',
    'svg-artwork-calibration-performance029.spec.ts', 'my-icons-import-performance029.spec.ts', ...(phase === 'full' ? smoke : [])],
  ...(phase === 'smoke' ? { testMatch: smoke } : {}),
  fullyParallel: true,
  // Each test has an isolated browser context; upgrade fixtures use their own
  // ephemeral server ports. Performance measurements run separately with one worker.
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  preserveOutput: 'never',
  reporter: [
    [process.env.CI ? 'github' : 'list'],
  ],
  use: {
    baseURL: origin,
    storageState: {
      cookies: [],
      origins: [{
        origin,
        localStorage: [{ name: `coral-welcome-seen:${version}`, value: 'true' }],
      }],
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -w @coral-viz/diagram-editor -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: !process.env.CI && !process.env.CORAL_E2E_PORT,
    timeout: 120_000,
  },
});
