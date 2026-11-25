import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print, printWithDiagnostics } from '../src/printer/index.js';
import type { GraphIR } from '../src/types.js';

function roundTrip(graph: GraphIR): GraphIR {
  const text = print(graph);
  const result = parse(text);
  expect(result.success, result.errors.map((error) => error.message).join('\n')).toBe(true);
  expect(print(result.graph!)).toBe(text);
  return result.graph!;
}

describe('R-035: lossless JSON-safe GraphIR projection', () => {
  it('round-trips the complete allocated graph, node, and property field matrix', () => {
    const graph: GraphIR = {
      version: '3.0.0',
      id: 'checkout graph',
      name: 'Checkout',
      metadata: {
        author: 'Coral',
        tags: ['prod', 'payments'],
        custom: { enabled: true, nested: { nullable: null, values: [1, 'two'] } },
      },
      layoutOptions: {
        algorithm: 'layered',
        direction: 'RIGHT',
        spacing: { nodeNode: 32, layerSpacing: 48 },
        edgeRouting: 'orthogonal',
        hierarchyHandling: 'INCLUDE_CHILDREN',
      },
      nodes: [{
        id: 'api',
        type: 'custom type / v2',
        label: 'API',
        description: 'Entry point',
        symbol: 'process',
        variant: 'primary',
        dimensions: { width: 160, height: 80 },
        position: { x: 10, y: 20 },
        pinned: true,
        layoutOptions: {
          portConstraints: 'FIXED_SIDE',
          portAlignment: 'CENTER',
          sizeConstraints: ['MINIMUM_SIZE', 'PORTS'],
          minimumSize: { width: 120, height: 60 },
          padding: { top: 1, right: 2, bottom: 3, left: 4 },
        },
        ports: [{ id: 'out', side: 'EAST', label: 'Orders', position: 0.5, properties: { protocol: 'https', config: [1, null] } }],
        properties: {
          description: 'property description',
          scalar: 3,
          nullable: null,
          array: ['x', 2, false, null, { z: 1 }],
          object: { b: 2, a: { nested: true } },
          negativeZero: 0,
        },
        children: [{
          id: 'worker',
          type: 'service',
          label: 'Worker',
          parent: 'api',
          properties: { queue: ['orders'] },
        }],
      }],
      edges: [],
    };

    const reparsed = roundTrip(graph);
    expect(reparsed).toEqual(graph);
    expect(Object.is(reparsed.nodes[0].properties!.negativeZero, -0)).toBe(false);
  });

  it('round-trips independent parallel edge ids, ports, styles, properties, and waypoints', () => {
    const graph: GraphIR = {
      version: '3.0.0', id: 'g',
      nodes: [
        { id: 'a', type: 'service', label: 'a', ports: [
          { id: 'out', side: 'EAST' }, { id: 'other', side: 'EAST' },
        ] },
        { id: 'b', type: 'service', label: 'b', ports: [{ id: 'in', side: 'WEST' }] },
      ],
      edges: [
        {
          id: 'route one', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in',
          type: 'data', label: 'first', properties: { description: 'details', payload: { kind: 'one' }, values: [1, null] },
          style: { lineStyle: 'dashed', routing: 'orthogonal' },
          sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } },
          targetEnd: { marker: { kind: 'diamond', fill: 'unspecified' } },
          routeIntent: { waypoints: [
            { id: 'coral.waypoint.route one.1', placement: { kind: 'absolute', position: { x: 1, y: 2 } } },
            { id: 'coral.waypoint.route one.2', placement: { kind: 'absolute', position: { x: 3, y: 4 } } },
          ] },
        },
        {
          id: 'route two', source: 'a', target: 'b', sourcePort: 'other', targetPort: 'in',
          style: { lineStyle: 'solid', routing: 'spline' },
          sourceEnd: { marker: { kind: 'none', fill: 'unspecified' } },
          targetEnd: { marker: { kind: 'arrow', fill: 'unspecified' } },
          routeIntent: { waypoints: [
            { id: 'coral.waypoint.route two.1', placement: { kind: 'absolute', position: { x: 9, y: 8 } } },
          ] }, properties: { nullable: null },
        },
      ],
    };

    expect(roundTrip(graph)).toEqual(graph);
  });

  it('keeps same-named top-level and property labels plus every JSON string control character', () => {
    const controls = '\u0000\b\f\n\r\t';
    const graph: GraphIR = {
      version: '3.0.0', id: 'g',
      nodes: [{ id: 'a', type: 'service', label: controls, properties: { controls } }, { id: 'b', type: 'service', label: 'b' }],
      edges: [{ id: 'e', source: 'a', target: 'b', label: 'top', properties: { label: controls, controls } }],
    };

    expect(roundTrip(graph)).toEqual(graph);
  });

  it('sorts structured object keys recursively and reaches a text fixpoint', () => {
    const graph = {
      version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', properties: { nested: { z: 1, a: 2 } } }], edges: [],
      metadata: { custom: { z: 1, a: 2 } },
    } as GraphIR;
    const text = print(graph);

    expect(text).toContain('{"id":"g","metadata":{"custom":{"a":2,"z":1}}}');
    expect(text).toContain('nested: {"a":2,"z":1}');
    expect(print(parse(text).graph!)).toBe(text);
  });

  it('uses a valid later early graph header after malformed attempts, then diagnoses duplicate and late headers', () => {
    const result = parse([
      '@graph nope',
      '@graph {"name":"missing id"}',
      '@graph {"id":"kept","name":"Kept"}',
      '@graph {"id":"duplicate"}',
      'service "A"',
      '@graph {"id":"late"}',
    ].join('\n'));

    expect(result.success).toBe(false);
    expect(result.graph?.id).toBe('kept');
    expect(result.graph?.name).toBe('Kept');
    expect(result.graph?.nodes).toHaveLength(1);
    expect(result.diagnostics?.filter((d) => d.code === 'coral.graph.unparsed')).toHaveLength(4);
  });

  it('keeps base entities while diagnosing malformed, unknown, wrong-shaped, and conflicting data', () => {
    const source = [
      'service "A" data {"description":3,"unknown":true}',
      'service "B" data nope',
      'a -> b [lineStyle: "readable", x: 1] data {"properties":{"x":{"ignored":true},"y":[1]},"style":{"lineStyle":"dashed","routing":"spline"},"unknown":true}',
    ].join('\n');
    const result = parse(source);

    expect(result.graph?.nodes).toHaveLength(2);
    expect(result.graph?.edges).toHaveLength(1);
    expect(result.graph?.edges[0].properties).toEqual({ lineStyle: 'readable', x: 1, y: [1] });
    expect(result.graph?.edges[0].style?.routing).toBe('spline');
    expect(result.graph?.edges[0].style?.lineStyle).toBeUndefined();
    expect(result.diagnostics?.length).toBeGreaterThanOrEqual(5);
  });

  it('preserves legacy unknown string escapes while adding JSON property values', () => {
    const result = parse('service "A" {\n  legacy: "a\\qb"\n  backspace: "a\\bb"\n  formfeed: "a\\fb"\n  unicode: "a\\u0041b"\n  nested: [1, {"x": null}]\n}');

    expect(result.success).toBe(true);
    expect(result.graph?.nodes[0].properties).toEqual({
      legacy: 'a\\qb', backspace: 'a\\bb', formfeed: 'a\\fb', unicode: 'a\\u0041b', nested: [1, { x: null }],
    });
  });

  it('rejects wrong-shaped typed data fields while retaining the declarations', () => {
    const result = parse([
      '@graph {"id":"g","metadata":{"tags":[1]},"layoutOptions":{"algorithm":"bogus","spacing":{"nodeNode":-1}}}',
      'service "A" data {"dimensions":{"width":-1,"height":2},"layoutOptions":{"portConstraints":"SIDEWAYS","padding":{"top":-1}}}',
      'service "B" data {"ports":[{"id":"p","side":"EAST","extra":true}]}',
    ].join('\n'));

    expect(result.graph?.id).toBe('g');
    expect(result.graph?.metadata).toBeUndefined();
    expect(result.graph?.layoutOptions).toBeUndefined();
    expect(result.graph?.nodes).toHaveLength(2);
    expect(result.graph?.nodes[0].dimensions).toBeUndefined();
    expect(result.graph?.nodes[0].layoutOptions).toBeUndefined();
    expect(result.graph?.nodes[1].ports).toBeUndefined();
    expect(result.success).toBe(false);
    expect(result.diagnostics?.every((item) => item.severity === 'error')).toBe(true);
    expect(result.diagnostics?.filter((item) => item.code === 'coral.graph.data-field.invalid')).toHaveLength(2);
    expect(result.diagnostics?.filter((item) => item.code === 'coral.node.data-field.invalid')).toHaveLength(3);
  });

  it('rejects removed @graph layoutOptions.algorithmOptions and stores no layoutOptions (L3)', () => {
    const source = '@graph {"id":"g","layoutOptions":{"algorithm":"layered","algorithmOptions":{"x":1}}}\nservice "A"';
    const result = parse(source);
    expect(result.diagnostics.map((item) => [item.code, item.severity, source.slice(item.range!.start.offset, item.range!.end.offset)]))
      .toEqual([['coral.graph.data-field.unsupported', 'error', '"algorithmOptions"']]);
    expect(result.graph?.layoutOptions).toBeUndefined();
  });

  it('rejects removed edge data.description and names the attribute (L4)', () => {
    const source = 'service as a\nservice as b\na -> b data {"description":"x"}';
    const result = parse(source);
    expect(result.diagnostics.map((item) => [item.code, item.severity])).toEqual([['coral.edge.data-field.unsupported', 'error']]);
    expect(result.diagnostics[0].message).toContain('[description: "…"]');
    expect(result.graph?.edges[0].description).toBeUndefined();
  });

  it('rejects empty quoted node types', () => {
    const result = parse('"" "A"\nservice "B"');

    expect(result.success).toBe(false);
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(['b']);
    expect(result.diagnostics?.map((item) => item.code)).toContain('coral.node.type.unparsed');
  });

  it('prints node property bags independently of insertion order', () => {
    const graph = (properties: Record<string, unknown>): GraphIR => ({
      version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', properties }], edges: [],
    });

    expect(print(graph({ b: 2, a: 1 }))).toBe(print(graph({ a: 1, b: 2 })));
  });

  it('rejects duplicate and empty explicit edge ids and keeps derived recovery ids (R-063 AC-5)', () => {
    const result = parse([
      'service as a',
      'service as b',
      'a -> b as ""',
      'a -> b as kept',
      'a -> b as kept',
    ].join('\n'));

    expect(result.success).toBe(false);
    expect(new Set(result.graph!.edges.map((edge) => edge.id)).size).toBe(3);
    expect(result.diagnostics?.map((d) => [d.code, (d as { line: number }).line])).toEqual([
      ['coral.edge.id.invalid', 3],
      ['coral.edge.id.invalid', 5],
    ]);
  });

  it('diagnoses noncanonical parents, sourceInfo, and invalid JSON values while preserving edge description', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse: unknown[] = [];
    sparse[1] = 'x';
    const graph = {
      version: '3.0.0', id: 'g',
      nodes: [{
        id: 'a', type: 'service', parent: 'missing', sourceInfo: { range: { start: 0, end: 1 } },
        properties: { good: { ok: true }, cycle, sparse, infinity: Infinity, undef: undefined, bigint: 1n },
      }],
      edges: [{ id: 'e', source: 'a', target: 'a', description: 'not declared', sourceInfo: { range: { start: 0, end: 1 } } }],
    } as unknown as GraphIR;
    const result = printWithDiagnostics(graph);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.text).toContain('good: {"ok":true}');
    expect(result.text).not.toMatch(/cycle|sparse|infinity|undef|bigint/);
    expect(codes).toContain('coral.node.parent.dropped');
    expect(codes).toContain('coral.node.source-info.dropped');
    expect(codes).toContain('coral.edge.source-info.dropped');
    expect(result.text).toContain('description: "not declared"');
    expect(codes.filter((code) => code === 'coral.node.property.dropped')).toHaveLength(5);
  });

  it('never throws on invalid edge structured fields or geometry', () => {
    const graph = {
      version: '3.0.0', id: 'g',
      nodes: [{ id: 'a', type: 'service', position: { x: Infinity, y: 1 } }],
      edges: [{
        id: 'e', source: 'a', target: 'a', sourcePort: 1n,
        style: { routing: 'spline', invalid: undefined },
        routingPoints: [{ x: 1, y: Infinity }],
      }],
    } as unknown as GraphIR;

    const result = printWithDiagnostics(graph);
    expect(result.text).not.toMatch(/Infinity|undefined/);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'coral.node.position.dropped',
      'coral.edge.source-port.dropped',
      'coral.edge.style.dropped',
      'coral.print.field.unsupported',
    ]));
  });

  it.each(['accessor', 'symbol', 'non-enumerable'] as const)('diagnoses and drops a %s property bag without invoking it', (shape) => {
    const properties: Record<PropertyKey, unknown> = { safe: true };
    if (shape === 'accessor') Object.defineProperty(properties, 'hostile', { enumerable: true, get() { throw new Error('must not run'); } });
    if (shape === 'symbol') properties[Symbol('hostile')] = true;
    if (shape === 'non-enumerable') Object.defineProperty(properties, 'hostile', { enumerable: false, value: true });
    const graph = {
      version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', properties }], edges: [],
    } as unknown as GraphIR;

    const result = printWithDiagnostics(graph);
    expect(result.text).not.toContain('safe:');
    expect(result.diagnostics.map((item) => item.code)).toContain('coral.node.properties.dropped');
  });
});
