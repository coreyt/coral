import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkEnvironment, assertPerformanceBudget } from './performance-policy.mjs';
const host = { node: 'v24.1.0', platform: 'linux', arch: 'x64', cpu: 'fixture', logicalCpus: 8, memoryBytes: 1024 };
const profile = JSON.stringify({ ...host, isolation: 'exclusive', browserVersion: '123' });
const evaluate = (env, extra = {}) => benchmarkEnvironment({ env, host, warn() {}, ...extra });
test('local default and matching controlled self-hosted profile are strict', () => {
  assert.equal(evaluate({}).measure, true);
  assert.equal(evaluate({ GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted', CORAL_PERFORMANCE_PROFILE: profile }, { browserVersion: '123' }).measure, true);
});
test('unprofiled GitHub environments never measure and warn that nothing was measured', () => {
  for (const env of [{ GITHUB_ACTIONS: 'true' }, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' },
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', CORAL_PERFORMANCE_PROVENANCE: 'unknown' }]) {
    const warnings = [];
    const result = evaluate(env, { warn: (message) => warnings.push(message) });
    assert.equal(result.measure, false, JSON.stringify(env));
    assert.match(result.reason, /PERFORMANCE BENCHMARKS NOT MEASURED/);
    assert.deepEqual(warnings, [`::warning::${result.reason}`]);
  }
});
test('a declared controlled profile on a shared runner or with unknown provenance fails', () => {
  for (const env of [
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', CORAL_PERFORMANCE_PROFILE: profile },
    { GITHUB_ACTIONS: 'true', CORAL_PERFORMANCE_PROFILE: profile },
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted', CORAL_PERFORMANCE_PROFILE: profile,
      CORAL_PERFORMANCE_PROVENANCE: 'unknown' },
  ]) {
    const warnings = [];
    assert.throws(() => evaluate(env, { browserVersion: '123', warn: (message) => warnings.push(message) }),
      /self-hosted runner|contradicts unknown/, JSON.stringify(env));
    assert.deepEqual(warnings, [], 'an invalid control claim is never downgraded to a warning');
  }
  // A matching local profile stays strict.
  assert.equal(evaluate({ CORAL_PERFORMANCE_PROFILE: profile }, { browserVersion: '123' }).measure, true);
});
test('invalid and mismatched profiles fail before any downgrade', () => {
  for (const value of ['invalid', '{}', JSON.stringify({ ...host, node: 'wrong', isolation: 'exclusive' })]) {
    assert.throws(() => evaluate({ GITHUB_ACTIONS: 'true', CORAL_PERFORMANCE_PROFILE: value }));
  }
  assert.throws(() => evaluate({ CORAL_PERFORMANCE_PROFILE: profile }, { browserVersion: 'wrong' }), /browserVersion/);
  assert.throws(() => evaluate({ CORAL_PERFORMANCE_PROVENANCE: 'unknown' }), /only valid/);
});
test('valid complete samples enforce strict ceilings and distinguish budget failures', () => {
  const budget = { name: 'sample', samples: [1, 3, 2], expectedSamples: 3, limit: 3 };
  assert.equal(assertPerformanceBudget(budget), 3);
  assert.throws(() => assertPerformanceBudget({ ...budget, comparison: 'lt' }), /PERFORMANCE BENCHMARKS FAILED/);
  assert.throws(() => assertPerformanceBudget({ ...budget, limit: 2 }), /PERFORMANCE BENCHMARKS FAILED/);
  for (const samples of [[], [1], [1, NaN, 2], [1, Infinity, 2], [1, -1, 2], [1, '2', 3]]) {
    assert.throws(() => assertPerformanceBudget({ ...budget, samples }), /Invalid performance/);
  }
});
