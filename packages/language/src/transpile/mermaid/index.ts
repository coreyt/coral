import { parseDocument028 } from '../../parser/document028.js';
import type { HeaderRuntime028 } from '../../parser/header028.js';
import { HEADER_MANIFEST_028 } from '../../parser/header-manifest028.js';
import { emitCoralSource } from './emit.js';
import { lowerClassDiagram } from './lower/class.js';
import { lowerErDiagram } from './lower/er.js';
import { lowerFlowchart } from './lower/flowchart.js';
import { createNullMap } from './lower/ids.js';
import { lowerSequence } from './lower/sequence.js';
import { lowerStateDiagram } from './lower/state.js';
import { parseClassDiagram } from './parsers/class.js';
import { parseErDiagram } from './parsers/er.js';
import { parseFlowchart } from './parsers/flowchart.js';
import { parseSequence } from './parsers/sequence.js';
import { parseStateDiagram } from './parsers/state.js';
import { preprocessMermaid } from './preprocess.js';
import type {
  CoralSourceIr,
  CoralTargetEdition,
  CoralTargetNotation,
  MermaidTop5Kind,
  MermaidTranspileOptions,
  MermaidTranspileResult,
  TranspileDiagnostic,
  TranspileLossSummary,
} from './types.js';

export type {
  CoralLayoutDirection,
  CoralSourceIr,
  CoralTargetEdition,
  CoralTargetNotation,
  EdgeStyleMode,
  FlowchartTargetNotation,
  MermaidTop5Kind,
  MermaidTranspileOptions,
  MermaidTranspileResult,
  StateTargetEdition,
  TranspileDiagnostic,
  TranspileLossSummary,
  TranspileMode,
  TranspileSourcePosition,
  TranspileSourceRange,
} from './types.js';

function buildHeaderRuntime(): HeaderRuntime028 {
  const trustedDigests: Record<string, string> = Object.create(null);
  for (const edition of Object.values(HEADER_MANIFEST_028)) {
    for (const def of Object.values(edition)) {
      for (const catalog of def.catalogs) {
        trustedDigests[`${catalog.id}@${catalog.version}`] = catalog.digest;
      }
    }
  }
  return { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
}

function sortDiagnostics(diags: readonly TranspileDiagnostic[]): readonly TranspileDiagnostic[] {
  const sorted = [...diags].sort((a, b) => {
    const ao = a.range?.start.offset ?? Number.MAX_SAFE_INTEGER;
    const bo = b.range?.start.offset ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.code.localeCompare(b.code);
  });
  return Object.freeze(sorted);
}

export function buildLossSummary(diags: readonly TranspileDiagnostic[]): TranspileLossSummary {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const byCode: Record<string, number> = Object.create(null);
  for (const d of diags) {
    if (d.severity === 'error') errorCount++;
    else if (d.severity === 'warning') warningCount++;
    else infoCount++;
    byCode[d.code] = (byCode[d.code] ?? 0) + 1;
  }
  return Object.freeze({
    lossy: errorCount > 0 || warningCount > 0,
    errorCount,
    warningCount,
    infoCount,
    byCode: Object.freeze(byCode),
  });
}

function finishResult(params: {
  ok: boolean;
  detectedKind: MermaidTop5Kind | string | null;
  targetNotation: CoralTargetNotation | null;
  targetEdition: CoralTargetEdition | null;
  coral?: string;
  idMap: Record<string, string>;
  diagnostics: TranspileDiagnostic[];
  visualRenderable: boolean;
  characterRenderable?: boolean;
}): MermaidTranspileResult {
  const diagnostics = sortDiagnostics(params.diagnostics);
  const lossSummary = buildLossSummary(diagnostics);
  return {
    ok: params.ok,
    detectedKind: params.detectedKind,
    targetNotation: params.targetNotation,
    targetEdition: params.targetEdition,
    ...(params.ok && params.coral !== undefined ? { coral: params.coral } : {}),
    idMap: Object.freeze(params.idMap),
    diagnostics,
    lossSummary,
    visualRenderable: params.ok ? params.visualRenderable : false,
    ...(params.characterRenderable !== undefined ? { characterRenderable: params.characterRenderable } : {}),
  };
}

/**
 * Pure deterministic 5-stage Mermaid.js-to-Coral transpiler with built-in Stage 4A syntax/header verification.
 * Zero DOM, zero React, zero ELK, zero LLM, zero module-level side effects.
 */
export function transpileMermaidToCoral(
  source: string,
  options: MermaidTranspileOptions = {},
): MermaidTranspileResult {
  const mode = options.mode ?? 'best-effort';
  const flowchartTarget = options.flowchartTarget ?? 'flowchart';
  const edgeStyleMode = options.edgeStyleMode ?? 'visual-safe';
  const stateTargetEdition = options.stateTargetEdition ?? '0.2.17';
  const preserveComments = options.preserveComments ?? false;
  const maxInputLength = options.maxInputLength ?? 524_288;
  const maxNestingDepth = options.maxNestingDepth ?? 32;

  const pre = preprocessMermaid(source, { maxInputLength, preserveComments });
  const diagnostics: TranspileDiagnostic[] = [...pre.diagnostics];

  if (!pre.supported || !pre.detectedKind) {
    return finishResult({
      ok: false,
      detectedKind: pre.detectedKind,
      targetNotation: null,
      targetEdition: null,
      idMap: createNullMap<string>(),
      diagnostics,
      visualRenderable: false,
    });
  }

  const kind = pre.detectedKind as MermaidTop5Kind;
  let ir: CoralSourceIr;
  let idMap: Record<string, string>;

  switch (kind) {
    case 'flowchart': {
      const ast = parseFlowchart(pre.bodyLines, pre.headerDirection, pre.lineIndex, diagnostics, maxNestingDepth);
      const lowered = lowerFlowchart(ast, { flowchartTarget, edgeStyleMode, comments: pre.comments }, diagnostics);
      ir = lowered.ir;
      idMap = lowered.idMap;
      break;
    }
    case 'sequence': {
      const ast = parseSequence(pre.bodyLines, pre.lineIndex, diagnostics, maxNestingDepth);
      const lowered = lowerSequence(ast, { mode, maxNestingDepth, comments: pre.comments }, diagnostics);
      ir = lowered.ir;
      idMap = lowered.idMap;
      break;
    }
    case 'class': {
      const ast = parseClassDiagram(pre.bodyLines, pre.lineIndex, diagnostics, maxNestingDepth);
      const lowered = lowerClassDiagram(ast, { comments: pre.comments }, diagnostics);
      ir = lowered.ir;
      idMap = lowered.idMap;
      break;
    }
    case 'er': {
      const ast = parseErDiagram(pre.bodyLines, pre.lineIndex, diagnostics, maxNestingDepth);
      const lowered = lowerErDiagram(ast, { comments: pre.comments }, diagnostics);
      ir = lowered.ir;
      idMap = lowered.idMap;
      break;
    }
    case 'state': {
      const ast = parseStateDiagram(pre.bodyLines, pre.lineIndex, diagnostics, maxNestingDepth);
      const lowered = lowerStateDiagram(ast, { stateTargetEdition, comments: pre.comments }, diagnostics);
      ir = lowered.ir;
      idMap = lowered.idMap;
      break;
    }
  }

  // If any parse/lower error occurred, fail closed before Stage 3/4
  if (diagnostics.some((d) => d.severity === 'error')) {
    return finishResult({
      ok: false,
      detectedKind: kind,
      targetNotation: ir.notation,
      targetEdition: ir.edition,
      idMap,
      diagnostics,
      visualRenderable: false,
    });
  }

  // Stage 3: Emit canonical Coral saved source
  const coral = emitCoralSource(ir);

  // Stage 4A: Mandatory syntax & header self-verification via Coral's own parser
  const stage4A = verifyEmittedCoralStage4A(coral);
  if (!stage4A.ok) {
    diagnostics.push({
      severity: 'error',
      code: 'coral.transpile.self-check.failed',
      message: stage4A.errorMessage!,
    });
    return finishResult({
      ok: false,
      detectedKind: kind,
      targetNotation: ir.notation,
      targetEdition: ir.edition,
      idMap,
      diagnostics,
      visualRenderable: false,
    });
  }

  // Strict mode gate: refuse on any warning or error (info never causes refusal)
  if (mode === 'strict' && diagnostics.some((d) => d.severity === 'warning' || d.severity === 'error')) {
    diagnostics.push({
      severity: 'error',
      code: 'coral.transpile.strict.refused',
      message: 'Transpilation refused in strict mode because one or more constructs were degraded or dropped.',
    });
    return finishResult({
      ok: false,
      detectedKind: kind,
      targetNotation: ir.notation,
      targetEdition: ir.edition,
      idMap,
      diagnostics,
      visualRenderable: false,
    });
  }

  const hasPortableOnlyEdgeStyle = Boolean(
    ir.edges?.some((e) => e.style && (e.style.includes('thick') || e.style.includes('#') || e.style.includes('animated:'))),
  );
  const visualRenderable = !(ir.notation === 'uml-state' && ir.edition === '0.2.8') && !hasPortableOnlyEdgeStyle;

  return finishResult({
    ok: true,
    detectedKind: kind,
    targetNotation: ir.notation,
    targetEdition: ir.edition,
    coral,
    idMap,
    diagnostics,
    visualRenderable,
  });
}

/**
 * Internal Stage 4A verifier (not exported from the public package entrypoint).
 * Verifies emitted Coral text against Coral's own saved-source parser and header manifest.
 */
export function verifyEmittedCoralStage4A(coral: string): { ok: boolean; errorMessage?: string } {
  const runtime = buildHeaderRuntime();
  const parsed = parseDocument028(coral, runtime);
  if (
    !parsed.header.header ||
    parsed.header.diagnostics.length > 0 ||
    parsed.syntax.diagnostics.length > 0
  ) {
    const reasons = [
      ...parsed.header.diagnostics.map((d) => `${d.code}: ${d.message}`),
      ...parsed.syntax.diagnostics.map((d) => `${d.code}: ${d.message}`),
    ];
    return {
      ok: false,
      errorMessage: `Internal transpiler self-check failed Stage 4A verification: ${reasons.join('; ') || 'missing header'}`,
    };
  }
  return { ok: true };
}
