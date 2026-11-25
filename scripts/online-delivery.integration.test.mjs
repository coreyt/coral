import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { verifyExampleGalleryBrowser } from './example-catalog-browser.mjs';
import { verifyApiDocs028 } from './api-docs.mjs';
import { fileURLToPath } from 'node:url';

import {
  buildOnlineDelivery, createOnlineHandler, verifyFrozenSite,
} from './online-delivery.mjs';

async function compareSites(first, second, identity) {
  const firstManifest = await verifyFrozenSite(first, identity);
  const secondManifest = await verifyFrozenSite(second, identity);
  assert.deepEqual(secondManifest, firstManifest);
  for (const { path } of firstManifest.files) {
    assert.deepEqual(await readFile(join(second, path)), await readFile(join(first, path)), path);
  }
  return firstManifest;
}

async function assertNoWorkerRegistration(site, manifest) {
  for (const { path } of manifest.files.filter(({ path }) => /\.(?:js|html)$/.test(path))) {
    const text = await readFile(join(site, path), 'utf8');
    assert.doesNotMatch(text, /serviceWorker\.register|workbox/i, path);
    if (path.endsWith('.js') && path !== 'sw.js') {
      assert.doesNotMatch(text, /addEventListener\(['"`]fetch['"`]/, `${path}: fetch handler`);
    }
  }
}

async function verifyServedSite(site, manifest) {
  const server = createServer(createOnlineHandler(site));
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const asset = manifest.files.find(({ path }) => path.startsWith('assets/') && path.endsWith('.js'))?.path;
    assert(asset, 'built site must contain a JavaScript asset');
    for (const path of [
      '/coral/', '/coral/docs/', '/coral/docs/use/get-started',
      '/coral/docs/embed/', '/coral/docs/contribute/', '/coral/docs/api/',
      '/coral/docs/api/reflection.json', '/coral/.nojekyll',
      `/coral/${asset}`, '/coral/version.json', '/coral/sw.js',
    ]) assert.equal((await fetch(`${base}${path}`)).status, 200, path);
    await verifyApiBrowser(base);
    await verifyExampleGalleryBrowser(base);
    assert.match(await (await fetch(`${base}/coral/sw.js`)).text(), /registration\.unregister\(\)/);
    for (const path of [
      '/coral/manifest.webmanifest', '/coral/missing',
      '/coral/docs/missing', '/outside',
    ]) assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  } finally {
    await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
  }
}


async function verifyApiBrowser(origin) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => errors.push(`${request.failure()?.errorText} ${request.url()}`));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  try {
    await page.goto(`${origin}/coral/docs/`);
    const apiLink = page.getByRole('link', { name: 'Generated API', exact: true });
    assert.equal(await apiLink.getAttribute('href'), '/coral/docs/api/');
    await apiLink.click();
    await page.waitForURL(`${origin}/coral/docs/api/`);
    await page.getByRole('link', { name: '@coral-viz/language', exact: true }).first().click();
    await page.getByRole('link', { name: 'parse', exact: true }).first().click();
    await page.waitForURL('**/functions/*parse.html');
    await page.getByRole('link', { name: 'HeaderRuntime028', exact: true }).first().click();
    await page.waitForURL('**/interfaces/*HeaderRuntime028.html');
    assert.match(await page.locator('body').innerText(), /trustedDigests/);
    // TypeDoc ships a compressed local index; test actual asynchronous search.
    await page.locator('#tsd-search-trigger').click();
    await page.locator('#tsd-search-input').fill('renderInstalledCharacterPreview028');
    const result = page.locator('#tsd-search-results a').filter({ hasText: 'renderInstalledCharacterPreview028' }).first();
    await result.waitFor({ state: 'visible' });
    await result.click();
    await page.waitForURL('**/functions/*renderInstalledCharacterPreview028.html');
    assert.match(await page.locator('body').innerText(), /renderInstalledCharacterPreview028/);
    assert.deepEqual(external, [], 'API must not require external requests');
    assert.deepEqual(errors, [], 'assembled documentation must load without browser errors');
  } finally { await browser.close(); }
}

async function verifyIntegratedApi(site, manifest, identity) {
  const api = join(site, 'docs/api');
  const counts = await verifyApiDocs028(api);
  assert(counts.htmlPages > 700);
  const inventory = JSON.parse(await readFile(join(api, 'inventory.json'), 'utf8'));
  // My Icons adds the reviewed artwork-import public entry.
  assert.equal(inventory.length, 18);
  const model = JSON.parse(await readFile(join(api, 'reflection.json'), 'utf8'));
  const module = name => model.children.find(child => child.name === name);
  assert.equal(model.children.length, 16);
  const language = module('@coral-viz/language');
  const alias = language.children.find(child => child.name === 'parse');
  const named = language.children.find(child => child.name === 'parseDocument028');
  assert(alias.target === named.id || named.target === alias.id);
  const signature = (alias.signatures ? alias : named).signatures[0];
  assert.equal(signature.parameters[1].type.name, 'HeaderRuntime028');
  assert(module('@coral-viz/render').children.some(child => child.name === 'renderInstalledCharacterPreview028'));
  assert.equal(module('@coral-viz/mcp-server').children?.length ?? 0, 0);
  assert.equal(module('tree-sitter-coral').children[0].type.name, 'Parser.Language');
  assert(manifest.files.some(({ path }) => path === '.nojekyll'));
  assert(manifest.files.some(({ path }) => path === 'docs/api/reflection.json'));
  // Frozen verification rejects changed API bytes without repairing them.
  const file = join(api, 'assets/main.js'), bytes = await readFile(file);
  await writeFile(file, Buffer.concat([bytes, Buffer.from('/* changed API */')]));
  await assert.rejects(verifyFrozenSite(site, identity), /integrity mismatch/);
  assert((await readFile(file)).includes(Buffer.from('changed API')));
  await writeFile(file, bytes);
  await verifyFrozenSite(site, identity);
  console.log(`Integrated API: ${JSON.stringify(counts)}; inventory, contracts, browser search and frozen tamper checks passed`);
}

// CORAL_FROZEN_SITE names a disposable copy of the frozen candidate owned by
// ci:delivery. It becomes the first operand, so CI compares the candidate with
// exactly one fresh, independently prepared build. Standalone runs build both.
test('real online builds are byte-reproducible, serve correctly, and emit no archive', { timeout: 180_000 }, async () => {
  const repository = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const frozen = process.env.CORAL_FROZEN_SITE ? resolve(process.env.CORAL_FROZEN_SITE) : undefined;
  const firstOutput = join(repository, 'build', 'online-rehearsal-one');
  const secondOutput = join(repository, 'build', 'online-rehearsal-two');
  if (!frozen) await rm(firstOutput, { recursive: true, force: true });
  await rm(secondOutput, { recursive: true, force: true });
  try {
    const first = frozen
      ? { site: frozen, identity: JSON.parse(await readFile(join(frozen, 'version.json'), 'utf8')) }
      : await buildOnlineDelivery({ repository, output: firstOutput, requireCleanSource: false });
    const second = await buildOnlineDelivery({ repository, output: secondOutput, requireCleanSource: false });
    assert.deepEqual(second.identity, first.identity);
    assert.equal('zipPath' in second, false);
    assert.equal('checksumPath' in second, false);
    const manifest = await compareSites(first.site, second.site, first.identity);
    await assertNoWorkerRegistration(first.site, manifest);
    await verifyServedSite(first.site, manifest);
    await verifyIntegratedApi(first.site, manifest, first.identity);
  } finally {
    if (!frozen) await rm(firstOutput, { recursive: true, force: true });
    await rm(secondOutput, { recursive: true, force: true });
  }
});
