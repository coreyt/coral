import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const port = process.env.S92_PORT ?? '4173';

/** Slice 92 acceptance never converts a first-attempt failure into a pass. */
export default defineConfig({
  ...base,
  testMatch: ['slice55-open.spec.ts', 'slice80-browser-package.spec.ts',
    'acceptance028-multi-edit.spec.ts', 'acceptance028-network-source.spec.ts',
    'acceptance028-pairwise-source-owned.spec.ts'],
  workers: 4,
  retries: 0,
  use: {
    ...base.use,
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    ...base.webServer,
    command: `npm run preview -w @coral-viz/diagram-editor -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
