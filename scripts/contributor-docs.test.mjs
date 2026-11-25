import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const exists = (path) => existsSync(resolve(root, path));

const contributorPages = [
  'docs/contribute/index.md',
  'docs/contribute/get-started.md',
  'docs/contribute/how-to/build-and-preview.md',
  'docs/contribute/how-to/release-and-recover.md',
  'docs/contribute/reference/architecture.md',
  'docs/contribute/reference/testing.md',
  'docs/contribute/reference/generated-assets-and-dependencies.md',
  'docs/contribute/reference/documentation-governance.md',
  'docs/contribute/reference/coverage-baseline.md',
  'docs/contribute/reference/performance-budgets.md',
  'docs/contribute/reference/release-compliance-checklist.md',
  'docs/contribute/reference/clean-room-process.md',
];

test('publishes one routed contributor tree and retires the rival setup page', async () => {
  for (const path of contributorPages) assert.ok(exists(path), `missing ${path}`);
  assert.equal(exists('docs/getting-started.md'), false);
  for (const path of [
    'docs/coverage-baseline.md',
    'docs/performance-budgets.md',
    'docs/release-compliance-checklist.md',
    'docs/clean-room-process.md',
  ]) assert.equal(exists(path), false, `legacy contributor path remains: ${path}`);

  const [readme, config] = await Promise.all([
    read('README.md'), read('docs/.vitepress/config.mts'),
  ]);
  assert.match(readme, /\[Contribute to Coral\]\(docs\/contribute\/index\.md\)/);
  assert.doesNotMatch(readme, /docs\/getting-started\.md/);
  assert.match(config, /'\/contribute\/':/);
  for (const route of [
    '/contribute/', '/contribute/get-started',
    '/contribute/how-to/build-and-preview',
    '/contribute/how-to/release-and-recover',
    '/contribute/reference/architecture',
    '/contribute/reference/testing',
    '/contribute/reference/generated-assets-and-dependencies',
    '/contribute/reference/documentation-governance',
  ]) assert.ok(config.includes(`link: '${route}'`), `missing VitePress route ${route}`);
});

test('keeps clean-checkout setup and architecture aligned with manifests', async () => {
  const manifest = JSON.parse(await read('package.json'));
  const [setup, architecture] = await Promise.all([
    read('docs/contribute/get-started.md'),
    read('docs/contribute/reference/architecture.md'),
  ]);
  for (const token of ['Node.js 26.8.2', 'npm 12.0.2', 'npm ci', 'npm run verify']) {
    assert.ok(setup.includes(token), `setup omits ${token}`);
  }
  assert.match(setup, /Node\.js 24\.19\.0.*consumer/s);
  assert.ok(setup.includes(`${manifest.workspaces.length} workspaces`));
  assert.doesNotMatch(setup, /dependency gate that remains|remaining dependency-closure/);
  assert.match(architecture, /example-sources\/catalog\.json/);
  assert.doesNotMatch(setup, /\.claude|\.mcp\.json|skills\//);
  assert.match(setup, /not required/i);
  for (const workspace of manifest.workspaces) {
    assert.ok(architecture.includes(`\`${workspace}\``), `architecture omits ${workspace}`);
  }
  for (const packageName of [
    '@coral-viz/language', '@coral-viz/render', '@coral-viz/viz',
    '@coral-viz/diagram-editor', '@coral-viz/mcp-server', 'tree-sitter-coral', '@coral-viz/browser',
  ]) assert.ok(architecture.includes(`\`${packageName}\``), `architecture omits ${packageName}`);
});

test('maps local verification, CI stage commands, and performance gates', async () => {
  const manifest = JSON.parse(await read('package.json'));
  const workflows = await Promise.all(['ci', 'pages', 'publish', 'release', 'pages-restore']
    .map((name) => read(`.github/workflows/${name}.yml`)));
  const [guide, stages, local] = await Promise.all([
    read('docs/contribute/reference/testing.md'), read('scripts/ci.mjs'), read('scripts/ci-local.mjs'),
  ]);
  assert.equal(manifest.scripts.verify, 'node scripts/ci-local.mjs');
  assert.ok(guide.includes('`npm run verify`') && guide.includes('`scripts/ci-local.mjs`'));
  assert.doesNotMatch(local, /GITHUB_|ci:packages|ci:site/, 'local verification must not need GitHub context');
  // The phase table names exactly the package's ci:* commands, each executed by ci.mjs.
  const ciScripts = Object.keys(manifest.scripts).filter((name) => name.startsWith('ci:'));
  const documented = [...guide.matchAll(/^\| (?:Early|Candidate|Product|Helper) \| `npm run (ci:[a-z-]+)` \|/gm)]
    .map((match) => match[1]);
  assert.deepEqual([...documented].sort(), [...ciScripts].sort());
  assert.equal(new Set(documented).size, documented.length, 'each stage is documented once');
  for (const name of ciScripts) {
    const stage = name.slice('ci:'.length);
    assert.equal(manifest.scripts[name], `node scripts/ci.mjs ${stage}`);
    assert.ok(stages.includes(`stage === '${stage}'`), `ci.mjs does not execute ${stage}`);
  }
  for (const workflow of workflows) {
    for (const [, name] of workflow.matchAll(/npm run (ci:[a-z-]+)/g)) {
      assert.ok(ciScripts.includes(name), `workflow runs undocumented ${name}`);
    }
  }
  for (const command of [
    'npm run test:e2e', 'npm run test:e2e:performance', 'npm run test:performance',
    'npm run test:coverage:gate', 'npm run audit:fragments', 'npm run test:online-delivery:integration',
    'npm run smoke:consumer', 'npm run smoke:api-compat-consumers', 'npm run api-compat',
    'npm run smoke:native', 'npm run prepare:typecheck',
  ]) {
    assert.ok(guide.includes(`\`${command}\``), `testing guide omits ${command}`);
    assert.ok(Object.hasOwn(manifest.scripts, command.slice('npm run '.length)), `${command} is not a script`);
  }
  assert.match(guide, /controlled host/i);
  assert.match(guide, /zero retries/i);
  assert.match(guide, /PERFORMANCE BENCHMARKS NOT MEASURED/);
  assert.match(guide, /CI has no benchmark job/);
});

test('documents the complete manual live-harness and retention boundary', async () => {
  const [guide, ignored] = await Promise.all([
    read('docs/contribute/reference/testing.md'), read('.gitignore'),
  ]);
  for (const script of [
    'accuracy-harness.ts', 'test-live.ts', 'test-e2e.ts',
    'test-mermaid-adjust.ts',
  ]) assert.ok(guide.includes(`\`${script}\``), `testing guide omits ${script}`);
  for (const key of [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
    'MISTRAL_API_KEY', 'LLM_API_KEY',
  ]) assert.ok(guide.includes(`\`${key}\``), `testing guide omits ${key}`);
  assert.match(guide, /explicit authorization/i);
  assert.match(guide, /no configured API key/);
  assert.match(guide, /stdout/i);
  assert.match(guide, /synthetic/i);
  assert.match(guide, /no production telemetry/i);
  assert.match(ignored, /accuracy-harness-output\//);
});

test('documents the closed derived-asset and dependency-policy inventory', async () => {
  const guide = await read('docs/contribute/reference/generated-assets-and-dependencies.md');
  for (const path of [
    'scripts/font-assets.json', 'scripts/generate-font-assets.py',
    'packages/render/src/text/generated-fonts.ts',
    'packages/render/third_party/fonts/',
    'packages/tree-sitter-coral/grammar.js',
    'packages/tree-sitter-coral/src/parser.c',
    'packages/tree-sitter-coral/src/grammar.json',
    'packages/tree-sitter-coral/src/node-types.json',
    'packages/tree-sitter-coral/src/tree_sitter/alloc.h',
    'packages/tree-sitter-coral/src/tree_sitter/array.h',
    'packages/tree-sitter-coral/src/tree_sitter/parser.h',
    'docs/figures.json', 'docs/public/figures/coral-overview.svg',
    'package-lock.json', 'docs/.vitepress/dist/', 'build/',
  ]) assert.ok(guide.includes(`\`${path}\``), `asset guide omits ${path}`);
  for (const phrase of [
    'tracked derived',
    'disposable', 'minor and patch', 'TypeScript 7', 'Node 26 types',
    'full commit SHA', 'npm audit --audit-level=high',
  ]) assert.ok(guide.includes(phrase), `asset/dependency guide omits ${phrase}`);
});

test('documents exact preview, online build, publication, and recovery contracts', async () => {
  const manifest = JSON.parse(await read('package.json'));
  const [buildGuide, releaseGuide, pages, publish] = await Promise.all([
    read('docs/contribute/how-to/build-and-preview.md'),
    read('docs/contribute/how-to/release-and-recover.md'),
    read('.github/workflows/pages.yml'), read('.github/workflows/publish.yml'),
  ]);
  assert.equal(manifest.scripts['docs:dev'], 'vitepress dev docs');
  assert.equal(manifest.scripts['docs:build'], 'npm run docs:api && vitepress build docs');
  for (const token of [
    'npm run docs:dev', '/contribute/', 'Ctrl+C', 'npm run docs:build',
    'npm run build:online', 'npm run verify:online',
  ]) assert.ok(buildGuide.includes(`\`${token}\``) || buildGuide.includes(token), `build guide omits ${token}`);
  for (const token of [
    'version', 'commit', 'npm run verify', 'release-guard.mjs',
    'release-registry.mjs preflight', 'release-registry.mjs verify',
    'start-index', 'retained', 'pages-restore.yml', 'artifact ID',
    'artifact.tar', 'Slice 100',
  ]) assert.ok(releaseGuide.includes(`\`${token}\``) || releaseGuide.includes(token), `release guide omits ${token}`);
  for (const workflow of [pages, publish]) {
    assert.match(workflow, /^ {6}version:/m);
    assert.match(workflow, /^ {6}commit:/m);
  }
  const publicationOrder = [
    '@coral-viz/language', '@coral-viz/render', '@coral-viz/viz',
    '@coral-viz/mcp-server', 'tree-sitter-coral',
  ];
  let cursor = -1;
  for (const name of publicationOrder) {
    const next = releaseGuide.indexOf(name);
    assert.ok(next > cursor, `release guide has wrong/missing publication order for ${name}`);
    cursor = next;
  }
});

test('current guidance uses the durable documentation style', async () => {
  const [style, claude, contract] = await Promise.all([
    read('dev/documentation-style.md'),
    read('CLAUDE.md'), read('scripts/canvas-creation-contract.test.mjs'),
  ]);
  assert.match(style, /^# Coral documentation authoring style$/m);
  for (const source of [claude, contract]) {
    assert.ok(source.includes('dev/documentation-style.md') || source.includes('../../../documentation-style.md'));
  }
});

test('composes owner checks once and keeps contributor pages hygienic', async () => {
  const manifest = JSON.parse(await read('package.json'));
  assert.equal(manifest.scripts['test:contributor-docs'],
    'node --test scripts/contributor-docs.test.mjs');
  const docsCommand = manifest.scripts['check:docs'];
  for (const owner of [
    'scripts/check-docs-structure.mjs',
    'scripts/library-docs.test.mjs',
    'scripts/contributor-docs.test.mjs',
    'scripts/markdown-corpus.test.mjs',
    'scripts/documentation-examples.test.mjs',
    'scripts/check-markdown-links.mjs',
  ]) {
    assert.equal(docsCommand.split(/\s+/).filter(token => token === owner).length, 1,
      `docs checks must execute ${owner} exactly once`);
  }

  for (const path of contributorPages) {
    const source = await read(path);
    assert.doesNotMatch(source, /(?:\/home\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+)/, `${path}: private path`);
    assert.doesNotMatch(source, /\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{12,})\b/, `${path}: credential-shaped value`);
  }
});

test('performance guidance names unbudgeted operations without promising new public cancellation', async () => {
  const source = await read('docs/contribute/reference/performance-budgets.md');
  const section = source.split('## What is not budgeted')[1]?.split('\n## ')[0];
  assert.ok(section, 'missing unbudgeted operation boundary');
  const text = section.replace(/\s+/g, ' ');
  for (const operation of ['Selection', 'connection', 'keyboard-authoring', 'text-edit']) assert.ok(text.includes(operation));
  assert.match(text, /no hard budget/);
  assert.match(text, /Public viz, Node, and MCP layout remain direct calls/);
  assert.match(text, /does not imply a new public asynchronous or cancellation contract/);
});
