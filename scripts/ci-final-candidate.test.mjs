import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ALWAYS_JOBS, ARTIFACT_CONSUMERS, CLOSED_JOBS, FULL_MATRIX_JOBS, MATRIX_CELLS, REQUIRED_CELLS,
  bindLatestJobs, buildFinalCandidateProof, canonicalArtifactDigest,
  evaluateFinalCandidate, expectedPagesFromOutputs, githubRead, githubReadAll,
} from './ci-final-candidate.mjs';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import {
  validateCandidateManifestBinding, validateCandidateSiteBinding,
  finalCandidateRunIdentities, validateFinalCandidateEvidence, validateRestoredSite,
} from './release-final-candidate.mjs';
import { finalCandidateFixture } from './final-candidate-fixture.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
import { contextErrors } from './workflow-policy.mjs';

const success = Object.fromEntries(CLOSED_JOBS.map(name => [name, { result: 'success' }]));
const skippedFull = () => {
  const needs = structuredClone(success);
  for (const name of FULL_MATRIX_JOBS) needs[name].result = 'skipped';
  return needs;
};
const errorsOf = (evidence, identity) => validateFinalCandidateEvidence(evidence, identity).join('\n');

test('the closed job set and exact matrix cells match the current CI obligations', () => {
  assert.deepEqual(ALWAYS_JOBS, ['classify', 'source-checks']);
  assert.deepEqual(FULL_MATRIX_JOBS, [
    'candidate-packages', 'candidate-site', 'windows-risk', 'contracts', 'consumers',
    'baseline-consumer', 'react-consumers', 'native-smoke', 'browser-smoke', 'unit',
    'windows-product', 'e2e', 'online-delivery',
  ]);
  assert.deepEqual(MATRIX_CELLS, {
    consumers: ['consumers (26.8.2)', 'consumers (24.19.0)'],
    'react-consumers': ['react-consumers (18)', 'react-consumers (19)'],
    'native-smoke': ['native-smoke (ubuntu-latest)', 'native-smoke (macos-15)', 'native-smoke (windows-latest)'],
  });
  assert.equal(REQUIRED_CELLS.length, CLOSED_JOBS.length - 3 + 7);
  assert.equal(new Set(REQUIRED_CELLS).size, REQUIRED_CELLS.length);
  assert.ok(!REQUIRED_CELLS.includes('final-candidate'));
});

test('full candidate requires the closed job set to succeed', () => {
  assert.deepEqual(evaluateFinalCandidate({
    needs: success, fullMatrix: 'true', tier: 'full-matrix', finalCandidate: true,
  }), { ok: true, finalCandidate: true });
  for (const name of CLOSED_JOBS) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const needs = structuredClone(success);
      needs[name].result = result;
      assert.equal(evaluateFinalCandidate({
        needs, fullMatrix: 'true', tier: 'full-matrix', finalCandidate: true,
      }).ok, false, `${name} ${result}`);
    }
  }
});

test('aggregate rejects missing classification, missing jobs and unknown jobs', () => {
  assert.equal(evaluateFinalCandidate({ needs: success, tier: 'full-matrix' }).ok, false);
  const extra = { ...success, surprise: { result: 'success' } };
  assert.equal(evaluateFinalCandidate({
    needs: extra, fullMatrix: 'true', tier: 'full-matrix', finalCandidate: true,
  }).ok, false);
  const missing = structuredClone(success);
  delete missing['windows-product'];
  assert.match(evaluateFinalCandidate({
    needs: missing, fullMatrix: 'true', tier: 'full-matrix', finalCandidate: true,
  }).errors.join('\n'), /closed job inventory/);
});

test('reduced run passes only the recognized docs and release-record tier', () => {
  assert.equal(evaluateFinalCandidate({
    needs: skippedFull(), fullMatrix: 'false', tier: 'docs-release-records', finalCandidate: false,
  }).ok, true);
  assert.equal(evaluateFinalCandidate({
    needs: skippedFull(), fullMatrix: 'false', tier: 'unknown', finalCandidate: false,
  }).ok, false);
});

test('upload-artifact digest output is normalized to the REST readback identity', () => {
  const bare = 'a'.repeat(64);
  assert.equal(canonicalArtifactDigest(bare), `sha256:${bare}`);
  assert.equal(canonicalArtifactDigest(`sha256:${bare}`), `sha256:${bare}`);
  assert.throws(() => canonicalArtifactDigest('SHA256:' + bare));
  assert.throws(() => canonicalArtifactDigest('a'.repeat(63)));
});

test('the proof carries the frozen candidate-site digests Pages must restore', () => {
  const digests = { versionSha256: 'a'.repeat(64), integritySha256: 'b'.repeat(64), payloadSha256: 'c'.repeat(64) };
  assert.deepEqual(expectedPagesFromOutputs(digests), digests);
  for (const bad of [{}, { ...digests, versionSha256: '' }, { ...digests, integritySha256: 'x'.repeat(64) },
    { ...digests, payloadSha256: undefined }]) {
    assert.throws(() => expectedPagesFromOutputs(bad), /candidate-site/);
  }
});

test('each aggregate condition fails on its own', () => {
  const errors = input => evaluateFinalCandidate(input).errors?.join('\n') ?? '';
  // A final candidate may never use the reduced tier, even when every job skipped cleanly.
  assert.match(errors({ needs: skippedFull(), fullMatrix: 'false', tier: 'docs-release-records', finalCandidate: true }),
    /final candidate cannot use a reduced run/);
  // A reduced run cannot hide a failed, cancelled or unexpected full-matrix job.
  for (const result of ['failure', 'cancelled', 'success']) {
    const needs = skippedFull();
    needs['native-smoke'].result = result;
    assert.match(errors({ needs, fullMatrix: 'false', tier: 'docs-release-records', finalCandidate: false }),
      /native-smoke must be skipped in a reduced run/, result);
  }
  // Always-run jobs are unconditional in both tiers.
  for (const name of ALWAYS_JOBS) {
    for (const [needs, fullMatrix, tier] of [
      [structuredClone(success), 'true', 'full-matrix'],
      [skippedFull(), 'false', 'docs-release-records'],
    ]) {
      needs[name].result = 'failure';
      assert.match(errors({ needs, fullMatrix, tier, finalCandidate: false }), new RegExp(`${name} must succeed`));
    }
  }
  assert.match(errors({ needs: success, fullMatrix: 'true', tier: 'docs-release-records', finalCandidate: true }),
    /full matrix requires the full-matrix tier/);
  assert.match(errors({ needs: success, fullMatrix: 'yes', tier: 'full-matrix' }), /exactly true or false/);
});

test('the schemaVersion 3 proof binds actual completed cells, artifacts and no performance claim', () => {
  const { proof, env, manifestBytes, siteBytes } = finalCandidateFixture();
  assert.equal(proof.schemaVersion, 3);
  assert.equal(proof.version, env.RELEASE_VERSION);
  assert.equal(proof.fullMatrix, true);
  assert.equal(proof.tier, 'full-matrix');
  assert.equal(proof.performanceMeasured, false);
  assert.deepEqual(Object.keys(proof).filter(key => /budget|latency|timing/i.test(key)), []);
  assert.deepEqual(proof.jobResults, Object.fromEntries(CLOSED_JOBS.map(name => [name, 'success'])));
  assert.deepEqual(proof.jobs.map(job => job.name), REQUIRED_CELLS);
  assert.ok(proof.jobs.every(job => job.conclusion === 'success' && job.runAttempt === 1 && job.id > 0));
  assert.deepEqual(proof.aggregateJob, { name: 'final-candidate', id: 2001, runAttempt: 1, result: 'success' });
  assert.deepEqual(proof.candidateArtifact, { id: 77, digest: `sha256:${'c'.repeat(64)}` });
  assert.deepEqual(proof.siteArtifact, { id: 78, digest: `sha256:${'d'.repeat(64)}` });
  assert.equal(proof.candidateManifestSha256, createHash('sha256').update(manifestBytes).digest('hex'));
  assert.deepEqual(proof.expectedPages, {
    versionSha256: 'e'.repeat(64), integritySha256: 'f'.repeat(64),
    payloadSha256: createHash('sha256').update(siteBytes).digest('hex'),
  });
});

test('the producer refuses reduced, non-final, unbound and incomplete inputs', () => {
  const fixture = finalCandidateFixture();
  const build = (env = {}, extra = {}) => buildFinalCandidateProof({
    env: { ...fixture.env, ...env }, needs: fixture.needs, jobs: fixture.attemptJobs,
    manifestBytes: fixture.manifestBytes, ...extra,
  });
  assert.throws(() => build({ FULL_MATRIX: 'false', MATRIX_TIER: 'docs-release-records' }, { needs: skippedFull() }),
    /reduced run/);
  assert.throws(() => build({ FINAL_CANDIDATE: 'false' }), /final candidate/);
  for (const [name, pattern] of [
    ['CANDIDATE_ARTIFACT_ID', /Candidate artifact ID/], ['CANDIDATE_SITE_ARTIFACT_ID', /Candidate site artifact ID/],
    ['CANDIDATE_SITE_ARTIFACT_DIGEST', /SHA-256/], ['EXPECTED_SITE_SHA256', /candidate-site/],
    ['EXPECTED_VERSION_SHA256', /candidate-site/], ['EXPECTED_INTEGRITY_SHA256', /candidate-site/],
  ]) assert.throws(() => build({ [name]: '0' }), pattern, name);
  for (const env of [{ GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'push' }, { RELEASE_VERSION: '0.2.6' },
    { GITHUB_JOB: 'other' }, { GITHUB_RUN_ATTEMPT: '0' }]) assert.throws(() => build(env), undefined, JSON.stringify(env));
  for (const mutation of [{ version: '0.2.6' }, { productSha: 'd'.repeat(40) },
    { workflow: { runId: '41', jobId: 'candidate-packages' } }, { workflow: { runId: '42', jobId: 'unit' } }]) {
    assert.throws(() => build({}, { manifestBytes: Buffer.from(JSON.stringify({ ...fixture.manifest, ...mutation })) }),
      undefined, JSON.stringify(mutation));
  }
});

test('artifact consumers match the jobs that download each frozen artifact in ci.yml', async () => {
  const ci = parse(await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const downloads = name => Object.entries(ci.jobs).filter(([, job]) => (job.steps ?? []).some(step =>
    String(step.uses ?? '').startsWith('actions/download-artifact@') && step.with?.name === name)).map(([id]) => id).sort();
  assert.deepEqual([...ARTIFACT_CONSUMERS['candidate-packages']].sort(), downloads('node-26-candidate-packages'));
  assert.deepEqual([...ARTIFACT_CONSUMERS['candidate-site']].sort(), downloads('candidate-site'));
});

test('job binding records each latest cell and refuses failed, foreign and unordered cells', () => {
  const { attemptJobs, runId, sha } = finalCandidateFixture();
  const bind = (jobs, runAttempt = 1) => () => bindLatestJobs(jobs, { runId, runAttempt, headSha: sha });
  assert.equal(bind(attemptJobs)().cells.length, REQUIRED_CELLS.length);
  const change = (name, patch) => jobs => jobs.map(job => job.name === name ? { ...job, ...patch } : job);
  for (const [pattern, mutate, runAttempt] of [
    [/exact required cell set/, jobs => jobs.filter(job => job.name !== 'native-smoke (macos-15)')],
    [/exact required cell set/, jobs => [...jobs, { ...jobs[0], id: 5000, name: 'native-smoke (ubuntu-22.04)' }]],
    [/exact required cell set/, change('consumers (24.19.0)', { name: 'consumers (24)' })],
    [/exact required cell set/, jobs => jobs.filter(job => job.name !== 'final-candidate')],
    [/duplicate cell names/, jobs => [...jobs, { ...jobs[0], id: 5000 }]],
    [/did not complete successfully/, change('react-consumers (18)', { conclusion: 'failure' })],
    [/did not complete successfully/, change('windows-product', { conclusion: 'skipped' })],
    [/did not complete successfully/, change('e2e', { status: 'in_progress', conclusion: null })],
    [/not a job of this run at the candidate SHA/, change('unit', { head_sha: 'b'.repeat(40) })],
    [/not a job of this run at the candidate SHA/, change('unit', { run_id: 43 })],
    [/not a job of this run at the candidate SHA/, change('unit', { run_id: '42' })],
    [/invalid run attempt/, change('e2e', { run_attempt: 2 })],
    [/invalid run attempt/, change('e2e', { run_attempt: 0 })],
    [/no job ID/, change('contracts', { id: '1' })],
    [/not the current attempt/, change('final-candidate', { run_attempt: 1 }), 2],
    [/not the running aggregate/, change('final-candidate', { status: 'completed', conclusion: 'success' })],
  ]) assert.throws(bind(mutate(structuredClone(attemptJobs)), runAttempt), pattern);
});

test('a failed-job retry on the unchanged SHA keeps earlier successful cells of the same run', () => {
  const { proof, evidence, identity } = finalCandidateFixture({ runAttempt: 2, rerun: ['unit', 'e2e'] });
  assert.equal(proof.runAttempt, 2);
  assert.deepEqual(proof.aggregateJob, { name: 'final-candidate', id: 2002, runAttempt: 2, result: 'success' });
  assert.deepEqual(proof.jobs.filter(job => job.runAttempt === 2).map(job => job.name), ['unit', 'e2e']);
  assert.equal(proof.jobs.find(job => job.name === 'candidate-packages').runAttempt, 1);
  assert.deepEqual(validateFinalCandidateEvidence(evidence, identity), []);
  // Rerunning a producer in a later attempt reruns its consumers too.
  const producer = finalCandidateFixture({ runAttempt: 2, rerun: ['candidate-site', 'browser-smoke', 'e2e', 'online-delivery'] });
  assert.deepEqual(validateFinalCandidateEvidence(producer.evidence, producer.identity), []);
});

test('a retry cannot keep a consumer that predates its producer or a later failure', () => {
  // The site was rebuilt in attempt 2, but browser-smoke kept attempt 1 bytes.
  assert.throws(() => finalCandidateFixture({ runAttempt: 2, rerun: ['candidate-site', 'e2e', 'online-delivery'] }),
    /browser-smoke predates the latest candidate-site attempt/);
  assert.throws(() => finalCandidateFixture({ runAttempt: 3, rerun: ['candidate-packages'] }),
    /predates the latest candidate-packages attempt/);
  const { evidence, identity } = finalCandidateFixture({ runAttempt: 2, rerun: ['unit'] });
  const latest = (name, patch) => ({ ...evidence, jobs: evidence.jobs.map(job => job.name === name ? { ...job, ...patch } : job) });
  // An earlier success never substitutes for the cell's later latest execution.
  for (const [pattern, value] of [
    [/unit did not complete successfully/, latest('unit', { id: 4015, conclusion: 'failure' })],
    [/unit proof cell does not match its latest live job/, latest('unit', { id: 4015 })],
    [/contracts proof cell does not match its latest live job/, latest('contracts', { run_attempt: 2 })],
    [/not a job of this run at the candidate SHA/, latest('contracts', { head_sha: 'b'.repeat(40) })],
    [/not a job of this run at the candidate SHA/, latest('contracts', { run_id: 41 })],
    [/final-candidate is not the current attempt/, latest('final-candidate', { run_attempt: 1 })],
    [/aggregate job ID does not match/, latest('final-candidate', { id: 2001 })],
  ]) assert.match(errorsOf(value, identity), pattern);
  assert.match(errorsOf({ ...evidence, run: { ...evidence.run, run_attempt: 3 } }, identity), /run attempt mismatch/);
  // After the site producer reran, an artifact from its first execution is refused.
  const rebuilt = finalCandidateFixture({ runAttempt: 2, rerun: ['candidate-site', 'browser-smoke', 'e2e', 'online-delivery'] });
  const stale = { ...rebuilt.evidence, artifacts: rebuilt.evidence.artifacts.map(item =>
    item.name === 'candidate-site' ? { ...item, created_at: '2026-10-16T10:10:00Z' } : item) };
  assert.match(errorsOf(stale, rebuilt.identity), /candidate-site artifact readback does not match the proof and its latest producer/);
});

test('the release verifier accepts the coherent current proof and its live readback', () => {
  const { evidence, identity, proof, manifestBytes, siteBytes } = finalCandidateFixture();
  assert.deepEqual(validateFinalCandidateEvidence(evidence, identity), []);
  assert.deepEqual(validateCandidateManifestBinding(proof, manifestBytes,
    { version: identity.version, productSha: identity.commit }).errors, []);
  assert.deepEqual(validateCandidateSiteBinding(proof, siteBytes).errors, []);
});

test('the release verifier accepts the legacy CI name and title and the current Coral CI pair, never a mix', () => {
  const legacy = finalCandidateFixture({ workflow: 'CI' });
  assert.equal(legacy.proof.workflow, 'CI');
  assert.equal(legacy.evidence.run.display_title, `final-candidate=true sha=${legacy.sha}`);
  assert.deepEqual(validateFinalCandidateEvidence(legacy.evidence, legacy.identity), []);
  const current = finalCandidateFixture();
  assert.equal(current.proof.workflow, 'Coral CI');
  assert.equal(current.evidence.run.display_title, `Coral ${RENDERER_CANDIDATE.version} — Release validation`);
  assert.deepEqual(validateFinalCandidateEvidence(current.evidence, current.identity), []);
  const run = (evidence, patch) => ({ ...evidence, run: { ...evidence.run, ...patch } });
  const proof = (evidence, workflow) => ({ ...evidence, proof: { ...evidence.proof, workflow } });
  for (const [pattern, evidence] of [
    [/run title mismatch/, run(legacy.evidence, { display_title: current.evidence.run.display_title })],
    [/run title mismatch/, run(current.evidence, { display_title: legacy.evidence.run.display_title })],
    [/run title mismatch/, run(legacy.evidence, { display_title: `final-candidate=true sha=${'b'.repeat(40)}` })],
    [/run title mismatch/, run(current.evidence, { display_title: 'Coral 0.2.7 — Release validation' })],
    [/run title mismatch/, run(current.evidence, { display_title: 'Coral 0.2.8 — Release validation' })],
    [/run title mismatch/, run(current.evidence, { display_title: 'Coral CI — release/0.2.9' })],
    [/workflow identity mismatch/, proof(current.evidence, 'Coral')],
    [/workflow identity mismatch/, proof(legacy.evidence, 'ci')],
    [/workflow identity mismatch/, run(current.evidence, { path: '.github/workflows/coral-ci.yml' })],
  ]) assert.match(errorsOf(evidence, current.identity), pattern);
  // The current title carries no SHA; the run, proof, jobs and artifacts still bind it.
  assert.match(errorsOf(current.evidence, { ...current.identity, commit: 'b'.repeat(40) }), /SHA mismatch/);
});

test('ci.yml is Coral CI and titles only the final candidate as release validation', async () => {
  const ci = parse(await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  assert.equal(ci.name, 'Coral CI');
  const title = finalCandidateRunIdentities(RENDERER_CANDIDATE.version, 'a'.repeat(40))
    .find(item => item.workflow === ci.name).title;
  assert.equal(ci['run-name'], `\${{ inputs.final_candidate == true && '${title}' || github.event_name == 'pull_request' `
    + "&& format('Coral CI — pull request {0}', github.event.pull_request.number) || format('Coral CI — {0}', github.ref) }}");
  assert.deepEqual(contextErrors(ci['run-name']), []);
});

test('the release verifier rejects schema 2 and every weakened proof claim', () => {
  const { evidence, identity } = finalCandidateFixture();
  const proof = mutate => ({ ...evidence, proof: mutate(structuredClone(evidence.proof)) });
  for (const [pattern, value] of [
    [/schemaVersion must be 3/, proof(value => ({ ...value, schemaVersion: 2 }))],
    [/proof version mismatch/, proof(value => ({ ...value, version: '0.2.6' }))],
    [/workflow identity mismatch/, proof(value => ({ ...value, workflow: 'Other' }))],
    [/full final candidate/, proof(value => ({ ...value, fullMatrix: false }))],
    [/full final candidate/, proof(value => ({ ...value, tier: 'docs-release-records' }))],
    [/performance was not measured/, proof(value => ({ ...value, performanceMeasured: true }))],
    [/performance was not measured/, proof(value => { delete value.performanceMeasured; return value; })],
    [/closed successful set/, proof(value => { value.jobResults.unit = 'skipped'; return value; })],
    [/closed successful set/, proof(value => { delete value.jobResults['windows-risk']; return value; })],
    [/proof does not bind every required cell/, proof(value => { value.jobs.pop(); return value; })],
    [/proof does not bind every required cell/, proof(value => { value.jobs.reverse(); return value; })],
    [/proof cell does not match its latest live job/, proof(value => { value.jobs[3].conclusion = 'failure'; return value; })],
    [/proof cell does not match its latest live job/, proof(value => { value.jobs[3].runAttempt = 2; return value; })],
    [/proof cell does not match its latest live job/, proof(value => { value.jobs[5].id += 1; return value; })],
    [/aggregate proof/, proof(value => { value.aggregateJob.runAttempt = 2; return value; })],
    [/aggregate job ID does not match/, proof(value => { value.aggregateJob.id = 2000; return value; })],
    [/candidate artifact readback|node-26-candidate-packages artifact/, proof(value => { value.candidateArtifact.id = 1; return value; })],
    [/candidate-site artifact/, proof(value => { value.siteArtifact.digest = `sha256:${'0'.repeat(64)}`; return value; })],
    [/site artifact identity/, proof(value => { delete value.siteArtifact; return value; })],
    [/frozen candidate site digests/, proof(value => { delete value.expectedPages.payloadSha256; return value; })],
    [/manifest digest is missing/, proof(value => ({ ...value, candidateManifestSha256: 'x' }))],
    [/aggregate proof/, proof(value => ({ ...value, aggregateJob: { name: 'final-candidate', result: 'failure' } }))],
  ]) assert.match(errorsOf(value, identity), pattern);
});

test('the release verifier rejects run, cell and artifact readback mismatches', () => {
  const { evidence, identity } = finalCandidateFixture();
  const jobs = mutate => ({ ...evidence, jobs: mutate(structuredClone(evidence.jobs)) });
  const artifacts = mutate => ({ ...evidence, artifacts: mutate(structuredClone(evidence.artifacts)) });
  for (const [pattern, value] of [
    [/workflow identity mismatch/, { ...evidence, run: { ...evidence.run, path: '.github/workflows/other.yml' } }],
    [/candidate ref mismatch/, { ...evidence, run: { ...evidence.run, head_branch: 'main' } }],
    [/run attempt mismatch/, { ...evidence, run: { ...evidence.run, run_attempt: 2 } }],
    [/complete successfully/, { ...evidence, run: { ...evidence.run, conclusion: 'failure' } }],
    [/SHA mismatch/, { ...evidence, run: { ...evidence.run, head_sha: 'b'.repeat(40) } }],
    [/run title mismatch/, { ...evidence, run: { ...evidence.run, display_title: 'push' } }],
    [/manual dispatch/, { ...evidence, run: { ...evidence.run, event: 'push' } }],
    [/exact required cell set/, jobs(value => value.filter(job => job.name !== 'native-smoke (windows-latest)'))],
    [/exact required cell set/, jobs(value => [...value, { ...value[0], id: 9999, name: 'unexpected' }])],
    [/duplicate cell names/, jobs(value => [...value, { ...value[0] }])],
    [/did not complete successfully/, jobs(value => value.map(job => job.name === 'baseline-consumer' ? { ...job, conclusion: 'cancelled' } : job))],
    [/invalid run attempt/, jobs(value => value.map(job => job.name === 'consumers (26.8.2)' ? { ...job, run_attempt: 2 } : job))],
    [/not the current attempt/, jobs(value => value.map(job => job.name === 'final-candidate' ? { ...job, run_attempt: 2 } : job))],
    [/aggregate job ID does not match/, jobs(value => value.map(job => job.name === 'final-candidate' ? { ...job, id: 1 } : job))],
    [/browser-smoke proof cell does not match/, jobs(value => value.map(job => job.name === 'browser-smoke' ? { ...job, id: 1 } : job))],
    [/node-26-candidate-packages artifact/, artifacts(value => value.map(item => item.name === 'node-26-candidate-packages' ? { ...item, id: 1 } : item))],
    [/node-26-candidate-packages artifact/, artifacts(value => value.map(item => item.name === 'node-26-candidate-packages' ? { ...item, expired: true } : item))],
    [/candidate-site artifact/, artifacts(value => value.filter(item => item.name !== 'candidate-site'))],
    [/candidate-site artifact/, artifacts(value => [...value, { ...value[1], id: 99 }])],
    [/candidate-site artifact/, artifacts(value => value.map(item => item.name === 'candidate-site' ? { ...item, workflow_run: { ...item.workflow_run, id: 43 } } : item))],
    [/final-candidate-proof artifact/, artifacts(value => value.filter(item => item.name !== 'final-candidate-proof'))],
    // Created before the latest producer job started: another execution.
    [/node-26-candidate-packages artifact/, artifacts(value => value.map(item => item.name === 'node-26-candidate-packages' ? { ...item, created_at: '2026-10-16T09:59:00Z' } : item))],
    [/candidate-site artifact/, artifacts(value => value.map(item => item.name === 'candidate-site' ? { ...item, created_at: '2026-10-16T09:59:59Z' } : item))],
    [/final-candidate-proof artifact/, artifacts(value => value.map(item => item.name === 'final-candidate-proof' ? { ...item, created_at: '2026-10-16T10:20:00Z' } : item))],
    [/candidate-site artifact/, artifacts(value => value.map(item => item.name === 'candidate-site' ? { ...item, created_at: undefined } : item))],
  ]) assert.match(errorsOf(value, identity), pattern);
  // Artifact and job clocks are separate services; an upload recorded after
  // its producer's completion time is not a different execution.
  const skewed = artifacts(value => value.map(item => ({ ...item, created_at: '2026-10-16T12:00:00Z' })));
  assert.deepEqual(validateFinalCandidateEvidence(skewed, identity), []);
  assert.match(errorsOf(evidence, { ...identity, version: '0.2.6' }), /unapproved candidate version/);
  assert.match(errorsOf(evidence, { ...identity, commit: 'b'.repeat(40) }), /SHA mismatch/);
  assert.match(errorsOf(evidence, { ...identity, runId: 43 }), /run ID mismatch/);
});

test('downloaded manifest and site bytes must be the proved bytes', () => {
  const { proof, manifestBytes, siteBytes, identity } = finalCandidateFixture();
  assert.match(validateCandidateManifestBinding(proof, Buffer.concat([manifestBytes, Buffer.from(' ')]))
    .errors.join('\n'), /manifest digest/);
  assert.ok(validateCandidateManifestBinding(proof, manifestBytes,
    { version: '0.2.6', productSha: identity.commit }).errors.length > 0);
  assert.match(validateCandidateManifestBinding({ ...proof, runId: 43 }, manifestBytes,
    { version: identity.version, productSha: identity.commit }).errors.join('\n'), /produced by candidate-packages in this run/);
  assert.match(validateCandidateSiteBinding(proof, Buffer.concat([siteBytes, Buffer.from('x')])).errors.join('\n'),
    /site payload digest/);
  assert.match(validateCandidateSiteBinding({ ...proof, expectedPages: {} }, siteBytes).errors.join('\n'),
    /site payload digest/);
});

test('restored site identity records must equal the proved digests', async () => {
  const site = await mkdtemp(join(tmpdir(), 'coral-restored-site-'));
  try {
    const version = Buffer.from('{"product":"coral"}\n');
    const integrity = Buffer.from('{"schemaVersion":1}\n');
    await writeFile(join(site, 'version.json'), version);
    await writeFile(join(site, 'integrity.json'), integrity);
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const expected = { versionSha256: hash(version), integritySha256: hash(integrity) };
    assert.deepEqual(await validateRestoredSite(site, expected), []);
    assert.match((await validateRestoredSite(site, { ...expected, versionSha256: '0'.repeat(64) })).join('\n'), /version\.json/);
    assert.match((await validateRestoredSite(site, { ...expected, integritySha256: '0'.repeat(64) })).join('\n'), /integrity\.json/);
    assert.match((await validateRestoredSite(site, { versionSha256: undefined, integritySha256: '' })).join('\n'), /required/);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});

const response = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
  headers: { get: name => headers[name.toLowerCase()] ?? null },
});
const scripted = steps => {
  const calls = [];
  return { calls, fetch: async (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();
    if (step instanceof Error) throw step;
    return step;
  } };
};

test('GitHub readback retries only network errors, timeouts, 429 and 5xx, a bounded number of times', async () => {
  const sleeps = [];
  const options = mock => ({ fetch: mock.fetch, sleep: async ms => { sleeps.push(ms); } });
  const timeout = Object.assign(new Error('deadline'), { name: 'TimeoutError' });
  const network = new TypeError('fetch failed');
  const ok = scripted([network, response(503), response(200, { id: 42 })]);
  assert.deepEqual(await githubRead('/runs/42', 'token', options(ok)), { id: 42 });
  assert.equal(ok.calls.length, 3);
  assert.ok(ok.calls.every(call => call.init.signal instanceof AbortSignal && call.init.headers.authorization === 'Bearer token'));
  assert.deepEqual(sleeps, [1000, 4000]);
  sleeps.length = 0;
  const limited = scripted([response(429, {}, { 'retry-after': '120' }), timeout, response(200, { ok: true })]);
  assert.deepEqual(await githubRead('/runs/42', 'token', options(limited)), { ok: true });
  assert.deepEqual(sleeps, [10_000, 4000], 'Retry-After is honoured but capped');
  const exhausted = scripted([response(502), response(500), response(504), response(200)]);
  await assert.rejects(githubRead('/runs/42', 'token', options(exhausted)), /HTTP 504/);
  assert.equal(exhausted.calls.length, 3);
  const hung = scripted([timeout, timeout, timeout]);
  await assert.rejects(githubRead('/runs/42', 'token', options(hung)), /deadline/);
  sleeps.length = 0;
  const secondary = scripted([response(403, {}, { 'retry-after': '2' }),
    response(403, {}, { 'x-ratelimit-remaining': '0' }), response(200, { ok: 'rate limit' })]);
  assert.deepEqual(await githubRead('/runs/42', 'token', options(secondary)), { ok: 'rate limit' });
  assert.deepEqual(sleeps, [2000, 4000], 'only proven rate-limit 403 responses are retried');
  for (const [status, headers] of [[401, {}], [403, {}], [403, { 'x-ratelimit-remaining': '12' }], [404, {}], [422, {}]]) {
    const strict = scripted([response(status, {}, headers), response(200)]);
    await assert.rejects(githubRead('/runs/42', 'token', options(strict)), new RegExp(`HTTP ${status}`));
    assert.equal(strict.calls.length, 1, `HTTP ${status} is not retried`);
  }
  const malformed = scripted([{ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }, response(200)]);
  await assert.rejects(githubRead('/runs/42', 'token', options(malformed)), SyntaxError);
  assert.equal(malformed.calls.length, 1);
});

test('collection readback reads every page and refuses incomplete or malformed listings', async () => {
  const options = mock => ({ fetch: mock.fetch, sleep: async () => {} });
  const paged = scripted([response(200, { total_count: 3, jobs: [{ id: 1 }, { id: 2 }] }),
    response(200, { total_count: 3, jobs: [{ id: 3 }] })]);
  assert.deepEqual(await githubReadAll('/runs/42/jobs?filter=latest', 'jobs', 'token', options(paged)),
    [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.match(paged.calls[0].url, /\/runs\/42\/jobs\?filter=latest&per_page=100&page=1$/);
  assert.match(paged.calls[1].url, /&page=2$/);
  await assert.rejects(githubReadAll('/runs/42/jobs', 'jobs', 'token', options(scripted([
    response(200, { total_count: 3, jobs: [{ id: 1 }] }), response(200, { total_count: 3, jobs: [] })]))), /incomplete/);
  await assert.rejects(githubReadAll('/runs/42/artifacts', 'artifacts', 'token', options(scripted([
    response(200, { jobs: [] })]))), /malformed/);
});
