import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePackedPackage028 } from './packed-package.mjs';

const manifest = { name: '@coral-viz/language', version: '0.2.8',
  main: 'dist/index.js', types: 'dist/index.d.ts',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  dependencies: { '@graph-ir/core': '0.2.4' } };
const files = ['package/package.json', 'package/README.md', 'package/LICENSE',
  'package/dist/index.js', 'package/dist/index.d.ts'];
const validate = (value = manifest, inventory = files) => validatePackedPackage028(value, inventory,
  { name: manifest.name, version: '0.2.8' });

test('current package validates actual required files and conditional exports', () => {
  assert.deepEqual(validate(), []);
  for (const file of files) assert.ok(validate(manifest, files.filter(path => path !== file)).length, file);
  for (const field of ['name', 'version']) assert.ok(validate({ ...manifest, [field]: 'wrong' }).length, field);
  assert.ok(validate({ ...manifest, exports: { '.': './dist/missing.js' } }).length);
  assert.ok(validate({ ...manifest, bin: { coral: 'dist/missing-cli.js' } }).length);
  assert.ok(validate({ ...manifest, jsdelivr: './dist/missing-iife.js' }).length);
});

test('unsafe, duplicate and development paths fail; native directory entry resolves', () => {
  for (const file of ['package/../escape', '/package/absolute', 'package/node_modules/x',
    'package/dev/secret', 'package/test-results/log', 'package\\dist\\x', files[0]]) {
    assert.ok(validate(manifest, [...files, file]).length, file);
  }
  const native = { name: 'tree-sitter-coral', version: '0.2.8', main: 'bindings/node', types: 'bindings/node' };
  const nativeFiles = [...files.slice(0, 3), 'package/bindings/node/index.js',
    'package/bindings/node/index.d.ts', 'package/src/parser.c'];
  assert.deepEqual(validatePackedPackage028(native, nativeFiles, { name: native.name, version: native.version }), []);
  assert.ok(validatePackedPackage028(native, nativeFiles.filter(x => !x.endsWith('parser.c')),
    { name: native.name, version: native.version }).length);
});

test('wildcards and explicit null exports have bounded target checks', () => {
  assert.deepEqual(validate({ ...manifest, exports: { './*': './dist/*.js', './private': null } }), []);
  assert.ok(validate({ ...manifest, exports: { './*': './missing/*.js' } }).length);
  assert.ok(validate({ ...manifest, exports: { '.': '../outside.js' } }).length);
});

test('packed internal dependency versions and local dependency protocols fail', () => {
  for (const dependencies of [
    { '@graph-ir/core': '0.2.2' }, { '@coral-viz/render': '^0.2.8' },
    { other: 'file:../x.tgz' }, { other: '../x' }, { other: 'workspace:*' },
  ]) assert.ok(validate({ ...manifest, dependencies }).length, JSON.stringify(dependencies));
});

for (const version of ['0.2.8', '0.2.9', '0.2.11', '0.2.12']) test(`${version} real current archives bind inventories, exports, dependencies and the closed archive set`, async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { CANDIDATE_PACKAGES, createCandidateManifest, verifyCandidateFiles } = await import('./candidate-artifacts.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'coral-s90-archives-'));
  const expected = { version, productSha: 'a'.repeat(40) };
  const source = join(directory, 'fixture');
  try {
    for (const [index, name] of CANDIDATE_PACKAGES.entries()) {
      const value = { ...manifest, name, version };
      const inventory = name === 'tree-sitter-coral' ? [...files, 'package/src/parser.c'] : files;
      for (const file of inventory) {
        const path = join(source, file);
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, file.endsWith('package.json') ? JSON.stringify(value) : 'fixture\n');
      }
      execFileSync('tar', ['-czf', join(directory, `p${index}.tgz`), '-C', source, 'package']);
      await rm(source, { recursive: true });
    }
    const candidate = await createCandidateManifest(directory, { ...expected, runId: '1', jobId: 'verify' });
    assert.deepEqual(await verifyCandidateFiles(directory, candidate, expected), []);
    const wrongVersion = structuredClone(candidate);
    wrongVersion.packages[2].version = version === '0.2.9' ? '0.2.8' : '0.2.6';
    assert.match((await verifyCandidateFiles(directory, wrongVersion, expected)).join('\n'), /package version mismatch/);
    const partial = structuredClone(candidate);
    partial.packages.pop();
    assert.match((await verifyCandidateFiles(directory, partial, expected)).join('\n'), /must contain six packages/);
    const changedInventory = structuredClone(candidate);
    changedInventory.packages[0].files.push('package/dist/imaginary.js');
    assert.match((await verifyCandidateFiles(directory, changedInventory, expected)).join('\n'), /inventory mismatch/);
    await writeFile(join(directory, 'extra.tgz'), await readFile(join(directory, 'p0.tgz')));
    await assert.rejects(createCandidateManifest(directory, { ...expected, runId: '1', jobId: 'verify' }));
    assert.match((await verifyCandidateFiles(directory, candidate, expected)).join('\n'), /Unexpected/);
    await rm(join(directory, 'extra.tgz'));
    const tampered = structuredClone(candidate);
    const packed = { ...manifest, version, dependencies: { '@graph-ir/core': '0.2.2' } };
    for (const file of files) {
      const path = join(source, file);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, file.endsWith('package.json') ? JSON.stringify(packed) : 'fixture\n');
    }
    execFileSync('tar', ['-czf', join(directory, 'p0.tgz'), '-C', source, 'package']);
    const bytes = await readFile(join(directory, 'p0.tgz'));
    tampered.packages[0].sha256 = createHash('sha256').update(bytes).digest('hex');
    tampered.packages[0].integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    assert.match((await verifyCandidateFiles(directory, tampered, expected)).join('\n'), /wrong frozen Core/);
    await assert.rejects(createCandidateManifest(directory, { ...expected, runId: '1', jobId: 'verify' }), /wrong frozen Core/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('npm local forms fail in every runtime dependency field', () => {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const spec of ['foo.tgz', '~/core', 'https://example.org/core.tgz', 'git+https://example.org/core']) {
      assert.ok(validate({ ...manifest, [field]: { other: spec } }).length, `${field}: ${spec}`);
    }
  }
});

test('browser entry and replacement maps validate local file targets', () => {
  assert.ok(validate({ ...manifest, browser: './dist/missing.js' }).length);
  assert.ok(validate({ ...manifest, browser: { './dist/index.js': './dist/missing.js' } }).length);
  assert.ok(validate({ ...manifest, browser: { './dist/missing.js': false } }).length);
  assert.ok(validate({ ...manifest, browser: { './dist/index.js': '../outside.js' } }).length);
  assert.deepEqual(validate({ ...manifest, browser: { './dist/index.js': false } }), []);
  assert.deepEqual(validate({ ...manifest, browser: './dist/index.js' }), []);
});
