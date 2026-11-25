/**
 * Coral 0.2.11 Slice 10: Mechanical Diagram Rendering Quality Gate (DRQ-01..DRQ-23).
 *
 * Pure geometric analysis core operates on NormalizedDiagram0211 so it can
 * evaluate Coral PreparedSpatialScene028 outputs as well as any DOM-extracted
 * SVG geometry model with identical Tier-1 (zero-tolerance) and Tier-2 (0..100)
 * metrics. Kept outside packages/render/src/index.ts to add 0 bytes to the
 * shipped @coral-viz/browser runtime bundle.
 */
import type { GraphNode } from '@graph-ir/core';
import type { LayoutDirection } from '../layout/types.js';
import type { PreparedSpatialScene028 } from '../svg/serialize.js';
import { sceneNodeShape029 } from '../catalogLookup029.js';
import { stencilFit028 } from '../stencilAnchorGeometry028.js';
import { bpmnGatewayFrame028, isBpmnGatewaySymbol028 } from '../bpmnGatewayVisual028.js';
import { bpmnEventFrame028, isBpmnEventSymbol028 } from '../bpmnEventVisual028.js';
import { inkBoundsForFrame0211 } from '../layout/shapeInkBounds0211.js';

export interface QualityPoint0211 {
  readonly x: number;
  readonly y: number;
}

export interface QualityRect0211 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedGroup0211 {
  readonly id: string;
  readonly bbox: QualityRect0211;
  readonly titleBBox?: QualityRect0211;
  readonly parentId?: string;
}

export interface NormalizedNode0211 {
  readonly id: string;
  readonly glyphBBox: QualityRect0211;
  readonly labelBBox?: QualityRect0211;
  readonly fullBBox: QualityRect0211;
  readonly groupId?: string;
  readonly isContainer?: boolean;
}

export interface NormalizedEdge0211 {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourcePortId?: string;
  readonly targetPortId?: string;
  readonly polyline: readonly QualityPoint0211[];
  readonly labelBBox?: QualityRect0211;
  readonly orthogonal?: boolean;
  readonly degraded?: boolean;
}

export interface NormalizedText0211 {
  readonly id: string;
  readonly text: string;
  readonly bbox: QualityRect0211;
  readonly ownerKind: 'node' | 'edge' | 'group' | 'unknown';
  readonly ownerId?: string;
}

export interface NormalizedDiagram0211 {
  readonly id: string;
  readonly direction?: LayoutDirection;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly groups: readonly NormalizedGroup0211[];
  readonly nodes: readonly NormalizedNode0211[];
  readonly edges: readonly NormalizedEdge0211[];
  readonly texts: readonly NormalizedText0211[];
}

export type Tier1DefectKind0211 =
  | 'node-node-overlap'
  | 'edge-node-crossing'
  | 'edge-text-crossing'
  | 'text-text-overlap'
  | 'coincident-edge-span'
  | 'colliding-port-contact'
  | 'wrong-arrow-approach'
  | 'container-border-hug'
  | 'non-orthogonal-segment'
  | 'micro-jog'
  | 'clipped-element';

export interface Tier1Defect0211 {
  readonly kind: Tier1DefectKind0211;
  readonly rule: string;
  readonly subjects: readonly string[];
  readonly message: string;
  readonly measurePx?: number;
}

export interface Tier1Summary0211 {
  readonly pass: boolean;
  readonly totalHardDefects: number;
  readonly nodeNodeOverlaps: number;
  readonly edgeNodeCrossings: number;
  readonly edgeTextCrossings: number;
  readonly textTextOverlaps: number;
  readonly coincidentEdgeSpans: number;
  readonly collidingPortContacts: number;
  readonly wrongArrowApproaches: number;
  readonly containerBorderHugs: number;
  readonly nonOrthogonalSegments: number;
  readonly microJogs: number;
  readonly clippedElements: number;
  readonly findings: readonly Tier1Defect0211[];
}

export interface Tier2Metrics0211 {
  readonly edgeCrossings: number;
  readonly totalBends: number;
  readonly bendsPerEdge: number;
  readonly straightEdgeRatio: number;
  readonly avoidableJogs: number;
  readonly avoidableJogEdgeIds: readonly string[];
  readonly offCenterSinglePorts: number;
  readonly normalizedWireLength: number;
  readonly minCorridorGapPx: number | null;
  readonly tightCorridorPairs: number;
  readonly intraGroupAlignmentMaxPx: number;
  readonly intraGroupMisalignedGroups: readonly string[];
  readonly globalAlignmentMedianPx: number;
  readonly fillRatio: number;
  readonly symmetrySkew: number;
  readonly aspectRatio: number;
  readonly compositeScore: number;
}

export interface DiagramQualityReport0211 {
  readonly id: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly groupCount: number;
  readonly tier1: Tier1Summary0211;
  readonly tier2: Tier2Metrics0211;
}

const EPS = 1e-6;

function rectArea(r: QualityRect0211): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function rectCenter(r: QualityRect0211): QualityPoint0211 {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function unionRects(rects: readonly QualityRect0211[]): QualityRect0211 | undefined {
  if (!rects.length) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function rectsOverlap(a: QualityRect0211, b: QualityRect0211, shrink = 0.5): boolean {
  return a.x + shrink < b.x + b.width - shrink
    && a.x + a.width - shrink > b.x + shrink
    && a.y + shrink < b.y + b.height - shrink
    && a.y + a.height - shrink > b.y + shrink;
}

function pointInRect(p: QualityPoint0211, r: QualityRect0211, margin = 0): boolean {
  return p.x >= r.x - margin && p.x <= r.x + r.width + margin
    && p.y >= r.y - margin && p.y <= r.y + r.height + margin;
}

/** True when segment [a, b] intersects rectangle r (Liang-Barsky, shrunk by `shrink`). */
function segmentHitsRect(
  a: QualityPoint0211,
  b: QualityPoint0211,
  r: QualityRect0211,
  shrink = 0.5,
): boolean {
  const left = r.x + shrink;
  const right = r.x + r.width - shrink;
  const top = r.y + shrink;
  const bottom = r.y + r.height - shrink;
  if (left >= right || top >= bottom) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - left, right - a.x, a.y - top, bottom - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]!) < 1e-9) {
      if (q[i]! < 0) return false;
    } else {
      const t = q[i]! / p[i]!;
      if (p[i]! < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function dist(a: QualityPoint0211, b: QualityPoint0211): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Clean consecutive duplicate and strictly collinear vertices from a polyline. */
function cleanPolyline(raw: readonly QualityPoint0211[]): QualityPoint0211[] {
  const dedup: QualityPoint0211[] = [];
  for (const pt of raw) {
    if (!dedup.length || dist(dedup[dedup.length - 1]!, pt) > 0.25) dedup.push(pt);
  }
  const out: QualityPoint0211[] = [];
  for (const pt of dedup) {
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const v1x = b.x - a.x, v1y = b.y - a.y;
      const v2x = pt.x - b.x, v2y = pt.y - b.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 < EPS || len2 < EPS) { out.pop(); continue; }
      const cross = Math.abs(v1x * v2y - v1y * v2x) / (len1 * len2);
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      if (cross <= 0.01 && dot > 0) out.pop();
      else break;
    }
    out.push(pt);
  }
  return out;
}

interface Seg2D {
  edgeId: string;
  edgeIndex: number;
  segIndex: number;
  a: QualityPoint0211;
  b: QualityPoint0211;
  orient: 'H' | 'V' | 'D';
  len: number;
}

function toSegments(edge: NormalizedEdge0211, edgeIndex: number, pts: readonly QualityPoint0211[]): Seg2D[] {
  const segs: Seg2D[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const len = Math.hypot(dx, dy);
    if (len < 0.25) continue;
    const orient: 'H' | 'V' | 'D' = dy <= 0.5 ? 'H' : dx <= 0.5 ? 'V' : 'D';
    segs.push({ edgeId: edge.id, edgeIndex, segIndex: i - 1, a, b, orient, len });
  }
  return segs;
}

function properSegmentIntersection(a: QualityPoint0211, b: QualityPoint0211, c: QualityPoint0211, d: QualityPoint0211): boolean {
  const orient = (p: QualityPoint0211, q: QualityPoint0211, r: QualityPoint0211) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c), o2 = orient(a, b, d);
  const o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (((o1 > 1e-3 && o2 < -1e-3) || (o1 < -1e-3 && o2 > 1e-3))
    && ((o3 > 1e-3 && o4 < -1e-3) || (o3 < -1e-3 && o4 > 1e-3))) {
    // Ignore intersections very close to a shared endpoint.
    const endpoints = [a, b, c, d];
    for (let i = 0; i < 2; i++) {
      for (let j = 2; j < 4; j++) {
        if (dist(endpoints[i]!, endpoints[j]!) <= 2) return false;
      }
    }
    return true;
  }
  return false;
}

type Side = 'N' | 'S' | 'E' | 'W';

function inferContactSide(pt: QualityPoint0211, nextPt: QualityPoint0211, box: QualityRect0211): Side {
  const dx = nextPt.x - pt.x;
  const dy = nextPt.y - pt.y;
  if (Math.hypot(dx, dy) > 0.5) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
    return dy >= 0 ? 'S' : 'N';
  }
  const distances: Array<[Side, number]> = [
    ['N', Math.abs(pt.y - box.y)],
    ['S', Math.abs(pt.y - (box.y + box.height))],
    ['W', Math.abs(pt.x - box.x)],
    ['E', Math.abs(pt.x - (box.x + box.width))],
  ];
  distances.sort((u, v) => u[1] - v[1]);
  return distances[0]![0];
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure mechanical analyzer for NormalizedDiagram0211.
 * Computes Tier-1 hard defects and Tier-2 layout aesthetics (0..100).
 */
export function analyzeNormalizedDiagram0211(diagram: NormalizedDiagram0211): DiagramQualityReport0211 {
  const findings: Tier1Defect0211[] = [];
  const leafNodes = diagram.nodes.filter((n) => !n.isContainer);
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const leafById = new Map(leafNodes.map((n) => [n.id, n]));
  const cleanedPolylines = new Map<string, QualityPoint0211[]>();
  const allSegments: Seg2D[] = [];

  diagram.edges.forEach((edge, idx) => {
    const pts = cleanPolyline(edge.polyline);
    cleanedPolylines.set(edge.id, pts);
    allSegments.push(...toSegments(edge, idx, pts));
  });

  // 1. DRQ-01: Leaf node-node bounding envelope overlaps.
  let nodeNodeOverlaps = 0;
  for (let i = 0; i < leafNodes.length; i++) {
    for (let j = i + 1; j < leafNodes.length; j++) {
      const a = leafNodes[i]!, b = leafNodes[j]!;
      if (rectsOverlap(a.fullBBox, b.fullBBox, 0.75)) {
        nodeNodeOverlaps++;
        findings.push({
          kind: 'node-node-overlap',
          rule: 'DRQ-01',
          subjects: [a.id, b.id],
          message: `Nodes "${a.id}" and "${b.id}" overlap`,
        });
      }
    }
  }

  // 2. DRQ-01 / DRQ-22: Text-text overlaps.
  let textTextOverlaps = 0;
  for (let i = 0; i < diagram.texts.length; i++) {
    for (let j = i + 1; j < diagram.texts.length; j++) {
      const a = diagram.texts[i]!, b = diagram.texts[j]!;
      if (a.ownerKind === b.ownerKind && a.ownerId && a.ownerId === b.ownerId) continue;
      if (rectsOverlap(a.bbox, b.bbox, 1.0)) {
        textTextOverlaps++;
        findings.push({
          kind: 'text-text-overlap',
          rule: 'DRQ-22',
          subjects: [a.id, b.id],
          message: `Text "${a.text}" overlaps "${b.text}"`,
        });
      }
    }
  }

  // 3. DRQ-15: Edge-node body crossings (excluding own source/target).
  let edgeNodeCrossings = 0;
  for (const edge of diagram.edges) {
    if (edge.degraded) continue;
    const pts = cleanedPolylines.get(edge.id) ?? [];
    for (const node of leafNodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      let hit = false;
      for (let i = 1; i < pts.length; i++) {
        if (segmentHitsRect(pts[i - 1]!, pts[i]!, node.glyphBBox, 1.5)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        edgeNodeCrossings++;
        findings.push({
          kind: 'edge-node-crossing',
          rule: 'DRQ-15',
          subjects: [edge.id, node.id],
          message: `Edge "${edge.id}" (${edge.sourceId} -> ${edge.targetId}) crosses node "${node.id}"`,
        });
      }
    }
  }

  // 4. DRQ-15 / DRQ-22: Edge-text crossings (node captions, group titles, other edge labels).
  let edgeTextCrossings = 0;
  for (const edge of diagram.edges) {
    if (edge.degraded) continue;
    const pts = cleanedPolylines.get(edge.id) ?? [];
    for (const t of diagram.texts) {
      if (t.ownerKind === 'edge' && t.ownerId === edge.id) continue;
      // Exempt interior text inside the edge's own source/target node body when the
      // endpoint contact touches the perimeter; only flag outside captions or unrelated text.
      if (t.ownerKind === 'node' && (t.ownerId === edge.sourceId || t.ownerId === edge.targetId)) {
        const ownerNode = nodeById.get(t.ownerId);
        if (ownerNode && rectsOverlap(t.bbox, ownerNode.glyphBBox, 0)) continue;
      }
      let hit = false;
      for (let i = 1; i < pts.length; i++) {
        if (segmentHitsRect(pts[i - 1]!, pts[i]!, t.bbox, 1.0)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        edgeTextCrossings++;
        findings.push({
          kind: 'edge-text-crossing',
          rule: 'DRQ-15',
          subjects: [edge.id, t.id],
          message: `Edge "${edge.id}" crosses text "${t.text}" (${t.id})`,
        });
      }
    }
  }

  // 5. DRQ-14 / DRQ-18: Coincident / overlapping parallel edge segments + min corridor gap.
  let coincidentEdgeSpans = 0;
  let minCorridorGapPx: number | null = null;
  let tightCorridorPairs = 0;
  const edgeById = new Map(diagram.edges.map((e) => [e.id, e]));
  const flaggedCoincidentPairs = new Set<string>();
  const flaggedTightPairs = new Set<string>();

  for (let i = 0; i < allSegments.length; i++) {
    const s1 = allSegments[i]!;
    if (s1.orient === 'D') continue;
    const e1 = edgeById.get(s1.edgeId)!;
    if (e1.degraded) continue;
    for (let j = i + 1; j < allSegments.length; j++) {
      const s2 = allSegments[j]!;
      if (s1.edgeId === s2.edgeId || s1.orient !== s2.orient) continue;
      const e2 = edgeById.get(s2.edgeId)!;
      if (e2.degraded) continue;
      // Intentional shared explicit fixed port trunk is exempt per DRQ-14.
      const sharedExplicitPort =
        (e1.sourceId === e2.sourceId && Boolean(e1.sourcePortId) && e1.sourcePortId === e2.sourcePortId)
        || (e1.targetId === e2.targetId && Boolean(e1.targetPortId) && e1.targetPortId === e2.targetPortId);
      if (sharedExplicitPort) continue;

      const perp = s1.orient === 'H' ? Math.abs(s1.a.y - s2.a.y) : Math.abs(s1.a.x - s2.a.x);
      const lo1 = s1.orient === 'H' ? Math.min(s1.a.x, s1.b.x) : Math.min(s1.a.y, s1.b.y);
      const hi1 = s1.orient === 'H' ? Math.max(s1.a.x, s1.b.x) : Math.max(s1.a.y, s1.b.y);
      const lo2 = s1.orient === 'H' ? Math.min(s2.a.x, s2.b.x) : Math.min(s2.a.y, s2.b.y);
      const hi2 = s1.orient === 'H' ? Math.max(s2.a.x, s2.b.x) : Math.max(s2.a.y, s2.b.y);
      const overlapLen = Math.min(hi1, hi2) - Math.max(lo1, lo2);
      if (overlapLen < 4) continue;

      const pairKey = [s1.edgeId, s2.edgeId].sort().join('|');
      if (perp <= 3.0) {
        if (!flaggedCoincidentPairs.has(pairKey)) {
          flaggedCoincidentPairs.add(pairKey);
          coincidentEdgeSpans++;
          findings.push({
            kind: 'coincident-edge-span',
            rule: 'DRQ-14',
            subjects: [s1.edgeId, s2.edgeId],
            measurePx: round2(overlapLen),
            message: `Edges "${s1.edgeId}" and "${s2.edgeId}" overlap collinearly for ${round2(overlapLen)}px (gap ${round2(perp)}px)`,
          });
        }
      } else if (overlapLen >= 8 && perp <= 64) {
        if (minCorridorGapPx === null || perp < minCorridorGapPx) minCorridorGapPx = perp;
        if (perp < 8 && !flaggedTightPairs.has(pairKey)) {
          flaggedTightPairs.add(pairKey);
          tightCorridorPairs++;
        }
      }
    }
  }

  // 6. DRQ-17: Colliding same-side port arrivals / departures (< 10 px without shared explicit port).
  let collidingPortContacts = 0;
  interface PortTouch {
    edgeId: string;
    role: 'source' | 'target';
    portId?: string;
    side: Side;
    point: QualityPoint0211;
    degraded?: boolean;
  }
  const touchesByNode = new Map<string, PortTouch[]>();
  for (const edge of diagram.edges) {
    const pts = cleanedPolylines.get(edge.id) ?? [];
    if (pts.length < 2) continue;
    const srcNode = nodeById.get(edge.sourceId);
    const tgtNode = nodeById.get(edge.targetId);
    if (srcNode) {
      const list = touchesByNode.get(srcNode.id) ?? [];
      list.push({
        edgeId: edge.id,
        role: 'source',
        portId: edge.sourcePortId,
        side: inferContactSide(pts[0]!, pts[1]!, srcNode.glyphBBox),
        point: pts[0]!,
        degraded: edge.degraded,
      });
      touchesByNode.set(srcNode.id, list);
    }
    if (tgtNode) {
      const list = touchesByNode.get(tgtNode.id) ?? [];
      list.push({
        edgeId: edge.id,
        role: 'target',
        portId: edge.targetPortId,
        side: inferContactSide(pts[pts.length - 1]!, pts[pts.length - 2]!, tgtNode.glyphBBox),
        point: pts[pts.length - 1]!,
        degraded: edge.degraded,
      });
      touchesByNode.set(tgtNode.id, list);
    }
  }
  for (const [nodeId, touches] of touchesByNode.entries()) {
    for (let i = 0; i < touches.length; i++) {
      for (let j = i + 1; j < touches.length; j++) {
        const a = touches[i]!, b = touches[j]!;
        if (a.degraded || b.degraded || a.side !== b.side) continue;
        if (a.portId && b.portId && a.portId === b.portId) continue;
        const d = dist(a.point, b.point);
        if (d < 9.5) {
          collidingPortContacts++;
          findings.push({
            kind: 'colliding-port-contact',
            rule: 'DRQ-17',
            subjects: [nodeId, a.edgeId, b.edgeId],
            measurePx: round2(d),
            message: `Edges "${a.edgeId}" and "${b.edgeId}" collide on ${a.side} side of "${nodeId}" (${round2(d)}px apart)`,
          });
        }
      }
    }
  }

  // 7. DRQ-12 & DRQ-13: Non-orthogonal segments + micro-jogs (< 12 px opposite turns).
  let nonOrthogonalSegments = 0;
  let microJogs = 0;
  for (const edge of diagram.edges) {
    if (edge.degraded || edge.orthogonal === false) continue;
    const pts = cleanedPolylines.get(edge.id) ?? [];
    const srcNode = nodeById.get(edge.sourceId);
    const tgtNode = nodeById.get(edge.targetId);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!;
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      if (Math.min(dx, dy) > 0.5) {
        const insideOwnSrc = srcNode && pointInRect(a, srcNode.fullBBox, 2) && pointInRect(b, srcNode.fullBBox, 2);
        const insideOwnTgt = tgtNode && pointInRect(a, tgtNode.fullBBox, 2) && pointInRect(b, tgtNode.fullBBox, 2);
        if (!insideOwnSrc && !insideOwnTgt) {
          nonOrthogonalSegments++;
          findings.push({
            kind: 'non-orthogonal-segment',
            rule: 'DRQ-12',
            subjects: [edge.id],
            measurePx: round2(Math.min(dx, dy)),
            message: `Edge "${edge.id}" segment ${i} is diagonal (dx=${round2(dx)}, dy=${round2(dy)})`,
          });
        }
      }
    }
    for (let i = 1; i < pts.length - 2; i++) {
      const v1x = pts[i]!.x - pts[i - 1]!.x, v1y = pts[i]!.y - pts[i - 1]!.y;
      const v2x = pts[i + 1]!.x - pts[i]!.x, v2y = pts[i + 1]!.y - pts[i]!.y;
      const v3x = pts[i + 2]!.x - pts[i + 1]!.x, v3y = pts[i + 2]!.y - pts[i + 1]!.y;
      const horiz = Math.abs(v1y) <= 0.5 && Math.abs(v3y) <= 0.5 && v1x * v3x > 0 && Math.abs(v2x) <= 0.5;
      const vert = Math.abs(v1x) <= 0.5 && Math.abs(v3x) <= 0.5 && v1y * v3y > 0 && Math.abs(v2y) <= 0.5;
      if (horiz || vert) {
        const jogLen = Math.hypot(v2x, v2y);
        const endCross = horiz ? Math.abs(pts[pts.length - 1]!.y - pts[0]!.y) : Math.abs(pts[pts.length - 1]!.x - pts[0]!.x);
        const unavoidableSingleZ = pts.length === 4 && Math.abs(jogLen - endCross) <= 0.5;
        if (jogLen < 12 && !unavoidableSingleZ) {
          microJogs++;
          findings.push({
            kind: 'micro-jog',
            rule: 'DRQ-13',
            subjects: [edge.id],
            measurePx: round2(jogLen),
            message: `Edge "${edge.id}" has a ${round2(jogLen)}px micro-jog at bend ${i}`,
          });
        }
      }
    }
  }

  // 8. Clipped elements outside viewport.
  let clippedElements = 0;
  const vp: QualityRect0211 = { x: 0, y: 0, width: diagram.viewport.width, height: diagram.viewport.height };
  const isClipped = (r: QualityRect0211) =>
    r.x < -2 || r.y < -2 || r.x + r.width > vp.width + 2 || r.y + r.height > vp.height + 2;
  for (const node of leafNodes) {
    if (isClipped(node.fullBBox)) {
      clippedElements++;
      findings.push({
        kind: 'clipped-element',
        rule: 'DRQ-11',
        subjects: [node.id],
        message: `Node "${node.id}" extends outside viewport`,
      });
    }
  }
  for (const t of diagram.texts) {
    if (isClipped(t.bbox)) {
      clippedElements++;
      findings.push({
        kind: 'clipped-element',
        rule: 'DRQ-11',
        subjects: [t.id],
        message: `Text "${t.text}" extends outside viewport`,
      });
    }
  }

  // 8b. DRQ-17b: Wrong arrowhead approach direction on orthogonal target contacts.
  // An incoming segment must enter INWARD perpendicular to the target face (not sideways/backward).
  let wrongArrowApproaches = 0;
  for (const edge of diagram.edges) {
    if (edge.degraded || edge.orthogonal === false) continue;
    const pts = cleanedPolylines.get(edge.id) ?? [];
    if (pts.length < 2) continue;
    const tgt = nodeById.get(edge.targetId);
    if (!tgt) continue;
    const prev = pts[pts.length - 2]!;
    const end = pts[pts.length - 1]!;
    const dx = end.x - prev.x;
    const dy = end.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    const box = tgt.glyphBBox;
    // Determine which side of the target glyph the contact actually sits on by proximity.
    // Account for recessed top/bottom/side shelves on irregular shapes (e.g. folder/package tab)
    // where a strictly inward vertical/horizontal arrival sits inside the opposite span.
    const dW = Math.abs(end.x - box.x);
    const dE = Math.abs(end.x - (box.x + box.width));
    const dN = Math.abs(end.y - box.y);
    const dS = Math.abs(end.y - (box.y + box.height));
    const minD = Math.min(dW, dE, dN, dS);
    let contactSide: Side = minD === dW ? 'W' : minD === dE ? 'E' : minD === dN ? 'N' : 'S';
    const strictlyInsideX = end.x > box.x + 4 && end.x < box.x + box.width - 4;
    const strictlyInsideY = end.y > box.y + 4 && end.y < box.y + box.height - 4;
    if (strictlyInsideX && Math.abs(dx) <= 1 && dy > 1 && end.y <= box.y + box.height * 0.45) {
      contactSide = 'N';
    } else if (strictlyInsideX && Math.abs(dx) <= 1 && dy < -1 && end.y >= box.y + box.height * 0.55) {
      contactSide = 'S';
    } else if (strictlyInsideY && Math.abs(dy) <= 1 && dx > 1 && end.x <= box.x + box.width * 0.45) {
      contactSide = 'W';
    } else if (strictlyInsideY && Math.abs(dy) <= 1 && dx < -1 && end.x >= box.x + box.width * 0.55) {
      contactSide = 'E';
    }
    // Check whether the final segment enters inward along contactSide's normal.
    // On a WEST face, an arrow must travel RIGHT (dx > 0, |dy| <= 1), never up/down/left.
    const inwardOk =
      (contactSide === 'W' && dx > 1 && Math.abs(dy) <= 1)
      || (contactSide === 'E' && dx < -1 && Math.abs(dy) <= 1)
      || (contactSide === 'N' && dy > 1 && Math.abs(dx) <= 1)
      || (contactSide === 'S' && dy < -1 && Math.abs(dx) <= 1);
    if (!inwardOk) {
      wrongArrowApproaches++;
      findings.push({
        kind: 'wrong-arrow-approach',
        rule: 'DRQ-17',
        subjects: [edge.id, edge.targetId],
        measurePx: round2(segLen),
        message: `Edge "${edge.id}" approaches "${edge.targetId}" ${contactSide} face non-normally (dx=${round2(dx)}, dy=${round2(dy)})`,
      });
    } else if (segLen < 6 && pts.length >= 3) {
      wrongArrowApproaches++;
      findings.push({
        kind: 'wrong-arrow-approach',
        rule: 'DRQ-17',
        subjects: [edge.id, edge.targetId],
        measurePx: round2(segLen),
        message: `Edge "${edge.id}" terminal segment into "${edge.targetId}" is too short (${round2(segLen)}px < 6px)`,
      });
    }
  }

  // 8c. DRQ-19: Connector segments hugging parallel to a group container border (< 10 px gap for > 16 px).
  let containerBorderHugs = 0;
  const flaggedHugs = new Set<string>();
  for (const seg of allSegments) {
    if (seg.orient === 'D') continue;
    const edge = edgeById.get(seg.edgeId);
    if (!edge || edge.degraded) continue;
    for (const grp of diagram.groups) {
      const b = grp.bbox;
      const hugKey = `${seg.edgeId}|${grp.id}`;
      if (flaggedHugs.has(hugKey)) continue;
      if (seg.orient === 'V') {
        const lo = Math.min(seg.a.y, seg.b.y), hi = Math.max(seg.a.y, seg.b.y);
        const span = Math.min(hi, b.y + b.height) - Math.max(lo, b.y);
        if (span < 16) continue;
        const dL = Math.abs(seg.a.x - b.x);
        const dR = Math.abs(seg.a.x - (b.x + b.width));
        const d = Math.min(dL, dR);
        if (d < 10) {
          flaggedHugs.add(hugKey);
          containerBorderHugs++;
          findings.push({
            kind: 'container-border-hug',
            rule: 'DRQ-19',
            subjects: [seg.edgeId, grp.id],
            measurePx: round2(d),
            message: `Edge "${seg.edgeId}" runs parallel within ${round2(d)}px of group "${grp.id}" vertical border`,
          });
        }
      } else {
        const lo = Math.min(seg.a.x, seg.b.x), hi = Math.max(seg.a.x, seg.b.x);
        const span = Math.min(hi, b.x + b.width) - Math.max(lo, b.x);
        if (span < 16) continue;
        const dT = Math.abs(seg.a.y - b.y);
        const dB = Math.abs(seg.a.y - (b.y + b.height));
        const d = Math.min(dT, dB);
        if (d < 10) {
          flaggedHugs.add(hugKey);
          containerBorderHugs++;
          findings.push({
            kind: 'container-border-hug',
            rule: 'DRQ-19',
            subjects: [seg.edgeId, grp.id],
            measurePx: round2(d),
            message: `Edge "${seg.edgeId}" runs parallel within ${round2(d)}px of group "${grp.id}" horizontal border`,
          });
        }
      }
    }
  }

  // Count single-edge free node sides whose contact is > 10 px off the glyph side midpoint.
  let offCenterSinglePorts = 0;
  for (const [nodeId, touches] of touchesByNode.entries()) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const bySide = new Map<Side, PortTouch[]>();
    for (const t of touches) {
      const list = bySide.get(t.side) ?? [];
      list.push(t);
      bySide.set(t.side, list);
    }
    for (const [side, list] of bySide.entries()) {
      if (list.length !== 1 || list[0]!.portId || list[0]!.degraded) continue;
      const pt = list[0]!.point;
      const b = node.glyphBBox;
      const off = (side === 'W' || side === 'E')
        ? Math.abs(pt.y - (b.y + b.height / 2))
        : Math.abs(pt.x - (b.x + b.width / 2));
      if (off > 10) offCenterSinglePorts++;
    }
  }

  const totalHardDefects =
    nodeNodeOverlaps
    + edgeNodeCrossings
    + edgeTextCrossings
    + textTextOverlaps
    + coincidentEdgeSpans
    + collidingPortContacts
    + wrongArrowApproaches
    + containerBorderHugs
    + nonOrthogonalSegments
    + microJogs
    + clippedElements;

  // --- Tier 2 Aesthetics & Layout Metrics ---

  // Pairwise interior edge crossings.
  let edgeCrossings = 0;
  const crossedEdgePairs = new Set<string>();
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const s1 = allSegments[i]!, s2 = allSegments[j]!;
      if (s1.edgeId === s2.edgeId) continue;
      if (properSegmentIntersection(s1.a, s1.b, s2.a, s2.b)) {
        const key = [s1.edgeId, s2.edgeId].sort().join('|');
        if (!crossedEdgePairs.has(key)) {
          crossedEdgePairs.add(key);
          edgeCrossings++;
        }
      }
    }
  }

  // Bends, straight ratio, avoidable jogs, and wire length.
  let totalBends = 0;
  let straightEdges = 0;
  let totalWireLength = 0;
  const avoidableJogEdgeIds: string[] = [];
  const horizFlow = (diagram.direction ?? 'RIGHT') === 'RIGHT' || diagram.direction === 'LEFT';
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const e of diagram.edges) {
    outDegree.set(e.sourceId, (outDegree.get(e.sourceId) ?? 0) + 1);
    inDegree.set(e.targetId, (inDegree.get(e.targetId) ?? 0) + 1);
  }

  for (const edge of diagram.edges) {
    const pts = cleanedPolylines.get(edge.id) ?? [];
    const bends = Math.max(0, pts.length - 2);
    totalBends += bends;
    if (bends === 0) straightEdges++;
    for (let i = 1; i < pts.length; i++) totalWireLength += dist(pts[i - 1]!, pts[i]!);

    // Avoidable jog detection: 1-to-1 or aligned-middle chain with small cross-axis jog (2..45 px)
    // and >= 2 bends where straight flow was nearly achieved.
    const src = leafById.get(edge.sourceId);
    const tgt = leafById.get(edge.targetId);
    if (src && tgt && bends >= 2) {
      const sc = rectCenter(src.glyphBBox);
      const tc = rectCenter(tgt.glyphBBox);
      const crossDelta = horizFlow ? Math.abs(sc.y - tc.y) : Math.abs(sc.x - tc.x);
      const isSimpleChain = (outDegree.get(src.id) ?? 0) === 1 && (inDegree.get(tgt.id) ?? 0) === 1;
      const isNearCoaxial = crossDelta > 1.5 && crossDelta <= 45;
      if (isNearCoaxial && (isSimpleChain || crossDelta <= 25)) {
        avoidableJogEdgeIds.push(edge.id);
      }
    }
  }

  const edgeCount = diagram.edges.length;
  const bendsPerEdge = edgeCount > 0 ? totalBends / edgeCount : 0;
  const straightEdgeRatio = edgeCount > 0 ? straightEdges / edgeCount : 1;
  const nodeExtents = leafNodes.map((n) => (n.glyphBBox.width + n.glyphBBox.height) / 2);
  const medianExtent = Math.max(40, median(nodeExtents));
  const normalizedWireLength = edgeCount > 0 ? totalWireLength / (edgeCount * medianExtent) : 0;

  // Intra-group visual glyph-center alignment (DRQ-05):
  // Within each group, cluster leaf nodes that share the same flow-axis column/row
  // (within 0.65 * medianExtent) and measure their max glyph-center drift.
  let intraGroupAlignmentMaxPx = 0;
  const intraGroupMisalignedGroups: string[] = [];
  for (const group of diagram.groups) {
    const members = leafNodes.filter((n) => n.groupId === group.id);
    if (members.length < 2) continue;
    const primaryOf = (n: NormalizedNode0211) => horizFlow ? rectCenter(n.glyphBBox).x : rectCenter(n.glyphBBox).y;
    const sorted = [...members].sort((a, b) => primaryOf(a) - primaryOf(b));
    let groupMaxDrift = 0;
    let cluster: NormalizedNode0211[] = [sorted[0]!];
    const flushCluster = () => {
      if (cluster.length >= 2) {
        const vals = cluster.map(primaryOf);
        const drift = Math.max(...vals) - Math.min(...vals);
        groupMaxDrift = Math.max(groupMaxDrift, drift);
      }
    };
    for (let i = 1; i < sorted.length; i++) {
      const prev = primaryOf(sorted[i - 1]!);
      const curr = primaryOf(sorted[i]!);
      if (curr - prev <= medianExtent * 0.65) cluster.push(sorted[i]!);
      else { flushCluster(); cluster = [sorted[i]!]; }
    }
    flushCluster();
    if (groupMaxDrift > intraGroupAlignmentMaxPx) intraGroupAlignmentMaxPx = groupMaxDrift;
    if (groupMaxDrift > 1.5) intraGroupMisalignedGroups.push(group.id);
  }

  // Global 1-to-1 chain cross-axis alignment error (DRQ-02 / DRQ-03).
  const chainDrifts: number[] = [];
  for (const e of diagram.edges) {
    const src = leafById.get(e.sourceId);
    const tgt = leafById.get(e.targetId);
    if (!src || !tgt) continue;
    if ((outDegree.get(src.id) ?? 0) === 1 && (inDegree.get(tgt.id) ?? 0) === 1) {
      const sc = rectCenter(src.glyphBBox), tc = rectCenter(tgt.glyphBBox);
      chainDrifts.push(horizFlow ? Math.abs(sc.y - tc.y) : Math.abs(sc.x - tc.x));
    }
  }
  const globalAlignmentMedianPx = median(chainDrifts);

  // Fill ratio, cross-axis symmetry skew, and aspect ratio (DRQ-23).
  const vpArea = Math.max(1, diagram.viewport.width * diagram.viewport.height);
  const totalNodeArea = leafNodes.reduce((sum, n) => sum + rectArea(n.fullBBox), 0);
  const fillRatio = totalNodeArea / vpArea;

  let symmetrySkew = 0;
  if (leafNodes.length >= 2) {
    const centers = leafNodes.map((n) => rectCenter(n.glyphBBox));
    const avgX = centers.reduce((s, p) => s + p.x, 0) / centers.length;
    const avgY = centers.reduce((s, p) => s + p.y, 0) / centers.length;
    symmetrySkew = horizFlow
      ? Math.abs(avgY - diagram.viewport.height / 2) / Math.max(1, diagram.viewport.height)
      : Math.abs(avgX - diagram.viewport.width / 2) / Math.max(1, diagram.viewport.width);
  }
  const aspectRatio = diagram.viewport.height > 0 ? diagram.viewport.width / diagram.viewport.height : 1;

  // Deterministic composite score (0..100).
  let score = 100;
  score -= Math.min(55, totalHardDefects * 15);
  score -= Math.min(36, edgeCrossings * 8);
  score -= Math.min(15, Math.max(0, bendsPerEdge - 1.2) * 5);
  score -= Math.min(12, avoidableJogEdgeIds.length * 4);
  score -= Math.min(12, offCenterSinglePorts * 3);
  score -= Math.min(12, tightCorridorPairs * 4);
  score -= Math.min(12, Math.max(0, intraGroupAlignmentMaxPx - 1) * 0.8);
  score -= Math.min(8, Math.max(0, globalAlignmentMedianPx - 1) * 0.4);
  score -= Math.min(8, Math.max(0, symmetrySkew - 0.12) * 30);
  score = Math.max(0, Math.min(100, round2(score)));

  return {
    id: diagram.id,
    nodeCount: leafNodes.length,
    edgeCount,
    groupCount: diagram.groups.length,
    tier1: {
      pass: totalHardDefects === 0,
      totalHardDefects,
      nodeNodeOverlaps,
      edgeNodeCrossings,
      edgeTextCrossings,
      textTextOverlaps,
      coincidentEdgeSpans,
      collidingPortContacts,
      wrongArrowApproaches,
      containerBorderHugs,
      nonOrthogonalSegments,
      microJogs,
      clippedElements,
      findings,
    },
    tier2: {
      edgeCrossings,
      totalBends,
      bendsPerEdge: round2(bendsPerEdge),
      straightEdgeRatio: round2(straightEdgeRatio),
      avoidableJogs: avoidableJogEdgeIds.length,
      avoidableJogEdgeIds,
      offCenterSinglePorts,
      normalizedWireLength: round2(normalizedWireLength),
      minCorridorGapPx: minCorridorGapPx === null ? null : round2(minCorridorGapPx),
      tightCorridorPairs,
      intraGroupAlignmentMaxPx: round2(intraGroupAlignmentMaxPx),
      intraGroupMisalignedGroups,
      globalAlignmentMedianPx: round2(globalAlignmentMedianPx),
      fillRatio: round2(fillRatio),
      symmetrySkew: round2(symmetrySkew),
      aspectRatio: round2(aspectRatio),
      compositeScore: score,
    },
  };
}

function collectParentMap(nodes: readonly GraphNode[], parentId?: string, out = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) {
    const pid = parentId ?? n.parent;
    if (pid) out.set(n.id, pid);
    if (n.children?.length) collectParentMap(n.children, n.id, out);
  }
  return out;
}

function collectContainerIds(nodes: readonly GraphNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.parent) out.add(n.parent);
    if (n.children?.length || n.type === 'group') {
      out.add(n.id);
      if (n.children?.length) collectContainerIds(n.children, out);
    }
  }
  return out;
}

/**
 * Convert a Coral PreparedSpatialScene028 into NormalizedDiagram0211 using
 * exact final viewport coordinates from scene.parts.
 */
export function normalizePreparedScene0211(
  scene: PreparedSpatialScene028,
  options: { id?: string; direction?: LayoutDirection; orthogonal?: boolean } = {},
): NormalizedDiagram0211 {
  const parentById = collectParentMap(scene.semantic.nodes);
  const containerIds = collectContainerIds(scene.semantic.nodes);
  const shiftX = scene.viewport.shiftX;
  const shiftY = scene.viewport.shiftY;

  const outlineByNode = new Map<string, QualityRect0211>();
  const labelRectsByNode = new Map<string, QualityRect0211[]>();
  const labelRectsByEdge = new Map<string, QualityRect0211[]>();
  const routePointsByEdge = new Map<string, readonly QualityPoint0211[]>();
  const texts: NormalizedText0211[] = [];

  for (const part of scene.parts) {
    if (part.owner.kind === 'node') {
      if (part.role === 'outline' || part.role === 'artwork') {
        const prev = outlineByNode.get(part.owner.id);
        outlineByNode.set(part.owner.id, prev ? unionRects([prev, part.bounds])! : part.bounds);
      } else if (part.geometry.kind === 'text') {
        const list = labelRectsByNode.get(part.owner.id) ?? [];
        list.push(part.bounds);
        labelRectsByNode.set(part.owner.id, list);
        const isGroup = containerIds.has(part.owner.id);
        texts.push({
          id: part.id,
          text: part.geometry.text,
          bbox: part.bounds,
          ownerKind: isGroup ? 'group' : 'node',
          ownerId: part.owner.id,
        });
      }
    } else if (part.owner.kind === 'edge') {
      if (part.role === 'edge-shaft' && part.geometry.kind === 'route') {
        routePointsByEdge.set(part.owner.id, part.geometry.points);
      } else if (part.geometry.kind === 'text') {
        const list = labelRectsByEdge.get(part.owner.id) ?? [];
        list.push(part.bounds);
        labelRectsByEdge.set(part.owner.id, list);
        texts.push({
          id: part.id,
          text: part.geometry.text,
          bbox: part.bounds,
          ownerKind: 'edge',
          ownerId: part.owner.id,
        });
      }
    }
  }

  const resolvedNodeById = new Map(scene.resolved.nodes.map((n) => [n.id, n]));
  const groups: NormalizedGroup0211[] = [];
  const nodes: NormalizedNode0211[] = [];
  for (const placed of scene.nodes) {
    const id = placed.node.id;
    const isContainer = containerIds.has(id);
    const fullBBox: QualityRect0211 = {
      x: placed.x + shiftX,
      y: placed.y + shiftY,
      width: placed.width,
      height: placed.height,
    };
    const resolved = resolvedNodeById.get(id);
    // Compute the true painted SVG glyph ink bounding box (excluding bottom captions
    // and accounting for asymmetric paths such as cloud's -15px left puff).
    let glyphBBox: QualityRect0211 = outlineByNode.get(id) ?? fullBBox;
    if (!isContainer && resolved) {
      if (isBpmnGatewaySymbol028(resolved.symbolId)) {
        const g = bpmnGatewayFrame028(placed.width, placed.height, options.direction ?? 'RIGHT');
        glyphBBox = { x: fullBBox.x + g.x, y: fullBBox.y + g.y, width: g.width, height: g.height };
      } else if (isBpmnEventSymbol028(resolved.symbolId)) {
        const ev = bpmnEventFrame028(placed.width, placed.height, options.direction ?? 'RIGHT');
        glyphBBox = { x: fullBBox.x + ev.x, y: fullBBox.y + ev.y, width: ev.width, height: ev.height };
      } else {
        const shape = sceneNodeShape029(resolved);
        if (shape) {
          const fit = stencilFit028(shape, placed.width, placed.height, { symbolId: resolved.symbolId, layoutDirection: options.direction });
          const fitted = {
            x: fullBBox.x + fit.offsetX,
            y: fullBBox.y + fit.offsetY,
            width: fit.fittedWidth,
            height: fit.fittedHeight,
          };
          glyphBBox = inkBoundsForFrame0211(shape.id, fitted);
        }
      }
    }
    const labelBBox = unionRects(labelRectsByNode.get(id) ?? []);
    const groupId = parentById.get(id);
    if (isContainer) {
      groups.push({ id, bbox: fullBBox, ...(labelBBox ? { titleBBox: labelBBox } : {}), ...(groupId ? { parentId: groupId } : {}) });
    }
    nodes.push({
      id,
      glyphBBox,
      ...(labelBBox ? { labelBBox } : {}),
      fullBBox: unionRects([glyphBBox, ...(labelBBox ? [labelBBox] : [])]) ?? fullBBox,
      ...(groupId ? { groupId } : {}),
      isContainer,
    });
  }

  const semanticEdgeById = new Map(scene.semantic.edges.map((e) => [e.id, e]));
  const edges: NormalizedEdge0211[] = scene.resolved.edges.map((resolved) => {
    const sem = semanticEdgeById.get(resolved.id);
    const pts = routePointsByEdge.get(resolved.id)
      ?? resolved.points.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY }));
    const labelBBox = unionRects(labelRectsByEdge.get(resolved.id) ?? []);
    return {
      id: resolved.id,
      sourceId: resolved.sourceId,
      targetId: resolved.targetId,
      ...(sem?.sourcePort ? { sourcePortId: sem.sourcePort } : {}),
      ...(sem?.targetPort ? { targetPortId: sem.targetPort } : {}),
      polyline: pts,
      ...(labelBBox ? { labelBBox } : {}),
      ...(options.orthogonal !== undefined ? { orthogonal: options.orthogonal } : {}),
    };
  });

  return {
    id: options.id ?? scene.id,
    ...(options.direction ? { direction: options.direction } : {}),
    viewport: { width: scene.viewport.width, height: scene.viewport.height },
    groups,
    nodes,
    edges,
    texts,
  };
}

/** Convenience entry point for Coral tests and verification scripts. */
export function evaluatePreparedSceneQuality0211(
  scene: PreparedSpatialScene028,
  options: { id?: string; direction?: LayoutDirection; orthogonal?: boolean } = {},
): DiagramQualityReport0211 {
  return analyzeNormalizedDiagram0211(normalizePreparedScene0211(scene, options));
}
