import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectPagesTar, validateSourceEvidence } from './pages-restore.mjs';
import { githubClient, readReleaseResponses } from './release-github-reads.mjs';

const HOSTED_URL = 'https://coreyt.github.io/coral/';
const RUN_URL = /^https:\/\/github\.com\/coreyt\/coral\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?(?:\/job\/(\d+))?\/?(?:[?#].*)?$/;

// CRO100-4: an Actions environment deployment may be created before its job's
// started_at (the environment gate runs first), so it is never attributed by
// time. Actions records the run, and in current releases the job, that ran
// the deployment in each status's log_url (and the older target_url).
export function deploymentStatusBinding(status) {
  for (const url of [status?.log_url, status?.target_url]) {
    const match = typeof url === 'string' ? url.match(RUN_URL) : null;
    if (match) return { runId: Number(match[1]), jobId: match[2] === undefined ? null : Number(match[2]) };
  }
  return null;
}

// The github-pages deployments at `commit` whose statuses name the pages.yml
// run's deploy job (or the run, when the URL names no job).
export function pagesDeployments({ deployments, statuses }, { commit, runId, jobId }) {
  return (Array.isArray(deployments) ? deployments : []).filter(deployment => deployment?.sha === commit
    && deployment.ref === 'main' && deployment.environment === 'github-pages'
    && (statuses?.[deployment.id] ?? []).some(status => {
      const binding = deploymentStatusBinding(status);
      return binding?.runId === runId && (binding.jobId === null || binding.jobId === jobId);
    }));
}

// The newest status (GitHub lists them newest first) is the result.
const deploymentResultErrors = (deployment, statuses, binding) => {
  const latest = statuses?.[0];
  return !Number.isSafeInteger(Number(deployment?.id))
    || pagesDeployments({ deployments: [deployment], statuses: { [deployment?.id]: statuses } }, binding).length !== 1
    || latest?.state !== 'success' || latest?.environment_url !== HOSTED_URL;
};

export function validateGithubReleaseState(state, expected) {
  const errors = [];
  // CRO100-3: the repository immutable-release setting is readable only via
  // GET /repos/{owner}/{repo}/immutable-releases (administration), which
  // GITHUB_TOKEN cannot be granted. The operator checks the setting before
  // dispatch; an existing release must read back immutable.
  if (state.tag?.type && state.tag.type !== 'tag') {
    errors.push(`tag v${expected.version} must be annotated`);
  } else if (state.tag?.target && state.tag.target !== expected.commit) {
    errors.push(`tag v${expected.version} points at a different commit`);
  }
  if (state.release && (state.release.tag_name !== `v${expected.version}`
      || state.release.draft !== false || state.release.prerelease !== false)) {
    errors.push(`v${expected.version} is not the exact published release`);
  }
  if (state.release && state.release.immutable !== true) {
    errors.push(`v${expected.version} is not immutable`);
  }
  try {
    validateSourceEvidence({
      expected: {
        version: expected.version,
        commit: expected.commit,
        runId: state.pages?.run?.id,
        attempt: state.pages?.run?.run_attempt,
        artifactId: state.pages?.artifact?.id,
        artifactDigest: state.pages?.artifact?.digest,
      },
      run: state.pages?.run,
      jobs: state.pages?.jobs,
      artifacts: state.pages?.artifacts,
      artifact: state.pages?.artifact,
    });
  } catch (error) {
    errors.push(`Pages source evidence mismatch: ${error.message}`);
  }
  // The live deployment is the pages.yml run's own deploy job at `commit`.
  const deployJob = (state.pages?.jobs ?? []).find(job => job.name === 'deploy');
  if (deploymentResultErrors(state.pages?.deployment, state.pages?.deploymentStatuses, {
    commit: expected.commit, runId: state.pages?.run?.id, jobId: deployJob?.id,
  })) {
    errors.push('Pages deployment identity or result mismatch');
  }
  if (state.version?.product !== 'coral' || state.version?.version !== expected.version
      || state.version?.commit !== expected.commit) errors.push('hosted version identity mismatch');
  if (state.integrity?.schemaVersion !== 1
      || state.integrity?.identity?.version !== expected.version
      || state.integrity?.identity?.commit !== expected.commit
      || !Array.isArray(state.integrity?.files)) errors.push('hosted integrity identity mismatch');
  // DRO100-24: the live bytes must equal the final-candidate CI build.
  if (state.live?.versionSha256 !== expected.expectedPages?.versionSha256
      || state.live?.integritySha256 !== expected.expectedPages?.integritySha256) {
    errors.push('hosted bytes do not match the final-candidate build digests');
  }
  if (state.pages?.payload?.versionSha256 !== state.live?.versionSha256
      || state.pages?.payload?.integritySha256 !== state.live?.integritySha256
      || !/^[0-9a-f]{64}$/.test(state.pages?.payload?.payloadSha256 ?? '')) {
    errors.push('hosted bytes do not match the retained Pages payload');
  }
  return errors;
}

async function hosted(path) {
  const response = await fetch(`https://coreyt.github.io/coral/${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Hosted readback failed for ${path}: HTTP ${response.status}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), value: null };
}

async function releaseState({ version, commit, pagesRunId, token, pagesArtifactPath }) {
  const github = githubClient(token);
  const [responses, versionResponse, integrityResponse, pagesArtifactBytes] = await Promise.all([
    readReleaseResponses(github, { version, commit, pagesRunId }),
    hosted('version.json'),
    hosted('integrity.json'),
    readFile(pagesArtifactPath),
  ]);
  const payload = inspectPagesTar(pagesArtifactBytes, { version, commit });
  const pagesDeployJob = responses.pagesJobs.jobs.find(job => job.name === 'deploy');
  const bound = pagesDeployments({ deployments: responses.deployments, statuses: responses.deploymentStatuses }, {
    commit, runId: responses.pagesRun.id, jobId: pagesDeployJob?.id,
  });
  if (bound.length !== 1) throw new Error('The pages.yml run must own exactly one attributable deployment');
  const deployment = bound[0];
  return {
    responses,
    payload,
    versionBytes: versionResponse.bytes,
    integrityBytes: integrityResponse.bytes,
    deployment,
    state: {
      tag: responses.tagRef ? {
        type: responses.tagRef.object?.type,
        target: responses.annotatedTag?.object?.sha ?? responses.tagRef.object?.sha,
      } : null,
      release: responses.release,
      pages: {
        run: responses.pagesRun,
        jobs: responses.pagesJobs.jobs,
        artifacts: responses.pagesArtifacts.artifacts,
        artifact: responses.pagesArtifact,
        payload,
        deployment,
        deploymentStatuses: responses.deploymentStatuses[deployment.id],
      },
      version: JSON.parse(versionResponse.bytes),
      integrity: JSON.parse(integrityResponse.bytes),
      live: {
        versionSha256: createHash('sha256').update(versionResponse.bytes).digest('hex'),
        integritySha256: createHash('sha256').update(integrityResponse.bytes).digest('hex'),
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const version = process.env.RELEASE_VERSION;
  const commit = process.env.RELEASE_COMMIT;
  const pagesRunId = Number(process.env.RELEASE_PAGES_RUN_ID);
  const pagesArtifactPath = process.env.RELEASE_PAGES_ARTIFACT;
  const token = process.env.GITHUB_TOKEN;
  if (version !== RENDERER_CANDIDATE.version || !/^[0-9a-f]{40}$/.test(commit ?? '')
      || !Number.isSafeInteger(pagesRunId)
      || !token || !pagesArtifactPath || !process.env.RELEASE_CANDIDATE_PROOF) {
    throw new Error('Exact release version, commit, Pages run, artifact, proof and GitHub token are required');
  }
  const proof = JSON.parse(await readFile(process.env.RELEASE_CANDIDATE_PROOF, 'utf8'));
  const live = await releaseState({ version, commit, pagesRunId, token, pagesArtifactPath });
  const errors = validateGithubReleaseState(live.state, { version, commit, expectedPages: proof.expectedPages });
  if (errors.length) throw new Error(errors.join('\n'));
  const { responses, payload, deployment } = live;
  const readback = {
    schemaVersion: 1,
    version,
    productSha: commit,
    pagesRunId,
    pagesRunAttempt: responses.pagesRun.run_attempt,
    pagesJobId: responses.pagesJobs.jobs.find(job => job.name === 'deploy').id,
    pagesArtifactId: responses.pagesArtifact.id,
    pagesArtifactDigest: responses.pagesArtifact.digest,
    pagesPayloadSha256: payload.payloadSha256,
    pagesDeploymentId: deployment.id,
    pagesDeploymentCreatedAt: deployment.created_at,
    hosted: {
      url: HOSTED_URL,
      versionSha256: live.state.live.versionSha256,
      integritySha256: live.state.live.integritySha256,
    },
    tagCompatible: true,
    releaseCompatible: true,
  };
  await writeFile('github-release-preflight.json', `${JSON.stringify(readback, null, 2)}\n`);
  console.log(JSON.stringify(readback));
}
