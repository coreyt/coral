import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const hook = join(root, '.claude/hooks/session-start.sh');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'coral-session-start-'));
  const project = join(directory, 'project');
  const bin = join(directory, 'bin');
  const trace = join(project, '.hook-ci-trace');
  await mkdir(project);
  await mkdir(bin);
  await writeFile(join(project, 'package.json'), '{}\n');
  await writeFile(join(project, 'package-lock.json'), '{}\n');
  await writeFile(join(bin, 'node'), `#!/bin/bash
if [[ "\${1:-}" == '--version' ]]; then
  printf '%s\\n' "\${FAKE_NODE_VERSION:-v26.8.2}"
  exit 0
fi
exit 97
`);
  await writeFile(join(bin, 'npm'), `#!/bin/bash
if [[ "\${1:-}" == '--version' ]]; then
  printf '%s\\n' "\${FAKE_NPM_VERSION:-12.0.2}"
  exit 0
fi
if [[ "\${1:-}" == 'ci' ]]; then
  printf '%s\\n' 'ci' >> .hook-ci-trace
  exit "\${FAKE_CI_STATUS:-0}"
fi
exit 98
`);
  await chmod(join(bin, 'node'), 0o755);
  await chmod(join(bin, 'npm'), 0o755);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { bin, project, trace };
}

function run({ bin, project }, extra = {}) {
  const bash = process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    : '/bin/bash';
  assert.ok(existsSync(bash), `Bash executable not found at ${bash}`);
  return spawnSync(bash, [hook], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin,
      CLAUDE_PROJECT_DIR: project,
      ...extra,
    },
  });
}

async function traceText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

test('non-remote sessions exit before validating or invoking tools', async (t) => {
  const files = await fixture(t);
  const result = run(files, { CLAUDE_CODE_REMOTE: 'false', CLAUDE_PROJECT_DIR: '' });
  assert.equal(result.status, 0);
  assert.equal(await traceText(files.trace), '');
});

test('remote sessions fail closed before npm ci on a wrong Node version', async (t) => {
  const files = await fixture(t);
  const result = run(files, { CLAUDE_CODE_REMOTE: 'true', FAKE_NODE_VERSION: 'v26.8.1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires Node 26\.8\.2\/npm 12\.0\.2; found Node 26\.8\.1\/npm 12\.0\.2/);
  assert.equal(await traceText(files.trace), '');
});

test('remote sessions fail closed before npm ci on a wrong npm version', async (t) => {
  const files = await fixture(t);
  const result = run(files, { CLAUDE_CODE_REMOTE: 'true', FAKE_NPM_VERSION: '12.0.1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires Node 26\.8\.2\/npm 12\.0\.2; found Node 26\.8\.2\/npm 12\.0\.1/);
  assert.equal(await traceText(files.trace), '');
});

test('the exact remote toolchain runs npm ci in the repository root', async (t) => {
  const files = await fixture(t);
  const result = run(files, { CLAUDE_CODE_REMOTE: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await traceText(files.trace), 'ci\n');
});

test('npm ci failures propagate', async (t) => {
  const files = await fixture(t);
  const result = run(files, { CLAUDE_CODE_REMOTE: 'true', FAKE_CI_STATUS: '23' });
  assert.equal(result.status, 23);
  assert.equal(await traceText(files.trace), 'ci\n');
});

test('the executable hook remains registered exactly once', async () => {
  const settings = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
  const commands = settings.hooks.SessionStart.flatMap(entry => entry.hooks.map(item => item.command));
  assert.equal(commands.filter(command => command === '$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh').length, 1);
  const tracked = spawnSync('git', ['ls-files', '--stage', '--', '.claude/hooks/session-start.sh'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.match(tracked.stdout, /^100755 /);
});
