import {spatialValidationGraph028} from './successorSourceDisplay028.js';
import type { GraphIR } from '@graph-ir/core';
import { validateIR } from '@graph-ir/core/validation';
import { isSequenceGraph, validateSequenceInteraction } from '@coral-viz/language/sequence';
import {
  evaluateConformance028, runRuleset028,
  type ConformanceReport, type ConformanceRequest, type RuleDefinition,
  type RuleFinding, type RulesetDefinition, type SymbolException,
} from './conformance028.js';
import { notationCatalogIdentity028, notationRegistry, resolveNotationNode028 } from './notations/index.js';
import { uncertainDecisionFlows028 } from './rulesets/flowchart028.js';
import { uncertainSequenceFlows028 } from './rulesets/bpmn028.js';
import { profileRuleCard028 } from './rulesets/index028.js';
import { allGraphNodes028 } from './graphNodes028.js';
import { assessGraphPortReferences028, type PortReferenceRanges028 } from './graphPortReferences028.js';
import { effectiveGraphNotationId028 } from './graphNotation028.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import { SemanticSidecarMismatch028 } from './semanticSidecar028.js';
import type { SourceEdgeDirection028 } from './sourceDirection028.js';

export type { PortReferenceRanges028 } from './graphPortReferences028.js';

function portableIntegrityFindings(graph: GraphIR, allowSequencePorts = false, allowSpatialSidecar = false): RuleFinding[] {
  const portable = validateIR(allowSpatialSidecar ? spatialValidationGraph028(graph) : graph);
  const findings: RuleFinding[] = portable.errors.map((error) => ({
    id: `GRAPHIR.${error.code}`, category: 'integrity', severity: 'error',
    message: error.message, path: error.path,
  }));
  // The entry point has already checked schema shape. Sequence-specific
  // structure is owned by language, not GraphIR 3.
  if (isSequenceGraph(graph)) {
    // GraphIR 3's sequence checker predates semantic endpoint ports. A
    // successor-backed source keeps those references on the display edges for
    // U1 validation, but they are not sequence timeline fields.
    const sequenceGraph = allowSequencePorts ? { ...graph, edges: graph.edges.map(
      ({ sourcePort: _sourcePort, targetPort: _targetPort, ...edge }) => edge) } : graph;
    findings.push(...validateSequenceInteraction(sequenceGraph).map((issue) => ({
      id: issue.code, category: 'integrity' as const, severity: 'error' as const,
      message: issue.message,
      subject: { kind: issue.entity.kind, id: issue.entity.id },
    })));
  }
  return findings;
}

/** Staged common entry point; source settings enter through the installed document adapter. */
export function checkGraphConformance028(
  graph: GraphIR,
  request: ConformanceRequest,
  exceptions: readonly SymbolException[] = [],
  portReferenceRanges?: PortReferenceRanges028,
  options: { allowSequencePorts?: boolean;
    /** Internal source path only, after exact successor verification. */
    allowSpatialSidecar?: boolean;
    semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>;
    sourceDirections?: ReadonlyMap<string, SourceEdgeDirection028>;
    sourceDirectionObligations?: readonly { id: string; message: string }[] } = {},
): ConformanceReport {
  const schema = validateIR(options.allowSpatialSidecar ? spatialValidationGraph028(graph) : graph, { mode: 'schema' });
  if (!schema.valid) return evaluateConformance028(request, schema.errors.map((error) => ({
    id: `GRAPHIR.${error.code}`, category: 'integrity' as const, severity: 'error' as const,
    message: error.message, path: error.path,
  })));
  const portableIntegrity = portableIntegrityFindings(graph, options.allowSequencePorts, options.allowSpatialSidecar);
  const profileId = effectiveGraphNotationId028(graph);
  if (!profileId) return evaluateConformance028(request, [{ id: 'CORAL.PROFILE.MISSING',
    category: 'capability', severity: 'error',
    message: 'A saved Coral diagram must declare its notation profile' }, ...portableIntegrity]);
  const notation = notationRegistry.get(profileId);
  if (!notation) {
    return evaluateConformance028(request, [{ id: 'CORAL.PROFILE.UNAVAILABLE',
      category: 'capability', severity: 'error',
      message: `Unknown notation profile: ${profileId}` }, ...portableIntegrity]);
  }
  // GraphIR's closed UML profile is the portable meaning. If descriptive
  // metadata names the other UML family member, do not execute that member's
  // rule card as though it were the graph's profile.
  if (portableIntegrity.some((finding) => finding.id === 'GRAPHIR.PROFILE_CONTRADICTION')) {
    return evaluateConformance028(request, portableIntegrity);
  }

  let portReferences: ReturnType<typeof assessGraphPortReferences028>;
  try {
    portReferences = assessGraphPortReferences028(graph, profileId, portReferenceRanges,
      options.semanticInterpretations, options.sourceDirections);
  } catch (cause) {
    if (!(cause instanceof SemanticSidecarMismatch028)) throw cause;
    const report = evaluateConformance028(request, [...portableIntegrity, {
      id: 'CORAL.SEMANTIC_SIDECAR.MISMATCH', category: 'capability', severity: 'error',
      message: cause.message, subject: { kind: 'node', id: cause.nodeId },
    }]);
    return { ...report, catalog: notationCatalogIdentity028(profileId) };
  }
  const nodes = allGraphNodes028(graph.nodes);
  const nodeById = new Map<string, typeof nodes[number]>();
  const ambiguousIds = new Set<string>();
  for (const node of nodes) {
    if (nodeById.has(node.id)) ambiguousIds.add(node.id);
    else nodeById.set(node.id, node);
  }
  // GraphIR 3 only recognizes authored geometric ports. Catalog ports are a
  // Coral U1 semantic namespace, checked by the shared port assessor.
  const graphIntegrity = portableIntegrity.filter((finding) =>
    !(finding.id === 'GRAPHIR.INVALID_PORT_REFERENCE' &&
      portReferences.supersededGraphIrPaths.has(finding.path ?? '')) &&
    !(finding.id === 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE' &&
      portReferences.supersededRoutePortPaths.has(finding.path ?? '')));
  const semanticPortAssessments = portReferences.assessments;
  const semanticPortFindings: RuleFinding[] = semanticPortAssessments.flatMap(({ index, assessment }) =>
    assessment.diagnostics.map((diagnostic) => ({ id: diagnostic.code, category: 'integrity' as const,
      severity: 'error' as const, message: diagnostic.message,
      path: `/edges/${index}/${diagnostic.role}Port`,
      ...(diagnostic.range ? { range: diagnostic.range } : {}),
      subject: { kind: 'edge' as const, id: diagnostic.edgeId } })));
  const semanticPortObligations = semanticPortAssessments.flatMap(({ assessment }) => assessment.obligations);
  const flowchartDirectionObligations = profileId === 'flowchart'
    ? uncertainDecisionFlows028(graph, options.sourceDirections).map(({ decisionId, edgeId, kind }) => ({
      id: kind === 'two-ended' ? 'FLOWCHART.DECISION.TWO_ENDED_FLOW.UNVERIFIED'
        : 'FLOWCHART.DECISION.NEUTRAL_FLOW.UNVERIFIED',
      message: `${kind === 'two-ended' ? 'Two-ended' : 'Direction-unspecified'} flow ${edgeId} at decision ${decisionId} has no settled flow direction`,
    })) : [];
  const bpmnDirectionObligations = profileId === 'bpmn'
    ? uncertainSequenceFlows028(graph, options.sourceDirections).map((edgeId) => ({
      id: 'BPMN.SEQUENCE.DIRECTION.UNVERIFIED',
      message: `Sequence Flow ${edgeId} has no settled direction`,
    })) : [];
  const validExceptions: SymbolException[] = [];
  const invalidExceptions: RuleFinding[] = [];
  const seenExceptions = new Set<string>();
  for (const exception of exceptions) {
    const key = `${exception.nodeId}\u0000${exception.symbol}`;
    const duplicate = seenExceptions.has(key);
    seenExceptions.add(key);
    const node = nodeById.get(exception.nodeId);
    const eligible = node?.symbol === exception.symbol && !ambiguousIds.has(exception.nodeId)
      && (options.semanticInterpretations?.get(node.id) ?? resolveNotationNode028(node, profileId))
        .diagnostics.some((diagnostic) =>
        diagnostic.code === 'coral.symbol.foreign-profile');
    if (!duplicate && eligible) validExceptions.push(exception);
    else invalidExceptions.push({ id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID',
      category: 'integrity', severity: 'error',
      message: duplicate ? `Duplicate conformance exception for ${exception.nodeId}`
        : `Conformance exception does not name a known, explicit out-of-profile symbol on ${exception.nodeId}`,
      subject: { kind: 'node', id: exception.nodeId } });
  }

  const symbolRule: RuleDefinition<GraphIR> = {
    id: 'CORAL.SYMBOL.OUT_OF_PROFILE', minimumLevel: 'typical',
    severity: 'warning', strictSeverity: 'error',
    provenance: { kind: 'coral', reference: `profile:${profileId}@${notation.version}` },
    evidenceScope: 'node',
    remediation: 'Choose a symbol in this profile or declare a scoped strict exception.',
    check: (input) => allGraphNodes028(input.nodes).flatMap((node) => {
      if (!node.symbol) return [];
      const interpreted = options.semanticInterpretations?.get(node.id) ?? resolveNotationNode028(node, profileId);
      if (!interpreted.diagnostics.some((item) => item.code === 'coral.symbol.foreign-profile')) return [];
      return [{ message: `Symbol ${node.symbol} is outside notation ${profileId}`,
        subject: { kind: 'node' as const, id: node.id },
        causes: [{ kind: 'explicit-symbol' as const, nodeId: node.id, symbol: node.symbol }] }];
    }),
  };
  const card = profileRuleCard028(profileId, options.sourceDirections);
  const ruleset: RulesetDefinition<GraphIR> = { ...card,
    rules: [symbolRule, ...card.rules] };
  const unsupported: RuleFinding[] = nodes.flatMap((node) => {
    const interpreted = options.semanticInterpretations?.get(node.id) ?? resolveNotationNode028(node, profileId);
    return interpreted.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'coral.symbol.unknown' || diagnostic.code === 'coral.variant.unknown' ||
      diagnostic.code === 'coral.port.duplicate' || diagnostic.code.startsWith('coral.port.anchor.'))
      .map((diagnostic) => ({
      id: diagnostic.code,
      category: diagnostic.code.startsWith('coral.port.') ? 'integrity' as const : 'capability' as const,
      severity: 'error' as const,
      message: diagnostic.message, subject: { kind: 'node' as const, id: node.id },
    }));
  });
  return { ...runRuleset028(profileId, graph, ruleset, request, validExceptions,
    [...graphIntegrity, ...semanticPortFindings, ...unsupported, ...invalidExceptions],
    [...semanticPortObligations, ...flowchartDirectionObligations, ...bpmnDirectionObligations,
      ...(options.sourceDirectionObligations ?? [])]),
    catalog: notationCatalogIdentity028(profileId) };
}
