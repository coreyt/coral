/**
 * Simple Coral DSL Printer
 *
 * Converts diagram nodes/edges to Coral DSL text.
 * Local implementation to avoid bundling issues with @coral/language.
 */

export interface GraphNode {
  id: string;
  type: string;
  label?: string;
  description?: string;
  properties?: Record<string, unknown>;
  children?: GraphNode[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
}

export interface GraphIR {
  version: string;
  id: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Print Graph-IR to Coral DSL text
 */
export function printCoralDSL(graph: GraphIR): string {
  const indent = '  ';
  const lines: string[] = [];

  // Print nodes
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
 * Print a single node
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
        // Handle different value types
        if (typeof value === 'string') {
          lines.push(`${prefix}${indent}${key}: "${escapeString(value)}"`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          lines.push(`${prefix}${indent}${key}: ${value}`);
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
