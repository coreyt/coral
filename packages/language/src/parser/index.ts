/**
 * Coral DSL Parser
 *
 * Parses Coral DSL text into Graph-IR format.
 */

import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  SpatialConstraint,
  RouteAnchor,
  RouteWaypoint,
  ClassifierCompartment,
  ClassifierKind,
  InteractionActivation,
  InteractionFragment,
  InteractionNote,
  ParseOptions,
  ParseResult,
} from '../types.js';
import { IdAllocator, allocateEdgeId, labelToId } from '../ids.js';
import { BARE_IDENTIFIER, quoteIfNeeded, unescapeString } from '../strings.js';
import { isJsonSafe, isPlainObject, stableJson } from '../structured.js';
import {
  ALIGNMENTS,
  DIRECTIONS,
  LINE_STYLES,
  ROUTINGS,
  isDimensions,
  isEdgeLabelPlacement,
  isGraphMetadata,
  isLayoutOptions,
  isNodeLabelPlacement,
  isNodeLayoutOptions,
  isOneOf,
  isPorts,
  validateRelationshipEnd,
} from '../validators.js';
import { parseStrictJson, type JsonKeyOccurrence } from '../json.js';
// Removed-syntax messages retain their approved historical Language 1.2.0 wording.
import { SPELLINGS } from '../spellings.js';
import {
  COMPACT_BOUND_RULE, COMPACT_END_PART_ORDER, formatCompactEnd, scanEdgePrefix, type EndAnnotation, type EndPart,
} from '../compactEnd.js';
import {
  INVALID,
  Occurrences,
  assign,
  derive,
  type SpellingPair,
  type SpellingToken,
} from '../occurrences.js';
import {
  finishParse,
  parseDiagnostic,
  type ParseDiagnostic,
  type SourcePosition,
  type DiagnosticRelatedLocation,
} from '../diagnostics.js';
import {
  UML_CLASS_NOTATION,
  UML_CLASS_PROFILE,
  classifierFor,
  parseUmlIdentity,
  parseClassifierModifiers,
  parseCoralUmlMember,
  umlSymbolForKind,
  type UmlMemberKind,
} from '../uml.js';
import {
  UML_SEQUENCE_NOTATION,
  UML_SEQUENCE_PROFILE,
  deriveSequenceCore,
  finalizeSequenceInteraction,
  guardId,
  sequenceOrderKeys,
  sortByCanonicalKey,
  operandId,
  validateSequenceInteraction,
} from '../sequence.js';
import { parseConnector028 } from './connector028.js';

/**
 * Parse Coral DSL text into Graph-IR
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  // Saved 0.2.8 source has a different identity and grammar contract. The
  // older graph reader must never return a partial GraphIR 3 projection for
  // it, even when later lines happen to resemble older declarations.
  const savedHeader = /^([ \t]*)@diagram\b/m.exec(source);
  if (savedHeader) {
    const offset = savedHeader.index + savedHeader[1]!.length;
    const prefix = source.slice(0, offset);
    const position = { line: 1 + (prefix.match(/\n/g)?.length ?? 0),
      column: offset - prefix.lastIndexOf('\n') - 1, offset };
    return finishParse([parseDiagnostic({
      severity: 'error', code: 'coral.source.reader.unsupported',
      message: 'Saved @diagram source requires the Coral 0.2.8 document reader.',
      position, range: { start: position,
        end: { ...position, column: position.column + 8, offset: offset + 8 } },
    })]);
  }
  const {
    includeSourceInfo = false,
    graphId = 'coral-graph',
    graphName,
    edition,
  } = options;
  const sourceLines = source.split('\n');
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }

  // Every authored header field is stored on this object through `assign`.
  const graph: GraphIR = { version: '3.0.0', id: graphId, nodes: [], edges: [] };

  // Create context for parsing
  const ctx: ParseContext = {
    graph,
    graphOccurrences: new Occurrences(),
    source,
    sourceLines,
    lineStarts,
    includeSourceInfo,
    edition,
    nodeIds: new IdAllocator(),
    edgeIds: new IdAllocator(),
    nodeIdLines: new Map(),
    edgeIdLines: new Map(),
    diagnostics: [],
    sawDeclaration: false,
    constraints: [],
    constraintIds: new Set(),
    constraintOrdinal: 0,
    references: new WeakMap(),
    sequence: { fragments: [], activations: [], notes: [], lines: new Map() },
  };

  // The portable TypeScript parser is the supported 0.2 runtime. The
  // Tree-sitter grammar is shipped and tested separately for editor tooling.
  const parseResult = parseSource(ctx);

  // The graph is returned even on failure: one bad line must not discard
  // everything that parsed (R-009 AC-8).
  graph.nodes = parseResult.nodes;
  graph.edges = parseResult.edges;
  if (!ctx.graphOccurrences.has('id')) derive(graph, 'id', graphId);

  if (edition === '0.2.8-preview' && graph.metadata?.notation === UML_SEQUENCE_NOTATION) {
    for (const edge of graph.edges) {
      if (edge.type !== 'create' || edge.style?.lineStyle !== 'dashed' ||
        graph.nodes.some((node) => node.id === edge.target) ||
        !graph.nodes.some((node) => node.id === edge.source)) continue;
      if (ctx.nodeIds.reserve(edge.target)) {
        graph.nodes.push({ id: edge.target, type: 'participant', label: edge.target });
      } else {
        report(ctx, 'error', 'coral.sequence.creation.target.invalid',
          `Cannot introduce creation target ${edge.target} because its identity is already claimed`,
          tokenPosition(ctx, ctx.edgeIdLines.get(edge.id) ?? 1, edge.target));
      }
    }
  }

  resolveSemanticReferences(graph, ctx);
  if (ctx.constraints.length > 0) graph.constraints = ctx.constraints;

  if (!ctx.graphOccurrences.has('name') && graphName !== undefined) derive(graph, 'name', graphName);

  if (graph.metadata?.notation === UML_CLASS_NOTATION) graph.profile = UML_CLASS_PROFILE;
  if (graph.metadata?.notation === UML_SEQUENCE_NOTATION) finishSequence(graph, ctx);

  return finishParse(ctx.diagnostics, graph);
}

interface ParseContext {
  /** The graph under construction; header fields are assigned onto it. */
  graph: GraphIR;
  graphOccurrences: Occurrences;
  source: string;
  sourceLines: string[];
  lineStarts: number[];
  includeSourceInfo: boolean;
  edition?: '0.2.8-preview';
  nodeIds: IdAllocator;
  edgeIds: IdAllocator;
  /** The line that took each node or edge id, explicit or derived. */
  nodeIdLines: Map<string, number>;
  edgeIdLines: Map<string, number>;
  diagnostics: ParseDiagnostic[];
  sawDeclaration: boolean;
  constraints: SpatialConstraint[];
  constraintIds: Set<string>;
  constraintOrdinal: number;
  sawGraphHeader?: boolean;
  /** Authored reference spans, independent of optional GraphIR sourceInfo. */
  references: WeakMap<object, Map<string, SpellingToken>>;
  /** UML sequence statements, resolved after the whole document is read. */
  sequence: SequenceParseState;
}

interface SequenceParseState {
  fragments: InteractionFragment[];
  open?: { fragment: InteractionFragment; line: number };
  /** Depth of fragment blocks opened inside an open fragment (reported, then skipped). */
  nestedDepth?: number;
  activations: { participant: string; start: string; end: string; id?: string; line: number }[];
  notes: { text: string; targets: string[]; id?: string; line: number }[];
  /** The source line of each activation, note, and fragment identity. */
  lines: Map<string, number>;
}

const SEQUENCE_ID = '[A-Za-z_]\\w*|"(?:[^"\\\\]|\\\\.)*"';
const SEQUENCE_ACTIVATION = new RegExp(`^activation\\s+(${SEQUENCE_ID})\\s+from\\s+(${SEQUENCE_ID})\\s+to\\s+(${SEQUENCE_ID})(?:\\s+as\\s+(${SEQUENCE_ID}))?$`);
const SEQUENCE_NOTE = new RegExp(`^note\\s+"((?:[^"\\\\]|\\\\.)*)"\\s+on\\s+((?:${SEQUENCE_ID})(?:\\s*,\\s*(?:${SEQUENCE_ID}))*)(?:\\s+as\\s+(${SEQUENCE_ID}))?$`);
const SEQUENCE_FRAGMENT = new RegExp(`^(loop|alt|opt)(?:\\s+"((?:[^"\\\\]|\\\\.)*)")?(?:\\s+as\\s+(${SEQUENCE_ID}))?\\s*\\{$`);
const SEQUENCE_ELSE = /^\}\s*else(?:\s+"((?:[^"\\]|\\.)*)")?\s*\{$/;

function sequenceIdentity(raw: string): string {
  return raw.startsWith('"') ? unescapeString(raw.slice(1, -1)) : raw;
}

function splitSequenceTargets(raw: string): string[] {
  return raw.match(new RegExp(SEQUENCE_ID, 'g'))!.map(sequenceIdentity);
}

/**
 * Handle one line of a `uml-sequence` document that only sequence notation
 * claims: fragment blocks, activations, and notes. Returns true when consumed.
 */
function parseSequenceStatement(ctx: ParseContext, trimmed: string, line: string, lineNumber: number): boolean {
  const state = ctx.sequence;
  const error = (code: string, message: string) =>
    report(ctx, 'error', code, message, tokenPosition(ctx, lineNumber, trimmed), line, trimmed);

  // Inside a refused nested or 0.2.7 block, consume its structure silently:
  // the block was reported once and its messages stay with the outer operand.
  if (state.nestedDepth) {
    if (trimmed === '}') { state.nestedDepth--; return true; }
    if (SEQUENCE_ELSE.test(trimmed)) return true;
    if (SEQUENCE_FRAGMENT.test(trimmed)) { state.nestedDepth++; return true; }
  }

  const head = trimmed.match(SEQUENCE_FRAGMENT);
  if (head) {
    ctx.sawDeclaration = true;
    if (state.open) {
      error('coral.sequence.fragment.nested.unsupported', 'Sequence fragments cannot be nested in Coral 0.2.6');
      state.nestedDepth = (state.nestedDepth ?? 0) + 1;
      return true;
    }
    const guard = head[2] === undefined ? undefined : unescapeString(head[2]);
    if (guard === '') error('coral.sequence.statement.invalid', 'A fragment guard must not be empty');
    const id = head[3] === undefined ? `fragment-${state.fragments.length + 1}` : sequenceIdentity(head[3]);
    const fragment: InteractionFragment = {
      id, kind: head[1] as InteractionFragment['kind'],
      operands: [{ id: operandId(id, 0), ...(guard ? { guard: { id: guardId(id, 0), text: guard } } : {}), messageIds: [] }],
    };
    state.fragments.push(fragment);
    state.lines.set(`fragment:${id}`, lineNumber);
    state.open = { fragment, line: lineNumber };
    return true;
  }

  const other = trimmed.match(SEQUENCE_ELSE);
  if (other) {
    if (!state.open) {
      error('coral.sequence.fragment.unparsed', 'An else operand must continue an open alt fragment');
      return true;
    }
    const fragment = state.open.fragment;
    if (fragment.kind !== 'alt') {
      error('coral.sequence.fragment.invalid', `A ${fragment.kind} fragment has exactly one operand; only alt accepts else`);
      return true;
    }
    const guard = other[1] === undefined ? undefined : unescapeString(other[1]);
    if (guard === '') error('coral.sequence.statement.invalid', 'A fragment guard must not be empty');
    const index = fragment.operands.length;
    fragment.operands.push({
      id: operandId(fragment.id, index),
      ...(guard ? { guard: { id: guardId(fragment.id, index), text: guard } } : {}),
      messageIds: [],
    });
    return true;
  }

  if (trimmed === '}' && state.open) {
    state.open = undefined;
    return true;
  }

  if (/^(?:par|critical|break|rect|box|group)\b.*\{$/.test(trimmed) || trimmed === 'autonumber') {
    ctx.sawDeclaration = true;
    error('coral.sequence.construct.unsupported', `${trimmed.split(/\s/)[0]} is 0.2.7 interaction work, not part of the 0.2.6 sequence subset`);
    if (trimmed.endsWith('{')) state.nestedDepth = (state.nestedDepth ?? 0) + 1;
    return true;
  }

  // Statements are recognized by their whole shape (DR70-D5): a message line
  // whose source is named `note` or `activation` contains an unquoted `->`.
  const keyword = syntaxAnchor(trimmed, '->') < 0 ? trimmed.match(/^(activation|note)\b/)?.[1] : undefined;
  if (keyword) {
    ctx.sawDeclaration = true;
    if (state.open) {
      error('coral.sequence.statement.misplaced.invalid', `An ${keyword} statement belongs at top level, not inside a fragment`);
      return true;
    }
    if (keyword === 'activation') {
      const match = trimmed.match(SEQUENCE_ACTIVATION);
      if (!match) {
        error('coral.sequence.statement.invalid', 'Activation must use: activation <participant> from <message> to <message> [as id]');
        return true;
      }
      state.activations.push({
        participant: sequenceIdentity(match[1]), start: sequenceIdentity(match[2]), end: sequenceIdentity(match[3]),
        ...(match[4] !== undefined ? { id: sequenceIdentity(match[4]) } : {}), line: lineNumber,
      });
      return true;
    }
    const match = trimmed.match(SEQUENCE_NOTE);
    if (!match) {
      error('coral.sequence.statement.invalid', 'Note must use: note "text" on <target>[, <target>…] [as id]');
      return true;
    }
    state.notes.push({
      text: unescapeString(match[1]), targets: splitSequenceTargets(match[2]),
      ...(match[3] !== undefined ? { id: sequenceIdentity(match[3]) } : {}), line: lineNumber,
    });
    return true;
  }
  return false;
}

/** Resolve sequence references and derive the profile and interaction (R-060). */
function finishSequence(graph: GraphIR, ctx: ParseContext): void {
  const state = ctx.sequence;
  const lineOf = new Map<string, number>();
  const reportLine = (code: string, message: string, lineNumber: number) => {
    const raw = ctx.sourceLines[lineNumber - 1] ?? '';
    report(ctx, 'error', code, message, tokenPosition(ctx, lineNumber, raw.trim()), raw, raw.trim());
  };
  if (state.open) {
    reportLine('coral.sequence.fragment.unparsed', `Unclosed ${state.open.fragment.kind} fragment`, state.open.line);
  }
  const participantIds = new Set(graph.nodes.map((node) => node.id));
  const messageIds = new Set(graph.edges.map((edge) => edge.id));

  const statementLine = new WeakMap<object, number>();
  const activations: (Omit<InteractionActivation, 'id'> & { id?: string })[] = [];
  for (const raw of state.activations) {
    if (!participantIds.has(raw.participant) || !messageIds.has(raw.start) || !messageIds.has(raw.end)) {
      reportLine('coral.sequence.reference.unresolved.invalid', 'Activation references a missing participant or message', raw.line);
      continue;
    }
    const activation = { ...(raw.id !== undefined ? { id: raw.id } : {}), participantId: raw.participant, startMessageId: raw.start, endMessageId: raw.end };
    statementLine.set(activation, raw.line);
    activations.push(activation);
  }

  const notes: (Omit<InteractionNote, 'id'> & { id?: string })[] = [];
  state.notes.forEach((raw) => {
    const participants: string[] = [];
    const messages: string[] = [];
    for (const target of raw.targets) {
      const isParticipant = participantIds.has(target);
      const isMessage = messageIds.has(target);
      if (isParticipant && isMessage) {
        reportLine('coral.sequence.reference.ambiguous.invalid', `Note target "${target}" names both a participant and a message`, raw.line);
        return;
      }
      if (!isParticipant && !isMessage) {
        reportLine('coral.sequence.reference.unresolved.invalid', `Note target "${target}" is not a participant or message`, raw.line);
        return;
      }
      (isParticipant ? participants : messages).push(target);
    }
    const note = {
      ...(raw.id !== undefined ? { id: raw.id } : {}), text: raw.text,
      ...(participants.length ? { participantIds: participants } : {}),
      ...(messages.length ? { messageIds: messages } : {}),
    };
    statementLine.set(note, raw.line);
    notes.push(note);
  });

  graph.profile = UML_SEQUENCE_PROFILE;
  const core = deriveSequenceCore(graph.nodes, graph.edges);
  if (ctx.edition === '0.2.8-preview') {
    // The operator, not a conflicting explicit type, supplies the message's
    // appearance/kind. A well-formed disagreement belongs to U2.
    const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
    core.messages = core.messages.map((message) => {
      const edge = edges.get(message.edgeId)!;
      const kind = edge.style?.lineStyle === 'dashed'
        ? edge.type === 'create' ? 'create' as const : 'return' as const
        : edge.targetEnd?.marker?.kind === 'triangle' && edge.targetEnd.marker.fill === 'filled'
          ? 'synchronous' as const : 'asynchronous' as const;
      return { ...message, kind };
    });
  }
  graph.interaction = finalizeSequenceInteraction({
    ...core,
    activations, fragments: state.fragments, notes,
  });
  // finalize copies entries, so map their lines by position in the key-sorted input.
  const keys = sequenceOrderKeys(graph.interaction);
  sortByCanonicalKey(activations, (value) => keys.activation(value as InteractionActivation)).forEach((value, index) => {
    const id = value.id ?? `activation-${index + 1}`;
    lineOf.set(`activation:${id}`, statementLine.get(value)!);
  });
  sortByCanonicalKey(notes, (value) => keys.note(value as InteractionNote)).forEach((value, index) => {
    const id = value.id ?? `note-${index + 1}`;
    lineOf.set(`note:${id}`, statementLine.get(value)!);
  });

  for (const [key, line] of state.lines) lineOf.set(key, line);
  const reported = new Set<string>();
  for (const issue of validateSequenceInteraction(graph)) {
    const { kind, id } = issue.entity;
    // An unresolved message endpoint is already coral.reference.unresolved.invalid.
    if (kind === 'edge' && issue.code === 'coral.sequence.reference.unresolved.invalid') continue;
    const line = kind === 'node' ? ctx.nodeIdLines.get(id)
      : kind === 'edge' ? ctx.edgeIdLines.get(id)
        : kind === 'graph' ? undefined : lineOf.get(`${kind}:${id}`);
    const key = `${issue.code}|${kind}|${id}`;
    if (reported.has(key)) continue;
    reported.add(key);
    reportLine(issue.code, issue.message, line ?? 1);
  }
}

function retainReference(ctx: ParseContext, owner: object, field: string, token: SpellingToken): void {
  let fields = ctx.references.get(owner);
  if (!fields) ctx.references.set(owner, fields = new Map());
  fields.set(field, token);
}

/** Record a diagnostic on the context. */
function report(
  ctx: ParseContext,
  severity: 'error',
  code: string,
  message: string,
  position: SourcePosition,
  source?: string,
  rangeSource: string = source ?? '',
): void {
  const rawLine = ctx.sourceLines[position.line - 1] ?? '';
  const lineStart = ctx.lineStarts[position.line - 1] ?? 0;
  const normalizedPosition = {
    line: position.line,
    column: Math.min(Math.max(0, position.column), rawLine.length),
    offset: lineStart + Math.min(Math.max(0, position.column), rawLine.length),
  };
  const matches: number[] = [];
  if (rangeSource && !rangeSource.includes('\n')) {
    for (let from = 0; from <= rawLine.length - rangeSource.length;) {
      const found = rawLine.indexOf(rangeSource, from);
      if (found < 0) break;
      matches.push(found);
      from = found + Math.max(1, rangeSource.length);
    }
  }
  const exactColumn = matches.includes(normalizedPosition.column)
    ? normalizedPosition.column
    : matches.length === 1 ? matches[0] : undefined;
  const start = exactColumn === undefined ? normalizedPosition : {
    line: position.line,
    column: exactColumn,
    offset: lineStart + exactColumn,
  };
  ctx.diagnostics.push(parseDiagnostic({
    severity,
    code,
    message,
    position: start,
    source,
    ...(exactColumn !== undefined ? { range: {
      start,
      end: {
        line: position.line,
        column: exactColumn + rangeSource.length,
        offset: lineStart + exactColumn + rangeSource.length,
      },
    } } : {}),
  }));
}

function tokenPosition(
  ctx: ParseContext,
  lineNumber: number,
  token: string,
  after?: string,
): SourcePosition {
  const rawLine = ctx.sourceLines[lineNumber - 1] ?? '';
  const anchor = after ? syntaxAnchor(rawLine, after) : -1;
  const found = rawLine.indexOf(token, anchor >= 0 ? anchor + (after?.length ?? 0) : 0);
  const column = Math.max(0, found);
  const lineStart = ctx.lineStarts[lineNumber - 1] ?? 0;
  return { line: lineNumber, column, offset: lineStart + column };
}

function syntaxAnchor(line: string, needle: string): number {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index <= line.length - needle.length; index++) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && line.startsWith(needle, index)) return index;
  }
  return -1;
}

/** Find a clause's words outside strings, accepting arbitrary horizontal space. */
function findUnquotedWords(line: string, words: readonly string[]): { start: number; end: number } | undefined {
  const pattern = new RegExp(`^${words.join('\\s+')}\\b`);
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (quoted && line[i] === '\\') { i++; continue; }
    if (line[i] === '"') { quoted = !quoted; continue; }
    if (!quoted && (i === 0 || /\s/.test(line[i - 1]))) {
      const match = pattern.exec(line.slice(i));
      if (match) return { start: i, end: i + match[0].length };
    }
  }
  return undefined;
}

/** A spelling's token at an exact column of a raw source line. */
function tokenAt(lineNumber: number, column: number, text: string): SpellingToken {
  return { line: lineNumber, column, text };
}

/** Column of `needle` in the raw line, searching after the first unquoted `after`. */
function rawColumn(ctx: ParseContext, lineNumber: number, needle: string, after?: string): number {
  const rawLine = ctx.sourceLines[lineNumber - 1] ?? '';
  const anchor = after ? syntaxAnchor(rawLine, after) : -1;
  const found = rawLine.indexOf(needle, anchor >= 0 ? anchor + (after?.length ?? 0) : 0);
  return found < 0 ? Math.max(0, rawLine.indexOf(needle)) : found;
}

/** Report an error ranged on one spelling token. */
function tokenLocation(ctx: ParseContext, token: SpellingToken) {
  const lineStart = ctx.lineStarts[token.line - 1] ?? 0;
  const position = { line: token.line, column: token.column, offset: lineStart + token.column };
  return { position, range: { start: position, end: { line: token.line, column: token.column + token.text.length, offset: position.offset + token.text.length } } };
}

function reportAt(ctx: ParseContext, code: string, message: string, token: SpellingToken, related?: readonly DiagnosticRelatedLocation[]): void {
  ctx.diagnostics.push(parseDiagnostic({ severity: 'error', code, message, ...tokenLocation(ctx, token),
    source: token.text, ...(related ? { related } : {}) }));
}

function fieldName(path: string): string {
  if (path.startsWith('properties.')) return `property "${path.slice('properties.'.length)}"`;
  if (path === 'style.lineStyle') return 'line style';
  if (path === 'style.routing') return 'routing';
  return path;
}

function spellingName(spelling: string, path: string): string {
  const separator = spelling.indexOf(':');
  const form = spelling.slice(0, separator);
  const name = spelling.slice(separator + 1);
  if (form === 'attribute') {
    return `[${name === '*' ? path.slice('properties.'.length) : name}: …]`;
  }
  if (form === 'parameter') return `[${name}: …]`;
  if (form === 'data') return `data "${name}"`;
  if (form === 'header') return `@graph "${name}"`;
  if (form === 'prefix') return `"${name}"`;
  if (form === 'body') return 'this body';
  if (spelling === 'token:line-style') return 'a line-style token';
  if (spelling === 'token:strength') return 'a strength flag';
  if (spelling === 'token:relation') return 'the relation token';
  return `the ${name} clause`;
}

/**
 * One primary per object/path, with later occurrences as related locations.
 */
function reportDuplicateFields(
  ctx: ParseContext,
  kind: 'node' | 'edge' | 'constraint',
  occurrences: Occurrences,
): void {
  const subject = kind[0].toUpperCase() + kind.slice(1);
  for (const group of occurrences.duplicates()) {
    const [first, ...later] = group;
    const field = `${subject} ${fieldName(first.path)}`;
    const forms = [...new Set(group.map(item => spellingName(item.spelling, first.path)))];
    const guidance = first.path === 'strength' && group.some(item => item.spelling === 'prefix:require')
      ? `remove [${group.find(item => item.spelling === 'token:strength')?.token.text ?? 'preferred'}] or use constraint id: syntax`
      : first.path === 'sourceEnd' || first.path === 'targetEnd'
        // A whole-end collision (FIX-1 D52-1): never merge parts across spellings.
        ? 'write the whole end in one spelling: one compact annotation, or whole-end data only when the compact form cannot express it'
        : 'state it once';
    reportAt(ctx, `coral.${kind}.field.duplicate`, `${field} is given more than once by ${forms.join(' and ')}; ${guidance}`, first.token,
      later.map(item => ({ message: `${field} repeated by ${spellingName(item.spelling, item.path)}`, ...tokenLocation(ctx, item.token) })));
  }
}

/** A strict JSON object read from one source line. */
interface SourceJson {
  value: Record<string, unknown>;
  /** The token of the first occurrence of a key path. */
  token(segments: readonly (string | number)[]): SpellingToken;
}

/**
 * Read a JSON object with duplicate-key detection (R-063 AC-5). Duplicate keys
 * form one diagnostic with related occurrences; the first value is kept.
 */
function readSourceJson(
  ctx: ParseContext,
  raw: string,
  lineNumber: number,
  column: number,
  where: string,
): SourceJson | 'syntax' | 'depth' {
  const parsed = parseStrictJson(raw);
  if (!parsed.ok) return parsed.reason;
  if (!isPlainObject(parsed.value)) return 'syntax';
  reportJsonDuplicates(ctx, parsed.duplicates, raw, lineNumber, column, where);
  const pathKey = (segments: readonly (string | number)[]) => JSON.stringify(segments);
  const firstKeys = new Map<string, JsonKeyOccurrence>();
  for (const key of parsed.keys) {
    const encoded = pathKey(key.segments);
    if (!firstKeys.has(encoded)) firstKeys.set(encoded, key);
  }
  return {
    value: parsed.value,
    token(segments: readonly (string | number)[]): SpellingToken {
      const key = firstKeys.get(pathKey(segments));
      return key ? tokenAt(lineNumber, column + key.start, raw.slice(key.start, key.end)) : tokenAt(lineNumber, column, raw);
    },
  };
}

function reportJsonDuplicates(
  ctx: ParseContext,
  groups: readonly JsonKeyOccurrence[][],
  raw: string,
  lineNumber: number,
  column: number,
  where: string,
): void {
  for (const group of groups) {
    const [first, ...later] = group;
    const token = (item: JsonKeyOccurrence) => tokenAt(lineNumber, column + item.start, raw.slice(item.start, item.end));
    reportAt(ctx, 'coral.json.key.duplicate', `JSON key "${first.key}" appears more than once in ${where}; keep one`, token(first),
      later.map(item => ({ message: `Repeated JSON key "${item.key}"`, ...tokenLocation(ctx, token(item)) })));
  }
}

interface InternalParseResult {
  success: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function exactLineRange(ctx: ParseContext, line: string, lineStart: number, lineNumber: number) {
  const rawLineEnd = ctx.source.indexOf('\n', lineStart);
  const rawLine = ctx.source.slice(lineStart, rawLineEnd < 0 ? ctx.source.length : rawLineEnd);
  const column = rawLine.indexOf(line);
  const startColumn = column < 0 ? 0 : column;
  return {
    start: lineStart + startColumn,
    end: lineStart + startColumn + line.length,
    startPosition: { line: lineNumber, column: startColumn },
    endPosition: { line: lineNumber, column: startColumn + line.length },
  };
}

/** Lexical whitespace is ASCII space or tab; other separators are never syntax. */
const INVALID_SPACING = /[\p{White_Space}\p{Default_Ignorable_Code_Point}\ufeff]/u;

/** Braces on a rejected line still bound recovery; quoted text and comments do not. */
function rejectedLineBraceDelta028(line: string): number {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < line.length; index++) {
    const ch = line[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '/' && line[index + 1] === '/') break;
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth;
}

const REJECTED_CLOSE028 = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}\ufeff]*\}[\p{White_Space}\p{Default_Ignorable_Code_Point}\ufeff]*$/u;

function rejectInvalidSpacing(ctx: ParseContext, line: string, lineNumber: number): boolean {
  let quote: '"' | "'" | undefined;
  let quoteStart = -1;
  let escaped = false;
  let rejected = false;
  const lineStart = ctx.lineStarts[lineNumber - 1];

  for (let column = 0; column < line.length; column++) {
    const character = String.fromCodePoint(line.codePointAt(column)!);
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) { quote = undefined; quoteStart = -1; }
      continue;
    }
    if (character === '/' && line[column + 1] === '/') break;
    if (character === '"' || character === "'") {
      quote = character;
      quoteStart = column;
      continue;
    }
    if (character === ' ' || character === '\t') continue;
    if (character === '\r' && column === line.length - 1 && ctx.source[lineStart + column + 1] === '\n') continue;
    if (!INVALID_SPACING.test(character)) continue;

    const start = { line: lineNumber, column, offset: lineStart + column };
    const end = { line: lineNumber, column: column + character.length, offset: lineStart + column + character.length };
    ctx.diagnostics.push(parseDiagnostic({
      severity: 'error',
      code: 'coral.syntax.spacing.invalid',
      message: 'Only ASCII spaces or tabs may separate Coral syntax',
      position: start,
      range: { start, end },
      source: character,
      hint: 'Replace this separator with an ordinary space or tab.',
    }));
    rejected = true;
    column += character.length - 1;
  }

  if (ctx.edition === '0.2.8-preview' && quote && quoteStart >= 0) {
    reportAt(ctx, 'coral.string.unterminated', 'Quoted text has no matching closing delimiter',
      tokenAt(lineNumber, quoteStart, line.slice(quoteStart)));
    rejected = true;
  }

  return rejected;
}

/**
 * Pure JS parser implementation
 * This is a simplified parser that handles the core Coral DSL syntax
 */
function parseSource(ctx: ParseContext): InternalParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const lines = ctx.sourceLines;
  let currentOffset = 0;
  let lineNumber = 0;

  // Track brace depth for parsing bodies
  const braceStack: { node: GraphNode; indent: number; opened: SourcePosition; occurrences: Occurrences }[] = [];
  let umlCompartment: { node: GraphNode; kind: UmlMemberKind;
    compartment: Exclude<ClassifierCompartment, { kind: 'name' }>;
    reservedIds?: ReadonlySet<string>; nextGenerated?: number } | undefined;
  let rejectedBlockDepth028 = 0;

  const umlError = (code: string, message: string, sourceLine: string, number: number) => report(
    ctx, 'error', code, message, tokenPosition(ctx, number, sourceLine.trim()), sourceLine, sourceLine.trim(),
  );
  const classifierHasIdentity = (node: GraphNode, id: string) => node.classifier?.compartments.some((part) =>
    part.id === id || ('items' in part && part.items.some((item) => item.id === id))) ?? false;
  const closeClassifier = (node: GraphNode, sourceLine: string, number: number) => {
    if (node.classifier?.kind === 'enum' && !node.classifier.compartments.some((part) => part.kind === 'literals')) {
      umlError('coral.uml.compartment.required', 'Enum classifiers require one literals compartment', sourceLine, number);
    }
  };
  const closeBrace = (sourceLine: string, number: number) => {
    if (umlCompartment) { umlCompartment = undefined; return; }
    if (braceStack.length === 0) {
      report(ctx, 'error', 'coral.brace.unparsed', 'Unmatched closing brace',
        { line: number, column: sourceLine.indexOf('}'), offset: currentOffset }, '}');
    }
    const closed = braceStack.pop();
    if (closed) {
      reportDuplicateFields(ctx, 'node', closed.occurrences);
      closeClassifier(closed.node, sourceLine, number);
    }
  };

  for (const line of lines) {
    lineNumber++;
    const invalidSpacing = rejectInvalidSpacing(ctx, line, lineNumber);
    if (ctx.edition === '0.2.8-preview' && rejectedBlockDepth028 > 0) {
      rejectedBlockDepth028 = Math.max(0, rejectedBlockDepth028 + rejectedLineBraceDelta028(line));
      currentOffset += line.length + 1;
      continue;
    }
    if (invalidSpacing) {
      if (ctx.edition === '0.2.8-preview') {
        if (REJECTED_CLOSE028.test(line)) closeBrace(line, lineNumber);
        else rejectedBlockDepth028 = Math.max(0, rejectedLineBraceDelta028(line));
      }
      currentOffset += line.length + 1;
      continue;
    }
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) {
      currentOffset += line.length + 1;
      continue;
    }

    if (trimmed.startsWith('@graph')) {
      parseGraphDirective(trimmed, ctx, currentOffset, lineNumber);
      currentOffset += line.length + 1;
      continue;
    }

    if (ctx.graph.metadata?.notation === UML_SEQUENCE_NOTATION && braceStack.length === 0
        && parseSequenceStatement(ctx, trimmed, line, lineNumber)) {
      currentOffset += line.length + 1;
      continue;
    }

    // Handle closing braces
    if (trimmed === '}') {
      closeBrace(line, lineNumber);
      currentOffset += line.length + 1;
      continue;
    }

    if (/^(?:require\s+|constraint\s+|arrange\s+)/.test(trimmed) ||
      (ctx.edition === '0.2.8-preview' && /^[A-Za-z_][A-Za-z0-9_]*\s+=\s+arrange\s+/.test(trimmed))) {
      ctx.sawDeclaration = true;
      parseConstraintDeclaration(trimmed, ctx, lineNumber);
      currentOffset += line.length + 1;
      continue;
    }

    if (umlCompartment) {
      const items = umlCompartment.compartment.items;
      if (ctx.edition === '0.2.8-preview' && /\s+as\s+/.test(trimmed)) {
        report(ctx, 'error', 'coral.uml.member.identity.unsupported',
          'In the 0.2.8 preview, name a UML member with id =; as is reserved for a rendered label',
          tokenPosition(ctx, lineNumber, 'as'), line, 'as');
        currentOffset += line.length + 1;
        continue;
      }
      const namedMember028 = ctx.edition === '0.2.8-preview' && umlCompartment.kind === 'attributes'
        ? trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+=\s+public\s+attribute\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\S+)$/)
        : null;
      const parsedBase = namedMember028
        ? parseCoralUmlMember(`+ ${namedMember028[2]}: ${namedMember028[3]}`,
          umlCompartment.kind, items.length + 1)
        : parseCoralUmlMember(trimmed, umlCompartment.kind, items.length + 1);
      let generatedId: string | undefined;
      if (ctx.edition === '0.2.8-preview' && !namedMember028 && parsedBase.value?.kind === 'attribute') {
        let ordinal = umlCompartment.nextGenerated ?? 1;
        while (umlCompartment.reservedIds?.has(`attribute_${ordinal}`) ||
          classifierHasIdentity(umlCompartment.node, `attribute_${ordinal}`)) ordinal++;
        generatedId = `attribute_${ordinal}`;
        umlCompartment.nextGenerated = ordinal + 1;
      }
      const parsed = namedMember028 && parsedBase.value
        ? { value: { ...parsedBase.value, id: namedMember028[1] } }
        : generatedId && parsedBase.value
          ? { value: { ...parsedBase.value, id: generatedId } } : parsedBase;
      if (!parsed.value) umlError('coral.uml.member.invalid', parsed.error ?? 'Invalid UML member', line, lineNumber);
      else if (!parsed.value.id || classifierHasIdentity(umlCompartment.node, parsed.value.id)) {
        umlError('coral.uml.member.id.invalid', parsed.value.id
          ? `Classifier identity "${parsed.value.id}" is already used`
          : 'Classifier member id must not be empty', line, lineNumber);
      } else (items as Array<typeof parsed.value>).push(parsed.value);
      currentOffset += line.length + 1;
      continue;
    }

    const currentBody = braceStack[braceStack.length - 1];
    const currentClassifier = currentBody?.node.classifier;
    const compartmentMatch = currentClassifier && (ctx.edition === '0.2.8-preview'
      ? trimmed.match(/^(?:([A-Za-z_][A-Za-z0-9_]*)\s+=\s+)?(attributes|operations|literals)\s*\{$/)
      : trimmed.match(/^(attributes|operations|literals)(?:\s+as\s+([A-Za-z_][\w-]*|"(?:[^"\\]|\\.)*"))?\s*\{$/));
    if (compartmentMatch) {
      const kind = (ctx.edition === '0.2.8-preview' ? compartmentMatch[2] : compartmentMatch[1]) as UmlMemberKind;
      const classifier = currentBody!.node.classifier!;
      const allowed = classifier.kind === 'enum' ? ['literals', 'operations'] : ['attributes', 'operations'];
      if (!allowed.includes(kind)) {
        umlError('coral.uml.compartment.kind.invalid', `${kind} is not valid for ${classifier.kind}`, line, lineNumber);
      } else if (classifier.compartments.some((part) => part.kind === kind)) {
        umlError('coral.uml.compartment.duplicate', `Only one ${kind} compartment is allowed`, line, lineNumber);
      } else {
        const parsedId = ctx.edition === '0.2.8-preview'
          ? { value: compartmentMatch[1] } : parseUmlIdentity(compartmentMatch[2]);
        const id = parsedId.value ?? kind;
        if (parsedId.error) {
          umlError('coral.uml.compartment.id.invalid', parsedId.error, line, lineNumber);
        } else if (!id || classifierHasIdentity(currentBody!.node, id)) {
          umlError('coral.uml.compartment.id.invalid', id
            ? `Classifier identity "${id}" is already used`
            : 'Classifier compartment id must not be empty', line, lineNumber);
        } else {
          const compartment = { id, kind, items: [] } as Exclude<ClassifierCompartment, { kind: 'name' }>;
          classifier.compartments.push(compartment);
          const reservedIds = new Set<string>();
          if (ctx.edition === '0.2.8-preview' && kind === 'attributes') {
            for (const upcoming of lines.slice(lineNumber)) {
              if (upcoming.trim() === '}') break;
              const named = upcoming.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+=\s+public\s+attribute\s+/);
              if (named) reservedIds.add(named[1]);
            }
          }
          umlCompartment = { node: currentBody!.node, kind, compartment,
            ...(ctx.edition === '0.2.8-preview' ? { reservedIds, nextGenerated: 1 } : {}) };
        }
      }
      currentOffset += line.length + 1;
      continue;
    }

    let nodeLine = trimmed;
    let classifierModifiers: ReturnType<typeof parseClassifierModifiers>['value'];
    const modifierMatch = nodeLine.match(/\s+modifiers\s+\{([^{}]*)\}(?=\s*(?:\{|label\s|above\s|below\s|left\s|right\s|at\s|@\s|pinned\s|data\s|$))/);
    if (modifierMatch) {
      const parsed = parseClassifierModifiers(modifierMatch[1]);
      if (!parsed.value) umlError('coral.uml.classifier.modifier.invalid', parsed.error ?? 'Invalid classifier modifiers', line, lineNumber);
      else classifierModifiers = parsed.value;
      nodeLine = `${nodeLine.slice(0, modifierMatch.index)}${nodeLine.slice(modifierMatch.index! + modifierMatch[0].length)}`;
    }

    // Try to parse node declaration
    const legacyNode = ctx.edition === '0.2.8-preview' ? LEGACY_NODE_HEAD028.exec(nodeLine) : null;
    if (legacyNode) {
      reportAt(ctx, 'coral.syntax.legacy-node.unsupported',
        'Use an ID-first declaration; as is only for a quoted rendered label',
        tokenAt(lineNumber, line.indexOf(legacyNode[1]!), legacyNode[1]!));
      rejectedBlockDepth028 = Math.max(0, rejectedLineBraceDelta028(line));
      currentOffset += line.length + 1;
      continue;
    }
    const approvedNode = ctx.edition === '0.2.8-preview'
      ? parseNodeDeclaration028(nodeLine, ctx, currentOffset, lineNumber) : undefined;
    if (approvedNode === null) {
      currentOffset += line.length + 1;
      continue;
    }
    const nodeMatch = approvedNode ?? parseNodeDeclaration(nodeLine, ctx, currentOffset, lineNumber);
    if (nodeMatch && ctx.sequence.open) {
      report(ctx, 'error', 'coral.sequence.statement.misplaced.invalid', 'A participant declaration belongs at top level, not inside a fragment',
        tokenPosition(ctx, lineNumber, trimmed), line, trimmed);
      currentOffset += line.length + 1;
      continue;
    }
    if (nodeMatch) {
      if (ctx.graph.metadata?.notation === UML_CLASS_NOTATION && ['class', 'interface', 'enum'].includes(nodeMatch.type)) {
        if (!nodeMatch.label) umlError('coral.uml.classifier.name.invalid', 'UML classifiers require a quoted name', line, lineNumber);
        else {
          const kind = nodeMatch.type as ClassifierKind;
          if (classifierModifiers?.includes('static') && kind !== 'class') {
            umlError('coral.uml.classifier.modifier.invalid', 'Only a class may use the static classifier modifier', line, lineNumber);
          }
          if (classifierModifiers?.includes('abstract') && kind === 'enum') {
            umlError('coral.uml.classifier.modifier.invalid', 'An enum may not use the abstract classifier modifier', line, lineNumber);
          }
          const expectedSymbol = umlSymbolForKind(kind);
          if (nodeMatch.symbol !== undefined && nodeMatch.symbol !== expectedSymbol) {
            umlError('coral.uml.classifier.symbol.invalid', `A ${kind} classifier must use symbol "${expectedSymbol}"`, line, lineNumber);
          }
          assign(new Occurrences(), nodeMatch, 'classifier', ['GraphNode.classifier', 'clause:classifier'],
            classifierFor(kind, nodeMatch.label, classifierModifiers, false),
            tokenAt(lineNumber, rawColumn(ctx, lineNumber, nodeMatch.type), nodeMatch.type));
          derive(nodeMatch, 'symbol', expectedSymbol);
        }
      } else if (modifierMatch) {
        umlError('coral.uml.classifier.modifier.invalid', 'Classifier modifiers require UML Class notation', line, lineNumber);
      }
      if (currentBody?.node.classifier && nodeMatch.classifier) {
        umlError('coral.uml.classifier.nested.invalid', 'UML classifiers may not be nested inside another classifier', line, lineNumber);
      }
      ctx.sawDeclaration = true;
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
      if (nodeLine.endsWith('{') && !nodeLine.endsWith('{ }') && !nodeLine.endsWith('{}')) {
        braceStack.push({
          node: nodeMatch,
          indent: line.search(/\S/),
          opened: {
            line: lineNumber,
            column: Math.max(line.lastIndexOf('{'), 0),
            offset: currentOffset + Math.max(line.lastIndexOf('{'), 0),
          },
          occurrences: new Occurrences(),
        });
      }

      currentOffset += line.length + 1;
      continue;
    }

    // Try to parse property (inside node body)
    const propertyMatch = parseProperty(trimmed);
    if (propertyMatch && braceStack.length > 0) {
      const body = braceStack[braceStack.length - 1];
      const parent = body.node;
      const column = line.indexOf(trimmed);
      reportJsonDuplicates(ctx, propertyMatch.duplicates, trimmed, lineNumber, column, `property "${propertyMatch.key}"`);
      if (propertyMatch.key.startsWith('_')) {
        reportReservedKey(ctx, 'node', propertyMatch.key, tokenAt(lineNumber, column, propertyMatch.keyToken));
      } else {
        assign(body.occurrences, parent, `properties.${propertyMatch.key}`, ['GraphNode.properties', 'body:*'],
          propertyMatch.value, tokenAt(lineNumber, column, propertyMatch.keyToken));
      }
      currentOffset += line.length + 1;
      continue;
    }

    // Try to parse edge declaration
    const approvedEdge = ctx.edition === '0.2.8-preview'
      ? parseEdgeDeclaration028(trimmed, ctx, currentOffset, lineNumber) : undefined;
    if (approvedEdge === null) {
      currentOffset += line.length + 1;
      continue;
    }
    const edgeMatch = approvedEdge ?? parseEdgeDeclaration(trimmed, ctx, currentOffset, lineNumber);
    if (edgeMatch) {
      ctx.sawDeclaration = true;
      edges.push(edgeMatch);
      const open = ctx.sequence.open;
      if (open) open.fragment.operands[open.fragment.operands.length - 1].messageIds.push(edgeMatch.id);
      currentOffset += line.length + 1;
      continue;
    }

    // Unknown syntax - report error
    report(
      ctx,
      'error',
      'coral.line.unparsed',
      `Unexpected syntax: ${trimmed}`,
      { line: lineNumber, column: 0, offset: currentOffset },
      trimmed
    );

    currentOffset += line.length + 1;
  }

  // Check for unclosed braces
  if (umlCompartment) {
    report(ctx, 'error', 'coral.uml.compartment.unparsed', `Unclosed ${umlCompartment.kind} compartment`,
      { line: lines.length, column: 0, offset: ctx.source.length }, umlCompartment.kind);
  }
  for (const unclosed of braceStack) {
    reportDuplicateFields(ctx, 'node', unclosed.occurrences);
    closeClassifier(unclosed.node, '{', unclosed.opened.line);
    report(ctx, 'error', 'coral.brace.unparsed', 'Unclosed brace', unclosed.opened, '{', '{');
  }

  return {
    success: !ctx.diagnostics.some((d) => d.severity === 'error'),
    nodes,
    edges,
  };
}

function parseGraphDirective(line: string, ctx: ParseContext, _offset: number, lineNumber: number): void {
  if (ctx.sawDeclaration || ctx.sawGraphHeader) {
    report(ctx, 'error', 'coral.graph.unparsed', 'Graph header must appear once before declarations', tokenPosition(ctx, lineNumber, '@graph'), line, '@graph');
    return;
  }
  const raw = line.slice('@graph'.length).trim();
  const json = raw ? readSourceJson(ctx, raw, lineNumber, rawColumn(ctx, lineNumber, raw, '@graph'), 'the @graph header') : 'syntax';
  const value = typeof json === 'string' ? undefined : json.value;
  if (typeof json === 'string' || typeof value?.id !== 'string' || value.id.length === 0) {
    report(ctx, 'error', 'coral.graph.unparsed',
      json === 'depth' ? 'Graph header JSON is nested too deeply' : 'Graph header must be a JSON object with a non-empty string id',
      tokenPosition(ctx, lineNumber, raw || '@graph', raw ? '@graph' : undefined), line, raw || '@graph');
    return;
  }

  ctx.sawGraphHeader = true;
  const graph = ctx.graph;
  const occurrences = ctx.graphOccurrences;
  assign(occurrences, graph, 'id', ['GraphIR.id', 'header:id'], value.id, json.token(['id']));
  const allowed = new Set(['id', 'name', 'metadata', 'layoutOptions']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) reportDataFieldUnsupported(ctx, 'graph', key, json.token([key]));
  }
  if (value.name !== undefined) {
    if (typeof value.name === 'string') assign(occurrences, graph, 'name', ['GraphIR.name', 'header:name'], value.name, json.token(['name']));
    else reportDataFieldInvalid(ctx, 'graph', 'name', 'must be a string', json.token(['name']));
  }
  if (value.metadata !== undefined) {
    if (isGraphMetadata(value.metadata)) {
      assign(occurrences, graph, 'metadata', ['GraphIR.metadata', 'header:metadata'], value.metadata, json.token(['metadata']));
    } else reportDataFieldInvalid(ctx, 'graph', 'metadata', 'has the wrong shape', json.token(['metadata']));
  }
  if (value.layoutOptions !== undefined) {
    const token = json.token(['layoutOptions']);
    if (isPlainObject(value.layoutOptions) && value.layoutOptions.algorithmOptions !== undefined) {
      // Removed (L3): raw engine controls are not portable authored intent.
      reportDataFieldUnsupported(ctx, 'graph', 'layoutOptions.algorithmOptions', json.token(['layoutOptions', 'algorithmOptions']),
        `was removed in Coral Language 1.2.0; remove it`);
    } else if (isLayoutOptions(value.layoutOptions)) {
      assign(occurrences, graph, 'layoutOptions', ['GraphIR.layoutOptions', 'header:layoutOptions'], value.layoutOptions, token);
    } else reportDataFieldInvalid(ctx, 'graph', 'layoutOptions', 'has the wrong shape', token);
  }
}

/** The readable spelling of a field that is not accepted in `data` (Q3). */
const READABLE_SPELLINGS: Record<'graph' | 'node' | 'edge', Record<string, string>> = {
  graph: {},
  node: {
    id: 'write as <id>',
    type: 'write the leading type',
    label: 'write the quoted label after the type',
    position: 'write @ (x, y)',
    pinned: 'write pinned after @ (x, y)',
    labelPlacement: 'write label <side>',
    properties: 'write each property in a body',
    children: 'nest the declarations in a body',
    parent: 'nest the declaration in its parent body',
  },
  edge: {
    id: 'write as <id>',
    source: 'write the endpoints before ->',
    target: 'write the endpoints after ->',
    type: 'write the relation token first in brackets',
    label: 'write [label: "…"]',
    description: `was removed in Coral Language 1.2.0; write [description: "…"]`,
    labelPlacement: 'write label <side>',
    routeIntent: 'write via …',
  },
};

const DATA_WHERE = { graph: 'the @graph header', node: 'node data', edge: 'edge data' } as const;

/**
 * Report a `data` or `@graph` key Coral does not accept there: unknown,
 * readable, or removed (R-063 AC-5). Nothing is stored.
 */
function reportDataFieldUnsupported(
  ctx: ParseContext,
  kind: 'graph' | 'node' | 'edge',
  field: string,
  token: SpellingToken,
  hint = READABLE_SPELLINGS[kind][field],
): void {
  reportAt(ctx, `coral.${kind}.data-field.unsupported`, hint?.startsWith('was removed')
    ? `${field} ${hint}`
    : `${field} is not accepted in ${DATA_WHERE[kind]}${hint ? `; ${hint}` : ''}`, token);
}

/** Report an accepted `data` or `@graph` key whose value has the wrong shape. Nothing is stored. */
function reportDataFieldInvalid(
  ctx: ParseContext,
  kind: 'graph' | 'node' | 'edge',
  field: string,
  reason: string,
  token: SpellingToken,
): void {
  reportAt(ctx, `coral.${kind}.data-field.invalid`, `${field} ${reason}`, token);
}

/** The settled ID-first declaration core, before older extended clauses. */
const LEGACY_NODE_HEAD028 = /^([A-Za-z_][A-Za-z0-9_]*)\s+(?:(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|as\s+[A-Za-z_][A-Za-z0-9_]*)/;

function decodePreviewQuoted(raw: string, ctx: ParseContext, lineNumber: number, column: number): string | undefined {
  const delimiter = raw[0];
  let value = '';
  for (let index = 1; index < raw.length - 1; index++) {
    const character = raw[index]!;
    if (character !== '\\') {
      value += character;
      continue;
    }
    const escaped = raw[index + 1];
    if (escaped === delimiter || escaped === '\\') value += escaped;
    else if (escaped === 'n') value += '\n';
    else {
      const spelling = raw.slice(index, Math.min(index + 2, raw.length));
      reportAt(ctx, 'coral.string.escape.invalid', 'Unknown or unnecessary escape in quoted text',
        tokenAt(lineNumber, column + index, spelling));
      return undefined;
    }
    index++;
  }
  return value;
}

function parseNodeDeclaration028(
  line: string,
  ctx: ParseContext,
  offset: number,
  lineNumber: number,
): GraphNode | null | undefined {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(?:(=)\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?(?:\s*(\{\s*\}|\{))?$/);
  if (!match) return undefined;
  const id = match[1];
  const label = match[4] === undefined ? id : decodePreviewQuoted(match[4], ctx, lineNumber,
    line.lastIndexOf(match[4]));
  if (label === undefined) return null;
  if (!ctx.nodeIds.reserve(id)) {
    report(ctx, 'error', 'coral.node.id.invalid', `Node id "${id}" is already in use`,
      tokenPosition(ctx, lineNumber, id), line, id);
    return null;
  }
  ctx.nodeIdLines.set(id, lineNumber);
  const node: GraphNode = { id, type: match[3], label };
  if (ctx.includeSourceInfo) node.sourceInfo = { range: exactLineRange(ctx, line, offset, lineNumber) };
  return node;
}

function parseNodeDeclaration(
  line: string,
  ctx: ParseContext,
  offset: number,
  lineNumber: number
): GraphNode | null {
  // Match the fixed Language 1 clause order. References remain raw until the
  // complete graph is collected so forward references can resolve.
  const NUM = '-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?';
  const REF = '(?:"((?:[^"\\\\]|\\\\.)*)"|([A-Za-z_][A-Za-z0-9_.-]*))';
  const nodeHead = '^(?:"((?:[^"\\\\]|\\\\.)*)"|([A-Za-z_][\\w-]*))' +
      '(?:\\s+"((?:[^"\\\\]|\\\\.)*)")?' +
      '(?:\\s+as\\s+(?:"((?:[^"\\\\]|\\\\.)*)"|([A-Za-z_][A-Za-z0-9_]*)))?' +
      '(?:\\s+label\\s+(above|below|left|right|center)(?:\\s+offset\\s+(' + NUM + '))?)?';
  const nodeRegex = new RegExp(nodeHead +
      '(?:\\s+(?:(above|below)\\s+' + REF + '|(left|right)\\s+of\\s+' + REF +
        '|at\\s+the\\s+(top|bottom|left|right)(?:\\s+of\\s+' + REF + ')?))?' +
      `(?:\\s*@\\s*\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\))?` +
      '(\\s+pinned)?' +
      '(?:\\s+data\\s+(.+?))?' +
      '(\\s*\\{\\s*\\}|\\s*\\{)?$'
  );
  const match = line.match(nodeRegex);

  if (!match) {
    return null;
  }

  const nodeType = match[1] !== undefined ? unescapeString(match[1]) : match[2];
  if (nodeType.length === 0) {
    report(ctx, 'error', 'coral.node.type.unparsed', 'Node type must not be empty', tokenPosition(ctx, lineNumber, '""'), line, '""');
    return null;
  }
  const label = match[3] === undefined ? undefined : unescapeString(match[3]);
  const explicitId = match[4] !== undefined ? unescapeString(match[4]) : match[5];
  const explicitIdToken = match[4] !== undefined ? `"${match[4]}"` : match[5];
  if (label === undefined && explicitId === undefined) return null;
  const placementSide = match[6] as 'above' | 'below' | 'left' | 'right' | 'center' | undefined;
  const placementOffset = match[7];
  const verticalRelation = match[8] as 'above' | 'below' | undefined;
  const verticalTarget = decodeReference(match[9], match[10]);
  const horizontalRelation = match[11] as 'left' | 'right' | undefined;
  const horizontalTarget = decodeReference(match[12], match[13]);
  const boundarySide = match[14] as 'top' | 'bottom' | 'left' | 'right' | undefined;
  const boundaryScope = decodeReference(match[15], match[16]);
  const posX = match[17];
  const posY = match[18];
  const isPinned = match[19] !== undefined;
  const rawData = match[20];
  const baseColumn = (ctx.sourceLines[lineNumber - 1] ?? '').length - (ctx.sourceLines[lineNumber - 1] ?? '').trimStart().length;
  const reference = (value: string, quotedGroup: number, bareGroup: number) => {
    const ref = nodeRef(value);
    const group = match[quotedGroup] !== undefined ? quotedGroup : bareGroup;
    // The clause keyword is outside strings; its following reference starts
    // after whitespace, so repeated reference text never needs a text lookup.
    const keyword = quotedGroup === 9 ? verticalRelation! : quotedGroup === 12 ? `${horizontalRelation} of` : `at the ${boundarySide} of`;
    const headEnd = new RegExp(nodeHead).exec(line)![0].length;
    const clauseEnd = headEnd + findUnquotedWords(line.slice(headEnd), keyword.split(' '))!.end;
    const start = clauseEnd + (line.slice(clauseEnd).match(/^\s*/)?.[0].length ?? 0);
    const text = group === quotedGroup ? `"${match[group]}"` : match[group];
    retainReference(ctx, ref, 'nodeId', tokenAt(lineNumber, baseColumn + start, text));
    return ref;
  };

  // An empty or already held explicit id is an error (R-063 AC-5); the derived
  // id is kept only so later references resolve.
  let id: string;
  if (explicitId !== undefined && ctx.nodeIds.reserve(explicitId)) {
    id = explicitId;
  } else {
    id = ctx.nodeIds.allocateFromLabel(label ?? 'node');
    if (explicitId !== undefined) reportIdentity(ctx, 'node', explicitId, explicitIdToken!, lineNumber);
  }
  ctx.nodeIdLines.set(id, lineNumber);

  const occurrences = new Occurrences();
  const node = {} as GraphNode;
  const clause = (text: string, after?: string) => tokenAt(lineNumber, rawColumn(ctx, lineNumber, text, after), text);
  if (explicitId !== undefined && id === explicitId) {
    assign(occurrences, node, 'id', ['GraphNode.id', 'clause:as'], id, clause(explicitIdToken!, ' as '));
  } else derive(node, 'id', id);
  assign(occurrences, node, 'type', ['GraphNode.type', 'clause:type'], nodeType,
    clause(match[1] !== undefined ? `"${match[1]}"` : match[2]));
  if (label !== undefined) assign(occurrences, node, 'label', ['GraphNode.label', 'clause:label'], label, clause(`"${match[3]}"`));

  if (placementSide) {
    const value = placementOffset === undefined ? undefined : Number(placementOffset);
    const placement = { side: placementSide, ...(value !== undefined ? { offset: value } : {}) };
    const invalid = !isNodeLabelPlacement(placement);
    if (invalid) {
      report(ctx, 'error', 'coral.label-placement.range.invalid',
        'Node label offset must be non-negative, and center requires zero or omitted offset',
        tokenPosition(ctx, lineNumber, 'offset', ' label '), line, 'offset');
    }
    assign(occurrences, node, 'labelPlacement', ['GraphNode.labelPlacement', 'clause:label-placement'],
      invalid ? INVALID : placement, clause('label', ' '));
  }

  if (verticalRelation && verticalTarget) {
    addConciseConstraint(ctx, 'relative', {
      id: '', kind: 'relative', subject: nodeRef(id),
      relation: verticalRelation, target: reference(verticalTarget, 9, 10),
    }, 'preferred');
  } else if (horizontalRelation && horizontalTarget) {
    addConciseConstraint(ctx, 'relative', {
      id: '', kind: 'relative', subject: nodeRef(id),
      relation: `${horizontalRelation}-of`, target: reference(horizontalTarget, 12, 13),
    }, 'preferred');
  } else if (boundarySide) {
    addConciseConstraint(ctx, 'boundary', {
      id: '', kind: 'boundary', subject: nodeRef(id), side: boundarySide,
      scope: boundaryScope ? reference(boundaryScope, 15, 16) : { kind: 'graph' },
    }, 'preferred');
  }

  // Geometry is a first-class clause, not a property (R-017).
  if (posX !== undefined && posY !== undefined) {
    assign(occurrences, node, 'position', ['GraphNode.position', 'clause:@'], { x: Number(posX), y: Number(posY) }, clause('@'));
  }
  if (isPinned) {
    if (!node.position) {
      report(ctx, 'error', 'coral.node.pin.invalid', 'Pinned requires an authored position',
        tokenPosition(ctx, lineNumber, 'pinned'), line, 'pinned');
    }
    assign(occurrences, node, 'pinned', ['GraphNode.pinned', 'clause:pinned'], node.position ? true : INVALID, clause('pinned'));
  }
  if (rawData !== undefined) applyNodeData(node, occurrences, rawData.trim(), ctx, lineNumber);
  reportDuplicateFields(ctx, 'node', occurrences);

  if (ctx.includeSourceInfo) {
    node.sourceInfo = {
      range: exactLineRange(ctx, line, offset, lineNumber),
    };
  }

  return node;
}

/** A key beginning `_` is reserved at every site that accepts a key (rule 5). */
function reportReservedKey(ctx: ParseContext, kind: 'node' | 'edge', key: string, token: SpellingToken): void {
  reportAt(ctx, `coral.${kind}.reserved-key.invalid`, `Key "${key}" begins with "_", which is reserved; rename it`, token);
}

/** An explicit `as` id that is empty or already held by an earlier declaration (D-1). */
function reportIdentity(
  ctx: ParseContext, kind: 'node' | 'edge', explicitId: string, token: string, lineNumber: number,
): void {
  const holder = (kind === 'node' ? ctx.nodeIdLines : ctx.edgeIdLines).get(explicitId);
  const subject = kind === 'node' ? 'Node' : 'Edge';
  reportAt(ctx, `coral.${kind}.id.invalid`,
    explicitId === ''
      ? `${subject} id must not be empty; remove "as" or choose an id`
      : `${subject} id "${explicitId}" is already used by line ${holder ?? '?'}; choose another id`,
    tokenAt(lineNumber, rawColumn(ctx, lineNumber, token, ' as '), token));
}

function decodeReference(quoted: string | undefined, bare: string | undefined): string | undefined {
  return quoted !== undefined ? unescapeString(quoted) : bare;
}

function nodeRef(nodeId: string) {
  return { kind: 'node' as const, nodeId };
}

function addConciseConstraint(
  ctx: ParseContext,
  kind: 'relative' | 'boundary' | 'arrangement',
  constraint: SpatialConstraint,
  defaultStrength?: 'required' | 'preferred',
): void {
  constraint.id = `coral.constraint.${kind}.${++ctx.constraintOrdinal}`;
  if (defaultStrength !== undefined) derive(constraint, 'strength', defaultStrength);
  ctx.constraintIds.add(constraint.id);
  ctx.constraints.push(constraint);
}

type ConstraintParameterName = 'strength' | 'gap' | 'inset' | 'alignment' | 'direction';
type ConstraintSpelling =
  | 'prefix:require' | 'token:strength'
  | 'parameter:gap' | 'parameter:inset' | 'parameter:alignment' | 'parameter:direction';

/** One stated constraint parameter, pending until the constraint kind resolves. */
interface PendingParameter {
  name: ConstraintParameterName;
  spelling: ConstraintSpelling;
  value: unknown;
  token: SpellingToken;
}

/** The accepted spellings per concrete constraint record; a missing entry is inapplicable. */
const CONSTRAINT_PAIRS: Record<
  'relative' | 'boundary' | 'arrangement',
  Partial<Record<`${ConstraintParameterName} ${ConstraintSpelling}`, SpellingPair>>
> = {
  relative: {
    'strength prefix:require': ['RelativeConstraint.strength', 'prefix:require'],
    'strength token:strength': ['RelativeConstraint.strength', 'token:strength'],
    'gap parameter:gap': ['RelativeConstraint.gap', 'parameter:gap'],
    'alignment parameter:alignment': ['RelativeConstraint.alignment', 'parameter:alignment'],
  },
  boundary: {
    'strength prefix:require': ['BoundaryConstraint.strength', 'prefix:require'],
    'strength token:strength': ['BoundaryConstraint.strength', 'token:strength'],
    'inset parameter:inset': ['BoundaryConstraint.inset', 'parameter:inset'],
  },
  arrangement: {
    'strength prefix:require': ['ArrangementConstraint.strength', 'prefix:require'],
    'strength token:strength': ['ArrangementConstraint.strength', 'token:strength'],
    'gap parameter:gap': ['ArrangementConstraint.gap', 'parameter:gap'],
    'alignment parameter:alignment': ['ArrangementConstraint.alignment', 'parameter:alignment'],
    'direction parameter:direction': ['ArrangementConstraint.direction', 'parameter:direction'],
  },
};

function parseConstraintDeclaration(line: string, ctx: ParseContext, lineNumber: number): void {
  if (/^arrange\s+children\s+of\s+/i.test(line) || /^require\s+arrange\s+children\s+of\s+/i.test(line)) {
    report(ctx, 'error', 'coral.constraint.dynamic-membership.unsupported',
      'Dynamic arrangement membership is not supported; list fixed subjects',
      tokenPosition(ctx, lineNumber, 'children'), line, 'children');
    return;
  }

  const rawLine = ctx.sourceLines[lineNumber - 1] ?? '';
  const indent = rawLine.length - rawLine.trimStart().length;
  const pending: PendingParameter[] = [];
  let expression = line;
  let expressionColumn = indent;
  let id: string | undefined;
  let defaultStrength: 'required' | 'preferred' = 'preferred';
  let identified = false;
  const namedArrangement028 = ctx.edition === '0.2.8-preview'
    ? line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+=\s+(arrange\s+.+)$/) : null;
  if (namedArrangement028) {
    id = namedArrangement028[1];
    expression = namedArrangement028[2];
    expressionColumn = indent + line.lastIndexOf(expression);
    identified = true;
    if (ctx.constraintIds.has(id)) {
      report(ctx, 'error', 'coral.constraint.id.invalid', `Constraint id "${id}" is already in use`,
        tokenPosition(ctx, lineNumber, id), line, id);
      return;
    }
  } else if (line.startsWith('require ')) {
    expression = line.slice('require '.length).trim();
    expressionColumn += line.length - line.slice('require '.length).trimStart().length;
    defaultStrength = 'required';
    pending.push({ name: 'strength', spelling: 'prefix:require', value: 'required', token: tokenAt(lineNumber, indent, 'require') });
  } else if (line.startsWith('constraint ')) {
    const match = line.match(/^constraint\s+("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
    if (!match) {
      report(ctx, 'error', 'coral.constraint.id.invalid', 'Constraint requires a non-empty unique id',
        tokenPosition(ctx, lineNumber, 'constraint'), line, 'constraint');
      return;
    }
    id = match[1].startsWith('"') ? unescapeString(match[1].slice(1, -1)) : match[1];
    expression = match[2];
    expressionColumn += line.length - match[2].length;
    defaultStrength = 'required';
    identified = true;
    if (ctx.constraintIds.has(id)) {
      report(ctx, 'error', 'coral.constraint.id.invalid', `Constraint id "${id}" is already in use`,
        tokenPosition(ctx, lineNumber, match[1]), line, match[1]);
      return;
    }
  }

  let parameterText: string | undefined;
  const parameterMatch = expression.match(/\s+\[([^\]]*)\]\s*$/);
  if (parameterMatch) {
    parameterText = parameterMatch[1];
    expression = expression.slice(0, parameterMatch.index).trim();
  }
  const contentColumn = parameterText === undefined ? 0 : rawLine.lastIndexOf(`[${parameterText}]`) + 1;
  const form = line.startsWith('require ') ? 'require' : identified ? 'constraint' : 'arrange';
  const parsed = parseConstraintParameters(parameterText, ctx, lineNumber, line, contentColumn, form, pending);
  const stated = new Occurrences();
  for (const { name, spelling, token } of pending) stated.add(name, spelling, token);
  reportDuplicateFields(ctx, 'constraint', stated);
  if (!parsed) return;

  const store = (kind: 'relative' | 'boundary' | 'arrangement', constraint: SpatialConstraint): void => {
    const pairs = CONSTRAINT_PAIRS[kind];
    const inapplicable = pending.find(({ name, spelling }) => pairs[`${name} ${spelling}`] === undefined);
    if (inapplicable) {
      reportConstraintParameter(ctx, inapplicable.name, inapplicable.token,
        `is not valid for ${kind === 'arrangement' ? 'arrangement' : `${kind} constraints`}`);
      return;
    }
    const occurrences = new Occurrences();
    for (const parameter of pending) {
      assign(occurrences, constraint, parameter.name, pairs[`${parameter.name} ${parameter.spelling}`]!,
        parameter.value, parameter.token);
    }
    if (!occurrences.has('strength')) derive(constraint, 'strength', defaultStrength);
    if (identified) addIdentifiedConstraint(ctx, id!, constraint);
    else addConciseConstraint(ctx, kind, constraint);
  };

  const reference = (value: string, token: SpellingToken) => {
    const ref = nodeRef(value);
    retainReference(ctx, ref, 'nodeId', token);
    return ref;
  };
  const arrangement028 = ctx.edition === '0.2.8-preview'
    ? expression.match(/^arrange\s+(row|column)\s*:\s*(.+)$/) : null;
  const arrangement = expression.match(/^arrange\s+(.+)\s+as\s+(row|column)$/);
  if (arrangement028 || arrangement) {
    const subjectText = arrangement028 ? arrangement028[2] : arrangement![1];
    const axis = arrangement028 ? arrangement028[1] : arrangement![2];
    const subjectColumn = expressionColumn + (arrangement028
      ? /^arrange\s+(?:row|column)\s*:\s*/.exec(expression)![0].length
      : /^arrange\s+/.exec(expression)![0].length);
    const subjects: ReturnType<typeof nodeRef>[] = [];
    let malformed = false;
    for (const part of splitTopLevelSpans(subjectText)) {
      const text = part.text.trim();
      const token = tokenAt(lineNumber,
        subjectColumn + part.start + part.text.length - part.text.trimStart().length, text);
      const value = parseReferenceToken(text);
      if (value === undefined || value === '') {
        malformed = true;
        reportAt(ctx, 'coral.constraint.subjects.invalid', 'Arrangement member must be a non-empty node reference', token);
      } else subjects.push(reference(value, token));
    }
    if (malformed) return;
    if (subjects.length < 2 || new Set(subjects.map(subject => subject.nodeId)).size !== subjects.length) {
      report(ctx, 'error', 'coral.constraint.subjects.invalid',
        'Arrangement requires at least two distinct explicit subjects',
        tokenPosition(ctx, lineNumber, 'arrange'), line, 'arrange');
      return;
    }
    store('arrangement', {
      id: '', kind: 'arrangement', subjects, axis: axis as 'row' | 'column',
    });
    return;
  }

  const referencePattern = '("(?:[^"\\\\]|\\\\.)*"|[A-Za-z_][A-Za-z0-9_.-]*)';
  const relative = expression.match(new RegExp(`^${referencePattern}\\s+(above|below|left\\s+of|right\\s+of)\\s+${referencePattern}$`));
  if (relative) {
    const subject = parseReferenceToken(relative[1]);
    const target = parseReferenceToken(relative[3]);
    if (!subject || !target) return reportConstraintSyntax(ctx, lineNumber, line);
    const relation = relative[2].replace(/\s+/, '-') as 'above' | 'below' | 'left-of' | 'right-of';
    store('relative', { id: '', kind: 'relative', subject: reference(subject, tokenAt(lineNumber, expressionColumn, relative[1])), relation,
      target: reference(target, tokenAt(lineNumber, expressionColumn + expression.length - relative[3].length, relative[3])) });
    return;
  }

  const boundary = expression.match(new RegExp(`^${referencePattern}\\s+at\\s+the\\s+(top|bottom|left|right)(?:\\s+of\\s+${referencePattern})?$`));
  if (boundary) {
    const subject = parseReferenceToken(boundary[1]);
    const scope = boundary[3] ? parseReferenceToken(boundary[3]) : undefined;
    if (!subject || (boundary[3] && !scope)) return reportConstraintSyntax(ctx, lineNumber, line);
    store('boundary', {
      id: '', kind: 'boundary', subject: reference(subject, tokenAt(lineNumber, expressionColumn, boundary[1])),
      side: boundary[2] as 'top' | 'bottom' | 'left' | 'right',
      scope: scope ? reference(scope, tokenAt(lineNumber, expressionColumn + expression.length - boundary[3].length, boundary[3])) : { kind: 'graph' as const },
    });
    return;
  }

  reportConstraintSyntax(ctx, lineNumber, line);
}

function addIdentifiedConstraint(
  ctx: ParseContext,
  id: string,
  constraint: SpatialConstraint,
): void {
  constraint.id = id;
  ctx.constraintIds.add(id);
  ctx.constraintOrdinal++;
  ctx.constraints.push(constraint);
}

function parseReferenceToken(value: string): string | undefined {
  const token = value.trim();
  const quoted = token.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (quoted) return unescapeString(quoted[1]);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(token) ? token : undefined;
}

/**
 * Scan a constraint parameter list into pending occurrences. Returns false
 * when a value is invalid, in which case the constraint is not stored.
 */
function parseConstraintParameters(
  source: string | undefined,
  ctx: ParseContext,
  lineNumber: number,
  line: string,
  contentColumn: number,
  form: 'require' | 'constraint' | 'arrange',
  pending: PendingParameter[],
): boolean {
  if (source === undefined || source.trim() === '') return true;
  let valid = true;
  for (const item of scanAttributes(source)) {
    if (item.kind === 'bare') {
      const token = tokenAt(lineNumber, contentColumn + item.column, item.value);
      if ((item.value === 'required' || item.value === 'preferred') && form === 'arrange') {
        // A strength flag belongs only to constraint id: lines (D-4).
        reportAt(ctx, 'coral.constraint.parameter.invalid',
          `[${item.value}] is not accepted on arrange; write ` +
          `${item.value === 'required' ? 'require arrange …' : 'arrange … without a flag'} or constraint id: …`, token);
      } else if (item.value === 'required' || item.value === 'preferred') {
        pending.push({ name: 'strength', spelling: 'token:strength', value: item.value, token });
      } else reportConstraintParameter(ctx, item.value, token, 'is not a recognized flag');
      continue;
    }
    if (item.kind !== 'pair') {
      reportConstraintParameter(ctx, item.value,
        tokenAt(lineNumber, contentColumn + item.column, item.raw),
        'is not a recognized parameter');
      continue;
    }
    if (item.separator === '=') {
      reportEquals(ctx, item, lineNumber, contentColumn);
      continue;
    }
    const token = tokenAt(lineNumber, contentColumn + item.keyColumn, item.keyText);
    const value = item.value;
    if (item.key === 'gap' || item.key === 'inset') {
      if (value.kind === 'number' && value.value < 0) {
        reportAt(ctx, 'coral.constraint.distance.invalid', `${item.key} must be non-negative`, token);
        valid = false;
      } else if (value.kind !== 'number') {
        reportConstraintParameter(ctx, item.key, token, 'has an invalid value');
        valid = false;
      }
      pending.push({ name: item.key, spelling: `parameter:${item.key}`, value: value.value, token });
    } else if (item.key === 'alignment' || item.key === 'direction') {
      // The enum keyword is written bare; a quoted keyword is rejected (R3-4).
      const keyword = isOneOf(item.key === 'alignment' ? ALIGNMENTS : DIRECTIONS, value.value);
      if (value.kind === 'string' && keyword) {
        reportAt(ctx, 'coral.constraint.parameter.invalid',
          `${item.key} "${value.value}" must be written bare: ${item.key}: ${value.value}`, token);
        valid = false;
      } else if (value.kind !== 'bare' || !keyword) {
        reportConstraintParameter(ctx, item.key, token, 'has an invalid value');
        valid = false;
      }
      pending.push({ name: item.key, spelling: `parameter:${item.key}`, value: value.value, token });
    } else {
      reportConstraintParameter(ctx, item.key, token, 'has an invalid value');
      valid = false;
    }
  }
  return valid;
}

/** Report an invalid constraint parameter, ranged on its own key or flag token. */
function reportConstraintParameter(ctx: ParseContext, key: string, token: SpellingToken, reason: string): void {
  reportAt(ctx, 'coral.constraint.parameter.invalid', `Constraint parameter ${key} ${reason}`, token);
}

function reportConstraintSyntax(ctx: ParseContext, lineNumber: number, line: string): void {
  report(ctx, 'error', 'coral.constraint.parameter.invalid', 'Malformed constraint expression',
    { line: lineNumber, column: 0, offset: ctx.lineStarts[lineNumber - 1] ?? 0 }, line);
}

/** The `data` keys accepted on one record, from the declared `data:` spellings. */
function dataSpellings(record: 'GraphNode' | 'GraphEdge' | 'EdgeStyle'): ReadonlyMap<string, SpellingPair> {
  return new Map(SPELLINGS
    .filter(([row, spelling]) => row.startsWith(`${record}.`) && spelling.startsWith('data:'))
    .map((pair) => [pair[1].slice('data:'.length), pair] as const));
}

const NODE_DATA = dataSpellings('GraphNode');
const EDGE_DATA = dataSpellings('GraphEdge');
const EDGE_STYLE_DATA = dataSpellings('EdgeStyle');

function dataColumn(ctx: ParseContext, lineNumber: number, raw: string): number {
  return rawColumn(ctx, lineNumber, raw, ' data ');
}

function applyNodeData(node: GraphNode, occurrences: Occurrences, raw: string, ctx: ParseContext, lineNumber: number): void {
  const json = readSourceJson(ctx, raw, lineNumber, dataColumn(ctx, lineNumber, raw), 'node data');
  if (typeof json === 'string') {
    report(ctx, 'error', 'coral.node.data.unparsed',
      json === 'depth' ? 'Node data JSON is nested too deeply' : 'Node data must be a JSON object',
      tokenPosition(ctx, lineNumber, raw, ' data '), (ctx.sourceLines[lineNumber - 1] ?? '').trim(), raw);
    return;
  }
  for (const [key, value] of Object.entries(json.value)) {
    const pair = NODE_DATA.get(key);
    if (!pair) {
      reportDataFieldUnsupported(ctx, 'node', key, json.token([key]));
      continue;
    }
    const valid =
      ((key === 'description' || key === 'symbol' || key === 'variant') && typeof value === 'string') ||
      (key === 'dimensions' && isDimensions(value)) ||
      (key === 'layoutOptions' && isNodeLayoutOptions(value)) ||
      (key === 'ports' && isPorts(value));
    if (!valid) {
      reportDataFieldInvalid(ctx, 'node', key, 'has the wrong shape', json.token([key]));
      assign(occurrences, node, key, pair, INVALID, json.token([key]));
      continue;
    }
    assign(occurrences, node, key, pair, value, json.token([key]));
  }
}

interface ParsedProperty {
  key: string;
  /** The key as written, quoted or bare. */
  keyToken: string;
  value: unknown;
  /** Repeated keys in a JSON value, with offsets within `line`. */
  duplicates: JsonKeyOccurrence[][];
}

function parseProperty(line: string): ParsedProperty | null {
  // Match: key: "value" (string), key: 123 (number), key: true/false (boolean)
  const keyMatch = line.match(/^(?:"((?:[^"\\]|\\.)*)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*:\s*/);
  if (!keyMatch) return null;

  const key = keyMatch[1] !== undefined ? unescapeString(keyMatch[1]) : keyMatch[2];
  const keyToken = keyMatch[1] !== undefined ? `"${keyMatch[1]}"` : keyMatch[2];
  const rest = line.slice(keyMatch[0].length);
  const scalar = (value: unknown): ParsedProperty => ({ key, keyToken, value, duplicates: [] });

  // Try string value: "..."
  if (rest.startsWith('"')) {
    // Find closing quote, handling escape sequences
    let i = 1;
    let value = '';
    while (i < rest.length) {
      if (rest[i] === '\\' && i + 1 < rest.length) {
        const next = rest[i + 1];
        if (next === 'n') { value += '\n'; i += 2; }
        else if (next === 't') { value += '\t'; i += 2; }
        else if (next === 'r') { value += '\r'; i += 2; }
        else if (next === '"') { value += '"'; i += 2; }
        else if (next === '\\') { value += '\\'; i += 2; }
        else { value += rest[i]; i++; }
      } else if (rest[i] === '"') {
        // Check nothing after closing quote
        if (i + 1 === rest.length) {
          return scalar(value);
        }
        return null; // Trailing content after closing quote
      } else {
        value += rest[i];
        i++;
      }
    }
    return null; // Unterminated string
  }

  // Try boolean
  if (rest === 'true') return scalar(true);
  if (rest === 'false') return scalar(false);
  if (rest === 'null') return scalar(null);

  if (rest.startsWith('[') || rest.startsWith('{')) {
    const parsed = parseStrictJson(rest);
    if (parsed.ok && isJsonSafe(parsed.value)) {
      const shift = keyMatch[0].length;
      return {
        key, keyToken, value: parsed.value,
        duplicates: parsed.duplicates.map((group) => group.map((occurrence) => ({
          ...occurrence, start: occurrence.start + shift, end: occurrence.end + shift,
        }))),
      };
    }
  }

  // Try number. The pattern must accept everything String(n) can emit for a
  // finite number, including exponent form such as 1e-7 and 1e+21.
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(rest)) {
    const value = Number(rest);
    if (Number.isFinite(value)) return scalar(value);
  }

  return null;
}

/** Locate a complete data object before interpreting a following route clause.
 * Strings, escapes and nested objects cannot introduce a clause boundary.
 * An unbalanced object stays intact for the positioned strict-JSON diagnostic.
 */
function splitEdgeDataTail(input: string): { data: string; route?: string } | undefined {
  if (!input.startsWith('{')) return { data: input };
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted && char === '\\') { index++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === '{') depth++;
    if (char !== '}') continue;
    depth--;
    if (depth !== 0) continue;
    const data = input.slice(0, index + 1);
    const rest = input.slice(index + 1);
    if (rest.trim() === '') return { data };
    const route = /^\s+via\s+([\s\S]+)$/.exec(rest);
    return route ? { data, route: route[1] } : undefined;
  }
  return { data: input };
}

/** Settled edge core: identity, relation type, and rendered label differ. */
function parseEdgeDeclaration028(
  line: string,
  ctx: ParseContext,
  offset: number,
  lineNumber: number,
): GraphEdge | null | undefined {
  const bareLabel = line.match(/^(?:(?:"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s+=\s+)?[A-Za-z_][A-Za-z0-9_]*\s+([-<>.#|o{]+)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+\[[^\]]*\])?\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
  if (bareLabel && parseConnector028(bareLabel[1]!)) {
    report(ctx, 'error', 'coral.edge.label.quote-required',
      'The rendered edge label after as must be quoted; name the edge before =',
      tokenPosition(ctx, lineNumber, bareLabel[2], ' as '), line, bareLabel[2]);
    return null;
  }
  const match = line.match(/^(?:("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s+=\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+([-<>.#|o{]+)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+\[((?:[^"'\\\]]|\\.|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*)\])?(?:\s+as\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?$/);
  if (!match) return undefined;
  const explicitIdRaw = match[1];
  const explicitId = explicitIdRaw?.startsWith('"')
    ? decodePreviewQuoted(explicitIdRaw, ctx, lineNumber, line.indexOf(explicitIdRaw)) : explicitIdRaw;
  if (explicitIdRaw?.startsWith('"') && explicitId === undefined) return null;
  const [source, operator, target] = [match[2], match[3], match[4]];
  const connector = parseConnector028(operator);
  if (!connector) return undefined;
  const targetMarker = connector.secondEnd.kind === 'arrow' && connector.secondEnd.fill === 'filled' &&
    ctx.graph.metadata?.notation === UML_SEQUENCE_NOTATION
    ? { kind: 'triangle' as const, fill: 'filled' as const } : connector.secondEnd;
  const edge: GraphEdge = { id: explicitId ?? '', source, target,
    sourceEnd: { marker: connector.firstEnd },
    targetEnd: { marker: targetMarker },
    ...(connector.stroke === 'dashed' ? { style: { lineStyle: 'dashed' } } : {}),
  };
  const baseColumn = (ctx.sourceLines[lineNumber - 1] ?? '').length -
    (ctx.sourceLines[lineNumber - 1] ?? '').trimStart().length;
  const sourceColumn = line.indexOf(source, explicitId ? line.indexOf('=') + 1 : 0);
  const targetColumn = line.indexOf(target, line.indexOf(operator, sourceColumn + source.length) + operator.length);
  retainReference(ctx, edge, 'source', tokenAt(lineNumber, baseColumn + sourceColumn, source));
  retainReference(ctx, edge, 'target', tokenAt(lineNumber, baseColumn + targetColumn, target));
  let invalid = false;
  let firstType: SpellingToken | undefined;
  let firstLabel: SpellingToken | undefined;
  const firstAssignment = (token: SpellingToken | undefined): DiagnosticRelatedLocation[] => token
    ? [{ message: 'First assignment', ...tokenLocation(ctx, token) }] : [];
  if (match[5] !== undefined) {
    const attributes = scanAttributes(match[5], true);
    const attributeColumn = baseColumn + line.indexOf('[') + 1;
    for (const [index, attribute] of attributes.entries()) {
      if (attribute.kind === 'bare' && index === 0 && BARE_IDENTIFIER.test(attribute.value)) {
        const token = tokenAt(lineNumber, attributeColumn + attribute.column, attribute.value);
        if (edge.type !== undefined) {
          invalid = true;
          reportAt(ctx, 'coral.edge.type.duplicate', 'Edge type is specified twice', token,
            firstAssignment(firstType));
        } else { edge.type = attribute.value; firstType = token; }
      } else if (attribute.kind === 'pair' && attribute.separator === ':' && attribute.key === 'type' &&
        attribute.value.kind === 'bare' && BARE_IDENTIFIER.test(attribute.value.value)) {
        const token = tokenAt(lineNumber, attributeColumn + attribute.keyColumn, attribute.keyText);
        if (edge.type !== undefined) {
          invalid = true;
          reportAt(ctx, 'coral.edge.type.duplicate', 'Edge type is specified twice', token,
            firstAssignment(firstType));
        } else { edge.type = attribute.value.value; firstType = token; }
      } else if (attribute.kind === 'pair' && attribute.separator === ':' && attribute.key === 'label' &&
        attribute.value.kind === 'string') {
        const token = tokenAt(lineNumber, attributeColumn + attribute.keyColumn, attribute.keyText);
        if (edge.label !== undefined) {
          invalid = true;
          reportAt(ctx, 'coral.edge.label.duplicate', 'Edge label is specified twice', token,
            firstAssignment(firstLabel));
        } else {
          const decoded = decodePreviewQuoted(attribute.value.raw, ctx, lineNumber,
            attributeColumn + attribute.valueColumn);
          if (decoded === undefined) invalid = true;
          else { edge.label = decoded; firstLabel = token; }
        }
      } else {
        invalid = true;
        const spelling = attribute.kind === 'pair' ? attribute.keyText
          : attribute.kind === 'bare' ? attribute.value : attribute.raw;
        report(ctx, 'error', 'coral.edge.attribute.invalid', 'Invalid or duplicate named-edge attribute',
          tokenPosition(ctx, lineNumber, spelling), line, spelling);
      }
    }
  }
  if (match[6] !== undefined) {
    if (edge.label !== undefined) {
      invalid = true;
      reportAt(ctx, 'coral.edge.label.duplicate', 'Edge label is specified twice',
        tokenAt(lineNumber, baseColumn + line.lastIndexOf(' as ') + 1, 'as'), firstAssignment(firstLabel));
    } else {
      const decoded = decodePreviewQuoted(match[6], ctx, lineNumber, line.lastIndexOf(match[6]));
      if (decoded === undefined) invalid = true;
      else edge.label = decoded;
    }
  }
  if (invalid) return null;
  if (ctx.graph.metadata?.notation === UML_SEQUENCE_NOTATION && edge.type === undefined &&
    connector.firstEnd.kind === 'none' && connector.secondEnd.kind === 'arrow') {
    edge.type = connector.stroke === 'dashed' ? 'return'
      : connector.secondEnd.fill === 'filled' ? 'sync' : 'async';
  }
  if (ctx.graph.metadata?.notation === UML_SEQUENCE_NOTATION) {
    const allowedOperator = connector.firstEnd.kind === 'none' && connector.secondEnd.kind === 'arrow';
    const allowedType = ['sync', 'async', 'return', 'create'].includes(edge.type ?? '');
    if (!allowedOperator || !allowedType) {
      report(ctx, 'error', 'coral.sequence.message.operator.invalid',
        `Sequence ${operator} requires a supported message operator and type`,
        tokenPosition(ctx, lineNumber, operator), line, operator);
      return null;
    }
  }
  if (explicitId && !ctx.edgeIds.reserve(explicitId)) {
    report(ctx, 'error', 'coral.edge.id.invalid', `Edge id "${explicitId}" is already in use`,
      tokenPosition(ctx, lineNumber, explicitIdRaw!), line, explicitIdRaw!);
    return null;
  }
  edge.id = explicitId ?? allocateEdgeId(source, target, ctx.edgeIds);
  ctx.edgeIdLines.set(edge.id, lineNumber);
  if (ctx.includeSourceInfo) edge.sourceInfo = { range: exactLineRange(ctx, line, offset, lineNumber) };
  return edge;
}

function parseEdgeDeclaration(
  line: string,
  ctx: ParseContext,
  offset: number,
  lineNumber: number
): GraphEdge | null {
  const prefix = scanEdgePrefix(line);
  if (!prefix) return null;
  const baseColumn = (ctx.sourceLines[lineNumber - 1] ?? '').length - (ctx.sourceLines[lineNumber - 1] ?? '').trimStart().length;
  // Match only the fixed trailing clause order; endpoint annotations use a cursor.
  const NUM = '-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?';
  // Attribute lists may contain a literal closing bracket inside a quoted
  // value. Keep the list as one capture while treating escapes and quoted
  // strings atomically, instead of stopping at the first `]`.
  const ATTRIBUTES = '((?:[^"\\\\\\]]|\\\\.|"(?:[^"\\\\]|\\\\.)*")*)';
  const edgeRegex = new RegExp(
    '^' +
    '(?:\\s+as\\s+(?:"((?:[^"\\\\]|\\\\.)*)"|([A-Za-z_][A-Za-z0-9_]*)))?' +
    `(?:\\s*\\[${ATTRIBUTES}\\])?` +
    '(?:\\s+label\\s+(above|below|left|right|center)' +
      '(?:\\s+at\\s+(' + NUM + '))?(?:\\s+offset\\s+(' + NUM + '))?)?' +
    '(?:\\s+(data|via)\\s+([\\s\\S]+))?$'
  );
  const match = line.slice(prefix.end).match(edgeRegex);

  if (!match) {
    return null;
  }

  const source = prefix.source.value;
  const target = prefix.target.value;
  const explicitId = match[1] !== undefined ? unescapeString(match[1]) : match[2];
  const explicitIdToken = match[1] !== undefined ? `"${match[1]}"` : match[2];
  const attributes = match[3];
  const placementSide = match[4] as 'above' | 'below' | 'left' | 'right' | 'center' | undefined;
  const placementAt = match[5];
  const placementOffset = match[6];
  const dataTail = match[7] === 'data' ? splitEdgeDataTail(match[8]) : undefined;
  if (match[7] === 'data' && !dataTail) return null;
  const rawData = dataTail?.data;
  const waypointClause = match[7] === 'via' ? match[8] : dataTail?.route;
  let edgeId: string;
  if (explicitId !== undefined && ctx.edgeIds.reserve(explicitId)) {
    edgeId = explicitId;
  } else {
    edgeId = allocateEdgeId(source, target, ctx.edgeIds);
    if (explicitId !== undefined) reportIdentity(ctx, 'edge', explicitId, explicitIdToken!, lineNumber);
  }
  ctx.edgeIdLines.set(edgeId, lineNumber);

  const occurrences = new Occurrences();
  const edge = {} as GraphEdge;
  const clause = (text: string, after?: string) => tokenAt(lineNumber, rawColumn(ctx, lineNumber, text, after), text);
  if (explicitId !== undefined && edgeId === explicitId) {
    assign(occurrences, edge, 'id', ['GraphEdge.id', 'clause:as'], edgeId, clause(explicitIdToken!, ' as '));
  } else derive(edge, 'id', edgeId);
  assign(occurrences, edge, 'source', ['GraphEdge.source', 'clause:source'], source,
    tokenAt(lineNumber, baseColumn + prefix.source.start, prefix.source.text));
  assign(occurrences, edge, 'target', ['GraphEdge.target', 'clause:target'], target,
    tokenAt(lineNumber, baseColumn + prefix.target.start, prefix.target.text));
  retainReference(ctx, edge, 'source', tokenAt(lineNumber, baseColumn + prefix.source.start, prefix.source.text));
  retainReference(ctx, edge, 'target', tokenAt(lineNumber, baseColumn + prefix.target.start, prefix.target.text));
  for (const annotation of prefix.sourceEnds) applyCompactEnd(edge, occurrences, 'sourceEnd', annotation, ctx, lineNumber, baseColumn);
  for (const annotation of prefix.targetEnds) applyCompactEnd(edge, occurrences, 'targetEnd', annotation, ctx, lineNumber, baseColumn);

  // Parse attributes if present
  if (attributes !== undefined) {
    if (attributes.trim() === '') {
      report(ctx, 'error', 'coral.attribute.empty.unparsed', 'Empty edge attribute entries are not allowed',
        tokenPosition(ctx, lineNumber, '[]'), line, '[]');
    }
    const contentColumn = baseColumn + prefix.end + syntaxAnchor(line.slice(prefix.end), '[') + 1;
    let sawRelation = false;
    let sawNamed = false;
    let sawLineStyle = false;
    const scanned = scanAttributes(attributes);
    let canonical: string | undefined;
    const canonicalList = () => (canonical ??= canonicalAttributeList(scanned));
    for (const attr of scanned) {
      if (attr.kind === 'bare' || attr.kind === 'quotedBare') {
        const text = attr.kind === 'bare' ? attr.value : attr.raw;
        const token = tokenAt(lineNumber, contentColumn + attr.column, text);
        if (attr.kind === 'bare' && !BARE_IDENTIFIER.test(attr.value)) {
          reportAt(ctx, 'coral.attribute.value.unparsed', `Attribute token ${attr.value} must be an identifier or quoted`, token);
          continue;
        }
        // Bare tokens (relation type, line style) must lead the attribute
        // list; a named attribute cannot be followed by one (grammar.ebnf
        // `attributes`). The token is not stored.
        if (sawNamed) {
          const isLineStyle = attr.kind === 'bare' && isOneOf(LINE_STYLES, attr.value);
          reportAt(ctx, 'coral.attribute.relation.invalid',
            `The ${isLineStyle ? 'line style' : 'relation token'} ${text} must come before the named attributes; ` +
            `write ${canonicalList()}`, token);
          continue;
        }
        // A bare token spelling a line style is one; anything else, and any
        // quoted leading token, is the relation type.
        if (attr.kind === 'bare' && isOneOf(LINE_STYLES, attr.value)) {
          sawLineStyle = true;
          assign(occurrences, edge, 'style.lineStyle', ['EdgeStyle.lineStyle', 'token:line-style'], attr.value, token);
        } else if (!sawRelation && sawLineStyle) {
          // The relation token leads: [relation, line-style, …] (grammar.ebnf `attributes`).
          reportAt(ctx, 'coral.attribute.relation.invalid',
            `The relation token ${text} must come before the line style; write ${canonicalList()}`, token);
          sawRelation = true;
        } else if (!sawRelation) {
          assign(occurrences, edge, 'type', ['GraphEdge.type', 'token:relation'], attr.value, token);
          sawRelation = true;
        } else {
          reportAt(ctx, 'coral.attribute.relation.invalid', 'Only one leading relation token is allowed', token);
        }
        continue;
      }
      // A removed `=` pair is still a named attribute for ordering.
      sawNamed = true;
      if (attr.separator === '=') {
        reportEquals(ctx, attr, lineNumber, contentColumn);
        continue;
      }
      const token = tokenAt(lineNumber, contentColumn + attr.keyColumn, attr.keyText);
      // Reserved for internal use (R-009 AC-7); an error, never stored (R-063 AC-5).
      if (attr.key.startsWith('_')) {
        reportReservedKey(ctx, 'edge', attr.key, token);
        continue;
      }
      // A string value has one spelling: quoted (R2-5).
      const unparsed = attr.value.kind === 'bare';
      if (unparsed) {
        reportAt(ctx, 'coral.attribute.value.unparsed', `Attribute value ${attr.value.raw} must be quoted`,
          tokenAt(lineNumber, contentColumn + attr.valueColumn, attr.value.raw));
      }
      if (attr.key === 'label' || attr.key === 'description') {
        const valid = !unparsed && attr.value.kind === 'string';
        if (!valid && !unparsed) {
          reportAt(ctx, `coral.attribute.${attr.key}.invalid`, `Edge ${attr.key} must be a string`, token);
        }
        assign(occurrences, edge, attr.key,
          attr.key === 'label' ? ['GraphEdge.label', 'attribute:label'] : ['GraphEdge.description', 'attribute:description'],
          valid ? attr.value.value : INVALID, token);
        continue;
      }
      assign(occurrences, edge, `properties.${attr.key}`, ['GraphEdge.properties', 'attribute:*'],
        unparsed ? INVALID : attr.value.value, token);
    }
  }

  if (rawData !== undefined) applyEdgeData(edge, occurrences, rawData.trim(), ctx, lineNumber);

  if (placementSide) {
    const at = placementAt === undefined ? undefined : Number(placementAt);
    const labelOffset = placementOffset === undefined ? undefined : Number(placementOffset);
    const placement = {
      side: placementSide,
      ...(at !== undefined ? { at } : {}),
      ...(labelOffset !== undefined ? { offset: labelOffset } : {}),
    };
    const invalid = !isEdgeLabelPlacement(placement);
    if (invalid) {
      report(ctx, 'error', 'coral.label-placement.range.invalid',
        'Edge label placement has an invalid at/offset value',
        tokenPosition(ctx, lineNumber, 'label'), line, 'label');
    }
    assign(occurrences, edge, 'labelPlacement', ['GraphEdge.labelPlacement', 'clause:label-placement'],
      invalid ? INVALID : placement, clause('label', ']'));
  }

  // Waypoints follow the attributes (R-018).
  if (waypointClause) {
    const waypoints = parseRouteIntent(waypointClause, edge.id, ctx, lineNumber, line, baseColumn + line.length - waypointClause.length);
    if (waypoints.length > 0) {
      assign(occurrences, edge, 'routeIntent', ['GraphEdge.routeIntent', 'clause:via'], { waypoints }, clause('via', ' '));
    }
  }
  reportDuplicateFields(ctx, 'edge', occurrences);

  if (ctx.graph.metadata?.notation === UML_SEQUENCE_NOTATION && edge.type === 'create') {
    report(ctx, 'error', 'coral.sequence.message.operator.invalid',
      'Creation requires the dashed open-arrow operator -.->',
      tokenPosition(ctx, lineNumber, '->'), line, '->');
  }

  if (ctx.includeSourceInfo) {
    edge.sourceInfo = {
      range: exactLineRange(ctx, line, offset, lineNumber),
    };
  }

  return edge;
}

/** Near-miss navigability spellings and the approved form (R52-3). */
const END_PART_HINTS: Record<string, string> = {
  navigable: 'write nav',
  'non-navigable': 'write nonav',
  unspecified: 'explicit unspecified navigability requires whole-end data',
};

function applyCompactEnd(edge: GraphEdge, occurrences: Occurrences, field: 'sourceEnd' | 'targetEnd', annotation: EndAnnotation,
  ctx: ParseContext, line: number, base: number): void {
  const parts = new Occurrences();
  const value: Record<string, unknown> = {};
  let invalid = annotation.parts.length === 0;
  const whole = tokenAt(line, base + annotation.start, annotation.text);
  if (invalid) reportAt(ctx, 'coral.edge.end.invalid', 'An end annotation requires at least one part', whole);
  // The first occurrence of each recognized field, in source order, with the
  // text a rewrite would use; undefined when no canonical token exists.
  const firsts: { field: EndPart['field'] & string; text: string | undefined }[] = [];
  let unknown = false;
  for (const part of annotation.parts) {
    const token = tokenAt(line, base + part.start, part.text);
    if (!part.field) {
      invalid = true;
      unknown = true;
      if (part.spacing === 'missing') {
        reportAt(ctx, 'coral.edge.end.invalid', `Invalid ${field} spacing; parts must be separated by spaces or tabs`, token);
      } else if (part.spacing) {
        reportAt(ctx, 'coral.edge.end.invalid', `Invalid ${field} spacing U+${part.text.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}; ` +
          'separate and pad parts with spaces or tabs only', token);
      } else {
        const hint = END_PART_HINTS[part.text];
        reportAt(ctx, 'coral.edge.end.invalid', `Invalid ${field} part ${part.text}${hint ? `; ${hint}` : ''}`, token);
      }
      continue;
    }
    const first = parts.add(`${field}.${part.field}`, 'compact:end', token);
    if (first) firsts.push({ field: part.field, text: part.problem ? part.problem.canonical : part.text });
    if (part.problem) {
      // A noncanonical or out-of-domain bound is reported at its own part and
      // still reserves the multiplicity field for duplicate grouping.
      invalid = true;
      reportAt(ctx, 'coral.edge.end.invalid', `Invalid ${field} multiplicity ${part.text}; ` +
        (part.problem.canonical !== undefined ? `write ${part.problem.canonical} (${COMPACT_BOUND_RULE})` : COMPACT_BOUND_RULE) +
        (part.problem.oversized ? `; a larger bound requires whole-end data.${field}` : ''), token);
      continue;
    }
    if (first) value[part.field] = part.value;
    else {
      // Any repeated part rejects the end. A discarded duplicate may also be
      // independently invalid; do not let a valid first part hide that error.
      invalid = true;
      const duplicate = validateRelationshipEnd({ [part.field]: part.value }, field);
      if (!duplicate.valid) reportAt(ctx, 'coral.edge.end.invalid', duplicate.message, token);
    }
  }
  reportDuplicateFields(ctx, 'edge', parts);
  // One spelling per end (FIX-1 D52-2, R52-1): the first occurrence of each
  // recognized field must follow the canonical order, whatever else is wrong.
  // The rewrite uses canonical tokens and is omitted when a part has none.
  const rank = (entry: typeof firsts[number]) => (COMPACT_END_PART_ORDER as readonly string[]).indexOf(entry.field);
  if (firsts.some((entry, index) => index > 0 && rank(firsts[index - 1]) > rank(entry))) {
    invalid = true;
    const sorted = [...firsts].sort((a, b) => rank(a) - rank(b));
    const rewrite = !unknown && sorted.every(entry => entry.text !== undefined)
      ? `; write (${sorted.map(entry => entry.text).join(' ')})` : '';
    reportAt(ctx, 'coral.edge.end.order.invalid',
      `${field} parts must be written in the order ${COMPACT_END_PART_ORDER.join(', ')}${rewrite}`, whole);
  }
  const validated = validateRelationshipEnd(value, field);
  if (!validated.valid) {
    invalid = true;
    reportAt(ctx, 'coral.edge.end.invalid', validated.message, whole);
  }
  assign(occurrences, edge, field, field === 'sourceEnd' ? ['GraphEdge.sourceEnd', 'compact:end'] : ['GraphEdge.targetEnd', 'compact:end'],
    invalid ? INVALID : value, whole);
}

function parseRouteIntent(
  source: string,
  edgeId: string,
  ctx: ParseContext,
  lineNumber: number,
  line: string,
  baseColumn: number,
): RouteWaypoint[] {
  const number = '-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?';
  const simplePoint = new RegExp(`\\(\\s*(${number})\\s*,\\s*(${number})\\s*\\)`, 'gy');
  const simple: RouteWaypoint[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? '')) cursor++;
    simplePoint.lastIndex = cursor;
    const match = simplePoint.exec(source);
    if (!match) break;
    simple.push({
      id: `coral.waypoint.${edgeId}.${simple.length + 1}`,
      placement: { kind: 'absolute', position: { x: Number(match[1]), y: Number(match[2]) } },
    });
    cursor = simplePoint.lastIndex;
  }
  if (simple.length > 0 && source.slice(cursor).trim() === '') return simple;

  const out: RouteWaypoint[] = [];
  const seen = new Set<string>();
  // Keep quoted strings and coordinate tuples intact, and retain original offsets.
  const spans: Array<{ text: string; start: number }> = [];
  let start = 0;
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (quoted && source[i] === '\\') { i++; continue; }
    if (source[i] === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (source[i] === '(') depth++;
    if (source[i] === ')') depth--;
    if (source[i] === ',' && depth === 0) { spans.push({ text: source.slice(start, i), start }); start = i + 1; }
  }
  spans.push({ text: source.slice(start), start });
  for (const span of spans) {
    const part = span.text;
    const partColumn = baseColumn + span.start + part.length - part.trimStart().length;
    const absolute = part.trim().match(new RegExp(
      `^waypoint\\s+("(?:[^"\\\\]|\\\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\\s+at\\s+\\(\\s*(${number})\\s*,\\s*(${number})\\s*\\)$`,
    ));
    const relative = part.trim().match(new RegExp(
      `^waypoint\\s+("(?:[^"\\\\]|\\\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\\s+relative\\s+to\\s+(.+?)\\s+offset\\s+\\(\\s*(${number})\\s*,\\s*(${number})\\s*\\)$`,
    ));
    if (!absolute && !relative) {
      report(ctx, 'error', 'coral.route.anchor.invalid', 'Malformed route waypoint',
        tokenPosition(ctx, lineNumber, part.trim(), ' via '), line, part.trim());
      continue;
    }
    const rawId = (absolute ?? relative)![1];
    const id = rawId.startsWith('"') ? unescapeString(rawId.slice(1, -1)) : rawId;
    if (!id || seen.has(id)) {
      report(ctx, 'error', 'coral.route.waypoint.id.invalid', 'Waypoint ids must be non-empty and unique per edge',
        tokenPosition(ctx, lineNumber, rawId, ' via '), line, rawId);
      continue;
    }
    seen.add(id);
    if (absolute) {
      out.push({ id, placement: { kind: 'absolute', position: { x: Number(absolute[2]), y: Number(absolute[3]) } } });
      continue;
    }
    const anchor = parseRouteAnchor(relative![2]);
    if (!anchor) {
      report(ctx, 'error', 'coral.route.anchor.invalid', 'Unknown route anchor',
        tokenPosition(ctx, lineNumber, relative![2], ' relative to '), line, relative![2]);
      continue;
    }
    const anchorPrefix = /^waypoint\s+(?:"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s+relative\s+to\s+/.exec(part.trim())![0];
    const anchorColumn = partColumn + anchorPrefix.length;
    if (anchor.kind === 'node') retainReference(ctx, anchor, 'nodeId', tokenAt(lineNumber, anchorColumn, relative![2]));
    if (anchor.kind === 'port') {
      const raw = relative![2];
      const ownerStart = /^port\s+/.exec(raw)![0].length;
      const port = raw.slice(ownerStart);
      const dot = lastDotOutsideQuotes(port);
      const portSuffix = port.slice(dot + 1);
      retainReference(ctx, anchor, 'nodeId', tokenAt(lineNumber, anchorColumn + ownerStart, port.slice(0, dot).trimEnd()));
      retainReference(ctx, anchor, 'portId', tokenAt(lineNumber, anchorColumn + ownerStart + dot + 1 + portSuffix.length - portSuffix.trimStart().length, portSuffix.trim()));
    }
    out.push({
      id,
      placement: {
        kind: 'relative', anchor,
        offset: { x: Number(relative![3]), y: Number(relative![4]) },
      },
    });
  }
  return out;
}

function parseRouteAnchor(source: string): RouteAnchor | null {
  const token = source.trim();
  if (token === 'source' || token === 'target') return { kind: token };
  const portPrefix = /^port\s+/.exec(token);
  if (portPrefix) {
    const port = token.slice(portPrefix[0].length).trim();
    const split = lastDotOutsideQuotes(port);
    if (split <= 0 || split === port.length - 1) return null;
    const nodeId = parseReferenceToken(port.slice(0, split));
    const portId = parseReferenceToken(port.slice(split + 1));
    return nodeId && portId ? { kind: 'port', nodeId, portId } : null;
  }
  const nodeId = parseReferenceToken(token);
  return nodeId ? { kind: 'node', nodeId } : null;
}

function lastDotOutsideQuotes(value: string): number {
  let split = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === '.') split = index;
  }
  return quoted ? -1 : split;
}

function applyEdgeData(edge: GraphEdge, occurrences: Occurrences, raw: string, ctx: ParseContext, lineNumber: number): void {
  const json = readSourceJson(ctx, raw, lineNumber, dataColumn(ctx, lineNumber, raw), 'edge data');
  if (typeof json === 'string') {
    report(ctx, 'error', 'coral.edge.data.unparsed',
      json === 'depth' ? 'Edge data JSON is nested too deeply' : 'Edge data must be a JSON object',
      tokenPosition(ctx, lineNumber, raw, ' data '), (ctx.sourceLines[lineNumber - 1] ?? '').trim(), raw);
    return;
  }
  for (const [key, value] of Object.entries(json.value)) {
    const token = json.token([key]);
    if (key === 'style') {
      if (!isPlainObject(value)) {
        reportDataFieldInvalid(ctx, 'edge', key, 'must be an object', token);
        continue;
      }
      for (const [styleKey, styleValue] of Object.entries(value)) {
        const styleToken = json.token(['style', styleKey]);
        const pair = EDGE_STYLE_DATA.get(`style.${styleKey}`);
        if (styleKey === 'sourceArrow' || styleKey === 'targetArrow') {
          // Removed (L1): replacements must use the current canonical spelling.
          const end = styleKey === 'sourceArrow' ? 'sourceEnd' : 'targetEnd';
          const validation = validateRelationshipEnd({ marker: { kind: styleValue, fill: 'unspecified' } }, end);
          const compact = validation.valid ? formatCompactEnd(validation.value) : undefined;
          reportAt(ctx, 'coral.edge.legacy-arrow.unsupported',
            `style.${styleKey} was removed in Coral Language 1.2.0; write ` +
            (compact ? `${compact} immediately after the ${end === 'sourceEnd' ? 'source' : 'target'} reference` :
              `a valid ${end} compact annotation, or whole-end data for an end with navigability`), styleToken);
        } else if (pair) {
          const valid = isOneOf(ROUTINGS, styleValue);
          if (!valid) reportDataFieldInvalid(ctx, 'edge', `style.${styleKey}`, 'must be orthogonal, polyline, or spline', styleToken);
          assign(occurrences, edge, `style.${styleKey}`, pair, valid ? styleValue : INVALID, styleToken);
        } else {
          reportDataFieldUnsupported(ctx, 'edge', `style.${styleKey}`, styleToken,
            styleKey === 'lineStyle' && typeof styleValue === 'string' ? `write [${styleValue}]` : undefined);
        }
      }
      continue;
    }
    const pair = key.includes('.') ? undefined : EDGE_DATA.get(key);
    if (!pair) {
      reportDataFieldUnsupported(ctx, 'edge', key, token);
      continue;
    }
    if (key === 'sourcePort' || key === 'targetPort') {
      if (typeof value === 'string') assign(occurrences, edge, key, pair, value, token);
      else {
        reportDataFieldInvalid(ctx, 'edge', key, 'must be a string', token);
        assign(occurrences, edge, key, pair, INVALID, token);
      }
      continue;
    }
    if (key === 'sourceEnd' || key === 'targetEnd') {
      const validated = validateRelationshipEnd(value, key);
      if (!validated.valid) reportAt(ctx, 'coral.edge.end.invalid', validated.message, token);
      const compact = validated.valid ? formatCompactEnd(validated.value) : undefined;
      if (compact && !occurrences.has(key)) reportAt(ctx, 'coral.edge.end.compact.required',
        `${key} is compact-expressible; write ${compact} immediately after the ${key === 'sourceEnd' ? 'source' : 'target'} reference instead of data.${key}`, token);
      assign(occurrences, edge, key, pair, validated.valid && !compact ? validated.value : INVALID, token);
      continue;
    }
    if (!isPlainObject(value) || !isJsonSafe(value)) {
      reportDataFieldInvalid(ctx, 'edge', 'properties', 'must be a JSON object', token);
      continue;
    }
    for (const [propertyKey, propertyValue] of Object.entries(value)) {
      const propertyToken = json.token(['properties', propertyKey]);
      if (propertyKey.startsWith('_')) {
        reportReservedKey(ctx, 'edge', propertyKey, propertyToken);
        continue;
      }
      // A scalar is written [k: v]; data.properties holds non-scalars and the
      // keys label and description, whose attributes are first-class fields (D-4).
      if (propertyKey !== 'label' && propertyKey !== 'description' &&
          (propertyValue === null || typeof propertyValue !== 'object')) {
        reportDataFieldUnsupported(ctx, 'edge', `properties.${propertyKey}`, propertyToken,
          `a scalar property is written [${quoteIfNeeded(propertyKey)}: ${stableJson(propertyValue)}]`);
        continue;
      }
      assign(occurrences, edge, `properties.${propertyKey}`, pair, propertyValue, propertyToken);
    }
  }
}

/** Columns are offsets within the scanned bracket content. */
type ScannedAttribute =
  | { kind: 'bare'; value: string; column: number }
  | { kind: 'quotedBare'; value: string; raw: string; column: number }
  | {
    kind: 'pair';
    key: string;
    /** The key as written, quoted or bare. */
    keyText: string;
    keyColumn: number;
    /** `=` is the removed Language 0.2 spelling (L2); it is reported, never stored. */
    separator: ':' | '=';
    separatorColumn: number;
    value: AttributeValue;
    valueColumn: number;
  };

/**
 * A scanned value and how it was written. Edge attributes and constraint
 * parameters share the scanner and each applies its own grammar: an edge
 * attribute rejects `bare`, and a constraint keyword requires it (R2-5, R3-4).
 */
type AttributeValue =
  | { kind: 'string'; value: string; raw: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'boolean'; value: boolean; raw: string }
  | { kind: 'null'; value: null; raw: string }
  | { kind: 'bare'; value: string; raw: string };

/**
 * Scan an edge attribute list.
 *
 * Splitting on `,` breaks any quoted value containing one, so the list is
 * scanned instead: quotes are tracked, escapes are honoured, and a `,` or `]`
 * inside a quoted run is not a delimiter (R-009 AC-4, AC-5).
 */
function scanAttributes(input: string, allowSingleQuotes = false): ScannedAttribute[] {
  const out: ScannedAttribute[] = [];

  for (const part of splitTopLevelSpans(input, allowSingleQuotes)) {
    const trimmed = part.text.trim();
    if (!trimmed) continue;
    const column = part.start + (part.text.length - part.text.trimStart().length);

    const pair = trimmed.match(/^(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_][A-Za-z0-9_]*))(\s*)(=|:)\s*([\s\S]+)$/);
    if (pair) {
      const key = pair[1] !== undefined ? unescapeString(pair[1]) : pair[2];
      const keyText = pair[1] !== undefined ? `"${pair[1]}"` : pair[2];
      const raw = pair[5].trim();
      out.push({
        kind: 'pair', key, keyText, keyColumn: column,
        separator: pair[4] as ':' | '=', separatorColumn: column + keyText.length + pair[3].length,
        value: parseAttributeValue(raw, allowSingleQuotes), valueColumn: column + trimmed.length - raw.length,
      });
      continue;
    }

    const quoted = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (quoted) {
      out.push({ kind: 'quotedBare', value: unescapeString(quoted[1]), raw: trimmed, column });
      continue;
    }

    out.push({ kind: 'bare', value: trimmed, column });
  }

  return out;
}

/**
 * The canonical rewrite of an edge attribute list (grammar.ebnf `attributes`):
 * relation tokens, then line styles, then named attributes, each class in
 * source order. Tokens and values keep their raw text; a named attribute is
 * written with `:`.
 */
function canonicalAttributeList(items: readonly ScannedAttribute[]): string {
  const relations: string[] = [];
  const lineStyles: string[] = [];
  const named: string[] = [];
  for (const item of items) {
    if (item.kind === 'pair') named.push(`${item.keyText}: ${item.value.raw}`);
    else if (item.kind === 'quotedBare') relations.push(item.raw);
    else (isOneOf(LINE_STYLES, item.value) ? lineStyles : relations).push(item.value);
  }
  return `[${[...relations, ...lineStyles, ...named].join(', ')}]`;
}

/** Report the removed `=` spelling (L2) at the `=` token, naming the `:` replacement. */
function reportEquals(
  ctx: ParseContext,
  pair: Extract<ScannedAttribute, { kind: 'pair' }>,
  lineNumber: number,
  contentColumn: number,
): void {
  reportAt(ctx, 'coral.attribute.equals.unsupported',
    `"=" was removed in Coral Language 1.2.0; write ${pair.keyText}: ${pair.value.raw}`,
    tokenAt(lineNumber, contentColumn + pair.separatorColumn, '='));
}

/** Split on commas that are not inside a quoted run, keeping each part's offset. */
function splitTopLevelSpans(input: string, allowSingleQuotes = false): Array<{ text: string; start: number }> {
  let start = 0;
  return splitTopLevel(input, allowSingleQuotes).map((text) => {
    const span = { text, start };
    start += text.length + 1;
    return span;
  });
}

/** Split on commas that are not inside a quoted run. */
function splitTopLevel(input: string, allowSingleQuotes = false): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && i + 1 < input.length) {
        current += input[++i];
      } else if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === '"' || (allowSingleQuotes && ch === "'")) {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** An attribute value keeps its JavaScript type through the round-trip. */
function parseAttributeValue(raw: string, allowSingleQuotes = false): AttributeValue {
  const quoted = raw.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (quoted) return { kind: 'string', value: unescapeString(quoted[1]), raw };
  if (allowSingleQuotes && /^'(?:[^'\\]|\\.)*'$/.test(raw)) {
    return { kind: 'string', value: unescapeString(raw.slice(1, -1)), raw };
  }
  if (raw === 'true' || raw === 'false') return { kind: 'boolean', value: raw === 'true', raw };
  if (raw === 'null') return { kind: 'null', value: null, raw };
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
    const value = Number(raw);
    if (Number.isFinite(value)) return { kind: 'number', value, raw };
  }
  return { kind: 'bare', value: raw, raw };
}

function resolveSemanticReferences(graph: GraphIR, ctx: ParseContext): void {
  const nodes: GraphNode[] = [];
  const parents = new Map<string, string>();
  const walk = (items: GraphNode[], parent?: string) => {
    for (const node of items) {
      nodes.push(node);
      if (parent) parents.set(node.id, parent);
      if (node.children) walk(node.children, node.id);
    }
  };
  walk(graph.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byLabel = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (node.label === undefined) continue;
    const key = labelToId(node.label);
    const group = byLabel.get(key);
    if (group) group.push(node); else byLabel.set(key, [node]);
  }
  const resolve = (owner: object, field: string, raw: string, code: string): { value: string; resolved: boolean } => {
    if (byId.has(raw)) return { value: raw, resolved: true };
    const matches = byLabel.get(labelToId(raw)) ?? [];
    if (matches.length === 1) return { value: matches[0].id, resolved: true };
    const token = ctx.references.get(owner)?.get(field);
    if (token) reportAt(ctx, matches.length > 1 ? code.replace('.unresolved.', '.ambiguous.') : code,
      `Node reference "${raw}" is ${matches.length ? 'ambiguous' : 'unresolved'}`, token);
    return { value: raw, resolved: false };
  };

  for (const edge of graph.edges) {
    edge.source = resolve(edge, 'source', edge.source, 'coral.reference.unresolved.invalid').value;
    edge.target = resolve(edge, 'target', edge.target, 'coral.reference.unresolved.invalid').value;
    for (const waypoint of edge.routeIntent?.waypoints ?? []) {
      if (waypoint.placement.kind !== 'relative') continue;
      const anchor = waypoint.placement.anchor;
      if (anchor.kind === 'node' || anchor.kind === 'port') {
        const result = resolve(anchor, 'nodeId', anchor.nodeId, 'coral.route.anchor.invalid');
        anchor.nodeId = result.value;
        if (!result.resolved) continue;
      }
      if (anchor.kind === 'port') {
        const owner = byId.get(anchor.nodeId);
        if (!owner?.ports?.some((port) => port.id === anchor.portId)) {
          reportAt(ctx, 'coral.route.anchor.invalid',
            `Port anchor "${anchor.nodeId}.${anchor.portId}" is unresolved`,
            ctx.references.get(anchor)!.get('portId')!);
        }
      }
    }
  }

  for (const constraint of ctx.constraints) {
    if (constraint.kind === 'arrangement') {
      for (const subject of constraint.subjects) {
        subject.nodeId = resolve(subject, 'nodeId', subject.nodeId, 'coral.constraint.reference.unresolved.invalid').value;
      }
      continue;
    }
    const subjectResult = resolve(constraint.subject, 'nodeId', constraint.subject.nodeId, 'coral.constraint.reference.unresolved.invalid');
    constraint.subject.nodeId = subjectResult.value;
    if (constraint.kind === 'relative') {
      constraint.target.nodeId = resolve(constraint.target, 'nodeId', constraint.target.nodeId, 'coral.constraint.reference.unresolved.invalid').value;
      continue;
    }
    if (constraint.scope.kind === 'node') {
      const scopeResult = resolve(constraint.scope, 'nodeId', constraint.scope.nodeId, 'coral.constraint.reference.unresolved.invalid');
      constraint.scope.nodeId = scopeResult.value;
      if (!subjectResult.resolved || !scopeResult.resolved) continue;
      let cursor = parents.get(constraint.subject.nodeId);
      let valid = false;
      while (cursor) {
        if (cursor === constraint.scope.nodeId) {
          valid = true;
          break;
        }
        cursor = parents.get(cursor);
      }
      if (!valid) {
        const subjectToken = ctx.references.get(constraint.subject)?.get('nodeId');
        reportAt(ctx, 'coral.constraint.scope.invalid',
          `Boundary scope "${constraint.scope.nodeId}" is not an ancestor of "${constraint.subject.nodeId}"`,
          ctx.references.get(constraint.scope)!.get('nodeId')!,
          subjectToken ? [{ message: 'Boundary subject', ...tokenLocation(ctx, subjectToken) }] : undefined);
      }
    }
  }
}

export { labelToId };
