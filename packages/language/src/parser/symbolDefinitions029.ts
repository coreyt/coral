/** Edition 0.2.9 document-local symbol definitions. The header scanner owns
 * each region and its raw artwork spans; this reader never tokenizes raw
 * content and hands it, byte for byte, to the artwork admission hook. */
import { parseDiagnostic, type DiagnosticRange, type ParseDiagnostic } from '../diagnostics.js';
import { parsePortLine028, scanSourceLine028, type CandidateToken } from './candidate028.js';
import type { HeaderOffsetSpan029, SymbolDefinitionRegion029 } from './header028.js';

export type UserSymbolSide = 'N' | 'E' | 'S' | 'W';
export type UserSymbolLabelPlacement = 'above' | 'below' | 'left' | 'right' | 'center';
export type UserSymbolOutline = 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
export type UserSymbolTint = 'none' | 'stroke';
export type UserSymbolAnchor =
  | { kind: 'boundary'; id: string; side: UserSymbolSide; at: number }
  | { kind: 'interior'; id: string; x: number; y: number; exit: UserSymbolSide };
export interface UserSymbolPort {
  id: string;
  direction: 'in' | 'out' | 'inout';
  anchor?: string;
  label?: string;
  maxConnections?: number;
}
/** Authored artwork text; admission (and its typed model) belongs to the artwork profile. */
export interface UserSymbolArtwork {
  format: 'svg';
  text: string;
  content: HeaderOffsetSpan029;
}
export interface UserSymbolDefinition {
  /** Authored ID; nodes select it as `local.<id>`. */
  id: string;
  symbolId: string;
  name: string;
  description?: string;
  tags: string[];
  size: { width: number; height: number };
  label: UserSymbolLabelPlacement;
  outline: UserSymbolOutline;
  tint: UserSymbolTint;
  source?: string;
  license?: string;
  anchors: UserSymbolAnchor[];
  ports: UserSymbolPort[];
  artwork: UserSymbolArtwork;
  range: DiagnosticRange;
}
export interface ArtworkAdmissionInput029 {
  definitionId: string;
  format: 'svg';
  text: string;
  content: HeaderOffsetSpan029;
  /** The `artwork svg """` opening, for locating findings without raw offsets. */
  open: DiagnosticRange;
}
/** Source ranges of a definition's anchor IDs and of its ports' anchor values. */
export interface SymbolDefinitionCheckLines029 {
  anchors: ReadonlyMap<string, DiagnosticRange>;
  portAnchors: ReadonlyMap<string, DiagnosticRange>;
}
export interface SymbolDefinitionOptions029 {
  /** Artwork admission hook; a finding withholds the definition. */
  admitArtwork?: (artwork: ArtworkAdmissionInput029) => readonly ParseDiagnostic[];
  /** Outline geometry and port-anchor checks for an otherwise valid definition;
   * a finding withholds the definition. */
  checkDefinition?: (definition: Omit<UserSymbolDefinition, 'range'>,
    lines: SymbolDefinitionCheckLines029) => readonly ParseDiagnostic[];
}
export interface SymbolDefinitionResult029 {
  definitions: UserSymbolDefinition[];
  diagnostics: ParseDiagnostic[];
}

/** Spellings with generic port-anchor meaning, as in symbolAnchors028.ts. */
const GENERIC_ANCHOR_NAMES = new Set([
  'auto', 'side', 'corner', 'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
  'up', 'down', 'right', 'left',
]);
const SIDES = new Set(['N', 'E', 'S', 'W']);
const LABELS = new Set(['above', 'below', 'left', 'right', 'center']);
const OUTLINES = new Set(['rectangle', 'rounded', 'ellipse', 'diamond']);
const TINTS = new Set(['none', 'stroke']);
const BARE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ARTWORK = /^([ \t]*)(artwork)(?:[ \t]+([^ \t"]+))?[ \t]+"""[ \t]*$/;
const TRIVIA = /^[ \t]*(?:\/\/.*)?$/;
type Field = 'name' | 'description' | 'tags' | 'size' | 'label' | 'outline' | 'tint' | 'source' | 'license' |
  'artwork';
const QUOTED_FIELDS = new Set<Field>(['name', 'description', 'source', 'license']);
const SINGLE_FIELDS = new Set<string>(['name', 'description', 'tags', 'size', 'label', 'outline', 'tint',
  'source', 'license']);

interface Line { text: string; start: number; number: number }
function linesOf(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  let number = 1;
  for (let index = 0; index <= source.length; index++) {
    if (index < source.length && source[index] !== '\n') continue;
    lines.push({ text: source.slice(start, index).replace(/\r$/, ''), start, number: number++ });
    start = index + 1;
  }
  return lines;
}
function lineRange(line: Line, start: number, end: number): DiagnosticRange {
  return { start: { line: line.number, column: start, offset: line.start + start },
    end: { line: line.number, column: end, offset: line.start + end } };
}
function span(first: CandidateToken, last: CandidateToken): DiagnosticRange {
  return { start: first.range.start, end: last.range.end };
}
function diagnostic(code: string, message: string, range: DiagnosticRange,
  related?: DiagnosticRange): ParseDiagnostic {
  return parseDiagnostic({ severity: 'error', code, message, position: range.start, range,
    ...(related ? { related: [{ message: 'First occurrence', position: related.start, range: related }] } : {}) });
}
const unitNumber = (token: CandidateToken | undefined): number | undefined => {
  if (token?.kind !== 'number') return undefined;
  const value = Number(token.raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
};

/** Parse every region the header scanner returned, in authored order. */
export function parseSymbolDefinitions029(source: string, regions: readonly SymbolDefinitionRegion029[],
  options: SymbolDefinitionOptions029 = {}): SymbolDefinitionResult029 {
  const lines = linesOf(source);
  const diagnostics: ParseDiagnostic[] = [];
  const definitions: UserSymbolDefinition[] = [];
  const seenIds = new Map<string, DiagnosticRange>();
  for (const region of regions) {
    // The header scanner has already reported a malformed, unclosed or late region.
    if (region.id === undefined || !region.close || region.late) continue;
    const openLine = lines[region.open.start.line - 1]!;
    const idColumn = openLine.text.indexOf(region.id, region.open.start.column + '@symbol'.length);
    const idRange = lineRange(openLine, idColumn, idColumn + region.id.length);
    const first = seenIds.get(region.id);
    if (first) {
      diagnostics.push(diagnostic('coral.symbol.local.duplicate',
        `Symbol ${region.id} is already defined in this document.`, idRange, first));
      continue;
    }
    seenIds.set(region.id, idRange);
    const owner: CandidateToken = { kind: 'id', raw: region.id, value: region.id, range: idRange };
    const before = diagnostics.length;
    const fields = new Map<string, DiagnosticRange>();
    const value: Partial<Omit<UserSymbolDefinition, 'anchors' | 'ports'>> = {};
    const anchors: UserSymbolAnchor[] = [];
    const anchorIds = new Map<string, DiagnosticRange>();
    const ports: UserSymbolPort[] = [];
    const portIds = new Map<string, DiagnosticRange>();
    const portAnchors = new Map<string, DiagnosticRange>();
    let artworkOpen: DiagnosticRange | undefined;
    const raw = region.rawBlocks;
    for (const line of lines.slice(region.open.start.line, region.close.start.line - 1)) {
      if (raw.some((block) => line.start >= block.content.start && line.start < block.content.end ||
        block.close?.start.offset === line.start)) continue;
      if (TRIVIA.test(line.text)) continue;
      const invalid = (range: DiagnosticRange, field: string) => diagnostics.push(diagnostic(
        'coral.symbol.local.field.invalid', `Malformed ${field} line in symbol ${region.id}.`, range));
      const claim = (field: string, range: DiagnosticRange): boolean => {
        const prior = fields.get(field);
        if (prior) {
          diagnostics.push(diagnostic('coral.symbol.local.field.duplicate',
            `Symbol ${region.id} already has a ${field} line.`, range, prior));
          return false;
        }
        fields.set(field, range);
        return true;
      };
      const block = raw.find((item) => item.open.start.line === line.number);
      if (block) {
        const at = block.open.start.column;
        const keyword = lineRange(line, at, at + 'artwork'.length);
        if (!claim('artwork', keyword)) continue;
        const artwork = ARTWORK.exec(line.text);
        if (!artwork) {
          invalid(block.open, 'artwork');
          continue;
        }
        const format = artwork[3];
        if (format !== 'svg') {
          const formatAt = format === undefined ? at : line.text.indexOf(format, at + 'artwork'.length);
          invalid(format === undefined ? keyword : lineRange(line, formatAt, formatAt + format.length), 'artwork');
          continue;
        }
        artworkOpen = block.open;
        value.artwork = { format: 'svg', text: source.slice(block.content.start, block.content.end),
          content: { ...block.content } };
        continue;
      }
      const scanned = scanSourceLine028(line.text, line.start, line.number);
      if (scanned.diagnostics.length) { diagnostics.push(...scanned.diagnostics); continue; }
      const tokens = scanned.tokens;
      const keyword = tokens[0]!;
      const whole = span(keyword, tokens[tokens.length - 1]!);
      if (keyword.kind === 'id' && BARE.test(keyword.raw) && tokens[1]?.raw === 'port') {
        const parsed = parsePortLine028(tokens, line.text, line.start, line.number, owner, '0.2.9');
        diagnostics.push(...parsed.diagnostics);
        const port = parsed.port;
        if (!port) continue;
        const prior = portIds.get(port.id.value);
        if (prior) {
          diagnostics.push(diagnostic('coral.identity.port.duplicate',
            `Duplicate port ID on ${region.id}: ${port.id.value}`, port.id.range, prior));
          continue;
        }
        portIds.set(port.id.value, port.id.range);
        if (port.anchor) portAnchors.set(port.id.value, port.anchor.range);
        ports.push({ id: port.id.value, direction: port.direction.value as UserSymbolPort['direction'],
          ...(port.anchor ? { anchor: port.anchor.value } : {}),
          ...(port.label ? { label: port.label.value } : {}),
          ...(port.maxConnections ? { maxConnections: Number(port.maxConnections.raw) } : {}) });
        continue;
      }
      if (keyword.raw === 'anchor') {
        const anchor = parseAnchor(tokens, region.id, anchorIds, diagnostics);
        if (anchor) anchors.push(anchor);
        continue;
      }
      if (!SINGLE_FIELDS.has(keyword.raw)) {
        diagnostics.push(diagnostic('coral.symbol.local.field.unknown',
          `Unknown line in symbol ${region.id}: ${keyword.raw}`, keyword.range));
        continue;
      }
      const field = keyword.raw as Field;
      if (!claim(field, keyword.range)) continue;
      const operand = tokens[1];
      if (QUOTED_FIELDS.has(field)) {
        if (tokens.length !== 2) invalid(whole, field);
        else if (operand!.kind !== 'string' || field === 'name' && !operand!.value.trim())
          invalid(operand!.range, field);
        else value[field as 'name'] = operand!.value;
      } else if (field === 'tags') {
        if (tokens.length < 2) { invalid(whole, field); continue; }
        const tags: string[] = [];
        const bad = tokens.slice(1).find((token) => token.kind !== 'string' || !token.value.trim() ||
          tags.includes(token.value) || !tags.push(token.value));
        if (bad) invalid(bad.range, field);
        else value.tags = tags;
      } else if (field === 'size') {
        if (tokens.length !== 4 || tokens[2]!.raw !== 'x') { invalid(whole, field); continue; }
        const [width, height] = [tokens[1]!, tokens[3]!].map((token) =>
          token.kind === 'number' && Number.isFinite(Number(token.raw)) && Number(token.raw) > 0
            ? Number(token.raw) : undefined);
        if (width === undefined) invalid(tokens[1]!.range, field);
        else if (height === undefined) invalid(tokens[3]!.range, field);
        else value.size = { width, height };
      } else {
        const allowed = field === 'label' ? LABELS : field === 'outline' ? OUTLINES : TINTS;
        if (tokens.length !== 2) invalid(whole, field);
        else if (operand!.kind !== 'id' || !allowed.has(operand!.raw)) invalid(operand!.range, field);
        else value[field as 'label'] = operand!.raw as never;
      }
    }
    for (const [field, article] of [['name', 'a name line'], ['size', 'a size line'],
      ['artwork', 'an artwork block']] as const)
      if (!fields.has(field)) diagnostics.push(diagnostic('coral.symbol.local.field.required',
        `Symbol ${region.id} requires ${article}.`, region.open));
    if (value.artwork && options.admitArtwork) diagnostics.push(...options.admitArtwork({
      definitionId: region.id, format: 'svg', text: value.artwork.text, content: { ...value.artwork.content },
      open: artworkOpen! }));
    if (diagnostics.length !== before) continue;
    const definition: Omit<UserSymbolDefinition, 'range'> = { id: region.id, symbolId: `local.${region.id}`,
      name: value.name!,
      ...(value.description !== undefined ? { description: value.description } : {}),
      tags: value.tags ?? [], size: value.size!, label: value.label ?? 'below',
      outline: value.outline ?? 'rectangle', tint: value.tint ?? 'none',
      ...(value.source !== undefined ? { source: value.source } : {}),
      ...(value.license !== undefined ? { license: value.license } : {}),
      anchors, ports, artwork: value.artwork! };
    const checked = options.checkDefinition?.(definition, { anchors: anchorIds, portAnchors }) ?? [];
    if (checked.length) { diagnostics.push(...checked); continue; }
    definitions.push({ ...definition, range: region.range });
  }
  return { definitions, diagnostics };
}

/** `anchor <id> [side: N|E|S|W, at: n]` or `anchor <id> [x: n, y: n, exit: N|E|S|W]`.
 * Whether an interior point lies inside the outline, and whether an exit
 * from the outline is strictly outward, is decided by the outline geometry. */
function parseAnchor(tokens: CandidateToken[], symbolId: string, ids: Map<string, DiagnosticRange>,
  diagnostics: ParseDiagnostic[]): UserSymbolAnchor | undefined {
  const keyword = tokens[0]!;
  const id = tokens[1];
  const invalid = (range: DiagnosticRange, message: string) => {
    diagnostics.push(diagnostic('coral.symbol.local.anchor.invalid', message, range));
    return undefined;
  };
  const whole = span(keyword, tokens[tokens.length - 1]!);
  if (id?.kind !== 'id' || !BARE.test(id.raw)) return invalid(id?.range ?? whole,
    `Expected anchor <id> [...] in symbol ${symbolId}.`);
  if (GENERIC_ANCHOR_NAMES.has(id.raw)) return invalid(id.range,
    `${id.raw} already names a generic anchor; choose another anchor ID.`);
  const prior = ids.get(id.raw);
  if (prior) {
    diagnostics.push(diagnostic('coral.symbol.local.anchor.duplicate',
      `Symbol ${symbolId} already has an anchor ${id.raw}.`, id.range, prior));
    return undefined;
  }
  ids.set(id.raw, id.range);
  const values = new Map<string, CandidateToken>();
  if (tokens[2]?.raw !== '[') return invalid(whole, 'Expected a keyed anchor bracket.');
  let at = 3;
  while (at < tokens.length && tokens[at]!.raw !== ']') {
    const key = tokens[at];
    const value = tokens[at + 2];
    if (key?.kind !== 'id' || !['side', 'at', 'x', 'y', 'exit'].includes(key.raw) ||
      tokens[at + 1]?.raw !== ':' || !value || values.has(key.raw))
      return invalid(key?.range ?? whole, 'Anchor fields are side and at, or x, y and exit, each once.');
    values.set(key.raw, value);
    at += 3;
    if (tokens[at]?.raw === ',' && tokens[at + 1]?.raw !== ']') at++;
    else if (tokens[at]?.raw !== ']') return invalid(tokens[at]?.range ?? whole,
      'Expected a comma or closing bracket in the anchor.');
  }
  if (tokens[at]?.raw !== ']' || at !== tokens.length - 1) return invalid(whole,
    'An anchor line ends with its closing bracket.');
  const keys = [...values.keys()].sort().join(',');
  const side = (key: 'side' | 'exit') => {
    const token = values.get(key)!;
    return token.kind === 'id' && SIDES.has(token.raw) ? token.raw as UserSymbolSide : undefined;
  };
  if (keys === 'at,side') {
    const sideValue = side('side');
    const position = unitNumber(values.get('at'));
    if (!sideValue) return invalid(values.get('side')!.range, 'Anchor side must be N, E, S or W.');
    if (position === undefined) return invalid(values.get('at')!.range, 'Anchor at must be a number from 0 to 1.');
    return { kind: 'boundary', id: id.raw, side: sideValue, at: position };
  }
  if (keys === 'exit,x,y') {
    const x = unitNumber(values.get('x'));
    const y = unitNumber(values.get('y'));
    const exit = side('exit');
    if (x === undefined) return invalid(values.get('x')!.range, 'Anchor x must be a number from 0 to 1.');
    if (y === undefined) return invalid(values.get('y')!.range, 'Anchor y must be a number from 0 to 1.');
    if (!exit) return invalid(values.get('exit')!.range, 'Anchor exit must be N, E, S or W.');
    return { kind: 'interior', id: id.raw, x, y, exit };
  }
  return invalid(whole, values.has('x') || values.has('y')
    ? 'An interior anchor needs x, y and exit.' : 'A boundary anchor needs side and at.');
}
