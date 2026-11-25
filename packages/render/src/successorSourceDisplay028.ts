import type { CandidateEdgeSyntax, Diagnostic } from '@coral-viz/language';
import type { parseInstalledDocument028 } from './installedDocument028.js';
import type { GraphEdge, GraphIR, GraphNode } from '@graph-ir/core';
import type { SuccessorSourceEdge028, SuccessorSourceGraph028,
  SuccessorSourceNode028 } from './successorSourceProjection028.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import { resolveSuccessorGraphNodes028 } from './successorInterpretation028.js';
import { successorSequenceDisplay028 } from './successorSequenceDisplay028.js';
import { displayRouteIntent028 } from './sourceRouteIntent028.js';
import { withProximity028 } from './proximityLayout028.js';

/** Carry the failed display obligation across consumers without guessing from
 * unrelated supported features present elsewhere in the source. */
export class SuccessorDisplayCapabilityError028 extends Error {
  constructor(readonly code: string, readonly edgeId: string, message: string) {
    super(message);
    this.name = 'SuccessorDisplayCapabilityError028';
  }
}

export function successorDisplayFailureDiagnostic028(
  cause: unknown, graph: SuccessorSourceGraph028,
  document: ReturnType<typeof parseInstalledDocument028> | undefined, fallbackCode: string,
): Diagnostic {
  const message = cause instanceof Error ? cause.message : 'Source display projection failed';
  if (!(cause instanceof SuccessorDisplayCapabilityError028))
    return { severity: 'error', code: fallbackCode, message };
  const edges = document?.syntax.statements.filter(
    (item): item is CandidateEdgeSyntax => item.kind === 'edge');
  const index = graph.edges.findIndex(({ id }) => id === cause.edgeId);
  const range = index >= 0 ? edges?.[index]?.style?.range : undefined;
  return { severity: 'error', code: cause.code, message,
    subject: { kind: 'edge', id: cause.edgeId },
    ...(range ? { position: range.start, range } : {}) };
}

function displayNode028(node: SuccessorSourceNode028, semanticSidecar: boolean): GraphNode {
  if ('ports' in node || (!semanticSidecar && 'semanticPorts' in node)) {
    throw new Error(`Node ${node.id} has ports this read-only display adapter cannot preserve`);
  }
  const display = { ...node };
  delete display.semanticPorts;
  return { ...display, label: node.label ?? node.id,
    ...(node.children ? { children: node.children.map((child) => displayNode028(child, semanticSidecar)) } : {}) };
}

/** The edge carrier and root sidecar must make complementary decisions. */
function needsRouteSidecar028(edge: SuccessorSourceEdge028): boolean {
  return edge.routeIntent?.waypoints.some((waypoint) =>
    waypoint.placement.kind === 'relative' && waypoint.placement.anchor.kind === 'waypoint') ?? false;
}

function displayEdge028(edge: SuccessorSourceEdge028): GraphEdge {
  const firstArrow = edge.firstEnd?.marker?.kind === 'arrow';
  const secondArrow = edge.secondEnd?.marker?.kind === 'arrow';
  const shownDirection = firstArrow && secondArrow ? 'both'
    : firstArrow ? 'second-to-first' : secondArrow ? 'first-to-second' : 'none';
  // GraphIR 3 has no independent direction field. A registered rare end may
  // replace the drawn arrow, or a keyed first-end arrow may add a visible
  // arrow, while GraphIR 4 retains the operator's direction. This display
  // view is never source authority.
  const rareEnd = (end: SuccessorSourceEdge028['firstEnd']) =>
    end?.marker?.kind === 'zero-or-one' || end?.marker?.kind === 'one' ||
    end?.marker?.kind === 'zero-or-many' || end?.marker?.kind === 'one-or-many';
  const directionExplainedByRareEnd =
    (edge.direction === 'first-to-second' && rareEnd(edge.secondEnd)) ||
    (edge.direction === 'second-to-first' && rareEnd(edge.firstEnd)) ||
    (edge.direction === 'both' && rareEnd(edge.firstEnd) && rareEnd(edge.secondEnd));
  const directionExplainedByAddedArrow = firstArrow && secondArrow &&
    (edge.direction === 'first-to-second' || edge.direction === 'second-to-first');
  if (edge.direction !== shownDirection && !directionExplainedByRareEnd &&
    !directionExplainedByAddedArrow) {
    throw new Error(`Edge ${edge.id} direction cannot be displayed by its connector ends`);
  }
  return withProximity028({ id: edge.id, source: edge.first.node, target: edge.second.node,
    ...(edge.first.port ? { sourcePort: edge.first.port } : {}),
    ...(edge.second.port ? { targetPort: edge.second.port } : {}),
    ...(edge.type !== undefined ? { type: edge.type } : {}),
    ...(edge.label !== undefined ? { label: edge.label } : {}),
    ...(edge.description !== undefined ? { description: edge.description } : {}),
    ...(edge.labelPlacement !== undefined ? { labelPlacement: edge.labelPlacement } : {}),
    ...(edge.routeIntent !== undefined && !needsRouteSidecar028(edge) ? { routeIntent: displayRouteIntent028(edge.routeIntent) } : {}),
    ...(edge.properties !== undefined ? { properties: edge.properties } : {}),
    ...(edge.style !== undefined ? { style: edge.style } : {}),
    ...(edge.sourceInfo !== undefined ? { sourceInfo: edge.sourceInfo } : {}),
    ...(edge.firstEnd !== undefined ? { sourceEnd: edge.firstEnd } : {}),
    ...(edge.secondEnd !== undefined ? { targetEnd: edge.secondEnd } : {}),
  }, edge.proximityHint);
}

/** Read-only GraphIR 3 scene input derived from the source-owned successor.
 * Never save or print this lossy display view as authored Coral meaning. */
function sourceDisplay028(source: SuccessorSourceGraph028, semanticSidecar: boolean): GraphIR {
  const rgbEdge = source.edges.find((edge) => edge.style?.strokeColor !== undefined);
  if (rgbEdge) throw new SuccessorDisplayCapabilityError028('render.capability.edge-rgb', rgbEdge.id,
    `Edge ${rgbEdge.id} stroke color cannot be displayed without loss`);
  const weightEdge = source.edges.find((edge) => edge.style?.strokeWeight !== undefined);
  if (weightEdge) throw new SuccessorDisplayCapabilityError028('render.capability.edge-stroke-weight', weightEdge.id,
    `Edge ${weightEdge.id} stroke weight cannot be displayed without loss`);
  const motionEdge = source.edges.find((edge) => edge.style?.motion !== undefined);
  if (motionEdge) throw new SuccessorDisplayCapabilityError028('render.capability.edge-motion', motionEdge.id,
    `Edge ${motionEdge.id} motion cannot be displayed without loss`);
  if (source.interaction?.messages.some(message=>(message.kind as string)==='lost'||(message.kind as string)==='found')) throw new SuccessorDisplayCapabilityError028('render.capability.sequence-message-kind','', 'Lost and found message kinds are reserved and cannot be rendered');
  if (source.interaction) {
    if (semanticSidecar) {
      throw new Error('A sequence semantic-port sidecar has no supported display/layout path');
    }
    return successorSequenceDisplay028(source);
  }
  if (source.profile.id === 'uml' && source.profile.kind === 'sequence') {
    throw new Error('A UML sequence display requires its interaction timeline');
  }
  const profile: GraphIR['profile'] | undefined = source.profile.id === 'uml'
    ? source.profile.kind === 'class' && source.profile.version === '1.0.0'
      ? { id: 'uml', kind: 'class', version: '1.0.0' }
      : undefined
    : undefined;
  if (source.profile.id === 'uml' && !profile) {
    throw new Error('The UML profile cannot be displayed without loss');
  }
  // Legacy-representable routes already live on each edge. Keep a sidecar only
  // when GraphIR 3 cannot carry waypoint-to-waypoint dependencies in full.
  const dependentRoutes = source.edges.filter(needsRouteSidecar028);
  const display = { version: '3.0.0' as const, id: source.id,
    ...(source.name !== undefined ? { name: source.name } : {}),
    nodes: source.nodes.map((node) => displayNode028(node, semanticSidecar)),
    edges: source.edges.map(displayEdge028),
    ...(source.constraints !== undefined ? { spatialConstraints028: structuredClone(source.constraints) } : {}),
    ...(dependentRoutes.length ? { routeIntents028: Object.fromEntries(dependentRoutes.map(
      (edge) => [edge.id, structuredClone(edge.routeIntent!)])) } : {}),
    ...(source.metadata !== undefined ? { metadata: source.metadata } : {}),
    ...(source.layoutOptions !== undefined ? { layoutOptions028: structuredClone(source.layoutOptions) } : {}),
    ...(profile ? { profile } : {}),
  };
  return display;
}

export function successorSourceDisplay028(source: SuccessorSourceGraph028): GraphIR {
  return sourceDisplay028(source, false);
}

/** Keep source semantic ports and the temporary SVG scene paired; never persist the scene. */
export function successorSourceDisplayWithSemanticPorts028(source: SuccessorSourceGraph028): {
  display: GraphIR;
  semanticInterpretations: ReadonlyMap<string, NodeInterpretation028>;
} {
  const semanticInterpretations = resolveSuccessorGraphNodes028(source);
  const display = sourceDisplay028(source, true);
  return { display, semanticInterpretations };
}

/** Validate the legacy staging carrier separately from its exact successor.
 * Only these known transient renderer fields are removed; all authored legacy
 * fields still pass the unchanged GraphIR 3 validator. */
export function spatialValidationGraph028(graph: GraphIR): GraphIR {
  const { spatialConstraints028: _constraints, routeIntents028: _routes,
    layoutOptions028: _layout, labelBounds028: _labels, ...portable } = graph as GraphIR & {
      spatialConstraints028?: unknown;routeIntents028?:unknown;layoutOptions028?:unknown;labelBounds028?:unknown};
  void [_constraints,_routes,_layout,_labels];
  return portable;
}
