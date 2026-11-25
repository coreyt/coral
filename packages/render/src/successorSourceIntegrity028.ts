import { editionAdmitsUserSymbols029, type CandidateNodeSyntax, type CandidatePortSyntax,
  type DiagnosticRange } from '@coral-viz/language';
import { parseInstalledDocument028, installedWrittenPortReferenceRanges028 } from './installedDocument028.js';
import type { NodeInterpretation028 } from './interpretation028.js';
import { resolveSuccessorGraphNodes028 } from './successorInterpretation028.js';
import { sourceNodeCatalogChoiceDiagnostics028,
  sourcePortDeclarationDiagnostics028 } from './successorSourcePortDeclarations028.js';
import { assessSuccessorSourcePortLimits029,
  assessSuccessorSourcePortReferences028 } from './successorSourcePortReferences028.js';
import type { SuccessorSourceGraph028 } from './successorSourceProjection028.js';

export interface SuccessorSourceIntegrityIssue028 {
  code: string;
  message: string;
  range?: DiagnosticRange;
  related?: Array<{ message: string; range: DiagnosticRange }>;
  subject?: { kind: 'node' | 'edge'; id: string };
}

/** Check authored U1 choices without requiring a renderable GraphIR 3 scene. */
export function assessInstalledSuccessorSourceIntegrity028(
  document: ReturnType<typeof parseInstalledDocument028>,
  graph: SuccessorSourceGraph028,
  interpretations: ReadonlyMap<string, NodeInterpretation028> = resolveSuccessorGraphNodes028(graph),
): SuccessorSourceIntegrityIssue028[] {
  const nodes = document.syntax.statements.filter(
    (item): item is CandidateNodeSyntax => item.kind === 'node');
  const ports = document.syntax.statements.filter(
    (item): item is CandidatePortSyntax => item.kind === 'port');
  const ranges = installedWrittenPortReferenceRanges028(document);
  const references = assessSuccessorSourcePortReferences028(graph, ranges, interpretations);
  // Connection limits are checked on read only in edition 0.2.9 documents;
  // edition 0.2.8 diagnostics are unchanged.
  const edition = document.header.effectiveCoralVersion;
  const limits = edition !== undefined && editionAdmitsUserSymbols029(edition)
    ? assessSuccessorSourcePortLimits029(graph, interpretations, ranges) : [];
  return [
    ...sourceNodeCatalogChoiceDiagnostics028(nodes, interpretations),
    ...sourcePortDeclarationDiagnostics028(ports, interpretations),
    ...references.assessments.flatMap(({ assessment }) => assessment.diagnostics.map((item) => ({
      code: item.code, message: item.message,
      subject: { kind: 'edge' as const, id: item.edgeId },
      ...(item.range ? { range: item.range } : {}),
    }))),
    ...limits.map((item) => ({ code: item.code, message: item.message,
      subject: { kind: 'node' as const, id: item.nodeId },
      ...(item.range ? { range: item.range } : {}), ...(item.related ? { related: item.related } : {}) })),
  ];
}
