import type { GraphIR } from '../types.js';
import { parseCandidate028 } from './candidate028.js';
import { editionAdmitsUserSymbols029, parseHeader028, type HeaderRuntime028 } from './header028.js';
import { parseSymbolDefinitions029, type SymbolDefinitionOptions029,
  type UserSymbolDefinition } from './symbolDefinitions029.js';

/** Staged source-document reader; the GraphIR 4 persistence path is a later gate. */
export function parseDocument028(source: string, runtime: HeaderRuntime028,
  options: SymbolDefinitionOptions029 = {}): {
  header: ReturnType<typeof parseHeader028>;
  syntax: ReturnType<typeof parseCandidate028>;
  /** Edition 0.2.9 symbol definitions in authored order; omitted when the source has none. */
  definitions?: readonly UserSymbolDefinition[];
  graph?: GraphIR;
} {
  const header = parseHeader028(source, runtime);
  // Preserve independently valid body syntax for editing even if profile
  // identity fails. Never offer a semantic graph without a resolved header.
  const body = parseCandidate028(header.body, {
    ...(header.header ? { profile: header.header.diagramType } : {}),
    ...(header.effectiveCoralVersion ? { edition: header.effectiveCoralVersion } : {}) });
  const regions = header.definitionRegions;
  // A region the edition refuses is reported once, by the header, and never interpreted.
  const admitted = header.effectiveCoralVersion !== undefined &&
    editionAdmitsUserSymbols029(header.effectiveCoralVersion);
  const parsedDefinitions = regions && admitted ? parseSymbolDefinitions029(source, regions, options) : undefined;
  // Definitions precede the body, so their findings lead in source order.
  const syntax = parsedDefinitions?.diagnostics.length
    ? { ...body, diagnostics: [...parsedDefinitions.diagnostics, ...body.diagnostics] } : body;
  const hasSuccessorOnlyStyle = syntax.statements.some((item) => item.kind === 'edge' &&
    (item.styleIntent?.strokeColor !== undefined ||
      item.styleIntent?.strokeWeight !== undefined || item.styleIntent?.motion !== undefined));
  const hasSuccessorOnlyNote = syntax.statements.some((item) => item.kind === 'note');
  const hasSuccessorOnlyActivation = syntax.statements.some((item) => item.kind === 'activation');
  const hasSuccessorOnlyRegion = syntax.statements.some((item) => item.kind === 'region');
  const hasSuccessorOnlyGroup = syntax.statements.some((item) => item.kind === 'participant-group');
  // GraphIR 3 ports are geometric and cannot carry a port label or limit.
  const hasSuccessorOnlyPort = syntax.statements.some((item) => item.kind === 'port' &&
    (item.label !== undefined || item.maxConnections !== undefined));
  const hasSuccessorOnlySpatial = syntax.statements.some(item=>item.kind==='constraint'||item.kind==='layout'||item.kind==='arrangement'&&(item.parameters!==undefined||item.subjects.some(t=>'referenceKind' in t))||item.kind==='route'&&item.waypoints.some(w=>w.anchorWaypoint));
  return { header, syntax,
    ...(parsedDefinitions ? { definitions: parsedDefinitions.definitions } : {}),
    // GraphIR 3 has no slot for a document symbol catalog.
    ...(header.header && !regions && !hasSuccessorOnlyStyle && !hasSuccessorOnlyNote &&
      !hasSuccessorOnlyActivation && !hasSuccessorOnlyRegion && !hasSuccessorOnlyGroup && !hasSuccessorOnlySpatial && !hasSuccessorOnlyPort &&
      !syntax.diagnostics.some((item) => item.severity === 'error')
      ? { graph: syntax.graph } : {}) };
}


/** Explicit, bounded source formatting: expand indentation tabs to two spaces.
 * Retain all authored tokens and line endings; never rebuild from a graph.
 * Invalid source remains a saveable draft, but is refused for formatting. */
export function formatDocument028(source: string, runtime: HeaderRuntime028): string {
  const document = parseDocument028(source, runtime);
  if (!document.header.header || document.header.diagnostics.length ||
      document.syntax.diagnostics.some((item) => item.severity === 'error'))
    throw new Error('coral.format028.source.invalid: Resolve source diagnostics before formatting.');
  // Coral physical lines use LF/CRLF. Multiline ^ would also match Unicode
  // separators or bare CR inside comments and could rewrite their content.
  return source.replace(/(^|\n)([ \t]+)/g, (_match, newline: string, indent: string) =>
    newline + indent.replace(/\t/g, '  '));
}
