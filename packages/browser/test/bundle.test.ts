import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { GENERATED_FONT_ASSETS } from '../../render/src/text/generated-fonts.js';
import { CAVEAT_FONT_DATA_028 } from '../../render/src/text/caveat028.js';
import * as source from '../src/index.js';
import { ACTIVE_RENDERER_SOURCE_CASES_028 } from '../../../scripts/renderer-source-cases.mjs';
import { BUNDLED_PACKAGES } from './support/bundledPackages.js';

/** Built-artifact gates (R-061 AC-1/AC-4). Run `npm run build -w @coral-viz/browser` first.
 * These read only packaged dist; build-output.test.ts owns the build/ intermediates. */

const packageRoot = resolve(import.meta.dirname, '..');
const dist = resolve(packageRoot, 'dist');
const ESM = resolve(dist, 'coral-browser.js');
const IIFE = resolve(dist, 'coral-browser.iife.js');
const KIB = 1024;
const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const FIXTURES = ACTIVE_RENDERER_SOURCE_CASES_028.map((name: string) => `acceptance028/${name}.coral`);

let esm = '';
let iife = '';
const gzip = (text: string): number => gzipSync(text, { level: 9 }).length;

beforeAll(() => {
  if (!existsSync(ESM) || !existsSync(IIFE)) throw new Error('Build @coral-viz/browser before running the bundle tests.');
  esm = readFileSync(ESM, 'utf8');
  iife = readFileSync(IIFE, 'utf8');
});

describe('bundle size (R-061 AC-4)', () => {
  // 800 KiB since 0.2.11 (Gate D1.3, 2026-11-23: layout/routing overhaul).
  it('keeps the IIFE within 800 KiB gzip and the ESM no larger', () => {
    const sizes = { iife: gzip(iife), esm: gzip(esm) };
    console.info(`gzip -9: IIFE ${(sizes.iife / KIB).toFixed(1)} KiB, ESM ${(sizes.esm / KIB).toFixed(1)} KiB`);
    expect(sizes.iife).toBeLessThanOrEqual(800 * KIB);
    expect(sizes.esm).toBeLessThanOrEqual(sizes.iife);
  });
});

describe.each([['ESM', () => esm], ['IIFE', () => iife]])('%s bundle contents', (_label, text) => {
  it('has no static dependency imports, including bare side-effect imports', () => {
    expect(text()).not.toMatch(/\bimport\s*(?:['"{*]|[A-Za-z_$][\w$]*\s+from\s*['"])/);
  });

  it('contains no evaluation, dynamic loading, or network construct', () => {
    const bundle = text();
    for (const pattern of [
      /\bimport\s*\(/, /\beval\s*\(/, /\(0\s*,\s*eval\)/, /importScripts/, /\bfetch\s*\(/, /XMLHttpRequest/,
      /WebSocket/, /serviceWorker/, /sendBeacon/, /EventSource/, /set(?:Timeout|Interval)\(\s*["'`]/,
    ]) {
      expect(bundle, String(pattern)).not.toMatch(pattern);
    }
    // `Function(` as a call, not a property such as `$wnd.Function`.
    expect(bundle).not.toMatch(/(?<![.\w$])Function\s*\(/);
  });

  it('keeps exactly one Worker construction site, ELK\'s unreachable worker-URL branch', () => {
    const bundle = text();
    const sites = [...bundle.matchAll(/new Worker\(/g)].map((match) => bundle.slice(Math.max(0, match.index - 400), match.index));
    expect(sites).toHaveLength(1);
    for (const before of sites) expect(before).toMatch(/workerUrl|web-worker/);
  });

  it('removes ELK\'s window.goog global and carries the license banner', () => {
    const bundle = text();
    expect(bundle).not.toContain('$wnd.goog');
    expect(bundle.startsWith('/*!')).toBe(true);
    expect(bundle.slice(0, 600)).toMatch(/@coral-viz\/browser[\s\S]*Apache-2\.0[\s\S]*EPL-2\.0[\s\S]*MIT[\s\S]*OFL-1\.1[\s\S]*THIRD_PARTY_NOTICES/);
  });

  it('names every bundled third-party package in the banner and the notices', () => {
    const notices = readFileSync(resolve(packageRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    for (const name of BUNDLED_PACKAGES) {
      expect(text().slice(0, 600), name).toContain(name);
      expect(notices, name).toMatch(new RegExp(`^## ${name.replace(/[/@.-]/g, '\\$&')} `, 'm'));
    }
  });

  it('embeds exactly the shipped lowfi and hifi faces', () => {
    const faces = text().match(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g) ?? [];
    // Inter 400/700 use the same variable-font payload. Each unique payload
    // occurs once, while both weight-specific face fields remain intact.
    expect(faces).toHaveLength(2);
    expect(new Set(faces)).toEqual(new Set([
      GENERATED_FONT_ASSETS.sans.data400,
      GENERATED_FONT_ASSETS.sans.data700,
      CAVEAT_FONT_DATA_028,
    ]));
  });

  it('renders exact Inter font data for both weights from the bundle', async () => {
    const built = await import(pathToFileURL(ESM).href) as typeof source;
    const text = fixture('acceptance028/uml-class-named.coral');
    const result = await built.render(text, { style: 'hifi' });
    expect(result.svg).toContain(GENERATED_FONT_ASSETS.sans.data400);
    expect(result.svg).toContain('font-weight="700"');
  });

  it('does not bundle Ajv code generation or the GraphIR schema', () => {
    // Ajv's own vocabulary and messages, and the schema's own identifier.
    expect(text()).not.toContain('$dynamicRef');
    expect(text()).not.toContain('strict mode: ');
    expect(text()).not.toContain('https://json-schema.org/draft/2020-12/schema');
    expect(text()).not.toContain('GraphIR authored graph 4.0 draft');
    expect(text()).not.toContain('https://graph-ir.dev/schemas/4.0/graph-ir.schema.json');
  });
});

describe('ESM artifact', () => {
  it('renders a saved-header 0.2.8 document through the packaged entry point', async () => {
    const built = await import(pathToFileURL(ESM).href) as typeof source;
    const text = '@diagram architecture\napi service as "API"\nstore database\n' +
      'read = api:out -> store:query [reads] as "Orders"\n';
    const result = await built.render(text);
    expect(result.svg).toContain('API');
    expect(result.svg).toContain('Orders');
    expect(result.graph.edges[0]).toMatchObject({ sourcePort: 'out', targetPort: 'query' });
    expect(result.graph.metadata?.notation).toBe('architecture');
  });

  it('renders every fixture exactly as the source modules do, without adding globals', async () => {
    // The built bundle runs first: unbundled ELK (source modules) does create `goog`.
    const before = new Set(Object.getOwnPropertyNames(globalThis));
    const built = await import(pathToFileURL(ESM).href) as typeof source;
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort());
    const outputs = new Map<string, string>();
    for (const name of FIXTURES) outputs.set(name, (await built.render(fixture(name))).svg);
    expect(Object.getOwnPropertyNames(globalThis).filter((key) => !before.has(key))).toEqual([]);
    // Each SVG receives unique DOM marker IDs so two diagrams can coexist in
    // one page. Compare the drawing after removing only that instance scope.
    const normalizeScope = (svg: string) => {
      const ids = new Map<string, string>();
      return svg.replace(/(?:coral-instance|coral-glyph-title)-[0-9a-f]+(?:-[0-9a-f]+)*/g, (id) => {
        if (!ids.has(id)) ids.set(id, `DOM-SCOPE-${ids.size + 1}`);
        return ids.get(id)!;
      });
    };
    for (const name of FIXTURES) expect(normalizeScope(outputs.get(name)!), name)
      .toBe(normalizeScope((await source.render(fixture(name))).svg));
  }, 20_000);
});

describe('IIFE artifact', () => {
  it('defines only the Coral global on evaluation', () => {
    const context: Record<string, unknown> = {};
    runInNewContext(iife, context);
    expect(Object.keys(context)).toEqual(['Coral']);
    expect(Object.keys(context.Coral as object).sort()).toEqual(Object.keys(source).sort());
  });
});

describe('package artifacts', () => {
  it('emits only the two bundles as JavaScript and self-contained declarations', () => {
    expect(globSync('**/*.js', { cwd: dist }).sort()).toEqual(['coral-browser.iife.js', 'coral-browser.js']);
    const declarations = globSync('**/*.d.ts', { cwd: dist });
    expect(declarations).toContain('index.d.ts');
    for (const file of declarations) {
      const text = readFileSync(resolve(dist, file), 'utf8');
      for (const [, specifier] of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        expect(specifier.startsWith('./') || specifier === '@graph-ir/core', `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it('declares a complete, publishable manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({
      name: '@coral-viz/browser', license: 'Apache-2.0', type: 'module', sideEffects: false,
      main: 'dist/coral-browser.js', types: 'dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/coral-browser.js' },
        './iife': './dist/coral-browser.iife.js',
      },
      unpkg: './dist/coral-browser.iife.js', jsdelivr: './dist/coral-browser.iife.js',
      dependencies: { '@graph-ir/core': '0.2.4' },
      devDependencies: { '@coral-viz/language': '0.2.17', '@coral-viz/render': '0.2.17' },
      publishConfig: { access: 'public' },
    });
    expect(manifest.repository.directory).toBe('packages/browser');
    expect(manifest.files).toEqual(expect.arrayContaining(['dist', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']));
    for (const file of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) expect(existsSync(resolve(packageRoot, file)), file).toBe(true);
  });
});
