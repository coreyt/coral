/**
 * Generate Orchestrator
 *
 * Orchestrates: compose prompt -> fetch -> extract -> validate -> retry -> drift check
 * Part of issue #46: LLM-powered diagram generation.
 * Extended in issue #48: help/fix intent routing.
 */

import type {
  GenerateRequest, GenerateResult, GenerateMode, ProviderFailure, RetryStrategy,
} from './types';
import {
  buildRequest, buildMultiTurnRequest, classifyProviderFailure, extractResponse,
} from './providers';
import {
  composeSystemPrompt,
  composeUserPrompt,
  composeHelpSystemPrompt,
  composeFixSystemPrompt,
  composeLayoutContext,
} from './prompt';
import { extractDslFromResponse, validateOutput, checkStructuralDrift, extractExplanationAndDsl, type ValidationResult } from './validate';
import { parseCoralDSL, parseMermaidDSL, editorDiagnostic } from '../parsers';
import { lintAgainstNotation } from './notationLint';
import { validateAiFormat } from './aiFormatPolicy';
import { HEADER_MANIFEST_028, parseHeader028, repairCoralDsl } from '@coral-viz/language';
import { parse } from '@coral-viz/language/parser';
import {
  finalizeSpatialCandidate,
  hydrateSpatialCandidate,
  recognizeSpatialRequest,
  resolveSpatialPlan,
  type SpatialPlan,
} from './spatial';

const headerRuntime028 = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
  trustedDigests: Object.fromEntries([
    ...Object.values(HEADER_MANIFEST_028['0.2.8']!),
    ...Object.values(HEADER_MANIFEST_028['0.2.14']!),
    ...Object.values(HEADER_MANIFEST_028['0.2.17']!),
  ].flatMap(
    (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest]))) };

/**
 * Request-local deterministic repair suggestion for a Coral `fix` intent,
 * prepared before `composeFixSystemPrompt` (Slice 49 local S49-AC4).
 * The exact captured source remains authoritative; an allowlisted, fully
 * resolved result is separately labelled as an unapplied suggestion.
 * and is a no-op when `existingDsl` is absent/empty or `outputFormat` is
 * `'mermaid'` (`repairCoralDsl` only understands Coral grammar and must
 * never run against Mermaid text).
 *
 * Deliberately never short-circuits past the LLM call, even when the
 * repaired text re-parses with zero errors: a `fix` request's `diagnostics`
 * commonly describes an edge-compatibility/notation issue neither repair
 * function has any knowledge of, so "zero parse errors after repair" does
 * not imply the thing the user asked to fix is actually resolved. See
 * `dev/designs/llm-backend-reliability-strategy.md`'s "Implementation
 * contract (Phase 3)" for the design review finding that removed an earlier
 * draft's unsafe skip-the-LLM-call behavior.
 */
export function repairExistingDslForFix(
  existingDsl: string | undefined,
  outputFormat: GenerateRequest['outputFormat'],
): {
  originalDsl: string;
  suggestion?: { proposedDsl: string; fixes: ReturnType<typeof repairCoralDsl>['appliedFixes'] };
} {
  const originalDsl = existingDsl ?? '';
  if (outputFormat !== 'coral' || !existingDsl) return { originalDsl };
  const grammarRepaired = repairCoralDsl(existingDsl);
  if (grammarRepaired.unresolved.length > 0 || grammarRepaired.appliedFixes.length === 0) {
    return { originalDsl };
  }
  return {
    originalDsl,
    suggestion: { proposedDsl: grammarRepaired.fixed, fixes: grammarRepaired.appliedFixes },
  };
}

function spatialPlanContext(plan: SpatialPlan): string {
  return [
    '\n\n## Resolved spatial plan (authoritative)',
    `Operation: ${JSON.stringify(plan.operation)}`,
    `Gap: ${plan.gap}; tolerance: ${plan.tolerance}; pin policy: ${plan.pinPolicy}.`,
    'Do not calculate, change, or certify coordinates. Preserve existing geometry; Coral will apply and verify this plan.',
  ].join('\n');
}

/**
 * Generate or adjust a Coral DSL diagram using an LLM.
 *
 * Flow varies by intent:
 * - help: compose help prompt → call LLM → return explanation (no DSL)
 * - fix: compose fix prompt → call LLM → extract explanation + DSL → validate → retry
 * - generate/modify: compose prompt → call LLM → extract DSL → validate → retry → drift check
 */
export async function generate(request: GenerateRequest): Promise<GenerateResult> {
  const { prompt, existingDsl, config, intent, diagnostics, history, notationId } = request;
  const outputFormat = request.outputFormat ?? 'coral';
  const budget = normalizeRetryBudget(request.maxRetries);
  const now = request.retryRuntime?.now ?? defaultMonotonicNow;
  const startedAt = now();
  const emit = (event: Parameters<NonNullable<GenerateRequest['telemetry']>>[0]) => {
    try { request.telemetry?.(event); } catch { /* telemetry never affects generation */ }
  };
  const elapsed = () => Math.max(0, finiteOrZero(now() - startedAt));
  emit({ kind: 'start', elapsedMs: 0 });
  if (request.signal?.aborted) {
    emit({ kind: 'aborted', attempt: 0, strategy: 'initial', retries: 0,
      phase: 'before-fetch', elapsedMs: elapsed() });
    return abortedResult(config.provider, outputFormat, intent);
  }

  const sourceProfile = outputFormat === 'coral'
    ? existingDsl?.match(/^[ \t]*@diagram[ \t]+([A-Za-z][A-Za-z0-9-]*)/m)?.[1] : undefined;
  const sourceHeader = sourceProfile && existingDsl
    ? parseHeader028(existingDsl, headerRuntime028).header : undefined;
  const profile = sourceProfile ?? notationId;
  if (outputFormat === 'coral' && intent !== 'help') {
    const installed = profile ? HEADER_MANIFEST_028['0.2.8']?.[profile] : undefined;
    const mismatched = sourceProfile !== undefined && notationId !== undefined && sourceProfile !== notationId;
    if (mismatched || (profile && (!installed || installed.enabled === false))) {
      const code = mismatched ? 'header.diagram.mismatch'
        : installed?.enabled === false ? 'header.diagram.disabled' : 'header.diagram.unknown';
      const message = mismatched
        ? `The saved @diagram ${sourceProfile} source does not match the active ${notationId} profile.`
        : `The ${profile} diagram profile is not enabled for Coral 0.2.8 source generation.`;
      return { success: false, error: message, retries: 0, driftDetected: false,
        outputFormat, intent, diagnostics: [{ code, message, attempt: 0, format: outputFormat }] };
    }
  }

  const changedSavedHeader = (candidate: string, attempt: number) => {
    if (outputFormat !== 'coral' || !profile) return undefined;
    const candidateProfile = candidate.match(/^[ \t]*@diagram[ \t]+([A-Za-z][A-Za-z0-9-]*)/m)?.[1];
    if (candidateProfile && candidateProfile !== profile) {
      const message = `The candidate @diagram ${candidateProfile} does not match the active ${profile} profile.`;
      return { code: 'header.diagram.mismatch', message, attempt, format: 'coral' as const };
    }
    if (!sourceHeader) return undefined;
    const candidateHeader = parseHeader028(candidate, headerRuntime028).header;
    if (!candidateHeader) return undefined;
    if (candidateHeader.effectiveCoralVersion !== sourceHeader.effectiveCoralVersion ||
      candidateHeader.profile.id !== sourceHeader.profile.id ||
      candidateHeader.profile.kind !== sourceHeader.profile.kind ||
      candidateHeader.profile.version !== sourceHeader.profile.version ||
      candidateHeader.catalog.id !== sourceHeader.catalog.id ||
      candidateHeader.catalog.version !== sourceHeader.catalog.version ||
      candidateHeader.catalog.digest !== sourceHeader.catalog.digest ||
      candidateHeader.explicit.coralVersion !== sourceHeader.explicit.coralVersion ||
      candidateHeader.explicit.profileVersion !== sourceHeader.explicit.profileVersion ||
      candidateHeader.explicit.catalogVersion !== sourceHeader.explicit.catalogVersion) {
      const message = 'The candidate changed the saved Coral, profile, or catalog edition pin.';
      return { code: 'header.edition.mismatch', message, attempt, format: 'coral' as const };
    }
    if (candidateHeader.conformanceLevel === sourceHeader.conformanceLevel &&
      candidateHeader.explicit.conformanceLevel === sourceHeader.explicit.conformanceLevel)
      return undefined;
    const message = 'The candidate changed the saved conformance level or its explicit declaration.';
    return { code: 'header.conformance.mismatch', message, attempt, format: 'coral' as const };
  };

  // The spatial finalizer prints a GraphIR 3 snapshot. That interchange
  // path cannot round-trip an authored 0.2.8 document, even when the plan
  // contains no model-produced edit. Keep the saved text with its source
  // owner until spatial edits have a source-preserving transaction path.
  if (request.spatial && existingDsl && /^[ \t]*@diagram\b/m.test(existingDsl)) {
    const message = 'Spatial AI editing cannot preserve this saved Coral source yet.';
    emit({ kind: 'terminal', attempt: 0, strategy: 'local', retries: 0,
      category: 'spatial', elapsedMs: elapsed() });
    return { success: false, error: message, retries: 0, driftDetected: false,
      outputFormat, diagnostics: [{ code: 'spatial.source-ownership', message,
        attempt: 0, format: outputFormat }] };
  }

  // ========================================================================
  // Help intent: return explanation only, no DSL
  // ========================================================================
  if (intent === 'help') {
    const systemPrompt = composeHelpSystemPrompt(existingDsl, diagnostics, outputFormat);
    const userPrompt = composeUserPrompt(prompt);
    const rejectionDiagnostics: NonNullable<GenerateResult['diagnostics']> = [];
    for (let attempt = 0; attempt <= budget; attempt++) {
      emit({ kind: 'attempt', attempt, strategy: 'initial', elapsedMs: elapsed() });
      const result = await attemptGenerate(
        config, systemPrompt, userPrompt, history, request.signal,
        request.retryRuntime?.wallNow,
      );
      if (result.success) {
        emit({ kind: 'success', attempt, strategy: 'initial', retries: attempt, elapsedMs: elapsed() });
        return { success: true, explanation: result.text, retries: attempt,
          driftDetected: false, intent, outputFormat,
          ...(rejectionDiagnostics.length ? { diagnostics: rejectionDiagnostics } : {}) };
      }
      const message = providerFailureMessage(result.failure);
      emit({ kind: 'failure', attempt, strategy: 'initial', category: result.failure.category,
        retryable: result.failure.retryable, elapsedMs: elapsed(),
        ...(result.failure.status !== undefined ? { status: result.failure.status } : {}),
        ...(result.failure.code ? { code: result.failure.code } : {}) });
      rejectionDiagnostics.push({
        code: result.failure.category === 'aborted' ? 'provider.aborted' : 'provider',
        message, attempt, format: outputFormat,
      });
      if (!result.failure.retryable || attempt >= budget) {
        if (result.failure.retryable) {
          emit({ kind: 'exhausted', attempt, strategy: 'initial', retries: attempt, elapsedMs: elapsed() });
        } else if (result.failure.category === 'aborted') {
          emit({ kind: 'aborted', attempt, strategy: 'initial', retries: attempt,
            phase: 'fetch', elapsedMs: elapsed() });
        } else {
          emit({ kind: 'terminal', attempt, strategy: 'initial', retries: attempt,
            category: result.failure.category === 'response' ? 'response' : 'provider', elapsedMs: elapsed() });
        }
        return { success: false, error: message, retries: attempt, driftDetected: false,
          intent, outputFormat, failure: result.failure, diagnostics: rejectionDiagnostics };
      }
      const wait = await waitForRetry(request, attempt + 1, result.failure);
      if (!wait.success) {
        if (wait.failure.category === 'aborted') {
          emit({ kind: 'aborted', attempt, strategy: 'initial', retries: attempt,
            phase: 'backoff', elapsedMs: elapsed() });
        } else {
          emit({ kind: 'terminal', attempt, strategy: 'initial', retries: attempt,
            category: 'server-delay', elapsedMs: elapsed() });
        }
        return { success: false, error: providerFailureMessage(wait.failure), retries: attempt,
          driftDetected: false, intent, outputFormat, failure: wait.failure,
          diagnostics: [...rejectionDiagnostics, { code: wait.failure.category === 'aborted'
            ? 'provider.aborted' : 'provider', message: providerFailureMessage(wait.failure),
          attempt, format: outputFormat }] };
      }
      emit({ kind: 'delay', attempt, strategy: 'initial', delayMs: wait.delayMs,
        reason: 'provider', elapsedMs: elapsed() });
    }
    throw new Error('unreachable');
  }

  // ========================================================================
  // Fix intent: return explanation + optional corrected DSL
  // ========================================================================
  if (intent === 'fix') {
    const repairPreflight = repairExistingDslForFix(existingDsl, outputFormat);
    const systemPrompt = composeFixSystemPrompt(
      repairPreflight.originalDsl, diagnostics || '', notationId, outputFormat, repairPreflight.suggestion,
    );
    const attemptPrompt = composeUserPrompt(prompt) + composeLayoutContext(request.layout, outputFormat);
    let explanation = '';
    let bestCandidate: string | undefined;
    let bestScore = -1;
    const attemptHistory = history;
    const rejectionDiagnostics: NonNullable<GenerateResult['diagnostics']> = [];

    for (let attempt = 0; attempt <= budget; attempt++) {
      const strategy = retryStrategy(0);
      emit({ kind: 'attempt', attempt, strategy, elapsedMs: elapsed() });
      const result = await attemptGenerate(
        config, systemPrompt, attemptPrompt, attemptHistory,
        request.signal, request.retryRuntime?.wallNow,
      );
      if (!result.success) {
        const message = providerFailureMessage(result.failure);
        emit({ kind: 'failure', attempt, strategy, category: result.failure.category,
          retryable: result.failure.retryable, elapsedMs: elapsed(),
          ...(result.failure.status !== undefined ? { status: result.failure.status } : {}),
          ...(result.failure.code ? { code: result.failure.code } : {}) });
        rejectionDiagnostics.push({
          code: result.failure.category === 'aborted' ? 'provider.aborted' : 'provider',
          message, attempt, format: outputFormat,
        });
        if (result.failure.retryable && attempt < budget) {
          const wait = await waitForRetry(request, attempt + 1, result.failure);
          if (wait.success) {
            emit({ kind: 'delay', attempt, strategy, delayMs: wait.delayMs,
              reason: 'provider', elapsedMs: elapsed() });
            continue;
          }
          emit(wait.failure.category === 'aborted'
            ? { kind: 'aborted', attempt, strategy, retries: attempt, phase: 'backoff', elapsedMs: elapsed() }
            : { kind: 'terminal', attempt, strategy, retries: attempt, category: 'server-delay', elapsedMs: elapsed() });
          return { ...cancelledGeneration(outputFormat, attempt, false, rejectionDiagnostics,
            bestCandidate, wait.failure), intent, explanation };
        }
        if (result.failure.retryable) {
          emit({ kind: 'exhausted', attempt, strategy, retries: attempt, elapsedMs: elapsed() });
        } else if (result.failure.category === 'aborted') {
          emit({ kind: 'aborted', attempt, strategy, retries: attempt, phase: 'fetch', elapsedMs: elapsed() });
        } else {
          emit({ kind: 'terminal', attempt, strategy, retries: attempt,
            category: result.failure.category === 'response' ? 'response' : 'provider', elapsedMs: elapsed() });
        }
        return { success: false, error: message, retries: attempt, driftDetected: false,
          intent, outputFormat, diagnostics: rejectionDiagnostics, bestCandidate, failure: result.failure };
      }

      const extracted = extractExplanationAndDsl(result.text!);
      explanation = extracted.explanation || explanation;
      if (!extracted.dsl) {
        emit({ kind: 'success', attempt, strategy, retries: attempt, elapsedMs: elapsed() });
        return { success: true, explanation, retries: attempt, driftDetected: false, intent, outputFormat,
          ...(rejectionDiagnostics.length ? { diagnostics: rejectionDiagnostics } : {}) };
      }
      const profileChange = changedSavedHeader(extracted.dsl, attempt);
      if (profileChange) {
        rejectionDiagnostics.push(profileChange);
        emit({ kind: 'rejection', attempt, strategy, rejection: 'parse', elapsedMs: elapsed() });
        return { ...candidateRejected(outputFormat, attempt, false, rejectionDiagnostics,
          bestCandidate, prompt, profileChange.message), intent, explanation };
      }
      const formatValidation = validateAiFormat(extracted.dsl, outputFormat);
      const validation = validateOutput(extracted.dsl, outputFormat);
      if (validation.nodeCount > bestScore) {
        bestScore = validation.nodeCount;
        bestCandidate = extracted.dsl;
      }
      if (formatValidation.ok && validation.valid) {
        rejectionDiagnostics.push(...tagAttemptDiagnostics(validation.diagnostics ?? [], attempt, outputFormat, 'parse'));
        emit({ kind: 'success', attempt, strategy, retries: attempt, elapsedMs: elapsed() });
        return { success: true, explanation, dsl: extracted.dsl, retries: attempt,
          driftDetected: false, intent, outputFormat,
          ...(rejectionDiagnostics.length ? { diagnostics: rejectionDiagnostics } : {}) };
      }
      const rejectionCode = formatValidation.ok || outputFormat === 'coral'
        ? 'parse' as const : 'format' as const;
      const rejectionMessage = formatValidation.ok
        ? validation.errors[0]?.message ?? 'Invalid output'
        : formatValidation.error;
      const detected = !formatValidation.ok && formatValidation.diagnostics?.length
        ? formatValidation.diagnostics : validation.diagnostics ?? validation.errors;
      rejectionDiagnostics.push(...(detected.length
        ? tagAttemptDiagnostics(detected, attempt, outputFormat, rejectionCode)
        : [{ code: rejectionCode, message: rejectionMessage, attempt, format: outputFormat }]));
      emit({ kind: 'rejection', attempt, strategy, rejection: 'parse', elapsedMs: elapsed() });
      return {
        ...candidateRejected(outputFormat, attempt, false, rejectionDiagnostics,
          bestCandidate, prompt, rejectionMessage),
        intent,
        explanation,
      };
    }
    throw new Error('unreachable');
  }

  let spatialPlan: SpatialPlan | undefined;
  if (request.spatial) {
    const recognition = recognizeSpatialRequest(prompt);
    if (recognition.classification === 'unsupported') {
      const diagnostic = recognition.diagnostics[0];
      emit({ kind: 'terminal', attempt: 0, strategy: 'local', retries: 0,
        category: 'spatial', elapsedMs: elapsed() });
      return { success: false, error: diagnostic.message, retries: 0, driftDetected: false,
        outputFormat, diagnostics: tagAttemptDiagnostics(recognition.diagnostics, 0, outputFormat) };
    }
    if (recognition.classification === 'spatial-only' || recognition.classification === 'mixed') {
      if (outputFormat === 'mermaid') {
        const message = 'Mermaid cannot encode fixed positions; convert the diagram to Coral first.';
        emit({ kind: 'terminal', attempt: 0, strategy: 'local', retries: 0,
          category: 'spatial', elapsedMs: elapsed() });
        return { success: false, error: message, retries: 0, driftDetected: false, outputFormat,
          diagnostics: [{ code: 'spatial.unencodable', message, attempt: 0, format: outputFormat }],
          action: { kind: 'convert-to-coral', prompt } };
      }
      const resolved = resolveSpatialPlan(request.spatial.original, request.spatial.geometry, recognition);
      if (!resolved.success) {
        const diagnostic = resolved.diagnostics[0];
        emit({ kind: 'terminal', attempt: 0, strategy: 'local', retries: 0,
          category: 'spatial', elapsedMs: elapsed() });
        return { success: false, error: diagnostic.message, retries: 0, driftDetected: false,
          outputFormat, diagnostics: tagAttemptDiagnostics(resolved.diagnostics, 0, outputFormat) };
      }
      spatialPlan = resolved.plan;
      if (spatialPlan.classification === 'spatial-only') {
        const final = finalizeSpatialCandidate(request.spatial.original, request.spatial.original, spatialPlan);
        if (!final.success) {
          const diagnostic = final.diagnostics[0];
          emit({ kind: 'terminal', attempt: 0, strategy: 'local', retries: 0,
            category: 'spatial', elapsedMs: elapsed() });
          return { success: false, error: diagnostic.message, retries: 0, driftDetected: false,
            outputFormat, diagnostics: tagAttemptDiagnostics(final.diagnostics, 0, outputFormat) };
        }
        emit({ kind: 'success', attempt: 0, strategy: 'local', retries: 0, elapsedMs: elapsed() });
        return { success: true, dsl: final.dsl, graph: final.graph,
          spatialEvidence: final.evidence, retries: 0, driftDetected: false, outputFormat,
          ...(final.printDiagnostics.length ? { diagnostics: tagAttemptDiagnostics(final.printDiagnostics, 0, outputFormat) } : {}) };
      }
    }
  }

  // Import support is intentionally broader than the AI editing boundary.
  // Do not send unsupported existing Mermaid to a provider for an ordinary
  // mutation. The explicit Fix path above remains the authorized repair path.
  if (existingDsl && outputFormat === 'mermaid') {
    const existingFormat = validateAiFormat(existingDsl, outputFormat);
    if (!existingFormat.ok) {
      const message = `The current Mermaid source is outside the supported AI editing subset: ${existingFormat.error}. `
        + 'Use explicit Fix or convert the diagram to Coral first.';
      emit({ kind: 'rejection', attempt: 0, strategy: 'initial', rejection: 'parse', elapsedMs: elapsed() });
      return {
        success: false,
        error: message,
        retries: 0,
        driftDetected: false,
        outputFormat,
        diagnostics: existingFormat.diagnostics?.length
          ? tagAttemptDiagnostics(existingFormat.diagnostics, 0, outputFormat, 'format')
          : [{ code: 'format', message, attempt: 0, format: outputFormat }],
      };
    }
  }

  // ========================================================================
  // Generate/Modify intent: existing behavior
  // ========================================================================
  const mode: GenerateMode = existingDsl ? 'adjust' : 'generate';

  // Get original node IDs for drift check in the active text format.
  const originalNodeIds = existingDsl
    ? (outputFormat === 'mermaid' ? parseMermaidDSL(existingDsl) : parseCoralDSL(existingDsl))
        .nodes.map((n) => n.id)
    : [];

  // Compose prompts
  const systemPrompt = composeSystemPrompt(mode, existingDsl, notationId, outputFormat)
    + (spatialPlan ? spatialPlanContext(spatialPlan) : '');
  const userPrompt = composeUserPrompt(prompt) + composeLayoutContext(request.layout, outputFormat);

  // The budget applies only to typed retryable provider/transport failures.
  // Candidate rejection ends this request and requires explicit user action.
  const attemptPrompt = userPrompt;
  const attemptHistory = history;
  let retries = 0;
  let lastError = 'Generation failed';
  let sawDrift = false;
  let bestCandidate: string | undefined;
  let bestScore = -1;
  const rejectionDiagnostics: NonNullable<GenerateResult['diagnostics']> = [];

  for (let attempt = 0; attempt <= budget; attempt++) {
    if (attempt > 0) retries = attempt;
    const strategy = retryStrategy(0);
    emit({ kind: 'attempt', attempt, strategy, elapsedMs: elapsed() });

    const result = await attemptGenerate(
      config,
      systemPrompt,
      attemptPrompt,
      attemptHistory,
      request.signal,
      request.retryRuntime?.wallNow,
    );
    if (!result.success) {
      emit({ kind: 'failure', attempt, strategy, category: result.failure.category,
        retryable: result.failure.retryable, elapsedMs: elapsed(),
        ...(result.failure.status !== undefined ? { status: result.failure.status } : {}),
        ...(result.failure.code ? { code: result.failure.code } : {}) });
      rejectionDiagnostics.push({
        code: result.failure.category === 'aborted' ? 'provider.aborted' : 'provider',
        message: providerFailureMessage(result.failure),
        attempt,
        format: outputFormat,
      });
      if (result.failure.retryable && attempt < budget) {
        const wait = await waitForRetry(request, attempt + 1, result.failure);
        if (!wait.success) {
          const waitMessage = providerFailureMessage(wait.failure);
          rejectionDiagnostics.push({ code: wait.failure.category === 'aborted'
            ? 'provider.aborted' : 'provider', message: waitMessage, attempt, format: outputFormat });
          emit(wait.failure.category === 'aborted'
            ? { kind: 'aborted', attempt, strategy, retries, phase: 'backoff', elapsedMs: elapsed() }
            : { kind: 'terminal', attempt, strategy, retries, category: 'server-delay', elapsedMs: elapsed() });
          return { success: false, error: waitMessage, retries, driftDetected: sawDrift,
            outputFormat, diagnostics: rejectionDiagnostics, bestCandidate, failure: wait.failure };
        }
        emit({ kind: 'delay', attempt, strategy, delayMs: wait.delayMs,
          reason: 'provider', elapsedMs: elapsed() });
        continue;
      }
      if (result.failure.retryable) {
        emit({ kind: 'exhausted', attempt, strategy, retries, elapsedMs: elapsed() });
      } else if (result.failure.category === 'aborted') {
        emit({ kind: 'aborted', attempt, strategy, retries, phase: 'fetch', elapsedMs: elapsed() });
      } else {
        emit({ kind: 'terminal', attempt, strategy, retries,
          category: result.failure.category === 'response' ? 'response' : 'provider', elapsedMs: elapsed() });
      }
      return { success: false, error: providerFailureMessage(result.failure), retries,
        driftDetected: sawDrift, outputFormat, diagnostics: rejectionDiagnostics,
        bestCandidate, failure: result.failure };
    }

    const candidate = extractDslFromResponse(result.text!);
    const profileChange = changedSavedHeader(candidate, attempt);
    if (profileChange) {
      rejectionDiagnostics.push(profileChange);
      emit({ kind: 'rejection', attempt, strategy, rejection: 'parse', elapsedMs: elapsed() });
      return candidateRejected(outputFormat, retries, sawDrift,
        rejectionDiagnostics, bestCandidate, prompt, profileChange.message);
    }
    // A graph-only interchange preview uses the existing GraphIR 3 parser
    // for its own spatial transaction. Saved @diagram source was refused
    // above and never enters this branch.
    const interchange = spatialPlan && request.spatial && outputFormat === 'coral'
      ? parse(candidate, { graphId: request.spatial.original.id }) : undefined;
    const interchangeDiagnostics = interchange?.diagnostics.map(editorDiagnostic) ?? [];
    const interchangeValid = !!interchange?.success && !!interchange.graph &&
      interchange.graph.nodes.length > 0;
    const formatValidation = interchange
      ? interchangeValid ? { ok: true as const } : {
          ok: false as const, error: interchangeDiagnostics[0]?.message ?? 'GraphIR interchange candidate has no nodes',
          diagnostics: interchangeDiagnostics,
        }
      : validateAiFormat(candidate, outputFormat);
    const validation: ValidationResult = interchange ? {
      valid: interchangeValid,
      errors: interchangeDiagnostics.filter((item) => item.severity === 'error'),
      diagnostics: interchangeDiagnostics,
      nodeCount: interchange.graph?.nodes.length ?? 0,
      nodeIds: interchange.graph?.nodes.map((node) => node.id) ?? [],
    } : validateOutput(candidate, outputFormat);
    if (validation.nodeCount > bestScore) {
      bestScore = validation.nodeCount;
      bestCandidate = candidate;
    }
    if (!formatValidation.ok || !validation.valid) {
      const rejectionCode = formatValidation.ok || outputFormat === 'coral'
        ? 'parse' as const : 'format' as const;
      lastError = formatValidation.ok
        ? `Validation failed: ${validation.errors[0]?.message}`
        : `Unsupported AI ${outputFormat} output: ${formatValidation.error}`;
      const detected = !formatValidation.ok && formatValidation.diagnostics?.length
        ? formatValidation.diagnostics : validation.diagnostics ?? validation.errors;
      rejectionDiagnostics.push(...(detected.length
        ? tagAttemptDiagnostics(detected, attempt, outputFormat, rejectionCode)
        : [{ code: rejectionCode, message: lastError, attempt, format: outputFormat }]));
      emit({ kind: 'rejection', attempt, strategy, rejection: 'parse', elapsedMs: elapsed() });
      return candidateRejected(outputFormat, retries, sawDrift,
        rejectionDiagnostics, bestCandidate, prompt, lastError);
    }

    rejectionDiagnostics.push(...tagAttemptDiagnostics(validation.diagnostics ?? [], attempt, outputFormat, 'parse'));
    if (spatialPlan && request.spatial) {
      if (notationId) {
        const parsedForLint = interchange?.graph
          ? { nodes: interchange.graph.nodes.map((node) => ({ ...node, label: node.label ?? node.id })),
            edges: interchange.graph.edges }
          : parseCoralDSL(candidate);
        const lintResults = lintAgainstNotation(parsedForLint.nodes, parsedForLint.edges, notationId);
        const lintErrors = lintResults.filter((item) => item.severity === 'error');
        if (lintErrors.length > 0) {
          lastError = `Notation errors: ${lintErrors[0].message}`;
          rejectionDiagnostics.push(...tagAttemptDiagnostics(lintErrors, attempt, outputFormat));
          emit({ kind: 'rejection', attempt, strategy, rejection: 'notation', elapsedMs: elapsed() });
          return candidateRejected(outputFormat, retries, sawDrift,
            rejectionDiagnostics, bestCandidate, prompt, lastError);
        }
      }
      const parsed = interchange ?? parse(candidate, { graphId: request.spatial.original.id });
      if (!parsed.success || !parsed.graph) {
        lastError = 'The spatial candidate could not be parsed canonically';
        rejectionDiagnostics.push(...tagAttemptDiagnostics(parsed.diagnostics, attempt, outputFormat));
        emit({ kind: 'rejection', attempt, strategy, rejection: 'parse', elapsedMs: elapsed() });
        return candidateRejected(outputFormat, retries, sawDrift,
          rejectionDiagnostics, bestCandidate, prompt, lastError);
      }
      const canonical = hydrateSpatialCandidate(request.spatial.original, {
        ...parsed.graph,
        id: request.spatial.original.id,
        version: request.spatial.original.version,
      }, spatialPlan);
      const final = finalizeSpatialCandidate(request.spatial.original, canonical, spatialPlan);
      if (!final.success) {
        const diagnostic = final.diagnostics[0];
        lastError = diagnostic.message;
        rejectionDiagnostics.push(...tagAttemptDiagnostics(final.diagnostics, attempt, outputFormat));
        emit({ kind: 'rejection', attempt, strategy, rejection: 'spatial', elapsedMs: elapsed() });
        return candidateRejected(outputFormat, retries, sawDrift,
          rejectionDiagnostics, bestCandidate, prompt, lastError);
      }
      emit({ kind: 'success', attempt, strategy, retries, elapsedMs: elapsed() });
      return { success: true, dsl: final.dsl, graph: final.graph,
        spatialEvidence: final.evidence, retries, driftDetected: false, outputFormat,
        ...((rejectionDiagnostics.length || final.printDiagnostics.length) ? {
          diagnostics: [
            ...rejectionDiagnostics,
            ...tagAttemptDiagnostics(final.printDiagnostics, attempt, outputFormat),
          ],
        } : {}) };
    }

    if (mode === 'adjust') {
      const drift = checkStructuralDrift(originalNodeIds, validation.nodeIds);
      if (drift.drifted) {
        sawDrift = true;
        lastError = 'Structural drift detected';
        rejectionDiagnostics.push({
          code: 'drift',
          message: `${lastError}: ${drift.removedNodes.join(', ')} (${drift.lossPercentage}% lost)`,
          attempt,
          format: outputFormat,
        });
        emit({ kind: 'rejection', attempt, strategy, rejection: 'drift', elapsedMs: elapsed() });
        return candidateRejected(outputFormat, retries, sawDrift,
          rejectionDiagnostics, bestCandidate, prompt, lastError);
      }
    }

    if (notationId) {
      const parsed = outputFormat === 'mermaid' ? parseMermaidDSL(candidate) : parseCoralDSL(candidate);
      const lintResults = lintAgainstNotation(parsed.nodes, parsed.edges, notationId);
      const lintErrors = lintResults.filter((r) => r.severity === 'error');

      if (lintErrors.length > 0) {
        lastError = `Notation errors: ${lintErrors[0].message}`;
        rejectionDiagnostics.push(...tagAttemptDiagnostics(lintErrors, attempt, outputFormat));
        emit({ kind: 'rejection', attempt, strategy, rejection: 'notation', elapsedMs: elapsed() });
        return candidateRejected(outputFormat, retries, sawDrift,
          rejectionDiagnostics, bestCandidate, prompt, lastError);
      }

      // Semantic advice stays internal in 0.2.5. Warnings are neither returned
      // as product diagnostics nor appended to AI chat.
      emit({ kind: 'success', attempt, strategy, retries, elapsedMs: elapsed() });
      return {
        success: true,
        dsl: candidate,
        retries,
        driftDetected: false,
        outputFormat,
        ...(rejectionDiagnostics.length > 0 ? { diagnostics: rejectionDiagnostics } : {}),
      };
    }

    emit({ kind: 'success', attempt, strategy, retries, elapsedMs: elapsed() });
    return { success: true, dsl: candidate, retries, driftDetected: false, outputFormat,
      ...(rejectionDiagnostics.length > 0 ? { diagnostics: rejectionDiagnostics } : {}) };
  }

  throw new Error('unreachable');
}

async function attemptGenerate(
  config: GenerateRequest['config'],
  systemPrompt: string,
  userPrompt: string,
  history?: GenerateRequest['history'],
  signal?: AbortSignal,
  wallNow: () => number = Date.now,
): Promise<{ success: true; text: string } | { success: false; failure: ProviderFailure }> {
  if (signal?.aborted) {
    return { success: false, failure: { provider: config.provider, category: 'aborted', retryable: false } };
  }
  try {
    const req = history && history.length > 0
      ? buildMultiTurnRequest(config, systemPrompt, history)
      : buildRequest(config, systemPrompt, userPrompt);

    const response = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body,
      signal,
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch (err) {
        const failure = bodyReadFailure(config.provider, err, signal);
        if (failure) return { success: false, failure };
        errorBody = undefined;
      }
      if (signal?.aborted) {
        return { success: false, failure: abortedFailure(config.provider) };
      }
      return { success: false, failure: classifyProviderFailure(
        config.provider, response.status, errorBody,
        response.headers?.get?.('Retry-After') ?? null, wallNow(),
      ) };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      const failure = bodyReadFailure(config.provider, err, signal);
      return { success: false, failure: failure ?? {
        provider: config.provider, category: 'response', retryable: false,
      } };
    }
    if (signal?.aborted) {
      return { success: false, failure: abortedFailure(config.provider) };
    }
    try {
      const extracted = extractResponse(config.provider, json);
      return { success: true, text: extracted.text };
    } catch {
      return { success: false, failure: { provider: config.provider, category: 'response', retryable: false } };
    }
  } catch (err) {
    return { success: false, failure: bodyReadFailure(config.provider, err, signal) ?? {
      provider: config.provider, category: 'response', retryable: false,
    } };
  }
}

function abortedFailure(provider: GenerateRequest['config']['provider']): ProviderFailure {
  return { provider, category: 'aborted', retryable: false };
}

function bodyReadFailure(
  provider: GenerateRequest['config']['provider'],
  error: unknown,
  signal?: AbortSignal,
): ProviderFailure | undefined {
  const name = error && typeof error === 'object' && 'name' in error
    ? (error as { name?: unknown }).name : undefined;
  if (signal?.aborted || name === 'AbortError') {
    return abortedFailure(provider);
  }
  if (name === 'TimeoutError') {
    return { provider, category: 'timeout', code: 'timeout', retryable: true };
  }
  if (error instanceof TypeError) {
    return { provider, category: 'network', retryable: true };
  }
  return undefined;
}

function normalizeRetryBudget(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 2;
  return Math.max(0, Math.floor(value));
}

function providerFailureMessage(failure: ProviderFailure): string {
  if (failure.category === 'aborted') return 'Generation was cancelled';
  const status = failure.status === undefined ? '' : ` (HTTP ${failure.status})`;
  return `${failure.provider} provider request failed${status}: ${failure.code ?? failure.category}`;
}

function abortedResult(
  provider: GenerateRequest['config']['provider'],
  outputFormat: GenerateResult['outputFormat'],
  intent: GenerateRequest['intent'],
): GenerateResult {
  const failure: ProviderFailure = { provider, category: 'aborted', retryable: false };
  return { success: false, error: 'Generation was cancelled', retries: 0, driftDetected: false,
    intent, outputFormat, failure,
    diagnostics: [{ code: 'provider.aborted', message: 'Generation was cancelled', attempt: 0, format: outputFormat ?? 'coral' }] };
}

async function waitForRetry(
  request: GenerateRequest,
  retryNumber: number,
  failure?: ProviderFailure,
): Promise<{ success: true; delayMs: number } | { success: false; failure: ProviderFailure }> {
  const provider = request.config.provider;
  if ((failure?.retryAfterMs ?? 0) > 60_000) {
    return { success: false, failure: { provider, category: 'server-delay', retryable: false,
      ...(failure?.status !== undefined ? { status: failure.status } : {}),
      ...(failure?.code ? { code: failure.code } : {}),
      retryAfterMs: failure!.retryAfterMs } };
  }
  const rawRandom = request.retryRuntime?.random?.() ?? Math.random();
  const random = Number.isFinite(rawRandom) ? Math.min(1, Math.max(0, rawRandom)) : 0;
  const fallback = random * Math.min(8000, 500 * 2 ** Math.max(0, retryNumber - 1));
  const delay = Math.max(fallback, failure?.retryAfterMs ?? 0);
  try {
    const schedule = request.retryRuntime?.schedule ?? defaultSchedule;
    await schedule(delay, request.signal);
    return { success: true, delayMs: delay };
  } catch {
    return { success: false, failure: { provider, category: 'aborted', retryable: false } };
  }
}

function defaultSchedule(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(done, delayMs);
    signal?.addEventListener('abort', aborted, { once: true });
    function cleanup() { signal?.removeEventListener('abort', aborted); }
    function done() { cleanup(); resolve(); }
    function aborted() { clearTimeout(timer); cleanup(); reject(signal?.reason); }
  });
}

function defaultMonotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function retryStrategy(index: number): Exclude<RetryStrategy, 'local'> {
  if (index <= 0) return 'initial';
  if (index === 1) return 'feedback';
  if (index === 2) return 'simplified';
  return 'decomposed';
}

type AttemptTags = { attempt: number; format: NonNullable<GenerateResult['outputFormat']> };

/**
 * Copy every stage diagnostic into a result, each tagged with the attempt and
 * output format. Every stage-diagnostic copy site uses this so none can drop
 * diagnostics after the first (Slice 52 test review T52-6). With fallbackCode,
 * an item without a code takes it and an existing code is kept (code review
 * C52-3).
 */
export function tagAttemptDiagnostics<T extends { readonly code: string; readonly message: string }>(
  items: readonly T[],
  attempt: number,
  format: NonNullable<GenerateResult['outputFormat']>,
): Array<T & AttemptTags>;
export function tagAttemptDiagnostics<T extends { readonly code?: string; readonly message: string }>(
  items: readonly T[],
  attempt: number,
  format: NonNullable<GenerateResult['outputFormat']>,
  fallbackCode: string,
): Array<Omit<T, 'code'> & { code: string } & AttemptTags>;
export function tagAttemptDiagnostics<T extends { readonly code?: string; readonly message: string }>(
  items: readonly T[],
  attempt: number,
  format: NonNullable<GenerateResult['outputFormat']>,
  fallbackCode?: string,
): Array<T & AttemptTags> {
  return items.map((item) => ({
    ...item,
    ...(fallbackCode === undefined ? {} : { code: item.code ?? fallbackCode }),
    attempt,
    format,
  }));
}

function candidateRejected(
  outputFormat: NonNullable<GenerateResult['outputFormat']>,
  retries: number,
  driftDetected: boolean,
  diagnostics: NonNullable<GenerateResult['diagnostics']>,
  bestCandidate: string | undefined,
  prompt: string,
  reason: string,
): GenerateResult {
  return {
    success: false,
    error: `${reason}. No changes were applied. Choose Retry to request a new candidate.`,
    retries,
    driftDetected,
    outputFormat,
    diagnostics,
    bestCandidate,
    action: { kind: 'retry-candidate', prompt },
  };
}

function cancelledGeneration(
  outputFormat: NonNullable<GenerateResult['outputFormat']>,
  retries: number,
  driftDetected: boolean,
  diagnostics: NonNullable<GenerateResult['diagnostics']>,
  bestCandidate: string | undefined,
  failure: ProviderFailure,
): GenerateResult {
  return { success: false, error: providerFailureMessage(failure), retries, driftDetected,
    outputFormat, diagnostics: [...diagnostics, { code: failure.category === 'aborted'
      ? 'provider.aborted' : 'provider',
      message: providerFailureMessage(failure), attempt: retries, format: outputFormat }],
    bestCandidate, failure };
}
