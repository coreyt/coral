/** The one pure operation: Coral source -> parse -> validate -> layout -> SVG. */
import type { GraphIR } from '@graph-ir/core';
import { validateIR } from '@graph-ir/core/validation';
import { detectFormat, editionAdmitsUserSymbols029, isSequenceGraph, validateSequenceInteraction } from '@coral-viz/language';
import { assessGraphPortReferences028, assessSuccessorSourcePortReferences028,
  assessInstalledSuccessorSourceIntegrity028,
  installedPortReferenceRanges028, installedWrittenPortReferenceRanges028,
  parseInstalledDocument028, projectInstalledSourceToSuccessor028,
  renderSvg, sourceSpatialFailureDiagnostics028, sourceLayoutCapabilityNotices028, sourceSemanticCapabilityNotices028, successorSourceDisplay028,
  successorDisplayFailureDiagnostic028, successorSourceDisplayWithSemanticPorts028, sourcePortDeclarationDiagnostics028,
  sourceNodeCatalogChoiceDiagnostics028, resolveSuccessorGraphNodes028,
  assessSuccessorSourcePortLimits029, userSymbolNotices029 } from '@coral-viz/render';
import { sequenceFragmentDisplayDiagnostics028, sequenceSourcePortCapabilityDiagnostics028 } from '@coral-viz/render';
import type { CandidateFragmentSyntax, CandidateNodeSyntax, CandidatePortSyntax } from '@coral-viz/language';
import type { SuccessorSourceGraph028 } from '@coral-viz/render';
import type { CoralSourceGraphView028 } from './sourceGraph028.js';
import { layoutGraphForSvg } from '@coral-viz/render/svg-layout';
import { CoralRenderError, type CoralDiagnostic } from './errors.js';

export type CoralTheme = 'light' | 'dark';
export type CoralDirection = 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';

export interface CoralRenderOptions {
  /** Default `light`. */
  theme?: CoralTheme;
  /** Approved 0.2.8 visual style; `thx` is reserved. */
  style?: 'lowfi' | 'hifi';
  /** Default `RIGHT`, the MCP `coral_render` default. */
  direction?: CoralDirection;
  /** Emitted as the SVG `<title>` only when set. */
  title?: string;
}

export type { CoralSourceGraphView028 } from './sourceGraph028.js';

export interface CoralRenderResult {
  svg: string;
  /** Pre-layout GraphIR 3 display projection; never author/save it as 0.2.8 source meaning. */
  graph: GraphIR;
  /** Complete authored 0.2.8 meaning when the installed source projects losslessly. */
  sourceGraph?: CoralSourceGraphView028;
  /** Every non-error diagnostic. */
  diagnostics: readonly CoralDiagnostic[];
}

/**
 * The browser build replaces the data of every face the default path cannot
 * reach with this value; SVG that references it is refused, never fetched.
 */
export const UNAVAILABLE_FACE = 'coral-browser:unavailable-face';

const THEMES: ReadonlySet<unknown> = new Set(['light', 'dark']);
const DIRECTIONS: ReadonlySet<unknown> = new Set(['RIGHT', 'DOWN', 'LEFT', 'UP']);
const OPTION_KEYS: ReadonlySet<string> = new Set(['theme', 'style', 'direction', 'title']);
// Anything outside XML 1.0 `Char`, including a lone surrogate.
const XML_ILLEGAL = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u;
let browserSvgInstanceSerial028 = 0;

/** The language diagnostic fields this package projects; its columns are 0-based. */
interface SourceDiagnostic {
  severity: CoralDiagnostic['severity'];
  code: string;
  message: string;
  position?: { line: number; column: number; offset?: number };
  range?: { start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number } };
  related?: readonly { message: string;
    position?: { line: number; column: number; offset?: number };
    range?: { start: { line: number; column: number; offset: number };
      end: { line: number; column: number; offset: number } } }[];
  subject?: { kind: string; id: string };
  path?: string;
}

export function toCoralDiagnostic(diagnostic: SourceDiagnostic): CoralDiagnostic {
  const point = (value: { line: number; column: number; offset: number }) => ({
    line: value.line, column: value.column + 1, offset: value.offset,
  });
  const range = (value: NonNullable<SourceDiagnostic['range']>) => ({
    start: point(value.start), end: point(value.end),
  });
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.position ? { line: diagnostic.position.line, column: diagnostic.position.column + 1 } : {}),
    ...(diagnostic.range ? { range: range(diagnostic.range) } : {}),
    ...(diagnostic.related ? { related: diagnostic.related.flatMap((item) => {
      const location = item.position ?? item.range?.start;
      return location ? [{ message: item.message, line: location.line,
        column: location.column + 1,
        ...(item.range ? { range: range(item.range) } : {}) }] : [];
    }) } : {}),
    ...(diagnostic.subject ? { subject: { kind: diagnostic.subject.kind, id: diagnostic.subject.id } } : {}),
  };
}

function graphIrDiagnostic(severity: 'error' | 'warning', issue: { code: string; path: string; message: string }): CoralDiagnostic {
  return { severity, code: issue.code, message: `${issue.path || '/'}: ${issue.message}` };
}

export function assertAvailableFaces(svg: string): void {
  if (svg.includes(`url('${UNAVAILABLE_FACE}')`)) {
    throw new CoralRenderError('coral.browser.render.failed', 'The diagram needs a font face this build does not include.');
  }
}

function checkOptions(options: unknown): Required<Pick<CoralRenderOptions, 'theme' | 'direction'>> &
  Pick<CoralRenderOptions, 'title' | 'style'> {
  const invalid = (message: string): CoralRenderError => new CoralRenderError('coral.browser.option.invalid', message);
  if (options === undefined) return { theme: 'light', direction: 'RIGHT' };
  if (options === null || typeof options !== 'object' || Array.isArray(options)
    || (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw invalid('Render options must be a plain object.');
  }
  const record = options as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!OPTION_KEYS.has(key) && record[key] !== undefined) throw invalid(`Unknown render option "${key}".`);
  }
  if (record.theme !== undefined && !THEMES.has(record.theme)) throw invalid('Option "theme" must be "light" or "dark".');
  if (record.style !== undefined && record.style !== 'lowfi' && record.style !== 'hifi') {
    throw invalid('Option "style" must be "lowfi" or "hifi"; "thx" is reserved.');
  }
  if (record.direction !== undefined && !DIRECTIONS.has(record.direction)) {
    throw invalid('Option "direction" must be "RIGHT", "DOWN", "LEFT", or "UP".');
  }
  if (record.title !== undefined && typeof record.title !== 'string') throw invalid('Option "title" must be a string.');
  if (typeof record.title === 'string' && XML_ILLEGAL.test(record.title)) {
    throw invalid('Option "title" contains characters that SVG cannot represent.');
  }
  return {
    theme: (record.theme as CoralTheme | undefined) ?? 'light',
    style: (record.style as 'lowfi' | 'hifi' | undefined) ?? 'lowfi',
    direction: (record.direction as CoralDirection | undefined) ?? 'RIGHT',
    ...(record.title !== undefined ? { title: record.title as string } : {}),
  };
}

function characterDiagnostics(source: string): CoralDiagnostic[] {
  const diagnostics: CoralDiagnostic[] = [];
  source.split('\n').forEach((text, index) => {
    const match = XML_ILLEGAL.exec(text);
    if (!match) return;
    const codePoint = match[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    diagnostics.push({
      severity: 'error', code: 'coral.browser.input.character',
      message: `U+${codePoint} cannot appear in a Coral diagram rendered as SVG.`,
      line: index + 1, column: match.index + 1,
    });
  });
  return diagnostics;
}

/** Scene capability does not waive independent source-owned U1 failures. */
function sequenceIntegrityDiagnostics028(
  document: ReturnType<typeof parseInstalledDocument028>,
  graph: SuccessorSourceGraph028,
): CoralDiagnostic[] {
  return assessInstalledSuccessorSourceIntegrity028(document, graph).map((item) =>
    toCoralDiagnostic({ severity: 'error', code: item.code, message: item.message,
      ...(item.subject ? { subject: item.subject } : {}),
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
    }));
}

/** Render Coral source to a standalone SVG string. Rejects with `CoralRenderError`. */
export async function render(source: string, options?: CoralRenderOptions): Promise<CoralRenderResult> {
  if (typeof source !== 'string') {
    throw new CoralRenderError('coral.browser.input.type', 'Coral browser rendering accepts Coral source text only.');
  }
  const illegal = characterDiagnostics(source);
  if (illegal.length) {
    throw new CoralRenderError('coral.browser.input.invalid', 'The source contains characters that SVG cannot represent.', illegal);
  }
  const { format } = detectFormat(source);
  if (format !== 'coral') {
    throw new CoralRenderError('coral.browser.input.format', format === null
      ? 'Unrecognized input: Coral browser rendering accepts Coral source only. Open or convert other diagram formats in the Coral editor first.'
      : `Coral browser rendering accepts Coral source only; this input looks like ${format}. Import or convert it in the Coral editor first.`);
  }
  const { theme, style, direction, title } = checkOptions(options);

  const installed = parseInstalledDocument028(source);
  const sourceProjection = projectInstalledSourceToSuccessor028(installed);
  const portDeclarations = installed?.syntax.statements.filter(
    (item): item is CandidatePortSyntax => item.kind === 'port') ?? [];
  const fragmentDeclarations = installed?.syntax.statements.filter(
    (item): item is CandidateFragmentSyntax => item.kind === 'fragment') ?? [];
  const fragmentGraph = sourceProjection?.graph?.interaction ? sourceProjection.graph : undefined;
  const fragmentCapabilities = fragmentGraph
    ? sequenceFragmentDisplayDiagnostics028(fragmentDeclarations, fragmentGraph) : [];
  if (fragmentGraph) {
    const fragmentIssues = fragmentCapabilities.map((item) => toCoralDiagnostic({
      ...item, position: item.range.start,
    }));
    const portIssues = sequenceSourcePortCapabilityDiagnostics028(portDeclarations).map((item) =>
      toCoralDiagnostic({ severity: 'error', code: item.code, message: item.message,
        subject: item.subject,
        ...(item.range ? { position: item.range.start, range: item.range } : {}),
      }));
    const issues = [...fragmentIssues, ...portIssues,
      ...sequenceIntegrityDiagnostics028(installed!, fragmentGraph)];
    if (issues.length) throw new CoralRenderError('coral.browser.input.invalid',
      fragmentIssues.length ? 'A sequence fragment cannot be rendered without loss.'
        : portIssues.length ? 'Sequence participant ports cannot yet be rendered.'
          : 'The Coral source has errors.', issues);
  }
  let successorDisplay: GraphIR | undefined;
  let semanticInterpretations: ReturnType<typeof successorSourceDisplayWithSemanticPorts028>['semanticInterpretations'] | undefined;
  if (sourceProjection?.graph) {
    try {
      if (sourceProjection.graph.interaction) successorDisplay = successorSourceDisplay028(sourceProjection.graph);
      else {
        const paired = successorSourceDisplayWithSemanticPorts028(sourceProjection.graph);
        successorDisplay = paired.display;
        semanticInterpretations = paired.semanticInterpretations;
      }
    }
    catch (cause) {
      throw new CoralRenderError('coral.browser.input.invalid',
        'The saved Coral source cannot be displayed without loss.', [
          toCoralDiagnostic(successorDisplayFailureDiagnostic028(cause, sourceProjection.graph,
            installed, 'coral.browser.source.projection')),
        ], { cause });
    }
  }
  const sourceDiagnostics: SourceDiagnostic[] = [
    ...installed.header.diagnostics.map((item) => ({ severity: 'error' as const,
      code: item.code, message: item.message, position: item.range.start, range: item.range,
      ...(item.related ? { related: item.related.map((related) => ({ ...related,
        position: related.range.start })) } : {}),
    })),
    ...installed.syntax.diagnostics,
  ];
  const diagnostics: CoralDiagnostic[] = (sourceDiagnostics.length ? sourceDiagnostics
    : (sourceProjection.diagnostics ?? []).map((item) => ({
      severity: 'error' as const, code: item.code, message: item.message,
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
    }))).map(toCoralDiagnostic);
  if (installed && semanticInterpretations) diagnostics.push(...sourcePortDeclarationDiagnostics028(
    portDeclarations,
    semanticInterpretations).map((item) => toCoralDiagnostic({ severity: 'error',
      code: item.code, message: item.message, subject: item.subject,
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
    })));
  const catalogInterpretations = semanticInterpretations ?? (sourceProjection?.graph?.interaction
    ? resolveSuccessorGraphNodes028(sourceProjection.graph) : undefined);
  if (installed && catalogInterpretations) diagnostics.push(...sourceNodeCatalogChoiceDiagnostics028(
    installed.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node'),
    catalogInterpretations).map((item) => toCoralDiagnostic({ severity: 'error',
      code: item.code, message: item.message, subject: item.subject,
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
    })));
  const edgeStatements = installed?.syntax.statements.filter((item) => item.kind === 'edge') ?? [];
  if (installed && sourceProjection?.graph) diagnostics.push(...userSymbolNotices029(installed, sourceProjection.graph)
    .map((item) => toCoralDiagnostic({ ...item, position: item.range.start })));
  // Connection limits are read diagnostics only in edition 0.2.9 documents.
  const edition = installed?.header.effectiveCoralVersion;
  if (installed && sourceProjection?.graph && catalogInterpretations && edition !== undefined &&
    editionAdmitsUserSymbols029(edition)) diagnostics.push(...assessSuccessorSourcePortLimits029(
    sourceProjection.graph, catalogInterpretations, installedWrittenPortReferenceRanges028(installed))
    .map((item) => toCoralDiagnostic({ severity: 'error', code: item.code, message: item.message,
      subject: { kind: 'node', id: item.nodeId },
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
      ...(item.related ? { related: item.related.map((location) => ({ message: location.message,
        position: location.range.start, range: location.range })) } : {}),
    })));
  if (sourceProjection?.graph) diagnostics.push(...sourceLayoutCapabilityNotices028(
    sourceProjection.graph, edgeStatements).map((item) => toCoralDiagnostic({
    severity: item.severity, code: item.code, message: item.message,
    subject: item.subject,
    ...(item.range ? { position: item.range.start, range: item.range } : {}),
  })));
  if (sourceProjection?.graph) diagnostics.push(...sourceSemanticCapabilityNotices028(
    sourceProjection.graph,
    installed?.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node') ?? [],
    edgeStatements).map((item) => toCoralDiagnostic({ ...item,
    ...(item.range ? { position: item.range.start } : {}),
  })));
  diagnostics.sort((left, right) =>
    (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER));
  // Source-owned successor meaning chooses every saved-header display. The
  // temporary GraphIR 3 parser graph is only a staging input to projection.
  const graph = successorDisplay ?? installed.graph;
  if (!graph || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new CoralRenderError('coral.browser.input.invalid', 'The Coral source has errors.', diagnostics);
  }
  if (isSequenceGraph(graph)) {
    const issues = validateSequenceInteraction(graph);
    if (issues.length) {
      throw new CoralRenderError('coral.browser.input.invalid', 'The sequence diagram is invalid.', [
        ...diagnostics,
        ...issues.map((issue): CoralDiagnostic => ({
          severity: 'error', code: issue.code, message: issue.message, subject: { kind: issue.entity.kind, id: issue.entity.id },
        })),
      ]);
    }
  }
  // Semantic GraphIR rules (references, ports, hierarchy) keep browser
  // acceptance equal to MCP's. Schema validation is skipped: it needs Ajv's
  // code generation, and parser output is schema-valid (a Node test proves it).
  const validation = validateIR(graph, { mode: 'semantic' });
  diagnostics.push(...validation.warnings.map((warning) => graphIrDiagnostic('warning', warning)));
  const portReferences = installed?.header.header && sourceProjection?.graph && semanticInterpretations
    ? assessSuccessorSourcePortReferences028(sourceProjection.graph,
      installedWrittenPortReferenceRanges028(installed), semanticInterpretations)
    : installed?.header.header
      ? assessGraphPortReferences028(graph, installed.header.header.diagramType,
        installedPortReferenceRanges028(installed)) : undefined;
  const portableErrors = validation.errors.filter((error) =>
    error.code !== 'INVALID_PORT_REFERENCE' ||
      !portReferences?.supersededGraphIrPaths.has(error.path));
  const semanticPortErrors = portReferences?.assessments.flatMap(({ assessment }) =>
    assessment.diagnostics.map((item) => toCoralDiagnostic({
      severity: 'error', code: item.code, message: item.message,
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
      subject: { kind: 'edge', id: item.edgeId },
    }))) ?? [];
  if (portableErrors.length || semanticPortErrors.length) {
    throw new CoralRenderError('coral.browser.input.invalid', 'The diagram is not valid GraphIR.', [
      ...diagnostics, ...portableErrors.map((error) => graphIrDiagnostic('error', error)),
      ...semanticPortErrors,
    ]);
  }
  if (graph.nodes.length === 0) {
    throw new CoralRenderError('coral.browser.input.empty', 'The Coral source declares no nodes to draw.', diagnostics);
  }

  let svg: string;
  try {
    const laidOut = await layoutGraphForSvg(graph, { direction, nodeSpacing: 50,
      svgOptions: { style, theme },
      ...(semanticInterpretations ? { semanticInterpretations } : {}) });
    if (laidOut.layoutDiagnostics028?.length) diagnostics.push(...sourceSpatialFailureDiagnostics028(
      { diagnostics: laidOut.layoutDiagnostics028 }, installed).map(toCoralDiagnostic));
    svg = renderSvg(laidOut, { theme, style, ...(title !== undefined ? { title } : {}),
      domIdNamespace: `browser-${++browserSvgInstanceSerial028}`,
      edgeRoutes: laidOut.edgeRoutes, layoutDirection: direction, semanticGraph: graph,
      ...(sourceProjection?.graph ? { successorSource: sourceProjection.graph } : {}) });
  } catch (cause) {
    throw new CoralRenderError('coral.browser.render.failed', 'The diagram could not be laid out or drawn.',
      sourceSpatialFailureDiagnostics028(cause, installed).map(toCoralDiagnostic), { cause });
  }
  assertAvailableFaces(svg);
  // Quoted source values can decode escapes after the source check.
  const decoded = XML_ILLEGAL.exec(svg);
  if (decoded) {
    const codePoint = decoded[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    throw new CoralRenderError('coral.browser.input.invalid', 'The source contains characters that SVG cannot represent.', [{
      severity: 'error', code: 'coral.browser.input.character',
      message: `U+${codePoint}, decoded from an escape in the source, cannot appear in a Coral diagram rendered as SVG.`,
    }]);
  }
  return { svg, graph, diagnostics,
    ...(sourceProjection?.graph ? { sourceGraph: sourceProjection.graph } : {}) };
}
