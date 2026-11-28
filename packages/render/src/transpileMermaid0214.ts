import {
  transpileMermaidToCoral,
  type MermaidTranspileOptions,
  type MermaidTranspileResult,
  type TranspileDiagnostic,
  type TranspileLossSummary,
} from '@coral-viz/language';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { stateCharacterUsesChain028 } from './characterState028.js';
import { parseInstalledDocument028 } from './installedDocument028.js';
import { installedCatalogSnapshotForEdition } from './notations/index.js';
import { assertRenderableInterpretation028, RenderCapabilityError } from './scene.js';
import { successorCoreValidationInput029 } from './successorInterpretation028.js';
import { verifyPortableSuccessorSource028 } from './successorPortableExport028.js';
import {
  SuccessorDisplayCapabilityError028,
  successorSourceDisplay028,
  successorSourceDisplayWithSemanticPorts028,
} from './successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from './successorSourceProjection028.js';

function recomputeLossSummary(diags: readonly TranspileDiagnostic[]): TranspileLossSummary {
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

function failClosedStage4B(base: MermaidTranspileResult, message: string): MermaidTranspileResult {
  const diagnostics = Object.freeze([
    ...base.diagnostics,
    {
      severity: 'error' as const,
      code: 'coral.transpile.self-check.failed',
      message,
    },
  ]);
  return {
    ok: false,
    detectedKind: base.detectedKind,
    targetNotation: base.targetNotation,
    targetEdition: base.targetEdition,
    idMap: base.idMap,
    diagnostics,
    lossSummary: recomputeLossSummary(diagnostics),
    visualRenderable: false,
  };
}

/**
 * Internal Stage 4B verifier (not re-exported from the public package entrypoint).
 * Verifies a Stage 4A result against Coral's installed catalog, GraphIR 4 successor projection,
 * and visual/character display seams.
 */
export function verifyEmittedCoralStage4B(base: MermaidTranspileResult): MermaidTranspileResult {
  if (!base.ok || !base.coral || !base.targetNotation || !base.targetEdition) {
    return base;
  }

  const coral = base.coral;

  // 1. Parse against installed catalogs
  const installed = parseInstalledDocument028(coral);
  if (
    !installed.header.header ||
    installed.header.diagnostics.length > 0 ||
    installed.syntax.diagnostics.length > 0
  ) {
    const reasons = [
      ...installed.header.diagnostics.map((d) => `${d.code}: ${d.message}`),
      ...installed.syntax.diagnostics.map((d) => `${d.code}: ${d.message}`),
    ];
    return failClosedStage4B(
      base,
      `Stage 4B installed parse failed: ${reasons.join('; ') || 'missing header'}`,
    );
  }

  // 2. Project to GraphIR 4 successor
  const projected = projectInstalledSourceToSuccessor028(coral);
  if (!projected.graph || projected.diagnostics.length > 0) {
    const reasons = projected.diagnostics.map((d) => `${d.code}: ${d.message}`);
    return failClosedStage4B(
      base,
      `Stage 4B successor projection failed: ${reasons.join('; ') || 'missing graph'}`,
    );
  }

  // 3. Verify portable successor integrity
  const verified = verifyPortableSuccessorSource028(coral);
  if (!verified.graph || verified.diagnostics.length > 0) {
    const reasons = verified.diagnostics.map((d) => `${d.code}: ${d.message}`);
    return failClosedStage4B(
      base,
      `Stage 4B portable successor verification failed: ${reasons.join('; ') || 'missing graph'}`,
    );
  }

  // 4. Validate GraphIR 4 successor against exact installed catalog snapshot
  const core = successorCoreValidationInput029(projected.graph);
  const model = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
  if (!model.valid || model.errors.length > 0 || (model.verification.scope === 'full' && !model.verification.complete)) {
    const reasons = [
      ...model.errors.map((e) => `${e.path}: ${e.message}`),
      ...model.verification.obligations.map((o) => o.message),
    ];
    return failClosedStage4B(
      base,
      `Stage 4B catalog schema validation failed: ${reasons.join('; ') || 'incomplete verification'}`,
    );
  }

  // 5. Authoritative visual display seam check
  const extraDiagnostics: TranspileDiagnostic[] = [];
  let visualRenderable = false;
  try {
    const display = projected.graph.interaction
      ? successorSourceDisplay028(projected.graph)
      : successorSourceDisplayWithSemanticPorts028(projected.graph).display;
    const catalog = installedCatalogSnapshotForEdition(base.targetNotation, base.targetEdition);
    assertRenderableInterpretation028(display.nodes, base.targetNotation, display.profile, catalog);
    visualRenderable = true;
  } catch (cause) {
    if (cause instanceof RenderCapabilityError) {
      visualRenderable = false;
      if (cause.diagnostics.some((d) => d.code === 'render.capability.character-only-edition')) {
        extraDiagnostics.push({
          severity: 'info',
          code: 'coral.uml-state.visual-unavailable',
          message: 'UML state under Edition 0.2.8 supports source and character output only; use stateTargetEdition: "0.2.17" for SVG/visual rendering.',
        });
      } else {
        return failClosedStage4B(base, `Stage 4B visual capability failure: ${cause.message}`);
      }
    } else if (cause instanceof SuccessorDisplayCapabilityError028 && cause.code.startsWith('render.capability.edge-')) {
      visualRenderable = false;
      extraDiagnostics.push({
        severity: 'info',
        code: 'coral.edge-style.visual-unavailable',
        message: `Portable edge style (${cause.code}) is preserved in Coral source but not visually renderable by the current display seam.`,
      });
    } else {
      return failClosedStage4B(
        base,
        `Stage 4B display seam failure: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  // 6. Authoritative character preview envelope check for Edition 0.2.8 uml-state (uses installed.graph only)
  let characterRenderable: boolean | undefined;
  if (base.targetNotation === 'uml-state' && base.targetEdition === '0.2.8') {
    if (installed.graph) {
      try {
        const stateWork = structuredClone(installed.graph);
        if (stateWork.metadata?.custom && Object.keys(stateWork.metadata.custom).length === 1 && 'coralEdition' in stateWork.metadata.custom) {
          delete stateWork.metadata.custom;
        }
        stateCharacterUsesChain028(stateWork);
        characterRenderable = true;
      } catch {
        characterRenderable = false;
        extraDiagnostics.push({
          severity: 'info',
          code: 'coral.uml-state.character-bounds.exceeded',
          message: 'UML state diagram exceeds Coral 0.2.8 character-preview envelope bounds.',
        });
      }
    } else {
      characterRenderable = false;
      extraDiagnostics.push({
        severity: 'info',
        code: 'coral.uml-state.character-bounds.exceeded',
        message: 'UML state diagram exceeds Coral 0.2.8 character-preview envelope bounds.',
      });
    }
  }

  if (extraDiagnostics.length === 0 && characterRenderable === undefined && visualRenderable === base.visualRenderable) {
    return base;
  }

  const diagnostics = Object.freeze([...base.diagnostics, ...extraDiagnostics]);
  return {
    ...base,
    diagnostics,
    lossSummary: recomputeLossSummary(diagnostics),
    visualRenderable,
    ...(characterRenderable !== undefined ? { characterRenderable } : {}),
  };
}

/**
 * Deterministic Mermaid.js-to-Coral transpiler with mandatory Stage 4B verification
 * against Coral's installed catalog, GraphIR 4 successor projection, and display seams.
 * Pure function — zero module-level side effects.
 */
export function transpileAndVerifyMermaidToCoral(
  source: string,
  options: MermaidTranspileOptions = {},
): MermaidTranspileResult {
  const base = transpileMermaidToCoral(source, options);
  return verifyEmittedCoralStage4B(base);
}
