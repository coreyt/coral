import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { checkInstalledDocumentConformance028 } from '../src/installedDocument028.js';

const graph = (targets: readonly string[], explicit = false): GraphIR => ({
  version: '3.0.0', id: 'flowchart', metadata: { notation: 'flowchart' },
  nodes: [
    { id: 'entry', type: 'process' },
    { id: 'decision', type: explicit ? 'service' : 'decision',
      ...(explicit ? { symbol: 'flowchart-decision' } : {}) },
    ...targets.map((id) => ({ id, type: 'process' })),
  ],
  edges: [{ id: 'enter', source: 'entry', target: 'decision' },
    ...targets.map((target, index) => ({ id: `branch-${index}`, source: 'decision', target }))],
});

describe('approved flowchart decision rule', () => {
  it.each([0, 2])('reports a decision with %i entries only in strict checking', (entries) => {
    const draft: GraphIR = {
      ...graph(['approve', 'reject']),
      nodes: [
        ...graph(['approve', 'reject']).nodes.filter((node) => node.id !== 'entry'),
        ...Array.from({ length: entries }, (_, index) => ({ id: `incoming-${index}`, type: 'process' })),
      ],
      edges: [
        ...graph(['approve', 'reject']).edges.filter((edge) => edge.id !== 'enter'),
        ...Array.from({ length: entries }, (_, index) => ({ id: `entry-${index}`,
          source: `incoming-${index}`, target: 'decision' })),
      ],
    };
    expect(checkGraphConformance028(draft, { savedLevel: 'typical' }).findings).toEqual([]);
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.FLOWCHART.DECISION.SINGLE_ENTRY', severity: 'error',
      subject: { kind: 'node', id: 'decision' },
    }));
  });

  it('reports a one-exit decision only on a strict check without altering the graph', () => {
    const draft = graph(['approve']);
    const original = structuredClone(draft);
    expect(checkGraphConformance028(draft, { savedLevel: 'typical' }).findings).toEqual([]);
    const strict = checkGraphConformance028(draft,
      { savedLevel: 'typical', requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings).toMatchObject([{ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES',
      subject: { kind: 'node', id: 'decision' }, severity: 'error',
      evidenceScope: 'node', remediation: expect.stringContaining('exit') }]);
    expect(strict.findings[0]?.provenance?.kind).toBe('coral');
    expect(strict.claimStatus).toBe('failed');
    expect(draft).toEqual(original);
  });

  it('permits four alternatives and recognizes an explicitly selected decision symbol', () => {
    const targets = ['a', 'b', 'c', 'd'];
    expect(checkGraphConformance028(graph(targets), { requestedLevel: 'strict' }).findings).toEqual([]);
    expect(checkGraphConformance028(graph(targets, true), { requestedLevel: 'strict' }).findings).toEqual([]);
  });

  it('counts a reverse-arrow flow by arrow direction without reversing stored endpoint identities', () => {
    const draft: GraphIR = { ...graph(['approve', 'reject']), edges: [
      { id: 'enter', source: 'decision', target: 'entry', type: 'flow',
        sourceEnd: { marker: { kind: 'arrow', fill: 'open' } } },
      { id: 'approve', source: 'approve', target: 'decision', type: 'flow',
        sourceEnd: { marker: { kind: 'arrow', fill: 'open' } } },
      { id: 'reject', source: 'reject', target: 'decision', type: 'flow',
        sourceEnd: { marker: { kind: 'arrow', fill: 'open' } } },
    ] };
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict' });
    expect(report.findings).toEqual([]);
    expect(draft.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['decision', 'entry'], ['approve', 'decision'], ['reject', 'decision'],
    ]);
  });

  it('counts a source-owned reverse flow even when a rare end hides its arrowhead', () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'entry process\nreview decision\napprove process\nreject process\n' +
      'review <- entry [flow, firstEnd: zeroOrOne]\n' +
      'review -> approve [flow]\nreview -> reject [flow]';
    const checked = checkInstalledDocumentConformance028(source);
    expect(checked.report?.findings.map((finding) => finding.id))
      .not.toContain('CORAL.FLOWCHART.DECISION.SINGLE_ENTRY');
    expect(checked.report?.findings.map((finding) => finding.id))
      .not.toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(checked.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
    }));
  });

  it('leaves decision cardinality unverified when an incident flow has arrows at both ends', () => {
    const draft: GraphIR = { ...graph(['approve']),
      nodes: [...graph(['approve']).nodes, { id: 'other', type: 'process' }],
      edges: [...graph(['approve']).edges, { id: 'ambiguous', source: 'other', target: 'decision', type: 'flow',
        sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } },
      }],
    };
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.map((finding) => finding.id)).not.toContain('CORAL.FLOWCHART.DECISION.SINGLE_ENTRY');
    expect(report.findings.map((finding) => finding.id)).not.toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(report.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'FLOWCHART.DECISION.TWO_ENDED_FLOW.UNVERIFIED', message: expect.stringContaining('ambiguous'),
    }));
    expect(report.claimStatus).toBe('unverified');
  });

  it('does not count an explicitly neutral flow as a known decision exit', () => {
    const draft: GraphIR = { ...graph(['approve']),
      nodes: [...graph(['approve']).nodes, { id: 'reject', type: 'process' }],
      edges: [...graph(['approve']).edges, { id: 'neutral', source: 'decision', target: 'reject', type: 'flow',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      }],
    };
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.map((finding) => finding.id)).not.toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(report.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'FLOWCHART.DECISION.NEUTRAL_FLOW.UNVERIFIED', message: expect.stringContaining('Direction-unspecified'),
    }));
    expect(report.claimStatus).toBe('unverified');
  });

  it('still fails when one neutral flow cannot provide two alternative exits', () => {
    const draft: GraphIR = { ...graph([]),
      nodes: [...graph([]).nodes, { id: 'target', type: 'process' }],
      edges: [graph([]).edges[0]!, { id: 'neutral', source: 'decision', target: 'target', type: 'flow',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      }],
    };
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES', severity: 'error',
    }));
    expect(report.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'FLOWCHART.DECISION.NEUTRAL_FLOW.UNVERIFIED',
    }));
    expect(report.claimStatus).toBe('failed');
  });

  it('still reports cardinality failures that ambiguous flow cannot repair', () => {
    const draft: GraphIR = { ...graph([]),
      nodes: [...graph([]).nodes, { id: 'entryTwo', type: 'process' }, { id: 'other', type: 'process' }],
      edges: [
        { id: 'enterOne', source: 'entry', target: 'decision', type: 'flow' },
        { id: 'enterTwo', source: 'entryTwo', target: 'decision', type: 'flow' },
        { id: 'ambiguous', source: 'other', target: 'decision', type: 'flow',
          sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
          targetEnd: { marker: { kind: 'arrow', fill: 'open' } } },
      ],
    };
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.map((finding) => finding.id)).toContain('CORAL.FLOWCHART.DECISION.SINGLE_ENTRY');
    expect(report.findings.map((finding) => finding.id)).toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(report.claimStatus).toBe('failed');
  });

  it('does not count annotation links as flow entries or alternatives', () => {
    const draft: GraphIR = {
      ...graph(['approve']),
      nodes: [...graph(['approve']).nodes, { id: 'note', type: 'note' }],
      edges: [
        { id: 'annotates-entry', source: 'note', target: 'decision', type: 'annotation' },
        { id: 'annotates-exit', source: 'decision', target: 'note', type: 'annotation' },
        { id: 'only-flow-exit', source: 'decision', target: 'approve', type: 'flow' },
      ],
    };
    const report = checkGraphConformance028(draft, { requestedLevel: 'strict' });
    expect(report.findings.map((finding) => finding.id)).toContain('CORAL.FLOWCHART.DECISION.SINGLE_ENTRY');
    expect(report.findings.map((finding) => finding.id)).toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
  });

  it('does not invent branch labels while certifying the bounded count checks', () => {
    const report = checkGraphConformance028(graph(['yes', 'no']),
      { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings).toEqual([]);
    expect(report.claimStatus).toBe('conformant');
    expect(report.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(report.unverifiedObligations).toEqual([]);
  });

  it('checks a decision nested in a group using its graph-wide outgoing edges', () => {
    const nested: GraphIR = { ...graph(['approve']), nodes: [
      { id: 'team', type: 'group', children: [
        { id: 'decision', type: 'decision', parent: 'team' },
      ] },
      { id: 'entry', type: 'process' },
      { id: 'approve', type: 'process' },
    ] };
    const report = checkGraphConformance028(nested, { requestedLevel: 'strict' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES',
      subject: { kind: 'node', id: 'decision' },
    }));
  });
});
