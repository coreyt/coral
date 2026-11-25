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
  LayoutOptions,
  EdgeStyle,
} from '../types.js';
import {
  finishParse,
  parseDiagnostic,
  type ParseDiagnostic,
  type SourcePosition,
} from '../diagnostics.js';

export interface DotParseOptions {
  graphId?: string;
  graphName?: string;
}

interface ParseContext {
  nodeMap: Map<string, GraphNode>;
  edges: GraphEdge[];
  edgeCounter: number;
  diagnostics: ParseDiagnostic[];
  graphId: string;
  isDirected: boolean;
  layoutOptions: LayoutOptions;
}

interface TokenizeResult {
  tokens: string[];
  positions: SourcePosition[];
}

interface TokenStream {
  tokens: string[];
  positions: SourcePosition[];
  pos: number;
}

/** Where the token the stream is looking at begins. */
function positionAt(stream: TokenStream): SourcePosition {
  return (
    stream.positions[Math.min(stream.pos, stream.positions.length - 1)] ?? {
      line: 1,
      column: 0,
      offset: 0,
    }
  );
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
    return finishParse([
      parseDiagnostic({
        severity: 'error',
        code: 'dot.input.unparsed',
        message: 'Empty input',
        position: { line: 1, column: 0, offset: 0 },
      }),
    ]);
  }

  const ctx: ParseContext = {
    nodeMap: new Map(),
    edges: [],
    edgeCounter: 0,
    diagnostics: [],
    graphId: options.graphId || 'dot-graph',
    isDirected: true,
    layoutOptions: {},
  };

  let stream: TokenStream | undefined;
  try {
    const { tokens, positions } = tokenize(trimmed);
    stream = { tokens, positions, pos: 0 };
    parseGraph(stream, ctx);
  } catch (e) {
    // A tokenizer that runs off the end surfaces as a TypeError; report it as a
    // positioned diagnostic rather than leaking the internal message (R-009 AC-8).
    const raw = e instanceof Error ? e.message : 'Parse error';
    const message = /Cannot read properties of undefined/.test(raw)
      ? 'Unexpected end of input'
      : raw;
    ctx.diagnostics.push(
      parseDiagnostic({
        severity: 'error',
        code: 'dot.input.unparsed',
        message,
        position: stream ? positionAt(stream) : { line: 1, column: 0, offset: 0 },
      })
    );
  }

  // Build final node list (top-level nodes only)
  const nodes: GraphNode[] = [];
  for (const node of ctx.nodeMap.values()) {
    if (!node.parent) {
      nodes.push(node);
    }
  }

  const graph: GraphIR = {
    version: '3.0.0',
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

  return finishParse(ctx.diagnostics, graph);
}

/**
 * Strip comments from DOT source before tokenization.
 * Handles // line comments and /* block comments *​/
 */
function stripComments(source: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < source.length) {
    // Track strings to avoid stripping inside them
    if (inString) {
      result += source[i];
      if (source[i] === '\\' && i + 1 < source.length) {
        result += source[i + 1];
        i += 2;
        continue;
      }
      if (source[i] === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (source[i] === '"' || source[i] === "'") {
      inString = true;
      stringChar = source[i];
      result += source[i];
      i++;
      continue;
    }

    // Line comment: // — blanked rather than removed, so every offset in the
    // cleaned text is still an offset into the original source.
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        result += ' ';
        i++;
      }
      continue;
    }

    // Block comment: /* ... */ — blanked, newlines preserved.
    if (source[i] === '/' && source[i + 1] === '*') {
      result += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        result += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < source.length) {
        result += '  ';
        i += 2;
      }
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}

/**
 * Tokenize DOT source
 */
function tokenize(source: string): TokenizeResult {
  // Strip comments first (blanked in place, so offsets still line up)
  const cleaned = stripComments(source);

  const positions: SourcePosition[] = [];
  const positionOf = (offset: number): SourcePosition => {
    let line = 1;
    let lineStart = 0;
    for (let j = 0; j < offset; j++) {
      if (cleaned[j] === '\n') {
        line++;
        lineStart = j + 1;
      }
    }
    return { line, column: offset - lineStart, offset };
  };

  let tokenStart = 0;
  const tokens: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;

  const push = (token: string, start: number) => {
    tokens.push(token);
    positions.push(positionOf(start));
  };

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        current += char;
        escaped = true;
        continue;
      }
      current += char;
      if (char === stringChar) {
        push(current, tokenStart);
        current = '';
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (current) {
        push(current, tokenStart);
        current = '';
      }
      tokenStart = i;
      inString = true;
      stringChar = char;
      current = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        push(current, tokenStart);
        current = '';
      }
      continue;
    }

    // Handle multi-char operators
    if (char === '-' && cleaned[i + 1] === '>') {
      if (current) push(current, tokenStart);
      push('->', i);
      current = '';
      i++;
      continue;
    }

    if (char === '-' && cleaned[i + 1] === '-') {
      if (current) push(current, tokenStart);
      push('--', i);
      current = '';
      i++;
      continue;
    }

    // Single char delimiters
    if ('{};[],='.includes(char)) {
      if (current) {
        push(current, tokenStart);
        current = '';
      }
      push(char, i);
      continue;
    }

    if (!current) tokenStart = i;
    current += char;
  }

  // Check for unterminated string
  if (inString) {
    throw new Error('Unterminated string literal');
  }

  if (current) {
    push(current, tokenStart);
  }

  return { tokens, positions };
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

  // A punctuation token here is not a statement. It used to fall through into
  // parseId and become a node whose id was ';' (R-009 AC-8).
  if (';,]}='.includes(token) && token.length === 1) {
    ctx.diagnostics.push(
      parseDiagnostic({
        severity: token === ';' ? 'info' : 'error',
        code: 'dot.token.unparsed',
        message: `Unexpected '${token}'`,
        position: positionAt(stream),
        source: token,
      })
    );
    consume(stream);
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

  // Handle quoted strings — unescape inner content
  if (token.startsWith('"') && token.endsWith('"')) {
    return unescapeString(token.slice(1, -1));
  }
  if (token.startsWith("'") && token.endsWith("'")) {
    return unescapeString(token.slice(1, -1));
  }

  return token;
}

function unescapeString(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if (next === '"') { result += '"'; i++; }
      else if (next === "'") { result += "'"; i++; }
      else if (next === 'n') { result += '\n'; i++; }
      else if (next === 't') { result += '\t'; i++; }
      else if (next === '\\') { result += '\\'; i++; }
      else { result += str[i]; }
    } else {
      result += str[i];
    }
  }
  return result;
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
