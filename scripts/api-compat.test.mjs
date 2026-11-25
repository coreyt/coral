import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import test from 'node:test';

import {
  assertManifestCompatibility,
  assertArtifactContent,
  assertManifestTargets,
  isPathWithin,
  compareDeclarationEntries,
  consumerWorkspaces,
  declarationGraphsUnchanged,
  declarationPairUnchanged,
  exportedTypeEntries,
  publishedRuntimeTargets,
  readSafeTarball,
  selectConsumerCases,
  selectNamedCases,
  standaloneManifestEntries,
} from './api-compat-lib.mjs';
import {
  APPROVED_GRAPH_IR_DELTAS,
  assertStableRuntimeSymbols,
  closeTransitionFindings,
  deriveApprovedGraphIrDeclaration,
  deriveTransitionObservations,
  reconcileTransitionLedger,
  rewriteDeclarationSpecifiers,
  transitionFindingId,
  transitionSubsetKey,
  validateTransitionLedgerShape,
} from './api-compat-transition.mjs';
import { API_BASELINE_PACKAGES, API_BASELINE_VERSION, API_COMPAT_BASELINE_CASES } from './api-baseline.mjs';

test('the published compatibility baseline is released 0.2.8 (Q-11)', () => {
  assert.equal(API_BASELINE_VERSION, '0.2.8');
  assert.deepEqual(API_BASELINE_PACKAGES.map(({ name }) => name),
    ['@coral-viz/language', '@coral-viz/render', '@coral-viz/viz', '@coral-viz/mcp-server', 'tree-sitter-coral']);
  assert.deepEqual(API_COMPAT_BASELINE_CASES,
    ['language', 'render', 'viz', 'viz-graphir-migration', 'mcp-server', 'tree-sitter-coral']);
});

const publicNames = new Set([
  '@coral-viz/language',
  '@coral-viz/render',
  '@coral-viz/viz',
  '@coral-viz/mcp-server',
  'tree-sitter-coral',
]);

const commonArtifactEntries = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
];

test('artifact documentation requirements preserve 0.2.4 and protect 0.2.5', () => {
  for (const name of ['@coral-viz/language', '@coral-viz/render']) {
    assert.doesNotThrow(() => assertArtifactContent(commonArtifactEntries, name, '0.2.4'));
  }

  const candidateEntries = new Map([
    ['@coral-viz/language', [
      'package/SPEC.md',
      'package/spec/grammar.ebnf',
      'package/spec/diagnostics.json',
      'package/spec/conformance/manifest.json',
    ]],
    ['@coral-viz/render', [
      'package/third_party/fonts/handwritten-OFL-1.1.txt',
      'package/third_party/fonts/mono-OFL-1.1.txt',
      'package/third_party/fonts/sans-OFL-1.1.txt',
      'package/third_party/fonts/serif-OFL-1.1.txt',
    ]],
  ]);
  for (const [name, additions] of candidateEntries) {
    const complete = [...commonArtifactEntries, ...additions];
    assert.doesNotThrow(() => assertArtifactContent(complete, name, '0.2.5'));
    for (const omitted of additions) {
      assert.throws(
        () => assertArtifactContent(
          complete.filter((entry) => entry !== omitted), name, '0.2.5',
        ),
        new RegExp(omitted.replaceAll('.', '\\.').replaceAll('/', '\\/')),
      );
    }
  }
});

const baselineManifest = {
  name: '@coral-viz/viz',
  version: '0.2.4',
  main: 'dist/index.js',
  types: 'dist/index.d.ts',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './layout': { types: './dist/layout.d.ts', import: './dist/layout.js' },
  },
  dependencies: {
    '@graph-ir/core': '0.2.0',
    '@coral-viz/render': '0.2.4',
  },
  peerDependencies: {
    react: '^18.3.0 || ^19.0.0',
    'react-dom': '^18.3.0 || ^19.0.0',
  },
};

const approvedGraphIrChange = new Map([
  ['@coral-viz/viz:dependencies:@graph-ir/core', { from: '0.2.0', to: '0.2.1' }],
]);

function currentManifest() {
  return {
    ...structuredClone(baselineManifest),
    version: '0.2.5',
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    exports: {
      '.': { types: './lib/index.d.ts', import: './lib/index.js' },
      './layout': { types: './lib/layout.d.ts', import: './lib/layout.js' },
      './new': { types: './lib/new.d.ts', import: './lib/new.js' },
    },
    dependencies: {
      '@graph-ir/core': '0.2.1',
      '@coral-viz/render': '0.2.5',
    },
  };
}

test('manifest gate accepts a candidate bump, relocated targets, and additive entries', () => {
  assert.doesNotThrow(() => assertManifestCompatibility(
    baselineManifest, currentManifest(), '0.2.5', publicNames,
    approvedGraphIrChange,
  ));
});

test('manifest gate accepts an updated required dependency without changing its class', () => {
  const baseline = currentManifest();
  const current = currentManifest();
  baseline.dependencies.zod = '4.5.4';
  current.dependencies.zod = '4.6.5';
  assert.doesNotThrow(() => assertManifestCompatibility(
    baseline, current, '0.2.5', publicNames,
    new Map([['@coral-viz/viz:dependencies:zod', { from: '4.5.4', to: '4.6.5' }]]),
  ));
  for (const unapproved of ['4.6.1', '5.0.0', '*', 'file:../zod']) {
    current.dependencies.zod = unapproved;
    assert.throws(
      () => assertManifestCompatibility(
        baseline, current, '0.2.5', publicNames,
        new Map([['@coral-viz/viz:dependencies:zod', { from: '4.5.4', to: '4.6.5' }]]),
      ),
      /dependencies\.zod must remain 4\.5\.4/,
    );
  }
});

test('declaration graph equality requires every published declaration byte-for-byte', () => {
  const entry = (name, value) => ({ type: '0', name, data: Buffer.from(value) });
  const baseline = [entry('package/index.d.ts', 'export * from "./hidden.js"'), entry('package/hidden.d.ts', 'export type Value = "a"')];
  assert.equal(declarationGraphsUnchanged(baseline, [...baseline, entry('package/additive.d.ts', 'export type Added = true')]), true);
  assert.equal(declarationGraphsUnchanged(baseline, [baseline[0], entry('package/hidden.d.ts', 'export type Value = "b"')]), false);
  assert.equal(declarationGraphsUnchanged(baseline, [baseline[0]]), false);
});

test('unchanged declaration graph bypass applies only to an unchanged public target path', () => {
  assert.equal(declarationPairUnchanged(true, 'package/dist/index.d.ts', 'package/dist/index.d.ts'), true);
  assert.equal(declarationPairUnchanged(true, 'package/dist/index.d.ts', 'package/lib/index.d.ts'), false);
  assert.equal(declarationPairUnchanged(false, 'package/dist/index.d.ts', 'package/dist/index.d.ts'), false);
});

test('relocated incompatible public declaration is compared even when old files remain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-relocated-test-'));
  try {
    const baselinePath = join(directory, 'dist', 'index.d.ts');
    const currentPath = join(directory, 'lib', 'index.d.ts');
    await mkdir(join(directory, 'dist'), { recursive: true });
    await mkdir(join(directory, 'lib'), { recursive: true });
    await writeFile(baselinePath, 'export interface Value { required: string }');
    await writeFile(currentPath, 'export interface Value {}');
    const declarationGraphUnchanged = declarationPairUnchanged(
      true, 'package/dist/index.d.ts', 'package/lib/index.d.ts',
    );
    assert.match(compareDeclarationEntries([{
      label: 'relocated fixture', baselinePath, currentPath, declarationGraphUnchanged,
    }]).join('\n'), /required/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('byte-identical declaration graphs accept unchanged unique-symbol contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-symbol-test-'));
  try {
    const baselinePath = join(directory, 'baseline.d.ts');
    const currentPath = join(directory, 'current.d.ts');
    const declaration = 'export declare const KEY: unique symbol; export interface Value { [KEY]?: string }';
    await writeFile(baselinePath, declaration);
    await writeFile(currentPath, declaration);
    assert.deepEqual(compareDeclarationEntries([{
      label: 'symbol fixture', baselinePath, currentPath, declarationGraphUnchanged: true,
    }]), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration entry selection ignores an additive runtime-only export', () => {
  const current = currentManifest();
  current.exports['./browser-only'] = { browser: './lib/browser.js' };
  const selected = exportedTypeEntries(current, [], new Set(['.', './layout']));
  assert.deepEqual(selected.map(({ subpath }) => subpath), ['.', './layout']);
});

test('runtime target selection cannot let an additive condition mask a published condition', () => {
  const baseline = { '.': { types: './index.d.ts', import: './old.js' } };
  const current = { '.': { node: './good.js', types: './index.d.ts', import: './bad.js' } };
  assert.deepEqual(publishedRuntimeTargets(baseline, current), ['./bad.js']);
});

test('standalone main and types cannot be masked by valid exports targets', () => {
  const baseline = {
    main: './old-main.js', types: './old-main.d.ts',
    exports: { '.': { import: './export.js', types: './export.d.ts' } },
  };
  const current = {
    main: './bad-main.js', types: './bad-main.d.ts',
    exports: { '.': { import: './export.js', types: './export.d.ts' } },
  };
  assert.deepEqual(standaloneManifestEntries(baseline, current), {
    runtime: ['./bad-main.js'],
    declarations: [{ baseline: './old-main.d.ts', current: './bad-main.d.ts' }],
  });
});

for (const [name, mutate, message] of [
  ['removed export', (value) => { delete value.exports['./layout']; }, 'exports./layout'],
  ['blocked export target', (value) => { value.exports['./layout'].import = null; }, 'exports./layout.import'],
  ['blocked main target', (value) => { value.main = null; }, 'main'],
  ['blocked types target', (value) => { value.types = false; }, 'types'],
  ['demoted dependency', (value) => {
    delete value.dependencies['@coral-viz/render'];
    value.optionalDependencies = { '@coral-viz/render': '0.2.5' };
  }, 'dependencies.@coral-viz/render'],
  ['GraphIR drift', (value) => { value.dependencies['@graph-ir/core'] = '0.2.2'; }, '@graph-ir/core'],
  ['React narrowing', (value) => { value.peerDependencies.react = '^19.0.0'; }, 'peerDependencies.react'],
  ['wrong candidate version', (value) => { value.version = '0.2.4'; }, 'version'],
]) {
  test(`manifest gate rejects ${name}`, () => {
    const current = currentManifest();
    mutate(current);
    assert.throws(
      () => assertManifestCompatibility(
        baselineManifest, current, '0.2.5', publicNames, approvedGraphIrChange,
      ),
      new RegExp(message.replaceAll('.', '\\.')),
    );
  });
}

test('manifest gate rejects making a published optional peer required', () => {
  const baseline = structuredClone(baselineManifest);
  const current = currentManifest();
  baseline.peerDependencies['tree-sitter'] = '0.25.1';
  baseline.peerDependenciesMeta = { 'tree-sitter': { optional: true } };
  current.peerDependencies['tree-sitter'] = '0.25.1';
  current.peerDependenciesMeta = { 'tree-sitter': {} };
  assert.throws(
    () => assertManifestCompatibility(
      baseline, current, '0.2.5', publicNames, approvedGraphIrChange,
    ),
    /peerDependenciesMeta\.tree-sitter\.optional/,
  );
});

test('consumer selector is closed and rejects unknown, empty or duplicate selections', () => {
  const cases = [{ name: 'language' }, { name: 'viz-react-18' }];
  assert.deepEqual(selectNamedCases(cases, 'viz-react-18').map(({ name }) => name), ['viz-react-18']);
  assert.equal(selectNamedCases(cases, undefined), cases);
  assert.throws(() => selectNamedCases(cases, 'missing'), /Unknown consumer case: missing/);
  for (const empty of ['', ' , ']) assert.throws(() => selectNamedCases(cases, empty), /select at least one/);
  assert.throws(() => selectNamedCases(cases, 'language, viz-react-18,language'), /Duplicate consumer case: language/);
});

test('explicit consumer cases are obligations for their artifact generation', () => {
  const cases = [
    { name: 'language' },
    { name: 'browser', requiresBrowser: true },
    { name: 'viz-0.2.4-compat', artifactVersions: ['0.2.4'] },
    { name: 'viz-graphir-migration', artifactVersions: ['0.2.8'], coreVersions: ['0.2.3'] },
  ];
  const current = { artifactVersion: '0.2.8', browserPublished: true, coreVersion: '0.2.3' };
  const baseline = { artifactVersion: '0.2.4', browserPublished: false, coreVersion: '0.2.0' };
  const names = (selected) => selected.map(({ name }) => name);
  // Unset keeps the developer default: every case that applies, nothing else.
  assert.deepEqual(names(selectConsumerCases(cases, undefined, current)),
    ['language', 'browser', 'viz-graphir-migration']);
  assert.deepEqual(names(selectConsumerCases(cases, undefined, baseline)), ['language', 'viz-0.2.4-compat']);
  assert.deepEqual(names(selectConsumerCases(cases, 'viz-0.2.4-compat,language', baseline)),
    ['viz-0.2.4-compat', 'language']);
  // A named case is never silently dropped by generation, browser or Core.
  assert.throws(() => selectConsumerCases(cases, 'language,viz-0.2.4-compat', current),
    /do not apply to Coral 0\.2\.8 with Core 0\.2\.3: viz-0\.2\.4-compat$/);
  assert.throws(() => selectConsumerCases(cases, 'browser', baseline), /without @coral-viz\/browser: browser$/);
  assert.throws(() => selectConsumerCases(cases, 'viz-graphir-migration', { ...current, coreVersion: '0.2.2' }),
    /viz-graphir-migration$/);
  assert.throws(() => selectConsumerCases(cases, '', current), /select at least one/);
  assert.throws(() => selectConsumerCases(cases, 'language,language', current), /Duplicate/);
  assert.throws(() => selectConsumerCases([cases[2]], undefined, current), /No consumer cases apply/);
});

function tarHeader(name, type = '0', link = '') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write('00000000000\0', 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write(link, 157, 100, 'utf8');
  header.write('ustar\0', 257, 6, 'ascii');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

test('tar reader rejects traversal and link members before materialization', () => {
  for (const archive of [
    gzipSync(Buffer.concat([tarHeader('package/../../escape'), Buffer.alloc(1024)])),
    gzipSync(Buffer.concat([tarHeader('package/link', '2', '../../escape'), Buffer.alloc(1024)])),
    gzipSync(Buffer.concat([tarHeader('package/hard', '1', 'package/package.json'), Buffer.alloc(1024)])),
  ]) {
    assert.throws(() => readSafeTarball(archive), /Unsafe tar/);
  }
});

test('artifact containment accepts Windows children but rejects escapes and other drives', () => {
  assert.equal(isPathWithin('C:\\pkg', 'c:\\PKG\\dist\\index.js', win32), true);
  for (const target of ['C:\\other\\index.js', 'C:\\pkg-sibling\\index.js', 'D:\\pkg\\index.js', '\\\\server\\share\\index.js']) {
    assert.equal(isPathWithin('C:\\pkg', target, win32), false, target);
  }
});

test('manifest target gate accepts contained files and rejects escapes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-target-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist', 'index.js'), 'export {};');
  await assertManifestTargets({ exports: { '.': './dist/index.js' } }, directory);
  await assert.rejects(() => assertManifestTargets({ main: '../escape.js' }, directory), /Unsafe manifest target/);
});

test('manifest target gate rejects a directory in place of a runtime file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-target-test-'));
  try {
    await mkdir(join(directory, 'dist'));
    await assert.rejects(
      () => assertManifestTargets({ exports: { '.': { import: './dist' } } }, directory),
      /regular file/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function declarationResult(baseline, current) {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-test-'));
  try {
    const baselinePath = join(directory, 'baseline.d.ts');
    const currentPath = join(directory, 'current.d.ts');
    await writeFile(baselinePath, baseline);
    await writeFile(currentPath, current);
    return compareDeclarationEntries([{ label: 'fixture', baselinePath, currentPath }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('declaration gate accepts additive exports and optional properties', async () => {
  const errors = await declarationResult(
    `export interface Options { mode?: 'a' | 'b' }\nexport declare function run(value: Options): string;`,
    `export interface Options { mode?: 'a' | 'b'; added?: boolean }\nexport declare function run(value: Options): string;\nexport declare const added: true;`,
  );
  assert.deepEqual(errors, []);
});

test('declaration gate accepts unchanged generic declarations from separate graphs', async () => {
  const declaration = `export interface Result<T extends { id: string } = { id: string }> { callback: (values: T[]) => void }`;
  assert.deepEqual(await declarationResult(declaration, declaration), []);
});

test('declaration gate accepts unchanged generic methods from separate graphs', async () => {
  const declaration = `export interface Mapper { map<T>(value: T): T }`;
  assert.deepEqual(await declarationResult(declaration, declaration), []);
});

test('declaration gate accepts an unchanged generic heritage graph copied under private aliases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-generic-copy-test-'));
  try {
    const baselineDirectory = join(directory, 'baseline');
    const currentDirectory = join(directory, 'current');
    await mkdir(baselineDirectory);
    await mkdir(currentDirectory);
    const declaration = `import type { Base } from './hidden.js'; export interface Box<T> extends Base<T> { callback: (value: T) => string }`;
    const hidden = `export interface Base<T> { values: T[] }`;
    await writeFile(join(baselineDirectory, 'index.d.ts'), declaration);
    await writeFile(join(currentDirectory, 'index.d.ts'), declaration);
    await writeFile(join(baselineDirectory, 'hidden.d.ts'), hidden);
    await writeFile(join(currentDirectory, 'hidden.d.ts'), hidden);
    assert.deepEqual(compareDeclarationEntries([{
      label: 'generic copy fixture',
      baselinePath: join(baselineDirectory, 'index.d.ts'),
      currentPath: join(currentDirectory, 'index.d.ts'),
    }], {
      graphIsolation: {
        stageRoot: directory,
        baselineRoots: [baselineDirectory],
        candidateRoots: [currentDirectory],
        declarationPairs: [{
          baselineRoot: baselineDirectory,
          candidateRoot: currentDirectory,
        }],
      },
    }), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration gate does not equate identical nominal types from different external modules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-generic-identity-test-'));
  try {
    const baselineDirectory = join(directory, 'left/packages/coral');
    const currentDirectory = join(directory, 'right/packages/coral');
    const baselineExternal = join(directory, 'left/node_modules/@fixture/external');
    const currentExternal = join(directory, 'right/node_modules/@fixture/external');
    for (const path of [baselineDirectory, currentDirectory, baselineExternal, currentExternal]) {
      await mkdir(path, { recursive: true });
    }
    const external = `declare const BRAND: unique symbol; export interface External<T> { readonly [BRAND]: T }`;
    const declaration = `import type { External } from '@fixture/external'; export interface Box<T> extends External<T> {}`;
    for (const path of [baselineExternal, currentExternal]) {
      await writeFile(join(path, 'package.json'), JSON.stringify({ name: '@fixture/external', types: 'index.d.ts' }));
      await writeFile(join(path, 'index.d.ts'), external);
    }
    const baselinePath = join(baselineDirectory, 'index.d.ts');
    const currentPath = join(currentDirectory, 'index.d.ts');
    await writeFile(baselinePath, declaration);
    await writeFile(currentPath, declaration);
    const errors = compareDeclarationEntries([{
      label: 'external identity fixture', baselinePath, currentPath,
    }], {
      graphIsolation: {
        stageRoot: join(directory, 'synthetic-stage'),
        baselineRoots: [baselineDirectory],
        candidateRoots: [currentDirectory],
      },
    });
    assert.match(errors.join('\n'), /Box/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('generic equivalence retains the exact paired package and module identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-generic-pair-test-'));
  try {
    const baselineRoot = join(directory, 'baseline');
    const candidateRoot = join(directory, 'candidate');
    const baselinePackage = join(baselineRoot, 'pkg-a');
    const candidatePackage = join(candidateRoot, 'pkg-a');
    const baselineTarget = join(baselineRoot, 'shared');
    const candidateTarget = join(candidateRoot, 'shared');
    const expectedCandidateTarget = join(candidateRoot, 'expected-shared');
    for (const path of [
      baselinePackage, candidatePackage, baselineTarget, candidateTarget, expectedCandidateTarget,
    ]) await mkdir(path, { recursive: true });
    const declaration = `import type { External } from '../shared/target.js'; export interface Box<T> extends External<T> {}`;
    const nominal = `declare const BRAND: unique symbol; export interface External<T> { readonly [BRAND]: T }`;
    await writeFile(join(baselinePackage, 'index.d.ts'), declaration);
    await writeFile(join(candidatePackage, 'index.d.ts'), declaration);
    await writeFile(join(baselineTarget, 'target.d.ts'), nominal);
    await writeFile(join(candidateTarget, 'target.d.ts'), nominal);
    await writeFile(join(expectedCandidateTarget, 'target.d.ts'), nominal);
    const errors = compareDeclarationEntries([{
      label: 'paired module fixture',
      baselinePath: join(baselinePackage, 'index.d.ts'),
      currentPath: join(candidatePackage, 'index.d.ts'),
    }], {
      graphIsolation: {
        stageRoot: directory,
        baselineRoots: [baselineRoot],
        candidateRoots: [candidateRoot],
        declarationPairs: [
          { baselineRoot: baselinePackage, candidateRoot: candidatePackage },
          { baselineRoot: baselineTarget, candidateRoot: expectedCandidateTarget },
        ],
      },
    });
    assert.match(errors.join('\n'), /Box/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration graph isolation rejects baseline and candidate cross-graph edges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-isolation-test-'));
  try {
    const baselineDirectory = join(directory, 'baseline');
    const currentDirectory = join(directory, 'candidate');
    await mkdir(baselineDirectory);
    await mkdir(currentDirectory);
    await writeFile(join(baselineDirectory, 'hidden.d.ts'), `export interface Hidden { value: string }`);
    await writeFile(join(currentDirectory, 'hidden.d.ts'), `export interface Hidden { value: string }`);
    const options = {
      graphIsolation: {
        stageRoot: directory,
        baselineRoots: [baselineDirectory],
        candidateRoots: [currentDirectory],
      },
    };
    const baselinePath = join(baselineDirectory, 'index.d.ts');
    const currentPath = join(currentDirectory, 'index.d.ts');
    await writeFile(baselinePath, `export type Value = import('../candidate/hidden.js').Hidden;`);
    await writeFile(currentPath, `export type Value = import('./hidden.js').Hidden;`);
    assert.throws(
      () => compareDeclarationEntries([{ label: 'baseline escape', baselinePath, currentPath }], options),
      /baseline .* resolves .* to/,
    );
    await writeFile(baselinePath, `export type Value = import('./hidden.js').Hidden;`);
    await writeFile(currentPath, `export type Value = import('../baseline/hidden.js').Hidden;`);
    assert.throws(
      () => compareDeclarationEntries([{ label: 'candidate escape', baselinePath, currentPath }], options),
      /candidate .* resolves .* to/,
    );
    await writeFile(
      baselinePath,
      `/// <reference path="../candidate/hidden.d.ts" />\nexport interface Value { value: string }`,
    );
    await writeFile(currentPath, `export interface Value { value: string }`);
    assert.throws(
      () => compareDeclarationEntries([{ label: 'reference escape', baselinePath, currentPath }], options),
      /reference path=.* to/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration gate accepts only the reviewed stable unique-symbol paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-stable-symbol-test-'));
  try {
    const baselinePath = join(directory, 'baseline.d.ts');
    const currentPath = join(directory, 'current.d.ts');
    const declaration = `export declare const KEY: unique symbol; export interface Metadata { value: string } export type Value = { [KEY]?: Metadata }`;
    await writeFile(baselinePath, declaration);
    await writeFile(currentPath, declaration);
    const entries = [{
      label: 'stable symbol fixture', packageName: '@fixture/stable', subpath: '.', baselinePath, currentPath,
    }];
    const stableSymbols = [{
      packageName: '@fixture/stable', subpath: '.', valueExport: 'KEY', typeExport: 'Value', runtimeKey: 'fixture/key',
    }];
    assert.deepEqual(compareDeclarationEntries(entries, { stableSymbols }), []);
    await writeFile(currentPath, declaration.replace('[KEY]?: Metadata', '[KEY]: { value: number }'));
    assert.match(compareDeclarationEntries(entries, { stableSymbols }).join('\n'), /optionality|type changed/);
    await writeFile(currentPath, declaration.replace('KEY: unique symbol', 'KEY: symbol'));
    assert.match(compareDeclarationEntries(entries, { stableSymbols }).join('\n'), /KEY/);
    await writeFile(currentPath, declaration.replaceAll('KEY', 'OTHER'));
    assert.match(compareDeclarationEntries(entries, { stableSymbols }).join('\n'), /KEY/);
    assert.throws(
      () => assertStableRuntimeSymbols(
        { KEY: Symbol.for('fixture/key') }, { KEY: Symbol.for('fixture/wrong') }, stableSymbols,
      ),
      /runtime identity/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('GraphIR transition derivation fingerprints and applies only approved declaration edits', () => {
  const baseline = `export interface GraphIR {\n    version: string;\n}\nexport interface GraphEdge {\n${'    /** Intermediate points for edge routing */\n    routingPoints?: Position[];'}\n}\nexport interface Port {}\nexport interface Position { x: number; y: number }\nexport interface LayoutOptions {\n${'    /** Additional algorithm-specific options */\n    algorithmOptions?: Record<string, string | number | boolean>;'}\n}`;
  const candidate = `export interface GraphIR {\n    version: '2.0.0';\n}\nexport interface GraphEdge {\n    routeIntent?: RouteIntent;\n}\n${`export type RouteAnchor = {
    kind: 'source';
} | {
    kind: 'target';
} | {
    kind: 'node';
    nodeId: string;
} | {
    kind: 'port';
    nodeId: string;
    portId: string;
};
export type WaypointPlacement = {
    kind: 'absolute';
    position: Position;
} | {
    kind: 'relative';
    anchor: RouteAnchor;
    offset: Position;
};
export interface RouteWaypoint {
    id: string;
    placement: WaypointPlacement;
}
export interface RouteIntent {
    waypoints: RouteWaypoint[];
}`}\nexport interface LayoutOptions {}`;
  const derived = deriveApprovedGraphIrDeclaration(baseline, candidate);
  assert.equal(derived.edits.length, 4);
  assert.match(derived.source, /version: '2\.0\.0'/);
  assert.match(derived.source, /routeIntent\?: RouteIntent/);
  assert.doesNotMatch(derived.source, /routingPoints|algorithmOptions/);
  assert.throws(
    () => deriveApprovedGraphIrDeclaration(baseline.replace('version: string', 'version: unknown'), candidate),
    /fingerprint mismatch/,
  );
});

test('declaration alias rewriting changes only module specifier literals', () => {
  const source = `// @coral-viz/render remains in prose\nimport type { A } from '@coral-viz/render';\nexport type B = import('@graph-ir/core').GraphIR;`;
  assert.equal(rewriteDeclarationSpecifiers(source, [
    ['@coral-viz/', '@coral-viz-baseline/'],
    ['@graph-ir/core', '@graph-ir-baseline/core'],
  ]), `// @coral-viz/render remains in prose\nimport type { A } from '@coral-viz-baseline/render';\nexport type B = import('@graph-ir-baseline/core').GraphIR;`);
});

test('transition observations require one unique minimal cause and exact ledger causes', () => {
  const finding = {
    packageName: '@fixture/pkg', subpath: '.', exportName: 'Value', meaning: 'type',
    contractPath: 'property.graph', direction: 'both', rule: 'property.type', label: 'fixture', message: 'changed',
  };
  const id = transitionFindingId(finding);
  const findingsBySubset = new Map();
  for (let mask = 0; mask < 8; mask += 1) {
    const deltas = APPROVED_GRAPH_IR_DELTAS.filter((_, index) => mask & (1 << index));
    findingsBySubset.set(
      transitionSubsetKey(deltas),
      deltas.includes('graphir.version') ? [] : [finding],
    );
  }
  const observations = deriveTransitionObservations([finding], findingsBySubset);
  assert.deepEqual(observations[0].causes, ['graphir.version']);
  const entry = {
    ...observations[0], fixtures: ['scripts/api-compat.test.mjs'],
    note: 'docs/embed/reference/graphir-migration.md#graphir-1-to-2',
  };
  const ledger = { schema: 'coral.graphir-transition-ledger/v1', release: '0.2.5', entries: [entry] };
  assert.deepEqual(reconcileTransitionLedger(observations, ledger), []);
  assert.match(reconcileTransitionLedger(observations, {
    ...ledger,
    entries: [{ ...entry, causes: ['graph-edge.route-intent'] }],
  }).join('\n'), /wrong cause/);
  assert.match(reconcileTransitionLedger(observations, {
    ...ledger,
    entries: [],
  }).join('\n'), /is missing/);
  assert.match(reconcileTransitionLedger([], ledger).join('\n'), /stale entry/);
  assert.throws(
    () => validateTransitionLedgerShape({ ...ledger, generatedAt: 'unstable' }),
    /unknown field/,
  );
  assert.throws(
    () => validateTransitionLedgerShape({
      ...ledger,
      entries: [{ ...entry, id: 'ffffffffffffffffffffffff' }, entry],
    }),
    /unique sorted IDs/,
  );
  const ambiguous = new Map(findingsBySubset);
  for (const delta of APPROVED_GRAPH_IR_DELTAS) ambiguous.set(transitionSubsetKey([delta]), []);
  assert.throws(() => deriveTransitionObservations([finding], ambiguous), /ambiguous/);
  const unrelated = { ...finding, exportName: 'Unrelated', message: 'adjacent drift' };
  const withUnrelated = new Map([...findingsBySubset].map(([key, findings]) => [
    key, [...findings, unrelated],
  ]));
  assert.throws(
    () => closeTransitionFindings([finding, unrelated], withUnrelated),
    /adjacent drift/,
  );
  assert.equal(id, observations[0].id);
});

for (const [name, baseline, current, expected] of [
  ['removed type-only export', `export interface Options { ok?: boolean }`, '', 'Options'],
  ['removed property', `export interface Options { ok?: boolean }`, `export interface Options {}`, 'ok'],
  ['added required property', `export interface Options { ok?: boolean }`, `export interface Options { ok?: boolean; added: string }`, 'Options'],
  ['new required property', `export interface Options { ok?: boolean }`, `export interface Options { ok?: boolean; required: string }`, 'Options'],
  ['readonly drift', `export interface Options { value: string }`, `export interface Options { readonly value: string }`, 'value'],
  ['removed index signature', `export interface Options { [key: string]: unknown }`, `export interface Options {}`, 'index'],
  ['literal widening', `export declare const VERSION: '1.0'`, `export declare const VERSION: string`, 'VERSION'],
  ['narrowed union', `export type Mode = 'a' | 'b'`, `export type Mode = 'a'`, 'Mode'],
  ['nested callback variance', `export interface Options { nested: { callback: (value: 'a' | 'b') => void } }`, `export interface Options { nested: { callback: (value: 'a') => void } }`, 'Options'],
  ['method parameter narrowing', `export interface Options { run(value: 'a' | 'b'): void }`, `export interface Options { run(value: 'a'): void }`, 'run'],
  ['mapped readonly drift', `export type Options = { value: string }`, `export type Options = Readonly<{ value: string }>`, 'readonly'],
  ['getter readonly drift', `export interface Options { value: string }`, `export interface Options { get value(): string }`, 'readonly'],
  ['composed mapped readonly drift', `export type Options = { value: string }`, `export type Options = Pick<Readonly<{ value: string }>, 'value'>`, 'readonly'],
  ['removed overload', `export declare function run(value: string): string;\nexport declare function run(value: number): number;`, `export declare function run(value: string): string;`, 'run'],
  ['narrowed generic constraint', `export interface Box<T extends string> { value: T }`, `export interface Box<T extends 'a'> { value: T }`, 'Box'],
  ['changed generic default', `export interface Box<T = string> { value: T }`, `export interface Box<T = number> { value: T }`, 'default'],
  ['generic type-query reference drift', `declare const KEY: 'a' | 'b'; export type Box<T = typeof KEY> = T`, `declare const KEY: 'a'; export type Box<T = typeof KEY> = T`, 'Box'],
  ['unresolved declaration name', `export type Broken = Missing`, `export type Broken = Missing`, 'Missing'],
  ['mixed value/type drift', `export declare class Token { value: string }`, `export declare class Token { value: 'fixed'; constructor(value: 'fixed') }`, 'Token'],
]) {
  test(`declaration gate rejects ${name}`, async () => {
    const errors = await declarationResult(baseline, current);
    assert.match(errors.join('\n'), new RegExp(expected));
  });
}

test('declaration gate rejects equal rendered alias names with different targets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-alias-test-'));
  try {
    const baselinePath = join(directory, 'baseline.d.ts');
    const currentPath = join(directory, 'current.d.ts');
    await writeFile(join(directory, 'baseline-hidden.d.ts'), `export interface Hidden { value: 'a' | 'b' }`);
    await writeFile(join(directory, 'current-hidden.d.ts'), `export interface Hidden { value: 'a' }`);
    await writeFile(baselinePath, `import type { Hidden } from './baseline-hidden.js'; export type Alias = Hidden;`);
    await writeFile(currentPath, `import type { Hidden } from './current-hidden.js'; export type Alias = Hidden;`);
    const errors = compareDeclarationEntries([{ label: 'alias fixture', baselinePath, currentPath }]);
    assert.match(errors.join('\n'), /Alias/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration gate rejects diagnostics in imported declaration files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-diagnostic-test-'));
  try {
    const baselinePath = join(directory, 'baseline.d.ts');
    const currentPath = join(directory, 'current.d.ts');
    await writeFile(join(directory, 'baseline-hidden.d.ts'), `export type Broken = Missing;`);
    await writeFile(join(directory, 'current-hidden.d.ts'), `export type Broken = Missing;`);
    await writeFile(baselinePath, `export type { Broken } from './baseline-hidden.js';`);
    await writeFile(currentPath, `export type { Broken } from './current-hidden.js';`);
    const errors = compareDeclarationEntries([{ label: 'diagnostic fixture', baselinePath, currentPath }]);
    assert.match(errors.join('\n'), /Missing/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration gate rejects generic import-type target drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-import-type-test-'));
  try {
    const baselineDirectory = join(directory, 'baseline');
    const currentDirectory = join(directory, 'current');
    await mkdir(baselineDirectory);
    await mkdir(currentDirectory);
    const baselinePath = join(baselineDirectory, 'index.d.ts');
    const currentPath = join(currentDirectory, 'index.d.ts');
    const declaration = `export type Box<T> = T extends import('./hidden.js').Hidden ? true : false;`;
    await writeFile(join(baselineDirectory, 'hidden.d.ts'), `export type Hidden = 'a' | 'b';`);
    await writeFile(join(currentDirectory, 'hidden.d.ts'), `export type Hidden = 'a';`);
    await writeFile(baselinePath, declaration);
    await writeFile(currentPath, declaration);
    const errors = compareDeclarationEntries([{ label: 'import type fixture', baselinePath, currentPath }]);
    assert.match(errors.join('\n'), /Box/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declaration gate rejects generic heritage target drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coral-api-compat-heritage-test-'));
  try {
    const baselineDirectory = join(directory, 'baseline');
    const currentDirectory = join(directory, 'current');
    await mkdir(baselineDirectory);
    await mkdir(currentDirectory);
    const baselinePath = join(baselineDirectory, 'index.d.ts');
    const currentPath = join(currentDirectory, 'index.d.ts');
    const declaration = `import type { Base } from './hidden.js'; export interface Box<T> extends Base<T> {}`;
    await writeFile(join(baselineDirectory, 'hidden.d.ts'), `export interface Base<T> { run(value: 'a' | 'b'): T }`);
    await writeFile(join(currentDirectory, 'hidden.d.ts'), `export interface Base<T> { run(value: 'a'): T }`);
    await writeFile(baselinePath, declaration);
    await writeFile(currentPath, declaration);
    const errors = compareDeclarationEntries([{ label: 'heritage fixture', baselinePath, currentPath }]);
    assert.match(errors.join('\n'), /Box|run/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('consumer artifact sets require the browser package unless scoped to API compatibility', () => {
  const published = ['@coral-viz/language', '@coral-viz/render', '@coral-viz/viz', '@coral-viz/mcp-server', 'tree-sitter-coral'];
  assert.deepEqual(consumerWorkspaces({}), [...published, '@coral-viz/browser']);
  assert.deepEqual(consumerWorkspaces({ CORAL_EXPECT_ARTIFACT_VERSION: '0.2.5' }), [...published, '@coral-viz/browser']);
  assert.deepEqual(consumerWorkspaces({ CORAL_ARTIFACT_SCOPE: 'api-compat' }), published);
  assert.throws(() => consumerWorkspaces({ CORAL_ARTIFACT_SCOPE: 'published' }), /Unknown CORAL_ARTIFACT_SCOPE/);
});
