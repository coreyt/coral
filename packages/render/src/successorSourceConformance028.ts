import {validateGraphIRSuccessorWithCatalog} from '@graph-ir/core';
import {successorSourceDisplay028,successorSourceDisplayWithSemanticPorts028} from './successorSourceDisplay028.js';
import {successorCoreValidationInput029} from './successorInterpretation028.js';
import { checkGraphConformance028 } from './graphConformance028.js';
import { checkInstalledDocumentConformance028, parseInstalledDocument028 } from './installedDocument028.js';
import type { ConformanceReport, ConformanceRequest, RuleFinding } from './conformance028.js';
import type { SourceRange028 } from './portReferences028.js';
import { projectInstalledSourceToSuccessor028, type SuccessorSourceProjection028 } from './successorSourceProjection028.js';
import { successorSequenceDisplay028, successorSequenceRuleView028 } from './successorSequenceDisplay028.js';
import { sequenceFragmentDisplayDiagnostics028 } from './successorSequenceDisplay028.js';
import { resolveSuccessorGraphNodes028 } from './successorInterpretation028.js';
import { sequenceSourcePortCapabilityDiagnostics028,
  sourcePortDeclarationDiagnostics028 } from './successorSourcePortDeclarations028.js';
import { assessInstalledSuccessorSourceIntegrity028 } from './successorSourceIntegrity028.js';
import { editionAdmitsUserSymbols029, type CandidateFragmentSyntax, type CandidateNodeSyntax,
  type CandidatePortSyntax } from '@coral-viz/language';
import { assessSuccessorSourcePortLimits029 } from './successorSourcePortReferences028.js';
import { selectsUserSymbol029 } from './userSymbolNotices029.js';

export interface SuccessorSourceConformanceResult028 {
  document: ReturnType<typeof parseInstalledDocument028>;
  report?: ConformanceReport;
  diagnostics: SuccessorSourceProjection028['diagnostics'];
  /** Edition 0.2.9: a document in which a node selects a user symbol is not
   * conformance-checked; any report is evaluated at level `none`. */
  notChecked029?: { reason: 'user-symbols'; message: 'not checked: document uses user symbols' };
}

/** Explicit source check: use the ordinary path where GraphIR 3 is faithful,
 * and the source-owned successor for reverse-directed flat sequence messages. */
export function checkInstalledSuccessorSourceConformance028(
  source: string,
  request: Pick<ConformanceRequest, 'requestedLevel' | 'notificationLevel'> = {},
): SuccessorSourceConformanceResult028 {
  const projected = projectInstalledSourceToSuccessor028(source);
  // Author decision 2026-10-30: the whole document's effective level is `none`.
  if (projected.graph && selectsUserSymbol029(projected.graph)) return {
    ...checkSourceConformance028(source, { ...request, requestedLevel: 'none' }, projected),
    notChecked029: { reason: 'user-symbols', message: 'not checked: document uses user symbols' },
  };
  return checkSourceConformance028(source, request, projected);
}

function checkSourceConformance028(
  source: string,
  request: Pick<ConformanceRequest, 'requestedLevel' | 'notificationLevel'>,
  projected: SuccessorSourceProjection028,
): SuccessorSourceConformanceResult028 {
  const ordinary = checkInstalledDocumentConformance028(source, request);
  const hasReverseSequence = ordinary.document.header.header?.diagramType === 'uml-sequence' &&
    ordinary.document.syntax.statements.some((item) => item.kind === 'edge' &&
      (item.operatorConnector ?? item.connector)?.firstEnd.kind === 'arrow' &&
      (item.operatorConnector ?? item.connector)?.secondEnd.kind === 'none');
  const hasAuthoredPorts = ordinary.document.syntax.statements.some((item) => item.kind === 'port');
  // A GraphIR 3 staging graph is not evidence that source-owned successor
  // meaning was projected. Never report conformance through that fallback.
  if (!projected.graph) return { document: ordinary.document, diagnostics: projected.diagnostics };
  const hasSemanticRouteAnchors = projected.graph.edges.some((edge) => edge.routeIntent?.waypoints.some(
    (waypoint) => waypoint.placement.kind === 'relative' && waypoint.placement.anchor.kind === 'port'));
  const styleCapabilities = ordinary.document.syntax.statements.flatMap((item) => {
    if (item.kind !== 'edge' || !item.style) return [];
    return [
      ...(item.styleIntent?.strokeColor ? [{ code: 'render.capability.edge-rgb',
        message: 'This RGB edge has portable meaning, but no verified color-preserving scene.',
        range: item.style.range }] : []),
      ...(item.styleIntent?.strokeWeight ? [{ code: 'render.capability.edge-stroke-weight',
        message: 'This edge weight has portable meaning, but no verified weight-preserving scene.',
        range: item.style.range }] : []),
      ...(item.styleIntent?.motion ? [{ code: 'render.capability.edge-motion',
        message: 'This edge motion has portable meaning, but no verified motion-preserving scene.',
        range: item.style.range }] : []),
    ];
  });
  if (styleCapabilities.length)
    return { document: ordinary.document,
    diagnostics: [...projected.diagnostics, ...styleCapabilities,
      ...assessInstalledSuccessorSourceIntegrity028(ordinary.document, projected.graph)] };
  // Edition 0.2.9 connection limits are source meaning that no GraphIR 3 report checks.
  const edition = ordinary.document.header.effectiveCoralVersion;
  if (edition !== undefined && editionAdmitsUserSymbols029(edition) &&
    assessSuccessorSourcePortLimits029(projected.graph).length)
    return { document: ordinary.document, diagnostics: [...projected.diagnostics,
      ...assessInstalledSuccessorSourceIntegrity028(ordinary.document, projected.graph)] };
  const fragments = ordinary.document.syntax.statements.filter(
    (item): item is CandidateFragmentSyntax => item.kind === 'fragment');
  const participantGroups = ordinary.document.syntax.statements.filter(
    (item) => item.kind === 'participant-group');
  const fragmentCapabilities = sequenceFragmentDisplayDiagnostics028(fragments, projected.graph);
  const portDeclarations = ordinary.document.syntax.statements.filter(
    (item): item is CandidatePortSyntax => item.kind === 'port');
  const portSceneCapabilities = projected.graph.interaction
    ? sequenceSourcePortCapabilityDiagnostics028(portDeclarations) : [];
  const sourceIntegrity = projected.graph.interaction
    ? assessInstalledSuccessorSourceIntegrity028(ordinary.document, projected.graph) : [];
  if (projected.graph.interaction && sourceIntegrity.length > 0 &&
    (portDeclarations.length > 0 || fragments.length > 0 || participantGroups.length > 0)) return {
    document: ordinary.document,
    diagnostics: [
      ...projected.diagnostics,
      ...fragmentCapabilities,
      ...portSceneCapabilities,
      ...sourceIntegrity,
    ],
  };
  if (ordinary.report && !hasReverseSequence && !hasAuthoredPorts && !hasSemanticRouteAnchors && !fragments.length && !participantGroups.length) return {
    ...ordinary, diagnostics: projected.diagnostics,
  };
  if ((hasAuthoredPorts || hasSemanticRouteAnchors) && ordinary.document.graph && !projected.graph.interaction && !hasReverseSequence) {
    const semanticInterpretations = resolveSuccessorGraphNodes028(projected.graph);
    const checked = checkInstalledDocumentConformance028(source, request, semanticInterpretations);
    const portFindings = sourcePortDeclarationDiagnostics028(
      portDeclarations,
      semanticInterpretations);
    if (!checked.report) return { ...checked, diagnostics: projected.diagnostics };
    const annotated = new Map<RuleFinding, RuleFinding>();
    const findings = checked.report.findings.map((finding) => {
      const located = portFindings.find((candidate) => candidate.code === finding.id &&
        candidate.message === finding.message && candidate.subject.id === finding.subject?.id);
      const result = located?.range && !finding.range ? { ...finding, range: located.range } : finding;
      annotated.set(finding, result);
      return result;
    });
    return { ...checked, report: { ...checked.report, findings,
      notices: checked.report.notices.map((finding) => annotated.get(finding) ?? finding) },
    diagnostics: projected.diagnostics };
  }
  if (!projected.graph.interaction) {
    const core=successorCoreValidationInput029(projected.graph);
    const exact=validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
    const integrity=assessInstalledSuccessorSourceIntegrity028(ordinary.document,projected.graph);
    if(!exact.valid||!exact.verification.complete||integrity.length)return {document:ordinary.document,diagnostics:[...projected.diagnostics,...integrity,...exact.errors.map(error=>({code:'coral.successor.validation.failed',message:`${error.path}: ${error.message}`})),...exact.verification.obligations.map(item=>({code:'coral.successor.validation.unverified',message:item.message}))]};
    try {
      const interpretations=resolveSuccessorGraphNodes028(projected.graph);
      const display=hasAuthoredPorts?successorSourceDisplayWithSemanticPorts028(projected.graph).display:successorSourceDisplay028(projected.graph);
      const checked=checkInstalledDocumentConformance028(source,request,interpretations,display);
      return {...checked,diagnostics:projected.diagnostics};
    }catch(cause){return {document:ordinary.document,diagnostics:[{code:'coral.successor.display.unsupported',message:cause instanceof Error?cause.message:'Display projection failed'}]};}
  }
  let display;
  try { display = fragmentCapabilities.length || portSceneCapabilities.length
    ? successorSequenceRuleView028(projected.graph)
    : successorSequenceDisplay028(projected.graph); }
  catch (cause) { return { ...ordinary, diagnostics: [{
    code: 'coral.successor.sequence.display.unsupported',
    message: cause instanceof Error ? cause.message : 'Sequence display projection failed',
  }] }; }

  const statements = ordinary.document.syntax.statements.filter((item) => item.kind === 'edge');
  if (statements.length !== display.edges.length) return { ...ordinary, diagnostics: [{
    code: 'coral.successor.conformance.edge-order',
    message: 'Source edge tokens cannot be paired with successor edges.',
  }] };
  const portRanges: Map<string, { sourcePort?: SourceRange028; targetPort?: SourceRange028 }> = new Map();
  const explicitTypes = new Map<string, typeof statements[number]['edgeType']>();
  display.edges.forEach((edge, index) => {
    const syntax = statements[index]!;
    const reverse = projected.graph!.edges[index]!.direction === 'second-to-first';
    const sourcePort = reverse ? syntax.targetPort : syntax.sourcePort;
    const targetPort = reverse ? syntax.sourcePort : syntax.targetPort;
    portRanges.set(edge.id, {
      ...(sourcePort ? { sourcePort: sourcePort.range } : {}),
      ...(targetPort ? { targetPort: targetPort.range } : {}),
    });
    if (syntax.edgeType) explicitTypes.set(edge.id, syntax.edgeType);
  });
  const report = checkGraphConformance028(display, {
    savedLevel: projected.graph.conformanceLevel,
    ...(request.requestedLevel ? { requestedLevel: request.requestedLevel } : {}),
    ...(request.notificationLevel ? { notificationLevel: request.notificationLevel } : {}),
    operation: 'check',
  }, projected.graph.conformanceExceptions?.map(({ nodeId, symbol }) => ({ nodeId, symbol })) ?? [],
  portRanges, { allowSequencePorts: true,
    semanticInterpretations: resolveSuccessorGraphNodes028(projected.graph),
    sourceDirectionObligations: [
      ...(ordinary.report?.unverifiedObligations.filter((item) =>
        item.id === 'CORAL.DIRECTION.DISPLAY_UNVERIFIED') ?? []),
      ...(fragmentCapabilities.length ? [{ id: 'CORAL.SEQUENCE.FRAGMENT_SCENE.UNVERIFIED',
        message: fragmentCapabilities.some((item) => item.message.includes('empty operand'))
          ? 'An empty operand has no verified sequence scene.'
          : 'This sequence fragment has no verified scene for its current operands.' }] : []),
      ...(portSceneCapabilities.length ? [{ id: 'CORAL.SEQUENCE.SEMANTIC_PORT_SCENE.UNVERIFIED',
        message: 'Sequence participant semantic ports are preserved in source, but their scene attachments are not verified.' }] : []),
    ] });
  const replacements = new Map<RuleFinding, RuleFinding>();
  const findings = report.findings.map((finding) => {
    const token = (finding.id === 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT' ||
      finding.id === 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED') &&
      finding.subject?.kind === 'edge' ? explicitTypes.get(finding.subject.id) : undefined;
    const exceptionToken = finding.id === 'CORAL.CONFORMANCE.EXCEPTION.INVALID' &&
      finding.subject?.kind === 'node'
      ? ordinary.document.syntax.statements.find((item): item is CandidateNodeSyntax =>
        item.kind === 'node' && (item.qualifiedId ?? item.id.value) === finding.subject?.id)
        ?.conformanceException : undefined;
    const mapped = (token ?? exceptionToken) && !finding.range
      ? { ...finding, range: (token ?? exceptionToken)!.range } : finding;
    replacements.set(finding, mapped);
    return mapped;
  });
  return { document: ordinary.document,
    report: { ...report, findings,
      notices: report.notices.map((finding) => replacements.get(finding) ?? finding) },
    diagnostics: [...projected.diagnostics, ...fragmentCapabilities, ...portSceneCapabilities] };
}
