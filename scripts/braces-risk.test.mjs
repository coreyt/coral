import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { workspaceAuditDecision } from './workspace-audit.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const approval = read('scripts/fixtures/audit/braces-risk-acceptance-0.2.8.json');
const report = read('scripts/fixtures/audit/dependency-audit-after-0.2.8.json');
const lock = read('package-lock.json');
const decide = (body = structuredClone(report), options = {}) => workspaceAuditDecision({
  startIndex: '0', result: { status: 1, stdout: JSON.stringify(body) },
  riskAcceptance: { approval, version: '0.2.8', lock, ...options },
});

test('HITL accepts the exact 0.2.8 braces risk while retaining raw counts', () => {
  const decision = decide();
  assert.equal(decision.outcome, 'accepted-risk');
  assert.equal(decision.highOrCritical, 5);
  assert.equal(decision.acceptedRisk.id, approval.id);
});

test('the braces decision refuses release/lock drift and production usage', () => {
  for (const options of [{ version: '0.2.9' }, { approval: null }]) {
    assert.equal(decide(undefined, options).outcome, 'blocked');
  }
  for (const mutate of [l => { l.packages['node_modules/braces'].integrity = 'changed'; },
    l => { l.packages['node_modules/braces'].dev = false; },
    l => { l.packages['node_modules/braces'].version = '3.0.4'; },
    l => { l.packages['node_modules/extra/node_modules/braces'] = l.packages['node_modules/braces']; }]) {
    const changed = structuredClone(lock); mutate(changed);
    assert.equal(decide(undefined, { lock: changed }).outcome, 'blocked');
  }
});

test('new/mixed/hidden advisories, graph changes and inconsistent reports still block', () => {
  const mutations = [
    r => { r.vulnerabilities.braces.via[0].source++; },
    r => { r.vulnerabilities.braces.via[0].severity = 'critical'; },
    r => { r.vulnerabilities.braces.via.push({ ...r.vulnerabilities.braces.via[0], url: 'https://github.com/advisories/NEW' }); },
    r => { r.vulnerabilities.katex.via.push({ ...r.vulnerabilities.braces.via[0] }); },
    r => { r.vulnerabilities.micromatch.via = ['globby']; },
    r => { delete r.vulnerabilities.braces; },
    r => { r.metadata.vulnerabilities.high = 0; },
    r => { r.metadata.vulnerabilities.total++; },
    r => { r.error = { code: 'EAUDIT' }; },
    r => { r.vulnerabilities.katex.severity = 'critical'; r.metadata.vulnerabilities.low--; r.metadata.vulnerabilities.critical++; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(report); mutate(changed);
    assert.equal(decide(changed).outcome, 'blocked');
  }
});

test('process failures and unreadable data refuse before publication; resume remains recorded', () => {
  for (const result of [{ status: 2, stdout: JSON.stringify(report) },
    { status: 1, error: new Error('network'), stdout: JSON.stringify(report) },
    { status: null, signal: 'SIGTERM', stdout: JSON.stringify(report) },
    { status: 1, stdout: 'not JSON' }]) {
    const input = { result, riskAcceptance: { approval, version: '0.2.8', lock } };
    assert.equal(workspaceAuditDecision({ ...input, startIndex: '0' }).outcome, 'blocked');
    assert.equal(workspaceAuditDecision({ ...input, startIndex: '2' }).outcome, 'recorded');
  }
});


test('an exact waiver cannot accept missing or invalid registry publication state', () => {
  for (const startIndex of [undefined, '', '-1', 'invalid', '7', '1.5']) {
    const decision = workspaceAuditDecision({ startIndex,
      result: { status: 1, stdout: JSON.stringify(report) },
      riskAcceptance: { approval, version: '0.2.8', lock } });
    assert.equal(decision.outcome, 'blocked', String(startIndex));
  }
});
