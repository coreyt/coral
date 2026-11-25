// One coherent schemaVersion 3 final-candidate fixture for proof producer,
// consumer and release-guard tests. Each call returns fresh mutable copies.
// `rerun` names cells re-executed by an authorized failed-job retry: they and
// the aggregate are attempt `runAttempt`; every other cell is attempt 1.
// `workflow` selects the current or legacy workflow name and run title.
import { createHash } from 'node:crypto';
import { CANDIDATE_PACKAGES } from './candidate-artifacts.mjs';
import {
  AGGREGATE_JOB, CLOSED_JOBS, PACKAGE_ARTIFACT, PROOF_ARTIFACT, REQUIRED_CELLS, SITE_ARTIFACT,
  buildFinalCandidateProof,
} from './ci-final-candidate.mjs';
import { finalCandidateRunIdentities } from './release-final-candidate.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';

const at = minutes => new Date(Date.UTC(2026, 9, 16, 10, minutes)).toISOString().replace('.000Z', 'Z');

export function finalCandidateFixture({ runAttempt = 1, rerun = [], workflow = 'Coral CI' } = {}) {
  const sha = 'a'.repeat(40);
  const { title } = finalCandidateRunIdentities(RENDERER_CANDIDATE.version, sha).find(item => item.workflow === workflow);
  const runId = 42;
  const branch = RENDERER_CANDIDATE.candidateRef.slice('refs/heads/'.length);
  const manifest = { schemaVersion: 1, version: RENDERER_CANDIDATE.version, productSha: sha,
    workflow: { runId: String(runId), jobId: 'candidate-packages' },
    packages: CANDIDATE_PACKAGES.map((name, index) => ({
      name, version: RENDERER_CANDIDATE.version, filename: `package-${index}.tgz`, sha256: 'b'.repeat(64),
      integrity: `sha512-${'A'.repeat(86)}==`, files: ['package/package.json'] })) };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const siteBytes = Buffer.from('frozen candidate site.tar bytes\n');
  const env = {
    RELEASE_VERSION: RENDERER_CANDIDATE.version, FULL_MATRIX: 'true', MATRIX_TIER: 'full-matrix',
    FINAL_CANDIDATE: 'true', GITHUB_WORKFLOW: workflow, GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_RUN_ID: String(runId), GITHUB_RUN_ATTEMPT: String(runAttempt), GITHUB_SHA: sha,
    GITHUB_REF: RENDERER_CANDIDATE.candidateRef, GITHUB_JOB: AGGREGATE_JOB,
    CANDIDATE_ARTIFACT_ID: '77', CANDIDATE_ARTIFACT_DIGEST: 'c'.repeat(64),
    CANDIDATE_SITE_ARTIFACT_ID: '78', CANDIDATE_SITE_ARTIFACT_DIGEST: 'd'.repeat(64),
    EXPECTED_VERSION_SHA256: 'e'.repeat(64), EXPECTED_INTEGRITY_SHA256: 'f'.repeat(64),
    // The proof binds the fixture payload bytes.
    EXPECTED_SITE_SHA256: createHash('sha256').update(siteBytes).digest('hex'),
  };
  const needs = Object.fromEntries(CLOSED_JOBS.map(name => [name, { result: 'success' }]));
  // Latest readback: one execution per cell. A rerun cell is a new job ID in
  // the later attempt; the aggregate always runs in the current attempt.
  const cell = (name, index) => {
    const retried = rerun.includes(name);
    const base = retried ? 60 : 0;
    return { id: (retried ? 3000 : 1000) + index, name, run_id: runId, run_attempt: retried ? runAttempt : 1,
      head_sha: sha, status: 'completed', conclusion: 'success', started_at: at(base), completed_at: at(base + 30) };
  };
  const cells = REQUIRED_CELLS.map(cell);
  const aggregate = { id: 2000 + runAttempt, name: AGGREGATE_JOB, run_id: runId, run_attempt: runAttempt,
    head_sha: sha, started_at: at(runAttempt > 1 ? 100 : 40) };
  // The producer reads the latest jobs while the aggregate is still running.
  const attemptJobs = [...cells.map(job => ({ ...job })),
    { ...aggregate, status: 'in_progress', conclusion: null, completed_at: null }];
  const proof = buildFinalCandidateProof({ env, needs, jobs: attemptJobs, manifestBytes });
  const finished = { ...aggregate, status: 'completed', conclusion: 'success',
    completed_at: at(runAttempt > 1 ? 110 : 50) };
  // Each frozen artifact is created ten minutes into its latest producer job.
  const producerTime = name => at((rerun.includes(name) ? 60 : 0) + 10);
  const artifact = (name, id, digest, created) => ({ name, id, digest, expired: false, created_at: created,
    workflow_run: { id: runId, head_sha: sha, head_branch: branch } });
  const evidence = {
    proof,
    run: { id: runId, path: '.github/workflows/ci.yml', run_attempt: runAttempt, event: 'workflow_dispatch',
      status: 'completed', conclusion: 'success', head_sha: sha, head_branch: branch,
      display_title: title },
    jobs: [...cells, finished],
    artifacts: [
      artifact(PACKAGE_ARTIFACT, 77, `sha256:${'c'.repeat(64)}`, producerTime('candidate-packages')),
      artifact(SITE_ARTIFACT, 78, `sha256:${'d'.repeat(64)}`, producerTime('candidate-site')),
      artifact(PROOF_ARTIFACT, 79, `sha256:${'9'.repeat(64)}`, at(runAttempt > 1 ? 105 : 45)),
    ],
  };
  const identity = { commit: sha, runId, version: RENDERER_CANDIDATE.version };
  return { sha, runId, branch, manifest, manifestBytes, siteBytes, env, needs, attemptJobs, proof, evidence, identity };
}
