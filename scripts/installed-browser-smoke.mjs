/** Installed browser package in Chromium: public ESM, IIFE and custom-element
 * rendering of the active/disabled source matrix, then the production successor
 * binding under a strict no-unsafe-eval CSP, compared with installed Node Core. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { readSafeTarball } from './api-compat-lib.mjs';
import { createSuccessorBrowserBinding028 } from '../packages/browser/scripts/successorBrowserBinding028.mjs';
import { ACTIVE_RENDERER_SOURCE_CASES_028, DISABLED_RENDERER_SOURCE_CASES_028,
  DISABLED_RENDERER_SOURCE_CODE_028, MISSING_HEADER_RENDERER_SOURCES_028,
  REQUIRED_SOURCE_SCENE_MARKERS_028 } from './renderer-source-cases.mjs';

const root = resolve(import.meta.dirname, '..');
const CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; worker-src 'none'";
const PAGE = '<!doctype html><meta charset="utf-8"><div id="diagram"></div>';
const styles = ['lowfi', 'hifi'];
const themes = ['light', 'dark'];

async function installedEntry(consumer, name) {
  const directory = join(consumer, 'node_modules', name);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const file = resolve(directory, manifest.exports['.'].import);
  const path = relative(await realpath(consumer), await realpath(file));
  assert.ok(path && !path.startsWith('..') && !isAbsolute(path), `${name} must resolve inside the consumer`);
  return file;
}

/** One served bundle origin; `csp` adds the strict policy to every response. */
async function serve(routes, { csp = false } = {}) {
  const headers = csp ? { 'Content-Security-Policy': CSP } : {};
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const script = routes[path];
    if (script !== undefined) {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', ...headers });
      response.end(typeof script === 'function' ? script(path) : script);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      response.end(routes.page?.(path) ?? PAGE);
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
const close = (server) => new Promise((done) => server.close(done));

async function publicMatrix(browser, bundles, sources) {
  const { server, origin } = await serve({ '/browser.js': bundles.esm, '/browser.iife.js': bundles.iife });
  try {
    for (const mode of ['esm', 'iife']) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      try {
        await page.goto(origin);
        if (mode === 'iife') await page.addScriptTag({ url: `${origin}/browser.iife.js` });
        else await page.evaluate(async () => { window.Coral = await import('/browser.js'); });
        assert.equal(await page.evaluate(() => typeof window.Coral?.renderTo), 'function',
          `${mode}: installed browser load: ${pageErrors.join('; ')}`);
        for (const { name, source, marks } of sources.active) for (const style of styles) for (const theme of themes) {
          const surface = `${mode}/${name}/${style}/${theme}`;
          const rendered = await page.evaluate(async ({ source, style, theme, marks }) => {
            const result = await window.Coral.renderTo('#diagram', source, { style, theme });
            await document.fonts.ready;
            // renderTo draws inside a Coral shadow-root surface (Slice 60 C4).
            const surface = (() => { const host = document.querySelector('#diagram'); const root = host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null); if (!root) throw new Error('no Coral surface on #diagram'); return root; })();
            return { missing: marks.filter(([attribute, value]) =>
              !surface.querySelector(`[${attribute}="${CSS.escape(value)}"]`)),
            parts: surface.querySelectorAll('[data-coral-part-id]').length, authored: Boolean(result.sourceGraph),
            errors: result.diagnostics.filter(({ severity }) => severity === 'error').length,
            fonts: [...document.fonts].map(({ status }) => status) };
          }, { source, style, theme, marks });
          assert.deepEqual(rendered.missing, [], `${surface}: required source scene marks`);
          assert.ok(rendered.parts > 0 && rendered.authored && rendered.errors === 0, surface);
          assert.ok(rendered.fonts.length > 0 && rendered.fonts.every((status) => status === 'loaded'), surface);
        }
        await page.evaluate(() => window.Coral.defineCustomElement());
        for (const { name, source, marks } of sources.active) for (const style of styles) for (const theme of themes) {
          const surface = `${mode}/${name}/${style}/${theme}: custom element`;
          const rendered = await page.evaluate(async ({ source, style, theme, marks }) => {
            const element = document.createElement('coral-diagram');
            element.source = source; element.renderOptions = { style, theme };
            const completed = new Promise((done, reject) => {
              element.addEventListener('coral-render', ({ detail }) => done(detail), { once: true });
              element.addEventListener('coral-error', ({ detail }) => reject(new Error(detail.message)), { once: true });
            });
            document.body.append(element);
            const result = await completed;
            await document.fonts.ready;
            const value = { missing: marks.filter(([attribute, id]) =>
              !element.shadowRoot.querySelector(`[${attribute}="${CSS.escape(id)}"]`)),
            parts: element.shadowRoot.querySelectorAll('[data-coral-part-id]').length,
            authored: Boolean(result.sourceGraph), fonts: [...document.fonts].map(({ status }) => status) };
            element.remove();
            return value;
          }, { source, style, theme, marks });
          assert.deepEqual(rendered.missing, [], `${surface}: required source scene marks`);
          assert.ok(rendered.parts > 0 && rendered.authored, surface);
          assert.ok(rendered.fonts.length > 0 && rendered.fonts.every((status) => status === 'loaded'), surface);
        }
        for (const { name, source } of sources.disabled) for (const style of styles) for (const theme of themes) {
          const surface = `${mode}/${name}/${style}/${theme}: disabled`;
          const refused = await page.evaluate(async ({ source, style, theme }) => {
            let codes = [];
            try { await window.Coral.renderTo('#diagram', source, { style, theme }); }
            catch (error) { codes = error.diagnostics?.map(({ code }) => code) ?? []; }
            const surface = (() => { const host = document.querySelector('#diagram'); const root = host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ?? (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null); if (!root) throw new Error('no Coral surface on #diagram'); return root; })();
            return { codes, parts: surface.querySelectorAll('[data-coral-part-id]').length,
              state: document.querySelector('#diagram').getAttribute('data-coral-state') };
          }, { source, style, theme });
          assert.ok(refused.codes.includes(DISABLED_RENDERER_SOURCE_CODE_028), surface);
          assert.equal(refused.parts, 0, surface);
          assert.equal(refused.state, 'error', surface);
          const custom = await page.evaluate(async ({ source, style, theme }) => {
            const element = document.createElement('coral-diagram');
            element.source = source; element.renderOptions = { style, theme };
            const failed = new Promise((done, reject) => {
              element.addEventListener('coral-error', ({ detail }) => done(detail), { once: true });
              element.addEventListener('coral-render', () => reject(new Error('Disabled source rendered')), { once: true });
            });
            document.body.append(element);
            const error = await failed;
            const value = { codes: error.diagnostics?.map(({ code }) => code) ?? [], source: element.source,
              parts: element.shadowRoot.querySelectorAll('[data-coral-part-id]').length };
            element.remove();
            return value;
          }, { source, style, theme });
          assert.ok(custom.codes.includes(DISABLED_RENDERER_SOURCE_CODE_028), `${surface} custom element`);
          assert.equal(custom.parts, 0, `${surface} custom element`);
          assert.equal(custom.source, source, `${surface} custom element keeps its source`);
        }
      } finally { await page.close(); }
    }
  } finally { await close(server); }
}

async function strictCsp(browser, consumer, bundles, sources) {
  const coreEntry = await installedEntry(consumer, '@graph-ir/core');
  const core = await import(pathToFileURL(coreEntry).href);
  const render = await import(pathToFileURL(await installedEntry(consumer, '@coral-viz/render')).href);
  const casesModule = join(root, 'packages/browser/test/fixtures/successorBrowserCases028.mjs');
  const { successorBrowserCases028 } = await import(pathToFileURL(casesModule).href);
  const base = JSON.parse(await readFile(join(root, 'packages/browser/test/fixtures/successorBrowserBase028.graphir.json'), 'utf8'));
  const catalog = render.successorCatalogSnapshot028(base);
  const additional = sources.active.map(({ name, source }) => {
    const graph = render.projectInstalledSourceToSuccessor028(source).graph;
    assert.ok(graph, `${name} successor projection`);
    return { id: `source-${name}`, graph, snapshot: render.successorCatalogSnapshot028(graph) };
  });
  const modes = [undefined, { mode: 'schema' }, { mode: 'semantic' }];
  const expected = successorBrowserCases028(base, catalog, additional).flatMap(({ id, graph, snapshot }) =>
    modes.map((option) => ({ id, mode: option?.mode ?? 'full',
      schemaAndLocal: core.validateGraphIRSuccessor(graph, option),
      catalog: core.validateGraphIRSuccessorWithCatalog(graph, snapshot, option) })));
  assert.ok(expected.find((row) => row.id === 'valid-recursive-region-lifecycle-labels' && row.mode === 'full').catalog.valid);
  assert.ok(expected.some((row) => !row.catalog.valid), 'adversarial successor cases must include refusals');
  const temporary = await mkdtemp(join(consumer, '.coral-successor-csp-'));
  let server;
  try {
    // The production bundles bind the locked Core; the installed Core must bind identically.
    const binding = createSuccessorBrowserBinding028(join(temporary, 'installed'), dirname(coreEntry));
    assert.deepEqual(binding.provenance, createSuccessorBrowserBinding028(join(temporary, 'production')).provenance,
      'installed and production exact successor binding');
    const entry = join(temporary, 'entry.mjs');
    await writeFile(entry, `export {validateGraphIRSuccessor,validateGraphIRSuccessorWithCatalog} from ${JSON.stringify(binding.coreModule)};
export {successorBrowserCases028} from ${JSON.stringify(casesModule)};`);
    const { build } = await import(pathToFileURL(createRequire(join(root, 'packages/browser/package.json')).resolve('rolldown')).href);
    let bound = false;
    const bundled = await build({ input: entry, platform: 'browser', write: false, logLevel: 'warn',
      plugins: [{ name: 'exact-production-successor-binding',
        transform(code, id) { const result = binding.transform(code, id); if (result !== null) bound = true; return result; } }],
      output: { format: 'esm', minify: true, codeSplitting: false } });
    assert.ok(bound, 'probe must use the production successor binding');
    const chunks = bundled.output.filter((item) => item.type === 'chunk');
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0].imports, []);
    assert.deepEqual(chunks[0].dynamicImports, []);
    const probe = chunks[0].code;
    assert.ok(!probe.includes('https://json-schema.org/draft/2020-12/schema'), 'probe must not compile the schema at runtime');
    const publicSources = sources.active;
    const runner = (path) => `import * as core from '/probe.js';
${path === '/runner-esm.js' ? "import * as Coral from '/browser.js';" : 'const Coral = globalThis.Coral;'}
let currentCase = 'initialization';
try {
  let blocked = false;
  try { new Function('return 1')(); } catch (error) { blocked = error instanceof EvalError; }
  if (!blocked) throw new Error('Positive control: CSP failed to block runtime code generation');
  const modes = [undefined, { mode: 'schema' }, { mode: 'semantic' }];
  const records = core.successorBrowserCases028(${JSON.stringify(base)}, ${JSON.stringify(catalog)}, ${JSON.stringify(additional)})
    .flatMap(({ id, graph, snapshot }) => modes.map((option) => {
      currentCase = id + '/' + (option?.mode ?? 'full');
      return { id, mode: option?.mode ?? 'full',
      schemaAndLocal: core.validateGraphIRSuccessor(graph, option),
      catalog: core.validateGraphIRSuccessorWithCatalog(graph, snapshot, option) }; }));
  // renderTo draws inside a Coral shadow-root surface (Slice 60 C4).
  const coralSurface = () => {
    const host = document.querySelector('#diagram');
    const root = host.querySelector(':scope > span[data-coral-surface]')?.shadowRoot ??
      (host.hasAttribute('data-coral-surface') ? host.shadowRoot : null);
    if (!root) throw new Error('no Coral surface on #diagram');
    return root;
  };
  const renders = [];
  for (const { name, source, marks } of ${JSON.stringify(publicSources)}) for (const style of ['lowfi', 'hifi']) for (const theme of ['light', 'dark']) {
    await Coral.renderTo('#diagram', source, { style, theme });
    await document.fonts.ready;
    const root = coralSurface();
    renders.push({ surface: name + '/' + style + '/' + theme,
      missing: marks.filter(([attribute, id]) => !root.querySelector('[' + attribute + '="' + CSS.escape(id) + '"]')),
      parts: root.querySelectorAll('[data-coral-part-id]').length,
      fonts: [...document.fonts].map((font) => font.status) });
  }
  for (const { name, source } of ${JSON.stringify(MISSING_HEADER_RENDERER_SOURCES_028)}) {
    let error; let result;
    try { result = await Coral.render(source); } catch (caught) { error = caught; }
    const diagnostic = error?.diagnostics?.find((item) => item.code === 'header.diagram.required');
    if (result || error?.code !== 'coral.browser.input.invalid' || !diagnostic?.range?.start)
      throw new Error(name + ': missing-header source produced meaning or lost its located diagnostic');
    let domError;
    try { await Coral.renderTo('#diagram', source); } catch (caught) { domError = caught; }
    if (!domError?.diagnostics?.some((item) => item.code === 'header.diagram.required') || coralSurface().querySelector('svg'))
      throw new Error(name + ': missing-header DOM input displayed a diagram');
  }
  let retired;
  try { await Coral.render(${JSON.stringify(publicSources[0].source)}, { edition: '0.2.8-preview' }); } catch (error) { retired = error; }
  if (retired?.code !== 'coral.browser.option.invalid') throw new Error('Retired preview option was accepted');
  window.successorProof = { blocked, records, renders };
} catch (error) { window.successorError = currentCase + ': ' + String(error.stack ?? error); }`;
    ({ server } = await serve({ '/probe.js': probe, '/browser.js': bundles.esm, '/browser.iife.js': bundles.iife,
      '/runner-esm.js': runner, '/runner-iife.js': runner,
      page: (path) => PAGE + (path === '/iife' ? '<script src="/browser.iife.js"></script>' : '') +
        `<script type="module" src="/runner-${path === '/iife' ? 'iife' : 'esm'}.js"></script>` }, { csp: true }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const mode of ['esm', 'iife']) {
      const page = await browser.newPage();
      try {
        await page.goto(`${origin}/${mode}`);
        await page.waitForFunction(() => window.successorProof || window.successorError, {}, { timeout: 20_000 });
        const actual = await page.evaluate(() => ({ proof: window.successorProof, error: window.successorError }));
        assert.ok(!actual.error, `${mode}: ${actual.error}`);
        assert.equal(actual.proof.blocked, true, `${mode}: CSP positive control`);
        assert.equal(actual.proof.records.length, expected.length, `${mode}: comparison count`);
        for (const [index, row] of expected.entries()) {
          assert.deepEqual(actual.proof.records[index], row, `${mode}: ${row.id}/${row.mode}`);
        }
        for (const row of actual.proof.renders) {
          assert.ok(row.parts > 0 && !row.missing.length, `${mode}/${row.surface}: strict CSP render`);
          assert.ok(row.fonts.length > 0 && row.fonts.every((status) => status === 'loaded'), `${mode}/${row.surface}: fonts`);
        }
      } finally { await page.close(); }
    }
  } finally {
    if (server) await close(server);
    await rm(temporary, { recursive: true, force: true });
  }
}

/** `browserTarball` is the archive the consumer installed; served bundles must be its exact bytes. */
export async function verifyInstalledBrowser028({ consumer, browserTarball }) {
  const directory = dirname(await installedEntry(consumer, '@coral-viz/browser'));
  const bundles = { esm: await readFile(join(directory, 'coral-browser.js')),
    iife: await readFile(join(directory, 'coral-browser.iife.js')) };
  const packed = new Map(readSafeTarball(await readFile(browserTarball)).map((entry) => [entry.name, entry.data]));
  assert.ok(bundles.esm.equals(packed.get('package/dist/coral-browser.js')), 'installed ESM must be the packed bytes');
  assert.ok(bundles.iife.equals(packed.get('package/dist/coral-browser.iife.js')), 'installed IIFE must be the packed bytes');
  const fixture = (name) => readFile(join(root, `packages/browser/test/fixtures/acceptance028/${name}.coral`), 'utf8');
  const sources = {
    active: await Promise.all(ACTIVE_RENDERER_SOURCE_CASES_028.map(async (name) =>
      ({ name, source: await fixture(name), marks: REQUIRED_SOURCE_SCENE_MARKERS_028[name] ?? [] }))),
    disabled: await Promise.all(DISABLED_RENDERER_SOURCE_CASES_028.map(async (name) => ({ name, source: await fixture(name) }))),
  };
  const browser = await chromium.launch({ headless: true });
  try {
    await publicMatrix(browser, bundles, sources);
    await strictCsp(browser, consumer, bundles, sources);
  } finally { await browser.close(); }
}
