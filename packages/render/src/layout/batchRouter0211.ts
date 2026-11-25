/**
 * Coral 0.2.11 Slice 60 (ADR Stages 3 & 4):
 *   - Stage 3: Contour-Aware Multi-Port Slot Distribution (`portSlotAllocator0211`)
 *   - Stage 4: Terminal Orthogonalization, Planar Parallel Corridor Spacing &
 *              Obstacle-Aware Batch Detouring (`libavoided-js` 0.2.0)
 *
 * Operates strictly on generated orthogonal connectors (never mutates authored
 * `routeIntent` waypoints or fixed/pinned ports) and verifies obstacle & caption
 * clearance before committing any adjustment.
 */
import { routeEdges } from 'libavoided-js';
import type { CardinalDirection, Obstacle } from 'libavoided-js';
import type { GraphEdge, GraphIR, PortSide } from '@graph-ir/core';
import type { LayoutDirection, LayoutSection, Point, ResolvedEdgeRoute } from './types.js';
import type { AlignableRect } from './visualFlowAlign0210.js';
import {
  allocateSidePortSlots0211,
  preferredFlowSides0211,
  shapePortCapacity0211,
} from './portSlotAllocator0211.js';

export interface Rect0211 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BatchNodeInfo0211 {
  shapeId: string;
  notationId?: string;
  symbolId?: string;
  /** True visual glyph bounding box in graph coordinates. */
  frame: Rect0211;
  hasBottomCaption: boolean;
  hasRightCaption?: boolean;
  captionBox?: Rect0211;
  isContainer: boolean;
}

export interface BatchRouterContext0211 {
  graph: GraphIR;
  routes: ResolvedEdgeRoute[];
  rects: Map<string, AlignableRect>;
  nodeInfo: (id: string) => BatchNodeInfo0211 | undefined;
  isFixedPort: (nodeId: string, portId: string | undefined) => boolean;
  /** Optional contour projection callback (falls back to shape frame projection). */
  contourContact?: (nodeId: string, side: PortSide, along: number) => Point | undefined;
  direction: LayoutDirection;
  routingStyle: 'orthogonal' | 'polyline' | 'splines';
}

const EPS = 0.5;
const MIN_PORT_PITCH = 12;
const TARGET_PORT_PITCH = 14;
const MIN_CORRIDOR_GAP = 12;
const TARGET_CORRIDOR_GAP = 14;

function sectionPoints(sections: readonly LayoutSection[]): Point[] {
  if (!sections.length) return [];
  return sections.flatMap((s, i) =>
    i === 0 ? [s.startPoint, ...s.bendPoints, s.endPoint] : [...s.bendPoints, s.endPoint],
  );
}

function setRoutePoints(route: ResolvedEdgeRoute, pts: readonly Point[]): void {
  const clean = compactOrthogonal(pts);
  if (clean.length < 2) return;
  route.sections = [{
    startPoint: clean[0]!,
    bendPoints: clean.slice(1, -1),
    endPoint: clean[clean.length - 1]!,
  }];
}

function compactOrthogonal(pts: readonly Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of pts) {
    const prev = dedup[dedup.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.25) {
      dedup.push({ x: p.x, y: p.y });
    }
  }
  const out: Point[] = [];
  for (const p of dedup) {
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const sameX = Math.abs(a.x - b.x) <= 0.25 && Math.abs(b.x - p.x) <= 0.25;
      const sameY = Math.abs(a.y - b.y) <= 0.25 && Math.abs(b.y - p.y) <= 0.25;
      if (!sameX && !sameY) break;
      // Preserve collinear midpoint only if direction reverses (shouldn't happen in clean routes).
      if (sameX && (b.y - a.y) * (p.y - b.y) < -0.5) break;
      if (sameY && (b.x - a.x) * (p.x - b.x) < -0.5) break;
      out.pop();
    }
    out.push(p);
  }
  return out;
}

function inferContactSide(pt: Point, frame: Rect0211): PortSide {
  const dN = Math.abs(pt.y - frame.y);
  const dS = Math.abs(pt.y - (frame.y + frame.height));
  const dW = Math.abs(pt.x - frame.x);
  const dE = Math.abs(pt.x - (frame.x + frame.width));
  const min = Math.min(dN, dS, dW, dE);
  if (min === dW) return 'WEST';
  if (min === dE) return 'EAST';
  if (min === dN) return 'NORTH';
  return 'SOUTH';
}

function outwardDirection(side: PortSide): CardinalDirection {
  switch (side) {
    case 'NORTH': return 'up';
    case 'SOUTH': return 'down';
    case 'WEST': return 'left';
    case 'EAST': return 'right';
  }
}

function inwardDirection(side: PortSide): CardinalDirection {
  switch (side) {
    case 'NORTH': return 'down';
    case 'SOUTH': return 'up';
    case 'WEST': return 'right';
    case 'EAST': return 'left';
  }
}

function segIntersectsBox(a: Point, b: Point, box: Rect0211, pad = 2): boolean {
  const left = box.x - pad;
  const right = box.x + box.width + pad;
  const top = box.y - pad;
  const bottom = box.y + box.height + pad;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  if (maxX <= left || minX >= right || maxY <= top || minY >= bottom) return false;
  if (Math.abs(a.y - b.y) <= EPS) return a.y > top && a.y < bottom;
  if (Math.abs(a.x - b.x) <= EPS) return a.x > left && a.x < right;
  // Diagonal Liang-Barsky check.
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const checks: Array<[number, number]> = [
    [-dx, a.x - left], [dx, right - a.x],
    [-dy, a.y - top], [dy, bottom - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t0 < t1;
}

function pathHitsObstacles(pts: readonly Point[], obstacles: readonly Rect0211[], pad = 1.5): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    for (const obs of obstacles) {
      if (segIntersectsBox(a, b, obs, pad)) return true;
    }
  }
  return false;
}

/** Check whether any segment cuts into the interior of the edge's own source/target node. */
function pathReentersEndNodes(
  pts: readonly Point[],
  srcFrame: Rect0211 | undefined,
  tgtFrame: Rect0211 | undefined,
): boolean {
  if (pts.length < 2) return false;
  const cutsInward = (pContact: Point, pAway: Point, r: Rect0211): boolean => {
    const dx = pAway.x - pContact.x;
    const dy = pAway.y - pContact.y;
    const len = Math.hypot(dx, dy);
    if (len <= 3) return false;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    // Outward rays (including stick-figure actor torso at center) have dot <= 0; inward tunnels or border-hugs have dot > 0.
    const dot = dx * (cx - pContact.x) + dy * (cy - pContact.y);
    if (dot <= 1) return false;
    const clip = { x: pContact.x + (dx / len) * 2.5, y: pContact.y + (dy / len) * 2.5 };
    return segIntersectsBox(clip, pAway, r, 0.5);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) <= 0.5) continue;
    if (srcFrame) {
      if (i > 0) {
        if (segIntersectsBox(a, b, srcFrame, -1.5)) return true;
      } else if (cutsInward(a, b, srcFrame)) {
        return true;
      }
    }
    if (tgtFrame) {
      if (i < pts.length - 2) {
        if (segIntersectsBox(a, b, tgtFrame, -1.5)) return true;
      } else if (cutsInward(b, a, tgtFrame)) {
        return true;
      }
    }
  }
  return false;
}

function isPathOrthogonal(pts: readonly Point[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (Math.abs(pts[i + 1]!.x - pts[i]!.x) > 0.6 && Math.abs(pts[i + 1]!.y - pts[i]!.y) > 0.6) {
      return false;
    }
  }
  return true;
}

function collectObstaclesFor(
  edge: GraphEdge,
  rects: Map<string, AlignableRect>,
  nodeInfo: (id: string) => BatchNodeInfo0211 | undefined,
): { boxes: Rect0211[]; libObstacles: Obstacle[]; srcFrame?: Rect0211; tgtFrame?: Rect0211 } {
  const boxes: Rect0211[] = [];
  const libObstacles: Obstacle[] = [];
  let srcFrame: Rect0211 | undefined;
  let tgtFrame: Rect0211 | undefined;
  const srcRect = rects.get(edge.source);
  const tgtRect = rects.get(edge.target);
  const encloses = (outer: AlignableRect, inner: AlignableRect | undefined): boolean => Boolean(inner
    && inner.absolutePosition.x >= outer.absolutePosition.x - 1
    && inner.absolutePosition.y >= outer.absolutePosition.y - 1
    && inner.absolutePosition.x + inner.width <= outer.absolutePosition.x + outer.width + 1
    && inner.absolutePosition.y + inner.height <= outer.absolutePosition.y + outer.height + 1);
  for (const [id, rect] of rects) {
    const info = nodeInfo(id);
    if (info?.captionBox && info.captionBox.width > 0 && info.captionBox.height > 0) {
      // Avoid crossing ANY node's or container's caption (including group titles & bottom captions!).
      boxes.push(info.captionBox);
      libObstacles.push({ id: `${id}__cap`, ...info.captionBox });
    }
    if (info?.isContainer) {
      // Non-ancestor sibling containers are solid obstacles (matching finalRouteObstacles028).
      if (id !== edge.source && id !== edge.target && !encloses(rect, srcRect) && !encloses(rect, tgtRect)) {
        const cBox: Rect0211 = { x: rect.absolutePosition.x, y: rect.absolutePosition.y, width: rect.width, height: rect.height };
        boxes.push(cBox);
        libObstacles.push({ id, ...cBox });
      }
      continue;
    }
    const body = info?.frame ?? {
      x: rect.absolutePosition.x,
      y: rect.absolutePosition.y,
      width: rect.width,
      height: rect.height,
    };
    // For source/target self-intersection checks, use the outer union of raw node body and ink frame
    // so routes cannot skim 0.3 px inside a shape's outer border (e.g. lowfi aiml-training).
    const fullBox: Rect0211 = {
      x: Math.min(body.x, rect.absolutePosition.x),
      y: Math.min(body.y, rect.absolutePosition.y),
      width: Math.max(body.x + body.width, rect.absolutePosition.x + rect.width) - Math.min(body.x, rect.absolutePosition.x),
      height: Math.max(body.y + body.height, rect.absolutePosition.y + rect.height) - Math.min(body.y, rect.absolutePosition.y),
    };
    if (id === edge.source) { srcFrame = (info?.hasBottomCaption || info?.hasRightCaption) ? body : fullBox; continue; }
    if (id === edge.target) { tgtFrame = (info?.hasBottomCaption || info?.hasRightCaption) ? body : fullBox; continue; }
    boxes.push(fullBox);
    libObstacles.push({ id, ...fullBox });
  }
  return { boxes, libObstacles, srcFrame, tgtFrame };
}

/**
 * Re-anchor one end of an orthogonal path onto `newPt` on `side`, preserving
 * strict orthogonality by sliding the adjacent bend point or inserting a clean
 * 2-bend orthogonal step when the route has no perpendicular interior bend.
 */
function reanchorEndpointOrthogonal(
  pts: readonly Point[],
  end: 'source' | 'target',
  newPt: Point,
  side: PortSide,
  obstacles: readonly Rect0211[],
): Point[] | undefined {
  if (pts.length < 2) return undefined;
  const out = pts.map((p) => ({ ...p }));
  const horizontalDeparture = side === 'WEST' || side === 'EAST';
  const sign = side === 'EAST' || side === 'SOUTH' ? 1 : -1;

  if (end === 'source') {
    const p1 = out[1]!;
    out[0] = { ...newPt };
    if (out.length === 2) {
      // 2-point straight route: insert clean Z-step at midpoint if perpendicular coord differs.
      if (horizontalDeparture) {
        if (Math.abs(newPt.y - p1.y) > EPS) {
          const midX = (newPt.x + p1.x) / 2;
          const cand = [newPt, { x: midX, y: newPt.y }, { x: midX, y: p1.y }, p1];
          return pathHitsObstacles(cand, obstacles) ? undefined : compactOrthogonal(cand);
        }
      } else if (Math.abs(newPt.x - p1.x) > EPS) {
        const midY = (newPt.y + p1.y) / 2;
        const cand = [newPt, { x: newPt.x, y: midY }, { x: p1.x, y: midY }, p1];
        return pathHitsObstacles(cand, obstacles) ? undefined : compactOrthogonal(cand);
      }
      return pathHitsObstacles(out, obstacles) ? undefined : compactOrthogonal(out);
    }

    // >= 3 points: check whether first segment leaves along side's normal axis.
    const firstWasHoriz = Math.abs(pts[0]!.y - pts[1]!.y) <= EPS;
    const firstWasVert = Math.abs(pts[0]!.x - pts[1]!.x) <= EPS;
    if (horizontalDeparture && firstWasHoriz && (out[1]!.x - newPt.x) * sign >= 4) {
      const stubLen = (out[1]!.x - newPt.x) * sign;
      // Avoid cramped < 12 px departure stubs next to node walls when the vertical rail can shift out cleanly.
      if (stubLen < 12 && out.length >= 4 && Math.abs(out[1]!.x - out[2]!.x) <= EPS) {
        const pushed = out.map((p) => ({ ...p }));
        pushed[1]!.x = newPt.x + sign * 14;
        pushed[1]!.y = newPt.y;
        pushed[2]!.x = newPt.x + sign * 14;
        if (isPathOrthogonal(pushed) && !pathHitsObstacles(pushed, obstacles)) return compactOrthogonal(pushed);
      }
      out[1]!.y = newPt.y;
      if (isPathOrthogonal(out) && !pathHitsObstacles(out, obstacles)) return compactOrthogonal(out);
    } else if (!horizontalDeparture && firstWasVert && (out[1]!.y - newPt.y) * sign >= 4) {
      const stubLen = (out[1]!.y - newPt.y) * sign;
      if (stubLen < 12 && out.length >= 4 && Math.abs(out[1]!.y - out[2]!.y) <= EPS) {
        const pushed = out.map((p) => ({ ...p }));
        pushed[1]!.y = newPt.y + sign * 14;
        pushed[1]!.x = newPt.x;
        pushed[2]!.y = newPt.y + sign * 14;
        if (isPathOrthogonal(pushed) && !pathHitsObstacles(pushed, obstacles)) return compactOrthogonal(pushed);
      }
      out[1]!.x = newPt.x;
      if (isPathOrthogonal(out) && !pathHitsObstacles(out, obstacles)) return compactOrthogonal(out);
    }
    // Try a clean 1-bend direct L-elbow to the final endpoint when the target already arrives perpendicularly.
    const lastPt = pts[pts.length - 1]!;
    const prevLast = pts[pts.length - 2]!;
    const lastVert = Math.abs(prevLast.x - lastPt.x) <= EPS;
    const lastHoriz = Math.abs(prevLast.y - lastPt.y) <= EPS;
    if (horizontalDeparture && lastVert && (lastPt.x - newPt.x) * sign >= 12 && Math.abs(lastPt.y - newPt.y) >= 12) {
      const lCand = [newPt, { x: lastPt.x, y: newPt.y }, lastPt];
      if (isPathOrthogonal(lCand) && !pathHitsObstacles(lCand, obstacles)) return compactOrthogonal(lCand);
    } else if (!horizontalDeparture && lastHoriz && (lastPt.y - newPt.y) * sign >= 12 && Math.abs(lastPt.x - newPt.x) >= 12) {
      const lCand = [newPt, { x: newPt.x, y: lastPt.y }, lastPt];
      if (isPathOrthogonal(lCand) && !pathHitsObstacles(lCand, obstacles)) return compactOrthogonal(lCand);
    }
    // Insert a clean short stub out of `side` into the existing first bend.
    const stub = 18;
    const s1 = horizontalDeparture ? { x: newPt.x + sign * stub, y: newPt.y } : { x: newPt.x, y: newPt.y + sign * stub };
    const elbow = horizontalDeparture ? { x: s1.x, y: p1.y } : { x: p1.x, y: s1.y };
    const cand = [newPt, s1, elbow, ...pts.slice(1)];
    if (isPathOrthogonal(cand) && !pathHitsObstacles(cand, obstacles)) return compactOrthogonal(cand);
    return undefined;
  } else {
    const last = out.length - 1;
    const prev = out[last - 1]!;
    out[last] = { ...newPt };
    if (out.length === 2) {
      if (horizontalDeparture) {
        if (Math.abs(newPt.y - prev.y) > EPS) {
          const midX = (prev.x + newPt.x) / 2;
          const cand = [prev, { x: midX, y: prev.y }, { x: midX, y: newPt.y }, newPt];
          return pathHitsObstacles(cand, obstacles) ? undefined : compactOrthogonal(cand);
        }
      } else if (Math.abs(newPt.x - prev.x) > EPS) {
        const midY = (prev.y + newPt.y) / 2;
        const cand = [prev, { x: prev.x, y: midY }, { x: newPt.x, y: midY }, newPt];
        return pathHitsObstacles(cand, obstacles) ? undefined : compactOrthogonal(cand);
      }
      return pathHitsObstacles(out, obstacles) ? undefined : compactOrthogonal(out);
    }

    const lastWasHoriz = Math.abs(pts[last]!.y - pts[last - 1]!.y) <= EPS;
    const lastWasVert = Math.abs(pts[last]!.x - pts[last - 1]!.x) <= EPS;
    if (horizontalDeparture && lastWasHoriz && (out[last - 1]!.x - newPt.x) * sign >= 4) {
      const stubLen = (out[last - 1]!.x - newPt.x) * sign;
      if (stubLen < 12 && out.length >= 4 && Math.abs(out[last - 1]!.x - out[last - 2]!.x) <= EPS) {
        const pushed = out.map((p) => ({ ...p }));
        pushed[last - 1]!.x = newPt.x + sign * 14;
        pushed[last - 1]!.y = newPt.y;
        pushed[last - 2]!.x = newPt.x + sign * 14;
        if (isPathOrthogonal(pushed) && !pathHitsObstacles(pushed, obstacles)) return compactOrthogonal(pushed);
      }
      out[last - 1]!.y = newPt.y;
      if (isPathOrthogonal(out) && !pathHitsObstacles(out, obstacles)) return compactOrthogonal(out);
    } else if (!horizontalDeparture && lastWasVert && (out[last - 1]!.y - newPt.y) * sign >= 4) {
      const stubLen = (out[last - 1]!.y - newPt.y) * sign;
      if (stubLen < 12 && out.length >= 4 && Math.abs(out[last - 1]!.y - out[last - 2]!.y) <= EPS) {
        const pushed = out.map((p) => ({ ...p }));
        pushed[last - 1]!.y = newPt.y + sign * 14;
        pushed[last - 1]!.x = newPt.x;
        pushed[last - 2]!.y = newPt.y + sign * 14;
        if (isPathOrthogonal(pushed) && !pathHitsObstacles(pushed, obstacles)) return compactOrthogonal(pushed);
      }
      out[last - 1]!.x = newPt.x;
      if (isPathOrthogonal(out) && !pathHitsObstacles(out, obstacles)) return compactOrthogonal(out);
    }
    const stub = 18;
    const e1 = horizontalDeparture ? { x: newPt.x + sign * stub, y: newPt.y } : { x: newPt.x, y: newPt.y + sign * stub };
    const elbow = horizontalDeparture ? { x: e1.x, y: prev.y } : { x: prev.x, y: e1.y };
    const cand = [...pts.slice(0, last), elbow, e1, newPt];
    if (isPathOrthogonal(cand) && !pathHitsObstacles(cand, obstacles)) return compactOrthogonal(cand);
    return undefined;
  }
}

/**
 * Route an orthogonal connector between `start` (leaving `startSide`) and `end`
 * (entering `endSide`) using fast L/Z candidates first, falling back to
 * `libavoided-js` 0.2.0 `routeEdges` around obstacles.
 */
function routeOrthogonalPair(
  edge: GraphEdge,
  start: Point,
  startSide: PortSide,
  end: Point,
  endSide: PortSide,
  obstacles: readonly Rect0211[],
  libObstacles: Obstacle[],
  existingSegments: ReadonlyArray<{ a: Point; b: Point; edgeId: string }>,
  constrainEnd: 'both' | 'source' | 'target' = 'both',
  srcFrame?: Rect0211,
  tgtFrame?: Rect0211,
): Point[] | undefined {
  const sH = startSide === 'WEST' || startSide === 'EAST';
  const eH = endSide === 'WEST' || endSide === 'EAST';
  const sSign = startSide === 'EAST' || startSide === 'SOUTH' ? 1 : -1;
  const eSign = endSide === 'EAST' || endSide === 'SOUTH' ? 1 : -1;

  const overlapPenalty = (pts: readonly Point[]): number => {
    let ov = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const h = Math.abs(a.y - b.y) <= EPS;
      const v = Math.abs(a.x - b.x) <= EPS;
      if (!h && !v) return 1e9;
      for (const ex of existingSegments) {
        if (ex.edgeId === edge.id) continue;
        if (h && Math.abs(ex.a.y - ex.b.y) <= EPS && Math.abs(a.y - ex.a.y) <= 2) {
          const span = Math.min(Math.max(a.x, b.x), Math.max(ex.a.x, ex.b.x))
            - Math.max(Math.min(a.x, b.x), Math.min(ex.a.x, ex.b.x));
          if (span > 1) ov += span;
        } else if (v && Math.abs(ex.a.x - ex.b.x) <= EPS && Math.abs(a.x - ex.a.x) <= 2) {
          const span = Math.min(Math.max(a.y, b.y), Math.max(ex.a.y, ex.b.y))
            - Math.max(Math.min(a.y, b.y), Math.min(ex.a.y, ex.b.y));
          if (span > 1) ov += span;
        }
      }
    }
    return ov;
  };

  const respectsEndDirections = (pts: readonly Point[]): boolean => {
    if (pts.length < 2) return false;
    if (pathReentersEndNodes(pts, srcFrame, tgtFrame)) return false;
    if (constrainEnd !== 'target') {
      const a = pts[0]!, b = pts[1]!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const minLen = pts.length >= 3 ? 5.5 : 1;
      const ok = sH
        ? (dx * sSign >= minLen && Math.abs(dy) <= 1)
        : (dy * sSign >= minLen && Math.abs(dx) <= 1);
      if (!ok) return false;
    }
    if (constrainEnd !== 'source') {
      const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const minLen = pts.length >= 3 ? 5.5 : 1;
      // Inward into endSide is OPPOSITE of eSign (e.g. WEST has eSign=-1, inward is dx > 0).
      const ok = eH
        ? (dx * (-eSign) >= minLen && Math.abs(dy) <= 1)
        : (dy * (-eSign) >= minLen && Math.abs(dx) <= 1);
      if (!ok) return false;
    }
    return true;
  };

  const candidates: Point[][] = [];
  // L-elbow (when departure and arrival are perpendicular and facing each other with >= 6 px stubs).
  if (sH && !eH) {
    if ((end.x - start.x) * sSign >= 6 && (start.y - end.y) * eSign >= 6) {
      candidates.push([start, { x: end.x, y: start.y }, end]);
    }
    // 5-point clean step-out-and-into perpendicular face (e.g. EAST -> NORTH when end.x is close).
    for (const pad of [20, 34, 48]) {
      const xClear = sSign > 0 ? Math.max(start.x, end.x) + pad : Math.min(start.x, end.x) - pad;
      for (const my of [(start.y + end.y) / 2, end.y + eSign * 10, end.y + eSign * 22]) {
        candidates.push([start, { x: xClear, y: start.y }, { x: xClear, y: my }, { x: end.x, y: my }, end]);
      }
    }
  } else if (!sH && eH) {
    if ((end.y - start.y) * sSign >= 6 && (start.x - end.x) * eSign >= 6) {
      candidates.push([start, { x: start.x, y: end.y }, end]);
    }
    // 5-point clean over-the-top / under-the-bottom (e.g. NORTH -> WEST when end.y ≈ start.y).
    const yClear = sSign < 0 ? Math.min(start.y, end.y) - 18 : Math.max(start.y, end.y) + 18;
    for (const mx of [(start.x + end.x) / 2, end.x + eSign * 24, start.x + (end.x - start.x) * 0.65]) {
      candidates.push([start, { x: start.x, y: yClear }, { x: mx, y: yClear }, { x: mx, y: end.y }, end]);
    }
  } else if (sH && eH && sSign === -eSign && (end.x - start.x) * sSign >= 16) {
    const spanX = end.x - start.x;
    const mxs = [
      start.x + spanX * 0.5,
      end.x - sSign * 22,
      end.x - sSign * 36,
      start.x + spanX * 0.35,
      start.x + spanX * 0.65,
      start.x + spanX * 0.25,
      start.x + spanX * 0.75,
      start.x + sSign * 22,
    ].filter((mx) => (mx - start.x) * sSign >= 10 && (end.x - mx) * sSign >= 10);
    for (const mx of mxs) {
      candidates.push([start, { x: mx, y: start.y }, { x: mx, y: end.y }, end]);
    }
  } else if (!sH && !eH && sSign === -eSign && (end.y - start.y) * sSign >= 16) {
    const spanY = end.y - start.y;
    const mys = [
      start.y + spanY * 0.5,
      end.y - sSign * 22,
      end.y - sSign * 36,
      start.y + spanY * 0.35,
      start.y + spanY * 0.65,
      start.y + spanY * 0.25,
      start.y + spanY * 0.75,
      start.y + sSign * 22,
    ].filter((my) => (my - start.y) * sSign >= 10 && (end.y - my) * sSign >= 10);
    for (const my of mys) {
      candidates.push([start, { x: start.x, y: my }, { x: end.x, y: my }, end]);
    }
  }

  let best: { pts: Point[]; score: number } | undefined;
  for (const raw of candidates) {
    const pts = compactOrthogonal(raw);
    if (!isPathOrthogonal(pts) || !respectsEndDirections(pts) || pathHitsObstacles(pts, obstacles)) continue;
    const ov = overlapPenalty(pts);
    const len = pts.slice(1).reduce((s, p, i) => s + Math.abs(p.x - pts[i]!.x) + Math.abs(p.y - pts[i]!.y), 0);
    const score = ov * 100 + (pts.length - 2) * 30 + len * 0.05;
    if (!best || score < best.score) best = { pts, score };
    if (ov === 0 && pts.length <= 4) break;
  }
  if (best && best.score < 80) return best.pts;

  // Fallback to libavoided-js 0.2.0 A* obstacle-avoiding router.
  try {
    const out = routeEdges(
      {
        obstacles: libObstacles,
        edges: [{
          id: edge.id,
          sourceId: edge.source,
          targetId: edge.target,
          sourcePoint: start,
          targetPoint: end,
          ...(constrainEnd !== 'target' ? { sourceDirection: outwardDirection(startSide) } : {}),
          ...(constrainEnd !== 'source' ? { targetDirection: inwardDirection(endSide) } : {}),
        }],
      },
      {
        obstacleMargin: 10,
        edgeSpacing: TARGET_CORRIDOR_GAP,
        bendPenalty: 50,
        crossingPenalty: 200,
        sharedSegmentPenalty: 500,
        preserveEndpoints: true,
      } as Parameters<typeof routeEdges>[1],
    );
    const sec = out.edges[0]?.sections[0];
    if (sec) {
      const pts = compactOrthogonal([sec.startPoint, ...sec.bendPoints, sec.endPoint]);
      if (isPathOrthogonal(pts) && respectsEndDirections(pts) && !pathHitsObstacles(pts, obstacles, 0.5)) {
        const ov = overlapPenalty(pts);
        const score = ov * 100 + (pts.length - 2) * 30;
        if (!best || score < best.score) best = { pts, score };
      }
    }
  } catch {
    // Keep best candidate if libavoided-js throws or fails.
  }
  return best?.pts;
}

function allRouteSegments(routes: readonly ResolvedEdgeRoute[]): Array<{ a: Point; b: Point; edgeId: string }> {
  const segs: Array<{ a: Point; b: Point; edgeId: string }> = [];
  for (const r of routes) {
    const pts = sectionPoints(r.sections);
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ a: pts[i]!, b: pts[i + 1]!, edgeId: r.id });
    }
  }
  return segs;
}

function countOrthogonalCrossings(p1: readonly Point[], p2: readonly Point[]): number {
  let count = 0;
  for (let i = 0; i < p1.length - 1; i++) {
    const a1 = p1[i]!, b1 = p1[i + 1]!;
    const h1 = Math.abs(a1.y - b1.y) <= EPS;
    const v1 = Math.abs(a1.x - b1.x) <= EPS;
    if (!h1 && !v1) continue;
    for (let j = 0; j < p2.length - 1; j++) {
      const a2 = p2[j]!, b2 = p2[j + 1]!;
      const h2 = Math.abs(a2.y - b2.y) <= EPS;
      const v2 = Math.abs(a2.x - b2.x) <= EPS;
      if (h1 && v2) {
        const minX = Math.min(a1.x, b1.x), maxX = Math.max(a1.x, b1.x);
        const minY = Math.min(a2.y, b2.y), maxY = Math.max(a2.y, b2.y);
        if (a2.x > minX + 1 && a2.x < maxX - 1 && a1.y > minY + 1 && a1.y < maxY - 1) count++;
      } else if (v1 && h2) {
        const minX = Math.min(a2.x, b2.x), maxX = Math.max(a2.x, b2.x);
        const minY = Math.min(a1.y, b1.y), maxY = Math.max(a1.y, b1.y);
        if (a1.x > minX + 1 && a1.x < maxX - 1 && a2.y > minY + 1 && a2.y < maxY - 1) count++;
      }
    }
  }
  return count;
}

function hasCollinearOverlap(p1: readonly Point[], p2: readonly Point[], tol = 3.2): boolean {
  for (let i = 0; i < p1.length - 1; i++) {
    const a1 = p1[i]!, b1 = p1[i + 1]!;
    const h1 = Math.abs(a1.y - b1.y) <= EPS;
    const v1 = Math.abs(a1.x - b1.x) <= EPS;
    if (!h1 && !v1) continue;
    for (let j = 0; j < p2.length - 1; j++) {
      const a2 = p2[j]!, b2 = p2[j + 1]!;
      const h2 = Math.abs(a2.y - b2.y) <= EPS;
      const v2 = Math.abs(a2.x - b2.x) <= EPS;
      if (h1 && h2 && Math.abs(a1.y - a2.y) <= tol) {
        const span = Math.min(Math.max(a1.x, b1.x), Math.max(a2.x, b2.x))
          - Math.max(Math.min(a1.x, b1.x), Math.min(a2.x, b2.x));
        if (span > 3) return true;
      } else if (v1 && v2 && Math.abs(a1.x - a2.x) <= tol) {
        const span = Math.min(Math.max(a1.y, b1.y), Math.max(a2.y, b2.y))
          - Math.max(Math.min(a1.y, b1.y), Math.min(a2.y, b2.y));
        if (span > 3) return true;
      }
    }
  }
  return false;
}

function collectContainers(
  rects: Map<string, AlignableRect>,
  nodeInfo: (id: string) => BatchNodeInfo0211 | undefined,
): Rect0211[] {
  const out: Rect0211[] = [];
  for (const [id, rect] of rects) {
    if (nodeInfo(id)?.isContainer) {
      out.push({
        x: rect.absolutePosition.x,
        y: rect.absolutePosition.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  return out;
}

function segmentBorderHugInfo(
  a: Point,
  b: Point,
  containers: readonly Rect0211[],
  clearance = 11.5,
  minSpan = 14,
): { wall: number; orientation: 'H' | 'V'; dist: number } | undefined {
  const isH = Math.abs(a.y - b.y) <= EPS;
  const isV = Math.abs(a.x - b.x) <= EPS;
  if (!isH && !isV) return undefined;
  let worst: { wall: number; orientation: 'H' | 'V'; dist: number } | undefined;
  for (const c of containers) {
    if (isV) {
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
      const span = Math.min(hi, c.y + c.height) - Math.max(lo, c.y);
      if (span < minSpan) continue;
      const dL = Math.abs(a.x - c.x);
      const dR = Math.abs(a.x - (c.x + c.width));
      const d = Math.min(dL, dR);
      if (d < clearance && (!worst || d < worst.dist)) {
        worst = { wall: dL <= dR ? c.x : c.x + c.width, orientation: 'V', dist: d };
      }
    } else {
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      const span = Math.min(hi, c.x + c.width) - Math.max(lo, c.x);
      if (span < minSpan) continue;
      const dT = Math.abs(a.y - c.y);
      const dB = Math.abs(a.y - (c.y + c.height));
      const d = Math.min(dT, dB);
      if (d < clearance && (!worst || d < worst.dist)) {
        worst = { wall: dT <= dB ? c.y : c.y + c.height, orientation: 'H', dist: d };
      }
    }
  }
  return worst;
}

function pathBorderHugCount(pts: readonly Point[], containers: readonly Rect0211[], clearance = 11.5): number {
  let hits = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentBorderHugInfo(pts[i]!, pts[i + 1]!, containers, clearance)) hits++;
  }
  return hits;
}

function isInwardApproach(prev: Point, end: Point, frame: Rect0211): { ok: boolean; side: PortSide; len: number } {
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const len = Math.hypot(dx, dy);
  // On curved/oval shapes (e.g. brain, cloud, ellipse), a horizontal approach near the
  // upper/lower shoulder can be slightly closer to frame.y than frame.x while still
  // cleanly entering the WEST/EAST contour face. Recognize valid axial approaches first.
  if (Math.abs(dy) <= 1 && Math.abs(dx) > 1
    && end.y >= frame.y + 5 && end.y <= frame.y + frame.height - 5) {
    if (dx > 1 && end.x <= frame.x + frame.width * 0.22) return { ok: true, side: 'WEST', len };
    if (dx < -1 && end.x >= frame.x + frame.width * 0.78) return { ok: true, side: 'EAST', len };
  }
  if (Math.abs(dx) <= 1 && Math.abs(dy) > 1
    && end.x >= frame.x + 5 && end.x <= frame.x + frame.width - 5) {
    if (dy > 1 && end.y <= frame.y + frame.height * 0.22) return { ok: true, side: 'NORTH', len };
    if (dy < -1 && end.y >= frame.y + frame.height * 0.78) return { ok: true, side: 'SOUTH', len };
  }
  const side = inferContactSide(end, frame);
  const ok = (side === 'WEST' && dx > 1 && Math.abs(dy) <= 1)
    || (side === 'EAST' && dx < -1 && Math.abs(dy) <= 1)
    || (side === 'NORTH' && dy > 1 && Math.abs(dx) <= 1)
    || (side === 'SOUTH' && dy < -1 && Math.abs(dx) <= 1);
  return { ok, side, len };
}

function permutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [[...arr]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const sub of permutations(rest)) {
      out.push([arr[i]!, ...sub]);
    }
  }
  return out;
}

/**
 * Stage 3 + Stage 4 unified batch route coordinator.
 * Mutates `routes` in-place for generated orthogonal connectors only.
 */
export function coordinateBatchRoutes0211(ctx: BatchRouterContext0211): void {
  if (ctx.routingStyle !== 'orthogonal' || !ctx.routes.length) return;
  const edgeById = new Map(ctx.graph.edges.map((e) => [e.id, e]));
  const editable = (edge: GraphEdge | undefined): edge is GraphEdge =>
    Boolean(edge && !edge.routeIntent && !edge.labelPlacement && edge.source !== edge.target);

  // ---------------------------------------------------------------------------
  // Phase A (Stage 3): Contour-aware multi-port slot distribution & side spill
  // ---------------------------------------------------------------------------
  interface EndpointRef {
    route: ResolvedEdgeRoute;
    edge: GraphEdge;
    end: 'source' | 'target';
    nodeId: string;
    side: PortSide;
    pt: Point;
    farCoord: number;
  }

  const byNodeSide = new Map<string, EndpointRef[]>();
  const registerEndpoints = () => {
    byNodeSide.clear();
    for (const route of ctx.routes) {
      const edge = edgeById.get(route.id);
      if (!editable(edge)) continue;
      const pts = sectionPoints(route.sections);
      if (pts.length < 2) continue;

      for (const end of ['source', 'target'] as const) {
        const nodeId = end === 'source' ? edge.source : edge.target;
        const portId = end === 'source' ? edge.sourcePort : edge.targetPort;
        // Preserve named ports (authored or shared semantic free ports) untouched.
        if (portId || ctx.isFixedPort(nodeId, portId)) continue;
        const info = ctx.nodeInfo(nodeId);
        if (!info || info.isContainer) continue;
        const pt = end === 'source' ? pts[0]! : pts[pts.length - 1]!;
        const nextPt = end === 'source' ? pts[1]! : pts[pts.length - 2]!;
        // For diamonds AND captioned icons (whose ELK port may sit below the glyph
        // midpoint on a sloped shoulder), infer the intended side from the terminal
        // segment direction when the contact is near a corner or off-center.
        const segHoriz = Math.abs(nextPt.x - pt.x) >= Math.abs(nextPt.y - pt.y);
        const side: PortSide = (info.shapeId === 'diamond' || info.hasBottomCaption || info.hasRightCaption)
          ? (segHoriz
            ? (nextPt.x >= pt.x ? 'EAST' : 'WEST')
            : (nextPt.y >= pt.y ? 'SOUTH' : 'NORTH'))
          : inferContactSide(pt, info.frame);
        const horizSide = side === 'NORTH' || side === 'SOUTH';
        // Use the opposite node's true visual glyph center for monotone planar port ordering.
        const otherId = end === 'source' ? edge.target : edge.source;
        const otherInfo = ctx.nodeInfo(otherId);
        const farCoord = otherInfo
          ? (horizSide ? otherInfo.frame.x + otherInfo.frame.width / 2 : otherInfo.frame.y + otherInfo.frame.height / 2)
          : (horizSide ? (end === 'source' ? pts[pts.length - 1]!.x : pts[0]!.x) : (end === 'source' ? pts[pts.length - 1]!.y : pts[0]!.y));
        const key = `${nodeId}\0${side}`;
        const list = byNodeSide.get(key) ?? [];
        list.push({ route, edge, end, nodeId, side, pt, farCoord });
        byNodeSide.set(key, list);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Phase A0 (Stage 3): Center single-edge free contacts on captioned icon glyphs
  // so icons like cylinders, hexagons, clouds, and actors connect at their true
  // visual glyph midpoint instead of their composite (glyph + caption) box center.
  // ---------------------------------------------------------------------------
  registerEndpoints();
  for (const [, group] of byNodeSide) {
    if (group.length !== 1) continue;
    const ref = group[0]!;
    const info = ctx.nodeInfo(ref.nodeId);
    if (!info || info.isContainer) continue;
    const isIconShape = info.hasBottomCaption || info.hasRightCaption
      || info.shapeId === 'cylinder' || info.shapeId === 'hexagon'
      || info.shapeId === 'cloud' || info.shapeId === 'actor';
    if (!isIconShape) continue;
    const horizSide = ref.side === 'NORTH' || ref.side === 'SOUTH';
    const midCoord = horizSide
      ? info.frame.x + info.frame.width / 2
      : info.frame.y + info.frame.height / 2;
    const curCoord = horizSide ? ref.pt.x : ref.pt.y;
    if (Math.abs(curCoord - midCoord) <= 2.5) continue;

    const targetPt = ctx.contourContact?.(ref.nodeId, ref.side, midCoord)
      ?? (horizSide
        ? { x: midCoord, y: ref.side === 'NORTH' ? info.frame.y : info.frame.y + info.frame.height }
        : { x: ref.side === 'WEST' ? info.frame.x : info.frame.x + info.frame.width, y: midCoord });
    const pts = sectionPoints(ref.route.sections);
    const { boxes, srcFrame, tgtFrame } = collectObstaclesFor(ref.edge, ctx.rects, ctx.nodeInfo);
    const updated = reanchorEndpointOrthogonal(pts, ref.end, targetPt, ref.side, boxes);
    if (updated && !pathReentersEndNodes(updated, srcFrame, tgtFrame)) {
      setRoutePoints(ref.route, updated);
    }
  }

  // Collapse any 4-point Z-step whose endpoints became collinear after Phase A0 centering
  // (e.g. Browser client -> Edge CDN now sharing the exact same glyph midpoint Y).
  for (const route of ctx.routes) {
    const edge = edgeById.get(route.id);
    if (!editable(edge)) continue;
    const pts = sectionPoints(route.sections);
    if (pts.length === 4) {
      const s = pts[0]!, e = pts[3]!;
      const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      if (Math.abs(s.y - e.y) <= 2 && !pathHitsObstacles([s, { x: e.x, y: s.y }], boxes)) {
        const tgtInfo = ctx.nodeInfo(edge.target);
        const snapEnd = (!edge.targetPort && tgtInfo)
          ? (ctx.contourContact?.(edge.target, inferContactSide(e, tgtInfo.frame), s.y) ?? { x: e.x, y: s.y })
          : e;
        if (Math.abs(snapEnd.y - s.y) <= EPS && !pathHitsObstacles([s, snapEnd], boxes)) {
          setRoutePoints(route, [s, snapEnd]);
        }
      } else if (Math.abs(s.x - e.x) <= 2 && !pathHitsObstacles([s, { x: s.x, y: e.y }], boxes)) {
        const tgtInfo = ctx.nodeInfo(edge.target);
        const snapEnd = (!edge.targetPort && tgtInfo)
          ? (ctx.contourContact?.(edge.target, inferContactSide(e, tgtInfo.frame), s.x) ?? { x: s.x, y: e.y })
          : e;
        if (Math.abs(snapEnd.x - s.x) <= EPS && !pathHitsObstacles([s, snapEnd], boxes)) {
          setRoutePoints(route, [s, snapEnd]);
        }
      }
    }
  }

  for (let slotPass = 0; slotPass < 2; slotPass++) {
    registerEndpoints();
    let anySlotChanged = false;

    for (const [, group] of byNodeSide) {
      if (group.length < 2) continue;
      const { nodeId, side } = group[0]!;
      const info = ctx.nodeInfo(nodeId)!;
      const horizSide = side === 'NORTH' || side === 'SOUTH';

      // Trigger re-allocation if any pair collides (< MIN_PORT_PITCH) OR if any contact
      // sits outside the visual glyph span (e.g. ELK placed a port in the caption zone)
      // OR if endpoints are inverted relative to planar target order.
      const coords = group.map((g) => (horizSide ? g.pt.x : g.pt.y)).sort((a, b) => a - b);
      let needsFix = false;
      for (let i = 1; i < coords.length; i++) {
        if (coords[i]! - coords[i - 1]! < MIN_PORT_PITCH - 0.1) {
          needsFix = true;
          break;
        }
      }
      if (!needsFix) {
        const loG = horizSide ? info.frame.x : info.frame.y;
        const hiG = horizSide ? info.frame.x + info.frame.width : info.frame.y + info.frame.height;
        if (group.some((g) => {
          const c = horizSide ? g.pt.x : g.pt.y;
          return c < loG - 2 || c > hiG + 2;
        })) {
          needsFix = true;
        }
      }
      // Sort in planar order by farCoord, breaking same-rank ties by the perpendicular axis
      // (so vertical columns landing on NORTH/SOUTH or horizontal rows landing on EAST/WEST
      // fan in without crossings), then deterministically by edge id.
      const nodeCx = info.frame.x + info.frame.width / 2;
      const nodeCy = info.frame.y + info.frame.height / 2;
      const planarCompare = (a: EndpointRef, b: EndpointRef): number => {
        if (Math.abs(a.farCoord - b.farCoord) > 40) return a.farCoord - b.farCoord;
        const oa = ctx.nodeInfo(a.end === 'source' ? a.edge.target : a.edge.source);
        const ob = ctx.nodeInfo(b.end === 'source' ? b.edge.target : b.edge.source);
        if (oa && ob) {
          const ax = oa.frame.x + oa.frame.width / 2, ay = oa.frame.y + oa.frame.height / 2;
          const bx = ob.frame.x + ob.frame.width / 2, by = ob.frame.y + ob.frame.height / 2;
          if (horizSide) {
            if (Math.abs(ax - bx) <= 4) {
              const pa = sectionPoints(a.route.sections);
              const pb = sectionPoints(b.route.sections);
              const prevAx = a.end === 'target' ? pa[Math.max(0, pa.length - 3)]!.x : pa[Math.min(pa.length - 1, 2)]!.x;
              const prevBx = b.end === 'target' ? pb[Math.max(0, pb.length - 3)]!.x : pb[Math.min(pb.length - 1, 2)]!.x;
              if (Math.abs(prevAx - prevBx) > 8) return prevAx - prevBx;
            }
            const leftOfNode = (ax + bx) / 2 < nodeCx;
            const sign = (side === 'NORTH') === leftOfNode ? -1 : 1;
            if (Math.abs(ay - by) > 1) return (ay - by) * sign;
          } else {
            const aboveNode = (ay + by) / 2 < nodeCy;
            const sign = (side === 'WEST') === aboveNode ? -1 : 1;
            if (Math.abs(ax - bx) > 1) return (ax - bx) * sign;
          }
        }
        return (a.farCoord - b.farCoord) || a.edge.id.localeCompare(b.edge.id);
      };
      if (!needsFix) {
        // Check planar order inversion: if sorting by current contact differs from planar order.
        const byCur = [...group].sort((a, b) => (horizSide ? a.pt.x - b.pt.x : a.pt.y - b.pt.y));
        const byFar = [...group].sort(planarCompare);
        if (byCur.some((g, idx) => g.edge.id !== byFar[idx]!.edge.id)) {
          needsFix = true;
        }
      }
      if (!needsFix) continue;

      const sorted = [...group].sort(planarCompare);
      const rect = ctx.rects.get(nodeId)!;
      const slotGraphPt = (slot: { localPoint: Point }, s: PortSide): Point => {
        // For diamond shapes (e.g. BPMN gateways), snap cardinal sides directly to the
        // exact diamond vertices so NORTH/SOUTH/EAST/WEST stay maximally separated.
        if (info.shapeId === 'diamond') {
          const f = info.frame;
          if (s === 'NORTH') return { x: f.x + f.width / 2, y: f.y };
          if (s === 'SOUTH') return { x: f.x + f.width / 2, y: f.y + f.height };
          if (s === 'WEST') return { x: f.x, y: f.y + f.height / 2 };
          return { x: f.x + f.width, y: f.y + f.height / 2 };
        }
        const fallback = { x: rect.absolutePosition.x + slot.localPoint.x, y: rect.absolutePosition.y + slot.localPoint.y };
        const isH = s === 'NORTH' || s === 'SOUTH';
        return ctx.contourContact?.(nodeId, s, isH ? fallback.x : fallback.y) ?? fallback;
      };

      // Verify true projected contour capacity: if contour clamping compresses adjacent slots
      // below 10.5 px (e.g. narrow parallelograms or diamonds), reduce effective capacity so excess spills cleanly.
      let cap = shapePortCapacity0211(info.shapeId, side, info.frame.width, info.frame.height, MIN_PORT_PITCH);
      while (cap > 1) {
        const probe = allocateSidePortSlots0211(info.shapeId, side, cap, rect.width, rect.height, {
          notationId: info.notationId,
          symbolId: info.symbolId,
          preferredPitchPx: MIN_PORT_PITCH,
          hasBottomCaption: info.hasBottomCaption,
          hasRightCaption: info.hasRightCaption,
          layoutDirection: ctx.direction,
        }).slots.map((s) => slotGraphPt(s, side));
        let minDist = Infinity;
        for (let k = 1; k < probe.length; k++) {
          const d = Math.hypot(probe[k]!.x - probe[k - 1]!.x, probe[k]!.y - probe[k - 1]!.y);
          if (d < minDist) minDist = d;
        }
        if (minDist >= 10.5) break;
        cap -= 1;
      }

      if (sorted.length <= cap) {
        // Spread cleanly across this single side using contour-projected slots.
        const alloc = allocateSidePortSlots0211(info.shapeId, side, sorted.length, rect.width, rect.height, {
          notationId: info.notationId,
          symbolId: info.symbolId,
          preferredPitchPx: TARGET_PORT_PITCH,
          hasBottomCaption: info.hasBottomCaption,
          hasRightCaption: info.hasRightCaption,
          layoutDirection: ctx.direction,
        });
        const pitchSlots = alloc.exceedsPreferredCapacity
          ? allocateSidePortSlots0211(info.shapeId, side, sorted.length, rect.width, rect.height, {
            notationId: info.notationId,
            symbolId: info.symbolId,
            preferredPitchPx: MIN_PORT_PITCH,
            hasBottomCaption: info.hasBottomCaption,
            hasRightCaption: info.hasRightCaption,
            layoutDirection: ctx.direction,
          }).slots
          : alloc.slots;

        for (let i = 0; i < sorted.length; i++) {
          const ref = sorted[i]!;
          const slot = pitchSlots[i]!;
          const targetPt = slotGraphPt(slot, side);
          const pts = sectionPoints(ref.route.sections);
          const { boxes, libObstacles, srcFrame, tgtFrame } = collectObstaclesFor(ref.edge, ctx.rects, ctx.nodeInfo);
          const updated = reanchorEndpointOrthogonal(pts, ref.end, targetPt, side, boxes);
          if (updated && !pathReentersEndNodes(updated, srcFrame, tgtFrame)) {
            setRoutePoints(ref.route, updated);
            anySlotChanged = true;
          } else {
            const otherPt = ref.end === 'source' ? pts[pts.length - 1]! : pts[0]!;
            const otherId = ref.end === 'source' ? ref.edge.target : ref.edge.source;
            const otherInfo = ctx.nodeInfo(otherId);
            const otherSide = otherInfo ? inferContactSide(otherPt, otherInfo.frame) : (side === 'EAST' ? 'WEST' : side === 'WEST' ? 'EAST' : side === 'SOUTH' ? 'NORTH' : 'SOUTH');
            const routed = ref.end === 'source'
              ? routeOrthogonalPair(ref.edge, targetPt, side, otherPt, otherSide, boxes, libObstacles, allRouteSegments(ctx.routes), 'both', srcFrame, tgtFrame)
              : routeOrthogonalPair(ref.edge, otherPt, otherSide, targetPt, side, boxes, libObstacles, allRouteSegments(ctx.routes), 'both', srcFrame, tgtFrame);
            if (routed) {
              setRoutePoints(ref.route, routed);
              anySlotChanged = true;
            }
          }
        }
      } else {
        // Overflow (degree > side capacity, e.g. 6-way fan-in or diamond gateway):
        // Choose caption-safe secondary sides (never SOUTH when hasBottomCaption per DRQ-16).
        const allowed = preferredFlowSides0211(
          ctx.direction,
          sorted[0]?.end ?? 'target',
          info.hasBottomCaption,
          info.hasRightCaption,
        ).filter((s) => s !== side);
        const canSpillSouth = !horizSide && allowed.includes('SOUTH');
        // When SOUTH is forbidden on an E/W side (bottom-captioned icon), spill ONLY the
        // TOP-MOST (lowest-Y) edges to NORTH so they never jump over lower branches!
        const keepStart = (!horizSide && !canSpillSouth)
          ? Math.max(0, sorted.length - cap)
          : Math.floor((sorted.length - cap) / 2);
        const keepSlice = sorted.slice(keepStart, keepStart + cap);
        const lowOverflow = sorted.slice(0, keepStart);
        const highOverflow = sorted.slice(keepStart + cap);

        const primarySlots = allocateSidePortSlots0211(info.shapeId, side, keepSlice.length, rect.width, rect.height, {
          notationId: info.notationId,
          symbolId: info.symbolId,
          preferredPitchPx: MIN_PORT_PITCH,
          hasBottomCaption: info.hasBottomCaption,
          hasRightCaption: info.hasRightCaption,
          layoutDirection: ctx.direction,
        }).slots;
        for (let i = 0; i < keepSlice.length; i++) {
          const ref = keepSlice[i]!;
          const slot = primarySlots[i]!;
          const targetPt = slotGraphPt(slot, side);
          const pts = sectionPoints(ref.route.sections);
          const { boxes, libObstacles, srcFrame, tgtFrame } = collectObstaclesFor(ref.edge, ctx.rects, ctx.nodeInfo);
          const updated = reanchorEndpointOrthogonal(pts, ref.end, targetPt, side, boxes);
          if (updated && !pathReentersEndNodes(updated, srcFrame, tgtFrame)) {
            setRoutePoints(ref.route, updated);
            anySlotChanged = true;
          } else {
            const otherPt = ref.end === 'source' ? pts[pts.length - 1]! : pts[0]!;
            const otherId = ref.end === 'source' ? ref.edge.target : ref.edge.source;
            const otherInfo = ctx.nodeInfo(otherId);
            const otherSide = otherInfo ? inferContactSide(otherPt, otherInfo.frame) : side;
            const routed = ref.end === 'source'
              ? routeOrthogonalPair(ref.edge, targetPt, side, otherPt, otherSide, boxes, libObstacles, allRouteSegments(ctx.routes), 'source', srcFrame, tgtFrame)
              : routeOrthogonalPair(ref.edge, otherPt, otherSide, targetPt, side, boxes, libObstacles, allRouteSegments(ctx.routes), 'target', srcFrame, tgtFrame);
            if (routed) {
              setRoutePoints(ref.route, routed);
              anySlotChanged = true;
            }
          }
        }

        const lowSide: PortSide = horizSide
          ? (allowed.includes('WEST') ? 'WEST' : allowed[0] ?? 'NORTH')
          : (allowed.includes('NORTH') ? 'NORTH' : allowed[0] ?? 'EAST');
        const highSide: PortSide = horizSide
          ? (allowed.includes('EAST') ? 'EAST' : allowed[allowed.length - 1] ?? 'WEST')
          : (allowed.includes('SOUTH') ? 'SOUTH' : (allowed.find((s) => s !== lowSide) ?? lowSide));

        const spillToSide = (refs: EndpointRef[], preferredSide: PortSide, fallbackSides: readonly PortSide[]) => {
          if (!refs.length) return;
          const trySides = [preferredSide, ...fallbackSides.filter((s) => s !== preferredSide)];
          // Sort spilled refs in planar order for the destination side so fan-in/fan-out
          // columns never cross when landing on NORTH or SOUTH.
          const nodeCx = info.frame.x + info.frame.width / 2;
          const orderedRefs = [...refs].sort((a, b) => {
            const oa = ctx.nodeInfo(a.end === 'source' ? a.edge.target : a.edge.source);
            const ob = ctx.nodeInfo(b.end === 'source' ? b.edge.target : b.edge.source);
            if (!oa || !ob) return a.edge.id.localeCompare(b.edge.id);
            const ax = oa.frame.x + oa.frame.width / 2, ay = oa.frame.y + oa.frame.height / 2;
            const bx = ob.frame.x + ob.frame.width / 2, by = ob.frame.y + ob.frame.height / 2;
            if (preferredSide === 'NORTH' || preferredSide === 'SOUTH') {
              if (Math.abs(ax - bx) > 40) return ax - bx;
              // Same vertical column on the left of node: for NORTH, lower Y (closer) takes left slot, higher Y takes right slot.
              const leftOfNode = (ax + bx) / 2 < nodeCx;
              const sign = (preferredSide === 'NORTH') === leftOfNode ? -1 : 1;
              return (ay - by) * sign || a.edge.id.localeCompare(b.edge.id);
            }
            return (ay - by) || a.edge.id.localeCompare(b.edge.id);
          });
          for (let i = 0; i < orderedRefs.length; i++) {
            const ref = orderedRefs[i]!;
            const pts = sectionPoints(ref.route.sections);
            const otherPt = ref.end === 'source' ? pts[pts.length - 1]! : pts[0]!;
            const otherId = ref.end === 'source' ? ref.edge.target : ref.edge.source;
            const otherInfo = ctx.nodeInfo(otherId);
            const otherSide = otherInfo ? inferContactSide(otherPt, otherInfo.frame) : side;
            const { boxes, libObstacles, srcFrame, tgtFrame } = collectObstaclesFor(ref.edge, ctx.rects, ctx.nodeInfo);
            for (const spillSide of trySides) {
              const spillHoriz = spillSide === 'NORTH' || spillSide === 'SOUTH';
              // Collect existing contacts already anchored on (nodeId, spillSide) so spilled
              // edges never collide with pre-existing edges on that side (e.g. c21 dw WEST).
              const existingOnSpill: number[] = [];
              for (const other of ctx.routes) {
                if (other.id === ref.route.id) continue;
                const oe = edgeById.get(other.id);
                if (!oe) continue;
                const opts = sectionPoints(other.sections);
                if (opts.length < 2) continue;
                if (oe.source === nodeId && inferContactSide(opts[0]!, info.frame) === spillSide) {
                  existingOnSpill.push(spillHoriz ? opts[0]!.x : opts[0]!.y);
                }
                if (oe.target === nodeId && inferContactSide(opts[opts.length - 1]!, info.frame) === spillSide) {
                  existingOnSpill.push(spillHoriz ? opts[opts.length - 1]!.x : opts[opts.length - 1]!.y);
                }
              }
              const totalCount = Math.max(orderedRefs.length, existingOnSpill.length + orderedRefs.length);
              const spillSlots = allocateSidePortSlots0211(info.shapeId, spillSide, totalCount, rect.width, rect.height, {
                notationId: info.notationId,
                symbolId: info.symbolId,
                preferredPitchPx: MIN_PORT_PITCH,
                hasBottomCaption: info.hasBottomCaption,
                hasRightCaption: info.hasRightCaption,
                layoutDirection: ctx.direction,
              }).slots;
              const clearSlots = spillSlots
                .map((slot) => slotGraphPt(slot, spillSide))
                .filter((pt) => {
                  const c = spillHoriz ? pt.x : pt.y;
                  return existingOnSpill.every((ec) => Math.abs(c - ec) >= 10.5);
                });
              if (!clearSlots.length) continue;
              const targetPt = clearSlots[Math.min(i, clearSlots.length - 1)]!;
              const routed = ref.end === 'source'
                ? routeOrthogonalPair(ref.edge, targetPt, spillSide, otherPt, otherSide, boxes, libObstacles, allRouteSegments(ctx.routes), 'source', srcFrame, tgtFrame)
                : routeOrthogonalPair(ref.edge, otherPt, otherSide, targetPt, spillSide, boxes, libObstacles, allRouteSegments(ctx.routes), 'target', srcFrame, tgtFrame);
              if (routed) {
                setRoutePoints(ref.route, routed);
                anySlotChanged = true;
                break;
              }
            }
          }
        };

        if (lowOverflow.length === 0 && highOverflow.length > 0 && !allowed.includes('SOUTH') && lowSide !== highSide) {
          // Bottom-captioned node with only 1 overflow branch: prefer NORTH before opposite side.
          spillToSide(highOverflow, lowSide, allowed);
        } else {
          spillToSide(lowOverflow, lowSide, allowed);
          spillToSide(highOverflow, highSide, allowed);
        }
      }
    }

    if (!anySlotChanged) break;
  }

  // ---------------------------------------------------------------------------
  // Phase B (Stage 4): Strict terminal & segment orthogonalization (DRQ-12)
  // ---------------------------------------------------------------------------
  for (const route of ctx.routes) {
    const edge = edgeById.get(route.id);
    if (!editable(edge)) continue;
    const pts = sectionPoints(route.sections);
    if (pts.length < 2 || isPathOrthogonal(pts)) continue;

    const { boxes, libObstacles } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
    const srcInfo = ctx.nodeInfo(edge.source);
    const tgtInfo = ctx.nodeInfo(edge.target);

    // Special case: 2-point nearly-horizontal or nearly-vertical segment (e.g. 1.96 px tilt).
    if (pts.length === 2 && srcInfo && tgtInfo) {
      const a = pts[0]!, b = pts[1]!;
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      if (dy <= 6 && dx > dy && !edge.targetPort && !ctx.isFixedPort(edge.target, edge.targetPort)) {
        const candPt = ctx.contourContact?.(edge.target, inferContactSide(b, tgtInfo.frame), a.y) ?? { x: b.x, y: a.y };
        if (Math.abs(candPt.y - a.y) <= EPS && !pathHitsObstacles([a, candPt], boxes)) {
          setRoutePoints(route, [a, candPt]);
          continue;
        }
      }
      if (dx <= 6 && dy > dx && !edge.targetPort && !ctx.isFixedPort(edge.target, edge.targetPort)) {
        const candPt = ctx.contourContact?.(edge.target, inferContactSide(b, tgtInfo.frame), a.x) ?? { x: a.x, y: b.y };
        if (Math.abs(candPt.x - a.x) <= EPS && !pathHitsObstacles([a, candPt], boxes)) {
          setRoutePoints(route, [a, candPt]);
          continue;
        }
      }
    }

    // Replace each diagonal leg with a clean obstacle-free orthogonal elbow or libavoided route.
    const rebuilt: Point[] = [pts[0]!];
    let ok = true;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = rebuilt[rebuilt.length - 1]!;
      const b = pts[i + 1]!;
      if (Math.abs(b.x - a.x) <= EPS || Math.abs(b.y - a.y) <= EPS) {
        rebuilt.push(b);
        continue;
      }
      // Choose side-aware orthogonal elbow candidates so EAST->WEST never arrives vertically!
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const sSide = srcInfo ? inferContactSide(pts[0]!, srcInfo.frame) : 'EAST';
      const eSide = tgtInfo ? inferContactSide(pts[pts.length - 1]!, tgtInfo.frame) : 'WEST';
      const horizFlow = (sSide === 'EAST' || sSide === 'WEST') && (eSide === 'EAST' || eSide === 'WEST');
      const vertFlow = (sSide === 'NORTH' || sSide === 'SOUTH') && (eSide === 'NORTH' || eSide === 'SOUTH');
      const legCandidates: Point[][] = horizFlow
        ? [
          [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b],
          [a, { x: a.x, y: my }, { x: b.x, y: my }, b],
        ]
        : vertFlow
          ? [
            [a, { x: a.x, y: my }, { x: b.x, y: my }, b],
            [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b],
          ]
          : [
            [a, { x: b.x, y: a.y }, b],
            [a, { x: a.x, y: b.y }, b],
            [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b],
            [a, { x: a.x, y: my }, { x: b.x, y: my }, b],
          ];
      let chosen: Point[] | undefined;
      for (const cand of legCandidates) {
        if (!pathHitsObstacles(cand, boxes)) { chosen = cand; break; }
      }
      if (chosen) {
        rebuilt.push(...chosen.slice(1));
      } else {
        ok = false;
        break;
      }
    }
    if (ok && isPathOrthogonal(rebuilt)) {
      setRoutePoints(route, rebuilt);
    } else if (srcInfo && tgtInfo) {
      const sSide = inferContactSide(pts[0]!, srcInfo.frame);
      const eSide = inferContactSide(pts[pts.length - 1]!, tgtInfo.frame);
      const routed = routeOrthogonalPair(edge, pts[0]!, sSide, pts[pts.length - 1]!, eSide, boxes, libObstacles, allRouteSegments(ctx.routes));
      if (routed) setRoutePoints(route, routed);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase B2 (Stage 4): Strict Arrowhead Normal Approach & Caption-Safe
  //                     Departure Repair (DRQ-16, DRQ-17b)
  // Guarantees every target arrowhead approaches strictly inward along the target
  // glyph face normal (with >= 8 px final segment), never enters/leaves through
  // the bottom caption zone of a bottom-captioned icon.
  // ---------------------------------------------------------------------------
  const containers = collectContainers(ctx.rects, ctx.nodeInfo);
  const containerCaptionBoxes: Rect0211[] = [];
  for (const [id] of ctx.rects) {
    const info = ctx.nodeInfo(id);
    if (info?.isContainer && info.captionBox && info.captionBox.width > 0 && info.captionBox.height > 0) {
      containerCaptionBoxes.push(info.captionBox);
    }
  }
  for (let b2Pass = 0; b2Pass < 2; b2Pass++) {
  let anyB2Changed = false;
  for (const route of ctx.routes) {
    const edge = edgeById.get(route.id);
    if (!editable(edge)) continue;
    const pts = sectionPoints(route.sections);
    if (pts.length < 2) continue;
    const srcInfo = ctx.nodeInfo(edge.source);
    const tgtInfo = ctx.nodeInfo(edge.target);
    if (!srcInfo || !tgtInfo || tgtInfo.isContainer) continue;

    const prev = pts[pts.length - 2]!;
    const end = pts[pts.length - 1]!;
    const check = isInwardApproach(prev, end, tgtInfo.frame);
    const tooShort = check.len < 8 && pts.length >= 3;
    const freeSource = !edge.sourcePort && !ctx.isFixedPort(edge.source, edge.sourcePort);
    const freeTarget = !edge.targetPort && !ctx.isFixedPort(edge.target, edge.targetPort);
    const sDx0 = pts[1]!.x - pts[0]!.x;
    const sDy0 = pts[1]!.y - pts[0]!.y;
    const srcSide0: PortSide = srcInfo.shapeId === 'actor'
      ? (Math.abs(sDx0) >= Math.abs(sDy0) ? (sDx0 >= 0 ? 'EAST' : 'WEST') : (sDy0 >= 0 ? 'SOUTH' : 'NORTH'))
      : inferContactSide(pts[0]!, srcInfo.frame);
    const captionBelowGlyph = Boolean(srcInfo.captionBox && srcInfo.captionBox.y >= srcInfo.frame.y + srcInfo.frame.height - 2);
    const captionRightOfSrc = Boolean(srcInfo.captionBox && srcInfo.captionBox.x >= srcInfo.frame.x + srcInfo.frame.width - 2);
    const captionRightOfTgt = Boolean(tgtInfo.captionBox && tgtInfo.captionBox.x >= tgtInfo.frame.x + tgtInfo.frame.width - 2);
    const badSrcCaptionSouth = freeSource && ((srcInfo.hasBottomCaption && srcSide0 === 'SOUTH' && captionBelowGlyph
      && (ctx.direction === 'DOWN' || ctx.direction === 'UP'))
      || (srcInfo.hasRightCaption && srcSide0 === 'EAST' && captionRightOfSrc));
    const badCaptionSouth = freeTarget && ((tgtInfo.hasBottomCaption && check.side === 'SOUTH'
      && (ctx.direction === 'RIGHT' || ctx.direction === 'LEFT'))
      || (tgtInfo.hasRightCaption && check.side === 'EAST' && captionRightOfTgt));
    // Repair collisions with every body and caption before final validation
    // can replace the route without the batch port/corridor safeguards.
    const hitsObstacle = pathHitsObstacles(pts, collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo).boxes, 1.0);
    const reentersOwn = pathReentersEndNodes(pts, srcInfo.frame, tgtInfo.frame);
    const fS = srcInfo.frame;
    const horizFlow = ctx.direction === 'RIGHT' || ctx.direction === 'LEFT';
    const flowSign = ctx.direction === 'RIGHT' || ctx.direction === 'DOWN' ? 1 : -1;
    const primaryOutSide: PortSide = ctx.direction === 'RIGHT' ? 'EAST'
      : ctx.direction === 'LEFT' ? 'WEST'
        : ctx.direction === 'DOWN' ? 'SOUTH' : 'NORTH';
    const dxCenter0 = (tgtInfo.frame.x + tgtInfo.frame.width / 2) - (fS.x + fS.width / 2);
    const dyCenter0 = (tgtInfo.frame.y + tgtInfo.frame.height / 2) - (fS.y + fS.height / 2);
    const alignedAheadOnSpine = horizFlow
      ? (dxCenter0 * flowSign > 10 && Math.abs(dyCenter0) <= 12)
      : (dyCenter0 * flowSign > 10 && Math.abs(dxCenter0) <= 12);
    const backwardFromSrc = horizFlow ? (dxCenter0 * flowSign < -10) : (dyCenter0 * flowSign < -10);
    // For a diamond skip-edge whose target is directly ahead on the spine (dx~0 in DOWN)
    // but blocked by an intermediate spine node, exiting WEST while routing down EAST creates a crossing.
    const badDiamondSkipSide = freeSource && srcInfo.shapeId === 'diamond' && alignedAheadOnSpine
      && srcSide0 !== 'EAST' && !horizFlow
      && pts.some((p) => p.x > fS.x + fS.width + 6);
    const badDiamondBackExit = freeSource && srcInfo.shapeId === 'diamond' && backwardFromSrc && srcSide0 === primaryOutSide;
    // Check if an aligned-ahead direct spine edge from a diamond exited sideways when straight is clear.
    const badDiamondSpineExit = freeSource && srcInfo.shapeId === 'diamond' && alignedAheadOnSpine && srcSide0 !== primaryOutSide && (() => {
      const tip = primaryOutSide === 'EAST' ? { x: fS.x + fS.width, y: fS.y + fS.height / 2 }
        : primaryOutSide === 'WEST' ? { x: fS.x, y: fS.y + fS.height / 2 }
          : primaryOutSide === 'SOUTH' ? { x: fS.x + fS.width / 2, y: fS.y + fS.height }
            : { x: fS.x + fS.width / 2, y: fS.y };
      const tgtTip = primaryOutSide === 'EAST' ? { x: tgtInfo.frame.x, y: tgtInfo.frame.y + tgtInfo.frame.height / 2 }
        : primaryOutSide === 'WEST' ? { x: tgtInfo.frame.x + tgtInfo.frame.width, y: tgtInfo.frame.y + tgtInfo.frame.height / 2 }
          : primaryOutSide === 'SOUTH' ? { x: tgtInfo.frame.x + tgtInfo.frame.width / 2, y: tgtInfo.frame.y }
            : { x: tgtInfo.frame.x + tgtInfo.frame.width / 2, y: tgtInfo.frame.y + tgtInfo.frame.height };
      const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      return !pathHitsObstacles([tip, tgtTip], boxes, 2);
    })();
    const isDirectStraightSpine = alignedAheadOnSpine && pts.length === 2;
    const collidingDiamondSource = freeSource && srcInfo.shapeId === 'diamond' && !isDirectStraightSpine && ctx.routes.some((other) => {
      if (other.id === route.id) return false;
      const oe = edgeById.get(other.id);
      if (!oe) return false;
      const opts = sectionPoints(other.sections);
      if (opts.length < 2) return false;
      if (oe.source === edge.source && Math.hypot(opts[0]!.x - pts[0]!.x, opts[0]!.y - pts[0]!.y) < 10) return true;
      if (oe.target === edge.source && Math.hypot(opts[opts.length - 1]!.x - pts[0]!.x, opts[opts.length - 1]!.y - pts[0]!.y) < 10) return true;
      return false;
    });
    const offDiamondSource = (freeSource && srcInfo.shapeId === 'diamond' && Math.min(
      Math.hypot(pts[0]!.x - (fS.x + fS.width / 2), pts[0]!.y - fS.y),
      Math.hypot(pts[0]!.x - (fS.x + fS.width / 2), pts[0]!.y - (fS.y + fS.height)),
      Math.hypot(pts[0]!.x - fS.x, pts[0]!.y - (fS.y + fS.height / 2)),
      Math.hypot(pts[0]!.x - (fS.x + fS.width), pts[0]!.y - (fS.y + fS.height / 2)),
    ) > 2.5) || badDiamondBackExit || badDiamondSpineExit || badDiamondSkipSide || collidingDiamondSource;
    const fT = tgtInfo.frame;
    const offDiamondVertex = freeTarget && tgtInfo.shapeId === 'diamond' && Math.min(
      Math.hypot(end.x - (fT.x + fT.width / 2), end.y - fT.y),
      Math.hypot(end.x - (fT.x + fT.width / 2), end.y - (fT.y + fT.height)),
      Math.hypot(end.x - fT.x, end.y - (fT.y + fT.height / 2)),
      Math.hypot(end.x - (fT.x + fT.width), end.y - (fT.y + fT.height / 2)),
    ) > 2.5;
    const collidingDiamondTarget = freeTarget && tgtInfo.shapeId === 'diamond' && ctx.routes.some((other) => {
      if (other.id === route.id) return false;
      const oe = edgeById.get(other.id);
      if (!oe) return false;
      const opts = sectionPoints(other.sections);
      if (opts.length < 2) return false;
      if (oe.target === edge.target && Math.hypot(opts[opts.length - 1]!.x - end.x, opts[opts.length - 1]!.y - end.y) < 10) return true;
      if (oe.source === edge.target && Math.hypot(opts[0]!.x - end.x, opts[0]!.y - end.y) < 10) return true;
      return false;
    });
    if (check.ok && !tooShort && !badCaptionSouth && !badSrcCaptionSouth && !hitsObstacle && !reentersOwn && !offDiamondVertex && !offDiamondSource && !collidingDiamondTarget) continue;

    const srcCx = srcInfo.frame.x + srcInfo.frame.width / 2;
    const srcCy = srcInfo.frame.y + srcInfo.frame.height / 2;
    const tgtCx = tgtInfo.frame.x + tgtInfo.frame.width / 2;
    const tgtCy = tgtInfo.frame.y + tgtInfo.frame.height / 2;
    const dxCenter = tgtCx - srcCx;
    const dyCenter = tgtCy - srcCy;

    let wantedSide: PortSide = check.side;
    if (freeTarget && (!check.ok || badCaptionSouth)) {
      if (ctx.direction === 'RIGHT' && dxCenter > 10) wantedSide = 'WEST';
      else if (ctx.direction === 'LEFT' && dxCenter < -10) wantedSide = 'EAST';
      else if (ctx.direction === 'DOWN' && dyCenter > 10) wantedSide = 'NORTH';
      else if (ctx.direction === 'UP' && dyCenter < -10) wantedSide = tgtInfo.hasBottomCaption ? (dxCenter >= 0 ? 'WEST' : 'EAST') : 'SOUTH';
      else if (Math.abs(dxCenter) >= Math.abs(dyCenter)) wantedSide = dxCenter >= 0 ? 'WEST' : 'EAST';
      else wantedSide = (dyCenter >= 0 || tgtInfo.hasBottomCaption) ? 'NORTH' : 'SOUTH';
    }

    const wantedHoriz = wantedSide === 'NORTH' || wantedSide === 'SOUTH';
    const lo = wantedHoriz ? tgtInfo.frame.x + 8 : tgtInfo.frame.y + 8;
    const hi = wantedHoriz ? tgtInfo.frame.x + tgtInfo.frame.width - 8 : tgtInfo.frame.y + tgtInfo.frame.height - 8;
    const mid = wantedHoriz ? tgtCx : tgtCy;

    // Collect existing target contacts on wantedSide so we never collide with another edge's port.
    const usedCoords: number[] = [];
    for (const other of ctx.routes) {
      if (other.id === route.id) continue;
      const oe = edgeById.get(other.id);
      if (!oe) continue;
      const opts = sectionPoints(other.sections);
      if (opts.length < 2) continue;
      if (oe.target === edge.target) {
        const op = opts[opts.length - 1]!;
        if (inferContactSide(op, tgtInfo.frame) === wantedSide) usedCoords.push(wantedHoriz ? op.x : op.y);
      }
      if (oe.source === edge.target) {
        const op = opts[0]!;
        if (inferContactSide(op, tgtInfo.frame) === wantedSide) usedCoords.push(wantedHoriz ? op.x : op.y);
      }
    }

    let newEnd = end;
    if (freeTarget && (!check.ok || tooShort || badCaptionSouth || reentersOwn || offDiamondVertex || collidingDiamondTarget)) {
      if (tgtInfo.shapeId === 'diamond') {
        const usedSides = new Set<PortSide>();
        const usedTargetPts: Point[] = [];
        for (const other of ctx.routes) {
          if (other.id === route.id) continue;
          const oe = edgeById.get(other.id);
          if (!oe) continue;
          const opts = sectionPoints(other.sections);
          if (opts.length < 2) continue;
          if (oe.target === edge.target) {
            usedSides.add(inferContactSide(opts[opts.length - 1]!, tgtInfo.frame));
            usedTargetPts.push(opts[opts.length - 1]!);
          }
          if (oe.source === edge.target) {
            usedSides.add(inferContactSide(opts[0]!, tgtInfo.frame));
            usedTargetPts.push(opts[0]!);
          }
        }
        const preferredOrder: PortSide[] = [
          wantedSide,
          ...(dyCenter >= 0 ? (['NORTH', 'WEST', 'EAST'] as const) : (['SOUTH', 'WEST', 'EAST'] as const)),
          'NORTH', 'WEST', 'EAST',
          ...(tgtInfo.hasBottomCaption ? [] : (['SOUTH'] as const)),
        ];
        const freeSide = preferredOrder.find((s) => !usedSides.has(s) && !(tgtInfo.hasBottomCaption && s === 'SOUTH'));
        const f = tgtInfo.frame;
        if (freeSide) {
          wantedSide = freeSide;
          newEnd = freeSide === 'NORTH' ? { x: f.x + f.width / 2, y: f.y }
            : freeSide === 'SOUTH' ? { x: f.x + f.width / 2, y: f.y + f.height }
            : freeSide === 'WEST' ? { x: f.x, y: f.y + f.height / 2 }
            : { x: f.x + f.width, y: f.y + f.height / 2 };
        } else {
          // Degree > 4 diamond: all 4 cardinal vertices are occupied; pick a clear sloped shoulder >= 13 px from all other contacts.
          const shoulders: Array<{ side: PortSide; pt: Point }> = [
            { side: 'NORTH', pt: { x: f.x + f.width * 0.34, y: f.y + f.height * 0.16 } },
            { side: 'NORTH', pt: { x: f.x + f.width * 0.66, y: f.y + f.height * 0.16 } },
            { side: 'SOUTH', pt: { x: f.x + f.width * 0.34, y: f.y + f.height * 0.84 } },
            { side: 'SOUTH', pt: { x: f.x + f.width * 0.66, y: f.y + f.height * 0.84 } },
          ];
          const bestShoulder = shoulders
            .filter((cand) => usedTargetPts.every((u) => Math.hypot(u.x - cand.pt.x, u.y - cand.pt.y) >= 13))
            .sort((a, b) => Math.hypot(a.pt.x - srcCx, a.pt.y - srcCy) - Math.hypot(b.pt.x - srcCx, b.pt.y - srcCy))[0];
          if (bestShoulder) {
            wantedSide = bestShoulder.side;
            newEnd = bestShoulder.pt;
          }
        }
      } else {
        const candidateAlongs = [mid, mid - 14, mid + 14, mid - 26, mid + 26]
          .filter((v) => v >= lo - 2 && v <= hi + 2);
        const chosenAlong = candidateAlongs.find((v) => usedCoords.every((u) => Math.abs(u - v) >= 11)) ?? mid;
        newEnd = ctx.contourContact?.(edge.target, wantedSide, chosenAlong)
          ?? (wantedHoriz
            ? { x: chosenAlong, y: wantedSide === 'NORTH' ? tgtInfo.frame.y : tgtInfo.frame.y + tgtInfo.frame.height }
            : { x: wantedSide === 'WEST' ? tgtInfo.frame.x : tgtInfo.frame.x + tgtInfo.frame.width, y: chosenAlong });
      }
    }

    // Determine source contact & departure side (evacuate SOUTH on bottom-captioned icons when hitting caption).
    let newStart = pts[0]!;
    let startSide: PortSide;
    if (badSrcCaptionSouth) {
      if (srcInfo.hasRightCaption && srcSide0 === 'EAST') {
        startSide = ctx.direction === 'DOWN' ? 'SOUTH' : ctx.direction === 'UP' ? 'NORTH' : 'WEST';
        const along = startSide === 'NORTH' || startSide === 'SOUTH' ? srcCx : srcCy;
        newStart = ctx.contourContact?.(edge.source, startSide, along)
          ?? (startSide === 'SOUTH' ? { x: srcCx, y: srcInfo.frame.y + srcInfo.frame.height }
            : startSide === 'NORTH' ? { x: srcCx, y: srcInfo.frame.y }
              : { x: srcInfo.frame.x, y: srcCy });
      } else {
        startSide = dxCenter >= 0 ? 'EAST' : 'WEST';
        newStart = ctx.contourContact?.(edge.source, startSide, srcCy)
          ?? { x: startSide === 'EAST' ? srcInfo.frame.x + srcInfo.frame.width : srcInfo.frame.x, y: srcCy };
      }
    } else if (offDiamondSource) {
      const usedSrcSides = new Set<PortSide>();
      for (const other of ctx.routes) {
        if (other.id === route.id) continue;
        const oe = edgeById.get(other.id);
        if (!oe) continue;
        const opts = sectionPoints(other.sections);
        if (opts.length < 2) continue;
        if (oe.source === edge.source) usedSrcSides.add(inferContactSide(opts[0]!, srcInfo.frame));
        if (oe.target === edge.source) usedSrcSides.add(inferContactSide(opts[opts.length - 1]!, srcInfo.frame));
      }
      const alignedWithFlow = horizFlow ? Math.abs(dyCenter) <= 18 : Math.abs(dxCenter) <= 18;
      const routeBendsPos = horizFlow
        ? pts.some((p) => p.y > fS.y + fS.height - 2)
        : pts.some((p) => p.x > fS.x + fS.width - 2);
      const sideTowardTarget: PortSide = horizFlow
        ? ((collidingDiamondSource && Math.abs(dyCenter) <= 18)
          ? (routeBendsPos ? 'SOUTH' : 'NORTH')
          : (dyCenter <= 0 ? 'NORTH' : 'SOUTH'))
        : ((collidingDiamondSource && Math.abs(dxCenter) <= 18)
          ? (routeBendsPos ? 'EAST' : 'WEST')
          : (dxCenter <= 0 ? 'WEST' : 'EAST'));
      const otherSide: PortSide = sideTowardTarget === 'NORTH' ? 'SOUTH'
        : sideTowardTarget === 'SOUTH' ? 'NORTH'
          : sideTowardTarget === 'WEST' ? 'EAST' : 'WEST';
      const preferredOrder: PortSide[] = collidingDiamondSource
        ? [sideTowardTarget, otherSide, primaryOutSide]
        : badDiamondSkipSide
          ? ['EAST', 'WEST', primaryOutSide]
          : badDiamondBackExit
            ? (horizFlow ? ['SOUTH', 'NORTH', 'WEST'] : ['WEST', 'EAST', 'NORTH'])
            : badDiamondSpineExit
              ? [primaryOutSide, sideTowardTarget, otherSide]
              : alignedWithFlow
                ? [primaryOutSide, sideTowardTarget, otherSide]
                : [sideTowardTarget, primaryOutSide, otherSide];
      startSide = (badDiamondSpineExit
        ? primaryOutSide
        : preferredOrder.find((s) => !usedSrcSides.has(s) && !(srcInfo.hasBottomCaption && s === 'SOUTH') && !(srcInfo.hasRightCaption && s === 'EAST')))
        ?? preferredOrder[0]!;
      newStart = startSide === 'NORTH' ? { x: fS.x + fS.width / 2, y: fS.y }
        : startSide === 'SOUTH' ? { x: fS.x + fS.width / 2, y: fS.y + fS.height }
          : startSide === 'WEST' ? { x: fS.x, y: fS.y + fS.height / 2 }
            : { x: fS.x + fS.width, y: fS.y + fS.height / 2 };
    } else if (reentersOwn) {
      startSide = srcSide0;
    } else {
      const sDx = pts[1]!.x - pts[0]!.x;
      const sDy = pts[1]!.y - pts[0]!.y;
      startSide = Math.abs(sDx) >= Math.abs(sDy)
        ? (sDx >= 0 ? 'EAST' : 'WEST')
        : (sDy >= 0 ? 'SOUTH' : 'NORTH');
    }
    const { boxes, libObstacles, srcFrame, tgtFrame } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
    const existingSegs = allRouteSegments(ctx.routes);
    const tryRoute = (mode: 'both' | 'target') => {
      const routed = routeOrthogonalPair(edge, newStart, startSide, newEnd, wantedSide, boxes, libObstacles, existingSegs, mode, srcFrame, tgtFrame);
      if (!routed || routed.length < 2) return undefined;
      const chk = isInwardApproach(routed[routed.length - 2]!, routed[routed.length - 1]!, tgtInfo.frame);
      if (chk.ok && (chk.len >= 6.5 || routed.length === 2)) return routed;
      return undefined;
    };
    const fixed = tryRoute('both') ?? tryRoute('target');
    if (fixed) {
      setRoutePoints(route, fixed);
      anyB2Changed = true;
    } else if (hitsObstacle) {
      // Fallback: shift any interior segment crossing a container caption cleanly outside the caption box.
      const shifted = pts.map((p) => ({ ...p }));
      let okShift = false;
      for (let si = 1; si < shifted.length - 2; si++) {
        const a = shifted[si]!, b = shifted[si + 1]!;
        const hitCap = containerCaptionBoxes.find((cap) => pathHitsObstacles([a, b], [cap], 2));
        if (!hitCap) continue;
        const isH = Math.abs(a.y - b.y) <= EPS;
        const isV = Math.abs(a.x - b.x) <= EPS;
        if (!isH && !isV) continue;
        const cands = isH
          ? [hitCap.y - 16, hitCap.y - 24, hitCap.y + hitCap.height + 16, hitCap.y + hitCap.height + 24]
          : [hitCap.x - 16, hitCap.x - 24, hitCap.x + hitCap.width + 16, hitCap.x + hitCap.width + 24];
        for (const c of cands) {
          const trial = shifted.map((p) => ({ ...p }));
          if (isH) { trial[si]!.y = c; trial[si + 1]!.y = c; }
          else { trial[si]!.x = c; trial[si + 1]!.x = c; }
          const comp = compactOrthogonal(trial);
          if (isPathOrthogonal(comp) && !pathHitsObstacles(comp, boxes, 1) && !pathHitsObstacles(comp, containerCaptionBoxes, 2)) {
            setRoutePoints(route, comp);
            anyB2Changed = true;
            okShift = true;
            break;
          }
        }
        if (okShift) break;
      }
    }
  }
  if (!anyB2Changed) break;
  }

  // ---------------------------------------------------------------------------
  // Phase C (Stage 4): Crossing-minimizing parallel corridor spacing & overlap
  //                    elimination
  // ---------------------------------------------------------------------------
  interface CorridorSeg {
    routeIdx: number;
    edge: GraphEdge;
    pts: Point[];
    segIdx: number;
    orientation: 'H' | 'V';
    coord: number;
    min: number;
    max: number;
    interior: boolean;
    planarKey: number;
  }

  for (let pass = 0; pass < 2; pass++) {
    const routePts = ctx.routes.map((r) => sectionPoints(r.sections));
    let anyMoved = false;

    for (const orientation of ['H', 'V'] as const) {
      const segs: CorridorSeg[] = [];
      for (let rIdx = 0; rIdx < ctx.routes.length; rIdx++) {
        const edge = edgeById.get(ctx.routes[rIdx]!.id);
        if (!editable(edge)) continue;
        const pts = routePts[rIdx]!;
        for (let sIdx = 0; sIdx < pts.length - 1; sIdx++) {
          const a = pts[sIdx]!, b = pts[sIdx + 1]!;
          const isH = Math.abs(a.y - b.y) <= EPS;
          const isV = Math.abs(a.x - b.x) <= EPS;
          if (orientation === 'H' && !isH) continue;
          if (orientation === 'V' && !isV) continue;
          const coord = orientation === 'H' ? a.y : a.x;
          const min = orientation === 'H' ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
          const max = orientation === 'H' ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
          if (max - min <= 1) continue;
          const interior = sIdx > 0 && sIdx < pts.length - 2;
          const adj: number[] = [];
          if (sIdx > 0) adj.push(orientation === 'H' ? pts[sIdx - 1]!.y : pts[sIdx - 1]!.x);
          if (sIdx + 2 < pts.length) adj.push(orientation === 'H' ? pts[sIdx + 2]!.y : pts[sIdx + 2]!.x);
          const planarKey = adj.length ? adj.reduce((s, v) => s + v, 0) / adj.length : coord;
          segs.push({ routeIdx: rIdx, edge, pts, segIdx: sIdx, orientation, coord, min, max, interior, planarKey });
        }
      }

      if (segs.length <= 1) continue;
      const visited = new Uint8Array(segs.length);

      for (let i = 0; i < segs.length; i++) {
        if (visited[i]) continue;
        const comp: CorridorSeg[] = [];
        const q = [i];
        visited[i] = 1;
        while (q.length) {
          const cur = segs[q.pop()!]!;
          comp.push(cur);
          for (let j = 0; j < segs.length; j++) {
            if (visited[j]) continue;
            const cand = segs[j]!;
            if (cand.routeIdx === cur.routeIdx) continue;
            if (Math.abs(cand.coord - cur.coord) < MIN_CORRIDOR_GAP - 0.1
              && cand.min < cur.max - 1 && cand.max > cur.min + 1) {
              visited[j] = 1;
              q.push(j);
            }
          }
        }

        // Deduplicate per route (prefer interior segments).
        const byRoute = new Map<number, CorridorSeg>();
        for (const s of comp) {
          const prev = byRoute.get(s.routeIdx);
          if (!prev || (!prev.interior && s.interior)) byRoute.set(s.routeIdx, s);
        }
        const group = [...byRoute.values()];
        if (group.length <= 1) continue;

        // Check if any pair actually violates MIN_CORRIDOR_GAP.
        const sortedCoords = group.map((g) => g.coord).sort((a, b) => a - b);
        let crowded = false;
        for (let k = 1; k < sortedCoords.length; k++) {
          if (sortedCoords[k]! - sortedCoords[k - 1]! < MIN_CORRIDOR_GAP - 0.1) { crowded = true; break; }
        }
        if (!crowded) continue;

        // Sort planarly as initial baseline ordering.
        group.sort((a, b) => (a.planarKey - b.planarKey) || (a.coord - b.coord) || a.edge.id.localeCompare(b.edge.id));
        const movable = group.filter((g) => g.interior);
        if (!movable.length) continue;

        const groupRouteSet = new Set(group.map((g) => g.routeIdx));
        const boxesByRoute = new Map(group.map((g) => [g.routeIdx, collectObstaclesFor(g.edge, ctx.rects, ctx.nodeInfo).boxes]));
        const center = group.reduce((sum, g) => sum + g.coord, 0) / group.length;

        const buildShifted = (s: CorridorSeg, targetCoord: number): Point[] | undefined => {
          if (!s.interior) return s.pts;
          const cloned = s.pts.map((p) => ({ ...p }));
          if (orientation === 'H') {
            cloned[s.segIdx]!.y = targetCoord;
            cloned[s.segIdx + 1]!.y = targetCoord;
          } else {
            cloned[s.segIdx]!.x = targetCoord;
            cloned[s.segIdx + 1]!.x = targetCoord;
          }
          const boxes = boxesByRoute.get(s.routeIdx)!;
          const comp = compactOrthogonal(cloned);
          const srcInfo = ctx.nodeInfo(s.edge.source);
          const tgtInfo = ctx.nodeInfo(s.edge.target);
          if (!isPathOrthogonal(comp) || pathHitsObstacles(comp, boxes, 1)
            || pathReentersEndNodes(comp, srcInfo?.frame, tgtInfo?.frame)) return undefined;
          if (tgtInfo && comp.length >= 2) {
            const chk = isInwardApproach(comp[comp.length - 2]!, comp[comp.length - 1]!, tgtInfo.frame);
            if (!chk.ok || (comp.length >= 3 && chk.len < 6.5)) return undefined;
          }
          return comp;
        };

        const evalOrdering = (ordered: CorridorSeg[], spacing: number, centerOffset = 0): {
          proposals: Array<{ seg: CorridorSeg; nextPts: Point[] }>;
          score: number;
        } | undefined => {
          const total = (ordered.length - 1) * spacing;
          const shiftedCenter = center + centerOffset;
          const proposals: Array<{ seg: CorridorSeg; nextPts: Point[] }> = [];
          const candPts: Point[][] = [];
          for (let k = 0; k < ordered.length; k++) {
            const s = ordered[k]!;
            const targetCoord = shiftedCenter - total / 2 + k * spacing;
            const nextPts = buildShifted(s, targetCoord);
            if (!nextPts) return undefined;
            candPts.push(nextPts);
            if (s.interior && Math.abs(targetCoord - s.coord) > 0.25) {
              proposals.push({ seg: s, nextPts });
            }
          }
          if (!proposals.length) return undefined;
          let internalCross = 0;
          let externalCross = 0;
          let overlapHits = 0;
          let borderHugs = 0;
          for (let a = 0; a < candPts.length; a++) {
            borderHugs += pathBorderHugCount(candPts[a]!, containers);
            for (let b = a + 1; b < candPts.length; b++) {
              internalCross += countOrthogonalCrossings(candPts[a]!, candPts[b]!);
              if (hasCollinearOverlap(candPts[a]!, candPts[b]!)) overlapHits++;
            }
            for (let rIdx = 0; rIdx < routePts.length; rIdx++) {
              if (groupRouteSet.has(rIdx)) continue;
              externalCross += countOrthogonalCrossings(candPts[a]!, routePts[rIdx]!);
              if (hasCollinearOverlap(candPts[a]!, routePts[rIdx]!)) overlapHits++;
            }
          }
          const score = overlapHits * 5000 + internalCross * 1000 + externalCross * 250 + borderHugs * 400 + Math.abs(centerOffset) * 0.5;
          return { proposals, score };
        };

        for (const spacing of [TARGET_CORRIDOR_GAP, MIN_CORRIDOR_GAP]) {
          // For clusters up to 4 routes, evaluate all exact rail orderings to pick the crossing-free one.
          // Also try asymmetric center shifts when an adjacent obstacle crowds one side of the corridor.
          const orderings: CorridorSeg[][] = group.length <= 4 ? permutations(group) : [group];
          const centerOffsets = [0, -spacing, spacing, -spacing * 2, spacing * 2];
          let bestResult: { proposals: Array<{ seg: CorridorSeg; nextPts: Point[] }>; score: number } | undefined;
          for (const cOff of centerOffsets) {
            for (const ord of orderings) {
              const res = evalOrdering(ord, spacing, cOff);
              if (res && (!bestResult || res.score < bestResult.score)) {
                bestResult = res;
                if (res.score < 50) break;
              }
            }
            if (bestResult && bestResult.score < 50) break;
          }
          if (bestResult) {
            for (const { seg, nextPts } of bestResult.proposals) {
              setRoutePoints(ctx.routes[seg.routeIdx]!, nextPts);
              routePts[seg.routeIdx] = sectionPoints(ctx.routes[seg.routeIdx]!.sections);
              anyMoved = true;
            }
            break;
          }
        }
      }
    }

    if (!anyMoved) break;
  }

  // ---------------------------------------------------------------------------
  // Phase C1 (Stage 4): Pairwise interior rail uncrossing
  // Eliminates avoidable crossings between routes whose interior parallel rails
  // are already spaced >= 12 px apart (so Phase C did not cluster them) by
  // testing rail swaps and +/- 14 px lane shifts that strictly reduce crossings.
  // ---------------------------------------------------------------------------
  for (let uPass = 0; uPass < 2; uPass++) {
    const routePts = ctx.routes.map((r) => sectionPoints(r.sections));
    let uncrossed = false;

    const totalCrossingsFor = (rIdx: number, pts: readonly Point[], overrideIdx = -1, overridePts?: readonly Point[]): number => {
      let c = 0;
      for (let k = 0; k < routePts.length; k++) {
        if (k === rIdx) continue;
        const other = k === overrideIdx && overridePts ? overridePts : routePts[k]!;
        c += countOrthogonalCrossings(pts, other);
      }
      return c;
    };

    const overlapsAnyOther = (rIdx: number, pts: readonly Point[], overrideIdx = -1, overridePts?: readonly Point[]): boolean => {
      for (let k = 0; k < routePts.length; k++) {
        if (k === rIdx) continue;
        const other = k === overrideIdx && overridePts ? overridePts : routePts[k]!;
        if (hasCollinearOverlap(pts, other, 3.5)) return true;
      }
      return false;
    };

    for (let i = 0; i < ctx.routes.length; i++) {
      const e1 = edgeById.get(ctx.routes[i]!.id);
      if (!editable(e1)) continue;
      for (let j = i + 1; j < ctx.routes.length; j++) {
        const e2 = edgeById.get(ctx.routes[j]!.id);
        if (!editable(e2)) continue;
        const p1 = routePts[i]!;
        const p2 = routePts[j]!;
        if (countOrthogonalCrossings(p1, p2) === 0) continue;

        const baseCross = totalCrossingsFor(i, p1) + totalCrossingsFor(j, p2) - countOrthogonalCrossings(p1, p2);
        const baseHugs = pathBorderHugCount(p1, containers) + pathBorderHugCount(p2, containers);
        const { boxes: b1 } = collectObstaclesFor(e1, ctx.rects, ctx.nodeInfo);
        const { boxes: b2 } = collectObstaclesFor(e2, ctx.rects, ctx.nodeInfo);

        let bestPair: { next1: Point[]; next2: Point[]; cross: number } | undefined;

        const interiorSegs = (pts: Point[]) => {
          const out: Array<{ idx: number; orient: 'H' | 'V'; coord: number }> = [];
          for (let s = 1; s < pts.length - 2; s++) {
            const a = pts[s]!, b = pts[s + 1]!;
            if (Math.abs(a.y - b.y) <= EPS) out.push({ idx: s, orient: 'H', coord: a.y });
            else if (Math.abs(a.x - b.x) <= EPS) out.push({ idx: s, orient: 'V', coord: a.x });
          }
          return out;
        };

        const shiftSeg = (pts: Point[], segIdx: number, orient: 'H' | 'V', newCoord: number, boxes: readonly Rect0211[]): Point[] | undefined => {
          const next = pts.map((p) => ({ ...p }));
          if (orient === 'H') {
            next[segIdx]!.y = newCoord;
            next[segIdx + 1]!.y = newCoord;
          } else {
            next[segIdx]!.x = newCoord;
            next[segIdx + 1]!.x = newCoord;
          }
          const comp = compactOrthogonal(next);
          const curEdge = pts === p1 ? e1 : e2;
          const srcInfo = ctx.nodeInfo(curEdge.source);
          const tgtInfo = ctx.nodeInfo(curEdge.target);
          if (!isPathOrthogonal(comp) || pathHitsObstacles(comp, boxes, 1)
            || pathReentersEndNodes(comp, srcInfo?.frame, tgtInfo?.frame)) return undefined;
          // Preserve target normal approach direction & minimum 6.5 px terminal segment.
          if (tgtInfo && comp.length >= 2) {
            const chk = isInwardApproach(comp[comp.length - 2]!, comp[comp.length - 1]!, tgtInfo.frame);
            if (!chk.ok || (comp.length >= 3 && chk.len < 6.5)) return undefined;
          }
          return comp;
        };

        const s1List = interiorSegs(p1);
        const s2List = interiorSegs(p2);
        for (const s1 of s1List) {
          for (const s2 of s2List) {
            if (s1.orient !== s2.orient) continue;
            const tries: Array<[number, number]> = [
              [s2.coord, s1.coord],
              [s2.coord - TARGET_CORRIDOR_GAP, s2.coord],
              [s2.coord + TARGET_CORRIDOR_GAP, s2.coord],
              [s1.coord, s1.coord - TARGET_CORRIDOR_GAP],
              [s1.coord, s1.coord + TARGET_CORRIDOR_GAP],
            ];
            for (const [c1, c2] of tries) {
              const n1 = Math.abs(c1 - s1.coord) <= 0.25 ? p1 : shiftSeg(p1, s1.idx, s1.orient, c1, b1);
              if (!n1) continue;
              const n2 = Math.abs(c2 - s2.coord) <= 0.25 ? p2 : shiftSeg(p2, s2.idx, s2.orient, c2, b2);
              if (!n2) continue;
              if (overlapsAnyOther(i, n1, j, n2) || overlapsAnyOther(j, n2, i, n1)) continue;
              if (pathBorderHugCount(n1, containers) + pathBorderHugCount(n2, containers) > baseHugs) continue;
              const cross = totalCrossingsFor(i, n1, j, n2) + totalCrossingsFor(j, n2, i, n1) - countOrthogonalCrossings(n1, n2);
              if (cross < baseCross && (!bestPair || cross < bestPair.cross)) {
                bestPair = { next1: n1, next2: n2, cross };
              }
            }
          }
        }

        if (bestPair) {
          setRoutePoints(ctx.routes[i]!, bestPair.next1);
          setRoutePoints(ctx.routes[j]!, bestPair.next2);
          routePts[i] = sectionPoints(ctx.routes[i]!.sections);
          routePts[j] = sectionPoints(ctx.routes[j]!.sections);
          uncrossed = true;
        }
      }
    }

    if (!uncrossed) break;
  }

  // ---------------------------------------------------------------------------
  // Phase C1a (Stage 4): Simplify crossing routes into direct 1-bend L-routes
  // When a multi-bend route crosses another route and a direct orthogonal L
  // between its exact start & end contacts is obstacle-free and strictly lowers
  // crossings (e.g. c04 Browser E2E green? -> Tag incident & rollback), use it.
  // ---------------------------------------------------------------------------
  {
    const routePts = ctx.routes.map((r) => sectionPoints(r.sections));
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!editable(edge)) continue;
      const pts = routePts[i]!;
      if (pts.length < 4) continue;
      let curCross = 0;
      for (let k = 0; k < routePts.length; k++) {
        if (k !== i) curCross += countOrthogonalCrossings(pts, routePts[k]!);
      }
      if (curCross === 0) continue;
      const s = pts[0]!, e = pts[pts.length - 1]!;
      const srcInfo = ctx.nodeInfo(edge.source);
      const tgtInfo = ctx.nodeInfo(edge.target);
      if (!srcInfo || !tgtInfo) continue;
      const { boxes, srcFrame, tgtFrame } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      const candidates: Point[][] = [
        [s, { x: s.x, y: e.y }, e],
        [s, { x: e.x, y: s.y }, e],
      ];
      const freeTgt = !edge.targetPort && !ctx.isFixedPort(edge.target, edge.targetPort);
      const freeSrc = !edge.sourcePort && !ctx.isFixedPort(edge.source, edge.sourcePort);
      const sidePortFree = (nodeId: string, side: PortSide, pt: Point): boolean => {
        const horizS = side === 'NORTH' || side === 'SOUTH';
        const c = horizS ? pt.x : pt.y;
        const nFrame = ctx.nodeInfo(nodeId)?.frame;
        if (!nFrame) return false;
        for (let k = 0; k < routePts.length; k++) {
          if (k === i) continue;
          const oe = edgeById.get(ctx.routes[k]!.id);
          if (!oe) continue;
          const opts = routePts[k]!;
          if (opts.length < 2) continue;
          if (oe.source === nodeId && inferContactSide(opts[0]!, nFrame) === side
            && Math.abs((horizS ? opts[0]!.x : opts[0]!.y) - c) < 11) return false;
          if (oe.target === nodeId && inferContactSide(opts[opts.length - 1]!, nFrame) === side
            && Math.abs((horizS ? opts[opts.length - 1]!.x : opts[opts.length - 1]!.y) - c) < 11) return false;
        }
        return true;
      };
      // Try clean 1-bend L-route into target's perpendicular WEST/EAST face (e.g. f08 feedback loop).
      if (freeTgt && tgtInfo.shapeId !== 'diamond' && !tgtInfo.isContainer) {
        const tgtCy = tgtInfo.frame.y + tgtInfo.frame.height / 2;
        if (s.x < tgtInfo.frame.x - 12 && Math.abs(s.y - tgtCy) >= 12) {
          const wPt = ctx.contourContact?.(edge.target, 'WEST', tgtCy) ?? { x: tgtInfo.frame.x, y: tgtCy };
          if (sidePortFree(edge.target, 'WEST', wPt)) candidates.push([s, { x: s.x, y: wPt.y }, wPt]);
        } else if (s.x > tgtInfo.frame.x + tgtInfo.frame.width + 12 && !tgtInfo.hasRightCaption && Math.abs(s.y - tgtCy) >= 12) {
          const ePt = ctx.contourContact?.(edge.target, 'EAST', tgtCy) ?? { x: tgtInfo.frame.x + tgtInfo.frame.width, y: tgtCy };
          if (sidePortFree(edge.target, 'EAST', ePt)) candidates.push([s, { x: s.x, y: ePt.y }, ePt]);
        }
      }
      // For vertical-flow diamond skip-edges (e.g. f11 Item shipped? --No--> Issue card refund),
      // test routing cleanly around the open EAST or WEST corridor into the target's side face.
      const srcCx = srcInfo.frame.x + srcInfo.frame.width / 2;
      const srcCy = srcInfo.frame.y + srcInfo.frame.height / 2;
      const tgtCx = tgtInfo.frame.x + tgtInfo.frame.width / 2;
      const tgtCy = tgtInfo.frame.y + tgtInfo.frame.height / 2;
      if (freeSrc && freeTgt && srcInfo.shapeId === 'diamond' && tgtInfo.shapeId !== 'diamond'
        && (ctx.direction === 'DOWN' || ctx.direction === 'UP')
        && Math.abs(tgtCx - srcCx) <= 24 && Math.abs(tgtCy - srcCy) > 40) {
        const yLo = Math.min(srcCy, tgtCy), yHi = Math.max(srcCy, tgtCy);
        let maxSpineR = Math.max(srcInfo.frame.x + srcInfo.frame.width, tgtInfo.frame.x + tgtInfo.frame.width);
        let minSpineL = Math.min(srcInfo.frame.x, tgtInfo.frame.x);
        let eastCrowd = 0, westCrowd = 0;
        for (const b of boxes) {
          if (b.y + b.height < yLo || b.y > yHi) continue;
          const bCx = b.x + b.width / 2;
          if (Math.abs(bCx - srcCx) <= 80) {
            maxSpineR = Math.max(maxSpineR, b.x + b.width);
            minSpineL = Math.min(minSpineL, b.x);
          } else if (bCx > srcCx) {
            eastCrowd++;
          } else {
            westCrowd++;
          }
        }
        const tryOrder: Array<'EAST' | 'WEST'> = eastCrowd <= westCrowd ? ['EAST', 'WEST'] : ['WEST', 'EAST'];
        for (const side of tryOrder) {
          if (side === 'EAST' && (srcInfo.hasRightCaption || tgtInfo.hasRightCaption)) continue;
          const sPt = side === 'EAST'
            ? { x: srcInfo.frame.x + srcInfo.frame.width, y: srcCy }
            : { x: srcInfo.frame.x, y: srcCy };
          const ePt = ctx.contourContact?.(edge.target, side, tgtCy)
            ?? { x: side === 'EAST' ? tgtInfo.frame.x + tgtInfo.frame.width : tgtInfo.frame.x, y: tgtCy };
          if (!sidePortFree(edge.source, side, sPt) || !sidePortFree(edge.target, side, ePt)) continue;
          const railX = side === 'EAST' ? maxSpineR + 22 : minSpineL - 22;
          candidates.push([sPt, { x: railX, y: sPt.y }, { x: railX, y: ePt.y }, ePt]);
        }
      }
      let bestCand: Point[] | undefined;
      let bestCross = curCross;
      for (const cand of candidates) {
        const cStart = cand[0]!;
        const cEnd = cand[cand.length - 1]!;
        const cSecond = cand[1]!;
        const cPrevEnd = cand[cand.length - 2]!;
        if (Math.abs(cSecond.x - cStart.x) + Math.abs(cSecond.y - cStart.y) < 8) continue;
        if (Math.abs(cEnd.x - cPrevEnd.x) + Math.abs(cEnd.y - cPrevEnd.y) < 8) continue;
        if (!isInwardApproach(cPrevEnd, cEnd, tgtInfo.frame).ok) continue;
        if (pathHitsObstacles(cand, boxes, 2)) continue;
        if (pathReentersEndNodes(cand, srcFrame, tgtFrame)) continue;
        if (pathBorderHugCount(cand, containers, 11.5) > pathBorderHugCount(pts, containers, 11.5)) continue;
        let candCross = 0;
        let overlap = false;
        for (let k = 0; k < routePts.length; k++) {
          if (k === i) continue;
          candCross += countOrthogonalCrossings(cand, routePts[k]!);
          if (hasCollinearOverlap(cand, routePts[k]!)) { overlap = true; break; }
        }
        if (!overlap && candCross < bestCross) {
          bestCross = candCross;
          bestCand = cand;
        }
      }
      if (bestCand) {
        setRoutePoints(ctx.routes[i]!, bestCand);
        routePts[i] = bestCand;
      }
    }
    // Same-face port-slot crossing swap: if two crossing routes share the same
    // source node + exit side OR the same target node + entry side (e.g. a skip
    // edge routed below/left that was assigned the upper/right slot), swap their
    // contact points on that shared face whenever doing so strictly reduces crossings.
    for (let pass = 0; pass < 2; pass++) {
      let swappedAny = false;
      for (let i = 0; i < ctx.routes.length; i++) {
        const eA = edgeById.get(ctx.routes[i]!.id);
        if (!editable(eA)) continue;
        const pA = routePts[i]!;
        if (pA.length < 2) continue;
        for (let j = i + 1; j < ctx.routes.length; j++) {
          const eB = edgeById.get(ctx.routes[j]!.id);
          if (!editable(eB)) continue;
          const pB = routePts[j]!;
          if (pB.length < 2) continue;
          if (countOrthogonalCrossings(pA, pB) === 0) continue;

          const sharedEnds: Array<{ end: 'source' | 'target'; nodeId: string }> = [];
          if (eA.target === eB.target && !eA.targetPort && !eB.targetPort
            && !ctx.isFixedPort(eA.target, eA.targetPort) && !ctx.isFixedPort(eB.target, eB.targetPort)) {
            sharedEnds.push({ end: 'target', nodeId: eA.target });
          }
          if (eA.source === eB.source && !eA.sourcePort && !eB.sourcePort
            && !ctx.isFixedPort(eA.source, eA.sourcePort) && !ctx.isFixedPort(eB.source, eB.sourcePort)) {
            sharedEnds.push({ end: 'source', nodeId: eA.source });
          }
          let pairFixed = false;
          for (const { end, nodeId } of sharedEnds) {
            const info = ctx.nodeInfo(nodeId);
            if (!info || info.isContainer || info.shapeId === 'diamond') continue;
            const ptA = end === 'source' ? pA[0]! : pA[pA.length - 1]!;
            const ptB = end === 'source' ? pB[0]! : pB[pB.length - 1]!;
            const sideA = inferContactSide(ptA, info.frame);
            const sideB = inferContactSide(ptB, info.frame);
            if (sideA !== sideB) continue;
            const { boxes: boxesA } = collectObstaclesFor(eA, ctx.rects, ctx.nodeInfo);
            const { boxes: boxesB } = collectObstaclesFor(eB, ctx.rects, ctx.nodeInfo);
            const newA = reanchorEndpointOrthogonal(pA, end, ptB, sideA, boxesA);
            const newB = reanchorEndpointOrthogonal(pB, end, ptA, sideB, boxesB);
            if (!newA || !newB) continue;
            if (containerCaptionBoxes.length > 0 && (
              pathHitsObstacles(newA, containerCaptionBoxes, 1) || pathHitsObstacles(newB, containerCaptionBoxes, 1)
            )) continue;
            if (hasCollinearOverlap(newA, newB, 3)) continue;
            let oldCross = countOrthogonalCrossings(pA, pB);
            let newCross = countOrthogonalCrossings(newA, newB);
            let overlap = false;
            for (let k = 0; k < routePts.length; k++) {
              if (k === i || k === j) continue;
              const pk = routePts[k]!;
              oldCross += countOrthogonalCrossings(pA, pk) + countOrthogonalCrossings(pB, pk);
              newCross += countOrthogonalCrossings(newA, pk) + countOrthogonalCrossings(newB, pk);
              if (hasCollinearOverlap(newA, pk, 3) || hasCollinearOverlap(newB, pk, 3)) { overlap = true; break; }
            }
            if (!overlap && newCross < oldCross) {
              setRoutePoints(ctx.routes[i]!, newA);
              setRoutePoints(ctx.routes[j]!, newB);
              routePts[i] = newA;
              routePts[j] = newB;
              swappedAny = true;
              pairFixed = true;
              break;
            }
          }
          if (pairFixed) break;
        }
      }
      if (!swappedAny) break;
    }
    // Straighten any 4-point Z-route between aligned spine nodes whose straight target port
    // is free (e.g. f08 respond.page -> respond.mitigate, a14 mainframe -> vpn, sync -> lake).
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!editable(edge) || edge.targetPort || ctx.isFixedPort(edge.target, edge.targetPort)) continue;
      const pts = routePts[i]!;
      if (pts.length !== 4) continue;
      const srcInfo = ctx.nodeInfo(edge.source);
      const tgtInfo = ctx.nodeInfo(edge.target);
      if (!srcInfo || !tgtInfo || tgtInfo.isContainer || tgtInfo.shapeId === 'diamond') continue;
      const s = pts[0]!, e = pts[3]!;
      const vertFlow = ctx.direction === 'DOWN' || ctx.direction === 'UP';
      const sSide = inferContactSide(s, srcInfo.frame);
      const eSide = inferContactSide(e, tgtInfo.frame);
      let straightEnd: Point | undefined;
      if (vertFlow && (sSide === 'SOUTH' || sSide === 'NORTH') && (eSide === 'NORTH' || eSide === 'SOUTH')
        && s.x >= tgtInfo.frame.x + 10 && s.x <= tgtInfo.frame.x + tgtInfo.frame.width - 10) {
        const pt = ctx.contourContact?.(edge.target, eSide, s.x) ?? { x: s.x, y: e.y };
        if (Math.abs(pt.x - s.x) <= 1) straightEnd = pt;
      } else if (!vertFlow && (sSide === 'EAST' || sSide === 'WEST') && (eSide === 'WEST' || eSide === 'EAST')
        && s.y >= tgtInfo.frame.y + 8 && s.y <= tgtInfo.frame.y + tgtInfo.frame.height - 8) {
        const pt = ctx.contourContact?.(edge.target, eSide, s.y) ?? { x: e.x, y: s.y };
        if (Math.abs(pt.y - s.y) <= 1) straightEnd = pt;
      }
      if (straightEnd) {
        const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
        const cand = [s, straightEnd];
        if (pathHitsObstacles(cand, boxes, 2)) continue;
        if (containerCaptionBoxes.length > 0 && pathHitsObstacles(cand, containerCaptionBoxes, 1)) continue;
        let blocked = false;
        let oldCross = 0;
        let newCross = 0;
        const closeSiblings: number[] = [];
        for (let k = 0; k < routePts.length; k++) {
          if (k === i) continue;
          const oe = edgeById.get(ctx.routes[k]!.id);
          const opts = routePts[k]!;
          oldCross += countOrthogonalCrossings(pts, opts);
          newCross += countOrthogonalCrossings(cand, opts);
          if (hasCollinearOverlap(cand, opts, 3.5)) { blocked = true; break; }
          const endNear = oe && oe.target === edge.target && Math.hypot(opts[opts.length - 1]!.x - straightEnd.x, opts[opts.length - 1]!.y - straightEnd.y) < 11.5;
          const startNear = oe && oe.source === edge.target && Math.hypot(opts[0]!.x - straightEnd.x, opts[0]!.y - straightEnd.y) < 11.5;
          if (startNear) { blocked = true; break; }
          if (endNear) closeSiblings.push(k);
        }
        // If exactly one sibling target edge sits slightly too close (< 11.5 px) to the
        // straight center port (e.g. symmetric ±6 px split on a 2-input WEST/NORTH face),
        // nudge that sibling outward on the same face to >= 12 px so the aligned edge runs dead straight.
        if (!blocked && newCross <= oldCross && closeSiblings.length === 1) {
          const sk = closeSiblings[0]!;
          const se = edgeById.get(ctx.routes[sk]!.id);
          const spts = routePts[sk]!;
          if (editable(se) && !se.targetPort && !ctx.isFixedPort(se.target, se.targetPort) && spts.length >= 2) {
            const sEnd = spts[spts.length - 1]!;
            const sSide = inferContactSide(sEnd, tgtInfo.frame);
            if (sSide === eSide) {
              const horizFace = eSide === 'NORTH' || eSide === 'SOUTH';
              const sPrev = spts[spts.length - 2]!;
              const sApproach = spts.length >= 3 ? spts[spts.length - 3]! : sPrev;
              const prefDir = horizFace
                ? (sApproach.x >= straightEnd.x ? 1 : -1)
                : (sApproach.y >= straightEnd.y ? 1 : -1);
              const { boxes: sBoxes } = collectObstaclesFor(se, ctx.rects, ctx.nodeInfo);
              let nudged = false;
              for (const sign of [prefDir, -prefDir]) {
                const along = (horizFace ? straightEnd.x : straightEnd.y) + sign * 12;
                const lo = horizFace ? tgtInfo.frame.x + 6 : tgtInfo.frame.y + 6;
                const hi = horizFace ? tgtInfo.frame.x + tgtInfo.frame.width - 6 : tgtInfo.frame.y + tgtInfo.frame.height - 6;
                if (along < lo || along > hi) continue;
                const newSibPt = ctx.contourContact?.(se.target, sSide, along)
                  ?? (horizFace ? { x: along, y: sEnd.y } : { x: sEnd.x, y: along });
                if (Math.hypot(newSibPt.x - straightEnd.x, newSibPt.y - straightEnd.y) < 12) continue;
                const reanchored = reanchorEndpointOrthogonal(spts, 'target', newSibPt, sSide, sBoxes);
                if (!reanchored) continue;
                if (containerCaptionBoxes.length > 0 && pathHitsObstacles(reanchored, containerCaptionBoxes, 1)) continue;
                if (hasCollinearOverlap(cand, reanchored, 3) || countOrthogonalCrossings(cand, reanchored) > 0) continue;
                let sibBad = false;
                for (let m = 0; m < routePts.length; m++) {
                  if (m === i || m === sk) continue;
                  const om = edgeById.get(ctx.routes[m]!.id);
                  const mpts = routePts[m]!;
                  if (hasCollinearOverlap(reanchored, mpts, 3)) { sibBad = true; break; }
                  if (om && om.target === se.target && Math.hypot(mpts[mpts.length - 1]!.x - newSibPt.x, mpts[mpts.length - 1]!.y - newSibPt.y) < 12) { sibBad = true; break; }
                  if (om && om.source === se.target && Math.hypot(mpts[0]!.x - newSibPt.x, mpts[0]!.y - newSibPt.y) < 12) { sibBad = true; break; }
                }
                if (!sibBad) {
                  setRoutePoints(ctx.routes[sk]!, reanchored);
                  routePts[sk] = reanchored;
                  nudged = true;
                  break;
                }
              }
              if (!nudged) blocked = true;
            } else {
              blocked = true;
            }
          } else {
            blocked = true;
          }
        } else if (closeSiblings.length > 1) {
          blocked = true;
        }
        if (!blocked && newCross <= oldCross) {
          setRoutePoints(ctx.routes[i]!, cand);
          routePts[i] = cand;
        }
      }
    }
    // Symmetric source-side straightener for horizontal/vertical 4-point Z-routes whose
    // target sits on a single straight axis (e.g. a14 Partner API -> CRM SaaS where Partner API
    // had 2 EAST outputs split off-center, while the upper output turned UP toward Lakehouse).
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!editable(edge) || edge.sourcePort || ctx.isFixedPort(edge.source, edge.sourcePort)) continue;
      const pts = routePts[i]!;
      if (pts.length !== 4) continue;
      const srcInfo = ctx.nodeInfo(edge.source);
      const tgtInfo = ctx.nodeInfo(edge.target);
      if (!srcInfo || !tgtInfo || srcInfo.isContainer || srcInfo.shapeId === 'diamond') continue;
      const s = pts[0]!, e = pts[3]!;
      const vertFlow = ctx.direction === 'DOWN' || ctx.direction === 'UP';
      const sSide = inferContactSide(s, srcInfo.frame);
      const eSide = inferContactSide(e, tgtInfo.frame);
      let straightStart: Point | undefined;
      if (!vertFlow && (sSide === 'EAST' || sSide === 'WEST') && (eSide === 'WEST' || eSide === 'EAST')
        && e.y >= srcInfo.frame.y + 8 && e.y <= srcInfo.frame.y + srcInfo.frame.height - 8) {
        const pt = ctx.contourContact?.(edge.source, sSide, e.y) ?? { x: s.x, y: e.y };
        if (Math.abs(pt.y - e.y) <= 1) straightStart = pt;
      } else if (vertFlow && (sSide === 'SOUTH' || sSide === 'NORTH') && (eSide === 'NORTH' || eSide === 'SOUTH')
        && e.x >= srcInfo.frame.x + 10 && e.x <= srcInfo.frame.x + srcInfo.frame.width - 10) {
        const pt = ctx.contourContact?.(edge.source, sSide, e.x) ?? { x: e.x, y: s.y };
        if (Math.abs(pt.x - e.x) <= 1) straightStart = pt;
      }
      if (!straightStart) continue;
      const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      const cand = [straightStart, e];
      if (pathHitsObstacles(cand, boxes, 2)) continue;
      if (containerCaptionBoxes.length > 0 && pathHitsObstacles(cand, containerCaptionBoxes, 1)) continue;
      let blocked = false;
      let oldCross = 0;
      let newCross = 0;
      const closeSiblings: number[] = [];
      for (let k = 0; k < routePts.length; k++) {
        if (k === i) continue;
        const oe = edgeById.get(ctx.routes[k]!.id);
        const opts = routePts[k]!;
        oldCross += countOrthogonalCrossings(pts, opts);
        newCross += countOrthogonalCrossings(cand, opts);
        if (hasCollinearOverlap(cand, opts, 3.5)) { blocked = true; break; }
        if (oe && oe.source === edge.source && Math.hypot(opts[0]!.x - straightStart.x, opts[0]!.y - straightStart.y) < 11.5) {
          closeSiblings.push(k);
        }
        if (oe && oe.target === edge.source && Math.hypot(opts[opts.length - 1]!.x - straightStart.x, opts[opts.length - 1]!.y - straightStart.y) < 11.5) {
          blocked = true; break;
        }
      }
      if (!blocked && newCross <= oldCross && closeSiblings.length === 1) {
        const sk = closeSiblings[0]!;
        const se = edgeById.get(ctx.routes[sk]!.id);
        const spts = routePts[sk]!;
        if (editable(se) && !se.sourcePort && !ctx.isFixedPort(se.source, se.sourcePort) && spts.length >= 2) {
          const sStart = spts[0]!;
          const oSide = inferContactSide(sStart, srcInfo.frame);
          if (oSide === sSide) {
            const horizFace = sSide === 'NORTH' || sSide === 'SOUTH';
            const sNext = spts.length >= 3 ? spts[2]! : spts[1]!;
            const prefDir = horizFace
              ? (sNext.x >= straightStart.x ? 1 : -1)
              : (sNext.y >= straightStart.y ? 1 : -1);
            const { boxes: sBoxes } = collectObstaclesFor(se, ctx.rects, ctx.nodeInfo);
            let nudged = false;
            for (const sign of [prefDir, -prefDir]) {
              const along = (horizFace ? straightStart.x : straightStart.y) + sign * 12;
              const lo = horizFace ? srcInfo.frame.x + 6 : srcInfo.frame.y + 6;
              const hi = horizFace ? srcInfo.frame.x + srcInfo.frame.width - 6 : srcInfo.frame.y + srcInfo.frame.height - 6;
              if (along < lo || along > hi) continue;
              const newSibPt = ctx.contourContact?.(se.source, oSide, along)
                ?? (horizFace ? { x: along, y: sStart.y } : { x: sStart.x, y: along });
              if (Math.hypot(newSibPt.x - straightStart.x, newSibPt.y - straightStart.y) < 12) continue;
              const reanchored = reanchorEndpointOrthogonal(spts, 'source', newSibPt, oSide, sBoxes);
              if (!reanchored) continue;
              if (containerCaptionBoxes.length > 0 && pathHitsObstacles(reanchored, containerCaptionBoxes, 1)) continue;
              if (hasCollinearOverlap(cand, reanchored, 3) || countOrthogonalCrossings(cand, reanchored) > 0) continue;
              let sibBad = false;
              for (let m = 0; m < routePts.length; m++) {
                if (m === i || m === sk) continue;
                const om = edgeById.get(ctx.routes[m]!.id);
                const mpts = routePts[m]!;
                if (hasCollinearOverlap(reanchored, mpts, 3)) { sibBad = true; break; }
                if (om && om.source === se.source && Math.hypot(mpts[0]!.x - newSibPt.x, mpts[0]!.y - newSibPt.y) < 12) { sibBad = true; break; }
                if (om && om.target === se.source && Math.hypot(mpts[mpts.length - 1]!.x - newSibPt.x, mpts[mpts.length - 1]!.y - newSibPt.y) < 12) { sibBad = true; break; }
              }
              if (sibBad) continue;
              setRoutePoints(ctx.routes[sk]!, reanchored);
              routePts[sk] = reanchored;
              nudged = true;
              break;
            }
            if (!nudged) blocked = true;
          } else blocked = true;
        } else blocked = true;
      } else if (closeSiblings.length > 1) blocked = true;
      if (!blocked && newCross <= oldCross) {
        setRoutePoints(ctx.routes[i]!, cand);
        routePts[i] = cand;
      }
    }
    // Narrow-facet hexagon top relief (DOWN/UP): when a hexagon has 2+ crowded NORTH
    // incoming arrowheads (< 14 px apart), redirect a side-approaching route to the
    // hexagon's free WEST/EAST vertex as a crisp 1-bend L-entry (e.g. a11 admin -> waf).
    if (ctx.direction === 'DOWN' || ctx.direction === 'UP') {
      const hexNorthRoutes = new Map<string, number[]>();
      for (let i = 0; i < ctx.routes.length; i++) {
        const edge = edgeById.get(ctx.routes[i]!.id);
        if (!editable(edge) || edge.targetPort || ctx.isFixedPort(edge.target, edge.targetPort)) continue;
        const tgtInfo = ctx.nodeInfo(edge.target);
        if (!tgtInfo || tgtInfo.shapeId !== 'hexagon') continue;
        const pts = routePts[i]!;
        if (pts.length < 4) continue;
        const ePt = pts[pts.length - 1]!;
        if (inferContactSide(ePt, tgtInfo.frame) === 'NORTH') {
          const list = hexNorthRoutes.get(edge.target) ?? [];
          list.push(i);
          hexNorthRoutes.set(edge.target, list);
        }
      }
      for (const [hexId, idxs] of hexNorthRoutes) {
        if (idxs.length < 2) continue;
        const tgtInfo = ctx.nodeInfo(hexId)!;
        const tgtCy = tgtInfo.frame.y + tgtInfo.frame.height / 2;
        for (const i of idxs) {
          const edge = edgeById.get(ctx.routes[i]!.id)!;
          const pts = routePts[i]!;
          // Look for a route with an exterior vertical corridor on the WEST (or EAST) of the hexagon.
          if (pts.length < 4) continue;
          const railIdx = pts.length - 3;
          const railTop = pts[railIdx - 1]!, railBot = pts[railIdx]!;
          if (Math.abs(railTop.x - railBot.x) > EPS) continue;
          const side: PortSide | undefined = railTop.x < tgtInfo.frame.x - 10 ? 'WEST'
            : railTop.x > tgtInfo.frame.x + tgtInfo.frame.width + 10 ? 'EAST' : undefined;
          if (!side) continue;
          const sidePt = ctx.contourContact?.(hexId, side, tgtCy)
            ?? { x: side === 'WEST' ? tgtInfo.frame.x : tgtInfo.frame.x + tgtInfo.frame.width, y: tgtCy };
          // Ensure no other edge already uses this side vertex.
          const sideBusy = routePts.some((op, k) => k !== i && (
            Math.hypot(op[op.length - 1]!.x - sidePt.x, op[op.length - 1]!.y - sidePt.y) < 12
            || Math.hypot(op[0]!.x - sidePt.x, op[0]!.y - sidePt.y) < 12
          ));
          if (sideBusy) continue;
          const cand = compactOrthogonal([...pts.slice(0, railIdx), { x: railTop.x, y: sidePt.y }, sidePt]);
          if (!isPathOrthogonal(cand) || !isInwardApproach(cand[cand.length - 2]!, cand[cand.length - 1]!, tgtInfo.frame).ok) continue;
          const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
          if (pathHitsObstacles(cand, boxes, 2)) continue;
          if (containerCaptionBoxes.length > 0 && pathHitsObstacles(cand, containerCaptionBoxes, 1)) continue;
          let bad = false;
          let oldCross = 0;
          let newCross = 0;
          for (let k = 0; k < routePts.length; k++) {
            if (k === i) continue;
            oldCross += countOrthogonalCrossings(pts, routePts[k]!);
            newCross += countOrthogonalCrossings(cand, routePts[k]!);
            if (hasCollinearOverlap(cand, routePts[k]!, 3)) { bad = true; break; }
          }
          if (!bad && newCross <= oldCross) {
            setRoutePoints(ctx.routes[i]!, cand);
            routePts[i] = cand;
            // Re-center the remaining single NORTH route if only 1 remains on NORTH.
            const remaining = idxs.filter((k) => k !== i);
            if (remaining.length === 1) {
              const rk = remaining[0]!;
              const re = edgeById.get(ctx.routes[rk]!.id)!;
              const rpts = routePts[rk]!;
              const hexCx = tgtInfo.frame.x + tgtInfo.frame.width / 2;
              const centerNorth = ctx.contourContact?.(hexId, 'NORTH', hexCx) ?? { x: hexCx, y: tgtInfo.frame.y };
              const { boxes: rBoxes } = collectObstaclesFor(re, ctx.rects, ctx.nodeInfo);
              const recentered = reanchorEndpointOrthogonal(rpts, 'target', centerNorth, 'NORTH', rBoxes);
              if (recentered && !(containerCaptionBoxes.length > 0 && pathHitsObstacles(recentered, containerCaptionBoxes, 1))) {
                setRoutePoints(ctx.routes[rk]!, recentered);
                routePts[rk] = recentered;
              }
            }
            break;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase C1b (Stage 4): Symmetric mid-corridor X-crossover centering
  // When two 4-point Z-routes form an unavoidable X-crossover inside the same
  // adjacent-rank corridor, center their interior rails symmetrically around
  // the exact midpoint between source/target visual glyph faces (e.g. c08).
  // ---------------------------------------------------------------------------
  {
    const horizFlow = ctx.direction === 'RIGHT' || ctx.direction === 'LEFT';
    const routePts = ctx.routes.map((r) => sectionPoints(r.sections));
    const fixedFlags = ctx.routes.map((r) => Boolean(edgeById.get(r.id)?.routeIntent));
    const centered = new Set<number>();
    for (let i = 0; i < ctx.routes.length; i++) {
      if (fixedFlags[i] || centered.has(i)) continue;
      const ptsA = routePts[i]!;
      if (ptsA.length !== 4) continue;
      const edgeA = edgeById.get(ctx.routes[i]!.id);
      if (!edgeA) continue;
      // Middle segment must be perpendicular to primary flow axis.
      const midVertA = Math.abs(ptsA[1]!.x - ptsA[2]!.x) <= 0.5 && Math.abs(ptsA[1]!.y - ptsA[2]!.y) > 8;
      const midHorizA = Math.abs(ptsA[1]!.y - ptsA[2]!.y) <= 0.5 && Math.abs(ptsA[1]!.x - ptsA[2]!.x) > 8;
      if (horizFlow ? !midVertA : !midHorizA) continue;

      for (let j = i + 1; j < ctx.routes.length; j++) {
        if (fixedFlags[j] || centered.has(j)) continue;
        const ptsB = routePts[j]!;
        if (ptsB.length !== 4) continue;
        const edgeB = edgeById.get(ctx.routes[j]!.id);
        if (!edgeB) continue;
        const midVertB = Math.abs(ptsB[1]!.x - ptsB[2]!.x) <= 0.5 && Math.abs(ptsB[1]!.y - ptsB[2]!.y) > 8;
        const midHorizB = Math.abs(ptsB[1]!.y - ptsB[2]!.y) <= 0.5 && Math.abs(ptsB[1]!.x - ptsB[2]!.x) > 8;
        if (horizFlow ? !midVertB : !midHorizB) continue;
        if (countOrthogonalCrossings(ptsA, ptsB) === 0) continue;

        const loA = horizFlow ? Math.min(ptsA[0]!.x, ptsA[3]!.x) : Math.min(ptsA[0]!.y, ptsA[3]!.y);
        const hiA = horizFlow ? Math.max(ptsA[0]!.x, ptsA[3]!.x) : Math.max(ptsA[0]!.y, ptsA[3]!.y);
        const loB = horizFlow ? Math.min(ptsB[0]!.x, ptsB[3]!.x) : Math.min(ptsB[0]!.y, ptsB[3]!.y);
        const hiB = horizFlow ? Math.max(ptsB[0]!.x, ptsB[3]!.x) : Math.max(ptsB[0]!.y, ptsB[3]!.y);
        const corrLo = Math.max(loA, loB);
        const corrHi = Math.min(hiA, hiB);
        if (corrHi - corrLo < 32) continue;

        const mid = (corrLo + corrHi) / 2;
        const halfGap = 7;
        const curA = horizFlow ? ptsA[1]!.x : ptsA[1]!.y;
        const curB = horizFlow ? ptsB[1]!.x : ptsB[1]!.y;
        const railA = curA <= curB ? mid - halfGap : mid + halfGap;
        const railB = curA <= curB ? mid + halfGap : mid - halfGap;
        if (Math.abs(railA - curA) <= 2 && Math.abs(railB - curB) <= 2) continue;

        const shiftZ = (pts: Point[], rail: number): Point[] => pts.map((p, k) =>
          k === 1 || k === 2 ? (horizFlow ? { x: rail, y: p.y } : { x: p.x, y: rail }) : { ...p });
        const candA = shiftZ(ptsA, railA);
        const candB = shiftZ(ptsB, railB);
        const obsA = collectObstaclesFor(edgeA, ctx.rects, ctx.nodeInfo);
        const obsB = collectObstaclesFor(edgeB, ctx.rects, ctx.nodeInfo);
        if (pathHitsObstacles(candA, obsA.boxes, 2) || pathHitsObstacles(candB, obsB.boxes, 2)) continue;
        if (pathReentersEndNodes(candA, obsA.srcFrame, obsA.tgtFrame) || pathReentersEndNodes(candB, obsB.srcFrame, obsB.tgtFrame)) continue;

        // Ensure shifting rails does not increase crossings or create collinear overlaps with any route.
        let beforeCross = countOrthogonalCrossings(ptsA, ptsB);
        let afterCross = countOrthogonalCrossings(candA, candB);
        let badOverlap = hasCollinearOverlap(candA, candB);
        for (let k = 0; k < routePts.length && !badOverlap; k++) {
          if (k === i || k === j) continue;
          beforeCross += countOrthogonalCrossings(ptsA, routePts[k]!) + countOrthogonalCrossings(ptsB, routePts[k]!);
          afterCross += countOrthogonalCrossings(candA, routePts[k]!) + countOrthogonalCrossings(candB, routePts[k]!);
          if (hasCollinearOverlap(candA, routePts[k]!) || hasCollinearOverlap(candB, routePts[k]!)) badOverlap = true;
        }
        if (badOverlap || afterCross > beforeCross) continue;

        setRoutePoints(ctx.routes[i]!, candA);
        setRoutePoints(ctx.routes[j]!, candB);
        routePts[i] = candA;
        routePts[j] = candB;
        centered.add(i);
        centered.add(j);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase D (Stage 4): Concave/cloud short U-hook cleanup (e.g. Payment gateway,
  // Partner webhook in c13) — run before Phase C2 so straightened routes can be
  // shifted clear of container borders.
  // ---------------------------------------------------------------------------
  for (const route of ctx.routes) {
    const edge = edgeById.get(route.id);
    if (!editable(edge)) continue;
    const pts = sectionPoints(route.sections);
    if (pts.length < 4) continue;
    const last = pts.length - 1;
    const p3 = pts[last - 3]!, p2 = pts[last - 2]!, p1 = pts[last - 1]!, p0 = pts[last]!;
    const tgtInfo = ctx.nodeInfo(edge.target);
    if (!tgtInfo || edge.targetPort || ctx.isFixedPort(edge.target, edge.targetPort)) continue;

    // Pattern 1: horizontal -> short vertical -> short horizontal reversal into target.
    const v1 = Math.abs(p2.x - p1.x) <= EPS && Math.abs(p1.y - p2.y) <= 45;
    const h0 = Math.abs(p1.y - p0.y) <= EPS && Math.abs(p0.x - p1.x) <= 35;
    const h2 = Math.abs(p3.y - p2.y) <= EPS;
    const reversal = h2 && v1 && h0 && (p2.x - p3.x) * (p0.x - p1.x) < 0;
    if (reversal) {
      const directTarget = ctx.contourContact?.(edge.target, inferContactSide(p0, tgtInfo.frame), p3.y) ?? { x: p0.x, y: p3.y };
      if (Math.abs(directTarget.y - p3.y) <= EPS) {
        const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
        const cand = [...pts.slice(0, last - 2), directTarget];
        if (isPathOrthogonal(cand) && !pathHitsObstacles(cand, boxes)) {
          setRoutePoints(route, cand);
          continue;
        }
      }
    }

    // Pattern 2: horizontal -> vertical detour -> horizontal -> vertical drop onto W/E face (e.g. cloud ext).
    if (pts.length >= 5) {
      const p4 = pts[last - 4]!;
      const hPrev = Math.abs(p4.y - p3.y) <= EPS;
      const vUp = Math.abs(p3.x - p2.x) <= EPS && Math.abs(p2.y - p3.y) <= 65;
      const hAcross = Math.abs(p2.y - p1.y) <= EPS && Math.abs(p1.x - p2.x) <= 55;
      const vDrop = Math.abs(p1.x - p0.x) <= EPS && Math.abs(p0.y - p1.y) <= 55;
      const approachesW = p4.x < p3.x && p3.x <= tgtInfo.frame.x + 2;
      const approachesE = p4.x > p3.x && p3.x >= tgtInfo.frame.x + tgtInfo.frame.width - 2;
      if (hPrev && vUp && hAcross && vDrop && (approachesW || approachesE)) {
        const face: PortSide = approachesW ? 'WEST' : 'EAST';
        const clampedY = tgtInfo.shapeId === 'cloud'
          ? tgtInfo.frame.y + tgtInfo.frame.height * 0.65
          : Math.max(tgtInfo.frame.y + 8, Math.min(tgtInfo.frame.y + tgtInfo.frame.height - 8, p4.y));
        const directTarget = ctx.contourContact?.(edge.target, face, clampedY)
          ?? { x: face === 'WEST' ? tgtInfo.frame.x : tgtInfo.frame.x + tgtInfo.frame.width, y: clampedY };
        const { boxes, srcFrame, tgtFrame } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
        const cand = Math.abs(directTarget.y - p4.y) <= 1.5
          ? compactOrthogonal([...pts.slice(0, last - 3), { x: directTarget.x, y: p4.y }])
          : compactOrthogonal([...pts.slice(0, last - 3), { x: p3.x, y: p4.y }, { x: p3.x, y: directTarget.y }, directTarget]);
        if (isPathOrthogonal(cand) && !pathHitsObstacles(cand, boxes, 1.5) && !pathReentersEndNodes(cand, srcFrame, tgtFrame)) {
          const chk = isInwardApproach(cand[cand.length - 2]!, cand[cand.length - 1]!, tgtInfo.frame);
          if (chk.ok) {
            setRoutePoints(route, cand);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase C2 (Stage 4): Container Border Clearance (DRQ-19)
  // Shifts interior (and free terminal) connector rails running within < 11.5 px
  // of any group container border into open obstacle-free corridor space.
  // ---------------------------------------------------------------------------
  if (containers.length > 0) {
    for (let bPass = 0; bPass < 2; bPass++) {
      const routePts = ctx.routes.map((r) => sectionPoints(r.sections));
      let shiftedAny = false;

      for (let rIdx = 0; rIdx < ctx.routes.length; rIdx++) {
        const edge = edgeById.get(ctx.routes[rIdx]!.id);
        if (!editable(edge)) continue;
        const pts = routePts[rIdx]!;
        if (pts.length < 4) continue;
        const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
        const tgtInfo = ctx.nodeInfo(edge.target);
        const freeTarget = !edge.targetPort && !ctx.isFixedPort(edge.target, edge.targetPort);
        const maxSIdx = freeTarget && tgtInfo && !tgtInfo.isContainer ? pts.length - 2 : pts.length - 3;

        for (let sIdx = 1; sIdx <= maxSIdx; sIdx++) {
          const isTerminal = sIdx === pts.length - 2;
          const hug = segmentBorderHugInfo(pts[sIdx]!, pts[sIdx + 1]!, containers, 11.5, 14);
          if (!hug) continue;
          const curCoord = hug.orientation === 'H' ? pts[sIdx]!.y : pts[sIdx]!.x;
          const sideSign = curCoord >= hug.wall ? 1 : -1;

          // Look for an opposing parallel container wall on the same side to find corridor center.
          const candidateCoords: number[] = [];
          let nearestOpposite: number | undefined;
          for (const c of containers) {
            const walls = hug.orientation === 'H' ? [c.y, c.y + c.height] : [c.x, c.x + c.width];
            for (const w of walls) {
              const delta = (w - hug.wall) * sideSign;
              if (delta >= 24 && (nearestOpposite === undefined || delta < Math.abs(nearestOpposite - hug.wall))) {
                nearestOpposite = w;
              }
            }
          }
          if (nearestOpposite !== undefined) {
            const midCorridor = (hug.wall + nearestOpposite) / 2;
            candidateCoords.push(midCorridor, midCorridor - 14, midCorridor + 14);
          }
          candidateCoords.push(
            hug.wall + sideSign * 16,
            hug.wall + sideSign * 22,
            hug.wall + sideSign * 13.5,
            hug.wall + sideSign * 28,
            hug.wall + sideSign * 36,
            hug.wall - sideSign * 16,
            hug.wall - sideSign * 22,
          );

          const beforeHugs = pathBorderHugCount(pts, containers, 11.5);
          let beforeCross = 0;
          for (let k = 0; k < routePts.length; k++) {
            if (k !== rIdx) beforeCross += countOrthogonalCrossings(pts, routePts[k]!);
          }

          let bestCand: { nextPts: Point[]; score: number } | undefined;
          for (const candCoord of candidateCoords) {
            const cloned = pts.map((p) => ({ ...p }));
            if (isTerminal && tgtInfo) {
              // Ensure the shifted terminal endpoint still sits cleanly inside the target face.
              const faceLo = (hug.orientation === 'H' ? tgtInfo.frame.y : tgtInfo.frame.x) + 8;
              const faceHi = (hug.orientation === 'H' ? tgtInfo.frame.y + tgtInfo.frame.height : tgtInfo.frame.x + tgtInfo.frame.width) - 8;
              if (candCoord < faceLo || candCoord > faceHi) continue;
              const endSide = inferContactSide(pts[pts.length - 1]!, tgtInfo.frame);
              const projected = ctx.contourContact?.(edge.target, endSide, candCoord);
              if (hug.orientation === 'H') {
                cloned[sIdx]!.y = candCoord;
                cloned[sIdx + 1] = projected ?? { x: cloned[sIdx + 1]!.x, y: candCoord };
                if (Math.abs(cloned[sIdx + 1]!.y - candCoord) > 1.5) continue;
                cloned[sIdx]!.y = cloned[sIdx + 1]!.y;
              } else {
                cloned[sIdx]!.x = candCoord;
                cloned[sIdx + 1] = projected ?? { x: candCoord, y: cloned[sIdx + 1]!.y };
                if (Math.abs(cloned[sIdx + 1]!.x - candCoord) > 1.5) continue;
                cloned[sIdx]!.x = cloned[sIdx + 1]!.x;
              }
            } else if (hug.orientation === 'H') {
              cloned[sIdx]!.y = candCoord;
              cloned[sIdx + 1]!.y = candCoord;
            } else {
              cloned[sIdx]!.x = candCoord;
              cloned[sIdx + 1]!.x = candCoord;
            }
            const comp = compactOrthogonal(cloned);
            if (!isPathOrthogonal(comp) || pathReentersEndNodes(comp, ctx.nodeInfo(edge.source)?.frame, tgtInfo?.frame)) continue;
            // Check modified segments for obstacle & container-caption clearance.
            const modifiedSlice = cloned.slice(Math.max(0, sIdx - 1), Math.min(cloned.length, sIdx + 3));
            if (pathHitsObstacles(modifiedSlice, boxes, 1.0)) continue;
            if (containerCaptionBoxes.length > 0 && pathHitsObstacles(modifiedSlice, containerCaptionBoxes, 3.0)) continue;
            if (tgtInfo && comp.length >= 2) {
              const chk = isInwardApproach(comp[comp.length - 2]!, comp[comp.length - 1]!, tgtInfo.frame);
              if (!chk.ok || (comp.length >= 3 && chk.len < 6.5)) continue;
            }
            const afterHugs = pathBorderHugCount(comp, containers, 11.5);
            if (afterHugs >= beforeHugs) continue;
            let overlap = false;
            let tightCorridor = 0;
            let afterCross = 0;
            for (let k = 0; k < routePts.length; k++) {
              if (k === rIdx) continue;
              if (hasCollinearOverlap(comp, routePts[k]!, 3.5)) { overlap = true; break; }
              if (hasCollinearOverlap(comp, routePts[k]!, 11.5)) tightCorridor++;
              afterCross += countOrthogonalCrossings(comp, routePts[k]!);
            }
            if (overlap || afterCross > beforeCross) continue;
            const score = afterHugs * 1000 + afterCross * 200 + tightCorridor * 120 + Math.abs(candCoord - curCoord) * 0.5;
            if (!bestCand || score < bestCand.score) {
              bestCand = { nextPts: comp, score };
            }
          }

          if (bestCand) {
            setRoutePoints(ctx.routes[rIdx]!, bestCand.nextPts);
            routePts[rIdx] = sectionPoints(ctx.routes[rIdx]!.sections);
            shiftedAny = true;
            break;
          }
        }
      }

      if (!shiftedAny) break;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase E (Stage 4): Micro-jog collapse (< 10 px interior step) &
  //                    X-swap terminal collinear overlap separation
  // ---------------------------------------------------------------------------
  for (const route of ctx.routes) {
    const edge = edgeById.get(route.id);
    if (!editable(edge)) continue;
    let pts = sectionPoints(route.sections);
    if (pts.length < 5) continue;
    const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
    let collapsed = true;
    while (collapsed && pts.length >= 5) {
      collapsed = false;
      for (let i = 1; i < pts.length - 2; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len >= 12.1 || len <= 0.25) continue;
        // Try snapping the interior segment's perpendicular neighbor onto the adjacent fixed leg.
        const isH = Math.abs(a.y - b.y) <= EPS;
        const isV = Math.abs(a.x - b.x) <= EPS;
        if (!isH && !isV) continue;
        const next = pts.map((p) => ({ ...p }));
        if (isH && i === pts.length - 3) {
          // Collapse short horizontal jog right before final vertical leg by shifting previous vertical rail.
          next[i - 1]!.x = b.x;
          next[i]!.x = b.x;
        } else if (isV && i === pts.length - 3) {
          next[i - 1]!.y = b.y;
          next[i]!.y = b.y;
        } else if (isH && i === 1) {
          next[i + 1]!.x = a.x;
          next[i + 2]!.x = a.x;
        } else if (isV && i === 1) {
          next[i + 1]!.y = a.y;
          next[i + 2]!.y = a.y;
        } else if (isH && i > 1 && i < pts.length - 3) {
          next[i + 1]!.x = a.x;
          next[i + 2]!.x = a.x;
        } else if (isV && i > 1 && i < pts.length - 3) {
          next[i + 1]!.y = a.y;
          next[i + 2]!.y = a.y;
        } else {
          continue;
        }
        const compacted = compactOrthogonal(next);
        if (isPathOrthogonal(compacted) && !pathHitsObstacles(compacted, boxes, 1)) {
          pts = compacted;
          setRoutePoints(route, pts);
          collapsed = true;
          break;
        }
        // If collapsing is blocked by an obstacle (e.g. container title detour), widen the jog to 14.5 px
        // in the same clearance direction (and pull the jog leg clear of any container border hug if needed)
        // so it satisfies both DRQ-13 (>= 12 px) and container-border clearance cleanly.
        if (i === 1 && (isH || isV) && pts.length >= 5 && containerCaptionBoxes.length > 0 && pathHitsObstacles(compacted, containerCaptionBoxes, 1)) {
          const baseHugs = pathBorderHugCount(pts, containers, 11.5);
          const legOffsets = [0, -10, 10, -16, 16];
          let widenedOk = false;
          for (const legDelta of legOffsets) {
            const widened = pts.map((p) => ({ ...p }));
            if (isH) {
              const dir = b.x >= a.x ? 1 : -1;
              const targetX = a.x + dir * 14.5;
              const legY = a.y + legDelta;
              if (Math.abs(legY - pts[0]!.y) < 10 || Math.abs(pts[i + 2]!.y - legY) < 10) continue;
              widened[i]!.y = legY;
              widened[i + 1]!.y = legY;
              widened[i + 1]!.x = targetX;
              widened[i + 2]!.x = targetX;
            } else {
              const dir = b.y >= a.y ? 1 : -1;
              const targetY = a.y + dir * 14.5;
              const legX = a.x + legDelta;
              if (Math.abs(legX - pts[0]!.x) < 10 || Math.abs(pts[i + 2]!.x - legX) < 10) continue;
              widened[i]!.x = legX;
              widened[i + 1]!.x = legX;
              widened[i + 1]!.y = targetY;
              widened[i + 2]!.y = targetY;
            }
            const compW = compactOrthogonal(widened);
            if (isPathOrthogonal(compW) && !pathHitsObstacles(compW, boxes, 1)
              && pathBorderHugCount(compW, containers, 11.5) <= baseHugs) {
              pts = compW;
              setRoutePoints(route, pts);
              collapsed = true;
              widenedOk = true;
              break;
            }
          }
          if (widenedOk) break;
        }
      }
    }
  }

  // Separate terminal-to-terminal collinear overlaps (e.g. X-swaps between aligned rows)
  // by nudging one free endpoint's contact by +/- 8 px on its node face.
  const allPts = ctx.routes.map((r) => sectionPoints(r.sections));
  for (let i = 0; i < ctx.routes.length; i++) {
    const e1 = edgeById.get(ctx.routes[i]!.id);
    if (!editable(e1)) continue;
    const p1 = allPts[i]!;
    for (let j = i + 1; j < ctx.routes.length; j++) {
      const e2 = edgeById.get(ctx.routes[j]!.id);
      if (!editable(e2)) continue;
      const p2 = allPts[j]!;
      // Check terminal segments only (interior segments were handled in Phase C).
      const termIndices = (pts: Point[]) => pts.length >= 2 ? [0, pts.length - 2] : [];
      let fixedPair = false;
      for (const si of termIndices(p1)) {
        if (fixedPair) break;
        const a1 = p1[si]!, b1 = p1[si + 1]!;
        const h1 = Math.abs(a1.y - b1.y) <= EPS;
        const v1 = Math.abs(a1.x - b1.x) <= EPS;
        if (!h1 && !v1) continue;
        for (const sj of termIndices(p2)) {
          const a2 = p2[sj]!, b2 = p2[sj + 1]!;
          const h2 = Math.abs(a2.y - b2.y) <= EPS;
          const v2 = Math.abs(a2.x - b2.x) <= EPS;
          if (h1 !== h2 || v1 !== v2) continue;
          const perpDiff = h1 ? Math.abs(a1.y - a2.y) : Math.abs(a1.x - a2.x);
          if (perpDiff > 3) continue;
          const span = h1
            ? Math.min(Math.max(a1.x, b1.x), Math.max(a2.x, b2.x)) - Math.max(Math.min(a1.x, b1.x), Math.min(a2.x, b2.x))
            : Math.min(Math.max(a1.y, b1.y), Math.max(a2.y, b2.y)) - Math.max(Math.min(a1.y, b1.y), Math.min(a2.y, b2.y));
          if (span <= 2) continue;

          // Nudge the target or source endpoint of route i slightly off the shared axis.
          const end: 'source' | 'target' = si === 0 ? 'source' : 'target';
          const nodeId = end === 'source' ? e1.source : e1.target;
          const portId = end === 'source' ? e1.sourcePort : e1.targetPort;
          if (portId || ctx.isFixedPort(nodeId, portId)) continue;
          const info = ctx.nodeInfo(nodeId);
          if (!info || info.isContainer || info.shapeId === 'diamond') continue;
          const anchor = end === 'source' ? p1[0]! : p1[p1.length - 1]!;
          const side = inferContactSide(anchor, info.frame);
          const { boxes } = collectObstaclesFor(e1, ctx.rects, ctx.nodeInfo);
          for (const delta of [8, -8, 12, -12]) {
            const along = (side === 'NORTH' || side === 'SOUTH') ? anchor.x + delta : anchor.y + delta;
            const minBound = (side === 'NORTH' || side === 'SOUTH') ? info.frame.x + 6 : info.frame.y + 6;
            const maxBound = (side === 'NORTH' || side === 'SOUTH') ? info.frame.x + info.frame.width - 6 : info.frame.y + info.frame.height - 6;
            if (along < minBound || along > maxBound) continue;
            const newPt = ctx.contourContact?.(nodeId, side, along)
              ?? ((side === 'NORTH' || side === 'SOUTH') ? { x: along, y: anchor.y } : { x: anchor.x, y: along });
            const shifted = reanchorEndpointOrthogonal(p1, end, newPt, side, boxes);
            if (shifted) {
              setRoutePoints(ctx.routes[i]!, shifted);
              allPts[i] = sectionPoints(ctx.routes[i]!.sections);
              fixedPair = true;
              break;
            }
          }
          if (fixedPair) break;
        }
      }
      // Also separate colliding port contacts (< 8.5 px) on the same node & side (DRQ-17).
      if (!fixedPair && e1.target === e2.target && !e1.targetPort && !ctx.isFixedPort(e1.target, e1.targetPort)) {
        const info = ctx.nodeInfo(e1.target);
        if (info && !info.isContainer && info.shapeId !== 'diamond') {
          const t1 = p1[p1.length - 1]!;
          const t2 = p2[p2.length - 1]!;
          const s1 = inferContactSide(t1, info.frame);
          const s2 = inferContactSide(t2, info.frame);
          if (s1 === s2 && Math.hypot(t1.x - t2.x, t1.y - t2.y) < 8.5) {
            const horizFace = s1 === 'NORTH' || s1 === 'SOUTH';
            const { boxes } = collectObstaclesFor(e1, ctx.rects, ctx.nodeInfo);
            const lo = horizFace ? info.frame.x + 6 : info.frame.y + 6;
            const hi = horizFace ? info.frame.x + info.frame.width - 6 : info.frame.y + info.frame.height - 6;
            for (const delta of [-8, 8, -10, 10, -12, 12, -6, 6]) {
              const along = (horizFace ? t1.x : t1.y) + delta;
              if (along < lo || along > hi) continue;
              const newPt = ctx.contourContact?.(e1.target, s1, along)
                ?? (horizFace ? { x: along, y: t1.y } : { x: t1.x, y: along });
              let tooClose = false;
              for (let k = 0; k < allPts.length; k++) {
                if (k === i) continue;
                const ek = edgeById.get(ctx.routes[k]!.id);
                const pk = allPts[k]!;
                if (ek && ek.target === e1.target && Math.hypot(pk[pk.length - 1]!.x - newPt.x, pk[pk.length - 1]!.y - newPt.y) < 9.0) {
                  tooClose = true; break;
                }
                if (ek && ek.source === e1.target && Math.hypot(pk[0]!.x - newPt.x, pk[0]!.y - newPt.y) < 9.0) {
                  tooClose = true; break;
                }
              }
              if (tooClose) continue;
              const shifted = reanchorEndpointOrthogonal(p1, 'target', newPt, s1, boxes);
              if (shifted && !(containerCaptionBoxes.length > 0 && pathHitsObstacles(shifted, containerCaptionBoxes, 1))) {
                setRoutePoints(ctx.routes[i]!, shifted);
                allPts[i] = sectionPoints(ctx.routes[i]!.sections);
                break;
              }
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase E2 (Stage 4): Container-top NORTH arrowhead approach stem clearance
  // When a route bends below a container caption to enter a top child's NORTH
  // port in DOWN flow, ensure at least >= 16 px vertical runway before the
  // arrowhead without introducing any micro-jog (< 12 px) or border hug.
  // ---------------------------------------------------------------------------
  if ((ctx.direction === 'DOWN' || ctx.direction === 'UP') && containerCaptionBoxes.length > 0) {
    const finalPts = ctx.routes.map((r) => sectionPoints(r.sections));
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!editable(edge)) continue;
      const pts = finalPts[i]!;
      if (pts.length < 4) continue;
      const n = pts.length;
      const pPrev = pts[n - 2]!;
      const pEnd = pts[n - 1]!;
      const pPrev2 = pts[n - 3]!;
      const finalV = Math.abs(pPrev.x - pEnd.x) <= EPS;
      if (!finalV || pPrev.y >= pEnd.y) continue;
      const stemLen = pEnd.y - pPrev.y;
      if (stemLen >= 16) continue;
      if (Math.abs(pPrev2.y - pPrev.y) > EPS) continue;
      const tgtInfo = ctx.nodeInfo(edge.target);
      if (!tgtInfo || tgtInfo.isContainer) continue;
      const { boxes } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      const baseHugs = pathBorderHugCount(pts, containers, 11.5);
      for (const wantLen of [20, 18, 16]) {
        const trial = pts.map((p) => ({ ...p }));
        const targetY = pEnd.y - wantLen;
        trial[n - 2]!.y = targetY;
        trial[n - 3]!.y = targetY;
        const comp = compactOrthogonal(trial);
        if (!isPathOrthogonal(comp)) continue;
        // Never introduce a micro-jog (< 12 px) on any interior segment (DRQ-13).
        let createsMicroJog = false;
        for (let si = 1; si < comp.length - 2; si++) {
          if (Math.hypot(comp[si + 1]!.x - comp[si]!.x, comp[si + 1]!.y - comp[si]!.y) < 12) {
            createsMicroJog = true;
            break;
          }
        }
        if (createsMicroJog) continue;
        if (pathHitsObstacles(comp, boxes, 1.5)) continue;
        if (pathHitsObstacles(comp, containerCaptionBoxes, 2)) continue;
        if (pathBorderHugCount(comp, containers, 11.5) > baseHugs) continue;
        let bad = false;
        let oldCross = 0;
        let newCross = 0;
        for (let k = 0; k < finalPts.length; k++) {
          if (k === i) continue;
          const pk = finalPts[k]!;
          oldCross += countOrthogonalCrossings(pts, pk);
          newCross += countOrthogonalCrossings(comp, pk);
          if (hasCollinearOverlap(comp, pk, 3)) { bad = true; break; }
        }
        if (!bad && newCross <= oldCross) {
          setRoutePoints(ctx.routes[i]!, comp);
          finalPts[i] = comp;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase E3 (0.2.14 Slice 20): Universal single-edge free-port re-centering
  // After all slot spills and corridor refinements, any non-container node side
  // carrying a single free-port edge should anchor cleanly at its visual glyph
  // midpoint when doing so is strictly collision-free and non-regressive.
  // Bounded to graphs <= 120 routes to preserve R-026 large-graph budgets.
  // ---------------------------------------------------------------------------
  if (ctx.routes.length <= 120) {
    const finalPts = ctx.routes.map((r) => sectionPoints(r.sections));
    const sideGroups = new Map<string, { routeIdx: number; end: 'source' | 'target'; nodeId: string; side: PortSide; pt: Point }[]>();
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!edge) continue;
      const pts = finalPts[i]!;
      if (pts.length < 2) continue;
      for (const end of ['source', 'target'] as const) {
        const nodeId = end === 'source' ? edge.source : edge.target;
        const info = ctx.nodeInfo(nodeId);
        if (!info || info.isContainer) continue;
        const pt = end === 'source' ? pts[0]! : pts[pts.length - 1]!;
        const side = inferContactSide(pt, info.frame);
        const key = `${nodeId}:${side}`;
        const list = sideGroups.get(key) ?? [];
        list.push({ routeIdx: i, end, nodeId, side, pt });
        sideGroups.set(key, list);
      }
    }
    for (const list of sideGroups.values()) {
      if (list.length !== 1) continue;
      const item = list[0]!;
      const edge = edgeById.get(ctx.routes[item.routeIdx]!.id);
      if (!editable(edge)) continue;
      if (item.end === 'source' && edge.sourcePort) continue;
      if (item.end === 'target' && edge.targetPort) continue;
      const info = ctx.nodeInfo(item.nodeId);
      if (!info || info.isContainer) continue;
      const horizSide = item.side === 'NORTH' || item.side === 'SOUTH';
      const midCoord = horizSide
        ? info.frame.x + info.frame.width / 2
        : info.frame.y + info.frame.height / 2;
      const curCoord = horizSide ? item.pt.x : item.pt.y;
      if (Math.abs(curCoord - midCoord) <= 4) continue;

      const targetPt = ctx.contourContact?.(item.nodeId, item.side, midCoord)
        ?? (horizSide
          ? { x: midCoord, y: item.side === 'NORTH' ? info.frame.y : info.frame.y + info.frame.height }
          : { x: item.side === 'WEST' ? info.frame.x : info.frame.x + info.frame.width, y: midCoord });
      const pts = finalPts[item.routeIdx]!;
      const { boxes, srcFrame, tgtFrame } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      const candidates: Point[][] = [];
      const directReanchor = reanchorEndpointOrthogonal(pts, item.end, targetPt, item.side, boxes);
      if (directReanchor && directReanchor.length <= pts.length) candidates.push(directReanchor);
      // If a free single port is severely off-center (>= 22 px, so re-centering
      // via a clean Z-route will NOT create a <22px avoidable jog) and direct
      // reanchoring failed or grew bends, try a clean centered Z-route.
      if (Math.abs(curCoord - midCoord) >= 22 && candidates.length === 0) {
        const otherEnd = item.end === 'source' ? pts[pts.length - 1]! : pts[0]!;
        const otherInfo = ctx.nodeInfo(item.end === 'source' ? edge.target : edge.source);
        if (otherInfo && !otherInfo.isContainer) {
          const otherSide = inferContactSide(otherEnd, otherInfo.frame);
          const sPt = item.end === 'source' ? targetPt : otherEnd;
          const sSide = item.end === 'source' ? item.side : otherSide;
          const tPt = item.end === 'source' ? otherEnd : targetPt;
          const tSide = item.end === 'source' ? otherSide : item.side;
          const sH = sSide === 'EAST' || sSide === 'WEST';
          const tH = tSide === 'EAST' || tSide === 'WEST';
          const sD = sSide === 'EAST' || sSide === 'SOUTH' ? 1 : -1;
          const tD = tSide === 'EAST' || tSide === 'SOUTH' ? 1 : -1;
          if (sH && tH) {
            for (const f of [0.5, 0.35, 0.65]) {
              const mx = sPt.x + (tPt.x - sPt.x) * f;
              if ((mx - sPt.x) * sD >= 14 && (mx - tPt.x) * tD >= 14) {
                candidates.push(compactOrthogonal([sPt, { x: mx, y: sPt.y }, { x: mx, y: tPt.y }, tPt]));
              }
            }
          } else if (!sH && !tH) {
            for (const f of [0.5, 0.35, 0.65]) {
              const my = sPt.y + (tPt.y - sPt.y) * f;
              if ((my - sPt.y) * sD >= 14 && (my - tPt.y) * tD >= 14) {
                candidates.push(compactOrthogonal([sPt, { x: sPt.x, y: my }, { x: tPt.x, y: my }, tPt]));
              }
            }
          }
        }
      }
      for (const updated of candidates) {
        if (!isPathOrthogonal(updated)) continue;
        if (pathReentersEndNodes(updated, srcFrame, tgtFrame)) continue;
        if (pathHitsObstacles(updated, boxes, 1.5)) continue;
        if (containerCaptionBoxes.length > 0 && pathHitsObstacles(updated, containerCaptionBoxes, 2)) continue;
        if (pathBorderHugCount(updated, containers, 11.5) > pathBorderHugCount(pts, containers, 11.5)) continue;
        // Reject if any interior segment becomes a micro-jog (< 12 px).
        let createsMicroJog = false;
        for (let si = 1; si < updated.length - 2; si++) {
          if (Math.hypot(updated[si + 1]!.x - updated[si]!.x, updated[si + 1]!.y - updated[si]!.y) < 12) {
            createsMicroJog = true;
            break;
          }
        }
        if (createsMicroJog) continue;
        // Verify inward approach on target and live >= 11 px port clearance on
        // BOTH ends against all other routes (DRQ-17).
        if (tgtFrame && !isInwardApproach(updated[updated.length - 2]!, updated[updated.length - 1]!, tgtFrame).ok) continue;
        let bad = false;
        let oldCross = 0;
        let newCross = 0;
        const newSrcPt = updated[0]!;
        const newTgtPt = updated[updated.length - 1]!;
        for (let k = 0; k < finalPts.length; k++) {
          if (k === item.routeIdx) continue;
          const pk = finalPts[k]!;
          const ek = edgeById.get(ctx.routes[k]!.id);
          if (ek) {
            if (ek.source === edge.source && Math.hypot(newSrcPt.x - pk[0]!.x, newSrcPt.y - pk[0]!.y) < 11) { bad = true; break; }
            if (ek.target === edge.source && Math.hypot(newSrcPt.x - pk[pk.length - 1]!.x, newSrcPt.y - pk[pk.length - 1]!.y) < 11) { bad = true; break; }
            if (ek.source === edge.target && Math.hypot(newTgtPt.x - pk[0]!.x, newTgtPt.y - pk[0]!.y) < 11) { bad = true; break; }
            if (ek.target === edge.target && Math.hypot(newTgtPt.x - pk[pk.length - 1]!.x, newTgtPt.y - pk[pk.length - 1]!.y) < 11) { bad = true; break; }
          }
          oldCross += countOrthogonalCrossings(pts, pk);
          newCross += countOrthogonalCrossings(updated, pk);
          if (hasCollinearOverlap(updated, pk, 3)) { bad = true; break; }
        }
        if (!bad && newCross <= oldCross) {
          setRoutePoints(ctx.routes[item.routeIdx]!, updated);
          finalPts[item.routeIdx] = updated;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase E4 (0.2.14 Slice 20): Shared-endpoint crossing elimination &
  // alternate-face escape (DRQ-14, DRQ-17, DRQ-19).
  // Bounded to graphs <= 120 routes to preserve R-026 large-graph budgets.
  // ---------------------------------------------------------------------------
  if (ctx.routes.length <= 120) {
    const finalPts = ctx.routes.map((r) => sectionPoints(r.sections));
    const hasMicroJog = (pts: readonly Point[]): boolean => {
      for (let si = 1; si < pts.length - 2; si++) {
        if (Math.hypot(pts[si + 1]!.x - pts[si]!.x, pts[si + 1]!.y - pts[si]!.y) < 12) return true;
      }
      return false;
    };
    const allBounds = [...ctx.rects.values()];
    const globalMinX = allBounds.length ? Math.min(...allBounds.map((r) => r.absolutePosition.x)) : 0;
    const globalMaxX = allBounds.length ? Math.max(...allBounds.map((r) => r.absolutePosition.x + r.width)) : 0;
    const globalMinY = allBounds.length ? Math.min(...allBounds.map((r) => r.absolutePosition.y)) : 0;
    const globalMaxY = allBounds.length ? Math.max(...allBounds.map((r) => r.absolutePosition.y + r.height)) : 0;

    const buildOrthogonalCandidates = (
      start: Point,
      sSide: PortSide,
      end: Point,
      tSide: PortSide,
      includeOuterBypass = false,
    ): Point[][] => {
      const cands: Point[][] = [];
      const sHoriz = sSide === 'EAST' || sSide === 'WEST';
      const tHoriz = tSide === 'EAST' || tSide === 'WEST';
      const sDir = sSide === 'EAST' || sSide === 'SOUTH' ? 1 : -1;
      const tDir = tSide === 'EAST' || tSide === 'SOUTH' ? 1 : -1;
      // 1. Direct straight line
      if ((sHoriz && tHoriz && Math.abs(start.y - end.y) <= EPS)
        || (!sHoriz && !tHoriz && Math.abs(start.x - end.x) <= EPS)) {
        cands.push(compactOrthogonal([start, end]));
      }
      // 2. Single-bend L-routes
      if (sHoriz && !tHoriz) {
        const corner = { x: end.x, y: start.y };
        if ((corner.x - start.x) * sDir >= 12 && (corner.y - end.y) * tDir >= 12) {
          cands.push(compactOrthogonal([start, corner, end]));
        }
      } else if (!sHoriz && tHoriz) {
        const corner = { x: start.x, y: end.y };
        if ((corner.y - start.y) * sDir >= 12 && (corner.x - end.x) * tDir >= 12) {
          cands.push(compactOrthogonal([start, corner, end]));
        }
      }
      // 3. 2-bend Z-routes at multiple corridor splits
      if (sHoriz && tHoriz) {
        for (const frac of [0.5, 0.3, 0.7, 0.2, 0.8]) {
          const midX = start.x + (end.x - start.x) * frac;
          if ((midX - start.x) * sDir >= 14 && (midX - end.x) * tDir >= 14) {
            cands.push(compactOrthogonal([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]));
          }
        }
        // Offset stubs near source/target
        for (const stub of [18, 28, 42]) {
          const mx1 = start.x + sDir * stub;
          if ((mx1 - end.x) * tDir >= 14) {
            cands.push(compactOrthogonal([start, { x: mx1, y: start.y }, { x: mx1, y: end.y }, end]));
          }
          const mx2 = end.x + tDir * stub;
          if ((mx2 - start.x) * sDir >= 14) {
            cands.push(compactOrthogonal([start, { x: mx2, y: start.y }, { x: mx2, y: end.y }, end]));
          }
        }
      } else if (!sHoriz && !tHoriz) {
        for (const frac of [0.5, 0.3, 0.7, 0.2, 0.8]) {
          const midY = start.y + (end.y - start.y) * frac;
          if ((midY - start.y) * sDir >= 14 && (midY - end.y) * tDir >= 14) {
            cands.push(compactOrthogonal([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]));
          }
        }
        if (includeOuterBypass) {
          // DRQ-19 outer return/bypass channels above/below the diagram envelope
          for (const pad of [22, 36, 52]) {
            if (sSide === 'NORTH' && tSide === 'NORTH') {
              const y = Math.min(start.y, end.y, globalMinY) - pad;
              cands.push(compactOrthogonal([start, { x: start.x, y }, { x: end.x, y }, end]));
            }
            if (sSide === 'SOUTH' && tSide === 'SOUTH') {
              const y = Math.max(start.y, end.y, globalMaxY) + pad;
              cands.push(compactOrthogonal([start, { x: start.x, y }, { x: end.x, y }, end]));
            }
          }
        }
      } else if (sHoriz && !tHoriz) {
        for (const stub of [20, 34, 50]) {
          const sx = start.x + sDir * stub;
          const ty = end.y + tDir * stub;
          cands.push(compactOrthogonal([start, { x: sx, y: start.y }, { x: sx, y: ty }, { x: end.x, y: ty }, end]));
        }
        // Step across in an intermediate horizontal corridor before approaching target
        for (const stub of [14, 24]) {
          const sx = start.x + sDir * stub;
          for (const frac of [0.25, 0.45, 0.65]) {
            const my = start.y + (end.y - start.y) * frac;
            if ((my - end.y) * tDir >= 14) {
              cands.push(compactOrthogonal([start, { x: sx, y: start.y }, { x: sx, y: my }, { x: end.x, y: my }, end]));
            }
          }
        }
        if (includeOuterBypass) {
          for (const xOut of [globalMinX - 22, globalMaxX + 22]) {
            const ty = end.y + tDir * 22;
            cands.push(compactOrthogonal([start, { x: xOut, y: start.y }, { x: xOut, y: ty }, { x: end.x, y: ty }, end]));
          }
        }
      } else if (!sHoriz && tHoriz) {
        for (const stub of [20, 34, 50]) {
          const sy = start.y + sDir * stub;
          const tx = end.x + tDir * stub;
          cands.push(compactOrthogonal([start, { x: start.x, y: sy }, { x: tx, y: sy }, { x: tx, y: end.y }, end]));
        }
        // Step vertically in an intermediate corridor before approaching target horizontally
        for (const stub of [14, 24]) {
          const sy = start.y + sDir * stub;
          for (const frac of [0.25, 0.45, 0.65]) {
            const mx = start.x + (end.x - start.x) * frac;
            if ((mx - end.x) * tDir >= 14) {
              cands.push(compactOrthogonal([start, { x: start.x, y: sy }, { x: mx, y: sy }, { x: mx, y: end.y }, end]));
            }
          }
        }
        if (includeOuterBypass) {
          for (const yOut of [globalMinY - 22, globalMaxY + 22]) {
            for (const xOut of [globalMinX - 22, globalMaxX + 22]) {
              cands.push(compactOrthogonal([start, { x: start.x, y: yOut }, { x: xOut, y: yOut }, { x: xOut, y: end.y }, end]));
            }
            const tx = end.x + tDir * 22;
            cands.push(compactOrthogonal([start, { x: start.x, y: yOut }, { x: tx, y: yOut }, { x: tx, y: end.y }, end]));
          }
        }
      }
      if (includeOuterBypass && sHoriz && tHoriz) {
        // Outer bypass above/below for horizontal-face edges (e.g. skip edges & back-edges)
        for (const y of [globalMinY - 22, globalMinY - 38, globalMaxY + 22, globalMaxY + 38]) {
          const sx = start.x + sDir * 20;
          const tx = end.x + tDir * 20;
          cands.push(compactOrthogonal([start, { x: sx, y: start.y }, { x: sx, y }, { x: tx, y }, { x: tx, y: end.y }, end]));
        }
      }
      if (includeOuterBypass && !sHoriz && !tHoriz) {
        for (const x of [globalMinX - 22, globalMinX - 38, globalMaxX + 22, globalMaxX + 38]) {
          const sy = start.y + sDir * 20;
          const ty = end.y + tDir * 20;
          cands.push(compactOrthogonal([start, { x: start.x, y: sy }, { x, y: sy }, { x, y: ty }, { x: end.x, y: ty }, end]));
        }
      }
      return cands;
    };
    const isRouteClean = (
      routeIdx: number,
      edge: GraphEdge,
      cand: readonly Point[],
      overrideMap?: ReadonlyMap<number, readonly Point[]>,
    ): boolean => {
      if (cand.length < 2 || !isPathOrthogonal(cand) || hasMicroJog(cand)) return false;
      const { boxes, srcFrame, tgtFrame } = collectObstaclesFor(edge, ctx.rects, ctx.nodeInfo);
      if (pathReentersEndNodes(cand, srcFrame, tgtFrame)) return false;
      if (pathHitsObstacles(cand, boxes, 1.5)) return false;
      if (containerCaptionBoxes.length > 0 && pathHitsObstacles(cand, containerCaptionBoxes, 2)) return false;
      if (tgtFrame && !isInwardApproach(cand[cand.length - 2]!, cand[cand.length - 1]!, tgtFrame).ok) return false;
      const orig = finalPts[routeIdx]!;
      if (pathBorderHugCount(cand, containers, 11.5) > pathBorderHugCount(orig, containers, 11.5)) return false;
      const sPt = cand[0]!;
      const tPt = cand[cand.length - 1]!;
      for (let k = 0; k < finalPts.length; k++) {
        if (k === routeIdx) continue;
        const pk = overrideMap?.get(k) ?? finalPts[k]!;
        if (hasCollinearOverlap(cand, pk, 3)) return false;
        const ek = edgeById.get(ctx.routes[k]!.id);
        if (ek) {
          if (ek.source === edge.source && Math.hypot(sPt.x - pk[0]!.x, sPt.y - pk[0]!.y) < 11) return false;
          if (ek.target === edge.source && Math.hypot(sPt.x - pk[pk.length - 1]!.x, sPt.y - pk[pk.length - 1]!.y) < 11) return false;
          if (ek.source === edge.target && Math.hypot(tPt.x - pk[0]!.x, tPt.y - pk[0]!.y) < 11) return false;
          if (ek.target === edge.target && Math.hypot(tPt.x - pk[pk.length - 1]!.x, tPt.y - pk[pk.length - 1]!.y) < 11) return false;
        }
      }
      return true;
    };
    const countCrossingsAgainstAll = (
      idx: number,
      cand: readonly Point[],
      overrideMap?: ReadonlyMap<number, readonly Point[]>,
    ): number => {
      let c = 0;
      for (let k = 0; k < finalPts.length; k++) {
        if (k === idx) continue;
        const pk = overrideMap?.get(k) ?? finalPts[k]!;
        c += countOrthogonalCrossings(cand, pk);
      }
      return c;
    };

    for (let pass = 0; pass < 3; pass++) {
      let improved = false;

      // Move 1 & 2: Pairwise shared-node port & rail swap (including diamonds & different faces).
      for (let i = 0; i < ctx.routes.length; i++) {
        const eA = edgeById.get(ctx.routes[i]!.id);
        if (!editable(eA)) continue;
        for (let j = i + 1; j < ctx.routes.length; j++) {
          const eB = edgeById.get(ctx.routes[j]!.id);
          if (!editable(eB)) continue;
          const pA = finalPts[i]!;
          const pB = finalPts[j]!;
          if (countOrthogonalCrossings(pA, pB) === 0) continue;

          const sharedEnds: Array<{ end: 'source' | 'target'; nodeId: string }> = [];
          if (eA.target === eB.target && !eA.targetPort && !eB.targetPort
            && !ctx.isFixedPort(eA.target, eA.targetPort) && !ctx.isFixedPort(eB.target, eB.targetPort)) {
            sharedEnds.push({ end: 'target', nodeId: eA.target });
          }
          if (eA.source === eB.source && !eA.sourcePort && !eB.sourcePort
            && !ctx.isFixedPort(eA.source, eA.sourcePort) && !ctx.isFixedPort(eB.source, eB.sourcePort)) {
            sharedEnds.push({ end: 'source', nodeId: eA.source });
          }

          let fixedPair = false;
          for (const { end, nodeId } of sharedEnds) {
            const info = ctx.nodeInfo(nodeId);
            if (!info || info.isContainer) continue;
            const ptA = end === 'source' ? pA[0]! : pA[pA.length - 1]!;
            const ptB = end === 'source' ? pB[0]! : pB[pB.length - 1]!;
            const sideA = inferContactSide(ptA, info.frame);
            const sideB = inferContactSide(ptB, info.frame);
            const otherNodeA = ctx.nodeInfo(end === 'source' ? eA.target : eA.source);
            const otherNodeB = ctx.nodeInfo(end === 'source' ? eB.target : eB.source);
            if (!otherNodeA || !otherNodeB) continue;
            const otherPtA = end === 'source' ? pA[pA.length - 1]! : pA[0]!;
            const otherPtB = end === 'source' ? pB[pB.length - 1]! : pB[0]!;
            const otherSideA = inferContactSide(otherPtA, otherNodeA.frame);
            const otherSideB = inferContactSide(otherPtB, otherNodeB.frame);

            const { boxes: boxesA } = collectObstaclesFor(eA, ctx.rects, ctx.nodeInfo);
            const { boxes: boxesB } = collectObstaclesFor(eB, ctx.rects, ctx.nodeInfo);

            const candsA: Point[][] = [];
            const candsB: Point[][] = [];
            // Direct reanchor onto swapped slot
            const rA = reanchorEndpointOrthogonal(pA, end, ptB, sideB, boxesA);
            const rB = reanchorEndpointOrthogonal(pB, end, ptA, sideA, boxesB);
            if (rA) candsA.push(rA);
            if (rB) candsB.push(rB);
            // Also try swapping penultimate rail X/Y when both routes have >= 4 points on same face
            if (sideA === sideB && end === 'target' && pA.length >= 4 && pB.length >= 4) {
              const horiz = sideA === 'WEST' || sideA === 'EAST';
              const railA = horiz ? pA[pA.length - 2]!.x : pA[pA.length - 2]!.y;
              const railB = horiz ? pB[pB.length - 2]!.x : pB[pB.length - 2]!.y;
              if (Math.abs(railA - railB) > 2) {
                const shiftRail = (orig: readonly Point[], newEnd: Point, newRail: number): Point[] => {
                  const copy = orig.map((p) => ({ ...p }));
                  const n = copy.length;
                  if (horiz) {
                    copy[n - 1] = { ...newEnd };
                    copy[n - 2] = { x: newRail, y: newEnd.y };
                    copy[n - 3] = { x: newRail, y: copy[n - 3]!.y };
                  } else {
                    copy[n - 1] = { ...newEnd };
                    copy[n - 2] = { x: newEnd.x, y: newRail };
                    copy[n - 3] = { x: copy[n - 3]!.x, y: newRail };
                  }
                  return compactOrthogonal(copy);
                };
                candsA.push(shiftRail(pA, ptB, railB));
                candsB.push(shiftRail(pB, ptA, railA));
              }
            }
            // Fresh clean L/Z candidates between swapped endpoints
            if (end === 'source') {
              candsA.push(...buildOrthogonalCandidates(ptB, sideB, otherPtA, otherSideA));
              candsB.push(...buildOrthogonalCandidates(ptA, sideA, otherPtB, otherSideB));
            } else {
              candsA.push(...buildOrthogonalCandidates(otherPtA, otherSideA, ptB, sideB));
              candsB.push(...buildOrthogonalCandidates(otherPtB, otherSideB, ptA, sideA));
            }

            const oldCross = countCrossingsAgainstAll(i, pA) + countCrossingsAgainstAll(j, pB) - countOrthogonalCrossings(pA, pB);
            let bestPair: { a: Point[]; b: Point[]; cross: number; bends: number } | undefined;
            for (const cA of candsA) {
              for (const cB of candsB) {
                const ov = new Map<number, readonly Point[]>([[i, cA], [j, cB]]);
                if (!isRouteClean(i, eA, cA, ov) || !isRouteClean(j, eB, cB, ov)) continue;
                const newCross = countCrossingsAgainstAll(i, cA, ov) + countCrossingsAgainstAll(j, cB, ov) - countOrthogonalCrossings(cA, cB);
                const newBends = (cA.length - 2) + (cB.length - 2);
                if (newCross < oldCross && (!bestPair || newCross < bestPair.cross || (newCross === bestPair.cross && newBends < bestPair.bends))) {
                  bestPair = { a: cA, b: cB, cross: newCross, bends: newBends };
                }
              }
            }
            if (bestPair) {
              setRoutePoints(ctx.routes[i]!, bestPair.a);
              setRoutePoints(ctx.routes[j]!, bestPair.b);
              finalPts[i] = bestPair.a;
              finalPts[j] = bestPair.b;
              improved = true;
              fixedPair = true;
              break;
            }
          }
          if (fixedPair) break;
        }
      }

      // Move 3: Single-edge crossing-free reroute & alternate-face escape.
      // Same-endpoint rerouting is safe even on fixed-port diamonds (e.g. c04, c06);
      // alternate-face moves remain gated per-end on !isFixedPort and no authored port.
      for (let i = 0; i < ctx.routes.length; i++) {
        const edge = edgeById.get(ctx.routes[i]!.id);
        if (!editable(edge)) continue;
        const orig = finalPts[i]!;
        const oldCross = countCrossingsAgainstAll(i, orig);
        if (oldCross === 0) continue;
        const srcInfo = ctx.nodeInfo(edge.source);
        const tgtInfo = ctx.nodeInfo(edge.target);
        if (!srcInfo || !tgtInfo || srcInfo.isContainer || tgtInfo.isContainer) continue;
        const curTgtPt = orig[orig.length - 1]!;
        const curTgtSide = inferContactSide(curTgtPt, tgtInfo.frame);
        const curSrcPt = orig[0]!;
        const curSrcSide = inferContactSide(curSrcPt, srcInfo.frame);
        const srcFree = !edge.sourcePort && !ctx.isFixedPort(edge.source, edge.sourcePort);
        const tgtFree = !edge.targetPort && !ctx.isFixedPort(edge.target, edge.targetPort);

        let best: { pts: Point[]; cross: number; bends: number } | undefined;
        // 3a. Same exact endpoints, cleaner intermediate corridor or outer bypass
        for (const cand of buildOrthogonalCandidates(curSrcPt, curSrcSide, curTgtPt, curTgtSide, true)) {
          if (!isRouteClean(i, edge, cand)) continue;
          const newCross = countCrossingsAgainstAll(i, cand);
          const newBends = cand.length - 2;
          if (newCross < oldCross && (!best || newCross < best.cross || (newCross === best.cross && newBends < best.bends))) {
            best = { pts: cand, cross: newCross, bends: newBends };
          }
        }
        const tryAltStart = (side: PortSide) => {
          if (!srcFree) return;
          if (side === 'SOUTH' && srcInfo.hasBottomCaption) return;
          if (side === 'EAST' && srcInfo.hasRightCaption) return;
          const horizSide = side === 'NORTH' || side === 'SOUTH';
          const spanStart = horizSide ? srcInfo.frame.x + srcInfo.frame.width * 0.2 : srcInfo.frame.y + srcInfo.frame.height * 0.2;
          const spanEnd = horizSide ? srcInfo.frame.x + srcInfo.frame.width * 0.8 : srcInfo.frame.y + srcInfo.frame.height * 0.8;
          for (const f of [0.5, 0.25, 0.75, 0.1, 0.9]) {
            const coord = spanStart + (spanEnd - spanStart) * f;
            const sPt = ctx.contourContact?.(edge.source, side, coord)
              ?? (horizSide
                ? { x: coord, y: side === 'NORTH' ? srcInfo.frame.y : srcInfo.frame.y + srcInfo.frame.height }
                : { x: side === 'WEST' ? srcInfo.frame.x : srcInfo.frame.x + srcInfo.frame.width, y: coord });
            for (const cand of buildOrthogonalCandidates(sPt, side, curTgtPt, curTgtSide, true)) {
              if (!isRouteClean(i, edge, cand)) continue;
              const newCross = countCrossingsAgainstAll(i, cand);
              const newBends = cand.length - 2;
              if (newCross < oldCross && (!best || newCross < best.cross || (newCross === best.cross && newBends < best.bends))) {
                best = { pts: cand, cross: newCross, bends: newBends };
              }
            }
          }
        };
        const tryAltEnd = (side: PortSide) => {
          if (!tgtFree) return;
          if (side === 'SOUTH' && tgtInfo.hasBottomCaption) return;
          if (side === 'EAST' && tgtInfo.hasRightCaption) return;
          const horizSide = side === 'NORTH' || side === 'SOUTH';
          const spanStart = horizSide ? tgtInfo.frame.x + tgtInfo.frame.width * 0.2 : tgtInfo.frame.y + tgtInfo.frame.height * 0.2;
          const spanEnd = horizSide ? tgtInfo.frame.x + tgtInfo.frame.width * 0.8 : tgtInfo.frame.y + tgtInfo.frame.height * 0.8;
          for (const f of [0.5, 0.25, 0.75, 0.1, 0.9]) {
            const coord = spanStart + (spanEnd - spanStart) * f;
            const tPt = ctx.contourContact?.(edge.target, side, coord)
              ?? (horizSide
                ? { x: coord, y: side === 'NORTH' ? tgtInfo.frame.y : tgtInfo.frame.y + tgtInfo.frame.height }
                : { x: side === 'WEST' ? tgtInfo.frame.x : tgtInfo.frame.x + tgtInfo.frame.width, y: coord });
            for (const cand of buildOrthogonalCandidates(curSrcPt, curSrcSide, tPt, side, true)) {
              if (!isRouteClean(i, edge, cand)) continue;
              const newCross = countCrossingsAgainstAll(i, cand);
              const newBends = cand.length - 2;
              if (newCross < oldCross && (!best || newCross < best.cross || (newCross === best.cross && newBends < best.bends))) {
                best = { pts: cand, cross: newCross, bends: newBends };
              }
            }
          }
        };
        for (const side of ['EAST', 'WEST', 'NORTH', 'SOUTH'] as const) {
          tryAltStart(side);
          tryAltEnd(side);
        }
        // Also try paired NORTH->NORTH / SOUTH->SOUTH outer return channels (DRQ-19)
        // when changing both ends simultaneously eliminates a back-edge crossing.
        if (srcFree && tgtFree && (!best || best.cross > 0)) {
          for (const pairSide of ['NORTH', 'SOUTH'] as const) {
            if (pairSide === 'SOUTH' && (srcInfo.hasBottomCaption || tgtInfo.hasBottomCaption)) continue;
            const sx = srcInfo.frame.x + srcInfo.frame.width / 2;
            const tx = tgtInfo.frame.x + tgtInfo.frame.width / 2;
            const sPt = ctx.contourContact?.(edge.source, pairSide, sx)
              ?? { x: sx, y: pairSide === 'NORTH' ? srcInfo.frame.y : srcInfo.frame.y + srcInfo.frame.height };
            const tPt = ctx.contourContact?.(edge.target, pairSide, tx)
              ?? { x: tx, y: pairSide === 'NORTH' ? tgtInfo.frame.y : tgtInfo.frame.y + tgtInfo.frame.height };
            for (const cand of buildOrthogonalCandidates(sPt, pairSide, tPt, pairSide, true)) {
              if (!isRouteClean(i, edge, cand)) continue;
              const newCross = countCrossingsAgainstAll(i, cand);
              const newBends = cand.length - 2;
              if (newCross < oldCross && (!best || newCross < best.cross || (newCross === best.cross && newBends < best.bends))) {
                best = { pts: cand, cross: newCross, bends: newBends };
              }
            }
          }
        }
        if (best) {
          setRoutePoints(ctx.routes[i]!, best.pts);
          finalPts[i] = best.pts;
          improved = true;
        }
      }

      if (!improved) break;
    }

    // Move 4 (DRQ-19): Bend-parsimony simplification for high-bend routes (>= 3 bends)
    // without introducing any crossing or Tier-1 defect.
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!editable(edge)) continue;
      const orig = finalPts[i]!;
      if (orig.length < 5) continue;
      const srcInfo = ctx.nodeInfo(edge.source);
      const tgtInfo = ctx.nodeInfo(edge.target);
      if (!srcInfo || !tgtInfo || srcInfo.isContainer || tgtInfo.isContainer) continue;
      const sPt = orig[0]!;
      const tPt = orig[orig.length - 1]!;
      const sSide = inferContactSide(sPt, srcInfo.frame);
      const tSide = inferContactSide(tPt, tgtInfo.frame);
      const oldCross = countCrossingsAgainstAll(i, orig);
      let best: { pts: Point[]; bends: number } | undefined;
      for (const cand of buildOrthogonalCandidates(sPt, sSide, tPt, tSide, false)) {
        const bends = cand.length - 2;
        if (bends >= orig.length - 2) continue;
        if (!isRouteClean(i, edge, cand)) continue;
        if (countCrossingsAgainstAll(i, cand) > oldCross) continue;
        if (!best || bends < best.bends) best = { pts: cand, bends };
      }
      if (best) {
        setRoutePoints(ctx.routes[i]!, best.pts);
        finalPts[i] = best.pts;
      }
    }

    // Move 5: Normal-exit stub guard for routes leaving a diamond vertex tangentially
    // (e.g. horizontal exit from a diamond's NORTH/SOUTH vertex). Fixing this
    // here prevents validateFinalRoutes028 from invoking fallback libavoid repair
    // that can re-introduce avoidable crossings (c04 e7, c06 e2).
    for (let i = 0; i < ctx.routes.length; i++) {
      const edge = edgeById.get(ctx.routes[i]!.id);
      if (!editable(edge)) continue;
      const orig = finalPts[i]!;
      if (orig.length < 2) continue;
      const srcInfo = ctx.nodeInfo(edge.source);
      const tgtInfo = ctx.nodeInfo(edge.target);
      if (!srcInfo || !tgtInfo || srcInfo.isContainer || tgtInfo.isContainer) continue;
      if (srcInfo.shapeId !== 'diamond') continue;
      const sPt = orig[0]!;
      const sNext = orig[1]!;
      const tPt = orig[orig.length - 1]!;
      const sSide = inferContactSide(sPt, srcInfo.frame);
      const tSide = inferContactSide(tPt, tgtInfo.frame);
      const tangentVerticalSide = (sSide === 'NORTH' || sSide === 'SOUTH') && Math.abs(sNext.y - sPt.y) <= EPS && Math.abs(sNext.x - sPt.x) > EPS;
      const tangentHorizSide = (sSide === 'WEST' || sSide === 'EAST') && Math.abs(sNext.x - sPt.x) <= EPS && Math.abs(sNext.y - sPt.y) > EPS;
      if (!tangentVerticalSide && !tangentHorizSide) continue;
      const cands: Point[][] = [];
      // 1. Keep existing route geometry by simply inserting a clean normal stub before orig[1]
      if (tangentVerticalSide && orig.length >= 3) {
        const dir = sSide === 'NORTH' ? -1 : 1;
        for (const stub of [14, 22]) {
          const sy = sPt.y + dir * stub;
          cands.push(compactOrthogonal([sPt, { x: sPt.x, y: sy }, { x: sNext.x, y: sy }, ...orig.slice(2)]));
        }
      } else if (tangentHorizSide && orig.length >= 3) {
        const dir = sSide === 'WEST' ? -1 : 1;
        for (const stub of [14, 22]) {
          const sx = sPt.x + dir * stub;
          cands.push(compactOrthogonal([sPt, { x: sx, y: sPt.y }, { x: sx, y: sNext.y }, ...orig.slice(2)]));
        }
      }
      // 2. Also include clean orthogonal & outer-bypass candidates exiting normally
      cands.push(...buildOrthogonalCandidates(sPt, sSide, tPt, tSide, true));
      let best: { pts: Point[]; hugs: number; cross: number; bends: number } | undefined;
      for (const cand of cands) {
        if (!isRouteClean(i, edge, cand)) continue;
        // Require the candidate to actually exit normally from sSide
        const cNext = cand[1]!;
        if (sSide === 'NORTH' && !(cNext.y < sPt.y - 4 && Math.abs(cNext.x - sPt.x) <= EPS)) continue;
        if (sSide === 'SOUTH' && !(cNext.y > sPt.y + 4 && Math.abs(cNext.x - sPt.x) <= EPS)) continue;
        if (sSide === 'WEST' && !(cNext.x < sPt.x - 4 && Math.abs(cNext.y - sPt.y) <= EPS)) continue;
        if (sSide === 'EAST' && !(cNext.x > sPt.x + 4 && Math.abs(cNext.y - sPt.y) <= EPS)) continue;
        const hugs = pathBorderHugCount(cand, containers, 11.5);
        const cross = countCrossingsAgainstAll(i, cand);
        const bends = cand.length - 2;
        if (!best || hugs < best.hugs || (hugs === best.hugs && (cross < best.cross || (cross === best.cross && bends < best.bends)))) {
          best = { pts: cand, hugs, cross, bends };
        }
      }
      if (best) {
        setRoutePoints(ctx.routes[i]!, best.pts);
        finalPts[i] = best.pts;
      }
    }
  }
}
