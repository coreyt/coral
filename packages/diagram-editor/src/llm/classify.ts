/**
 * Intent Classifier
 *
 * Heuristic classification of user prompts into intents.
 * No LLM call needed — uses keyword pattern matching.
 * Part of issue #48: LLM-Assisted Diagnostics.
 */

import type { LLMIntent } from './types';

/**
 * Directive patterns — phrases that look like questions but are actually
 * action requests. These take priority over help patterns.
 * "Can you add a load balancer?" → modify, not help.
 */
const DIRECTIVE_PATTERNS = [
  /^(can you|could you|would you|will you)\b/i,
  /^(add|remove|create|delete|rename|move|connect|change|update|replace|insert)\b/i,
  /^what if (we|i|you)\b/i,
  /^(let's|let us|please)\b/i,
  /^(make|put|set|give|show me)\b/i,
];

/** Patterns that indicate a help/explanation request */
const HELP_PATTERNS = [
  /^(why|what|how)\b/i,
  /\bexplain\b/i,
  /\?$/,
];

/** Patterns that indicate an imperative fix command */
const FIX_PATTERNS = [
  /\b(fix|resolve|repair)\b/i,
  /\b(get rid of|remove|clear)\b.*\b(warning|error|issue|problem|diagnostic)/i,
];

/**
 * Classify user intent from a natural language prompt.
 *
 * Priority order:
 * 1. Directive patterns (action requests phrased as questions) → skip help
 * 2. Help patterns (genuine questions, "explain", "why") → 'help'
 * 3. Fix patterns (imperative fix commands) + hasDiagnostics → 'fix'
 * 4. Has existing diagram → 'modify'
 * 5. Otherwise → 'generate'
 */
export function classifyIntent(
  prompt: string,
  hasExistingDiagram: boolean,
  hasDiagnostics: boolean,
): LLMIntent {
  const trimmed = prompt.trim();

  const isDirective = DIRECTIVE_PATTERNS.some((p) => p.test(trimmed));

  // 1. If it's not a directive, check for help patterns
  if (!isDirective && HELP_PATTERNS.some((p) => p.test(trimmed))) {
    return 'help';
  }

  // 2. Fix patterns require active diagnostics
  if (hasDiagnostics && FIX_PATTERNS.some((p) => p.test(trimmed))) {
    return 'fix';
  }

  // 3. Existing diagram → modify
  if (hasExistingDiagram) {
    return 'modify';
  }

  // 4. Fresh generation
  return 'generate';
}
