import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser/index.js';
import { printWithDiagnostics } from '../src/printer/index.js';
import type { GraphIR } from '../src/types.js';

/**
 * Slice 53 print validity (R-063 AC-5): the printer emits a field only when
 * its value passes the validator the parser applies to that field. An invalid
 * programmatic value is omitted or renamed and reported, never printed, so the
 * output re-parses with no diagnostic. Reference integrity is excluded.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'spec', 'conformance');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
  cases: Array<{ id: string; expectedGraphIR?: string }>;
};

function base(): GraphIR {
  return {
    version: '3.0.0',
    id: 'g',
    nodes: [
      { id: 'a', type: 'service', label: 'A' },
      { id: 'b', type: 'service', label: 'B' },
    ],
    edges: [{ id: 'a_to_b', source: 'a', target: 'b' }],
  };
}

type Mutable = Record<string, unknown>;
const edge = (graph: GraphIR) => graph.edges[0] as unknown as Mutable;
const node = (graph: GraphIR) => graph.nodes[0] as unknown as Mutable;
const graphBag = (graph: GraphIR) => graph as unknown as Mutable;
const constraint = (graph: GraphIR, value: Mutable) => {
  graph.constraints = [value as never];
};

function expectValidPrint(graph: GraphIR, code: string): string {
  const printed = printWithDiagnostics(graph);
  const reparsed = parse(printed.text);
  expect(reparsed.diagnostics, printed.text).toEqual([]);
  expect(printed.diagnostics.map((diagnostic) => diagnostic.code), printed.text).toContain(code);
  return printed.text;
}

describe('print validity', () => {
  describe('every conformance GraphIR golden prints text that re-parses with no diagnostic', () => {
    for (const fixture of manifest.cases.filter(({ expectedGraphIR }) => expectedGraphIR)) {
      it(fixture.id, () => {
        const graph = JSON.parse(readFileSync(join(root, fixture.expectedGraphIR!), 'utf8')) as GraphIR;
        const printed = printWithDiagnostics(graph);
        expect(printed.diagnostics).toEqual([]);
        expect(parse(printed.text).diagnostics).toEqual([]);
      });
    }
  });

  it.each<[string, (graph: GraphIR) => void, string]>([
    ['edge lineStyle outside its enum', (g) => { edge(g).style = { lineStyle: 'wavy' }; }, 'coral.edge.style.line-style.dropped'],
    ['edge routing outside its enum', (g) => { edge(g).style = { routing: 'curvy' }; }, 'coral.edge.style.routing.dropped'],
    ['another edge style key', (g) => { edge(g).style = { color: 'red' }; }, 'coral.edge.style.color.dropped'],
    ['a stray style arrow', (g) => { edge(g).style = { sourceArrow: 'arrow' }; }, 'coral.edge.style.source-arrow.dropped'],
    ['a non-string edge label', (g) => { edge(g).label = 1; }, 'coral.edge.label.dropped'],
    ['a non-string edge description', (g) => { edge(g).description = 1; }, 'coral.edge.description.dropped'],
    ['a non-string sourcePort', (g) => { edge(g).sourcePort = 1; }, 'coral.edge.source-port.dropped'],
    ['a non-string targetPort', (g) => { edge(g).targetPort = 1; }, 'coral.edge.target-port.dropped'],
    ['a non-string graph name', (g) => { graphBag(g).name = 1; }, 'coral.graph.name.dropped'],
    ['wrong-shaped graph metadata', (g) => { graphBag(g).metadata = { tags: 'x' }; }, 'coral.graph.metadata.dropped'],
    ['wrong-shaped graph layoutOptions', (g) => { graphBag(g).layoutOptions = { direction: 'SIDEWAYS' }; }, 'coral.graph.layout-options.dropped'],
    ['graph layoutOptions.algorithmOptions', (g) => { graphBag(g).layoutOptions = { direction: 'DOWN', algorithmOptions: {} }; }, 'coral.print.field.unsupported'],
    ['a non-string node description', (g) => { node(g).description = 1; }, 'coral.node.description.dropped'],
    ['a non-string node symbol', (g) => { node(g).symbol = 1; }, 'coral.node.symbol.dropped'],
    ['a non-string node variant', (g) => { node(g).variant = 1; }, 'coral.node.variant.dropped'],
    ['wrong-shaped node dimensions', (g) => { node(g).dimensions = { width: -1, height: 1 }; }, 'coral.node.dimensions.dropped'],
    ['wrong-shaped node ports', (g) => { node(g).ports = [{ id: '', side: 'EAST' }]; }, 'coral.node.ports.dropped'],
    ['wrong-shaped node layoutOptions', (g) => { node(g).layoutOptions = { portConstraints: 'SIDEWAYS' }; }, 'coral.node.layout-options.dropped'],
    ['an empty edge id', (g) => { edge(g).id = ''; }, 'coral.edge.id.degraded'],
    ['a duplicate edge id', (g) => { g.edges.push({ id: 'a_to_b', source: 'b', target: 'a' }); }, 'coral.edge.id.degraded'],
    ['an invalid relationship end', (g) => { edge(g).sourceEnd = { role: '' }; }, 'coral.edge.source-end.dropped'],
    ['pinned without a position', (g) => { node(g).pinned = true; }, 'coral.node.pinned.dropped'],
    ['pinned with a NaN position', (g) => { Object.assign(node(g), { position: { x: Number.NaN, y: 0 }, pinned: true }); }, 'coral.node.pinned.dropped'],
    ['a NaN node label-placement offset', (g) => { node(g).labelPlacement = { side: 'above', offset: Number.NaN }; }, 'coral.node.label-placement.dropped'],
    ['a negative node label-placement offset', (g) => { node(g).labelPlacement = { side: 'above', offset: -1 }; }, 'coral.node.label-placement.dropped'],
    ['a nonzero center node offset', (g) => { node(g).labelPlacement = { side: 'center', offset: 2 }; }, 'coral.node.label-placement.dropped'],
    ['a NaN edge label-placement at', (g) => { edge(g).labelPlacement = { side: 'above', at: Number.NaN }; }, 'coral.edge.label-placement.dropped'],
    ['an edge label-placement at outside 0..1', (g) => { edge(g).labelPlacement = { side: 'above', at: 2 }; }, 'coral.edge.label-placement.dropped'],
    ['an Infinity edge label-placement offset', (g) => { edge(g).labelPlacement = { side: 'above', offset: Infinity }; }, 'coral.edge.label-placement.dropped'],
    ['a negative edge label-placement offset', (g) => { edge(g).labelPlacement = { side: 'below', offset: -1 }; }, 'coral.edge.label-placement.dropped'],
    ['an empty waypoint id', (g) => { edge(g).routeIntent = { waypoints: [{ id: '', placement: { kind: 'absolute', position: { x: 1, y: 2 } } }] }; }, 'coral.edge.waypoint.dropped'],
    ['a duplicate waypoint id', (g) => {
      edge(g).routeIntent = { waypoints: [
        { id: 'w', placement: { kind: 'absolute', position: { x: 1, y: 2 } } },
        { id: 'w', placement: { kind: 'absolute', position: { x: 3, y: 4 } } },
      ] };
    }, 'coral.edge.waypoint.dropped'],
    ['a NaN simple waypoint position', (g) => {
      edge(g).routeIntent = { waypoints: [{ id: 'coral.waypoint.a_to_b.1', placement: { kind: 'absolute', position: { x: Number.NaN, y: 2 } } }] };
    }, 'coral.edge.waypoint.dropped'],
    ['a NaN identified waypoint position', (g) => {
      edge(g).routeIntent = { waypoints: [{ id: 'w', placement: { kind: 'absolute', position: { x: 1, y: Number.NaN } } }] };
    }, 'coral.edge.waypoint.dropped'],
    ['an Infinity relative waypoint offset', (g) => {
      edge(g).routeIntent = { waypoints: [{ id: 'w', placement: { kind: 'relative', anchor: { kind: 'source' }, offset: { x: Infinity, y: 0 } } }] };
    }, 'coral.edge.waypoint.dropped'],
    ['a negative gap', (g) => constraint(g, { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' }, gap: -1 }), 'coral.graph.constraint.gap.dropped'],
    ['a NaN gap', (g) => constraint(g, { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' }, gap: Number.NaN }), 'coral.graph.constraint.gap.dropped'],
    ['an Infinity inset', (g) => constraint(g, { id: 'c', kind: 'boundary', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, side: 'top', scope: { kind: 'graph' }, inset: Infinity }), 'coral.graph.constraint.inset.dropped'],
    ['an alignment outside its enum', (g) => constraint(g, { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' }, alignment: 'middle' }), 'coral.graph.constraint.alignment.dropped'],
    ['a direction outside its enum', (g) => constraint(g, { id: 'c', kind: 'arrangement', strength: 'required', subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }], axis: 'row', direction: 'sideways' }), 'coral.graph.constraint.direction.dropped'],
    ['inset on a relative constraint', (g) => constraint(g, { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' }, inset: 4 }), 'coral.graph.constraint.inset.dropped'],
    ['direction on a relative constraint', (g) => constraint(g, { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' }, direction: 'reverse' }), 'coral.graph.constraint.direction.dropped'],
    ['gap on a boundary constraint', (g) => constraint(g, { id: 'c', kind: 'boundary', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, side: 'top', scope: { kind: 'graph' }, gap: 4 }), 'coral.graph.constraint.gap.dropped'],
    ['alignment on a boundary constraint', (g) => constraint(g, { id: 'c', kind: 'boundary', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, side: 'top', scope: { kind: 'graph' }, alignment: 'start' }), 'coral.graph.constraint.alignment.dropped'],
    ['direction on a boundary constraint', (g) => constraint(g, { id: 'c', kind: 'boundary', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, side: 'top', scope: { kind: 'graph' }, direction: 'reverse' }), 'coral.graph.constraint.direction.dropped'],
    ['inset on an arrangement', (g) => constraint(g, { id: 'c', kind: 'arrangement', strength: 'required', subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }], axis: 'row', inset: 4 }), 'coral.graph.constraint.inset.dropped'],
    ['an arrangement with one distinct subject', (g) => constraint(g, { id: 'c', kind: 'arrangement', strength: 'required', subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'a' }], axis: 'row' }), 'coral.graph.constraint.dropped'],
    ['an empty constraint id', (g) => constraint(g, { id: '', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' } }), 'coral.graph.constraint.dropped'],
    ['a duplicate constraint id', (g) => {
      g.constraints = [
        { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'a' }, relation: 'above', target: { kind: 'node', nodeId: 'b' } },
        { id: 'c', kind: 'relative', strength: 'required', subject: { kind: 'node', nodeId: 'b' }, relation: 'below', target: { kind: 'node', nodeId: 'a' } },
      ];
    }, 'coral.graph.constraint.dropped'],
  ])('omits %s with a print-loss diagnostic', (_name, mutate, code) => {
    const graph = base();
    mutate(graph);
    expectValidPrint(graph, code);
  });

  it('prints an empty node type as service with coral.node.type.degraded', () => {
    const graph = base();
    node(graph).type = '';
    const text = expectValidPrint(graph, 'coral.node.type.degraded');
    expect(text).toContain('service "A"');
  });

  it('keeps the valid rest of a label placement-free edge and a portable layoutOptions', () => {
    const graph = base();
    graphBag(graph).layoutOptions = { direction: 'DOWN', algorithmOptions: {} };
    const text = expectValidPrint(graph, 'coral.print.field.unsupported');
    expect(text).toContain('"layoutOptions":{"direction":"DOWN"}');
  });
});
