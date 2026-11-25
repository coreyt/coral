// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@coral-viz/language';
import { applySpatialPlan, materializeSpatialSnapshot } from '../../../src/llm/spatial/apply';
import { checkSpatialPreservation } from '../../../src/llm/spatial/preserve';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';
import { resolveSpatialPlan } from '../../../src/llm/spatial/resolve';
import type { SpatialPlan } from '../../../src/llm/spatial/types';
import { geometry, graph } from './fixtures';

function planFor(text = 'move db above api', source: GraphIR = graph): SpatialPlan {
  const result = resolveSpatialPlan(source, geometry, recognizeSpatialRequest(text));
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.diagnostics[0]?.message);
  return result.plan;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('spatial preservation and authoritative apply', () => {
  it('allows only the planned position in spatial-only mode and retains every other field', () => {
    const plan = planFor();
    const candidate = clone(graph);
    candidate.nodes[1].position = { x: 999, y: 999 };
    expect(checkSpatialPreservation(graph, candidate, plan)).toMatchObject({ success: true, diagnostics: [] });
    const applied = applySpatialPlan({ original: graph, candidate, plan });
    expect(applied.success).toBe(true);
    expect(applied.graph).not.toBe(candidate);
    expect(applied.graph.nodes[1].position).toEqual({ x: 110, y: -4 });
    expect(applied.graph.edges[0].routeIntent).toEqual(graph.edges[0].routeIntent);
    expect(graph.nodes[1].position).toEqual({ x: 360, y: 220 });

    const unchanged = applySpatialPlan({ original: applied.graph, candidate: applied.graph, plan });
    expect(unchanged.success).toBe(true);
    expect(unchanged.graph).toBe(applied.graph);
  });

  it.each([
    ['graph layout', (value: GraphIR) => { value.layoutOptions = { direction: 'RIGHT' }; }],
    ['unplanned position', (value: GraphIR) => { value.nodes[0].position = { x: 1, y: 2 }; }],
    ['dimension', (value: GraphIR) => { value.nodes[0].dimensions = { width: 1, height: 2 }; }],
    ['pin', (value: GraphIR) => { value.nodes[0].pinned = true; }],
    ['hierarchy', (value: GraphIR) => { value.nodes.reverse(); }],
    ['edge route', (value: GraphIR) => { value.edges[0].routeIntent = { waypoints: [{
      id: 'changed', placement: { kind: 'absolute', position: { x: 1, y: 2 } },
    }] }; }],
    ['edge endpoint', (value: GraphIR) => { value.edges[0].target = 'api'; }],
  ])('rejects a spatial-only %s change and returns the exact original reference', (_name, mutate) => {
    const candidate = clone(graph);
    mutate(candidate);
    const result = applySpatialPlan({ original: graph, candidate, plan: planFor() });
    expect(result).toMatchObject({ success: false, diagnostics: [{ code: 'spatial.preservation' }] });
    expect(result.graph).toBe(graph);
  });

  it('allows bounded mixed content edits and additions while preserving geometry and extensions', () => {
    const original = clone(graph) as GraphIR & Record<string, unknown>;
    original.extraGraph = { keep: true };
    (original.nodes[0] as unknown as Record<string, unknown>).extraNode = ['keep'];
    (original.edges[0] as unknown as Record<string, unknown>).extraEdge = { keep: 1 };
    const plan = { ...planFor('move db above api', original), classification: 'mixed' as const };
    const candidate = clone(original);
    candidate.name = 'Renamed';
    candidate.metadata = { description: 'changed' };
    candidate.nodes[0].label = 'Changed API';
    candidate.nodes[0].type = 'module';
    candidate.nodes[0].description = 'Changed description';
    candidate.nodes[0].symbol = 'actor';
    candidate.nodes[0].variant = 'alternate';
    candidate.nodes[0].properties = { changed: true };
    candidate.nodes[0].sourceInfo = { range: { start: 0, end: 1 }, modified: true };
    candidate.nodes.push({ id: 'new-top', type: 'service' });
    candidate.nodes[2].children!.splice(1, 0, { id: 'new-nested', type: 'service' });
    candidate.edges[0].label = 'Changed edge';
    candidate.edges[0].type = 'changed';
    candidate.edges[0].properties = { changed: true };
    candidate.edges[0].style = { lineStyle: 'dashed' };
    candidate.edges[0].sourceInfo = { range: { start: 1, end: 2 }, modified: true };
    candidate.edges.push({ id: 'new-edge', source: 'api', target: 'new-top' });
    const result = applySpatialPlan({ original, candidate, plan });
    expect(result.success).toBe(true);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['api', 'db', 'platform', 'new-top']);
    expect(result.graph.nodes[2].children?.map((node) => node.id)).toEqual(['cache', 'new-nested', 'worker']);
    expect((result.graph as GraphIR & Record<string, unknown>).extraGraph).toEqual({ keep: true });
    expect(result.graph.edges[0].routeIntent).toEqual(graph.edges[0].routeIntent);

    const reapplied = applySpatialPlan({ original: result.graph, candidate: result.graph, plan });
    expect(reapplied.success).toBe(true);
    expect(reapplied.graph).toBe(result.graph);
  });

  it.each([
    ['removed node', (value: GraphIR) => { value.nodes.splice(0, 1); }],
    ['reordered siblings', (value: GraphIR) => { value.nodes.splice(0, 2, value.nodes[1], value.nodes[0]); }],
    ['removed nested node', (value: GraphIR) => { value.nodes[2].children!.splice(0, 1); }],
    ['node layout', (value: GraphIR) => { value.nodes[0].layoutOptions = { portConstraints: 'FIXED_SIDE' }; }],
    ['ports', (value: GraphIR) => { value.nodes[0].ports = [{ id: 'p', side: 'EAST' }]; }],
    ['routing', (value: GraphIR) => { value.edges[0].routeIntent = { waypoints: [] }; }],
    ['unknown deletion', (value: GraphIR) => { delete (value.nodes[0] as unknown as Record<string, unknown>).extraNode; }],
    ['graph id', (value: GraphIR) => { value.id = 'changed'; }],
    ['graph version', (value: GraphIR) => { (value as unknown as { version: string }).version = '1.0.0'; }],
    ['graph layout', (value: GraphIR) => { value.layoutOptions = { direction: 'LEFT' }; }],
    ['graph extension', (value: GraphIR) => { (value as GraphIR & Record<string, unknown>).extraGraph = false; }],
    ['dimensions', (value: GraphIR) => { value.nodes[0].dimensions = { width: 1, height: 1 }; }],
    ['pin', (value: GraphIR) => { value.nodes[0].pinned = true; }],
    ['unplanned position', (value: GraphIR) => { value.nodes[0].position = { x: 3, y: 4 }; }],
    ['reparent', (value: GraphIR) => { value.nodes[2].children!.push(value.nodes.shift()!); }],
    ['edge endpoint', (value: GraphIR) => { value.edges[0].source = 'db'; }],
    ['edge port', (value: GraphIR) => { value.edges[0].sourcePort = 'changed'; }],
    ['edge extension', (value: GraphIR) => { (value.edges[0] as unknown as Record<string, unknown>).extraEdge = false; }],
  ])('rejects mixed protected change: %s', (_name, mutate) => {
    const original = clone(graph);
    (original.nodes[0] as unknown as Record<string, unknown>).extraNode = true;
    (original as GraphIR & Record<string, unknown>).extraGraph = true;
    (original.edges[0] as unknown as Record<string, unknown>).extraEdge = true;
    const plan = { ...planFor('move db above api', original), classification: 'mixed' as const };
    const candidate = clone(original);
    mutate(candidate);
    expect(applySpatialPlan({ original, candidate, plan })).toMatchObject({
      success: false, diagnostics: [{ code: 'spatial.preservation' }], graph: original,
    });
  });

  it('rejects stale baseline revisions but permits a previously applied subject position', () => {
    const plan = planFor();
    const staleCases = [
      (value: GraphIR) => { (value as unknown as { version: string }).version = '1.0.0'; },
      (value: GraphIR) => { value.nodes[0].position = { x: 7, y: 8 }; },
      (value: GraphIR) => { value.edges[0].source = 'db'; },
      (value: GraphIR) => { value.nodes[2].children!.splice(0, 1); },
      (value: GraphIR) => { value.nodes.reverse(); },
    ];
    for (const mutate of staleCases) {
      const stale = clone(graph);
      mutate(stale);
      const result = applySpatialPlan({ original: stale, candidate: stale, plan });
      expect(result).toMatchObject({ success: false, diagnostics: [{ code: 'spatial.plan.stale' }] });
      expect(result.graph).toBe(stale);
    }
  });

  it('protects provider-moved pinned arrangement anchors', () => {
    const plan = planFor('arrange api and db in a row');
    const candidate = clone(graph);
    candidate.nodes[1].position = { x: 900, y: 900 };
    expect(applySpatialPlan({ original: graph, candidate, plan })).toMatchObject({
      success: false, diagnostics: [{ code: 'spatial.preservation' }], graph,
    });
  });

  it.each(['node', 'edge'])('treats a post-plan %s addition as stale for spatial-only scope', (kind) => {
    const plan = planFor('put db on the right side of the diagram');
    const changed = clone(graph);
    if (kind === 'node') changed.nodes.push({ id: 'farther', type: 'service', position: { x: 5_000, y: 0 } });
    else changed.edges.push({ id: 'later-edge', source: 'api', target: 'db' });
    const result = applySpatialPlan({ original: changed, candidate: changed, plan });
    expect(result).toMatchObject({ success: false, diagnostics: [{ code: 'spatial.plan.stale' }] });
    expect(result.graph).toBe(changed);
  });

  it('materializes only dependencies and overwrites stale or absent stored coordinates', () => {
    const plan = planFor();
    const applied = applySpatialPlan({ original: graph, candidate: graph, plan });
    expect(applied.success).toBe(true);
    const materialized = materializeSpatialSnapshot(applied.graph, plan);
    expect(materialized.nodes[0].position).toEqual({ x: 100, y: 100 });
    expect(materialized.nodes[1].position).toEqual({ x: 110, y: -4 });
    expect(materialized.edges).toBe(applied.graph.edges);
    expect(materializeSpatialSnapshot(materialized, plan)).toBe(materialized);
  });

  it('materializes an absent non-subject dependency without touching a nondependency', () => {
    const source = clone(graph);
    delete source.nodes[0].position;
    const plan = planFor('move db above api', source);
    const applied = applySpatialPlan({ original: source, candidate: source, plan });
    expect(applied.success).toBe(true);
    expect(applied.graph.nodes[0].position).toBeUndefined();
    expect(applied.graph.nodes[2].children![1].position).toBeUndefined();
    const materialized = materializeSpatialSnapshot(applied.graph, plan);
    expect(materialized.nodes[0].position).toEqual({ x: 100, y: 100 });
    expect(materialized.nodes[2].children![1].position).toBeUndefined();
    expect(materialized.edges).toBe(applied.graph.edges);
    expect(materializeSpatialSnapshot(materialized, plan)).toBe(materialized);
  });
});
