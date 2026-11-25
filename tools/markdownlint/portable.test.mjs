import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const fixtures = 'tools/markdownlint/fixtures/portable';
const markdownlintCli = resolve(root, 'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs');

// Each invalid fixture states the exact set of rule identifiers the Portable
// profile must report for it. An exact set, rather than "at least this rule",
// keeps a RED run unambiguous and stops an unrelated rule from standing in for
// the one under test.
const EXPECTED_INVALID = new Map([
  ['invalid/md003-setext-heading.md', ['MD003']],
  ['invalid/md004-star-bullets.md', ['MD004']],
  ['invalid/md009-trailing-space.md', ['MD009']],
  ['invalid/md010-hard-tab.md', ['MD010']],
  ['invalid/md011-reversed-link.md', ['MD011']],
  ['invalid/md013-long-line.md', ['MD013']],
  ['invalid/md018-no-space-atx.md', ['MD018']],
  ['invalid/md025-multiple-h1.md', ['MD025']],
  ['invalid/md029-ordered-prefix.md', ['MD029']],
  ['invalid/md033-raw-html.md', ['MD033']],
  ['invalid/md034-bare-url.md', ['MD034']],
  // The four MD040 fixtures cover both detection mechanisms. `language_only`
  // sees only the space-separated form; the tight `ts{1,3}` and
  // `ts:line-numbers` spellings VitePress actually emits are a single info
  // token and are caught only by `allowed_languages`.
  ['invalid/md040-fence-meta.md', ['MD040']],
  ['invalid/md040-fence-meta-spaced.md', ['MD040']],
  ['invalid/md040-line-numbers.md', ['MD040']],
  ['invalid/md040-no-language.md', ['MD040']],
  ['invalid/md040-unlisted-language.md', ['MD040']],
  ['invalid/md041-frontmatter.md', ['MD003', 'MD041']],
  ['invalid/md041-no-first-heading.md', ['MD041']],
  ['invalid/md042-empty-link.md', ['MD042']],
  ['invalid/md046-indented-code.md', ['MD046']],
  ['invalid/md047-no-trailing-newline.md', ['MD047']],
  ['invalid/md048-tilde-fence.md', ['MD048']],
  ['invalid/md051-link-fragment.md', ['MD051']],
  ['invalid/md052-undefined-label.md', ['MD052']],
  ['invalid/md054-autolink.md', ['MD054']],
  ['invalid/md054-reference-link.md', ['MD054']],
  ['invalid/md055-table-pipes.md', ['MD055']],
  ['invalid/md056-table-columns.md', ['MD056']],
  // Legacy accommodations are per-rule `overrides`, not whole-file `ignores`,
  // so a file excused for one rule must still be checked by the other 21. This
  // fixture violates MD013 and MD004; the root configuration exempts it from
  // MD013 alone. Reporting exactly MD004 is the proof that `combine: "merge"`
  // layers onto the full rule set rather than replacing it. If this ever
  // reports nothing, every legacy override has silently become a whole-file
  // exemption.
  ['override/md013-exempt.md', ['MD004']],
]);

// Fixtures that must lint clean. `valid/` is the permitted dialect. The
// `unenforced/` fixtures are negative controls: every construct in them is
// prohibited by Profile P but is not expressible in the installed rule set, so
// a clean result there records a known gap rather than approval. If a later
// toolchain starts reporting one of them, this assertion fails and the record
// in dev/releases/0.2.5/slice-60/markdownlint-portable.md must be revisited.
const EXPECTED_CLEAN = [
  'valid/full-dialect.md',
  'valid/exemptions.md',
  'unenforced/vitepress-syntax.md',
  'unenforced/trailing-blank-lines.md',
];

// `--no-globs` drops the repository-wide `globs` entry and the fixture
// exclusion that sits beside it, so the named fixtures are linted with the real
// root configuration and no second copy of the rule set.
const lint = relativePaths => {
  const result = spawnSync(
    process.execPath,
    [markdownlintCli, '--no-globs', ...relativePaths.map(p => `${fixtures}/${p}`)],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    // markdownlint-cli2 exits 0 and reports nothing when a named path does not
    // reach the linter, so "no violations" alone would pass vacuously for a
    // typo, a moved fixture, or a future ignore entry. The linted-file count is
    // the guard against that.
    linted: Number(/^Linting: (\d+) files?$/mu.exec(result.stdout ?? '')?.[1] ?? -1),
  };
};

const rulesByFixture = output => {
  const found = new Map();
  const pattern = /^(\S+\.md):\d+(?::\d+)?\s+\S+\s+(MD\d{3})\//gmu;
  for (const match of output.matchAll(pattern)) {
    const relativePath = match[1].replaceAll('\\', '/').replace(`${fixtures}/`, '');
    if (!found.has(relativePath)) found.set(relativePath, new Set());
    found.get(relativePath).add(match[2]);
  }
  return found;
};

// markdownlint-cli2 does not export its JSONC parser and `jsonc-parser` is a
// transitive dependency this record may not add to package.json, so comments
// are stripped here. The scan tracks string context, because a `//` inside a
// string value is data, not a comment.
const stripJsonComments = text => {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (char === '\n') { inLine = false; out += char; }
    } else if (inBlock) {
      if (char === '*' && next === '/') { inBlock = false; i += 1; }
    } else if (inString) {
      out += char;
      if (char === '\\') { out += next ?? ''; i += 1; } else if (char === '"') { inString = false; }
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === '/' && next === '/') {
      inLine = true;
      i += 1;
    } else if (char === '/' && next === '*') {
      inBlock = true;
      i += 1;
    } else {
      out += char;
    }
  }
  return out;
};

const profile = JSON.parse(
  stripJsonComments(readFileSync(resolve(root, '.markdownlint-cli2.jsonc'), 'utf8')),
);

// The Portable profile enables exactly these rules. Restated here so that a
// silent addition or removal fails, and so the VitePress record has one
// authoritative count to reconcile against.
const ENABLED_RULES = [
  'MD003', 'MD004', 'MD009', 'MD010', 'MD011', 'MD013', 'MD018', 'MD025',
  'MD029', 'MD033', 'MD034', 'MD040', 'MD041', 'MD042', 'MD046', 'MD047',
  'MD048', 'MD051', 'MD052', 'MD054', 'MD055', 'MD056',
];

test('the profile enables exactly the 22 documented rules', () => {
  assert.equal(profile.config.default, false);
  const enabled = Object.keys(profile.config).filter(key => key !== 'default').sort();
  assert.deepEqual(enabled, [...ENABLED_RULES].sort());
  assert.equal(enabled.length, 22);
});

// D1: a legacy file must stay subject to every rule except the ones it actually
// fails. A whole-file `ignores` entry cannot express that, so `ignores` is
// restricted to the historical archive and every accommodation must be an
// override that merges onto the full rule set.
test('legacy accommodations are per-rule overrides, never whole-file ignores', () => {
  assert.deepEqual(profile.ignores, ['dev/archive/**']);
  assert.ok(profile.overrides.length > 0);
  for (const override of profile.overrides) {
    assert.equal(override.combine, 'merge', `override ${override.filter[0]} must merge`);
    assert.ok(override.filter.length > 0);
    const disabled = Object.entries(override.config);
    assert.ok(disabled.length > 0, `override ${override.filter[0]} disables nothing`);
    for (const [rule, value] of disabled) {
      assert.ok(ENABLED_RULES.includes(rule), `${rule} is not an enabled rule`);
      assert.equal(value, false, `${rule} must be disabled, not reconfigured`);
    }
    // An accommodation that removed most of the profile would be an ignore
    // entry wearing a different hat.
    assert.ok(
      disabled.length <= 3,
      `override ${override.filter[0]} disables ${disabled.length} rules`,
    );
  }
});

// A .markdownlint* file in any directory overrides the root profile for that
// subtree, and `noInlineConfig` does not cover that route. Two are sanctioned:
// the root Portable profile and the docs/ VitePress profile.
test('no unsanctioned markdownlint configuration file exists', () => {
  const found = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard',
      '.markdownlint*', '**/.markdownlint*'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(found.status, 0, found.stderr);
  const configs = found.stdout.trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(configs, ['.markdownlint-cli2.jsonc', 'docs/.markdownlint-cli2.jsonc']);
});

// Without this guard a fixture added to the tree but not to the expectation
// tables would never be linted, and the suite would stay green while covering
// less than it claims.
test('every fixture on disk has a declared expectation', () => {
  const declared = [...[...EXPECTED_INVALID.keys()], ...EXPECTED_CLEAN].sort();
  const onDisk = ['invalid', 'valid', 'unenforced', 'override']
    .flatMap(dir => readdirSync(resolve(root, fixtures, dir))
      .filter(name => name.endsWith('.md'))
      .map(name => `${dir}/${name}`))
    .sort();
  assert.deepEqual(onDisk, declared);
});

const invalidRun = lint([...EXPECTED_INVALID.keys()]);
const invalidRules = rulesByFixture(invalidRun.output);

test('the Portable profile reaches and rejects every invalid fixture', () => {
  assert.equal(
    invalidRun.linted,
    EXPECTED_INVALID.size,
    `expected every named fixture to be linted\n${invalidRun.output}`,
  );
  assert.notEqual(
    invalidRun.status,
    0,
    `expected a failing exit code\n${invalidRun.output}`,
  );
});

for (const [fixture, expected] of EXPECTED_INVALID) {
  test(`${fixture} reports exactly ${expected.join(', ')}`, () => {
    const actual = [...(invalidRules.get(fixture) ?? [])].sort();
    assert.deepEqual(
      actual,
      [...expected].sort(),
      `unexpected rules for ${fixture}\n${invalidRun.output}`,
    );
  });
}

const cleanRun = lint(EXPECTED_CLEAN);
const cleanRules = rulesByFixture(cleanRun.output);

test('the Portable profile reaches and accepts every conforming fixture', () => {
  assert.equal(
    cleanRun.linted,
    EXPECTED_CLEAN.length,
    `expected every named fixture to be linted\n${cleanRun.output}`,
  );
  assert.deepEqual(
    [...cleanRules.keys()],
    [],
    `expected no violations\n${cleanRun.output}`,
  );
  assert.equal(cleanRun.status, 0, `expected a clean exit code\n${cleanRun.output}`);
});
