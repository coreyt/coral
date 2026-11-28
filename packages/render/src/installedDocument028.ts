import type {GraphIR} from '@graph-ir/core';
import {
  HEADER_MANIFEST_028, parseDocument028, pinHeaderEdition029, prepareHeaderForSave028,
  type CandidateNodeSyntax, type HeaderRuntime028,
} from '@coral-viz/language';
import type { AdmittedSvgArtwork029 } from './artwork/svgArtworkModel029.js';
import { admitSourceArtwork029 } from './artwork/svgArtworkSource029.js';
import { checkUserSymbolDefinition029 } from './userSymbolDefinitionCheck029.js';
import { checkGraphConformance028 } from './graphConformance028.js';
import type { PortReferenceRanges028 } from './graphPortReferences028.js';
import type { SourceRange028 } from './portReferences028.js';
import type { SuccessorWrittenPortRanges028 } from './successorSourcePortReferences028.js';
import type { ConformanceReport, ConformanceRequest, RuleFinding } from './conformance028.js';
import { notationCatalogIdentity028, notationCatalogIdentity0214, notationCatalogIdentity0217, notationRegistry } from './notations/index.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import { sourceEdgeDirection028 } from './sourceDirection028.js';

/** Bind the staged source reader to the exact catalogs shipped in this render package. */
function installedHeaderRuntime028(): HeaderRuntime028 {
  const trustedDigests: Record<string, string> = {};
  for (const notation of notationRegistry.getAll()) {
    const identity = notationCatalogIdentity028(notation.id);
    if (!identity) throw new Error(`Installed notation ${notation.id} has no catalog identity`);
    trustedDigests[`${identity.id}@${identity.version}`] = identity.digest;
    const identity0214 = notationCatalogIdentity0214(notation.id);
    if (identity0214) trustedDigests[`${identity0214.id}@${identity0214.version}`] = identity0214.digest;
    const identity0217 = notationCatalogIdentity0217(notation.id);
    if (identity0217) trustedDigests[`${identity0217.id}@${identity0217.version}`] = identity0217.digest;
  }
  return { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
}

/** A read document plus the admitted artwork of each listed user-symbol definition. */
export type InstalledDocument028 = ReturnType<typeof parseDocument028> & {
  /** Keyed by definition ID; present exactly when `definitions` is, with one entry per definition. */
  artwork?: ReadonlyMap<string, AdmittedSvgArtwork029>;
};

/** Installed 0.2.8 source reader shared by editor, browser, and MCP. Every
 * artwork block is admitted with coral.svg-artwork 1 here, and outline
 * geometry is checked, so no consumer reads definitions without either. */
export function parseInstalledDocument028(source: string): InstalledDocument028 {
  const artwork = new Map<string, AdmittedSvgArtwork029>();
  const document = parseDocument028(source, installedHeaderRuntime028(),
    { admitArtwork: (input) => admitSourceArtwork029(input, artwork),
      checkDefinition: checkUserSymbolDefinition029 });
  if (!document.definitions) return document;
  // The hook also admits artwork of definitions withheld for other findings; keep the map and list in step.
  const listed = new Set(document.definitions.map((definition) => definition.id));
  for (const id of [...artwork.keys()]) if (!listed.has(id)) artwork.delete(id);
  return { ...document, artwork };
}

/** Add only the visible draft-version pin; never rewrite the author's other source. */
export function prepareInstalledDocumentForSave028(
  source: string, parsed: ReturnType<typeof parseDocument028>,
): ReturnType<typeof prepareHeaderForSave028> {
  return prepareHeaderForSave028(source, parsed.header, installedHeaderRuntime028());
}

/** Undoable edition pin for placement and the coral.symbol.local.edition quick fix. */
export function pinInstalledDocumentEdition029(source: string): ReturnType<typeof pinHeaderEdition029> {
  return pinHeaderEdition029(source, installedHeaderRuntime028());
}

/** Source locations for the shared catalog-port assessor. Withhold an edge's
 * range when statement/graph order no longer proves exact correspondence. */
export function installedPortReferenceRanges028(
  document: ReturnType<typeof parseDocument028>,
): PortReferenceRanges028 {
  const portRanges = new Map<string, {
    sourcePort?: SourceRange028;
    targetPort?: SourceRange028;
  }>();
  const graph=document.graph??(!document.syntax.diagnostics.some(item=>item.severity==='error')?document.syntax.graph:undefined);
  const edgeStatements = document.syntax.statements.filter((item) => item.kind === 'edge');
  if (!graph || edgeStatements.length !== graph.edges.length) return portRanges;
  graph.edges.forEach((edge, index) => {
    const statement = edgeStatements[index]!;
    const reverseSequence = document.header.header?.diagramType === 'uml-sequence' &&
      (statement.operatorConnector ?? statement.connector)?.firstEnd.kind === 'arrow' &&
      (statement.operatorConnector ?? statement.connector)?.secondEnd.kind === 'none';
    const sourcePort = reverseSequence ? statement.targetPort : statement.sourcePort;
    const targetPort = reverseSequence ? statement.sourcePort : statement.targetPort;
    if (sourcePort || targetPort) portRanges.set(edge.id, {
      ...(sourcePort ? { sourcePort: sourcePort.range } : {}),
      ...(targetPort ? { targetPort: targetPort.range } : {}),
    });
  });
  return portRanges;
}

/** Source-owned endpoint locations; first/second are written order even for
 * a reverse arrow or a sequence message whose sender is the second endpoint. */
export function installedWrittenPortReferenceRanges028(
  document: ReturnType<typeof parseDocument028>,
): SuccessorWrittenPortRanges028 {
  const ranges = new Map<string, { firstPort?: SourceRange028; secondPort?: SourceRange028 }>();
  const graph=document.graph??(!document.syntax.diagnostics.some(item=>item.severity==='error')?document.syntax.graph:undefined);
  const statements = document.syntax.statements.filter((item) => item.kind === 'edge');
  if (!graph || statements.length !== graph.edges.length) return ranges;
  graph.edges.forEach((edge, index) => {
    const statement = statements[index]!;
    if (statement.sourcePort || statement.targetPort) ranges.set(edge.id, {
      ...(statement.sourcePort ? { firstPort: statement.sourcePort.range } : {}),
      ...(statement.targetPort ? { secondPort: statement.targetPort.range } : {}),
    });
  });
  return ranges;
}

/** Explicit source-level U2 check. Omission uses the saved (or safely defaulted)
 * level; a one-off request never mutates it. Invalid source cannot make a claim. */
export function checkInstalledDocumentConformance028(
  source: string,
  request: Pick<ConformanceRequest, 'requestedLevel' | 'notificationLevel'> = {},
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>,
  verifiedDisplay?: GraphIR,
): { document: ReturnType<typeof parseDocument028>; report?: ConformanceReport } {
  const document = parseInstalledDocument028(source);
  const graph=document.graph??verifiedDisplay;
  if (!graph || !document.header.header) return { document };
  const edgeStatements = document.syntax.statements.filter((item) => item.kind === 'edge');
  const portRanges = installedPortReferenceRanges028({...document,graph});
  const sourceDirections = edgeStatements.length === graph.edges.length
    ? new Map(graph.edges.map((edge, index) =>
      [edge.id, sourceEdgeDirection028(edgeStatements[index]!)] as const)) : undefined;
  const sourceDirectionObligations = edgeStatements.flatMap((edge, index) => {
    const authored = edge.operatorConnector;
    const displayed = edge.connector;
    if (!authored || !displayed) return [];
    const markerDirection = (connector: typeof authored) => {
      const first = connector.firstEnd.kind === 'arrow';
      const second = connector.secondEnd.kind === 'arrow';
      return first && second ? 'both' : first ? 'second-to-first' :
        second ? 'first-to-second' : 'none';
    };
    return markerDirection(authored) !== markerDirection(displayed) ? [{
      id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
      message: `Connector ${edge.id?.value ?? `edge-${index + 1}`} keeps its authored direction in the source-owned model, but the legacy display graph alone cannot verify direction independently of its end markers`,
    }] : [];
  });
  const exceptionDeclarations = document.syntax.statements.filter((item): item is CandidateNodeSyntax =>
    item.kind === 'node' && item.conformanceException !== undefined);
  const exceptions = exceptionDeclarations.map((item) => ({
    nodeId: item.qualifiedId ?? item.id.value, symbol: item.conformanceException!.value,
  }));
  const report = checkGraphConformance028(graph, {
    savedLevel: document.header.header.conformanceLevel,
    ...(request.requestedLevel ? { requestedLevel: request.requestedLevel } : {}),
    ...(request.notificationLevel ? { notificationLevel: request.notificationLevel } : {}),
    operation: 'check',
  }, exceptions, portRanges, { allowSequencePorts: document.header.header.diagramType === 'uml-sequence',
    ...(verifiedDisplay ? {allowSpatialSidecar:true} : {}),
    ...(semanticInterpretations ? { semanticInterpretations } : {}),
    sourceDirectionObligations,
    ...(sourceDirections ? { sourceDirections } : {}) });
  const nodeDeclarations = new Map(document.syntax.statements.filter((item) => item.kind === 'node')
    .map((item) => [item.qualifiedId ?? item.id.value, item] as const));
  const edgeRanges = new Map<string, typeof edgeStatements[number]['operator']['range']>();
  const edgeOperatorRanges = new Map<string, typeof edgeStatements[number]['operator']['range']>();
  const inheritanceEndRanges = new Map<string, typeof edgeStatements[number]['operator']['range']>();
  // A valid candidate emits edges in statement order. If a later parser
  // changes that invariant, withhold ranges rather than pointing at another
  // author's statement.
  if (edgeStatements.length === graph.edges.length) {
    graph.edges.forEach((edge, index) => {
      const statement = edgeStatements[index]!;
      edgeOperatorRanges.set(edge.id, statement.operator.range);
      // The existing inheritance rule inspects the written second-end mark.
      // A keyed end supplies that evidence independently of the operator.
      inheritanceEndRanges.set(edge.id, (statement.secondEnd ?? statement.operator).range);
      if (statement.edgeType) edgeRanges.set(edge.id, statement.edgeType.range);
    });
  }
  const routePortRanges = new Map<string, { range: SourceRange028; edgeId: string }>();
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  for (const route of document.syntax.statements) {
    if (route.kind !== 'route') continue;
    const scope = route.scope?.map((token) => token.value) ?? [];
    const candidates = route.edge.value.includes('.') ? [route.edge.value]
      : Array.from({ length: scope.length + 1 }, (_, index) =>
        [...scope.slice(0, scope.length - index), route.edge.value].join('.'));
    const edgeId = candidates.find((id) => edgeIds.has(id));
    const matches = graph.edges.flatMap((edge, index) => edge.id === edgeId ? [{ edge, index }] : []);
    if (matches.length !== 1) continue;
    const { edge, index } = matches[0]!;
    if (edge.routeIntent?.waypoints.length !== route.waypoints.length) continue;
    route.waypoints.forEach((waypoint, waypointIndex) => {
      const staged = edge.routeIntent!.waypoints[waypointIndex]!;
      const anchor = staged.placement.kind === 'relative' ? staged.placement.anchor : undefined;
      if (staged.id !== waypoint.id.value || anchor?.kind !== 'port' ||
        anchor.portId !== waypoint.anchorPort?.value) return;
      routePortRanges.set(`/edges/${index}/routeIntent/waypoints/${waypointIndex}/placement/anchor/portId`,
        { range: waypoint.anchorPort.range, edgeId: edge.id });
    });
  }
  const annotated = new Map<RuleFinding, RuleFinding>();
  const findings = report.findings.map((finding) => {
    // Only rules whose evidence token is settled receive a source range. A
    // future rule about a label, end marker, or explicit symbol must not
    // misleadingly point at the declaration's kind or connector type.
    const declaration = finding.subject?.kind === 'node'
      ? nodeDeclarations.get(finding.subject.id) : undefined;
    const token = declaration?.nodeKind;
    const nodeKindMatches = finding.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED'
      ? token?.value === 'event'
      : finding.id === 'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE' ||
        finding.id === 'BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED'
        ? token?.value === 'startEvent'
        : finding.id === 'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE' ||
          finding.id === 'BPMN.EVENT.TOP_LEVEL.END_INCOMING_SEQUENCE_REQUIRED'
          ? token?.value === 'endEvent'
      : finding.id === 'CORAL.FLOWCHART.DECISION.SINGLE_ENTRY' ||
        finding.id === 'CORAL.FLOWCHART.DECISION.ALTERNATIVES'
        ? token?.value === 'decision'
      : finding.id === 'CORAL.UML.STATE.INITIAL.NO_INCOMING' ||
        finding.id === 'CORAL.UML.STATE.INITIAL.OUTGOING_REQUIRED'
        ? token?.value === 'initial'
      : finding.id === 'CORAL.UML.STATE.FINAL.NO_OUTGOING'
        ? token?.value === 'final'
      : finding.id === 'CORAL.UML.STATE.CHOICE.BRANCHES'
        ? token?.value === 'choice'
      : finding.id === 'CORAL.UML.STATE.FORK_JOIN.DEGREE'
        ? token?.value === 'fork' || token?.value === 'join' : false;
    const explicitChoice = finding.id === 'CORAL.SYMBOL.OUT_OF_PROFILE' ||
      finding.id === 'coral.symbol.unknown' ? declaration?.symbol
      : finding.id === 'coral.variant.unknown' ? declaration?.variant
      : (finding.id === 'CORAL.FLOWCHART.DECISION.SINGLE_ENTRY' ||
        finding.id === 'CORAL.FLOWCHART.DECISION.ALTERNATIVES') &&
        declaration?.symbol?.value === 'flowchart-decision' ? declaration.symbol
      : (finding.id === 'CORAL.UML.STATE.INITIAL.NO_INCOMING' ||
        finding.id === 'CORAL.UML.STATE.INITIAL.OUTGOING_REQUIRED') &&
        declaration?.symbol?.value === 'uml-state-initial' ? declaration.symbol
      : finding.id === 'CORAL.UML.STATE.FINAL.NO_OUTGOING' &&
        declaration?.symbol?.value === 'uml-state-final' ? declaration.symbol
      : finding.id === 'CORAL.UML.STATE.CHOICE.BRANCHES' &&
        declaration?.symbol?.value === 'uml-state-choice' ? declaration.symbol
      : finding.id === 'CORAL.UML.STATE.FORK_JOIN.DEGREE' &&
        (declaration?.symbol?.value === 'uml-state-fork' || declaration?.symbol?.value === 'uml-state-join')
        ? declaration.symbol : undefined;
    const exceptionChoice = finding.id === 'CORAL.CONFORMANCE.EXCEPTION.INVALID'
      ? declaration?.conformanceException : undefined;
    const routePort = finding.id === 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE'
      ? routePortRanges.get(finding.path ?? '') : undefined;
    const range = !finding.range && routePort ? routePort.range
      : !finding.range && (explicitChoice ?? exceptionChoice)
      ? (explicitChoice ?? exceptionChoice)!.range
      : finding.category === 'notation' && !finding.range
      ? nodeKindMatches ? token?.range
        : finding.subject?.kind === 'edge' && (
          finding.id === 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS' ||
          finding.id === 'BPMN.CONNECTOR.RELATION_UNREGISTERED')
          ? edgeRanges.get(finding.subject.id)
        : finding.subject?.kind === 'edge' && finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED'
          ? edgeOperatorRanges.get(finding.subject.id)
        : finding.subject?.kind === 'edge' && finding.id === 'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE'
          ? inheritanceEndRanges.get(finding.subject.id)
        : finding.subject?.kind === 'edge' && (
          finding.id === 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT' ||
          finding.id === 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED')
          ? edgeRanges.get(finding.subject.id) : undefined
      : undefined;
    const result = range ? { ...finding, range,
      ...(routePort ? { subject: { kind: 'edge' as const, id: routePort.edgeId } } : {}) } : finding;
    annotated.set(finding, result);
    return result;
  });
  return { document, report: { ...report, findings,
    notices: report.notices.map((finding) => annotated.get(finding) ?? finding) } };
}
