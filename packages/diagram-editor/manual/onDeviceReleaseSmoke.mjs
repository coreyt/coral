// P5 release smoke for the on-device editing model (coralsmol integration
// plan, W-28 and W-30; R-066). Not part of the unit suite. It serves the built
// editor (`npm run build` first), downloads the pinned model from the real
// host through the product UI in a headed Chrome, makes a handful of
// requests, and checks the failure paths. Model compute needs an RTX 3090
// adapter: run it under the experiment's resource guard, inside a
// coralsmol-250-* unit. This is a functional smoke, not a quality measurement.
//
// Usage: node manual/onDeviceReleaseSmoke.mjs --out FILE
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { GPU_CHROME_ARGS, IGNORED_DEFAULT_ARGS, stopUnlessRtx3090 } from './gpuChrome.mjs';

const editor = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(editor, 'package.json'));
const { chromium } = require('playwright');
const { values: v } = parseArgs({ options: { out: { type: 'string' } } });
if (!v.out) throw new Error('Required: --out FILE');
const manifest = JSON.parse(readFileSync(join(editor, 'src/onDeviceModel/model-manifest.json'), 'utf8'));

// Labels unique enough to find in any request body or URL.
const SOURCE = '@diagram flowchart\nstart terminal as "Begin Quillon"\n' +
  'a group as "Team Alder" {\n  r process as "Review Zephyr"\n}\nb group as "Team Birch" {\n  r process as "Review Zephyr"\n}\n' +
  'ledger database as "Ledger Okapi"\nship process as "Ship Marmot"\nstart -> a.r\na.r -> ship\n';
// The model recognises item names only in quotes, as every training request
// wrote them. The first request is unquoted on purpose: the model asks
// "ask unclear", and the answer restates it with quotes.
const REQUESTS = [
  { text: 'rename ship marmot to deliver marmot', kind: 'unquoted', answer: 'Rename "Ship Marmot" to "Deliver Marmot"' },
  { text: 'Place "Ledger Okapi" below "Deliver Marmot"', kind: 'spatial' },
  { text: 'Add a new process "Audit Narwhal" connected from "Begin Quillon".', kind: 'structure' },
  { text: 'Rename "Review Zephyr" to "Approve Zephyr"', kind: 'clarification', choose: /Team Birch/, answer: 'the one in "Team Birch"' },
  { text: 'Remove the arrow from "Begin Quillon" to "Review Zephyr".', kind: 'removal' },
];
const SECRETS = [...REQUESTS.map(r => r.text), 'Quillon', 'Zephyr', 'Okapi', 'Marmot', 'Narwhal', 'Alder', 'Birch'];

const server = await preview({ root: editor, configFile: join(editor, 'vite.config.ts'), logLevel: 'warn',
  preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const coral = new URL(server.resolvedUrls.local[0]).origin;

let phase = 'load';
stopUnlessRtx3090(reason => writeFileSync(resolve(`${v.out}.partial`), JSON.stringify({ phase, stopped: reason }) + '\n'));
const profile = mkdtempSync(join(tmpdir(), 'coral-on-device-p5-'));
// As in P1 and P2: with the Chrome sandbox on, the high-performance adapter is an RTX 3090.
const context = await chromium.launchPersistentContext(profile, { executablePath: '/usr/bin/google-chrome-stable',
  headless: false, chromiumSandbox: true, args: GPU_CHROME_ARGS, ignoreDefaultArgs: IGNORED_DEFAULT_ARGS });
// The product UI creates the model worker. Wrap Worker so that every model
// worker is told to refuse a non-Ampere adapter before it reads a model file,
// and record the prompt it is sent, the adapter it chose and its raw reply.
await context.addInitScript(() => {
  const Native = window.Worker;
  const record = window.__onDevice = { sent: [], adapters: [], replies: [], events: [] };
  window.Worker = class extends Native {
    constructor(url, options) {
      super(url, options);
      this.model = String(url).includes('model.worker');
      if (this.model) this.addEventListener('message', ({ data }) => {
        if (data?.type === 'adapter') record.adapters.push(data.adapter);
        if (data?.type === 'result') record.replies.push(data.result);
        record.events.push(data?.type ?? typeof data);
      });
    }
    postMessage(message, ...rest) {
      if (this.model && Array.isArray(message?.messages)) {
        message = { ...message, requireArchitecture: 'ampere' };
        record.sent.push(message.messages);
      }
      return super.postMessage(message, ...rest);
    }
  };
});
const workerRecord = async target => {
  const record = await target.evaluate(() => window.__onDevice);
  const other = record.adapters.find(a => a.architecture !== 'ampere')
    ?? record.replies.find(r => r.code === 'gpu-adapter' || (r.adapter && r.adapter.architecture !== 'ampere'));
  if (other) throw new Error(`Model compute requires an RTX 3090 adapter: ${JSON.stringify(other)}`);
  return record;
};
const log = [];
context.on('request', request => {
  const entry = { phase, url: request.url(), method: request.method(), type: request.resourceType(), postData: request.postData(),
    redirectedFrom: request.redirectedFrom()?.url() ?? null, headers: null };
  log.push(entry);
  request.allHeaders().then(headers => { entry.headers = headers; }, () => {});
});
const page = context.pages()[0] ?? await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('crash', () => errors.push('page crashed'));
context.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url().replace(/\?.*$/, '?…')}`); });
const watchWorker = worker => worker.on('console', message => errors.push(`worker ${message.type()}: ${message.text().slice(0, 300)}`));
page.on('worker', watchWorker);
page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(`console ${message.type()}: ${message.text().slice(0, 300)}`); });
context.on('close', () => errors.push('context closed'));
const result = { schema: 'coral-on-device-p5-smoke/1', startedAt: new Date().toISOString(), chrome: context.browser()?.version() ?? null,
  revision: manifest.source.revision };
// A failure still leaves what was observed, for the record.
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, async error => {
  const worker = await page.evaluate(() => window.__onDevice).catch(() => null);
  writeFileSync(resolve(`${v.out}.partial`), JSON.stringify({ ...result, phase, errors, worker, error: String(error?.stack ?? error),
    requests: log.map(r => `${r.phase}:${r.method} ${r.url.replace(/\?.*$/, '?…')}`) }, null, 2) + '\n');
  process.exit(1);
});

const start = async target => {
  await target.goto(`${coral}/coral/`);
  const close = target.getByRole('button', { name: 'Close welcome' });
  if (await close.isVisible().catch(() => false)) await close.click();
  await target.locator('.react-flow__node').first().waitFor();
};
const open = async target => {
  const editorField = target.getByLabel('DSL editor', { exact: true });
  await target.locator('.coral-file-controls input[type="file"]').setInputFiles({ name: 'smoke.coral', mimeType: 'text/plain', buffer: Buffer.from(SOURCE) });
  await target.waitForFunction(source => document.querySelector('[aria-label="DSL editor"]')?.value === source, SOURCE, { timeout: 15_000 });
  return editorField;
};
const adapter = target => target.evaluate(async () => {
  const info = (await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }))?.info;
  return info ? { vendor: info.vendor, architecture: info.architecture, description: info.description } : null;
});
const status = target => target.getByTestId('on-device-status').textContent();
/** After Send: wait until the panel shows a review, a question, or is idle again. */
const ended = async target => {
  await target.waitForFunction(() => document.querySelector('#on-device-request')?.readOnly, null, { timeout: 10_000 }).catch(() => {});
  await target.waitForFunction(() => document.querySelector('#on-device-review-heading')
    || document.querySelector('[aria-label="Question from the model"]') || !document.querySelector('#on-device-request')?.readOnly,
  null, { timeout: 5 * 60_000, polling: 250 });
};

await start(page);
const editorField = await open(page);
result.adapter = await adapter(page);
if (result.adapter?.architecture !== 'ampere') throw new Error(`Model compute requires an RTX 3090 adapter: ${JSON.stringify(result.adapter)}`);

// W-28: download the exact artifact through Preferences and the enable dialog.
phase = 'enable';
await page.keyboard.press('Control+,');
const preferences = page.getByRole('dialog', { name: 'Preferences' });
await preferences.getByRole('checkbox', { name: 'On-device editing model (experimental)' }).click();
const dialog = page.getByRole('dialog', { name: 'Turn on the on-device editing model' });
await dialog.waitFor();
result.enableDialogNetworkNote = (await dialog.locator('[data-initial-focus]').textContent())?.trim();
phase = 'download';
const downloadStarted = Date.now();
await dialog.getByRole('button', { name: 'Download', exact: true }).click();
await preferences.getByText(/Downloaded and verified/).waitFor({ timeout: 20 * 60_000 });
result.download = { seconds: Math.round((Date.now() - downloadStarted) / 100) / 10,
  stored: (await preferences.getByText(/Downloaded and verified/).textContent())?.trim() };
await page.keyboard.press('Escape');

// Requests through the AI tab: review and apply, answering one question.
phase = 'ready';
await page.getByRole('tab', { name: 'AI', exact: true }).click();
const requestField = page.getByLabel('Request', { exact: true });
const heading = page.getByRole('heading', { name: 'Review the proposed change' });
const answer = page.getByLabel('Your answer');
const question = page.getByRole('region', { name: 'Question from the model' });
result.exchanges = [];
for (const request of REQUESTS) {
  const started = Date.now();
  const entry = { request: request.text, kind: request.kind };
  const { sent: { length: sentBefore }, replies: { length: repliesBefore }, adapters: { length: adaptersBefore } } = await workerRecord(page);
  await adapter(page).then(found => { if (found?.architecture !== 'ampere') throw new Error(`Adapter changed: ${JSON.stringify(found)}`); });
  await requestField.fill(request.text);
  await requestField.press('Enter');
  await ended(page);
  if (await question.isVisible().catch(() => false)) {
    entry.question = (await status(page))?.trim();
    const choices = question.getByRole('button').filter({ hasNotText: /^(Answer|Cancel)$/ });
    entry.choices = await choices.allTextContents();
    const chosen = choices.filter({ hasText: request.choose ?? /$^/ });
    if (await chosen.count()) await chosen.first().click();
    else { await answer.fill(request.answer ?? request.text); await answer.press('Enter'); }
    await ended(page);
  }
  if (await heading.isVisible().catch(() => false)) {
    entry.changes = await page.getByRole('list', { name: 'Proposed changes' }).locator('li').allTextContents();
    entry.layoutWarnings = await page.getByRole('list', { name: 'Layout warnings' }).locator('li').allTextContents().catch(() => []);
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.waitForFunction(() => !document.querySelector('#on-device-review-heading')
      && !document.querySelector('#on-device-request')?.readOnly, null, { timeout: 60_000 });
  }
  entry.status = (await status(page))?.trim();
  entry.seconds = Math.round((Date.now() - started) / 100) / 10;
  const record = await workerRecord(page);
  entry.prompts = record.sent.slice(sentBefore);
  entry.replies = record.replies.slice(repliesBefore);
  entry.adapters = record.adapters.slice(adaptersBefore);
  result.exchanges.push(entry);
  console.log(JSON.stringify(entry));
}
result.finalSource = await editorField.inputValue();

// Failure path: a second tab asks while this tab works.
phase = 'second-tab';
const second = await context.newPage();
await start(second);
await open(second);
await second.getByRole('tab', { name: 'AI', exact: true }).click();
await requestField.fill('Rename Ledger Okapi to Ledger Quokka');
await requestField.press('Enter');
await page.waitForFunction(() => document.querySelector('#on-device-request')?.readOnly, null, { timeout: 30_000 }).catch(() => {});
const secondField = second.getByLabel('Request', { exact: true });
await secondField.fill('Rename Ship Marmot to Ship Lemur');
await secondField.press('Enter');
await ended(second);
result.secondTab = (await status(second))?.trim();
await workerRecord(second);
await second.close();
await ended(page);
if (await heading.isVisible().catch(() => false)) await page.getByRole('button', { name: 'Discard' }).click();
if (await question.isVisible().catch(() => false)) await question.getByRole('button', { name: 'Cancel' }).click();

// Failure path: the browser evicts the stored files.
phase = 'eviction';
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
});
await requestField.fill('Rename Ship Marmot to Ship Lemur');
await requestField.press('Enter');
await ended(page);
result.eviction = { request: (await status(page))?.trim() };
await workerRecord(page);
await page.keyboard.press('Control+,');
result.eviction.preferences = (await preferences.textContent())?.match(/The model is not downloaded\.|Downloaded and verified[^.]*\./)?.[0] ?? null;
await page.keyboard.press('Escape');
result.pageErrors = errors;
await context.close();

// Failure path: unsupported browsers. GPU off, so no model can run.
const unsupported = async init => {
  const other = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--disable-gpu'] });
  const tab = await other.newPage();
  if (init) await tab.addInitScript(init);
  await start(tab);
  await tab.keyboard.press('Control+,');
  await tab.getByRole('dialog', { name: 'Preferences' }).getByRole('checkbox', { name: 'On-device editing model (experimental)' }).click();
  await tab.waitForFunction(() => /Not available|Not enough/.test(document.body.innerText), null, { timeout: 30_000 });
  const message = await tab.evaluate(() => document.body.innerText.match(/Not available in this browser[^\n]*|Not enough storage[^\n]*/)?.[0] ?? null);
  await other.close();
  return message;
};
result.unsupported = {
  noWebGpu: await unsupported(() => { Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }); }),
  fallbackAdapter: await unsupported(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true,
      value: { requestAdapter: async () => ({ info: { isFallbackAdapter: true, vendor: 'google', architecture: 'swiftshader' } }) } });
  }),
};
await server.close();
rmSync(profile, { recursive: true, force: true });

// W-30: interception.
const host = url => new URL(url).host;
const downloads = log.filter(r => r.phase === 'download' && host(r.url) !== new URL(coral).host);
const modelHosts = new Set(downloads.map(r => host(r.url)));
const leaked = log.filter(r => SECRETS.some(secret => r.url.includes(encodeURIComponent(secret)) || r.url.includes(secret)
  || (r.postData ?? '').includes(secret)));
result.interception = {
  downloadHosts: [...modelHosts],
  downloadRequests: downloads.map(r => ({ url: r.url.replace(/\?.*$/, '?…'), redirectedFrom: r.redirectedFrom?.replace(/\?.*$/, '?…') ?? null,
    referer: r.headers?.referer ?? null, cookie: r.headers?.cookie ?? null, origin: r.headers?.origin ?? null })),
  referrerOrCookieSent: downloads.some(r => r.headers?.referer || r.headers?.cookie),
  modelHostRequestsOnceReady: log.filter(r => r.phase !== 'download' && r.phase !== 'enable' && modelHosts.has(host(r.url))).length,
  foreignHosts: [...new Set(log.filter(r => !/^(data|blob):/.test(r.url) && host(r.url) !== new URL(coral).host).map(r => `${r.phase}:${host(r.url)}`))],
  requestsCarryingRequestTextSnapshotOrReply: leaked.map(r => r.url),
  runtimeRequests: log.filter(r => /ort-wasm|onnxruntime|transformers|model\.worker/.test(r.url)).map(r => `${r.phase}:${new URL(r.url).pathname}`),
};
result.summary = {
  downloadVerified: /Downloaded and verified/.test(result.download.stored ?? ''),
  exchanges: result.exchanges.map(e => `${e.kind}: ${e.status}`),
  noRequestCarriesTextSnapshotOrReply: leaked.length === 0,
  noReferrerOrCookie: !result.interception.referrerOrCookieSent,
  zeroModelHostRequestsOnceReady: result.interception.modelHostRequestsOnceReady === 0,
  secondTab: result.secondTab, eviction: result.eviction, unsupported: result.unsupported,
};
writeFileSync(resolve(v.out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result.summary));
