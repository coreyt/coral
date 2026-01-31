/**
 * Coral DSL Parser
 *
 * Parses Coral DSL text into Graph-IR format using tree-sitter.
 */

import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  ParseOptions,
  ParseResult,
  ParseError,
  SourceInfo,
  SourceRange,
} from '../types.js';

// Tree-sitter types (simplified for our use)
interface SyntaxNode {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  children: SyntaxNode[];
  namedChildren: SyntaxNode[];
  childForFieldName(name: string): SyntaxNode | null;
  hasError(): boolean;
}

interface Tree {
  rootNode: SyntaxNode;
}

interface Parser {
  setLanguage(language: unknown): void;
  parse(input: string): Tree;
}

// Lazy-loaded parser instance
let parserInstance: Parser | null = null;
let coralLanguage: unknown = null;

/**
 * Initialize the tree-sitter parser with Coral language
 */
async function getParser(): Promise<Parser> {
  if (parserInstance) {
    return parserInstance;
  }

  // Dynamic imports for tree-sitter
  const TreeSitter = await import('tree-sitter');
  const Coral = await import('tree-sitter-coral');

  parserInstance = new TreeSitter.default() as Parser;
  coralLanguage = Coral.default;
  parserInstance.setLanguage(coralLanguage);

  return parserInstance;
}

/**
 * Parse Coral DSL text into Graph-IR
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const {
    includeSourceInfo = false,
    graphId = 'coral-graph',
    graphName,
  } = options;

  // Create context for parsing
  const ctx: ParseContext = {
    source,
    includeSourceInfo,
    nodeIds: new Map(),
    edgeIds: new Map(),
    errors: [],
  };

  // Parse without tree-sitter for now (pure JS implementation)
  // This allows the package to work without native dependencies initially
  const parseResult = parseSource(ctx);

  if (!parseResult.success) {
    return {
      success: false,
      errors: ctx.errors,
    };
  }

  const graph: GraphIR = {
    version: '1.0.0',
    id: graphId,
    nodes: parseResult.nodes,
    edges: parseResult.edges,
  };

  if (graphName) {
    graph.name = graphName;
  }

  return {
    success: true,
    graph,
    errors: [],
  };
}

interface ParseContext {
  source: string;
  includeSourceInfo: boolean;
  nodeIds: Map<string, number>;
  edgeIds: Map<string, number>;
  errors: ParseError[];
}

interface InternalParseResult {
  success: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Pure JS parser implementation
 * This is a simplified parser that handles the core Coral DSL syntax
 */
function parseSource(ctx: ParseContext): InternalParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const lines = ctx.source.split('\n');
  let currentOffset = 0;
  let lineNumber = 0;

  // Track brace depth for parsing bodies
  let braceStack: { node: GraphNode; indent: number }[] = [];

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) {
      currentOffset += line.length + 1;
      continue;
    }

    // Handle closing braces
    if (trimmed === '}') {
      braceStack.pop();
      currentOffset += line.length + 1;
      continue;
    }

    // Try to parse node declaration
    const nodeMatch = parseNodeDeclaration(trimmed, ctx, currentOffset, lineNumber);
    if (nodeMatch) {
      if (braceStack.length > 0) {
        // This is a child node
        const parent = braceStack[braceStack.length - 1].node;
        nodeMatch.parent = parent.id;
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(nodeMatch);
      } else {
        nodes.push(nodeMatch);
      }

      // Check if this node has a body (but not empty body like { })
      if (trimmed.endsWith('{') && !trimmed.endsWith('{ }') && !trimmed.endsWith('{}')) {
        braceStack.push({ node: nodeMatch, indent: line.search(/\S/) });
      }

      currentOffset += line.length + 1;
      continue;
    }

    // Try to parse property (inside node body)
    const propertyMatch = parseProperty(trimmed);
    if (propertyMatch && braceStack.length > 0) {
      const parent = braceStack[braceStack.length - 1].node;
      if (!parent.properties) {
        parent.properties = {};
      }
      parent.properties[propertyMatch.key] = propertyMatch.value;
      currentOffset += line.length + 1;
      continue;
    }

    // Try to parse edge declaration
    const edgeMatch = parseEdgeDeclaration(trimmed, ctx, currentOffset, lineNumber);
    if (edgeMatch) {
      edges.push(edgeMatch);
      currentOffset += line.length + 1;
      continue;
    }

    // Unknown syntax - report error
    ctx.errors.push({
      message: `Unexpected syntax: ${trimmed}`,
      line: lineNumber,
      column: 0,
      offset: currentOffset,
    });

    currentOffset += line.length + 1;
  }

  // Check for unclosed braces
  if (braceStack.length > 0) {
    ctx.errors.push({
      message: 'Unclosed brace',
      line: lineNumber,
      column: 0,
      offset: currentOffset,
    });
  }

  return {
    success: ctx.errors.length === 0,
    nodes,
    edges,
  };
}

const NODE_TYPES = ['service', 'database', 'external_api', 'actor', 'module', 'group'];

function parseNodeDeclaration(
  line: string,
  ctx: ParseContext,
  offset: number,
  lineNumber: number
): GraphNode | null {
  // Match: node_type "label" { or node_type "label" or node_type "label" { }
  const nodeRegex = /^(service|database|external_api|actor|module|group)\s+"([^"]+)"(\s*\{\s*\}|\s*\{)?$/;
  const match = line.match(nodeRegex);

  if (!match) {
    return null;
  }

  const [, nodeType, label] = match;
  const id = generateNodeId(label, ctx);

  const node: GraphNode = {
    id,
    type: nodeType,
    label,
  };

  if (ctx.includeSourceInfo) {
    node.sourceInfo = {
      range: {
        start: offset,
        end: offset + line.length,
        startPosition: { line: lineNumber, column: 0 },
        endPosition: { line: lineNumber, column: line.length },
      },
    };
  }

  return node;
}

function parseProperty(line: string): { key: string; value: string } | null {
  // Match: key: "value"
  const propRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"([^"]*)"$/;
  const match = line.match(propRegex);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: match[2],
  };
}

function parseEdgeDeclaration(
  line: string,
  ctx: ParseContext,
  offset: number,
  lineNumber: number
): GraphEdge | null {
  // Match: source -> target [type, attr = "value"]
  const edgeRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\[([^\]]+)\])?$/;
  const match = line.match(edgeRegex);

  if (!match) {
    return null;
  }

  const [, source, target, attributes] = match;
  const edgeId = generateEdgeId(source, target, ctx);

  const edge: GraphEdge = {
    id: edgeId,
    source,
    target,
  };

  // Parse attributes if present
  if (attributes) {
    const attrParts = attributes.split(',').map(s => s.trim());

    // First part is the relation type
    if (attrParts.length > 0 && !attrParts[0].includes('=')) {
      edge.type = attrParts[0];
    }

    // Parse key = "value" attributes
    for (const part of attrParts) {
      const attrMatch = part.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"/);
      if (attrMatch) {
        const [, key, value] = attrMatch;
        if (key === 'label') {
          edge.label = value;
        } else {
          if (!edge.properties) {
            edge.properties = {};
          }
          edge.properties[key] = value;
        }
      }
    }
  }

  if (ctx.includeSourceInfo) {
    edge.sourceInfo = {
      range: {
        start: offset,
        end: offset + line.length,
        startPosition: { line: lineNumber, column: 0 },
        endPosition: { line: lineNumber, column: line.length },
      },
    };
  }

  return edge;
}

/**
 * Convert a label to a snake_case ID
 */
function labelToId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[.\s-]+/g, '_') // Replace dots, spaces, hyphens with underscores
    .replace(/[^a-z0-9_]/g, '') // Remove other special chars
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim underscores
}

/**
 * Generate a unique node ID from a label
 */
function generateNodeId(label: string, ctx: ParseContext): string {
  const baseId = labelToId(label);
  const count = ctx.nodeIds.get(baseId) || 0;
  ctx.nodeIds.set(baseId, count + 1);

  if (count === 0) {
    return baseId;
  }
  return `${baseId}_${count + 1}`;
}

/**
 * Generate a unique edge ID from source and target
 */
function generateEdgeId(source: string, target: string, ctx: ParseContext): string {
  const baseId = `${source}_to_${target}`;
  const count = ctx.edgeIds.get(baseId) || 0;
  ctx.edgeIds.set(baseId, count + 1);

  if (count === 0) {
    return baseId;
  }
  return `${baseId}_${count + 1}`;
}

/**
 * Async version that uses tree-sitter when available
 */
export async function parseAsync(
  source: string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  try {
    const parser = await getParser();
    return parseWithTreeSitter(parser, source, options);
  } catch {
    // Fall back to pure JS parser if tree-sitter is not available
    return parse(source, options);
  }
}

function parseWithTreeSitter(
  parser: Parser,
  source: string,
  options: ParseOptions
): ParseResult {
  const tree = parser.parse(source);
  const ctx: ParseContext = {
    source,
    includeSourceInfo: options.includeSourceInfo ?? false,
    nodeIds: new Map(),
    edgeIds: new Map(),
    errors: [],
  };

  // Check for parse errors
  if (tree.rootNode.hasError()) {
    collectParseErrors(tree.rootNode, ctx);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const child of tree.rootNode.namedChildren) {
    if (child.type === 'node_declaration') {
      const node = convertNodeDeclaration(child, ctx);
      if (node) nodes.push(node);
    } else if (child.type === 'edge_declaration') {
      const edge = convertEdgeDeclaration(child, ctx);
      if (edge) edges.push(edge);
    }
  }

  if (ctx.errors.length > 0) {
    return {
      success: false,
      errors: ctx.errors,
    };
  }

  const graph: GraphIR = {
    version: '1.0.0',
    id: options.graphId ?? 'coral-graph',
    nodes,
    edges,
  };

  if (options.graphName) {
    graph.name = options.graphName;
  }

  return {
    success: true,
    graph,
    errors: [],
  };
}

function collectParseErrors(node: SyntaxNode, ctx: ParseContext): void {
  if (node.type === 'ERROR') {
    ctx.errors.push({
      message: `Parse error: unexpected '${node.text}'`,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      offset: node.startIndex,
    });
  }

  for (const child of node.children) {
    collectParseErrors(child, ctx);
  }
}

function convertNodeDeclaration(
  node: SyntaxNode,
  ctx: ParseContext,
  parentId?: string
): GraphNode | null {
  const typeNode = node.childForFieldName('type');
  const nameNode = node.childForFieldName('name');
  const bodyNode = node.childForFieldName('body');

  if (!typeNode || !nameNode) {
    return null;
  }

  const label = extractString(nameNode.text);
  const id = generateNodeId(label, ctx);

  const graphNode: GraphNode = {
    id,
    type: typeNode.text,
    label,
  };

  if (parentId) {
    graphNode.parent = parentId;
  }

  if (bodyNode) {
    for (const child of bodyNode.namedChildren) {
      if (child.type === 'node_declaration') {
        const childNode = convertNodeDeclaration(child, ctx, id);
        if (childNode) {
          if (!graphNode.children) {
            graphNode.children = [];
          }
          graphNode.children.push(childNode);
        }
      } else if (child.type === 'property') {
        const keyNode = child.childForFieldName('key');
        const valueNode = child.childForFieldName('value');
        if (keyNode && valueNode) {
          if (!graphNode.properties) {
            graphNode.properties = {};
          }
          graphNode.properties[keyNode.text] = extractString(valueNode.text);
        }
      }
    }
  }

  if (ctx.includeSourceInfo) {
    graphNode.sourceInfo = createSourceInfo(node);
  }

  return graphNode;
}

function convertEdgeDeclaration(node: SyntaxNode, ctx: ParseContext): GraphEdge | null {
  const sourceNode = node.childForFieldName('source');
  const targetNode = node.childForFieldName('target');
  const attributesNode = node.childForFieldName('attributes');

  if (!sourceNode || !targetNode) {
    return null;
  }

  const source = sourceNode.text;
  const target = targetNode.text;
  const id = generateEdgeId(source, target, ctx);

  const edge: GraphEdge = {
    id,
    source,
    target,
  };

  if (attributesNode) {
    // First child is the relation type
    const children = attributesNode.namedChildren;
    if (children.length > 0 && children[0].type === 'identifier') {
      edge.type = children[0].text;
    }

    // Remaining children are attributes
    for (const child of children) {
      if (child.type === 'attribute') {
        const keyNode = child.childForFieldName('key');
        const valueNode = child.childForFieldName('value');
        if (keyNode && valueNode) {
          const key = keyNode.text;
          const value = extractString(valueNode.text);
          if (key === 'label') {
            edge.label = value;
          } else {
            if (!edge.properties) {
              edge.properties = {};
            }
            edge.properties[key] = value;
          }
        }
      }
    }
  }

  if (ctx.includeSourceInfo) {
    edge.sourceInfo = createSourceInfo(node);
  }

  return edge;
}

function extractString(text: string): string {
  // Remove surrounding quotes
  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1);
  }
  return text;
}

function createSourceInfo(node: SyntaxNode): SourceInfo {
  return {
    range: {
      start: node.startIndex,
      end: node.endIndex,
      startPosition: {
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      endPosition: {
        line: node.endPosition.row + 1,
        column: node.endPosition.column,
      },
    },
  };
}

export { labelToId };
