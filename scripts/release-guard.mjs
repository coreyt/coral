import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
import { isRegistryDependency } from './packed-package.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const manifestPaths = Object.freeze([
  'package.json',
  'packages/language/package.json',
  'packages/render/package.json',
  'packages/browser/package.json',
  'packages/viz/package.json',
  'packages/diagram-editor/package.json',
  'packages/mcp-server/package.json',
  'packages/tree-sitter-coral/package.json',
]);

export function validatePublishContext(environment) {
  const expected = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'coreyt/coral',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/publish.yml@refs/heads/main',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (environment[name] !== value) {
      throw new Error(`Untrusted publish context: ${name} must equal ${value}`);
    }
  }
}

export function validateReleaseGuard(input) {
  const {
    requestedVersion, expectedVersion, requestedCommit, head, githubSha,
    dirty, versions,
  } = input;
  if (requestedVersion !== expectedVersion) {
    throw new Error(`Requested version ${requestedVersion} does not equal candidate ${expectedVersion}`);
  }
  if (!/^[0-9a-f]{40}$/.test(requestedCommit ?? '')) {
    throw new Error('Release commit must be a full lowercase SHA-1');
  }
  if (head !== requestedCommit || githubSha !== requestedCommit) {
    throw new Error('Checkout, workflow and requested release commits must match');
  }
  if (dirty) throw new Error('Release checkout contains tracked changes');
  const mismatches = Object.entries(versions).filter(([, version]) => version !== expectedVersion);
  if (mismatches.length) {
    throw new Error(`Release versions are not atomic: ${mismatches.map(([name, version]) => `${name}=${version}`).join(', ')}`);
  }
}

export function validatePublicationReadiness(config, manifests) {
  if (config.publicationAuthorized !== true) throw new Error('Active candidate publication is not authorized');
  if (config.identityState !== 'public dependencies adopted') throw new Error('Active candidate still uses private dependency identity');
  for (const manifest of manifests) {
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (!isRegistryDependency(spec)) throw new Error(`${manifest.name}: non-registry ${field}.${name}`);
      }
    }
  }
}

async function main() {
  if (process.argv.includes('--publish')) validatePublishContext(process.env);
  const manifests = await Promise.all(manifestPaths.map(async (path) => [
    path, JSON.parse(await readFile(resolve(root, path), 'utf8')),
  ]));
  const expectedVersion = manifests[0][1].version;
  if (process.argv.includes('--publish') && expectedVersion === RENDERER_CANDIDATE.version) {
    validatePublicationReadiness(RENDERER_CANDIDATE, manifests.map(([, manifest]) => manifest).filter(manifest => !manifest.private));
  }
  const versions = Object.fromEntries(manifests.map(([path, manifest]) => [path, manifest.version]));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: root, encoding: 'utf8',
  }).trim();
  validateReleaseGuard({
    requestedVersion: process.env.RELEASE_VERSION,
    expectedVersion,
    requestedCommit: process.env.RELEASE_COMMIT,
    head,
    githubSha: process.env.GITHUB_SHA,
    dirty: status !== '',
    versions,
  });
  console.log(JSON.stringify({ version: expectedVersion, commit: head }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
