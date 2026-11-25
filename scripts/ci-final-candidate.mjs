import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCandidateManifest } from './candidate-artifacts.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';

export const PROOF_SCHEMA_VERSION = 3;
export const AGGREGATE_JOB = 'final-candidate';
export const PACKAGE_ARTIFACT = 'node-26-candidate-packages';
export const SITE_ARTIFACT = 'candidate-site';
export const PROOF_ARTIFACT = 'final-candidate-proof';

// Jobs that run on every CI event, and the full current obligations that a
// reduced (documentation/release-record) run skips.
export const ALWAYS_JOBS = Object.freeze(['classify', 'source-checks']);
export const FULL_MATRIX_JOBS = Object.freeze([
  'candidate-packages', 'candidate-site', 'windows-risk', 'contracts',
  'consumers', 'baseline-consumer', 'react-consumers', 'native-smoke',
  'browser-smoke', 'unit', 'windows-product', 'e2e', 'online-delivery',
]);
export const CLOSED_JOBS = Object.freeze([...ALWAYS_JOBS, ...FULL_MATRIX_JOBS]);

// GitHub aggregates a matrix into one `needs` result, so every required cell is
// read back by its exact display name. Unlisted jobs have one cell named by id.
export const MATRIX_CELLS = Object.freeze({
  consumers: Object.freeze(['consumers (26.8.2)', 'consumers (24.19.0)']),
  'react-consumers': Object.freeze(['react-consumers (18)', 'react-consumers (19)']),
  'native-smoke': Object.freeze([
    'native-smoke (ubuntu-latest)', 'native-smoke (macos-15)', 'native-smoke (windows-latest)',
  ]),
});
export const REQUIRED_CELLS = Object.freeze(CLOSED_JOBS.flatMap(job => MATRIX_CELLS[job] ?? [job]));

const sha256 = /^[0-9a-f]{64}$/;

export function canonicalArtifactDigest(value) {
  if (/^[0-9a-f]{64}$/.test(value ?? '')) return `sha256:${value}`;
  if (/^sha256:[0-9a-f]{64}$/.test(value ?? '')) return value;
  throw new Error('Candidate artifact digest must be a SHA-256');
}

function artifactIdentity(id, digest, label) {
  const value = { id: Number(id), digest: canonicalArtifactDigest(digest) };
  if (!Number.isSafeInteger(value.id) || value.id <= 0) throw new Error(`${label} artifact ID and digest are required`);
  return value;
}

// The candidate-site producer outputs the frozen site.tar digest and the
// version.json/integrity.json digests that Pages must restore unchanged.
export function expectedPagesFromOutputs({ versionSha256, integritySha256, payloadSha256 } = {}) {
  if (![versionSha256, integritySha256, payloadSha256].every(value => sha256.test(value ?? ''))) {
    throw new Error('candidate-site must output the frozen site.tar, version.json and integrity.json SHA-256 digests');
  }
  return { versionSha256, integritySha256, payloadSha256 };
}

export function evaluateFinalCandidate({ needs, fullMatrix, tier, finalCandidate }) {
  const errors = [];
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) errors.push('needs must be an object');
  const names = Object.keys(needs ?? {}).sort();
  if (JSON.stringify(names) !== JSON.stringify([...CLOSED_JOBS].sort())) {
    errors.push('aggregate needs set does not match the closed job inventory');
  }
  for (const name of ALWAYS_JOBS) {
    if (needs?.[name]?.result !== 'success') errors.push(`${name} must succeed`);
  }
  if (fullMatrix === 'true') {
    if (tier !== 'full-matrix') errors.push('full matrix requires the full-matrix tier');
    for (const name of FULL_MATRIX_JOBS) {
      if (needs?.[name]?.result !== 'success') errors.push(`${name} must succeed in a full matrix`);
    }
  } else if (fullMatrix === 'false') {
    if (tier !== 'docs-release-records') errors.push('reduced run requires docs-release-records tier');
    for (const name of FULL_MATRIX_JOBS) {
      if (needs?.[name]?.result !== 'skipped') errors.push(`${name} must be skipped in a reduced run`);
    }
    if (finalCandidate) errors.push('final candidate cannot use a reduced run');
  } else {
    errors.push('full-matrix output must be exactly true or false');
  }
  return errors.length ? { ok: false, errors } : { ok: true, finalCandidate: Boolean(finalCandidate) };
}

// Jobs that download a frozen artifact by name. GitHub artifacts carry no job
// or attempt identity, so a consumer cell must be from the same or a later
// attempt than the latest producer cell; otherwise it may have tested bytes of
// an earlier producer execution. The aggregate reads the package manifest.
export const ARTIFACT_CONSUMERS = Object.freeze({
  'candidate-packages': Object.freeze([
    'candidate-site', 'contracts', 'consumers', 'baseline-consumer', 'react-consumers',
    'native-smoke', 'browser-smoke', 'unit', 'windows-product', 'e2e', 'online-delivery', AGGREGATE_JOB,
  ]),
  'candidate-site': Object.freeze(['browser-smoke', 'e2e', 'online-delivery']),
});

const positive = value => Number.isSafeInteger(value) && value > 0;

// Binds the latest execution of every required cell in this run, read from
// GitHub (`filter=latest`), not the aggregated `needs` claims. An authorized
// failed-job retry on the unchanged SHA keeps earlier successful cells of the
// same run; each cell records its own attempt. A cell whose latest execution
// did not succeed, or that belongs to another run or SHA, is never accepted.
// The aggregate itself is always the current attempt: running while it
// produces the proof, completed successfully when a release verifies it.
export function latestJobErrors(jobs, { runId, runAttempt, headSha, aggregate }) {
  const errors = [];
  const listed = Array.isArray(jobs) ? jobs : [];
  const names = listed.map(job => job?.name);
  if (new Set(names).size !== names.length) errors.push('job readback contains duplicate cell names');
  if (JSON.stringify([...names].sort()) !== JSON.stringify([...REQUIRED_CELLS, AGGREGATE_JOB].sort())) {
    errors.push('job readback does not match the exact required cell set');
  }
  const byName = new Map(listed.map(job => [job?.name, job]));
  for (const job of listed) {
    if (job?.run_id !== Number(runId) || job.head_sha !== headSha) {
      errors.push(`${job?.name} is not a job of this run at the candidate SHA`);
    }
    if (!positive(job?.id)) errors.push(`${job?.name} has no job ID`);
    if (job?.name === AGGREGATE_JOB) {
      if (job.run_attempt !== Number(runAttempt)) errors.push(`${AGGREGATE_JOB} is not the current attempt`);
      const state = aggregate === 'running' ? job.status === 'in_progress' && job.conclusion === null
        : job.status === 'completed' && job.conclusion === 'success';
      if (!state) errors.push(`${AGGREGATE_JOB} is not ${aggregate === 'running' ? 'the running aggregate' : 'successful'}`);
      continue;
    }
    if (job?.status !== 'completed' || job.conclusion !== 'success') errors.push(`${job?.name} did not complete successfully`);
    if (!positive(job?.run_attempt) || job.run_attempt > Number(runAttempt)) {
      errors.push(`${job?.name} has an invalid run attempt`);
    }
  }
  for (const [producer, consumers] of Object.entries(ARTIFACT_CONSUMERS)) {
    const made = byName.get(producer)?.run_attempt;
    for (const name of consumers.flatMap(job => MATRIX_CELLS[job] ?? [job])) {
      const used = byName.get(name)?.run_attempt;
      if (positive(made) && positive(used) && used < made) {
        errors.push(`${name} predates the latest ${producer} attempt it consumes`);
      }
    }
  }
  return errors;
}

export function bindLatestJobs(jobs, { runId, runAttempt, headSha }) {
  const errors = latestJobErrors(jobs, { runId, runAttempt, headSha, aggregate: 'running' });
  if (errors.length) throw new Error(errors.join('\n'));
  const byName = new Map(jobs.map(job => [job.name, job]));
  const cells = REQUIRED_CELLS.map(name => {
    const job = byName.get(name);
    return { name, id: job.id, conclusion: job.conclusion, runAttempt: job.run_attempt };
  });
  return { cells, aggregate: byName.get(AGGREGATE_JOB) };
}

// The manifest names the run and producer job that packed the six tarballs.
export function manifestProducerErrors(manifest, runId) {
  return manifest?.workflow?.runId === String(runId) && manifest.workflow.jobId === 'candidate-packages' ? []
    : ['candidate manifest was not produced by candidate-packages in this run'];
}

// The proof states only what this aggregate verified. It is built only for a
// final candidate whose full matrix passed, and makes no performance claim:
// shared GitHub-hosted runners never measure performance.
export function buildFinalCandidateProof({ env, needs, jobs, manifestBytes }) {
  const finalCandidate = env.FINAL_CANDIDATE === 'true';
  const result = evaluateFinalCandidate({
    needs, fullMatrix: env.FULL_MATRIX, tier: env.MATRIX_TIER, finalCandidate,
  });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  if (!finalCandidate) throw new Error('a proof is written only for a final candidate');
  if (env.RELEASE_VERSION !== RENDERER_CANDIDATE.version) throw new Error('proof requires the exact active candidate version');
  if (env.GITHUB_REF !== RENDERER_CANDIDATE.candidateRef || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Active renderer candidate requires its exact approved manual-dispatch ref');
  }
  if (env.GITHUB_JOB !== AGGREGATE_JOB) throw new Error(`proof must be written by the ${AGGREGATE_JOB} job`);
  const runId = Number(env.GITHUB_RUN_ID);
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (![runId, runAttempt].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('run ID and attempt are required');
  }
  const manifest = JSON.parse(manifestBytes);
  const errors = validateCandidateManifest(manifest, {
    version: RENDERER_CANDIDATE.version, productSha: env.GITHUB_SHA,
  });
  errors.push(...manifestProducerErrors(manifest, runId));
  if (errors.length) throw new Error(errors.join('\n'));
  const bound = bindLatestJobs(jobs, { runId, runAttempt, headSha: env.GITHUB_SHA });
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    version: env.RELEASE_VERSION,
    workflow: env.GITHUB_WORKFLOW,
    event: env.GITHUB_EVENT_NAME,
    runId,
    runAttempt,
    headSha: env.GITHUB_SHA,
    ref: env.GITHUB_REF,
    finalCandidate: true,
    fullMatrix: true,
    tier: 'full-matrix',
    aggregateJob: { name: AGGREGATE_JOB, id: bound.aggregate.id, runAttempt, result: 'success' },
    jobResults: Object.fromEntries(CLOSED_JOBS.map(name => [name, needs[name].result])),
    jobs: bound.cells,
    candidateArtifact: artifactIdentity(env.CANDIDATE_ARTIFACT_ID, env.CANDIDATE_ARTIFACT_DIGEST, 'Candidate'),
    candidateManifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    siteArtifact: artifactIdentity(env.CANDIDATE_SITE_ARTIFACT_ID, env.CANDIDATE_SITE_ARTIFACT_DIGEST, 'Candidate site'),
    expectedPages: expectedPagesFromOutputs({
      versionSha256: env.EXPECTED_VERSION_SHA256,
      integritySha256: env.EXPECTED_INTEGRITY_SHA256,
      payloadSha256: env.EXPECTED_SITE_SHA256,
    }),
    performanceMeasured: false,
  };
}

// GitHub signals a secondary rate limit with 403 (or 429) and either
// Retry-After or an exhausted quota. Any other 403 is an authorization
// failure and stays strict.
const RETRYABLE = response => response.status === 429 || response.status >= 500
  || (response.status === 403 && (response.headers?.get?.('retry-after') != null
    || response.headers?.get?.('x-ratelimit-remaining') === '0'));
// fetch rejects with TypeError on network failure and the signal's
// TimeoutError or AbortError on the deadline.
const transient = error => ['AbortError', 'TimeoutError'].includes(error?.name) || error instanceof TypeError;

// A bounded GitHub REST read. Each request has a deadline, and only network
// errors, timeouts, 429, rate-limited 403 and 5xx are retried, a few times
// with a short capped delay. Authentication, permission, not-found and
// malformed responses fail immediately.
export async function githubRead(path, token, {
  fetch: request = globalThis.fetch, sleep = ms => new Promise(accept => setTimeout(accept, ms)),
  attempts = 3, timeoutMs = 15_000, delaysMs = [1_000, 4_000], maxDelayMs = 10_000,
} = {}) {
  for (let attempt = 1; ; attempt += 1) {
    let failure;
    try {
      const response = await request(`https://api.github.com${path}`, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return await response.json();
      failure = new Error(`GitHub readback failed for ${path}: HTTP ${response.status}`);
      if (!RETRYABLE(response) || attempt >= attempts) throw failure;
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000
        : delaysMs[attempt - 1] ?? maxDelayMs, maxDelayMs));
      continue;
    } catch (error) {
      if (error === failure || !transient(error) || attempt >= attempts) throw error;
    }
    await sleep(Math.min(delaysMs[attempt - 1] ?? maxDelayMs, maxDelayMs));
  }
}

// Reads every page of a run collection (jobs or artifacts), bounded.
export async function githubReadAll(path, key, token, options) {
  const items = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = await githubRead(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token, options);
    if (!Array.isArray(body?.[key]) || !Number.isSafeInteger(body.total_count)) {
      throw new Error(`GitHub ${key} readback is malformed`);
    }
    items.push(...body[key]);
    if (items.length >= body.total_count || body[key].length === 0) {
      if (items.length !== body.total_count) throw new Error(`GitHub ${key} readback is incomplete`);
      return items;
    }
  }
  throw new Error(`GitHub ${key} readback exceeded the bounded page count`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const needs = JSON.parse(process.env.NEEDS_JSON ?? '{}');
  const finalCandidate = process.env.FINAL_CANDIDATE === 'true';
  const result = evaluateFinalCandidate({
    needs,
    fullMatrix: process.env.FULL_MATRIX,
    tier: process.env.MATRIX_TIER,
    finalCandidate,
  });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  if (finalCandidate) {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN with actions: read is required to bind job results');
    const manifestPath = resolve(process.env.CANDIDATE_MANIFEST ?? 'candidate-artifacts/candidate-manifest.json');
    const jobs = await githubReadAll(`/repos/coreyt/coral/actions/runs/${Number(process.env.GITHUB_RUN_ID)}/jobs?filter=latest`,
      'jobs', process.env.GITHUB_TOKEN);
    const proof = buildFinalCandidateProof({
      env: process.env, needs, jobs, manifestBytes: await readFile(manifestPath),
    });
    await writeFile(process.env.FINAL_CANDIDATE_PROOF ?? 'final-candidate-proof.json', `${JSON.stringify(proof, null, 2)}\n`);
  }
  console.log(JSON.stringify(result));
}
