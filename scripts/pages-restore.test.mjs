import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  inspectPagesTar,
  validateRestoreContext,
  validateSourceEvidence,
} from './pages-restore.mjs';

const commit = 'e28a120e2c94b6af7eeaed0385a444b969e1ac5f';
const runId = 35550226918;
const attempt = 1;
const artifactId = 10616934466;
const artifactDigest = `sha256:${'f'.repeat(64)}`;

const validContext = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'coreyt/coral',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF:
    'coreyt/coral/.github/workflows/pages-restore.yml@refs/heads/main',
};

const validEvidence = {
  expected: {
    version: '0.2.5', commit, runId, attempt, artifactId, artifactDigest,
  },
  run: {
    id: runId,
    run_attempt: attempt,
    event: 'workflow_dispatch',
    path: '.github/workflows/pages.yml',
    head_branch: 'main',
    head_sha: commit,
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'coreyt/coral' },
  },
  jobs: ['build', 'registry', 'deploy'].map((name) => ({
    name, run_id: runId, run_attempt: attempt, head_sha: commit,
    status: 'completed', conclusion: 'success',
    started_at: '2026-09-21T01:14:05Z',
    completed_at: '2026-09-21T01:15:13Z',
  })),
  artifact: {
    id: artifactId,
    name: 'github-pages',
    expired: false,
    digest: artifactDigest,
    created_at: '2026-09-21T01:15:10Z',
    workflow_run: { id: runId, head_sha: commit, head_branch: 'main' },
  },
};
validEvidence.artifacts = [validEvidence.artifact];

function tarOctal(value, width) {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tarEntry(name, content, type = '0') {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(tarOctal(body.length, 12), 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function pagesTar(identity = { product: 'coral', version: '0.2.5', commit }) {
  const version = JSON.stringify(identity);
  const integrity = JSON.stringify({ schemaVersion: 1, identity, files: [] });
  return Buffer.concat([
    tarEntry('./version.json', version),
    tarEntry('./integrity.json', integrity),
    Buffer.alloc(1024),
  ]);
}

test('restore dispatch accepts only the trusted main workflow context', () => {
  assert.doesNotThrow(() => validateRestoreContext(validContext));
  for (const patch of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'someone/fork' },
    { GITHUB_REF: 'refs/heads/release/0.2.5' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_WORKFLOW_REF: 'coreyt/coral/.github/workflows/pages.yml@refs/heads/main' },
  ]) assert.throws(() => validateRestoreContext({ ...validContext, ...patch }), /restore context/i);
});

test('restore binds one successful Pages attempt and one retained artifact', () => {
  assert.doesNotThrow(() => validateSourceEvidence(validEvidence));
  assert.doesNotThrow(() => validateSourceEvidence({
    ...validEvidence, expected: { ...validEvidence.expected, version: '0.2.6' },
  }));
  assert.throws(() => validateSourceEvidence({
    ...validEvidence, expected: { ...validEvidence.expected, version: '0.2.7' },
  }), /supported release/i);
  const failures = [
    { run: { ...validEvidence.run, repository: { full_name: 'someone/fork' } } },
    { run: { ...validEvidence.run, path: '.github/workflows/other.yml' } },
    { run: { ...validEvidence.run, head_branch: 'release/0.2.5' } },
    { run: { ...validEvidence.run, head_sha: 'a'.repeat(40) } },
    { run: { ...validEvidence.run, run_attempt: 2 } },
    { jobs: validEvidence.jobs.map((job) => job.name === 'registry'
      ? { ...job, conclusion: 'failure' } : job) },
    { jobs: validEvidence.jobs.filter((job) => job.name !== 'deploy') },
    { artifacts: [validEvidence.artifact, { ...validEvidence.artifact, id: artifactId + 1 }] },
    { artifacts: [{ ...validEvidence.artifact, id: artifactId + 1 }] },
    { artifact: { ...validEvidence.artifact, created_at: '2026-09-21T01:20:00Z' } },
    { artifact: { ...validEvidence.artifact, expired: true } },
    { artifact: { ...validEvidence.artifact, id: artifactId + 1 } },
    { artifact: { ...validEvidence.artifact, digest: `sha256:${'a'.repeat(64)}` } },
  ];
  for (const patch of failures) {
    assert.throws(() => validateSourceEvidence({ ...validEvidence, ...patch }));
  }
});

test('retained Pages tar is read without extraction and binds payload identity', () => {
  const payload = pagesTar();
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  assert.deepEqual(inspectPagesTar(payload, {
    version: '0.2.5', commit, payloadSha256,
  }), {
    bytes: payload.length,
    payloadSha256,
    versionSha256: createHash('sha256').update(JSON.stringify({
      product: 'coral', version: '0.2.5', commit,
    })).digest('hex'),
    integritySha256: createHash('sha256').update(JSON.stringify({
      schemaVersion: 1,
      identity: { product: 'coral', version: '0.2.5', commit },
      files: [],
    })).digest('hex'),
    identity: { product: 'coral', version: '0.2.5', commit },
  });
  assert.throws(() => inspectPagesTar(payload, {
    version: '0.2.5', commit, payloadSha256: 'a'.repeat(64),
  }), /digest/i);
  const nextPayload = pagesTar({ product: 'coral', version: '0.2.6', commit });
  assert.equal(inspectPagesTar(nextPayload, { version: '0.2.6', commit }).identity.version, '0.2.6');
  assert.throws(() => inspectPagesTar(nextPayload, { version: '0.2.7', commit }), /invalid/i);
  assert.throws(() => inspectPagesTar(pagesTar({
    product: 'coral', version: '0.2.4', commit,
  }), { version: '0.2.5', commit }), /identity/i);
  const traversal = Buffer.concat([
    tarEntry('../version.json', '{}'), tarEntry('./integrity.json', '{}'), Buffer.alloc(1024),
  ]);
  assert.throws(() => inspectPagesTar(traversal, { version: '0.2.5', commit }), /path/i);
  const symlink = Buffer.concat([
    tarEntry('./version.json', '{}', '2'), tarEntry('./integrity.json', '{}'), Buffer.alloc(1024),
  ]);
  assert.throws(() => inspectPagesTar(symlink, { version: '0.2.5', commit }), /type/i);
  const corruptHeader = Buffer.from(payload);
  corruptHeader[0] ^= 1;
  assert.throws(() => inspectPagesTar(corruptHeader, { version: '0.2.5', commit }), /checksum/i);
  const duplicateIdentity = Buffer.concat([
    tarEntry('./version.json', JSON.stringify({ product: 'coral', version: '0.2.5', commit })),
    tarEntry('./version.json', JSON.stringify({ product: 'coral', version: '0.2.5', commit })),
    tarEntry('./integrity.json', JSON.stringify({
      schemaVersion: 1, identity: { product: 'coral', version: '0.2.5', commit }, files: [],
    })),
    Buffer.alloc(1024),
  ]);
  assert.throws(() => inspectPagesTar(duplicateIdentity, { version: '0.2.5', commit }), /duplicate/i);
  assert.throws(() => inspectPagesTar(payload.subarray(0, -512), {
    version: '0.2.5', commit,
  }), /complete/i);
});

test('restore workflow relays retained bytes without build or publication authority', async () => {
  const workflow = await readFile('.github/workflows/pages-restore.yml', 'utf8');
  for (const forbidden of ['npm ', 'build:online', 'upload-pages-artifact', 'npm publish', 'contents: write']) {
    assert.equal(workflow.includes(forbidden), false, `restore contains ${forbidden}`);
  }
  for (const required of [
    'source_run_id:', 'source_attempt:', 'source_artifact_id:',
    'source_artifact_digest:', 'payload_sha256:',
    'group: coral-pages', 'cancel-in-progress: false',
    'actions/download-artifact@', 'actions/upload-artifact@',
    'artifact-ids: ${{ inputs.source_artifact_id }}', 'merge-multiple: true',
    'node scripts/pages-restore.mjs source',
    'node scripts/pages-restore.mjs payload',
    'needs: prepare', 'pages: write', 'id-token: write',
    'actions: read', 'environment:', 'name: github-pages',
    'actions/deploy-pages@',
  ]) assert.ok(workflow.includes(required), `restore omits ${required}`);
});

test('0.2.8 retained deployment uses the same exact-run restore checks', () => {
  const evidence = structuredClone(validEvidence);
  evidence.expected.version = '0.2.8';
  assert.doesNotThrow(() => validateSourceEvidence(evidence));
  evidence.run.head_sha = 'f'.repeat(40);
  assert.throws(() => validateSourceEvidence(evidence), /identity/);
});

test('0.2.9 retained deployment uses the same exact-run restore checks', () => {
  const evidence = structuredClone(validEvidence);
  evidence.expected.version = '0.2.9';
  assert.doesNotThrow(() => validateSourceEvidence(evidence));
  evidence.run.head_sha = 'f'.repeat(40);
  assert.throws(() => validateSourceEvidence(evidence), /identity/);
});
