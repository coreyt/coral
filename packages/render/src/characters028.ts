/** Bounded, DOM-free character ledger for installed Block and flowchart GraphIR. */
import type { GraphIR } from '@graph-ir/core';
import { FONT_SHA_BY_FACE_029 as FONT_SHA_BY_FACE } from './characterGlyphRoles028.js';

export type CharacterColumns028 = 40 | 80 | 120;
export type CharacterCharset028 = 'ASCII' | 'MonoTrue-v1';
export interface MonoTrueCapability028 {
  profile: 'monotrue-v1';
  selected: true;
  face: 'Regular' | 'Bold' | 'Italic' | 'BoldItalic';
  fontSha256: string;
  validatedRoles: readonly string[];
}
export interface CharacterOptions028 {
  columns: CharacterColumns028;
  /** A copy/export has an unknown recipient font and is always ASCII. */
  target?: 'copy-export' | 'controlled-display';
  monoTrue?: MonoTrueCapability028;
}
export interface CharacterDiagnostic028 {
  code: string;
  /** `info` is a notice, such as `character.symbol.local-fallback`. */
  severity: 'warning' | 'error' | 'info';
  message: string;
  path?: string;
}
export interface CharacterResult028 {
  text: string;
  charset: CharacterCharset028;
  width: CharacterColumns028;
  height: number;
  diagnostics: CharacterDiagnostic028[];
}

export class CharacterRenderError extends Error {
  readonly code: string;
  readonly diagnostics: CharacterDiagnostic028[];
  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'CharacterRenderError';
    this.code = code;
    this.diagnostics = [{ code, severity: 'error', message, ...(path ? { path } : {}) }];
  }
}

const BOX_ROLES = [
  'stroke.single.nw', 'stroke.single.h', 'stroke.single.ne',
  'stroke.single.v', 'stroke.single.sw', 'stroke.single.se',
] as const;
const MAX_FIELD_UNITS = 2048;
const MAX_TOTAL_FIELD_UNITS = 8192;
const MAX_OUTPUT_ROWS = 1024;
const MAX_OUTPUT_CELLS = 65536;
type Profile028 = 'block' | 'flowchart';
type InputRecord = Record<string, unknown>;

function fail(code: string, message: string, path?: string): never {
  throw new CharacterRenderError(code, message, path);
}

function record(value: unknown, path: string): InputRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('character.field.invalid', 'Expected a record.', path);
  }
  return value as InputRecord;
}

function allowedKeys(value: InputRecord, names: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!names.includes(key)) fail('character.field.unsupported', `Unsupported field ${key}.`, `${path}.${key}`);
  }
}

function scalarString(value: unknown, path: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value)) {
    fail('character.field.invalid', 'Expected a nonempty string.', path);
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 >= value.length || value.charCodeAt(i + 1) < 0xdc00 || value.charCodeAt(i + 1) > 0xdfff) {
        fail('character.label.invalid-scalar', 'Unpaired UTF-16 surrogate.', path);
      }
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail('character.label.invalid-scalar', 'Unpaired UTF-16 surrogate.', path);
    }
  }
  return value;
}

/** Escape one scalar stream into portable printable ASCII. */
export function encodeCharacterField028(value: string): string {
  scalarString(value, 'field', true);
  return Array.from(value, (char) => {
    const code = char.codePointAt(0)!;
    if (char === '\\') return '\\\\';
    if (char === '"') return '\\"';
    if (code >= 0x20 && code <= 0x7e && char !== '|') return char;
    return `\\u{${code.toString(16).toUpperCase()}}`;
  }).join('');
}

/** Decode a field without its surrounding ledger quotes. */
export function decodeCharacterField028(encoded: string): string {
  let result = '';
  for (let i = 0; i < encoded.length;) {
    const char = encoded[i]!;
    if (char !== '\\') {
      if (char === '"' || char === '|' || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) > 0x7e) {
        fail('character.escape.invalid', 'Unescaped field character.');
      }
      result += char;
      i++;
      continue;
    }
    const next = encoded[i + 1];
    if (next === '\\' || next === '"') {
      result += next;
      i += 2;
      continue;
    }
    const match = /^\\u\{([0-9A-F]+)\}/.exec(encoded.slice(i));
    if (!match) fail('character.escape.invalid', 'Invalid scalar escape.');
    const code = Number.parseInt(match[1]!, 16);
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      fail('character.escape.invalid', 'Invalid Unicode scalar.');
    }
    result += String.fromCodePoint(code);
    i += match[0].length;
  }
  return result;
}

export function characterFieldLines028(tag: 'I' | 'L' | 'F' | 'T', value: string, columns: number): string[] {
  const max = columns - 4;
  const tokens = Array.from(value, (char) => encodeCharacterField028(char));
  const chunks: string[] = [];
  let current = '';
  for (const token of tokens) {
    if (current.length + token.length > max) {
      if (!current) fail('character.width.unsupported', 'One scalar escape exceeds line width.');
      chunks.push(current);
      current = '';
    }
    current += token;
  }
  chunks.push(current);
  return chunks.map((chunk) => `${tag} "${chunk}"`);
}

function nodeRole(node: InputRecord, profile: Profile028, path: string): string {
  allowedKeys(node, ['id', 'type', 'label', 'symbol', 'variant'], path);
  const type = node.type;
  if (profile === 'block') {
    if (type !== 'block' || node.symbol !== undefined || node.variant !== undefined) {
      fail('character.role.unsupported', 'Only generic Block units are accepted.', path);
    }
    return 'block';
  }
  if (type === 'terminal' && (node.variant === 'start' || node.variant === 'end') &&
      (node.symbol === undefined || node.symbol === 'flowchart-terminal')) return node.variant;
  if (type === 'process' && node.variant === undefined &&
      (node.symbol === undefined || node.symbol === 'flowchart-process')) return 'process';
  if (type === 'decision' && node.variant === undefined &&
      (node.symbol === undefined || node.symbol === 'flowchart-decision')) return 'decision';
  fail('character.role.unsupported', 'Flowchart role is absent or unsupported.', path);
}

interface SafeNode { id: string; role: string; label?: string }
interface SafeEdge { id: string; source: string; target: string; label?: string }
export interface CharacterLedger028 {
  profile: Profile028;
  charset: CharacterCharset028;
  graphId: string;
  graphName?: string;
  nodes: SafeNode[];
  edges: SafeEdge[];
}

/** Read the authoritative fields and verify that every index box names its ledger node. */
export function parseCharacterLedger028(text: string): CharacterLedger028 {
  if (text.length > MAX_OUTPUT_CELLS + MAX_OUTPUT_ROWS || !text.endsWith('\n') || text.includes('\r')) {
    fail('character.ledger.invalid', 'Ledger text exceeds bounds or has invalid line endings.');
  }
  const lines = text.slice(0, -1).split('\n');
  if (lines.length > MAX_OUTPUT_ROWS || lines.some((line) => line.length > 120)) {
    fail('character.ledger.invalid', 'Ledger rows exceed bounds.');
  }
  const header = /^CHAR\/1 (block|flowchart) (ASCII|MonoTrue-v1)$/.exec(lines[0] ?? '');
  if (!header || lines[1] !== 'GRAPH') fail('character.ledger.invalid', 'Invalid ledger header.');
  const profile = header[1] as Profile028;
  const charset = header[2] as CharacterCharset028;
  let cursor = 2;
  const read = (tag: 'I' | 'L' | 'F' | 'T'): string => {
    const prefix = `${tag} "`;
    let seen = false;
    let result = '';
    while (lines[cursor]?.startsWith(prefix) && lines[cursor]?.endsWith('"')) {
      const line = lines[cursor++]!;
      result += decodeCharacterField028(line.slice(prefix.length, -1));
      seen = true;
    }
    if (!seen) fail('character.ledger.invalid', `Missing ${tag} field.`);
    return result;
  };
  const graphId = read('I');
  const graphName = lines[cursor]?.startsWith('L "') ? read('L') : undefined;
  const top = charset === 'ASCII' ? `+${'-'.repeat(14)}+` : `┌${'─'.repeat(14)}┐`;
  const bottom = charset === 'ASCII' ? top : `└${'─'.repeat(14)}┘`;
  const vertical = charset === 'ASCII' ? '|' : '│';
  const boxes: string[] = [];
  while (lines[cursor] !== 'LEDGER') {
    if (cursor + 2 >= lines.length || lines[cursor] !== top || lines[cursor + 2] !== bottom) {
      fail('character.ledger.invalid', 'Invalid index box.');
    }
    boxes.push(lines[cursor + 1]!);
    cursor += 3;
  }
  cursor++;
  const nodes: SafeNode[] = [];
  const edges: SafeEdge[] = [];
  while (lines[cursor]?.startsWith('N ')) {
    if (lines[cursor++] !== `N ${String(nodes.length + 1).padStart(2, '0')}`) {
      fail('character.ledger.invalid', 'Node index is not consecutive.');
    }
    const id = read('I');
    const roleLine = lines[cursor++] ?? '';
    const role = roleLine.startsWith('R ') ? roleLine.slice(2) : '';
    if (!(profile === 'block' ? role === 'block' : ['start', 'end', 'process', 'decision'].includes(role))) {
      fail('character.ledger.invalid', 'Node role is invalid.');
    }
    const label = lines[cursor]?.startsWith('L "') ? read('L') : undefined;
    nodes.push({ id, role, ...(label === undefined ? {} : { label }) });
  }
  while (lines[cursor]?.startsWith('E ')) {
    if (lines[cursor++] !== `E ${String(edges.length + 1).padStart(2, '0')}`) {
      fail('character.ledger.invalid', 'Edge index is not consecutive.');
    }
    const id = read('I');
    const source = read('F');
    const target = read('T');
    if (lines[cursor++] !== 'K flow') fail('character.ledger.invalid', 'Edge kind is invalid.');
    const label = lines[cursor]?.startsWith('L "') ? read('L') : undefined;
    edges.push({ id, source, target, ...(label === undefined ? {} : { label }) });
  }
  if (cursor !== lines.length || boxes.length !== nodes.length ||
      boxes.some((box, index) => box !== `${vertical}${`${String(index + 1).padStart(2, '0')} ${nodes[index]!.role}`.padEnd(14)}${vertical}`)) {
    fail('character.ledger.invalid', 'Ledger records or index boxes disagree.');
  }
  return { profile, charset, graphId, ...(graphName === undefined ? {} : { graphName }), nodes, edges };
}

function safeProjection(graph: GraphIR): {
  profile: Profile028; id: string; name?: string; nodes: SafeNode[]; edges: SafeEdge[];
} {
  let fieldUnits = 0;
  const boundedString = (value: unknown, path: string, empty = false): string => {
    if (typeof value === 'string' && value.length > MAX_FIELD_UNITS) {
      fail('character.size.unsupported', `Field exceeds ${MAX_FIELD_UNITS} UTF-16 units.`, path);
    }
    const string = scalarString(value, path, empty);
    fieldUnits += string.length;
    if (fieldUnits > MAX_TOTAL_FIELD_UNITS) {
      fail('character.size.unsupported', `Text exceeds ${MAX_TOTAL_FIELD_UNITS} UTF-16 units.`, path);
    }
    return string;
  };
  const root = record(graph, 'graph');
  allowedKeys(root, ['version', 'id', 'name', 'nodes', 'edges', 'metadata'], 'graph');
  if (root.version !== '3.0.0') fail('character.graph.version', 'GraphIR 3 is required.', 'version');
  const id = boundedString(root.id, 'id');
  const name = root.name === undefined ? undefined : boundedString(root.name, 'name', true);
  const metadata = record(root.metadata, 'metadata');
  allowedKeys(metadata, ['notation'], 'metadata');
  const profile = metadata.notation;
  if (profile !== 'block' && profile !== 'flowchart') {
    fail('character.notation.unsupported', 'No accepted character profile for this notation.', 'metadata.notation');
  }
  if (!Array.isArray(root.nodes) || !Array.isArray(root.edges)) {
    fail('character.graph.invalid', 'Nodes and edges must be arrays.');
  }
  if (root.nodes.length > 40 || root.edges.length > 80) {
    fail('character.size.unsupported', 'The bounded character slice accepts at most 40 nodes and 80 edges.');
  }
  const ids = new Set<string>();
  const nodes = root.nodes.map((value, index) => {
    const path = `nodes.${index}`;
    const node = record(value, path);
    const nodeId = boundedString(node.id, `${path}.id`);
    if (ids.has(nodeId)) fail('character.id.duplicate', 'Duplicate node ID.', `${path}.id`);
    ids.add(nodeId);
    const role = nodeRole(node, profile, path);
    const label = node.label === undefined ? undefined : boundedString(node.label, `${path}.label`, true);
    return { id: nodeId, role, ...(label === undefined ? {} : { label }) };
  });
  const edgeIds = new Set<string>();
  const edges = root.edges.map((value, index) => {
    const path = `edges.${index}`;
    const edge = record(value, path);
    allowedKeys(edge, ['id', 'source', 'target', 'label', 'type', 'sourceEnd', 'targetEnd'], path);
    const edgeId = boundedString(edge.id, `${path}.id`);
    if (edgeIds.has(edgeId)) fail('character.id.duplicate', 'Duplicate edge ID.', `${path}.id`);
    edgeIds.add(edgeId);
    const source = boundedString(edge.source, `${path}.source`);
    const target = boundedString(edge.target, `${path}.target`);
    if (!ids.has(source) || !ids.has(target)) {
      fail('character.edge.endpoint', 'Edge endpoint is missing.', path);
    }
    if (edge.type !== undefined && edge.type !== 'flow') {
      fail('character.edge.unsupported', 'Unsupported edge relation.', `${path}.type`);
    }
    const sourceEnd = record(edge.sourceEnd, `${path}.sourceEnd`);
    const targetEnd = record(edge.targetEnd, `${path}.targetEnd`);
    allowedKeys(sourceEnd, ['marker'], `${path}.sourceEnd`);
    allowedKeys(targetEnd, ['marker'], `${path}.targetEnd`);
    const sourceMarker = record(sourceEnd.marker, `${path}.sourceEnd.marker`);
    const targetMarker = record(targetEnd.marker, `${path}.targetEnd.marker`);
    allowedKeys(sourceMarker, ['kind', 'fill'], `${path}.sourceEnd.marker`);
    allowedKeys(targetMarker, ['kind', 'fill'], `${path}.targetEnd.marker`);
    if (sourceMarker.kind !== 'none' || sourceMarker.fill !== 'unspecified' ||
        targetMarker.kind !== 'arrow' || targetMarker.fill !== 'open') {
      fail('character.edge.direction', 'Only forward, open-arrow edges are accepted.', path);
    }
    const label = edge.label === undefined ? undefined : boundedString(edge.label, `${path}.label`, true);
    return { id: edgeId, source, target, ...(label === undefined ? {} : { label }) };
  });
  return { profile, id, ...(name === undefined ? {} : { name }), nodes, edges };
}

export function monoTrueReady028(options: CharacterOptions028, requiredRoles: readonly string[] = BOX_ROLES): boolean {
  const capability = options.monoTrue;
  return options.target === 'controlled-display' && capability?.profile === 'monotrue-v1' &&
    capability.selected === true && FONT_SHA_BY_FACE[capability.face] === capability.fontSha256 &&
    requiredRoles.every((role) => capability.validatedRoles.includes(role));
}

export function renderCharacterGraph028(graph: GraphIR, options: CharacterOptions028): CharacterResult028 {
  if (![40, 80, 120].includes(options.columns)) {
    fail('character.width.unsupported', 'Width must be 40, 80 or 120 columns.', 'columns');
  }
  const safe = safeProjection(graph);
  const unicode = monoTrueReady028(options);
  const charset: CharacterCharset028 = unicode ? 'MonoTrue-v1' : 'ASCII';
  const lines = [`CHAR/1 ${safe.profile} ${charset}`, 'GRAPH',
    ...characterFieldLines028('I', safe.id, options.columns),
    ...(safe.name === undefined ? [] : characterFieldLines028('L', safe.name, options.columns))];
  const top = unicode ? `┌${'─'.repeat(14)}┐` : `+${'-'.repeat(14)}+`;
  const bottom = unicode ? `└${'─'.repeat(14)}┘` : top;
  const vertical = unicode ? '│' : '|';
  safe.nodes.forEach((node, index) => {
    const content = `${String(index + 1).padStart(2, '0')} ${node.role}`;
    lines.push(top, `${vertical}${content.padEnd(14)}${vertical}`, bottom);
  });
  lines.push('LEDGER');
  safe.nodes.forEach((node, index) => {
    lines.push(`N ${String(index + 1).padStart(2, '0')}`,
      ...characterFieldLines028('I', node.id, options.columns), `R ${node.role}`,
      ...(node.label === undefined ? [] : characterFieldLines028('L', node.label, options.columns)));
  });
  safe.edges.forEach((edge, index) => {
    lines.push(`E ${String(index + 1).padStart(2, '0')}`,
      ...characterFieldLines028('I', edge.id, options.columns),
      ...characterFieldLines028('F', edge.source, options.columns),
      ...characterFieldLines028('T', edge.target, options.columns), 'K flow',
      ...(edge.label === undefined ? [] : characterFieldLines028('L', edge.label, options.columns)));
  });
  if (lines.length > MAX_OUTPUT_ROWS || lines.reduce((cells, line) => cells + line.length, 0) > MAX_OUTPUT_CELLS) {
    fail('character.size.unsupported', 'Rendered output exceeds the row or cell budget.');
  }
  if (lines.some((line) => line.length > options.columns)) {
    fail('character.width.unsupported', 'Encoded row exceeds requested width.');
  }
  const text = lines.join('\n') + '\n';
  if (!unicode && !/^[\x20-\x7e\n]*$/.test(text)) {
    fail('character.charset.invalid', 'ASCII output contains an invalid byte.');
  }
  const verified = parseCharacterLedger028(text);
  if (verified.profile !== safe.profile || verified.charset !== charset || verified.graphId !== safe.id ||
      verified.graphName !== safe.name || JSON.stringify(verified.nodes) !== JSON.stringify(safe.nodes) ||
      JSON.stringify(verified.edges) !== JSON.stringify(safe.edges)) {
    fail('character.ledger.invalid', 'Rendered ledger did not round-trip source meaning.');
  }
  return { text, charset, width: options.columns, height: lines.length,
    diagnostics: [{ code: 'character.spatial.ledger', severity: 'warning',
      message: 'Relationship routes are represented by the keyed ledger.' }] };
}
