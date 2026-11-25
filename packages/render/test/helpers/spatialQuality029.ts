import { expect } from 'vitest';
import type { GraphNode, Position } from '@graph-ir/core';
import { projectInstalledSourceToSuccessor028 } from '../../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../../src/svg/layout.js';
import { prepareSpatialScene028 } from '../../src/svg/serialize.js';
import type { LayoutDirection } from '../../src/layout/types.js';
import type { SpatialQualityFixture029 } from '../fixtures/spatialQuality029.js';

export async function completeSpatialSource029(text: string, style: 'lowfi' | 'hifi', direction: LayoutDirection) {
  const projected = projectInstalledSourceToSuccessor028(text);
  expect(projected.diagnostics.filter((issue) => issue.severity === 'error')).toEqual([]);
  expect(projected.graph).toBeDefined();
  const source = projected.graph!;
  const original = structuredClone(source);
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
  const originalDisplay = structuredClone(display);
  const laid = await layoutGraphForSvg(display, { direction, svgOptions: { style }, semanticInterpretations });
  const scene = prepareSpatialScene028(laid, { style, layoutDirection: direction,
    edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource: source });
  expect(source).toEqual(original);
  expect(display).toEqual(originalDisplay);
  return { source, display, laid, scene };
}
export type CompleteSpatialSource029 = Awaited<ReturnType<typeof completeSpatialSource029>>;
function allNodes(nodes: GraphNode[]): GraphNode[] { return nodes.flatMap((node) => [node, ...allNodes(node.children ?? [])]); }

/** Independent sampling catches final route penetration without reusing the validator. */
export function assertSpatialQuality029(result: CompleteSpatialSource029, fixture: SpatialQualityFixture029): void {
  const { scene, display } = result;
  expect(scene.status).toBe('complete');
  expect(new Set(scene.nodes.map(({ node }) => node.id))).toEqual(new Set(allNodes(display.nodes).map(({ id }) => id)));
  expect(new Set(scene.resolved.edges.map(({ id }) => id))).toEqual(new Set(display.edges.map(({ id }) => id)));
  const parents = new Map<string, string>();
  const indexParents = (nodes: GraphNode[], parent?: string): void => { for (const node of nodes) {
    if (parent) parents.set(node.id, parent); indexParents(node.children ?? [], node.id);
  } };
  indexParents(display.nodes);
  const isAncestor = (parent: string, child: string): boolean => {
    let current = parents.get(child); while (current) { if (current === parent) return true; current = parents.get(current); } return false;
  };
  for (const node of scene.nodes) {
    expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true);
    expect(node.width).toBeGreaterThan(0); expect(node.height).toBeGreaterThan(0);
    const parent = scene.nodes.find((candidate) => candidate.node.id === parents.get(node.node.id));
    if (parent) {
      expect(node.x + 1e-5).toBeGreaterThanOrEqual(parent.x);
      expect(node.y + 1e-5).toBeGreaterThanOrEqual(parent.y);
      expect(node.x + node.width).toBeLessThanOrEqual(parent.x + parent.width + 1e-5);
      expect(node.y + node.height).toBeLessThanOrEqual(parent.y + parent.height + 1e-5);
    }
  }

  for (let i = 0; i < scene.nodes.length; i++) for (let j = i + 1; j < scene.nodes.length; j++) {
    const a = scene.nodes[i]!, b = scene.nodes[j]!;
    if (isAncestor(a.node.id, b.node.id) || isAncestor(b.node.id, a.node.id)) continue;
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    expect(overlapX > 1e-4 && overlapY > 1e-4, `${fixture.id}: ${a.node.id} overlaps ${b.node.id}`).toBe(false);
  }
  for (const authored of result.source.nodes) if (authored.pinned && authored.position) {
    const placed = scene.nodes.find((node) => node.node.id === authored.id)!;
    expect(placed.x).toBeCloseTo(authored.position.x);
    expect(placed.y).toBeCloseTo(authored.position.y);
  }
  for (const authored of result.source.edges) {
    let previous = -1;
    const points = scene.resolved.edges.find((edge) => edge.id === authored.id)!.points;
    for (const waypoint of authored.routeIntent?.waypoints ?? []) {
      if (waypoint.placement.kind !== 'absolute') continue;
      const position = waypoint.placement.position;
      const index = points.findIndex((point, index) => index >= previous && Math.hypot(point.x - position.x, point.y - position.y) < 1e-5);
      expect(index, `${fixture.id}: checkpoint ${waypoint.id} order/fidelity`).toBeGreaterThanOrEqual(0);
      previous = index;
    }
  }
  const forward = new Set(fixture.forwardEdges ?? []);
  for (const edge of scene.resolved.edges) {
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    expect(edge.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const a = scene.nodes.find((node) => node.node.id === edge.sourceId)!;
    const b = scene.nodes.find((node) => node.node.id === edge.targetId)!;
    if (forward.has(edge.id)) {
      const horizontal = fixture.direction === 'RIGHT' || fixture.direction === 'LEFT';
      const sign = fixture.direction === 'LEFT' || fixture.direction === 'UP' ? -1 : 1;
      expect(sign * ((horizontal ? b.x + b.width / 2 : b.y + b.height / 2) -
        (horizontal ? a.x + a.width / 2 : a.y + a.height / 2)), edge.id).toBeGreaterThan(0);
    }
    for (const node of scene.nodes) {
      if ([edge.sourceId, edge.targetId].includes(node.node.id) || isAncestor(node.node.id, edge.sourceId) || isAncestor(node.node.id, edge.targetId)) continue;
      for (let segment = 1; segment < edge.points.length; segment++) for (let sample = 1; sample < 64; sample++) {
        const a = edge.points[segment - 1]!, b = edge.points[segment]!, t = sample / 64;
        const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
        expect(x > node.x + 1e-4 && x < node.x + node.width - 1e-4 && y > node.y + 1e-4 && y < node.y + node.height - 1e-4,
          `${fixture.id}: ${edge.id} penetrates ${node.node.id}`).toBe(false);
      }
    }
  }
}
type CrossingRoute029 = { points: readonly Position[]; sourceId: string; targetId: string };
const CROSSING_EPSILON = 1e-6;
function intersection029(a: Position, b: Position, c: Position, d: Position): Position | 'overlap' | undefined {
  const dx = b.x - a.x, dy = b.y - a.y, ex = d.x - c.x, ey = d.y - c.y;
  const length = Math.hypot(dx, dy), otherLength = Math.hypot(ex, ey);
  if (length < CROSSING_EPSILON || otherLength < CROSSING_EPSILON) return undefined;
  const determinant = dx * ey - dy * ex;
  if (Math.abs(determinant) > CROSSING_EPSILON) {
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / determinant;
    const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / determinant;
    if (t < -CROSSING_EPSILON || t > 1 + CROSSING_EPSILON || u < -CROSSING_EPSILON || u > 1 + CROSSING_EPSILON) return undefined;
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  if (Math.abs((c.x - a.x) * dy - (c.y - a.y) * dx) / length > CROSSING_EPSILON) return undefined;
  const project = (p: Position) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length);
  const first = Math.max(0, Math.min(project(c), project(d)));
  const last = Math.min(1, Math.max(project(c), project(d)));
  if (last < first - CROSSING_EPSILON) return undefined;
  if ((last - first) * length > CROSSING_EPSILON) return 'overlap';
  return { x: a.x + first * dx, y: a.y + first * dy };
}
function commonContact029(point: Position, a: CrossingRoute029, b: CrossingRoute029): boolean {
  const contacts = (route: CrossingRoute029) => [{ id: route.sourceId, point: route.points[0]! },
    { id: route.targetId, point: route.points.at(-1)! }];
  return contacts(a).some(left => contacts(b).some(right => left.id === right.id &&
    Math.hypot(point.x - left.point.x, point.y - left.point.y) < CROSSING_EPSILON &&
    Math.hypot(point.x - right.point.x, point.y - right.point.y) < CROSSING_EPSILON));
}
/** Count shaft intersections, including bends, T contacts and overlapping segments.
 * Only a genuine common node contact is exempt; no corpus case authors a shaft junction.
 */
export function properCrossingCount029(scene: { resolved: { edges: readonly CrossingRoute029[] } }): number {
  let count = 0;
  for (let i = 0; i < scene.resolved.edges.length; i++) for (let j = i + 1; j < scene.resolved.edges.length; j++) {
    const a = scene.resolved.edges[i]!, b = scene.resolved.edges[j]!;
    const intersections = new Set<string>();
    for (let p = 1; p < a.points.length; p++) for (let q = 1; q < b.points.length; q++) {
      const point = intersection029(a.points[p - 1]!, a.points[p]!, b.points[q - 1]!, b.points[q]!);
      if (point === 'overlap') intersections.add('overlap');
      else if (point && !commonContact029(point, a, b)) intersections.add(`${point.x.toFixed(5)},${point.y.toFixed(5)}`);
    }
    count += intersections.size;
  }
  return count;
}
