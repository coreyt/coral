import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const RELEASE = '0.2.17';
const manifests = [
  'package.json',
  'packages/language/package.json',
  'packages/render/package.json',
  'packages/browser/package.json',
  'packages/viz/package.json',
  'packages/diagram-editor/package.json',
  'packages/mcp-server/package.json',
  'packages/tree-sitter-coral/package.json',
];
const internalPackages = new Set([
  '@coral-viz/language', '@coral-viz/render', '@coral-viz/browser', '@coral-viz/viz',
  '@coral-viz/diagram-editor', '@coral-viz/mcp-server', 'tree-sitter-coral',
]);

test('the complete workspace is an atomic 0.2.17 release candidate', async () => {
  for (const path of manifests) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(manifest.version, RELEASE, `${path} version`);
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (internalPackages.has(name)) assert.equal(range, RELEASE, `${path} ${field}.${name}`);
      }
    }
  }
  const server = await readFile('packages/mcp-server/src/server.ts', 'utf8');
  assert.match(server, /version:\s*["']0\.2\.17["']/);
  const browser = await readFile('packages/browser/src/version.ts', 'utf8');
  assert.match(browser, /version\s*=\s*["']0\.2\.17["']/);
  const guidance = await readFile('packages/diagram-editor/src/guidanceContent.ts', 'utf8');
  assert.match(guidance, /EXPECTED_RELEASE_VERSION\s*=\s*["']0\.2\.17["']/);
  const editorController = await readFile(
    'packages/diagram-editor/src/useEditorController.ts', 'utf8',
  );
  assert.match(editorController, /coral-welcome-seen:0\.2\.17/);

  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(lock.version, RELEASE, 'package-lock root version');
  for (const path of manifests) {
    const key = path === 'package.json' ? '' : path.replace('/package.json', '');
    const locked = lock.packages[key];
    assert.equal(locked?.version, RELEASE, `package-lock ${key || 'root'} version`);
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, range] of Object.entries(locked[field] ?? {})) {
        if (internalPackages.has(name)) assert.equal(range, RELEASE, `package-lock ${key || 'root'} ${field}.${name}`);
      }
    }
  }
});

// A consumer case gated to the previous release silently disappears from the
// candidate run. Every case introduced for 0.2.5's current API must still run
// against the 0.2.17 candidate; only explicitly historical variants may not.
test('current-API consumer cases still apply to the 0.2.17 candidate', async () => {
  const smoke = await readFile('scripts/consumer-smoke.mjs', 'utf8');
  const gates = [...smoke.matchAll(/artifactVersions:\s*\[([^\]]*)\]/g)]
    .map(match => [...match[1].matchAll(/'([^']+)'/g)].map(([, version]) => version));
  assert.ok(gates.length >= 4, 'expected version-gated consumer cases');
  for (const versions of gates) {
    if (versions.includes('0.2.5')) assert.ok(versions.includes(RELEASE), `gate [${versions}] skips ${RELEASE}`);
  }
  for (const name of ['viz', 'viz-graphir-migration']) {
    const block = smoke.slice(smoke.indexOf(`name: '${name}',`), smoke.indexOf(`name: '${name}',`) + 200);
    assert.match(block, new RegExp(`artifactVersions: \\[[^\\]]*'${RELEASE.replaceAll('.', '\\.')}'`), name);
  }
  const renderCase = smoke.slice(smoke.indexOf("name: 'render',"), smoke.indexOf("name: 'render',") + 115);
  assert.match(renderCase, /install: \['@coral-viz\/render', '@coral-viz\/language'\]/,
    'render consumer must install the candidate language dependency');
});

// Every packed Coral dependency of an installed package must come from the
// candidate artifact set; otherwise npm resolves an unpublished version from
// the registry (ETARGET) or silently substitutes a published one.
test('consumer cases install every internal Coral dependency from the candidate set', async () => {
  const smoke = await readFile('scripts/consumer-smoke.mjs', 'utf8');
  const dependencies = {};
  for (const name of ['language', 'render', 'browser', 'viz', 'mcp-server']) {
    const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
    dependencies[manifest.name] = Object.keys(manifest.dependencies ?? {}).filter(dep => dep.startsWith('@coral-viz/'));
  }
  const gated = [...smoke.matchAll(/artifactVersions: \[([^\]]*'0\.2\.17'[^\]]*)\][\s\S]*?install: \[([^\]]*)\]/g)]
    .map(match => [match[1], match[2]]);
  assert.ok(gated.length >= 3, 'expected the current viz consumer cases');
  for (const [, block] of gated) {
    const installed = [...block.matchAll(/'([^']+)'/g)].map(([, name]) => name);
    for (const name of installed) {
      for (const dependency of dependencies[name] ?? []) {
        assert.ok(installed.includes(dependency), `${installed.join(', ')} omits ${dependency}`);
      }
    }
  }
});

// Package identity changes must not select historical source or skip current
// installed consumers. Source028 remains an independent source edition.
test('0.2.17 consumers retain source028 readers, writers and semantic assertions', async () => {
  const smoke = await readFile('scripts/consumer-smoke.mjs', 'utf8');
  assert.doesNotMatch(smoke, /expectedArtifactVersion === '0\.2\.8'/);
  assert.match(smoke, /const source028 = \['0\.2\.8', '0\.2\.9', '0\.2\.11', '0\.2\.12', '0\.2\.14', '0\.2\.15', '0\.2\.17'\]\.includes\(expectedArtifactVersion\)/);
  for (const name of ['library-docs-render', 'installed-renderer']) {
    const index = smoke.indexOf(`name: '${name}',`);
    assert.ok(index >= 0, name);
    assert.match(smoke.slice(index, index + 200), /artifactVersions: \[[^\]]*'0\.2\.17'/, name);
  }
  assert.match(smoke, /HEADER_MANIFEST_028\['0\.2\.8'\]/);
  assert.match(smoke, /currentVersion: '0\.2\.8'/);
});
