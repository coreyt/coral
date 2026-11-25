import type { GraphEdge } from '@graph-ir/core';
import type { SourceEdgeDirection028 } from './sourceDirection028.js';

/** BPMN Flow Objects are semantic node kinds; a selected glyph alone cannot
 * turn a data object, pool, or annotation into an activity. */
const FLOW_OBJECTS = new Set([
  'event', 'startEvent', 'endEvent', 'intermediateEvent',
  'task', 'subprocess', 'exclusiveGateway', 'parallelGateway',
  'inclusiveGateway', 'eventGateway',
  'bpmn-start-event', 'bpmn-end-event', 'bpmn-intermediate-event',
  'bpmn-task', 'bpmn-subprocess', 'bpmn-gateway-exclusive',
  'bpmn-gateway-parallel', 'bpmn-gateway-inclusive', 'bpmn-gateway-event',
]);

export function isBpmnFlowObjectType028(type: string | undefined): boolean {
  return FLOW_OBJECTS.has(type ?? '');
}

export interface BpmnConnectorInterpretation028 {
  effectiveRelation?: string;
  origin: 'authored' | 'profile-default' | 'unspecified';
  direction?: 'first-to-second' | 'second-to-first';
  /** The approved `->` family may use BPMN's canonical filled head in view. */
  canonicalSequenceArrow: boolean;
}

/** Resolve relation independently of conformance level and without changing
 * the authored edge. One-to-four dashes are proximity hints, not kinds. */
export function resolveBpmnConnector028(
  edge: GraphEdge,
  subjects: ReadonlyMap<string, { type?: string }>,
  sourceDirection?: SourceEdgeDirection028,
): BpmnConnectorInterpretation028 {
  const first = edge.sourceEnd?.marker?.kind;
  const second = edge.targetEnd?.marker?.kind;
  const direction = sourceDirection !== undefined
    ? sourceDirection === 'first-to-second' || sourceDirection === 'second-to-first'
      ? sourceDirection : undefined
    : first === 'arrow' && second === 'none' ? 'second-to-first'
      : first === 'none' && second === 'arrow' ? 'first-to-second' : undefined;
  const solid = edge.style?.lineStyle === undefined || edge.style.lineStyle === 'solid';
  const eligible = isBpmnFlowObjectType028(subjects.get(edge.source)?.type) &&
    isBpmnFlowObjectType028(subjects.get(edge.target)?.type);
  const inferred = edge.type === undefined && solid && eligible && direction !== undefined;
  const effectiveRelation = edge.type ?? (inferred ? 'sequence' : undefined);
  return {
    ...(effectiveRelation !== undefined ? { effectiveRelation } : {}),
    origin: edge.type !== undefined ? 'authored' : inferred ? 'profile-default' : 'unspecified',
    ...(direction ? { direction } : {}),
    canonicalSequenceArrow: effectiveRelation === 'sequence' && solid && eligible && direction !== undefined,
  };
}
