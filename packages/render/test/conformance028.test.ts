import { describe, expect, it } from 'vitest';
import { evaluateConformance028, runRuleset028, type RuleFinding, type RulesetDefinition } from '../src/conformance028.js';

const findings: RuleFinding[] = [
  { id: 'symbol', category: 'notation', minimumLevel: 'typical', severity: 'warning',
    message: 'Unexpected symbol', causes: [{ kind: 'explicit-symbol', nodeId: 'a', symbol: 'foreign' }] },
  { id: 'branch', category: 'notation', minimumLevel: 'strict', severity: 'error', message: 'Missing branch' },
  { id: 'syntax', category: 'syntax', severity: 'error', message: 'Bad quote' },
];

describe('0.2.8 conformance and notification axes', () => {
  it('keeps independent syntax errors at none and filters ordinary notices by default', () => {
    const report = evaluateConformance028({ savedLevel: 'none' }, findings);
    expect(report.findings.map((item) => item.id)).toEqual(['syntax']);
    expect(report.notices.map((item) => item.id)).toEqual(['syntax']);
  });

  it('uses saved typical by default without silently enabling strict findings', () => {
    const report = evaluateConformance028({ savedLevel: 'typical' }, findings);
    expect(report.findings.map((item) => item.id)).toEqual(['symbol', 'syntax']);
    expect(report.notices.map((item) => item.id)).toEqual(['syntax']);
  });

  it('allows a one-off strict check and full findings independent of notice filtering', () => {
    const report = evaluateConformance028({ savedLevel: 'typical', requestedLevel: 'strict' }, findings);
    expect(report.evaluatedLevel).toBe('strict');
    expect(report.findings.map((item) => item.id)).toEqual(['symbol', 'branch', 'syntax']);
    expect(report.notices.map((item) => item.id)).toEqual(['branch', 'syntax']);
  });

  it('keeps ordinary save quiet for notation findings', () => {
    const report = evaluateConformance028({ savedLevel: 'strict', operation: 'save', notificationLevel: 'debug' }, findings);
    expect(report.findings.map((item) => item.id)).toEqual(['symbol', 'branch', 'syntax']);
    expect(report.notices.map((item) => item.id)).toEqual(['syntax']);
  });

  it('downgrades only a strict error caused solely by the matching explicit symbol', () => {
    const input: RuleFinding[] = [
      { id: 'dependent', category: 'notation', minimumLevel: 'strict', severity: 'error', message: 'Foreign symbol rule',
        causes: [{ kind: 'explicit-symbol', nodeId: 'a', symbol: 'foreign' }] },
      { id: 'independent', category: 'notation', minimumLevel: 'strict', severity: 'error', message: 'Missing branch' },
      { id: 'integrity', category: 'integrity', severity: 'error', message: 'Bad reference',
        causes: [{ kind: 'explicit-symbol', nodeId: 'a', symbol: 'foreign' }] },
    ];
    const report = evaluateConformance028({ savedLevel: 'strict', notificationLevel: 'warning' }, input,
      [{ nodeId: 'a', symbol: 'foreign' }]);
    expect(report.findings.map((item) => [item.id, item.severity])).toEqual([
      ['dependent', 'warning'], ['independent', 'error'], ['integrity', 'error'],
    ]);
  });

  it('does not use a stale or partially causal exception', () => {
    const input: RuleFinding[] = [
      { id: 'stale', category: 'notation', minimumLevel: 'strict', severity: 'error', message: 'Foreign symbol',
        causes: [{ kind: 'explicit-symbol', nodeId: 'a', symbol: 'other' }] },
      { id: 'mixed', category: 'notation', minimumLevel: 'strict', severity: 'error', message: 'Two causes',
        causes: [{ kind: 'explicit-symbol', nodeId: 'a', symbol: 'foreign' },
          { kind: 'other', key: 'missing-branch' }] },
    ];
    const report = evaluateConformance028({ savedLevel: 'strict' }, input, [{ nodeId: 'a', symbol: 'foreign' }]);
    expect(report.findings.map((item) => item.severity)).toEqual(['error', 'error']);
  });

  it('downgrades a joint finding only when every explicit-symbol cause has its own exception', () => {
    const input: RuleFinding[] = [{ id: 'joint', category: 'notation', minimumLevel: 'strict',
      severity: 'error', message: 'Two out-of-set symbols', causes: [
        { kind: 'explicit-symbol', nodeId: 'a', symbol: 'foreign-a' },
        { kind: 'explicit-symbol', nodeId: 'b', symbol: 'foreign-b' },
      ] }];
    const one = evaluateConformance028({ savedLevel: 'strict' }, input,
      [{ nodeId: 'a', symbol: 'foreign-a' }]);
    const both = evaluateConformance028({ savedLevel: 'strict' }, input,
      [{ nodeId: 'a', symbol: 'foreign-a' }, { nodeId: 'b', symbol: 'foreign-b' }]);
    expect(one.findings[0]?.severity).toBe('error');
    expect(both.findings[0]?.severity).toBe('warning');
  });

  it('runs profile-specific typical and strict rules from a versioned definition', () => {
    const ruleset: RulesetDefinition<{ branches: number }> = {
      id: 'flowchart', profileId: 'flowchart', version: 'test-1', rules: [
        { id: 'missing-branch', minimumLevel: 'typical', severity: 'warning',
          provenance: { kind: 'coral', reference: 'test-card' },
          evidenceScope: 'graph', remediation: 'Add an outgoing branch.',
          check: (graph) => graph.branches < 1 ? [{ message: 'No branch' }] : [] },
        { id: 'canonical-branch', minimumLevel: 'strict', severity: 'error',
          provenance: { kind: 'standard', reference: 'test-edition' },
          evidenceScope: 'graph', remediation: 'Add a second branch.',
          check: (graph) => graph.branches < 2 ? [{ message: 'Too few branches' }] : [] },
      ],
    };
    const typical = runRuleset028('flowchart', { branches: 0 }, ruleset, {});
    expect(typical.evaluatedLevel).toBe('typical');
    expect(typical.findings.map((item) => item.id)).toEqual(['missing-branch']);
    const strict = runRuleset028('flowchart', { branches: 0 }, ruleset, { requestedLevel: 'strict' });
    expect(strict.findings.map((item) => item.id)).toEqual(['missing-branch', 'canonical-branch']);
    expect(strict.findings[0]).toMatchObject({ evidenceScope: 'graph',
      remediation: 'Add an outgoing branch.' });
    expect(strict.ruleset).toEqual({ id: 'flowchart', profileId: 'flowchart', version: 'test-1' });
    expect(() => runRuleset028('bpmn', { branches: 0 }, ruleset, {})).toThrow(/profile/i);
  });

  it('rejects duplicate rule identities and incomplete rule evidence before issuing a report', () => {
    const base: RulesetDefinition<null> = {
      id: 'flowchart-card', profileId: 'flowchart', version: '0.2.8',
      rules: [{ id: 'FLOW.ONE', minimumLevel: 'typical', severity: 'warning',
        provenance: { kind: 'coral', reference: 'Coral flowchart policy' },
        evidenceScope: 'edge', remediation: 'Choose a flow edge.', check: () => [] }],
    };
    expect(() => runRuleset028('flowchart', null,
      { ...base, rules: [...base.rules, base.rules[0]!] }, {})).toThrow(/duplicate.*FLOW.ONE/i);
    expect(() => runRuleset028('flowchart', null,
      { ...base, rules: [{ ...base.rules[0]!, provenance: { kind: 'coral', reference: ' ' } }] }, {}))
      .toThrow(/provenance/i);
    expect(() => runRuleset028('flowchart', null,
      { ...base, rules: [{ ...base.rules[0]!, remediation: '' }] }, {}))
      .toThrow(/remediation/i);
  });

  it('uses a quiet typical warning and a strict error for one reviewed rule', () => {
    const ruleset: RulesetDefinition<{ mismatch: boolean }> = {
      id: 'dual-level', profileId: 'flowchart', version: 'test-1', rules: [{
        id: 'symbol-mismatch', minimumLevel: 'typical', severity: 'warning', strictSeverity: 'error',
        provenance: { kind: 'coral', reference: 'test-card' },
        evidenceScope: 'graph', remediation: 'Choose a matching symbol.',
        check: (context) => context.mismatch ? [{ message: 'Symbol mismatch' }] : [],
      }],
    };
    const typical = runRuleset028('flowchart', { mismatch: true }, ruleset, {});
    expect(typical.findings).toMatchObject([{ severity: 'warning' }]);
    expect(typical.notices).toEqual([]);
    const strict = runRuleset028('flowchart', { mismatch: true }, ruleset,
      { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings).toMatchObject([{ severity: 'error' }]);
    expect(strict.notices).toMatchObject([{ severity: 'error' }]);
  });

  it('does not certify strict conformance with only a partial rule card', () => {
    const partial: RulesetDefinition<{ valid: boolean }> = {
      id: 'partial', profileId: 'flowchart', version: '1', coverage: 'partial', rules: [],
      obligations: [{ id: 'flowchart.remaining', message: 'Remaining flowchart clauses are unverified' }],
    };
    const report = runRuleset028('flowchart', { valid: true }, partial,
      { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings).toEqual([]);
    expect(report.unverifiedObligations).toMatchObject([{ id: 'flowchart.remaining' }]);
    expect(report.claimStatus).toBe('unverified');
    expect(runRuleset028('flowchart', { valid: true }, { ...partial, coverage: 'complete', obligations: [] },
      { requestedLevel: 'strict', operation: 'check' }).claimStatus).toBe('conformant');
  });

  it('does not certify a complete ruleset while an independent port obligation remains', () => {
    const complete: RulesetDefinition<null> = {
      id: 'complete', profileId: 'flowchart', version: '1', coverage: 'complete', rules: [],
    };
    const report = runRuleset028('flowchart', null, complete,
      { requestedLevel: 'strict', operation: 'check', notificationLevel: 'debug' },
      [], [], [{ id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: 'Port identity awaits a catalog' }]);
    expect(report.findings).toEqual([]);
    expect(report.unverifiedObligations).toEqual([{ id: 'CORAL.PORT.REFERENCE.UNVERIFIED',
      message: 'Port identity awaits a catalog' }]);
    expect(report.claimStatus).toBe('unverified');
  });

  it('reports exactly which strict findings a declared exception affected', () => {
    const input: RuleFinding[] = [{ id: 'dependent', category: 'notation', minimumLevel: 'strict',
      severity: 'error', message: 'Foreign symbol', causes: [
        { kind: 'explicit-symbol', nodeId: 'a', symbol: 'foreign' },
      ] }];
    const report = evaluateConformance028({ requestedLevel: 'strict', operation: 'check' }, input,
      [{ nodeId: 'a', symbol: 'foreign' }, { nodeId: 'b', symbol: 'stale' }]);
    expect(report.exceptions).toEqual([
      { nodeId: 'a', symbol: 'foreign', affectedRuleIds: ['dependent'] },
      { nodeId: 'b', symbol: 'stale', affectedRuleIds: [] },
    ]);
    expect(report.claimStatus).toBe('unverified');
  });
});
