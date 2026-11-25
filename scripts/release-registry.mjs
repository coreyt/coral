import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
export const RELEASE_PACKAGES = [
  '@coral-viz/language',
  '@coral-viz/render',
  '@coral-viz/browser',
  '@coral-viz/viz',
  '@coral-viz/mcp-server',
  'tree-sitter-coral',
];

import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCandidateFiles } from './candidate-artifacts.mjs';
import { npmCommand } from './npm-command.mjs';

const registry = 'https://registry.npmjs.org';

// CRO100-5 (0.2.5 issue N2): npm propagation can take longer than a few
// minutes. Registry reads and the registry install are retried for at least
// 15 minutes, bounded, and never republish.
export const REGISTRY_PROPAGATION_WINDOW_MS = 15 * 60 * 1000;
export const REGISTRY_POLL_INTERVAL_MS = 30_000;
const realClock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms)),
};
export async function retryWithinWindow(operation, {
  now = realClock.now, sleep = realClock.sleep,
  windowMs = REGISTRY_PROPAGATION_WINDOW_MS, intervalMs = REGISTRY_POLL_INTERVAL_MS,
} = {}) {
  const deadline = now() + windowMs;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (now() >= deadline) throw error;
      await sleep(intervalMs);
    }
  }
}

function integrityDigests(integrity) {
  const [algorithm, encoded] = String(integrity).split('-', 2);
  if (algorithm !== 'sha512' || !encoded) throw new Error('Expected sha512 registry integrity');
  const bytes = Buffer.from(encoded, 'base64');
  return new Set([encoded, bytes.toString('hex'), bytes.toString('utf8')]);
}

export function validateProvenance(record, expected) {
  const { metadata, attestation } = record;
  if (metadata.name !== expected.name) throw new Error(`Unexpected package name for ${expected.name}`);
  if (metadata.version !== expected.version) throw new Error(`Unexpected version for ${expected.name}`);
  if (!metadata.integrity) throw new Error(`Missing integrity for ${expected.name}`);
  if (expected.expectedIntegrity && metadata.integrity !== expected.expectedIntegrity) {
    throw new Error(`Candidate integrity mismatch for ${expected.name}`);
  }
  if (attestation.repository !== 'coreyt/coral') throw new Error(`Wrong provenance repository for ${expected.name}`);
  if (!String(attestation.workflow).endsWith('publish.yml')) throw new Error(`Wrong provenance workflow for ${expected.name}`);
  if (attestation.commit !== expected.commit) throw new Error(`Wrong provenance commit for ${expected.name}`);
  if (attestation.subjectName !== expected.name || attestation.subjectVersion !== expected.version) {
    throw new Error(`Wrong provenance subject for ${expected.name}`);
  }
  const subjectDigest = String(attestation.subjectDigest).toLowerCase();
  const expectedDigests = new Set([...integrityDigests(metadata.integrity)].map((value) => value.toLowerCase()));
  if (!expectedDigests.has(subjectDigest)) {
    throw new Error(`Wrong provenance digest for ${expected.name}`);
  }
}

export function validatePublishedRecord(record, expected) {
  const { metadata, attestation } = record;
  if (metadata.name !== expected.name) throw new Error(`Unexpected package name for ${expected.name}`);
  if (metadata.version !== expected.version) throw new Error(`Unexpected version for ${expected.name}`);
  if (!metadata.integrity) throw new Error(`Missing integrity for ${expected.name}`);
  if (attestation) {
    validateProvenance(record, expected);
    return;
  }
  if (!expected.allowPrivateDigest) {
    throw new Error(`Missing trusted-publisher attestation for ${expected.name}`);
  }
  if (!expected.localIntegrity || metadata.integrity !== expected.localIntegrity) {
    throw new Error(`Private-repository integrity mismatch for ${expected.name}`);
  }
}

export function allowPrivateDigestRecovery(environment, commit) {
  return environment.RELEASE_PRIVATE_REPOSITORY === 'true'
    && environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_REPOSITORY === 'coreyt/coral'
    && environment.GITHUB_WORKFLOW_REF
      === 'coreyt/coral/.github/workflows/publish.yml@refs/heads/main'
    && environment.GITHUB_SHA === commit;
}

export function allowPagesDigestVerification(environment, commit, checkedOutCommit) {
  return environment.RELEASE_PRIVATE_REPOSITORY === 'true'
    && environment.RELEASE_PAGES_REGISTRY_VERIFICATION === 'true'
    && environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_REPOSITORY === 'coreyt/coral'
    && environment.RELEASE_JOB_WORKFLOW_REF
      === 'coreyt/coral/.github/workflows/pages.yml@refs/heads/main'
    && checkedOutCommit === commit;
}

// TRO100-1: release.yml re-verifies the registry before creating the tag. On
// the expected private-repository path npm attaches no attestation, so its own
// main-branch dispatch context, at the checked-out product commit, admits the
// digest substitute (design: Publication and provenance).
export function allowReleaseDigestVerification(environment, commit, checkedOutCommit) {
  return environment.RELEASE_PRIVATE_REPOSITORY === 'true'
    && environment.RELEASE_TAG_REGISTRY_VERIFICATION === 'true'
    && environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_REPOSITORY === 'coreyt/coral'
    && environment.GITHUB_WORKFLOW_REF
      === 'coreyt/coral/.github/workflows/release.yml@refs/heads/main'
    && environment.GITHUB_SHA === commit
    && checkedOutCommit === commit;
}

export const privateDigestAllowed = (environment, commit, checkedOutCommit) =>
  allowPrivateDigestRecovery(environment, commit)
  || allowPagesDigestVerification(environment, commit, checkedOutCommit)
  || allowReleaseDigestVerification(environment, commit, checkedOutCommit);

export function classifyRegistryState(records, expected) {
  let firstMissing = records.length;
  for (let index = 0; index < records.length; index += 1) {
    if (records[index] === null) {
      firstMissing = Math.min(firstMissing, index);
      continue;
    }
    if (index >= firstMissing) throw new Error('Published release packages are not a contiguous prefix');
    validatePublishedRecord(records[index], {
      name: RELEASE_PACKAGES[index], version: expected.version, commit: expected.commit,
      allowPrivateDigest: expected.allowPrivateDigest,
      localIntegrity: expected.localIntegrities?.[RELEASE_PACKAGES[index]],
      expectedIntegrity: expected.localIntegrities?.[RELEASE_PACKAGES[index]],
    });
  }
  return firstMissing;
}

export function validateRegistryLock(lock, version, packageNames = RELEASE_PACKAGES) {
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === '') continue;
    if (entry.link === true) throw new Error(`Non-registry link resolution at ${path}`);
    const resolved = String(entry.resolved ?? '');
    if (!resolved.startsWith(`${registry}/`)) {
      throw new Error(`Non-registry resolution at ${path}: ${resolved || '(missing)'}`);
    }
    if (!entry.integrity) throw new Error(`Registry lock is missing integrity at ${path}`);
    for (const name of packageNames) {
      if ((path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
        && entry.version !== version) {
        throw new Error(`Wrong registry version for ${name}: ${entry.version}`);
      }
    }
  }
  for (const name of packageNames) {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry) throw new Error(`Registry lock is missing ${name}`);
    if (entry.version !== version) throw new Error(`Wrong registry version for ${name}: ${entry.version}`);
  }
}

export function validateNpmLs(tree, version, packageNames = RELEASE_PACKAGES) {
  const visit = (node, path) => {
    if (node.problems?.length) throw new Error(`npm ls problems at ${path}: ${node.problems.join('; ')}`);
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      if (packageNames.includes(name) && dependency.version !== version) {
        throw new Error(`Wrong npm ls version for ${name}: ${dependency.version}`);
      }
      visit(dependency, `${path} > ${name}`);
    }
  };
  visit(tree, 'root');
  for (const name of packageNames) {
    if (!tree.dependencies?.[name]) throw new Error(`npm ls is missing direct ${name}`);
  }
}

function statementsFromAttestations(value) {
  const statements = [];
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.payload === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(item.payload, 'base64').toString('utf8'));
        if (decoded?.subject && decoded?.predicate) statements.push(decoded);
      } catch { /* not a DSSE payload */ }
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
  return statements;
}

export function normalizeAttestation(metadata, response, expected) {
  const statement = statementsFromAttestations(response).find((candidate) => {
    if (candidate.predicateType !== 'https://slsa.dev/provenance/v1') return false;
    const workflow = candidate.predicate?.buildDefinition?.externalParameters?.workflow;
    if (workflow?.repository !== 'https://github.com/coreyt/coral'
      || workflow.path !== '.github/workflows/publish.yml'
      || workflow.ref !== 'refs/heads/main') return false;
    return candidate.predicate?.buildDefinition?.resolvedDependencies?.some((dependency) =>
      dependency.uri === 'git+https://github.com/coreyt/coral@refs/heads/main'
      && dependency.digest?.gitCommit === expected.commit);
  });
  if (!statement) throw new Error(`Missing trusted-publisher statement for ${expected.name}`);
  const subject = statement.subject.map((item) => ({ item, identity: parseNpmSubject(item.name) }))
    .find(({ identity }) => identity?.name === expected.name && identity.version === expected.version);
  if (!subject) throw new Error(`Missing provenance subject for ${expected.name}`);
  const subjectDigest = subject.item.digest?.sha512;
  return {
    repository: 'coreyt/coral',
    workflow: '.github/workflows/publish.yml',
    commit: expected.commit,
    subjectName: subject.identity.name,
    subjectVersion: subject.identity.version,
    subjectDigest,
  };
}

function parseNpmSubject(value) {
  const raw = String(value ?? '');
  if (!raw.startsWith('pkg:npm/')) return null;
  const identity = raw.slice('pkg:npm/'.length).split(/[?#]/, 1)[0];
  const separator = identity.lastIndexOf('@');
  if (separator <= 0 || separator === identity.length - 1) return null;
  try {
    return {
      name: decodeURIComponent(identity.slice(0, separator)),
      version: decodeURIComponent(identity.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export function resolveAttestationUrl(metadata) {
  const attestations = metadata.dist?.attestations;
  if (attestations == null) return null;
  const value = attestations && typeof attestations === 'object' ? attestations.url : undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Malformed trusted-publisher attestation metadata');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Malformed trusted-publisher attestation URL');
  }
  if (url.protocol !== 'https:') throw new Error('Trusted-publisher attestation URL must use HTTPS');
  return url.href;
}

async function registryRecord(name, version, commit) {
  const url = `${registry}/${name.replace('/', '%2f')}/${version}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Registry metadata failed for ${name}: HTTP ${response.status}`);
  const metadata = await response.json();
  const attestationUrl = resolveAttestationUrl(metadata);
  const normalizedMetadata = {
    name: metadata.name, version: metadata.version, integrity: metadata.dist?.integrity,
  };
  if (!attestationUrl) return { metadata: normalizedMetadata, attestation: null };
  const attestationResponse = await fetch(attestationUrl, { headers: { accept: 'application/json' } });
  if (!attestationResponse.ok) throw new Error(`Attestation fetch failed for ${name}: HTTP ${attestationResponse.status}`);
  const attestation = normalizeAttestation(metadata, await attestationResponse.json(), { name, version, commit });
  return { metadata: normalizedMetadata, attestation };
}

// CRO100-9: registry verification always follows publication of at least
// one immutable package, so an advisory disclosed after publication cannot be
// fixed in these bytes. It is recorded (ordinary output and a workflow
// warning), never blocking; publish.yml's workspace npm audit at the high level
// still blocks before any npm publish. Signature verification stays blocking.
export function recordRegistryAudit(result) {
  let report = null;
  try {
    report = JSON.parse(result.stdout || 'null');
  } catch {
    report = null;
  }
  const vulnerabilities = report?.metadata?.vulnerabilities ?? null;
  return {
    schemaVersion: 1, blocking: false, exitStatus: result.status, vulnerabilities,
    highOrCritical: vulnerabilities ? (vulnerabilities.high ?? 0) + (vulnerabilities.critical ?? 0) : null,
  };
}

function run(command, args, cwd, env = process.env) {
  const invocation = command === 'npm' ? npmCommand(args, { env }) : { command, args };
  const result = spawnSync(invocation.command, invocation.args, { cwd, env, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

export function normalizePackResult(packed, name, version) {
  const entries = Array.isArray(packed) ? packed : Object.values(packed);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.name !== name || entry.version !== version
    || !entry.integrity || entry.filename !== basename(entry.filename)
    || !entry.filename.endsWith('.tgz')) {
    throw new Error(`Unexpected local pack identity for ${name}`);
  }
  return entry;
}

export async function candidateIntegrities(path, version, commit) {
  if (!path) throw new Error('RELEASE_CANDIDATE_MANIFEST is required');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const errors = await verifyCandidateFiles(dirname(path), manifest, {
    version, productSha: commit,
  });
  if (errors.length) throw new Error(errors.join('\n'));
  return Object.fromEntries(manifest.packages.map(pkg => [pkg.name, pkg.integrity]));
}

export function registryNativeSmokeSource(version) {
  return version === '0.2.6' ? 'service "Registry"' : '@diagram flowchart\nRegistry process\n';
}

async function verifyInstalled(packageNames, version) {
  if (packageNames.length === 0) return;
  const directory = await mkdtemp(join(tmpdir(), 'coral-registry-verify-'));
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({
      name: 'coral-registry-verifier', private: true, type: 'module',
      allowScripts: { 'tree-sitter-coral': true, 'tree-sitter': true },
    }));
    const specs = packageNames.map((name) => `${name}@${version}`);
    const extras = ['typescript@6.0.3'];
    if (packageNames.includes('@coral-viz/viz')) {
      extras.push('react@19.2.8', 'react-dom@19.2.8', '@xyflow/react@12.11.6');
    }
    if (packageNames.includes('tree-sitter-coral')) extras.push('tree-sitter@0.25.1');
    await retryWithinWindow(async () => run('npm', ['install', '--save-exact', `--registry=${registry}`, ...specs, ...extras], directory, {
      ...process.env, npm_config_cache: join(directory, 'npm-cache'),
    }));
    const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
    validateRegistryLock(lock, version, packageNames);
    const dependencyTree = JSON.parse(run('npm', ['ls', '--json', '--all'], directory));
    validateNpmLs(dependencyTree, version, packageNames);
    const imports = packageNames.flatMap((name) => name === '@coral-viz/render'
      ? [name, '@coral-viz/render/layout'] : name === 'tree-sitter-coral' ? [] : [name]);
    if (imports.length) {
      run(process.execPath, ['--input-type=module', '--eval', imports.map((name) => `await import(${JSON.stringify(name)});`).join('')], directory);
    }
    await writeFile(join(directory, 'smoke.ts'), [
      ...imports.map((name) => `import ${JSON.stringify(name)};`),
      ...(packageNames.includes('tree-sitter-coral') ? ["import 'tree-sitter-coral';"] : []),
    ].join('\n'));
    await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, skipLibCheck: true, module: 'NodeNext',
        moduleResolution: 'NodeNext', target: 'ES2022',
      },
      include: ['smoke.ts'],
    }));
    run(process.execPath, [join(directory, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], directory);
    if (packageNames.includes('@coral-viz/mcp-server')) {
      const executable = join(directory, `node_modules/.bin/coral-mcp${process.platform === 'win32' ? '.cmd' : ''}`);
      await access(executable);
      const manifest = JSON.parse(await readFile(join(directory, 'node_modules/@coral-viz/mcp-server/package.json'), 'utf8'));
      if (manifest.bin?.['coral-mcp'] !== 'dist/index.js') throw new Error('Unexpected coral-mcp bin target');
      run(process.execPath, [join(directory, 'node_modules/@coral-viz/mcp-server/dist/index.js')], directory);
    }
    if (packageNames.includes('tree-sitter-coral')) {
      run(process.execPath, ['--input-type=commonjs', '--eval',
        `const Parser=require('tree-sitter');const grammar=require('tree-sitter-coral');const parser=new Parser();parser.setLanguage(grammar);if(parser.parse(${JSON.stringify(registryNativeSmokeSource(version))}).rootNode.hasError)process.exit(1)`], directory);
    }
    run('npm', ['audit', 'signatures'], directory);
    const npm = npmCommand(['audit', '--json']);
    const audit = recordRegistryAudit(spawnSync(npm.command, npm.args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' }));
    if (audit.highOrCritical !== 0) {
      console.log(`::warning::Recorded post-publication registry audit (not blocking): ${JSON.stringify(audit)}`);
    }
    console.log(JSON.stringify({ version, packages: packageNames.map((name) => ({
      name, integrity: lock.packages[`node_modules/${name}`].integrity,
    })) }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// CRO100-15: `preflight` runs in publish.yml's OIDC-bearing publish job. A
// published prefix is proven by its registry SRI equal to the retained
// candidate manifest (classifyRegistryState), so preflight never installs
// packages there; the token-free registry job installs and imports the
// complete set in `verify`.
export async function runRegistryMode(mode, expected, {
  readRecords, verifyInstalled: install, writeOutput, retry = retryWithinWindow,
}) {
  if (mode === 'preflight') {
    const startIndex = classifyRegistryState(await readRecords(), expected);
    await writeOutput(`start-index=${startIndex}\n`);
    return startIndex;
  }
  if (mode === 'verify') {
    const records = await retry(async () => {
      const current = await readRecords();
      if (!current.every(Boolean)) throw new Error('Registry publication did not propagate within the 15-minute window');
      return current;
    });
    const count = classifyRegistryState(records, expected);
    if (count !== RELEASE_PACKAGES.length) throw new Error('Registry publication is incomplete');
    await install(RELEASE_PACKAGES, expected.version);
    return count;
  }
  throw new Error('Expected preflight or verify mode');
}

async function main() {
  const mode = process.argv[2];
  const version = process.env.RELEASE_VERSION;
  const commit = process.env.RELEASE_COMMIT;
  if (version !== RENDERER_CANDIDATE.version || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
    throw new Error('Active RELEASE_VERSION and a full RELEASE_COMMIT are required');
  }
  const checkedOutCommit = run('git', ['rev-parse', 'HEAD'], process.cwd()).trim();
  const allowPrivateDigest = privateDigestAllowed(process.env, commit, checkedOutCommit);
  const localIntegrities = await candidateIntegrities(
    process.env.RELEASE_CANDIDATE_MANIFEST, version, commit,
  );
  await runRegistryMode(mode, { version, commit, allowPrivateDigest, localIntegrities }, {
    readRecords: () => Promise.all(RELEASE_PACKAGES.map((name) => registryRecord(name, version, commit))),
    verifyInstalled,
    writeOutput: line => (process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, line) : process.stdout.write(line)),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
