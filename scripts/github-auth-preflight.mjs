import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';

// Read-only GitHub protection readiness. Publisher, package and hosted release
// evidence remain separate Slice 100 gates.
export const SUMMARY_FIELDS = ['id', 'name', 'target', 'enforcement'];

export function rulesetSummaryCommand(repository) {
  return [
    'api', '--method', 'GET', `/repos/${repository}/rulesets`,
    '--paginate', '--jq', `.[] | {${SUMMARY_FIELDS.join(',')}}`,
  ];
}

export function rulesetDetailCommand(repository, rulesetId) {
  if (!Number.isSafeInteger(Number(rulesetId))) throw new Error('ruleset ID must be an integer');
  return ['api', '--method', 'GET', `/repos/${repository}/rulesets/${rulesetId}`];
}

// GitHub Actions' app ID. A required context bound to any other source (or to
// no source) could be satisfied by a status posted outside the CI workflow.
export const GITHUB_ACTIONS_INTEGRATION_ID = 15368;

// The protected contexts come from the release policy, never the environment.
export function expectedRulesetContexts(policy) {
  const contexts = policy?.guardedMain?.expectedChecks;
  if (!Array.isArray(contexts) || contexts.length === 0
      || contexts.some(context => typeof context !== 'string' || !context)) {
    throw new Error('release policy guardedMain.expectedChecks must name the protected contexts');
  }
  return [...contexts];
}

// One ref-name matcher for every ruleset check (DRO100-28). `~DEFAULT_BRANCH`
// names main; `~ALL` names every ref of the ruleset's target.
export function targetsRef(pattern, ref) {
  if (pattern === '~ALL') return true;
  if (pattern === '~DEFAULT_BRANCH') return ref === 'refs/heads/main';
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const expression = escaped.replace(/\*\*/g, '<DOUBLE_STAR>').replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]').replace(/<DOUBLE_STAR>/g, '.*');
  return new RegExp(`^${expression}$`).test(ref);
}
export const targetsMain = pattern => targetsRef(pattern, 'refs/heads/main');

export const appliesToMain = detail => detail?.target === 'branch'
  && detail.enforcement === 'active'
  && Boolean(detail.conditions?.ref_name?.include?.some(targetsMain))
  && !detail.conditions?.ref_name?.exclude?.some(targetsMain);

export function compareRulesetDetails(details, expectedContexts) {
  const errors = [];
  const applicable = details.filter(appliesToMain);
  if (applicable.length === 0) return ['no active detailed ruleset targets main'];
  for (const detail of applicable) {
    // TRO100-11: GitHub omits bypass_actors when the caller cannot read them,
    // so an absent list is unproven, not empty.
    if (!Array.isArray(detail.bypass_actors)) {
      errors.push(`ruleset ${detail.id ?? 'unknown'} does not expose bypass_actors; the reading token cannot prove no bypass`);
    } else if (detail.bypass_actors.length > 0) {
      errors.push(`ruleset ${detail.id ?? 'unknown'} has bypass actors for main`);
    }
  }
  const required = applicable.flatMap(detail => detail.rules ?? [])
    .filter(rule => rule.type === 'required_status_checks')
    .flatMap(rule => rule.parameters?.required_status_checks ?? []);
  for (const check of required) {
    if (check.integration_id !== GITHUB_ACTIONS_INTEGRATION_ID) {
      errors.push(`required status context ${check.context} is not bound to GitHub Actions`);
    }
  }
  const actual = new Set(required.map(check => check.context));
  const expected = new Set(expectedContexts);
  for (const context of expected) if (!actual.has(context)) errors.push(`missing required status context ${context}`);
  for (const context of actual) if (!expected.has(context)) errors.push(`unexpected required status context ${context}`);
  return errors;
}

// Classic branch protection for main: absent (GitHub answers 404 "Branch not
// protected"), or enforced for administrators and requiring no context outside
// the release policy (design: External readiness evidence).
export const classicProtectionAbsent = protection => protection == null
  || protection.message === 'Branch not protected';

export function validateClassicProtection(protection, expectedContexts) {
  // A stored null or missing body proves nothing (TRO100-17); absence is
  // shown only by GitHub's 404 "Branch not protected" body.
  if (protection == null) {
    return ['classic protection response is missing; store the branch-protection body or the 404 "Branch not protected" body'];
  }
  if (classicProtectionAbsent(protection)) return [];
  if (typeof protection !== 'object' || typeof protection.message === 'string') {
    return ['classic protection response is not readable branch protection'];
  }
  const errors = [];
  if (protection.enforce_admins?.enabled !== true) errors.push('classic protection permits administrator bypass');
  const required = new Set([
    ...(protection.required_status_checks?.contexts ?? []),
    ...(protection.required_status_checks?.checks ?? []).map(check => check.context),
  ]);
  for (const context of required) {
    if (!expectedContexts.includes(context)) {
      errors.push(`classic protection requires context ${context} outside the release policy`);
    }
  }
  return errors;
}

// DRO100-23: approval C fast-forwards main to the exact product SHA with a
// direct push. Any rule that forces a pull request, merge queue, signature,
// deployment, or update restriction would make that impossible without bypass.
const DIRECT_PUSH_BLOCKING_RULES = Object.freeze([
  'pull_request', 'update', 'merge_queue', 'required_signatures', 'required_deployments',
]);
// CRO100-11: an allow-list, not a deny-list. Only these rule types cannot stop
// a direct fast-forward of main to a commit whose final-candidate check has
// already passed; any other type, including one GitHub adds later, blocks.
export const DIRECT_PUSH_SAFE_RULES = Object.freeze([
  'required_status_checks', 'deletion', 'non_fast_forward', 'required_linear_history', 'creation',
]);
export const RELEASE_TAG_REF = `refs/tags/v${RENDERER_CANDIDATE.version}`;
// Rule types that cannot stop GITHUB_TOKEN creating a new tag: they govern
// updating or deleting an existing one.
export const TAG_CREATION_SAFE_RULES = Object.freeze(['update', 'deletion', 'non_fast_forward']);

const activeFor = (detail, target, ref) => detail?.target === target && detail.enforcement === 'active'
  && Boolean(detail.conditions?.ref_name?.include?.some(pattern => targetsRef(pattern, ref)))
  && !detail.conditions?.ref_name?.exclude?.some(pattern => targetsRef(pattern, ref));

export function validateDirectFastForward(details, classicProtection) {
  const errors = [];
  const applicable = details.filter(appliesToMain);
  for (const detail of applicable) {
    for (const rule of detail.rules ?? []) {
      if (DIRECT_PUSH_BLOCKING_RULES.includes(rule.type) || !DIRECT_PUSH_SAFE_RULES.includes(rule.type)) {
        errors.push(`ruleset ${detail.id ?? 'unknown'} rule ${rule.type} blocks a direct fast-forward of main`);
      }
    }
  }
  // Push rulesets carry no ref condition: they apply to every push, to main
  // and to the release tag alike, and their file rules cannot be evaluated here.
  for (const detail of details) {
    if (detail?.target === 'push' && detail.enforcement === 'active' && (detail.rules ?? []).length > 0) {
      errors.push(`push ruleset ${detail.id ?? 'unknown'} applies to every push, including main and ${RELEASE_TAG_REF}`);
    }
  }
  if (!classicProtectionAbsent(classicProtection)) {
    if (classicProtection.lock_branch?.enabled) errors.push('classic protection locks main against pushes');
    if (classicProtection.required_pull_request_reviews) errors.push('classic protection requires pull request reviews on main');
    if (classicProtection.restrictions) errors.push('classic protection restricts pushes to main');
    if (classicProtection.required_signatures?.enabled) errors.push('classic protection requires signed commits on main');
  }
  return errors;
}

// CRO100-11: release.yml pushes the annotated tag with GITHUB_TOKEN after the
// packages are immutable, so any active tag ruleset that could refuse the
// creation blocks readiness instead.
export function validateTagCreation(details, ref = RELEASE_TAG_REF) {
  const errors = [];
  for (const detail of details.filter(item => activeFor(item, 'tag', ref))) {
    for (const rule of detail.rules ?? []) {
      if (!TAG_CREATION_SAFE_RULES.includes(rule.type)) {
        errors.push(`tag ruleset ${detail.id ?? 'unknown'} rule ${rule.type} may block creating ${ref} with GITHUB_TOKEN`);
      }
    }
  }
  return errors;
}

export function parseRulesetSummaries(output) {
  const text = String(output).trim();
  if (!text) return [];
  // gh 2.45 supports --paginate, but not --slurp. Emit one projected summary
  // per line across every page; retain array parsing for historical callers.
  const summaries = text.startsWith('[') ? JSON.parse(text)
    : text.split(/\r?\n/).map(line => JSON.parse(line));
  if (!Array.isArray(summaries) || summaries.some(summary => !summary
      || !Number.isSafeInteger(Number(summary.id)))) {
    throw new Error('ruleset summary response is not an array or summary JSON lines');
  }
  return summaries;
}

export function readClassicProtection(repository, run = execFileSync) {
  try {
    return JSON.parse(run('gh', ['api', '--method', 'GET',
      `/repos/${repository}/branches/main/protection`], { encoding: 'utf8' }));
  } catch (error) {
    // Only GitHub's specific HTTP 404 proves absence; auth/network failures
    // and an unreadable body cannot be interpreted as an unprotected branch.
    let body;
    try { body = JSON.parse(String(error.stdout)); } catch { throw error; }
    if (error.status === 1 && String(body?.status) === '404'
        && body.message === 'Branch not protected'
        && /\(HTTP 404\)/.test(String(error.stderr))) return body;
    throw error;
  }
}

export function checkGithubAuthPreflight(repository = 'coreyt/coral', {
  run = execFileSync,
  expectedContexts = expectedRulesetContexts(JSON.parse(readFileSync(
    new URL('../dev/release-policy.json', import.meta.url), 'utf8'))),
} = {}) {
  run('gh', ['auth', 'status'], { stdio: 'inherit' });
  const summaries = parseRulesetSummaries(run('gh', rulesetSummaryCommand(repository), { encoding: 'utf8' }));
  const details = summaries.map(summary => JSON.parse(run(
    'gh', rulesetDetailCommand(repository, summary.id), { encoding: 'utf8' },
  )));
  const protection = readClassicProtection(repository, run);
  const errors = [
    ...compareRulesetDetails(details, expectedContexts),
    ...validateClassicProtection(protection, expectedContexts),
    ...validateDirectFastForward(details, protection),
    ...validateTagCreation(details),
  ];
  if (errors.length) throw new Error(errors.join('\n'));
  return details;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const details = checkGithubAuthPreflight(process.env.CORAL_GITHUB_REPOSITORY ?? 'coreyt/coral');
    console.log(JSON.stringify(details, null, 2));
    console.log('GitHub branch, tag and direct-push readiness passed.');
  } catch (error) {
    console.error(error.message);
    console.error('Read-only GitHub auth preflight is blocked; no external mutation was attempted.');
    process.exit(1);
  }
}
