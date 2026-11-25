/**
 * Coral 0.2.11 Slice 50 (ADR Stage 2): Intra-Group Visual Glyph-Center Alignment
 * & Post-Placement Polishing (DRQ-02, DRQ-03, DRQ-05).
 *
 * Aligns same-rank leaf nodes inside automatic groups/containers on their true
 * visual glyph center (eliminating composite caption-width drift inside groups
 * such as Data & External) and refits ancestor containers with >= 16 px padding
 * while preserving zero sibling container overlap.
 */
import type { GraphIR, GraphNode, Padding } from '@graph-ir/core';
import type { LayoutDirection } from './types.js';
import type { AlignableRect, VisualNodeMetrics0210 } from './visualFlowAlign0210.js';

function collectContainersBottomUp(nodes: readonly GraphNode[], out: GraphNode[] = []): GraphNode[] {
  for (const node of nodes) {
    if (node.children?.length) {
      collectContainersBottomUp(node.children, out);
      out.push(node);
    }
  }
  return out;
}

function boxesOverlap(a: AlignableRect, b: AlignableRect, gap = 8): boolean {
  return a.absolutePosition.x < b.absolutePosition.x + b.width + gap
    && a.absolutePosition.x + a.width + gap > b.absolutePosition.x
    && a.absolutePosition.y < b.absolutePosition.y + b.height + gap
    && a.absolutePosition.y + a.height + gap > b.absolutePosition.y;
}

/**
 * Snap same-column (RIGHT/LEFT) or same-row (DOWN/UP) leaf peers inside each
 * automatic container onto a common visual glyph center (DRQ-05 <= 1 px).
 * Returns true if any node moved.
 */
export function alignGroupColumns0211(
  graph: GraphIR,
  rects: Map<string, AlignableRect>,
  metricsOf: (rect: AlignableRect) => VisualNodeMetrics0210,
  direction: LayoutDirection,
  paddingOf?: (id: string) => Padding | undefined,
): boolean {
  const containers = collectContainersBottomUp(graph.nodes);
  const horiz = direction === 'RIGHT' || direction === 'LEFT';
  let movedAny = false;

  const parentById = new Map<string, string>();
  const walkParents = (list: readonly GraphNode[], parentId?: string) => {
    for (const n of list) {
      if (parentId) parentById.set(n.id, parentId);
      if (n.children?.length) walkParents(n.children, n.id);
    }
  };
  walkParents(graph.nodes);

  const updateRelative = (r: AlignableRect) => {
    const pid = parentById.get(r.id);
    const parent = pid ? rects.get(pid) : undefined;
    if (parent) {
      r.position = {
        x: r.absolutePosition.x - parent.absolutePosition.x,
        y: r.absolutePosition.y - parent.absolutePosition.y,
      };
    } else {
      r.position = { ...r.absolutePosition };
    }
  };

  for (const container of containers) {
    const cRect = rects.get(container.id);
    if (!cRect || cRect.fixed) continue;
    const directLeaves = (container.children ?? [])
      .filter((ch) => !ch.children?.length && !ch.pinned && !ch.position)
      .map((ch) => rects.get(ch.id))
      .filter((r): r is AlignableRect => Boolean(r && !r.fixed));
    if (directLeaves.length < 2) continue;

    const metrics = new Map(directLeaves.map((r) => [r.id, metricsOf(r)]));
    const primaryCenter = (r: AlignableRect) => {
      const m = metrics.get(r.id)!;
      return horiz ? r.absolutePosition.x + m.centerOffsetX : r.absolutePosition.y + m.centerOffsetY;
    };
    const extents = directLeaves.map((r) => {
      const m = metrics.get(r.id)!;
      return (m.glyphWidth + m.glyphHeight) / 2;
    }).sort((a, b) => a - b);
    const medExtent = Math.max(40, extents[Math.floor(extents.length / 2)]!);

    // Cluster direct leaves occupying the same flow-axis rank inside this group.
    const sorted = [...directLeaves].sort((a, b) => primaryCenter(a) - primaryCenter(b));
    const clusters: AlignableRect[][] = [];
    for (const r of sorted) {
      const last = clusters.at(-1);
      if (last && primaryCenter(r) - primaryCenter(last[last.length - 1]!) <= medExtent * 0.65) {
        last.push(r);
      } else {
        clusters.push([r]);
      }
    }

    const saved = new Map(directLeaves.map((r) => [r.id, { x: r.absolutePosition.x, y: r.absolutePosition.y }]));
    let groupMoved = false;

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const centers = cluster.map(primaryCenter);
      const target = (Math.min(...centers) + Math.max(...centers)) / 2;
      for (const r of cluster) {
        const m = metrics.get(r.id)!;
        const nextPrimary = target - (horiz ? m.centerOffsetX : m.centerOffsetY);
        const curPrimary = horiz ? r.absolutePosition.x : r.absolutePosition.y;
        if (Math.abs(nextPrimary - curPrimary) <= 0.25) continue;
        if (horiz) r.absolutePosition = { x: nextPrimary, y: r.absolutePosition.y };
        else r.absolutePosition = { x: r.absolutePosition.x, y: nextPrimary };
        groupMoved = true;
      }
    }

    // Also snap same-row (horiz) or same-column (vert) peers whose visual glyph
    // centers are nearly aligned (<= 10 px), OR directly-connected different-rank
    // peers whose ELK bbox centers were aligned (<= 28 px) before caption asymmetry
    // (bottom captions in RIGHT, right captions in DOWN) offset their glyphs.
    const secondaryCenter = (r: AlignableRect) => {
      const m = metrics.get(r.id)!;
      return horiz ? r.absolutePosition.y + m.centerOffsetY : r.absolutePosition.x + m.centerOffsetX;
    };
    const bboxSecondaryCenter = (r: AlignableRect) =>
      horiz ? r.absolutePosition.y + r.height / 2 : r.absolutePosition.x + r.width / 2;
    const isAsymmetricCaptioned = (r: AlignableRect) => {
      const m = metrics.get(r.id)!;
      const off = horiz ? Math.abs(m.centerOffsetY - r.height / 2) : Math.abs(m.centerOffsetX - r.width / 2);
      return off >= 6;
    };
    const samePrimaryRank = (a: AlignableRect, b: AlignableRect) =>
      horiz
        ? a.absolutePosition.x < b.absolutePosition.x + b.width && a.absolutePosition.x + a.width > b.absolutePosition.x
        : a.absolutePosition.y < b.absolutePosition.y + b.height && a.absolutePosition.y + a.height > b.absolutePosition.y;
    const directEdgeBetween = new Set<string>();
    for (const e of graph.edges) {
      directEdgeBetween.add(`${e.source}\0${e.target}`);
      directEdgeBetween.add(`${e.target}\0${e.source}`);
    }
    // Union-Find to group peers that belong on the same visual centerline.
    const uf = new Map(directLeaves.map((r) => [r.id, r.id]));
    const find = (id: string): string => {
      let cur = id;
      while (uf.get(cur) !== cur) cur = uf.get(cur)!;
      uf.set(id, cur);
      return cur;
    };
    const unite = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) uf.set(ra, rb);
    };
    const secSorted = [...directLeaves].sort((a, b) => secondaryCenter(a) - secondaryCenter(b));
    for (let i = 1; i < secSorted.length; i++) {
      const prev = secSorted[i - 1]!, cur = secSorted[i]!;
      if (!samePrimaryRank(prev, cur) && secondaryCenter(cur) - secondaryCenter(prev) <= 10) {
        unite(prev.id, cur.id);
      }
    }
    for (let i = 0; i < directLeaves.length; i++) {
      for (let j = i + 1; j < directLeaves.length; j++) {
        const a = directLeaves[i]!, b = directLeaves[j]!;
        if (samePrimaryRank(a, b)) continue;
        if (!directEdgeBetween.has(`${a.id}\0${b.id}`)) continue;
        if (!isAsymmetricCaptioned(a) && !isAsymmetricCaptioned(b)) continue;
        const secOverlap = horiz
          ? Math.min(a.absolutePosition.y + a.height, b.absolutePosition.y + b.height) - Math.max(a.absolutePosition.y, b.absolutePosition.y)
          : Math.min(a.absolutePosition.x + a.width, b.absolutePosition.x + b.width) - Math.max(a.absolutePosition.x, b.absolutePosition.x);
        const minSpan = horiz ? Math.min(a.height, b.height) : Math.min(a.width, b.width);
        const bboxDiff = Math.abs(bboxSecondaryCenter(a) - bboxSecondaryCenter(b));
        const glyphDiff = Math.abs(secondaryCenter(a) - secondaryCenter(b));
        if (secOverlap >= minSpan * 0.4 && (bboxDiff <= 28 || glyphDiff <= 28)) {
          unite(a.id, b.id);
        }
      }
    }
    const secClusterMap = new Map<string, AlignableRect[]>();
    for (const r of directLeaves) {
      const root = find(r.id);
      const list = secClusterMap.get(root) ?? [];
      list.push(r);
      secClusterMap.set(root, list);
    }
    for (const cluster of secClusterMap.values()) {
      if (cluster.length < 2) continue;
      // Skip if any two nodes in the cluster share the same primary rank (would cause collision).
      let hasSameRank = false;
      for (let i = 0; i < cluster.length && !hasSameRank; i++) {
        for (let j = i + 1; j < cluster.length; j++) {
          if (samePrimaryRank(cluster[i]!, cluster[j]!)) { hasSameRank = true; break; }
        }
      }
      if (hasSameRank) continue;
      const centers = cluster.map(secondaryCenter);
      if (Math.max(...centers) - Math.min(...centers) <= 0.25) continue;
      // Prefer captioned-icon glyph centers in a mixed cluster; if shifting plain
      // nodes toward captioned icons would push a child above container padding,
      // fall back to the non-captioned center so alignment stays strictly inside.
      const captioned = cluster.filter(isAsymmetricCaptioned);
      const plain = cluster.filter((r) => !isAsymmetricCaptioned(r));
      const pad = paddingOf?.(container.id);
      const padMin = horiz ? Math.max(16, pad?.top ?? 16) : Math.max(16, pad?.left ?? 16);
      const containerStart = horiz ? cRect.absolutePosition.y : cRect.absolutePosition.x;
      const tryTarget = (target: number): boolean => cluster.every((r) => {
        const m = metrics.get(r.id)!;
        const nextSec = target - (horiz ? m.centerOffsetY : m.centerOffsetX);
        return nextSec >= containerStart + padMin - 0.5;
      });
      const primaryCenters = captioned.length ? captioned.map(secondaryCenter) : centers;
      let target = (Math.min(...primaryCenters) + Math.max(...primaryCenters)) / 2;
      if (!tryTarget(target) && plain.length) {
        const plainCenters = plain.map(secondaryCenter);
        target = (Math.min(...plainCenters) + Math.max(...plainCenters)) / 2;
      }
      for (const r of cluster) {
        const m = metrics.get(r.id)!;
        const nextSec = target - (horiz ? m.centerOffsetY : m.centerOffsetX);
        const curSec = horiz ? r.absolutePosition.y : r.absolutePosition.x;
        if (Math.abs(nextSec - curSec) <= 0.25) continue;
        if (horiz) r.absolutePosition = { x: r.absolutePosition.x, y: nextSec };
        else r.absolutePosition = { x: nextSec, y: r.absolutePosition.y };
        groupMoved = true;
      }
    }

    if (!groupMoved) continue;

    // Verify no overlap among direct siblings inside this container.
    const directAll = (container.children ?? [])
      .map((ch) => rects.get(ch.id))
      .filter((r): r is AlignableRect => Boolean(r));
    let invalid = false;
    for (let i = 0; i < directAll.length && !invalid; i++) {
      for (let j = i + 1; j < directAll.length; j++) {
        if (boxesOverlap(directAll[i]!, directAll[j]!, 6)) {
          invalid = true;
          break;
        }
      }
    }

    // Ensure every moved child stays inside container bounds with its real padding
    // (expanding the container only if it does not collide with siblings or exceed its own parent).
    if (!invalid) {
      const minX = Math.min(...directAll.map((r) => r.absolutePosition.x));
      const maxX = Math.max(...directAll.map((r) => r.absolutePosition.x + r.width));
      const minY = Math.min(...directAll.map((r) => r.absolutePosition.y));
      const maxY = Math.max(...directAll.map((r) => r.absolutePosition.y + r.height));
      const pad = paddingOf?.(container.id);
      const padL = Math.max(16, pad?.left ?? 16);
      const padR = Math.max(16, pad?.right ?? 16);
      const padT = Math.max(16, pad?.top ?? 16);
      const padB = Math.max(16, pad?.bottom ?? 16);
      const newX = Math.min(cRect.absolutePosition.x, minX - padL);
      const newRight = Math.max(cRect.absolutePosition.x + cRect.width, maxX + padR);
      const newY = Math.min(cRect.absolutePosition.y, minY - padT);
      const newBottom = Math.max(cRect.absolutePosition.y + cRect.height, maxY + padB);
      const candidateContainer: AlignableRect = {
        ...cRect,
        absolutePosition: { x: newX, y: newY },
        width: newRight - newX,
        height: newBottom - newY,
      };
      // Check against sibling containers/nodes at the same parent level, and ensure
      // we do not overflow a parent container's own inner padded box.
      const cParent = parentById.get(container.id);
      if (cParent) {
        const pRect = rects.get(cParent);
        const pPad = paddingOf?.(cParent);
        if (pRect && (
          candidateContainer.absolutePosition.x < pRect.absolutePosition.x + (pPad?.left ?? 0) - 0.5
          || candidateContainer.absolutePosition.y < pRect.absolutePosition.y + (pPad?.top ?? 0) - 0.5
          || candidateContainer.absolutePosition.x + candidateContainer.width > pRect.absolutePosition.x + pRect.width - (pPad?.right ?? 0) + 0.5
          || candidateContainer.absolutePosition.y + candidateContainer.height > pRect.absolutePosition.y + pRect.height - (pPad?.bottom ?? 0) + 0.5
        )) {
          invalid = true;
        }
      }
      for (const other of rects.values()) {
        if (invalid) break;
        if (other.id === container.id || parentById.get(other.id) !== cParent) continue;
        if (boxesOverlap(candidateContainer, other, 8)) {
          invalid = true;
          break;
        }
      }
      if (!invalid) {
        cRect.absolutePosition = candidateContainer.absolutePosition;
        cRect.width = candidateContainer.width;
        cRect.height = candidateContainer.height;
        updateRelative(cRect);
        for (const r of directAll) updateRelative(r);
        movedAny = true;
      }
    }

    if (invalid) {
      for (const r of directLeaves) {
        const orig = saved.get(r.id)!;
        r.absolutePosition = { x: orig.x, y: orig.y };
        updateRelative(r);
      }
    }
  }

  // Second pass: snap standalone top-level leaf nodes (e.g. transit gateways,
  // external SaaS, edge entry icons) onto their directly connected upstream or
  // downstream peer's visual glyph centerline when close and collision-free.
  // Skip sketch (spline feedback loops require preserved vertical separation).
  const topLevelLeaves = graph.metadata?.notation === 'sketch' ? [] : graph.nodes
    .filter((n) => !n.children?.length && !n.pinned && !n.position)
    .map((n) => rects.get(n.id))
    .filter((r): r is AlignableRect => Boolean(r && !r.fixed));
  if (topLevelLeaves.length) {
    const allTopLevel = graph.nodes
      .map((n) => rects.get(n.id))
      .filter((r): r is AlignableRect => Boolean(r));
    const secCenterOf = (r: AlignableRect) => {
      const m = metricsOf(r);
      return horiz ? r.absolutePosition.y + m.centerOffsetY : r.absolutePosition.x + m.centerOffsetX;
    };
    const primCenterOf = (r: AlignableRect) => {
      const m = metricsOf(r);
      return horiz ? r.absolutePosition.x + m.centerOffsetX : r.absolutePosition.y + m.centerOffsetY;
    };
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (e.source === e.target) continue;
      (outgoing.get(e.source) ?? (outgoing.set(e.source, []), outgoing.get(e.source)!)).push(e.target);
      (incoming.get(e.target) ?? (incoming.set(e.target, []), incoming.get(e.target)!)).push(e.source);
    }
    const isAsymTop = (r: AlignableRect) => {
      const m = metricsOf(r);
      const off = horiz ? Math.abs(m.centerOffsetY - r.height / 2) : Math.abs(m.centerOffsetX - r.width / 2);
      return off >= 6;
    };
    // Run 2 passes so chains of 2 standalone captioned icons (e.g. admin -> idp -> dmz.waf) propagate cleanly.
    for (let pass = 0; pass < 2; pass++) {
      for (const r of topLevelLeaves) {
        const ins = (incoming.get(r.id) ?? []).map((id) => rects.get(id)).filter((x): x is AlignableRect => Boolean(x));
        const outs = (outgoing.get(r.id) ?? []).map((id) => rects.get(id)).filter((x): x is AlignableRect => Boolean(x));
        // Prefer a single predecessor or single successor (or nearest direct peer along flow axis).
        const candidates: AlignableRect[] = [];
        if (ins.length === 1) candidates.push(ins[0]!);
        if (outs.length === 1) candidates.push(outs[0]!);
        if (!candidates.length) {
          // Multi-edge standalone node: pick the closest adjacent-rank neighbor along the primary flow axis.
          const allPeers = [...ins, ...outs].filter((p) => {
            const pOverlap = horiz
              ? r.absolutePosition.x < p.absolutePosition.x + p.width && r.absolutePosition.x + r.width > p.absolutePosition.x
              : r.absolutePosition.y < p.absolutePosition.y + p.height && r.absolutePosition.y + r.height > p.absolutePosition.y;
            return !pOverlap;
          });
          allPeers.sort((a, b) => Math.abs(primCenterOf(a) - primCenterOf(r)) - Math.abs(primCenterOf(b) - primCenterOf(r)));
          if (allPeers[0]) candidates.push(allPeers[0]);
        }
        // Only snap when caption asymmetry on either node caused glyph-center drift,
        // and never collapse a direct 2-cycle pair whose return loop needs clearance.
        const isMutual = (p: AlignableRect) =>
          (incoming.get(r.id)?.includes(p.id) ?? false) && (outgoing.get(r.id)?.includes(p.id) ?? false);
        const asymCandidates = candidates.filter((p) => !isMutual(p) && (isAsymTop(r) || isAsymTop(p)));
        // Prefer a peer inside a container (already anchored) over a floating peer.
        asymCandidates.sort((a, b) => (parentById.has(b.id) ? 1 : 0) - (parentById.has(a.id) ? 1 : 0)
          || Math.abs(secCenterOf(a) - secCenterOf(r)) - Math.abs(secCenterOf(b) - secCenterOf(r)));
        const anchor = asymCandidates.find((p) => Math.abs(secCenterOf(p) - secCenterOf(r)) <= 56);
        if (!anchor) continue;
        const target = secCenterOf(anchor);
        const m = metricsOf(r);
        const nextSec = target - (horiz ? m.centerOffsetY : m.centerOffsetX);
        const curSec = horiz ? r.absolutePosition.y : r.absolutePosition.x;
        if (Math.abs(nextSec - curSec) <= 0.5) continue;
        const orig = { ...r.absolutePosition };
        if (horiz) r.absolutePosition = { x: orig.x, y: nextSec };
        else r.absolutePosition = { x: nextSec, y: orig.y };
        const collides = allTopLevel.some((other) => other.id !== r.id && boxesOverlap(r, other, 12));
        if (collides) {
          r.absolutePosition = orig;
        } else {
          updateRelative(r);
          movedAny = true;
        }
      }
    }
  }

  return movedAny;
}
