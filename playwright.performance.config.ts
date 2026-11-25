import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['slice60-performance.spec.ts', 'slice80-browser-performance.spec.ts',
    'slice028-scene-performance.spec.ts', 'spatial-waypoint-performance029.spec.ts',
    'svg-artwork-calibration-performance029.spec.ts', 'my-icons-import-performance029.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  webServer: { ...base.webServer, reuseExistingServer: false },
});
