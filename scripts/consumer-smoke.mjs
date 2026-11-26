import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { assertArtifactContent, consumerWorkspaces, selectConsumerCases } from './api-compat-lib.mjs';
import { resolveConsumerGeneration } from './consumer-generation.mjs';
import { verifyInstalledBrowser028 } from './installed-browser-smoke.mjs';
import { readRegistryCoreIdentity, validateRegistryCoreIdentity } from './graphir-candidate-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const rootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expectedArtifactVersion = process.env.CORAL_EXPECT_ARTIFACT_VERSION ?? rootManifest.version;
const rootLanguageManifest = JSON.parse(await readFile(join(root, 'packages/language/package.json'), 'utf8'));
const artifactGeneration = resolveConsumerGeneration({
  artifactVersion: expectedArtifactVersion,
  rootVersion: rootManifest.version,
  rootCoreVersion: rootLanguageManifest.dependencies['@graph-ir/core'],
  expectedCoreVersion: process.env.CORAL_EXPECT_GRAPH_IR_VERSION,
});
const npmCache = join(tmpdir(), 'coral-consumer-npm-cache');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run consumer smoke through npm.');
const expectedPlatform = process.env.CORAL_EXPECT_PLATFORM;
const actualPlatform = `${process.platform}-${process.arch}`;
if (expectedPlatform && expectedPlatform !== actualPlatform) {
  throw new Error(`Expected ${expectedPlatform}; runner is ${actualPlatform}.`);
}

function run(command, args, cwd = root, timeout = 120_000, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    env: { ...process.env, npm_config_cache: npmCache, npm_config_logs_max: '0', ...env },
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  }
  return result.stdout.trim() || result.stderr.trim();
}

function npm(args, cwd = root, timeout = 120_000) {
  return run(process.execPath, [npmCli, ...args], cwd, timeout);
}

function assertInstalledVersions(consumer, expected, allowedOverrides = new Set()) {
  const listing = npm(['ls', ...Object.keys(expected), '--all', '--json'], consumer);
  let tree;
  try {
    tree = JSON.parse(listing);
  } catch (error) {
    throw new Error(`npm ls returned non-JSON package data for ${Object.keys(expected).join(', ')}: ${JSON.stringify(listing.slice(0, 2000))}`, { cause: error });
  }
  const found = new Map(Object.keys(expected).map((name) => [name, new Set()]));
  const locations = new Map(Object.keys(expected).map((name) => [name, []]));
  const problems = [];
  const visit = (node, path = []) => {
    if (Array.isArray(node.problems)) problems.push(...node.problems);
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      const dependencyPath = [...path, `${name}@${dependency.version ?? 'unknown'}`];
      if (found.has(name) && dependency.version) {
        found.get(name).add(dependency.version);
        locations.get(name).push(dependencyPath.join(' > '));
      }
      if (dependency.invalid || (dependency.overridden && !allowedOverrides.has(name))) {
        problems.push(`${name}: ${dependency.invalid ? 'invalid' : 'overridden'}`);
      }
      visit(dependency, dependencyPath);
    }
  };
  visit(tree);
  if (problems.length) throw new Error(`Peer resolution problems: ${problems.join(' | ')}`);
  for (const [name, version] of Object.entries(expected)) {
    const versions = [...found.get(name)];
    if (versions.length !== 1 || versions[0] !== version) {
      throw new Error(`Expected only ${name}@${version}; found ${versions.join(', ') || 'none'} at ${locations.get(name).join(' | ') || 'no dependency path'}.`);
    }
  }
}

// Use the same relative file spec npm saves for the consumer dependency. npm
// matches this to the local artifact's trusted resolved identity on Unix.
function localArtifactPolicyKey(consumer, tarball) {
  return `file:${relative(consumer, tarball).replaceAll('\\', '/')}`;
}

const expectedNode = process.env.CORAL_EXPECT_NODE ?? '26.8.2';
if (process.version !== `v${expectedNode}`) {
  throw new Error(`Node ${expectedNode} is required; found ${process.version.slice(1)}.`);
}
const npmVersion = (process.env.npm_config_user_agent ?? '')
  .match(/(?:^|\s)npm\/([^\s]+)/)?.[1];
if (npmVersion !== '12.0.2') {
  throw new Error(`npm 12.0.2 is required; found ${npmVersion ?? 'unknown'}.`);
}

function inspectArtifact(tarball, expectedName) {
  const entries = run('tar', ['-tzf', tarball]).split(/\r?\n/);
  assertArtifactContent(entries, expectedName, expectedArtifactVersion);
  const manifest = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json']));
  if (manifest.name !== expectedName || manifest.version !== expectedArtifactVersion) {
    throw new Error(`Expected ${expectedName}@${expectedArtifactVersion}; found ${manifest.name}@${manifest.version}.`);
  }
  if (manifest.license !== 'Apache-2.0' || !manifest.repository?.url) {
    throw new Error(`${expectedName} tarball has incomplete license/repository metadata.`);
  }
  return manifest;
}

function pack(workspace, destination) {
  const before = new Set(readdirSync(destination));
  npm(['pack', '--ignore-scripts', '--json', '--pack-destination', destination, '--workspace', workspace]);
  const created = readdirSync(destination).filter(
    (name) => name.endsWith('.tgz') && !before.has(name),
  );
  if (created.length !== 1) {
    throw new Error(`npm pack for ${workspace} created ${created.length} tarballs.`);
  }
  const tarball = join(destination, created[0]);
  inspectArtifact(tarball, workspace);
  return tarball;
}

const staging = await mkdtemp(join(tmpdir(), 'coral-artifacts-'));
const providedArtifactDirectory = process.env.CORAL_ARTIFACT_DIR;
const temporaryConsumers = [];
try {
const artifacts = providedArtifactDirectory ? resolve(providedArtifactDirectory) : join(staging, 'artifacts');
if (!providedArtifactDirectory) await mkdir(artifacts);
const tarballs = new Map();
const workspaces = consumerWorkspaces(process.env);
const browserPublished = workspaces.includes('@coral-viz/browser');
if (providedArtifactDirectory) {
  for (const filename of readdirSync(artifacts).filter((name) => name.endsWith('.tgz'))) {
    const tarball = join(artifacts, filename);
    const manifest = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json']));
    if (workspaces.includes(manifest.name)) {
      inspectArtifact(tarball, manifest.name);
      tarballs.set(manifest.name, tarball);
    }
  }
} else {
  for (const workspace of workspaces) tarballs.set(workspace, pack(workspace, artifacts));
}
for (const workspace of workspaces) {
  if (!tarballs.has(workspace)) throw new Error(`No packed artifact found for ${workspace}.`);
}
const registryCore = expectedArtifactVersion === rootManifest.version
  ? await readRegistryCoreIdentity() : undefined;
const graphIrVersion = artifactGeneration.core;
const rootTypeScript = resolve(root, 'node_modules/typescript/bin/tsc');
const nodeGyp = resolve(dirname(dirname(npmCli)), 'node_modules/node-gyp/bin/node-gyp.js');
const reactDocSource = await readFile(
  join(root, 'docs/embed/examples/react-editor.tsx'),
  'utf8',
);
const expectedGraphVersion = artifactGeneration.schema;
const savedSource028 = '@diagram architecture\nconsumer service as "Consumer"\norders database as "Orders"\nconsumer -> orders\n';
const source028 = ['0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'].includes(expectedArtifactVersion);
const languageRuntime = source028
  ? `import { HEADER_MANIFEST_028, parse } from '@coral-viz/language';
const source = ${JSON.stringify(savedSource028)};
const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8'])
  .flatMap((edition) => edition.catalogs.map((catalog) =>
    [catalog.id + '@' + catalog.version, catalog.digest])));
const result = parse(source, {
  manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests,
});
if (result.header.source !== source || result.header.header?.diagramType !== 'architecture' ||
  result.header.diagnostics.length || result.syntax.diagnostics.length ||
  result.syntax.graph.nodes.length !== 2 || result.syntax.graph.edges.length !== 1)
  throw new Error('language saved-source parse failed');`
  : `import { parse } from '@coral-viz/language';
const result = parse('service "Consumer"');
if (!result.graph || result.graph.version !== '${expectedGraphVersion}') throw new Error('language parse/schema version failed');`;
const browserSource = source028 ? savedSource028
  : 'service "Consumer" as consumer\ndatabase "Orders" as orders\nconsumer -> orders';

// Reuse the render consumer installation; older immutable artifacts keep their original proof.
const userSymbolRuntime029 = `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { projectInstalledSourceToSuccessor028, graphIrExportRefusal029,
  successorCoreValidationInput029, printSuccessorSource028 } from '@coral-viz/render';
const source = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol gate {',
  '  name "Gate"', '  size 40 x 40', '  input port [direction: in, label: "Input", maxConnections: 1]',
  '  artwork svg """', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#286699"/></svg>',
  '"""', '}', 'g service [symbol: "local.gate"]', 'a service', 'read = a -> g:input', ''].join('\\n');
const portable = text => {
  const projected = projectInstalledSourceToSuccessor028(text);
  assert.deepEqual(projected.diagnostics, []);
  assert.deepEqual(graphIrExportRefusal029(projected.graph, text), []);
  return successorCoreValidationInput029(projected.graph, { limits: true }).graph;
};
const graph = portable(source);
assert.equal(graph.documentCatalog.length, 1);
assert.deepEqual(graph.documentCatalog[0].artwork.profile, { id: 'coral.svg-artwork', version: '1' });
assert.match(graph.documentCatalog[0].digest, /^sha256:[a-f0-9]{64}$/);
const written = printSuccessorSource028(graph);
assert.deepEqual(written.diagnostics, []);
assert.deepEqual(portable(written.text), graph);
const directory = new URL('../spec/svg-artwork-1/', import.meta.resolve('@coral-viz/render'));
const freeze = JSON.parse(await readFile(new URL('freeze.json', directory), 'utf8'));
assert.equal(Object.keys(freeze.artifacts).length, 10);
for (const [path, hash] of Object.entries(freeze.artifacts)) {
  assert.equal(createHash('sha256').update(await readFile(new URL(path, directory))).digest('hex'), hash);
}`;

const cases = [
  {
    name: 'language',
    install: ['@coral-viz/language'],
    runtime: languageRuntime,
    types: source028
      ? `import { HEADER_MANIFEST_028, parse } from '@coral-viz/language';
void [HEADER_MANIFEST_028, parse];`
      : `import type { GraphIR } from '@coral-viz/language'; declare const value: GraphIR; void value;`,
  },
  {
    name: 'render',
    install: ['@coral-viz/render', '@coral-viz/language'],
    runtime: `import { renderHtml } from '@coral-viz/render';
if (!renderHtml({nodes:[{id:'a',type:'service',label:'Consumer',position:{x:0,y:0}}],edges:[]}).includes('Consumer')) throw new Error('render failed');` + (['0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'].includes(expectedArtifactVersion) ? userSymbolRuntime029 : ''),
    types: `import type { SvgOptions, HtmlOptions } from '@coral-viz/render';
// @ts-expect-error C10 cache controls must not enter the packed root declarations.
import { resetFontResolutionCacheForTests, fontResolutionCacheSnapshotForTests } from '@coral-viz/render';
declare const values: [SvgOptions, HtmlOptions]; void values;`,
  },
  {
    name: 'library-docs-render',
    artifactVersions: ['0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    requiresBrowser: true,
    install: ['@coral-viz/browser'],
    runtimeSourcePath: 'docs/embed/examples/render-diagram.mjs',
    types: `import { render, type CoralRenderOptions, type CoralRenderResult } from '@coral-viz/browser';
const source = '@diagram architecture\\napi service';
const options: CoralRenderOptions = { style: 'hifi', direction: 'RIGHT' };
const result: Promise<CoralRenderResult> = render(source, options);
void result.then(({ svg, sourceGraph, diagnostics }) => [svg, sourceGraph, diagnostics]);`,
  },
  {
    name: 'library-docs-source-reader',
    artifactVersions: ['0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    install: ['@coral-viz/language'],
    runtimeSourcePath: 'docs/embed/examples/read-coral-source.mjs',
    types: `import { HEADER_MANIFEST_028, parse } from '@coral-viz/language';
void [HEADER_MANIFEST_028, parse];`,
  },
  {
    name: 'library-docs-interchange',
    artifactVersions: ['0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    install: ['@coral-viz/language'],
    runtimeSourcePath: 'docs/embed/examples/read-graph-interchange.mjs',
    types: `import { parse } from '@coral-viz/language/parser';
void parse('service "API"');`,
  },
  {
    name: 'library-docs-browser-esm',
    artifactVersions: ['0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    requiresBrowser: true,
    install: ['@coral-viz/browser'],
    runtimeSourcePath: 'docs/embed/examples/browser-esm.mjs',
    types: `import { render, renderTo, type CoralRenderOptions } from '@coral-viz/browser';
const options: CoralRenderOptions = { style: 'hifi', direction: 'RIGHT' };
void [render, renderTo, options];`,
  },
  {
    name: 'viz',
    artifactVersions: ['0.2.5', '0.2.6', '0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    install: ['@coral-viz/viz', '@coral-viz/render', '@coral-viz/language'],
    runtime: `import { CORAL_EDGE_VIEW_METADATA, CORAL_NODE_VIEW_METADATA, DEFAULT_DIAGRAM_FONT_SETTINGS, DEFAULT_FONT_SETTINGS, DiagramFontFaces, FONT_FAMILY_PRESETS, FONT_SIZE_PRESETS, FontSettingsForm, convertGraphToFlow, getFontFamilyPreset, getFontSizePreset, normalizeDiagramFontSettings } from '@coral-viz/viz';
if (convertGraphToFlow({version:'${expectedGraphVersion}',id:'g',nodes:[{id:'a',type:'service'}],edges:[]}).nodes.length !== 1) throw new Error('viz failed');
if (DEFAULT_DIAGRAM_FONT_SETTINGS.default.size !== 14 || DEFAULT_FONT_SETTINGS.lineHeight !== 1.3) throw new Error('viz font defaults missing');
if (FONT_FAMILY_PRESETS.length !== 5 || FONT_SIZE_PRESETS.length !== 4 || getFontFamilyPreset('mono')?.id !== 'mono' || getFontSizePreset('large')?.size !== 16) throw new Error('viz font presets missing');
if (normalizeDiagramFontSettings(undefined).default.size !== 14 || !FontSettingsForm || !DiagramFontFaces) throw new Error('viz font API missing');
if (Symbol.keyFor(CORAL_NODE_VIEW_METADATA) !== '@coral-viz/viz/node-view-metadata' || Symbol.keyFor(CORAL_EDGE_VIEW_METADATA) !== '@coral-viz/viz/edge-view-metadata') throw new Error('viz view metadata missing');`,
    types: `import type { CoralEdgeViewMetadata, CoralEditorProps, CoralNodeViewMetadata, DiagramFontFacesProps, DiagramFontSettings, DimensionSource, FontAwareCoralEdgeData, FontAwareCoralNodeData, FontFamilyPreset, FontSettings, FontSettingsFormProps, FontSizePreset } from '@coral-viz/viz';
declare const values: [CoralEdgeViewMetadata, CoralEditorProps, CoralNodeViewMetadata, DiagramFontFacesProps, DiagramFontSettings, DimensionSource, FontAwareCoralEdgeData, FontAwareCoralNodeData, FontFamilyPreset, FontSettings, FontSettingsFormProps, FontSizePreset]; void values;`,
  },
  {
    name: 'viz-graphir-migration',
    artifactVersions: ['0.2.5', '0.2.6', '0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    coreVersions: ['0.2.2', '0.2.3', '0.2.4'],
    install: ['@coral-viz/viz', '@coral-viz/render', '@coral-viz/language'],
    typescriptSourcePath: 'docs/embed/examples/graphir-migration.ts',
    extraTypes: `import type { LayoutDiagnosticCode, ResolvedLayoutDiagnostic, SpatialLayoutDiagnosticCode } from '@coral-viz/render/layout';
function legacyDiagnostic(code: LayoutDiagnosticCode): string {
  switch (code) {
    case 'layout.option.invalid': return code;
    case 'layout.port.invalid': return code;
    case 'layout.port.missing': return code;
    case 'layout.engine.failed': return code;
    case 'layout.worker.fallback': return code;
    case 'layout.worker.unavailable': return code;
    default: return code satisfies never;
  }
}
function spatialDiagnostic(code: SpatialLayoutDiagnosticCode): string {
  switch (code) {
    ${['0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'].includes(expectedArtifactVersion) ? `case 'layout.geometry.invalid': return code;
    case 'layout.route.invalid': return code;` : ''}
    ${['0.2.11', '0.2.12', '0.2.14', '0.2.15'].includes(expectedArtifactVersion) ? `case 'layout.route.degraded': return code;
    case 'layout.route.retried': return code;` : ''}
    case 'layout.capability.unsupported': return code;
    case 'layout.constraint.required-unsatisfied': return code;
    case 'layout.constraint.preferred-rejected': return code;
    case 'layout.constraint.overlap-forced': return code;
    ${source028 ? `case 'layout.constraint.dependency-unsupported': return code;
    case 'layout.proximity.rejected': return code;` : ''}
    case 'layout.route.anchor-missing': return code;
    default: return code satisfies never;
  }
}
declare const resolved: ResolvedLayoutDiagnostic;
void [resolved, legacyDiagnostic, spatialDiagnostic];`,
  },
  ...[
    {
      line: '18',
      react: '18.3.1',
      reactTypes: '18.3.31',
      reactDomTypes: '18.3.7',
    },
    {
      line: '19',
      react: '19.3.0',
      reactTypes: '19.3.0',
      reactDomTypes: '19.3.0',
    },
  ].map(({ line, react, reactTypes, reactDomTypes }) => ({
    name: `viz-react-${line}`,
    artifactVersions: ['0.2.5', '0.2.6', '0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    coreVersions: ['0.2.2', '0.2.3', '0.2.4'],
    install: ['@coral-viz/viz', '@coral-viz/render', '@coral-viz/language'],
    extra: [
      `react@${react}`,
      `react-dom@${react}`,
      `@types/react@${reactTypes}`,
      `@types/react-dom@${reactDomTypes}`,
      '@xyflow/react@12.11.6',
      'jsdom@30.0.1',
    ],
    expectedVersions: {
      react,
      'react-dom': react,
      '@xyflow/react': '12.11.6',
    },
    canonicalReact: true,
    runtime: `import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM, VirtualConsole } from 'jsdom';
import { EditorExample, hydrateEditor } from './canonical-react.mjs';
const element = React.createElement(EditorExample);
const markup = renderToString(element);
if (!markup.includes('react-flow')) throw new Error('React ${line} CoralEditor SSR failed');
const failures = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => failures.push(String(error)));
const dom = new JSDOM('<div id="root">' + markup + '</div>', {
  url: 'http://localhost/',
  virtualConsole,
});
// Frames are tracked so readiness is observed (hydration committed, no frame
// pending) rather than assumed after a fixed delay.
const pendingFrames = new Set();
const requestFrame = (callback) => {
  const handle = setTimeout(() => { pendingFrames.delete(handle); callback(dom.window.performance.now()); }, 0);
  pendingFrames.add(handle);
  return handle;
};
const cancelFrame = (handle) => { pendingFrames.delete(handle); clearTimeout(handle); };
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, value: dom.window.Node },
  Event: { configurable: true, value: dom.window.Event },
  SVGElement: { configurable: true, value: dom.window.SVGElement },
  MutationObserver: { configurable: true, value: dom.window.MutationObserver },
  getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
  ResizeObserver: { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } },
  requestAnimationFrame: { configurable: true, value: requestFrame },
  cancelAnimationFrame: { configurable: true, value: cancelFrame },
});
window.requestAnimationFrame = requestFrame;
window.cancelAnimationFrame = cancelFrame;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const originalError = console.error;
console.error = (...args) => failures.push(args.map(String).join(' '));
window.addEventListener('error', (event) => failures.push(String(event.error ?? event.message)));
window.addEventListener('unhandledrejection', (event) => failures.push(String(event.reason)));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (typeof React.act !== 'function') throw new Error('React ${line} does not export act');
const container = document.getElementById('root');
let hydrated;
try {
  // act() returns once hydration, its effects and resulting updates commit.
  await React.act(async () => { hydrated = hydrateEditor(container); });
  for (let turn = 0; pendingFrames.size > 0; turn++) {
    if (turn === 100) throw new Error('React ${line} editor never stopped requesting frames');
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  if (!container.querySelector('.react-flow')) throw new Error('React ${line} hydration removed the editor');
} finally {
  try { if (hydrated) await React.act(async () => { hydrated.unmount(); }); }
  finally {
    for (const handle of pendingFrames) clearTimeout(handle);
    console.error = originalError;
    dom.window.close();
  }
}
if (failures.length) throw new Error('React ${line} hydration failed: ' + failures.join(' | '));`,
    types: reactDocSource + `
// The public viz definitions stay assignable to/from their render owners.
declare const shape: import('@coral-viz/viz').ShapeDefinition;
declare const symbol: import('@coral-viz/viz').SymbolDefinition;
declare const notation: import('@coral-viz/viz').NotationDefinition;
const renderShape: import('@coral-viz/render').ShapeDefinition = shape;
const renderSymbol: import('@coral-viz/render').SymbolDefinition = symbol;
const renderNotation: import('@coral-viz/render').NotationDefinition = notation;
const vizShape: import('@coral-viz/viz').ShapeDefinition = renderShape;
const vizSymbol: import('@coral-viz/viz').SymbolDefinition = renderSymbol;
const vizNotation: import('@coral-viz/viz').NotationDefinition = renderNotation;
void [vizShape, vizSymbol, vizNotation];`,
  })),
  {
    name: 'mcp-server',
    install: ['@coral-viz/mcp-server', '@coral-viz/language', '@coral-viz/render'],
    runtime: `import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// Run the installed bin script with this Node: a Windows .cmd shim cannot be
// spawned without a shell, and the frozen manifest names the real entry.
const installed = resolve('node_modules/@coral-viz/mcp-server');
const manifest = JSON.parse(readFileSync(resolve(installed, 'package.json'), 'utf8'));
const binPath = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['coral-mcp'];
if (typeof binPath !== 'string') throw new Error('Installed MCP package declares no coral-mcp bin');
const bin = resolve(installed, binPath);
const inside = relative(installed, bin);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Installed MCP bin escapes its package');
const client = new Client({ name: 'coral-doc-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [bin] });
await client.connect(transport);
try {
if (client.getServerVersion()?.version !== '${expectedArtifactVersion}') throw new Error('MCP runtime version drifted');
const result = await client.listTools();
const names = result.tools.map((tool) => tool.name).sort();
const expected = ${JSON.stringify([
      ...(source028 ? ['coral_check_conformance'] : []),
      'coral_convert', 'coral_explain', 'coral_generate', 'coral_layout', 'coral_render', 'coral_validate',
    ])};
if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error('MCP tool list drifted: ' + names.join(', '));
${source028 ? `const source = '@diagram architecture\\napi service as "API"\\nstore database as "Store"\\napi -> store [reads]\\n';
const valid = await client.callTool({ name: 'coral_validate', arguments: { content: source } });
if (valid.isError || !JSON.stringify(valid).includes('2 nodes')) throw new Error('Packed MCP rejected 0.2.8 source');
const invalid = await client.callTool({ name: 'coral_validate', arguments: { content: 'api service' } });
if (!invalid.isError || !JSON.stringify(invalid).includes('header.diagram.required')) throw new Error('Packed MCP accepted headerless source');
const conflict = await client.callTool({ name: 'coral_render', arguments: { content: source, options: { notation: 'flowchart' } } });
if (!conflict.isError || !JSON.stringify(conflict).includes('mcp.render.notation.conflict')) throw new Error('Packed MCP replaced source notation');
const generated = await client.callTool({ name: 'coral_generate', arguments: { description: 'A service and a database' } });
if (generated.isError) throw new Error('Packed MCP could not generate 0.2.8 source');
const generatedText = generated.content[0].text;
const generatedSource = generatedText.slice(generatedText.indexOf('\\n\\n') + 2);
if (!generatedSource.startsWith('@diagram architecture\\n') || generatedSource.includes('@graph')) throw new Error('Packed MCP generated obsolete source');
const generatedValidation = await client.callTool({ name: 'coral_validate', arguments: { content: generatedSource } });
if (generatedValidation.isError) throw new Error('Packed MCP could not reparse generated source');
const generatedRender = await client.callTool({ name: 'coral_render', arguments: { content: generatedSource } });
if (generatedRender.isError || !generatedRender.content[0].text.includes('<svg')) throw new Error('Packed MCP could not render generated source');
const unsupportedImport = await client.callTool({ name: 'coral_convert', arguments: { content: 'graph TD\\n A[Alpha] --> B[Beta]' } });
if (!unsupportedImport.isError || !JSON.stringify(unsupportedImport).includes('mcp.coral028.writer.unavailable')) throw new Error('Packed MCP did not refuse unsupported import-to-Coral');` : `const source = 'service "API" as api\\ndatabase "Store" as store\\napi -> store';
const valid = await client.callTool({ name: 'coral_validate', arguments: { content: source } });
if (valid.isError || !JSON.stringify(valid).includes('2 nodes')) throw new Error('Packed historical MCP rejected its source generation');
const rendered = await client.callTool({ name: 'coral_render', arguments: { content: source } });
if (rendered.isError || !rendered.content[0].text.includes('<svg')) throw new Error('Packed historical MCP could not render its source generation');`}
} finally { await client.close(); }`,
    types: `import '@coral-viz/mcp-server';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
declare const client: Client; void client;`,
  },
  {
    name: 'browser',
    requiresBrowser: true,
    install: ['@coral-viz/browser'],
    runtime: `import { CoralRenderError, render, version } from '@coral-viz/browser';
const before = new Set(Object.getOwnPropertyNames(globalThis));
const result = await render(${JSON.stringify(browserSource)});
if (!result.svg.startsWith('<svg') || !result.svg.includes('Consumer') || result.graph.nodes.length !== 2) throw new Error('browser render failed');
${source028 ? "if (result.sourceGraph?.edges[0]?.direction !== 'first-to-second') throw new Error('browser lost written connector direction');" : ''}
if (version !== '${expectedArtifactVersion}') throw new Error('browser version drifted: ' + version);
const added = Object.getOwnPropertyNames(globalThis).filter((name) => !before.has(name));
if (added.length) throw new Error('browser render added globals: ' + added.join(', '));
const refused = await render('flowchart TD\\nA-->B').then(() => null, (error) => error);
if (!(refused instanceof CoralRenderError) || refused.code !== 'coral.browser.input.format') throw new Error('browser accepted Mermaid');`,
    types: `import { defineCustomElement, render, renderTo, scan, type CoralDiagnostic, type CoralErrorCode, type CoralRenderError, type CoralRenderOptions, type CoralRenderResult, type CoralScanResult } from '@coral-viz/browser';
import type { GraphIR } from '@graph-ir/core';
const options: CoralRenderOptions = { theme: 'dark', direction: 'DOWN', title: 'Consumer' };
const result: Promise<CoralRenderResult> = render(${JSON.stringify(source028 ? '@diagram architecture\na service' : 'service "A"')}, options);
const graph: Promise<GraphIR> = result.then((value) => value.graph);
// @ts-expect-error Font settings are not a browser render option in 0.2.6.
void render(${JSON.stringify(source028 ? '@diagram architecture\na service' : 'service "A"')}, { fontSettings: {} });
declare const values: [CoralDiagnostic, CoralErrorCode, CoralRenderError, CoralScanResult];
void [values, graph, renderTo, scan, defineCustomElement];`,
    compilerOptions: { skipLibCheck: false, lib: ['ES2022', 'DOM', 'DOM.Iterable'] },
  },
  {
    // The installed renderer boundary: language reader, low-level compatibility,
    // the MCP Mermaid chain, the source x style x theme matrix across browser,
    // MCP and public editor, then Chromium ESM/IIFE and the strict-CSP comparator.
    name: 'installed-renderer',
    artifactVersions: ['0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15'],
    requiresBrowser: true,
    install: ['@coral-viz/language', '@coral-viz/render', '@coral-viz/browser', '@coral-viz/viz', '@coral-viz/mcp-server'],
    extra: ['react@19.3.0', 'react-dom@19.3.0', '@xyflow/react@12.11.6'],
    expectedVersions: { react: '19.3.0', 'react-dom': '19.3.0', '@xyflow/react': '12.11.6' },
    runtimeSourcePath: 'scripts/installed-renderer-runtime.mjs',
    supportFiles: ['scripts/renderer-source-cases.mjs', 'scripts/packed-language-reader.mjs'],
    env: { CORAL_SOURCE_ROOT: root },
    timeout: 600_000,
    async afterRuntime(consumer) {
      run(process.execPath, [join(root, 'scripts/verify-local-successor-bridge.mjs'),
        join(consumer, 'node_modules/@graph-ir/core/dist/index.js'),
        join(consumer, 'node_modules/@coral-viz/render/dist/index.js')], root, 300_000);
      await verifyInstalledBrowser028({ consumer, browserTarball: tarballs.get('@coral-viz/browser') });
    },
    types: `import { render } from '@coral-viz/browser';
import { prepareSpatialScene028, projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
void [render, prepareSpatialScene028, projectInstalledSourceToSuccessor028];`,
  },
  {
    name: 'tree-sitter-coral',
    install: ['tree-sitter-coral'],
    extra: ['tree-sitter@0.25.1'],
    runtime: `import Parser from 'tree-sitter'; import language from 'tree-sitter-coral';
const parser = new Parser(); parser.setLanguage(language);
if (parser.parse(${JSON.stringify(source028 ? '@diagram flowchart\nConsumer process' : 'service "Consumer"')}).rootNode.hasError) throw new Error('native grammar parse failed');`,
    types: `import Parser from 'tree-sitter'; import language from 'tree-sitter-coral';
const parser = new Parser(); parser.setLanguage(language);`,
    scripts: true,
  },
];

  const selectedCases = selectConsumerCases(cases, process.env.CORAL_CONSUMER_CASES, {
    artifactVersion: expectedArtifactVersion, browserPublished, coreVersion: artifactGeneration.core,
  });
  for (const item of selectedCases) {
    const consumer = await mkdtemp(join(tmpdir(), `coral-consumer-${item.name}-`));
    temporaryConsumers.push(consumer);
    const localTarballs = item.install.map((name) => tarballs.get(name));
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      name: `coral-consumer-${item.name}`, private: true, type: 'module',
      ...(item.scripts ? {
        allowScripts: {
          ...Object.fromEntries(localTarballs.map((path) => [localArtifactPolicyKey(consumer, path), true])),
          'tree-sitter': true,
        },
      } : {}),
    }));
    const needsLocalTypeScript = !existsSync(rootTypeScript);
    npm(['install', ...(item.scripts ? [] : ['--ignore-scripts']), ...localTarballs,
      ...(item.extra ?? []), ...(needsLocalTypeScript ? ['typescript@6.0.3'] : [])], consumer, 300_000);
    // The installed bytes are the packed bytes.
    const installedLock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'));
    for (const [index, name] of item.install.entries()) {
      const integrity = `sha512-${createHash('sha512').update(await readFile(localTarballs[index])).digest('base64')}`;
      if (installedLock.packages?.[`node_modules/${name}`]?.integrity !== integrity) {
        throw new Error(`${name}: installed integrity differs from its packed archive.`);
      }
    }
    const expectedVersions = {
      ...(item.name === 'tree-sitter-coral' ? {} : { '@graph-ir/core': graphIrVersion }),
      ...(item.expectedVersions ?? {}),
    };
    if (Object.keys(expectedVersions).length) {
      assertInstalledVersions(
        consumer,
        expectedVersions,
        new Set(),
      );
    }
    if (item.name !== 'tree-sitter-coral') {
      if (registryCore) {
        const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'));
        const core = validateRegistryCoreIdentity(lock);
        if (core.resolved !== registryCore.resolved || core?.integrity !== registryCore.integrity) {
          throw new Error('Consumer Core registry identity differs from the source lockfile.');
        }
      }
      const installedCore = JSON.parse(await readFile(
        join(consumer, 'node_modules/@graph-ir/core/package.json'),
        'utf8',
      ));
      if (installedCore.version !== artifactGeneration.core) {
        throw new Error(`Consumer resolved root core ${installedCore.version}, not ${artifactGeneration.core}.`);
      }
      const incorrectPins = [];
      for (const packageName of item.install.filter((name) => name.startsWith('@coral-viz/'))) {
        const manifest = JSON.parse(await readFile(
          join(consumer, 'node_modules', ...packageName.split('/'), 'package.json'),
          'utf8',
        ));
        if (manifest.dependencies?.['@graph-ir/core'] !== artifactGeneration.core) incorrectPins.push(packageName);
      }
      if (incorrectPins.length) {
        throw new Error(`Dependency mismatch: ${incorrectPins.join(', ')} must pin core ${artifactGeneration.core}.`);
      }
    }
    if (item.scripts) {
      // npm 12.0.2 normalizes a local tarball's trusted identity differently
      // from npm-package-arg on Windows, so no allowScripts key can match it.
      // Compile that reviewed artifact directly; registry installs still use the
      // package lifecycle and its normal name-based approval.
      run(process.execPath, [nodeGyp, 'rebuild'],
        join(consumer, 'node_modules/tree-sitter-coral'), 300_000);
    }
    if (item.canonicalReact) {
      const compiled = ts.transpileModule(reactDocSource, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: 'canonical-react.tsx',
      }).outputText;
      await writeFile(join(consumer, 'canonical-react.mjs'), compiled);
      await writeFile(join(consumer, 'css-loader.mjs'), `export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', shortCircuit: true, source: 'export default {};' };
  }
  return nextLoad(url, context);
}
`);
    }
    const typescriptSource = item.typescriptSourcePath
      ? await readFile(join(root, item.typescriptSourcePath), 'utf8')
      : undefined;
    const runtime = typescriptSource
      ? ts.transpileModule(typescriptSource, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
          fileName: item.typescriptSourcePath,
        }).outputText
      : item.runtimeSourcePath
        ? await readFile(join(root, item.runtimeSourcePath), 'utf8')
        : item.runtime;
    await writeFile(join(consumer, 'smoke.mjs'), runtime);
    for (const file of item.supportFiles ?? []) await copyFile(join(root, file), join(consumer, basename(file)));
    run(
      process.execPath,
      [...(item.canonicalReact ? ['--loader', './css-loader.mjs'] : []), 'smoke.mjs'],
      consumer,
      item.timeout,
      item.env,
    );
    await item.afterRuntime?.(consumer);
    const typeFile = item.canonicalReact ? 'smoke.tsx' : 'smoke.ts';
    await writeFile(
      join(consumer, typeFile),
      typescriptSource ? `${typescriptSource}\n${item.extraTypes ?? ''}` : item.types,
    );
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, skipLibCheck: true, module: 'NodeNext',
        moduleResolution: 'NodeNext', target: 'ES2022',
        ...(item.canonicalReact ? { jsx: 'react-jsx' } : {}),
        ...(item.compilerOptions ?? {}),
      },
      include: [typeFile],
    }));
    const compiler = needsLocalTypeScript
      ? resolve(consumer, 'node_modules/typescript/bin/tsc')
      : rootTypeScript;
    run(process.execPath, [compiler, '-p', 'tsconfig.json'], consumer);
  }
} finally {
  await Promise.all(temporaryConsumers.map((directory) =>
    rm(directory, { recursive: true, force: true })));
  await rm(staging, { recursive: true, force: true });
}

console.log(`Isolated blank-consumer runtime, type, and artifact checks passed on ${actualPlatform}.`);
