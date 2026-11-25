import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { markerId, markerDomId028, renderSvg, visualStyle028, type GraphEdge, type GraphNode } from '@coral-viz/render';
import { EndpointMarkerDefinitions } from '../src/compatibility/EndpointMarkerDefinitions';
import { convertEdge } from '../src/editor/converter';

/** Canvas endpoint marker definitions match the exported SVG - R-057 AC-2. */

const nodes = [
  { id: 'a', type: 'service', symbol: 'arch-service', label: 'A', position: { x: 0, y: 0 } },
  { id: 'b', type: 'database', symbol: 'arch-database', label: 'B', position: { x: 300, y: 0 } },
] as GraphNode[];
const scene = { notation: 'architecture', nodes };
const kinds = ['arrow', 'triangle', 'diamond', 'circle', 'bar', 'crow-foot', 'zero-or-one', 'one', 'zero-or-many', 'one-or-many'] as const;
const matrix = kinds.flatMap((kind) => (['open', 'filled', 'unspecified'] as const).map((fill) => ({ kind, fill })));

function describeMarkers(root: ParentNode) {
  return new Map([...root.querySelectorAll('marker')].map((marker) => [marker.id, {
    orient: marker.getAttribute('orient'),
    paths: [...marker.querySelectorAll('path')].map((path) =>
      ['d', 'fill', 'stroke'].map((name) => path.getAttribute(name))),
  }]));
}

describe('EndpointMarkerDefinitions', () => {
  it('draws every marker descriptor exactly as the SVG export does', () => {
    const edges = matrix.map((marker, index) => ({ id: `e${index}`, source: 'a', target: 'b', type: 'data', targetEnd: { marker } })) as GraphEdge[];
    const exported = describeMarkers(new DOMParser().parseFromString(
      renderSvg({ nodes, edges, metadata: { notation: 'architecture' } },
        { domIdNamespace: 'canvas' }), 'image/svg+xml'));
    const { container } = render(<EndpointMarkerDefinitions edges={edges.map((edge) => convertEdge(edge, scene))} />);
    const canvas = describeMarkers(container);
    expect(canvas.size).toBe(matrix.length);
    expect([...canvas.keys()].sort()).toEqual([...exported.keys()].sort());
    for (const [id, definition] of canvas) {
      expect(definition, id).toEqual(exported.get(id));
      expect(definition.orient).toBe('auto-start-reverse');
    }
  });

  it('defines the marker each converted edge references for its own stroke', () => {
    const edges = [
      convertEdge({ id: 'data', source: 'a', target: 'b', type: 'data' }, scene),
      convertEdge({ id: 'async', source: 'a', target: 'b', type: 'async' }, scene),
    ];
    const { container } = render(<EndpointMarkerDefinitions edges={edges} />);
    // The reviewed style uses one ink color, so equal descriptors share one
    // marker definition even when the old catalog assigned different colors.
    expect(container.querySelectorAll('marker')).toHaveLength(1);
    for (const edge of edges) {
      const marker = edge.data?.targetEndpoint?.marker;
      expect(marker).toBeDefined();
      const id = markerDomId028(marker!, visualStyle028('lowfi').ink, 'canvas');
      expect(container.querySelector(`marker[id="${id}"] path`)?.getAttribute('stroke'))
        .toBe(visualStyle028('lowfi').ink);
    }
  });

  it('projects the catalog source arrow of a bidirectional style onto the canvas', () => {
    const edge = convertEdge({ id: 'bi', source: 'a', target: 'b', type: 'bidirectional' }, scene);
    const arrow = { kind: 'arrow', fill: 'unspecified' } as const;
    expect(edge.data?.sourceEndpoint?.marker).toEqual(arrow);
    expect(edge.markerStart).toBe(`url(#${markerId(arrow, '#2196f3')})`);
    expect(edge.markerEnd).toBe(edge.markerStart);
  });
});
