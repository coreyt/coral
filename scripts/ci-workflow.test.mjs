import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CLOSED_JOBS, MATRIX_CELLS } from './ci-final-candidate.mjs';
import { SCRIPT_SUITES } from './ci-suites.mjs';
import {
  parseWorkflow, validateBrowserConfig, validateCandidateArtifactConsumers, validateCiWorkflow,
  validateWorkflowContract, workflowExecutions,
} from './workflow-policy.mjs';

// The CI graph is checked by meaning: obligations, phases, artifact flow and
// proof bindings. These tests mutate the real workflow and expect refusal, and
// show that an equivalent safe organization is accepted.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const policy = JSON.parse(readFileSync('dev/release-policy.json', 'utf8'));
const errors = text => [...validateWorkflowContract('ci.yml', text), ...validateCiWorkflow(text, { policy })].join('\n');
const replaceOnce = (text, from, to) => {
  assert.equal(text.split(from).length - 1, 1, `expected one occurrence of ${JSON.stringify(from)}`);
  return text.replace(from, to);
};
const jobBlock = name => {
  const start = ci.indexOf(`\n  ${name}:\n`);
  const end = ci.indexOf('\n\n  ', start + 1);
  return ci.slice(start + 1, end < 0 ? undefined : end + 1);
};
// Replace text inside one job only.
const inJob = (name, from, to) => ci.replace(jobBlock(name), replaceOnce(jobBlock(name), from, to));
const rejects = (mutated, pattern) => assert.match(errors(mutated), pattern);

test('the current CI workflow satisfies the semantic CI contract', () => {
  assert.equal(errors(ci), '');
  assert.deepEqual(validateCandidateArtifactConsumers(ci), []);
});

test('macOS native acceptance uses the supported ARM image and refuses the retiring image', () => {
  const native = parseWorkflow(ci).jobs['native-smoke'];
  assert.deepEqual(native.strategy.matrix.include.find(cell => cell.platform === 'darwin-arm64'),
    { os: 'macos-15', platform: 'darwin-arm64' });
  assert.notEqual(errors(ci.replaceAll('macos-15', 'macos-14')), '');
});

test('the job inventory is the proof inventory and every matrix cell is proof-bound', () => {
  const jobs = Object.keys(parseWorkflow(ci).jobs);
  assert.deepEqual(jobs.sort(), [...CLOSED_JOBS, 'final-candidate'].sort());
  assert.deepEqual([...policy.requiredChecks].sort(), [...CLOSED_JOBS].sort());
  const names = workflowExecutions(parseWorkflow(ci)).map(execution => execution.name);
  for (const cells of Object.values(MATRIX_CELLS)) for (const cell of cells) assert.ok(names.includes(cell), cell);
  rejects(replaceOnce(ci, '  unit:\n', '  unit-tests:\n').replaceAll('      - unit\n', '      - unit-tests\n'), /jobs must be exactly the proof inventory/);
  rejects(replaceOnce(ci, 'name: consumers (${{ matrix.node }})', 'name: consumers ${{ matrix.node }}'), /consumers cells must be exactly/);
  rejects(replaceOnce(ci, '        react: [18, 19]\n', '        react: [18]\n'), /React 19 consumer .* found 0|react-consumers cells/);
});

test('early risks precede the long product suites and nothing early waits for them', () => {
  // A long suite that no longer waits for an early risk.
  rejects(inJob('unit', '      - native-smoke\n', ''), /long job unit must wait for early risk job native-smoke/);
  // An early package consumer that waits for a long suite.
  rejects(inJob('contracts', 'needs: [classify, candidate-packages]',
    'needs: [classify, candidate-packages, unit]'), /early job contracts must not wait for long job unit/);
  // Windows source risks and package production start right after classification.
  rejects(inJob('windows-risk', 'needs: classify', 'needs: [classify, source-checks]'),
    /windows-risk must start immediately after classify/);
  rejects(inJob('candidate-packages', 'needs: classify', 'needs: [classify, source-checks]'),
    /candidate-packages must start immediately after classify/);
  // Package consumers never wait for the TypeDoc/site build.
  rejects(inJob('consumers', 'needs: [classify, candidate-packages]',
    'needs: [classify, candidate-packages, candidate-site]'), /Node 26\.8\.2 consumers must not wait for the site build/);
});

test('every current obligation runs exactly once in its required cell', () => {
  for (const [pattern, from, to] of [
    [/candidate packages \(npm run ci:packages\) must run exactly once/, '        run: npm run ci:packages\n', '        run: npm run ci:hydrate\n'],
    [/Windows risk .* must run exactly once on windows-latest/, '      - run: npm run ci:windows-risk\n', ''],
    [/unit suites .* found 2/, '        run: npm run ci:unit\n', '        run: npm run ci:unit\n      - run: npm run ci:unit\n'],
    [/online delivery .* must run exactly once/, '        run: npm run ci:delivery\n', '        run: npm run ci:restore-site\n'],
    [/source checks .* must run exactly once/, '      - run: npm run ci:source\n', ''],
    [/published baseline consumers .* found 0/, '        run: npm run smoke:api-compat-consumers\n', '        run: npm run smoke:consumer\n'],
  ]) rejects(replaceOnce(ci, from, to), pattern);
  // A Windows-only obligation moved to Linux is not Windows coverage.
  rejects(inJob('windows-product', 'runs-on: windows-latest', 'runs-on: ubuntu-latest'),
    /Windows product suites .* must run exactly once on windows-latest/);
  // Both browser phases run once, on the browser runner, with the config defaults.
  rejects(replaceOnce(ci, '          CORAL_E2E_PHASE: smoke\n', '          CORAL_E2E_PHASE: full\n'), /browser smoke .* found 0/);
  rejects(inJob('e2e', 'runs-on: ubuntu-latest', 'runs-on: windows-latest'),
    /complete browser correctness .* found 0/);
});

test('installed consumer cells keep generation-specific case sets and exact runtimes', () => {
  // Exact sets: an omitted case and a case for another generation both fail.
  rejects(replaceOnce(ci, 'viz,viz-graphir-migration,mcp-server,tree-sitter-coral', 'viz,mcp-server,tree-sitter-coral'), /Node 24\.19\.0 consumers .* found 0/);
  rejects(replaceOnce(ci, 'viz,viz-graphir-migration,mcp-server,tree-sitter-coral', 'viz,viz-0.2.4-compat,viz-graphir-migration,mcp-server,tree-sitter-coral'),
    /Node 24\.19\.0 consumers .* found 0/);
  rejects(replaceOnce(ci, '            cases: language,render,library-docs-render,viz,mcp-server,tree-sitter-coral,browser,installed-renderer\n',
    '            cases: language,render,viz,mcp-server,tree-sitter-coral,browser,installed-renderer\n'), /Node 26\.8\.2 consumers .* found 0/);
  // The installed renderer boundary runs once, on the release runtime, after Chromium is installed.
  rejects(replaceOnce(ci, 'tree-sitter-coral,browser,installed-renderer\n', 'tree-sitter-coral,browser\n'), /Node 26\.8\.2 consumers .* found 0/);
  rejects(replaceOnce(ci, 'viz-graphir-migration,mcp-server,tree-sitter-coral,browser\n', 'viz-graphir-migration,mcp-server,tree-sitter-coral,browser,installed-renderer\n'),
    /Node 24\.19\.0 consumers .* found 0/);
  rejects(replaceOnce(ci, "      - if: matrix.node == '26.8.2'\n        run: npx playwright install --with-deps chromium\n", ''),
    /Node 26\.8\.2 consumers must install Chromium earlier in its cell/);
  rejects(replaceOnce(ci, "      - if: matrix.node == '26.8.2'\n        run: npx playwright install --with-deps chromium\n",
    "      - if: matrix.node == '24.19.0'\n        run: npx playwright install --with-deps chromium\n"),
  /Node 26\.8\.2 consumers must install Chromium earlier in its cell/);
  rejects(replaceOnce(ci, '          CORAL_CONSUMER_CASES: viz-react-${{ matrix.react }}\n', '          CORAL_CONSUMER_CASES: viz-react-18\n'),
    /React 18 consumer .* found 2|React 19 consumer .* found 0/);
  rejects(replaceOnce(ci, '          CORAL_EXPECT_NODE: ${{ matrix.node }}\n', '          CORAL_EXPECT_NODE: 26.8.2\n'), /expects Node 26\.8\.2 on Node 24\.19\.0/);
  // The minimum runtime cell checks its own toolchain before installing.
  rejects(replaceOnce(ci, "      - if: matrix.node == '24.19.0'\n        run: npm run check:minimum-runtime\n", ''),
    /consumers \(24\.19\.0\) must install npm 12\.0\.2 and run npm run check:minimum-runtime before npm ci/);
  // A selector that never selects a cell is a disabled gate.
  rejects(replaceOnce(ci, "      - if: matrix.node == '24.19.0'\n", "      - if: matrix.node == '22.0.0'\n"), /must not be conditional/);
});

test('Windows installs and exercises the frozen JavaScript packages early', () => {
  const windows = "      - name: Install and exercise the frozen JavaScript packages on Windows\n        if: runner.os == 'Windows'\n";
  rejects(replaceOnce(ci, windows, "      - name: Install and exercise the frozen JavaScript packages on Windows\n        if: runner.os == 'macOS'\n"),
    /Windows installed consumers .* found 0/);
  rejects(replaceOnce(ci, '          CORAL_EXPECT_PLATFORM: win32-x64\n', ''), /Windows installed consumers .* found 0/);
  rejects(replaceOnce(ci, 'CORAL_CONSUMER_CASES: language,render,library-docs-render,viz,viz-graphir-migration,mcp-server,browser\n',
    'CORAL_CONSUMER_CASES: language,render,library-docs-render,viz,viz-graphir-migration,browser\n'), /Windows installed consumers .* found 0/);
  rejects(replaceOnce(ci, 'CORAL_CONSUMER_CASES: language,render,library-docs-render,viz,viz-graphir-migration,mcp-server,browser\n',
    'CORAL_CONSUMER_CASES: language,render,library-docs-render,viz,viz-graphir-migration,mcp-server,tree-sitter-coral,browser\n'),
  /Windows installed consumers .* found 0/);
  // Without the selector the Linux and macOS cells would repeat consumers outside any obligation.
  rejects(replaceOnce(ci, windows, '      - name: Install and exercise the frozen JavaScript packages on Windows\n'),
    /job native-smoke \(ubuntu-latest\) runs npm run smoke:consumer outside a current obligation cell/);
  // It is an early obligation: moving it to a long Windows job fails.
  const step = ci.slice(ci.indexOf(windows), ci.indexOf('      - name: Compile the native grammar'));
  rejects(ci.replace(step, '').replace('        run: npm run ci:windows-unit\n', `        run: npm run ci:windows-unit\n${step.replace(windows,
    '      - name: Install and exercise the frozen JavaScript packages on Windows\n')}`), /Windows installed consumers must run in the early phase, not with late work in windows-product/);
});

test('early Windows risk runs every current contract once after its own builds', () => {
  const windows = SCRIPT_SUITES.windows;
  assert.equal(new Set(windows).size, windows.length, 'Windows script tests run once each');
  assert.deepEqual(SCRIPT_SUITES.contracts.filter(name => !windows.includes(name)), [],
    'every current contract also executes on Windows');
  const stages = readFileSync('scripts/ci.mjs', 'utf8');
  const stage = stages.slice(stages.indexOf("stage === 'windows-risk'"), stages.indexOf("stage === 'contracts'"));
  assert.match(stage, /contractChecks\(\{ suite: 'windows' \}\)/);
  assert.ok(stage.indexOf("'build:public'") < stage.indexOf('contractChecks'), 'contracts read the Windows-built outputs');
});

test('native compilation and frozen installation cover Linux, macOS and Windows', () => {
  rejects(replaceOnce(ci, '          - os: windows-latest\n            platform: win32-x64\n', ''), /native win32-x64 build .* found 0/);
  rejects(replaceOnce(ci, '            platform: darwin-arm64\n', '            platform: linux-x64\n'), /must expect darwin-arm64 on macos-15/);
  rejects(replaceOnce(ci, '        run: npm run smoke:native\n', '        run: npm run ci:hydrate\n'), /native linux-x64 install .* found 0/);
  rejects(replaceOnce(ci, '    strategy:\n      fail-fast: false\n      matrix:\n        include:\n          - os:',
    '    strategy:\n      matrix:\n        include:\n          - os:'), /fail-fast: false/);
});

test('frozen packages and site flow from their producers by identity', () => {
  rejects(inJob('unit', '        run: node scripts/candidate-artifacts.mjs verify candidate-artifacts\n', '        run: npm run check:toolchain\n'),
    /unit must consume the retained candidate tarballs only after/);
  rejects(inJob('contracts', '          RELEASE_COMMIT: ${{ github.sha }}\n        run: node scripts/candidate-artifacts.mjs',
    '          RELEASE_COMMIT: ${{ inputs.commit }}\n        run: node scripts/candidate-artifacts.mjs'), /contracts must verify the retained candidate against/);
  rejects(inJob('contracts', '        run: npm run ci:contracts\n',
    '        run: npm run ci:contracts\n      - run: npm run build\n'), /contracts must not rebuild or repack/);
  rejects(replaceOnce(ci, '          path: candidate-artifacts/\n', '          path: candidate-artifacts/*.tgz\n'),
    /must upload the completed candidate-artifacts/);
  rejects(replaceOnce(ci, '      payload-sha256: ${{ steps.site.outputs.payload-sha256 }}\n', ''), /must upload the completed candidate-site/);
  rejects(inJob('online-delivery',
    '          EXPECTED_SITE_SHA256: ${{ needs.candidate-site.outputs.payload-sha256 }}\n', ''), /online delivery must restore the frozen site/);
  rejects(inJob('browser-smoke',
    'EXPECTED_SITE_SHA256: ${{ needs.candidate-site.outputs.payload-sha256 }}', 'EXPECTED_SITE_SHA256: ${{ needs.candidate-site.outputs.version-sha256 }}'),
  /browser smoke must restore the frozen site/);
  assert.match(validateCandidateArtifactConsumers(ci.replaceAll('RELEASE_VERSION: 0.2.14', 'RELEASE_VERSION: 0.2.6')).join('\n'),
    /active candidate version/);
});

test('the aggregate always runs, needs everything and binds producer identities', () => {
  rejects(replaceOnce(ci, '      - online-delivery\n    # Reads back', '    # Reads back'), /final-candidate must always run and need every other job/);
  rejects(replaceOnce(ci, "  final-candidate:\n    if: ${{ always() }}\n", "  final-candidate:\n    if: ${{ success() }}\n"),
    /final-candidate must always run/);
  for (const [from, to] of [
    ['CANDIDATE_SITE_ARTIFACT_DIGEST: ${{ needs.candidate-site.outputs.site-artifact-digest }}', 'CANDIDATE_SITE_ARTIFACT_DIGEST: sha256:0'],
    ['EXPECTED_SITE_SHA256: ${{ needs.candidate-site.outputs.payload-sha256 }}\n          FINAL', 'EXPECTED_SITE_SHA256: ${{ needs.candidate-site.outputs.version-sha256 }}\n          FINAL'],
    ['          NEEDS_JSON: ${{ toJSON(needs) }}\n', ''],
  ]) rejects(replaceOnce(ci, from, to), /evaluate the closed required-job set once, unconditionally, bound to the producer outputs/);
  rejects(replaceOnce(ci, '      - name: Evaluate the closed required-job set\n', '      - name: Evaluate the closed required-job set\n        if: ${{ inputs.final_candidate == true }}\n'),
    /must not be conditional|evaluate the closed required-job set once/);
  rejects(replaceOnce(ci, '      actions: read\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n', '      actions: write\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n'),
    /must not request actions: write/);
});

test('only passive release records and root prose are reduced; docs and authorities run everything', async () => {
  const { classifyChangedPaths } = await import('./ci-path-tier.mjs');
  for (const path of ['docs/use/index.md', 'docs/embed/examples/render-diagram.mjs', 'docs/embed/examples/graphir-migration.ts',
    'PLAN.md', 'CLAUDE.md', 'dev/releases/0.2.14/plan.md', 'dev/releases/0.2.14/0.2.14-plan.md',
    'dev/releases/0.2.14/slice-100/plan.md', 'dev/releases/0.2.14/slice-100/ci-plan.md',
    'dev/releases/0.2.14/slice-100/ci-design.md', 'dev/release-policy.json', '.github/workflows/ci.yml']) {
    assert.equal(classifyChangedPaths([path]).fullMatrix, true, path);
  }
  for (const path of ['README.md', 'dev/releases/0.2.9/status/slice-100.md', 'dev/releases/0.2.9/slice-100/reviews.md',
    'dev/releases/0.2.6/slice-20/draft-plan.md', 'dev/archive/releases/0.2.5/notes.md']) {
    assert.equal(classifyChangedPaths([path]).fullMatrix, false, path);
  }
  assert.equal(classifyChangedPaths(['README.md', 'docs/use/index.md']).fullMatrix, true);
  assert.equal(classifyChangedPaths(['README.md'], { finalCandidate: true }).fullMatrix, true);
  assert.equal(classifyChangedPaths(['README.md'], { unknownBase: true }).fullMatrix, true);
  assert.ok(!policy.ci.pathTiers.docsAndReleaseRecords.paths.some(path => path.startsWith('docs/')));
});

test('reduced documentation runs keep source checks and unknown bases run everything', () => {
  rejects(inJob('source-checks', '    runs-on: ubuntu-latest\n',
    "    needs: classify\n    if: needs.classify.outputs.full-matrix == 'true'\n    runs-on: ubuntu-latest\n"),
  /only classify, source-checks may run on every event/);
  rejects(inJob('contracts', "    if: needs.classify.outputs.full-matrix == 'true'\n", ''),
    /only classify, source-checks may run on every event/);
  rejects(replaceOnce(ci, '"$EVENT_NAME" == "workflow_dispatch" || ', ''), /unknown-base, manual and final-candidate runs must use the full matrix|reviewed script/);
  assert.match(validateCiWorkflow(ci, { policy: { ...policy, ci: { ...policy.ci, pathTiers: { docsAndReleaseRecords: {
    ...policy.ci.pathTiers.docsAndReleaseRecords, requiredChecks: ['contracts'] } } } } }).join('\n'), /reduced-tier required checks/);
});

test('shared runners never measure performance and browser runs use the config defaults', () => {
  const browser = '        run: npm run test:e2e\n';
  rejects(inJob('e2e', browser, `${browser}      - run: npm run test:e2e:performance\n`),
    /must not measure performance on shared CI runners/);
  rejects(inJob('e2e', browser, '        run: npm run test:e2e -- --retries=2\n'),
    /canonical zero-retry browser and suite commands|reviewed script nor one simple command/);
  rejects(inJob('unit', '        run: npm run ci:unit\n', '        run: npm run ci:unit\n      - run: npm run test:coverage\n'),
    /canonical zero-retry browser and suite commands/);
  const config = readFileSync('playwright.config.ts', 'utf8');
  assert.deepEqual(validateBrowserConfig(config), []);
  assert.match(validateBrowserConfig(config.replace('retries: 0,', 'retries: process.env.CI ? 2 : 0,')).join('\n'), /zero retries/);
  assert.match(validateBrowserConfig(config.replace('workers: 4,', 'workers: 8,')).join('\n'), /four workers/);
});

test('only the frozen packages, site and proof are retained; no reports or caches', () => {
  rejects(inJob('e2e', '        run: npm run test:e2e\n',
    '        run: npm run test:e2e\n      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1\n        with:\n          name: playwright-report\n          path: playwright-report/\n          if-no-files-found: error\n          retention-days: 90\n'),
  /uploads playwright-report; only the frozen packages, site and proof are retained/);
  rejects(replaceOnce(ci, '          path: candidate-site/\n          if-no-files-found: error\n          retention-days: 90\n',
    '          path: candidate-site/\n          if-no-files-found: error\n          retention-days: 7\n'), /must fail when missing and be retained for 90 days/);
  rejects(inJob('unit', '          package-manager-cache: false\n', '          cache: npm\n'),
    /must not use a remote npm cache/);
  rejects(inJob('unit', '    timeout-minutes: 60\n', ''), /job unit must declare timeout-minutes/);
});

test('a same-SHA failed-job retry replaces its own uploads, still bound by producer identity', () => {
  for (const name of ['node-26-candidate-packages', 'candidate-site', 'final-candidate-proof']) {
    const upload = ci.slice(ci.indexOf(`          name: ${name}\n`));
    const block = upload.slice(0, upload.indexOf('          overwrite: true\n') + '          overwrite: true\n'.length);
    assert.ok(!block.slice(0, -1).includes('\n      - '), `${name} sets overwrite on its own upload`);
    rejects(ci.replace(block, block.replace('          overwrite: true\n', '')), new RegExp(`${name} must overwrite a same-name artifact`));
    rejects(ci.replace(block, block.replace('          overwrite: true\n', '          overwrite: false\n')), new RegExp(`${name} must overwrite`));
  }
  // The replacement's identity is still the producer's own upload output.
  rejects(replaceOnce(ci, '      artifact-id: ${{ steps.upload.outputs.artifact-id }}\n', '      artifact-id: ${{ steps.prior.outputs.artifact-id }}\n'),
    /candidate-packages must upload the completed candidate-artifacts and output its artifact id and digest/);
  rejects(replaceOnce(ci, '      site-artifact-digest: ${{ steps.upload.outputs.artifact-digest }}\n', '      site-artifact-digest: sha256:retained\n'),
    /candidate-site must upload the completed candidate-site/);
});

test('the secret scan and its detection test use the pinned scanner', () => {
  rejects(replaceOnce(ci, '        run: npm run test:gitleaks\n', '        run: npm run ci:hydrate\n'), /secret detection test .* found 0/);
  rejects(replaceOnce(ci, "          GOBIN: ${{ runner.temp }}/gitleaks\n", "          GOBIN: ${{ runner.temp }}/other\n"),
    /must use the gitleaks binary installed earlier/);
  rejects(replaceOnce(ci, '--no-git --redact --config', '--no-git --config'), /secret scan .* found 0|reviewed script/);
  // The real scan is an unconditional blocking step of an always-run job.
  const scan = '      - name: Scan tracked source for secrets\n';
  rejects(replaceOnce(ci, scan, `${scan}        if: github.event_name == 'push'\n`), /must not be conditional/);
  rejects(replaceOnce(ci, scan, `${scan}        continue-on-error: true\n`), /must not continue on error/);
  rejects(replaceOnce(ci, '        run: \'"$GITLEAKS_BIN" detect --no-git --redact --config .gitleaks.toml --source .\'\n',
    '        run: \'"$GITLEAKS_BIN" detect --no-git --redact --config .gitleaks.toml --source . || true\'\n'), /secret scan .* found 0/);
});

test('cancellation applies only to superseded pull request runs', () => {
  rejects(replaceOnce(ci, "  group: ci-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id }}\n",
    '  group: ci-${{ github.ref }}\n'), /concurrency may cancel only superseded pull request runs/);
  rejects(replaceOnce(ci, "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n", '  cancel-in-progress: true\n'),
    /concurrency may cancel only superseded pull request runs/);
});

test('an equivalent safe organization is accepted', () => {
  // Step names, explanatory comments, job order and timeouts are incidental.
  let text = replaceOnce(ci, jobBlock('baseline-consumer'), '').replace('jobs:\n', `jobs:\n${jobBlock('baseline-consumer')}\n`);
  text = text.replaceAll(/^( {6}- name: )(.+)$/gm, '$1Renamed $2').replaceAll(/^ {0,4}# .*\n/gm, '');
  text = text.replace('    timeout-minutes: 45\n    steps:\n      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: 26.8.2\n          package-manager-cache: false\n      - uses: actions/setup-python',
    '    timeout-minutes: 50\n    steps:\n      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: 26.8.2\n          package-manager-cache: false\n      - uses: actions/setup-python');
  assert.notEqual(text, ci);
  assert.equal(errors(text), '');
});
