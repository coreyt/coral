/**
 * Graphviz DOT Importer
 *
 * Converts Graphviz DOT syntax to Graph-IR.
 * Supports: digraph, graph, subgraph/cluster
 *
 * DOT syntax reference:
 * - digraph G { A -> B; }
 * - graph G { A -- B; }
 * - Node attributes: A [label="Label", shape=box];
 * - Edge attributes: A -> B [label="flow"];
 * - Clusters: subgraph cluster_name { ... }
 */

import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  ParseResult,
  ParseError,
  LayoutOptions,
  EdgeStyle,
} from '../types.js';

export interface DotParseOptions {
  graphId?: string;
  graphName?: string;
}

interface ParseContext {
  nodeMap: Map<string, GraphNode>;
  edges: GraphEdge[];
  edgeCounter: number;
  errors: ParseError[];
  currentLine: number;
  graphId: string;
  isDirected: boolean;
  layoutOptions: LayoutOptions;
}

interface TokenStream {
  tokens: string[];
  pos: number;
}

/**
 * Parse Graphviz DOT syntax into Graph-IR
 */
export function parseDot(
  source: string,
  options: DotParseOptions = {}
): ParseResult {
  const trimmed = source.trim();

  if (!trimmed) {
    return {
      success: false,
      errors: [{ message: 'Empty input', line: 1, column: 0, offset: 0 }],
    };
  }

  const ctx: ParseContext = {
    nodeMap: new Map(),
    edges: [],
    edgeCounter: 0,
    errors: [],
    currentLine: 1,
    graphId: options.graphId || 'dot-graph',
    isDirected: true,
    layoutOptions: {},
  };

  try {
    const tokens = tokenize(trimmed);
    const stream: TokenStream = { tokens, pos: 0 };
    parseGraph(stream, ctx);
  } catch (e) {
    ctx.errors.push({
      message: e instanceof Error ? e.message : 'Parse error',
      line: ctx.currentLine,
      column: 0,
      offset: 0,
    });
  }

  if (ctx.errors.length > 0) {
    return {
      success: false,
      errors: ctx.errors,
    };
  }

  // Build final node list (top-level nodes only)
  const nodes: GraphNode[] = [];
  for (const node of ctx.nodeMap.values()) {
    if (!node.parent) {
      nodes.push(node);
    }
  }

  const graph: GraphIR = {
    version: '1.0.0',
    id: ctx.graphId,
    nodes,
    edges: ctx.edges,
  };

  if (options.graphName) {
    graph.name = options.graphName;
  }

  if (Object.keys(ctx.layoutOptions).length > 0) {
    graph.layoutOptions = ctx.layoutOptions;
  }

  return {
    success: true,
    graph,
    errors: [],
  };
}

/**
 * Tokenize DOT source
 */
function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      current += char;
      if (char === stringChar && source[i - 1] !== '\\') {
        tokens.push(current);
        current = '';
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (current) {
        tokens.push(current);
        current = '';
      }
      inString = true;
      stringChar = char;
      current = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    // Handle multi-char operators
    if (char === '-' && source[i + 1] === '>') {
      if (current) tokens.push(current);
      tokens.push('->');
      current = '';
      i++;
      continue;
    }

    if (char === '-' && source[i + 1] === '-') {
      if (current) tokens.push(current);
      tokens.push('--');
      current = '';
      i++;
      continue;
    }

    // Single char delimiters
    if ('{};[],='.includes(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function peek(stream: TokenStream): string | undefined {
  return stream.tokens[stream.pos];
}

function consume(stream: TokenStream): string {
  return stream.tokens[stream.pos++];
}

function expect(stream: TokenStream, expected: string): void {
  const token = consume(stream);
  if (token !== expected) {
    throw new Error(`Expected '${expected}', got '${token}'`);
  }
}

function parseGraph(stream: TokenStream, ctx: ParseContext, parentId?: string): void {
  const keyword = consume(stream);

  if (keyword === 'digraph') {
    ctx.isDirected = true;
  } else if (keyword === 'graph') {
    ctx.isDirected = false;
  } else if (keyword === 'subgraph') {
    // Handled below
  } else {
    throw new Error(`Expected 'digraph', 'graph', or 'subgraph', got '${keyword}'`);
  }

  // Get graph name (optional)
  let graphName: string | undefined;
  if (peek(stream) !== '{') {
    graphName = parseId(stream);
    if (keyword !== 'subgraph') {
      ctx.graphId = graphName;
    }
  }

  expect(stream, '{');

  // For subgraphs, create a group node
  let subgraphNode: GraphNode | undefined;
  if (keyword === 'subgraph' && graphName) {
    subgraphNode = {
      id: graphName,
      type: 'group',
      label: graphName,
      children: [],
    };
    if (parentId) {
      subgraphNode.parent = parentId;
    }
    ctx.nodeMap.set(graphName, subgraphNode);
  }

  // Parse statements
  while (peek(stream) && peek(stream) !== '}') {
    parseStatement(stream, ctx, subgraphNode?.id, subgraphNode);
  }

  expect(stream, '}');
}

function parseStatement(stream: TokenStream, ctx: ParseContext, parentId?: string, parentNode?: GraphNode): void {
  const token = peek(stream);

  if (!token) return;

  // Handle subgraph
  if (token === 'subgraph') {
    parseGraph(stream, ctx, parentId);
    if (peek(stream) === ';') consume(stream);
    return;
  }

  // Handle graph attributes (e.g., rankdir=LR)
  if (token === 'graph' || token === 'node' || token === 'edge') {
    consume(stream); // skip keyword
    if (peek(stream) === '[') {
      const attrs = parseAttributes(stream);
      if (token === 'graph') {
        applyGraphAttributes(attrs, ctx, parentNode);
      }
    }
    if (peek(stream) === ';') consume(stream);
    return;
  }

  // Parse node or edge statement
  const id = parseId(stream);

  // Check for attribute-only statement (graph attribute like label=X or rankdir=LR)
  if (peek(stream) === '=') {
    consume(stream); // =
    const value = parseId(stream);
    applyGraphAttributes({ [id]: value }, ctx, parentNode);
    if (peek(stream) === ';') consume(stream);
    return;
  }

  // Check for edge
  if (peek(stream) === '->' || peek(stream) === '--') {
    parseEdgeChain(stream, ctx, id, parentId);
    if (peek(stream) === ';') consume(stream);
    return;
  }

  // It's a node declaration
  let attrs: Record<string, string> = {};
  if (peek(stream) === '[') {
    attrs = parseAttributes(stream);
  }

  ensureNode(ctx, id, attrs, parentId);
  if (peek(stream) === ';') consume(stream);
}

function parseId(stream: TokenStream): string {
  const token = consume(stream);

  // Handle quoted strings
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  if (token.startsWith("'") && token.endsWith("'")) {
    return token.slice(1, -1);
  }

  return token;
}

function parseAttributes(stream: TokenStream): Record<string, string> {
  const attrs: Record<string, string> = {};

  expect(stream, '[');

  while (peek(stream) && peek(stream) !== ']') {
    const key = parseId(stream);

    if (peek(stream) === '=') {
      consume(stream); // =
      const value = parseId(stream);
      attrs[key] = value;
    }

    if (peek(stream) === ',') {
      consume(stream);
    }
  }

  expect(stream, ']');

  return attrs;
}

function parseEdgeChain(
  stream: TokenStream,
  ctx: ParseContext,
  firstId: string,
  parentId?: string
): void {
  let currentId = firstId;
  ensureNode(ctx, currentId, {}, parentId);

  while (peek(stream) === '->' || peek(stream) === '--') {
    consume(stream); // arrow

    const nextId = parseId(stream);
    ensureNode(ctx, nextId, {}, parentId);

    let attrs: Record<string, string> = {};
    if (peek(stream) === '[') {
      attrs = parseAttributes(stream);
    }

    const edge: GraphEdge = {
      id: `edge_${++ctx.edgeCounter}`,
      source: currentId,
      target: nextId,
    };

    if (attrs.label) {
      edge.label = attrs.label;
    }

    if (attrs.style) {
      edge.style = parseEdgeStyle(attrs.style);
    }

    ctx.edges.push(edge);
    currentId = nextId;
  }

  // Handle attributes after the chain
  if (peek(stream) === '[') {
    const attrs = parseAttributes(stream);
    // Apply to last edge
    if (ctx.edges.length > 0) {
      const lastEdge = ctx.edges[ctx.edges.length - 1];
      if (attrs.label) lastEdge.label = attrs.label;
      if (attrs.style) lastEdge.style = parseEdgeStyle(attrs.style);
    }
  }
}

function ensureNode(
  ctx: ParseContext,
  id: string,
  attrs: Record<string, string>,
  parentId?: string
): void {
  if (ctx.nodeMap.has(id)) {
    // Update existing node with new attributes
    const node = ctx.nodeMap.get(id)!;
    if (attrs.label) node.label = attrs.label;
    if (attrs.shape) node.type = shapeToType(attrs.shape);
    return;
  }

  const node: GraphNode = {
    id,
    type: shapeToType(attrs.shape),
    label: attrs.label || id,
  };

  if (parentId) {
    node.parent = parentId;
    const parent = ctx.nodeMap.get(parentId);
    if (parent && parent.children) {
      parent.children.push(node);
    }
  }

  ctx.nodeMap.set(id, node);
}

function shapeToType(shape?: string): string {
  switch (shape) {
    case 'cylinder':
    case 'Mcylinder':
      return 'database';
    case 'ellipse':
    case 'circle':
    case 'doublecircle':
      return 'actor';
    case 'diamond':
      return 'module';
    case 'box':
    case 'rect':
    case 'rectangle':
    case 'square':
    default:
      return 'service';
  }
}

function parseEdgeStyle(style: string): EdgeStyle {
  const result: EdgeStyle = {};

  if (style.includes('dashed')) {
    result.lineStyle = 'dashed';
  } else if (style.includes('dotted')) {
    result.lineStyle = 'dotted';
  }

  return result;
}

function applyGraphAttributes(attrs: Record<string, string>, ctx: ParseContext, parentNode?: GraphNode): void {
  if (attrs.rankdir) {
    const dirMap: Record<string, LayoutOptions['direction']> = {
      TB: 'DOWN',
      BT: 'UP',
      LR: 'RIGHT',
      RL: 'LEFT',
    };
    ctx.layoutOptions.direction = dirMap[attrs.rankdir.toUpperCase()] || 'DOWN';
  }

  // Update subgraph label if we're inside one
  if (attrs.label && parentNode) {
    parentNode.label = attrs.label;
  }
}
