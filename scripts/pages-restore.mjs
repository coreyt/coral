import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'coreyt/coral';
const pagesWorkflow = '.github/workflows/pages.yml';
const restoreWorkflowRef =
  'coreyt/coral/.github/workflows/pages-restore.yml@refs/heads/main';
const requiredJobs = ['build', 'registry', 'deploy'];
const supportedRestoreVersions = new Set(['0.2.5', '0.2.6', '0.2.8', '0.2.9', '0.2.11', '0.2.12']);

export function validateRestoreContext(environment) {
  const expected = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_WORKFLOW_REF: restoreWorkflowRef,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (environment[name] !== value) {
      throw new Error(`Untrusted restore context: ${name} must equal ${value}`);
    }
  }
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

function assertSourceExpected(expected) {
  if (!supportedRestoreVersions.has(expected.version)) {
    throw new Error('Restore version must be an explicitly supported release');
  }
  if (!/^[0-9a-f]{40}$/.test(expected.commit ?? '')) {
    throw new Error('Restore commit must be a full lowercase SHA-1');
  }
  positiveInteger(expected.runId, 'Source run ID');
  positiveInteger(expected.attempt, 'Source attempt');
  positiveInteger(expected.artifactId, 'Source artifact ID');
  if (!/^sha256:[0-9a-f]{64}$/.test(expected.artifactDigest ?? '')) {
    throw new Error('Source artifact digest must be an exact SHA-256');
  }
}

export function validateSourceEvidence({ expected, run, jobs, artifacts, artifact }) {
  assertSourceExpected(expected);
  const runId = Number(expected.runId);
  const attempt = Number(expected.attempt);
  const artifactId = Number(expected.artifactId);
  if (run?.id !== runId || run.run_attempt !== attempt) {
    throw new Error('Source run or attempt does not match');
  }
  if (run.repository?.full_name !== repository || run.path !== pagesWorkflow
      || run.event !== 'workflow_dispatch' || run.head_branch !== 'main'
      || run.head_sha !== expected.commit || run.status !== 'completed'
      || run.conclusion !== 'success') {
    throw new Error('Source run identity or result does not match');
  }
  for (const name of requiredJobs) {
    const matching = (jobs ?? []).filter((job) => job.name === name);
    if (matching.length !== 1) throw new Error(`Source attempt needs one ${name} job`);
    const [job] = matching;
    if (job.run_id !== runId || job.run_attempt !== attempt
        || job.head_sha !== expected.commit || job.status !== 'completed'
        || job.conclusion !== 'success') {
      throw new Error(`Source ${name} job did not pass at the expected identity`);
    }
  }
  const build = jobs.find((job) => job.name === 'build');
  const artifactCreated = Date.parse(artifact?.created_at ?? '');
  const buildStarted = Date.parse(build?.started_at ?? '');
  const buildCompleted = Date.parse(build?.completed_at ?? '');
  if (![artifactCreated, buildStarted, buildCompleted].every(Number.isFinite)
      || artifactCreated < buildStarted || artifactCreated > buildCompleted) {
    throw new Error('Retained Pages artifact was not created by the selected build attempt');
  }
  const namedArtifacts = (artifacts ?? []).filter((item) => item.name === 'github-pages');
  if (namedArtifacts.length !== 1 || namedArtifacts[0].id !== artifactId
      || namedArtifacts[0].digest !== expected.artifactDigest) {
    throw new Error('Source run must retain exactly one selected github-pages artifact');
  }
  if (artifact?.id !== artifactId || artifact.name !== 'github-pages'
      || artifact.expired !== false || artifact.digest !== expected.artifactDigest
      || artifact.workflow_run?.id !== runId
      || artifact.workflow_run?.head_sha !== expected.commit
      || artifact.workflow_run?.head_branch !== 'main') {
    throw new Error('Retained Pages artifact identity does not match');
  }
}

function field(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  const boundary = end >= start && end < start + length ? end : start + length;
  return buffer.subarray(start, boundary).toString('utf8');
}

function octalField(buffer, start, length, name) {
  const value = field(buffer, start, length).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error(`Invalid tar ${name}`);
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid tar ${name}`);
  return number;
}

function normalizedTarPath(raw) {
  if (!raw || raw.startsWith('/') || raw.includes('\\') || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`Unsafe tar path: ${raw || '(empty)'}`);
  }
  if (raw === './') return '';
  const stripped = raw.replace(/^\.\//, '').replace(/\/$/, '');
  const components = stripped.split('/');
  if (components.some((component) => !component || component === '.' || component === '..')) {
    throw new Error(`Unsafe tar path: ${raw}`);
  }
  return components.join('/');
}

function sameIdentity(identity, expected) {
  return identity?.product === 'coral'
    && identity.version === expected.version
    && identity.commit === expected.commit;
}

export function inspectPagesTar(buffer, expected) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Pages payload must be a Buffer');
  if (!supportedRestoreVersions.has(expected.version)
      || !/^[0-9a-f]{40}$/.test(expected.commit ?? '')) {
    throw new Error('Expected Pages identity is invalid');
  }
  const payloadSha256 = createHash('sha256').update(buffer).digest('hex');
  if (expected.payloadSha256 != null
      && (!/^[0-9a-f]{64}$/.test(expected.payloadSha256)
        || payloadSha256 !== expected.payloadSha256)) {
    throw new Error('Retained Pages payload digest does not match');
  }
  const records = new Map();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks) throw new Error('Invalid tar end marker');
    const storedChecksum = octalField(header, 148, 8, 'checksum');
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const checksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (checksum !== storedChecksum) throw new Error('Invalid tar checksum');
    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const path = normalizedTarPath(prefix ? `${prefix}/${name}` : name);
    const size = octalField(header, 124, 12, 'size');
    const type = String.fromCharCode(header[156] || 48);
    if (type !== '0' && type !== '5') throw new Error(`Unsupported tar entry type at ${path}`);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > buffer.length) throw new Error(`Truncated tar entry at ${path}`);
    if (type === '5' && size !== 0) throw new Error(`Directory tar entry has content at ${path}`);
    if (!path && type !== '5') throw new Error('Tar root entry must be a directory');
    if (type === '0' && (path === 'version.json' || path === 'integrity.json')) {
      if (records.has(path)) throw new Error(`Duplicate ${path}`);
      if (size > 2_000_000) throw new Error(`${path} is unexpectedly large`);
      records.set(path, Buffer.from(buffer.subarray(bodyStart, bodyEnd)));
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  if (zeroBlocks !== 2 || buffer.length % 512 !== 0
      || buffer.subarray(offset).some((byte) => byte !== 0)) {
    throw new Error('Pages payload is not a complete canonical tar archive');
  }
  if (!records.has('version.json') || !records.has('integrity.json')) {
    throw new Error('Pages payload is missing identity records');
  }
  let version;
  let integrity;
  try {
    version = JSON.parse(records.get('version.json').toString('utf8'));
    integrity = JSON.parse(records.get('integrity.json').toString('utf8'));
  } catch {
    throw new Error('Pages payload identity records are invalid JSON');
  }
  if (!sameIdentity(version, expected) || !sameIdentity(integrity?.identity, expected)) {
    throw new Error('Pages payload identity does not match');
  }
  return {
    bytes: buffer.length,
    payloadSha256,
    versionSha256: createHash('sha256').update(records.get('version.json')).digest('hex'),
    integritySha256: createHash('sha256').update(records.get('integrity.json')).digest('hex'),
    identity: version,
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub evidence request failed: HTTP ${response.status}`);
  return response.json();
}

async function validateLiveSource(environment) {
  validateRestoreContext(environment);
  const expected = {
    version: environment.RESTORE_VERSION,
    commit: environment.RESTORE_COMMIT,
    runId: positiveInteger(environment.RESTORE_SOURCE_RUN_ID, 'Source run ID'),
    attempt: positiveInteger(environment.RESTORE_SOURCE_ATTEMPT, 'Source attempt'),
    artifactId: positiveInteger(environment.RESTORE_SOURCE_ARTIFACT_ID, 'Source artifact ID'),
    artifactDigest: environment.RESTORE_SOURCE_ARTIFACT_DIGEST,
  };
  if (!environment.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required');
  const base = `https://api.github.com/repos/${repository}/actions`;
  const [run, jobResponse, artifactResponse, artifact] = await Promise.all([
    fetchJson(`${base}/runs/${expected.runId}/attempts/${expected.attempt}`, environment.GITHUB_TOKEN),
    fetchJson(`${base}/runs/${expected.runId}/attempts/${expected.attempt}/jobs?per_page=100`, environment.GITHUB_TOKEN),
    fetchJson(`${base}/runs/${expected.runId}/artifacts?per_page=100`, environment.GITHUB_TOKEN),
    fetchJson(`${base}/artifacts/${expected.artifactId}`, environment.GITHUB_TOKEN),
  ]);
  validateSourceEvidence({
    expected, run, jobs: jobResponse.jobs, artifacts: artifactResponse.artifacts, artifact,
  });
  return { expected, source: { run: run.id, attempt: run.run_attempt, artifact: artifact.id } };
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'source') {
    console.log(JSON.stringify(await validateLiveSource(process.env)));
    return;
  }
  if (mode === 'payload') {
    const path = process.argv[3];
    if (!path) throw new Error('Pages artifact.tar path is required');
    const result = inspectPagesTar(await readFile(resolve(path)), {
      version: process.env.RESTORE_VERSION,
      commit: process.env.RESTORE_COMMIT,
      payloadSha256: process.env.RESTORE_PAYLOAD_SHA256,
    });
    console.log(JSON.stringify(result));
    return;
  }
  throw new Error('Expected pages-restore.mjs source or payload');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
