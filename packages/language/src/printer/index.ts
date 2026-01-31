/**
 * Coral DSL Printer
 *
 * Converts Graph-IR back to Coral DSL text.
 * Enables roundtrip: DSL → IR → DSL
 */

import type { GraphIR, GraphNode, GraphEdge } from '../types.js';

export interface PrintOptions {
  /** Indentation string (default: 2 spaces) */
  indent?: string;
  /** Include comments with metadata */
  includeComments?: boolean;
}

/**
 * Print Graph-IR to Coral DSL text
 */
export function print(graph: GraphIR, options: PrintOptions = {}): string {
  const { indent = '  ' } = options;

  const lines: string[] = [];

  // Print nodes (top-level only, children are printed nested)
  for (const node of graph.nodes) {
    printNode(node, lines, 0, indent);
  }

  // Add blank line before edges if we have both nodes and edges
  if (graph.nodes.length > 0 && graph.edges.length > 0) {
    lines.push('');
  }

  // Print edges
  for (const edge of graph.edges) {
    lines.push(printEdge(edge));
  }

  return lines.join('\n');
}

/**
 * Print a single node and its children
 */
function printNode(
  node: GraphNode,
  lines: string[],
  depth: number,
  indent: string
): void {
  const prefix = indent.repeat(depth);
  const nodeType = node.type || 'service';
  const label = escapeString(node.label || node.id);

  // Check if node has body content (children or properties)
  const hasChildren = node.children && node.children.length > 0;
  const hasProperties = node.properties && Object.keys(node.properties).length > 0;
  const hasBody = hasChildren || hasProperties;

  if (hasBody) {
    lines.push(`${prefix}${nodeType} "${label}" {`);

    // Print properties first
    if (hasProperties) {
      for (const [key, value] of Object.entries(node.properties!)) {
        // Skip internal properties
        if (key.startsWith('_')) continue;
        // Only print string properties in DSL format
        if (typeof value === 'string') {
          lines.push(`${prefix}${indent}${key}: "${escapeString(value)}"`);
        }
      }
    }

    // Print children
    if (hasChildren) {
      for (const child of node.children!) {
        printNode(child, lines, depth + 1, indent);
      }
    }

    lines.push(`${prefix}}`);
  } else {
    lines.push(`${prefix}${nodeType} "${label}"`);
  }
}

/**
 * Print a single edge
 */
function printEdge(edge: GraphEdge): string {
  const parts = [`${edge.source} -> ${edge.target}`];

  // Build attributes
  const attrs: string[] = [];

  if (edge.type) {
    attrs.push(edge.type);
  }

  if (edge.label) {
    attrs.push(`label = "${escapeString(edge.label)}"`);
  }

  // Add other properties as attributes
  if (edge.properties) {
    for (const [key, value] of Object.entries(edge.properties)) {
      if (key === 'label') continue; // Already handled
      if (typeof value === 'string') {
        attrs.push(`${key} = "${escapeString(value)}"`);
      }
    }
  }

  if (attrs.length > 0) {
    parts.push(`[${attrs.join(', ')}]`);
  }

  return parts.join(' ');
}

/**
 * Escape special characters in strings
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Format options for pretty printing
 */
export interface FormatOptions extends PrintOptions {
  /** Sort nodes by type */
  sortByType?: boolean;
  /** Group nodes by parent */
  groupByParent?: boolean;
}

/**
 * Pretty print with additional formatting options
 */
export function prettyPrint(graph: GraphIR, options: FormatOptions = {}): string {
  const { sortByType = false, ...printOptions } = options;

  let nodes = [...graph.nodes];

  if (sortByType) {
    const typeOrder = ['actor', 'service', 'module', 'database', 'external_api', 'group'];
    nodes.sort((a, b) => {
      const aIndex = typeOrder.indexOf(a.type || 'service');
      const bIndex = typeOrder.indexOf(b.type || 'service');
      return aIndex - bIndex;
    });
  }

  return print({ ...graph, nodes }, printOptions);
}
