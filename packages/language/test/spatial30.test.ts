import { describe, it, expect } from 'vitest';
import { parseCandidate028 } from '../src/parser/candidate028.js';
describe('Slice 30 portable source spatial contract', () => {
  it('parses typed relations, arrangement parameters, document options and route-local anchors', () => {
    const parsed = parseCandidate028(
      'layout [algorithm: layered, direction: RIGHT, edgeRouting: ORTHOGONAL, nodeNode: 40]\na service as "A"\nb service as "B"\ne = a -> b as "E"\nconstraint caption: label node a above edge e [preferred, gap: 8]\norder = arrange row: node a, edge e, label node b [gap: 20, alignment: end, direction: reverse]\nroute edge e {\n one = waypoint at (0, 0)\n two = waypoint relative to waypoint one offset (20, 0)\n}',
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(
      parsed.spatialConstraints028?.toSorted((a, b) =>
        b.id.localeCompare(a.id),
      ),
    ).toEqual([
      {
        id: 'order',
        kind: 'arrangement',
        axis: 'row',
        subjects: [
          { kind: 'node', nodeId: 'a' },
          { kind: 'edge', edgeId: 'e' },
          { kind: 'node-label', nodeId: 'b' },
        ],
        gap: 20,
        alignment: 'end',
        direction: 'reverse',
      },
      {
        id: 'caption',
        kind: 'relative',
        subject: { kind: 'node-label', nodeId: 'a' },
        target: { kind: 'edge', edgeId: 'e' },
        relation: 'above',
        strength: 'preferred',
        gap: 8,
      },
    ]);
    expect(parsed.layoutOptions028).toEqual({
      algorithm: 'layered',
      direction: 'RIGHT',
      edgeRouting: 'ORTHOGONAL',
      spacing: { nodeNode: 40 },
    });
    expect(parsed.routeIntents028?.e?.waypoints[1]?.placement).toEqual({
      kind: 'relative',
      anchor: { kind: 'waypoint', waypointId: 'one' },
      offset: { x: 20, y: 0 },
    });
  });
  it.each([
    'constraint x: label node a above node b',
    'constraint x: label edge e above node b',
  ])('rejects a missing or empty authored label: %s', (line) => {
    const parsed = parseCandidate028(
      `a service\nb service as "B"\ne = a -> b as ""\n${line}`,
    );
    expect(
      parsed.diagnostics.some(
        (d) => d.code === 'coral.constraint.reference.label-missing',
      ),
    ).toBe(true);
  });
  it.each([
    'layout [raw: 1]',
    'layout [constructor: fixed]',
    'layout [__proto__: fixed]',
    'layout [nodeNode: 0]',
    'layout [direction: right]',
    'layout [algorithm: layered, algorithm: fixed]',
  ])('refuses invalid finite options %s', (line) =>
    expect(
      parseCandidate028(line).diagnostics.some(
        (d) => d.code === 'layout.option.invalid',
      ),
    ).toBe(true),
  );
  it.each([
    'constraint c: node a above node b []',
    'row = arrange row: a, b []',
    'row = arrange row: a, b, [preferred]',
    'layout [algorithm: "layered"]',
    'layout ["direction": RIGHT]',
    'constraint c: "node" a above node b',
    'constraint c: node a above node b [alignment: "start"]',
    'constraint c: node a above node b [strength: preferred]',
  ])('refuses unreviewed quoted or keyed aliases %s', (line) => {
    expect(
      parseCandidate028(`a service\nb service\n${line}`).diagnostics.some(
        (d) => d.severity === 'error',
      ),
    ).toBe(true);
  });
  it('allocates anonymous arrangement identities around all explicit constraints and lexical scopes', () => {
    const parsed = parseCandidate028(
      'a service\nb service\narrange row: node a, node b [preferred]\nconstraint arrangement_1: node a above node b\ng group {\n c service\n d service\n arrange row: node c, node d\n constraint arrangement_2: node c above node d\n}',
    );
    expect(parsed.diagnostics).toEqual([]);
    const ids = parsed.spatialConstraints028!.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('g.arrangement_3');
  });
  it('preserves constraint as an existing node, edge, and endpoint ID', () => {
    for (const body of [
      'constraint service',
      'constraint = service',
      'a service\nb service\nconstraint = a -> b',
      'constraint service\nb service\nconstraint -> b',
    ])
      expect(parseCandidate028(body).diagnostics, body).toEqual([]);
  });
  it('preserves keyword-shaped node IDs in bare arrangements', () => {
    const parsed = parseCandidate028(
      'node service\nedge service\nlabel service\nrow = arrange row: node, edge, label',
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.spatialConstraints028?.[0]).toMatchObject({
      subjects: [
        { kind: 'node', nodeId: 'node' },
        { kind: 'node', nodeId: 'edge' },
        { kind: 'node', nodeId: 'label' },
      ],
    });
  });
  it('keeps layout service as a node and rejects duplicate document layout', () => {
    expect(parseCandidate028('layout service').graph.nodes[0]?.id).toBe(
      'layout',
    );
    expect(
      parseCandidate028(
        'layout [algorithm: layered]\nlayout [direction: RIGHT]',
      ).diagnostics.some((d) => d.code === 'layout.option.invalid'),
    ).toBe(true);
  });
  it.each([
    'constraint c: node a above node b [inset: 1]',
    'constraint c: node a above node b [gap: -1]',
    'constraint c: node a above node b [preferred, required]',
  ])('rejects inapplicable/duplicate/invalid parameters %s', (line) =>
    expect(
      parseCandidate028(`a service\nb service\n${line}`).diagnostics.some(
        (d) => d.code === 'coral.constraint.parameter.invalid',
      ),
    ).toBe(true),
  );
  it('requires a strict ancestor group boundary and exact reference kinds', () => {
    expect(
      parseCandidate028(
        'a service\nb service\ne = a -> b\nconstraint c: edge a above node b',
      ).diagnostics.some((d) => d.code === 'coral.constraint.reference.kind'),
    ).toBe(true);
    expect(
      parseCandidate028(
        'g group {\n a service\n}\nconstraint c: group g at the left of group g',
      ).diagnostics.some((d) => d.code === 'coral.constraint.scope.invalid'),
    ).toBe(true);
  });
});
