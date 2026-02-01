/**
 * DSL Parsers for viz-demo
 *
 * Self-contained parsers for Coral DSL and Mermaid flowchart syntax.
 * These are simplified implementations for demo purposes.
 */

export interface GraphNode {
  id: string;
  type: string;
  label: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  errors: Array<{ line: number; message: string }>;
}

/**
 * Parse Coral DSL syntax
 *
 * Supports:
 * - Node declarations: `service "Label"`
 * - Edge declarations: `source -> target` or `source -> target [label: "text"]`
 * - Comments: `// comment`
 * - Node types: service, database, module, external_api, actor, group
 */
export function parseCoralDSL(text: string): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith('//')) continue;

    // Parse node: type "Label"
    const nodeMatch = line.match(/^(service|database|module|external_api|actor|group)\s+"([^"]+)"(?:\s*\{)?$/);
    if (nodeMatch) {
      const [, type, label] = nodeMatch;
      // Generate ID from label: lowercase, replace non-alphanumeric with _, trim leading/trailing _
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      nodes.push({ id, type, label });
      continue;
    }

    // Parse edge: source -> target [label: "text"] or source -> target
    const edgeMatch = line.match(/^(\w+)\s*->\s*(\w+)(?:\s*\[(?:label:\s*"([^"]*)")?\])?$/);
    if (edgeMatch) {
      const [, source, target, label] = edgeMatch;
      edges.push({
        id: `e_${edges.length}`,
        source,
        target,
        label,
      });
      continue;
    }

    // Skip closing braces
    if (line === '}') continue;

    // Unknown syntax - only report if it looks like content
    if (line.length > 2 && !line.match(/^\s*$/)) {
      errors.push({ line: lineNum, message: `Unknown syntax: ${line.slice(0, 40)}` });
    }
  }

  return { nodes, edges, errors };
}

/**
 * Parse Mermaid flowchart DSL
 *
 * Supports:
 * - Flowchart declaration: `flowchart TD` or `graph TD`
 * - Node shapes: `A[rect]`, `A{diamond}`, `A(rounded)`
 * - Edges: `A --> B`, `A -->|label| B`
 * - Comments: `%% comment`
 */
export function parseMermaidDSL(text: string): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const nodeMap = new Map<string, GraphNode>();

  const lines = text.split('\n');

  // Helper to add node if not exists
  function ensureNode(id: string, label?: string, shape?: string): void {
    if (!nodeMap.has(id)) {
      let type = 'service';
      if (shape === '{' || shape === '}') type = 'module'; // diamond = decision
      if (shape === '(' || shape === ')') type = 'service'; // rounded
      if (shape === '[' || shape === ']') type = 'service'; // rectangle
      if (shape === '[[' || shape === ']]') type = 'database'; // subroutine

      const node: GraphNode = { id, type, label: label || id };
      nodeMap.set(id, node);
      nodes.push(node);
    } else if (label && !nodeMap.get(id)!.label) {
      nodeMap.get(id)!.label = label;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines, comments, and flowchart declaration
    if (!line || line.startsWith('%%') || line.match(/^flowchart\s+(TD|TB|BT|LR|RL)/i)) continue;
    if (line.match(/^graph\s+(TD|TB|BT|LR|RL)/i)) continue;

    // Parse edge with nodes: A[Label] --> B[Label]
    // Supports: -->, --->, --, -.->
    const edgePattern = /^(\w+)(?:\[([^\]]+)\]|\{([^\}]+)\}|\(([^\)]+)\))?\s*(-->|---->|---|-\.->|\.-\.->)\s*(?:\|([^|]+)\|)?\s*(\w+)(?:\[([^\]]+)\]|\{([^\}]+)\}|\(([^\)]+)\))?$/;
    const edgeMatch = line.match(edgePattern);

    if (edgeMatch) {
      const [, sourceId, sourceLabel1, sourceLabel2, sourceLabel3, , edgeLabel, targetId, targetLabel1, targetLabel2, targetLabel3] = edgeMatch;
      const sourceLabel = sourceLabel1 || sourceLabel2 || sourceLabel3;
      const targetLabel = targetLabel1 || targetLabel2 || targetLabel3;

      // Determine shape for type inference
      const sourceShape = sourceLabel1 ? '[' : sourceLabel2 ? '{' : sourceLabel3 ? '(' : '[';
      const targetShape = targetLabel1 ? '[' : targetLabel2 ? '{' : targetLabel3 ? '(' : '[';

      ensureNode(sourceId, sourceLabel, sourceShape);
      ensureNode(targetId, targetLabel, targetShape);

      edges.push({
        id: `e_${edges.length}`,
        source: sourceId,
        target: targetId,
        label: edgeLabel,
      });
      continue;
    }

    // Parse standalone node definition: A[Label]
    const nodePattern = /^(\w+)(?:\[([^\]]+)\]|\{([^\}]+)\}|\(([^\)]+)\))$/;
    const nodeMatch = line.match(nodePattern);
    if (nodeMatch) {
      const [, id, label1, label2, label3] = nodeMatch;
      const label = label1 || label2 || label3;
      const shape = label1 ? '[' : label2 ? '{' : label3 ? '(' : '[';
      ensureNode(id, label, shape);
      continue;
    }

    // Skip subgraph, end, etc.
    if (line.match(/^(subgraph|end|style|classDef|class)\b/i)) continue;
  }

  return { nodes, edges, errors };
}
