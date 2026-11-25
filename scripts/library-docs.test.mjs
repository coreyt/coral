import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
import { readRegistryCoreIdentity } from './graphir-candidate-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const json = async (path) => JSON.parse(await read(path));

const pages = [
  'docs/embed/index.md',
  'docs/embed/how-to/render-a-diagram.md',
  'docs/embed/how-to/render-in-a-browser.md',
  'docs/embed/how-to/embed-the-react-editor.md',
  'docs/embed/reference/viz-api.md',
  'docs/embed/reference/render-api.md',
  'docs/embed/reference/language-api.md',
  'docs/embed/reference/language-specification-1.3.0.md',
  'docs/embed/reference/mcp-server.md',
  'docs/embed/reference/tree-sitter.md',
  'docs/embed/reference/graphir-migration.md',
];

const packages = [
  ['packages/language', '@coral-viz/language', 'reference/language-api', [
    /root `parse` and `parseDocument028` read saved Coral source: default edition\s+0\.2\.8 and explicitly pinned 0\.2\.9/,
    /Language Specification \*\*1\.3\.0\*\* owns syntax, meaning and declared entry-point/,
    /TypeScript reader implements\s+the saved contract/,
    /CORAL_LANGUAGE_VERSION/,
    /leaves ambiguous defects unresolved/,
  ]],
  ['packages/render', '@coral-viz/render', 'reference/render-api', [
    /renderSvg` and `renderHtml` functions serialize supplied geometry;\s+they don't perform layout/,
  ]],
  ['packages/viz', '@coral-viz/viz', 'reference/viz-api', [
    /The host owns file loading/,
    /Connections are disabled by default/,
  ]],
  ['packages/mcp-server', '@coral-viz/mcp-server', 'reference/mcp-server', [
    /content\[\]\.text/,
    /option set is narrower than the language\/render libraries/,
    /no byte, node-count, or operation-time guarantee/,
  ]],
  ['packages/tree-sitter-coral', 'tree-sitter-coral', 'reference/tree-sitter', [
    /compiles from source during installation; it doesn't ship\s+prebuilt binaries/,
    /semantic diagnostics,\s+canonicalization, and repair remain owned by `@coral-viz\/language`/,
  ]],
];

test('Embed Coral owns its quadrant-compliant routes and canonical sources', async () => {
  for (const page of pages) assert.equal(existsSync(resolve(root, page)), true, `missing ${page}`);
  for (const page of pages.slice(1)) {
    assert.match(page, /^docs\/embed\/(?:how-to|reference|explain)\//);
  }

  const renderGuide = await read(pages[1]);
  const browserGuide = await read(pages[2]);
  const reactGuide = await read(pages[3]);
  assert.match(renderGuide, /^<<< \.\.\/examples\/render-diagram\.mjs$/m);
  assert.match(browserGuide, /^<<< \.\.\/examples\/browser-esm\.mjs$/m);
  assert.match(browserGuide, /^<<< \.\.\/examples\/browser-script\.html$/m);
  assert.match(reactGuide, /^<<< \.\.\/examples\/react-editor\.tsx$/m);
  const migrationGuide = await read('docs/embed/reference/graphir-migration.md');
  assert.match(migrationGuide, /^<<< \.\.\/examples\/graphir-migration\.ts$/m);
  for (const source of [
    'docs/embed/examples/render-diagram.mjs',
    'docs/embed/examples/browser-esm.mjs',
    'docs/embed/examples/browser-script.html',
    'docs/embed/examples/react-editor.tsx',
    'docs/embed/examples/graphir-migration.ts',
  ]) assert.equal(existsSync(resolve(root, source)), true, `missing ${source}`);
});

test('the chooser matches public package entries, requirements, and GraphIR 3', async () => {
  const index = await read('docs/embed/index.md');
  for (const [, name] of packages) assert.match(index, new RegExp(name.replaceAll('/', '\\/')));
  assert.match(index, /@coral-viz\/browser/);
  assert.match(index, /six public packages/);
  for (const entry of [
    '@coral-viz/language/parser', '@coral-viz/language/printer',
    '@coral-viz/language/formats', '@coral-viz/render/layout',
    '@coral-viz/viz/editor', '@coral-viz/viz/layout',
    '@coral-viz/viz/text-editor', 'coral-mcp',
  ]) assert.ok(index.includes(entry), `chooser missing ${entry}`);
  assert.match(index, /Node\.js 24\.19\.0/);
  assert.match(index, /@graph-ir\/core@0\.2\.4/);
  assert.match(index, /GraphIR 3\.0/);

  const version = RENDERER_CANDIDATE.version;
  const exactInstalls = new Map([
    ['docs/embed/index.md', ['language', 'render', 'viz']],
    ['docs/embed/how-to/embed-the-react-editor.md', ['language', 'render', 'viz']],
    ['docs/embed/reference/language-api.md', ['language']],
    ['docs/embed/reference/mcp-server.md', ['language', 'render', 'mcp-server']],
  ]);
  for (const [page, names] of exactInstalls) {
    const source = await read(page);
    for (const name of names) assert.ok(source.includes(`./coral-viz-${name}-${version}.tgz`), `${page} lacks ${name}`);
    assert.ok(source.includes('@graph-ir/core@0.2.4'), `${page} lacks exact Core pin`);
  }
  assert.ok((await read('docs/embed/reference/tree-sitter.md')).includes(`./tree-sitter-coral-${version}.tgz`));
  assert.match(index, /verified 0\.2\.14 archives/);
  assert.doesNotMatch(index, /until Coral 0\.2\.8 is published|published 0\.2\.6 identities/);

  for (const page of [
    'docs/embed/index.md',
    'docs/embed/reference/tree-sitter.md',
    'packages/tree-sitter-coral/README.md',
  ]) {
    const source = await read(page);
    assert.match(source, /Python is required\s+on every\s+supported native-build platform/);
    assert.match(source, /\bmake\b/);
    assert.match(source, /Xcode\s+Command\s+Line\s+Tools/);
    assert.match(source, /Visual\s+Studio\s+C\+\+ build tools/);
  }
});

test('Current READMEs provide complete executable installs and durable Embed links', async () => {
  const version = RENDERER_CANDIDATE.version;
  const core = await readRegistryCoreIdentity();
  for (const [directory, name, route, boundaries] of [
    ...packages, ['packages/browser', '@coral-viz/browser', 'how-to/render-in-a-browser', []],
  ]) {
    const source = await read(`${directory}/README.md`);
    assert.match(source, /## Coral 0\.2\.14/);
    assert.doesNotMatch(source, /private candidate|not tagged or\s+published/);
    const block = source.match(/```sh\n(npm install [\s\S]*?)\n```/)?.[1];
    assert.ok(block, `${name}: install command missing`);
    const command = block.replace(/\\\n\s*/g, ' ');
    assert.doesNotMatch(command, /\n/, `${name}: disconnected install operands`);
    const manifest = await json(`${directory}/package.json`);
    const archive = (id) => `./${id.replace('@', '').replace('/', '-')}-${version}.tgz`;
    const operands = command.split(/\s+/).slice(2);
    assert.ok(operands.includes(archive(name)), `${name}: own candidate missing`);
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (dependency.startsWith('@coral-viz/')) {
        assert.equal(range, version);
        assert.ok(operands.includes(archive(dependency)), `${name}: missing private ${dependency}`);
      } else if (dependency === '@graph-ir/core') {
        assert.equal(range, core.version);
        assert.ok(operands.includes(`./graph-ir-core-${core.version}.tgz`));
      }
    }
    if (name === '@coral-viz/viz') {
      for (const peer of ['@xyflow/react@^12', 'react@^19', 'react-dom@^19']) assert.ok(operands.includes(peer));
    }
    if (name === 'tree-sitter-coral') assert.ok(operands.includes('tree-sitter@0.25.1'));
    assert.ok(source.includes(`https://coreyt.github.io/coral/docs/embed/${route}`));
    assert.doesNotMatch(source, /npm run (?:build|start) -w|node packages\//);
    assert.doesNotMatch(command, /(?:\/tmp\/|git\+|@graph-ir\/core@0\.2\.2)/);
    for (const boundary of boundaries) assert.match(source, boundary, `${name} boundary drifted`);
  }
  const browser = await read('packages/browser/README.md');
  assert.match(browser, /src="\.\/coral-browser\.iife\.js"/);
  assert.doesNotMatch(browser, /cdn\.jsdelivr\.net/);
});

test('documented public subpaths and package files match manifests', async () => {
  const expectations = new Map([
    ['@coral-viz/language', ['.', './parser', './sequence', './printer', './formats']],
    ['@coral-viz/render', ['.', './layout', './svg-layout', './artwork-import']],
    ['@coral-viz/viz', ['.', './editor', './layout', './text-editor']],
  ]);
  for (const [directory, name] of packages) {
    const manifest = await json(`${directory}/package.json`);
    if (expectations.has(name)) {
      assert.deepEqual(Object.keys(manifest.exports), expectations.get(name), `${name} exports drifted`);
    }
    for (const required of ['README.md', 'LICENSE']) {
      assert.ok(manifest.files.includes(required), `${name} does not pack ${required}`);
    }
  }
  const mcp = await json('packages/mcp-server/package.json');
  assert.equal(mcp.bin?.['coral-mcp'], 'dist/index.js');
  const grammar = await json('packages/tree-sitter-coral/package.json');
  assert.equal(grammar.files.includes('prebuilds/**'), false, 'grammar promises absent prebuilds');
  const browser = await json('packages/browser/package.json');
  assert.deepEqual(Object.keys(browser.exports), ['.', './iife', './package.json']);
  for (const required of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert.ok(browser.files.includes(required), `@coral-viz/browser does not pack ${required}`);
  }
});

test('the MCP reference describes all seven current bounded contracts', async () => {
  const server = await read('packages/mcp-server/src/server.ts');
  const guide = await read('docs/embed/reference/mcp-server.md');
  const readme = await read('packages/mcp-server/README.md');
  const converter = await read('packages/mcp-server/src/tools/convert.ts');
  const tools = [
    'coral_generate', 'coral_validate', 'coral_convert',
    'coral_layout', 'coral_render', 'coral_explain', 'coral_check_conformance',
  ];
  for (const name of tools) {
    assert.ok(server.includes(`case '${name}'`));
    assert.ok(guide.includes(name), `MCP guide missing ${name}`);
  }
  for (const source of [guide, readme]) {
    assert.match(source, /[Ss]even/);
    assert.match(source, /full.*schema and catalog verification/);
    assert.match(source, /bounded Mermaid sequence/i);
    for (const code of ['mcp.coral028.import.unsupported', 'mcp.coral028.import.unverified',
      'mcp.coral028.writer.unavailable']) {
      assert.ok(converter.includes(code), `conversion producer lacks ${code}`);
      assert.ok(source.includes(code), `conversion reference lacks ${code}`);
    }
    assert.match(source, /Unsupported Mermaid sequences[\s\S]*import\.unsupported/);
    assert.match(source, /other Mermaid diagrams[\s\S]*writer\.unavailable/);
    assert.match(source, /Full external/);
  }
  assert.match(guide, /"command": "npx"/);
  assert.match(guide, /"--no-install"/);
  assert.match(guide, /"coral-mcp"/);
  assert.match(guide, /content\[\]\.text/);
});

test('current archive install guidance stays explicit', async () => {
  const guide = await read('docs/embed/how-to/render-a-diagram.md');
  assert.match(guide, /verified Coral 0\.2\.14 browser archive/);
  assert.ok(guide.includes(`npm install @graph-ir/core@${(await readRegistryCoreIdentity()).version} ./coral-viz-browser-0.2.14.tgz`));
  assert.match(guide, /coral-viz-browser-0\.2\.14\.tgz/);
  assert.match(guide, /Verify archive checksums before\s+installation/);
  assert.doesNotMatch(guide, /npm install @coral-viz\/language@0\.2\.6/);
});

test('current guidance names the exact Core pin from the lockfile and GraphIR 3', async () => {
  // The expected pin is the current registry identity, not a release constant.
  const core = await readRegistryCoreIdentity();
  assert.equal(core.publication, 'registry');
  for (const workspace of ['language', 'render', 'browser', 'viz', 'mcp-server', 'diagram-editor']) {
    const manifest = JSON.parse(await read(`packages/${workspace}/package.json`));
    assert.equal(manifest.dependencies['@graph-ir/core'], core.version, workspace);
  }
  const pin = `@graph-ir/core@${core.version}`;
  const currentGuides = [
    'docs/contribute/get-started.md',
    'docs/contribute/how-to/build-and-preview.md',
    'docs/contribute/reference/architecture.md',
    'docs/embed/index.md',
    'docs/embed/how-to/embed-the-react-editor.md',
    'docs/embed/how-to/render-a-diagram.md',
    'docs/embed/reference/language-api.md',
  'docs/embed/reference/language-specification-1.3.0.md',
  ];
  for (const path of currentGuides) {
    const source = await read(path);
    assert.ok(source.includes(pin), `${path} omits the current ${pin} pin`);
    assert.doesNotMatch(source, /private (?:GraphIR )?Core|graph-ir-core-[\d.]+\.tgz/,
      `${path} describes a private Core archive instead of the published pin`);
  }
  for (const path of [
    'dev/requirements.md',
    'dev/designs/canonical-ir.md',
    'dev/designs/windows-validation.md',
    'docs/embed/index.md',
    'docs/embed/how-to/embed-the-react-editor.md',
  ]) {
    assert.match(await read(path), /GraphIR 3(?:\.0\.0)?/i, `${path} lacks GraphIR 3`);
  }
});

test('render guide example executes the production saved-source path', async () => {
  const example = await import(pathToFileURL(resolve(root,
    'docs/embed/examples/render-diagram.mjs')).href);
  assert.equal(typeof example.source, 'string', 'example must expose its exact authored source');
  assert.match(example.source, /^@diagram architecture\n/);
  assert.equal(example.result.sourceGraph.version, '4.0.0');
  assert.deepEqual(example.result.sourceGraph.edges.map(({ id, first, second, label }) =>
    ({ id, first: first.node, second: second.node, label })),
    [{ id: 'writes', first: 'api', second: 'orders', label: 'writes' }]);
  assert.equal(example.result.sourceGraph.nodes.length, 2);
  assert.equal(example.result.graph.edges.length, 1);
  assert.deepEqual(example.result.diagnostics, []);
  assert.equal(example.svg, example.result.svg);
  assert.match(example.svg, /^<svg/);
  assert.match(example.svg, /data-coral-edge="writes"/);
  assert.ok(example.html.includes(example.svg), 'standalone HTML must contain the exact rendered SVG');
  assert.match(example.html, /^<!doctype html>/);
  assert.doesNotMatch(example.html, /<script|https?:\/\/(?!www\.w3\.org)/);
  const { render } = await import('@coral-viz/browser');
  await assert.rejects(render(example.source.replace(/^@diagram architecture\n/, '')),
    (error) => error.diagnostics.some(({ code }) => code === 'header.diagram.required'));
});

test('language references share canonical owners and emit exact versioned normative downloads', async () => {
  const manifest = await json('packages/language/spec/conformance/manifest.json');
  const version = manifest.languageVersion;
  const specRoute = `language-specification-${version}.md`;
  const reference = await read(`docs/embed/reference/${specRoute}`);
  assert.match(reference, /@include: .*packages\/language\/SPEC\.md/);
  const policy = await read('docs/contribute/reference/language-evolution.md');
  assert.match(policy, /@include: .*dev\/designs\/language-design-and-evolution\.md#policy/);
  for (const page of ['docs/use/reference/coral-dsl.md', 'docs/embed/reference/language-api.md',
    'docs/contribute/index.md', 'docs/contribute/get-started.md']) {
    assert.ok((await read(page)).includes(specRoute), `${page}: current specification not discoverable`);
  }
  const configuration = (await import(pathToFileURL(resolve(root, 'docs/.vitepress/config.mts')).href)).default;
  assert.equal(typeof configuration.buildEnd, 'function', 'documentation build must emit normative downloads');
  const directory = await mkdtemp(join(tmpdir(), 'coral-language-reference-'));
  try {
    await configuration.buildEnd({ outDir: directory });
    for (const asset of ['SPEC.md', 'spec/grammar-028.ebnf', 'spec/grammar.ebnf',
      'spec/diagnostics.json', 'spec/conformance/manifest.json',
      'spec/upstream/graph-ir.schema.json', 'spec/upstream/graph-ir-4.0.candidate.schema.json']) {
      const expected = await readFile(resolve(root, 'packages/language', asset));
      const actual = await readFile(join(directory, 'language', version, asset));
      assert.deepEqual(actual, expected, `${asset}: built reference bytes drifted`);
    }
    assert.equal(existsSync(join(directory, 'language', '0.2.9')), false,
      'reference paths use the language version, not the package version');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('browser documentation separates authored meaning from display and links shared owners', async () => {
  const guide = await read('docs/embed/how-to/render-in-a-browser.md');
  assert.match(guide, /`style`/);
  assert.match(guide, /`sourceGraph`/);
  assert.match(guide, /GraphIR 3 display/);
  assert.match(guide, /original source/);
  assert.doesNotMatch(guide, /cdn\.jsdelivr/);
  for (const path of ['docs/embed/index.md', 'docs/embed/how-to/render-in-a-browser.md']) {
    const source = await read(path);
    assert.match(source, /start-from-an-example/);
    assert.match(source, /language-specification-1\.3\.0/);
    assert.match(source, /language-evolution/);
  }
});
