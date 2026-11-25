import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { workspaceAuditDecision } from './workspace-audit.mjs';

// CRO100-16: before any package is published the workspace audit blocks on a
// high or critical advisory; once a published prefix exists (a resume) an
// advisory disclosed after partial publication is recorded, not blocking, so
// the remaining packages of the immutable set can still be published.
const report = vulnerabilities => ({ status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities } }) });

test('the workspace audit blocks only before any package is published (CRO100-16)', () => {
  const high = report({ low: 0, moderate: 1, high: 1, critical: 0, total: 2 });
  const clean = { status: 0, stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } }) };
  assert.deepEqual(workspaceAuditDecision({ startIndex: '0', result: high }), {
    schemaVersion: 1, startIndex: 0, blocking: true, exitStatus: 1,
    vulnerabilities: { low: 0, moderate: 1, high: 1, critical: 0, total: 2 }, highOrCritical: 1, outcome: 'blocked',
  });
  assert.equal(workspaceAuditDecision({ startIndex: '0', result: clean }).outcome, 'pass');
  assert.equal(workspaceAuditDecision({ startIndex: '3', result: high }).outcome, 'recorded');
  assert.equal(workspaceAuditDecision({ startIndex: '3', result: high }).blocking, false);
  assert.equal(workspaceAuditDecision({ startIndex: '3', result: clean }).outcome, 'pass');
  // Fail closed: an unreadable audit or an unknown start index blocks.
  const unavailable = { status: 1, stdout: 'npm error audit endpoint returned an error' };
  assert.equal(workspaceAuditDecision({ startIndex: '0', result: unavailable }).outcome, 'blocked');
  assert.equal(workspaceAuditDecision({ startIndex: '2', result: unavailable }).outcome, 'recorded');
  for (const startIndex of [undefined, '', '-1', 'x', '7', '1.5']) {
    const decision = workspaceAuditDecision({ startIndex, result: high });
    assert.equal(decision.blocking, true, String(startIndex));
    assert.equal(decision.outcome, 'blocked', String(startIndex));
  }
});

test('a fresh 0.2.9 audit refuses inherited approval, new and mixed findings with raw counts visible', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
  const original = read('scripts/fixtures/audit/dependency-audit-after-0.2.8.json');
  const approval = read('scripts/fixtures/audit/braces-risk-acceptance-0.2.8.json');
  for (const body of [original, { ...original, vulnerabilities: { ...original.vulnerabilities,
    unknown: { name: 'unknown', severity: 'critical', nodes: ['node_modules/unknown'],
      via: [{ name: 'unknown', severity: 'critical', source: 9999999 }] } },
    metadata: { vulnerabilities: { ...original.metadata.vulnerabilities,
      critical: 1, total: original.metadata.vulnerabilities.total + 1 } } }]) {
    const decision = workspaceAuditDecision({ startIndex: '0',
      result: { status: 1, stdout: JSON.stringify(body) },
      riskAcceptance: { version: '0.2.9', approval, lock: read('package-lock.json') } });
    assert.equal(decision.outcome, 'blocked');
    assert.equal(decision.acceptedRisk, null);
    assert.deepEqual(decision.vulnerabilities, body.metadata.vulnerabilities);
  }
});

test('missing, malformed and hidden audit findings cannot masquerade as clean without an approval', () => {
  const clean = { auditReportVersion: 2, vulnerabilities: {}, metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };
  for (const mutate of [
    r => { delete r.vulnerabilities; },
    r => { delete r.auditReportVersion; },
    r => { r.error = { code: 'EAUDIT' }; },
    r => { r.metadata.vulnerabilities.high = -1; },
    r => { r.metadata.vulnerabilities.high = '0'; },
    r => { r.metadata.vulnerabilities.total = 1; },
    r => { r.vulnerabilities.hidden = { name: 'hidden', severity: 'high', via: ['absent'], nodes: [] }; },
  ]) {
    const body = structuredClone(clean); mutate(body);
    assert.equal(workspaceAuditDecision({ startIndex: '0',
      result: { status: 0, stdout: JSON.stringify(body) } }).outcome, 'blocked');
  }
  for (const failure of [{ status: 2 }, { status: null, signal: 'SIGTERM' }, { status: 0, error: new Error('spawn') }]) {
    assert.equal(workspaceAuditDecision({ startIndex: '0', result: { ...failure,
      stdout: JSON.stringify(clean) } }).outcome, 'blocked');
  }
});

test('the real audit command preserves raw findings and blocks 0.2.9 before publication', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coral-audit-'));
  try {
    const raw = readFileSync(new URL('../scripts/fixtures/audit/dependency-audit-after-0.2.8.json', import.meta.url), 'utf8');
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '0.2.9' }));
    const fakeNpm = join(directory, 'npm.mjs');
    writeFileSync(fakeNpm, `process.stdout.write(${JSON.stringify(raw)}); process.exitCode = 1;`);
    const result = spawnSync(process.execPath, [resolve('scripts/workspace-audit.mjs'), '--ci'], {
      cwd: directory, env: { ...process.env, npm_execpath: fakeNpm }, encoding: 'utf8',
    });
    assert.match(result.stderr, /Workspace audit blocks publication/, result.stderr);
    assert.notEqual(result.status, 0);
    assert.ok(result.stdout.startsWith(raw), `the complete original report remains visible: ${result.stderr}`);
    const decision = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(decision.outcome, 'blocked');
    assert.deepEqual(decision.vulnerabilities, JSON.parse(raw).metadata.vulnerabilities);
    assert.doesNotMatch(result.stdout, /accepted-risk|HITL accepted/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the new 0.2.9 HITL decision accepts only its exact unexpired five-entry dev graph', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
  const approval = read('scripts/fixtures/audit/braces-risk-acceptance-0.2.9.json');
  const lock = read('package-lock.json');
  const body = { auditReportVersion: 2, vulnerabilities: structuredClone(approval.highFindings),
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } } };
  const decide = (report = body, acceptance = {}, now = Date.parse('2026-10-18T00:00:00Z')) => workspaceAuditDecision({
    startIndex: '0', result: { status: 1, stdout: JSON.stringify(report) }, now,
    riskAcceptance: { version: '0.2.9', approval, lock, ...acceptance },
  });
  const accepted = decide();
  assert.equal(accepted.outcome, 'accepted-risk');
  assert.equal(accepted.acceptedRisk.id, approval.id);
  assert.equal(accepted.highOrCritical, 5);
  assert.deepEqual(accepted.vulnerabilities, body.metadata.vulnerabilities);
  assert.equal(decide(body, {}, Date.parse(approval.expiresAt) + 1).outcome, 'blocked');
  assert.equal(decide(body, { approval: { ...approval, expiresAt: null } }).outcome, 'blocked');
  assert.equal(decide(body, { approval: read('scripts/fixtures/audit/braces-risk-acceptance-0.2.8.json') }).outcome, 'blocked');
  assert.equal(decide({ auditReportVersion: 2, vulnerabilities: {
    new: { name: 'new', severity: 'low', nodes: ['node_modules/new'],
      via: [{ name: 'new', severity: 'low', source: 9999999 }] },
  }, metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0, total: 1 } } }).outcome, 'pass');
  for (const mutate of [
    r => { r.metadata.vulnerabilities.high = 0; },
    r => { r.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces'); },
    r => { r.vulnerabilities.braces.via[0].source++; },
    r => { r.vulnerabilities.new = { name: 'new', severity: 'low', nodes: ['node_modules/new'],
      via: [{ name: 'new', severity: 'low', source: 9999999 }] };
      r.metadata.vulnerabilities.low++; r.metadata.vulnerabilities.total++; },
  ]) {
    const changed = structuredClone(body); mutate(changed);
    assert.equal(decide(changed).outcome, 'blocked');
  }
  for (const mutate of [l => { l.packages['node_modules/braces'].integrity = 'changed'; },
    l => { l.packages['node_modules/braces'].dev = false; },
    l => { l.packages['node_modules/extra/node_modules/braces'] = l.packages['node_modules/braces']; }]) {
    const changed = structuredClone(lock); mutate(changed);
    assert.equal(decide(body, { lock: changed }).outcome, 'blocked');
  }
});

// npm audit can represent a peer dependency as a cycle even when every
// finding ultimately reaches the same advisory (ESLint's real report does).
const moderatePeerCycle = () => ({ auditReportVersion: 2, vulnerabilities: {
  eslint: { name: 'eslint', severity: 'moderate', nodes: ['node_modules/eslint'],
    via: ['eslint-utils', 'minimatch'] },
  'eslint-utils': { name: 'eslint-utils', severity: 'moderate', nodes: ['node_modules/eslint-utils'],
    via: ['eslint'] },
  minimatch: { name: 'minimatch', severity: 'moderate', nodes: ['node_modules/minimatch'],
    via: [{ name: 'minimatch', severity: 'moderate', source: 9999999 }] },
}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 3, high: 0, critical: 0, total: 3 } } });

test('a moderate peer cycle with an advisory passes without using a risk waiver', () => {
  const body = moderatePeerCycle();
  const decision = workspaceAuditDecision({ startIndex: '0',
    result: { status: 1, stdout: JSON.stringify(body) },
    riskAcceptance: { version: '0.2.9' } });
  assert.equal(decision.outcome, 'pass');
  assert.equal(decision.acceptedRisk, null);
  assert.deepEqual(decision.vulnerabilities, body.metadata.vulnerabilities);
});

test('peer cycles cannot hide missing advisories, references, severity or counts', () => {
  for (const mutate of [
    r => { r.vulnerabilities.eslint.via = ['eslint-utils']; },
    r => { r.vulnerabilities.eslint.via.push('absent'); },
    r => { r.vulnerabilities.eslint.via.push('constructor'); },
    r => { r.vulnerabilities.eslint.via.push('toString'); },
    r => { r.vulnerabilities.minimatch.via[0].severity = 'high'; },
    r => { r.metadata.vulnerabilities.moderate--; },
    r => { r.metadata.vulnerabilities.total++; },
  ]) {
    const body = moderatePeerCycle(); mutate(body);
    assert.equal(workspaceAuditDecision({ startIndex: '0',
      result: { status: 1, stdout: JSON.stringify(body) },
      riskAcceptance: { version: '0.2.9' } }).outcome, 'blocked');
  }
});

test('high peer cycles still block and cannot expand the exact braces waiver', () => {
  const body = moderatePeerCycle();
  body.vulnerabilities.minimatch.severity = 'high';
  body.vulnerabilities.minimatch.via[0].severity = 'high';
  body.vulnerabilities.eslint.severity = 'high';
  body.vulnerabilities['eslint-utils'].severity = 'high';
  body.metadata.vulnerabilities.moderate = 0;
  body.metadata.vulnerabilities.high = 3;
  assert.equal(workspaceAuditDecision({ startIndex: '0',
    result: { status: 1, stdout: JSON.stringify(body) },
    riskAcceptance: { version: '0.2.9' } }).outcome, 'blocked');

  const approval = JSON.parse(readFileSync(new URL('../scripts/fixtures/audit/braces-risk-acceptance-0.2.9.json', import.meta.url)));
  const mixed = moderatePeerCycle();
  Object.assign(mixed.vulnerabilities, structuredClone(approval.highFindings));
  mixed.metadata.vulnerabilities.high = 5;
  mixed.metadata.vulnerabilities.total += 5;
  assert.equal(workspaceAuditDecision({ startIndex: '0',
    result: { status: 1, stdout: JSON.stringify(mixed) },
    now: Date.parse('2026-10-18T00:00:00Z'),
    riskAcceptance: { version: '0.2.9', approval,
      lock: JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url))) } }).outcome, 'blocked');
});
