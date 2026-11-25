import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as readiness from './github-auth-preflight.mjs';
import { RENDERER_CANDIDATE } from './renderer-candidate-config.mjs';
import { validatePolicy, validateRepository } from './workflow-policy.mjs';

const main = {
  id: 1, target: 'branch', enforcement: 'active', bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [{ type: 'required_status_checks', parameters: {
    required_status_checks: [{ context: 'final-candidate', integration_id: 15368 }],
  } }],
};
const currentTag = `refs/tags/v${RENDERER_CANDIDATE.version}`;
const currentTagPattern = new RegExp(`v${RENDERER_CANDIDATE.version.replaceAll('.', '\\.')}\\b`);
const tag = ref => ({ id: 2, target: 'tag', enforcement: 'active', bypass_actors: [],
  conditions: { ref_name: { include: [ref], exclude: [] } }, rules: [{ type: 'creation' }] });
const absent = () => Object.assign(new Error('gh failed'), { status: 1,
  stdout: JSON.stringify({ message: 'Branch not protected', status: '404' }),
  stderr: 'gh: Branch not protected (HTTP 404)' });
const runner = ({ details = [main], laterPage = [], protection = absent() } = {}) => {
  const calls = [];
  const run = (command, args) => {
    assert.equal(command, 'gh');
    calls.push(args);
    if (args[0] === 'auth') return '';
    const endpoint = args.find(arg => arg.startsWith('/repos/'));
    if (endpoint === '/repos/coreyt/coral/rulesets') return args.includes('--paginate')
      ? [...details, ...laterPage].map(({ id }) => JSON.stringify({ id })).join('\n')
      : JSON.stringify(details.map(({ id }) => ({ id }))); 
    const detail = [...details, ...laterPage].find(row => endpoint === `/repos/coreyt/coral/rulesets/${row.id}`);
    if (detail) return JSON.stringify(detail);
    assert.equal(endpoint, '/repos/coreyt/coral/branches/main/protection');
    if (protection instanceof Error) throw protection;
    return JSON.stringify(protection);
  };
  return { run, calls };
};
const check = options => readiness.checkGithubAuthPreflight('coreyt/coral', {
  ...runner(options), expectedContexts: ['final-candidate'],
});

test('active tag and CI policy agree with the validated current candidate', async () => {
  assert.equal(readiness.RELEASE_TAG_REF, `refs/tags/v${RENDERER_CANDIDATE.version}`);
  const policy = JSON.parse(readFileSync('dev/release-policy.json'));
  assert.equal(policy.ci.candidateRef, RENDERER_CANDIDATE.candidateRef);
  assert.deepEqual(await validateRepository(), []);
});

test('operational preflight reads classic protection and refuses the current tag blocker', () => {
  const input = runner();
  assert.deepEqual(readiness.checkGithubAuthPreflight('coreyt/coral', {
    ...input, expectedContexts: ['final-candidate'],
  }), [main]);
  assert.ok(input.calls.some(args => args.includes('/repos/coreyt/coral/branches/main/protection')));
  assert.throws(() => check({ details: [main, tag(currentTag)] }), currentTagPattern);
  assert.deepEqual(check({ details: [main, tag('refs/tags/v0.2.6')] }), [main, tag('refs/tags/v0.2.6')]);
  assert.ok(readiness.validateTagCreation([tag('refs/tags/v0.2.6')], 'refs/tags/v0.2.6').length > 0);
});

test('operational preflight preserves branch, bypass, classic and unknown-rule refusal', () => {
  for (const details of [[], [{ ...main, bypass_actors: [{ actor_id: 1 }] }],
    [{ ...main, rules: [...main.rules, { type: 'pull_request' }] }],
    [main, { ...tag(currentTag), rules: [{ type: 'future-rule' }] }]]) {
    assert.throws(() => check({ details }));
  }
  assert.throws(() => check({ protection: { enforce_admins: { enabled: false } } }), /administrator bypass/);
  assert.throws(() => check({ protection: { enforce_admins: { enabled: true },
    required_pull_request_reviews: {} } }), /pull request reviews/);
});

test('classic protection transport/auth failures cannot masquerade as an absent policy', () => {
  for (const protection of [null, new Error('network failure'),
    Object.assign(absent(), { stderr: 'gh: Not Found (HTTP 403)' }),
    Object.assign(absent(), { stdout: '{"message":"Not Found","status":"404"}' }),
    Object.assign(absent(), { stdout: 'malformed' })]) {
    assert.throws(() => check({ protection }));
  }
});


test('operational ruleset inventory includes every API page before evaluating tag rules', () => {
  const command = readiness.rulesetSummaryCommand('coreyt/coral');
  assert.ok(command.includes('--paginate'));
  assert.ok(!command.includes('--slurp'));
  assert.match(command[command.indexOf('--jq') + 1], /^\.\[\] \|/);
  assert.throws(() => check({ laterPage: [tag(currentTag)] }), currentTagPattern);
  assert.deepEqual(readiness.parseRulesetSummaries('{"id":1}\n{"id":2}\n'), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(readiness.parseRulesetSummaries(''), []);
  assert.throws(() => readiness.parseRulesetSummaries('{"id":1}\nmalformed')); 
});

test('workflow policy refuses stale candidate identity', () => {
  const policy = JSON.parse(readFileSync('dev/release-policy.json'));
  policy.ci.candidateRef = 'refs/heads/release/0.2.6-candidate';
  const inputs = Object.fromEntries(Object.entries({ ci: 'ci.yml', publish: 'publish.yml',
    pages: 'pages.yml', pagesRestore: 'pages-restore.yml', release: 'release.yml' })
    .map(([name, file]) => [name, readFileSync(`.github/workflows/${file}`, 'utf8')]));
  inputs.dependabot = readFileSync('.github/dependabot.yml', 'utf8');
  assert.match(validatePolicy({ ...inputs, policy }).join('\n'), /CI tier/);
});
