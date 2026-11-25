import { describe, expect, it } from 'vitest';
import { parse } from '@coral-viz/language/parser';
import { bundledExamples, cloneBundledExample } from './fixtures/graphIrInterchangeExamples';
import { parseCoralDSL } from '../src/parsers';
import { printCoralDSLWithDiagnostics } from '../src/printer';
import { SOURCE_FIELD_DISPOSITIONS } from '../src/sourceDisposition';
import { prepareDocumentReplacement } from '../src/useEditorController';
import type { GraphIR } from '../src/printer';

const RETAINED_FIELDS = {
  graph: ['version', 'id', 'name', 'metadata', 'layoutOptions', 'constraints', 'nodes', 'edges', 'profile', 'interaction'],
  node: [
    'id', 'type', 'label', 'description', 'properties', 'position', 'pinned', 'dimensions', 'symbol', 'variant',
    'ports', 'labelPlacement', 'layoutOptions', 'parent', 'children', 'sourceInfo', 'data', 'classifier',
  ],
  edge: [
    'id', 'source', 'target', 'sourcePort', 'targetPort', 'type', 'label', 'description', 'properties',
    'labelPlacement', 'routeIntent', 'style', 'sourceEnd', 'targetEnd', 'sourceInfo', 'data', 'lineStyle',
    'routingPoints',
  ],
} as const;

const PARITY_FIXTURE_FIELDS = {
  graph: ['version', 'id', 'name', 'metadata', 'layoutOptions', 'constraints', 'nodes', 'edges', 'profile', 'interaction'],
  node: [
    'id', 'type', 'label', 'description', 'properties', 'position', 'pinned', 'dimensions', 'symbol', 'variant',
    'ports', 'labelPlacement', 'layoutOptions', 'parent', 'children', 'classifier',
  ],
  edge: [
    'id', 'source', 'target', 'sourcePort', 'targetPort', 'type', 'label', 'description', 'properties',
    'labelPlacement', 'routeIntent', 'style', 'sourceEnd', 'targetEnd',
  ],
} as const;

const parityGraph: GraphIR = {
  version: '3.0.0',
  id: 'parity',
  name: 'Parity fixture',
  metadata: { author: 'Coral', notation: 'uml-class', custom: { reviewed: true } },
  profile: { id: 'uml', kind: 'class', version: '1.0.0' },
  layoutOptions: { algorithm: 'layered', direction: 'RIGHT', spacing: { nodeNode: 40 } },
  constraints: [{
    id: 'keep-below', kind: 'relative', strength: 'required',
    subject: { kind: 'node', nodeId: 'child' }, relation: 'below', target: { kind: 'node', nodeId: 'root' },
  }],
  nodes: [{
    id: 'root', type: 'class', label: 'Root', description: 'container', symbol: 'uml-class',
    classifier: { kind: 'class', name: 'Root', compartments: [
      { id: 'name', kind: 'name' },
      { id: 'attributes', kind: 'attributes', items: [
        { id: 'attribute-1', kind: 'attribute', visibility: 'private', name: 'id', type: 'UUID' },
      ] },
    ] },
    variant: 'primary', properties: { owner: 'team', nested: { retained: true } },
    position: { x: 10, y: 20 }, pinned: true, dimensions: { width: 300, height: 200 },
    ports: [{ id: 'out', side: 'EAST', label: 'Out', position: 0.5, properties: { protocol: 'https' } }],
    labelPlacement: { side: 'above', offset: 8 },
    layoutOptions: { portConstraints: 'FIXED_SIDE', minimumSize: { width: 200, height: 100 } },
    children: [{ id: 'child', type: 'service', label: 'Child', parent: 'root' }],
  }, {
    id: 'target', type: 'database', label: 'Target',
    ports: [{ id: 'in', side: 'WEST' }],
  }],
  edges: [{
    id: 'root-target', source: 'root', target: 'target', sourcePort: 'out', targetPort: 'in', type: 'dependency',
    label: 'calls', description: 'full edge', properties: { retries: 3, policy: { strict: true } },
    labelPlacement: { side: 'above', at: 0.4, offset: 6 },
    routeIntent: { waypoints: [{ id: 'via-1', placement: { kind: 'absolute', position: { x: 50, y: 60 } } }] },
    style: { lineStyle: 'dashed', routing: 'orthogonal' },
    sourceEnd: { role: 'caller', multiplicity: { lower: 1, upper: 1 }, navigability: 'navigable' },
    targetEnd: { marker: { kind: 'diamond', fill: 'filled' } },
  }],
};

/** `interaction` needs UML sequence notation, so it has its own fixture (Slice 70). */
const sequenceParityGraph = parse(`@graph {"id":"sequence-parity","metadata":{"notation":"uml-sequence"}}
actor "User" as user
participant "App" as app
user -> app as ask [sync, label: "ask"]
alt "ok" as decide {
  app -> user as yes [return]
} else {
}
app -> user as later [async]
activation app from ask to yes as busy
note "top" on user
note "about ask" on app, ask as n2`).graph!;
const SEPARATE_FIXTURES: Partial<Record<string, GraphIR>> = { interaction: sequenceParityGraph };

describe('R-063 editor/source parity audit', () => {
  it('classifies each retained field once and assigns later-slice ownership', () => {
    for (const [kind, entries] of Object.entries(SOURCE_FIELD_DISPOSITIONS)) {
      expect(new Set(entries.map((entry) => entry.field)).size, kind).toBe(entries.length);
      expect(entries.map((entry) => entry.field).sort(), `${kind} retained field inventory`)
        .toEqual([...RETAINED_FIELDS[kind as keyof typeof RETAINED_FIELDS]].sort());
      for (const entry of entries) {
        if (entry.disposition === 'later-slice') expect(entry.owner, `${kind}.${entry.field}`).toMatch(/^Slice \d+$/);
      }
    }
  });

  it('requires an explicit fixture entry for every editable parity field', () => {
    for (const kind of ['graph', 'node', 'edge'] as const) {
      const editable = SOURCE_FIELD_DISPOSITIONS[kind]
        .filter((entry) => entry.disposition === 'parity')
        .map((entry) => entry.field).sort();
      expect([...PARITY_FIXTURE_FIELDS[kind]].sort(), kind).toEqual(editable);
    }
  });

  it('deep-round-trips every editable disposition before and after a trivial source edit', () => {
    const root = parityGraph.nodes[0];
    const child = root.children![0];
    const edge = parityGraph.edges[0];
    const fixtureValues = {
      graph: parityGraph as unknown as Record<string, unknown>,
      node: { ...root, parent: child.parent } as unknown as Record<string, unknown>,
      edge: edge as unknown as Record<string, unknown>,
    };
    for (const kind of ['graph', 'node', 'edge'] as const) {
      for (const field of PARITY_FIXTURE_FIELDS[kind]) {
        const fixture = kind === 'graph' && SEPARATE_FIXTURES[field]
          ? SEPARATE_FIXTURES[field] as unknown as Record<string, unknown> : fixtureValues[kind];
        expect(fixture[field], `${kind}.${field}`).not.toBeUndefined();
      }
    }

    const printed = printCoralDSLWithDiagnostics(parityGraph);
    expect(printed.diagnostics).toEqual([]);
    const reparsed = parse(printed.text);
    expect(reparsed.success).toBe(true);
    expect(reparsed.graph).toEqual(parityGraph);

    const triviallyEdited = parse(`${printed.text}\n// fixture remains editable\n`);
    expect(triviallyEdited.success).toBe(true);
    expect(triviallyEdited.graph).toEqual(parityGraph);
  });

  it('deep-round-trips the sequence interaction disposition before and after a trivial source edit', () => {
    expect(sequenceParityGraph.interaction?.fragments?.[0].operands).toHaveLength(2);
    const printed = printCoralDSLWithDiagnostics(sequenceParityGraph);
    expect(printed.diagnostics).toEqual([]);
    expect(parse(printed.text).graph).toEqual(sequenceParityGraph);
    expect(parse(`${printed.text}\n// fixture remains editable\n`).graph).toEqual(sequenceParityGraph);
  });

  it('offers historical GraphIR interchange fixtures to open', () => {
    expect(bundledExamples.length).toBeGreaterThan(0);
  });

  // One case per example: each prepares and renders a whole document.
  it.each(bundledExamples.map((example) => example.id))(
    'opens historical GraphIR interchange fixture %s without claiming legacy previews as current source', (id) => {
      const prepared = prepareDocumentReplacement(cloneBundledExample(id));
      expect(prepared.sourceDiagnostics.filter((item) => item.severity === 'error'), id).toEqual([]);
      if (prepared.source.startsWith('@graph ')) expect(prepared.sourceDiagnostics, id)
        .toContainEqual(expect.objectContaining({ code: 'coral.graphir.interchange.preview' }));
    });

  it('does not treat an absent editor lineStyle alias as opaque', () => {
    const prepared = prepareDocumentReplacement(cloneBundledExample('flowchart'));
    expect(prepared.graphEdges.every((edge) => edge.lineStyle === undefined)).toBe(true);
    expect(prepared.sourceDiagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.graphir.interchange.preview', severity: 'warning',
    }));
  });

  // A current source edit that states a field twice reaches the editor as a
  // positioned error, so it cannot silently choose a different meaning.
  it.each([
    ['a duplicate type', 'a -> b [flow, type: calls]', 'coral.syntax.type.duplicate', 'type: calls'],
    ['a duplicate label', 'a -> b [label: "First"] as "Second"', 'coral.syntax.label.duplicate', 'as "Second"'],
  ])('surfaces %s as a positioned blocking error', (_name, edge, code, token) => {
    const source = `@diagram architecture\na service\nb service\n${edge}`;
    const result = parseCoralDSL(source);
    const error = result.errors.find((item) => item.code === code);
    expect(error).toMatchObject({ severity: 'error', line: 4 });
    expect(source.slice(error!.range!.start.offset, error!.range!.end.offset)).toBe(token);
    expect(result.errors.every((item) => item.severity !== 'warning')).toBe(true);
  });
});
