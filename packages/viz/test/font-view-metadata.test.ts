import { describe, expect, it } from 'vitest';
import * as viz from '../src/index.js';
import type { CoralNode } from '../src/types.js';

const nodeMetadataKey = (viz as Record<string, unknown>).CORAL_NODE_VIEW_METADATA;

function node(overrides: Partial<CoralNode> = {}): CoralNode {
  return {
    id: 'n1',
    type: 'symbol',
    position: { x: 1, y: 2 },
    width: 220,
    height: 90,
    data: {
      label: 'Node',
      nodeType: 'service',
      canonical: { dimensions: { width: 140, height: 70 } },
    },
    ...overrides,
  } as CoralNode;
}

function metadataNode(source: unknown, overrides: Partial<CoralNode> = {}): CoralNode {
  const key = typeof nodeMetadataKey === 'symbol' ? nodeMetadataKey : Symbol('missing');
  const value = node(overrides);
  Object.assign(value.data, { [key]: { dimensionSource: source } });
  return value;
}

function savedNode(value: CoralNode) {
  return viz.serialize([value], [], {
    name: 'Dimensions',
    graphIR: { version: '3.0.0', id: 'g', nodes: [], edges: [] },
  }).content.graphIR!.nodes[0];
}

describe('collision-safe font view metadata', () => {
  it('exports stable unique-symbol metadata keys and refined public types at runtime', () => {
    expect(typeof nodeMetadataKey).toBe('symbol');
    expect(Symbol.keyFor(nodeMetadataKey as symbol))
      .toBe('@coral-viz/viz/node-view-metadata');
    const edgeKey = (viz as Record<string, unknown>).CORAL_EDGE_VIEW_METADATA;
    expect(typeof edgeKey).toBe('symbol');
    expect(Symbol.keyFor(edgeKey as symbol))
      .toBe('@coral-viz/viz/edge-view-metadata');
  });

  it('uses exact graph, editor-font, and legacy dimension precedence', () => {
    expect(savedNode(metadataNode('graph')).dimensions).toEqual({ width: 140, height: 70 });

    const derived = savedNode(metadataNode('editor-font'));
    expect(Object.hasOwn(derived, 'dimensions')).toBe(false);

    expect(savedNode(node()).dimensions).toEqual({ width: 220, height: 90 });
    expect(savedNode(metadataNode('unknown')).dimensions).toEqual({ width: 220, height: 90 });

    const half = metadataNode('graph', { width: 220, height: undefined });
    expect(savedNode(half).dimensions).toEqual({ width: 140, height: 70 });

    const graphWithoutCanonical = metadataNode('graph', {
      data: { label: 'Graph fallback', nodeType: 'service' },
    });
    expect(savedNode(graphWithoutCanonical).dimensions).toEqual({ width: 220, height: 90 });

    const derivedWithCanonical = metadataNode('editor-font');
    expect(savedNode(derivedWithCanonical)).not.toHaveProperty('dimensions');

    const halfLegacy = node({ width: 220, height: undefined });
    expect(savedNode(halfLegacy).dimensions).toEqual({ width: 140, height: 70 });
    const nonFiniteLegacy = node({ width: Number.POSITIVE_INFINITY, height: 90 });
    expect(savedNode(nonFiniteLegacy).dimensions).toEqual({ width: 140, height: 70 });
  });

  it('applies the full precedence matrix to the public flow-to-GraphIR converter', () => {
    const graph = viz.convertFlowToGraphNodes([
      metadataNode('graph'),
      metadataNode('editor-font', { id: 'n2' }),
      node({ id: 'n3' }),
      metadataNode('unknown', { id: 'n4' }),
      metadataNode('graph', { id: 'n5', width: 220, height: undefined }),
      node({ id: 'n6', width: Number.NaN, height: 90 }),
    ], []);

    expect(graph[0].dimensions).toEqual({ width: 140, height: 70 });
    expect(Object.hasOwn(graph[1], 'dimensions')).toBe(false);
    expect(graph[2].dimensions).toEqual({ width: 220, height: 90 });
    expect(graph[3].dimensions).toEqual({ width: 220, height: 90 });
    expect(graph[4].dimensions).toEqual({ width: 140, height: 70 });
    expect(graph[5].dimensions).toEqual({ width: 140, height: 70 });
  });

  it('marks authored dimensions before React Flow measurement', () => {
    const graphNode = {
      id: 'authored', type: 'service', label: 'Authored',
      dimensions: { width: 180, height: 75 },
    };
    const converted = viz.convertNode(graphNode, 0);
    const convertedGraph = viz.convertGraphToFlow({
      version: '3.0.0', id: 'g', nodes: [graphNode], edges: [],
    }).nodes[0];
    const deserialized = viz.deserialize({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Authored',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
      },
      content: {
        format: 'graph-ir',
        graphIR: { version: '3.0.0', id: 'g', nodes: [graphNode], edges: [] },
      },
      settings: {
        notation: 'flowchart',
        layout: { algorithm: 'layered', direction: 'DOWN' },
      },
    }).nodes[0];

    expect((converted.data as Record<PropertyKey, unknown>)[nodeMetadataKey as symbol])
      .toEqual({ dimensionSource: 'graph' });
    expect((convertedGraph.data as Record<PropertyKey, unknown>)[nodeMetadataKey as symbol])
      .toEqual({ dimensionSource: 'graph' });
    expect((deserialized.data as Record<PropertyKey, unknown>)[nodeMetadataKey as symbol])
      .toEqual({ dimensionSource: 'graph' });

    const afterMeasurement = {
      ...deserialized,
      width: 999,
      height: 444,
      measured: { width: 998, height: 443 },
    };
    expect(savedNode(afterMeasurement).dimensions).toEqual({ width: 180, height: 75 });
  });

  it('ignores colliding legacy string extension keys', () => {
    const legacy = node({
      data: {
        label: 'Legacy',
        nodeType: 'service',
        canonical: { dimensions: { width: 140, height: 70 } },
        dimensionSource: 'editor-font',
        font: 'consumer-owned',
        lines: 'consumer-owned',
        lineHeightPx: 'consumer-owned',
      },
    });

    expect(savedNode(legacy).dimensions).toEqual({ width: 220, height: 90 });
    expect(viz.convertFlowToGraphNodes([legacy], [])[0].dimensions)
      .toEqual({ width: 220, height: 90 });
  });
});
