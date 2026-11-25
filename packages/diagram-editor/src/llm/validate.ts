/**
 * Validation for LLM-Generated DSL
 *
 * Extracts, validates, and checks for structural drift in LLM output.
 * Part of issue #46: LLM-powered diagram generation.
 */

import { parseCoralDSL, parseMermaidDSL, editorDiagnostic, type EditorParseError } from '../parsers';
import { parseMermaid } from '@coral-viz/language';
import type { OutputFormat } from './types';

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: EditorParseError[];
  diagnostics?: EditorParseError[];
  nodeCount: number;
  nodeIds: string[];
}

/** Drift check result */
export interface DriftResult {
  drifted: boolean;
  lossPercentage: number;
  addedNodes: string[];
  removedNodes: string[];
}

/**
 * Extract DSL from an LLM response, stripping code fences and prose.
 */
export function extractDslFromResponse(raw: string): string {
  if (!raw) return '';

  // Check for code fences
  const fenceMatch = raw.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // No fences — return trimmed
  return raw.trim();
}

/** Validate a candidate with the parser for the requested output format. */
export function validateOutput(dsl: string, format: OutputFormat): ValidationResult {
  let importerDiagnostics: EditorParseError[] = [];
  if (!dsl.trim()) {
    return {
      valid: false,
      errors: [{ line: 0, message: 'Empty DSL: no nodes generated' }],
      nodeCount: 0,
      nodeIds: [],
    };
  }

  if (format === 'mermaid') {
    const canonical = parseMermaid(dsl);
    importerDiagnostics = canonical.diagnostics.map(editorDiagnostic);
    const diagnostics = canonical.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error' || diagnostic.code.endsWith('.unparsed')
    );
    if (!canonical.success || diagnostics.length > 0) {
      return {
        valid: false,
        errors: diagnostics.map(editorDiagnostic),
        diagnostics: canonical.diagnostics.map(editorDiagnostic),
        nodeCount: canonical.graph?.nodes.length ?? 0,
        nodeIds: canonical.graph?.nodes.map((node) => node.id) ?? [],
      };
    }
  }

  const result = format === 'mermaid' ? parseMermaidDSL(dsl) : parseCoralDSL(dsl);

  // Parsing Coral syntax does not require edge endpoints to name declared
  // nodes. AI candidates do: allowing a dangling reference past this boundary
  // defers a deterministic integrity failure to layout/application.
  const nodeIds = new Set(result.nodes.map((node) => node.id));
  const referenceErrors = result.edges.flatMap((edge) => {
    const line = edge.sourceInfo?.range.startPosition?.line ?? 0;
    return [
      ...(!nodeIds.has(edge.source) ? [{
        line,
        message: `Edge "${edge.id}" references missing source node "${edge.source}"`,
      }] : []),
      ...(!nodeIds.has(edge.target) ? [{
        line,
        message: `Edge "${edge.id}" references missing target node "${edge.target}"`,
      }] : []),
    ];
  });

  if (result.nodes.length === 0) {
    return {
      valid: false,
      errors: result.errors.length > 0
        ? result.errors
        : [{ line: 0, message: 'No nodes found in generated DSL' }],
      diagnostics: [...importerDiagnostics, ...(result.diagnostics ?? result.errors)],
      nodeCount: 0,
      nodeIds: [],
    };
  }

  // DSL with parse errors but some nodes is still invalid
  if (result.errors.length > 0 || referenceErrors.length > 0) {
    return {
      valid: false,
      errors: [...result.errors, ...referenceErrors],
      diagnostics: [...importerDiagnostics, ...(result.diagnostics ?? result.errors), ...referenceErrors],
      nodeCount: result.nodes.length,
      nodeIds: result.nodes.map((n) => n.id),
    };
  }

  return {
    valid: true,
    errors: [],
    diagnostics: [...importerDiagnostics, ...(result.diagnostics ?? result.errors)],
    nodeCount: result.nodes.length,
    nodeIds: result.nodes.map((n) => n.id),
  };
}

/**
 * Check for structural drift: did the LLM regenerate instead of adjusting?
 * Drift = more than 50% of original nodes are missing.
 * Also detects unexpected node additions.
 */
export function checkStructuralDrift(
  originalNodeIds: string[],
  newNodeIds: string[]
): DriftResult {
  // No drift possible with empty original (fresh generation)
  if (originalNodeIds.length === 0) {
    return { drifted: false, lossPercentage: 0, addedNodes: [], removedNodes: [] };
  }

  const originalSet = new Set(originalNodeIds);
  const newSet = new Set(newNodeIds);

  const removedNodes: string[] = [];
  for (const id of originalNodeIds) {
    if (!newSet.has(id)) removedNodes.push(id);
  }

  const addedNodes: string[] = [];
  for (const id of newNodeIds) {
    if (!originalSet.has(id)) addedNodes.push(id);
  }

  const lossPercentage = Math.round((removedNodes.length / originalNodeIds.length) * 100);

  return {
    drifted: lossPercentage > 50,
    lossPercentage,
    addedNodes,
    removedNodes,
  };
}

/**
 * Extract explanation text and optional DSL from a fix response.
 * Everything before the code fence = explanation.
 * Content inside the fence = DSL.
 * If no fence, treat entire response as explanation with no DSL.
 */
export function extractExplanationAndDsl(raw: string): { explanation: string; dsl: string | null } {
  if (!raw) return { explanation: '', dsl: null };

  const fenceMatch = raw.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (fenceMatch) {
    const fenceStart = raw.indexOf(fenceMatch[0]);
    const explanation = raw.slice(0, fenceStart).trim();
    const dsl = fenceMatch[1].trim();
    return { explanation, dsl: dsl || null };
  }

  return { explanation: raw.trim(), dsl: null };
}

/**
 * Format parse errors for a retry prompt.
 */
export function formatErrorsForRetry(
  errors: EditorParseError[],
  dsl: string,
  format: OutputFormat = 'coral',
): string {
  const parts: string[] = [];

  parts.push(`The previous output had errors. Please fix and output valid ${format === 'mermaid' ? 'Mermaid flowchart syntax' : 'Coral DSL'}.`);
  parts.push('');

  if (errors.length > 0) {
    parts.push('Errors:');
    for (const err of errors) {
      parts.push(`  Line ${err.line}: ${err.message}`);
    }
    parts.push('');
  }

  parts.push('Previous output:');
  parts.push(dsl);

  return parts.join('\n');
}
