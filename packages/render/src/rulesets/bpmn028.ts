import type { GraphEdge, GraphIR } from '@graph-ir/core';
import type { RulesetDefinition } from '../conformance028.js';
import { allGraphNodes028 } from '../graphNodes028.js';
import { isBpmnFlowObjectType028, resolveBpmnConnector028 } from '../bpmnConnector028.js';
import { bpmnNotation } from '../notations/bpmn.js';
import type { SourceEdgeDirection028 } from '../sourceDirection028.js';

type SourceDirections028 = ReadonlyMap<string, SourceEdgeDirection028>;
const registeredRelations = new Set(Object.keys(bpmnNotation.edgeStyles ?? {}));

function subjectKinds(graph: GraphIR): ReadonlyMap<string, { type: string }> {
  return new Map(allGraphNodes028(graph.nodes).map((node) => [node.id, { type: node.type }]));
}

function flowObjectEndpoints(
  edge: GraphEdge, subjects: ReadonlyMap<string, { type: string }>,
): boolean {
  return isBpmnFlowObjectType028(subjects.get(edge.source)?.type) &&
    isBpmnFlowObjectType028(subjects.get(edge.target)?.type);
}

/** Only a certain sequence-flow direction can support a strict finding.
 * Nested Start/End boundary exceptions need process-scope modeling and are
 * deliberately outside this top-level check. */
function sequenceFlowDirection(
  edge: GraphEdge, subjects: ReadonlyMap<string, { type: string }>,
  sourceDirections?: SourceDirections028,
): { from: string; to: string } | undefined {
  const interpreted = resolveBpmnConnector028(edge, subjects, sourceDirections?.get(edge.id));
  if (interpreted.effectiveRelation !== 'sequence' || !flowObjectEndpoints(edge, subjects)) return undefined;
  if (interpreted.direction === 'second-to-first') return { from: edge.target, to: edge.source };
  if (interpreted.direction === 'first-to-second') return { from: edge.source, to: edge.target };
  if (sourceDirections?.get(edge.id) === undefined && edge.type === 'sequence' &&
    edge.sourceEnd === undefined && edge.targetEnd === undefined)
    return { from: edge.source, to: edge.target };
  return undefined;
}

function topLevelEvents(graph: GraphIR, type: 'startEvent' | 'endEvent'): string[] {
  return graph.nodes.filter((node) => node.type === type && !node.parent).map((node) => node.id);
}

function uncertainSequenceFlow(
  edge: GraphEdge, subjects: ReadonlyMap<string, { type: string }>,
  sourceDirections?: SourceDirections028,
): boolean {
  return resolveBpmnConnector028(edge, subjects,
    sourceDirections?.get(edge.id)).effectiveRelation === 'sequence' &&
    flowObjectEndpoints(edge, subjects) &&
    !sequenceFlowDirection(edge, subjects, sourceDirections);
}

/** A Sequence Flow without a settled direction cannot prove event roles. */
export function uncertainSequenceFlows028(
  graph: GraphIR, sourceDirections?: SourceDirections028,
): readonly string[] {
  const subjects = subjectKinds(graph);
  return graph.edges.filter((edge) => uncertainSequenceFlow(edge, subjects, sourceDirections))
    .map((edge) => edge.id);
}

function uncertainSequenceAt(
  graph: GraphIR, id: string, subjects: ReadonlyMap<string, { type: string }>,
  sourceDirections?: SourceDirections028,
): boolean {
  return graph.edges.some((edge) => (edge.source === id || edge.target === id) &&
    uncertainSequenceFlow(edge, subjects, sourceDirections));
}

/** Approved draft-event distinction; not a complete BPMN conformance claim. */
export function bpmnRulesetWithSourceDirections028(
  sourceDirections?: SourceDirections028,
): RulesetDefinition<GraphIR> {
  return {
  id: 'bpmn', profileId: 'bpmn', version: '0.2.8-bounded.1',
  scope: 'coral-bounded-profile', coverage: 'complete', obligations: [],
  rules: [{
    id: 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'coral', reference: 'profile:bpmn@0.2.8 relation declaration' },
    evidenceScope: 'edge',
    remediation: 'Add [sequence] for a Sequence Flow, or write the applicable explicit BPMN connector type.',
    check: (graph) => {
      const subjects = subjectKinds(graph);
      return graph.edges.filter((edge) => edge.type === undefined).map((edge) => ({
        message: resolveBpmnConnector028(edge, subjects,
          sourceDirections?.get(edge.id)).effectiveRelation === 'sequence'
          ? `BPMN Sequence Flow ${edge.id} is inferred from its connector; add [sequence] for strict conformance`
          : `BPMN connector ${edge.id} has no explicit relation`,
        subject: { kind: 'edge' as const, id: edge.id },
      }));
    },
  }, {
    id: 'BPMN.CONNECTOR.RELATION_UNREGISTERED', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'coral', reference: `profile:bpmn@${bpmnNotation.version} relation vocabulary` },
    evidenceScope: 'edge',
    remediation: 'Use a registered BPMN connector relation, such as [sequence], [message], or [association].',
    check: (graph) => graph.edges.filter((edge) => edge.type !== undefined &&
      !registeredRelations.has(edge.type)).map((edge) => ({
      message: `BPMN connector ${edge.id} uses unregistered relation ${edge.type}`,
      subject: { kind: 'edge' as const, id: edge.id },
    })),
  }, {
    id: 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS', minimumLevel: 'typical', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG BPMN 2.0.2 §7.6.1, Table 7.3' },
    evidenceScope: 'edge',
    remediation: 'Connect Sequence Flow only between BPMN Flow Objects, or use another connector relation.',
    check: (graph) => {
      const subjects = subjectKinds(graph);
      return graph.edges.filter((edge) => edge.type === 'sequence' &&
        !flowObjectEndpoints(edge, subjects)).map((edge) => ({
        message: `Sequence Flow ${edge.id} requires BPMN Flow Objects at both endpoints`,
        subject: { kind: 'edge' as const, id: edge.id },
      }));
    },
  }, {
    id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG BPMN 2.0.2 §10.5, Table 10.110' },
    evidenceScope: 'node',
    remediation: 'Choose a concrete BPMN event kind for this event.',
    check: (graph) => allGraphNodes028(graph.nodes).filter((node) => node.type === 'event').map((node) => ({
      message: `BPMN event ${node.id} needs an explicit concrete event kind for strict conformance`,
      subject: { kind: 'node' as const, id: node.id },
    })),
  }, {
    id: 'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG BPMN 2.0.2 §10.5.2, Sequence Flow Connections' },
    evidenceScope: 'node',
    remediation: 'Remove the incoming sequence flow, or model the expanded-subprocess boundary explicitly.',
    check: (graph) => {
      const rootStarts = new Set(topLevelEvents(graph, 'startEvent'));
      const subjects = subjectKinds(graph);
      return graph.edges.flatMap((edge) => {
        const direction = sequenceFlowDirection(edge, subjects, sourceDirections);
        return direction && rootStarts.has(direction.to) ? [{
          message: `Top-level Start Event ${direction.to} has incoming Sequence Flow ${edge.id}`,
          subject: { kind: 'node' as const, id: direction.to },
        }] : [];
      });
    },
  }, {
    id: 'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG BPMN 2.0.2 §10.5.3, Sequence Flow Connections' },
    evidenceScope: 'node',
    remediation: 'Remove the outgoing sequence flow, or model the expanded-subprocess boundary explicitly.',
    check: (graph) => {
      const rootEnds = new Set(topLevelEvents(graph, 'endEvent'));
      const subjects = subjectKinds(graph);
      return graph.edges.flatMap((edge) => {
        const direction = sequenceFlowDirection(edge, subjects, sourceDirections);
        return direction && rootEnds.has(direction.from) ? [{
          message: `Top-level End Event ${direction.from} has outgoing Sequence Flow ${edge.id}`,
          subject: { kind: 'node' as const, id: direction.from },
        }] : [];
      });
    },
  }, {
    id: 'BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG BPMN 2.0.2 §10.5.2, Sequence Flow Connections' },
    evidenceScope: 'node',
    remediation: 'Give this top-level Start Event an outgoing Sequence Flow.',
    check: (graph) => {
      const subjects = subjectKinds(graph);
      return topLevelEvents(graph, 'startEvent').flatMap((id) =>
        graph.edges.some((edge) => sequenceFlowDirection(edge, subjects, sourceDirections)?.from === id) ||
          uncertainSequenceAt(graph, id, subjects, sourceDirections)
          ? [] : [{ message: `Top-level Start Event ${id} has no outgoing Sequence Flow`,
            subject: { kind: 'node' as const, id } }]);
    },
  }, {
    id: 'BPMN.EVENT.TOP_LEVEL.END_INCOMING_SEQUENCE_REQUIRED', minimumLevel: 'strict', severity: 'error',
    provenance: { kind: 'standard', reference: 'OMG BPMN 2.0.2 §10.5.3, Sequence Flow Connections' },
    evidenceScope: 'node',
    remediation: 'Give this top-level End Event an incoming Sequence Flow.',
    check: (graph) => {
      const subjects = subjectKinds(graph);
      return topLevelEvents(graph, 'endEvent').flatMap((id) =>
        graph.edges.some((edge) => sequenceFlowDirection(edge, subjects, sourceDirections)?.to === id) ||
          uncertainSequenceAt(graph, id, subjects, sourceDirections)
          ? [] : [{ message: `Top-level End Event ${id} has no incoming Sequence Flow`,
            subject: { kind: 'node' as const, id } }]);
    },
  }],
  };
}

export const bpmnRuleset028 = bpmnRulesetWithSourceDirections028();
