import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePackedPackage028 } from './packed-package.mjs';

export const CANDIDATE_PACKAGES = Object.freeze([
  '@coral-viz/language',
  '@coral-viz/render',
  '@coral-viz/browser',
  '@coral-viz/viz',
  '@coral-viz/mcp-server',
  'tree-sitter-coral',
]);

const fullSha = /^[0-9a-f]{40}$/;
const sha256 = /^[0-9a-f]{64}$/;
const sri = /^sha512-[A-Za-z0-9+/]{86}==$/;

// TRO100-3: the expected identity is mandatory. A caller without
// RELEASE_VERSION or RELEASE_COMMIT fails closed instead of accepting any SHA.
export function validateCandidateManifest(manifest, expected = {}) {
  const errors = [];
  if (!String(expected.version ?? '').trim()) errors.push('expected version is required');
  if (!fullSha.test(expected.productSha ?? '')) errors.push('expected productSha is required');
  if (manifest?.schemaVersion !== 1) errors.push('candidate manifest schemaVersion must be 1');
  if (manifest?.version !== expected.version) errors.push('candidate manifest version mismatch');
  if (!fullSha.test(manifest?.productSha ?? '') || manifest.productSha !== expected.productSha) {
    errors.push('candidate manifest productSha mismatch');
  }
  if (!String(manifest?.workflow?.runId ?? '').trim()
      || !String(manifest?.workflow?.jobId ?? '').trim()) {
    errors.push('candidate manifest workflow identity is incomplete');
  }
  if (!Array.isArray(manifest?.packages) || manifest.packages.length !== CANDIDATE_PACKAGES.length) {
    errors.push('candidate manifest must contain six packages');
    return errors;
  }
  const filenames = new Set();
  manifest.packages.forEach((pkg, index) => {
    if (pkg.name !== CANDIDATE_PACKAGES[index]) errors.push(`candidate package order mismatch at ${index}`);
    if (pkg.version !== manifest.version) errors.push(`candidate package version mismatch for ${pkg.name}`);
    if (!pkg.filename || basename(pkg.filename) !== pkg.filename || !pkg.filename.endsWith('.tgz')) {
      errors.push(`candidate package filename is unsafe for ${pkg.name}`);
    }
    if (filenames.has(pkg.filename)) errors.push(`duplicate candidate filename ${pkg.filename}`);
    filenames.add(pkg.filename);
    if (!sha256.test(pkg.sha256 ?? '')) errors.push(`candidate sha256 is invalid for ${pkg.name}`);
    if (!sri.test(pkg.integrity ?? '')) errors.push(`candidate integrity is invalid for ${pkg.name}`);
    if (!Array.isArray(pkg.files) || pkg.files.length === 0
        || pkg.files.some(path => typeof path !== 'string' || !path.startsWith('package/'))) {
      errors.push(`candidate file inventory is invalid for ${pkg.name}`);
    }
  });
  return errors;
}

function tarOutput(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `tar ${args.join(' ')} failed`);
  return result.stdout;
}

export async function createCandidateManifest(directory, {
  version = process.env.RELEASE_VERSION,
  productSha = process.env.GITHUB_SHA,
  runId = process.env.GITHUB_RUN_ID,
  jobId = process.env.GITHUB_JOB,
} = {}) {
  const files = (await readdir(directory)).filter(name => name.endsWith('.tgz'));
  const packages = [];
  for (const name of CANDIDATE_PACKAGES) {
    const matches = [];
    for (const filename of files) {
      const path = join(directory, filename);
      const manifest = JSON.parse(tarOutput(['-xOf', path, 'package/package.json']));
      if (manifest.name === name) matches.push({ filename, path, manifest });
    }
    if (matches.length !== 1) throw new Error(`Expected one candidate tarball for ${name}`);
    const [{ filename, path, manifest }] = matches;
    const bytes = await readFile(path);
    packages.push({
      name,
      version: manifest.version,
      filename,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      files: tarOutput(['-tf', path]).split(/\r?\n/).filter(Boolean).sort(),
    });
  }
  if (files.length !== packages.length) throw new Error('Unexpected candidate archives');
  if (['0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15', '0.2.17'].includes(version)) {
    for (const pkg of packages) {
      const packed = JSON.parse(tarOutput(['-xOf', join(directory, pkg.filename), 'package/package.json']));
      const errors = validatePackedPackage028(packed, pkg.files, pkg);
      if (errors.length) throw new Error(errors.join('\n'));
    }
  }
  const candidate = {
    schemaVersion: 1,
    version,
    productSha,
    workflow: { runId: String(runId ?? ''), jobId: String(jobId ?? '') },
    packages,
  };
  const errors = validateCandidateManifest(candidate, { version, productSha });
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(join(directory, 'candidate-manifest.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  return candidate;
}

export async function verifyCandidateFiles(directory, manifest, expected) {
  const errors = validateCandidateManifest(manifest, expected);
  if (errors.length) return errors;
  const archives = (await readdir(directory)).filter(name => name.endsWith('.tgz')).sort();
  if (JSON.stringify(archives) !== JSON.stringify(manifest.packages.map(pkg => pkg.filename).sort())) {
    errors.push('Unexpected or missing candidate archives');
  }
  for (const pkg of manifest.packages ?? []) {
    try {
      const bytes = await readFile(join(directory, pkg.filename));
      if (['0.2.8', '0.2.9', '0.2.11', '0.2.12', '0.2.14', '0.2.15', '0.2.17'].includes(manifest.version)) {
        const inventory = tarOutput(['-tf', join(directory, pkg.filename)]).split(/\r?\n/).filter(Boolean).sort();
        const packed = JSON.parse(tarOutput(['-xOf', join(directory, pkg.filename), 'package/package.json']));
        errors.push(...validatePackedPackage028(packed, inventory, pkg));
        if (JSON.stringify(inventory) !== JSON.stringify([...pkg.files].sort())) errors.push(`candidate inventory mismatch for ${pkg.name}`);
      }
      if (createHash('sha256').update(bytes).digest('hex') !== pkg.sha256) {
        errors.push(`candidate sha256 mismatch for ${pkg.name}`);
      }
      if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pkg.integrity) {
        errors.push(`candidate integrity mismatch for ${pkg.name}`);
      }
    } catch {
      errors.push(`candidate tarball missing for ${pkg.name}`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, rawDirectory = 'candidate-artifacts'] = process.argv.slice(2);
  const directory = resolve(rawDirectory);
  if (mode === 'create') {
    await createCandidateManifest(directory);
  } else if (mode === 'verify') {
    const manifest = JSON.parse(await readFile(join(directory, 'candidate-manifest.json'), 'utf8'));
    const errors = await verifyCandidateFiles(directory, manifest, {
      version: process.env.RELEASE_VERSION,
      productSha: process.env.RELEASE_COMMIT,
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify(manifest));
  } else {
    throw new Error('Expected create or verify mode');
  }
}
