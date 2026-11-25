// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { parse } from '@coral-viz/language/parser';
import { captureSpatialGeometry, finalizeSpatialCandidate, hydrateSpatialCandidate } from '../../../src/llm/spatial/integration';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';
import { resolveSpatialPlan } from '../../../src/llm/spatial/resolve';
import { geometry, graph } from './fixtures';

describe('spatial generation integration boundary', () => {
  it('accepts a printer-round-tripped mixed edit from the editor save shape', () => {
    const original = {
      version: '3.0.0' as const,
      id: 'coral-graph',
      name: 'Untitled Diagram',
      nodes: [
        { id: 'alpha', type: 'service', label: 'Alpha Payment Processing Service', properties: { port: 8080 }, position: { x: 100, y: 200 }, pinned: true },
        { id: 'beta', type: 'database', label: 'Beta', position: { x: 600, y: 400 }, pinned: undefined },
      ],
      edges: [{
        id: 'alpha_to_beta', source: 'alpha', target: 'beta', type: 'writes', label: 'Persists',
        style: { lineStyle: 'dashed' as const }, lineStyle: 'dashed' as const, properties: { weight: 3 },
        routeIntent: { waypoints: [{
          id: 'alpha_to_beta-dsl-0',
          placement: { kind: 'absolute' as const, position: { x: 300, y: 300 } },
        }] },
      }],
    };
    const captured = [
      { id: 'alpha', position: { x: 100, y: 200 }, width: 220, height: 80 },
      { id: 'beta', position: { x: 600, y: 400 }, width: 100, height: 80 },
    ];
    const recognized = recognizeSpatialRequest('move beta above alpha; rename the database');
    const resolved = resolveSpatialPlan(original, captured, recognized);
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;
    const parsed = parse('service "Alpha Payment Processing Service" as alpha @ (100, 200) pinned {\n port: 8080\n}\ndatabase "Storage" as beta @ (999, 999)\nalpha -> beta [writes, dashed, label: "Persists", weight: 3]', { graphId: 'coral-graph' });
    expect(parsed.success).toBe(true);
    const candidate = hydrateSpatialCandidate(original, parsed.graph!, resolved.plan);
    expect(finalizeSpatialCandidate(original, candidate, resolved.plan).success).toBe(true);
  });

  it('captures parent-relative React Flow geometry with measured size and origin', () => {
    const nodes = [{
      id: 'child',
      position: { x: 12, y: -4 },
      parentId: 'group',
      origin: [0.5, 1] as [number, number],
      measured: { width: 81, height: 43 },
      width: 80,
      height: 40,
      data: { width: 79, height: 39 },
    }] as Node[];

    expect(captureSpatialGeometry(nodes)).toEqual([{
      id: 'child', position: { x: 12, y: -4 }, parentId: 'group',
      origin: [0.5, 1], width: 81, height: 43,
    }]);
  });

  it('rejects geometry whose authoritative size is unavailable', () => {
    expect(() => captureSpatialGeometry([{
      id: 'missing', position: { x: 0, y: 0 }, data: {},
    } as Node])).toThrow('missing');
  });

  it('hydrates fields Coral cannot spell without restoring removed entities', () => {
    const original = structuredClone(graph);
    original.nodes[0].sourceInfo = { range: { start: 1, end: 2 } };
    original.edges[0].sourceInfo = { range: { start: 3, end: 4 } };
    const recognition = recognizeSpatialRequest('move db above api; rename the database');
    const resolved = resolveSpatialPlan(original, geometry, recognition);
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;
    const parsed = parse([
      'service "API changed" as api',
      'database "Database changed" as db',
      'group "Platform" as platform {',
      '  service "Cache" as cache',
      '  service "Worker" as worker',
      '}',
      'api -> db',
    ].join('\n'), { graphId: graph.id }).graph!;

    const hydrated = hydrateSpatialCandidate(original, parsed, resolved.plan);
    expect(hydrated.nodes[0].dimensions).toEqual(original.nodes[0].dimensions);
    expect(hydrated.nodes[1].pinned).toBeUndefined();
    expect(hydrated.nodes[0].position).toBeUndefined();
    expect(hydrated.nodes[0].sourceInfo).toEqual(original.nodes[0].sourceInfo);
    expect(hydrated.edges[0].sourceInfo).toEqual(original.edges[0].sourceInfo);
    expect(hydrated.edges[0].routeIntent).toEqual(original.edges[0].routeIntent);

    const removed = { ...parsed, nodes: parsed.nodes.filter((node) => node.id !== 'api') };
    expect(hydrateSpatialCandidate(original, removed, resolved.plan).nodes.some((node) => node.id === 'api')).toBe(false);
  });

  it('returns canonical graph plus a replayable verified projection', () => {
    const resolved = resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('move db above api'));
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;

    const result = finalizeSpatialCandidate(graph, graph, resolved.plan);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.graph.nodes[1].position).toEqual({ x: 110, y: -4 });
    expect(result.graph.nodes[0].dimensions).toEqual(graph.nodes[0].dimensions);
    expect(result.graph.edges[0].routeIntent).toEqual(graph.edges[0].routeIntent);
    expect(result.dsl).toContain('@ (110, -4)');
    expect(result.evidence.every((item) => item.satisfied)).toBe(true);
  });

  it('uses an ephemeral dependency snapshot when authored target positions are absent', () => {
    const original = structuredClone(graph);
    delete original.nodes[0].position;
    delete original.nodes[1].position;
    const resolved = resolveSpatialPlan(original, geometry, recognizeSpatialRequest('move db above api'));
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;

    const result = finalizeSpatialCandidate(original, original, resolved.plan);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.graph.nodes[0].position).toBeUndefined();
    expect(result.dsl).not.toMatch(/API Gateway.*@/);
    expect(result.evidence.every((item) => item.satisfied)).toBe(true);
  });
});
