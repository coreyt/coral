/**
 * Coral DSL Printing Tool
 *
 * Converts Graph-IR JSON to Coral DSL text.
 */

export interface PrintResult {
  success: boolean;
  dsl?: string;
  errors: string[];
}

interface GraphNode {
  id: string;
  type: string;
  label?: string;
  description?: string;
  properties?: Record<string, unknown>;
  children?: GraphNode[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

interface GraphIR {
  version: string;
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Print Graph-IR to Coral DSL
 */
export function printCoral(irJson: string): PrintResult {
  try {
    const ir = JSON.parse(irJson) as GraphIR;
    const lines: string[] = [];

    // Print nodes
    for (const node of ir.nodes) {
      printNode(node, lines, 0);
    }

    // Add blank line between nodes and edges
    if (ir.nodes.length > 0 && ir.edges.length > 0) {
      lines.push('');
    }

    // Print edges
    for (const edge of ir.edges) {
      lines.push(printEdge(edge));
    }

    return {
      success: true,
      dsl: lines.join('\n'),
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

function printNode(node: GraphNode, lines: string[], depth: number): void {
  const indent = '  '.repeat(depth);
  const label = node.label || node.id;
  const hasBody =
    node.description ||
    (node.properties && Object.keys(node.properties).length > 0) ||
    (node.children && node.children.length > 0);

  if (hasBody) {
    lines.push(indent + node.type + ' "' + label + '" {');

    if (node.description) {
      lines.push(indent + '  description: "' + node.description + '"');
    }

    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        if (key !== 'description') {
          lines.push(indent + '  ' + key + ': "' + String(value) + '"');
        }
      }
    }

    if (node.children) {
      if (node.description || (node.properties && Object.keys(node.properties).length > 0)) {
        lines.push('');
      }
      for (const child of node.children) {
        printNode(child, lines, depth + 1);
      }
    }

    lines.push(indent + '}');
  } else {
    lines.push(indent + node.type + ' "' + label + '"');
  }
}

function printEdge(edge: GraphEdge): string {
  const attrs: string[] = [];

  if (edge.type) {
    attrs.push(edge.type);
  }

  if (edge.label) {
    attrs.push('label = "' + edge.label + '"');
  }

  if (attrs.length > 0) {
    return edge.source + ' -> ' + edge.target + ' [' + attrs.join(', ') + ']';
  }

  return edge.source + ' -> ' + edge.target;
}
