/**
 * PlantUML importer (R-020).
 *
 * Covers the "typed elements plus arrows, optionally nested" subset —
 * component, deployment and use-case diagrams. Import only.
 *
 * Everything outside that subset is reported rather than silently dropped, and
 * the diagram kinds this cannot represent at all (sequence, class, activity,
 * state, ER, C4 macros) are refused by name instead of producing a confidently
 * empty graph. That is the whole point of the exercise: the previous support
 * was four regexes that turned a sequence diagram into nothing and said
 * nothing about it.
 */

import type { GraphIR, GraphNode, GraphEdge, ParseOptions, ParseResult } from '../types.js';
import { finishParse, parseDiagnostic, type ParseDiagnostic } from '../diagnostics.js';
import { IdAllocator, allocateEdgeId } from '../ids.js';

export type PlantUmlParseOptions = ParseOptions;

/** Element keywords that declare a node, mapped to a Coral node type. */
const ELEMENT_TYPES: Readonly<Record<string, string>> = {
  component: 'service',
  node: 'service',
  rectangle: 'service',
  agent: 'service',
  artifact: 'module',
  file: 'module',
  folder: 'group',
  frame: 'group',
  package: 'group',
  card: 'module',
  cloud: 'external_api',
  database: 'database',
  storage: 'database',
  queue: 'queue',
  stack: 'module',
  collections: 'module',
  actor: 'actor',
  person: 'actor',
  usecase: 'module',
  interface: 'external_api',
  boundary: 'external_api',
  control: 'service',
  entity: 'module',
};

/** Constructs recognised and deliberately not represented. */
const DROPPED_DIRECTIVES: ReadonlyArray<[RegExp, string, string]> = [
  [/^skinparam\b/i, 'plantuml.skinparam.dropped', 'skinparam has no Coral equivalent'],
  [/^!(include|includesub|includeurl)\b/i, 'plantuml.include.dropped', 'include directives are not followed'],
  [/^!(define|definelong|function|procedure|if|else|endif|assume)\b/i, 'plantuml.preprocessor.dropped', 'preprocessor directives are not evaluated'],
  [/^note\b/i, 'plantuml.note.dropped', 'notes are not represented'],
  [/^end\s*note\b/i, 'plantuml.note.dropped', 'notes are not represented'],
  [/^legend\b/i, 'plantuml.legend.dropped', 'legends are not represented'],
  [/^end\s*legend\b/i, 'plantuml.legend.dropped', 'legends are not represented'],
  [/^(hide|show)\b/i, 'plantuml.hide-show.dropped', 'hide/show has no Coral equivalent'],
  [/^scale\b/i, 'plantuml.scale.dropped', 'scale has no Coral equivalent'],
  [/^together\b/i, 'plantuml.together.dropped', 'together grouping is not represented'],
  [/^(header|footer|caption)\b/i, 'plantuml.decoration.dropped', 'headers, footers and captions are not represented'],
];

/** Marker constructs for diagram kinds this importer cannot represent. */
const UNSUPPORTED_MARKERS: ReadonlyArray<[RegExp, string, string]> = [
  [/^@start(mindmap|gantt|json|salt|wbs|yaml|ditaa|math)\b/i, 'plantuml.diagram.unsupported', 'not a UML diagram'],
  [/^(participant|autonumber|activate|deactivate|alt|opt|loop|par|critical|group)\b/i, 'plantuml.sequence.unsupported', 'sequence diagrams are not supported'],
  [/^(class|abstract\s+class|enum|annotation)\s+(?:"[^"]+"|[^\s{]+)/i, 'plantuml.class.unsupported', 'class diagrams are not supported'],
  [/(<\|--|\*--|o--|\.\.\|>)/, 'plantuml.class.unsupported', 'class relationships are not supported'],
  [/^(start|stop|:.*;)\s*$/i, 'plantuml.activity.unsupported', 'activity diagrams are not supported'],
  [/^\[\*\]\s*-->/, 'plantuml.state.unsupported', 'state diagrams are not supported'],
  [/^state\s+(?:"[^"]+"|[^\s{]+)/i, 'plantuml.state.unsupported', 'state diagrams are not supported'],
  [/\|\|--o\{|\}o--\|\||\|\|--\|\|/, 'plantuml.er.unsupported', 'entity-relationship diagrams are not supported'],
  [/^(Container|Component|System|Person|Rel)\s*\(/, 'plantuml.c4.unsupported', 'C4-PlantUML macros are not supported'],
];

interface Ctx {
  diagnostics: ParseDiagnostic[];
  nodeIds: IdAllocator;
  edgeIds: IdAllocator;
  /** Declared id or label to node, so arrows resolve to declarations. */
  byName: Map<string, GraphNode>;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function report(
  ctx: Ctx,
  severity: 'error' | 'warning' | 'info',
  code: string,
  message: string,
  line: number,
  source?: string
): void {
  ctx.diagnostics.push(
    parseDiagnostic({ severity, code, message, position: { line, column: 0, offset: 0 }, source })
  );
}

/** Strip a `<<stereotype>>` wherever it appears and report it. */
function stripStereotype(text: string, ctx: Ctx, line: number): string {
  const match = text.match(/<<\s*([^>]+?)\s*>>/);
  if (!match) return text;
  report(ctx, 'info', 'plantuml.stereotype.dropped', `Stereotype <<${match[1]}>> is not represented`, line, text);
  return text.replace(/\s*<<\s*[^>]+?\s*>>\s*/, ' ').trim();
}

/** Strip a trailing `#colour` and report it. */
function stripColour(text: string, ctx: Ctx, line: number): string {
  const match = text.match(/^(.*?)\s+#[A-Za-z0-9]+\s*$/);
  if (!match) return text;
  report(ctx, 'info', 'plantuml.colour.dropped', 'Element colour is not represented', line, text);
  return match[1].trim();
}

function addNode(ctx: Ctx, type: string, label: string, alias: string | undefined, parent?: GraphNode): GraphNode {
  const existing = alias ? ctx.byName.get(alias) : ctx.byName.get(label);
  if (existing) return existing;

  const id = alias && alias !== '' ? (ctx.nodeIds.reserve(alias) ? alias : ctx.nodeIds.allocateFromLabel(label))
                                   : ctx.nodeIds.allocateFromLabel(label);
  const node: GraphNode = { id, type, label };

  ctx.byName.set(label, node);
  if (alias) ctx.byName.set(alias, node);

  if (parent) {
    node.parent = parent.id;
    (parent.children ??= []).push(node);
  } else {
    ctx.nodes.push(node);
  }
  return node;
}

/** Resolve an arrow endpoint, declaring it if the diagram never did. */
function resolveEndpoint(ctx: Ctx, raw: string): GraphNode {
  const bracketed = raw.match(/^\[(.+)\]$/);
  const colonised = raw.match(/^:(.+):$/);
  const quoted = raw.match(/^"(.+)"$/);
  const name = (bracketed?.[1] ?? colonised?.[1] ?? quoted?.[1] ?? raw).trim();

  const found = ctx.byName.get(name);
  if (found) return found;

  const type = colonised ? 'actor' : 'service';
  return addNode(ctx, type, name, undefined);
}

/**
 * Parse PlantUML source into Graph-IR.
 */
export function parsePlantUml(source: string, options: PlantUmlParseOptions = {}): ParseResult {
  const ctx: Ctx = {
    diagnostics: [],
    nodeIds: new IdAllocator(),
    edgeIds: new IdAllocator(),
    byName: new Map(),
    nodes: [],
    edges: [],
  };

  const lines = source.split('\n');
  const stack: GraphNode[] = [];
  let graphName: string | undefined;
  let inMultilineNote = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("'")) continue;
    if (trimmed.startsWith('/*') || trimmed.startsWith("/'")) continue;

    if (inMultilineNote) {
      if (/^end\s*note\b/i.test(trimmed)) inMultilineNote = false;
      continue;
    }

    // Diagram kinds this importer cannot represent are refused by name.
    let unsupported = false;
    for (const [pattern, code, message] of UNSUPPORTED_MARKERS) {
      if (pattern.test(trimmed)) {
        report(ctx, 'error', code, `${message}: ${trimmed}`, lineNumber, trimmed);
        unsupported = true;
        break;
      }
    }
    if (unsupported) continue;

    if (/^@enduml\b/i.test(trimmed)) continue;
    if (/^@startuml\b/i.test(trimmed)) {
      const named = trimmed.match(/^@startuml\s+(.+)$/i);
      if (named) graphName = named[1].trim();
      continue;
    }

    const title = trimmed.match(/^title\s+(.+)$/i);
    if (title) {
      graphName = title[1].trim();
      continue;
    }

    let dropped = false;
    for (const [pattern, code, message] of DROPPED_DIRECTIVES) {
      if (pattern.test(trimmed)) {
        report(ctx, 'info', code, `${message}: ${trimmed}`, lineNumber, trimmed);
        if (/^note\b/i.test(trimmed) && !/:/.test(trimmed)) inMultilineNote = true;
        dropped = true;
        break;
      }
    }
    if (dropped) continue;

    // Closing a container body.
    if (trimmed === '}') {
      if (stack.length > 0) stack.pop();
      else report(ctx, 'error', 'plantuml.brace.unparsed', 'Unmatched closing brace', lineNumber, trimmed);
      continue;
    }

    const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;

    // Arrow, in any of PlantUML's spellings.
    const arrow = trimmed.match(
      /^(\[[^\]]+\]|:[^:]+:|"[^"]+"|\w+)\s*(<?[-.]+(?:\w+)?[-.]*>?)\s*(\[[^\]]+\]|:[^:]+:|"[^"]+"|\w+)\s*(?::\s*(.+))?$/
    );
    if (arrow && /[-.]/.test(arrow[2]) && arrow[2].length >= 2) {
      const connector = arrow[2];
      const reversed = connector.startsWith('<');
      const from = resolveEndpoint(ctx, reversed ? arrow[3] : arrow[1]);
      const to = resolveEndpoint(ctx, reversed ? arrow[1] : arrow[3]);

      const edge: GraphEdge = {
        id: allocateEdgeId(from.id, to.id, ctx.edgeIds),
        source: from.id,
        target: to.id,
      };
      if (arrow[4]) edge.label = arrow[4].trim();
      if (/\./.test(connector)) edge.style = { lineStyle: 'dotted' };

      const direction = connector.match(/[-.](up|down|left|right|u|d|l|r)[-.]/i);
      if (direction) {
        report(ctx, 'info', 'plantuml.direction.degraded',
          `Arrow direction hint "${direction[1]}" is not represented`, lineNumber, trimmed);
      }
      if (!/>/.test(connector) && !/^</.test(connector)) {
        report(ctx, 'info', 'plantuml.association.degraded',
          'Undirected association is imported as a directed edge', lineNumber, trimmed);
      }

      ctx.edges.push(edge);
      continue;
    }

    // Element declaration, with or without a body.
    const opensBody = trimmed.endsWith('{');
    const body = opensBody ? trimmed.slice(0, -1).trim() : trimmed;
    const cleaned = stripColour(stripStereotype(body, ctx, lineNumber), ctx, lineNumber);

    const declaration = cleaned.match(
      /^(\w+)\s+(?:"([^"]+)"|(\w+))(?:\s+as\s+(?:"([^"]+)"|(\w+)))?$/
    );
    if (declaration && ELEMENT_TYPES[declaration[1].toLowerCase()]) {
      const type = ELEMENT_TYPES[declaration[1].toLowerCase()];
      const firstQuoted = declaration[2];
      const firstBare = declaration[3];
      const secondQuoted = declaration[4];
      const secondBare = declaration[5];
      const reversedLabelOrder = firstBare !== undefined && secondQuoted !== undefined;
      const label = reversedLabelOrder ? secondQuoted : (firstQuoted ?? firstBare);
      const alias = reversedLabelOrder ? firstBare : (secondBare ?? secondQuoted);
      const node = addNode(ctx, type, label, alias, parent);
      if (opensBody) stack.push(node);
      continue;
    }

    // Shorthands: [Component], (Use Case), () "Iface", and :Actor:.
    const shorthand = cleaned.match(
      /^(?:\[([^\]]+)\]|\((?!\))([^\)]+)\)|\(\)\s*"([^"]+)"|:([^:]+):)(?:\s+as\s+(\w+))?$/
    );
    if (shorthand) {
      const label = (shorthand[1] ?? shorthand[2] ?? shorthand[3] ?? shorthand[4]).trim();
      const type = shorthand[4] ? 'actor' : shorthand[3] ? 'external_api' : shorthand[2] ? 'module' : 'service';
      const node = addNode(ctx, type, label, shorthand[5], parent);
      if (opensBody) stack.push(node);
      continue;
    }

    // A bare `container {` with no label.
    if (opensBody && ELEMENT_TYPES[body.toLowerCase()]) {
      const node = addNode(ctx, ELEMENT_TYPES[body.toLowerCase()], body, undefined, parent);
      stack.push(node);
      continue;
    }

    report(ctx, 'info', 'plantuml.line.unparsed', `Line not recognised: ${trimmed}`, lineNumber, trimmed);
  }

  for (let i = 0; i < stack.length; i++) {
    report(ctx, 'error', 'plantuml.brace.unparsed', 'Unclosed brace', lines.length);
  }

  const graph: GraphIR = {
    version: '3.0.0',
    id: options.graphId ?? 'plantuml-graph',
    nodes: ctx.nodes,
    edges: ctx.edges,
  };
  const name = options.graphName ?? graphName;
  if (name) graph.name = name;

  return finishParse(ctx.diagnostics, graph);
}
