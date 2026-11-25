// Executable acceptance for Profile V, the VitePress Markdown authoring
// profile enforced by docs/.markdownlint-cli2.jsonc.
//
// Contract: dev/releases/0.2.5/slice-60/authoring-format.md
// Record:   dev/releases/0.2.5/slice-60/markdownlint-vitepress.md
//
// Why a sandbox. Profile V is selected by location: the configuration applies
// to docs/ and to nothing else. The fixtures cannot live in docs/, because
// docs/ is the published documentation site. So each run copies the real
// docs/.markdownlint-cli2.jsonc and the real root configuration into a
// temporary tree shaped like the repository, and lints from its root. That is
// the only invocation geometry in which the configuration under test is the
// one that actually applies, because directory inheritance stops at the
// directory the run starts in. The Portable suite can use --no-globs with an
// explicit path instead, because Profile P applies repository-wide; Profile V
// cannot, because docs/ configuration does not reach tools/.
//
// Why the real root configuration and nothing else. Profile V is "Profile P
// plus additions", so a Profile V assertion is meaningless without a Profile P
// beneath it. An earlier version of this file carried a hand-transcribed
// reconstruction of the root configuration so the suite could run before that
// file existed. It went stale the first time the Portable slice changed its
// design, which is the ordinary fate of a shadow copy of a file you do not
// own. The reconstruction is gone; PROFILE_P_RULES below asserts the inherited
// rule set directly instead, which is a drift detector rather than a duplicate.

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import jsoncParse from 'markdownlint-cli2/parsers/jsonc';
import fenceLanguageRule from './rules/coral-fence-language.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const docsConfig = join(repoRoot, 'docs', '.markdownlint-cli2.jsonc');
const rootConfig = join(repoRoot, '.markdownlint-cli2.jsonc');
const customRule = join(repoRoot, 'tools', 'markdownlint', 'rules', 'coral-fence-language.mjs');
const markdownlintBin = join(repoRoot, 'node_modules', 'markdownlint-cli2', 'markdownlint-cli2-bin.mjs');
const fixtures = join(here, 'fixtures', 'vitepress');

// The rules Profile P enables, and therefore the rules Profile V inherits.
// Asserted against the root configuration so that a change there either
// updates this list deliberately or fails this suite.
const PROFILE_P_RULES = [
  'MD003', 'MD004', 'MD009', 'MD010', 'MD011', 'MD013',
  'MD018', 'MD025', 'MD029', 'MD033', 'MD034', 'MD040',
  'MD041', 'MD042', 'MD046', 'MD047', 'MD048', 'MD051',
  'MD052', 'MD054', 'MD055', 'MD056',
];

// Slice 70 relocated the legacy contributor records into the published tree
// and removed every real-page accommodation. If one regresses, the gate must
// go red rather than be silently widened.
const CONTRIBUTOR_RECORDS = [
  'contribute/get-started.md',
  'contribute/reference/clean-room-process.md',
  'contribute/reference/coverage-baseline.md',
  'contribute/reference/performance-budgets.md',
  'contribute/reference/release-compliance-checklist.md',
];

// Each invalid fixture must report at least the rules listed for it. The file
// name carries the same rule identifier, and a test asserts the two agree.
const EXPECTED = {
  'coral-fence-language.md': ['coral-fence-language'],
  'md003-setext-heading.md': ['MD003'],
  'md004-star-bullet.md': ['MD004'],
  'md009-trailing-space.md': ['MD009'],
  'md010-hard-tab.md': ['MD010'],
  'md013-inline-disable.md': ['MD013'],
  'md013-long-line.md': ['MD013'],
  'md025-two-h1.md': ['MD025'],
  'md033-disallowed-html.md': ['MD033'],
  'md033-script-setup.md': ['MD033'],
  'md033-style-block.md': ['MD033'],
  'md034-bare-url.md': ['MD034'],
  'md040-untagged-fence.md': ['MD040'],
  'md041-frontmatter-without-title.md': ['MD041'],
  'md047-no-final-newline.md': ['MD047'],
  'md048-tilde-fence.md': ['MD048'],
  'md051-bad-anchor-link.md': ['MD051'],
  'md051-uppercase-anchor.md': ['MD051'],
  'md054-reference-link.md': ['MD054'],
};

// Profile P rules that reach docs/ only by inheritance and that no fixture
// above asserts. The canary fixture violates exactly these, so that a future
// docs/ delta cannot silently replace one of them.
const INHERITED_ONLY = [
  'MD011', 'MD018', 'MD029', 'MD042', 'MD046', 'MD052', 'MD055', 'MD056',
];

const FIXTURE_GROUPS = ['valid', 'invalid', 'canary', 'override'];

const runLint = (cwd, glob) => {
  // The fixture cwd is a temporary directory outside the repository, so npx
  // cannot discover the pinned workspace binary there. Invoke that exact local
  // module with the current Node runtime to keep the gate hermetic.
  const result = spawnSync(process.execPath, [markdownlintBin, glob], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.ok(
    result.status === 0 || result.status === 1,
    `markdownlint-cli2 failed to run in ${cwd} (status ${result.status}):\n${output}`,
  );
  return { output, status: result.status };
};

// path -> the set of rule identifiers reported for it.
const parse = output => {
  const findings = new Map();
  for (const line of output.split('\n')) {
    // The path group must be lazy and anchored on the extension. A greedy
    // match swallows the line and column numbers and attributes every finding
    // to a path no assertion looks up, which is a false green.
    const match = /^(\S+?\.md):\d+(?::\d+)? (?:error|warning) ([A-Za-z0-9_-]+)(?:\/|\s)/.exec(line);
    if (!match) continue;
    const [, file, rule] = match;
    if (!findings.has(file)) findings.set(file, new Set());
    findings.get(file).add(rule);
  }
  return findings;
};

const rulesFor = (findings, file) => [...(findings.get(file) ?? [])].sort();

const sandboxWith = copyPages => {
  const sandbox = mkdtempSync(join(tmpdir(), 'coral-profile-v-'));
  mkdirSync(join(sandbox, 'docs'), { recursive: true });
  cpSync(rootConfig, join(sandbox, '.markdownlint-cli2.jsonc'));
  cpSync(docsConfig, join(sandbox, 'docs', '.markdownlint-cli2.jsonc'));
  mkdirSync(join(sandbox, 'tools', 'markdownlint', 'rules'), { recursive: true });
  cpSync(customRule, join(sandbox, 'tools', 'markdownlint', 'rules', 'coral-fence-language.mjs'));
  copyPages(join(sandbox, 'docs'));
  const { output } = runLint(sandbox, 'docs/**/*.md');
  return { findings: parse(output), output };
};

const validFixtures = readdirSync(join(fixtures, 'valid')).filter(n => n.endsWith('.md'));
const invalidFixtures = readdirSync(join(fixtures, 'invalid')).filter(n => n.endsWith('.md'));

assert.ok(existsSync(docsConfig), `missing ${docsConfig}`);
assert.ok(
  existsSync(rootConfig),
  `${rootConfig} does not exist. Profile V is Profile P plus additions, so `
  + 'there is nothing meaningful to assert without it.',
);

const run = sandboxWith(docsDir => {
  for (const group of FIXTURE_GROUPS) {
    cpSync(join(fixtures, group), join(docsDir, group), { recursive: true });
  }
});

test('Profile V inherits exactly the rules Profile P declares', () => {
  const root = jsoncParse(readFileSync(rootConfig, 'utf8'));
  const declared = Object.keys(root.config)
    .filter(key => /^MD\d+$/.test(key) && root.config[key] !== false)
    .sort();
  assert.deepEqual(
    declared,
    PROFILE_P_RULES,
    'the root configuration no longer declares the rule set this suite assumes. '
    + 'Reconcile PROFILE_P_RULES, INHERITED_ONLY, and the canary fixture with it.',
  );
  assert.equal(root.config.default, false, 'Profile P is expected to enable rules explicitly');
});

test('the custom fence rule requires the configured allowlist and honors indentation', () => {
  assert.throws(
    () => fenceLanguageRule.function({ config: {}, lines: ['```js', '```'] }, () => {}),
    /allowed_languages/,
  );
  assert.throws(
    () => fenceLanguageRule.function({ config: { allowed_languages: [1] }, lines: ['```js', '```'] }, () => {}),
    /allowed_languages/,
  );
  const errors = [];
  fenceLanguageRule.function({
    config: { allowed_languages: ['js'] },
    lines: ['   ```js{1}', 'const ok = true;', '   ```', '    ```python', '    ```'],
  }, error => errors.push(error));
  assert.deepEqual(errors, []);

  const metadataOnlyErrors = [];
  fenceLanguageRule.function({
    config: { allowed_languages: ['js'] },
    lines: ['```{1}', 'const first = true;', '```', '```:line-numbers', 'const second = true;', '```'],
  }, error => metadataOnlyErrors.push(error));
  assert.deepEqual(metadataOnlyErrors.map(error => error.lineNumber), [1, 4]);
});

test('the inherited-only rule list is exactly what no other fixture asserts', () => {
  const asserted = new Set(Object.values(EXPECTED).flat());
  const unasserted = PROFILE_P_RULES.filter(rule => !asserted.has(rule)).sort();
  assert.deepEqual(
    unasserted,
    [...INHERITED_ONLY].sort(),
    'the set of Profile P rules with no Profile V fixture has changed',
  );
});

test('the fixture set exercises the full permitted dialect', () => {
  assert.ok(validFixtures.length >= 9, `only ${validFixtures.length} valid fixtures`);
  for (const name of invalidFixtures) {
    assert.ok(name in EXPECTED, `invalid fixture ${name} has no expected rule identifier`);
    if (/^md\d{3}/i.test(name)) {
      const prefix = name.slice(0, 5).toUpperCase();
      assert.ok(
        EXPECTED[name].includes(prefix),
        `invalid fixture ${name} is named for ${prefix} but expects ${EXPECTED[name].join(', ')}`,
      );
    }
  }
  for (const name of Object.keys(EXPECTED)) {
    assert.ok(invalidFixtures.includes(name), `expectation ${name} has no fixture`);
  }
});

test('every valid fixture lints clean under the full Profile V dialect', () => {
  for (const name of validFixtures) {
    assert.deepEqual(
      rulesFor(run.findings, `docs/valid/${name}`),
      [],
      `valid fixture ${name} reported findings:\n${run.output}`,
    );
  }
});

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`${name} fails with ${expected.join(', ')}`, () => {
    const reported = rulesFor(run.findings, `docs/invalid/${name}`);
    for (const rule of expected) {
      assert.ok(
        reported.includes(rule),
        `expected ${rule} for ${name}, got ${reported.join(', ') || 'nothing'}:\n${run.output}`,
      );
    }
  });
}

test('a script block is rejected so that Vue cannot enter the documentation site', () => {
  assert.match(run.output, /invalid\/md033-script-setup\.md:\d+.*MD033.*Element: script/);
});

test('a style block is rejected so that Vue cannot enter the documentation site', () => {
  assert.match(run.output, /invalid\/md033-style-block\.md:\d+.*MD033.*Element: style/);
});

// S50V-R7. Every Profile P rule that reaches docs/ only by inheritance, proved
// live in one file, so that a delta added to docs/ later cannot replace one of
// them without this failing.
test('every inherited-only Profile P rule is still live under Profile V', () => {
  const reported = rulesFor(run.findings, 'docs/canary/inherited-profile-p.md');
  assert.deepEqual(
    reported,
    [...INHERITED_ONLY].sort(),
    `the inherited Profile P rule canary did not report exactly its rules:\n${run.output}`,
  );
});

// S50V-R8. The accommodation mechanism itself: an exempted file must lose one
// rule and keep the rest.
test('an accommodation exempts one rule and leaves every other rule live', () => {
  const reported = rulesFor(run.findings, 'docs/override/md013-exempt.md');
  assert.ok(
    !reported.includes('MD013'),
    `the MD013 accommodation did not apply:\n${run.output}`,
  );
  assert.ok(
    reported.includes('MD004'),
    `combine: "merge" did not keep the other rules live, got `
    + `${reported.join(', ') || 'nothing'}:\n${run.output}`,
  );
});

test('relocated contributor records need no lint accommodation', () => {
  const { findings, output } = sandboxWith(docsDir => {
    for (const [index, path] of CONTRIBUTOR_RECORDS.entries()) {
      cpSync(join(repoRoot, 'docs', path), join(docsDir, `record-${index}.md`));
    }
  });

  for (const [index, path] of CONTRIBUTOR_RECORDS.entries()) {
    assert.deepEqual(
      rulesFor(findings, `docs/record-${index}.md`),
      [],
      `docs/${path} must remain conformant without an accommodation:\n${output}`,
    );
  }
});

test('no docs page is exempt from every rule', () => {
  const docs = jsoncParse(readFileSync(docsConfig, 'utf8'));
  assert.ok(
    !('ignores' in docs),
    'a whole-file ignores entry would exempt a page from the entire profile to '
    + 'excuse the one rule it fails; use an overrides block instead',
  );
  for (const block of docs.overrides ?? []) {
    const disabled = Object.entries(block.config ?? {})
      .filter(([, value]) => value === false)
      .map(([rule]) => rule);
    assert.equal(block.combine, 'merge', `override for ${block.filter} must merge, not replace`);
    assert.ok(disabled.length > 0, `override for ${block.filter} disables nothing`);
    assert.ok(
      disabled.length < PROFILE_P_RULES.length,
      `override for ${block.filter} disables the whole profile`,
    );
  }
});

test('the fixtures are excluded from the repository-wide run by the root globs', () => {
  const { output } = runLint(repoRoot, '.');
  // Liveness first: an exclusion assertion against an empty run proves nothing.
  const linted = /^Linting: (\d+) files?$/m.exec(output);
  assert.ok(linted && Number(linted[1]) > 0, `the repository-wide run linted nothing:\n${output}`);
  assert.match(
    output,
    /!tools\/markdownlint\/fixtures\/\*\*/,
    `the root globs do not negate the fixture tree:\n${output}`,
  );
  for (const [file] of parse(output)) {
    assert.ok(
      !file.startsWith('tools/markdownlint/fixtures/'),
      `fixture ${file} was reported by the repository-wide run:\n${output}`,
    );
  }
});

// S50V-R9, the other half. An `ignores` entry under the fixtures would suppress
// them on every invocation, including one naming the file, making them
// permanently unlintable and the exclusion assertion above a tautology.
test('no configuration file shadows the Profile V fixtures', () => {
  for (const entry of ['', ...FIXTURE_GROUPS]) {
    const dir = entry ? join(fixtures, entry) : fixtures;
    for (const name of readdirSync(dir)) {
      assert.ok(
        !name.startsWith('.markdownlint'),
        `${join(dir, name)} would make the fixtures unlintable in place`,
      );
    }
  }
});
