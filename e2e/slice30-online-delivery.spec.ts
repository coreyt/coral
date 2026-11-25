import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

test.describe.configure({ mode: 'serial' });

const root = resolve(process.cwd());
const oldCommit = '1111111111111111111111111111111111111111';
const expectedVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const contentTypes: Record<string, string> = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

async function startUpgradeServer(): Promise<{
  origin: string;
  switchOnline(): void;
  close(): Promise<void>;
}> {
  let online = false;
  const oldSource = await readFile(join(root, 'e2e/fixtures/legacy-sw.js'), 'utf8');
  const worker = oldSource
    .replace('__CORAL_RELEASE_IDENTITY_JSON__', JSON.stringify({
      product: 'coral', version: '0.2.5', commit: oldCommit,
    }))
    .replace('self.__WB_MANIFEST', "[{ url: '/coral/index.html' }]");
  const oldPage = `<!doctype html><html><body data-release="0.2.5"><script>
    navigator.serviceWorker.register('/coral/sw.js', { scope: '/coral/' });
  </script>old Coral</body></html>`;
  const server: Server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://local').pathname;
    if (path === '/peer/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end("self.addEventListener('fetch', () => {});");
      return;
    }
    if (!online && path === '/coral/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(worker);
      return;
    }
    if (!online && (path === '/coral/' || path === '/coral/index.html')) {
      response.setHeader('Content-Type', 'text/html');
      response.end(oldPage);
      return;
    }
    const relative = path === '/coral/' ? 'index.html' : path.replace(/^\/coral\//, '');
    if (path.startsWith('/coral/') && relative && !relative.includes('..')) {
      try {
        const body = await readFile(join(root, 'packages/diagram-editor/dist', relative));
        response.setHeader('Content-Type', contentTypes[extname(relative)] ?? 'application/octet-stream');
        response.end(body);
        return;
      } catch { /* return the explicit 404 below */ }
    }
    response.statusCode = 404;
    response.end('missing');
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Upgrade server did not bind');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    switchOnline: () => { online = true; },
    close: () => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())),
  };
}

test('production editor exposes online-only delivery and ordinary local save', async ({ page }) => {
  await page.goto('/coral/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button', { name: /install/i })).toHaveCount(0);
  await expect(page.getByRole('status', { name: /install|offline|update/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => ({
    registrations: 'serviceWorker' in navigator
      ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    coralCaches: 'caches' in globalThis
      ? (await caches.keys()).filter(name => name.startsWith('coral-shell-')).length : 0,
  }))).toEqual({ registrations: 0, coralCaches: 0 });
  // Preview falls back to HTML and production returns 404; neither is a manifest.
  const manifest = await page.request.get('/coral/manifest.webmanifest');
  expect(manifest.status() !== 200
    || !(manifest.headers()['content-type'] ?? '').includes('manifest+json')).toBe(true);
  expect(await manifest.text()).not.toContain('"display"');
  const sunset = await (await page.request.get('/coral/sw.js')).text();
  expect(sunset).toBe(readFileSync(join(root, 'packages/diagram-editor/public/sw.js'), 'utf8'));

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(await download).toBeTruthy();
});

test('a real 0.2.5 worker retires and the online app preserves unrelated origin state', async ({ page }) => {
  const server = await startUpgradeServer();
  try {
    await page.goto(`${server.origin}/coral/`);
    await expect(page.locator('body')).toHaveAttribute('data-release', '0.2.5');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      await navigator.serviceWorker.register('/peer/sw.js', { scope: '/peer/' });
      await caches.open('unrelated-product-cache');
    });
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-release', '0.2.5');
    await expect.poll(() => page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).map(item => new URL(item.scope).pathname).sort(),
      caches: (await caches.keys()).sort(),
    }))).toEqual({
      registrations: ['/coral/', '/peer/'],
      caches: [`coral-shell-0.2.5-${oldCommit}`, 'unrelated-product-cache'],
    });

    server.switchOnline();
    // The old worker allowlisted only the exact query-free navigation, so this
    // versioned transition reaches the hosted app and its Coral-only cleanup.
    await page.goto(`${server.origin}/coral/?online=0.2.6`);
    await expect(page.getByRole('main')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).map(item => new URL(item.scope).pathname),
      caches: await caches.keys(),
    }))).toEqual({
      registrations: ['/peer/'],
      caches: ['unrelated-product-cache'],
    });
    expect(await page.evaluate(() => (globalThis as typeof globalThis & {
      __CORAL_RELEASE_IDENTITY__?: { product: string; version: string; commit: string };
    }).__CORAL_RELEASE_IDENTITY__), 'stale dist: rebuild @coral-viz/diagram-editor at HEAD')
      .toEqual({ product: 'coral', version: expectedVersion, commit: expectedCommit });
    expect(expectedCommit).not.toBe(oldCommit);
  } finally {
    await server.close();
  }
});

test('a 0.2.5 bookmark converges on the online app through the sunset worker', async ({ page }) => {
  const server = await startUpgradeServer();
  try {
    await page.goto(`${server.origin}/coral/`);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-release', '0.2.5');

    server.switchOnline();
    // The ordinary bookmark is answered by the old cache-only shell; the
    // browser's navigation update check then installs the sunset worker,
    // which clears the shell and unregisters without reloading the page.
    await page.goto(`${server.origin}/coral/`);
    await expect(page.locator('body')).toHaveAttribute('data-release', '0.2.5');
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).length), { timeout: 20_000 }).toBe(0);
    await expect(page.locator('body')).toHaveAttribute('data-release', '0.2.5');
    // The user's next load reaches the online application.
    await page.goto(`${server.origin}/coral/`);
    await expect(page.getByRole('main')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      caches: await caches.keys(),
      version: (globalThis as typeof globalThis & {
        __CORAL_RELEASE_IDENTITY__?: { version: string };
      }).__CORAL_RELEASE_IDENTITY__?.version,
    }))).toEqual({ registrations: 0, caches: [], version: expectedVersion });
  } finally {
    await server.close();
  }
});
