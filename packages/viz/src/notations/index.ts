/**
 * Notation Registry - Loads and provides access to notation definitions
 *
 * Notations define the grammar: which symbols are valid, how they connect,
 * and validation rules for a complete diagram.
 */

import type {
  NotationDefinition,
  NotationRegistry,
  GraphNode,
  GraphEdge,
  ValidationResult,
} from '../types';

// Import notation definitions
import { flowchartNotation } from './flowchart';
import { bpmnNotation } from './bpmn';
import { erdNotation } from './erd';
import { codeNotation } from './code';
import { architectureNotation } from './architecture';

// Combine all notations
const allNotations: NotationDefinition[] = [
  flowchartNotation,
  bpmnNotation,
  erdNotation,
  codeNotation,
  architectureNotation,
];

// Build notation map
const notationMap = new Map<string, NotationDefinition>();
allNotations.forEach((notation) => notationMap.set(notation.id, notation));

/**
 * Validate a diagram against a notation's rules
 */
function validateNotation(
  notation: NotationDefinition,
  nodes: GraphNode[],
  edges: GraphEdge[]
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!notation.validation) {
    return results;
  }

  const { entryPoints, exitPoints, rules } = notation.validation;

  // Check entry points
  if (entryPoints) {
    for (const ep of entryPoints) {
      const matching = nodes.filter((n) => {
        const matchesSymbol = n.type === ep.symbol;
        const matchesVariant = !ep.variant || n.properties?.variant === ep.variant;
        return matchesSymbol && matchesVariant;
      });

      if (ep.min !== undefined && matching.length < ep.min) {
        results.push({
          ruleId: 'entry-point-min',
          severity: 'error',
          message: `Diagram requires at least ${ep.min} ${ep.symbol}${ep.variant ? ` (${ep.variant})` : ''}`,
        });
      }

      if (ep.max !== undefined && matching.length > ep.max) {
        results.push({
          ruleId: 'entry-point-max',
          severity: 'error',
          message: `Diagram allows at most ${ep.max} ${ep.symbol}${ep.variant ? ` (${ep.variant})` : ''}`,
        });
      }
    }
  }

  // Check exit points
  if (exitPoints) {
    for (const ep of exitPoints) {
      const matching = nodes.filter((n) => {
        const matchesSymbol = n.type === ep.symbol;
        const matchesVariant = !ep.variant || n.properties?.variant === ep.variant;
        return matchesSymbol && matchesVariant;
      });

      if (ep.min !== undefined && matching.length < ep.min) {
        results.push({
          ruleId: 'exit-point-min',
          severity: 'error',
          message: `Diagram requires at least ${ep.min} ${ep.symbol}${ep.variant ? ` (${ep.variant})` : ''}`,
        });
      }
    }
  }

  // Check custom rules
  if (rules) {
    for (const rule of rules) {
      // mustBeConnected rule
      if (rule.mustBeConnected) {
        const targetSymbols = rule.symbol ? [rule.symbol] : rule.symbols || [];
        for (const symbolId of targetSymbols) {
          const symbolNodes = nodes.filter((n) => n.type === symbolId);
          for (const node of symbolNodes) {
            const hasConnection = edges.some(
              (e) => e.source === node.id || e.target === node.id
            );
            if (!hasConnection) {
              results.push({
                ruleId: rule.id,
                severity: 'warning',
                message: rule.description || `${node.label || node.id} is not connected`,
                nodeId: node.id,
              });
            }
          }
        }
      }

      // minOutgoing rule
      if (rule.minOutgoing !== undefined && rule.symbol) {
        const symbolNodes = nodes.filter((n) => n.type === rule.symbol);
        for (const node of symbolNodes) {
          const outgoing = edges.filter((e) => e.source === node.id);
          if (outgoing.length < rule.minOutgoing) {
            results.push({
              ruleId: rule.id,
              severity: 'error',
              message:
                rule.description ||
                `${node.label || node.id} requires at least ${rule.minOutgoing} outgoing connections`,
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Notation registry implementation
 */
export const notationRegistry: NotationRegistry = {
  get(id: string): NotationDefinition | undefined {
    return notationMap.get(id);
  },

  getAll(): NotationDefinition[] {
    return allNotations;
  },

  has(id: string): boolean {
    return notationMap.has(id);
  },

  validate(
    notationId: string,
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): ValidationResult[] {
    const notation = notationMap.get(notationId);
    if (!notation) {
      return [
        {
          ruleId: 'unknown-notation',
          severity: 'error',
          message: `Unknown notation: ${notationId}`,
        },
      ];
    }
    return validateNotation(notation, nodes, edges);
  },
};

/**
 * Get a notation by ID (convenience function)
 */
export function getNotation(id: string): NotationDefinition | undefined {
  return notationRegistry.get(id);
}

/**
 * Get all available notations
 */
export function getAllNotations(): NotationDefinition[] {
  return notationRegistry.getAll();
}

/**
 * Validate a diagram against a notation
 */
export function validateDiagram(
  notationId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): ValidationResult[] {
  return notationRegistry.validate(notationId, nodes, edges);
}

// Re-export individual notations
export { flowchartNotation } from './flowchart';
export { bpmnNotation } from './bpmn';
export { erdNotation } from './erd';
export { codeNotation } from './code';
export { architectureNotation } from './architecture';

export default notationRegistry;
