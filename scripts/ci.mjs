import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CANDIDATE_PACKAGES, createCandidateManifest, verifyCandidateFiles } from './candidate-artifacts.mjs';
import { readSafeTarball } from './api-compat-lib.mjs';
import { npmCommand } from './npm-command.mjs';
import { buildOnlineDelivery, verifyFrozenSite } from './online-delivery.mjs';
import { suiteFiles } from './ci-suites.mjs';

const root = resolve(import.meta.dirname, '..');
const artifacts = resolve(process.env.CORAL_ARTIFACT_DIR ?? join(root, 'candidate-artifacts'));
const siteArtifacts = resolve(process.env.CORAL_SITE_ARTIFACT_DIR ?? join(root, 'candidate-site'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || result.status));
  return result.stdout;
};

/** One bounded launcher: literal arguments, inherited output, named failure. */
export function run(command, args, { cwd = root, env = {}, timeout = 1_800_000 } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', timeout,
    env: { ...process.env, npm_config_logs_max: '0', ...env } });
  if (result.error || result.status !== 0)
    throw new Error(command + ' ' + args.join(' ') + ' failed: ' +
      (result.error?.message ?? result.signal ?? result.status));
}
export function npm(args, options) { const command = npmCommand(args); run(command.command, command.args, options); }
function script(file, args = [], options) { run(process.execPath, [join(root, 'scripts', file), ...args], options); }
export function scriptTests(suite) { run(process.execPath, ['--test', ...suiteFiles(suite)]); }

async function expectedIdentity() {
  return {
    version: process.env.RELEASE_VERSION ?? JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
    productSha: process.env.RELEASE_COMMIT ?? process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']).trim(),
  };
}

/** The frozen candidate manifest, verified against this exact source and version. */
export async function verifiedCandidate(directory = artifacts) {
  const value = JSON.parse(await readFile(join(directory, 'candidate-manifest.json'), 'utf8'));
  const errors = await verifyCandidateFiles(directory, value, await expectedIdentity());
  if (errors.length) throw new Error(errors.join('\n'));
  return value;
}

/** Path of one verified candidate archive; never repacks. */
export async function candidateTarball(name, directory = artifacts) {
  const value = await verifiedCandidate(directory);
  const pkg = value.packages.find(item => item.name === name);
  if (!pkg) throw new Error('Candidate manifest omits ' + name);
  return join(directory, pkg.filename);
}

export async function hydratePackages() {
  const value = await verifiedCandidate();
  for (const pkg of value.packages) {
    const workspace = pkg.name === 'tree-sitter-coral' ? 'tree-sitter-coral' : pkg.name.split('/')[1];
    const base = join(root, 'packages', workspace);
    const entries = readSafeTarball(await readFile(join(artifacts, pkg.filename)));
    // Only prepared, platform-independent compiler outputs are restored.
    // Source files, manifests, tests and native binaries stay in this checkout.
    await rm(join(base, 'dist'), { recursive: true, force: true });
    for (const entry of entries) if (entry.type === '0' && entry.name.startsWith('package/dist/')) {
      const target = join(base, entry.name.slice('package/'.length));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, entry.data);
    }
  }
  return value;
}

const IDENTITY_FIELDS = ['commit', 'product', 'version'];
export function assertSiteIdentity(identity, expected) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) ||
      Object.keys(identity).sort().join(',') !== IDENTITY_FIELDS.join(',') ||
      IDENTITY_FIELDS.some(field => identity[field] !== expected[field]))
    throw new Error('Candidate site source identity mismatch');
  return identity;
}

export async function restoreSite({ expectedSha = process.env.EXPECTED_SITE_SHA256 } = {}) {
  const archive = join(siteArtifacts, 'site.tar');
  if (!/^[a-f0-9]{64}$/.test(expectedSha ?? '') ||
      digest(await readFile(archive)) !== expectedSha) throw new Error('Candidate site payload digest mismatch');
  const listing = spawnSync('tar', ['-tf', archive], { encoding: 'utf8' });
  const types = spawnSync('tar', ['-tvf', archive], { encoding: 'utf8' });
  // Regular files and directories only, with relative non-escaping names.
  if (listing.status !== 0 || types.status !== 0 ||
      listing.stdout.split(/\r?\n/).filter(Boolean).some(name =>
        name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') || name.split('/').includes('..')) ||
      types.stdout.split(/\r?\n/).filter(Boolean).some(line => !['-', 'd'].includes(line[0])))
    throw new Error('Unsafe candidate site archive');
  const output = join(root, 'build/site');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  run('tar', ['-xf', archive, '-C', output]);
  const { version, productSha } = await expectedIdentity();
  const identity = assertSiteIdentity(JSON.parse(await readFile(join(output, 'version.json'), 'utf8')),
    { product: 'coral', version, commit: productSha });
  await verifyFrozenSite(output, identity);
  return output;
}

// Build intermediates are not packaged; validate them where the real build ran.
const BUILD_OUTPUT_TESTS = ['test/build-output.test.ts'];
function buildOutputChecks() {
  npm(['run', 'test:run', '-w', '@coral-viz/browser', '--', ...BUILD_OUTPUT_TESTS]);
}

async function packageCandidate() {
  npm(['run', 'build:public']);
  buildOutputChecks();
  npm(['run', 'generate', '-w', 'tree-sitter-coral']);
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  // Every generated input is built above; lifecycle scripts would rebuild it.
  for (const name of CANDIDATE_PACKAGES)
    npm(['pack', '--ignore-scripts', '--workspace', name, '--pack-destination', artifacts]);
  await createCandidateManifest(artifacts);
}

async function siteCandidate() {
  await hydratePackages();
  await rm(join(root, 'build'), { recursive: true, force: true });
  // Hydrated dist and the ignored candidate directories are the only differences.
  const built = await buildOnlineDelivery({ repository: root, output: join(root, 'build'), prepared: true });
  await rm(siteArtifacts, { recursive: true, force: true });
  await mkdir(siteArtifacts, { recursive: true });
  run('tar', ['-cf', join(siteArtifacts, 'site.tar'), '-C', built.site, '.']);
  const values = {
    'version-sha256': digest(await readFile(join(built.site, 'version.json'))),
    'integrity-sha256': digest(await readFile(join(built.site, 'integrity.json'))),
    'payload-sha256': digest(await readFile(join(siteArtifacts, 'site.tar'))),
  };
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => key + '=' + value).join('\n') + '\n');
}

/** Read-only consumers of prepared declarations; this function never builds. */
export function contractChecks({ suite = 'contracts' } = {}) {
  npm(['run', 'typecheck']);
  scriptTests(suite);
  script('fuzz-model.mjs', ['--target=all', '--cases=12', '--max-size=96', '--timeout-ms=10000']);
  script('verify-language-spec.mjs');
  script('verify-graphir-adoption.mjs');
}

/**
 * Each product suite runs once; covered suites run only with coverage. A
 * hydrated checkout has packaged dist only, so build-output tests (run by the
 * producer and Windows-risk builds) are excluded there.
 */
export function unitSuites({ coverage = true, hydrated = false } = {}) {
  for (const workspace of ['language', 'render', 'browser', 'viz', 'mcp-server', 'diagram-editor']) {
    const covered = coverage && ['viz', 'mcp-server', 'diagram-editor'].includes(workspace);
    const args = [
      ...(workspace === 'diagram-editor' ? ['--maxWorkers=2'] : []),
      ...(hydrated && workspace === 'browser' ? BUILD_OUTPUT_TESTS.flatMap(file => ['--exclude', file]) : []),
    ];
    npm(['run', covered ? 'test:coverage' : 'test:run', '-w', '@coral-viz/' + workspace,
      ...(args.length ? ['--', ...args] : [])]);
  }
}

/** Native compile, source corpus/parity and the rich packed consumer. */
export function nativeChecks(env = {}) {
  npm(['run', 'build', '-w', 'tree-sitter-coral']);
  script('tree-sitter-test.mjs');
  npm(['run', 'test:parity', '-w', 'tree-sitter-coral']);
  script('verify-packed-tree-sitter.mjs', [], { env });
}

export function sourceChecks() {
  npm(['run', 'check:toolchain']); npm(['run', 'check:workflow-policy']);
  npm(['run', 'lint']); npm(['run', 'lint:md']);
  npm(['run', 'test:markdownlint']);
  script('check-docs-structure.mjs'); script('check-markdown-links.mjs');
  npm(['run', 'audit:dependencies']); scriptTests('source');
}

export async function executeStage(stage) {
  if (stage === 'source') sourceChecks();
  else if (stage === 'packages') await packageCandidate();
  else if (stage === 'hydrate') await hydratePackages();
  else if (stage === 'site') await siteCandidate();
  else if (stage === 'restore-site') await restoreSite();
  else if (stage === 'browser-prepare') {
    await hydratePackages();
    const site = await restoreSite();
    // Replace, never merge: stale editor output must not survive.
    const editor = join(root, 'packages/diagram-editor/dist');
    await rm(editor, { recursive: true, force: true });
    await cp(site, editor, { recursive: true, errorOnExist: true, force: false });
  } else if (stage === 'windows-risk') {
    // Real Windows builds, then every current contract and Windows fixture once.
    npm(['run', 'build:public']);
    buildOutputChecks();
    npm(['run', 'build', '-w', 'tree-sitter-coral']);
    contractChecks({ suite: 'windows' });
  } else if (stage === 'contracts') { await hydratePackages(); contractChecks(); }
  else if (stage === 'unit') { await hydratePackages(); unitSuites({ hydrated: true }); }
  else if (stage === 'windows-unit') { await hydratePackages(); unitSuites({ coverage: false, hydrated: true }); }
  else if (stage === 'native') { await hydratePackages(); nativeChecks({ CORAL_ARTIFACT_DIR: artifacts }); }
  else if (stage === 'delivery') {
    const site = await restoreSite();
    const temporary = await mkdtemp(join(tmpdir(), 'coral-delivery-contract-'));
    try {
      // The integration test serves and tampers with this disposable copy only.
      await cp(site, join(temporary, 'candidate'), { recursive: true });
      run(process.execPath, ['--test', join(root, 'scripts/online-delivery.integration.test.mjs')], {
        env: { CORAL_FROZEN_SITE: join(temporary, 'candidate') },
      });
    } finally { await rm(temporary, { recursive: true, force: true }); }
  } else throw new Error('Unknown CI stage: ' + stage);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await executeStage(process.argv[2]);
