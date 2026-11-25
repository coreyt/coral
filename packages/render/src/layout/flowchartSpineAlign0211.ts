import type { GraphIR } from '@graph-ir/core';
import type { GraphEdge, GraphNode } from '../types.js';
import type { AlignableRect } from './visualFlowAlign0210.js';
import type { LayoutDirection } from './types.js';

const AFFIRMATIVE_RE = /\b(yes|pass|passed|ok|approve|approved|valid|true|clean|green|within|ready|complete|done|success)\b/i;
const NEGATIVE_RE = /\b(no|fail|failed|failure|reject|rejected|error|retry|rollback|escalate|invalid|over|false|denied|abort)\b/i;

export interface FlowchartSpineAlignResult0211 {
  readonly aligned: boolean;
  readonly spineIds: ReadonlySet<string>;
}

interface Padding0211 {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

function collectHierarchy(nodes: readonly GraphNode[]): {
  leafIds: string[];
  parentOf: Map<string, string>;
  childrenOf: Map<string, string[]>;
  orderOf: Map<string, number>;
} {
  const leafIds: string[] = [];
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  const orderOf = new Map<string, number>();
  let seq = 0;
  const walk = (list: readonly GraphNode[], parentId?: string) => {
    for (const node of list) {
      orderOf.set(node.id, seq++);
      if (parentId) {
        parentOf.set(node.id, parentId);
        const kids = childrenOf.get(parentId) ?? [];
        kids.push(node.id);
        childrenOf.set(parentId, kids);
      }
      if (node.children?.length) {
        walk(node.children, node.id);
      } else {
        leafIds.push(node.id);
      }
    }
  };
  walk(nodes);
  return { leafIds, parentOf, childrenOf, orderOf };
}

function edgePreferenceBonus(edge: GraphEdge): number {
  const label = edge.label?.trim() ?? '';
  if (!label) return 1;
  if (AFFIRMATIVE_RE.test(label)) return 4;
  if (NEGATIVE_RE.test(label)) return -4;
  return 0;
}

function overlapsRange(a0: number, a1: number, b0: number, b1: number, pad = 0): boolean {
  return a0 < b1 + pad && b0 < a1 + pad;
}

function refitContainers(
  childrenOf: Map<string, string[]>,
  parentOf: Map<string, string>,
  rects: Map<string, AlignableRect>,
  paddingOf: (id: string) => Padding0211 | undefined,
): void {
  // Post-order: deepest containers first.
  const depth = (id: string): number => {
    let d = 0;
    let cur = parentOf.get(id);
    while (cur) { d++; cur = parentOf.get(cur); }
    return d;
  };
  const containers = [...childrenOf.keys()].sort((a, b) => depth(b) - depth(a));
  for (const cid of containers) {
    const cRect = rects.get(cid);
    if (!cRect) continue;
    const kids = (childrenOf.get(cid) ?? []).map((id) => rects.get(id)).filter((r): r is AlignableRect => Boolean(r));
    if (!kids.length) continue;
    const pad = paddingOf(cid) ?? {};
    const pLeft = pad.left ?? 20;
    const pRight = pad.right ?? 20;
    const pTop = pad.top ?? 36;
    const pBottom = pad.bottom ?? 20;
    const minX = Math.min(...kids.map((k) => k.absolutePosition.x));
    const maxX = Math.max(...kids.map((k) => k.absolutePosition.x + k.width));
    const minY = Math.min(...kids.map((k) => k.absolutePosition.y));
    const maxY = Math.max(...kids.map((k) => k.absolutePosition.y + k.height));
    const newX = minX - pLeft;
    const newY = minY - pTop;
    const newW = Math.max(cRect.width, (maxX - minX) + pLeft + pRight);
    const newH = (maxY - minY) + pTop + pBottom;
    // Keep container centered horizontally around children if it was wider than children.
    const extraW = newW - ((maxX - minX) + pLeft + pRight);
    cRect.absolutePosition = { x: newX - extraW / 2, y: newY };
    cRect.width = newW;
    cRect.height = newH;
  }
  // Sync local positions from absolute positions.
  for (const [id, rect] of rects) {
    const pid = parentOf.get(id);
    const pRect = pid ? rects.get(pid) : undefined;
    rect.position = pRect
      ? { x: rect.absolutePosition.x - pRect.absolutePosition.x, y: rect.absolutePosition.y - pRect.absolutePosition.y }
      : { ...rect.absolutePosition };
  }
}

/**
 * Post-ELK main-spine alignment and cascading reflow for flowcharts.
 *
 * Identifies the dominant forward happy-path spine from entry to exit, snaps
 * all spine nodes onto a single crisp centerline, keeps exception/feedback loop
 * nodes cleanly to one consistent side (above in RIGHT/LEFT, left in DOWN/UP),
 * and cascades 1-to-1 alignment along off-spine sub-chains.
 */
export function alignFlowchartSpine0211(
  graph: GraphIR,
  rects: Map<string, AlignableRect>,
  direction: LayoutDirection,
  nodeSpacing: number,
  paddingOf: (id: string) => Padding0211 | undefined,
): FlowchartSpineAlignResult0211 {
  const { leafIds, parentOf, childrenOf, orderOf } = collectHierarchy(graph.nodes);
  const validLeafSet = new Set(leafIds.filter((id) => rects.has(id)));
  if (validLeafSet.size < 3 || validLeafSet.size > 80) return { aligned: false, spineIds: new Set() };

  const horiz = direction === 'RIGHT' || direction === 'LEFT';
  const sign = direction === 'RIGHT' || direction === 'DOWN' ? 1 : -1;

  const primStart = (r: AlignableRect) => (horiz ? r.absolutePosition.x : r.absolutePosition.y);
  const primSpan = (r: AlignableRect) => (horiz ? r.width : r.height);
  const primCenter = (r: AlignableRect) => primStart(r) + primSpan(r) / 2;
  const crossStart = (r: AlignableRect) => (horiz ? r.absolutePosition.y : r.absolutePosition.x);
  const crossSpan = (r: AlignableRect) => (horiz ? r.height : r.width);
  const crossCenter = (r: AlignableRect) => crossStart(r) + crossSpan(r) / 2;
  const setCrossCenter = (r: AlignableRect, c: number) => {
    const start = c - crossSpan(r) / 2;
    if (horiz) {
      r.absolutePosition = { x: r.absolutePosition.x, y: start };
    } else {
      r.absolutePosition = { x: start, y: r.absolutePosition.y };
    }
  };

  // Build forward DAG based on ELK's primary-axis rank ordering.
  const fwdOut = new Map<string, GraphEdge[]>();
  const fwdIn = new Map<string, GraphEdge[]>();
  const backOut = new Map<string, GraphEdge[]>();
  const allEdges = graph.edges.filter((e) => e.source !== e.target && validLeafSet.has(e.source) && validLeafSet.has(e.target));
  for (const id of validLeafSet) {
    fwdOut.set(id, []);
    fwdIn.set(id, []);
    backOut.set(id, []);
  }
  for (const edge of allEdges) {
    const sr = rects.get(edge.source)!;
    const tr = rects.get(edge.target)!;
    if ((primCenter(tr) - primCenter(sr)) * sign > 8) {
      fwdOut.get(edge.source)!.push(edge);
      fwdIn.get(edge.target)!.push(edge);
    } else {
      backOut.get(edge.source)!.push(edge);
    }
  }

  // Topological order by primary coordinate along flow direction.
  const topo = [...validLeafSet].sort((a, b) =>
    ((primCenter(rects.get(a)!) - primCenter(rects.get(b)!)) * sign)
    || ((orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0)));

  // Longest-path DP from each node to any forward sink.
  const dpScore = new Map<string, number>();
  const dpNext = new Map<string, string>();
  for (let i = topo.length - 1; i >= 0; i--) {
    const u = topo[i]!;
    let bestScore = 0;
    let bestNext: string | undefined;
    for (const edge of fwdOut.get(u)!) {
      const v = edge.target;
      const cand = 10 + (dpScore.get(v) ?? 0) + edgePreferenceBonus(edge)
        - ((orderOf.get(v) ?? 0) * 1e-4);
      if (bestNext === undefined || cand > bestScore) {
        bestScore = cand;
        bestNext = v;
      }
    }
    dpScore.set(u, bestScore);
    if (bestNext) dpNext.set(u, bestNext);
  }

  const sources = topo.filter((id) => fwdIn.get(id)!.length === 0);
  const startNode = (sources.length ? sources : topo).reduce((best, id) => {
    const sb = dpScore.get(best) ?? 0;
    const si = dpScore.get(id) ?? 0;
    if (si !== sb) return si > sb ? id : best;
    return (orderOf.get(id) ?? 0) < (orderOf.get(best) ?? 0) ? id : best;
  });

  const spine: string[] = [];
  const spineSet = new Set<string>();
  let cur: string | undefined = startNode;
  while (cur && !spineSet.has(cur)) {
    spine.push(cur);
    spineSet.add(cur);
    cur = dpNext.get(cur);
  }
  if (spine.length < 3) return { aligned: false, spineIds: new Set() };

  // Snapshot positions so we can roll back cleanly if an overlap cannot be resolved.
  const saved = new Map<string, { pos: { x: number; y: number }; abs: { x: number; y: number }; w: number; h: number }>();
  for (const [id, r] of rects) {
    saved.set(id, { pos: { ...r.position }, abs: { ...r.absolutePosition }, w: r.width, h: r.height });
  }
  const restore = () => {
    for (const [id, s] of saved) {
      const r = rects.get(id);
      if (!r) continue;
      r.position = { ...s.pos };
      r.absolutePosition = { ...s.abs };
      r.width = s.w;
      r.height = s.h;
    }
  };

  // Compute the spine centerline as the median cross-center of spine nodes.
  const spineCenters = spine.map((id) => crossCenter(rects.get(id)!)).sort((a, b) => a - b);
  let spineCoord = spineCenters[Math.floor(spineCenters.length / 2)]!;
  const maxSpineCrossHalf = Math.max(...spine.map((id) => crossSpan(rects.get(id)!) / 2));

  // Classify small exception/feedback side nodes (nodes that loop back to the
  // spine or terminate after 1-2 steps off the spine).
  const offSpine = topo.filter((id) => !spineSet.has(id));
  const isFeedbackOrShortException = new Set<string>();
  for (const id of offSpine) {
    const loopsToSpine = backOut.get(id)!.some((e) => spineSet.has(e.target));
    const hasForwardKids = fwdOut.get(id)!.length > 0;
    const onlyRejoinsOrEnds = !hasForwardKids
      || fwdOut.get(id)!.every((e) => spineSet.has(e.target) || backOut.get(e.target)!.some((b) => spineSet.has(b.target)));
    if (loopsToSpine || (!hasForwardKids && fwdIn.get(id)!.every((e) => spineSet.has(e.source)))) {
      isFeedbackOrShortException.add(id);
    } else if (onlyRejoinsOrEnds && fwdIn.get(id)!.every((e) => spineSet.has(e.source) || isFeedbackOrShortException.has(e.source))) {
      // Short 2-node exception/revision chain (e.g. reject -> revise -> budget)
      if (fwdOut.get(id)!.length <= 1) isFeedbackOrShortException.add(id);
    }
  }
  // Propagate backward along off-spine chains whose only target is a feedback node
  // (e.g. fin.reject -> req.revise where req.revise loops back to fin.budget).
  for (let pass = 0; pass < 3; pass++) {
    for (const id of offSpine) {
      if (isFeedbackOrShortException.has(id)) continue;
      const outEdges = [...fwdOut.get(id)!, ...backOut.get(id)!];
      if (outEdges.length > 0 && outEdges.every((e) => isFeedbackOrShortException.has(e.target))) {
        isFeedbackOrShortException.add(id);
      }
    }
  }

  const gap = Math.max(28, nodeSpacing);
  const hasContainers = childrenOf.size > 0;

  // Step 1: Snap all spine nodes onto spineCoord.
  for (const id of spine) {
    setCrossCenter(rects.get(id)!, spineCoord);
  }

  // Step 2: Position short feedback/exception nodes consistently on ONE side of
  // the spine (above in RIGHT/LEFT, left in DOWN/UP when small feedback loops).
  const feedbackBand = offSpine.filter((id) => isFeedbackOrShortException.has(id));
  if (horiz && feedbackBand.length > 0 && feedbackBand.length <= Math.max(4, Math.ceil(validLeafSet.size * 0.45))) {
    // Place all short feedback/exception nodes cleanly ABOVE the spine band on
    // a shared horizontal centerline so the happy path sits on one straight line.
    const maxFbHalf = Math.max(...feedbackBand.map((id) => crossSpan(rects.get(id)!) / 2));
    const fbCenter = spineCoord - maxSpineCrossHalf - gap - maxFbHalf;
    for (const id of feedbackBand) {
      setCrossCenter(rects.get(id)!, fbCenter);
    }
  }

  // Step 3: For remaining off-spine nodes (multi-step branches such as decision
  // trees or meshes), resolve any overlap with the spine and cascade 1-to-1
  // parent->child alignment along each branch.
  const leafList = [...validLeafSet];
  const resolveBandCollisions = () => {
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const id of offSpine) {
        const r = rects.get(id)!;
        const p0 = primStart(r), p1 = p0 + primSpan(r);
        for (const otherId of leafList) {
          if (otherId === id) continue;
          const o = rects.get(otherId)!;
          if (!overlapsRange(p0, p1, primStart(o), primStart(o) + primSpan(o), 10)) continue;
          const c0 = crossStart(r), c1 = c0 + crossSpan(r);
          const oc0 = crossStart(o), oc1 = oc0 + crossSpan(o);
          if (!overlapsRange(c0, c1, oc0, oc1, gap - 0.5)) continue;
          // Push the non-spine node away from the obstacle (preferring its original side).
          const origR = saved.get(id)!.abs;
          const origO = saved.get(otherId)!.abs;
          const origRC = (horiz ? origR.y : origR.x) + crossSpan(r) / 2;
          const origOC = (horiz ? origO.y : origO.x) + crossSpan(o) / 2;
          const pushNegative = (horiz && isFeedbackOrShortException.has(id) && spineSet.has(otherId))
            ? true
            : (origRC < origOC - 1 ? true : origRC > origOC + 1 ? false : crossCenter(r) < crossCenter(o));
          const targetCenter = pushNegative
            ? oc0 - gap - crossSpan(r) / 2
            : oc1 + gap + crossSpan(r) / 2;
          if (Math.abs(targetCenter - crossCenter(r)) > 0.5) {
            setCrossCenter(r, targetCenter);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  };

  resolveBandCollisions();

  // Cascade 1-to-1 alignment along off-spine sub-chains (e.g. Validate schema -> Mapping clean?).
  for (const id of offSpine) {
    if (horiz && isFeedbackOrShortException.has(id)) continue;
    const parents = fwdIn.get(id)!;
    if (parents.length !== 1) continue;
    const parentId = parents[0]!.source;
    if (spineSet.has(parentId)) continue;
    if (fwdOut.get(parentId)!.length !== 1) continue;
    const r = rects.get(id)!;
    const pr = rects.get(parentId)!;
    const desired = crossCenter(pr);
    if (Math.abs(desired - crossCenter(r)) <= 0.5) continue;
    const p0 = primStart(r), p1 = p0 + primSpan(r);
    const half = crossSpan(r) / 2;
    const clear = leafList.every((otherId) => {
      if (otherId === id) return true;
      const o = rects.get(otherId)!;
      if (!overlapsRange(p0, p1, primStart(o), primStart(o) + primSpan(o), 10)) return true;
      return !overlapsRange(desired - half, desired + half, crossStart(o), crossStart(o) + crossSpan(o), gap - 2);
    });
    if (clear) setCrossCenter(r, desired);
  }

  resolveBandCollisions();

  // Normalize global cross-axis origin so all coordinates remain >= 12 px.
  const minCross = Math.min(...leafList.map((id) => crossStart(rects.get(id)!)));
  const minMargin = hasContainers ? 48 : 12;
  if (minCross < minMargin) {
    const delta = minMargin - minCross;
    for (const id of leafList) {
      const r = rects.get(id)!;
      setCrossCenter(r, crossCenter(r) + delta);
    }
  }

  if (hasContainers) {
    refitContainers(childrenOf, parentOf, rects, paddingOf);
    // Verify top-level containers do not overlap each other or non-descendant leaf nodes.
    const topContainers = graph.nodes.filter((n) => n.children?.length).map((n) => ({ id: n.id, rect: rects.get(n.id)! })).filter((c) => Boolean(c.rect));
    for (let i = 0; i < topContainers.length; i++) {
      for (let j = i + 1; j < topContainers.length; j++) {
        const a = topContainers[i]!.rect, b = topContainers[j]!.rect;
        if (overlapsRange(a.absolutePosition.x, a.absolutePosition.x + a.width, b.absolutePosition.x, b.absolutePosition.x + b.width, 8)
          && overlapsRange(a.absolutePosition.y, a.absolutePosition.y + a.height, b.absolutePosition.y, b.absolutePosition.y + b.height, 8)) {
          restore();
          return { aligned: false, spineIds: new Set() };
        }
      }
      const c = topContainers[i]!;
      for (const lid of leafList) {
        let anc = parentOf.get(lid);
        let inside = false;
        while (anc) { if (anc === c.id) { inside = true; break; } anc = parentOf.get(anc); }
        if (inside) continue;
        const lr = rects.get(lid)!;
        if (overlapsRange(c.rect.absolutePosition.x, c.rect.absolutePosition.x + c.rect.width, lr.absolutePosition.x, lr.absolutePosition.x + lr.width, 10)
          && overlapsRange(c.rect.absolutePosition.y, c.rect.absolutePosition.y + c.rect.height, lr.absolutePosition.y, lr.absolutePosition.y + lr.height, 10)) {
          restore();
          return { aligned: false, spineIds: new Set() };
        }
      }
    }
  } else {
    for (const id of leafList) {
      const r = rects.get(id)!;
      r.position = { ...r.absolutePosition };
    }
  }

  // Final safety verification: zero leaf-node overlaps (10 px clearance).
  for (let i = 0; i < leafList.length; i++) {
    const a = rects.get(leafList[i]!)!;
    for (let j = i + 1; j < leafList.length; j++) {
      const b = rects.get(leafList[j]!)!;
      if (overlapsRange(a.absolutePosition.x, a.absolutePosition.x + a.width, b.absolutePosition.x, b.absolutePosition.x + b.width, 10)
        && overlapsRange(a.absolutePosition.y, a.absolutePosition.y + a.height, b.absolutePosition.y, b.absolutePosition.y + b.height, 10)) {
        restore();
        return { aligned: false, spineIds: new Set() };
      }
    }
  }

  // Report whether any node actually moved.
  const movedAny = leafList.some((id) => {
    const r = rects.get(id)!;
    const s = saved.get(id)!.abs;
    return Math.abs(r.absolutePosition.x - s.x) > 0.5 || Math.abs(r.absolutePosition.y - s.y) > 0.5;
  });
  return { aligned: movedAny, spineIds: spineSet };
}
