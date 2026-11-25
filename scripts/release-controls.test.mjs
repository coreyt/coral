import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkBrowserCanaries } from './browser-canary.mjs';
import { classifyChangedPaths } from './ci-path-tier.mjs';
import {
  SUMMARY_FIELDS, compareRulesetDetails, parseRulesetSummaries,
  rulesetDetailCommand, rulesetSummaryCommand,
} from './github-auth-preflight.mjs';

test('browser canaries validate preview origin, fixture, and retained smoke', () => {
  assert.deepEqual(checkBrowserCanaries(), []);
});

for (const [file, name, before, after] of [
  ['playwright.config.ts', 'base URL', 'baseURL: origin,', "baseURL: 'http://127.0.0.1:9999',"],
  ['playwright.config.ts', 'server URL', 'url: origin,', "url: 'http://127.0.0.1:9999',"],
  ['playwright.config.ts', 'configured port', "process.env.CORAL_E2E_PORT ?? '4173'", "'4173'"],
  ['playwright.config.ts', 'origin port', 'http://127.0.0.1:${port}', 'http://127.0.0.1:9999'],
  ['playwright.config.ts', 'command port', '--port ${port} --strictPort', '--port 9999 --strictPort'],
  ['playwright.config.ts', 'strict port', '--port ${port} --strictPort', '--port ${port}'],
  ['playwright.performance.config.ts', 'base import', "from './playwright.config.js'", "from './playwright.robustness.config.js'"],
  ['playwright.performance.config.ts', 'base spread', '  ...base,\n', ''],
  ['playwright.performance.config.ts', 'base server', '{ ...base.webServer,', '{ ...base.webServer, url: \'http://127.0.0.1:9999\','],
  ['playwright.performance.config.ts', 'replaced server', '{ ...base.webServer,', '{'],
  ['playwright.performance.config.ts', 'base URL', '  workers: 1,', "  workers: 1,\n  use: { ...base.use, baseURL: 'http://127.0.0.1:9999' },"],
  ['playwright.performance.config.ts', 'command port', '{ ...base.webServer,',
    "{ ...base.webServer, command: 'npm run preview -w @coral-viz/diagram-editor -- --port 9999 --strictPort',"],
  ['playwright.performance.config.ts', 'strict port', '{ ...base.webServer,',
    "{ ...base.webServer, command: 'npm run preview -w @coral-viz/diagram-editor -- --port 4173',"],
]) {
  test(`browser canaries reject inconsistent ${file} ${name}`, () => {
    const original = readFileSync(file, 'utf8');
    const mutated = original.replace(before, after);
    assert.notEqual(mutated, original, `${file} ${name}: mutation must change its fixture`);
    const read = (path, encoding) => path === file ? mutated : readFileSync(path, encoding);
    assert.deepEqual(checkBrowserCanaries({ read }), [`${file}: preview origin is inconsistent`]);
  });
}

test('browser canaries reject skipped or excluded retained smoke', () => {
  for (const [file, mutate] of [
    ['e2e/editor.spec.ts', text => text.replace(
      "test('reports a syntax error without blanking", "test.skip('reports a syntax error without blanking")],
    ['e2e/slice40-guidance.spec.ts', text => text.replace(
      "test('Blank diagram enters", "test.fixme('Blank diagram enters")],
    ['e2e/editor.spec.ts', text => `${text}\ntest.only('focused', async () => {});\n`],
  ]) {
    const read = (path, encoding) => {
      const text = readFileSync(path, encoding);
      return path === file ? mutate(text) : text;
    };
    assert.match(checkBrowserCanaries({ read }).join('\n'), /smoke is missing or inactive/, file);
  }
});

test('path tiering is conservative and never weakens a final candidate', () => {
  // Only passive release records and root prose are reduced; the docs site
  // holds executable examples, so any docs change runs everything.
  assert.equal(classifyChangedPaths(['dev/releases/0.2.6/status/slice-10.md']).fullMatrix, false);
  assert.equal(classifyChangedPaths(['dev/archive/releases/0.2.4/notes.md']).fullMatrix, false);
  assert.equal(classifyChangedPaths(['README.md', 'dev/releases/0.2.8/status/slice-100.md']).fullMatrix, false);
  for (const docs of ['docs/use/index.md', 'docs/embed/examples/render-diagram.mjs', 'docs/.vitepress/config.ts']) {
    assert.equal(classifyChangedPaths([docs]).fullMatrix, true, docs);
  }
  assert.equal(classifyChangedPaths(['README.md', 'docs/use/index.md']).fullMatrix, true);
  for (const authority of [
    'dev/release-policy.json',
    'dev/requirements.md',
    'dev/ARCHITECTURE.md',
  ]) assert.equal(classifyChangedPaths([authority]).fullMatrix, true, authority);
  assert.equal(classifyChangedPaths(['packages/render/src/index.ts']).fullMatrix, true);
  assert.equal(classifyChangedPaths(['.github/workflows/ci.yml']).fullMatrix, true);
  assert.equal(classifyChangedPaths([], { finalCandidate: true }).fullMatrix, true);
});

test('current authorities and unknown bases always require the full matrix', () => {
  for (const authority of ['PLAN.md', 'CLAUDE.md', 'dev/releases/0.2.6/plan.md']) {
    assert.equal(classifyChangedPaths([authority]).fullMatrix, true, authority);
  }
  assert.equal(classifyChangedPaths(['README.md']).fullMatrix, false);
  assert.equal(classifyChangedPaths(['dev/releases/0.2.6/slice-20/draft-plan.md']).fullMatrix, false);
  assert.equal(
    classifyChangedPaths(['docs/use/index.md'], { unknownBase: true }).fullMatrix,
    true,
  );
});

test('auth preflight reads ruleset details and compares the aggregate context', () => {
  assert.deepEqual(SUMMARY_FIELDS, ['id', 'name', 'target', 'enforcement']);
  const command = rulesetSummaryCommand('coreyt/coral');
  assert.deepEqual(command.slice(0, 3), ['api', '--method', 'GET']);
  assert.ok(command.includes('/repos/coreyt/coral/rulesets'));
  assert.deepEqual(parseRulesetSummaries('[]'), []);
  assert.throws(() => parseRulesetSummaries('{"message":"Not Found"}'), /not an array/);
  assert.throws(() => parseRulesetSummaries('not json'));
  assert.deepEqual(rulesetDetailCommand('coreyt/coral', 7), [
    'api', '--method', 'GET', '/repos/coreyt/coral/rulesets/7',
  ]);
  const detail = {
    target: 'branch', enforcement: 'active', bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } },
    rules: [{ type: 'required_status_checks', parameters: {
      required_status_checks: [{ context: 'final-candidate', integration_id: 15368 }],
    } }],
  };
  assert.deepEqual(compareRulesetDetails([detail], ['final-candidate']), []);
  assert.notDeepEqual(compareRulesetDetails([detail], ['verify']), []);
});

test('every hash-checked text artifact keeps LF bytes on every platform', () => {
  const figures = JSON.parse(readFileSync('docs/figures.json', 'utf8'));
  const hashed = [
    ...figures.figures.flatMap(({ source, path }) => [source, `docs/public/${path}`]),
  ].filter(path => !/\.(?:png|jpe?g|webp|gif)$/i.test(path));
  const attributes = execFileSync('git', ['check-attr', 'eol', '--', ...hashed], { encoding: 'utf8' });
  const notLf = attributes.split('\n').filter(Boolean).filter(line => !line.endsWith(': eol: lf'));
  assert.deepEqual(notLf, []);
});

test('packed tree-sitter-coral text sources keep LF bytes on Windows checkouts (DRO100-5)', () => {
  const files = execFileSync('git', ['ls-files', 'packages/tree-sitter-coral'], { encoding: 'utf8' })
    .split('\n').filter(path => path && !/\.(?:wasm|node|png|tgz)$/i.test(path));
  assert.ok(files.length > 0);
  const attributes = execFileSync('git', ['check-attr', 'eol', '--', ...files], { encoding: 'utf8' });
  const notLf = attributes.split('\n').filter(Boolean).filter(line => !line.endsWith(': eol: lf'));
  assert.deepEqual(notLf, []);
});

test('tree-sitter-coral LF rules name text types only, never future binaries (DRO100-25f)', () => {
  const binaries = [
    'packages/tree-sitter-coral/tree-sitter-coral.wasm',
    'packages/tree-sitter-coral/prebuilds/win32-x64/tree-sitter-coral.node',
    'packages/tree-sitter-coral/docs/logo.png',
  ];
  const attributes = execFileSync('git', ['check-attr', 'eol', 'text', '--', ...binaries], { encoding: 'utf8' });
  // `* text=auto eol=lf` leaves binary detection to git: binaries are never set as text.
  assert.doesNotMatch(attributes, /: text: set/);
  assert.match(attributes, /tree-sitter-coral\.wasm: text: (auto|unset|unspecified)/);
});
