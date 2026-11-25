import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The on-device model's keyboard journey runs against the dev server with the
// on-device fixture (packages/diagram-editor/manual/onDeviceFixture.ts): the
// build constant on and a scripted model, no worker or GPU.
const port = process.env.CORAL_ON_DEVICE_E2E_PORT ?? '4193';
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'on-device-*.spec.ts',
  use: { ...base.use, baseURL: origin,
    storageState: { cookies: [], origins: [{ origin, localStorage: (base.use?.storageState as { origins: { localStorage: { name: string; value: string }[] }[] }).origins[0].localStorage }] } },
  webServer: {
    command: `CORAL_ON_DEVICE_FIXTURE=1 npm run dev -w @coral-viz/diagram-editor -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/coral/`, reuseExistingServer: false, timeout: 120_000,
  },
});
