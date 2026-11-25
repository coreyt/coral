import type { CandidateNodeSyntax, DiagnosticRange } from '@coral-viz/language';
import { installedWrittenPortReferenceRanges028, parseInstalledDocument028 } from './installedDocument028.js';
import { SVG_ARTWORK_PROFILE_FROZEN_029 } from './artwork/svgArtworkModel029.js';
import { assessSuccessorSourcePortLimits029 } from './successorSourcePortReferences028.js';
import { projectInstalledSourceToSuccessor028,
  type SuccessorSourceGraph028 } from './successorSourceProjection028.js';
import { checkInstalledSuccessorSourceConformance028 } from './successorSourceConformance028.js';
import { resolveSuccessorGraphNodes028 } from './successorInterpretation028.js';
import { assessInstalledSuccessorSourceIntegrity028 } from './successorSourceIntegrity028.js';

export interface PortableSourceIssue028 {
  code: string;
  message: string;
  range?: DiagnosticRange;
  related?: Array<{ message: string; range: DiagnosticRange }>;
}

function findNode(nodes: SuccessorSourceGraph028['nodes'], id: string):
  SuccessorSourceGraph028['nodes'][number] | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

/** Check portable meaning without mistaking a flat-scene limit for model loss.
 * This is an exact source projection and U1/integrity check, not a claim that
 * the unpublished GraphIR successor schema or all profile rules were run. */
export function verifyPortableSuccessorSource028(source: string): {
  graph?: SuccessorSourceGraph028;
  diagnostics: PortableSourceIssue028[];
} {
  const projected = projectInstalledSourceToSuccessor028(source);
  if (!projected.graph || projected.diagnostics.length) return { diagnostics: projected.diagnostics.length
    ? projected.diagnostics : [{ code: 'coral.successor.projection.unsupported',
      message: 'The source cannot be projected to the portable successor without loss.' }] };
  const graph = projected.graph;
  const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'none' });
  const sceneOnly = checked.diagnostics.length > 0 && checked.diagnostics.every((item) =>
    item.code === 'render.capability.sequence-fragment' ||
    item.code === 'render.capability.sequence-semantic-port' ||
    item.code === 'render.capability.edge-rgb' ||
    item.code === 'render.capability.edge-stroke-weight' ||
    item.code === 'render.capability.edge-motion' ||
    item.code === 'render.capability.sequence-note' ||
    item.code === 'render.capability.sequence-activation' ||
    item.code === 'render.capability.sequence-destroy' ||
    item.code === 'render.capability.sequence-participant-group');
  if (checked.report && !sceneOnly) {
    const issues: PortableSourceIssue028[] = [
      ...checked.diagnostics,
      ...checked.report.findings.filter((finding) =>
        finding.category !== 'notation' && finding.severity === 'error').map((finding) => ({
        code: finding.id, message: finding.message,
        ...(finding.range ? { range: finding.range } : {}),
      })),
    ];
    return issues.length ? { diagnostics: issues } : { graph, diagnostics: [] };
  }
  if (!sceneOnly) return { diagnostics: checked.diagnostics.length
    ? checked.diagnostics : [{ code: 'coral.successor.check.unavailable',
      message: 'The portable source model could not be independently checked.' }] };
  try {
    const document = parseInstalledDocument028(source);
    const interpretations = resolveSuccessorGraphNodes028(graph);
    const nodeDeclarations = document.syntax.statements.filter(
      (item): item is CandidateNodeSyntax => item.kind === 'node');
    const issues: PortableSourceIssue028[] = assessInstalledSuccessorSourceIntegrity028(
      document, graph, interpretations);
    for (const exception of graph.conformanceExceptions ?? []) {
      const node = findNode(graph.nodes, exception.nodeId);
      const causal = exception.kind === 'explicit-symbol' && node?.symbol === exception.symbol &&
        interpretations.get(exception.nodeId)?.diagnostics.some((item) =>
          item.code === 'coral.symbol.foreign-profile');
      if (causal) continue;
      const token = nodeDeclarations.find((item) => (item.qualifiedId ?? item.id.value) === exception.nodeId)
        ?.conformanceException;
      issues.push({ code: 'CORAL.CONFORMANCE.EXCEPTION.INVALID',
        message: `The exception for ${exception.nodeId} is not bound to its exact explicit foreign symbol.`,
        ...(token ? { range: token.range } : {}) });
    }
    return issues.length ? { diagnostics: issues } : { graph, diagnostics: [] };
  } catch (error) {
    return { diagnostics: [{ code: 'coral.successor.catalog.unavailable',
      message: error instanceof Error ? error.message : 'The installed symbol catalog could not be checked.' }] };
  }
}

export interface GraphIrExportRefusal029 {
  severity: 'error';
  code: 'export.graphir.local-symbol.unsupported' | 'export.graphir.port-limit.exceeded';
  message: string;
  /** The format version that cannot carry the document. */
  detail: 'GraphIR 4.0.0 candidate';
  range?: DiagnosticRange;
  related?: Array<{ message: string; range: DiagnosticRange }>;
}

/** GraphIR 4 export refusals, called only where GraphIR is produced, never in
 * validation: explicit endpoints beyond a resolved port limit (every edition;
 * located when `source` is given), and document symbol definitions, used or
 * unused, until the artwork profile version they name is frozen. */
export function graphIrExportRefusal029(graph: SuccessorSourceGraph028, source?: string): GraphIrExportRefusal029[] {
  const detail = 'GraphIR 4.0.0 candidate' as const;
  const ranges = source === undefined ? undefined : installedWrittenPortReferenceRanges028(parseInstalledDocument028(source));
  const refusals: GraphIrExportRefusal029[] = assessSuccessorSourcePortLimits029(graph, undefined, ranges)
    .map(({ message, range, related }) => ({ severity: 'error', code: 'export.graphir.port-limit.exceeded', detail,
      message: `${message} ${detail} export refuses a graph that exceeds a port limit.`,
      ...(range ? { range } : {}), ...(related ? { related } : {}) }));
  if (graph.userSymbols029?.length && !SVG_ARTWORK_PROFILE_FROZEN_029) refusals.push({ severity: 'error',
    code: 'export.graphir.local-symbol.unsupported', detail,
    message: `${detail} export cannot carry document symbol definitions until the coral.svg-artwork profile ` +
      'version 1 is frozen; the document is not exported.' });
  return refusals;
}
