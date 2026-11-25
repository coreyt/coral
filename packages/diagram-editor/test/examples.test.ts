import { validateSequenceInteraction } from '@coral-viz/language';
import { describe, expect, it } from 'vitest';
import {
  convertFlowToGraphEdges,
  convertFlowToGraphNodes,
  convertGraphToFlow,
  deserialize,
  getEdgeCompatibility,
  notationRegistry,
  serialize,
  symbolRegistry,
} from '@coral-viz/viz';
import { checkGraphConformance028, getAvailableNotations028, markerId, renderSvg, resolveRenderScene } from '@coral-viz/render';
import {
  bundledExamples,
  cloneBundledExample,
  validateBundledExample,
} from './fixtures/graphIrInterchangeExamples';
import { KNOWN_NODE_TYPES } from '../src/parsers';
import { semanticTypeForSymbol, type NotationType } from '../src/notationSemantics';
import { convertEdges, projectDiagramNodes } from '../src/hooks/diagramUtils';

const expectedFidelity: Record<string, {
  semanticTypes: string[];
  symbols: string[];
  variants?: string[];
  edges: string[];
  svg?: string[];
}> = {
  block: {
    semanticTypes: ['block'], symbols: ['block-unit'], edges: ['flow'],
  },
  flowchart: {
    semanticTypes: ['terminal', 'process', 'decision'],
    symbols: ['flowchart-terminal', 'flowchart-process', 'flowchart-decision'],
    variants: ['start', 'end'], edges: ['flow'],
  },
  bpmn: {
    semanticTypes: ['startEvent', 'task', 'exclusiveGateway', 'endEvent'],
    symbols: ['bpmn-start-event', 'bpmn-task', 'bpmn-gateway-exclusive', 'bpmn-end-event'],
    variants: ['user'], edges: ['sequence'], svg: ['data-coral-symbol-marker="X"', 'User task'],
  },
  code: {
    semanticTypes: ['module', 'class', 'function', 'variable'],
    symbols: ['code-module', 'code-class', 'code-function', 'code-variable'],
    variants: ['abstract', 'static'], edges: ['contains'],
    svg: ['font-style="italic"', 'text-decoration="underline"'],
  },
  architecture: {
    semanticTypes: ['actor', 'service', 'database'],
    symbols: ['arch-actor', 'arch-service', 'arch-database'],
    variants: ['api'], edges: ['sync', 'data'], svg: ['API connection'],
  },
  aiml: {
    semanticTypes: ['dataset', 'training', 'model', 'inference'],
    symbols: ['aiml-dataset', 'aiml-training', 'aiml-model', 'aiml-inference'],
    edges: ['training', 'inference'],
  },
  'data-engineering': {
    semanticTypes: ['source', 'transform', 'quality', 'warehouse', 'sink'],
    symbols: ['data-source', 'data-transform', 'data-quality', 'data-warehouse', 'data-sink'],
    edges: ['batch-flow', 'quality'],
  },
  sketch: {
    semanticTypes: ['cloud', 'decision', 'step'],
    symbols: ['sketch-cloud', 'sketch-decision', 'sketch-step'], edges: ['flow'],
  },
  'uml-class': {
    semanticTypes: ['class', 'interface', 'enum'],
    symbols: ['uml-class', 'uml-interface', 'uml-enum'],
    edges: ['realization', 'association'],
    svg: ['data-coral-classifier-name', 'OPEN'],
  },
};

/** Symbol-bearing examples drawn by the generic canvas; the sequence example draws the sequence scene. */
const genericExamples = bundledExamples.filter((example) => example.notation !== 'uml-sequence');

function flattenedNodes(example: (typeof bundledExamples)[number]) {
  const graph = example.document.content.graphIR!;
  return graph.nodes.flatMap(function flatten(node): typeof graph.nodes {
    return [node, ...(node.children?.flatMap(flatten) ?? [])];
  });
}

function unfrozenPaths(value: unknown, path: string): string[] {
  if (!value || typeof value !== 'object') return [];
  return [
    ...(Object.isFrozen(value) ? [] : [path]),
    ...Object.entries(value).flatMap(([key, nested]) => unfrozenPaths(nested, `${path}.${key}`)),
  ];
}

describe('historical GraphIR interchange fixtures', () => {
  it('exactly covers available 0.2.8 document types with unique identities', () => {
    const installed = getAvailableNotations028().map((notation) => notation.id).sort();
    expect(bundledExamples.map((example) => example.notation).sort()).toEqual(installed);
    expect(installed).not.toContain('erd');
    expect(new Set(bundledExamples.map((example) => example.id)).size).toBe(installed.length);
  });

  it.each(bundledExamples)('validates and deserializes $id', (example) => {
    const report = checkGraphConformance028(example.document.content.graphIR!, { savedLevel: 'typical' });
    expect(validateBundledExample(example), `${example.id}: ${JSON.stringify(report.findings)}`)
      .toEqual({ ok: true });
    expect(() => deserialize(example.document)).not.toThrow();
  });

  it('draws the sequence example from its interaction, not generic nodes and edges', () => {
    const example = bundledExamples.find((candidate) => candidate.notation === 'uml-sequence')!;
    const graph = example.document.content.graphIR!;
    expect(validateSequenceInteraction(graph)).toEqual([]);
    expect(graph.nodes.map((node) => node.type)).toEqual(['actor', 'participant', 'participant']);
    expect(graph.nodes.every((node) => node.symbol === undefined && node.position === undefined)).toBe(true);
    expect(new Set(graph.edges.map((edge) => edge.type))).toEqual(new Set(['sync', 'return', 'async']));
    const svg = renderSvg(graph);
    expect(svg.match(/data-coral-sequence-message=/g)).toHaveLength(graph.edges.length);
    for (const kind of ['participant', 'activation', 'note', 'fragment']) expect(svg).toContain(`data-coral-sequence-${kind}=`);
    expect(svg).not.toContain('data-coral-edge=');
  });

  it('uses semantic types, explicit symbols, top-level variants, and valid connections', () => {
    const semanticSignatures = new Set<string>();
    const renderSignatures = new Set<string>();
    for (const example of genericExamples) {
      const graph = example.document.content.graphIR!;
      const notation = notationRegistry.get(example.notation)!;
      expect(graph.metadata?.notation).toBe(example.notation);
      const nodes = flattenedNodes(example);
      for (const node of nodes) {
        expect(KNOWN_NODE_TYPES.has(node.type), `${example.id}.${node.id}.${node.type}`).toBe(true);
        expect(node.symbol, `${example.id}.${node.id}`).toBeDefined();
        expect(notation.symbols, `${example.id}.${node.id}.${node.symbol}`).toContain(node.symbol);
        expect(semanticTypeForSymbol(node.symbol!, example.notation), `${example.id}.${node.id}`)
          .toBe(node.type);
        expect(notation.symbols).not.toContain(node.type);
        if (node.variant) {
          expect(
            symbolRegistry.get(node.symbol!)?.variants?.[node.variant],
            `${example.id}.${node.id}.${node.variant}`,
          ).toBeDefined();
        }
        expect(node.properties?.variant).toBeUndefined();
      }
      const nodeInfo = new Map(nodes.map((node) => [node.id, {
        id: node.id, symbolId: node.symbol!, variant: node.variant,
      }]));
      const compatibility = getEdgeCompatibility(graph.edges, {
        notationId: example.notation, nodeInfo, existingEdges: graph.edges,
      });
      expect(compatibility.filter((edge) => edge.status === 'incompatible'), example.id).toEqual([]);
      semanticSignatures.add(JSON.stringify(nodes.map((node) => [node.type, node.symbol, node.variant])));
      const scene = resolveRenderScene(graph);
      renderSignatures.add(JSON.stringify({
        nodes: scene.nodes.map((node) => [node.shapeId, node.glyph?.id, node.symbolMarker]),
        edges: scene.edges.map((edge) => [edge.style, edge.source, edge.target]),
      }));
    }
    expect(semanticSignatures.size).toBe(genericExamples.length);
    expect(renderSignatures.size).toBe(genericExamples.length);
  });

  it('executes the generic-notation canvas and SVG capability matrix', () => {
    expect(Object.keys(expectedFidelity).sort()).toEqual(
      genericExamples.map((example) => example.id).sort(),
    );
    for (const example of genericExamples) {
      const expected = expectedFidelity[example.id];
      const graph = example.document.content.graphIR!;
      const nodes = flattenedNodes(example);
      expect(new Set(nodes.map((node) => node.type))).toEqual(new Set(expected.semanticTypes));
      expect(new Set(nodes.map((node) => node.symbol))).toEqual(new Set(expected.symbols));
      expect(new Set(nodes.flatMap((node) => node.variant ? [node.variant] : [])))
        .toEqual(new Set(expected.variants ?? []));
      expect(new Set(graph.edges.map((edge) => edge.type))).toEqual(new Set(expected.edges));

      const flow = convertGraphToFlow(graph);
      expect(flow.nodes.map((node) => node.data.symbolId)).toEqual(nodes.map((node) => node.symbol));
      const scene = resolveRenderScene(graph);
      expect(flow.edges.map((edge) => edge.style?.stroke)).toEqual(
        scene.edges.map((edge) => edge.style.stroke),
      );
      const svg = renderSvg(graph);
      const visibleText = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
        .map((match) => match[1]).join(' ');
      for (const node of nodes) expect(visibleText).toContain(node.label ?? node.id);
      for (const edge of graph.edges) expect(svg).toContain(`data-coral-edge="${edge.id}"`);
      for (const fragment of expected.svg ?? []) expect(svg).toContain(fragment);
    }
  });

  it.each(genericExamples.map((example) => [example.id, example] as const))(
    'projects the %s example onto the editor canvas consistently with the render scene',
    (_id, example) => {
      const graph = example.document.content.graphIR!;
      const nodes = flattenedNodes(example);
      const notation = example.notation as NotationType;
      const scene = resolveRenderScene(graph);
      const sceneNodes = new Map(scene.nodes.map((node) => [node.id, node]));
      const projected = projectDiagramNodes(nodes, notation);
      expect(projected.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
      for (const [index, node] of nodes.entries()) {
        const canvas = projected[index];
        const sceneNode = sceneNodes.get(node.id)!;
        const symbol = symbolRegistry.get(canvas.data.symbolId!);
        expect(canvas.data.symbolId, `${example.id}.${node.id}`).toBe(node.symbol);
        expect(canvas.data.symbolId, `${example.id}.${node.id}`).toBe(sceneNode.symbolId);
        expect(canvas.data.variant, `${example.id}.${node.id}`).toBe(node.variant);
        expect(symbol?.shape, `${example.id}.${node.id}`).toBe(sceneNode.shapeId);
      }

      const sceneEdges = new Map(scene.edges.map((edge) => [edge.id, edge]));
      const canvasEdges = convertEdges(graph.edges, undefined, undefined, {
        notation: example.notation, nodes: graph.nodes,
      });
      expect(canvasEdges.map((edge) => edge.id)).toEqual(graph.edges.map((edge) => edge.id));
      for (const edge of canvasEdges) {
        const sceneEdge = sceneEdges.get(edge.id)!;
        const marker = (end: typeof sceneEdge.source) => end.marker && end.marker.kind !== 'none'
          ? `url(#${markerId(end.marker, sceneEdge.style.stroke)})` : undefined;
        expect({
          stroke: edge.style?.stroke,
          strokeWidth: edge.style?.strokeWidth,
          strokeDasharray: edge.style?.strokeDasharray,
          markerStart: edge.markerStart,
          markerEnd: edge.markerEnd,
        }, `${example.id}.${edge.id}`).toEqual({
          stroke: sceneEdge.style.stroke,
          strokeWidth: sceneEdge.style.strokeWidth,
          strokeDasharray: sceneEdge.style.strokeDasharray,
          markerStart: marker(sceneEdge.source),
          markerEnd: marker(sceneEdge.target),
        });
      }
    },
  );

  it('rejects missing, corrupt, and notation-mismatched sources', () => {
    expect(() => cloneBundledExample('missing')).toThrow(/not available/i);
    const source = bundledExamples.find((example) => example.id === 'flowchart')!;
    expect(validateBundledExample({ ...source, notation: 'missing' })).toEqual({
      ok: false,
      error: 'Example notation is not installed.',
    });
    expect(validateBundledExample({
      ...source,
      notation: 'bpmn',
    })).toEqual({ ok: false, error: 'Example notation does not match its document.' });
    expect(validateBundledExample({
      ...source,
      document: { ...source.document, schemaVersion: 'broken' },
    })).toEqual({ ok: false, error: 'Example document is invalid.' });

    const graphMismatch = structuredClone(source);
    graphMismatch.document.content.graphIR!.metadata = { notation: 'bpmn' };
    expect(validateBundledExample(graphMismatch)).toEqual({
      ok: false, error: 'Example notation does not match its graph.',
    });

    const foreignSymbol = structuredClone(source);
    foreignSymbol.document.content.graphIR!.nodes[0].symbol = 'bpmn-task';
    expect(validateBundledExample(foreignSymbol)).toEqual({
      ok: false, error: 'Example contains a symbol outside its notation.',
    });

    const invalidType = structuredClone(source);
    invalidType.document.content.graphIR!.nodes[0].type = 'flowchart-terminal';
    expect(validateBundledExample(invalidType)).toEqual({
      ok: false, error: 'Example contains an invalid semantic node type.',
    });

    const mismatchedType = structuredClone(source);
    mismatchedType.document.content.graphIR!.nodes[0].type = 'database';
    expect(validateBundledExample(mismatchedType)).toEqual({
      ok: false, error: 'Example semantic node type does not match its symbol.',
    });

    const foreignEdgeStyle = structuredClone(source);
    foreignEdgeStyle.document.content.graphIR!.edges[0].type = 'sequence';
    expect(validateBundledExample(foreignEdgeStyle)).toEqual({
      ok: false, error: 'Example contains an edge style outside its notation.',
    });

    const bogusVariant = structuredClone(source);
    bogusVariant.document.content.graphIR!.nodes[0].variant = 'bogus';
    expect(validateBundledExample(bogusVariant)).toEqual({
      ok: false, error: 'Example contains a variant outside its symbol.',
    });

    for (const inheritedVariant of ['constructor', '__proto__']) {
      const inherited = structuredClone(source);
      inherited.document.content.graphIR!.nodes[0].variant = inheritedVariant;
      expect(validateBundledExample(inherited)).toEqual({
        ok: false, error: 'Example contains a variant outside its symbol.',
      });
    }

    for (const inheritedStyle of ['constructor', '__proto__']) {
      const inherited = structuredClone(source);
      inherited.document.content.graphIR!.edges[0].type = inheritedStyle;
      expect(validateBundledExample(inherited)).toEqual({
        ok: false, error: 'Example contains an edge style outside its notation.',
      });
    }

    // GraphIR 3 validation inside deserialize rejects dangling endpoints first.
    const ghostEndpoint = structuredClone(source);
    ghostEndpoint.document.content.graphIR!.edges[0].target = 'ghost';
    expect(validateBundledExample(ghostEndpoint)).toEqual({
      ok: false, error: 'Example document is invalid.',
    });

    const missingStart = structuredClone(source);
    const missingStartGraph = missingStart.document.content.graphIR!;
    missingStartGraph.nodes = missingStartGraph.nodes.filter((node) => node.variant !== 'start');
    missingStartGraph.edges = missingStartGraph.edges.filter((edge) => edge.source !== 'start');
    expect(missingStartGraph.nodes.some((node) => node.id === 'start')).toBe(false);
    // An incomplete flowchart is a valid draft. Strict conformance is a
    // separate explicit check, not a requirement for opening an example.
    expect(validateBundledExample(missingStart)).toEqual({ ok: true });

    const invalidConnection = structuredClone(source);
    const end = invalidConnection.document.content.graphIR!.nodes.find((node) => node.id === 'end')!;
    const review = invalidConnection.document.content.graphIR!.nodes.find((node) => node.id === 'review')!;
    invalidConnection.document.content.graphIR!.edges.push({
      id: 'invalid', source: end.id, target: review.id,
    });
    expect(validateBundledExample(invalidConnection)).toEqual({
      ok: false, error: 'Example contains an invalid connection.',
    });
  });

  it('deeply clones stable sources into fresh local documents', () => {
    const source = bundledExamples.find((example) => example.id === 'flowchart')!;
    const before = JSON.stringify(source.document);
    const first = cloneBundledExample(source.id, () => new Date('2026-09-13T12:00:00Z'));
    const second = cloneBundledExample(source.id, () => new Date('2026-09-13T12:00:01Z'));

    expect(first).not.toBe(source.document);
    expect(first.content.graphIR).not.toBe(source.document.content.graphIR);
    expect(first.content.graphIR?.id).not.toBe(source.document.content.graphIR?.id);
    expect(first.metadata.created).toBe('2026-09-13T12:00:00.000Z');
    expect(second.content.graphIR?.id).not.toBe(first.content.graphIR?.id);
    first.content.graphIR!.nodes[0].label = 'Changed';
    expect(JSON.stringify(source.document)).toBe(before);
  });

  it.each(bundledExamples)('deep-freezes $id while clones can be edited, saved, and reopened', (source) => {
    expect(unfrozenPaths(source, source.id)).toEqual([]);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.document)).toBe(true);
    expect(Object.isFrozen(source.document.content.graphIR)).toBe(true);
    expect(Object.isFrozen(source.document.content.graphIR!.nodes[0])).toBe(true);
    const original = source.document.content.graphIR!.nodes[0].label;
    expect(() => {
      source.document.content.graphIR!.nodes[0].label = 'Mutated source';
    }).toThrow(TypeError);
    expect(cloneBundledExample(source.id).content.graphIR!.nodes[0].label).toBe(original);

    const clone = cloneBundledExample(source.id);
    const opened = deserialize(clone);
    opened.nodes[0].data.label = `${opened.nodes[0].data.label} edited`;
    const editedGraph = {
      ...clone.content.graphIR!,
      nodes: convertFlowToGraphNodes(opened.nodes, clone.content.graphIR!.nodes),
      edges: convertFlowToGraphEdges(opened.edges, clone.content.graphIR!.edges),
    };
    const saved = serialize(opened.nodes, opened.edges, {
      name: clone.metadata.name,
      settings: clone.settings,
      graphIR: editedGraph,
    });
    const reopened = deserialize(JSON.parse(JSON.stringify(saved)));
    expect(reopened.nodes[0].data.label).toMatch(/ edited$/);
    expect(reopened.settings.notation).toBe(source.notation);
    expect(saved.content.graphIR!.metadata?.notation).toBe(source.notation);
    expect(reopened.nodes[0].data.symbolId).toBe(source.document.content.graphIR!.nodes[0].symbol);
    expect(JSON.stringify(source.document.content.graphIR!.nodes[0])).not.toContain(' edited');
  });
});
