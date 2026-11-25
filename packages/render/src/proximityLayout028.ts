import type { GraphEdge } from '@graph-ir/core';

// Derived display metadata survives object spreads/canvas canonical adapters,
// but is absent from JSON, GraphIR 3 schema fields and authored export.
const proximity = Symbol.for('@coral-viz/render/proximity028');
type DisplayEdge = GraphEdge & { [proximity]?: number };

export function withProximity028<T extends GraphEdge>(edge: T, tier?: number): T {
  return tier && tier > 1 ? { ...edge, [proximity]: tier } : edge;
}

export function edgeProximity028(edge: GraphEdge): number {
  return (edge as DisplayEdge)[proximity] ?? 1;
}

export function withoutProximity028<T extends GraphEdge>(edge: T): T {
  const display: DisplayEdge = { ...edge };
  delete display[proximity];
  return display as T;
}

export function proximityClearance028(baseline: number, tier: number): number {
  return baseline * (1 + (tier - 1) / 2);
}
