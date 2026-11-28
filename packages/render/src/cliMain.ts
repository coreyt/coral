/**
 * Coral CLI runtime (`coral validate`, `coral render`, `coral convert`).
 * Pure runtime with injected IO — kept separate from `src/index.ts` so
 * importing `@coral-viz/render` never reads stdin, runs CLI side effects, or
 * pulls Node builtins into browser builds.
 */
import {
  detectFormat,
  isSequenceGraph,
  parseDot,
  parseMermaid,
  parsePlantUml,
  validateSequenceInteraction,
  type CandidateFragmentSyntax,
  type CandidateNodeSyntax,
  type CandidatePortSyntax,
  type Diagnostic,
  type EdgeStyleMode,
  type FlowchartTargetNotation,
  type GraphIR,
  type StateTargetEdition,
} from '@coral-viz/language';
import {
  validateGraphIRSuccessor,
  validateGraphIRSuccessorWithCatalog,
  validateIR,
} from '@graph-ir/core';
import {
  assessInstalledSuccessorSourceIntegrity028,
  assessSuccessorSourcePortReferences028,
  CharacterRenderError,
  graphIrExportRefusal029,
  installedWrittenPortReferenceRanges028,
  PARROTFISH_MODEL_0215,
  parseInstalledDocument028,
  projectInstalledSourceToSuccessor028,
  RenderCapabilityError,
  renderHtml,
  renderInstalledCharacterPreview028,
  renderSvg,
  resolveSuccessorGraphNodes028,
  sequenceFragmentDisplayDiagnostics028,
  sequenceSourcePortCapabilityDiagnostics028,
  sourceLayoutCapabilityNotices028,
  sourceNodeCatalogChoiceDiagnostics028,
  sourcePortDeclarationDiagnostics028,
  sourceSemanticCapabilityNotices028,
  sourceSpatialFailureDiagnostics028,
  spatialValidationGraph028,
  successorCoreValidationInput029,
  successorDisplayFailureDiagnostic028,
  successorSourceDisplay028,
  successorSourceDisplayWithSemanticPorts028,
  transpileAndVerifyMermaidToCoral,
  verifyPortableSuccessorSource028,
  type CharacterColumns028,
  type SuccessorSourceGraph028,
  type SvgOptions,
} from './index.js';
import { SpatialLayoutError } from './layout/index.js';
import { layoutGraphForSvg } from './svg/layout.js';

export const CLI_VERSION = '0.2.17';

export interface CoralCliIo {
  readStdin: () => Promise<string>;
  readFileText: (path: string) => Promise<string>;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
}

const USAGE = [
  'Usage:',
  '  coral validate [--strict] [file]',
  '  coral render --format svg|html|ascii [--style lowfi|hifi|anemone|ane|parrotfish|pf] [--theme light|dark] [--direction RIGHT|DOWN|LEFT|UP] [--columns 40|80|120] [file]',
  '  coral convert [--from auto|coral|mermaid|dot|plantuml] [--to coral|json] [--strict] [--flowchart-target flowchart|block|architecture] [--edge-style-mode visual-safe|portable] [--state-target-edition 0.2.17|0.2.8] [file]',
  '',
  'Reads stdin when [file] is omitted or "-".',
  'Exit codes: 0 success, 1 invalid input / refused operation / I/O error, 2 invalid usage.',
  '',
].join('\n');

interface CliDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  line?: number;
  column?: number;
}

function formatDiagnosticLine(diag: CliDiagnostic): string {
  const loc = diag.line !== undefined
    ? ` (${diag.line}${diag.column !== undefined ? `:${diag.column}` : ''})`
    : '';
  return `${diag.severity} [${diag.code}]${loc}: ${diag.message}`;
}

function writeDiagnostics(io: CoralCliIo, diagnostics: readonly CliDiagnostic[]): void {
  if (diagnostics.length === 0) return;
  io.writeStderr(diagnostics.map(formatDiagnosticLine).join('\n') + '\n');
}

function toCliDiagnostic(item: {
  severity?: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  range?: { start: { line: number; column: number } };
  position?: { line: number; column: number };
}): CliDiagnostic {
  const start = item.range?.start ?? item.position;
  return {
    severity: item.severity ?? 'error',
    code: item.code,
    message: item.message,
    ...(start ? { line: start.line, column: start.column } : {}),
  };
}

function usageError(io: CoralCliIo, message: string): number {
  io.writeStderr(`Usage error: ${message}\n${USAGE}`);
  return 2;
}

async function readInput(fileArg: string | undefined, io: CoralCliIo): Promise<{ ok: true; text: string } | { ok: false; code: number }> {
  try {
    const text = !fileArg || fileArg === '-'
      ? await io.readStdin()
      : await io.readFileText(fileArg);
    return { ok: true, text };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    writeDiagnostics(io, [{
      severity: 'error',
      code: 'coral.cli.io.error',
      message: fileArg && fileArg !== '-'
        ? `Could not read "${fileArg}": ${detail}`
        : `Could not read stdin: ${detail}`,
    }]);
    return { ok: false, code: 1 };
  }
}

interface ParsedFlags {
  flags: Map<string, string | boolean>;
  positionals: string[];
}

function parseCommandArgs(
  args: readonly string[],
  valueFlags: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string>,
): { ok: true; parsed: ParsedFlags } | { ok: false; message: string } {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];
  let stopFlags = false;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]!;
    if (!stopFlags && token === '--') {
      stopFlags = true;
      continue;
    }
    if (!stopFlags && token.startsWith('--') && token.length > 2) {
      const eq = token.indexOf('=');
      const name = eq >= 0 ? token.slice(0, eq) : token;
      const inlineValue = eq >= 0 ? token.slice(eq + 1) : undefined;
      if (booleanFlags.has(name)) {
        if (inlineValue !== undefined) {
          return { ok: false, message: `Flag ${name} does not accept a value.` };
        }
        flags.set(name, true);
        continue;
      }
      if (valueFlags.has(name)) {
        if (inlineValue !== undefined) {
          flags.set(name, inlineValue);
        } else {
          const next = args[i + 1];
          if (next === undefined || (next.startsWith('--') && next !== '-')) {
            return { ok: false, message: `Missing value for ${name}.` };
          }
          flags.set(name, next);
          i += 1;
        }
        continue;
      }
      return { ok: false, message: `Unknown option "${name}".` };
    }
    if (!stopFlags && token.startsWith('-') && token.length > 1) {
      if (token === '-h') {
        flags.set('--help', true);
        continue;
      }
      return { ok: false, message: `Unknown option "${token}".` };
    }
    positionals.push(token);
  }

  return { ok: true, parsed: { flags, positionals } };
}

function validateSavedCoralSource(source: string): {
  valid: boolean;
  complete: boolean;
  graph?: SuccessorSourceGraph028;
  coreGraph?: unknown;
  diagnostics: CliDiagnostic[];
} {
  const document = parseInstalledDocument028(source);
  const syntaxDiagnostics: CliDiagnostic[] = [
    ...document.header.diagnostics.map((d) => toCliDiagnostic({ ...d, severity: 'error' })),
    ...document.syntax.diagnostics.map((d) => toCliDiagnostic(d)),
  ];
  if (syntaxDiagnostics.some((d) => d.severity === 'error')) {
    return { valid: false, complete: false, diagnostics: syntaxDiagnostics };
  }

  const verified = verifyPortableSuccessorSource028(source);
  if (verified.diagnostics.length > 0 || !verified.graph) {
    return {
      valid: false,
      complete: false,
      diagnostics: [
        ...syntaxDiagnostics,
        ...verified.diagnostics.map((d) => toCliDiagnostic({ ...d, severity: 'error' })),
      ],
    };
  }

  const graph = verified.graph;
  const core = successorCoreValidationInput029(graph);
  const structural = validateGraphIRSuccessor(core.graph, core.options);
  const model = structural.errors.length === 0
    ? validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options)
    : structural;
  const diagnostics: CliDiagnostic[] = [
    ...syntaxDiagnostics,
    ...model.errors.map((issue) => ({
      severity: 'error' as const,
      code: issue.code,
      message: `${issue.message} (GraphIR path ${issue.path})`,
    })),
    ...model.warnings.map((issue) => ({
      severity: 'warning' as const,
      code: issue.code,
      message: `${issue.message} (GraphIR path ${issue.path})`,
    })),
  ];
  if (!model.valid && model.errors.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'coral.validate.successor.invalid',
      message: 'The installed GraphIR successor validator rejected the portable model.',
    });
  }
  const complete = Boolean(model.valid && model.verification.complete && model.verification.scope === 'full');
  if (!model.errors.length && !complete) {
    diagnostics.push({
      severity: 'warning',
      code: 'coral.validate.successor-portability.unverified',
      message: 'The installed GraphIR successor validator did not establish complete portable verification.',
    });
  }

  return {
    valid: !diagnostics.some((d) => d.severity === 'error'),
    complete,
    graph,
    coreGraph: core.graph,
    diagnostics,
  };
}

async function handleValidateCommand(args: readonly string[], io: CoralCliIo): Promise<number> {
  const parsed = parseCommandArgs(args, new Set(), new Set(['--strict', '--help']));
  if (!parsed.ok) return usageError(io, parsed.message);
  if (parsed.parsed.flags.has('--help')) {
    io.writeStdout(USAGE);
    return 0;
  }
  if (parsed.parsed.positionals.length > 1) {
    return usageError(io, 'validate accepts at most one [file] argument.');
  }
  const input = await readInput(parsed.parsed.positionals[0], io);
  if (!input.ok) return input.code;

  const strict = parsed.parsed.flags.has('--strict');
  const checked = validateSavedCoralSource(input.text);
  const warnings = checked.diagnostics.filter((d) => d.severity !== 'error');
  const errors = checked.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0 || (strict && warnings.length > 0)) {
    writeDiagnostics(io, checked.diagnostics);
    return 1;
  }
  if (warnings.length > 0) {
    writeDiagnostics(io, warnings);
  }
  return 0;
}

async function handleRenderCommand(args: readonly string[], io: CoralCliIo): Promise<number> {
  const parsed = parseCommandArgs(
    args,
    new Set(['--format', '--style', '--theme', '--direction', '--columns']),
    new Set(['--help']),
  );
  if (!parsed.ok) return usageError(io, parsed.message);
  if (parsed.parsed.flags.has('--help')) {
    io.writeStdout(USAGE);
    return 0;
  }
  if (parsed.parsed.positionals.length > 1) {
    return usageError(io, 'render accepts at most one [file] argument.');
  }

  const format = parsed.parsed.flags.get('--format');
  if (format !== 'svg' && format !== 'html' && format !== 'ascii') {
    return usageError(io, 'render requires --format svg|html|ascii.');
  }

  const rawStyle = (parsed.parsed.flags.get('--style') as string | undefined) ?? 'lowfi';
  if (
    rawStyle !== 'lowfi' &&
    rawStyle !== 'hifi' &&
    rawStyle !== 'anemone' &&
    rawStyle !== 'ane' &&
    rawStyle !== 'parrotfish' &&
    rawStyle !== 'pf'
  ) {
    return usageError(io, `Unsupported --style "${rawStyle}". Expected lowfi, hifi, anemone, ane, parrotfish, or pf.`);
  }
  const normalizedStyle = rawStyle === 'ane'
    ? 'anemone'
    : rawStyle === 'pf'
      ? 'parrotfish'
      : rawStyle;

  const rawTheme = (parsed.parsed.flags.get('--theme') as string | undefined) ?? 'light';
  if (rawTheme !== 'light' && rawTheme !== 'dark') {
    return usageError(io, `Unsupported --theme "${rawTheme}". Expected light or dark.`);
  }

  const rawDirection = parsed.parsed.flags.get('--direction') as string | undefined;
  if (
    rawDirection !== undefined &&
    rawDirection !== 'RIGHT' &&
    rawDirection !== 'DOWN' &&
    rawDirection !== 'LEFT' &&
    rawDirection !== 'UP'
  ) {
    return usageError(io, `Unsupported --direction "${rawDirection}". Expected RIGHT, DOWN, LEFT, or UP.`);
  }

  const rawColumns = parsed.parsed.flags.get('--columns') as string | undefined;
  let columns: CharacterColumns028 = 80;
  if (rawColumns !== undefined) {
    const num = Number(rawColumns);
    if (num !== 40 && num !== 80 && num !== 120) {
      return usageError(io, `Unsupported --columns "${rawColumns}". Expected 40, 80, or 120.`);
    }
    columns = num;
  }

  const input = await readInput(parsed.parsed.positionals[0], io);
  if (!input.ok) return input.code;
  const source = input.text;

  if (format === 'ascii') {
    try {
      const preview = await renderInstalledCharacterPreview028(source, { columns });
      if (preview.diagnostics.length > 0) {
        writeDiagnostics(
          io,
          preview.diagnostics.map((notice) => ({
            severity: 'warning',
            code: notice.code,
            message: notice.message,
          })),
        );
      }
      const output = preview.text.endsWith('\n') ? preview.text : `${preview.text}\n`;
      io.writeStdout(output);
      return 0;
    } catch (error) {
      if (error instanceof CharacterRenderError) {
        writeDiagnostics(io, [{
          severity: 'error',
          code: error.code,
          message: error.message,
        }]);
        return 1;
      }
      writeDiagnostics(io, [{
        severity: 'error',
        code: 'coral.cli.render.failed',
        message: error instanceof Error ? error.message : String(error),
      }]);
      return 1;
    }
  }

  // SVG or HTML rendering of saved Coral source
  const installedDocument = parseInstalledDocument028(source);
  const syntaxErrors = [
    ...installedDocument.header.diagnostics.map((d) => toCliDiagnostic({ ...d, severity: 'error' })),
    ...installedDocument.syntax.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => toCliDiagnostic(d)),
  ];
  if (syntaxErrors.length > 0 || !installedDocument.header.header) {
    writeDiagnostics(
      io,
      syntaxErrors.length > 0
        ? syntaxErrors
        : [{ severity: 'error', code: 'header.diagram.required', message: 'Coral @diagram header is required.' }],
    );
    return 1;
  }

  const sourceProjection = projectInstalledSourceToSuccessor028(source);
  if (!sourceProjection.graph) {
    writeDiagnostics(
      io,
      sourceProjection.diagnostics.length > 0
        ? sourceProjection.diagnostics.map((d) => toCliDiagnostic({ ...d, severity: 'error' }))
        : [{ severity: 'error', code: 'coral.successor.projection.unsupported', message: 'The saved Coral source cannot be projected without loss.' }],
    );
    return 1;
  }

  const successorGraph = sourceProjection.graph;
  const fragmentDeclarations = installedDocument.syntax.statements.filter(
    (item): item is CandidateFragmentSyntax => item.kind === 'fragment',
  );
  if (successorGraph.interaction) {
    const fragmentIssues = sequenceFragmentDisplayDiagnostics028(fragmentDeclarations, successorGraph);
    if (fragmentIssues.length > 0) {
      writeDiagnostics(io, fragmentIssues.map((d) => toCliDiagnostic(d)));
      return 1;
    }
  }
  const portDeclarations = installedDocument.syntax.statements.filter(
    (item): item is CandidatePortSyntax => item.kind === 'port',
  );
  if (successorGraph.interaction && portDeclarations.length > 0) {
    writeDiagnostics(io, sequenceSourcePortCapabilityDiagnostics028(portDeclarations).map((d) => toCliDiagnostic({ ...d, severity: 'error' })));
    return 1;
  }
  if (successorGraph.interaction) {
    const integrity = assessInstalledSuccessorSourceIntegrity028(installedDocument, successorGraph);
    if (integrity.length > 0) {
      writeDiagnostics(io, integrity.map((d) => toCliDiagnostic({ ...d, severity: 'error' })));
      return 1;
    }
  }

  let displayGraph: GraphIR;
  let semanticInterpretations: ReturnType<typeof successorSourceDisplayWithSemanticPorts028>['semanticInterpretations'] | undefined;
  try {
    if (successorGraph.interaction) {
      displayGraph = successorSourceDisplay028(successorGraph);
    } else {
      const paired = successorSourceDisplayWithSemanticPorts028(successorGraph);
      displayGraph = paired.display;
      semanticInterpretations = paired.semanticInterpretations;
    }
  } catch (cause) {
    const diag = successorDisplayFailureDiagnostic028(
      cause,
      successorGraph,
      installedDocument,
      'coral.successor.display.unsupported',
    );
    writeDiagnostics(io, [toCliDiagnostic({ ...diag, severity: 'error' })]);
    return 1;
  }

  const catalogInterpretations = semanticInterpretations ?? resolveSuccessorGraphNodes028(successorGraph);
  const sourceIssues = [
    ...sourceNodeCatalogChoiceDiagnostics028(
      installedDocument.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node'),
      catalogInterpretations,
    ),
    ...sourcePortDeclarationDiagnostics028(portDeclarations, catalogInterpretations),
  ];
  if (sourceIssues.length > 0) {
    writeDiagnostics(io, sourceIssues.map((d) => toCliDiagnostic({ ...d, severity: 'error' })));
    return 1;
  }

  const validation = validateIR(spatialValidationGraph028(displayGraph));
  const portReferences = semanticInterpretations
    ? assessSuccessorSourcePortReferences028(
      successorGraph,
      installedWrittenPortReferenceRanges028(installedDocument),
      semanticInterpretations,
    )
    : undefined;
  const portableErrors = validation.errors.filter(
    (err) => err.code !== 'INVALID_PORT_REFERENCE' || !portReferences?.supersededGraphIrPaths.has(err.path),
  );
  if (portableErrors.length > 0) {
    writeDiagnostics(
      io,
      portableErrors.map((err) => ({
        severity: 'error',
        code: err.code,
        message: `${err.path || '/'}: ${err.message}`,
      })),
    );
    return 1;
  }
  const semanticPortErrors = portReferences?.assessments.flatMap(({ assessment }) => assessment.diagnostics) ?? [];
  if (semanticPortErrors.length > 0) {
    writeDiagnostics(io, semanticPortErrors.map((d) => toCliDiagnostic({ ...d, severity: 'error' })));
    return 1;
  }
  if (isSequenceGraph(displayGraph)) {
    const seqIssues = validateSequenceInteraction(displayGraph);
    if (seqIssues.length > 0) {
      writeDiagnostics(io, seqIssues.map((d) => ({ severity: 'error', code: d.code, message: d.message })));
      return 1;
    }
  }

  const direction = rawDirection ?? installedDocument.syntax.layoutOptions028?.direction ?? 'RIGHT';
  const isParrotfish = normalizedStyle === 'parrotfish';
  const svgOptions: SvgOptions = {
    theme: rawTheme,
    style: normalizedStyle === 'lowfi' ? 'lowfi' : 'hifi',
    renderStyle: isParrotfish ? 'hifi' : normalizedStyle,
    ...(isParrotfish ? { parrotfish: PARROTFISH_MODEL_0215 } : {}),
    layoutDirection: direction,
    notation: installedDocument.header.header.diagramType,
  };

  try {
    const laidOut = await layoutGraphForSvg(displayGraph, {
      direction,
      svgOptions,
      ...(semanticInterpretations ? { semanticInterpretations } : {}),
    });
    const renderOptions = {
      ...svgOptions,
      edgeRoutes: laidOut.edgeRoutes,
      semanticGraph: displayGraph,
      successorSource: successorGraph,
    };
    const artifact = format === 'html'
      ? renderHtml(laidOut, renderOptions)
      : renderSvg(laidOut, renderOptions);

    const edgeStatements = installedDocument.syntax.statements.filter((item) => item.kind === 'edge');
    const notices: CliDiagnostic[] = [
      ...sourceLayoutCapabilityNotices028(successorGraph, edgeStatements).map((d) => toCliDiagnostic(d)),
      ...sourceSemanticCapabilityNotices028(
        successorGraph,
        installedDocument.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node'),
        edgeStatements,
      ).map((d) => toCliDiagnostic(d)),
    ];
    if (notices.length > 0) {
      writeDiagnostics(io, notices);
    }
    io.writeStdout(artifact.endsWith('\n') ? artifact : `${artifact}\n`);
    return 0;
  } catch (error) {
    if (error instanceof RenderCapabilityError || error instanceof SpatialLayoutError) {
      const located = sourceSpatialFailureDiagnostics028(error, installedDocument);
      writeDiagnostics(
        io,
        located.length > 0
          ? located.map((d) => toCliDiagnostic({ ...d, severity: 'error' }))
          : [{ severity: 'error', code: 'coral.cli.render.capability', message: error.message }],
      );
      return 1;
    }
    writeDiagnostics(io, [{
      severity: 'error',
      code: 'coral.cli.render.failed',
      message: error instanceof Error ? error.message : String(error),
    }]);
    return 1;
  }
}

async function handleConvertCommand(args: readonly string[], io: CoralCliIo): Promise<number> {
  const parsed = parseCommandArgs(
    args,
    new Set(['--from', '--to', '--flowchart-target', '--edge-style-mode', '--state-target-edition']),
    new Set(['--strict', '--help']),
  );
  if (!parsed.ok) return usageError(io, parsed.message);
  if (parsed.parsed.flags.has('--help')) {
    io.writeStdout(USAGE);
    return 0;
  }
  if (parsed.parsed.positionals.length > 1) {
    return usageError(io, 'convert accepts at most one [file] argument.');
  }

  const rawFrom = (parsed.parsed.flags.get('--from') as string | undefined) ?? 'auto';
  if (rawFrom !== 'auto' && rawFrom !== 'coral' && rawFrom !== 'mermaid' && rawFrom !== 'dot' && rawFrom !== 'plantuml') {
    return usageError(io, `Unsupported --from "${rawFrom}". Expected auto, coral, mermaid, dot, or plantuml.`);
  }

  const rawTo = (parsed.parsed.flags.get('--to') as string | undefined) ?? 'coral';
  if (rawTo !== 'coral' && rawTo !== 'json') {
    return usageError(io, `Unsupported --to "${rawTo}". Expected coral or json.`);
  }

  const rawFlowchartTarget = (parsed.parsed.flags.get('--flowchart-target') as string | undefined) ?? 'flowchart';
  if (rawFlowchartTarget !== 'flowchart' && rawFlowchartTarget !== 'block' && rawFlowchartTarget !== 'architecture') {
    return usageError(io, `Unsupported --flowchart-target "${rawFlowchartTarget}". Expected flowchart, block, or architecture.`);
  }
  const flowchartTarget: FlowchartTargetNotation = rawFlowchartTarget;

  const rawEdgeStyleMode = (parsed.parsed.flags.get('--edge-style-mode') as string | undefined) ?? 'visual-safe';
  if (rawEdgeStyleMode !== 'visual-safe' && rawEdgeStyleMode !== 'portable') {
    return usageError(io, `Unsupported --edge-style-mode "${rawEdgeStyleMode}". Expected visual-safe or portable.`);
  }
  const edgeStyleMode: EdgeStyleMode = rawEdgeStyleMode;

  const rawStateEdition = (parsed.parsed.flags.get('--state-target-edition') as string | undefined) ?? '0.2.17';
  if (rawStateEdition !== '0.2.17' && rawStateEdition !== '0.2.8') {
    return usageError(io, `Unsupported --state-target-edition "${rawStateEdition}". Expected 0.2.17 or 0.2.8.`);
  }
  const stateTargetEdition: StateTargetEdition = rawStateEdition;

  const strict = parsed.parsed.flags.has('--strict');

  const input = await readInput(parsed.parsed.positionals[0], io);
  if (!input.ok) return input.code;
  const content = input.text;

  let sourceFormat: 'coral' | 'mermaid' | 'dot' | 'plantuml';
  if (rawFrom === 'auto') {
    const detected = detectFormat(content).format;
    if (detected === 'mermaid' || detected === 'dot' || detected === 'plantuml' || detected === 'coral') {
      sourceFormat = detected;
    } else {
      sourceFormat = 'coral';
    }
  } else {
    sourceFormat = rawFrom;
  }

  if (sourceFormat === 'coral') {
    const checked = validateSavedCoralSource(content);
    if (!checked.valid || !checked.graph) {
      writeDiagnostics(io, checked.diagnostics);
      return 1;
    }
    const warnings = checked.diagnostics.filter((d) => d.severity !== 'error');
    if (strict && warnings.length > 0) {
      writeDiagnostics(io, checked.diagnostics);
      return 1;
    }
    if (rawTo === 'coral') {
      if (warnings.length > 0) writeDiagnostics(io, warnings);
      io.writeStdout(content);
      return 0;
    }
    const refusals = graphIrExportRefusal029(checked.graph, content);
    if (refusals.length > 0) {
      writeDiagnostics(io, refusals.map((r) => toCliDiagnostic({ ...r, severity: 'error' })));
      return 1;
    }
    if (!checked.complete || !checked.coreGraph) {
      writeDiagnostics(io, [{
        severity: 'error',
        code: 'coral.cli.convert.unverified',
        message: 'Successor model verification was incomplete.',
      }]);
      return 1;
    }
    if (warnings.length > 0) writeDiagnostics(io, warnings);
    io.writeStdout(`${JSON.stringify(checked.coreGraph, null, 2)}\n`);
    return 0;
  }

  if (sourceFormat === 'mermaid' && rawTo === 'coral') {
    const transpiled = transpileAndVerifyMermaidToCoral(content, {
      mode: strict ? 'strict' : 'best-effort',
      flowchartTarget,
      edgeStyleMode,
      stateTargetEdition,
    });
    const diagnostics = transpiled.diagnostics.map((d) => toCliDiagnostic(d));
    if (!transpiled.ok || !transpiled.coral) {
      writeDiagnostics(io, diagnostics);
      return 1;
    }
    const notes = diagnostics.filter((d) => d.severity !== 'error');
    if (notes.length > 0) {
      writeDiagnostics(io, notes);
    }
    io.writeStdout(transpiled.coral.endsWith('\n') ? transpiled.coral : `${transpiled.coral}\n`);
    return 0;
  }

  if (rawTo === 'coral') {
    writeDiagnostics(io, [{
      severity: 'error',
      code: 'coral.cli.writer.unavailable',
      message: `No verified Coral source writer is available for "${sourceFormat}" input.`,
    }]);
    return 1;
  }

  // External format -> GraphIR JSON
  let imported: { success: boolean; graph?: GraphIR; diagnostics: Diagnostic[] };
  if (sourceFormat === 'mermaid') {
    imported = parseMermaid(content);
  } else if (sourceFormat === 'dot') {
    imported = parseDot(content);
  } else {
    imported = parsePlantUml(content);
  }

  const diagnostics = imported.diagnostics.map((d) => toCliDiagnostic(d));
  if (!imported.success || !imported.graph || imported.graph.nodes.length === 0) {
    writeDiagnostics(
      io,
      diagnostics.length > 0
        ? diagnostics
        : [{ severity: 'error', code: 'coral.cli.import.empty', message: `Could not parse any nodes from ${sourceFormat} input.` }],
    );
    return 1;
  }
  const notes = diagnostics.filter((d) => d.severity !== 'error');
  if (strict && notes.length > 0) {
    writeDiagnostics(io, diagnostics);
    return 1;
  }
  if (notes.length > 0) {
    writeDiagnostics(io, notes);
  }
  io.writeStdout(`${JSON.stringify(imported.graph, null, 2)}\n`);
  return 0;
}

export async function runCoralCli(
  argv: readonly string[],
  io: CoralCliIo,
): Promise<number> {
  if (argv.length === 0) {
    return usageError(io, 'Missing command.');
  }
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') {
    io.writeStdout(USAGE);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    io.writeStdout(`${CLI_VERSION}\n`);
    return 0;
  }
  if (command === 'validate') {
    return handleValidateCommand(rest, io);
  }
  if (command === 'render') {
    return handleRenderCommand(rest, io);
  }
  if (command === 'convert') {
    return handleConvertCommand(rest, io);
  }
  return usageError(io, `Unknown command "${command}". Expected validate, render, or convert.`);
}
