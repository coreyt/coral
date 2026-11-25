import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LineCounter, isScalar, parseDocument, visit } from 'yaml';
import {
  AGGREGATE_JOB, ALWAYS_JOBS, CLOSED_JOBS, MATRIX_CELLS, PACKAGE_ARTIFACT, PROOF_ARTIFACT, SITE_ARTIFACT,
} from './ci-final-candidate.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';

// Semantic workflow policy. It checks security and current release obligations
// in the parsed workflows, not job names, step names or YAML formatting:
// pinned Actions, least privilege, safe triggers and contexts, blocking steps,
// the exact candidate transfer, the risk-first CI order, and publication
// authority. Equivalent safe organizations pass; weakened gates fail.

const workflowDirectory = '.github/workflows';

// TRO100-21: the workflow inventory is closed.
export const WORKFLOW_INVENTORY = Object.freeze(['ci.yml', 'publish.yml', 'release.yml', 'pages.yml', 'pages-restore.yml']);

// The complete Action inventory, each at its reviewed SHA and exact tag.
export const APPROVED_ACTIONS = Object.freeze(new Map([
  ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
  ['actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'v7.0.0'],
  ['actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333', 'v8.0.2'],
  ['actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9', 'v7.0.2'],
  ['actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97', 'v7.0.0'],
  ['actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9', 'v5.0.0'],
  ['actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346', 'v5.0.1'],
]));

const RELEASE_NODE = '26.8.2';
const MINIMUM_NODE = '24.19.0';
const NPM_VERSION = '12.0.2';
const RETENTION_DAYS = 90;
const HOSTED_RUNNERS = Object.freeze({ 'ubuntu-latest': 'Linux', 'macos-15': 'macOS', 'windows-latest': 'Windows' });
const BROWSER_RUNNER = 'ubuntu-latest';
const NATIVE_PLATFORMS = Object.freeze({ 'ubuntu-latest': 'linux-x64', 'macos-15': 'darwin-arm64', 'windows-latest': 'win32-x64' });

// The exact installed-consumer case sets that apply to the current candidate,
// keyed by runtime. The minimum runtime also carries the distinct GraphIR
// migration case; the published 0.2.8 cases belong to the baseline consumer.
// Windows installs the JavaScript packages once on the release runtime; its
// native grammar has the dedicated native installation. The installed renderer
// boundary, including Chromium and strict CSP, runs once on the release runtime.
const CURRENT_CONSUMER_CASES = Object.freeze([
  'language', 'render', 'library-docs-render', 'viz', 'mcp-server', 'tree-sitter-coral', 'browser',
]);
const CONSUMER_CASES = Object.freeze({
  [RELEASE_NODE]: Object.freeze([...CURRENT_CONSUMER_CASES, 'installed-renderer']),
  [MINIMUM_NODE]: Object.freeze([...CURRENT_CONSUMER_CASES, 'viz-graphir-migration']),
});
const WINDOWS_CONSUMER_CASES = Object.freeze([
  'language', 'render', 'library-docs-render', 'viz', 'viz-graphir-migration', 'mcp-server', 'browser',
]);
const REACT_LINES = Object.freeze(['18', '19']);
// Consumer cases that drive the installed browser package in Chromium.
const CHROMIUM_CONSUMER_CASES = Object.freeze(['installed-renderer']);

const TOP_KEYS = new Set(['name', 'run-name', 'on', 'permissions', 'concurrency', 'jobs']);
const JOB_KEYS = new Set(['name', 'needs', 'if', 'permissions', 'runs-on', 'timeout-minutes', 'outputs', 'steps', 'strategy', 'environment']);
const STEP_KEYS = new Set(['name', 'id', 'uses', 'with', 'run', 'env', 'working-directory', 'if']);
// One command and its arguments: no operators, quotes, redirection, or substitution.
export const SIMPLE_COMMAND = /^[A-Za-z0-9_./@:=+,-]+(?: [A-Za-z0-9_./@:=+,-]+)*$/;
// Defence in depth for variables that change how Node, npm, or the shell run.
export const FORBIDDEN_ENVIRONMENT = /^(?:NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|SHELLOPTS|BASHOPTS|PATH|LD_PRELOAD|LD_LIBRARY_PATH|npm_config_\w+)$/i;

// Reviewed multi-command scripts. Any other run step must be one simple
// command, so `|| true`, `set +e`, backgrounding or a wrapping `if` cannot
// neutralize a gate. Editing one of these scripts is a reviewed policy change.
const REVIEWED_SCRIPTS = Object.freeze({
  'ci.yml': [
    `args=()
if [[ "$FINAL_CANDIDATE" == "true" ]]; then args+=(--final-candidate); fi
# A manual run, new branch or base outside this history cannot be classified; run everything.
if [[ "$EVENT_NAME" == "workflow_dispatch" || -z "$BASE_SHA" || "$BASE_SHA" =~ ^0+$ ]] || ! git cat-file -e "\${BASE_SHA}^{commit}"; then
  node scripts/ci-path-tier.mjs --unknown-base "\${args[@]}" >> "$GITHUB_OUTPUT"
else
  git diff --name-only "$BASE_SHA" "$HEAD_SHA" | node scripts/ci-path-tier.mjs --stdin "\${args[@]}" >> "$GITHUB_OUTPUT"
fi
`,
    '"$GITLEAKS_BIN" detect --no-git --redact --config .gitleaks.toml --source .',
  ],
  'publish.yml': [
    'node scripts/release-final-candidate.mjs candidate-proof/final-candidate-proof.json candidate-artifacts/candidate-manifest.json\nnode scripts/candidate-artifacts.mjs verify candidate-artifacts\n',
  ],
  'release.yml': [
    'node scripts/release-guard.mjs\nnode scripts/release-final-candidate.mjs candidate-proof/final-candidate-proof.json candidate-artifacts/candidate-manifest.json\nnode scripts/candidate-artifacts.mjs verify candidate-artifacts\nnode scripts/release-registry.mjs verify\nnode scripts/github-release-guard.mjs\n',
    'echo "candidate-manifest-sha256=$(sha256sum candidate-artifacts/candidate-manifest.json | cut -d \' \' -f 1)" >> "$GITHUB_OUTPUT"\necho "preflight-sha256=$(sha256sum github-release-preflight.json | cut -d \' \' -f 1)" >> "$GITHUB_OUTPUT"\n',
    "node -e \"const fs=require('node:fs');fs.writeFileSync('release-evidence.json', JSON.stringify({version:process.env.RELEASE_VERSION,productSha:process.env.RELEASE_COMMIT, candidateManifestSha256:process.env.CANDIDATE_MANIFEST_SHA256, preflightSha256:process.env.PREFLIGHT_SHA256},null,2)+'\\n')\"",
    `git fetch origin "refs/tags/v\${RELEASE_VERSION}:refs/tags/v\${RELEASE_VERSION}" || true
if git show-ref --verify --quiet "refs/tags/v\${RELEASE_VERSION}"; then
  test "$(git cat-file -t "refs/tags/v\${RELEASE_VERSION}")" = tag
  test "$(git rev-list -n 1 "refs/tags/v\${RELEASE_VERSION}")" = "\${RELEASE_COMMIT}"
else
  git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" tag --annotate "v\${RELEASE_VERSION}" "\${RELEASE_COMMIT}" --message "Coral \${RELEASE_VERSION}"
  git push origin "refs/tags/v\${RELEASE_VERSION}"
fi
node scripts/release-notes.mjs "\${RELEASE_VERSION}" > release-notes.md
if gh release view "v\${RELEASE_VERSION}" >/dev/null 2>&1; then
  gh release download "v\${RELEASE_VERSION}" --pattern release-evidence.json --output existing-release-evidence.json
  cmp release-evidence.json existing-release-evidence.json
  if [ "$(gh release view "v\${RELEASE_VERSION}" --json isDraft --jq .isDraft)" = true ]; then
    gh release edit "v\${RELEASE_VERSION}" --verify-tag --title "Coral \${RELEASE_VERSION}" --notes-file release-notes.md --draft=false
  fi
else
  gh release create "v\${RELEASE_VERSION}" release-evidence.json --verify-tag --target "\${RELEASE_COMMIT}" --title "Coral \${RELEASE_VERSION}" --notes-file release-notes.md
fi
test "$(gh api "repos/coreyt/coral/releases/tags/v\${RELEASE_VERSION}" --jq .immutable)" = true
`,
  ],
  'pages.yml': [],
  'pages-restore.yml': [
    "node -e \"const fs=require('node:fs');const c=require('node:crypto'); const d=c.createHash('sha256').update(fs.readFileSync('relayed-pages/artifact.tar')).digest('hex'); if(d!==process.env.EXPECTED_SHA256)throw new Error('Relayed Pages payload digest mismatch');\"",
  ],
});

// Per-workflow trigger, privilege and step-condition boundaries.
const WORKFLOW_CONTRACTS = Object.freeze({
  'ci.yml': {
    triggers: ['push', 'pull_request', 'workflow_dispatch'],
    permissions: { contents: 'read' },
    jobPermissions: { contents: ['read'], actions: ['read'] },
    stepConditions: [{ condition: '${{ inputs.final_candidate == true }}', uses: true }],
  },
  'publish.yml': {
    triggers: ['workflow_dispatch'],
    permissions: {},
    jobPermissions: { contents: ['read'], actions: ['read'], 'id-token': ['write'] },
    stepConditions: [{ condition: /^\$\{\{ fromJSON\(steps\.registry\.outputs\.start-index\) <= [0-5] \}\}$/, publish: true }],
  },
  'release.yml': {
    triggers: ['workflow_dispatch'],
    permissions: {},
    jobPermissions: { contents: ['read', 'write'], actions: ['read'], deployments: ['read'] },
  },
  'pages.yml': {
    triggers: ['workflow_dispatch', 'workflow_call'],
    permissions: { contents: 'read' },
    jobPermissions: { contents: ['read'], actions: ['read'], pages: ['write'], 'id-token': ['write'] },
  },
  'pages-restore.yml': {
    triggers: ['workflow_dispatch'],
    permissions: {},
    jobPermissions: { contents: ['read'], actions: ['read'], pages: ['write'], 'id-token': ['write'] },
  },
});

export const parseWorkflow = text => JSON.parse(JSON.stringify(parseDocument(text, { uniqueKeys: true }).toJS()));

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const sameEntries = (left, right) => JSON.stringify(Object.entries(left ?? {}).map(([k, v]) => [k, String(v)]).sort())
  === JSON.stringify(Object.entries(right ?? {}).map(([k, v]) => [k, String(v)]).sort());
const stepsOf = job => (Array.isArray(job?.steps) ? job.steps : []);
const needsOf = job => (job?.needs === undefined ? [] : [job.needs].flat().map(String));
const labelOf = step => String(step?.name ?? step?.run ?? step?.uses ?? step?.id).split('\n')[0];
const usesAction = (step, action) => typeof step?.uses === 'string' && step.uses.startsWith(`${action}@`);
const stripExpression = value => String(value ?? '').trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
const runText = step => (typeof step?.run === 'string' ? step.run.trim() : '');

// Every `uses:` value names a full SHA and carries an exact version label in
// its trailing comment, read from the YAML node and its source range so the
// check does not depend on quoting or indentation.
export function validateWorkflowText(path, text) {
  const errors = [];
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter, prettyErrors: false });
  visit(document, {
    Pair(_, pair) {
      if (!isScalar(pair.key) || pair.key.value !== 'uses') return;
      const value = pair.value;
      const line = value?.range ? lineCounter.linePos(value.range[0]).line : '?';
      if (!isScalar(value) || typeof value.value !== 'string') {
        errors.push(`${path}:${line}: Action reference must be a full SHA.`);
        return;
      }
      if (value.value.startsWith('./')) return;
      const reference = value.value.includes('@') ? value.value.slice(value.value.lastIndexOf('@') + 1) : '';
      const trailing = text.slice(value.range[1]).split(/\r?\n/, 1)[0];
      const label = value.comment?.trim() ?? trailing.match(/^[\s,}\]]*#\s*(\S+)\s*$/)?.[1];
      if (!/^[0-9a-f]{40}$/.test(reference)) errors.push(`${path}:${line}: Action reference must be a full SHA.`);
      if (!/^v\d+\.\d+\.\d+$/.test(label ?? '')) errors.push(`${path}:${line}: Action SHA needs an exact version comment.`);
      const approved = APPROVED_ACTIONS.get(value.value);
      if (approved && label !== approved) errors.push(`${path}:${line}: ${value.value} must be labelled ${approved}.`);
    },
  });
  return errors;
}

// npm and npx accept any configuration key as a flag (for example
// `--script-shell=true`, which skips the script). Only these reviewed flags may
// precede a script's own `--` arguments.
const ALLOWED_NPM_FLAGS = new Set(['--global', '--audit-level=high', '--workspace', '--dry-run', '--pack-destination', '--access']);
// CRO100-8: the OIDC-bearing publish job installs without lifecycle scripts;
// the flag is reviewed for exactly `npm ci`.
const ALLOWED_NPM_COMMAND_FLAGS = new Map([['ci', new Set(['--ignore-scripts'])]]);
export function npmFlagErrors(run) {
  const errors = [];
  for (const line of String(run).split('\n')) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    tokens.forEach((token, index) => {
      if (/^--script-shell\b/.test(token)) errors.push(`passes npm configuration flag ${token}`);
      if (token !== 'npm' && token !== 'npx') return;
      const commandFlags = token === 'npm' ? ALLOWED_NPM_COMMAND_FLAGS.get(tokens[index + 1]) : undefined;
      for (const argument of tokens.slice(index + 1)) {
        if (argument === '--' || ['&&', '||', '|', ';'].includes(argument)) break;
        if (token === 'npx' && !argument.startsWith('-')) break;
        if (argument.startsWith('-') && !ALLOWED_NPM_FLAGS.has(argument) && !commandFlags?.has(argument)
            && !/^--script-shell\b/.test(argument)) {
          errors.push(`passes npm configuration flag ${argument}`);
        }
      }
    });
  }
  return errors;
}

// Expressions may read only trusted contexts: no pull request titles, branch
// names, commit messages, arbitrary secrets or repository variables.
const TRUSTED_CONTEXT = [
  /^github\.(?:sha|event_name|run_id|run_attempt|repository|workflow|ref|job)$/,
  /^github\.event\.(?:before|repository\.private|pull_request\.(?:base\.sha|number))$/,
  /^secrets\.GITHUB_TOKEN$/, /^runner\.(?:temp|os)$/, /^job\.workflow_ref$/,
  /^inputs\.[\w-]+$/, /^matrix\.[\w-]+$/, /^needs(?:\.[\w-]+(?:\.(?:result|outputs\.[\w-]+))?)?$/,
  /^steps\.[\w-]+\.(?:outcome|conclusion|outputs\.[\w-]+)$/,
];
export function contextErrors(text) {
  const errors = [];
  for (const [, expression] of String(text).matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    const code = expression.replace(/'(?:[^']|'')*'/g, "''");
    for (const [reference] of code.matchAll(/\b(?:github|secrets|runner|job|env|vars|inputs|matrix|needs|steps|strategy)\b(?:\.[\w-]+|\[[^\]]*\])*/g)) {
      if (!TRUSTED_CONTEXT.some(pattern => pattern.test(reference))) errors.push(`reads untrusted or unreviewed context ${reference}`);
    }
  }
  return [...new Set(errors)];
}

// Static matrix cells. Only literal include lists or literal axes are accepted,
// so a dynamic matrix cannot silently drop a required cell.
function matrixCells(job) {
  const matrix = job?.strategy?.matrix;
  if (matrix === undefined) return { cells: [{}] };
  if (!isObject(matrix) || 'exclude' in matrix) return { error: 'matrix must be a static include list or static axes' };
  const literal = value => ['string', 'number', 'boolean'].includes(typeof value) && !String(value).includes('${{');
  if ('include' in matrix) {
    if (Object.keys(matrix).length !== 1 || !Array.isArray(matrix.include) || matrix.include.length === 0
        || matrix.include.some(cell => !isObject(cell) || !Object.values(cell).every(literal))) {
      return { error: 'matrix must be a static include list or static axes' };
    }
    return { cells: matrix.include.map(cell => Object.fromEntries(Object.entries(cell).map(([k, v]) => [k, String(v)]))) };
  }
  let cells = [{}];
  for (const [key, values] of Object.entries(matrix)) {
    if (!Array.isArray(values) || values.length === 0 || !values.every(literal)) {
      return { error: 'matrix must be a static include list or static axes' };
    }
    cells = cells.flatMap(cell => values.map(value => ({ ...cell, [key]: String(value) })));
  }
  return { cells };
}
const resolveMatrix = (value, cell) => (typeof value === 'string'
  ? value.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g, (match, key) => cell[key] ?? match) : value);
const runnerLabel = (job, cell) => [resolveMatrix(job?.['runs-on'], cell)].flat().map(value => resolveMatrix(String(value), cell)).join(',');
const runnerOs = label => HOSTED_RUNNERS[label] ?? (label === BROWSER_RUNNER ? 'Linux' : undefined);

// A selector condition chooses steps by platform or matrix cell. It evaluates
// statically; any other condition must be one the workflow contract permits.
function selector(condition, cell, label) {
  const code = stripExpression(condition);
  const os = code.match(/^runner\.os == '(Linux|macOS|Windows)'$/);
  if (os) return runnerOs(label) === os[1];
  const matrix = code.match(/^matrix\.([\w-]+) == '([^']*)'$/);
  if (matrix) return cell[matrix[1]] === matrix[2];
  return undefined;
}

// The executions of each job: its matrix cells and, per cell, the steps that
// run with matrix references resolved.
export function workflowExecutions(root) {
  const executions = [];
  for (const [job, value] of Object.entries(isObject(root?.jobs) ? root.jobs : {})) {
    const { cells = [] } = matrixCells(value);
    for (const cell of cells) {
      const label = runnerLabel(value, cell);
      const steps = stepsOf(value).map((step, index) => ({
        index, step, run: runText(step), uses: step?.uses,
        env: Object.fromEntries(Object.entries(isObject(step?.env) ? step.env : {}).map(([k, v]) => [k, resolveMatrix(String(v), cell)])),
        with: Object.fromEntries(Object.entries(isObject(step?.with) ? step.with : {}).map(([k, v]) => [k, resolveMatrix(String(v), cell)])),
        selected: step?.if === undefined ? true : selector(step.if, cell, label),
      })).filter(step => step.selected !== false);
      const node = steps.find(step => usesAction(step.step, 'actions/setup-node'))?.with['node-version'];
      executions.push({ job, cell, label, node, steps, name: resolveMatrix(String(value?.name ?? job), cell) });
    }
  }
  return executions;
}

// TRO100-8/-15/-16/-20: the structure every workflow must have before its
// meaning is checked. The strictly parsed keys are checked however they are
// written: parse errors, duplicate keys, aliases, shells, defaults, error
// tolerance, unknown keys, unreviewed Actions, forbidden environment, npm
// configuration flags and untrusted contexts are refused.
export function validateWorkflowContract(workflow, text) {
  const contract = WORKFLOW_CONTRACTS[workflow];
  if (!contract) return [`${workflow}: no workflow contract`];
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length) {
    return [`${workflow}: YAML does not parse cleanly: ${[...document.errors, ...document.warnings][0].message}`];
  }
  const errors = [];
  let aliased = false;
  visit(document, { Alias() { aliased = true; return visit.BREAK; } });
  if (aliased) errors.push(`${workflow}: YAML aliases are not permitted`);
  const root = document.toJS();
  if (!isObject(root)) return [`${workflow}: workflow is not a mapping`];
  for (const key of Object.keys(root)) {
    if (key === 'defaults') errors.push(`${workflow}: workflow defaults are not permitted`);
    else if (!TOP_KEYS.has(key)) errors.push(`${workflow}: unsupported top-level key ${key}`);
  }
  const triggers = isObject(root.on) ? Object.keys(root.on) : [];
  for (const trigger of triggers) {
    if (trigger === 'workflow_call' && !contract.triggers.includes(trigger)) errors.push(`${workflow}: a workflow_call trigger is not permitted`);
    else if (!contract.triggers.includes(trigger)) errors.push(`${workflow}: trigger ${trigger} is not permitted`);
  }
  if (!sameKeys(triggers, contract.triggers)) errors.push(`${workflow}: triggers must be exactly ${contract.triggers.join(', ')}`);
  if (!sameEntries(root.permissions, contract.permissions) || !isObject(root.permissions)) {
    errors.push(`${workflow}: workflow permissions must be exactly ${JSON.stringify(contract.permissions)}`);
  }
  errors.push(...contextErrors(text).map(error => `${workflow}: ${error}`));
  const jobs = isObject(root.jobs) ? root.jobs : {};
  if (Object.keys(jobs).length === 0) errors.push(`${workflow}: no jobs`);
  const reviewed = new Set(REVIEWED_SCRIPTS[workflow] ?? []);
  for (const [name, job] of Object.entries(jobs)) {
    const at = `${workflow}: job ${name}`;
    for (const key of Object.keys(job ?? {})) {
      if (key === 'continue-on-error') errors.push(`${at} must not continue on error`);
      else if (key === 'defaults') errors.push(`${at} must not set defaults`);
      else if (!JOB_KEYS.has(key)) errors.push(`${at} uses unsupported key ${key}`);
    }
    for (const need of needsOf(job)) if (!(need in jobs)) errors.push(`${at} needs unknown job ${need}`);
    if (job?.permissions !== undefined) {
      if (!isObject(job.permissions)) errors.push(`${at} permissions must be an explicit mapping`);
      for (const [scope, level] of Object.entries(isObject(job.permissions) ? job.permissions : {})) {
        if (!contract.jobPermissions[scope]?.includes(level)) errors.push(`${at} must not request ${scope}: ${level}`);
      }
    }
    const timeout = job?.['timeout-minutes'];
    if (timeout !== undefined && !(Number.isInteger(timeout) && timeout > 0 && timeout <= 360)) {
      errors.push(`${at} timeout-minutes must be a whole number of minutes from 1 to 360`);
    }
    const { cells, error: matrixError } = matrixCells(job);
    if (matrixError) errors.push(`${at} ${matrixError}`);
    else if (job?.strategy !== undefined && job.strategy['fail-fast'] !== false) {
      errors.push(`${at} matrix must set fail-fast: false so one failed cell cannot cancel the others`);
    }
    for (const cell of cells ?? []) {
      const label = runnerLabel(job, cell);
      if (!(label in HOSTED_RUNNERS) && !(workflow === 'ci.yml' && label === BROWSER_RUNNER)) {
        errors.push(`${at} runs on unreviewed runner ${label}`);
      }
    }
    const steps = stepsOf(job);
    if (steps.length === 0) errors.push(`${at} has no steps`);
    for (const step of steps) {
      const stepAt = `${at} step "${labelOf(step)}"`;
      for (const key of Object.keys(step ?? {})) {
        if (key === 'shell') errors.push(`${stepAt} must not set a shell`);
        else if (key === 'continue-on-error') errors.push(`${stepAt} must not continue on error`);
        else if (!STEP_KEYS.has(key)) errors.push(`${stepAt} uses unsupported key ${key}`);
      }
      if ((step?.uses === undefined) === (step?.run === undefined)) errors.push(`${stepAt} must have exactly one of uses or run`);
      for (const variable of Object.keys(isObject(step?.env) ? step.env : {})) {
        if (FORBIDDEN_ENVIRONMENT.test(variable)) errors.push(`${stepAt} sets forbidden environment variable ${variable}`);
      }
      if (step?.uses !== undefined && !APPROVED_ACTIONS.has(step.uses)) {
        errors.push(`${stepAt} uses an action outside the approved inventory`);
      }
      if (step?.run !== undefined) {
        if (typeof step.run !== 'string') errors.push(`${stepAt} run must be text`);
        else {
          errors.push(...npmFlagErrors(step.run).map(error => `${stepAt} ${error}`));
          if (step.run.includes('${{')) errors.push(`${stepAt} must pass expressions through env, not interpolate them into run`);
          else if (!reviewed.has(step.run) && !SIMPLE_COMMAND.test(step.run.replace(/\n$/, ''))) {
            errors.push(`${stepAt} run is neither a reviewed script nor one simple command`);
          }
        }
      }
      if (step?.if !== undefined) {
        const selects = (cells ?? []).map(cell => selector(step.if, cell, runnerLabel(job, cell)));
        const permitted = (contract.stepConditions ?? []).some(entry =>
          (typeof entry.condition === 'string' ? entry.condition === step.if : entry.condition.test(String(step.if)))
          && (!entry.uses || (typeof step.uses === 'string' && step.run === undefined))
          && (!entry.publish || /^npm publish /.test(runText(step))));
        if (selects.some(value => value === undefined) ? !permitted : !selects.includes(true)) {
          errors.push(`${stepAt} must not be conditional`);
        }
      }
    }
  }
  // Every job that installs dependencies first pins npm and checks the toolchain
  // for its runtime, in every cell.
  for (const execution of workflowExecutions(root)) {
    const runs = execution.steps.map(step => step.run);
    const install = runs.findIndex(run => /^npm ci\b/.test(run));
    if (install < 0) continue;
    const at = `${workflow}: job ${execution.name}`;
    const check = execution.node === MINIMUM_NODE ? 'npm run check:minimum-runtime' : 'npm run check:toolchain';
    if (![RELEASE_NODE, MINIMUM_NODE].includes(execution.node)) errors.push(`${at} must set up Node ${RELEASE_NODE} or ${MINIMUM_NODE}`);
    const pin = runs.indexOf(`npm install --global npm@${NPM_VERSION}`);
    const verified = runs.indexOf(check);
    if (pin < 0 || verified < 0 || pin > verified || verified > install) {
      errors.push(`${at} must install npm ${NPM_VERSION} and run ${check} before npm ci`);
    }
  }
  return errors;
}

// The jobs reachable through `needs`, excluding the job itself.
function ancestry(jobs) {
  const memo = new Map();
  const visitJob = (name, trail = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (trail.has(name)) return new Set();
    trail.add(name);
    const result = new Set();
    for (const need of needsOf(jobs[name])) {
      result.add(need);
      for (const value of visitJob(need, trail)) result.add(value);
    }
    memo.set(name, result);
    return result;
  };
  return name => visitJob(name);
}

const artifactStep = (step, action, name) => usesAction(step, action) && step.with?.name === name;
const needsOutput = (job, output) => `\${{ needs.${job}.outputs.${output} }}`;
const candidateVerify = 'node scripts/candidate-artifacts.mjs verify candidate-artifacts';

// DRO100-5: every job that receives the frozen Node 26 candidate packages
// verifies their manifest against this exact commit and active version before
// using them, and never rebuilds or repacks workspace packages.
export function validateCandidateArtifactConsumers(ci, { version = RENDERER_CANDIDATE.version } = {}) {
  let root;
  try { root = parseWorkflow(ci); } catch { return ['ci.yml: cannot be parsed for retained candidate consumers']; }
  const errors = [];
  const jobs = isObject(root?.jobs) ? root.jobs : {};
  const producers = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => artifactStep(step, 'actions/upload-artifact', PACKAGE_ARTIFACT)));
  if (producers.length !== 1) return [`ci.yml: exactly one job must produce the retained candidate ${PACKAGE_ARTIFACT}`];
  const [producer] = producers;
  const pack = stepsOf(jobs[producer]).find(step => runText(step) === 'npm run ci:packages');
  if (pack?.env?.RELEASE_VERSION !== version || pack?.env?.RELEASE_COMMIT !== '${{ github.sha }}') {
    errors.push(`ci.yml: ${producer} must bind the active candidate version ${version} and exact commit when packing`);
  }
  for (const [name, job] of Object.entries(jobs)) {
    const steps = stepsOf(job);
    const downloads = steps.map((step, index) => [step, index]).filter(([step]) => artifactStep(step, 'actions/download-artifact', PACKAGE_ARTIFACT));
    const usesDirectory = steps.some(step => isObject(step?.env) && 'CORAL_ARTIFACT_DIR' in step.env);
    if (downloads.length === 0) {
      if (usesDirectory && name !== producer) errors.push(`ci.yml: ${name} reads candidate artifacts it never downloads`);
      continue;
    }
    if (name === AGGREGATE_JOB) {
      if (downloads.some(([step]) => step.with.path !== 'candidate-artifacts' || step.with['run-id'] !== undefined)) {
        errors.push(`ci.yml: ${name} must read this run's retained candidate tarballs`);
      }
      continue;
    }
    if (!needsOf(job).includes(producer)) errors.push(`ci.yml: ${name} must need the retained candidate producer ${producer}`);
    if (downloads.length !== 1 || downloads[0][0].with.path !== 'candidate-artifacts'
        || downloads[0][0].with['run-id'] !== undefined || downloads[0][0].with['github-token'] !== undefined) {
      errors.push(`ci.yml: ${name} must download this run's retained candidate tarballs once into candidate-artifacts`);
    }
    const after = steps.slice(downloads[0][1] + 1);
    const firstRun = after.findIndex(step => step.run !== undefined);
    const verify = after[firstRun];
    if (runText(verify) !== candidateVerify || verify?.if !== undefined) {
      errors.push(`ci.yml: ${name} must consume the retained candidate tarballs only after ${candidateVerify}`);
    } else if (verify.env?.RELEASE_VERSION !== version || verify.env?.RELEASE_COMMIT !== '${{ github.sha }}') {
      errors.push(`ci.yml: ${name} must verify the retained candidate against the active candidate version ${version} and exact commit`);
    }
    for (const step of steps) {
      if (/npm pack\b|npm run (?:build|ci:packages)\b/.test(runText(step))) {
        errors.push(`ci.yml: ${name} must not rebuild or repack workspace packages`);
      }
      if (isObject(step?.env) && 'CORAL_ARTIFACT_DIR' in step.env && step.env.CORAL_ARTIFACT_DIR !== 'candidate-artifacts') {
        errors.push(`ci.yml: ${name} must point CORAL_ARTIFACT_DIR at the retained candidate-artifacts`);
      }
    }
  }
  const aggregate = stepsOf(jobs[AGGREGATE_JOB]).find(step => runText(step) === 'node scripts/ci-final-candidate.mjs');
  if (aggregate?.env?.RELEASE_VERSION !== version) errors.push(`ci.yml: ${AGGREGATE_JOB} must bind the active candidate version ${version}`);
  return errors;
}

// The current CI obligations. Each executes exactly once per required cell.
// Phases order the graph: quick and producer checks, then early package,
// platform and browser risks, then the long product suites, then the proof.
const CI_OBLIGATIONS = Object.freeze([
  { id: 'source checks', run: 'npm run ci:source', phase: 'quick', always: true, runner: 'ubuntu-latest' },
  { id: 'secret detection test', run: 'npm run test:gitleaks', phase: 'quick', always: true, runner: 'ubuntu-latest' },
  { id: 'secret scan', run: REVIEWED_SCRIPTS['ci.yml'][1], phase: 'quick', always: true, runner: 'ubuntu-latest' },
  { id: 'candidate packages', run: 'npm run ci:packages', phase: 'produce', runner: 'ubuntu-latest' },
  { id: 'candidate site', run: 'npm run ci:site', phase: 'produce', runner: 'ubuntu-latest', packages: true },
  { id: 'Windows risk', run: 'npm run ci:windows-risk', phase: 'early', runner: 'windows-latest' },
  { id: 'contracts', run: 'npm run ci:contracts', phase: 'early', runner: 'ubuntu-latest', packages: true },
  ...Object.entries(CONSUMER_CASES).map(([node, cases]) => ({
    id: `Node ${node} consumers`, run: 'npm run smoke:consumer', phase: 'early', runner: 'ubuntu-latest', node,
    packages: true, cases,
  })),
  { id: 'Windows installed consumers', run: 'npm run smoke:consumer', phase: 'early', runner: 'windows-latest',
    platform: 'win32-x64', packages: true, cases: WINDOWS_CONSUMER_CASES },
  ...REACT_LINES.map(line => ({
    id: `React ${line} consumer`, run: 'npm run smoke:consumer', phase: 'early', runner: 'ubuntu-latest', node: MINIMUM_NODE,
    packages: true, cases: [`viz-react-${line}`],
  })),
  { id: 'published baseline consumers', run: 'npm run smoke:api-compat-consumers', phase: 'early', runner: 'ubuntu-latest', node: MINIMUM_NODE, packages: true },
  ...Object.entries(NATIVE_PLATFORMS).flatMap(([runner, platform]) => [
    { id: `native ${platform} build`, run: 'npm run ci:native', phase: 'early', runner, packages: true },
    { id: `native ${platform} install`, run: 'npm run smoke:native', phase: 'early', runner, platform, packages: true },
  ]),
  { id: 'browser smoke', run: 'npm run test:e2e', phase: 'early', runner: BROWSER_RUNNER, e2e: 'smoke', packages: true, site: true },
  { id: 'unit suites', run: 'npm run ci:unit', phase: 'late', runner: 'ubuntu-latest', packages: true },
  { id: 'Windows product suites', run: 'npm run ci:windows-unit', phase: 'late', runner: 'windows-latest', packages: true },
  { id: 'complete browser correctness', run: 'npm run test:e2e', phase: 'late', runner: BROWSER_RUNNER, e2e: 'full', packages: true, site: true },
  { id: 'online delivery', run: 'npm run ci:delivery', phase: 'late', runner: 'ubuntu-latest', packages: true, site: true },
]);
const PHASES = ['quick', 'produce', 'early', 'late'];
const SITE_RESTORE = new Set(['npm run ci:browser-prepare', 'npm run ci:restore-site', 'npm run ci:delivery']);

const consumerCases = step => String(step.env.CORAL_CONSUMER_CASES ?? '').split(',').map(value => value.trim()).filter(Boolean);

function matchesObligation(obligation, execution, step) {
  if (step.run !== obligation.run || execution.label !== obligation.runner) return false;
  if ((obligation.node ?? RELEASE_NODE) !== execution.node) return false;
  if (obligation.platform && step.env.CORAL_EXPECT_PLATFORM !== obligation.platform) return false;
  if (obligation.e2e && step.env.CORAL_E2E_PHASE !== obligation.e2e) return false;
  // Case sets are exact: a missing case is an omitted obligation and an extra
  // case is one that does not apply to this generation.
  if (obligation.cases && !sameKeys(consumerCases(step), obligation.cases)) return false;
  return true;
}

export function validateCiWorkflow(ci, { policy, closedJobs = CLOSED_JOBS, version = RENDERER_CANDIDATE.version } = {}) {
  let root;
  try { root = parseWorkflow(ci); } catch { return ['ci.yml: cannot be parsed for the CI graph']; }
  const errors = [];
  const jobs = isObject(root?.jobs) ? root.jobs : {};
  const names = Object.keys(jobs);
  const aggregate = AGGREGATE_JOB;
  if (!sameKeys(names, [...closedJobs, aggregate])) {
    errors.push(`ci.yml: jobs must be exactly the proof inventory ${[...closedJobs, aggregate].join(', ')}`);
  }
  const fullMatrix = "needs.classify.outputs.full-matrix == 'true'";
  const ungated = names.filter(name => name !== aggregate && jobs[name]?.if === undefined);
  if (!sameKeys(ungated, ALWAYS_JOBS)) errors.push(`ci.yml: only ${ALWAYS_JOBS.join(', ')} may run on every event`);
  for (const name of names.filter(value => value !== aggregate && !ALWAYS_JOBS.includes(value))) {
    if (stripExpression(jobs[name]?.if) !== fullMatrix || !needsOf(jobs[name]).includes('classify')) {
      errors.push(`ci.yml: job ${name} condition must be ${fullMatrix} after classify`);
    }
  }
  for (const name of ALWAYS_JOBS) if (jobs[name]?.if !== undefined) errors.push(`ci.yml: job ${name} must not be conditional`);
  for (const [name, job] of Object.entries(jobs)) {
    if (job?.['timeout-minutes'] === undefined) errors.push(`ci.yml: job ${name} must declare timeout-minutes`);
    for (const step of stepsOf(job)) {
      if (usesAction(step, 'actions/setup-node') && (step.with?.['package-manager-cache'] !== false || 'cache' in (step.with ?? {}))) {
        errors.push(`ci.yml: job ${name} must not use a remote npm cache (package-manager-cache: false)`);
      }
      const run = runText(step);
      if (/perf|bench/i.test(run) || Object.entries(step?.env ?? {}).some(([key, value]) => /perf|bench/i.test(`${key}=${value}`))) {
        errors.push(`ci.yml: job ${name} must not measure performance on shared CI runners`);
      }
      if (/(?:^|\s)--(?:retries|workers|repeat-each|shard|grep|grep-invert|last-failed|pass-with-no-tests)\b/.test(run)
          || /playwright test|npm run test:e2e(?!$)|npm run test:e2e:|npm (?:run )?test(?::coverage)?(?:\s|$)/.test(run)) {
        errors.push(`ci.yml: job ${name} step "${labelOf(step)}" must use the canonical zero-retry browser and suite commands`);
      }
      if (usesAction(step, 'actions/upload-artifact')
          && !['node-26-candidate-packages', 'candidate-site', 'final-candidate-proof'].includes(step.with?.name)) {
        errors.push(`ci.yml: job ${name} uploads ${step.with?.name ?? 'an unnamed artifact'}; only the frozen packages, site and proof are retained`);
      }
      if (usesAction(step, 'actions/upload-artifact') && (step.with?.['if-no-files-found'] !== 'error' || step.with?.['retention-days'] !== RETENTION_DAYS)) {
        errors.push(`ci.yml: ${step.with?.name} must fail when missing and be retained for ${RETENTION_DAYS} days`);
      }
      // An authorized failed-job retry on the same SHA replaces its own partial
      // upload; the proof binds the replacement by producer outputs and order.
      if (usesAction(step, 'actions/upload-artifact') && step.with?.overwrite !== true) {
        errors.push(`ci.yml: ${step.with?.name} must overwrite a same-name artifact from an earlier attempt`);
      }
    }
  }
  const concurrency = root?.concurrency;
  if (concurrency !== undefined) {
    const cancel = concurrency?.['cancel-in-progress'];
    if (!isObject(concurrency) || !(cancel === false || (cancel === "${{ github.event_name == 'pull_request' }}"
        && String(concurrency.group).includes('github.run_id')))) {
      errors.push('ci.yml: concurrency may cancel only superseded pull request runs, never a push or final-candidate run');
    }
  }
  const dispatch = root?.on?.workflow_dispatch?.inputs?.final_candidate;
  if (dispatch?.type !== 'boolean' || dispatch?.default !== false) {
    errors.push('ci.yml: workflow_dispatch must offer a boolean final_candidate input defaulting to false');
  }

  // Classification: an unknown base, manual run or final candidate is never reduced.
  const classify = stepsOf(jobs.classify).find(step => runText(step).includes('scripts/ci-path-tier.mjs'));
  const tier = classify?.run ?? '';
  if (!classify?.id || !tier.includes('--unknown-base') || !tier.includes('workflow_dispatch') || !tier.includes('--final-candidate')
      || !/-z "\$BASE_SHA"/.test(tier) || tier.includes('diff-tree')
      || classify.env?.FINAL_CANDIDATE !== '${{ inputs.final_candidate || false }}'
      || jobs.classify?.outputs?.['full-matrix'] !== `\${{ steps.${classify.id}.outputs.full-matrix }}`
      || jobs.classify?.outputs?.tier !== `\${{ steps.${classify.id}.outputs.tier }}`) {
    errors.push('ci.yml: unknown-base, manual and final-candidate runs must use the full matrix.');
  }
  const reduced = policy?.ci?.pathTiers?.docsAndReleaseRecords?.requiredChecks;
  if (Array.isArray(reduced) && !sameKeys(['classify', ...reduced], ALWAYS_JOBS)) {
    errors.push('ci.yml: the jobs that run on every event must be classify and the reduced-tier required checks');
  }

  // Obligations: each current check executes exactly once per required cell.
  const executions = workflowExecutions(root);
  const hosts = new Map();
  for (const obligation of CI_OBLIGATIONS) {
    const matches = executions.flatMap(execution => execution.steps
      .filter(step => matchesObligation(obligation, execution, step)).map(step => ({ execution, step })));
    if (matches.length !== 1) {
      errors.push(`ci.yml: ${obligation.id} (${obligation.run.split('\n')[0]}) must run exactly once on ${obligation.runner}`
        + `${obligation.node ? ` with Node ${obligation.node}` : ''}; found ${matches.length}`);
      continue;
    }
    const [{ execution, step }] = matches;
    if (step.step.if !== undefined && selector(step.step.if, execution.cell, execution.label) === undefined) {
      errors.push(`ci.yml: ${obligation.id} must not be conditional`);
    }
    hosts.set(obligation.id, { obligation, job: execution.job, step, execution });
  }
  for (const execution of executions) {
    for (const step of execution.steps) {
      if (/^npm run (?:ci:|smoke:|test:e2e)/.test(step.run) && !CI_OBLIGATIONS.some(obligation => matchesObligation(obligation, execution, step))
          && !['npm run ci:browser-prepare'].includes(step.run)) {
        errors.push(`ci.yml: job ${execution.name} runs ${step.run} outside a current obligation cell`);
      }
      for (const variable of ['CORAL_EXPECT_NODE']) {
        if (variable in step.env && step.env[variable] !== execution.node) {
          errors.push(`ci.yml: job ${execution.name} expects Node ${step.env[variable]} on Node ${execution.node}`);
        }
      }
      if (/^npm run smoke:(?:consumer|api-compat-consumers)$/.test(step.run) && execution.node !== RELEASE_NODE
          && step.env.CORAL_EXPECT_NODE !== execution.node) {
        errors.push(`ci.yml: job ${execution.name} must set CORAL_EXPECT_NODE for its runtime`);
      }
      if (step.run === 'npm run smoke:native') {
        if (step.env.CORAL_EXPECT_PLATFORM !== NATIVE_PLATFORMS[execution.label]) {
          errors.push(`ci.yml: job ${execution.name} must expect ${NATIVE_PLATFORMS[execution.label] ?? 'a native platform'} on ${execution.label}`);
        }
      }
    }
  }
  for (const { obligation, execution, step } of hosts.values()) {
    if (obligation.cases?.some(name => CHROMIUM_CONSUMER_CASES.includes(name))
        && !execution.steps.some(value => /^npx playwright install(?: --with-deps)? chromium$/.test(value.run) && value.index < step.index)) {
      errors.push(`ci.yml: ${obligation.id} must install Chromium earlier in its cell for its installed browser checks`);
    }
  }
  const nativePlatforms = [...hosts.values()].filter(host => host.obligation.run === 'npm run smoke:native').map(host => host.obligation.platform);
  if (new Set(nativePlatforms).size !== Object.keys(NATIVE_PLATFORMS).length) {
    errors.push('ci.yml: native-smoke must cover linux-x64, darwin-arm64 and win32-x64');
  }
  for (const [job, cells] of Object.entries(MATRIX_CELLS)) {
    const display = executions.filter(execution => execution.job === job).map(execution => execution.name);
    if (!sameKeys(display, cells)) errors.push(`ci.yml: ${job} cells must be exactly ${cells.join(', ')}`);
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (job?.strategy !== undefined && !(name in MATRIX_CELLS)) errors.push(`ci.yml: matrix job ${name} has no proof-bound cell names`);
  }
  // The secret scan and its detection test use the pinned binary just installed;
  // the test cannot skip for want of a scanner.
  const scanner = executions.find(execution => hosts.get('secret scan')?.job === execution.job);
  if (scanner) {
    const install = scanner.steps.find(step => /^go install github\.com\/zricethezav\/gitleaks\/v8@v\d+\.\d+\.\d+$/.test(step.run));
    const binary = install?.env.GOBIN ? `${install.env.GOBIN}/gitleaks` : undefined;
    for (const id of ['secret detection test', 'secret scan']) {
      const host = hosts.get(id);
      if (!binary || host?.job !== scanner.job || host.step.env.GITLEAKS_BIN !== binary || host.step.index < install.index) {
        errors.push(`ci.yml: ${id} must use the gitleaks binary installed earlier in the same job`);
      }
    }
  }

  // Order: early risks precede long work, and producers unlock their consumers.
  const ancestors = ancestry(jobs);
  const phaseOf = new Map();
  for (const { obligation, job } of hosts.values()) {
    phaseOf.set(job, Math.max(phaseOf.get(job) ?? 0, PHASES.indexOf(obligation.phase)));
    if (obligation.always && !ALWAYS_JOBS.includes(job)) errors.push(`ci.yml: ${obligation.id} must run on every event`);
  }
  // An obligation runs in a job of its own phase: an early risk check hosted in a
  // long job would run only after every early job.
  for (const { obligation, job } of hosts.values()) {
    if (PHASES.indexOf(obligation.phase) < phaseOf.get(job)) {
      errors.push(`ci.yml: ${obligation.id} must run in the ${obligation.phase} phase, not with ${PHASES[phaseOf.get(job)]} work in ${job}`);
    }
  }
  const packagesJob = hosts.get('candidate packages')?.job;
  const siteJob = hosts.get('candidate site')?.job;
  const earlier = [...phaseOf].filter(([, phase]) => phase < PHASES.indexOf('late')).map(([job]) => job);
  for (const [job, phase] of phaseOf) {
    const before = ancestors(job);
    if (phase === PHASES.indexOf('late')) {
      for (const early of earlier) if (!before.has(early)) errors.push(`ci.yml: long job ${job} must wait for early risk job ${early}`);
    } else {
      for (const other of before) {
        if (phaseOf.get(other) === PHASES.indexOf('late')) errors.push(`ci.yml: early job ${job} must not wait for long job ${other}`);
      }
    }
  }
  const windowsRisk = hosts.get('Windows risk')?.job;
  if (windowsRisk && [...ancestors(windowsRisk)].some(job => job !== 'classify')) {
    errors.push(`ci.yml: ${windowsRisk} must start immediately after classify`);
  }
  if (packagesJob && [...ancestors(packagesJob)].some(job => job !== 'classify')) {
    errors.push(`ci.yml: ${packagesJob} must start immediately after classify`);
  }
  for (const { obligation, job, step } of hosts.values()) {
    if (obligation.packages && packagesJob && !needsOf(jobs[job]).includes(packagesJob)) {
      errors.push(`ci.yml: ${obligation.id} must consume the frozen packages from ${packagesJob}`);
    }
    if (!obligation.site && siteJob && job !== siteJob && ancestors(job).has(siteJob) && phaseOf.get(job) < PHASES.indexOf('late')) {
      errors.push(`ci.yml: ${obligation.id} must not wait for the site build`);
    }
    if (obligation.site && siteJob) {
      const restore = stepsOf(jobs[job]).find(value => SITE_RESTORE.has(runText(value)));
      if (!needsOf(jobs[job]).includes(siteJob)
          || !stepsOf(jobs[job]).some(value => artifactStep(value, 'actions/download-artifact', SITE_ARTIFACT) && value.with.path === 'candidate-site' && value.with['run-id'] === undefined)
          || restore?.env?.EXPECTED_SITE_SHA256 !== needsOutput(siteJob, 'payload-sha256')
          || stepsOf(jobs[job]).indexOf(restore) > step.index) {
        errors.push(`ci.yml: ${obligation.id} must restore the frozen site from ${siteJob} by its payload digest first`);
      }
    }
  }
  for (const [name, job] of Object.entries(jobs)) {
    for (const step of stepsOf(job)) {
      if (SITE_RESTORE.has(runText(step)) && siteJob && step.env?.EXPECTED_SITE_SHA256 !== needsOutput(siteJob, 'payload-sha256')) {
        errors.push(`ci.yml: job ${name} must restore the frozen site by the ${siteJob} payload digest`);
      }
      if (artifactStep(step, 'actions/download-artifact', SITE_ARTIFACT) && siteJob && !needsOf(job).includes(siteJob)) {
        errors.push(`ci.yml: job ${name} must need the site producer ${siteJob}`);
      }
    }
  }

  // Producers publish the identities the proof binds.
  if (packagesJob) {
    const steps = stepsOf(jobs[packagesJob]);
    const pack = steps.findIndex(step => runText(step) === 'npm run ci:packages');
    const upload = steps.findIndex(step => artifactStep(step, 'actions/upload-artifact', PACKAGE_ARTIFACT));
    const id = steps[upload]?.id;
    if (upload < pack || steps[upload]?.with?.path !== 'candidate-artifacts/' || !id
        || jobs[packagesJob]?.outputs?.['artifact-id'] !== `\${{ steps.${id}.outputs.artifact-id }}`
        || jobs[packagesJob]?.outputs?.['artifact-digest'] !== `\${{ steps.${id}.outputs.artifact-digest }}`) {
      errors.push(`ci.yml: ${packagesJob} must upload the completed candidate-artifacts and output its artifact id and digest`);
    }
  }
  if (siteJob) {
    const steps = stepsOf(jobs[siteJob]);
    const build = steps.find(step => runText(step) === 'npm run ci:site');
    const upload = steps.findIndex(step => artifactStep(step, 'actions/upload-artifact', SITE_ARTIFACT));
    const outputs = jobs[siteJob]?.outputs ?? {};
    if (!build?.id || upload < steps.indexOf(build) || steps[upload]?.with?.path !== 'candidate-site/' || !steps[upload]?.id
        || ['version-sha256', 'integrity-sha256', 'payload-sha256'].some(key => outputs[key] !== `\${{ steps.${build.id}.outputs.${key} }}`)
        || outputs['site-artifact-id'] !== `\${{ steps.${steps[upload].id}.outputs.artifact-id }}`
        || outputs['site-artifact-digest'] !== `\${{ steps.${steps[upload].id}.outputs.artifact-digest }}`) {
      errors.push(`ci.yml: ${siteJob} must upload the completed candidate-site and output its payload, version, integrity and artifact identities`);
    }
  }

  // The aggregate needs every job, always runs, and binds the producer identities.
  const final = jobs[aggregate];
  if (final?.if !== '${{ always() }}' || !sameKeys(needsOf(final), names.filter(name => name !== aggregate))) {
    errors.push(`ci.yml: ${aggregate} must always run and need every other job`);
  }
  const evaluate = stepsOf(final).filter(step => runText(step) === 'node scripts/ci-final-candidate.mjs');
  const expectedEnv = {
    GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    RELEASE_VERSION: version,
    NEEDS_JSON: '${{ toJSON(needs) }}',
    FULL_MATRIX: needsOutput('classify', 'full-matrix'),
    MATRIX_TIER: needsOutput('classify', 'tier'),
    FINAL_CANDIDATE: '${{ inputs.final_candidate || false }}',
    CANDIDATE_MANIFEST: 'candidate-artifacts/candidate-manifest.json',
    CANDIDATE_ARTIFACT_ID: needsOutput(packagesJob, 'artifact-id'),
    CANDIDATE_ARTIFACT_DIGEST: needsOutput(packagesJob, 'artifact-digest'),
    CANDIDATE_SITE_ARTIFACT_ID: needsOutput(siteJob, 'site-artifact-id'),
    CANDIDATE_SITE_ARTIFACT_DIGEST: needsOutput(siteJob, 'site-artifact-digest'),
    EXPECTED_VERSION_SHA256: needsOutput(siteJob, 'version-sha256'),
    EXPECTED_INTEGRITY_SHA256: needsOutput(siteJob, 'integrity-sha256'),
    EXPECTED_SITE_SHA256: needsOutput(siteJob, 'payload-sha256'),
    FINAL_CANDIDATE_PROOF: 'final-candidate-proof.json',
  };
  if (evaluate.length !== 1 || evaluate[0].if !== undefined || !sameEntries(evaluate[0].env, expectedEnv)) {
    errors.push(`ci.yml: ${aggregate} must evaluate the closed required-job set once, unconditionally, bound to the producer outputs`);
  }
  const proof = stepsOf(final).find(step => artifactStep(step, 'actions/upload-artifact', PROOF_ARTIFACT));
  const proofDownload = stepsOf(final).find(step => artifactStep(step, 'actions/download-artifact', PACKAGE_ARTIFACT));
  if (proof?.if !== '${{ inputs.final_candidate == true }}' || proof.with.path !== 'final-candidate-proof.json'
      || proofDownload?.if !== '${{ inputs.final_candidate == true }}'
      || stepsOf(final).indexOf(proof) < stepsOf(final).indexOf(evaluate[0])) {
    errors.push(`ci.yml: ${aggregate} must download the packages and upload ${PROOF_ARTIFACT} only for a final candidate`);
  }
  if (!sameEntries(final?.permissions, { contents: 'read', actions: 'read' })) {
    errors.push(`ci.yml: ${aggregate} must read only contents and this run's job results`);
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (name !== aggregate && job?.permissions !== undefined) errors.push(`ci.yml: job ${name} must inherit read-only contents permission`);
  }
  errors.push(...validateCandidateArtifactConsumers(ci, { version }));
  return errors;
}

// The playwright configuration owns four workers and zero retries.
export function validateBrowserConfig(config) {
  const errors = [];
  if (!/^\s*workers: 4,$/m.test(config) || (config.match(/\bworkers:/g) ?? []).length !== 1) {
    errors.push('playwright.config.ts: normal browser correctness must use exactly four workers');
  }
  if (!/^\s*retries: 0,$/m.test(config) || (config.match(/\bretries:/g) ?? []).length !== 1) {
    errors.push('playwright.config.ts: normal browser correctness must use zero retries');
  }
  return errors;
}

// Every npm publish step publishes one frozen tarball in registry order, gated
// only by the registry start index. All six use OIDC without npm tokens.
const tarballName = (name, version) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
export function validatePublishSteps(publish, { packages, version = RENDERER_CANDIDATE.version } = {}) {
  let root;
  try { root = parseWorkflow(publish); } catch { return ['publish.yml: cannot be parsed for the npm publish steps']; }
  const errors = [];
  const steps = Object.values(root?.jobs ?? {}).flatMap(stepsOf);
  const publishing = steps.filter(step => /\bnpm publish\b/.test(runText(step)));
  const expected = (packages ?? []).map((name, index) => ({
    run: `npm publish ./candidate-artifacts/${tarballName(name, version)} --access public`,
    if: `\${{ fromJSON(steps.registry.outputs.start-index) <= ${index} }}`,
  }));
  if (JSON.stringify(publishing.map(step => ({ run: runText(step), if: step.if }))) !== JSON.stringify(expected)) {
    errors.push('publish.yml: the six npm publish steps must publish each frozen tarball once, in registry order, gated by the start index');
  }
  if (publishing.some(step => step.env !== undefined) || /NPM_TOKEN|NODE_AUTH_TOKEN|NPM_AUTH_TOKEN|_authToken/i.test(JSON.stringify(root))) {
    errors.push('publish.yml: all six npm publish steps must use OIDC without npm token injection');
  }
  return errors;
}

// CRO100-8/TRO100-8: only the job that publishes can mint the npm OIDC token.
// It installs without lifecycle scripts, runs only the gates and npm publish,
// and verifies the exact proof, frozen bytes, identity and registry state
// before the first publish. A token-free job supplies the fresh dependency
// audit and registry context first; a later job reads the registry back.
export function validatePublishWorkflow(publish, { policy } = {}) {
  let root;
  try { root = parseWorkflow(publish); } catch { return ['publish.yml: cannot be parsed for OIDC isolation']; }
  const errors = [];
  const jobs = isObject(root?.jobs) ? root.jobs : {};
  const publishers = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => /\bnpm publish\b/.test(runText(step))));
  const minting = Object.keys(jobs).filter(name => jobs[name]?.permissions?.['id-token'] !== undefined);
  if (publishers.length !== 1 || minting.length !== 1 || publishers[0] !== minting[0]
      || !sameEntries(jobs[publishers[0]].permissions, { contents: 'read', actions: 'read', 'id-token': 'write' })) {
    errors.push('publish.yml: only the publish job may request id-token: write, with contents/actions read otherwise');
    return [...errors, ...validatePublishSteps(publish, { packages: policy?.expectedPackages })];
  }
  const [publisher] = publishers;
  for (const [name, job] of Object.entries(jobs)) {
    if (name !== publisher && !sameEntries(job?.permissions, { contents: 'read', actions: 'read' })) {
      errors.push(`publish.yml: job ${name} must have only contents and actions read permissions`);
    }
  }
  const runs = stepsOf(jobs[publisher]).map(runText);
  if (!runs.includes('npm ci --ignore-scripts') || runs.includes('npm ci')) {
    errors.push('publish.yml: the publish job must install dependencies without lifecycle scripts (npm ci --ignore-scripts)');
  }
  for (const [label, pattern] of [
    ['npm run verify', /^npm run verify\b/], ['npm audit', /^npm audit\b/], ['npm run smoke:consumer', /^npm run smoke:/],
    ['npm test', /^npm (?:run )?test\b/], ['npm run build', /^npm run build\b/], ['workspace audit', /workspace-audit\.mjs/],
  ]) if (runs.some(run => pattern.test(run))) errors.push(`publish.yml: the publish job must not run ${label}`);
  const firstPublish = runs.findIndex(run => /^npm publish\b/.test(run));
  for (const [label, pattern] of [
    ['the exact-SHA final-candidate proof', /^node scripts\/release-final-candidate\.mjs candidate-proof\/final-candidate-proof\.json candidate-artifacts\/candidate-manifest\.json$/m],
    ['the frozen candidate bytes', /^node scripts\/candidate-artifacts\.mjs verify candidate-artifacts$/m],
    ['the immutable release identity', /^node scripts\/release-guard\.mjs --publish$/m],
    ['the registry publication state', /^node scripts\/release-registry\.mjs preflight$/m],
  ]) {
    const position = runs.findIndex(run => pattern.test(run));
    if (position < 0 || firstPublish < 0 || position > firstPublish) errors.push(`publish.yml: ${label} must be verified before the first npm publish`);
  }
  const registry = stepsOf(jobs[publisher]).find(step => runText(step) === 'node scripts/release-registry.mjs preflight');
  if (registry?.id !== 'registry') errors.push('publish.yml: the start index must come from the registry preflight step (id registry)');
  const proof = stepsOf(jobs[publisher]).find(step => /release-final-candidate\.mjs/.test(runText(step)));
  for (const [key, value] of Object.entries({
    GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}', RELEASE_VERSION: '${{ inputs.version }}',
    RELEASE_COMMIT: '${{ inputs.commit }}', RELEASE_CANDIDATE_RUN_ID: '${{ inputs.candidate_run_id }}',
  })) if (proof?.env?.[key] !== value) errors.push(`publish.yml: the proof verification must bind ${key}`);
  for (const artifact of [PACKAGE_ARTIFACT, PROOF_ARTIFACT]) {
    const download = stepsOf(jobs[publisher]).find(step => artifactStep(step, 'actions/download-artifact', artifact));
    if (download?.with?.['run-id'] !== '${{ inputs.candidate_run_id }}' || download.with.repository !== 'coreyt/coral') {
      errors.push(`publish.yml: the publish job must download ${artifact} from the selected candidate run`);
    }
  }
  const gate = needsOf(jobs[publisher]);
  if (gate.length !== 1 || jobs[publisher].if !== `\${{ needs.${gate[0]}.result == 'success' }}`) {
    errors.push('publish.yml: the publish job must run only after its token-free verification succeeds');
  } else {
    const verify = stepsOf(jobs[gate[0]]).map(runText);
    if (!verify.includes('node scripts/workspace-audit.mjs')) errors.push('publish.yml: the token-free verification must run the fresh workspace audit');
    if (!verify.includes('node scripts/release-registry.mjs preflight')) errors.push('publish.yml: the token-free verification must read the registry publication state');
    if (!verify.includes(candidateVerify)) errors.push('publish.yml: the token-free verification must verify the frozen candidate bytes');
  }
  const readback = Object.keys(jobs).filter(name => needsOf(jobs[name]).includes(publisher));
  if (readback.length !== 1 || jobs[readback[0]].if !== `\${{ needs.${publisher}.result == 'success' }}`
      || !stepsOf(jobs[readback[0]]).some(step => runText(step) === 'node scripts/release-registry.mjs verify')) {
    errors.push('publish.yml: a registry job must verify the public registry artifacts after publication');
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (stepsOf(job).some(step => usesAction(step, 'actions/upload-artifact'))) {
      errors.push(`publish.yml: job ${name} must not upload report artifacts`);
    }
  }
  errors.push(...validatePublishSteps(publish, { packages: policy?.expectedPackages }));
  return errors;
}

const permissionsOf = job => (isObject(job?.permissions) ? job.permissions : {});

// Pages restores the frozen candidate site that the proof names, without
// rebuilding it, and deploys those bytes from a serialized least-privilege job.
export function validatePagesWorkflow(text) {
  let root;
  try { root = parseWorkflow(text); } catch { return ['pages.yml: cannot be parsed']; }
  const errors = [];
  const jobs = isObject(root?.jobs) ? root.jobs : {};
  if (!sameEntries(root?.concurrency, { group: 'coral-pages', 'cancel-in-progress': false })) {
    errors.push('pages.yml: concurrency must serialize every Pages deployment without cancellation.');
  }
  for (const forbidden of [/\bbuild:online\b/, /npm run (?:build|docs:build|docs:api|ci:site|ci:packages)\b/, /\bvite build\b/, /\bnpm publish\b/]) {
    if (Object.values(jobs).flatMap(stepsOf).some(step => forbidden.test(runText(step)))) {
      errors.push(`pages.yml: must restore the frozen candidate site, never rebuild or publish (${forbidden.source})`);
    }
  }
  for (const retired of ['coral-editor-', 'build/SHA256SUMS', 'manifest.webmanifest', 'sw.js']) {
    if (text.includes(retired)) errors.push(`pages.yml: retired delivery output ${retired}`);
  }
  const deployers = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => usesAction(step, 'actions/deploy-pages')));
  const builders = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => usesAction(step, 'actions/upload-pages-artifact')));
  if (deployers.length !== 1 || builders.length !== 1) return [...errors, 'pages.yml: one job must stage the Pages payload and one job must deploy it.'];
  const [deploy] = deployers;
  const [builder] = builders;
  if (!sameEntries(permissionsOf(jobs[deploy]), { pages: 'write', 'id-token': 'write' }) || jobs[deploy].environment?.name !== 'github-pages') {
    errors.push('pages.yml: deploy permissions must be exactly pages and id-token write in the github-pages environment.');
  }
  if (stepsOf(jobs[deploy]).some(step => step.run !== undefined || !usesAction(step, 'actions/deploy-pages'))) {
    errors.push('pages.yml: the deploy job must deploy the staged payload unmodified.');
  }
  for (const [name, job] of Object.entries(jobs)) {
    if (name !== deploy && Object.values(permissionsOf(job)).some(level => level === 'write')) {
      errors.push('pages.yml: write privileges must exist only on the deploy job.');
    }
  }
  const verifiers = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => runText(step) === 'node scripts/release-registry.mjs verify'
    && step.env?.RELEASE_PAGES_REGISTRY_VERIFICATION === true));
  const gates = [...new Set([builder, ...verifiers])];
  if (verifiers.length !== 1 || !sameKeys(needsOf(jobs[deploy]), gates)
      || !gates.every(name => String(jobs[deploy].if ?? '').includes(`needs.${name}.result == 'success'`))) {
    errors.push('pages.yml: deployment must depend on executable registry proof and the exact staged payload.');
  }
  const steps = stepsOf(jobs[builder]);
  const stage = steps.findIndex(step => usesAction(step, 'actions/upload-pages-artifact'));
  const before = steps.slice(0, stage);
  if (!before.some(step => /^node scripts\/release-final-candidate\.mjs candidate-proof\/final-candidate-proof\.json /m.test(runText(step))
      && step.env?.RELEASE_CANDIDATE_RUN_ID === '${{ inputs.candidate_run_id }}' && step.env?.GITHUB_TOKEN === '${{ secrets.GITHUB_TOKEN }}')) {
    errors.push('pages.yml: the final-candidate proof must be verified before the payload is staged.');
  }
  for (const artifact of [PROOF_ARTIFACT, SITE_ARTIFACT]) {
    if (!before.some(step => artifactStep(step, 'actions/download-artifact', artifact) && step.with['run-id'] === '${{ inputs.candidate_run_id }}')) {
      errors.push(`pages.yml: the staged payload must come from ${artifact} of the selected candidate run.`);
    }
  }
  if (steps[stage]?.with?.['retention-days'] !== RETENTION_DAYS) {
    errors.push(`pages.yml: actions/upload-pages-artifact must retain its artifact for ${RETENTION_DAYS} days.`);
  }
  return errors;
}

// The retained-artifact restore relays exact bytes with least privilege.
export function validatePagesRestoreWorkflow(text) {
  let root;
  try { root = parseWorkflow(text); } catch { return ['pages-restore.yml: cannot be parsed']; }
  const errors = [];
  const jobs = isObject(root?.jobs) ? root.jobs : {};
  if (!sameEntries(root?.concurrency, { group: 'coral-pages', 'cancel-in-progress': false })) {
    errors.push('pages-restore.yml: concurrency must share the Coral Pages group.');
  }
  const runs = Object.values(jobs).flatMap(stepsOf).map(runText);
  if (runs.some(run => /\bnpm\b|build:online/.test(run))
      || Object.values(jobs).flatMap(stepsOf).some(step => usesAction(step, 'actions/upload-pages-artifact'))) {
    errors.push('pages-restore.yml: must relay a retained payload without installing, building or re-staging.');
  }
  const deployers = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => usesAction(step, 'actions/deploy-pages')));
  if (deployers.length !== 1) return [...errors, 'pages-restore.yml: exactly one job must deploy.'];
  const [deploy] = deployers;
  const [prepare] = needsOf(jobs[deploy]);
  if (needsOf(jobs[deploy]).length !== 1 || jobs[deploy].if !== `\${{ needs.${prepare}.result == 'success' }}`) {
    errors.push('pages-restore.yml: deploy must run only after its verified preparation succeeds.');
  }
  if (!sameEntries(permissionsOf(jobs[prepare]), { contents: 'read', actions: 'read' })) {
    errors.push('pages-restore.yml: prepare permissions must be contents/actions read only.');
  }
  if (!sameEntries(permissionsOf(jobs[deploy]), { actions: 'read', pages: 'write', 'id-token': 'write' }) || jobs[deploy].environment?.name !== 'github-pages') {
    errors.push('pages-restore.yml: deploy permissions must be actions read and Pages/OIDC write only.');
  }
  const prep = stepsOf(jobs[prepare]);
  const source = prep.findIndex(step => runText(step) === 'node scripts/pages-restore.mjs source');
  const download = prep.findIndex(step => usesAction(step, 'actions/download-artifact')
    && step.with?.['run-id'] === '${{ inputs.source_run_id }}' && step.with?.['artifact-ids'] === '${{ inputs.source_artifact_id }}');
  const payload = prep.findIndex(step => runText(step) === 'node scripts/pages-restore.mjs payload retained-pages/artifact.tar'
    && step.env?.RESTORE_PAYLOAD_SHA256 === '${{ inputs.payload_sha256 }}');
  const relay = prep.findIndex(step => artifactStep(step, 'actions/upload-artifact', 'github-pages')
    && step.with.path === 'retained-pages/artifact.tar' && step.with['retention-days'] === RETENTION_DAYS);
  if (!(source >= 0 && source < download && download < payload && payload < relay)) {
    errors.push('pages-restore.yml: the source run and payload digest must be verified before the payload is relayed.');
  }
  const steps = stepsOf(jobs[deploy]);
  const verify = steps.findIndex(step => runText(step).includes("readFileSync('relayed-pages/artifact.tar')")
    && step.env?.EXPECTED_SHA256 === '${{ inputs.payload_sha256 }}');
  const deployment = steps.findIndex(step => usesAction(step, 'actions/deploy-pages'));
  if (verify < 0 || verify > deployment) errors.push('pages-restore.yml: relayed payload must be verified before deployment.');
  return errors;
}

// The GitHub release verifies everything read-only, then tags and releases
// with contents write only, reviewed notes and an immutable readback.
export function validateReleaseWorkflow(text, { policy } = {}) {
  const errors = [...validateWorkflowContract('release.yml', text)];
  let root;
  try { root = parseWorkflow(text); } catch { return errors; }
  const jobs = isObject(root?.jobs) ? root.jobs : {};
  const releasers = Object.keys(jobs).filter(name => stepsOf(jobs[name]).some(step => /\bgh release create\b/.test(runText(step))));
  if (releasers.length !== 1) return [...errors, 'release.yml: exactly one job must create the GitHub release'];
  const [release] = releasers;
  const [verify] = needsOf(jobs[release]);
  if (needsOf(jobs[release]).length !== 1 || jobs[release].if !== `\${{ needs.${verify}.result == 'success' }}`) {
    errors.push('release.yml: the release job must run only after verification succeeds');
  }
  if (!sameEntries(permissionsOf(jobs[verify]), { contents: 'read', actions: 'read', deployments: 'read' })) {
    errors.push('release.yml: verify job must have only contents, actions and deployments read permissions.');
  }
  const releasePermissions = policy?.githubReleaseJob?.permissions ?? { contents: 'write' };
  if (!sameEntries(permissionsOf(jobs[release]), releasePermissions)) {
    errors.push('release.yml: release job must have only contents write permission.');
  }
  const verifyRuns = stepsOf(jobs[verify]).map(runText).join('\n');
  for (const command of [
    'node scripts/release-guard.mjs', 'node scripts/release-final-candidate.mjs candidate-proof/final-candidate-proof.json candidate-artifacts/candidate-manifest.json',
    candidateVerify, 'node scripts/release-registry.mjs verify', 'node scripts/github-release-guard.mjs',
  ]) if (!verifyRuns.split('\n').includes(command)) errors.push(`release.yml: verify job must run ${command}`);
  // TRO100-1: the registry re-verification carries its private-digest context.
  const registry = stepsOf(jobs[verify]).find(step => runText(step).split('\n').includes('node scripts/release-registry.mjs verify'));
  for (const [key, value] of Object.entries({
    RELEASE_PRIVATE_REPOSITORY: '${{ github.event.repository.private }}',
    RELEASE_TAG_REGISTRY_VERIFICATION: true,
    RELEASE_CANDIDATE_MANIFEST: 'candidate-artifacts/candidate-manifest.json',
    RELEASE_PAGES_ARTIFACT: 'pages-artifact/artifact.tar',
    RELEASE_CANDIDATE_PROOF: 'candidate-proof/final-candidate-proof.json',
  })) {
    if (registry?.env?.[key] !== value) errors.push(`release.yml: registry verification step lacks its private-digest context (${key}: ${value})`);
  }
  for (const [artifact, input] of [[PACKAGE_ARTIFACT, 'candidate_run_id'], [PROOF_ARTIFACT, 'candidate_run_id'], ['github-pages', 'pages_run_id']]) {
    if (!stepsOf(jobs[verify]).some(step => artifactStep(step, 'actions/download-artifact', artifact) && step.with['run-id'] === `\${{ inputs.${input} }}`)) {
      errors.push(`release.yml: verify job must download ${artifact} from inputs.${input}`);
    }
  }
  const script = stepsOf(jobs[release]).map(runText).join('\n');
  for (const required of [
    // CRO100-1: hosted runners have no git identity; the tagger is the Actions bot.
    'git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" tag --annotate',
    'test "$(git cat-file -t "refs/tags/v${RELEASE_VERSION}")" = tag',
    // CRO100-12/-3: a re-run publishes its own verified draft and reads back immutability.
    'gh release edit "v${RELEASE_VERSION}" --verify-tag', '--draft=false', 'cmp release-evidence.json existing-release-evidence.json',
    'test "$(gh api "repos/coreyt/coral/releases/tags/v${RELEASE_VERSION}" --jq .immutable)" = true',
    // DRO100-10: reviewed changelog notes, never generated notes.
    'node scripts/release-notes.mjs "${RELEASE_VERSION}" > release-notes.md', '--notes-file release-notes.md',
  ]) if (!script.includes(required)) errors.push(`release.yml: missing ${required}`);
  if (text.includes('--generate-notes')) errors.push('release.yml: release notes must come from CHANGELOG.md');
  if (/(?:npm publish|deploy-pages)/.test(text)) errors.push('release.yml: release workflow must not publish packages or deploy Pages.');
  return errors;
}

// The release policy holds current configuration only: no observation dates,
// owner slices or historical ledgers.
export function validateReleasePolicy(policy, { closedJobs = CLOSED_JOBS } = {}) {
  const errors = [];
  const expectedPackages = ['@coral-viz/language', '@coral-viz/render', '@coral-viz/browser', '@coral-viz/viz', '@coral-viz/mcp-server', 'tree-sitter-coral'];
  if (policy?.schemaVersion !== 3 || policy.protectedBranch !== 'main') errors.push('release-policy.json: wrong branch/ruleset target.');
  if (!sameKeys(policy?.requiredChecks ?? [], closedJobs) || new Set(policy?.requiredChecks).size !== closedJobs.length) {
    errors.push(`release-policy.json: requiredChecks must be exactly the proof inventory ${closedJobs.join(', ')}.`);
  }
  if (JSON.stringify(policy?.expectedPackages) !== JSON.stringify(expectedPackages)) errors.push('release-policy.json: expectedPackages must list the six packages in registry order.');
  if (JSON.stringify(policy?.guardedMain?.expectedChecks) !== JSON.stringify([AGGREGATE_JOB]) || policy?.ci?.aggregateContext !== AGGREGATE_JOB) {
    errors.push(`release-policy.json: guarded main must require only the ${AGGREGATE_JOB} aggregate context.`);
  }
  if (policy?.releaseRuntime?.node !== RELEASE_NODE || policy?.releaseRuntime?.npm !== NPM_VERSION) errors.push('release-policy.json: wrong release runtime.');
  if (policy?.minimumRuntimeControl?.node !== MINIMUM_NODE || policy?.minimumRuntimeControl?.npm !== NPM_VERSION
      || policy?.minimumRuntimeControl?.artifactProducer !== 'candidate-packages') {
    errors.push('release-policy.json: wrong minimum-runtime artifact control.');
  }
  const pages = policy?.pages ?? {};
  if (pages.url !== 'https://coreyt.github.io/coral/' || pages.buildType !== 'workflow' || pages.repositoryVisibility !== 'public'
      || pages.siteVisibility !== 'public' || pages.httpsEnforced !== true || pages.environment !== 'github-pages'
      || pages.deploymentBranch !== 'main' || pages.artifactRetentionDays !== RETENTION_DAYS) {
    errors.push('release-policy.json: incomplete Pages capability boundary.');
  }
  const release = policy?.githubReleaseJob ?? {};
  if (!sameEntries(release.permissions, { contents: 'write' }) || !sameKeys(release.forbiddenPermissions ?? [], ['id-token: write', 'pages: write'])
      || release.requiresVerifiedNpmAndPagesResults !== true || release.requiresImmutableReleaseSettingProof !== true
      || release.requiresIndependentAssetDigests !== true) {
    errors.push('release-policy.json: incomplete isolated GitHub release boundary.');
  }
  if (policy?.npmPublisher?.workflow !== '.github/workflows/publish.yml' || policy?.npmPublisher?.accountMutationAuthorized !== false) {
    errors.push('release-policy.json: npm publisher must be the publish workflow without account mutation authority.');
  }
  if (policy?.delivery?.target !== 'online-only' || policy?.delivery?.currentCheck !== 'online-delivery'
      || policy?.delivery?.finalCheck !== 'online-delivery' || !closedJobs.includes(policy?.delivery?.finalCheck)
      || JSON.stringify(policy?.delivery?.forbiddenOutputs) !== JSON.stringify(['manifest.webmanifest', 'registered-service-worker', 'offline-archive', 'archive-checksum'])) {
    errors.push('release-policy.json: incomplete online-delivery boundary.');
  }
  const tiers = policy?.ci?.pathTiers?.docsAndReleaseRecords;
  if (tiers?.fullMatrix !== false
      || JSON.stringify(tiers?.paths) !== JSON.stringify(['dev/releases/**/*.md', 'dev/archive/releases/**/*.md', '*.md'])
      || JSON.stringify(tiers?.excludedPaths) !== JSON.stringify(['PLAN.md', 'CLAUDE.md', 'dev/releases/*/plan.md'])
      || !sameKeys(['classify', ...(tiers?.requiredChecks ?? [])], ALWAYS_JOBS)
      || policy?.ci?.candidateRef !== RENDERER_CANDIDATE.candidateRef
      || policy?.ci?.unknownBase?.fullMatrix !== true
      || policy?.ci?.finalCandidate?.fullMatrix !== true || policy?.ci?.finalCandidate?.exactSha !== true
      || JSON.stringify(policy?.ci?.canaries) !== JSON.stringify(['preview-origin', 'performance-fixture-addressable'])
      || JSON.stringify(policy?.ci?.retainedBrowserSmoke) !== JSON.stringify(['escaped-source', 'blank-diagram'])) {
    errors.push('release-policy.json: incomplete CI tier/canary policy.');
  }
  if (policy?.gitleaks?.version !== '8.30.1' || policy?.gitleaks?.config !== '.gitleaks.toml') {
    errors.push('release-policy.json: incomplete secret-scanning policy.');
  }
  const historical = ['accountState', 'configurationOwnerSlice', 'releaseIdentity'].filter(key => key in (policy ?? {}));
  for (const [scope, keys] of [['pages', ['ownerSlice', 'observedAt', 'currentObservation', 'finalDeploymentOwnerSlice']],
    ['npmPublisher', ['observations', 'observedUser', 'readiness']], ['guardedMain', ['readOnlyEvidence', 'followUp', 'replacedChecks']],
    ['githubReleaseJob', ['ownerSlice']], ['delivery', ['transitionOwnerSlice']]]) {
    for (const key of keys) if (key in (policy?.[scope] ?? {})) historical.push(`${scope}.${key}`);
  }
  if (historical.length) errors.push(`release-policy.json: historical observations are not current policy (${historical.join(', ')}).`);
  return errors;
}

export function validatePolicy({ ci, publish, pages, pagesRestore, release, dependabot, policy, playwrightConfig, closedJobs = CLOSED_JOBS }) {
  const errors = [];
  errors.push(...validateReleasePolicy(policy, { closedJobs }));
  for (const [name, text] of [['ci.yml', ci], ['publish.yml', publish], ['pages.yml', pages], ['pages-restore.yml', pagesRestore]]) {
    if (text === undefined) continue;
    errors.push(...validateWorkflowText(name, text), ...validateWorkflowContract(name, text));
  }
  errors.push(...validateCiWorkflow(ci, { policy, closedJobs }));
  if (!ci.includes(`go install github.com/zricethezav/gitleaks/v8@v${policy?.gitleaks?.version}`)) {
    errors.push('ci.yml: install the gitleaks version named by the release policy');
  }
  errors.push(...validatePublishWorkflow(publish, { policy }));
  if (pages !== undefined) errors.push(...validatePagesWorkflow(pages));
  if (pagesRestore !== undefined) errors.push(...validatePagesRestoreWorkflow(pagesRestore));
  if (release !== undefined) errors.push(...validateWorkflowText('release.yml', release), ...validateReleaseWorkflow(release, { policy }));
  if (playwrightConfig !== undefined) errors.push(...validateBrowserConfig(playwrightConfig));
  for (const required of [
    'npm-compatible-development', 'npm-compatible-production',
    'dependency-name: typescript', 'dependency-name: "@types/node"',
    'version-update:semver-major', 'package-ecosystem: github-actions',
  ]) if (!String(dependabot).includes(required)) errors.push(`dependabot.yml: missing ${required}`);
  return errors;
}

export async function validateRepository({ root = '.' } = {}) {
  const directory = join(root, workflowDirectory);
  const names = (await readdir(directory)).sort();
  const errors = [];
  for (const name of names) {
    if (!WORKFLOW_INVENTORY.includes(name)) errors.push(`${workflowDirectory}: workflow file ${name} is outside the closed workflow inventory`);
  }
  for (const name of WORKFLOW_INVENTORY) {
    if (!names.includes(name)) errors.push(`${workflowDirectory}: missing contracted workflow file ${name}`);
  }
  const workflows = Object.fromEntries(await Promise.all(names.filter(name => WORKFLOW_INVENTORY.includes(name))
    .map(async name => [name, await readFile(join(directory, name), 'utf8')])));
  errors.push(...validatePolicy({
    ci: workflows['ci.yml'] ?? '',
    publish: workflows['publish.yml'] ?? '',
    pages: workflows['pages.yml'] ?? '',
    pagesRestore: workflows['pages-restore.yml'] ?? '',
    release: workflows['release.yml'] ?? '',
    dependabot: await readFile(join(root, '.github/dependabot.yml'), 'utf8'),
    policy: JSON.parse(await readFile(join(root, 'dev/release-policy.json'), 'utf8')),
    playwrightConfig: await readFile(join(root, 'playwright.config.ts'), 'utf8'),
  }));
  for (const [name, contents] of Object.entries(workflows)) {
    errors.push(...tokenPermissionErrors(name, contents, script => readFileSync(join(root, script), 'utf8')));
  }
  return errors;
}

// CRO100-2: every GitHub API read a workflow step makes with the job token
// must be covered by that job's declared permissions. Endpoints are read from
// the invoked script's source and from inline `gh` commands; the permission
// for each is the one GitHub documents for the REST endpoint. Administration
// endpoints (for example `/immutable-releases`) cannot be granted to
// GITHUB_TOKEN at all.
const API_PERMISSION_PREFIXES = Object.freeze([
  ['/actions', 'actions'], ['/deployments', 'deployments'], ['/git/', 'contents'],
  ['/releases', 'contents'], ['/compare/', 'contents'], ['/immutable-releases', 'administration'], ['/rulesets', 'metadata'],
]);
export function apiPermission(path) {
  if (path === '' || path === '/') return 'metadata';
  return API_PERMISSION_PREFIXES.find(([prefix]) => path === prefix || path.startsWith(prefix))?.[1] ?? null;
}
export function scriptApiPaths(source) {
  // A request path is a template literal that starts with the repository API
  // root: `/repos/coreyt/coral…`, `https://api.github.com/repos/${repository}…`,
  // or `${REPO_API}…`. Strings in messages and comments are not requests.
  const paths = [...String(source).matchAll(
    /`(?:https:\/\/api\.github\.com)?(?:\/repos\/(?:coreyt\/coral|\$\{repository\})|\$\{REPO_API\})(\/[^`?\s$]*)?/g,
  )].map(match => (match[1] ?? '').replace(/\/$/, ''));
  return [...new Set(paths)];
}
const PERMISSION_LEVEL = Object.freeze({ read: 1, write: 2 });
export function tokenPermissionErrors(workflow, text, readScript) {
  let root;
  try {
    root = parseWorkflow(text);
  } catch {
    return [];
  }
  const errors = [];
  for (const [name, job] of Object.entries(root?.jobs ?? {})) {
    const granted = job?.permissions ?? root.permissions ?? {};
    const needs = new Map();
    const need = (permission, level, reason) => {
      if (!permission) errors.push(`${workflow}: job ${name} calls an unclassified GitHub endpoint (${reason})`);
      else if ((PERMISSION_LEVEL[needs.get(permission)?.[0]] ?? 0) < PERMISSION_LEVEL[level]) needs.set(permission, [level, reason]);
    };
    for (const step of Array.isArray(job?.steps) ? job.steps : []) {
      if (typeof step?.uses === 'string' && step.uses.startsWith('actions/download-artifact@') && step.with?.['run-id']) {
        need('actions', 'read', 'download-artifact from another run');
      }
      const token = Object.values(step?.env ?? {}).some(value => String(value).includes('secrets.GITHUB_TOKEN'));
      if (typeof step?.run !== 'string' || !token) continue;
      for (const [, entry] of step.run.matchAll(/node (scripts\/[\w.-]+\.mjs)/g)) {
        // The invoked script and every local module it imports, transitively.
        const pending = [entry];
        const seen = new Set();
        while (pending.length) {
          const script = pending.pop();
          if (seen.has(script)) continue;
          seen.add(script);
          let source;
          try {
            source = readScript(script);
          } catch {
            errors.push(`${workflow}: job ${name} runs ${script}, which cannot be read for its GitHub endpoints`);
            continue;
          }
          for (const path of scriptApiPaths(source)) need(apiPermission(path), 'read', `${script} ${path || '/'}`);
          for (const [, local] of source.matchAll(/from '\.\/([\w.-]+\.mjs)'/g)) pending.push(`scripts/${local}`);
        }
      }
      for (const [, path] of step.run.matchAll(/gh api "?repos\/coreyt\/coral(\/[^"\s?]*)?/g)) {
        need(apiPermission(path ?? ''), 'read', `gh api ${path ?? '/'}`);
      }
      if (/\bgh release (?:view|download)\b/.test(step.run)) need('contents', 'read', 'gh release read');
      if (/\bgh release (?:create|edit|upload|delete)\b|\bgit push\b/.test(step.run)) need('contents', 'write', 'release or tag write');
    }
    for (const [permission, [level, reason]] of needs) {
      if (permission === 'metadata') continue;
      if (permission === 'administration') {
        errors.push(`${workflow}: job ${name} reads an endpoint GITHUB_TOKEN cannot be granted (${reason})`);
      } else if ((PERMISSION_LEVEL[granted[permission]] ?? 0) < PERMISSION_LEVEL[level]) {
        errors.push(`${workflow}: job ${name} needs ${permission}: ${level} for ${reason}`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = await validateRepository();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Workflow and release policy verified.');
}
