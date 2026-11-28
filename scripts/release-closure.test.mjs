import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { parseWorkflow } from './workflow-policy.mjs';
import { manifestPaths, validatePublishContext, validateReleaseGuard } from './release-guard.mjs';
import {
  RELEASE_PACKAGES,
  allowPagesDigestVerification, allowPrivateDigestRecovery, allowReleaseDigestVerification,
  candidateIntegrities, classifyRegistryState, privateDigestAllowed,
  normalizeAttestation,
  normalizePackResult,
  registryNativeSmokeSource,
  resolveAttestationUrl,
  validatePublishedRecord,
  validateProvenance,
  validateRegistryLock,
  validateNpmLs,
  REGISTRY_POLL_INTERVAL_MS, REGISTRY_PROPAGATION_WINDOW_MS, recordRegistryAudit, retryWithinWindow,
  runRegistryMode,
} from './release-registry.mjs';

const commit = 'a'.repeat(40);

test('registry native smoke accepts the current grammar and retains the legacy sample', () => {
  const require = createRequire(import.meta.url);
  const Parser = require('tree-sitter');
  const parser = new Parser();
  parser.setLanguage(require('tree-sitter-coral'));
  assert.equal(parser.parse(registryNativeSmokeSource('0.2.8')).rootNode.hasError, false);
  assert.equal(parser.parse('service "Registry"').rootNode.hasError, true,
    'the legacy sample must not pass the current grammar');
  assert.equal(registryNativeSmokeSource('0.2.6'), 'service "Registry"');
});

test('release package order includes the browser artifact dependency-safely', () => {
  assert.deepEqual(RELEASE_PACKAGES, [
    '@coral-viz/language', '@coral-viz/render', '@coral-viz/browser',
    '@coral-viz/viz', '@coral-viz/mcp-server', 'tree-sitter-coral',
  ]);
});
const validGuard = {
  requestedVersion: '0.2.5', expectedVersion: '0.2.5', requestedCommit: commit,
  head: commit, githubSha: commit, dirty: false,
  versions: Object.fromEntries(['root', ...RELEASE_PACKAGES].map((name) => [name, '0.2.5'])),
};

test('release guard accepts only the exact clean atomic candidate identity', () => {
  assert.doesNotThrow(() => validateReleaseGuard(validGuard));
  for (const patch of [
    { requestedVersion: '0.2.4' },
    { requestedCommit: 'abc' },
    { head: 'b'.repeat(40) },
    { githubSha: 'b'.repeat(40) },
    { dirty: true },
    { versions: { ...validGuard.versions, '@coral-viz/viz': '0.2.3' } },
  ]) {
    assert.throws(() => validateReleaseGuard({ ...validGuard, ...patch }));
  }
});

// TRO100-6: the guard checks the complete atomic version set, including the
// browser package, the private editor, and the root manifest.
test('release guard reads exactly the atomic manifest set', async () => {
  assert.deepEqual([...manifestPaths], [
    'package.json',
    'packages/language/package.json',
    'packages/render/package.json',
    'packages/browser/package.json',
    'packages/viz/package.json',
    'packages/diagram-editor/package.json',
    'packages/mcp-server/package.json',
    'packages/tree-sitter-coral/package.json',
  ]);
  const { readdir } = await import('node:fs/promises');
  const workspaces = (await readdir(new URL('../packages/', import.meta.url), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
    .map(entry => `packages/${entry.name}/package.json`);
  for (const path of workspaces) assert.ok(manifestPaths.includes(path), `${path} is outside the atomic set`);
  const names = await Promise.all(manifestPaths.slice(1).map(async path =>
    JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).name));
  for (const name of RELEASE_PACKAGES) assert.ok(names.includes(name), `${name} manifest is not guarded`);
  assert.ok(names.includes('@coral-viz/diagram-editor'));
});

const publishContext = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'coreyt/coral',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/publish.yml@refs/heads/main',
};

test('fresh publication requires the trusted main dispatch context', () => {
  assert.doesNotThrow(() => validatePublishContext(publishContext));
  for (const patch of [
    { GITHUB_ACTIONS: undefined },
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'someone/fork' },
    { GITHUB_REF: 'refs/heads/release/0.2.5' },
    { GITHUB_REF: 'refs/tags/v0.2.5' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/other.yml@refs/heads/main' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/publish.yml@refs/heads/release/0.2.5' },
    { GITHUB_WORKFLOW_REF: undefined },
  ]) assert.throws(() => validatePublishContext({ ...publishContext, ...patch }), /publish context/i);
});

test('publish workflow enforces context before registry mutation while Pages previews remain generic', async () => {
  const publish = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  const pages = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  // Within the OIDC-bearing publish job, the guard precedes the registry
  // preflight that selects the start index and every npm publish (the verify
  // job's read-only preflight only informs its audit policy, CRO100-16).
  const steps = parseWorkflow(publish).jobs.publish.steps.map(step => String(step.run ?? ''));
  const guard = steps.indexOf('node scripts/release-guard.mjs --publish');
  assert.ok(guard >= 0, 'publish must select the trusted-context guard');
  assert.ok(guard < steps.indexOf('node scripts/release-registry.mjs preflight'));
  assert.ok(guard < steps.findIndex(run => run.startsWith('npm publish')));
  assert.match(pages, /run: node scripts\/release-guard\.mjs\r?\n/);
});

const provenance = (name) => ({
  metadata: { name, version: '0.2.5', integrity: 'sha512-ZGlnZXN0' },
  attestation: {
    repository: 'coreyt/coral', workflow: 'publish.yml', commit,
    subjectName: name, subjectVersion: '0.2.5',
    subjectDigest: Buffer.from('digest').toString('hex'),
  },
});

test('partial publication must be one attributable contiguous prefix', () => {
  assert.equal(classifyRegistryState(RELEASE_PACKAGES.map(() => null), { version: '0.2.5', commit }), 0);
  assert.equal(classifyRegistryState([
    provenance(RELEASE_PACKAGES[0]), provenance(RELEASE_PACKAGES[1]), null, null, null,
  ], { version: '0.2.5', commit }), 2);
  assert.throws(() => classifyRegistryState([
    provenance(RELEASE_PACKAGES[0]), null, provenance(RELEASE_PACKAGES[2]), null, null,
  ], { version: '0.2.5', commit }), /contiguous/i);
});

// TRO100-13: the registry state is bound to the retained candidate integrity,
// and the candidate integrities come only from verified retained files.
test('registry classification binds attested packages to the retained candidate integrity', () => {
  const records = [provenance(RELEASE_PACKAGES[0]), provenance(RELEASE_PACKAGES[1]), null, null, null, null];
  const localIntegrities = { [RELEASE_PACKAGES[0]]: 'sha512-ZGlnZXN0', [RELEASE_PACKAGES[1]]: 'sha512-ZGlnZXN0' };
  assert.equal(classifyRegistryState(records, { version: '0.2.5', commit, localIntegrities }), 2);
  assert.throws(() => classifyRegistryState(records, {
    version: '0.2.5', commit, localIntegrities: { ...localIntegrities, [RELEASE_PACKAGES[1]]: 'sha512-b3RoZXI=' },
  }), /Candidate integrity mismatch for @coral-viz\/render/);
});

test('registry candidate integrities come only from verified retained files', async () => {
  const { createHash } = await import('node:crypto');
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'coral-registry-candidate-'));
  try {
    const packages = [];
    for (const [index, name] of RELEASE_PACKAGES.entries()) {
      const bytes = Buffer.from(`retained ${name}\n`);
      await writeFile(join(directory, `package-${index}.tgz`), bytes);
      packages.push({
        name, version: '0.2.6', filename: `package-${index}.tgz`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        files: ['package/package.json'],
      });
    }
    const manifest = { schemaVersion: 1, version: '0.2.6', productSha: commit, workflow: { runId: '1', jobId: 'verify' }, packages };
    const path = join(directory, 'candidate-manifest.json');
    await writeFile(path, JSON.stringify(manifest));
    assert.deepEqual(await candidateIntegrities(path, '0.2.6', commit),
      Object.fromEntries(packages.map(pkg => [pkg.name, pkg.integrity])));
    await assert.rejects(candidateIntegrities(path, '0.2.6', 'b'.repeat(40)), /productSha mismatch/);
    await writeFile(join(directory, 'package-4.tgz'), 'tampered');
    await assert.rejects(candidateIntegrities(path, '0.2.6', commit), /sha256 mismatch for @coral-viz\/mcp-server/);
    await assert.rejects(candidateIntegrities(undefined, '0.2.6', commit), /RELEASE_CANDIDATE_MANIFEST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('provenance binds package, version, digest, repository, workflow and commit', () => {
  const record = provenance(RELEASE_PACKAGES[0]);
  assert.doesNotThrow(() => validateProvenance(record, {
    name: RELEASE_PACKAGES[0], version: '0.2.5', commit,
  }));
  assert.throws(() => validatePublishedRecord(record, {
    name: RELEASE_PACKAGES[0], version: '0.2.5', commit,
    expectedIntegrity: 'sha512-other',
  }), /candidate integrity/i);
  for (const attestation of [
    { ...record.attestation, repository: 'someone/fork' },
    { ...record.attestation, workflow: 'other.yml' },
    { ...record.attestation, commit: 'b'.repeat(40) },
    { ...record.attestation, subjectName: 'other' },
    { ...record.attestation, subjectVersion: '0.2.3' },
    { ...record.attestation, subjectDigest: 'wrong' },
  ]) {
    assert.throws(() => validateProvenance({ ...record, attestation }, {
      name: RELEASE_PACKAGES[0], version: '0.2.5', commit,
    }));
  }
});

test('private-repository recovery requires an exact local tarball integrity', () => {
  const name = RELEASE_PACKAGES[0];
  const record = {
    metadata: { name, version: '0.2.5', integrity: 'sha512-private-digest' },
    attestation: null,
  };
  const expected = { name, version: '0.2.5', commit };
  assert.throws(() => validatePublishedRecord(record, expected), /attestation/i);
  assert.doesNotThrow(() => validatePublishedRecord(record, {
    ...expected, allowPrivateDigest: true, localIntegrity: 'sha512-private-digest',
  }));
  assert.throws(() => validatePublishedRecord(record, {
    ...expected, allowPrivateDigest: true, localIntegrity: 'sha512-wrong',
  }), /integrity/i);
  assert.throws(() => validatePublishedRecord({
    ...record, metadata: { ...record.metadata, name: '@coral-viz/other' },
  }, { ...expected, allowPrivateDigest: true, localIntegrity: 'sha512-private-digest' }), /name/i);
});

test('present attestations never fall back to private-repository digest matching', () => {
  const record = provenance(RELEASE_PACKAGES[0]);
  record.attestation.commit = 'b'.repeat(40);
  assert.throws(() => validatePublishedRecord(record, {
    name: RELEASE_PACKAGES[0], version: '0.2.5', commit,
    allowPrivateDigest: true, localIntegrity: record.metadata.integrity,
  }), /commit/i);
});

test('only omitted attestation metadata can use private digest recovery', () => {
  assert.equal(resolveAttestationUrl({ dist: {} }), null);
  assert.equal(resolveAttestationUrl({ dist: { attestations: null } }), null);
  assert.equal(resolveAttestationUrl({
    dist: { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/example' } },
  }), 'https://registry.npmjs.org/-/npm/v1/attestations/example');
  for (const attestations of [{}, { url: '' }, { url: 'http://example.test/unsafe' }, 'invalid']) {
    assert.throws(() => resolveAttestationUrl({ dist: { attestations } }), /attestation/i);
  }
});

test('private digest recovery is bound to the exact GitHub workflow context', () => {
  const environment = {
    RELEASE_PRIVATE_REPOSITORY: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'coreyt/coral',
    GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/publish.yml@refs/heads/main',
    GITHUB_SHA: commit,
  };
  assert.equal(allowPrivateDigestRecovery(environment, commit), true);
  for (const patch of [
    { RELEASE_PRIVATE_REPOSITORY: 'false' },
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'someone/fork' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/other.yml@refs/heads/main' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/publish.yml@refs/heads/release' },
    { GITHUB_SHA: 'b'.repeat(40) },
  ]) assert.equal(allowPrivateDigestRecovery({ ...environment, ...patch }, commit), false);
});

test('Pages registry verification is bound to main workflow and checked-out commit', () => {
  const environment = {
    RELEASE_PRIVATE_REPOSITORY: 'true',
    RELEASE_PAGES_REGISTRY_VERIFICATION: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'coreyt/coral',
    RELEASE_JOB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/pages.yml@refs/heads/main',
  };
  assert.equal(allowPagesDigestVerification(environment, commit, commit), true);
  for (const patch of [
    { RELEASE_PRIVATE_REPOSITORY: 'false' },
    { RELEASE_PAGES_REGISTRY_VERIFICATION: 'false' },
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'someone/fork' },
    { RELEASE_JOB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/pages.yml@refs/heads/release' },
  ]) assert.equal(allowPagesDigestVerification({ ...environment, ...patch }, commit, commit), false);
  assert.equal(allowPagesDigestVerification(environment, commit, 'b'.repeat(40)), false);
});

// TRO100-1: release.yml re-verifies the registry before tagging. On the
// expected private-repository path no attestation exists, so its own
// workflow context must admit the digest substitute, and only that context.
const releaseContext = {
  RELEASE_PRIVATE_REPOSITORY: 'true',
  RELEASE_TAG_REGISTRY_VERIFICATION: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'coreyt/coral',
  GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/release.yml@refs/heads/main',
  GITHUB_SHA: commit,
};

test('release.yml registry verification admits the private digest only in its own main context (TRO100-1)', () => {
  assert.equal(allowReleaseDigestVerification(releaseContext, commit, commit), true);
  assert.equal(privateDigestAllowed(releaseContext, commit, commit), true);
  // Neither the publish nor the Pages binding accepts the release context.
  assert.equal(allowPrivateDigestRecovery(releaseContext, commit), false);
  assert.equal(allowPagesDigestVerification(releaseContext, commit, commit), false);
  for (const patch of [
    { RELEASE_PRIVATE_REPOSITORY: 'false' },
    { RELEASE_PRIVATE_REPOSITORY: undefined },
    { RELEASE_TAG_REGISTRY_VERIFICATION: undefined },
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'someone/fork' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/release.yml@refs/heads/release/0.2.6' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/ci.yml@refs/heads/main' },
    { GITHUB_SHA: 'b'.repeat(40) },
  ]) {
    const environment = { ...releaseContext, ...patch };
    assert.equal(allowReleaseDigestVerification(environment, commit, commit), false, JSON.stringify(patch));
    assert.equal(privateDigestAllowed(environment, commit, commit), false, JSON.stringify(patch));
  }
  assert.equal(allowReleaseDigestVerification(releaseContext, commit, 'b'.repeat(40)), false);
  assert.equal(privateDigestAllowed(releaseContext, commit, 'b'.repeat(40)), false);
  // The unattested private packages then classify as a complete publication.
  const localIntegrities = Object.fromEntries(RELEASE_PACKAGES.map(name => [name, `sha512-${name}`]));
  const records = RELEASE_PACKAGES.map(name => ({
    metadata: { name, version: '0.2.6', integrity: `sha512-${name}` }, attestation: null,
  }));
  assert.equal(classifyRegistryState(records, {
    version: '0.2.6', commit, localIntegrities,
    allowPrivateDigest: privateDigestAllowed(releaseContext, commit, commit),
  }), RELEASE_PACKAGES.length);
  assert.throws(() => classifyRegistryState(records, {
    version: '0.2.6', commit, localIntegrities,
    allowPrivateDigest: privateDigestAllowed({ ...releaseContext, GITHUB_WORKFLOW_REF: undefined }, commit, commit),
  }), /Missing trusted-publisher attestation for @coral-viz\/language/);
});

test('release.yml passes its private-digest context to the registry verification step (TRO100-1)', async () => {
  const release = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const step = release.slice(release.indexOf('- name: Verify exact candidate, packages, Pages'));
  const block = step.slice(0, step.indexOf('\n      - name:', 1));
  assert.ok(block.includes('node scripts/release-registry.mjs verify'));
  for (const required of [
    'RELEASE_PRIVATE_REPOSITORY: ${{ github.event.repository.private }}',
    'RELEASE_TAG_REGISTRY_VERIFICATION: true',
    'RELEASE_CANDIDATE_MANIFEST: candidate-artifacts/candidate-manifest.json',
  ]) assert.ok(block.includes(required), required);
  const { validateReleaseWorkflow } = await import('./workflow-policy.mjs');
  assert.deepEqual(validateReleaseWorkflow(release), []);
  for (const removed of [
    '          RELEASE_PRIVATE_REPOSITORY: ${{ github.event.repository.private }}\n',
    '          RELEASE_TAG_REGISTRY_VERIFICATION: true\n',
  ]) {
    assert.match(validateReleaseWorkflow(release.replace(removed, '')).join('\n'), /private-digest context/);
  }
});

test('npm 12 workspace pack output has one exact package identity', () => {
  const entry = {
    name: RELEASE_PACKAGES[0], version: '0.2.5',
    filename: 'coral-viz-language-0.2.5.tgz', integrity: 'sha512-digest',
  };
  assert.deepEqual(normalizePackResult({ [RELEASE_PACKAGES[0]]: entry },
    RELEASE_PACKAGES[0], '0.2.5'), entry);
  assert.deepEqual(normalizePackResult([entry], RELEASE_PACKAGES[0], '0.2.5'), entry);
  assert.throws(() => normalizePackResult({ one: entry, two: entry },
    RELEASE_PACKAGES[0], '0.2.5'), /identity/i);
  assert.throws(() => normalizePackResult({ one: { ...entry, version: '0.2.3' } },
    RELEASE_PACKAGES[0], '0.2.5'), /identity/i);
  assert.throws(() => normalizePackResult({ one: { ...entry, filename: '../escape.tgz' } },
    RELEASE_PACKAGES[0], '0.2.5'), /identity/i);
});

test('private digest recovery permits a mixed attributable contiguous prefix', () => {
  const privateRecord = {
    metadata: {
      name: RELEASE_PACKAGES[1], version: '0.2.5', integrity: 'sha512-private-render',
    },
    attestation: null,
  };
  assert.equal(classifyRegistryState([
    provenance(RELEASE_PACKAGES[0]), privateRecord, null, null, null,
  ], {
    version: '0.2.5', commit, allowPrivateDigest: true,
    localIntegrities: { [RELEASE_PACKAGES[1]]: 'sha512-private-render' },
  }), 2);
});

test('normalizes the signed DSSE statement used by npm attestations', () => {
  const name = RELEASE_PACKAGES[0];
  const digest = Buffer.from('digest').toString('hex');
  const statement = {
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{ name: 'pkg:npm/%40coral-viz/language@0.2.5', digest: { sha512: digest } }],
    predicate: {
      buildDefinition: {
        externalParameters: { workflow: {
          ref: 'refs/heads/main', repository: 'https://github.com/coreyt/coral',
          path: '.github/workflows/publish.yml',
        } },
        resolvedDependencies: [{
          uri: 'git+https://github.com/coreyt/coral@refs/heads/main', digest: { gitCommit: commit },
        }],
      },
    },
  };
  const responseFor = (value) => ({ attestations: [{ bundle: { dsseEnvelope: {
    payload: Buffer.from(JSON.stringify(value)).toString('base64'),
  } } }] });
  const response = responseFor(statement);
  assert.deepEqual(normalizeAttestation({}, response, { name, version: '0.2.5', commit }), {
    repository: 'coreyt/coral', workflow: '.github/workflows/publish.yml', commit,
    subjectName: name, subjectVersion: '0.2.5', subjectDigest: digest,
  });
  const unscoped = {
    ...statement,
    subject: [{ name: 'pkg:npm/tree-sitter-coral@0.2.5', digest: { sha512: digest } }],
  };
  assert.equal(normalizeAttestation({}, responseFor(unscoped), {
    name: 'tree-sitter-coral', version: '0.2.5', commit,
  }).subjectName, 'tree-sitter-coral');
  const workflow = statement.predicate.buildDefinition.externalParameters.workflow;
  const dependency = statement.predicate.buildDefinition.resolvedDependencies[0];
  for (const forged of [
    { ...statement, predicateType: 'https://example.test/not-slsa' },
    { ...statement, predicate: { ...statement.predicate, buildDefinition: {
      ...statement.predicate.buildDefinition,
      externalParameters: { workflow: { ...workflow, repository: 'https://github.com/attacker/fork' } },
    } } },
    { ...statement, predicate: { ...statement.predicate, buildDefinition: {
      ...statement.predicate.buildDefinition,
      externalParameters: { workflow: { ...workflow, path: '.github/workflows/other.yml' } },
    } } },
    { ...statement, predicate: { ...statement.predicate, buildDefinition: {
      ...statement.predicate.buildDefinition,
      resolvedDependencies: [{ ...dependency, uri: 'git+https://github.com/attacker/fork@refs/heads/main' }],
    } } },
    { ...statement, predicate: { ...statement.predicate, buildDefinition: {
      ...statement.predicate.buildDefinition,
      resolvedDependencies: [{ ...dependency, digest: { gitCommit: 'b'.repeat(40) } }],
    } } },
  ]) {
    assert.throws(() => normalizeAttestation({}, responseFor(forged), { name, version: '0.2.5', commit }));
  }
});

test('registry lock rejects local resolution and wrong versions', () => {
  const packages = Object.fromEntries(RELEASE_PACKAGES.map((name) => [
    `node_modules/${name}`,
    { version: '0.2.5', resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-0.2.5.tgz`, integrity: 'sha512-ok' },
  ]));
  assert.doesNotThrow(() => validateRegistryLock({ packages }, '0.2.5'));
  assert.throws(() => validateRegistryLock({ packages: {
    ...packages,
    [`node_modules/${RELEASE_PACKAGES[0]}`]: { version: '0.2.5', resolved: 'file:local.tgz', integrity: 'sha512-ok' },
  } }, '0.2.5'), /registry/i);
  assert.throws(() => validateRegistryLock({ packages: {
    ...packages,
    [`node_modules/${RELEASE_PACKAGES[1]}`]: { ...packages[`node_modules/${RELEASE_PACKAGES[1]}`], version: '0.2.3' },
  } }, '0.2.5'), /version/i);
  for (const entry of [
    { version: '0.2.5', resolved: 'file:../local-render.tgz', integrity: 'sha512-ok' },
    { version: '0.2.5', resolved: 'workspace:*', integrity: 'sha512-ok' },
    { version: '0.2.5', resolved: '../render', link: true },
  ]) {
    assert.throws(() => validateRegistryLock({ packages: {
      ...packages,
      'node_modules/@coral-viz/mcp-server/node_modules/@coral-viz/render': entry,
    } }, '0.2.5'), /registry|link/i);
  }
});

test('npm ls rejects problems and wrong nested Coral versions', () => {
  const dependencies = Object.fromEntries(RELEASE_PACKAGES.map((name) => [name, { version: '0.2.5' }]));
  assert.doesNotThrow(() => validateNpmLs({ dependencies }, '0.2.5'));
  assert.throws(() => validateNpmLs({ dependencies: {
    ...dependencies,
    '@coral-viz/mcp-server': {
      version: '0.2.5',
      dependencies: { '@coral-viz/render': { version: '0.2.3' } },
    },
  } }, '0.2.5'), /version/i);
  assert.throws(() => validateNpmLs({
    dependencies: { ...dependencies, '@coral-viz/render': { version: '0.2.5', problems: ['invalid'] } },
  }, '0.2.5'), /problems/i);
});

test('publish workflow contains the guarded OIDC closure contract', async () => {
  const workflow = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  for (const required of [
    'commit:', 'candidate_run_id:', 'ref: ${{ inputs.commit }}', 'id-token: write',
    'actions: read', 'release-guard.mjs', 'release-final-candidate.mjs',
    'candidate-artifacts.mjs verify',
    'node scripts/workspace-audit.mjs', 'RELEASE_COMMIT: ${{ inputs.commit }}',
    'RELEASE_PRIVATE_REPOSITORY: ${{ github.event.repository.private }}',
    'release-registry.mjs preflight', 'release-registry.mjs verify',
  ]) assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Publication promotes the verified frozen bytes; it never re-runs the
  // product verification, browser installs, consumers or audit captures.
  for (const forbidden of [/npm run verify\b/, /playwright install/, /npm run smoke:/, /actions\/upload-artifact@/,
    /npm run build\b/, /npm pack\b/]) assert.doesNotMatch(workflow, forbidden);
  // The token-free verify job checks the current proof, bytes, registry state
  // and a fresh workspace audit before the OIDC job can start.
  const jobs = parseWorkflow(workflow).jobs;
  const runs = name => jobs[name].steps.map(step => String(step.run ?? '').trim());
  const verify = runs('verify');
  assert.equal(jobs.verify.permissions['id-token'], undefined);
  const proofStep = verify.findIndex(run => run.startsWith('node scripts/release-final-candidate.mjs '));
  const bytes = verify.findIndex(run => run.includes('node scripts/candidate-artifacts.mjs verify candidate-artifacts'));
  const preflight = verify.indexOf('node scripts/release-registry.mjs preflight');
  const audit = verify.indexOf('node scripts/workspace-audit.mjs');
  assert.ok(verify.includes('npm ci --ignore-scripts') && !verify.includes('npm ci'));
  assert.ok(proofStep >= 0 && bytes >= proofStep && preflight > bytes && audit > preflight);
  assert.deepEqual(jobs.publish.needs, 'verify');
  const publishRuns = runs('publish');
  const firstPublish = publishRuns.findIndex(run => run.startsWith('npm publish'));
  for (const gate of ['node scripts/release-final-candidate.mjs ', 'node scripts/candidate-artifacts.mjs verify candidate-artifacts',
    'node scripts/release-guard.mjs --publish', 'node scripts/release-registry.mjs preflight']) {
    const index = publishRuns.findIndex(run => run.includes(gate));
    assert.ok(index >= 0 && index < firstPublish, `${gate} precedes every npm publish`);
  }
  for (let index = 0; index < RELEASE_PACKAGES.length; index += 1) {
    assert.match(workflow, new RegExp(`start-index\\) <= ${index}`));
  }
  const tarballs = [
    'coral-viz-language-0.2.17.tgz', 'coral-viz-render-0.2.17.tgz',
    'coral-viz-browser-0.2.17.tgz', 'coral-viz-viz-0.2.17.tgz',
    'coral-viz-mcp-server-0.2.17.tgz', 'tree-sitter-coral-0.2.17.tgz',
  ];
  const order = tarballs.map(name => workflow.indexOf(`npm publish ./candidate-artifacts/${name}`));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.doesNotMatch(workflow, /npm publish --workspace/);
});

// CRO100-5 (0.2.5 issue N2): npm propagation exceeded a two-minute window, so
// registry verification polls for at least 15 minutes, bounded, and never
// republishes.
test('registry verification waits a bounded 15-minute propagation window (CRO100-5)', async () => {
  assert.ok(REGISTRY_PROPAGATION_WINDOW_MS >= 15 * 60 * 1000);
  assert.ok(REGISTRY_POLL_INTERVAL_MS > 0 && REGISTRY_POLL_INTERVAL_MS <= 60_000);
  const clock = () => {
    let now = 0;
    return { now: () => now, sleep: async ms => { now += ms; }, elapsed: () => now };
  };
  const never = clock();
  let attempts = 0;
  await assert.rejects(retryWithinWindow(async () => { attempts += 1; throw new Error(`absent ${attempts}`); }, never),
    /absent/);
  assert.ok(never.elapsed() >= 15 * 60 * 1000, `gave up after ${never.elapsed()} ms`);
  assert.ok(never.elapsed() < 15 * 60 * 1000 + REGISTRY_POLL_INTERVAL_MS);
  assert.equal(attempts, Math.floor(REGISTRY_PROPAGATION_WINDOW_MS / REGISTRY_POLL_INTERVAL_MS) + 1);
  const late = clock();
  let calls = 0;
  assert.equal(await retryWithinWindow(async () => {
    calls += 1;
    if (late.elapsed() < 14 * 60 * 1000) throw new Error('not yet');
    return 'propagated';
  }, late), 'propagated');
  assert.ok(late.elapsed() >= 14 * 60 * 1000 && late.elapsed() <= 15 * 60 * 1000);
  assert.equal(calls, (14 * 60 * 1000) / REGISTRY_POLL_INTERVAL_MS + 1);
  const first = clock();
  assert.equal(await retryWithinWindow(async () => 'present', first), 'present');
  assert.equal(first.elapsed(), 0);
});

// CRO100-9: every registry verification runs after at least one package is
// immutable, so a newly disclosed advisory is recorded rather than blocking
// the tag forever. Advisories still block before publication: publish.yml
// audits the workspace, blocking a fresh publication, before any npm publish.
test('post-publication registry verification records advisories without blocking (CRO100-9)', async () => {
  const report = vulnerabilities => JSON.stringify({ metadata: { vulnerabilities } });
  assert.deepEqual(recordRegistryAudit({ status: 1, stdout: report({ info: 0, low: 1, moderate: 0, high: 2, critical: 1, total: 4 }) }), {
    schemaVersion: 1, blocking: false, exitStatus: 1,
    vulnerabilities: { info: 0, low: 1, moderate: 0, high: 2, critical: 1, total: 4 }, highOrCritical: 3,
  });
  assert.equal(recordRegistryAudit({ status: 0, stdout: report({ high: 0, critical: 0 }) }).highOrCritical, 0);
  assert.deepEqual(recordRegistryAudit({ status: 1, stdout: 'npm error audit endpoint returned an error' }), {
    schemaVersion: 1, blocking: false, exitStatus: 1, vulnerabilities: null, highOrCritical: null,
  });
  const source = await readFile(new URL('./release-registry.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /--audit-level/);
  assert.match(source, /run\('npm', \['audit', 'signatures'\], directory\)/);
  const publish = await readFile(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  assert.ok(publish.indexOf('node scripts/workspace-audit.mjs') < publish.indexOf('npm publish ./candidate-artifacts/'));
});

// CRO100-15: preflight runs inside the OIDC-bearing publish job. The registry
// SRI equal to the retained candidate manifest already proves the published
// prefix's bytes, so preflight never installs packages (no lifecycle scripts,
// native builds, or imports); the token-free registry job does that.
test('registry preflight proves a resumed prefix by SRI and never installs it (CRO100-15)', async () => {
  const integrity = name => `sha512-${Buffer.from(name).toString('base64')}`;
  const localIntegrities = Object.fromEntries(RELEASE_PACKAGES.map(name => [name, integrity(name)]));
  const record = name => ({ metadata: { name, version: '0.2.6', integrity: integrity(name) }, attestation: null });
  const expected = { version: '0.2.6', commit, allowPrivateDigest: true, localIntegrities };
  const installs = [];
  const outputs = [];
  const dependencies = records => ({
    readRecords: async () => records,
    verifyInstalled: async names => { installs.push(names); },
    writeOutput: async line => { outputs.push(line); },
    retry: operation => operation(),
  });
  const prefix = RELEASE_PACKAGES.map((name, index) => (index < 3 ? record(name) : null));
  assert.equal(await runRegistryMode('preflight', expected, dependencies(prefix)), 3);
  assert.deepEqual(outputs, ['start-index=3\n']);
  assert.deepEqual(installs, []);
  const wrong = [...prefix];
  wrong[1] = { ...record(RELEASE_PACKAGES[1]), metadata: { ...record(RELEASE_PACKAGES[1]).metadata, integrity: 'sha512-b3RoZXI=' } };
  await assert.rejects(runRegistryMode('preflight', expected, dependencies(wrong)), /integrity mismatch/);
  assert.deepEqual(installs, []);
  assert.equal(await runRegistryMode('verify', expected, dependencies(RELEASE_PACKAGES.map(record))), RELEASE_PACKAGES.length);
  assert.deepEqual(installs, [RELEASE_PACKAGES]);
  await assert.rejects(runRegistryMode('other', expected, dependencies(prefix)), /Expected preflight or verify mode/);
});

// The normal browser collection is whatever CI actually invokes: every
// Playwright step in ci.yml is listed with its own environment and arguments.
test('CI browser invocations are a disjoint complete union of the normal collection without timing files', async () => {
  const list = (args = [], extraEnv = {}) => {
    const env = { ...process.env };
    for (const name of ['PLAYWRIGHT_JSON_OUTPUT_FILE', 'PLAYWRIGHT_JSON_OUTPUT_NAME',
      'PLAYWRIGHT_JSON_OUTPUT_DIR', 'CORAL_E2E_PHASE']) delete env[name];
    const report = JSON.parse(execFileSync(process.execPath, [
      'node_modules/@playwright/test/cli.js', 'test', ...args, '--list', '--reporter=json',
    ], { encoding: 'utf8', env: { ...env, ...extraEnv }, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }));
    assert.deepEqual(report.errors, []);
    const collect = (suite) => [
      ...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => JSON.stringify([
        test.projectName, spec.file, spec.line, spec.column, spec.title, spec.id,
      ]))),
      ...(suite.suites ?? []).flatMap(collect),
    ];
    return { config: report.config, tests: (report.suites ?? []).flatMap(collect) };
  };
  const file = key => JSON.parse(key)[1];
  const assertNormalConfig = (config, label) => {
    assert.equal(config.workers, 4, `${label} uses four workers`);
    assert.ok(config.projects.length > 0 && config.projects.every(project => project.retries === 0), `${label} has zero retries`);
  };
  // Listing overrides the reporter, so the configured reporters are read directly.
  assert.doesNotMatch(await readFile(new URL('../playwright.config.ts', import.meta.url), 'utf8'),
    /\[\s*'(?:html|json|blob|junit)'/, 'normal browser runs write no report capture');

  const ci = parseWorkflow(await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const invocations = Object.entries(ci.jobs).flatMap(([job, value]) => (value.steps ?? [])
    .filter(step => /playwright(?:\/test\/cli\.js)? test\b|npm (?:run )?test:e2e/.test(String(step.run ?? '')))
    .map(step => ({ job, run: String(step.run).trim(), env: { ...value.env, ...step.env } })));
  assert.ok(invocations.length >= 2, 'CI runs the smoke and complete browser phases');
  for (const { job, run } of invocations) {
    assert.match(run, /^npm run test:e2e(?: -- .+)?$/, `${job} uses the canonical normal browser command`);
    assert.doesNotMatch(run, /--(?:retries|workers|shard|grep|config|project|repeat-each)\b/, `${job} keeps the canonical collection`);
  }
  const selected = invocations.map(({ job, run, env }) => {
    const args = run.includes(' -- ') ? run.slice(run.indexOf(' -- ') + 4).split(/\s+/) : [];
    const phase = env.CORAL_E2E_PHASE === undefined ? {} : { CORAL_E2E_PHASE: String(env.CORAL_E2E_PHASE) };
    const listed = list(args, phase);
    assertNormalConfig(listed.config, job);
    assert.ok(listed.tests.length > 0, `${job} selects tests`);
    return listed.tests;
  });

  const all = list();
  assertNormalConfig(all.config, 'default collection');
  assert.equal(new Set(all.tests).size, all.tests.length, 'normal test identities are unique');
  const union = selected.flat();
  assert.equal(new Set(union).size, union.length, 'no test runs in two CI invocations');
  assert.deepEqual([...union].sort(), [...all.tests].sort(), 'CI invocations cover the complete normal collection');

  const performance = list(['--config=playwright.performance.config.ts']);
  assert.equal(performance.config.workers, 1, 'performance measurement is serial');
  assert.ok(performance.config.projects.every(project => project.retries === 0), 'performance has zero retries');
  const timingFiles = new Set(performance.tests.map(file));
  assert.ok(timingFiles.size > 0, 'timing benchmarks remain in the dedicated local collection');
  assert.deepEqual(all.tests.filter(key => timingFiles.has(file(key))), [], 'normal collection contains no timing files');
});
