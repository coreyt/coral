/**
 * Post-Generation Notation Linting
 *
 * Validates LLM-generated DSL against the active notation's rules:
 * - Node type validity (is the type in the notation's accepted set?)
 * - Structural validation (entry/exit points, connectivity)
 * - Edge connection rules (are edges between these types allowed?)
 */

import { getNotation } from '@coral-viz/viz';
import { getValidTypesForNotation } from './notationRef';
import { advertisedSemanticTypeForSymbol, semanticTypeForSymbol } from '../notationSemantics';
import type { GraphNode, GraphEdge } from '../parsers';

export interface LintResult {
  code: 'notation.node.unsupported-type' | 'notation.node.unsupported-symbol' | 'notation.edge.atypical';
  category: 'capability' | 'advice';
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
  edgeId?: string;
  sourceId?: string;
  targetId?: string;
}

/**
 * Lint parsed DSL nodes and edges against the active notation.
 *
 * Returns an array of lint results. Errors reject the current candidate;
 * requesting another candidate remains an explicit user action. Warnings are
 * internal advice in 0.2.5 and do not block or reach product surfaces.
 */
export function lintAgainstNotation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  notationId: string,
): LintResult[] {
  const results: LintResult[] = [];

  const notation = getNotation(notationId);
  if (!notation) return results; // no notation = no lint

  // 1. Node type validity
  const validTypes = getValidTypesForNotation(notationId);
  for (const node of nodes) {
    if (!validTypes.has(node.type)) {
      results.push({
        code: 'notation.node.unsupported-type',
        category: 'capability',
        severity: 'error',
        message: `Node "${node.label}" uses type "${node.type}" which is not valid for ${notation.name}. Valid types: ${[...validTypes].slice(0, 10).join(', ')}`,
        nodeId: node.id,
      });
    }
    if (node.symbol !== undefined) {
      const expectedType = notation.symbols.includes(node.symbol)
        ? semanticTypeForSymbol(node.symbol, notationId)
        : undefined;
      if (expectedType === undefined || expectedType !== node.type) {
        results.push({
          code: 'notation.node.unsupported-symbol',
          category: 'capability',
          severity: 'error',
          message: expectedType === undefined
            ? `Node "${node.label}" uses symbol "${node.symbol}" which is not available in ${notation.name}`
            : `Node "${node.label}" uses symbol "${node.symbol}" with type "${node.type}"; expected type "${expectedType}"`,
          nodeId: node.id,
        });
      }
    }
  }

  // 2. Full-graph U2 conformance is separate: this local LLM lint lacks a
  // pinned profile, saved level, and complete GraphIR context. Do not turn
  // catalog rules into a second notation authority here.

  // 3. Edge connection rule checks
  if (notation.connectionRules && notation.connectionRules.length > 0) {
    const nodeTypeMap = new Map<string, string>();
    for (const node of nodes) {
      nodeTypeMap.set(node.id, node.type);
    }

    // Build a lookup: for each DSL source type, what DSL target types are allowed?
    const allowedConnections = buildConnectionLookup(notationId);

    for (const edge of edges) {
      const sourceType = nodeTypeMap.get(edge.source);
      const targetType = nodeTypeMap.get(edge.target);

      // Endpoint existence is a separate graph-integrity concern. This lint
      // function has no authority to silently repair or classify it.
      if (!sourceType || !targetType) continue;
      if (!allowedConnections) continue; // no rules for this notation

      const allowedTargets = allowedConnections.get(sourceType);
      if (allowedTargets && !allowedTargets.has(targetType)) {
        results.push({
          code: 'notation.edge.atypical',
          category: 'advice',
          severity: 'warning',
          message: `Edge ${edge.source} → ${edge.target}: connecting ${sourceType} to ${targetType} is not typical for ${notation.name}`,
          edgeId: edge.id,
          sourceId: edge.source,
          targetId: edge.target,
        });
      }
    }
  }

  return results;
}

/**
 * Build a lookup map from DSL source type → Set<allowed DSL target types>.
 * Returns null if the notation has no connection rules or no reverse mapping.
 */
export function buildConnectionLookup(notationId: string): Map<string, Set<string>> | null {
  const notation = getNotation(notationId);
  if (!notation || !notation.connectionRules) return null;

  // Build reverse mapping from symbol ID to DSL type
  const lookup = new Map<string, Set<string>>();

  for (const rule of notation.connectionRules) {
    const fromDsl = advertisedSemanticTypeForSymbol(rule.from, notationId);
    if (!fromDsl) continue;

    if (!lookup.has(fromDsl)) {
      lookup.set(fromDsl, new Set());
    }

    for (const toSymbol of rule.to) {
      const toDsl = advertisedSemanticTypeForSymbol(toSymbol, notationId);
      if (toDsl) {
        lookup.get(fromDsl)!.add(toDsl);
      }
    }
  }

  return lookup.size > 0 ? lookup : null;
}
