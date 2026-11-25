import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { notationCatalogIdentity028, resolveNotationNode028 } from '../src/notations/index.js';
import { resolveRenderScene } from '../src/scene.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';

const graph: GraphIR = { version: '3.0.0', id: 'foreign-symbol',
  metadata: { notation: 'flowchart' }, nodes: [
    { id: 'api', type: 'process', symbol: 'arch-service' },
  ], edges: [] };

describe('0.2.8 graph-level conformance integration', () => {
  it('does not validate port references using a stale source interpretation sidecar', () => {
    const display: GraphIR = { version: '3.0.0', id: 'stale-sidecar',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', symbol: 'arch-database' },
        { id: 'db', type: 'database' }],
      edges: [{ id: 'audit', source: 'api', target: 'db', sourcePort: 'audit' }],
    };
    const stale = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' },
      catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', symbol: 'arch-service', semanticPorts: [
        { id: 'audit', direction: 'out' },
      ] }, { id: 'db', type: 'database' }],
    });
    const report = checkGraphConformance028(display,
      { requestedLevel: 'strict', operation: 'check' }, [], undefined,
      { semanticInterpretations: stale });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SEMANTIC_SIDECAR.MISMATCH', category: 'capability', severity: 'error',
      subject: { kind: 'node', id: 'api' },
    }));
    expect(report.claimStatus).toBe('failed');
    const none = checkGraphConformance028(display,
      { requestedLevel: 'none', operation: 'check' }, [], undefined,
      { semanticInterpretations: stale });
    expect(none.findings.map((finding) => finding.id)).toContain('CORAL.SEMANTIC_SIDECAR.MISMATCH');
  });
  it('keeps a known foreign symbol authored, quiet by default in typical, and an error in strict', () => {
    const original = structuredClone(graph);
    const typical = checkGraphConformance028(graph, { savedLevel: 'typical' });
    const strict = checkGraphConformance028(graph,
      { savedLevel: 'typical', requestedLevel: 'strict' });
    expect(typical.findings).toMatchObject([{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE',
      severity: 'warning' }]);
    expect(typical.notices).toEqual([]);
    expect(checkGraphConformance028(graph,
      { savedLevel: 'typical', notificationLevel: 'warning' }).notices)
      .toMatchObject([{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }]);
    expect(strict.findings).toMatchObject([{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE',
      severity: 'error', subject: { kind: 'node', id: 'api' },
      evidenceScope: 'node', remediation: expect.stringContaining('symbol'),
      causes: [{ kind: 'explicit-symbol', nodeId: 'api', symbol: 'arch-service' }] }]);
    expect(strict.catalog).toMatchObject({ id: 'flowchart', version: expect.any(String),
      digest: expect.stringMatching(/^sha256-[0-9a-f]{64}$/) });
    expect(strict.ruleset).toMatchObject({ profileId: 'flowchart' });
    expect(resolveNotationNode028(graph.nodes[0]!, 'flowchart').effectiveSymbolId).toBe('arch-service');
    expect(resolveRenderScene(graph).nodes[0]?.symbolId).toBe('arch-service');
    expect(graph).toEqual(original);
  });

  it('downgrades only a matching scoped strict violation and keeps the full report on save', () => {
    const report = checkGraphConformance028(graph,
      { savedLevel: 'strict', operation: 'save' }, [{ nodeId: 'api', symbol: 'arch-service' }]);
    expect(report.findings).toMatchObject([{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }]);
    expect(report.notices).toEqual([]);
    const stale = checkGraphConformance028(graph,
      { savedLevel: 'strict' }, [{ nodeId: 'api', symbol: 'arch-database' }]);
    expect(stale.findings[0]?.severity).toBe('error');
  });

  it('runs the approved BPMN generic-event rule through the same entry point', () => {
    const bpmn: GraphIR = { version: '3.0.0', id: 'bpmn', metadata: { notation: 'bpmn' },
      nodes: [{ id: 'start', type: 'event' }], edges: [] };
    const report = checkGraphConformance028(bpmn, { requestedLevel: 'strict' });
    expect(report.findings.map((finding) => finding.id)).toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
  });

  it('does not infer a concrete BPMN event kind from an explicit visual symbol', () => {
    const bpmn: GraphIR = { version: '3.0.0', id: 'bpmn-glyph', metadata: { notation: 'bpmn' },
      nodes: [{ id: 'event', type: 'event', symbol: 'bpmn-start-event' }], edges: [] };
    const typical = checkGraphConformance028(bpmn, { savedLevel: 'typical' });
    expect(typical.findings).toEqual([]);
    const strict = checkGraphConformance028(bpmn, { requestedLevel: 'strict' });
    expect(strict.findings).toContainEqual(expect.objectContaining({
      id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED', category: 'notation',
      subject: { kind: 'node', id: 'event' }, severity: 'error',
    }));
    expect(bpmn.nodes[0]?.type).toBe('event');
  });

  it.each([
    ['malformed nodes', { version: '3.0.0', id: 'bad-nodes', metadata: { notation: 'bpmn' },
      nodes: 'not-an-array', edges: [] }, '/nodes'],
    ['malformed edges', { version: '3.0.0', id: 'bad-edges', metadata: { notation: 'bpmn' },
      nodes: [], edges: 'not-an-array' }, '/edges'],
    ['missing graph', null, ''],
  ] as const)('reports %s without entering a profile rule card', (_name, malformed, path) => {
    const report = checkGraphConformance028(malformed as GraphIR,
      { requestedLevel: 'strict', notificationLevel: 'debug', operation: 'check' });
    expect(report.claimStatus).toBe('failed');
    expect(report.findings).toContainEqual(expect.objectContaining({
      category: 'integrity', severity: 'error', path,
    }));
    expect(report.notices).toEqual(report.findings);
    expect(report.ruleset).toBeUndefined();
  });

  it('keeps sequence type/operator mismatches as quiet typical findings and strict errors', () => {
    const sequence: GraphIR = { version: '3.0.0', id: 'sequence',
      metadata: { notation: 'uml-sequence' },
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'client', type: 'participant' }, { id: 'server', type: 'participant' }],
      edges: [
        { id: 'wrong', source: 'client', target: 'server', type: 'async' },
        { id: 'right', source: 'server', target: 'client', type: 'return' },
      ],
      interaction: { participants: [{ id: 'client', nodeId: 'client' }, { id: 'server', nodeId: 'server' }],
        participantOrder: ['client', 'server'],
        messages: [
          { id: 'wrong', edgeId: 'wrong', sourceParticipantId: 'client',
            targetParticipantId: 'server', kind: 'synchronous' },
          { id: 'right', edgeId: 'right', sourceParticipantId: 'server',
            targetParticipantId: 'client', kind: 'return' },
        ], messageOrder: ['wrong', 'right'] },
    };
    const typical = checkGraphConformance028(sequence, { savedLevel: 'typical' });
    expect(typical.findings).toMatchObject([{ id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
      severity: 'warning' }]);
    expect(typical.notices).toEqual([]);
    expect(checkGraphConformance028(sequence, { savedLevel: 'none' }).findings).toEqual([]);
    const strict = checkGraphConformance028(sequence, { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings).toMatchObject([{ id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
      category: 'notation', subject: { kind: 'edge', id: 'wrong' } }]);
    expect(strict.claimStatus).toBe('failed');
  });

  it('does not claim an unsupported sequence message type is conformant from GraphIR alone', () => {
    const sequence: GraphIR = { version: '3.0.0', id: 'unsupported-sequence',
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'client', type: 'participant' }, { id: 'server', type: 'participant' }],
      edges: [{ id: 'read', source: 'client', target: 'server', type: 'reads' }],
      interaction: { participants: [{ id: 'client', nodeId: 'client' },
        { id: 'server', nodeId: 'server' }], participantOrder: ['client', 'server'],
      messages: [{ id: 'read', edgeId: 'read', sourceParticipantId: 'client',
        targetParticipantId: 'server', kind: 'synchronous' }], messageOrder: ['read'] },
    };
    for (const savedLevel of ['none', 'typical', 'strict'] as const) {
      const report = checkGraphConformance028(sequence, { savedLevel, operation: 'check' });
      expect(report.findings).toContainEqual(expect.objectContaining({
        id: 'coral.sequence.message.invalid', category: 'integrity', severity: 'error',
        subject: { kind: 'edge', id: 'read' },
      }));
      if (savedLevel === 'strict') expect(report.claimStatus).toBe('failed');
    }
  });

  it('does not run a UML family ruleset selected by metadata against a different portable profile', () => {
    const mismatched: GraphIR = { version: '3.0.0', id: 'wrong-profile',
      metadata: { notation: 'uml-sequence' },
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      nodes: [{ id: 'Order', type: 'class' }], edges: [] };
    const report = checkGraphConformance028(mismatched,
      { savedLevel: 'none', operation: 'check' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'GRAPHIR.PROFILE_CONTRADICTION', category: 'integrity', severity: 'error',
    }));
    expect(report.ruleset).toBeUndefined();
    expect(report.claimStatus).toBe('not-claimed');
    const strict = checkGraphConformance028(mismatched,
      { requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings).toEqual(report.findings);
    expect(strict.ruleset).toBeUndefined();
    expect(strict.claimStatus).toBe('failed');
  });

  it('uses a portable UML family profile when descriptive notation metadata is absent', () => {
    const uml: GraphIR = { version: '3.0.0', id: 'profile-only',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      nodes: [{ id: 'Order', type: 'class' }], edges: [] };
    const report = checkGraphConformance028(uml, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.map((finding) => finding.id)).not.toContain('CORAL.PROFILE.MISSING');
    expect(report.ruleset).toMatchObject({ profileId: 'uml-class' });
    expect(report.catalog).toMatchObject({ id: 'uml-class' });
    expect(report.claimStatus).toBe('conformant');
    expect(report.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
  });

  it('reports an unavailable profile as a capability error even at none', () => {
    const unknown: GraphIR = { ...graph, metadata: { notation: 'missing' } };
    const report = checkGraphConformance028(unknown, { savedLevel: 'none' });
    expect(report.findings).toMatchObject([{ category: 'capability', severity: 'error' }]);
    expect(report.notices).toHaveLength(1);
  });

  it('does not silently infer a profile for a saved graph without one', () => {
    const withoutProfile: GraphIR = { ...graph, metadata: undefined };
    const report = checkGraphConformance028(withoutProfile, { savedLevel: 'none' });
    expect(report.findings).toMatchObject([{ id: 'CORAL.PROFILE.MISSING',
      category: 'capability', severity: 'error' }]);
    expect(report.notices).toHaveLength(1);
  });

  it('reports a foreign symbol separately from an unknown variant', () => {
    const mixed: GraphIR = { ...graph, nodes: [{ ...graph.nodes[0]!, variant: 'missing' }] };
    const report = checkGraphConformance028(mixed, { requestedLevel: 'strict' });
    expect(report.findings.map((finding) => finding.id)).toEqual([
      'CORAL.SYMBOL.OUT_OF_PROFILE', 'coral.variant.unknown',
    ]);
  });

  it('does not let conformance none conceal an unsupported explicit symbol', () => {
    const missing: GraphIR = { ...graph, nodes: [{ ...graph.nodes[0]!, symbol: 'missing-symbol' }] };
    const report = checkGraphConformance028(missing, { savedLevel: 'none' });
    expect(report.findings).toMatchObject([{ id: 'coral.symbol.unknown',
      category: 'capability', severity: 'error' }]);
    expect(report.notices).toHaveLength(1);
  });

  it('reports portable graph integrity errors independently of notation level and notice filtering', () => {
    const invalid: GraphIR = { version: '3.0.0', id: 'invalid', metadata: { notation: 'flowchart' },
      nodes: [{ id: 'same', type: 'process' }, { id: 'same', type: 'process' }],
      edges: [{ id: 'missing-target', source: 'same', target: 'absent' }] };
    const report = checkGraphConformance028(invalid,
      { savedLevel: 'none', notificationLevel: 'error', operation: 'save' });
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'GRAPHIR.DUPLICATE_NODE_ID', category: 'integrity', severity: 'error' }),
      expect.objectContaining({ id: 'GRAPHIR.INVALID_EDGE_TARGET', category: 'integrity', severity: 'error' }),
    ]));
    expect(report.notices).toEqual(expect.arrayContaining(report.findings));
  });

  it('accepts inherited catalog ports while rejecting missing or wrong-direction semantic references', () => {
    const portGraph: GraphIR = { version: '3.0.0', id: 'catalog-ports',
      metadata: { notation: 'architecture' }, nodes: [
        { id: 'storage', type: 'storage', symbol: 'arch-storage' },
        { id: 'database', type: 'database', symbol: 'arch-database' },
      ], edges: [{ id: 'valid', source: 'storage', target: 'database',
        sourcePort: 'access', targetPort: 'query',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }] };
    expect(checkGraphConformance028(portGraph, { savedLevel: 'none' }).findings).toEqual([]);

    const invalid: GraphIR = { ...portGraph, edges: [
      { id: 'bad', source: 'database', target: 'storage', sourcePort: 'query', targetPort: 'missing',
        sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'arrow', fill: 'open' } } },
    ] };
    const findings = checkGraphConformance028(invalid, { savedLevel: 'none' }).findings;
    expect(findings.map((finding) => finding.id)).toEqual([
      'coral.port.reference.direction', 'coral.port.reference.missing',
    ]);
    expect(findings.every((finding) => finding.category === 'integrity')).toBe(true);
    const sourceRange = { start: { line: 3, column: 42, offset: 81 },
      end: { line: 3, column: 47, offset: 86 } };
    const targetRange = { start: { line: 3, column: 61, offset: 100 },
      end: { line: 3, column: 68, offset: 107 } };
    const ranged = checkGraphConformance028(invalid, { savedLevel: 'none' }, [],
      new Map([['bad', { sourcePort: sourceRange, targetPort: targetRange }]]));
    expect(ranged.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'coral.port.reference.direction',
        path: '/edges/0/sourcePort', range: sourceRange }),
      expect.objectContaining({ id: 'coral.port.reference.missing',
        path: '/edges/0/targetPort', range: targetRange }),
    ]));

    const bare: GraphIR = { ...portGraph, edges: [{ id: 'bare', source: 'database',
      target: 'storage', sourcePort: 'query', targetPort: 'missing' }] };
    const bareReport = checkGraphConformance028(bare, { savedLevel: 'none' });
    expect(bareReport.findings.map((finding) => finding.id))
      .toEqual(['coral.port.reference.missing']);
    expect(bareReport.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: expect.stringContaining('bare'),
    }));
  });

  it('checks reversed arrow port roles while leaving neutral GraphIR 3 markers unverified', () => {
    const base: GraphIR = { version: '3.0.0', id: 'port-roles',
      metadata: { notation: 'architecture' }, nodes: [
        { id: 'first', type: 'service', symbol: 'arch-service' },
        { id: 'second', type: 'service', symbol: 'arch-service' },
      ], edges: [{ id: 'reverse', source: 'first', target: 'second',
        sourcePort: 'in', targetPort: 'out',
        sourceEnd: { marker: { kind: 'arrow', fill: 'open' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } } }] };
    const reverse = checkGraphConformance028(base, { savedLevel: 'none' });
    expect(reverse.findings).toEqual([]);
    expect(reverse.unverifiedObligations.map((item) => item.id))
      .not.toContain('CORAL.PORT.REFERENCE.UNVERIFIED');
    const invalidReverse: GraphIR = { ...base, edges: [{ ...base.edges[0]!,
      sourcePort: 'out', targetPort: 'in' }] };
    expect(checkGraphConformance028(invalidReverse, { savedLevel: 'none' }).findings
      .map((finding) => finding.id)).toEqual([
      'coral.port.reference.direction', 'coral.port.reference.direction',
    ]);
    const neutral: GraphIR = { ...base, edges: [{ ...base.edges[0]!, id: 'neutral',
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } } }] };
    const neutralReport = checkGraphConformance028(neutral, { savedLevel: 'none' });
    expect(neutralReport.findings.map((finding) => finding.id)).not.toContain('coral.port.reference.direction');
    expect(neutralReport.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.PORT.REFERENCE.UNVERIFIED', message: expect.stringContaining('direction'),
    }));
    const forward: GraphIR = { ...base, edges: [{ ...base.edges[0]!, id: 'forward',
      sourcePort: 'out', targetPort: 'in',
      sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      targetEnd: { marker: { kind: 'arrow', fill: 'open' } } }] };
    const forwardReport = checkGraphConformance028(forward, { savedLevel: 'none' });
    expect(forwardReport.findings).toEqual([]);
    expect(forwardReport.unverifiedObligations.map((item) => item.id))
      .not.toContain('CORAL.PORT.REFERENCE.UNVERIFIED');
    const missing: GraphIR = { ...base, edges: [{ ...base.edges[0]!, sourcePort: 'missing' }] };
    expect(checkGraphConformance028(missing, { savedLevel: 'none' }).findings).toContainEqual(
      expect.objectContaining({ id: 'coral.port.reference.missing', path: '/edges/0/sourcePort' }));
  });

  it('retains GraphIR 3 port-list integrity checks for an explicitly authored geometric list', () => {
    const legacyPorts: GraphIR = { version: '3.0.0', id: 'authored-ports',
      metadata: { notation: 'architecture' }, nodes: [
        { id: 'storage', type: 'storage', symbol: 'arch-storage',
          ports: [{ id: 'custom', side: 'EAST' }] },
        { id: 'database', type: 'database', symbol: 'arch-database' },
      ], edges: [{ id: 'bad', source: 'storage', target: 'database', sourcePort: 'access' }] };
    expect(checkGraphConformance028(legacyPorts, { savedLevel: 'none' }).findings).toContainEqual(
      expect.objectContaining({ id: 'GRAPHIR.INVALID_PORT_REFERENCE',
        path: '/edges/0/sourcePort', category: 'integrity' }),
    );
  });

  it('does not attach one ambiguous source span to duplicate edge identities', () => {
    const duplicate: GraphIR = { version: '3.0.0', id: 'duplicate-edges',
      metadata: { notation: 'architecture' }, nodes: [
        { id: 'database', type: 'database', symbol: 'arch-database' },
        { id: 'storage', type: 'storage', symbol: 'arch-storage' },
      ], edges: [
        { id: 'same', source: 'database', target: 'storage', sourcePort: 'missing' },
        { id: 'same', source: 'storage', target: 'database', sourcePort: 'missing' },
      ] };
    const range = { start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 8, offset: 7 } };
    const report = checkGraphConformance028(duplicate, { savedLevel: 'none' }, [],
      new Map([['same', { sourcePort: range }]]));
    const missing = report.findings.filter((finding) => finding.id === 'coral.port.reference.missing');
    expect(missing.map((finding) => finding.path)).toEqual(['/edges/0/sourcePort', '/edges/1/sourcePort']);
    expect(missing.every((finding) => finding.range === undefined)).toBe(true);
    expect(report.findings.map((finding) => finding.id)).toContain('GRAPHIR.DUPLICATE_EDGE_ID');
  });

  it('retains independent capability failures after bounded card completion', () => {
    const missing: GraphIR = { ...graph, nodes: [{ ...graph.nodes[0]!, symbol: 'missing-symbol' }] };
    const baseline = checkGraphConformance028(graph, { requestedLevel: 'strict', operation: 'check' });
    const report = checkGraphConformance028(missing, { requestedLevel: 'strict', operation: 'check' });
    expect(report.unverifiedObligations).toEqual(baseline.unverifiedObligations);
    expect(report.unverifiedObligations).toEqual([]);
    expect(baseline.claimStatus).toBe('failed');
    expect(report.claimStatus).toBe('failed');
  });

  it('keeps a scoped exception attributable when an independent capability error coexists', () => {
    const mixed: GraphIR = { ...graph, nodes: [{ ...graph.nodes[0]!, variant: 'missing' }] };
    const report = checkGraphConformance028(mixed,
      { requestedLevel: 'strict', operation: 'check' }, [{ nodeId: 'api', symbol: 'arch-service' }]);
    expect(report.exceptions[0]?.affectedRuleIds).toContain('CORAL.SYMBOL.OUT_OF_PROFILE');
    expect(report.findings).toMatchObject([
      { id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' },
      { id: 'coral.variant.unknown', category: 'capability', severity: 'error' },
    ]);
    expect(report.claimStatus).toBe('failed');
  });

  it('rejects exceptions for unknown, in-profile, or stale symbol choices as integrity findings', () => {
    const cases = [
      { symbol: 'missing-symbol', exception: 'missing-symbol' },
      { symbol: 'flowchart-process', exception: 'flowchart-process' },
      { symbol: 'arch-service', exception: 'arch-database' },
    ];
    for (const item of cases) {
      const input: GraphIR = { ...graph, nodes: [{ ...graph.nodes[0]!, symbol: item.symbol }] };
      const report = checkGraphConformance028(input,
        { requestedLevel: 'strict', operation: 'check' },
        [{ nodeId: 'api', symbol: item.exception }]);
      expect(report.findings).toContainEqual(expect.objectContaining({
        id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID', category: 'integrity',
        subject: { kind: 'node', id: 'api' }, severity: 'error',
      }));
      expect(report.exceptions).toEqual([]);
      expect(report.claimStatus).toBe('failed');
    }
  });

  it('rejects duplicate and missing-node exceptions without hiding the independent error', () => {
    const report = checkGraphConformance028(graph,
      { requestedLevel: 'strict', operation: 'check' }, [
        { nodeId: 'api', symbol: 'arch-service' },
        { nodeId: 'api', symbol: 'arch-service' },
        { nodeId: 'absent', symbol: 'arch-service' },
      ]);
    expect(report.findings.filter((finding) => finding.id === 'CORAL.CONFORMANCE.EXCEPTION.INVALID'))
      .toHaveLength(2);
    expect(report.exceptions).toEqual([{ nodeId: 'api', symbol: 'arch-service',
      affectedRuleIds: ['CORAL.SYMBOL.OUT_OF_PROFILE'] }]);
    expect(report.claimStatus).toBe('failed');
  });

  it('checks nested nodes and permits only their matching known foreign symbol exceptions', () => {
    const nested: GraphIR = { ...graph, nodes: [{ id: 'group', type: 'process', children: [
      { id: 'child', type: 'process', symbol: 'arch-service', parent: 'group' },
    ] }] };
    const report = checkGraphConformance028(nested,
      { requestedLevel: 'strict', operation: 'check' },
      [{ nodeId: 'child', symbol: 'arch-service' }]);
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning',
      subject: { kind: 'node', id: 'child' },
    }));
    expect(report.exceptions).toEqual([{ nodeId: 'child', symbol: 'arch-service',
      affectedRuleIds: ['CORAL.SYMBOL.OUT_OF_PROFILE'] }]);
  });
});
