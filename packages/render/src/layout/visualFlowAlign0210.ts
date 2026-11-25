/** Visual-center and parent/child bisection alignment for unconstrained acyclic layered flows (DRQ-02..04, 12..18). */
import type { GraphEdge, GraphIR } from '@graph-ir/core';
import { segmentIntersectsBox } from './routeGeometry.js';
import type { LayoutDirection, LayoutSection, Point } from './types.js';

export interface AlignableRect {
  id: string;
  position: Point;
  absolutePosition: Point;
  width: number;
  height: number;
  fixed: boolean;
}

export interface VisualNodeMetrics0210 {
  centerOffsetX: number;
  centerOffsetY: number;
  glyphWidth: number;
  glyphHeight: number;
  hasBottomCaption: boolean;
  captionBox?: { x: number; y: number; width: number; height: number };
}

export interface VisualFlowAlignResult0210 {
  aligned: boolean;
  layerOf: Map<string, number>;
  corridorMid: number[];
  visualCenter: Map<string, Point>;
}

function projectNonOverlapping(targets: readonly number[], minGaps: readonly number[]): number[] {
  const n = targets.length;
  if (n <= 1) return [...targets];
  const off = [0];
  for (let i = 1; i < n; i++) off.push(off[i - 1]! + minGaps[i - 1]!);
  const blocks: Array<{ s: number; e: number; sum: number; k: number }> = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ s: i, e: i, sum: targets[i]! - off[i]!, k: 1 });
    while (blocks.length > 1) {
      const a = blocks[blocks.length - 2]!, b = blocks[blocks.length - 1]!;
      if (a.sum / a.k <= b.sum / b.k + 1e-9) break;
      blocks.pop();
      a.e = b.e; a.sum += b.sum; a.k += b.k;
    }
  }
  const out = new Array<number>(n);
  for (const b of blocks) for (let i = b.s; i <= b.e; i++) out[i] = b.sum / b.k + off[i]!;
  return out;
}

export function alignVisualFlow0210(
  graph: GraphIR,
  rects: Map<string, AlignableRect>,
  metricsOf: (rect: AlignableRect) => VisualNodeMetrics0210,
  direction: LayoutDirection,
  nodeSpacing: number,
  layerSpacing: number,
): VisualFlowAlignResult0210 {
  const empty: VisualFlowAlignResult0210 = { aligned: false, layerOf: new Map(), corridorMid: [], visualCenter: new Map() };
  const ids = [...rects.keys()];
  if (rects.size < 2 || !graph.edges.length) return empty;

  const horiz = direction === 'RIGHT' || direction === 'LEFT';
  const rev = direction === 'LEFT' || direction === 'UP';
  const m = new Map([...rects.values()].map((r) => [r.id, metricsOf(r)]));
  const p0 = (r: AlignableRect) => (horiz ? r.absolutePosition.x : r.absolutePosition.y);
  const p1 = (r: AlignableRect) => p0(r) + (horiz ? r.width : r.height);
  const cInit = (r: AlignableRect) => (horiz ? r.absolutePosition.y + m.get(r.id)!.centerOffsetY : r.absolutePosition.x + m.get(r.id)!.centerOffsetX);

  const rawLayers: AlignableRect[][] = [];
  for (const r of [...rects.values()].sort((a, b) => p0(a) - p0(b))) {
    const last = rawLayers.at(-1);
    if (last && p0(r) < Math.max(...last.map(p1)) - 1) last.push(r);
    else rawLayers.push([r]);
  }
  if (rawLayers.length < 2) return empty;
  const layers = rev ? rawLayers.reverse() : rawLayers;
  const layerOf = new Map<string, number>();
  layers.forEach((layer, li) => {
    layer.sort((a, b) => cInit(a) - cInit(b) || a.id.localeCompare(b.id));
    layer.forEach((r) => layerOf.set(r.id, li));
  });

  // Strict layer advancement guarantees a simple acyclic DAG.
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of graph.edges) {
    const sl = layerOf.get(e.source), tl = layerOf.get(e.target);
    if (sl === undefined || tl === undefined || sl >= tl) return empty;
    parents.get(e.target)!.push(e.source);
    children.get(e.source)!.push(e.target);
  }

  const cBefore = (id: string) => (horiz ? m.get(id)!.centerOffsetY : m.get(id)!.centerOffsetX);
  const cAfter = (id: string) => (horiz ? rects.get(id)!.height : rects.get(id)!.width) - cBefore(id);
  const minSep = (u: string, v: string) => Math.max(
    cAfter(u) + Math.max(40, nodeSpacing) + cBefore(v),
    !horiz && (m.get(u)!.hasBottomCaption || m.get(v)!.hasBottomCaption) && children.get(u)!.some((ch) => children.get(v)!.includes(ch))
      ? 2 * (Math.max(cAfter(u), cBefore(u), cAfter(v), cBefore(v)) + 34) : 0,
  );

  let pairPitch = 0;
  for (const l of layers) if (l.length === 2) pairPitch = Math.max(pairPitch, minSep(l[0]!.id, l[1]!.id));
  const c = new Map([...rects.values()].map((r) => [r.id, cInit(r)]));
  if (pairPitch > 0) {
    for (const l of layers) if (l.length === 2) {
      const mid = (c.get(l[0]!.id)! + c.get(l[1]!.id)!) / 2;
      c.set(l[0]!.id, mid - pairPitch / 2);
      c.set(l[1]!.id, mid + pairPitch / 2);
    }
  }

  const spineMid = (layer: AlignableRect[]): number | undefined => {
    if (layer.length !== 2) return undefined;
    const [a, b] = layer.map((r) => r.id) as [string, string];
    const shared = (map: Map<string, string[]>) =>
      map.get(a)!.filter((id) => map.get(b)!.includes(id) && layers[layerOf.get(id)!]!.length === 1);
    const anchors = [...(shared(parents).length === 1 ? [c.get(shared(parents)[0]!)!] : []),
      ...(shared(children).length === 1 ? [c.get(shared(children)[0]!)!] : [])];
    return anchors.length ? anchors.reduce((x, y) => x + y, 0) / anchors.length : undefined;
  };

  for (let iter = 0; iter < 24; iter++) {
    for (let step = 0; step < layers.length; step++) {
      const li = iter % 2 === 0 ? step : layers.length - 1 - step;
      const layer = layers[li]!;
      const mid = spineMid(layer);
      if (layer.length === 2 && mid !== undefined && pairPitch > 0) {
        c.set(layer[0]!.id, mid - pairPitch / 2);
        c.set(layer[1]!.id, mid + pairPitch / 2);
        continue;
      }
      if (layer.length === 2 && pairPitch > 0) {
        const adj = [layers[li + 1], layers[li - 1]].find((peer) => peer?.length === 2);
        if (adj) {
          c.set(layer[0]!.id, c.get(adj[0]!.id)!);
          c.set(layer[1]!.id, c.get(adj[1]!.id)!);
          continue;
        }
      }
      const desired = layer.map((r, si) => {
        const ps = parents.get(r.id)!, cs = children.get(r.id)!, s: number[] = [];
        if (ps.length) { const v = ps.map((p) => c.get(p)!); s.push((Math.min(...v) + Math.max(...v)) / 2); }
        else if (li > 0 && layers[li - 1]!.length === layer.length) s.push(c.get(layers[li - 1]![si]!.id)!);
        if (cs.length) { const v = cs.map((ch) => c.get(ch)!); s.push((Math.min(...v) + Math.max(...v)) / 2); }
        else if (li + 1 < layers.length && layers[li + 1]!.length === layer.length) s.push(c.get(layers[li + 1]![si]!.id)!);
        return s.length ? s.reduce((x, y) => x + y, 0) / s.length : c.get(r.id)!;
      });
      const projected = projectNonOverlapping(desired, layer.slice(1).map((r, i) => minSep(layer[i]!.id, r.id)));
      layer.forEach((r, i) => c.set(r.id, projected[i]!));
    }
  }

  // DRQ-04 rigid-block upstream shift: when an odd-sized layer (>= 3) of siblings
  // all feed a single join node in the next layer, shift the block rigidly so the
  // middle parent stays dead-straight (0 bends) with the join while keeping exact spacing.
  for (let li = layers.length - 2; li >= 0; li--) {
    const layer = layers[li]!;
    if (layer.length < 3 || layer.length % 2 === 0) continue;
    const sharedTargets = new Set(layer.flatMap((r) => children.get(r.id)!));
    if (sharedTargets.size !== 1) continue;
    const joinId = [...sharedTargets][0]!;
    if (layerOf.get(joinId) !== li + 1) continue;
    const midParent = layer[Math.floor(layer.length / 2)]!;
    const delta = c.get(joinId)! - c.get(midParent.id)!;
    if (Math.abs(delta) > 0.5 && Math.abs(delta) <= 80) {
      for (const r of layer) c.set(r.id, c.get(r.id)! + delta);
    }
  }

  const shift = 12 - Math.min(...ids.map((id) => c.get(id)! - cBefore(id)));
  for (const id of ids) c.set(id, c.get(id)! + shift);

  const pBefore = (id: string) => (horiz ? m.get(id)!.centerOffsetX : m.get(id)!.centerOffsetY);
  const pAfter = (id: string) => (horiz ? rects.get(id)!.width : rects.get(id)!.height) - pBefore(id);
  const layerGap = Math.max(60, layerSpacing);
  const primLayers = rev ? [...layers].reverse() : layers;
  const pCenter = new Map<AlignableRect[], number>();
  const bounds: Array<{ s: number; e: number }> = [];
  let cursor = 12;
  for (const layer of primLayers) {
    const before = Math.max(...layer.map((r) => pBefore(r.id)));
    const after = Math.max(...layer.map((r) => pAfter(r.id)));
    pCenter.set(layer, cursor + before);
    bounds.push({ s: cursor, e: cursor + before + after });
    cursor += before + after + layerGap;
  }

  const visualCenter = new Map<string, Point>();
  for (const layer of layers) {
    const pc = pCenter.get(layer)!;
    for (const r of layer) {
      const cc = c.get(r.id)!, rm = m.get(r.id)!;
      const x = (horiz ? pc : cc) - rm.centerOffsetX;
      const y = (horiz ? cc : pc) - rm.centerOffsetY;
      r.position = { x, y };
      r.absolutePosition = { x, y };
      visualCenter.set(r.id, { x: x + rm.centerOffsetX, y: y + rm.centerOffsetY });
    }
  }

  const flowBounds = rev ? [...bounds].reverse() : bounds;
  const corridorMid = flowBounds.slice(0, -1).map((a, i) => {
    const b = flowBounds[i + 1]!;
    return rev ? (b.e + a.s) / 2 : (a.e + b.s) / 2;
  });
  return { aligned: true, layerOf, corridorMid, visualCenter };
}

export function buildAlignedFlowRoute0210(
  edge: GraphEdge,
  align: VisualFlowAlignResult0210,
  rects: Map<string, AlignableRect>,
  metricsOf: (rect: AlignableRect) => VisualNodeMetrics0210,
  contourContact: (rect: AlignableRect, toward: Point, axis: 'x' | 'y') => Point,
  direction: LayoutDirection,
  allEdges: readonly GraphEdge[],
): LayoutSection[] | undefined {
  if (!align.aligned || edge.routeIntent) return undefined;
  const sl = align.layerOf.get(edge.source), tl = align.layerOf.get(edge.target);
  if (sl === undefined || tl === undefined || tl !== sl + 1) return undefined;

  const src = rects.get(edge.source)!, tgt = rects.get(edge.target)!;
  const srcVc = align.visualCenter.get(edge.source)!, tgtVc = align.visualCenter.get(edge.target)!;
  const srcM = metricsOf(src), tgtM = metricsOf(tgt);
  const horiz = direction === 'RIGHT' || direction === 'LEFT';
  const sign = direction === 'RIGHT' || direction === 'DOWN' ? 1 : -1;
  const mid = align.corridorMid[sl]!;

  const accept = (startPoint: Point, bendPoints: Point[], endPoint: Point): LayoutSection[] | undefined => {
    const pts = [startPoint, ...bendPoints, endPoint];
    for (const r of rects.values()) {
      if (r.id === edge.source || r.id === edge.target) continue;
      const box = { x: r.absolutePosition.x - 4, y: r.absolutePosition.y - 4, width: r.width + 8, height: r.height + 8 };
      for (let i = 1; i < pts.length; i++) if (segmentIntersectsBox(pts[i - 1]!, pts[i]!, box)) return undefined;
    }
    return [{ startPoint, bendPoints, endPoint }];
  };

  const incoming = allEdges
    .filter((e) => e.target === edge.target && align.layerOf.get(e.source) === sl)
    .sort((a, b) => (horiz ? align.visualCenter.get(a.source)!.y - align.visualCenter.get(b.source)!.y
      : align.visualCenter.get(a.source)!.x - align.visualCenter.get(b.source)!.x) || a.id.localeCompare(b.id));

  if (horiz) {
    const outgoing = allEdges
      .filter((e) => e.source === edge.source && align.layerOf.get(e.target) === tl)
      .sort((a, b) => align.visualCenter.get(a.target)!.y - align.visualCenter.get(b.target)!.y || a.id.localeCompare(b.id));
    const spreadY = (list: GraphEdge[], anchorY: number, otherY: number, span: number, otherOf: (e: GraphEdge) => number) => {
      if (list.length < 2) return anchorY;
      const maxSpan = span * (list.length >= 4 ? 0.78 : 0.52);
      const step = Math.min(24, Math.max(12, Math.floor(maxSpan / (list.length - 1))));
      const clampedStep = step * (list.length - 1) > span * 0.84 ? (span * 0.84) / (list.length - 1) : step;
      if (list.length === 3 && list.some((e) => Math.abs(otherOf(e) - anchorY) <= 1)) {
        return Math.abs(otherY - anchorY) <= 1 ? anchorY : anchorY + (otherY < anchorY ? -clampedStep : clampedStep);
      }
      return anchorY + (list.findIndex((e) => e.id === edge.id) - (list.length - 1) / 2) * clampedStep;
    };
    const startY = spreadY(outgoing, srcVc.y, tgtVc.y, srcM.glyphHeight, (e) => align.visualCenter.get(e.target)!.y);
    const endY = spreadY(incoming, tgtVc.y, srcVc.y, tgtM.glyphHeight, (e) => align.visualCenter.get(e.source)!.y);
    if (Math.abs(startY - endY) <= 1) {
      const y = (startY + endY) / 2;
      const s = contourContact(src, { x: srcVc.x + sign * 1000, y }, 'y');
      const e = contourContact(tgt, { x: tgtVc.x - sign * 1000, y }, 'y');
      if (Math.abs(s.y - e.y) <= 1) { const straight = accept(s, [], e); if (straight) return straight; }
    }
    const s = contourContact(src, { x: mid, y: startY }, 'y');
    const e = contourContact(tgt, { x: mid, y: endY }, 'y');
    // DRQ-14 / DRQ-18 planar nested corridor rail assignment:
    // Avoid stacking multiple vertical bends on the same scalar x = mid.
    // Fan-out: outer branches turn earlier (closer to src), inner later -> 0 crossings.
    // Fan-in:  inner branches turn earlier (closer to src), outer later -> 0 crossings.
    const corrMin = Math.min(s.x, e.x) + 12;
    const corrMax = Math.max(s.x, e.x) - 12;
    let laneX = mid;
    const goingUp = e.y < s.y - 1;
    const goingDown = e.y > s.y + 1;
    if (outgoing.length > 1 && (goingUp || goingDown)) {
      const sameDir = outgoing
        .filter((o) => {
          const ty = align.visualCenter.get(o.target)!.y;
          return goingUp ? ty < srcVc.y - 1 : ty > srcVc.y + 1;
        })
        .sort((a, b) => {
          const da = Math.abs(align.visualCenter.get(a.target)!.y - srcVc.y);
          const db = Math.abs(align.visualCenter.get(b.target)!.y - srcVc.y);
          return db - da || a.id.localeCompare(b.id); // outermost first
        });
      if (sameDir.length > 1) {
        const idx = sameDir.findIndex((o) => o.id === edge.id);
        const step = Math.min(14, Math.max(8, (corrMax - corrMin) / Math.max(2, sameDir.length)));
        const offset = (idx - (sameDir.length - 1) / 2) * step * sign;
        laneX = Math.max(corrMin, Math.min(corrMax, mid + offset));
      }
    } else if (incoming.length > 1 && (goingUp || goingDown)) {
      const sameDir = incoming
        .filter((o) => {
          const sy = align.visualCenter.get(o.source)!.y;
          return goingUp ? sy > tgtVc.y + 1 : sy < tgtVc.y - 1;
        })
        .sort((a, b) => {
          const da = Math.abs(align.visualCenter.get(a.source)!.y - tgtVc.y);
          const db = Math.abs(align.visualCenter.get(b.source)!.y - tgtVc.y);
          return da - db || a.id.localeCompare(b.id); // innermost first
        });
      if (sameDir.length > 1) {
        const idx = sameDir.findIndex((o) => o.id === edge.id);
        const step = Math.min(14, Math.max(8, (corrMax - corrMin) / Math.max(2, sameDir.length)));
        const offset = (idx - (sameDir.length - 1) / 2) * step * sign;
        laneX = Math.max(corrMin, Math.min(corrMax, mid + offset));
      }
    }
    return accept(s, [{ x: laneX, y: s.y }, { x: laneX, y: e.y }], e);
  }

  const isDown = direction === 'DOWN';
  const exitCap = isDown && srcM.hasBottomCaption;
  const enterCap = !isDown && tgtM.hasBottomCaption;
  const symOff = Math.min(24, Math.max(12, Math.floor(tgtM.glyphWidth * 0.24)));
  const entryX = (() => {
    if (incoming.length < 2) return tgtVc.x;
    const coaxOther = incoming.find((e) => e.id !== edge.id && Math.abs(align.visualCenter.get(e.source)!.x - tgtVc.x) <= 1);
    if (coaxOther && !(isDown && metricsOf(rects.get(coaxOther.source)!).hasBottomCaption)) {
      return srcVc.x < tgtVc.x ? tgtVc.x - symOff : tgtVc.x + symOff;
    }
    if (Math.abs(srcVc.x - tgtVc.x) <= 1 && !exitCap) return tgtVc.x;
    const step = Math.min(symOff * 2, Math.max(20, Math.floor((tgtM.glyphWidth * 0.5) / (incoming.length - 1))));
    return tgtVc.x + (incoming.findIndex((e) => e.id === edge.id) - (incoming.length - 1) / 2) * step;
  })();

  if (Math.abs(srcVc.x - tgtVc.x) <= 1 && !exitCap && !enterCap) {
    const x = (srcVc.x + tgtVc.x) / 2;
    const s = contourContact(src, { x, y: srcVc.y + sign * 1000 }, 'x');
    const e = contourContact(tgt, { x, y: tgtVc.y - sign * 1000 }, 'x');
    if (Math.abs(s.x - e.x) <= 1) { const straight = accept(s, [], e); if (straight) return straight; }
  }

  if (exitCap) {
    const cap = srcM.captionBox
      ? { x: src.absolutePosition.x + srcM.captionBox.x, y: src.absolutePosition.y + srcM.captionBox.y, width: srcM.captionBox.width, height: srcM.captionBox.height }
      : { x: src.absolutePosition.x, y: src.absolutePosition.y, width: src.width, height: src.height };
    const capL = cap.x - 10, capR = cap.x + cap.width + 10;
    const baseDropY = Math.max(cap.y + cap.height + 10, mid);
    const tier = Math.floor(Math.abs(incoming.findIndex((e) => e.id === edge.id) - (incoming.length - 1) / 2));
    const dropY = Math.max(baseDropY, Math.min(baseDropY + tier * 14, tgt.absolutePosition.y - 14));

    const goLeft = tgtVc.x < srcVc.x;
    // DRQ-14 / DRQ-17: when >= 2 branches exit the same side (WEST or EAST) of a
    // bottom-captioned node in DOWN, stagger their departure Y heights so outer
    // targets exit higher and clear inner vertical drops with 0 overlap & 0 crossings.
    const sameSideOut = Math.abs(srcVc.x - tgtVc.x) > 1
      ? allEdges
        .filter((e) => e.source === edge.source && align.layerOf.get(e.target) === tl
          && (goLeft ? align.visualCenter.get(e.target)!.x < srcVc.x - 1 : align.visualCenter.get(e.target)!.x > srcVc.x + 1))
        .sort((a, b) => {
          const da = Math.abs(align.visualCenter.get(a.target)!.x - srcVc.x);
          const db = Math.abs(align.visualCenter.get(b.target)!.x - srcVc.x);
          return db - da || a.id.localeCompare(b.id); // outermost first -> higher Y
        })
      : [];
    const exitY = (() => {
      if (sameSideOut.length < 2) return srcVc.y;
      const idx = sameSideOut.findIndex((e) => e.id === edge.id);
      const step = Math.min(18, Math.max(12, Math.floor((srcM.glyphHeight * 0.55) / (sameSideOut.length - 1))));
      const clampedStep = step * (sameSideOut.length - 1) > srcM.glyphHeight * 0.68
        ? (srcM.glyphHeight * 0.68) / (sameSideOut.length - 1) : step;
      return srcVc.y + (idx - (sameSideOut.length - 1) / 2) * clampedStep;
    })();
    if (Math.abs(srcVc.x - tgtVc.x) > 1 && (goLeft ? entryX <= capL : entryX >= capR)) {
      const s = contourContact(src, { x: entryX, y: exitY }, 'y');
      const e = contourContact(tgt, { x: entryX, y: s.y }, 'x');
      if (Math.abs(e.x - entryX) <= 1) { const direct = accept(s, [{ x: entryX, y: s.y }], e); if (direct) return direct; }
    }

    let laneX: number;
    if (Math.abs(srcVc.x - tgtVc.x) <= 1) {
      const sibs = [...align.layerOf.entries()].filter(([, l]) => l === sl).map(([id]) => align.visualCenter.get(id)!.x);
      laneX = srcVc.x >= (Math.min(...sibs) + Math.max(...sibs)) / 2 - 1 ? capR : capL;
    } else {
      const peer = [...align.layerOf.entries()].filter(([id, l]) => l === sl && id !== edge.source).map(([id]) => rects.get(id)!)
        .find((p) => (goLeft ? p.absolutePosition.x + p.width < src.absolutePosition.x && p.absolutePosition.x + p.width > tgtVc.x - p.width
          : p.absolutePosition.x > src.absolutePosition.x + src.width && p.absolutePosition.x < tgtVc.x + p.width));
      laneX = peer
        ? (goLeft ? Math.max(capL, (peer.absolutePosition.x + peer.width + cap.x) / 2)
          : Math.min(capR, (cap.x + cap.width + peer.absolutePosition.x) / 2))
        : (goLeft ? capL : capR);
      // Planar nesting for multi-branch same-side DOWN fan-out: if an inner sibling
      // drops directly between `peer` and `src`, place this outer branch strictly on
      // the outer side of that inner sibling's drop so the two branches never cross.
      if (sameSideOut.length >= 2) {
        const myIdx = sameSideOut.findIndex((e) => e.id === edge.id);
        const innerSibs = sameSideOut.slice(myIdx + 1).map((e) => align.visualCenter.get(e.target)!.x);
        if (innerSibs.length) {
          if (goLeft) {
            const innerMinX = Math.min(...innerSibs);
            const outerLimit = peer ? peer.absolutePosition.x + peer.width + 12 : -Infinity;
            if (laneX >= innerMinX - 10 && innerMinX - 16 >= outerLimit) laneX = innerMinX - 16;
          } else {
            const innerMaxX = Math.max(...innerSibs);
            const outerLimit = peer ? peer.absolutePosition.x - 12 : Infinity;
            if (laneX <= innerMaxX + 10 && innerMaxX + 16 <= outerLimit) laneX = innerMaxX + 16;
          }
        }
      }
    }
    const s = contourContact(src, { x: laneX, y: exitY }, 'y');
    const e = contourContact(tgt, { x: entryX, y: mid }, 'x');
    return accept(s, [{ x: laneX, y: s.y }, { x: laneX, y: dropY }, { x: e.x, y: dropY }], e);
  }

  const s = contourContact(src, { x: srcVc.x, y: mid }, 'x');
  const e = contourContact(tgt, { x: entryX, y: mid }, 'x');
  return accept(s, [{ x: s.x, y: mid }, { x: e.x, y: mid }], e);
}
