import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../../src/parsers';
import { assessDiagramSemantics } from '../../src/llm/semanticAssessment';

const node = (id: string, type = 'service', parent?: string): GraphNode => ({
  id,
  type,
  label: id,
  ...(parent ? { parent } : {}),
});

const edge = (id: string, source: string, target: string): GraphEdge => ({
  id,
  source,
  target,
});

describe('assessDiagramSemantics', () => {
  it('classifies each missing edge endpoint as deterministic integrity evidence', () => {
    const findings = assessDiagramSemantics(
      [node('present')],
      [
        edge('missing-source', 'absent-source', 'present'),
        edge('missing-target', 'present', 'absent-target'),
        edge('missing-both', 'absent-left', 'absent-right'),
      ],
    );

    expect(findings).toEqual([
      {
        code: 'graph.edge.missing-source',
        category: 'integrity',
        severity: 'error',
        nodeIds: ['absent-left'],
        edgeIds: ['missing-both'],
        message: 'Edge "missing-both" references missing source node "absent-left".',
      },
      {
        code: 'graph.edge.missing-source',
        category: 'integrity',
        severity: 'error',
        nodeIds: ['absent-source'],
        edgeIds: ['missing-source'],
        message: 'Edge "missing-source" references missing source node "absent-source".',
      },
      {
        code: 'graph.edge.missing-target',
        category: 'integrity',
        severity: 'error',
        nodeIds: ['absent-right'],
        edgeIds: ['missing-both'],
        message: 'Edge "missing-both" references missing target node "absent-right".',
      },
      {
        code: 'graph.edge.missing-target',
        category: 'integrity',
        severity: 'error',
        nodeIds: ['absent-target'],
        edgeIds: ['missing-target'],
        message: 'Edge "missing-target" references missing target node "absent-target".',
      },
    ]);
  });

  it('classifies a missing containment parent as deterministic integrity evidence', () => {
    expect(assessDiagramSemantics([node('child', 'service', 'missing-group')], [])).toEqual([
      {
        code: 'graph.node.missing-parent',
        category: 'integrity',
        severity: 'error',
        nodeIds: ['child', 'missing-group'],
        edgeIds: [],
        message: 'Node "child" references missing parent node "missing-group".',
      },
    ]);
  });

  it('separates notation capability failures from relationship advice', () => {
    const unsupported = assessDiagramSemantics([node('fn', 'function')], [], 'flowchart');
    expect(unsupported).toEqual([
      expect.objectContaining({
        code: 'notation.node.unsupported-type',
        category: 'capability',
        severity: 'error',
        nodeIds: ['fn'],
        edgeIds: [],
      }),
    ]);

    const unresolvedProfileWords = assessDiagramSemantics(
      [node('dataset', 'dataset'), node('guardrail', 'guardrail')],
      [edge('unusual', 'dataset', 'guardrail')],
      'aiml',
    );
    expect(unresolvedProfileWords).toEqual([]);
  });

  it('reports disconnected topology once with canonical component membership', () => {
    const findings = assessDiagramSemantics([
      node('z-other'),
      node('group', 'group'),
      node('child', 'service', 'group'),
    ], []);

    expect(findings).toEqual([
      {
        code: 'graph.topology.disconnected',
        category: 'advice',
        severity: 'review',
        nodeIds: ['child', 'group', 'z-other'],
        edgeIds: [],
        components: [['child', 'group'], ['z-other']],
        message: 'The graph has 2 disconnected components; author intent is required before treating this as a defect.',
      },
    ]);
  });

  it('does not turn legitimate small, looped, terminal, or parallel-edge graphs into errors', () => {
    expect(assessDiagramSemantics([], [])).toEqual([]);
    expect(assessDiagramSemantics([node('only', 'terminal')], [])).toEqual([]);

    const connected = assessDiagramSemantics(
      [node('start', 'terminal'), node('end', 'terminal')],
      [
        edge('loop', 'start', 'start'),
        edge('path-a', 'start', 'end'),
        edge('path-b', 'start', 'end'),
      ],
    );
    expect(connected).toEqual([]);
  });

  it('adds no relationship claim for an unknown notation and reports disabled ERD capability failures', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('e', 'a', 'b')];

    expect(assessDiagramSemantics(nodes, edges, 'unknown')).toEqual([]);
    expect(assessDiagramSemantics(nodes, edges, 'erd')).toEqual([
      expect.objectContaining({
        code: 'notation.node.unsupported-type', category: 'capability', severity: 'error', nodeIds: ['a'], edgeIds: [],
      }),
      expect.objectContaining({
        code: 'notation.node.unsupported-type', category: 'capability', severity: 'error', nodeIds: ['b'], edgeIds: [],
      }),
    ]);
  });

  it('sorts findings deterministically without mutating inputs', () => {
    const nodes = [node('b'), node('a', 'function')];
    const edges = [edge('z', 'b', 'missing-z'), edge('a', 'missing-a', 'a')];
    const before = JSON.stringify({ nodes, edges });

    const first = assessDiagramSemantics(nodes, edges, 'flowchart');
    const second = assessDiagramSemantics([...nodes].reverse(), [...edges].reverse(), 'flowchart');

    expect(first).toEqual(second);
    expect(first.map((finding) => finding.code)).toEqual([
      'graph.edge.missing-source',
      'graph.edge.missing-target',
      'notation.node.unsupported-type',
      'graph.topology.disconnected',
    ]);
    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it('uses strict code-unit ordering for collation-equivalent Unicode IDs', () => {
    const composed = '\u00e9';
    const decomposed = 'e\u0301';
    const nodes = [node('present')];
    const edges = [
      edge(composed, composed, 'present'),
      edge(decomposed, decomposed, 'present'),
    ];

    const forward = assessDiagramSemantics(nodes, edges);
    const reversed = assessDiagramSemantics(nodes, [...edges].reverse());

    expect(forward).toEqual(reversed);
    expect(forward.map((finding) => finding.edgeIds[0])).toEqual([decomposed, composed]);
  });

  it('rejects duplicate node or edge identities instead of normalizing them', () => {
    expect(() => assessDiagramSemantics([node('same'), node('same')], []))
      .toThrow('Duplicate node id "same"');
    expect(() => assessDiagramSemantics(
      [node('a'), node('b')],
      [edge('same', 'a', 'b'), edge('same', 'b', 'a')],
    )).toThrow('Duplicate edge id "same"');
  });
});
