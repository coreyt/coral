import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { parseWorkflow } from './workflow-policy.mjs';

// The release job's tag-and-release step runs here as the hosted runner runs
// it: `bash --noprofile --norc -eo pipefail`, with no git identity available
// (CRO100-1), against a local bare `origin` and a scripted `gh` stand-in that
// models an absent, draft or published release (CRO100-3, CRO100-12). No
// network, no real `gh`, and no real repository is touched.
const STEP = 'Create immutable annotated tag and GitHub release';
const releaseStep = () => parseWorkflow(readFileSync('.github/workflows/release.yml', 'utf8'))
  .jobs.release.steps.find(step => step.name === STEP);

const GH_STUB = `#!/usr/bin/env bash
set -u
dir="$GH_STUB_DIR"
state="$(cat "$dir/state")"
printf '%s\\n' "$*" >> "$dir/calls"
case "$1 $2" in
  "release view")
    [ "$state" = absent ] && exit 1
    case " $* " in *" --json isDraft "*) if [ "$state" = draft ]; then echo true; else echo false; fi ;; esac
    exit 0 ;;
  "release download")
    [ "$state" = absent ] && exit 1
    [ -f "$dir/asset" ] || { echo 'no assets match the file pattern' >&2; exit 1; }
    out=""; prev=""
    for arg in "$@"; do [ "$prev" = --output ] && out="$arg"; prev="$arg"; done
    cp "$dir/asset" "$out"; exit 0 ;;
  "release create")
    [ "$state" = absent ] || exit 1
    git ls-remote --exit-code origin "refs/tags/$3" > /dev/null || { echo 'tag not found' >&2; exit 1; }
    cp "$4" "$dir/asset"; echo published > "$dir/state"; exit 0 ;;
  "release edit")
    [ "$state" = draft ] || exit 1
    case " $* " in *" --draft=false "*) echo published > "$dir/state" ;; esac
    exit 0 ;;
esac
case "$1 $2" in
  "api repos/coreyt/coral/releases/tags/"*)
    [ "$state" = published ] || { echo 'HTTP 404' >&2; exit 1; }
    cat "$dir/immutable"; exit 0 ;;
esac
echo "unexpected gh $*" >&2
exit 2
`;

function isolatedEnvironment(root, extra = {}) {
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  // Inherit only PATH and Windows runtime essentials, never git identity:
  // GitHub-hosted runners cannot auto-detect a usable identity, which
  // user.useConfigOnly reproduces deterministically on any host.
  return {
    ...Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'].flatMap(name =>
      process.env[name] ? [[name, process.env[name]]] : [])),
    PATH: `${join(root, 'bin')}${delimiter}${process.env.PATH}`,
    HOME: home, XDG_CONFIG_HOME: join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.useConfigOnly', GIT_CONFIG_VALUE_0: 'true',
    GIT_TERMINAL_PROMPT: '0', GH_STUB_DIR: join(root, 'gh'),
    ...extra,
  };
}

function git(cwd, env, ...args) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

const fixtureIdentity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test'];

// Builds a clone whose origin is a local bare repository, a `gh` stand-in in
// the given state, and the release evidence the release job materialized.
function fixture({ state = 'absent', tag = false, asset = 'same', immutable = 'true' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'coral-release-step-'));
  const env = isolatedEnvironment(root);
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'gh'));
  writeFileSync(join(root, 'bin', 'gh'), GH_STUB);
  chmodSync(join(root, 'bin', 'gh'), 0o755);
  git(root, env, 'init', '--quiet', '--bare', origin);
  git(root, env, 'init', '--quiet', '--initial-branch=main', work);
  writeFileSync(join(work, 'README.md'), 'fixture\n');
  git(work, env, 'add', 'README.md');
  git(work, env, ...fixtureIdentity, 'commit', '--quiet', '-m', 'fixture');
  git(work, env, 'remote', 'add', 'origin', origin);
  git(work, env, 'push', '--quiet', 'origin', 'main');
  const commit = git(work, env, 'rev-parse', 'HEAD');
  if (tag) {
    git(work, env, ...fixtureIdentity, 'tag', '--annotate', 'v0.2.6', commit, '--message', 'Coral 0.2.6');
    git(work, env, 'push', '--quiet', 'origin', 'refs/tags/v0.2.6');
    git(work, env, 'tag', '--delete', 'v0.2.6');
  }
  mkdirSync(join(work, 'scripts'));
  copyFileSync('scripts/release-notes.mjs', join(work, 'scripts', 'release-notes.mjs'));
  copyFileSync('CHANGELOG.md', join(work, 'CHANGELOG.md'));
  const evidence = `${JSON.stringify({ version: '0.2.6', productSha: commit }, null, 2)}\n`;
  writeFileSync(join(work, 'release-evidence.json'), evidence);
  writeFileSync(join(root, 'gh', 'state'), `${state}\n`);
  writeFileSync(join(root, 'gh', 'immutable'), `${immutable}\n`);
  writeFileSync(join(root, 'gh', 'calls'), '');
  if (state !== 'absent' && asset !== 'missing') {
    writeFileSync(join(root, 'gh', 'asset'), asset === 'same' ? evidence : '{"other":true}\n');
  }
  return { root, env, origin, work, commit };
}

function runStep(context) {
  const script = join(context.root, 'step.sh');
  writeFileSync(script, releaseStep().run);
  const bash = process.platform === 'win32'
    ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe') : '/bin/bash';
  assert.ok(existsSync(bash), `Git Bash executable not found: ${bash}`);
  const result = spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    cwd: context.work, encoding: 'utf8',
    env: { ...context.env, GH_TOKEN: 'fixture', RELEASE_VERSION: '0.2.6', RELEASE_COMMIT: context.commit },
  });
  const read = name => readFileSync(join(context.root, 'gh', name), 'utf8');
  return { ...result, state: read('state').trim(), calls: read('calls') };
}

const withFixture = (options, check) => {
  const context = fixture(options);
  try {
    check(context, runStep(context));
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
};

test('the release job tags without a configured git identity and names the Actions bot as tagger (CRO100-1)', () => {
  withFixture({}, (context, result) => {
    assert.equal(result.status, 0, result.stderr);
    const env = context.env;
    assert.equal(git(context.origin, env, 'cat-file', '-t', 'refs/tags/v0.2.6'), 'tag');
    assert.equal(git(context.origin, env, 'rev-list', '-n', '1', 'refs/tags/v0.2.6'), context.commit);
    assert.match(git(context.origin, env, 'cat-file', '-p', 'refs/tags/v0.2.6'),
      /^tagger github-actions\[bot\] <41898282\+github-actions\[bot\]@users\.noreply\.github\.com> /m);
    assert.equal(result.state, 'published');
    assert.match(result.calls, /^release create v0\.2\.6 release-evidence\.json --verify-tag /m);
  });
});

test('the release job reads back an immutable published release (CRO100-3)', () => {
  withFixture({ immutable: 'false' }, (_context, result) => {
    assert.notEqual(result.status, 0, 'a mutable release must fail the release job');
    assert.match(result.calls, /^api repos\/coreyt\/coral\/releases\/tags\/v0\.2\.6 --jq \.immutable$/m);
  });
  withFixture({ tag: true, state: 'published' }, (_context, result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.calls, /^release (?:create|edit)/m);
  });
  withFixture({ tag: true, state: 'published', asset: 'other' }, (_context, result) => {
    assert.notEqual(result.status, 0, 'a published release with other evidence must fail');
  });
});

test('a re-run publishes its own verified draft and never leaves a draft behind (CRO100-12)', () => {
  withFixture({ tag: true, state: 'draft' }, (_context, result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.state, 'published');
    assert.match(result.calls, /^release edit v0\.2\.6 --verify-tag --title Coral 0\.2\.6 --notes-file release-notes\.md --draft=false$/m);
    assert.doesNotMatch(result.calls, /^release create/m);
  });
  for (const asset of ['other', 'missing']) {
    withFixture({ tag: true, state: 'draft', asset }, (_context, result) => {
      assert.notEqual(result.status, 0, `a draft with ${asset} evidence must stop for operator recovery`);
      assert.equal(result.state, 'draft');
      assert.doesNotMatch(result.calls, /^release edit/m);
    });
  }
});
