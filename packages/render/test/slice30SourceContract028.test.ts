import { checkGraphConformance028 } from '../src/graphConformance028.js';
import { describe, it, expect } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { printSuccessorSource028 } from '../src/successorSourceWriter028.js';
const source =
  '@diagram architecture\nlayout [direction: RIGHT, algorithm: layered, nodeNode: 40]\na service\nb service as "b"\ne = a -> b as "E"\nconstraint near: node a above edge e [required, gap: 0, alignment: center]\norder = arrange row: node a, edge e, label node b [direction: reverse, alignment: end, gap: 20, preferred]\nroute edge e {\n one = waypoint at (100, 80)\n two = waypoint relative to waypoint one offset (20, 0)\n}\n';
describe('Slice 30 source-owned portable roundtrip', () => {
  it('refuses unverified spatial sidecars on public GraphIR3 conformance inputs', () => {
    const graph = {
      version: '3.0.0' as const,
      id: 'g',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'a', type: 'service' }],
      edges: [],
      spatialConstraints028: [
        {
          id: 'c',
          kind: 'relative',
          subject: { kind: 'node', nodeId: 'missing' },
          target: { kind: 'node', nodeId: 'a' },
          relation: 'above',
        },
      ],
    };
    const report = checkGraphConformance028(graph, {
      savedLevel: 'none',
      operation: 'check',
    });
    expect(
      report.findings.some(
        (f) => f.category === 'integrity' && f.severity === 'error',
      ),
    ).toBe(true);
  });
  it('preserves label absence and explicit ID-equal labels', () => {
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes[0]).not.toHaveProperty('label');
    expect(projected.graph?.nodes[1]?.label).toBe('b');
    expect(projected.graph?.constraints?.[0]?.kind).toBe('relative');
    expect(projected.graph?.layoutOptions).toEqual({
      algorithm: 'layered',
      direction: 'RIGHT',
      spacing: { nodeNode: 40 },
    });
  });
  it.each(['relative', 'boundary', 'arrangement'] as const)(
    'canonicalizes explicit %s default fields from valid portable input',
    (kind) => {
      const body =
        kind === 'relative'
          ? 'constraint c: node a above node b'
          : kind === 'boundary'
            ? 'constraint c: node a at the left of diagram'
            : 'c = arrange row: a, b';
      const graph = projectInstalledSourceToSuccessor028(
        `@diagram architecture\na service\nb service\n${body}\n`,
      ).graph!;
      const constraint = graph.constraints![0]!;
      constraint.strength = 'required';
      if (constraint.kind === 'boundary') constraint.inset = 0;
      else {
        constraint.gap = 0;
        constraint.alignment = 'center';
        if (constraint.kind === 'arrangement') constraint.direction = 'forward';
      }
      const written = printSuccessorSource028(graph);
      expect(written.diagnostics).toEqual([]);
      expect(written.text).toContain(body + '\n');
      expect(written.text).not.toMatch(
        /\[(?:required|gap|inset|alignment|direction)/,
      );
    },
  );
  it('keeps prototype-shaped edge IDs exact without inventing route meaning', () => {
    const base =
      '@diagram architecture\na service\nb service\nconstructor = a -> b\n__proto__ = a -> b\nother = a -> b\nroute edge other {\n point = waypoint at (100, 80)\n}\n';
    const projected = projectInstalledSourceToSuccessor028(base);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.edges[0]).not.toHaveProperty('routeIntent');
    expect(projected.graph?.edges[1]).not.toHaveProperty('routeIntent');
    expect(projected.graph?.edges[2]?.routeIntent?.waypoints[0]?.id).toBe(
      'point',
    );
    const ownRoute = projectInstalledSourceToSuccessor028(
      base.replace('route edge other', 'route edge __proto__'),
    );
    expect(ownRoute.diagnostics).toEqual([]);
    expect(ownRoute.graph?.edges[1]?.routeIntent?.waypoints[0]?.id).toBe(
      'point',
    );
  });
  it('canonicalizes approved parameter order/default omission and preserves exact portable meaning', () => {
    const projected = projectInstalledSourceToSuccessor028(source);
    const written = printSuccessorSource028(projected.graph!);
    expect(written.diagnostics).toEqual([]);
    expect(written.text).toContain('a service\n');
    expect(written.text).toContain('b service as "b"');
    expect(written.text).toContain(
      'layout [algorithm: layered, direction: RIGHT, nodeNode: 40]',
    );
    expect(written.text).toContain('constraint near: node a above edge e\n');
    expect(written.text).toContain(
      'order = arrange row: node a, edge e, label node b [preferred, gap: 20, alignment: end, direction: reverse]',
    );
    const roundtrip = projectInstalledSourceToSuccessor028(written.text!);
    expect(roundtrip.diagnostics).toEqual([]);
    expect(roundtrip.graph).toEqual(projected.graph);
  });
});
