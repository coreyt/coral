/**
 * Coral 0.2.14 Living Diagram Quality & Grokability Scorer.
 *
 * Extends `evaluatePreparedSceneQuality0211` (Tier-1 zero-tolerance hard
 * defects + Tier-2 geometric score) with 0.2.14 grokability and visual-clarity
 * diagnostics: edge-label route affinity, group-boundary containment, semantic
 * role differentiation (for `anemone` and `parrotfish` modeled outputs), and
 * symbol-overload checks. Kept outside `src/index.ts` so it adds 0 bytes to
 * `@coral-viz/browser`.
 */
import type { LayoutDirection } from '../layout/types.js';
import type { PreparedSpatialScene028 } from '../svg/serialize.js';
import {
  evaluatePreparedSceneQuality0211,
  type DiagramQualityReport0211,
  type QualityPoint0211,
  type QualityRect0211,
} from './diagramQuality0211.js';

export interface GrokabilityMetrics0214 {
  readonly maxEdgeLabelRouteDistancePx: number;
  readonly detachedEdgeLabels: number;
  readonly distinctNodeStyles: number;
  readonly semanticRoleCount: number;
  readonly roleDifferentiationRatio: number;
  readonly nestedGroupDepthMax: number;
  readonly nestedGroupsDistinguished: boolean;
  readonly grokabilityScore: number;
}

export interface DiagramQualityReport0214 extends DiagramQualityReport0211 {
  readonly renderStyle: string;
  readonly grokability: GrokabilityMetrics0214;
  readonly livingCompositeScore: number;
}

function pointToSegDist(p: QualityPoint0211, a: QualityPoint0211, b: QualityPoint0211): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rectToPolylineDist(r: QualityRect0211, pts: readonly QualityPoint0211[]): number {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pointToSegDist({ x: cx, y: cy }, pts[i]!, pts[i + 1]!);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : 0;
}

export function evaluatePreparedSceneQuality0214(
  scene: PreparedSpatialScene028,
  options: { id?: string; direction?: LayoutDirection; orthogonal?: boolean } = {},
): DiagramQualityReport0214 {
  const base = evaluatePreparedSceneQuality0211(scene, options);
  const shiftX = scene.viewport.shiftX;
  const shiftY = scene.viewport.shiftY;

  // 1. Edge-label proximity to owning route
  const edgePolylines = new Map<string, QualityPoint0211[]>();
  for (const edge of scene.resolved.edges) {
    edgePolylines.set(edge.id, edge.points.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY })));
  }
  let maxEdgeLabelRouteDistancePx = 0;
  let detachedEdgeLabels = 0;
  for (const part of scene.parts) {
    if (part.owner.kind !== 'edge' || part.role !== 'edge-label') continue;
    const poly = edgePolylines.get(part.owner.id);
    if (!poly || poly.length < 2) continue;
    const dist = rectToPolylineDist(part.bounds, poly);
    if (dist > maxEdgeLabelRouteDistancePx) maxEdgeLabelRouteDistancePx = dist;
    if (dist > 42) detachedEdgeLabels += 1;
  }

  // 2. Semantic role differentiation across non-container nodes
  const leafRoles = new Set<string>();
  const leafStyleSignatures = new Set<string>();
  const containerIds = new Set(scene.resolved.nodes.filter((n) => n.container).map((n) => n.id));
  const outlineByNode = new Map<string, { fill: string; stroke: string; dash: string }>();
  for (const part of scene.parts) {
    if (part.owner.kind === 'node' && part.role === 'outline' && part.geometry.kind === 'stencil-path') {
      outlineByNode.set(part.owner.id, {
        fill: part.geometry.fill,
        stroke: part.geometry.stroke,
        dash: part.geometry.strokeDasharray ?? '',
      });
    }
  }
  for (const rn of scene.resolved.nodes) {
    if (rn.container) continue;
    leafRoles.add(rn.symbolId ?? rn.shapeId);
    const st = outlineByNode.get(rn.id);
    leafStyleSignatures.add(`${rn.shapeId}|${rn.symbolId ?? ''}|${st?.fill ?? ''}|${st?.stroke ?? ''}|${st?.dash ?? ''}`);
  }
  const semanticRoleCount = leafRoles.size;
  const distinctNodeStyles = leafStyleSignatures.size;
  const roleDifferentiationRatio = semanticRoleCount > 0
    ? Math.min(1, distinctNodeStyles / semanticRoleCount)
    : 1;

  // 3. Nested container distinction
  const nodeById = new Map(scene.nodes.map((n) => [n.node.id, n.node] as const));
  let nestedGroupDepthMax = 0;
  const depthFills = new Map<number, Set<string>>();
  for (const cid of containerIds) {
    let depth = 0;
    let cur = nodeById.get(cid)?.parent;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      depth += 1;
      cur = nodeById.get(cur)?.parent;
    }
    if (depth > nestedGroupDepthMax) nestedGroupDepthMax = depth;
    const fill = outlineByNode.get(cid)?.fill ?? 'none';
    const set = depthFills.get(depth) ?? new Set<string>();
    set.add(fill);
    depthFills.set(depth, set);
  }
  const nestedGroupsDistinguished = nestedGroupDepthMax === 0
    || depthFills.size <= 1
    || new Set([...depthFills.values()].flatMap((s) => [...s])).size > 1
    || scene.renderStyle0214 !== 'anemone';

  let grokabilityScore = 100;
  grokabilityScore -= Math.min(20, detachedEdgeLabels * 8);
  if (roleDifferentiationRatio < 1) {
    grokabilityScore -= Math.round((1 - roleDifferentiationRatio) * 15);
  }
  if (!nestedGroupsDistinguished) grokabilityScore -= 5;
  grokabilityScore = Math.max(0, Math.min(100, grokabilityScore));

  // Combine geometric Tier-2 score (85%) with 0.2.14 grokability score (15%)
  const livingCompositeScore = Number(
    (base.tier2.compositeScore * 0.85 + grokabilityScore * 0.15).toFixed(2),
  );

  return {
    ...base,
    renderStyle: scene.renderStyle0214 ?? scene.style,
    grokability: {
      maxEdgeLabelRouteDistancePx: Number(maxEdgeLabelRouteDistancePx.toFixed(1)),
      detachedEdgeLabels,
      distinctNodeStyles,
      semanticRoleCount,
      roleDifferentiationRatio: Number(roleDifferentiationRatio.toFixed(3)),
      nestedGroupDepthMax,
      nestedGroupsDistinguished,
      grokabilityScore,
    },
    livingCompositeScore,
  };
}
