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
  GraphIR,
  GraphNode,
  GraphEdge,
  ParseResult,
  ParseError,
  LayoutOptions,
} from '../types.js';

export interface MermaidParseOptions {
  graphId?: string;
  graphName?: string;
}

// Diagram type detection patterns
const DIAGRAM_PATTERNS: Record<string, RegExp> = {
  flowchart: /^(flowchart|graph)\s+(TB|TD|BT|LR|RL)?/i,
  sequence: /^sequenceDiagram/i,
  class: /^classDiagram/i,
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
  const trimmed = source.trim();

  if (!trimmed) {
    return {
      success: false,
      errors: [{ message: 'Empty input', line: 1, column: 0, offset: 0 }],
    };
  }

  const lines = trimmed.split('\n');
  const firstLine = lines[0].trim();

  // Detect diagram type
  const diagramType = detectDiagramType(firstLine);

  if (!diagramType) {
    // Check if it's an unsupported type
    const unsupportedType = detectUnsupportedType(firstLine);
    if (unsupportedType) {
      return {
        success: false,
        errors: [{
          message: `Unsupported Mermaid diagram type: ${unsupportedType}. Supported types: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, timeline, block-beta, packet-beta, kanban, architecture-beta`,
          line: 1,
          column: 0,
          offset: 0,
        }],
      };
    }

    return {
      success: false,
      errors: [{
        message: 'Could not detect Mermaid diagram type. Line must start with a valid diagram keyword.',
        line: 1,
        column: 0,
        offset: 0,
      }],
    };
  }

  // Parse based on diagram type
  switch (diagramType.type) {
    case 'flowchart':
      return parseFlowchart(lines, diagramType.match, options);
    case 'sequence':
      return parseSequence(lines, options);
    case 'class':
      return parseClass(lines, options);
    case 'state':
      return parseState(lines, options);
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
      return {
        success: false,
        errors: [{ message: `Parser not implemented for: ${diagramType.type}`, line: 1, column: 0, offset: 0 }],
      };
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
  errors: ParseError[];
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
    errors: [],
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
    if (nodeParsed && subgraphStack.length > 0) {
      const current = subgraphStack[subgraphStack.length - 1];
      if (!current.nodes.includes(nodeParsed)) {
        current.nodes.push(nodeParsed);
      }
    }
  }

  const nodes: GraphNode[] = [];
  for (const node of ctx.nodeMap.values()) {
    if (!node.parent) nodes.push(node);
  }

  return {
    success: ctx.errors.length === 0,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-flowchart',
      name: options.graphName,
      nodes,
      edges: ctx.edges,
      layoutOptions,
    },
    errors: ctx.errors,
  };
}

const directionMap: Record<string, LayoutOptions['direction']> = {
  TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT',
};

// Flowchart node shapes
const FLOWCHART_SHAPES: [RegExp, string][] = [
  [/^\[\(([^\)]*)\)\]$/, 'database'],      // [(text)]
  [/^\(\[([^\]]*)\]\)$/, 'service'],       // ([text])
  [/^\[\[([^\]]*)\]\]$/, 'module'],        // [[text]]
  [/^\(\(\(([^\)]*)\)\)\)$/, 'actor'],     // (((text)))
  [/^\(\(([^\)]*)\)\)$/, 'service'],       // ((text))
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

  for (const [pattern, nodeType] of FLOWCHART_SHAPES) {
    const shapeMatch = rest.match(pattern);
    if (shapeMatch) {
      type = nodeType;
      label = shapeMatch[1] || id;
      break;
    }
  }

  ctx.nodeMap.set(id, { id, type, label });
  return id;
}

// Edge patterns for flowchart
const EDGE_ARROWS = [
  { pattern: /-->/,  style: undefined },
  { pattern: /---/,  style: { targetArrow: 'none' as const } },
  { pattern: /-\.->/, style: { lineStyle: 'dashed' as const } },
  { pattern: /==>/,  style: { lineStyle: 'solid' as const } },
  { pattern: /--o/,  style: { targetArrow: 'circle' as const } },
  { pattern: /--x/,  style: { targetArrow: 'none' as const } },
  { pattern: /~~~/,  style: { lineStyle: 'dotted' as const } },
];

function parseFlowchartEdgeLine(line: string, ctx: FlowchartContext): { nodeIds: string[] } | null {
  // Match: A[label] -->|edge label| B[label]
  const edgeRegex = /(\w+)(?:\[\(([^\)]*)\)\]|\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\(\(\(([^\)]*)\)\)\)|\(\(([^\)]*)\)\)|\(([^\)]*)\)|\{([^\}]*)\}|\{\{([^\}]*)\}\}|\[([^\]]*)\])?/g;
  const arrowRegex = /(-->|---|-.->|==>|--o|--x|~~~)(?:\|([^|]*)\|)?/g;

  const parts: { id: string; label?: string; shape?: string }[] = [];
  const arrows: { label?: string; style?: object }[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Extract all nodes and arrows
  const combined = /(\w+)(?:\[\(([^\)]*)\)\]|\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\(\(\(([^\)]*)\)\)\)|\(\(([^\)]*)\)\)|\(([^\)]*)\)|\{\{([^\}]*)\}\}|\{([^\}]*)\}|\[([^\]]*)\])?\s*|(-->|---|-.->|==>|--o|--x|~~~)(?:\|([^|]*)\|)?/g;

  while ((match = combined.exec(line)) !== null) {
    if (match[1]) {
      // Node
      const id = match[1];
      const shapeLabels = [match[2], match[3], match[4], match[5], match[6], match[7], match[8], match[9], match[10]];
      const label = shapeLabels.find(l => l !== undefined);
      let shape: string | undefined;
      if (match[2]) shape = 'database';
      else if (match[3]) shape = 'stadium';
      else if (match[4]) shape = 'subroutine';
      else if (match[5]) shape = 'doublecircle';
      else if (match[6]) shape = 'circle';
      else if (match[7]) shape = 'round';
      else if (match[8]) shape = 'hexagon';
      else if (match[9]) shape = 'diamond';
      else if (match[10]) shape = 'box';

      parts.push({ id, label, shape });
    } else if (match[11]) {
      // Arrow
      const arrowType = match[11];
      const edgeLabel = match[12];
      const arrowDef = EDGE_ARROWS.find(a => a.pattern.test(arrowType));
      arrows.push({ label: edgeLabel, style: arrowDef?.style });
    }
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
    const edge: GraphEdge = {
      id: `edge_${++ctx.edgeCounter}`,
      source: parts[i].id,
      target: parts[i + 1].id,
    };
    if (arrows[i].label) edge.label = arrows[i].label;
    if (arrows[i].style) edge.style = arrows[i].style as GraphEdge['style'];
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
// Sequence Diagram Parser
// ============================================================================

function parseSequence(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  let edgeCounter = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // Participant/Actor declaration
    const participantMatch = line.match(/^(participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i);
    if (participantMatch) {
      const type = participantMatch[1].toLowerCase() === 'actor' ? 'actor' : 'service';
      const id = participantMatch[2];
      const label = participantMatch[3] || id;
      if (!nodeMap.has(id)) {
        const node: GraphNode = { id, type, label };
        nodeMap.set(id, node);
        nodes.push(node);
      }
      continue;
    }

    // Message: A->>B: text or A-->>B: text etc
    const messageMatch = line.match(/^(\w+)\s*(--?>?>|--?>>|<<--?>>?|-x|--x|-\)|--\))\s*(\w+)\s*:\s*(.*)$/);
    if (messageMatch) {
      const [, source, arrow, target, label] = messageMatch;

      // Ensure nodes exist
      for (const id of [source, target]) {
        if (!nodeMap.has(id)) {
          const node: GraphNode = { id, type: 'service', label: id };
          nodeMap.set(id, node);
          nodes.push(node);
        }
      }

      const edge: GraphEdge = {
        id: `msg_${++edgeCounter}`,
        source,
        target,
        label,
        type: 'message',
      };

      // Set style based on arrow
      if (arrow.includes('--')) {
        edge.style = { lineStyle: 'dashed' };
      }
      if (arrow.includes('x')) {
        edge.style = { ...edge.style, targetArrow: 'none' };
      }

      edges.push(edge);
    }
  }

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-sequence',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'sequence' } },
    },
    errors: [],
  };
}

// ============================================================================
// Class Diagram Parser
// ============================================================================

function parseClass(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  let edgeCounter = 0;
  let currentClass: GraphNode | null = null;
  let inClassBody = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // Class with body start
    const classBodyMatch = line.match(/^class\s+(\w+)(?:\["([^"]+)"\])?\s*\{$/);
    if (classBodyMatch) {
      const id = classBodyMatch[1];
      const label = classBodyMatch[2] || id;
      currentClass = { id, type: 'module', label, properties: { members: [] } };
      nodeMap.set(id, currentClass);
      nodes.push(currentClass);
      inClassBody = true;
      continue;
    }

    // End of class body
    if (line === '}' && inClassBody) {
      currentClass = null;
      inClassBody = false;
      continue;
    }

    // Member inside class body
    if (inClassBody && currentClass) {
      (currentClass.properties!.members as string[]).push(line);
      continue;
    }

    // Simple class declaration
    const simpleClassMatch = line.match(/^class\s+(\w+)(?:\["([^"]+)"\])?$/);
    if (simpleClassMatch) {
      const id = simpleClassMatch[1];
      const label = simpleClassMatch[2] || id;
      if (!nodeMap.has(id)) {
        const node: GraphNode = { id, type: 'module', label };
        nodeMap.set(id, node);
        nodes.push(node);
      }
      continue;
    }

    // Relationship: ClassA <|-- ClassB, ClassA *-- ClassB, etc.
    const relationMatch = line.match(/^(\w+)\s*(<\|--|<\|\.\.|\*--|o--|-->|--|\.\.\>|\.\.\|>|\.\.)\s*(\w+)(?:\s*:\s*(.+))?$/);
    if (relationMatch) {
      const [, classA, rel, classB, label] = relationMatch;

      for (const id of [classA, classB]) {
        if (!nodeMap.has(id)) {
          const node: GraphNode = { id, type: 'module', label: id };
          nodeMap.set(id, node);
          nodes.push(node);
        }
      }

      const relTypes: Record<string, string> = {
        '<|--': 'inheritance',
        '<|..': 'realization',
        '*--': 'composition',
        'o--': 'aggregation',
        '-->': 'association',
        '--': 'link',
        '..>': 'dependency',
        '..|>': 'realization',
        '..': 'dashed_link',
      };

      const edge: GraphEdge = {
        id: `rel_${++edgeCounter}`,
        source: classB,
        target: classA,
        type: relTypes[rel] || 'association',
      };
      if (label) edge.label = label;
      if (rel.includes('..')) edge.style = { lineStyle: 'dashed' };
      edges.push(edge);
    }
  }

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-class',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'class' } },
    },
    errors: [],
  };
}

// ============================================================================
// State Diagram Parser
// ============================================================================

function parseState(lines: string[], options: MermaidParseOptions): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  let edgeCounter = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%%') || line.startsWith('direction')) continue;

    // State declaration with description
    const stateMatch = line.match(/^state\s+"?(\w+)"?(?:\s*:\s*(.+))?$/);
    if (stateMatch) {
      const id = stateMatch[1];
      const description = stateMatch[2];
      if (!nodeMap.has(id)) {
        const node: GraphNode = { id, type: 'module', label: id };
        if (description) node.description = description;
        nodeMap.set(id, node);
        nodes.push(node);
      }
      continue;
    }

    // Transition: State1 --> State2 : label
    const transitionMatch = line.match(/^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?$/);
    if (transitionMatch) {
      const [, source, target, label] = transitionMatch;

      const sourceId = source === '[*]' ? '_start_' : source;
      const targetId = target === '[*]' ? '_end_' : target;

      for (const [id, type] of [[sourceId, source === '[*]' ? 'actor' : 'module'], [targetId, target === '[*]' ? 'actor' : 'module']] as const) {
        if (!nodeMap.has(id)) {
          const node: GraphNode = {
            id,
            type: type as string,
            label: id === '_start_' ? 'Start' : id === '_end_' ? 'End' : id,
          };
          nodeMap.set(id, node);
          nodes.push(node);
        }
      }

      const edge: GraphEdge = {
        id: `trans_${++edgeCounter}`,
        source: sourceId,
        target: targetId,
        type: 'transition',
      };
      if (label) edge.label = label;
      edges.push(edge);
    }
  }

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-state',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'state' } },
    },
    errors: [],
  };
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

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-er',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'er' } },
    },
    errors: [],
  };
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

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-timeline',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'timeline' } },
    },
    errors: [],
  };
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
      if (arrow === '---') edge.style = { targetArrow: 'none' };
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

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-block',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'block' } },
    },
    errors: [],
  };
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

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-packet',
      name: options.graphName,
      nodes,
      edges: [],
      metadata: { custom: { diagramType: 'packet' } },
    },
    errors: [],
  };
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

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-kanban',
      name: options.graphName,
      nodes,
      edges: [],
      metadata: { custom: { diagramType: 'kanban' } },
    },
    errors: [],
  };
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

  return {
    success: true,
    graph: {
      version: '1.0.0',
      id: options.graphId || 'mermaid-architecture',
      name: options.graphName,
      nodes,
      edges,
      metadata: { custom: { diagramType: 'architecture' } },
    },
    errors: [],
  };
}
