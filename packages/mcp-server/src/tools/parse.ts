/**
 * Coral DSL Parsing Tool
 *
 * Parses Coral DSL text into Graph-IR JSON.
 */

export interface ParseResult {
  success: boolean;
  ir?: unknown;
  errors: string[];
}

interface ParsedNode {
  id: string;
  type: string;
  label: string;
  description?: string;
  properties?: Record<string, string>;
  children?: unknown[];
}

interface ParsedEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

/**
 * Parse Coral DSL to Graph-IR
 */
export function parseCoral(dsl: string): ParseResult {
  const errors: string[] = [];
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];

  let edgeCount = 0;

  const lines = dsl.split('\n');
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      lineIndex++;
      continue;
    }

    // Node declaration: type "label" { ... }
    const nodeMatch = line.match(
      /^(service|database|external_api|actor|module|group)\s+"([^"]+)"(?:\s*\{)?/
    );
    if (nodeMatch) {
      const [, type, label] = nodeMatch;
      const id = labelToId(label);

      const node: ParsedNode = { id, type, label };

      // Check for body
      if (line.includes('{') && !line.includes('}')) {
        lineIndex++;
        const { properties, description, endLine } = parseNodeBody(lines, lineIndex);
        if (properties && Object.keys(properties).length > 0) {
          node.properties = properties;
        }
        if (description) {
          node.description = description;
        }
        lineIndex = endLine;
      }

      nodes.push(node);
      lineIndex++;
      continue;
    }

    // Edge declaration: source -> target [type, label = "..."]
    const edgeMatch = line.match(/^(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?/);
    if (edgeMatch) {
      const [, source, target, attrs] = edgeMatch;
      edgeCount++;
      const edge: ParsedEdge = {
        id: 'e' + edgeCount,
        source,
        target,
      };

      if (attrs) {
        const parts = attrs.split(',').map((p) => p.trim());
        for (const part of parts) {
          if (part.includes('=')) {
            const eqIndex = part.indexOf('=');
            const key = part.slice(0, eqIndex).trim();
            const value = part.slice(eqIndex + 1).trim();
            if (key === 'label') {
              edge.label = value.replace(/^["']|["']$/g, '');
            }
          } else if (part && !part.includes('=')) {
            edge.type = part;
          }
        }
      }

      edges.push(edge);
      lineIndex++;
      continue;
    }

    // Unknown line
    if (line && !line.startsWith('}')) {
      errors.push('Unknown syntax at line ' + (lineIndex + 1) + ': ' + line);
    }
    lineIndex++;
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    ir: {
      version: '1.0.0',
      id: 'parsed-graph',
      nodes,
      edges,
    },
    errors: [],
  };
}

function labelToId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[.\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseNodeBody(
  lines: string[],
  startLine: number
): { properties?: Record<string, string>; description?: string; endLine: number } {
  const properties: Record<string, string> = {};
  let description: string | undefined;
  let idx = startLine;

  while (idx < lines.length) {
    const line = lines[idx].trim();

    if (line === '}') {
      return { properties, description, endLine: idx };
    }

    // Property: key: "value" or key: value
    const propMatch = line.match(/^(\w+):\s*"?([^"]*)"?$/);
    if (propMatch) {
      const [, key, value] = propMatch;
      if (key === 'description') {
        description = value;
      } else {
        properties[key] = value;
      }
    }

    idx++;
  }

  return { properties, description, endLine: idx };
}
