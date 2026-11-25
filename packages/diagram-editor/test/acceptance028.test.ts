import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { parseCoralDSL } from '../src/parsers';
import { editSourceOwnedEdgeLabel028, editSourceOwnedNodeLabel028 } from '../src/sourceOwnedEdits028';
import { planFileOpen } from '../src/useEditorController';
import { prepareDocumentReplacement } from '../src/useEditorController';
import { createBlankDocument } from '../src/blankDocument';

const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname,
  '../../browser/test/fixtures/acceptance028', name), 'utf8');

describe('0.2.8 authored-source editor acceptance', () => {
  it('prints a representable GraphIR interchange graph as verified 0.2.8 source', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    document.content.graphIR = { version: '3.0.0', id: 'interchange',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', label: 'API' }], edges: [] };
    const prepared = prepareDocumentReplacement(document);
    expect(prepared.source).toMatch(/^@diagram architecture\n/);
    expect(prepared.sourceDiagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  });

  it('labels an unrepresentable GraphIR interchange projection as a preview', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    document.content.graphIR = { version: '3.0.0', id: 'positioned',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', label: 'API', position: { x: 10, y: 20 } }],
      edges: [] };
    const prepared = prepareDocumentReplacement(document);
    expect(prepared.source).toMatch(/^@graph /);
    expect(prepared.sourceDiagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.graphir.interchange.preview', severity: 'warning',
      message: expect.stringContaining('GraphIR interchange'),
    }));
  });

  it.each([
    'service "Alpha"',
    '@graph {"id":"old"}\nservice "Alpha"',
  ])('keeps headerless or retired-header Coral as exact blocked text: %s', (source) => {
    const parsed = parseCoralDSL(source);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
    expect(parsed.sourceGraph).toBeUndefined();
    expect(parsed.errors).toContainEqual(expect.objectContaining({ code: 'header.diagram.required' }));
    const plan = planFileOpen({ name: 'draft.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.prepared.source).toBe(source);
    expect(plan.textOpen?.text).toBe(source);
    expect(plan.textOpen?.canonicalInput.nodes).toEqual([]);
    expect(plan.textOpen?.blockWith).toBeDefined();
  });

  it('opens and edits one grouped UML class without changing its neighboring member identities', () => {
    const source = [
      '@diagram uml-class',
      'left group {',
      '  Order class {',
      '    fields = attributes {',
      '      orderId = public attribute id: String',
      '    }',
      '  }',
      '}',
      'right group {',
      '  Order class {',
      '    fields = attributes {',
      '      orderId = public attribute id: String',
      '    }',
      '  }',
      '}',
      'left.Order -- right.Order',
    ].join('\n');
    const plan = planFileOpen({ name: 'grouped-class.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.prepared.source).toBe(source);
    expect(plan.textOpen?.canonicalInput.nodes.map((node) => node.id))
      .toEqual(['left', 'left.Order', 'right', 'right.Order']);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes[0]?.children?.[0]?.classifier?.compartments[1])
      .toMatchObject({ items: [{ id: 'orderId' }] });
    expect(projected.graph?.nodes[1]?.children?.[0]?.classifier?.compartments[1])
      .toMatchObject({ items: [{ id: 'orderId' }] });
    const edited = editSourceOwnedNodeLabel028(source, 'left.Order', 'Sales Order');
    expect(edited).toBe(source.replace('Order class {', 'Order class as "Sales Order" {'));
    const reopened = planFileOpen({ name: 'grouped-class.coral', text: edited });
    expect(reopened.kind).toBe('open');
    if (reopened.kind === 'open') expect(reopened.prepared.source).toBe(edited);
  });

  it('opens recursive sequence source with its accepted display and exact text', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    a -> b\n' +
      '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
    const parsed = parseCoralDSL(source);
    expect(parsed.sourceGraph).toEqual(projectInstalledSourceToSuccessor028(source).graph);
    expect(parsed.errors).toEqual([]);
    expect(parsed.edges).toHaveLength(3);
    const plan = planFileOpen({ name: 'recursive.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind === 'open') expect(plan.prepared.source).toBe(source);
  });
  it('opens parallel activation source as exact text with a scene', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'parallel = par {\n  work = activation a {\n    a -> b\n  }\n' +
      '} and "reply" {\n  b -> a\n}\n';
    const plan = planFileOpen({ name: 'parallel.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.prepared.source).toBe(source);
    expect(plan.textOpen?.text).toBe(source);
    expect(plan.textOpen?.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(parseCoralDSL(source).nodes).toHaveLength(2);
    expect(parseCoralDSL(source).sourceGraph?.interaction?.activations)
      .toEqual([{ id: 'work', participantId: 'a' }]);
  });
  it('opens participant-group source as exact text and a shared scene', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'team = participants worker, api [label: "Operations"]\napi -> worker';
    const plan = planFileOpen({ name: 'grouped-sequence.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.prepared.source).toBe(source);
    expect(plan.textOpen?.text).toBe(source);
    expect(projectInstalledSourceToSuccessor028(source).graph?.interaction?.groups)
      .toEqual([{ id: 'team', label: 'Operations', participantIds: ['worker', 'api'] }]);
    expect(plan.textOpen?.diagnostics).toEqual([]);
  });
  it('retains disabled Chen as exact text and refuses semantic label edits', () => {
    const source = fixture('erd-relationship.coral');
    const plan = planFileOpen({ name: 'erd-relationship.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.prepared.source).toBe(source);
    expect(plan.textOpen?.diagnostics).toContainEqual(expect.objectContaining({ code: 'header.diagram.disabled' }));
    expect(() => editSourceOwnedNodeLabel028(source, 'customer', 'Renamed')).toThrow(/semantic projection/);
    expect(() => editSourceOwnedEdgeLabel028(source, 'orders', 'Reviewed')).toThrow(/semantic projection/);
  });
  it.each([
    ['architecture', 'architecture-ports.coral'],
    ['block', 'block-ports.coral'],
    ['flowchart', 'flowchart-draft.coral'],
    ['bpmn', 'bpmn-event.coral'],
    ['uml-sequence', 'uml-sequence-flat.coral'],
    ['uml-class', 'uml-class-named.coral'],
  ] as const)('%s opens with the same source-owned successor meaning as browser/MCP',
    (profile, filename) => {
      const source = fixture(filename);
      const parsed = parseCoralDSL(source);
      expect(parsed.errors).toEqual([]);
      expect(parsed.envelope?.metadata?.notation).toBe(profile);
      expect(parsed.sourceGraph).toEqual(projectInstalledSourceToSuccessor028(source).graph);
      const plan = planFileOpen({ name: filename, text: source });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toBe(source);
      expect(plan.prepared.notation).toBe(profile);
      expect(plan.textOpen?.canonicalInput.nodes.map((node) => node.id))
        .toEqual(parsed.nodes.map((node) => node.id));
    });

  it.each([
    ['architecture-ports.coral', 'api'],
    ['block-ports.coral', 'producer'],
    ['flowchart-draft.coral', 'review'],
    ['bpmn-event.coral', 'work'],
    ['uml-sequence-flat.coral', 'client'],
    ['uml-class-named.coral', 'Order'],
  ] as const)('%s edits one authored label without rewriting neighboring source',
    (filename, nodeId) => {
      const source = fixture(filename);
      const edited = editSourceOwnedNodeLabel028(source, nodeId, 'Renamed');
      expect(edited.replace(' as "Renamed"', '')).toBe(source);
      const reparsed = parseCoralDSL(edited);
      expect(reparsed.errors).toEqual([]);
      expect(reparsed.sourceGraph).toBeDefined();
    });

  it.each([
    ['architecture-ports.coral', 'read', 'Order IDs'],
    ['block-ports.coral', 'transfer', 'Data'],
    ['flowchart-draft.coral', 'edge-1', null],
    ['bpmn-event.coral', 'edge-1', null],
    ['uml-sequence-flat.coral', 'call', 'load()'],
    ['uml-class-named.coral', 'inheritance', null],
  ] as const)('%s edits a connector label without changing its source-owned meaning',
    (filename, edgeId, oldLabel) => {
      const source = fixture(filename);
      const before = projectInstalledSourceToSuccessor028(source).graph!;
      const edited = editSourceOwnedEdgeLabel028(source, edgeId, 'Reviewed');
      expect(oldLabel === null
        ? edited.replace(' as "Reviewed"', '')
        : edited.replace('as "Reviewed"', `as "${oldLabel}"`)).toBe(source);
      const after = projectInstalledSourceToSuccessor028(edited);
      expect(after.diagnostics).toEqual([]);
      const expected = structuredClone(before);
      expected.edges.find((edge) => edge.id === edgeId)!.label = 'Reviewed';
      expect(after.graph).toEqual(expected);
      const parsed = parseCoralDSL(edited);
      expect(parsed.errors).toEqual([]);
      expect(parsed.sourceGraph).toEqual(after.graph);
      expect(parsed.edges.find((edge) => edge.id === edgeId)?.label).toBe('Reviewed');
      const plan = planFileOpen({ name: filename, text: edited });
      expect(plan.kind).toBe('open');
      if (plan.kind === 'open') expect(plan.prepared.source).toBe(edited);
    });
});
