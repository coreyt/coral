/**
 * Tests for waypoint persistence in file format (Step 5)
 */
import { describe, it, expect } from 'vitest';
import { serialize } from '../src/file/serialize.js';
import { deserialize } from '../src/file/deserialize.js';
import type { CoralNode, CoralEdge } from '../src/types.js';
import type { CoralDocument, EdgeRoutingData } from '../src/file/schema.js';

function makeNode(id: string, x = 0, y = 0): CoralNode {
  return {
    id,
    type: 'process',
    position: { x, y },
    data: { label: id, nodeType: 'process' },
  } as CoralNode;
}

function makeEdge(id: string, source: string, target: string): CoralEdge {
  return { id, source, target, data: { label: '' } } as CoralEdge;
}

describe('waypoint file persistence', () => {
  it('serialize without waypoints preserves existing behavior', () => {
    const nodes = [makeNode('a', 10, 20), makeNode('b', 100, 200)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const doc = serialize(nodes, edges, { name: 'test' });

    expect(doc.nodePositions).toBeDefined();
    // No edgeRouting when no waypoints
    expect(doc.edgeRouting).toBeUndefined();
  });

  it('serialize with waypoints sets isPinned=true and includes waypoint metadata', () => {
    const nodes = [makeNode('a', 10, 20), makeNode('b', 100, 200)];
    const edges = [makeEdge('e1', 'a', 'b')];

    const waypointMap = new Map<string, Array<{ id: string; x: number; y: number; type: string }>>([
      ['e1', [{ id: 'wp-1', x: 150, y: 100, type: 'corner' }]],
    ]);

    const doc = serialize(nodes, edges, { name: 'test' }, waypointMap);

    expect(doc.edgeRouting).toBeDefined();
    const routing = doc.edgeRouting!['e1'];
    expect(routing).toBeDefined();
    expect(routing.isPinned).toBe(true);
    expect(routing.waypoints).toHaveLength(1);
    expect(routing.waypoints![0]).toEqual({ id: 'wp-1', x: 150, y: 100, type: 'corner' });
  });

  it('preserves relative route intent while synchronizing editable absolute waypoints', () => {
    const nodes = [makeNode('a'), makeNode('b', 200, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const waypointMap = new Map([['e1', [
      { id: 'absolute', x: 75, y: 30, type: 'corner' },
    ]]]);
    const doc = serialize(nodes, edges, { name: 'mixed', graphIR: {
      version: '3.0.0', id: 'mixed',
      nodes: [
        { id: 'a', type: 'service' }, { id: 'b', type: 'service' },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', routeIntent: { waypoints: [
        { id: 'absolute', placement: { kind: 'absolute', position: { x: 50, y: 20 } } },
        { id: 'relative', placement: {
          kind: 'relative', anchor: { kind: 'target' }, offset: { x: -10, y: 5 },
        } },
      ] } }],
    } }, waypointMap);

    expect(doc.content.graphIR.edges[0].routeIntent?.waypoints).toEqual([
      { id: 'absolute', placement: { kind: 'absolute', position: { x: 75, y: 30 } } },
      { id: 'relative', placement: {
        kind: 'relative', anchor: { kind: 'target' }, offset: { x: -10, y: 5 },
      } },
    ]);
  });

  it('deserialize restores waypoints when isPinned is true', () => {
    // Build a complete valid document
    const doc: CoralDocument = {
      schemaVersion: '1.0.0',
      metadata: {
        name: 'test',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '1.0.0',
          id: 'test',
          nodes: [
            { id: 'a', type: 'process', label: 'A' },
            { id: 'b', type: 'process', label: 'B' },
          ],
          edges: [{ id: 'e1', source: 'a', target: 'b' }],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
      nodePositions: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
      edgeRouting: {
        e1: {
          bendPoints: [],
          isPinned: true,
          waypoints: [{ id: 'wp-1', x: 150, y: 100, type: 'corner' }],
        },
      },
    };

    const result = deserialize(doc);
    expect(result.edgeWaypoints).toBeDefined();
    expect(result.edgeWaypoints!.get('e1')).toHaveLength(1);
    expect(result.edgeWaypoints!.get('e1')![0]).toEqual({
      id: 'wp-1', x: 150, y: 100, type: 'corner',
    });
  });

  it('deserialize ignores edgeRouting when isPinned is false', () => {
    const doc: CoralDocument = {
      schemaVersion: '1.0.0',
      metadata: {
        name: 'test',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '1.0.0',
          id: 'test',
          nodes: [
            { id: 'a', type: 'process', label: 'A' },
            { id: 'b', type: 'process', label: 'B' },
          ],
          edges: [{ id: 'e1', source: 'a', target: 'b' }],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
      edgeRouting: {
        e1: {
          bendPoints: [{ x: 100, y: 50 }],
          isPinned: false,
        },
      },
    };

    const result = deserialize(doc);
    // No waypoints restored for non-pinned routing
    expect(result.edgeWaypoints?.size ?? 0).toBe(0);
  });

  it('roundtrip: serialize then deserialize preserves waypoints', () => {
    const nodes = [makeNode('a', 10, 20), makeNode('b', 100, 200)];
    const edges = [makeEdge('e1', 'a', 'b')];

    const waypointMap = new Map<string, Array<{ id: string; x: number; y: number; type: string }>>([
      ['e1', [
        { id: 'wp-1', x: 50, y: 80, type: 'corner' },
        { id: 'wp-2', x: 75, y: 120, type: 'smooth' },
      ]],
    ]);

    const doc = serialize(nodes, edges, { name: 'roundtrip' }, waypointMap);
    const result = deserialize(doc);

    expect(result.edgeWaypoints).toBeDefined();
    const wps = result.edgeWaypoints!.get('e1');
    expect(wps).toHaveLength(2);
    expect(wps![0]).toEqual({ id: 'wp-1', x: 50, y: 80, type: 'corner' });
    expect(wps![1]).toEqual({ id: 'wp-2', x: 75, y: 120, type: 'smooth' });
  });
});
