import type { GraphIR, RouteIntentSuccessor, SpatialConstraint, SpatialConstraintSuccessor, SpatialRectangleReferenceSuccessor, LayoutOptionsSuccessor } from '@graph-ir/core';
import type { SceneBounds028 } from '../renderScene028.js';

export type SpatialReference028 = SpatialRectangleReferenceSuccessor;
export type SpatialConstraint028 = SpatialConstraintSuccessor;
export interface SpatialSidecar028 {
  layoutOptions028?: LayoutOptionsSuccessor;
  spatialConstraints028?: SpatialConstraint028[];
  routeIntents028?: Record<string, RouteIntentSuccessor>;
  labelBounds028?: Record<string, SceneBounds028>;
}
export const spatialReferenceKey028 = (ref: SpatialReference028): string =>
  ref.kind === 'node' ? ref.nodeId : `${ref.kind}:${'nodeId' in ref ? ref.nodeId : ref.edgeId}`;
export function spatialConstraintReferences028(constraint: SpatialConstraint028): SpatialReference028[] {
  return constraint.kind === 'relative' ? [constraint.subject, constraint.target]
    : constraint.kind === 'boundary' ? [constraint.subject] : constraint.subjects;
}
export function nodeConstraint028(constraint: SpatialConstraint028): SpatialConstraint {
  const ref = (reference: SpatialReference028) => ({ kind: 'node' as const, nodeId: spatialReferenceKey028(reference) });
  return constraint.kind === 'relative' ? { ...constraint, subject: ref(constraint.subject), target: ref(constraint.target) }
    : constraint.kind === 'boundary' ? { ...constraint, subject: ref(constraint.subject), contentBoundary028: true } as SpatialConstraint
      : { ...constraint, subjects: constraint.subjects.map(ref) };
}

/** Verify the exact rectangles consumed by a scene, including containment on
 * both axes for a boundary operation. No geometry is changed here. */
export function verifySpatialConstraints028(graph: GraphIR & SpatialSidecar028,
  rectangles: ReadonlyMap<string, SceneBounds028>, constraints = graph.spatialConstraints028 ?? []): string[] {
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
  const align = (a: SceneBounds028, b: SceneBounds028, axis: 'x' | 'y', alignment?: string) => {
    const size = axis === 'x' ? 'width' : 'height';
    const delta = alignment === 'start' ? 0 : alignment === 'end' ? b[size] - a[size] : (b[size] - a[size]) / 2;
    return close(a[axis], b[axis] + delta);
  };
  const relative = (a: SceneBounds028, b: SceneBounds028, relation: string, gap = 0, alignment?: string) => {
    const horizontal = relation === 'left-of' || relation === 'right-of';
    const axis = horizontal ? 'x' : 'y'; const size = horizontal ? 'width' : 'height';
    return (relation === 'left-of' || relation === 'above' ? a[axis] + a[size] + gap <= b[axis] + 1e-6
      : a[axis] + 1e-6 >= b[axis] + b[size] + gap) && align(a, b, horizontal ? 'y' : 'x', alignment);
  };
  const top = graph.nodes.map(({ id }) => rectangles.get(id)).filter((b): b is SceneBounds028 => Boolean(b));
  return constraints.filter((constraint) => {
    const refs = spatialConstraintReferences028(constraint).map((ref) => rectangles.get(spatialReferenceKey028(ref)));
    if (refs.some((ref) => !ref)) return true;
    const boxes = refs as SceneBounds028[];
    if (constraint.kind === 'relative') return !relative(boxes[0]!, boxes[1]!, constraint.relation, constraint.gap, constraint.alignment);
    if (constraint.kind === 'arrangement') {
      if (constraint.direction === 'reverse') boxes.reverse();
      return boxes.slice(1).some((box, i) => !relative(box, boxes[i]!, constraint.axis === 'row' ? 'right-of' : 'below', constraint.gap, constraint.alignment));
    }
    const scope = constraint.scope.kind === 'node' ? rectangles.get(constraint.scope.nodeId) : top.length ? {
      x: Math.min(...top.map((b) => b.x)), y: Math.min(...top.map((b) => b.y)),
      width: Math.max(...top.map((b) => b.x + b.width)) - Math.min(...top.map((b) => b.x)),
      height: Math.max(...top.map((b) => b.y + b.height)) - Math.min(...top.map((b) => b.y)),
    } : undefined;
    if (!scope) return true;
    const a = boxes[0]!; const inset = constraint.inset ?? 0;
    const value = constraint.side === 'left' ? a.x : constraint.side === 'top' ? a.y : constraint.side === 'right' ? a.x + a.width : a.y + a.height;
    const padding = constraint.scope.kind === 'node' ? findPadding(graph.nodes, constraint.scope.nodeId) : {};
    const expected = constraint.side === 'left' ? scope.x + (padding.left ?? 0) + inset : constraint.side === 'top' ? scope.y + (padding.top ?? 0) + inset :
      constraint.side === 'right' ? scope.x + scope.width - (padding.right ?? 0) - inset : scope.y + scope.height - (padding.bottom ?? 0) - inset;
    return !close(value, expected) || a.x < scope.x + (padding.left ?? 0) + inset - 1e-6 ||
      a.y < scope.y + (padding.top ?? 0) + inset - 1e-6 || a.x + a.width > scope.x + scope.width - (padding.right ?? 0) - inset + 1e-6 ||
      a.y + a.height > scope.y + scope.height - (padding.bottom ?? 0) - inset + 1e-6;
  }).map(({ id }) => id);
}
function findPadding(nodes: GraphIR['nodes'], id: string): NonNullable<NonNullable<GraphIR['nodes'][number]['layoutOptions']>['padding']> {
  for (const node of nodes) {
    if (node.id === id) return node.layoutOptions?.padding ?? {};
    const nested = findPadding(node.children ?? [], id);
    if (Object.keys(nested).length) return nested;
  }
  return {};
}

/** Finite authored controls outrank both caller-friendly fields and raw ELK
 * escape hatches, including the historical edgeNode alias. */
export function mergeAuthoredLayoutOptions028(caller: import('./types.js').LayoutOptionInput | undefined,
  authored: LayoutOptionsSuccessor): import('./types.js').LayoutOptionInput {
  const spacing = { ...caller?.spacing, ...authored.spacing };
  if (authored.spacing?.nodeEdge !== undefined) delete spacing.edgeNode;
  const elkOptions = { ...caller?.elkOptions };
  const controlled: Array<[unknown, string]> = [[authored.algorithm, 'elk.algorithm'], [authored.direction, 'elk.direction'],
    [authored.edgeRouting, 'elk.edgeRouting'], [authored.spacing?.nodeNode, 'elk.spacing.nodeNode'],
    [authored.spacing?.nodeEdge, 'elk.spacing.edgeNode'], [authored.spacing?.edgeEdge, 'elk.spacing.edgeEdge'],
    [authored.spacing?.layerSpacing, 'elk.layered.spacing.nodeNodeBetweenLayers']];
  for (const [value, key] of controlled) if (value !== undefined) delete elkOptions[key];
  return { ...caller, ...authored, spacing, elkOptions };
}
