import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CLOSED_JOBS } from './ci-final-candidate.mjs';
import {
  APPROVED_ACTIONS, FORBIDDEN_ENVIRONMENT, WORKFLOW_INVENTORY, apiPermission, contextErrors, npmFlagErrors,
  scriptApiPaths, tokenPermissionErrors, validatePolicy, validateReleasePolicy, validateReleaseWorkflow,
  validateRepository, validateWorkflowText,
} from './workflow-policy.mjs';

// Security and release invariants are exercised by mutating the real
// workflows and expecting the production validator to refuse each unsafe
// variant. Assertions name the refused property, not a job or step layout.
const files = { ci: 'ci.yml', publish: 'publish.yml', pages: 'pages.yml', pagesRestore: 'pages-restore.yml', release: 'release.yml' };
const workflow = name => readFileSync(`.github/workflows/${name}`, 'utf8');
const inputs = () => ({
  ...Object.fromEntries(Object.entries(files).map(([key, name]) => [key, workflow(name)])),
  dependabot: readFileSync('.github/dependabot.yml', 'utf8'),
  policy: JSON.parse(readFileSync('dev/release-policy.json', 'utf8')),
  playwrightConfig: readFileSync('playwright.config.ts', 'utf8'),
});
const keyOf = name => Object.keys(files).find(key => files[key] === name);
const replaceOnce = (text, from, to) => {
  assert.equal(text.split(from).length - 1, 1, `expected one occurrence of ${JSON.stringify(from)}`);
  return text.replace(from, to);
};
const policyErrors = (name, mutated) => validatePolicy({ ...inputs(), [keyOf(name)]: mutated }).join('\n');
const rejects = (name, from, to, pattern) => assert.match(policyErrors(name, replaceOnce(workflow(name), from, to)), pattern, to);

const proofStep = '      - name: Verify exact-SHA final-candidate proof and retained bytes\n';
const guardRun = '        run: node scripts/release-guard.mjs --publish\n';

test('the repository workflows and release policy are valid', async () => {
  assert.deepEqual(await validateRepository(), []);
  assert.deepEqual(validatePolicy(inputs()), []);
});

test('Actions are pinned to reviewed full SHAs with exact version labels', () => {
  const checkout = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1';
  assert.match(validateWorkflowText('x.yml', '      - uses: actions/checkout@v7\n').join('\n'), /full SHA[\s\S]*version comment/);
  assert.match(validateWorkflowText('x.yml', `      - uses: ${checkout.replace(' # v7.0.1', '')}\n`).join('\n'), /exact version comment/);
  assert.match(validateWorkflowText('x.yml', `      - uses: ${checkout.replace('v7.0.1', 'v7.0.0')}\n`).join('\n'), /must be labelled v7\.0\.1/);
  for (const [action, label] of APPROVED_ACTIONS) assert.deepEqual(validateWorkflowText('x.yml', `      - uses: ${action} # ${label}\n`), []);
  // Labels are read from the parsed value and its source range, so quoting and
  // flow style do not matter; a label on another line does not count.
  for (const text of [`      - uses: "${checkout.replace(' # ', '" # ')}\n`, `      - { uses: ${checkout.replace(' # ', ' } # ')}\n`,
    `      - "uses": '${checkout.replace(' # ', "'   #   ")}\n`]) assert.deepEqual(validateWorkflowText('x.yml', text), [], text);
  for (const text of [`      - { uses: ${checkout.replace(' # v7.0.1', '')} }\n`,
    `      - uses: ${checkout.replace(' # v7.0.1', '')}\n        with: { fetch-depth: 0 } # v7.0.0\n`]) {
    assert.match(validateWorkflowText('x.yml', text).join('\n'), /exact version comment/, text);
  }
  rejects('publish.yml', proofStep, `      - uses: someone/export-env@0123456789abcdef0123456789abcdef01234567 # v1.0.0\n${proofStep}`,
    /step "someone\/export-env@\S+" uses an action outside the approved inventory/);
  rejects('ci.yml', 'actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0\n        if:',
    'actions/setup-python@0000000000000000000000000000000000000000 # v7.0.0\n        if:', /outside the approved inventory/);
});

test('YAML is parsed strictly; unsafe keys fail however they are written (TRO100-15)', () => {
  for (const [name, from, to, pattern] of [
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: npm run ci:source\n        run: npm run ci:unit\n', /YAML does not parse cleanly/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: npm run ci:source\n        "run": npm run ci:unit\n', /YAML does not parse cleanly/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: &source npm run ci:source\n      - run: *source\n', /YAML aliases are not permitted/],
    ['publish.yml', '\njobs:\n', '\ndefaults:\n  run:\n    shell: bash {0}\n\njobs:\n', /workflow defaults are not permitted/],
    ['publish.yml', '\njobs:\n', '\n"defaults": { run: { shell: "bash {0}" } }\n\njobs:\n', /workflow defaults are not permitted/],
    ['publish.yml', '\njobs:\n', '\nenv:\n  SHELLOPTS: ""\n\njobs:\n', /unsupported top-level key env/],
    ['publish.yml', proofStep, `${proofStep}        shell: bash {0}\n`, /must not set a shell/],
    ['publish.yml', proofStep, `${proofStep}        'shell': bash {0}\n`, /must not set a shell/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - { run: npm run ci:source, continue-on-error: true }\n', /must not continue on error/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - { run: npm run ci:source, env: { NODE_OPTIONS: --require=x } }\n',
      /sets forbidden environment variable NODE_OPTIONS/],
    ['ci.yml', '  unit:\n    needs:\n', '  unit:\n    "permissions": { "contents": write }\n    needs:\n', /must not request contents: write/],
    ['publish.yml', '      id-token: write\n    runs-on: ubuntu-latest\n', '      id-token: write\n    runs-on: ubuntu-latest\n    container: node:26\n',
      /job publish uses unsupported key container/],
    ['ci.yml', '  unit:\n    needs:\n', '  unit:\n    defaults:\n      run:\n        shell: bash {0}\n    needs:\n', /job unit must not set defaults/],
    ['ci.yml', '  unit:\n    needs:\n', '  unit:\n    env:\n      CI: false\n    needs:\n', /job unit uses unsupported key env/],
    ['ci.yml', '  unit:\n    needs:\n', '  unit:\n    uses: ./.github/workflows/publish.yml\n    needs:\n', /job unit uses unsupported key uses/],
  ]) rejects(name, from, to, pattern);
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(root.devDependencies.yaml, '2.9.1');
  assert.equal(lock.packages['node_modules/yaml'].version, '2.9.1');
});

test('equivalent quoted, flow-style and reindented YAML is accepted', () => {
  // Indent every nested line by two more spaces: block scalars keep their text.
  const reindent = text => text.replace(/^(?=[ ]+\S)/gm, '  ');
  const quote = text => text.replace(/^permissions:/m, '"permissions":').replace(/^( +(?:- )?)(run|name|if|env|with):(?= |$)/gm, "$1'$2':");
  const reformatted = Object.fromEntries(Object.entries(files).map(([key, name]) => [key, reindent(quote(workflow(name)))]));
  reformatted.ci = replaceOnce(reformatted.ci, "        - 'run': npm run ci:source\n", '        - { run: npm run ci:source }\n');
  for (const [key, name] of Object.entries(files)) assert.notEqual(reformatted[key], workflow(name), name);
  assert.deepEqual(validatePolicy({ ...inputs(), ...reformatted }), []);
  // The same reformatting does not hide an unsafe change.
  const unsafe = replaceOnce(reformatted.ci, '        - { run: npm run ci:source }\n', '        - { run: npm run ci:source, "continue-on-error": true }\n');
  assert.match(validatePolicy({ ...inputs(), ...reformatted, ci: unsafe }).join('\n'), /must not continue on error/);
});

test('gates stay blocking: no error tolerance, neutralized commands or disabling conditions (TRO100-8/-16)', () => {
  for (const [name, from, to, pattern] of [
    ['publish.yml', proofStep, `${proofStep}        continue-on-error: true\n`, /must not continue on error/],
    ['publish.yml', proofStep, `${proofStep}        "continue-on-error": true\n`, /must not continue on error/],
    ['ci.yml', '    runs-on: windows-latest\n    timeout-minutes: 45\n', '    runs-on: windows-latest\n    continue-on-error: true\n    timeout-minutes: 45\n',
      /job windows-risk must not continue on error/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: npm run ci:source\n        continue-on-error: ${{ true }}\n', /must not continue on error/],
    ['publish.yml', guardRun, '        run: node scripts/release-guard.mjs --publish || true\n', /neither a reviewed script nor one simple command/],
    ['publish.yml', guardRun, '        run: node scripts/release-guard.mjs --publish; true\n', /neither a reviewed script nor one simple command/],
    ['publish.yml', guardRun, '        run: if node scripts/release-guard.mjs --publish; then :; fi\n', /neither a reviewed script nor one simple command/],
    ['publish.yml', guardRun, '        run: echo node scripts/release-guard.mjs --publish\n', /immutable release identity must be verified before the first npm publish/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: |\n          set +e\n          npm run ci:source\n', /neither a reviewed script nor one simple command/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: "npm run ci:source $(true)"\n', /neither a reviewed script nor one simple command/],
    ['release.yml', '          node scripts/github-release-guard.mjs\n', '          node scripts/github-release-guard.mjs || true\n', /neither a reviewed script nor one simple command/],
    ['release.yml', '          node scripts/github-release-guard.mjs\n', '          node scripts/github-release-guard.mjs &\n', /neither a reviewed script nor one simple command/],
    ['pages-restore.yml', 'run: node scripts/pages-restore.mjs source', 'run: node scripts/pages-restore.mjs source || true', /neither a reviewed script/],
    ['publish.yml', proofStep, `${proofStep}        if: false\n`, /must not be conditional/],
    ['publish.yml', proofStep, `${proofStep}        if : false\n`, /must not be conditional/],
    ['publish.yml', '        if: ${{ fromJSON(steps.registry.outputs.start-index) <= 2 }}', '        if: ${{ always() }}', /must not be conditional/],
    ['ci.yml', '      - run: npm run ci:source\n', "      - if: runner.os == 'Windows'\n        run: npm run ci:source\n", /must not be conditional|source checks/],
    ['ci.yml', '      - run: npm run ci:windows-risk\n', '      - run: npm run ci:windows-risk\n        timeout-minutes: 1\n', /uses unsupported key timeout-minutes/],
  ]) rejects(name, from, to, pattern);
});

test('injected Node, npm and shell configuration is refused (TRO100-20)', () => {
  const nodeOptions = "--import=data:text/javascript,process.on('uncaughtException',()=>process.exit(0))";
  for (const [name, from, to, pattern] of [
    ['publish.yml', guardRun, `          NODE_OPTIONS: ${nodeOptions}\n${guardRun}`, /sets forbidden environment variable NODE_OPTIONS/],
    ['ci.yml', '          CORAL_E2E_PHASE: full\n', '          CORAL_E2E_PHASE: full\n          npm_config_script_shell: /bin/true\n', /forbidden environment variable npm_config_script_shell/],
    ['release.yml', '          RELEASE_TAG_REGISTRY_VERIFICATION: true\n', '          RELEASE_TAG_REGISTRY_VERIFICATION: true\n          BASH_ENV: /dev/null\n', /forbidden environment variable BASH_ENV/],
    ['pages-restore.yml', '          RESTORE_PAYLOAD_SHA256: ${{ inputs.payload_sha256 }}\n', '          RESTORE_PAYLOAD_SHA256: ${{ inputs.payload_sha256 }}\n          PATH: /tmp\n', /forbidden environment variable PATH/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: npm run ci:source --script-shell=true\n', /passes npm configuration flag --script-shell=true/],
    ['pages.yml', '      - run: npm ci --ignore-scripts\n', '      - run: npm ci --prefix=other\n', /passes npm configuration flag --prefix=other/],
  ]) rejects(name, from, to, pattern);
  for (const run of ['npm run verify --script-shell=bash', 'npm test --ignore-scripts', 'npx --script-shell=true playwright install',
    'npm install --ignore-scripts', 'npm ci --ignore-scripts=false', 'npm run ci:unit --workspaces']) {
    assert.match(npmFlagErrors(run).join('\n'), /npm configuration flag/, run);
  }
  for (const run of ['npm ci --ignore-scripts', 'npm install --global npm@12.0.2', 'npx playwright install --with-deps chromium',
    'npm publish ./candidate-artifacts/x.tgz --access public']) assert.deepEqual(npmFlagErrors(run), [], run);
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS', 'PATH', 'LD_PRELOAD', 'npm_config_script_shell', 'NPM_CONFIG_USERCONFIG']) {
    assert.equal(FORBIDDEN_ENVIRONMENT.test(name), true, name);
  }
  for (const name of ['RELEASE_COMMIT', 'GITHUB_TOKEN', 'CORAL_ARTIFACT_DIR', 'GITLEAKS_BIN', 'GOBIN']) assert.equal(FORBIDDEN_ENVIRONMENT.test(name), false, name);
});

test('expressions read only trusted contexts and never interpolate into scripts', () => {
  for (const [name, from, to, pattern] of [
    ['ci.yml', '          HEAD_SHA: ${{ github.sha }}\n', '          HEAD_SHA: ${{ github.head_ref }}\n', /untrusted or unreviewed context github\.head_ref/],
    ['ci.yml', '          EVENT_NAME: ${{ github.event_name }}\n', '          EVENT_NAME: ${{ github.event.pull_request.title }}\n', /untrusted or unreviewed context github\.event\.pull_request\.title/],
    ['publish.yml', '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          RELEASE_VERSION: ${{ inputs.version }}\n          RELEASE_COMMIT: ${{ inputs.commit }}\n          RELEASE_CANDIDATE_RUN_ID: ${{ inputs.candidate_run_id }}\n        run: |',
      '          GITHUB_TOKEN: ${{ secrets.NPM_TOKEN }}\n          RELEASE_VERSION: ${{ inputs.version }}\n          RELEASE_COMMIT: ${{ inputs.commit }}\n          RELEASE_CANDIDATE_RUN_ID: ${{ inputs.candidate_run_id }}\n        run: |',
      /untrusted or unreviewed context secrets\.NPM_TOKEN/],
    ['ci.yml', '      - run: npm run ci:source\n', '      - run: npm run ${{ inputs.final_candidate }}\n', /must pass expressions through env/],
  ]) rejects(name, from, to, pattern);
  assert.deepEqual(contextErrors("${{ format('{0}', github.sha) }} ${{ toJSON(needs) }} ${{ needs.a.outputs.b-c }}"), []);
  assert.match(contextErrors('${{ vars.SECRET }} ${{ env.X }} ${{ toJSON(github) }}').join('\n'), /vars\.SECRET[\s\S]*env\.X[\s\S]*context github/);
});

test('triggers are limited and release workflows cannot be called as reusable workflows (TRO100-18)', () => {
  rejects('ci.yml', '  pull_request:\n', '  pull_request_target:\n', /trigger pull_request_target is not permitted/);
  rejects('ci.yml', '  push:\n', '  push:\n  workflow_run:\n    workflows: [CI]\n', /trigger workflow_run is not permitted/);
  for (const name of ['release.yml', 'publish.yml', 'pages-restore.yml']) {
    rejects(name, 'on:\n  workflow_dispatch:\n', 'on:\n  workflow_call:\n  workflow_dispatch:\n', /a workflow_call trigger is not permitted/);
  }
});

test('permissions stay least-privilege in every workflow', () => {
  for (const [name, from, to, pattern] of [
    ['ci.yml', 'permissions:\n  contents: read\n\n#', 'permissions:\n  contents: write\n\n#', /ci\.yml: workflow permissions must be exactly/],
    ['ci.yml', '  unit:\n    needs:\n', '  unit:\n    permissions:\n      packages: write\n    needs:\n', /must not request packages: write/],
    ['ci.yml', '  unit:\n    needs:\n', '  unit:\n    permissions:\n      actions: read\n    needs:\n', /job unit must inherit read-only contents permission/],
    ['publish.yml', 'permissions: {}\n', 'permissions:\n  id-token: write\n', /publish\.yml: workflow permissions must be exactly \{\}/],
    ['publish.yml', '  verify:\n    permissions:\n      contents: read\n      actions: read\n', '  verify:\n    permissions:\n      contents: read\n      actions: read\n      id-token: write\n',
      /only the publish job may request id-token: write/],
    ['publish.yml', "  registry:\n    if: ${{ needs.publish.result == 'success' }}\n    needs: publish\n    permissions:\n      contents: read\n",
      "  registry:\n    if: ${{ needs.publish.result == 'success' }}\n    needs: publish\n    permissions:\n      contents: write\n", /must not request contents: write/],
    ['pages.yml', '  build:\n    permissions:\n      contents: read\n      actions: read\n', '  build:\n    permissions:\n      contents: read\n      actions: read\n      pages: write\n',
      /write privileges must exist only on the deploy job/],
    ['pages.yml', '    permissions:\n      pages: write\n      id-token: write\n', '    permissions:\n      pages: write\n      id-token: write\n      actions: read\n',
      /deploy permissions must be exactly pages and id-token write/],
    ['pages-restore.yml', '  prepare:\n    permissions:\n      contents: read\n      actions: read\n', '  prepare:\n    permissions:\n      contents: read\n      actions: read\n      deployments: read\n',
      /prepare permissions must be contents\/actions read only|must not request deployments: read/],
    ['release.yml', '      deployments: read\n', '      deployments: read\n      pages: write\n', /verify job must have only contents, actions and deployments read permissions|must not request pages: write/],
    ['release.yml', '      contents: write\n', '      contents: write\n      deployments: read\n', /release job must have only contents write permission/],
    ['publish.yml', '    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          ref: ${{ inputs.commit }}\n          fetch-depth: 0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: 26.8.2\n          registry-url',
      '    runs-on: [self-hosted, coral-e2e]\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          ref: ${{ inputs.commit }}\n          fetch-depth: 0\n      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:\n          node-version: 26.8.2\n          registry-url',
      /job publish runs on unreviewed runner self-hosted,coral-e2e/],
  ]) rejects(name, from, to, pattern);
});

test('publication verifies the exact proof and frozen bytes before any npm publish, with OIDC only (CRO100-8)', () => {
  const publish = workflow('publish.yml');
  // Moving a gate after the first publish, even with a comment repeating it, fails.
  for (const name of ['Verify exact-SHA final-candidate proof and retained bytes', 'Verify immutable release identity', 'Inspect registry publication state']) {
    const block = publish.match(new RegExp(`( {6}- name: ${name}\\n(?: {8}.*\\n)+)`))[1];
    const moved = publish.replace(block, '').replace('      - name: Publish tree-sitter-coral\n', `${block}      - name: Publish tree-sitter-coral\n`)
      .replace('\njobs:\n', '\n# node scripts/release-final-candidate.mjs node scripts/release-guard.mjs --publish\njobs:\n');
    assert.match(policyErrors('publish.yml', moved), /must be verified before the first npm publish/, name);
  }
  for (const [from, to, pattern] of [
    ['      - run: npm ci --ignore-scripts\n      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          repository: coreyt/coral\n          run-id: ${{ inputs.candidate_run_id }}\n          name: node-26-candidate-packages\n          path: candidate-artifacts\n          github-token: ${{ secrets.GITHUB_TOKEN }}\n      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          repository: coreyt/coral\n          run-id: ${{ inputs.candidate_run_id }}\n          name: final-candidate-proof\n          path: candidate-proof\n          github-token: ${{ secrets.GITHUB_TOKEN }}\n' + proofStep,
      '      - run: npm ci\n      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          repository: coreyt/coral\n          run-id: ${{ inputs.candidate_run_id }}\n          name: node-26-candidate-packages\n          path: candidate-artifacts\n          github-token: ${{ secrets.GITHUB_TOKEN }}\n      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          repository: coreyt/coral\n          run-id: ${{ inputs.candidate_run_id }}\n          name: final-candidate-proof\n          path: candidate-proof\n          github-token: ${{ secrets.GITHUB_TOKEN }}\n' + proofStep,
      /publish job must install dependencies without lifecycle scripts/],
    [guardRun, `${guardRun}      - run: npm run smoke:consumer\n`, /the publish job must not run npm run smoke:consumer/],
    ['        run: npm publish ./candidate-artifacts/coral-viz-browser-0.2.14.tgz --access public\n',
      '        env:\n          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n        run: npm publish ./candidate-artifacts/coral-viz-browser-0.2.14.tgz --access public\n',
      /must use OIDC without npm token injection/],
    ['./candidate-artifacts/coral-viz-browser-0.2.14.tgz', './candidate-artifacts/coral-viz-browser-0.2.6.tgz', /publish each frozen tarball once, in registry order/],
    ['        if: ${{ fromJSON(steps.registry.outputs.start-index) <= 3 }}\n', '        if: ${{ fromJSON(steps.registry.outputs.start-index) <= 4 }}\n', /in registry order, gated by the start index/],
    ["  publish:\n    if: ${{ needs.verify.result == 'success' }}\n", '  publish:\n    if: ${{ always() }}\n', /only after its token-free verification succeeds/],
    ['        run: node scripts/workspace-audit.mjs\n', '        run: node scripts/check-docs-structure.mjs\n', /token-free verification must run the fresh workspace audit/],
    ['        run: node scripts/release-registry.mjs verify\n', '        run: node scripts/release-registry.mjs preflight\n', /registry job must verify the public registry artifacts/],
    ['          RELEASE_CANDIDATE_RUN_ID: ${{ inputs.candidate_run_id }}\n        run: |', '        run: |', /proof verification must bind RELEASE_CANDIDATE_RUN_ID/],
    ['        run: node scripts/workspace-audit.mjs\n',
      '        run: node scripts/workspace-audit.mjs\n      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n        with:\n          name: workspace-audit\n          path: workspace-audit.json\n',
      /must not upload report artifacts/],
  ]) rejects('publish.yml', from, to, pattern);
});

test('Pages promotes the proven frozen site without rebuilding it', () => {
  for (const [from, to, pattern] of [
    ['        run: node scripts/ci.mjs restore-site\n', '        run: npm run build:online\n', /never rebuild or publish/],
    ['        run: node scripts/ci.mjs restore-site\n', '        run: node scripts/ci.mjs restore-site\n      - run: npm run build\n', /never rebuild or publish/],
    ['          name: candidate-site\n          path: candidate-site\n          github-token: ${{ secrets.GITHUB_TOKEN }}\n',
      '          name: other-site\n          path: candidate-site\n          github-token: ${{ secrets.GITHUB_TOKEN }}\n', /must come from candidate-site of the selected candidate run/],
    ['        run: node scripts/release-final-candidate.mjs candidate-proof/final-candidate-proof.json candidate-artifacts/candidate-manifest.json --site candidate-site/site.tar\n',
      '        run: node scripts/candidate-artifacts.mjs verify candidate-artifacts\n', /final-candidate proof must be verified before the payload is staged/],
    ['          path: build/site\n          retention-days: 90\n', '          path: build/site\n          retention-days: 7\n', /retain its artifact for 90 days/],
    ['  cancel-in-progress: false\n', '  cancel-in-progress: true\n', /serialize every Pages deployment without cancellation/],
    ['    needs: [build, registry]\n', '    needs: build\n', /deployment must depend on executable registry proof and the exact staged payload/],
    ["needs.registry.result == 'success' }}\n    needs: [build, registry]", "true }}\n    needs: [build, registry]", /deployment must depend on executable registry proof/],
    ['          RELEASE_PAGES_REGISTRY_VERIFICATION: true\n', '', /deployment must depend on executable registry proof/],
  ]) rejects('pages.yml', from, to, pattern);
});

test('Pages restore relays exact retained bytes with least privilege', () => {
  const restore = workflow('pages-restore.yml');
  const deploy = restore.slice(restore.indexOf('      - name: Deploy exact retained artifact'));
  const verify = restore.slice(restore.indexOf('      - name: Verify relayed payload bytes'), restore.indexOf(deploy));
  assert.match(policyErrors('pages-restore.yml', restore.replace(verify + deploy, deploy + verify)),
    /relayed payload must be verified before deployment/);
  for (const [from, to, pattern] of [
    ['          EXPECTED_SHA256: ${{ inputs.payload_sha256 }}\n', '          EXPECTED_SHA256: ${{ inputs.source_artifact_digest }}\n', /relayed payload must be verified before deployment/],
    ['          RESTORE_PAYLOAD_SHA256: ${{ inputs.payload_sha256 }}\n', '', /payload digest must be verified before the payload is relayed/],
    ['        run: node scripts/pages-restore.mjs source\n', '        run: npm run ci:restore-site\n', /without installing, building or re-staging/],
    ['  group: coral-pages\n', '  group: other-pages\n', /share the Coral Pages group/],
  ]) rejects('pages-restore.yml', from, to, pattern);
});

test('the GitHub release keeps verification, tag and immutability gates (CRO100-1/-3/-12, DRO100-10)', () => {
  const release = workflow('release.yml');
  assert.deepEqual(validateReleaseWorkflow(release), []);
  for (const [from, to, pattern] of [
    ['git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" tag', 'git tag', /tag --annotate|reviewed script/],
    ['--notes-file release-notes.md --draft=false', '--generate-notes --draft=false', /release notes must come from CHANGELOG\.md/],
    ['          RELEASE_TAG_REGISTRY_VERIFICATION: true\n', '', /private-digest context \(RELEASE_TAG_REGISTRY_VERIFICATION: true\)/],
    ['          RELEASE_PRIVATE_REPOSITORY: ${{ github.event.repository.private }}\n', '', /private-digest context/],
    ['          node scripts/github-release-guard.mjs\n', '', /verify job must run node scripts\/github-release-guard\.mjs/],
    ["    if: ${{ needs.verify.result == 'success' }}\n", '    if: ${{ always() }}\n', /release job must run only after verification succeeds/],
    ['          run-id: ${{ inputs.pages_run_id }}\n', '          run-id: ${{ inputs.candidate_run_id }}\n', /must download github-pages from inputs\.pages_run_id/],
  ]) assert.match(validateReleaseWorkflow(replaceOnce(release, from, to)).join('\n'), pattern, to);
});

test('the release policy holds current configuration bound to the proof inventory', () => {
  const policy = inputs().policy;
  assert.deepEqual(validateReleasePolicy(policy), []);
  for (const [mutate, pattern] of [
    [value => { value.requiredChecks = value.requiredChecks.filter(check => check !== 'native-smoke'); }, /requiredChecks must be exactly the proof inventory/],
    [value => { value.requiredChecks.push('verify'); }, /requiredChecks must be exactly the proof inventory/],
    [value => { value.ci.candidateRef = 'refs/heads/release/0.2.6-candidate'; }, /CI tier/],
    [value => { value.ci.pathTiers.docsAndReleaseRecords.fullMatrix = true; }, /CI tier/],
    [value => { value.guardedMain.expectedChecks = ['classify']; }, /guarded main must require only the final-candidate aggregate/],
    [value => { value.releaseRuntime.node = '24.19.0'; }, /wrong release runtime/],
    [value => { value.githubReleaseJob.permissions['id-token'] = 'write'; }, /isolated GitHub release boundary/],
    [value => { value.npmPublisher.accountMutationAuthorized = true; }, /without account mutation authority/],
    [value => { value.gitleaks.version = '8.0.0'; }, /secret-scanning policy/],
    [value => { value.pages.observedAt = '2026-09-12T00:00:00Z'; }, /historical observations are not current policy \(pages\.observedAt\)/],
    [value => { value.npmPublisher.observations = []; }, /historical observations .*npmPublisher\.observations/],
    [value => { value.releaseIdentity = { verifiedLedger: 'dev/releases/0.2.6/release-identity.json' }; }, /historical observations .*releaseIdentity/],
  ]) {
    const value = structuredClone(policy);
    mutate(value);
    assert.match(validateReleasePolicy(value).join('\n'), pattern);
  }
  assert.match(validateReleasePolicy(policy, { closedJobs: [...CLOSED_JOBS, 'extra'] }).join('\n'), /proof inventory/);
  const gitleaks = structuredClone(policy);
  gitleaks.gitleaks.version = '8.30.2';
  assert.match(validatePolicy({ ...inputs(), policy: gitleaks }).join('\n'), /install the gitleaks version named by the release policy/);
});

// CRO100-2: each job token must cover every GitHub endpoint its steps read.
test('every GitHub API read in a workflow step is covered by its job permissions (CRO100-2)', () => {
  const readScript = path => readFileSync(path, 'utf8');
  for (const name of WORKFLOW_INVENTORY) assert.deepEqual(tokenPermissionErrors(name, workflow(name), readScript), [], name);
  const reads = scriptApiPaths(readScript('scripts/release-github-reads.mjs'));
  assert.deepEqual(reads.map(apiPermission).filter(value => !value), []);
  assert.ok(reads.includes('/deployments'));
  assert.deepEqual(scriptApiPaths("github('Message about GET /repos/coreyt/coral/immutable-releases')"), []);
  assert.equal(apiPermission('/deployments/1/statuses'), 'deployments');
  assert.equal(apiPermission('/actions/runs/1/jobs'), 'actions');
  assert.equal(apiPermission('/releases/tags/v0.2.6'), 'contents');
  assert.equal(apiPermission('/git/ref/tags/v0.2.6'), 'contents');
  assert.equal(apiPermission('/immutable-releases'), 'administration');
  assert.equal(apiPermission(''), 'metadata');
  assert.equal(apiPermission('/hooks'), null);
  const release = workflow('release.yml');
  const restore = workflow('pages-restore.yml');
  const ci = workflow('ci.yml');
  for (const [pattern, name, text, reader = readScript] of [
    [/release\.yml: job verify needs deployments: read/, 'release.yml', release.replace('      deployments: read\n', '')],
    [/release\.yml: job verify needs actions: read/, 'release.yml', release.replace('      actions: read\n', '')],
    [/release\.yml: job release needs contents: write/, 'release.yml', release.replace('      contents: write\n', '      contents: read\n')],
    [/pages-restore\.yml: job prepare needs actions: read/, 'pages-restore.yml', restore.replace('      contents: read\n      actions: read\n', '      contents: read\n')],
    [/ci\.yml: job final-candidate needs actions: read/, 'ci.yml', ci.replace('      contents: read\n      actions: read\n', '      contents: read\n')],
    [/cannot be granted \(scripts\/release-github-reads\.mjs \/immutable-releases\)/, 'release.yml', release,
      path => (path === 'scripts/release-github-reads.mjs' ? `${readScript(path)}\ngithub(\`\${REPO_API}/immutable-releases\`);` : readScript(path))],
    [/unclassified GitHub endpoint/, 'release.yml', release, path => (path === 'scripts/github-release-guard.mjs'
      ? 'github(`/repos/coreyt/coral/hooks`)' : readScript(path))],
  ]) assert.match(tokenPermissionErrors(name, text, reader).join('\n'), pattern);
});

test('only the five contracted workflow files may exist (TRO100-21)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'coral-workflow-inventory-'));
  try {
    for (const path of ['.github', 'dev/release-policy.json', 'scripts', 'playwright.config.ts']) {
      await cp(path, join(root, path), { recursive: true });
    }
    assert.deepEqual(await validateRepository({ root }), []);
    await writeFile(join(root, '.github/workflows/zz-probe.yml'), [
      'name: Probe', 'on:', '  workflow_dispatch:', 'permissions:', '  pages: write', '  id-token: write', 'jobs:',
      '  probe:', '    runs-on: ubuntu-latest', '    steps:',
      '      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1', '',
    ].join('\n'));
    assert.match((await validateRepository({ root })).join('\n'), /workflow file zz-probe\.yml is outside the closed workflow inventory/);
    await rm(join(root, '.github/workflows/zz-probe.yml'));
    await rm(join(root, '.github/workflows/pages-restore.yml'));
    assert.match((await validateRepository({ root })).join('\n'), /missing contracted workflow file pages-restore\.yml/);
    await writeFile(join(root, 'playwright.config.ts'), (await readFile('playwright.config.ts', 'utf8')).replace('retries: 0,', 'retries: 1,'));
    assert.match((await validateRepository({ root })).join('\n'), /zero retries/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
