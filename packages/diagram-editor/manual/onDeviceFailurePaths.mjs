// P5 failure paths and download interception for the on-device editing model
// (coralsmol integration plan W-30; R-066), with no GPU. It serves the built
// editor (`npm run build` first) and runs Chrome with the GPU disabled; the
// pages see a mocked WebGPU adapter so the capability probe passes, and the
// model worker, which would find no adapter, is never asked to load a model.
// The download is the real one, from the pinned host, through the product UI.
//
// Checks: no WebGPU and a fallback adapter each show their message; a second
// tab gets the in-use message; evicted files offer the download again; the
// download sends no referrer or cookie; every download host, redirects
// included; no request carries request text or diagram content.
//
// Usage: node manual/onDeviceFailurePaths.mjs --out FILE
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const editor = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(editor, 'package.json'));
const { chromium } = require('playwright');
const { values: v } = parseArgs({ options: { out: { type: 'string' } } });
if (!v.out) throw new Error('Required: --out FILE');
const manifest = JSON.parse(readFileSync(join(editor, 'src/onDeviceModel/model-manifest.json'), 'utf8'));
const SOURCE = '@diagram flowchart\nstart terminal as "Begin Quillon"\nship process as "Ship Marmot"\nstart -> ship\n';
const SECRETS = ['Quillon', 'Marmot', 'Rename Ship'];

const server = await preview({ root: editor, configFile: join(editor, 'vite.config.ts'), logLevel: 'warn',
  preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const coral = new URL(server.resolvedUrls.local[0]).origin;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--disable-gpu'] });
const mockAdapter = fallback => {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: fallback === null ? undefined : {
    requestAdapter: async () => ({ info: { vendor: 'mock', architecture: 'mock', description: '', isFallbackAdapter: fallback } }) } });
};
let phase = 'load';
const log = [];
const watch = context => context.on('request', request => {
  const entry = { phase, url: request.url(), postData: request.postData(), redirectedFrom: request.redirectedFrom()?.url() ?? null, headers: null };
  log.push(entry);
  request.allHeaders().then(headers => { entry.headers = headers; }, () => {});
});
const open = async page => {
  await page.goto(`${coral}/coral/`);
  const close = page.getByRole('button', { name: 'Close welcome' });
  if (await close.isVisible().catch(() => false)) await close.click();
  await page.locator('.coral-file-controls input[type="file"]').setInputFiles({ name: 'paths.coral', mimeType: 'text/plain', buffer: Buffer.from(SOURCE) });
  await page.waitForFunction(source => document.querySelector('[aria-label="DSL editor"]')?.value === source, SOURCE, { timeout: 15_000 });
};
const preferenceMessage = async page => {
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog', { name: 'Preferences' }).getByRole('checkbox', { name: 'On-device editing model (experimental)' }).click();
  await page.waitForFunction(() => /Not available|Not enough|Turn on the on-device/.test(document.body.innerText), null, { timeout: 30_000 });
  return page.evaluate(() => document.body.innerText.match(/Not available in this browser[^\n]*|Not enough storage[^\n]*/)?.[0] ?? 'dialog opened');
};
const status = page => page.getByTestId('on-device-status').textContent().then(text => text?.trim());
const ask = async (page, text) => {
  const field = page.getByLabel('Request', { exact: true });
  // A freshly opened document may still be updating; ask again until it has settled.
  for (let attempt = 0; attempt < 20; attempt++) {
    await field.fill(text);
    await field.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#on-device-request')?.readOnly
      && !/^(Working|Preparing)/.test(document.querySelector('[data-testid="on-device-status"]')?.textContent ?? ''), null, { timeout: 60_000 });
    const message = await status(page);
    if (!/still updating/.test(message ?? '')) return message;
    await page.waitForTimeout(500);
  }
  return status(page);
};
const result = { schema: 'coral-on-device-p5-failure-paths/1', startedAt: new Date().toISOString(), revision: manifest.source.revision };

// Unsupported browsers.
for (const [name, fallback] of [['noWebGpu', null], ['fallbackAdapter', true]]) {
  const context = await browser.newContext();
  await context.addInitScript(mockAdapter, fallback);
  const page = await context.newPage();
  await open(page);
  (result.unsupported ??= {})[name] = await preferenceMessage(page);
  await context.close();
}

// Real download with a mocked real adapter, then the second tab and eviction.
const context = await browser.newContext();
watch(context);
await context.addInitScript(mockAdapter, false);
const first = await context.newPage();
await open(first);
phase = 'enable';
result.enableDialog = await preferenceMessage(first);
phase = 'download';
await first.getByRole('dialog', { name: 'Turn on the on-device editing model' }).getByRole('button', { name: 'Download', exact: true }).click();
await first.getByText(/Downloaded and verified/).waitFor({ timeout: 20 * 60_000 });
result.download = await first.getByText(/Downloaded and verified/).textContent();
await first.keyboard.press('Escape');
phase = 'ready';

phase = 'second-tab';
await first.evaluate(() => { navigator.locks.request('coral-on-device-model', () => new Promise(release => { window.releaseModelLock = release; })); });
const second = await context.newPage();
await open(second);
await second.getByRole('tab', { name: 'AI', exact: true }).click();
result.secondTab = await ask(second, 'Rename Ship Marmot to Ship Lemur');
await first.evaluate(() => window.releaseModelLock());
await second.close();

phase = 'eviction';
await first.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
});
await first.getByRole('tab', { name: 'AI', exact: true }).click();
result.eviction = { request: await ask(first, 'Rename Ship Marmot to Ship Lemur') };
await first.keyboard.press('Control+,');
const preferences = first.getByRole('dialog', { name: 'Preferences' });
await preferences.getByText(/The model is not downloaded\.|Downloaded and verified/).waitFor({ timeout: 30_000 });
result.eviction.preferences = (await preferences.textContent())?.match(/The model is not downloaded\.|Downloaded and verified[^.]*\./)?.[0] ?? null;
result.eviction.downloadOffered = await preferences.getByRole('button', { name: 'Download model' }).isVisible();
await context.close();
await browser.close();
await server.close();

const host = url => new URL(url).host;
const downloads = log.filter(r => r.phase === 'download' && host(r.url) !== new URL(coral).host);
const modelHosts = new Set(downloads.map(r => host(r.url)));
result.interception = {
  downloadHosts: [...modelHosts],
  downloads: downloads.map(r => ({ url: r.url.replace(/\?.*$/, '?…'), redirectedFrom: r.redirectedFrom?.replace(/\?.*$/, '?…') ?? null,
    referer: r.headers?.referer ?? null, cookie: r.headers?.cookie ?? null })),
  referrerOrCookieSent: downloads.some(r => r.headers?.referer || r.headers?.cookie),
  modelHostRequestsOnceReady: log.filter(r => !['download', 'enable', 'load'].includes(r.phase) && modelHosts.has(host(r.url))).length,
  requestsCarryingRequestTextOrDiagram: log.filter(r => SECRETS.some(s => r.url.includes(s) || r.url.includes(encodeURIComponent(s))
    || (r.postData ?? '').includes(s))).map(r => r.url),
  foreignHosts: [...new Set(log.filter(r => !/^(data|blob):/.test(r.url) && host(r.url) !== new URL(coral).host).map(r => host(r.url)))],
};
writeFileSync(resolve(v.out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ unsupported: result.unsupported, secondTab: result.secondTab, eviction: result.eviction,
  referrerOrCookieSent: result.interception.referrerOrCookieSent, downloadHosts: result.interception.downloadHosts,
  modelHostRequestsOnceReady: result.interception.modelHostRequestsOnceReady,
  leaks: result.interception.requestsCarryingRequestTextOrDiagram.length }));
