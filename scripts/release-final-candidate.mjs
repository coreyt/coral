import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCandidateManifest } from './candidate-artifacts.mjs';
import {
  AGGREGATE_JOB, CLOSED_JOBS, PACKAGE_ARTIFACT, PROOF_ARTIFACT, PROOF_SCHEMA_VERSION,
  REQUIRED_CELLS, SITE_ARTIFACT, githubRead, githubReadAll, latestJobErrors, manifestProducerErrors,
} from './ci-final-candidate.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';

const sha256 = /^[0-9a-f]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// GitHub artifacts carry no job identity. Each frozen artifact must be the
// only one of its name in the run, carry the ID and digest its latest producer
// output, and be created no earlier than that producer job started, so no
// earlier execution can supply it. There is deliberately no upper bound: it
// would compare the artifact service clock with job completion only seconds
// after the final upload step, and add no binding beyond the ID and digest.
function artifactErrors(artifacts, name, identity, { runId, commit, branch }, producer) {
  const matching = (artifacts ?? []).filter(item => item.name === name);
  const created = Date.parse(matching[0]?.created_at ?? '');
  const started = Date.parse(producer?.started_at ?? '');
  if (matching.length !== 1 || matching[0].expired !== false
      || matching[0].workflow_run?.id !== Number(runId)
      || matching[0].workflow_run?.head_sha !== commit
      || matching[0].workflow_run?.head_branch !== branch
      || (identity && (matching[0].id !== identity.id || matching[0].digest !== identity.digest))
      || !Number.isFinite(created) || !Number.isFinite(started) || created < started) {
    return [`${name} artifact readback does not match the proof and its latest producer`];
  }
  return [];
}

// The CI workflow was renamed after the 0.2.8 final candidate ran. Its proof
// keeps the legacy workflow name and run title; a later run carries the
// current pair. A run must match one generation as a whole, never a mix.
export const finalCandidateRunIdentities = (version, commit) => Object.freeze([
  Object.freeze({ workflow: 'CI', title: `final-candidate=true sha=${commit}` }),
  Object.freeze({ workflow: 'Coral CI', title: `Coral ${version} — Release validation` }),
]);

// The live GitHub readback of the selected run, its latest jobs and artifacts
// is authoritative; the proof must agree with it, not replace it.
export function validateFinalCandidateEvidence({ run, jobs, artifacts, proof },
  { commit, runId, version = RENDERER_CANDIDATE.version }) {
  const errors = [];
  const candidateRef = RENDERER_CANDIDATE.candidateRef;
  const branch = candidateRef.slice('refs/heads/'.length);
  if (version !== RENDERER_CANDIDATE.version || candidateRef !== RENDERER_CANDIDATE.candidateRef) {
    errors.push('unapproved candidate version');
  }
  if (proof?.schemaVersion !== PROOF_SCHEMA_VERSION) errors.push(`proof schemaVersion must be ${PROOF_SCHEMA_VERSION}`);
  if (proof?.version !== version) errors.push('active candidate proof version mismatch');
  const generation = finalCandidateRunIdentities(version, commit).find(item => item.workflow === proof?.workflow);
  if (Number(run?.id) !== Number(runId) || Number(proof?.runId) !== Number(runId)) errors.push('run ID mismatch');
  if (!Number.isSafeInteger(proof?.runAttempt) || Number(run?.run_attempt) !== proof.runAttempt) {
    errors.push('run attempt mismatch');
  }
  if (run?.path !== '.github/workflows/ci.yml' || !generation) errors.push('workflow identity mismatch');
  if (run?.event !== 'workflow_dispatch' || proof?.event !== 'workflow_dispatch') errors.push('final candidate must be a manual dispatch');
  if (run?.status !== 'completed' || run?.conclusion !== 'success') errors.push('workflow run must complete successfully');
  if (run?.head_sha !== commit || proof?.headSha !== commit) errors.push('final candidate SHA mismatch');
  if (run?.head_branch !== branch || proof?.ref !== candidateRef) errors.push('candidate ref mismatch');
  if (!generation || run?.display_title !== generation.title) errors.push('controlled final-candidate run title mismatch');
  if (proof?.finalCandidate !== true || proof?.fullMatrix !== true || proof?.tier !== 'full-matrix') {
    errors.push('proof is not a full final candidate');
  }
  if (proof?.performanceMeasured !== false) errors.push('proof must state that performance was not measured');
  if (proof?.aggregateJob?.name !== AGGREGATE_JOB || proof?.aggregateJob?.result !== 'success'
      || proof?.aggregateJob?.runAttempt !== proof?.runAttempt || !Number.isSafeInteger(proof?.aggregateJob?.id)) {
    errors.push('aggregate proof is not successful');
  }
  if (JSON.stringify(Object.keys(proof?.jobResults ?? {}).sort()) !== JSON.stringify([...CLOSED_JOBS].sort())
      || CLOSED_JOBS.some(name => proof.jobResults[name] !== 'success')) {
    errors.push('proof job results do not match the closed successful set');
  }
  // The live latest readback is authoritative. Every required cell of this run
  // at this SHA must have succeeded in its latest execution, which may be an
  // earlier attempt kept by an authorized failed-job retry, and the proof must
  // name exactly that job ID, attempt and conclusion. The aggregate that wrote
  // the proof is the run's current attempt.
  errors.push(...latestJobErrors(jobs, {
    runId, runAttempt: proof?.runAttempt, headSha: commit, aggregate: 'completed',
  }));
  const live = new Map((Array.isArray(jobs) ? jobs : []).map(job => [job?.name, job]));
  const proved = Array.isArray(proof?.jobs) ? proof.jobs : [];
  if (JSON.stringify(proved.map(job => job?.name)) !== JSON.stringify(REQUIRED_CELLS)) {
    errors.push('proof does not bind every required cell');
  }
  for (const cell of proved) {
    const job = live.get(cell?.name);
    if (!job || cell.id !== job.id || cell.runAttempt !== job.run_attempt || cell.conclusion !== 'success'
        || job.conclusion !== 'success') {
      errors.push(`${cell?.name} proof cell does not match its latest live job`);
    }
  }
  if (live.get(AGGREGATE_JOB)?.id !== proof?.aggregateJob?.id) errors.push('aggregate job ID does not match the proof');
  const identity = { runId, commit, branch };
  errors.push(...artifactErrors(artifacts, PACKAGE_ARTIFACT, proof?.candidateArtifact, identity, live.get('candidate-packages')));
  errors.push(...artifactErrors(artifacts, SITE_ARTIFACT, proof?.siteArtifact, identity, live.get('candidate-site')));
  errors.push(...artifactErrors(artifacts, PROOF_ARTIFACT, null, identity, live.get(AGGREGATE_JOB)));
  for (const [label, value] of [['candidate', proof?.candidateArtifact], ['site', proof?.siteArtifact]]) {
    if (!Number.isSafeInteger(value?.id) || value.id <= 0 || !/^sha256:[0-9a-f]{64}$/.test(value?.digest ?? '')) {
      errors.push(`proof lacks the ${label} artifact identity`);
    }
  }
  if (!sha256.test(proof?.candidateManifestSha256 ?? '')) errors.push('candidate manifest digest is missing');
  if (![proof?.expectedPages?.versionSha256, proof?.expectedPages?.integritySha256, proof?.expectedPages?.payloadSha256]
    .every(value => sha256.test(value ?? ''))) {
    errors.push('proof lacks the frozen candidate site digests');
  }
  return errors;
}

// The downloaded manifest must be the exact bytes the proof names.
export function validateCandidateManifestBinding(proof, manifestBytes, expected) {
  const errors = [];
  const value = digest(manifestBytes);
  if (value !== proof.candidateManifestSha256) errors.push('candidate manifest digest does not match proof');
  if (expected) {
    const manifest = JSON.parse(manifestBytes);
    errors.push(...validateCandidateManifest(manifest, expected), ...manifestProducerErrors(manifest, proof.runId));
  }
  return { errors, digest: value };
}

// The downloaded site.tar must be the exact frozen payload the proof names.
export function validateCandidateSiteBinding(proof, siteBytes) {
  const value = digest(siteBytes);
  return { errors: sha256.test(value) && value === proof?.expectedPages?.payloadSha256 ? []
    : ['candidate site payload digest does not match proof'], digest: value };
}

// After restore, the served identity records must be the proved bytes.
export async function validateRestoredSite(site, { versionSha256, integritySha256 }) {
  const errors = [];
  if (![versionSha256, integritySha256].every(value => sha256.test(value ?? ''))) {
    return ['expected restored site digests are required'];
  }
  if (digest(await readFile(join(site, 'version.json'))) !== versionSha256) errors.push('restored version.json does not match proof');
  if (digest(await readFile(join(site, 'integrity.json'))) !== integritySha256) errors.push('restored integrity.json does not match proof');
  return errors;
}

async function main(args) {
  if (args[0] === '--restored-site') {
    const errors = await validateRestoredSite(resolve(args[1] ?? 'build/site'), {
      versionSha256: process.env.EXPECTED_VERSION_SHA256,
      integritySha256: process.env.EXPECTED_INTEGRITY_SHA256,
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ restoredSite: 'verified' }));
    return;
  }
  const [proofPath, manifestPath, ...options] = args;
  const sitePath = options[0] === '--site' ? options[1] : undefined;
  if (options.length && !sitePath) throw new Error('Expected only --site <site.tar>');
  const commit = process.env.RELEASE_COMMIT;
  const version = process.env.RELEASE_VERSION;
  const runId = Number(process.env.RELEASE_CANDIDATE_RUN_ID);
  const token = process.env.GITHUB_TOKEN;
  if (!proofPath || !manifestPath || !token || !Number.isSafeInteger(runId) || runId <= 0
    || version !== RENDERER_CANDIDATE.version || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
    throw new Error('Proof path, manifest path, GITHUB_TOKEN, RELEASE_VERSION, RELEASE_COMMIT and RELEASE_CANDIDATE_RUN_ID are required');
  }
  const [proof, manifestBytes, siteBytes, run, jobs, artifacts] = await Promise.all([
    readFile(proofPath, 'utf8').then(JSON.parse),
    readFile(manifestPath),
    sitePath ? readFile(sitePath) : null,
    githubRead(`/repos/coreyt/coral/actions/runs/${runId}`, token),
    githubReadAll(`/repos/coreyt/coral/actions/runs/${runId}/jobs?filter=latest`, 'jobs', token),
    githubReadAll(`/repos/coreyt/coral/actions/runs/${runId}/artifacts`, 'artifacts', token),
  ]);
  const errors = validateFinalCandidateEvidence({
    run, jobs, artifacts, proof,
  }, { commit, runId, version });
  const binding = validateCandidateManifestBinding(proof, manifestBytes, { version, productSha: commit });
  errors.push(...binding.errors);
  if (siteBytes) errors.push(...validateCandidateSiteBinding(proof, siteBytes).errors);
  if (errors.length) throw new Error(errors.join('\n'));
  // Only verified, hex-validated digests reach step outputs.
  if (siteBytes && process.env.GITHUB_OUTPUT) {
    const { versionSha256, integritySha256, payloadSha256 } = proof.expectedPages;
    await appendFile(process.env.GITHUB_OUTPUT,
      `site-sha256=${payloadSha256}\nversion-sha256=${versionSha256}\nintegrity-sha256=${integritySha256}\n`);
  }
  console.log(JSON.stringify({ runId, commit, candidateManifestSha256: binding.digest }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
