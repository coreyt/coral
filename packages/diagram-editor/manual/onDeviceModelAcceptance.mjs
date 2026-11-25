// P2 browser acceptance for the on-device editing model (coralsmol
// integration plan, slice P2; R-066). Not part of the unit suite: it needs the
// R2e export, a headed Chrome with WebGPU, and an RTX 3090 adapter. Run it
// under the experiment's resource guard, inside a coralsmol-250-* unit.
//
// The editor's own module and worker are served by the Vite dev server, which
// sends no cross-origin isolation headers. The model files come from a second
// local origin standing in for the pinned host; nothing is uploaded anywhere.
//
// Checks: a corrupt download never reaches ready; a clean download verifies;
// recorded P1 prompts reproduce P1's browser replies; loading a ready model
// requests nothing from the model host; Stop cancels; a second tab gets
// `in-use`; every page request stays on Coral's origin apart from the download.
//
// Usage: node manual/onDeviceModelAcceptance.mjs --export DIR --out FILE [--prompts 20]
import { createServer } from 'node:http';
import { createReadStream, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { GPU_CHROME_ARGS, IGNORED_DEFAULT_ARGS, stopUnlessRtx3090 } from './gpuChrome.mjs';

const editor = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(join(editor, 'package.json'));
const { chromium } = require('playwright');
const { values: v } = parseArgs({ options: { export: { type: 'string' }, out: { type: 'string' }, prompts: { type: 'string', default: '20' },
  // --smoke: headless with the GPU disabled, so no model ever runs; checks the download path and wiring only.
  smoke: { type: 'boolean', default: false } } });
if (!v.export || !v.out) throw new Error('Required: --export DIR --out FILE');
const exportDirectory = resolve(v.export);
const manifest = JSON.parse(readFileSync(join(editor, 'src/onDeviceModel/model-manifest.json'), 'utf8'));
const fixture = JSON.parse(gunzipSync(readFileSync(join(editor, 'test/fixtures/onDeviceModel/parity.json.gz'))).toString('utf8'));

// Recorded P1 prompts: the unauthorized and rejected ones first, then in order.
const p1 = fixture.replies.filter(r => r.set === 'p1-browser');
const notable = p1.filter(r => r.unauthorized || 'rejected' in r.expected);
const prompts = [...notable, ...p1.filter(r => !notable.includes(r))].slice(0, Number(v.prompts))
  .map(r => ({ id: r.diagram, expected: r.text, ...fixture.diagrams[r.diagram] }));

// Stand-in model host on its own origin. `/corrupt/` flips one byte of one file.
const hostLog = [];
const host = createServer((request, response) => {
  const url = new URL(request.url, 'http://host');
  hostLog.push({ path: url.pathname, referer: request.headers.referer ?? null, cookie: request.headers.cookie ?? null, at: Date.now() });
  const [, mode, ...parts] = url.pathname.split('/');
  const path = parts.join('/');
  const file = manifest.files.find(f => f.path === path);
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (!['model', 'corrupt'].includes(mode) || !file) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': statSync(join(exportDirectory, path)).size });
  if (mode === 'corrupt' && path === 'tokenizer_config.json') {
    const bytes = readFileSync(join(exportDirectory, path)); bytes[0] ^= 1; response.end(bytes); return;
  }
  createReadStream(join(exportDirectory, path)).pipe(response);
});
await new Promise(r => host.listen(0, '127.0.0.1', r));
const hostBase = `http://127.0.0.1:${host.address().port}`;

const vite = await createVite({ root: editor, configFile: join(editor, 'vite.config.ts'), logLevel: 'warn',
  server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const coral = new URL(vite.resolvedUrls.local[0]).origin;

stopUnlessRtx3090();
const profile = mkdtempSync(join(tmpdir(), 'coral-on-device-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: '/usr/bin/google-chrome-stable',
  // As in the P1 runs: with the Chrome sandbox on, the high-performance
  // adapter here is an RTX 3090; without it Chrome picked the Quadro K620.
  headless: v.smoke, chromiumSandbox: true, args: v.smoke ? ['--disable-gpu'] : GPU_CHROME_ARGS,
  ignoreDefaultArgs: IGNORED_DEFAULT_ARGS });
const pageRequests = [];
let phase = 'start';
context.on('request', request => pageRequests.push({ phase, url: request.url() }));
const page = context.pages()[0] ?? await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${coral}/coral/`);
// Every worker refuses a non-Ampere adapter before it reads a model file, and
// reports the adapter it chose; the harness checks each one.
const load = target => target.evaluate(async () => {
  const m = await import('/coral/src/onDeviceModel/index.ts');
  window.workerAdapters = [];
  window.onDeviceModel = { m, model: m.composeOnDeviceModel({ requireArchitecture: 'ampere',
    onAdapter: adapter => window.workerAdapters.push(adapter) }) };
});
const checkWorkerAdapters = async target => {
  const seen = await target.evaluate(() => window.workerAdapters);
  const other = seen.find(a => a.architecture !== 'ampere');
  if (other) throw new Error(`Model compute requires an RTX 3090 adapter; a worker chose ${JSON.stringify(other)}`);
  return seen.length;
};
await load(page);

const result = { schema: 'coral-on-device-p2-acceptance/1', startedAt: new Date().toISOString(),
  chrome: context.browser()?.version() ?? null, crossOriginIsolated: await page.evaluate(() => self.crossOriginIsolated) };
phase = 'probe';
result.probe = await page.evaluate(() => window.onDeviceModel.model.probe());
result.estimate = await page.evaluate(() => window.onDeviceModel.model.estimate());
// The worker requests the same high-performance adapter. This workstation's
// Ampere adapters are its two RTX 3090s; the Quadro K620 is display-only.
result.adapter = await page.evaluate(async () => {
  const info = (await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }))?.info;
  return info ? { vendor: info.vendor, architecture: info.architecture, description: info.description } : null;
});
if (!v.smoke && result.adapter?.architecture !== 'ampere') throw new Error(`Model compute requires an RTX 3090 adapter: ${JSON.stringify(result.adapter)}`);

phase = 'corrupt-download';
result.corruptDownload = await page.evaluate(async base => {
  // Only this harness overrides the pinned host, through the composition.
  const model = window.onDeviceModel.m.composeOnDeviceModel({ baseUrl: base });
  const outcome = await model.download().then(() => 'ready', error => error.code ?? error.message);
  return { outcome, stored: await model.stored() };
}, `${hostBase}/corrupt/`);

phase = 'download';
const downloadStarted = hostLog.length;
result.download = await page.evaluate(async base => {
  const model = window.onDeviceModel.m.composeOnDeviceModel({ baseUrl: base });
  const started = performance.now();
  const outcome = await model.download().then(() => 'ready', error => error.code ?? error.message);
  return { outcome, stored: await model.stored(), seconds: (performance.now() - started) / 1000 };
}, `${hostBase}/model/`);
const downloadRequests = hostLog.slice(downloadStarted);
result.download.requests = downloadRequests.length;
result.download.referrerOrCookieSent = downloadRequests.some(r => r.referer || r.cookie);
if (result.download.outcome !== 'ready') throw new Error(`Download failed: ${JSON.stringify(result.download)}`);

phase = 'exchanges';
const hostBeforeExchanges = hostLog.length;
result.exchanges = [];
for (const prompt of prompts) {
  const reply = await page.evaluate(async ({ id, request, snapshot }) => {
    const { m, model } = window.onDeviceModel;
    const table = await m.handleTable(id, snapshot);
    const started = performance.now();
    const outcome = await model.run(m.compactMessages(request, snapshot, table));
    return { ...outcome, seconds: (performance.now() - started) / 1000 };
  }, prompt);
  await checkWorkerAdapters(page);
  if (reply.code === 'gpu-adapter' || (reply.adapter && reply.adapter.architecture !== 'ampere')) throw new Error(`Model compute requires an RTX 3090 adapter: ${JSON.stringify(reply)}`);
  result.exchanges.push({ id: prompt.id, status: reply.status, same: reply.text === prompt.expected, expected: prompt.expected,
    actual: reply.text ?? null, error: reply.code ?? null, adapter: reply.adapter ?? null,
    seconds: Math.round(reply.seconds * 100) / 100 });
  if (reply.status !== 'ok') break;
}
result.modelHostRequestsWhileReady = hostLog.length - hostBeforeExchanges;

phase = 'stop';
result.stop = await page.evaluate(async ({ id, request, snapshot }) => {
  const { m, model } = window.onDeviceModel;
  const pending = model.run(m.compactMessages(request, snapshot, await m.handleTable(id, snapshot)));
  await new Promise(r => setTimeout(r, 200));
  model.stop();
  return (await pending).status ?? await pending;
}, prompts[0]);

phase = 'second-tab';
const second = await context.newPage();
await second.goto(`${coral}/coral/`);
await load(second);
await page.evaluate(async ({ id, request, snapshot }) => {
  const { m, model } = window.onDeviceModel;
  window.pendingExchange = model.run(m.compactMessages(request, snapshot, await m.handleTable(id, snapshot)));
}, prompts[0]);
result.secondTab = await second.evaluate(async ({ id, request, snapshot }) => {
  const { m, model } = window.onDeviceModel;
  return model.run(m.compactMessages(request, snapshot, await m.handleTable(id, snapshot)));
}, prompts[0]);
result.firstTabAfterSecond = await page.evaluate(async () => (await window.pendingExchange).status);
await second.close();

const origins = new Set([coral, hostBase]);
result.pageRequestOrigins = [...new Set(pageRequests.map(r => new URL(r.url).origin))];
result.foreignRequests = pageRequests.filter(r => !origins.has(new URL(r.url).origin) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
result.modelHostRequestsOutsideDownload = pageRequests.filter(r => r.url.startsWith(hostBase) && !r.phase.includes('download')).length;
result.runtimeRequests = pageRequests.filter(r => /ort-wasm|onnxruntime/.test(r.url)).map(r => new URL(r.url).pathname);
result.pageErrors = errors;
result.summary = {
  prompts: result.exchanges.length,
  identical: result.exchanges.filter(e => e.same).length,
  corruptNeverReady: result.corruptDownload.outcome === 'hash' && result.corruptDownload.stored === 'none',
  downloadVerified: result.download.stored === 'ready',
  zeroModelHostRequestsOnceReady: result.modelHostRequestsWhileReady === 0,
  stopCancels: result.stop === 'cancelled',
  secondTabInUse: result.secondTab === 'in-use',
  noForeignRequests: result.foreignRequests.length === 0,
  adapters: [...new Set(result.exchanges.map(e => e.adapter && `${e.adapter.vendor}/${e.adapter.architecture}`))],
};
await context.close(); await vite.close(); host.close();
rmSync(profile, { recursive: true, force: true });
writeFileSync(resolve(v.out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result.summary));
