import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CANDIDATE_PACKAGES, createCandidateManifest, validateCandidateManifest, verifyCandidateFiles,
} from './candidate-artifacts.mjs';

const sha = 'a'.repeat(40);
const manifest = {
  schemaVersion: 1,
  version: '0.2.6',
  productSha: sha,
  workflow: { runId: '42', jobId: '77' },
  packages: CANDIDATE_PACKAGES.map((name, index) => ({
    name,
    version: '0.2.6',
    filename: `package-${index}.tgz`,
    sha256: String(index).padStart(64, '0'),
    integrity: `sha512-${Buffer.alloc(64, index).toString('base64')}`,
    files: ['package/package.json'],
  })),
};

test('candidate manifest fixes six-package order and exact source identity', () => {
  assert.deepEqual(CANDIDATE_PACKAGES, [
    '@coral-viz/language', '@coral-viz/render', '@coral-viz/browser',
    '@coral-viz/viz', '@coral-viz/mcp-server', 'tree-sitter-coral',
  ]);
  assert.deepEqual(validateCandidateManifest(manifest, {
    version: '0.2.6', productSha: sha,
  }), []);
});

test('candidate manifest rejects reordering, duplicate files and wrong bytes', () => {
  const reordered = structuredClone(manifest);
  [reordered.packages[1], reordered.packages[2]] = [reordered.packages[2], reordered.packages[1]];
  assert.notDeepEqual(validateCandidateManifest(reordered, {
    version: '0.2.6', productSha: sha,
  }), []);
  const duplicate = structuredClone(manifest);
  duplicate.packages[1].filename = duplicate.packages[0].filename;
  assert.notDeepEqual(validateCandidateManifest(duplicate, {
    version: '0.2.6', productSha: sha,
  }), []);
  assert.notDeepEqual(validateCandidateManifest(manifest, {
    version: '0.2.6', productSha: 'b'.repeat(40),
  }), []);
});

test('candidate manifest creator reads one real tarball for every package', async () => {
  const stage = await mkdtemp(join(tmpdir(), 'coral-candidate-artifacts-'));
  try {
    for (const [index, name] of CANDIDATE_PACKAGES.entries()) {
      const root = join(stage, `source-${index}`);
      const packageDirectory = join(root, 'package');
      await mkdir(packageDirectory, { recursive: true });
      await writeFile(join(packageDirectory, 'package.json'), `${JSON.stringify({
        name, version: '0.2.6',
      })}\n`);
      const result = spawnSync('tar', [
        '-czf', join(stage, `package-${index}.tgz`), '-C', root, 'package',
      ]);
      assert.equal(result.status, 0);
    }
    const created = await createCandidateManifest(stage, {
      version: '0.2.6', productSha: sha, runId: '42', jobId: 'verify',
    });
    assert.deepEqual(created.packages.map(pkg => pkg.name), CANDIDATE_PACKAGES);
    assert.deepEqual(JSON.parse(await readFile(
      join(stage, 'candidate-manifest.json'), 'utf8',
    )), created);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

// TRO100-3: the retained bytes themselves are re-hashed, and every manifest
// field that binds them is checked one condition at a time.
async function retainedCandidate() {
  const directory = await mkdtemp(join(tmpdir(), 'coral-candidate-verify-'));
  const packages = [];
  for (const [index, name] of CANDIDATE_PACKAGES.entries()) {
    const filename = `package-${index}.tgz`;
    const bytes = Buffer.from(`retained tarball ${name}\n`);
    await writeFile(join(directory, filename), bytes);
    packages.push({
      name, version: '0.2.6', filename,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      files: ['package/package.json'],
    });
  }
  return {
    directory,
    manifest: { schemaVersion: 1, version: '0.2.6', productSha: sha, workflow: { runId: '42', jobId: '77' }, packages },
  };
}

test('retained candidate verification re-hashes every tarball and binds every manifest field (TRO100-3)', async () => {
  const { directory, manifest: retained } = await retainedCandidate();
  const expected = { version: '0.2.6', productSha: sha };
  try {
    assert.deepEqual(await verifyCandidateFiles(directory, retained, expected), []);
    const tamper = async (index, bytes) => writeFile(join(directory, retained.packages[index].filename), bytes);
    // One flipped byte breaks both digests of that tarball only.
    const original = await readFile(join(directory, retained.packages[2].filename));
    const flipped = Buffer.from(original);
    flipped[0] ^= 1;
    await tamper(2, flipped);
    const tampered = (await verifyCandidateFiles(directory, retained, expected)).join('\n');
    assert.match(tampered, /candidate sha256 mismatch for @coral-viz\/browser/);
    assert.match(tampered, /candidate integrity mismatch for @coral-viz\/browser/);
    await tamper(2, original);
    // The SHA-256 and SRI checks are independent: each alone detects a wrong digest.
    const sriOnly = structuredClone(retained);
    sriOnly.packages[1].integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
    assert.deepEqual(await verifyCandidateFiles(directory, sriOnly, expected), [
      'candidate integrity mismatch for @coral-viz/render',
    ]);
    const shaOnly = structuredClone(retained);
    shaOnly.packages[3].sha256 = '0'.repeat(64);
    assert.deepEqual(await verifyCandidateFiles(directory, shaOnly, expected), [
      'candidate sha256 mismatch for @coral-viz/viz',
    ]);
    await rm(join(directory, retained.packages[5].filename));
    assert.match((await verifyCandidateFiles(directory, retained, expected)).join('\n'),
      /candidate tarball missing for tree-sitter-coral/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('candidate manifest rejects each malformed identity field (TRO100-3)', async () => {
  const expected = { version: '0.2.6', productSha: sha };
  for (const [pattern, mutate] of [
    [/candidate package version mismatch for @coral-viz\/viz/, value => { value.packages[3].version = '0.2.5'; }],
    [/candidate manifest version mismatch/, value => {
      value.version = '0.2.5';
      for (const pkg of value.packages) pkg.version = '0.2.5';
    }],
    [/candidate sha256 is invalid for @coral-viz\/render/, value => { value.packages[1].sha256 = 'A'.repeat(64); }],
    [/candidate sha256 is invalid for @coral-viz\/render/, value => { value.packages[1].sha256 = '0'.repeat(63); }],
    [/candidate integrity is invalid for @coral-viz\/language/, value => { value.packages[0].integrity = 'sha256-abc='; }],
    [/candidate file inventory is invalid for tree-sitter-coral/, value => { value.packages[5].files = []; }],
    [/candidate file inventory is invalid for tree-sitter-coral/, value => { value.packages[5].files = ['package/a.js', 'src/b.js']; }],
    [/candidate file inventory is invalid for tree-sitter-coral/, value => { delete value.packages[5].files; }],
    [/candidate package filename is unsafe for @coral-viz\/browser/, value => { value.packages[2].filename = '../x.tgz'; }],
    [/candidate package filename is unsafe for @coral-viz\/browser/, value => { value.packages[2].filename = 'x.tar'; }],
    [/candidate manifest productSha mismatch/, value => { value.productSha = 'b'.repeat(40); }],
    [/workflow identity/, value => { value.workflow.jobId = ''; }],
  ]) {
    const value = structuredClone(manifest);
    mutate(value);
    assert.match(validateCandidateManifest(value, expected).join('\n'), pattern);
  }
  // Verification never runs without the exact expected identity (fail closed).
  for (const partial of [{}, { version: '0.2.6' }, { productSha: sha }, { version: '0.2.6', productSha: 'abc' }]) {
    assert.match(validateCandidateManifest(manifest, partial).join('\n'), /expected (?:productSha|version) is required/,
      JSON.stringify(partial));
  }
});

test('the verify CLI fails closed without RELEASE_VERSION and RELEASE_COMMIT (TRO100-3)', async () => {
  const { directory, manifest: retained } = await retainedCandidate();
  try {
    await writeFile(join(directory, 'candidate-manifest.json'), `${JSON.stringify(retained)}\n`);
    const run = env => spawnSync(process.execPath, ['scripts/candidate-artifacts.mjs', 'verify', directory], {
      encoding: 'utf8', env: { PATH: process.env.PATH, ...env },
    });
    assert.equal(run({ RELEASE_VERSION: '0.2.6', RELEASE_COMMIT: sha }).status, 0);
    for (const env of [{}, { RELEASE_VERSION: '0.2.6' }, { RELEASE_COMMIT: sha }]) {
      const result = run(env);
      assert.notEqual(result.status, 0, JSON.stringify(env));
      assert.match(result.stderr, /expected (?:productSha|version) is required/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
