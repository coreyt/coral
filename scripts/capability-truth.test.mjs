import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const currentRelease = JSON.parse(await read('package.json')).version;
const matrixPath = 'scripts/fixtures/capability-matrix.json';
const projectionPath = 'docs/use/reference/capabilities.md';
const documentationPaths = paths => paths.filter(path => path.endsWith('.md'))
  .map(path => `docs/${path.replaceAll('\\', '/')}`);

test('documentation exclusions use the same paths on Unix and Windows', () => {
  const paths = documentationPaths(['use\\index.md', 'contribute\\reference\\testing.md', 'index.md', 'asset.png']);
  assert.deepEqual(paths.filter(path => !path.startsWith('docs/contribute/')), ['docs/use/index.md', 'docs/index.md']);
});
const groups = ['boundaries', 'notations', 'packages', 'platforms'];
// `experimental` entries make no support claim and need no tested surface;
// only `supported` and `partial` claims must bind executable evidence.
const statuses = new Set(['supported', 'partial', 'experimental', 'unsupported']);
const audiences = new Set(['user', 'embedder', 'contributor', 'in-product', 'release']);
const surfaces = new Set([
  'delivery', 'local-ownership', 'network', 'example', 'coral-source',
  'import', 'editor', 'canvas', 'svg', 'browser', 'package', 'platform',
]);

async function loadMatrix() {
  assert.equal(existsSync(resolve(root, matrixPath)), true, `missing ${matrixPath}`);
  return JSON.parse(await read(matrixPath));
}

async function validateMatrix(matrix) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };

  check(matrix.schemaVersion === 1, 'schema version');
  const ids = new Set();
  for (const group of groups) {
    check(Array.isArray(matrix[group]) && matrix[group].length > 0, `empty ${group}`);
    for (const entry of matrix[group]) {
      check(typeof entry.id === 'string', `${group}: missing id`);
      check(!ids.has(entry.id), `duplicate ${entry.id}`);
      ids.add(entry.id);
      check(statuses.has(entry.status), `${entry.id}: status`);
      check(entry.audiences.length > 0, `${entry.id}: audiences`);
      for (const audience of entry.audiences) check(audiences.has(audience), `${entry.id}: ${audience}`);
      check(typeof entry.summary === 'string', `${entry.id}: summary`);
      check(Array.isArray(entry.limitations), `${entry.id}: limitations`);
      if (entry.status !== 'supported') {
        check(entry.limitations.length > 0, `${entry.id}: limitations`);
      }
      check(Array.isArray(entry.surfaces), `${entry.id}: surfaces`);
      if (entry.status === 'unsupported') check(entry.surfaces.length === 0, `${entry.id}: unsupported positive surface`);
      if (entry.status === 'supported' || entry.status === 'partial') {
        check(entry.surfaces.length > 0, `${entry.id}: positive claim without evidence surface`);
      }
      for (const surface of entry.surfaces) {
        check(surfaces.has(surface.name), `${entry.id}: unknown surface ${surface.name}`);
        check(surface.evidence.length > 0, `${entry.id}/${surface.name}: evidence`);
        for (const evidence of surface.evidence) {
          check(/(?:\.test\.[cm]?[jt]sx?|\.spec\.ts|scripts\/[^/]+\.mjs)$/.test(evidence.path), `${entry.id}: non-executable ${evidence.path}`);
          check(existsSync(resolve(root, evidence.path)), `${entry.id}: missing ${evidence.path}`);
          check(evidence.caseId.length >= 8, `${entry.id}: missing case id`);
          if (existsSync(resolve(root, evidence.path))) {
            const source = await read(evidence.path);
            check(source.includes(evidence.caseId), `${entry.id}: absent case ${evidence.caseId}`);
          }
        }
      }
    }
  }
  check(matrix.notations.length === 10, 'notation count');
  check(matrix.packages.length === 6, 'package count');
  return errors;
}

test('capability matrix binds every positive surface to an exact executable case', async () => {
  assert.deepEqual(await validateMatrix(await loadMatrix()), []);
});

test('capability matrix rejects missing, unrelated, and unsupported evidence bindings', async () => {
  const matrix = await loadMatrix();
  const supported = matrix.packages.find((entry) => entry.surfaces.length > 0);
  const unsupported = matrix.boundaries.find((entry) => entry.status === 'unsupported');

  const missing = structuredClone(matrix);
  missing.packages.find((entry) => entry.id === supported.id).surfaces[0].evidence[0].path = 'scripts/not-present.mjs';
  assert.ok((await validateMatrix(missing)).some((error) => error.includes('missing scripts/not-present.mjs')));

  const unrelated = structuredClone(matrix);
  unrelated.packages.find((entry) => entry.id === supported.id).surfaces[0].evidence[0].caseId = 'unrelated case id';
  assert.ok((await validateMatrix(unrelated)).some((error) => error.includes('absent case unrelated case id')));

  const overclaimed = structuredClone(matrix);
  overclaimed.boundaries.find((entry) => entry.id === unsupported.id).surfaces = structuredClone(supported.surfaces);
  assert.ok((await validateMatrix(overclaimed)).some((error) => error.includes('unsupported positive surface')));

  const empty = structuredClone(matrix);
  empty.packages.find((entry) => entry.id === supported.id).surfaces = [];
  assert.ok((await validateMatrix(empty)).some((error) => error.includes('positive claim without evidence surface')));
});

test('public projection covers every matrix entry and states unsupported scope', async () => {
  const matrix = await loadMatrix();
  const projection = await read(projectionPath);
  for (const group of groups) {
    for (const entry of matrix[group]) assert.ok(projection.includes(`\`${entry.id}\``), `missing projection ${entry.id}`);
  }
  for (const boundary of ['C4', 'vendor-specific', 'UI wireframes', 'complete UML']) {
    assert.ok(projection.includes(boundary), `missing unsupported boundary ${boundary}`);
  }
});

test('current audience and Help surfaces agree on ten notations and six packages', async () => {
  const examples = await read('docs/use/how-to/start-from-an-example.md');
  const notations = await read('docs/use/reference/notations.md');
  const embed = await read('docs/embed/index.md');
  const guidance = await read('packages/diagram-editor/src/guidanceContent.ts');
  const catalog = JSON.parse(await read('packages/diagram-editor/src/example-sources/catalog.json'));
  const docsIndex = await read('docs/index.md');
  const readme = await read('README.md');

  const labels = catalog.entries.map(entry => entry.name);
  const profiles = catalog.entries.map(entry => entry.notation);
  assert.equal(labels.length, 12, 'ten profile examples, website architecture and document-local symbol');
  assert.equal(new Set(profiles).size, 10, 'every enabled profile is represented');
  assert.match(examples, /\[example gallery\]\(https:\/\/coreyt\.github\.io\/coral\/examples\/\)/);
  assert.match(examples, /matching catalog edition/);
  for (const id of profiles) {
    assert.ok(notations.includes(`{#${id}}`), `notations missing ${id}`);
  }
  assert.match(notations, /Chen ERD is disabled as a Coral 0\.2\.8 document type/);
  assert.match(embed, /six public packages/);
  assert.match(embed, /@coral-viz\/browser/);
  assert.doesNotMatch(guidance, /targets for 0\.2\.5/);
  assert.doesNotMatch(docsIndex, /arriving in Slice/);
  assert.match(readme, /^# Coral$/m);
});

test('browser documentation uses canonical executable example sources', async () => {
  const guide = await read('docs/embed/how-to/render-in-a-browser.md');
  assert.match(guide, /^<<< \.\.\/examples\/browser-esm\.mjs$/m);
  assert.match(guide, /^<<< \.\.\/examples\/browser-script\.html$/m);
  const esm = await read('docs/embed/examples/browser-esm.mjs');
  const script = await read('docs/embed/examples/browser-script.html');
  assert.match(esm, /import \{ render, renderTo \} from '@coral-viz\/browser'/);
  assert.match(esm, /await render\(/);
  assert.match(script, /Coral\.scan\(\)/);
  assert.match(script, /Coral\.defineCustomElement\(\)/);
});

test('history guidance preserves untouched authored Coral source', async () => {
  const history = await read('docs/use/explain/history-and-undo.md');
  assert.doesNotMatch(history, /canvas edit prints canonical DSL/);
  assert.match(history, /untouched comments and formatting/);
  assert.match(history, /refuses the edit/);
});

test('file and export guidance keeps exact source and rejects stale meaning', async () => {
  const formats = await read('docs/use/reference/file-and-export-formats.md');
  const exportGuide = await read('docs/use/how-to/export-a-diagram.md');
  assert.doesNotMatch(formats, /not stored verbatim/);
  assert.match(formats, /stored verbatim/i);
  assert.match(formats, /malformed source remains saveable/);
  assert.match(exportGuide, /current source/);
  assert.match(exportGuide, /refuses export/);
});

test('current claim authorities exist and there is no active PWA implementation', () => {
  assert.equal(existsSync(resolve(root, 'packages/diagram-editor/src/pwa')), false);
  for (const path of [
    'README.md', 'CLAUDE.md', 'packages/diagram-editor/src/AppView.tsx',
    'dev/documentation-style.md', 'dev/designs/static-delivery.md',
    'dev/designs/public-api-compatibility.md', 'dev/designs/windows-validation.md',
    'dev/release-policy.json',
  ]) assert.equal(existsSync(resolve(root, path)), true, `missing current authority ${path}`);
});

test('current claim authorities contain no known stale release phrases', async () => {
  const publicDocs = documentationPaths(await readdir(resolve(root, 'docs'), { recursive: true }));
  const authorities = [
    'README.md', 'CLAUDE.md', 'PLAN.md', 'dev/README.md', 'dev/ROADMAP.md',
    ...publicDocs,
    'packages/language/README.md', 'packages/render/README.md',
    'packages/browser/README.md', 'packages/viz/README.md',
    'packages/mcp-server/README.md', 'packages/tree-sitter-coral/README.md',
    'packages/diagram-editor/src/guidanceContent.ts', 'packages/diagram-editor/src/AppView.tsx',
    'dev/documentation-style.md', 'dev/designs/static-delivery.md',
    'dev/designs/public-api-compatibility.md', 'dev/designs/windows-validation.md',
  ];
  const joined = (await Promise.all(authorities.map(async (path) => `${path}\n${await read(path)}`))).join('\n');
  for (const phrase of [
    'registry job must verify all five packages',
    'No 0.2.5 publication',
    'targets for 0.2.5',
    'evidence has been collected for 0.2.5',
    'English-only in 0.2.5',
    'arriving in Slice 70',
    'The five public packages are',
  ]) assert.equal(joined.includes(phrase), false, `stale current claim: ${phrase}`);
  assert.doesNotMatch(joined, /npm install @coral-viz\/browser(?:\s|`)/);
  assert.doesNotMatch(joined, /@coral-viz\/browser\/dist\/coral-browser\.iife\.js/);
  const policy = JSON.parse(await read('dev/release-policy.json'));
  assert.equal(policy.expectedPackages.length, 6);
  assert.equal(policy.delivery.target, 'online-only');
});

test('only Chrome desktop is a supported browser; other browsers and accessibility are experimental; composer voice is unsupported', async () => {
  const matrix = await loadMatrix();
  const status = new Map(matrix.platforms.map(entry => [entry.id, entry.status]));
  assert.equal(status.get('platform-chrome-desktop'), 'supported');
  for (const id of ['platform-edge', 'platform-safari', 'platform-firefox', 'platform-accessibility']) {
    assert.equal(status.get(id), 'experimental', id);
  }
  assert.equal(status.get('platform-voice-input'), 'unsupported');
  const projection = await read(projectionPath);
  for (const entry of matrix.platforms) {
    const row = projection.split('\n').find(line => line.startsWith(`| \`${entry.id}\``));
    const label = { supported: 'Supported', experimental: 'Experimental', unsupported: 'Unsupported', partial: 'Partial' }[entry.status];
    assert.match(row ?? '', new RegExp(`\\| ${label} \\|`), entry.id);
  }
});

test('public release surfaces ship release wording, not pre-release gates (DRO100-3, S100-WI-07)', async () => {
  const publicDocs = documentationPaths(await readdir(resolve(root, 'docs'), { recursive: true }))
    // Contributor pages describe the release process itself and may name its gates.
    .filter(path => !path.startsWith('docs/contribute/'));
  const surfaces = [
    'README.md', ...publicDocs,
    'packages/language/README.md', 'packages/render/README.md', 'packages/browser/README.md',
    'packages/viz/README.md', 'packages/mcp-server/README.md', 'packages/tree-sitter-coral/README.md',
    // In-product guidance and Help ship to every user too (TRO100-14).
    'packages/diagram-editor/src/guidanceContent.ts', 'packages/diagram-editor/src/AppView.tsx',
  ];
  for (const path of surfaces) {
    const text = await read(path);
    for (const phrase of [
      /release gate/i, /Slice 100 must/, /Candidate target/, /not-yet-published/, /exact-candidate/i,
      // DRO100-27: no new public support vocabulary and no temporal observation claims.
      /release[- ]target/i, /exact published build/i, /completed only after/i,
      // CRO100-7: public pages describe the released product, not the branch.
      /active release branch/i, /candidate artifacts?/i, /release branch uses/i,
      /0\.2\.6 candidate/i, /current candidate/i,
    ]) {
      assert.doesNotMatch(text, phrase, `${path}: ${phrase}`);
    }
  }
  // Style guide status vocabulary item 1, verbatim; R-050 supports Chrome only.
  const support = (await read('docs/use/reference/browser-support.md')).replace(/\s+/g, ' ');
  assert.ok(support.includes('Chrome is the supported desktop browser. Edge, Safari, and Firefox are experimental.'));
  const supportedRows = support.match(/\| [^|]+ \| Supported \|/g) ?? [];
  assert.deepEqual(supportedRows, ['| Chrome desktop | Supported |']);
  for (const browser of ['Edge', 'Safari', 'Firefox']) assert.match(support, new RegExp(`\\| ${browser} desktop \\| Experimental \\|`));
  for (const path of ['docs/use/explain/accessibility-status.md']) {
    assert.match(await read(path), /experimental/i, path);
  }
});

test('composer voice documentation states that voice input is not available', async () => {
  const voice = await read('docs/use/how-to/use-voice-input.md');
  assert.match(voice, /Composer voice input is not available\./);
  assert.match(voice, /no voice-input controls or speech-model loading/);
});

test('current user recipes distinguish source-owned operations and notation presentation', async () => {
  const route = await read('docs/use/how-to/connect-and-route-objects.md');
  const layout = await read('docs/use/how-to/lay-out-and-reflow.md');
  const conversion = await read('docs/use/explain/conversion-loss.md');
  const troubleshooting = await read('docs/use/reference/troubleshooting.md');
  assert.match(route, /saved Coral source[\s\S]*waypoint gestures are unavailable/);
  assert.match(route, /GraphIR interchange/);
  assert.match(layout, /Manual Reflow accepts verified spatial Coral source/);
  assert.match(layout, /GraphIR interchange documents/);
  assert.match(troubleshooting, /Reflow/);
  assert.match(conversion, /explicit types and symbols remain authored/);
  assert.doesNotMatch(conversion, /switching back cannot\s+infer the original/);
});

test('current capability and notation guides consume current inventory and catalog ownership', async () => {
  const { getAvailableNotations028 } = await import('@coral-viz/render');
  const capabilities = await read(projectionPath);
  const notations = await read('docs/use/reference/notations.md');
  const catalog = JSON.parse(await read('packages/diagram-editor/src/example-sources/catalog.json'));
  assert.match(capabilities, new RegExp(`Coral ${currentRelease.replaceAll('.', '\\.')}`));
  for (const { id } of getAvailableNotations028()) {
    assert(capabilities.includes(`\`notation-${id}\``), id);
    assert(notations.includes(`{#${id}}`), id);
  }
  assert.match(capabilities, /`notation-erd` \| `0\.2\.14` Crow's Foot ERD/);
  assert.match(capabilities, /Seven/);
  assert.match(capabilities, /MonoTrue v0\.2\.0/);
  assert.match(capabilities, /`0\.2\.17`[\s\S]*uml-state/i);
  assert.match(capabilities, /standalone `coral` CLI/);
  assert.doesNotMatch(capabilities, /acceptance[\s\S]{0,50}remain pending|private 0\.2\.8/);
  assert.match(notations, /https:\/\/coreyt\.github\.io\/coral\/examples\//);
  for (const entry of catalog.entries) assert(!notations.includes(`| ${entry.name} |`), `duplicate example fact ${entry.id}`);
});


test('Mermaid user recipe follows file import rather than a refused format switch', async () => {
  const guide = await read('docs/use/how-to/convert-from-mermaid.md');
  const support = await read('docs/use/reference/conversion-support.md');
  assert.match(guide, /request\.mmd/);
  assert.match(guide, /sequenceDiagram/);
  assert.match(guide, /Open local file/);
  assert.match(guide, /coral\.open\.import\.sequence\.unsupported/);
  assert.doesNotMatch(guide, /Select \*\*Mermaid\*\*|> \*\*Switch to Coral DSL\*\*/);
  assert.match(support, /Retain the imported source and its format/);
  const loss = await read('docs/use/explain/conversion-loss.md');
  const files = await read('docs/use/reference/file-and-export-formats.md');
  assert.match(loss, /not a general flowchart-to-Coral source writer/);
  assert.match(files, /other admitted Mermaid stays Mermaid source/);
  assert.match(files, /DOT and PlantUML source/);

});
