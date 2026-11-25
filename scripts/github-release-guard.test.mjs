import assert from 'node:assert/strict';
import test from 'node:test';

import { finalCandidateFixture } from './final-candidate-fixture.mjs';
import { deploymentStatusBinding, pagesDeployments, validateGithubReleaseState } from './github-release-guard.mjs';

// The current schemaVersion 3 proof names the frozen candidate-site digests.
const { sha: commit, proof } = finalCandidateFixture();
const expected = { version: '0.2.6', commit, expectedPages: proof.expectedPages };
const base = {
  tag: null,
  release: null,
  pages: {
    run: {
      id: 42, run_attempt: 1, status: 'completed', conclusion: 'success',
      head_sha: commit, head_branch: 'main', event: 'workflow_dispatch',
      path: '.github/workflows/pages.yml', repository: { full_name: 'coreyt/coral' },
    },
    jobs: ['build', 'registry', 'deploy'].map((name, index) => ({
      id: index + 10, name, run_id: 42, run_attempt: 1, head_sha: commit,
      status: 'completed', conclusion: 'success',
      started_at: '2026-09-29T10:00:00Z', completed_at: '2026-09-29T10:05:00Z',
    })),
    artifacts: [{
      id: 77, name: 'github-pages', expired: false,
      digest: `sha256:${'c'.repeat(64)}`, created_at: '2026-09-29T10:02:00Z',
      workflow_run: { id: 42, head_sha: commit, head_branch: 'main' },
    }],
    artifact: {
      id: 77, name: 'github-pages', expired: false,
      digest: `sha256:${'c'.repeat(64)}`, created_at: '2026-09-29T10:02:00Z',
      workflow_run: { id: 42, head_sha: commit, head_branch: 'main' },
    },
    payload: {
      payloadSha256: 'd'.repeat(64),
      versionSha256: 'e'.repeat(64), integritySha256: 'f'.repeat(64),
    },
    deployment: {
      id: 89, sha: commit, ref: 'main', environment: 'github-pages',
      created_at: '2026-09-29T11:03:00Z',
    },
    // Newest first, as GitHub lists them. Actions records the job that ran
    // the environment deployment in log_url and target_url (CRO100-4).
    deploymentStatuses: [{
      state: 'success', environment_url: 'https://coreyt.github.io/coral/',
      log_url: 'https://github.com/coreyt/coral/actions/runs/42/job/12',
      target_url: 'https://github.com/coreyt/coral/actions/runs/42/job/12',
    }, {
      state: 'in_progress', environment_url: '',
      log_url: 'https://github.com/coreyt/coral/actions/runs/42/job/12',
      target_url: 'https://github.com/coreyt/coral/actions/runs/42/job/12',
    }],
  },
  version: { product: 'coral', version: '0.2.6', commit },
  integrity: { schemaVersion: 1, identity: { version: '0.2.6', commit }, files: [] },
  live: { versionSha256: 'e'.repeat(64), integritySha256: 'f'.repeat(64) },
};

test('release readiness permits an absent tag or the same exact annotated tag', () => {
  assert.deepEqual(validateGithubReleaseState(base, expected), []);
  assert.deepEqual(validateGithubReleaseState({
    ...base,
    tag: { type: 'tag', target: commit },
  }, expected), []);
});

test('release readiness rejects unrelated, incomplete, or mismatched Pages evidence', () => {
  const mutations = [
    value => { value.pages.run.path = '.github/workflows/ci.yml'; },
    value => { value.pages.jobs[2].conclusion = 'skipped'; },
    value => { value.pages.artifact.digest = `sha256:${'0'.repeat(64)}`; },
    value => { value.pages.deploymentStatuses[0].state = 'failure'; },
    value => { value.live.integritySha256 = '0'.repeat(64); },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(base);
    mutate(value);
    assert.notDeepEqual(validateGithubReleaseState(value, expected), []);
  }
});

test('release readiness rejects lightweight and conflicting tags', () => {
  assert.match(validateGithubReleaseState({
    ...base,
    tag: { type: 'commit', target: commit },
  }, expected).join('\n'), /annotated/i);
  assert.match(validateGithubReleaseState({
    ...base,
    tag: { type: 'tag', target: 'b'.repeat(40) },
  }, expected).join('\n'), /different commit/i);
});

test('release readiness permits only the exact already-completed release', () => {
  assert.deepEqual(validateGithubReleaseState({
    ...base,
    tag: { type: 'tag', target: commit },
    release: { tag_name: 'v0.2.6', draft: false, prerelease: false, immutable: true },
  }, expected), []);
  assert.match(validateGithubReleaseState({
    ...base,
    release: { tag_name: 'v0.2.6', draft: true, prerelease: false },
  }, expected).join('\n'), /published release/i);
});

test('release readiness binds the live deployment to the pages.yml run and CI-built digests (DRO100-24)', () => {
  for (const [pattern, mutate] of [
    [/deployment identity/, value => { value.pages.deploymentStatuses.forEach(status => { status.log_url = status.log_url.replace('/runs/42/', '/runs/43/'); status.target_url = status.log_url; }); }],
    [/final-candidate build/, value => { value.live.integritySha256 = '1'.repeat(64); value.pages.payload.integritySha256 = '1'.repeat(64); }],
  ]) {
    const value = structuredClone(base);
    mutate(value);
    assert.match(validateGithubReleaseState(value, expected).join('\n'), pattern);
  }
});

// TRO100-7: one targeted mutation per release-guard condition.
test('release guard rejects each repository, deployment and hosted condition (TRO100-7)', () => {
  for (const [pattern, mutate] of [
    [/published release/, value => { value.release = { tag_name: 'v0.2.6', draft: false, prerelease: true, immutable: true }; }],
    [/published release/, value => { value.release = { tag_name: 'v0.2.5', draft: false, prerelease: false, immutable: true }; }],
    [/deployment identity/, value => { value.pages.deployment.sha = 'b'.repeat(40); }],
    [/deployment identity/, value => { value.pages.deployment.ref = 'release/0.2.6'; }],
    [/deployment identity/, value => { value.pages.deployment.environment = 'preview'; }],
    [/deployment identity/, value => { value.pages.deploymentStatuses.forEach(status => { status.log_url = status.log_url.replace('/job/12', '/job/11'); status.target_url = status.log_url; }); }],
    [/deployment identity/, value => { value.pages.deploymentStatuses = []; }],
    [/deployment identity/, value => { value.pages.deploymentStatuses[0].environment_url = 'https://example.test/coral/'; }],
    [/hosted version identity/, value => { value.version.version = '0.2.5'; }],
    [/hosted version identity/, value => { value.version.commit = 'b'.repeat(40); }],
    [/hosted version identity/, value => { value.version.product = 'other'; }],
    [/hosted integrity identity/, value => { value.integrity.schemaVersion = 2; }],
    [/hosted integrity identity/, value => { value.integrity.identity.version = '0.2.5'; }],
    [/hosted integrity identity/, value => { value.integrity.identity.commit = 'b'.repeat(40); }],
    [/hosted integrity identity/, value => { delete value.integrity.files; }],
    // The retained payload digests are compared with the live bytes on their own:
    // the live bytes still equal the final-candidate build here.
    [/retained Pages payload/, value => { value.pages.payload.versionSha256 = '1'.repeat(64); }],
    [/retained Pages payload/, value => { value.pages.payload.integritySha256 = '1'.repeat(64); }],
    [/retained Pages payload/, value => { value.pages.payload.payloadSha256 = 'opaque'; }],
    [/final-candidate build digests/, value => { value.live.versionSha256 = '1'.repeat(64); value.pages.payload.versionSha256 = '1'.repeat(64); }],
  ]) {
    const value = structuredClone(base);
    mutate(value);
    const errors = validateGithubReleaseState(value, expected);
    assert.match(errors.join('\n'), pattern);
  }
  // Each payload mutation above leaves the final-candidate comparison passing.
  const payloadOnly = structuredClone(base);
  payloadOnly.pages.payload.versionSha256 = '1'.repeat(64);
  assert.deepEqual(validateGithubReleaseState(payloadOnly, expected), ['hosted bytes do not match the retained Pages payload']);
});

// CRO100-3: GITHUB_TOKEN cannot read the repository's immutable-release
// setting (an administration endpoint), so the guard does not require it; the
// operator checks the setting and an existing release must itself
// read back as immutable.
test('the release guard needs no administration read and requires an existing release to be immutable (CRO100-3)', () => {
  assert.deepEqual(validateGithubReleaseState(structuredClone(base), expected), []);
  const withRepository = { ...structuredClone(base), repository: { immutable_releases: false } };
  assert.deepEqual(validateGithubReleaseState(withRepository, expected), []);
  for (const immutable of [false, undefined]) {
    assert.match(validateGithubReleaseState({
      ...structuredClone(base),
      tag: { type: 'tag', target: commit },
      release: { tag_name: 'v0.2.6', draft: false, prerelease: false, immutable },
    }, expected).join('\n'), /is not immutable/);
  }
});

// CRO100-4: Actions can create an environment deployment before the job's
// started_at (the environment gate runs first), so the Pages deployment is
// bound through its statuses' log_url/target_url, never a time window.
test('the Pages deployment is bound to its run and job, not to the job clock (CRO100-4)', () => {
  const early = structuredClone(base);
  early.pages.deployment.created_at = '2026-09-29T09:59:58Z';
  assert.deepEqual(validateGithubReleaseState(early, expected), []);
  const late = structuredClone(base);
  late.pages.deployment.created_at = '2026-09-29T11:05:01Z';
  assert.deepEqual(validateGithubReleaseState(late, expected), []);
  assert.deepEqual(deploymentStatusBinding({ log_url: 'https://github.com/coreyt/coral/actions/runs/43/job/21' }), { runId: 43, jobId: 21 });
  assert.deepEqual(deploymentStatusBinding({ log_url: '', target_url: 'https://github.com/coreyt/coral/actions/runs/43/attempts/2/job/21' }),
    { runId: 43, jobId: 21 });
  assert.deepEqual(deploymentStatusBinding({ log_url: 'https://github.com/coreyt/coral/actions/runs/43' }), { runId: 43, jobId: null });
  for (const url of [
    'https://github.com/someone/coral/actions/runs/43/job/21', 'https://github.com/coreyt/coral/actions/runs/43x',
    'http://github.com/coreyt/coral/actions/runs/43/job/21', 'https://coreyt.github.io/coral/', undefined,
  ]) assert.equal(deploymentStatusBinding({ log_url: url }), null, String(url));
  const deployment = id => ({ id, sha: commit, ref: 'main', environment: 'github-pages' });
  const status = (runId, jobId) => ({ state: 'success', log_url: `https://github.com/coreyt/coral/actions/runs/${runId}/job/${jobId}` });
  const binding = { commit, runId: 43, jobId: 21 };
  const statuses = { 88: [status(42, 12)], 89: [status(43, 21)], 90: [status(44, 30)] };
  assert.deepEqual(pagesDeployments({ deployments: [88, 89, 90].map(deployment), statuses }, binding).map(item => item.id), [89]);
  assert.deepEqual(pagesDeployments({ deployments: [88, 89].map(deployment), statuses: { 88: [status(42, 12)], 89: [status(43, 22)] } }, binding), []);
  assert.deepEqual(pagesDeployments({ deployments: [89].map(deployment), statuses: { 89: [{ state: 'success', log_url: 'https://github.com/coreyt/coral/actions/runs/43' }] } }, binding)
    .map(item => item.id), [89]);
  const foreign = { ...deployment(89), sha: 'b'.repeat(40) };
  assert.deepEqual(pagesDeployments({ deployments: [foreign], statuses }, binding), []);
});

// The live guard is strict: main is at productSha, so the deployment must be too.
test('the live guard rejects a deployment at any other commit or no longer current', () => {
  const otherSha = 'b'.repeat(40);
  const deploymentOnly = structuredClone(base);
  deploymentOnly.pages.deployment.sha = otherSha;
  assert.match(validateGithubReleaseState(deploymentOnly, expected).join('\n'), /Pages deployment identity or result mismatch/);
  const inactive = structuredClone(base);
  inactive.pages.deploymentStatuses[0].state = 'inactive';
  assert.match(validateGithubReleaseState(inactive, expected).join('\n'), /Pages deployment identity or result mismatch/);
});
