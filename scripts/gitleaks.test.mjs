import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// CI names its pinned scanner; then these tests never skip for want of one.
const binary = process.env.GITLEAKS_BIN || [
  join(homedir(), '.local', 'bin', 'gitleaks'),
  'gitleaks',
].find(candidate => spawnSync(candidate, ['version'], { stdio: 'ignore' }).status === 0);

test('gitleaks policy is pinned and documented', () => {
  const policy = JSON.parse(readFileSync('dev/release-policy.json', 'utf8'));
  assert.equal(policy.gitleaks.version, '8.30.1');
  assert.equal(policy.gitleaks.config, '.gitleaks.toml');
  assert.ok(existsSync('.gitleaks.toml'));
});

test('the actual scanner matches the pinned version', { skip: !binary }, () => {
  const expected = JSON.parse(readFileSync('dev/release-policy.json', 'utf8')).gitleaks.version;
  const version = spawnSync(binary, ['version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.error?.message || version.stderr || 'scanner version failed');
  if (version.stdout.trim().replace(/^v/, '') === expected) return;
  // `go install ...@v8.30.1` preserves module identity but upstream leaves its
  // release-version variable unset. Read the compiled module rather than
  // treating that placeholder as proof of the selected release.
  const metadata = spawnSync('go', ['version', '-m', binary], { encoding: 'utf8' });
  assert.equal(metadata.status, 0, metadata.error?.message || metadata.stderr || 'scanner module identity unavailable');
  const module = metadata.stdout.split('\n').map(line => line.trim().split(/\s+/))
    .find(fields => fields[0] === 'mod' && fields[1] === 'github.com/zricethezav/gitleaks/v8');
  assert.equal(module?.[2], `v${expected}`, metadata.stdout);
});

test('an explicit missing scanner fails detection instead of skipping it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coral-gitleaks-missing-'));
  try {
    const env = { ...process.env, GITLEAKS_BIN: join(directory, 'missing-gitleaks') };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-name-pattern=committed synthetic secret',
      fileURLToPath(import.meta.url)], { encoding: 'utf8', env });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /fail 1/);
    assert.match(result.stdout, /skipped 0/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the committed synthetic secret is detected by the actual scanner', { skip: !binary }, () => {
  const result = spawnSync(binary, [
    'detect', '--no-git', '--redact', '--exit-code', '17',
    '--config', 'scripts/fixtures/gitleaks/detection.toml',
    '--source', 'scripts/fixtures/gitleaks/synthetic-secret.txt',
  ], { stdio: 'pipe' });
  assert.equal(result.status, 17, result.error?.message || result.stderr?.toString() || 'scanner detection failed');
});

// The normal-source scan is the blocking CI secret-scan step and the local
// check:gitleaks script; it is not repeated here.
test('an allowed fake key cannot hide an extended credential', { skip: !binary }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'coral-gitleaks-'));
  try {
    const suffix = ['Actual', 'Secret', '9876543210'].join('');
    const extendedKey = ['intercepted-slice92-key', suffix].join('-');
    writeFileSync(
      join(directory, 'extended-key.txt'),
      `api_key = "${extendedKey}"\n`,
    );
    const result = spawnSync(binary, [
      'detect', '--no-git', '--redact', '--exit-code', '17',
      '--config', '.gitleaks.toml', '--source', directory,
    ], { stdio: 'pipe' });
    assert.equal(result.status, 17, result.error?.message || result.stderr?.toString() || 'scanner detection failed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
