/**
 * Mermaid Diagram Importer
 *
 * Converts Mermaid diagram syntax to Graph-IR.
 *
 * Supported diagram types (Mermaid v11.12.2):
 * - flowchart/graph
 * - sequenceDiagram
 * - classDiagram
 * - stateDiagram / stateDiagram-v2
 * - erDiagram
 * - timeline
 * - block-beta
 * - packet-beta
 * - kanban
 * - architecture-beta
 *
 * See SPECS.md for version tracking and feature status.
 */

import type {
  GraphNode,
  GraphEdge,
  ParseResult,
  LayoutOptions,
} from '../types.js';
import { finishParse, parseDiagnostic, type ParseDiagnostic } from '../diagnostics.js';
import { parseMermaidSequence } from './mermaidSequence.js';
import { parseMermaidClass } from './mermaidClass.js';

export interface MermaidParseOptions {
  graphId?: string;
  graphName?: string;
}

// Diagram type detection patterns
const DIAGRAM_PATTERNS: Record<string, RegExp> = {
  flowchart: /^(flowchart|graph)\s+(TB|TD|BT|LR|RL)?/i,
  sequence: /^sequenceDiagram\s*$/i,
  class: /^classDiagram\s*$/,
  state: /^stateDiagram(-v2)?/i,
  er: /^erDiagram/i,
  timeline: /^timeline/i,
  block: /^block-beta/i,
  packet: /^packet-beta/i,
  kanban: /^kanban/i,
  architecture: /^architecture-beta/i,
};

// Unsupported diagram types (for clear error messages)
const UNSUPPORTED_DIAGRAMS: Record<string, string> = {
  gantt: 'Gantt charts',
  pie: 'Pie charts',
  quadrantChart: 'Quadrant charts',
  requirementDiagram: 'Requirement diagrams',
  gitGraph: 'Git graphs',
  C4Context: 'C4 diagrams',
  mindmap: 'Mind maps',
  journey: 'User journey diagrams',
  zenuml: 'ZenUML diagrams',
  sankey: 'Sankey diagrams',
  xychart: 'XY charts',
  radar: 'Radar charts',
  treemap: 'Treemaps',
};

/**
 * Parse Mermaid diagram syntax into Graph-IR
 */
export function parseMermaid(
  source: string,
  options: MermaidParseOptions = {}
): ParseResult {
  if (!source.trim()) {
    return finishParse([
      parseDiagnostic({
        severity: 'error',
        code: 'mermaid.input.unparsed',
        message: 'Empty input',
        position: { line: 1, column: 0, offset: 0 },
      }),
    ]);
  }

  const sourceLines = source.split('\n');
  const headerIndex = sourceLines.findIndex((line) => line.trim().length > 0);
  const firstLine = sourceLines[headerIndex].trim();
  const lines = sourceLines.slice(headerIndex);
  const headerColumn = Math.max(0, sourceLines[headerIndex].search(/\S/));
  const headerOffset = sourceLines
    .slice(0, headerIndex)
    .reduce((offset, line) => offset + line.length + 1, 0) + headerColumn;

  // Detect diagram type
  const diagramType = detectDiagramType(firstLine);

  if (!diagramType) {
    // Check if it's an unsupported type
    const unsupportedType = detectUnsupportedType(firstLine);
    if (unsupportedType) {
      return finishParse([
        parseDiagnostic({
          severity: 'error',
          code: 'mermaid.diagram.unsupported',
          message: `Unsupported Mermaid diagram type: ${unsupportedType}. Supported types: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, timeline, block-beta, packet-beta, kanban, architecture-beta`,
          position: { line: headerIndex + 1, column: headerColumn, offset: headerOffset },
        }),
      ]);
    }

    return finishParse([
      parseDiagnostic({
        severity: 'error',
        code: 'mermaid.diagram.unparsed',
        message: 'Could not detect Mermaid diagram type. Line must start with a valid diagram keyword.',
        position: { line: headerIndex + 1, column: headerColumn, offset: headerOffset },
      }),
    ]);
  }

  // Parse based on diagram type
  switch (diagramType.type) {
    case 'flowchart':
      return parseFlowchart(lines, diagramType.match, options);
    case 'sequence':
      return parseMermaidSequence(sourceLines, { ...options, headerIndex });
    case 'class':
      return parseClass(sourceLines, headerIndex, options);
    case 'state':
      return parseState(sourceLines, headerIndex, options);
    case 'er':
      return parseER(lines, options);
    case 'timeline':
      return parseTimeline(lines, options);
    case 'block':
      return parseBlock(lines, options);
    case 'packet':
      return parsePacket(lines, options);
    case 'kanban':
      return parseKanban(lines, options);
    case 'architecture':
      return parseArchitecture(lines, options);
    default:
      return finishParse([
        parseDiagnostic({
          severity: 'error',
          code: 'mermaid.diagram.unsupported',
          message: `Parser not implemented for: ${diagramType.type}`,
          position: { line: 1, column: 0, offset: 0 },
        }),
      ]);
  }
}

function detectDiagramType(firstLine: string): { type: string; match: RegExpMatchArray } | null {
  for (const [type, pattern] of Object.entries(DIAGRAM_PATTERNS)) {
    const match = firstLine.match(pattern);
    if (match) {
      return { type, match };
    }
  }
  return null;
}

function detectUnsupportedType(firstLine: string): string | null {
  for (const [keyword, description] of Object.entries(UNSUPPORTED_DIAGRAMS)) {
    if (firstLine.toLowerCase().startsWith(keyword.toLowerCase())) {
      return description;
    }
  }
  return null;
}

// ============================================================================
// Flowchart Parser
// ============================================================================

interface FlowchartContext {
  nodeMap: Map<string, GraphNode>;
  edges: GraphEdge[];
  edgeCounter: number;
  diagnostics: ParseDiagnostic[];
  currentLine: number;
}

function parseFlowchart(
  lines: string[],
  headerMatch: RegExpMatchArray,
  options: MermaidParseOptions
): ParseResult {
  const ctx: FlowchartContext = {
    nodeMap: new Map(),
    edges: [],
    edgeCounter: 0,
    diagnostics: [],
    currentLine: 0,
  };

  const direction = headerMatch[2]?.toUpperCase();
  const layoutOptions: LayoutOptions = {
    direction: directionMap[direction] || 'DOWN',
  };

  let subgraphStack: { id: string; label?: string; nodes: string[] }[] = [];

  for (let i = 1; i < lines.length; i++) {
    ctx.currentLine = i + 1;
    const line = lines[i].trim();

    if (!line || line.startsWith('%%')) continue;

    // Subgraph start
    const subgraphMatch = line.match(/^subgraph\s+(\w+)(?:\s*\[([^\]]+)\])?\s*$/);
    if (subgraphMatch) {
      subgraphStack.push({
        id: subgraphMatch[1],
        label: subgraphMatch[2],
        nodes: [],
      });
      continue;
    }

    // Subgraph end
    if (line === 'end' && subgraphStack.length > 0) {
      const subgraph = subgraphStack.pop()!;
      const groupNode: GraphNode = {
        id: subgraph.id,
        type: 'group',
        label: subgraph.label || subgraph.id,
        children: subgraph.nodes.map(nodeId => {
          const node = ctx.nodeMap.get(nodeId)!;
          node.parent = subgraph.id;
          return node;
        }),
      };
      ctx.nodeMap.set(subgraph.id, groupNode);
      continue;
    }

    // Parse edges or nodes
    const edgeParsed = parseFlowchartEdgeLine(line, ctx);
    if (edgeParsed) {
      if (subgraphStack.length > 0) {
        const current = subgraphStack[subgraphStack.length - 1];
        for (const nodeId of edgeParsed.nodeIds) {
          if (!current.nodes.includes(nodeId)) {
            current.nodes.push(nodeId);
          }
        }
      }
      continue;
    }

    const nodeParsed = parseFlowchartNodeLine(line, ctx);
    if (nodeParsed) {
      if (subgraphStack.length > 0) {
        const current = subgraphStack[subgraphStack.length - 1];
        if (!current.nodes.includes(nodeParsed)) {
          current.nodes.push(nodeParsed);
        }
      }
      continue;
    }

    // Nothing matched. Previously this line was skipped in silence.
    ctx.diagnostics.push(
      parseDiagnostic({
        severity: 'info',
        code: 'mermaid.line.unparsed',
        message: `Line not recognised by the flowchart parser: ${line}`,
        position: { line: ctx.currentLine, column: 0, offset: 0 },
        source: line,
      })
    );
  }

  const nodes: GraphNode[] = [];
  for (const node of ctx.nodeMap.values()) {
    if (!node.parent) nodes.push(node);
  }

  return finishParse(ctx.diagnostics, {
    version: '3.0.0',
    id: options.graphId || 'mermaid-flowchart',
    name: options.graphName,
    nodes,
    edges: ctx.edges,
    layoutOptions,
  });
}

const directionMap: Record<string, LayoutOptions['direction']> = {
  TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT',
};

// Flowchart node shapes: [pattern, nodeType]
const FLOWCHART_SHAPES: [RegExp, string][] = [
  [/^\[\(([^\)]*)\)\]$/, 'database'],   // [(text)]
  [/^\(\[([^\]]*)\]\)$/, 'service'],      // ([text])
  [/^\[\[([^\]]*)\]\]$/, 'module'],       // [[text]]
  [/^\(\(\(([^\)]*)\)\)\)$/, 'actor'],  // (((text)))
  [/^\(\(([^\)]*)\)\)$/, 'service'],      // ((text))
  [/^\(([^\)]*)\)$/, 'service'],           // (text)
  [/^\{([^\}]*)\}$/, 'module'],            // {text}
  [/^\{\{([^\}]*)\}\}$/, 'group'],         // {{text}}
  [/^\[([^\]]*)\]$/, 'service'],           // [text]
  [/^>([^\]]*)\]$/, 'service'],            // >text]
];

function parseFlowchartNodeLine(line: string, ctx: FlowchartContext): string | null {
  const nodePattern = /^(\w+)(.*)$/;
  const match = line.match(nodePattern);
  if (!match) return null;

  const id = match[1];
  const rest = match[2].trim();

  if (!rest || ctx.nodeMap.has(id)) {
    if (!ctx.nodeMap.has(id)) {
      ctx.nodeMap.set(id, { id, type: 'service', label: id });
    }
    return id;
  }

  let type = 'service';
  let label = id;
  let matchedShape = false;

  for (const [pattern, nodeType] of FLOWCHART_SHAPES) {
    const shapeMatch = rest.match(pattern);
    if (shapeMatch) {
      type = nodeType;
      label = shapeMatch[1] || id;
      matchedShape = true;
      break;
    }
  }

  // A bare identifier is a node. Text following it must be a recognised
  // Mermaid shape; otherwise accepting only the first word hides bad output.
  if (rest && !matchedShape) return null;

  ctx.nodeMap.set(id, { id, type, label });
  return id;
}

// Edge patterns for flowchart
const EDGE_ARROWS = [
  { pattern: /-->/,  edge: undefined },
  { pattern: /---/,  edge: { targetEnd: { marker: { kind: 'none' as const, fill: 'unspecified' as const } } } },
  { pattern: /-\.->/, edge: { style: { lineStyle: 'dashed' as const } } },
  { pattern: /==>/,  edge: { style: { lineStyle: 'solid' as const } } },
  { pattern: /--o/,  edge: { targetEnd: { marker: { kind: 'circle' as const, fill: 'unspecified' as const } } } },
  { pattern: /--x/,  edge: { targetEnd: { marker: { kind: 'none' as const, fill: 'unspecified' as const } } } },
  { pattern: /~~~/,  edge: { style: { lineStyle: 'dotted' as const } } },
];

// Node shape patterns for the two-pass tokenizer
const NODE_SHAPE_PATTERNS: [RegExp, string][] = [
  [/^\[\(([^\)]*)\)\]/, 'database'],       // [(text)]
  [/^\(\[([^\]]*)\]\)/, 'stadium'],        // ([text])
  [/^\[\[([^\]]*)\]\]/, 'subroutine'],     // [[text]]
  [/^\(\(\(([^\)]*)\)\)\)/, 'doublecircle'], // (((text)))
  [/^\(\(([^\)]*)\)\)/, 'circle'],          // ((text))
  [/^\(([^\)]*)\)/, 'round'],              // (text)
  [/^\{\{([^\}]*)\}\}/, 'hexagon'],        // {{text}}
  [/^\{([^\}]*)\}/, 'diamond'],            // {text}
  [/^\[([^\]]*)\]/, 'box'],                // [text]
];

function tokenizeNode(text: string): { id: string; consumed: number; label?: string; shape?: string } | null {
  const idMatch = text.match(/^(\w+)/);
  if (!idMatch) return null;

  const id = idMatch[1];
  const afterId = text.slice(id.length);

  for (const [pattern, shape] of NODE_SHAPE_PATTERNS) {
    const shapeMatch = afterId.match(pattern);
    if (shapeMatch) {
      return { id, consumed: id.length + shapeMatch[0].length, label: shapeMatch[1], shape };
    }
  }

  return { id, consumed: id.length };
}

function tokenizeArrow(
  text: string,
): { consumed: number; label?: string; edge?: Pick<GraphEdge, 'style' | 'targetEnd'> } | null {
  const arrowMatch = text.match(/^(-.->|-->|===|==>|---|--o|--x|~~~)/);
  if (!arrowMatch) return null;

  const arrowType = arrowMatch[1];
  let consumed = arrowType.length;

  // Check for edge label: |label text|
  let label: string | undefined;
  const rest = text.slice(consumed);
  const labelMatch = rest.match(/^\|([^|]*)\|/);
  if (labelMatch) {
    label = labelMatch[1];
    consumed += labelMatch[0].length;
  }

  const arrowDef = EDGE_ARROWS.find(a => a.pattern.test(arrowType));
  return { consumed, label, edge: arrowDef?.edge };
}

function parseFlowchartEdgeLine(line: string, ctx: FlowchartContext): { nodeIds: string[] } | null {
  // Two-pass tokenizer: alternate node → arrow → node → arrow → ...
  // Handles chains like: A[label] -->|text| B{shape} -.-> C
  const parts: { id: string; label?: string; shape?: string }[] = [];
  const arrows: { label?: string; edge?: Pick<GraphEdge, 'style' | 'targetEnd'> }[] = [];

  let pos = 0;
  const trimmed = line.trimStart();
  pos = 0;

  // Parse first node
  const firstNode = tokenizeNode(trimmed);
  if (!firstNode) return null;
  parts.push(firstNode);
  pos = firstNode.consumed;

  // Alternate: skip whitespace → arrow → skip whitespace → node
  while (pos < trimmed.length) {
    // Skip whitespace
    while (pos < trimmed.length && /\s/.test(trimmed[pos])) pos++;
    if (pos >= trimmed.length) break;

    const arrow = tokenizeArrow(trimmed.slice(pos));
    if (!arrow) break;
    pos += arrow.consumed;

    // Skip whitespace
    while (pos < trimmed.length && /\s/.test(trimmed[pos])) pos++;
    if (pos >= trimmed.length) break;

    const node = tokenizeNode(trimmed.slice(pos));
    if (!node) break;
    parts.push(node);
    arrows.push({ label: arrow.label, edge: arrow.edge });
    pos += node.consumed;
  }

  if (parts.length < 2 || arrows.length === 0) return null;

  const nodeIds: string[] = [];

  for (const part of parts) {
    nodeIds.push(part.id);
    if (!ctx.nodeMap.has(part.id)) {
      ctx.nodeMap.set(part.id, {
        id: part.id,
        type: shapeToType(part.shape),
        label: part.label || part.id,
      });
    } else if (part.label) {
      const existing = ctx.nodeMap.get(part.id)!;
      existing.label = part.label;
      if (part.shape) existing.type = shapeToType(part.shape);
    }
  }

  for (let i = 0; i < arrows.length && i < parts.length - 1; i++) {
    const sourceId = parts[i].id;
    const targetId = parts[i + 1].id;
    const edge: GraphEdge = {
      id: `edge_${++ctx.edgeCounter}`,
      source: sourceId,
      target: targetId,
    };
    if (arrows[i].label) edge.label = arrows[i].label;
    if (arrows[i].edge) Object.assign(edge, arrows[i].edge);

    ctx.edges.push(edge);
  }

  return { nodeIds };
}

function shapeToType(shape?: string): string {
  switch (shape) {
    case 'database': return 'database';
    case 'doublecircle':
    case 'circle': return 'actor';
    case 'diamond':
    case 'subroutine': return 'module';
    case 'hexagon': return 'group';
    default: return 'service';
  }
}

// ============================================================================
// Class Diagram Parser
// ============================================================================

function parseClass(lines: string[], headerIndex: number, options: MermaidParseOptions): ParseResult {
  return parseMermaidClass(lines, { ...options, headerIndex });
}

// ============================================================================
// State Diagram Parser
// ============================================================================

function parseState(lines: string[], headerIndex: number, options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const diagnostics: ParseDiagnostic[] = [];
  // One entry per open `{`: a composite's id, or null for any other block.
  const blocks: (string | null)[] = [];
  let edgeCounter = 0;
  // Index of an open note block's first line, until its `end note`.
  let noteStart: number | undefined;
  let inAccDescr = false;

  const lineOffsets: number[] = [];
  let nextLineOffset = 0;
  for (const sourceLine of lines) {
    lineOffsets.push(nextLineOffset);
    nextLineOffset += sourceLine.length + 1;
  }
  // Every dropped construct is a warning at its own line and column.
  const warn = (line: number, code: string, message: string, source: string, column?: number) => {
    const raw = lines[line - 1] ?? '';
    const found = raw.indexOf(source);
    const at = column ?? (found >= 0 ? found : Math.max(0, raw.search(/\S/)));
    diagnostics.push(parseDiagnostic({ severity: 'warning', code, message, source,
      position: { line, column: at, offset: (lineOffsets[line - 1] ?? 0) + at } }));
  };
  const ensure = (id: string, type = 'module'): GraphNode => {
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, type, label: id === '_start_' ? 'Start' : id === '_end_' ? 'End' : id };
      nodeMap.set(id, node);
      nodes.push(node);
    }
    return node;
  };
  const style = (line: number, text: string, column?: number) =>
    warn(line, 'mermaid.state.style.unsupported', `Mermaid state styling "${text}" is not preserved`, text, column);

  for (let index = headerIndex + 1; index <= lines.length; index++) {
    if (index === lines.length) {
      // A note block without `end note` is a single-line note: its following
      // lines are statements, not note text, so nothing is skipped silently.
      if (noteStart === undefined) break;
      index = noteStart;
      noteStart = undefined;
      continue;
    }
    const lineNumber = index + 1;
    const raw = lines[index];
    const line = raw.trim();
    const indent = raw.length - raw.trimStart().length;
    if (noteStart !== undefined) {
      if (/^end\s+note$/i.test(line)) noteStart = undefined;
      continue;
    }
    if (inAccDescr) {
      if (line === '}') inAccDescr = false;
      continue;
    }
    if (!line || line.startsWith('%%')) continue;

    // Accessibility title and description are statements, never states.
    const accessibility = line.match(/^(accTitle|accDescr)\s*(:|\{)/);
    if (accessibility) {
      warn(lineNumber, 'mermaid.state.statement.unsupported',
        `Mermaid state statement "${line}" is not recognised and is not preserved`, line);
      if (accessibility[2] === '{' && !line.endsWith('}')) inAccDescr = true;
      continue;
    }

    if (/^direction\s+(TB|BT|LR|RL)$/.test(line)) {
      warn(lineNumber, 'mermaid.state.direction.unsupported', 'Mermaid state direction is not preserved', line);
      continue;
    }
    if (line === '}') {
      blocks.pop();
      continue;
    }
    if (line === '--') {
      warn(lineNumber, 'mermaid.state.concurrency.unsupported',
        'Mermaid concurrent region separator "--" is not preserved; the regions are merged', line);
      continue;
    }
    if (/^(classDef|class|style)\s/.test(line)) {
      style(lineNumber, line);
      continue;
    }

    const note = line.match(/^note\s+(?:left|right)\s+of\s+(\w+)\s*(:.*)?$/);
    if (note) {
      warn(lineNumber, 'mermaid.state.note.unsupported', `Mermaid state note on "${note[1]}" is not preserved`, line);
      if (!note[2]) noteStart = index;
      continue;
    }

    const composite = line.match(/^state\s+(?:"([^"]*)"\s+as\s+)?(\w+)\s*\{$/);
    if (composite) {
      const [, name, id] = composite;
      if (name !== undefined) {
        warn(lineNumber, 'mermaid.state.alias.unsupported',
          `Mermaid state name "${name}" is not preserved; the state is imported as "${id}"`, line);
      }
      warn(lineNumber, 'mermaid.state.composite.unsupported',
        `Mermaid composite state "${id}" is not preserved; its inner states and transitions are imported at the top level`, line);
      ensure(id);
      blocks.push(id);
      continue;
    }

    const pseudostate = line.match(/^state\s+(\w+)\s+<<(choice|fork|join)>>$/);
    if (pseudostate) {
      const [, id, kind] = pseudostate;
      warn(lineNumber, 'mermaid.state.pseudostate.unsupported',
        `Mermaid <<${kind}>> pseudostate "${id}" is imported as a plain state`, line);
      ensure(id);
      continue;
    }

    const alias = line.match(/^state\s+"([^"]*)"\s+as\s+(\w+)$/);
    if (alias) {
      const [, name, id] = alias;
      warn(lineNumber, 'mermaid.state.alias.unsupported',
        `Mermaid state name "${name}" is not preserved; the state is imported as "${id}"`, line);
      ensure(id);
      continue;
    }

    // State declaration with description
    const stateMatch = line.match(/^state\s+"?(\w+)"?(?:\s*:\s*(.+))?$/);
    if (stateMatch) {
      const id = stateMatch[1];
      const description = stateMatch[2];
      const node = ensure(id);
      if (description && node.description === undefined) node.description = description;
      else if (description) {
        warn(lineNumber, 'mermaid.state.description.unsupported',
          `Mermaid state description for "${id}" is not preserved`, line);
      }
      continue;
    }

    // Transition: State1 --> State2 : label, either end optionally styled with :::class
    const transitionMatch = line.match(/^(\[\*\]|\w+)(:::\w+)?\s*-->\s*(\[\*\]|\w+)(:::\w+)?(?:\s*:\s*(.+))?$/);
    if (transitionMatch) {
      const [, source, sourceStyle, target, targetStyle, label] = transitionMatch;
      // Columns come from the transition's own parts, never from searching the label.
      const arrowEnd = line.indexOf('-->') + 3;
      const targetColumn = indent + arrowEnd + (line.length - arrowEnd - line.slice(arrowEnd).trimStart().length);
      const columns = [indent, indent + source.length, targetColumn, targetColumn + target.length];
      const at = (group: number) => columns[group - 1];
      if (sourceStyle) style(lineNumber, sourceStyle, at(2));
      if (targetStyle) style(lineNumber, targetStyle, at(4));
      const owner = [...blocks].reverse().find((block): block is string => block !== null);
      if (owner !== undefined) {
        if (source === '[*]') {
          warn(lineNumber, 'mermaid.state.composite.unsupported',
            `Mermaid [*] inside composite state "${owner}" is merged into the top-level initial state`, '[*]', at(1));
        }
        if (target === '[*]') {
          warn(lineNumber, 'mermaid.state.composite.unsupported',
            `Mermaid [*] inside composite state "${owner}" is merged into the top-level final state`, '[*]', at(3));
        }
      }

      const sourceId = source === '[*]' ? '_start_' : source;
      const targetId = target === '[*]' ? '_end_' : target;
      ensure(sourceId, source === '[*]' ? 'actor' : 'module');
      ensure(targetId, target === '[*]' ? 'actor' : 'module');

      const edge: GraphEdge = {
        id: `trans_${++edgeCounter}`,
        source: sourceId,
        target: targetId,
        type: 'transition',
      };
      if (label) edge.label = label;
      edges.push(edge);
      continue;
    }

    const description = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (description) {
      warn(lineNumber, 'mermaid.state.description.unsupported',
        `Mermaid state description for "${description[1]}" is not preserved`, line);
      ensure(description[1]);
      continue;
    }

    warn(lineNumber, 'mermaid.state.statement.unsupported',
      `Mermaid state statement "${line}" is not recognised and is not preserved`, line);
    // An unrecognised block still owns its closing brace.
    if (line.endsWith('{')) blocks.push(null);
  }

  return finishParse(diagnostics, {
      version: '3.0.0',
      id: options.graphId || 'mermaid-state',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'state' } },
    });
}

// ============================================================================
// ER Diagram Parser
// ============================================================================

function parseER(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  let edgeCounter = 0;
  let currentEntity: GraphNode | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // Entity with attributes block start
    const entityBlockMatch = line.match(/^(\w+)\s*\{$/);
    if (entityBlockMatch) {
      const id = entityBlockMatch[1];
      currentEntity = { id, type: 'database', label: id, properties: { attributes: [] } };
      nodeMap.set(id, currentEntity);
      nodes.push(currentEntity);
      continue;
    }

    // End of entity block
    if (line === '}' && currentEntity) {
      currentEntity = null;
      continue;
    }

    // Attribute inside entity
    if (currentEntity && !line.includes('||') && !line.includes('}')) {
      (currentEntity.properties!.attributes as string[]).push(line);
      continue;
    }

    // Relationship: ENTITY1 ||--o{ ENTITY2 : "label"
    const relMatch = line.match(/^(\w+)\s*(\|o|\|\||o\{|\}\||\|{|}o|o\|)\s*--\s*(\|o|\|\||o\{|\}\||\|{|}o|o\|)\s*(\w+)\s*:\s*"?([^"]+)"?$/);
    if (relMatch) {
      const [, entity1, card1, card2, entity2, label] = relMatch;

      for (const id of [entity1, entity2]) {
        if (!nodeMap.has(id)) {
          const node: GraphNode = { id, type: 'database', label: id };
          nodeMap.set(id, node);
          nodes.push(node);
        }
      }

      const edge: GraphEdge = {
        id: `rel_${++edgeCounter}`,
        source: entity1,
        target: entity2,
        type: 'relationship',
        label,
        properties: {
          sourceCardinality: card1,
          targetCardinality: card2,
        },
      };
      edges.push(edge);
    }
  }

  return finishParse([], {
      version: '3.0.0',
      id: options.graphId || 'mermaid-er',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'er' } },
    });
}

// ============================================================================
// Timeline Parser
// ============================================================================

function parseTimeline(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let nodeCounter = 0;
  let currentSection: GraphNode | null = null;
  let previousPeriod: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // Title
    if (line.startsWith('title ')) continue;

    // Section
    const sectionMatch = line.match(/^section\s+(.+)$/);
    if (sectionMatch) {
      currentSection = {
        id: `section_${++nodeCounter}`,
        type: 'group',
        label: sectionMatch[1],
        children: [],
      };
      nodes.push(currentSection);
      continue;
    }

    // Time period with events
    const periodMatch = line.match(/^([^:]+)\s*:\s*(.+)$/);
    if (periodMatch) {
      const period = periodMatch[1].trim();
      const events = periodMatch[2].split(':').map(e => e.trim());

      const periodNode: GraphNode = {
        id: `period_${++nodeCounter}`,
        type: 'module',
        label: period,
        properties: { events },
      };

      if (currentSection) {
        periodNode.parent = currentSection.id;
        currentSection.children!.push(periodNode);
      } else {
        nodes.push(periodNode);
      }

      if (previousPeriod) {
        edges.push({
          id: `seq_${nodeCounter}`,
          source: previousPeriod,
          target: periodNode.id,
          type: 'sequence',
        });
      }
      previousPeriod = periodNode.id;
    }
  }

  return finishParse([], {
      version: '3.0.0',
      id: options.graphId || 'mermaid-timeline',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'timeline' } },
    });
}

// ============================================================================
// Block Diagram Parser
// ============================================================================

function parseBlock(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  let edgeCounter = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%') || line.startsWith('columns')) continue;

    // Block with edge
    const edgeMatch = line.match(/^(\w+)(?:\["([^"]+)"\])?\s*(-->|---)\s*(?:\|"([^"]+)"\|)?\s*(\w+)(?:\["([^"]+)"\])?$/);
    if (edgeMatch) {
      const [, id1, label1, arrow, edgeLabel, id2, label2] = edgeMatch;

      for (const [id, label] of [[id1, label1], [id2, label2]]) {
        if (!nodeMap.has(id as string)) {
          const node: GraphNode = { id: id as string, type: 'service', label: (label || id) as string };
          nodeMap.set(id as string, node);
          nodes.push(node);
        }
      }

      const edge: GraphEdge = {
        id: `edge_${++edgeCounter}`,
        source: id1,
        target: id2,
      };
      if (edgeLabel) edge.label = edgeLabel;
      if (arrow === '---') edge.targetEnd = { marker: { kind: 'none', fill: 'unspecified' } };
      edges.push(edge);
      continue;
    }

    // Simple block
    const blockMatch = line.match(/^(\w+)(?:\["([^"]+)"\])?(?::(\d+))?$/);
    if (blockMatch) {
      const [, id, label, span] = blockMatch;
      if (!nodeMap.has(id)) {
        const node: GraphNode = { id, type: 'service', label: label || id };
        if (span) node.properties = { columnSpan: parseInt(span) };
        nodeMap.set(id, node);
        nodes.push(node);
      }
    }
  }

  return finishParse([], {
      version: '3.0.0',
      id: options.graphId || 'mermaid-block',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'block' } },
    });
}

// ============================================================================
// Packet Diagram Parser
// ============================================================================

function parsePacket(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  let fieldCounter = 0;
  let currentBit = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // Range syntax: 0-15: "Header"
    const rangeMatch = line.match(/^(\d+)-(\d+)\s*:\s*"([^"]+)"$/);
    if (rangeMatch) {
      const [, start, end, label] = rangeMatch;
      const node: GraphNode = {
        id: `field_${++fieldCounter}`,
        type: 'module',
        label,
        properties: {
          bitStart: parseInt(start),
          bitEnd: parseInt(end),
          bitWidth: parseInt(end) - parseInt(start) + 1,
        },
      };
      nodes.push(node);
      continue;
    }

    // Relative syntax: +8: "Field"
    const relativeMatch = line.match(/^\+(\d+)\s*:\s*"([^"]+)"$/);
    if (relativeMatch) {
      const [, width, label] = relativeMatch;
      const bitWidth = parseInt(width);
      const node: GraphNode = {
        id: `field_${++fieldCounter}`,
        type: 'module',
        label,
        properties: {
          bitStart: currentBit,
          bitEnd: currentBit + bitWidth - 1,
          bitWidth,
        },
      };
      nodes.push(node);
      currentBit += bitWidth;
    }
  }

  return finishParse([], {
      version: '3.0.0',
      id: options.graphId || 'mermaid-packet',
      name: options.graphName,
      nodes,
      edges: [],
      metadata: { custom: { diagramType: 'packet' } },
    });
}

// ============================================================================
// Kanban Parser
// ============================================================================

function parseKanban(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  let currentColumn: GraphNode | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    const indent = line.search(/\S/);

    // Column (less indented than tasks)
    const columnMatch = trimmed.match(/^(\w+)\[([^\]]+)\]$/);
    if (columnMatch && indent <= 4) {
      currentColumn = {
        id: columnMatch[1],
        type: 'group',
        label: columnMatch[2],
        children: [],
      };
      nodes.push(currentColumn);
      continue;
    }

    // Task (more indented than column)
    const taskMatch = trimmed.match(/^(\w+)\[([^\]]+)\](?:@\{([^}]+)\})?$/);
    if (taskMatch && currentColumn && indent > 4) {
      const [, id, label, metaStr] = taskMatch;
      const task: GraphNode = {
        id,
        type: 'service',
        label,
        parent: currentColumn.id,
      };

      if (metaStr) {
        const metadata: Record<string, string> = {};
        const pairs = metaStr.split(',');
        for (const pair of pairs) {
          const [key, value] = pair.split(':').map(s => s.trim().replace(/"/g, ''));
          if (key && value) metadata[key] = value;
        }
        task.properties = { metadata };
      }

      currentColumn.children!.push(task);
    }
  }

  return finishParse([], {
      version: '3.0.0',
      id: options.graphId || 'mermaid-kanban',
      name: options.graphName,
      nodes,
      edges: [],
      metadata: { custom: { diagramType: 'kanban' } },
    });
}

// ============================================================================
// Architecture Diagram Parser
// ============================================================================

function parseArchitecture(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  let edgeCounter = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // Group: group id(icon)[title] in parent
    const groupMatch = line.match(/^group\s+(\w+)(?:\(([^)]*)\))?\[([^\]]+)\](?:\s+in\s+(\w+))?$/);
    if (groupMatch) {
      const [, id, icon, label, parentId] = groupMatch;
      const node: GraphNode = { id, type: 'group', label, children: [] };
      if (icon) node.properties = { icon };
      if (parentId) node.parent = parentId;
      nodeMap.set(id, node);
      if (!parentId) nodes.push(node);
      else {
        const parent = nodeMap.get(parentId);
        if (parent?.children) parent.children.push(node);
      }
      continue;
    }

    // Service: service id(icon)[title] in parent
    const serviceMatch = line.match(/^service\s+(\w+)(?:\(([^)]*)\))?\[([^\]]+)\](?:\s+in\s+(\w+))?$/);
    if (serviceMatch) {
      const [, id, icon, label, parentId] = serviceMatch;
      const node: GraphNode = { id, type: 'service', label };
      if (icon) node.properties = { icon };
      if (parentId) node.parent = parentId;
      nodeMap.set(id, node);
      if (!parentId) nodes.push(node);
      else {
        const parent = nodeMap.get(parentId);
        if (parent?.children) parent.children.push(node);
      }
      continue;
    }

    // Junction: junction id in parent
    const junctionMatch = line.match(/^junction\s+(\w+)(?:\s+in\s+(\w+))?$/);
    if (junctionMatch) {
      const [, id, parentId] = junctionMatch;
      const node: GraphNode = { id, type: 'module', label: id };
      if (parentId) node.parent = parentId;
      nodeMap.set(id, node);
      if (!parentId) nodes.push(node);
      continue;
    }

    // Edge: id:T <--> B:id or id:L --> R:id
    const edgeMatch = line.match(/^(\w+)(?:\{(\w+)\})?:([TBLR])\s*(<)?--?(>)?\s*([TBLR]):(\w+)(?:\{(\w+)\})?$/);
    if (edgeMatch) {
      const [, src, srcGroup, srcSide, leftArrow, rightArrow, tgtSide, tgt, tgtGroup] = edgeMatch;
      const edge: GraphEdge = {
        id: `edge_${++edgeCounter}`,
        source: src,
        target: tgt,
        properties: {
          sourceSide: srcSide,
          targetSide: tgtSide,
          bidirectional: !!leftArrow && !!rightArrow,
        },
      };
      if (srcGroup) edge.properties!.sourceGroup = srcGroup;
      if (tgtGroup) edge.properties!.targetGroup = tgtGroup;
      edges.push(edge);
    }
  }

  return finishParse([], {
      version: '3.0.0',
      id: options.graphId || 'mermaid-architecture',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'architecture' } },
    });
}
