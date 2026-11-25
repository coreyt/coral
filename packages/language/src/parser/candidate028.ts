import type {SpatialConstraintSuccessor,LayoutOptionsSuccessor,RouteIntentSuccessor} from '@graph-ir/core';
import {parseConstraint028, parseLayout028, rectangleToken028, spatialParameters028, resolveSpatial028, spatialIssue028, type CandidateConstraintSyntax028, type CandidateLayoutSyntax028, type SpatialParameters028} from './spatialSource028.js';
import type { ClassifierAttribute, ClassifierCompartment, ClassifierOperation, GraphEdge, GraphIR, GraphNode, InteractionMessage } from '../types.js';
import { parseDiagnostic, type DiagnosticRange, type ParseDiagnostic } from '../diagnostics.js';
import { editionAdmitsUserSymbols029 } from './header028.js';
import { classifierFor } from '../uml.js';
import { SEQUENCE_PARTICIPANT_TYPES, sequenceMessageToken } from '../sequence.js';
import { CONNECTOR_END_SPELLINGS_028, connectorEndHasShorthand028, isDashedOpenArrow028, keyedConnectorEnd028,
  parseConnector028, type ConnectorSyntax028 } from './connector028.js';

/** Staged approved-core parser; not a second shipped Coral reader. */
export interface CandidateOptions {
  graphId?: string;
  /** Isolated-test context until the serialized header is approved. */
  profile?: string;
  /** Effective source edition; 0.2.9 admits port label and maxConnections. */
  edition?: string;
}

type Kind = 'id' | 'number' | 'string' | 'operator' | 'punctuation';
export interface CandidateToken {
  kind: Kind;
  raw: string;
  value: string;
  range: DiagnosticRange;
}
export interface CandidateNodeSyntax {
  kind: 'node'; id: CandidateToken; nodeKind: CandidateToken;
  /** Resolved identity; id retains the exact local source spelling. */
  qualifiedId?: string;
  assignment?: CandidateToken; label?: CandidateToken;
  symbol?: CandidateToken; variant?: CandidateToken;
  bracketClose?: CandidateToken;
  /** Exact symbol choice to which a local conformance exception is bound. */
  conformanceException?: CandidateToken;
  position?: { marker: CandidateToken; x: CandidateToken; y: CandidateToken };
  pinned?: CandidateToken;
  labelPlacement?: CandidateLabelPlacementSyntax;
  blockOpen?: CandidateToken;
  blockClose?: CandidateToken;
  parentGroup?: CandidateToken;
}
export interface CandidatePortSyntax {
  kind: 'port'; owner: CandidateToken;
  ownerQualifiedId?: string;
  id: CandidateToken; portKeyword: CandidateToken;
  direction: CandidateToken; anchor?: CandidateToken;
  /** Edition 0.2.9 quoted label and positive-integer connection limit. */
  label?: CandidateToken; maxConnections?: CandidateToken;
}
export interface CandidateEdgeSyntax {
  kind: 'edge'; id?: CandidateToken; assignment?: CandidateToken;
  /** Canonical identity; id retains the exact local source spelling. */
  qualifiedId?: string;
  scope?: CandidateToken[];
  resolvedSource?: string; resolvedTarget?: string;
  source: CandidateToken; operator: CandidateToken; target: CandidateToken;
  /** Port tokens remain attached to the written first/second endpoints. */
  sourcePort?: CandidateToken; targetPort?: CandidateToken;
  /** Preserve the literal operator independently of keyed end resolution. */
  operatorConnector?: CandidateConnectorSyntax;
  connector?: CandidateConnectorSyntax;
  bracketClose?: CandidateToken;
  firstEnd?: CandidateToken; secondEnd?: CandidateToken;
  style?: CandidateToken;
  styleIntent?: EdgeStyleIntent028;
  edgeType?: CandidateToken; typeOrigin?: 'bare' | 'keyed';
  label?: CandidateToken; labelOrigin?: 'as' | 'keyed';
  labelPlacement?: CandidateLabelPlacementSyntax;
}
export interface CandidateLabelPlacementSyntax {
  side: CandidateToken; at?: CandidateToken; offset?: CandidateToken;
}
export interface EdgeStyleIntent028 {
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  strokeColor?: string;
  strokeWeight?: 'regular' | 'thick';
  motion?: { kind: 'static' } | { kind: 'animated';
    direction: 'auto' | 'first-to-second' | 'second-to-first' };
}
export interface CandidateCompartmentSyntax {
  kind: 'compartment'; owner: CandidateToken;
  id?: CandidateToken; assignment?: CandidateToken;
  compartmentKind: CandidateToken; blockOpen: CandidateToken; blockClose?: CandidateToken;
}
export interface CandidateAttributeSyntax {
  kind: 'attribute'; owner: CandidateCompartmentSyntax;
  id?: CandidateToken; assignment?: CandidateToken;
  visibility: CandidateToken; memberKind?: CandidateToken;
  name: CandidateToken; colon: CandidateToken; valueType: CandidateToken;
}
export interface CandidateOperationSyntax {
  kind: 'operation'; owner: CandidateCompartmentSyntax;
  id?: CandidateToken; assignment?: CandidateToken;
  visibility: CandidateToken; memberKind?: CandidateToken;
  name: CandidateToken;
  parameters: { name: CandidateToken; type?: CandidateToken }[];
  returnType?: CandidateToken;
}
export interface CandidateArrangementSyntax {
  kind: 'arrangement'; id?: CandidateToken; assignment?: CandidateToken;
  /** Canonical identity; id retains the exact local source spelling. */
  qualifiedId?: string;
  scope?: CandidateToken[];
  keyword: CandidateToken; axis: CandidateToken; colon: CandidateToken;
  subjects: CandidateToken[];
  parameters?: SpatialParameters028;
}
export interface CandidateRouteWaypointSyntax {
  id: CandidateToken; x: CandidateToken; y: CandidateToken;
  /** First/second names the written endpoint, independent of arrow direction. */
  anchor?: CandidateToken;
  anchorNode?: CandidateToken;
  anchorPort?: CandidateToken;
  anchorWaypoint?: CandidateToken;
}
export interface CandidateRouteSyntax {
  kind: 'route'; routeKeyword: CandidateToken; edgeKeyword: CandidateToken;
  edge: CandidateToken; scope?: CandidateToken[];
  blockOpen: CandidateToken; blockClose?: CandidateToken;
  sawWaypointLine?: boolean;
  waypoints: CandidateRouteWaypointSyntax[];
}
export interface CandidateNoteSyntax {
  kind: 'note'; id?: CandidateToken; assignment?: CandidateToken;
  noteKeyword: CandidateToken; text: CandidateToken; onKeyword: CandidateToken;
  target: CandidateToken; targets: CandidateToken[];
}
export type CandidateSequenceItemSyntax = CandidateEdgeSyntax | CandidateFragmentSyntax |
  CandidateNoteSyntax | CandidateActivationSyntax | CandidateRegionSyntax;
export interface CandidateFragmentOperandSyntax {
  guard?: CandidateToken;
  items: CandidateSequenceItemSyntax[];
}
export interface CandidateFragmentSyntax {
  kind: 'fragment'; id?: CandidateToken; assignment?: CandidateToken;
  fragmentKind: CandidateToken; blockOpen: CandidateToken; blockClose?: CandidateToken;
  operands: CandidateFragmentOperandSyntax[];
}
export interface CandidateActivationSyntax {
  kind: 'activation'; id?: CandidateToken; assignment?: CandidateToken;
  activationKeyword: CandidateToken; participant: CandidateToken;
  blockOpen: CandidateToken; blockClose?: CandidateToken;
  items: CandidateSequenceItemSyntax[];
}
export interface CandidateRegionSyntax {
  kind: 'region'; id?: CandidateToken; assignment?: CandidateToken;
  regionKeyword: CandidateToken; label?: CandidateToken;
  blockOpen: CandidateToken; blockClose?: CandidateToken;
  items: CandidateSequenceItemSyntax[];
}
export interface CandidateParticipantGroupSyntax {
  kind: 'participant-group'; id?: CandidateToken; assignment?: CandidateToken;
  participantsKeyword: CandidateToken; members: CandidateToken[];
  label?: CandidateToken;
}
const SINGLE_OPERAND_FRAGMENTS_028 = new Set(['loop', 'opt', 'critical', 'break']);
const MULTI_OPERAND_FRAGMENTS_028 = new Set(['alt', 'par']);
export type CandidateConnectorSyntax = ConnectorSyntax028;
export type CandidateStatement = CandidateConstraintSyntax028 | CandidateLayoutSyntax028 | CandidateNodeSyntax | CandidatePortSyntax | CandidateEdgeSyntax |
  CandidateCompartmentSyntax | CandidateAttributeSyntax | CandidateOperationSyntax | CandidateArrangementSyntax |
  CandidateRouteSyntax |
  CandidateFragmentSyntax | CandidateNoteSyntax | CandidateActivationSyntax | CandidateRegionSyntax |
  CandidateParticipantGroupSyntax;
export interface CandidateResult {
  graph: GraphIR;
  spatialConstraints028?: SpatialConstraintSuccessor[];
  layoutOptions028?: LayoutOptionsSuccessor;
  routeIntents028?: Record<string, RouteIntentSuccessor>;
  diagnostics: readonly ParseDiagnostic[];
  /** Spelling and explicit presence, independent of normalized model. */
  statements: readonly CandidateStatement[];
  /** Recursive authored sequence order; GraphIR 3 remains a flat display shell. */
  sequenceItems: readonly CandidateSequenceItemSyntax[];
}

interface Line { text: string; start: number; number: number }
function sourceLines(source: string): Line[] {
  const result: Line[] = [];
  let start = 0;
  let number = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '\n') continue;
    result.push({ text: source.slice(start, i).replace(/\r$/, ''), start, number });
    start = i + 1;
    number++;
  }
  result.push({ text: source.slice(start), start, number });
  return result;
}
function sourceRange(line: Line, start: number, end: number): DiagnosticRange {
  return {
    start: { line: line.number, column: start, offset: line.start + start },
    end: { line: line.number, column: end, offset: line.start + end },
  };
}
function issue(out: ParseDiagnostic[], line: Line, start: number, end: number,
  code: string, message: string, first?: CandidateToken): void {
  const range = sourceRange(line, start, end);
  out.push(parseDiagnostic({ severity: 'error', code, message, position: range.start, range,
    ...(first ? { related: [{ message: 'First assignment', position: first.range.start, range: first.range }] } : {}) }));
}
function warning(out: ParseDiagnostic[], token: CandidateToken, code: string, message: string): void {
  out.push(parseDiagnostic({ severity: 'warning', code, message,
    position: token.range.start, range: token.range }));
}
function makeToken(line: Line, kind: Kind, start: number, end: number, value?: string): CandidateToken {
  const raw = line.text.slice(start, end);
  return { kind, raw, value: value ?? raw, range: sourceRange(line, start, end) };
}
function assignmentToken(line: Line, first: CandidateToken, last: CandidateToken): CandidateToken {
  return makeToken(line, first.kind, first.range.start.column, last.range.end.column);
}
// Invisible format characters are also invalid separators: otherwise a
// visually ordinary declaration can fail with a misleading generic token
// error, or be copied with a character the author cannot see.
const INVALID_SPACING = /[\p{White_Space}\p{Default_Ignorable_Code_Point}\ufeff]/u;
function scanConnector(line: Line, start: number, errors: ParseDiagnostic[]): CandidateToken {
  const source = line.text;
  const run = /^[-.]+/.exec(source.slice(start))![0];
  let end = start + run.length;
  const suffix = CONNECTOR_END_SPELLINGS_028.find((spelling) => source.startsWith(spelling, end));
  if (suffix) {
    end += suffix.length;
    if (source[end] === '#') {
      issue(errors, line, end, end + 1,
        suffix === '|' || suffix === '{'
          ? 'coral.syntax.connector.fill-invalid' : 'coral.syntax.connector.fill-duplicate',
        suffix === '|' || suffix === '{'
          ? 'A bar or crow-foot end cannot be filled' : 'Repeated fill indicator on connector end');
      end++;
    }
  }
  else if (source[end] === '#') {
    while (end < source.length && '#|>{'.includes(source[end]!)) end++;
    issue(errors, line, start + run.length, end,
      /[|{]/.test(source.slice(start + run.length, end))
        ? 'coral.syntax.connector.fill-invalid' : 'coral.syntax.connector.fill-duplicate',
      'Invalid or repeated fill indicator on connector end');
  }
  if (run.length > 6) issue(errors, line, start, start + run.length,
    'coral.syntax.connector.dash-count', 'A connector accepts one through six shaft positions');
  const firstDot = run.indexOf('.');
  if (firstDot >= 0) {
    const secondDot = run.indexOf('.', firstDot + 1);
    if (secondDot >= 0) issue(errors, line, start + secondDot, start + secondDot + 1,
      'coral.syntax.connector.dot-count', 'A dashed connector accepts exactly one period');
    else if (firstDot !== 1 || run.length < 3 || !/^-\.-+$/.test(run)) issue(errors, line,
      start + firstDot, start + firstDot + 1,
      'coral.syntax.connector.dot-position', 'A dashed connector has one period in the second shaft position');
  }
  return makeToken(line, 'operator', start, end);
}
function scan(line: Line, errors: ParseDiagnostic[]): { tokens: CandidateToken[]; invalidSpacing: boolean } {
  const tokens: CandidateToken[] = [];
  const s = line.text;
  let i = 0;
  let invalidSpacing = false;
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\t') { i++; continue; }
    if (s.startsWith('//', i)) break;
    const start = i;
    const ch = s[i]!;
    const codePoint = String.fromCodePoint(s.codePointAt(i)!);
    if (/[A-Za-z_]/.test(ch)) {
      while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) i++;
      // A dotted path is one reference token. Its segments still obey the
      // ordinary identifier alphabet; declaration sites reject qualification.
      while (s[i] === '.' && i + 1 < s.length && /[A-Za-z_]/.test(s[i + 1]!)) {
        i++;
        while (i < s.length && /[A-Za-z0-9_]/.test(s[i]!)) i++;
      }
      tokens.push(makeToken(line, 'id', start, i));
    } else if (ch === '<' && s[i + 1] === '-') {
      const operator = /^<-+>?/.exec(s.slice(i))![0];
      i += operator.length;
      tokens.push(makeToken(line, 'operator', start, i));
    } else if (/[0-9]/.test(ch) || ch === '-' && /[0-9]/.test(s[i + 1] ?? '')) {
      const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(i))![0];
      i += number.length;
      tokens.push(makeToken(line, 'number', start, i));
    } else if (ch === '-') {
      const connector = scanConnector(line, start, errors);
      i = connector.range.end.column;
      tokens.push(connector);
    } else if (ch === '#') {
      i++;
      while (i < s.length && /[A-Za-z0-9]/.test(s[i]!)) i++;
      tokens.push(makeToken(line, 'id', start, i));
    } else if ('[]=,:{}+()~@'.includes(ch)) {
      i++;
      tokens.push(makeToken(line, 'punctuation', start, i));
    } else if (ch === '"' || ch === "'") {
      let value = '';
      let closed = false;
      i++;
      while (i < s.length) {
        const current = s[i]!;
        if (current === ch) { i++; closed = true; break; }
        if (current === '\\') {
          const next = s[i + 1];
          if (next === ch || next === '\\') { value += next; i += 2; continue; }
          if (next === 'n') { value += '\n'; i += 2; continue; }
          issue(errors, line, i, Math.min(i + 2, s.length),
            'coral.syntax.string.invalid-escape', 'Unknown or unnecessary escape');
          i += next === undefined ? 1 : 2;
          continue;
        }
        const unit = current.charCodeAt(0);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const next = s.charCodeAt(i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            value += s.slice(i, i + 2);
            i += 2;
            continue;
          }
          issue(errors, line, i, i + 1, 'coral.syntax.string.invalid-scalar',
            'Quoted text contains an isolated Unicode surrogate');
        } else if (unit >= 0xdc00 && unit <= 0xdfff) issue(errors, line, i, i + 1,
          'coral.syntax.string.invalid-scalar', 'Quoted text contains an isolated Unicode surrogate');
        if (unit < 0x20 || unit >= 0x7f && unit <= 0x9f || unit === 0x2028 || unit === 0x2029)
          issue(errors, line, i, i + 1,
            'coral.syntax.string.control', unit === 0x2028 || unit === 0x2029
              ? 'Literal line separator in quoted text' : 'Control character in quoted text');
        value += current;
        i++;
      }
      if (!closed) issue(errors, line, start, i,
        'coral.syntax.string.unclosed', 'Quoted text is not closed');
      tokens.push(makeToken(line, 'string', start, i, value));
    } else if (INVALID_SPACING.test(codePoint)) {
      i += codePoint.length;
      issue(errors, line, start, i, 'coral.syntax.spacing.invalid',
        'Only ASCII spaces or tabs may separate Coral syntax');
      invalidSpacing = true;
    } else {
      i += codePoint.length;
      issue(errors, line, start, i, 'coral.syntax.token.invalid', 'Unexpected source character');
    }
  }
  // Keep the brace tokens for structural recovery even when this line must
  // not become a statement. Dropping every token would promote a rejected
  // block's children into the enclosing scope.
  return { tokens, invalidSpacing };
}
const raw = (token: CandidateToken | undefined, spelling: string) => token?.raw === spelling;
const isId = (token: CandidateToken | undefined): token is CandidateToken & { kind: 'id' } =>
  token?.kind === 'id';
const isBareId = (token: CandidateToken | undefined): token is CandidateToken & { kind: 'id' } =>
  isId(token) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token.raw);
const isNodeReference = (token: CandidateToken | undefined): token is CandidateToken & { kind: 'id' } =>
  isId(token) && /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(token.raw);
function offsets(token: CandidateToken): [number, number] {
  return [token.range.start.column, token.range.end.column];
}
function lineForToken(token: CandidateToken): Line {
  return { text: '', start: token.range.start.offset - token.range.start.column,
    number: token.range.start.line };
}
function requireGap(before: CandidateToken | undefined, after: CandidateToken | undefined,
  line: Line, errors: ParseDiagnostic[]): void {
  if (!before || !after) return;
  if (after.range.start.offset > before.range.end.offset) return;
  issue(errors, line, ...offsets(after), 'coral.syntax.spacing.required',
    'Horizontal space is required between these tokens');
}
function labelClause(tokens: CandidateToken[], at: number, line: Line, errors: ParseDiagnostic[]) {
  if (!raw(tokens[at], 'as')) return { next: at, label: undefined as CandidateToken | undefined,
    keyword: undefined as CandidateToken | undefined };
  const keyword = tokens[at]!;
  const label = tokens[at + 1];
  requireGap(tokens[at - 1], keyword, line, errors);
  requireGap(keyword, label, line, errors);
  if (label?.kind !== 'string') {
    issue(errors, line, ...offsets(keyword), 'coral.syntax.label.quoted-required',
      '`as` requires a quoted label');
    return { next: at + 1, label: undefined, keyword };
  }
  return { next: at + 2, label, keyword };
}
const PLACEMENT_SIDES_028 = new Set(['above', 'below', 'left', 'right', 'center']);
function placementClause(tokens: CandidateToken[], at: number, previous: CandidateToken,
  line: Line, errors: ParseDiagnostic[], kind: 'node' | 'edge'):
  { next: number; placement?: CandidateLabelPlacementSyntax } {
  if (!raw(tokens[at], 'label')) return { next: at };
  const keyword = tokens[at]!;
  const side = tokens[at + 1];
  requireGap(previous, keyword, line, errors);
  requireGap(keyword, side, line, errors);
  if (!side || !PLACEMENT_SIDES_028.has(side.value)) {
    issue(errors, line, ...offsets(side ?? keyword), 'coral.label-placement.side.invalid',
      'Label placement needs above, below, left, right, or center');
    return { next: at + (side ? 2 : 1) };
  }
  let cursor = at + 2;
  let atValue: CandidateToken | undefined;
  let offsetValue: CandidateToken | undefined;
  if (raw(tokens[cursor], 'at')) {
    const atKeyword = tokens[cursor]!;
    if (kind === 'node') issue(errors, line, ...offsets(atKeyword),
      'coral.label-placement.node-at.invalid', 'Only an edge label has a route fraction');
    atValue = tokens[cursor + 1];
    requireGap(side, atKeyword, line, errors);
    requireGap(atKeyword, atValue, line, errors);
    if (atValue?.kind !== 'number' || !Number.isFinite(Number(atValue.value)) ||
      Number(atValue.value) < 0 || Number(atValue.value) > 1) issue(errors, line,
      ...offsets(atValue ?? atKeyword), 'coral.label-placement.range.invalid',
      'Edge label at must be a finite fraction from 0 to 1');
    cursor += atValue ? 2 : 1;
  }
  if (raw(tokens[cursor], 'offset')) {
    const offsetKeyword = tokens[cursor]!;
    offsetValue = tokens[cursor + 1];
    requireGap(atValue ?? side, offsetKeyword, line, errors);
    requireGap(offsetKeyword, offsetValue, line, errors);
    if (offsetValue?.kind !== 'number' || !Number.isFinite(Number(offsetValue.value)) ||
      Number(offsetValue.value) < 0 || side.value === 'center' && Number(offsetValue.value) !== 0)
      issue(errors, line, ...offsets(offsetValue ?? offsetKeyword),
        'coral.label-placement.range.invalid',
        'Label offset must be finite and non-negative; center requires zero');
    cursor += offsetValue ? 2 : 1;
  }
  return { next: cursor, placement: { side,
    ...(atValue?.kind === 'number' ? { at: atValue } : {}),
    ...(offsetValue?.kind === 'number' ? { offset: offsetValue } : {}) } };
}
function nodeBracket(tokens: CandidateToken[], at: number, line: Line, errors: ParseDiagnostic[]) {
  let symbol: CandidateToken | undefined;
  let variant: CandidateToken | undefined;
  let conformanceException: CandidateToken | undefined;
  let bracketClose: CandidateToken | undefined;
  if (!raw(tokens[at], '[')) return { next: at, symbol, variant, conformanceException, bracketClose };
  const open = tokens[at]!;
  at++;
  if (raw(tokens[at], ']')) issue(errors, line, ...offsets(open),
    'coral.syntax.node.bracket.empty', 'A node bracket requires at least one field');
  while (at < tokens.length && !raw(tokens[at], ']')) {
    const key = tokens[at]!;
    const colon = tokens[at + 1];
    const value = tokens[at + 2];
    if (!isId(key) || !raw(colon, ':') || !value) {
      issue(errors, line, ...offsets(key), 'coral.syntax.node.field.invalid',
        'A node bracket field must be a keyed value');
      return { next: tokens.length, symbol, variant, conformanceException, bracketClose };
    }
    if (key.value !== 'symbol' && key.value !== 'variant' && key.value !== 'conformanceException') {
      issue(errors, line, ...offsets(key), 'coral.syntax.node.field.unknown',
        `Unknown node field: ${key.value}`);
    } else if (value.kind !== 'string') {
      issue(errors, line, ...offsets(value), 'coral.syntax.node.field.quoted-required',
        key.value === 'conformanceException'
          ? 'conformanceException requires a quoted, exact symbol ID'
          : `${key.value} requires a quoted catalog ID`);
    } else if (key.value === 'symbol') {
      if (symbol) issue(errors, line, key.range.start.column, value.range.end.column,
        'coral.syntax.node.symbol.duplicate', 'Duplicate explicit symbol', symbol);
      else symbol = value;
    } else if (key.value === 'variant') {
      if (variant) issue(errors, line, key.range.start.column, value.range.end.column,
        'coral.syntax.node.variant.duplicate', 'Duplicate explicit variant', variant);
      else variant = value;
    } else if (conformanceException) issue(errors, line, key.range.start.column, value.range.end.column,
      'coral.syntax.node.conformance-exception.duplicate', 'Duplicate conformance exception', conformanceException);
    else conformanceException = value;
    at += 3;
    if (raw(tokens[at], ',')) {
      const comma = tokens[at]!;
      at++;
      if (raw(tokens[at], ']')) issue(errors, line, ...offsets(comma),
        'coral.syntax.node.bracket.trailing-comma', 'A node field must follow the final comma');
    } else if (!raw(tokens[at], ']')) {
      issue(errors, line, ...offsets(tokens[at] ?? value),
        'coral.syntax.node.bracket.comma-required', 'Expected comma or closing bracket');
      return { next: tokens.length, symbol, variant, conformanceException, bracketClose };
    }
  }
  if (!raw(tokens[at], ']')) issue(errors, line, ...offsets(open),
    'coral.syntax.node.bracket.unclosed', 'Node bracket is not closed');
  else { bracketClose = tokens[at]; at++; }
  return { next: at, symbol, variant, conformanceException, bracketClose };
}
function bracket(tokens: CandidateToken[], at: number, line: Line, errors: ParseDiagnostic[]) {
  const duplicateFields: Readonly<Record<string, { code: string; message: string }>> = {
    type: { code: 'coral.syntax.type.duplicate', message: 'Duplicate edge type' },
    label: { code: 'coral.syntax.label.duplicate', message: 'Duplicate edge label' },
    firstPort: { code: 'coral.syntax.port.duplicate', message: 'Duplicate firstPort reference' },
    secondPort: { code: 'coral.syntax.port.duplicate', message: 'Duplicate secondPort reference' },
    firstEnd: { code: 'coral.syntax.connector.end-duplicate', message: 'Duplicate firstEnd assignment' },
    secondEnd: { code: 'coral.syntax.connector.end-duplicate', message: 'Duplicate secondEnd assignment' },
    style: { code: 'coral.syntax.style.duplicate', message: 'Duplicate edge style' },
  };
  const assignments = new Map<string, CandidateToken>();
  let edgeType: CandidateToken | undefined;
  let label: CandidateToken | undefined;
  let labelAssignment: CandidateToken | undefined;
  let sourcePort: CandidateToken | undefined;
  let targetPort: CandidateToken | undefined;
  let sourcePortAssignment: CandidateToken | undefined;
  let targetPortAssignment: CandidateToken | undefined;
  let firstEnd: CandidateToken | undefined;
  let secondEnd: CandidateToken | undefined;
  let style: CandidateToken | undefined;
  let typeOrigin: 'bare' | 'keyed' | undefined;
  let bracketClose: CandidateToken | undefined;
  if (!raw(tokens[at], '[')) return { next: at, edgeType, label, labelAssignment,
    sourcePort, targetPort, sourcePortAssignment, targetPortAssignment, firstEnd, secondEnd, style,
    typeOrigin, bracketClose };
  const open = tokens[at]!;
  at++;
  if (raw(tokens[at], ']')) issue(errors, line, ...offsets(open),
    'coral.syntax.bracket.empty', 'An edge bracket requires at least one field');
  let index = 0;
  while (at < tokens.length && !raw(tokens[at], ']')) {
    if (raw(tokens[at], ',')) {
      issue(errors, line, ...offsets(tokens[at]!), 'coral.syntax.bracket.empty-item',
        'Every connector bracket field needs a value');
      at++;
      index++;
      continue;
    }
    const key = tokens[at]!;
    const isKeyed = raw(tokens[at + 1], ':');
    const value = isKeyed ? tokens[at + 2] : undefined;
    const field = isKeyed && isId(key) && duplicateFields[key.value] ? key.value : undefined;
    const firstAssignment = field ? assignments.get(field) : undefined;
    if (field) {
      const assignment = assignmentToken(line, key,
        value && !raw(value, ']') && !raw(value, ',') ? value : tokens[at + 1]!);
      if (firstAssignment) {
        const duplicate = duplicateFields[field]!;
        issue(errors, line, ...offsets(assignment), duplicate.code, duplicate.message, firstAssignment);
      } else {
        assignments.set(field, assignment);
        if (field === 'label') labelAssignment = assignment;
        if (field === 'firstPort') sourcePortAssignment = assignment;
        if (field === 'secondPort') targetPortAssignment = assignment;
      }
    }
    if (isKeyed && isId(key) && !field) {
      const end = value && !raw(value, ']') && !raw(value, ',') ? value : tokens[at + 1]!;
      issue(errors, line, key.range.start.column, end.range.end.column,
        'coral.syntax.bracket.unknown-field', `Unknown edge field: ${key.value}`);
      at += end === value ? 3 : 2;
    } else if (isKeyed && (!value || raw(value, ']') || raw(value, ','))) {
      issue(errors, line, key.range.start.column, tokens[at + 1]!.range.end.column,
        'coral.syntax.bracket.value-required', `${key.raw} requires a value`);
      at += 2;
    } else if (isKeyed && raw(key, 'type') && isBareId(value)) {
      if (!firstAssignment) { edgeType = value; typeOrigin = 'keyed'; }
      at += 3;
    } else if (isKeyed && raw(key, 'label') && value?.kind === 'string') {
      if (!firstAssignment) label = value;
      at += 3;
    } else if (isKeyed && (raw(key, 'firstPort') || raw(key, 'secondPort')) && isBareId(value)) {
      const first = raw(key, 'firstPort');
      if (!firstAssignment && first) sourcePort = value;
      else if (!firstAssignment) targetPort = value;
      at += 3;
    } else if (isKeyed && (raw(key, 'firstEnd') || raw(key, 'secondEnd')) && isBareId(value)) {
      const first = raw(key, 'firstEnd');
      if (!firstAssignment && first) firstEnd = value;
      else if (!firstAssignment) secondEnd = value;
      at += 3;
    } else if (isKeyed && raw(key, 'style') &&
      (isBareId(value) || value?.raw.startsWith('#') ||
        value?.kind === 'string' && value.raw.startsWith('"'))) {
      if (!firstAssignment) style = value;
      at += 3;
    } else if (!isKeyed && index === 0 && isBareId(key)) {
      edgeType = key;
      typeOrigin = 'bare';
      assignments.set('type', key);
      at++;
    } else if (isKeyed && field && value) {
      const message = field === 'type' ? 'type requires a bare relation word'
        : field === 'label' ? 'label requires quoted text'
          : field === 'style' ? 'style requires one bare term or a double-quoted recipe'
            : field === 'firstPort' || field === 'secondPort' ? `${field} requires a port ID`
              : `${field} requires an end name`;
      issue(errors, line, ...offsets(value), 'coral.syntax.bracket.value-invalid', message);
      at += 3;
    } else {
      issue(errors, line, key.range.start.column, (value ?? key).range.end.column,
        isKeyed ? 'coral.syntax.bracket.invalid-field' : 'coral.syntax.bracket.unknown-positional',
        isKeyed ? 'Invalid bracket field' : 'Only a leading bare type is positional');
      at += isKeyed && value ? 3 : 1;
    }
    index++;
    if (raw(tokens[at], ',')) {
      const comma = tokens[at]!;
      at++;
      if (raw(tokens[at], ']')) issue(errors, line, ...offsets(comma),
        'coral.syntax.bracket.trailing-comma', 'A connector bracket field must follow the final comma');
    }
    else if (at < tokens.length && !raw(tokens[at], ']')) {
      issue(errors, line, ...offsets(tokens[at]!), 'coral.syntax.bracket.comma-required',
        'Expected comma or closing bracket');
      at++;
    }
  }
  if (!raw(tokens[at], ']')) issue(errors, line, ...offsets(open),
    'coral.syntax.bracket.unclosed', 'Bracket is not closed');
  else { bracketClose = tokens[at]; at++; }
  return { next: at, edgeType, label, labelAssignment, sourcePort, targetPort,
    sourcePortAssignment, targetPortAssignment, firstEnd, secondEnd, style, typeOrigin, bracketClose };
}
const NAMED_STROKE_COLORS_028: ReadonlyMap<string, string> = new Map([
  ['black', '#000000'], ['gray', '#808080'], ['red', '#FF0000'],
  ['orange', '#FFA500'], ['yellow', '#FFFF00'], ['green', '#008000'],
  ['blue', '#0000FF'], ['purple', '#800080'],
]);

function checkEdgeStyle028(style: CandidateToken, line: Line, errors: ParseDiagnostic[]):
  EdgeStyleIntent028 {
  const intent: EdgeStyleIntent028 = {};
  const seen = new Map<string, { token: CandidateToken; canonical: string }>();
  const inner = style.kind === 'string' ? style.raw.slice(1, -1) : style.raw;
  const base = style.range.start.column + (style.kind === 'string' ? 1 : 0);
  let cursor = 0;
  for (const rawTerm of inner.split(',')) {
    const trimmed = rawTerm.trim();
    const start = base + cursor + rawTerm.indexOf(trimmed);
    const end = start + trimmed.length;
    cursor += rawTerm.length + 1;
    if (!trimmed) {
      issue(errors, line, start, Math.max(end, start + 1),
        'coral.syntax.style.empty-term', 'A style recipe cannot contain an empty term');
      continue;
    }
    const token = makeToken(line, 'id', start, end);
    const namedColor = NAMED_STROKE_COLORS_028.get(trimmed);
    let dimension: 'pattern' | 'color' | 'weight' | 'motion' | undefined;
    if (['solid', 'dashed', 'dotted'].includes(trimmed)) dimension = 'pattern';
    else if (trimmed.startsWith('#') || namedColor) dimension = 'color';
    else if (trimmed === 'regular' || trimmed === 'thick') dimension = 'weight';
    else if (trimmed === 'static' || trimmed === 'animated' ||
      ['animated:auto', 'animated:forward', 'animated:reverse'].includes(trimmed)) dimension = 'motion';
    else if (trimmed.startsWith('animated:')) issue(errors, line, start, end,
      'coral.syntax.style.motion-invalid', `Unknown motion direction: ${trimmed}`);
    else warning(errors, token, 'coral.style.term.unknown', `Unknown edge style: ${trimmed}`);
    if (dimension) {
      const canonical = dimension === 'color'
        ? namedColor ?? trimmed.toUpperCase() : trimmed;
      const first = seen.get(dimension);
      if (first) issue(errors, line, start, end,
        first.canonical === canonical ? 'coral.syntax.style.dimension-duplicate'
          : 'coral.syntax.style.dimension-conflict',
        first.canonical === canonical
          ? `Style ${dimension} repeats ${first.token.value}`
          : `Style ${dimension} conflicts with ${first.token.value}`, first.token);
      else seen.set(dimension, { token, canonical });
      if (dimension === 'pattern' && !first)
        intent.lineStyle = trimmed as EdgeStyleIntent028['lineStyle'];
      if (dimension === 'weight' && !first)
        intent.strokeWeight = trimmed as EdgeStyleIntent028['strokeWeight'];
      if (dimension === 'motion' && !first) intent.motion = trimmed === 'static'
        ? { kind: 'static' }
        : { kind: 'animated', direction: trimmed === 'animated:forward'
          ? 'first-to-second' : trimmed === 'animated:reverse'
            ? 'second-to-first' : 'auto' };
      if (dimension === 'color') {
        if (trimmed.startsWith('#') && !/^#[0-9A-Fa-f]{6}$/.test(trimmed))
          issue(errors, line, start, end, 'coral.syntax.style.hex-invalid',
            'RGB colors use exactly six hexadecimal digits');
        else if (!first) intent.strokeColor = namedColor ?? trimmed;
      }
    }
  }
  if (errors.some((item) => item.code === 'coral.style.term.unknown' &&
    item.range?.start.line === line.number && item.range.start.column >= style.range.start.column &&
    item.range.start.column < style.range.end.column))
    issue(errors, line, ...offsets(style), 'coral.style.capability.unavailable',
      'Unknown style cannot be projected without silently dropping authored intent');
  return intent;
}
function statement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[]): CandidateStatement | undefined {
  if (!tokens.length) return undefined;
  const first = tokens[0]!;
  if (!isId(first)) {
    issue(errors, line, ...offsets(first), 'coral.syntax.statement.invalid',
      'Statement must begin with an identifier');
    return undefined;
  }
  if (raw(tokens[0], 'layout') && raw(tokens[1], '[')) return parseLayout028(tokens, errors);
  if (raw(tokens[0], 'constraint') && isId(tokens[1]) && raw(tokens[2], ':')) return parseConstraint028(tokens, errors);
  const assignment = raw(tokens[1], '=') ? tokens[1] : undefined;
  const right = assignment ? 2 : 0;
  if (raw(tokens[right], 'arrange') &&
    (raw(tokens[right + 1], 'row') || raw(tokens[right + 1], 'column'))) {
    if (assignment && !isBareId(first)) {
      issue(errors, line, ...offsets(first), 'coral.syntax.arrangement.id-qualified',
        'An arrangement declaration uses a local identifier');
      return undefined;
    }
    const keyword = tokens[right]!;
    const axis = tokens[right + 1];
    const colon = tokens[right + 2];
    if (!axis || !['row', 'column'].includes(axis.value) || !raw(colon, ':')) {
      issue(errors, line, ...offsets(axis ?? keyword), 'coral.syntax.arrangement.axis',
        'Expected arrange row: or arrange column:');
      return undefined;
    }
    requireGap(keyword, axis, line, errors);
    const subjects: CandidateToken[] = [];
    let at = right + 3;
    while (at < tokens.length && !raw(tokens[at], '[')) {
      if (tokens[at]?.kind !== 'id') {
        issue(errors,line,...offsets(tokens[at]!), 'coral.syntax.arrangement.subject','Expected a rectangle identifier'); return undefined;
      }
      const parsed = rectangleToken028(tokens, at, errors, true);
      if (!parsed.token) return undefined;
      // Preserve bare-node historical arrangement diagnostics.
      const explicit = parsed.next > at + 1;
      subjects.push(explicit ? parsed.token : tokens[at]!);
      at = parsed.next;
      if (at === tokens.length || raw(tokens[at], '[')) break;
      if (!raw(tokens[at], ',')) {
        issue(errors, line, ...offsets(tokens[at]!), 'coral.syntax.arrangement.comma-required', 'Expected a comma between arrangement subjects');
        return undefined;
      }
      at++;
      if(raw(tokens[at],'[')){issue(errors,line,...offsets(tokens[at-1]!), 'coral.syntax.arrangement.trailing-comma','An arrangement member must follow the final comma');return undefined;}
    }
    const parameters = at < tokens.length ? spatialParameters028(tokens, at, 'arrangement', errors) : undefined;
    const lastToken = tokens[tokens.length - 1];
    if (raw(lastToken, ',')) {
      issue(errors, line, ...offsets(lastToken!), 'coral.syntax.arrangement.trailing-comma',
        'An arrangement subject must follow the final comma');
      return undefined;
    }
    if (subjects.length < 2) {
      issue(errors, line, ...offsets(lastToken ?? colon!), 'coral.syntax.arrangement.subject-count',
        'An arrangement requires at least two node subjects');
      return undefined;
    }
    return { kind: 'arrangement', ...(assignment ? { id: first, assignment } : {}),
      keyword, axis, colon: colon!, subjects, ...(parameters ? {parameters} : {}) };
  }
  const sourcePortColon = raw(tokens[right + 1], ':') ? tokens[right + 1] : undefined;
  const sourcePort = sourcePortColon ? tokens[right + 2] : undefined;
  const operatorAt = right + (sourcePortColon ? 3 : 1);
  const edge = tokens[operatorAt]?.kind === 'operator';
  if (edge && assignment && !isBareId(first)) {
    issue(errors, line, ...offsets(first), 'coral.syntax.edge.id-qualified',
      'An edge declaration uses a local identifier');
    return undefined;
  }
  if (!edge) {
    if (sourcePortColon) {
      issue(errors, line, ...offsets(sourcePort ?? sourcePortColon), 'coral.syntax.edge.invalid',
        'A port-qualified endpoint must be followed by a connector');
      return undefined;
    }
    const nodeKind = tokens[assignment ? 2 : 1];
    if (!assignment && ((nodeKind?.kind === 'string' && raw(tokens[2], 'as') && isBareId(tokens[3])) ||
      (raw(nodeKind, 'as') && isBareId(tokens[2])))) {
      issue(errors, line, ...offsets(first), 'coral.syntax.legacy-node.unsupported',
        'Use an ID-first declaration; as is only for a quoted rendered label');
      return undefined;
    }
    if (!isBareId(nodeKind)) {
      issue(errors, line, ...offsets(first), 'coral.syntax.node.kind-required',
        'Node declaration requires a kind');
      return undefined;
    }
    if (!assignment) requireGap(first, nodeKind, line, errors);
    const fields = nodeBracket(tokens, assignment ? 3 : 2, line, errors);
    const tail = labelClause(tokens, fields.next, line, errors);
    const placed = placementClause(tokens, tail.next,
      tail.label ?? fields.bracketClose ?? nodeKind, line, errors, 'node');
    const beforePosition = placed.placement?.offset ?? placed.placement?.side ??
      tail.label ?? fields.bracketClose ?? nodeKind;
    let at = placed.next;
    let position: CandidateNodeSyntax['position'];
    const marker = raw(tokens[at], '@') ? tokens[at] : undefined;
    if (marker) {
      requireGap(beforePosition, marker, line, errors);
      const open = tokens[at + 1];
      const x = tokens[at + 2];
      const comma = tokens[at + 3];
      const y = tokens[at + 4];
      const close = tokens[at + 5];
      if (raw(open, '(') && x?.kind === 'number' && raw(comma, ',') &&
        y?.kind === 'number' && raw(close, ')') &&
        Number.isFinite(Number(x.value)) && Number.isFinite(Number(y.value))) {
        position = { marker, x, y };
        at += 6;
      } else {
        issue(errors, line, ...offsets(marker), 'coral.node.position.invalid',
          'Expected two finite coordinates after @, for example @ (120, 80)');
        at++;
      }
    }
    const pinned = raw(tokens[at], 'pinned') ? tokens[at] : undefined;
    if (pinned) {
      requireGap(position ? tokens[at - 1] : beforePosition,
        pinned, line, errors);
      if (!position) issue(errors, line, ...offsets(pinned), 'coral.node.pin.invalid',
        'Pinned requires an authored position');
      at++;
    }
    const blockOpen = raw(tokens[at], '{') ? tokens[at] : undefined;
    const blockClose = blockOpen && raw(tokens[at + 1], '}') ? tokens[at + 1] : undefined;
    const next = at + (blockOpen ? 1 : 0) + (blockClose ? 1 : 0);
    if (next < tokens.length) issue(errors, line, ...offsets(tokens[next]!),
      'coral.syntax.statement.trailing', 'Unexpected text after node declaration');
    return { kind: 'node', id: first, nodeKind, ...(assignment ? { assignment } : {}),
      ...(fields.symbol ? { symbol: fields.symbol } : {}),
      ...(fields.variant ? { variant: fields.variant } : {}),
      ...(fields.conformanceException ? { conformanceException: fields.conformanceException } : {}),
      ...(fields.bracketClose ? { bracketClose: fields.bracketClose } : {}),
      ...(tail.label ? { label: tail.label } : {}),
      ...(placed.placement ? { labelPlacement: placed.placement } : {}),
      ...(position ? { position } : {}),
      ...(pinned ? { pinned } : {}),
      ...(blockOpen ? { blockOpen } : {}),
      ...(blockClose ? { blockClose } : {}) };
  }
  const source = tokens[right];
  const operator = tokens[operatorAt];
  const target = tokens[operatorAt + 1];
  const targetPortColon = raw(tokens[operatorAt + 2], ':') ? tokens[operatorAt + 2] : undefined;
  const targetPort = targetPortColon ? tokens[operatorAt + 3] : undefined;
  if (!isNodeReference(source) || sourcePortColon && !isBareId(sourcePort) ||
    operator?.kind !== 'operator' || !isNodeReference(target) || targetPortColon && !isBareId(targetPort)) {
    const invalid = !isNodeReference(source) ? source : sourcePortColon && !isBareId(sourcePort)
      ? sourcePort ?? sourcePortColon : !isNodeReference(target) ? target ?? operator
        : targetPortColon && !isBareId(targetPort) ? targetPort ?? targetPortColon : operator;
    issue(errors, line, ...offsets(invalid ?? first),
      'coral.syntax.edge.invalid', 'Invalid edge declaration');
    return undefined;
  }
  requireGap(sourcePort ?? source, operator, line, errors);
  requireGap(operator, target, line, errors);
  const operatorConnector = parseConnector028(operator.raw);
  if (!operatorConnector) issue(errors, line, ...offsets(operator),
    'coral.syntax.connector.invalid', 'Invalid connector operator');
  const fields = bracket(tokens, operatorAt + (targetPortColon ? 4 : 2), line, errors);
  const styleIntent = fields.style ? checkEdgeStyle028(fields.style, line, errors) : undefined;
  if (styleIntent?.lineStyle && operatorConnector?.stroke === 'dashed') issue(errors, line,
    ...offsets(fields.style!), 'coral.syntax.style.operator-conflict',
    'The operator already specifies a dashed line treatment');
  let connector = operatorConnector;
  for (const [side, token] of [['first', fields.firstEnd], ['second', fields.secondEnd]] as const) {
    if (!token || !operatorConnector) continue;
    const marker = keyedConnectorEnd028(token.value);
    if (!marker) {
      issue(errors, line, ...offsets(token), 'coral.syntax.connector.end-unknown',
        `Unknown connector end: ${token.value}`);
      continue;
    }
    const prior = side === 'first' ? operatorConnector.firstEnd : operatorConnector.secondEnd;
    const authored = side === 'first'
      ? operatorConnector.firstEndAuthored : operatorConnector.secondEndAuthored;
    if (authored && connectorEndHasShorthand028(marker, side) &&
      (marker.kind !== prior.kind || marker.fill !== prior.fill)) {
      issue(errors, line, ...offsets(token), 'coral.syntax.connector.end-conflict',
        `${side}End conflicts with the connector operator; use its matching shorthand`, operator);
      continue;
    }
    connector = { ...connector!, [side === 'first' ? 'firstEnd' : 'secondEnd']: marker };
  }
  if (sourcePort && fields.sourcePortAssignment) {
    issue(errors, line, ...offsets(fields.sourcePortAssignment!),
      'coral.syntax.port.duplicate', 'Duplicate firstPort reference',
      assignmentToken(line, sourcePortColon!, sourcePort));
  }
  if (targetPort && fields.targetPortAssignment) {
    issue(errors, line, ...offsets(fields.targetPortAssignment!),
      'coral.syntax.port.duplicate', 'Duplicate secondPort reference',
      assignmentToken(line, targetPortColon!, targetPort));
  }
  const tail = labelClause(tokens, fields.next, line, errors);
  if (fields.labelAssignment && tail.label) {
    issue(errors, line, tail.keyword!.range.start.column, tail.label.range.end.column,
      'coral.syntax.label.duplicate', 'Duplicate edge label', fields.labelAssignment);
  }
  const placed = placementClause(tokens, tail.next,
    tail.label ?? fields.bracketClose ?? targetPort ?? target!, line, errors, 'edge');
  if (placed.next < tokens.length) issue(errors, line, ...offsets(tokens[placed.next]!),
    'coral.syntax.statement.trailing', 'Unexpected text after edge declaration');
  return { kind: 'edge', ...(assignment ? { id: first, assignment } : {}),
    source, operator, target, ...(operatorConnector ? { operatorConnector } : {}),
    ...(connector ? { connector } : {}),
    ...(sourcePort ?? fields.sourcePort ? { sourcePort: sourcePort ?? fields.sourcePort } : {}),
    ...(targetPort ?? fields.targetPort ? { targetPort: targetPort ?? fields.targetPort } : {}),
    ...(fields.bracketClose ? { bracketClose: fields.bracketClose } : {}),
    ...(fields.firstEnd ? { firstEnd: fields.firstEnd } : {}),
    ...(fields.secondEnd ? { secondEnd: fields.secondEnd } : {}),
    ...(fields.style ? { style: fields.style } : {}),
    ...(styleIntent ? { styleIntent } : {}),
    ...(fields.edgeType ? { edgeType: fields.edgeType, typeOrigin: fields.typeOrigin } : {}),
    ...(fields.label ?? tail.label ? { label: fields.label ?? tail.label,
      labelOrigin: fields.label ? 'keyed' : 'as' } : {}),
    ...(placed.placement ? { labelPlacement: placed.placement } : {}) };
}
function portStatement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[],
  owner: CandidateToken, edition?: string): CandidatePortSyntax | undefined {
  const extended = edition !== undefined && editionAdmitsUserSymbols029(edition);
  const id = tokens[0];
  const portKeyword = tokens[1];
  const open = tokens[2];
  if (!isBareId(id) || !raw(portKeyword, 'port') || !raw(open, '[')) {
    issue(errors, line, ...offsets(id ?? portKeyword ?? open ?? makeToken(line, 'id', 0, 0)),
      'coral.syntax.port.invalid', 'Expected id port [direction: in|out|inout]');
    return undefined;
  }
  requireGap(id, portKeyword, line, errors);
  let direction: CandidateToken | undefined;
  let anchor: CandidateToken | undefined;
  let directionAssignment: CandidateToken | undefined;
  let anchorAssignment: CandidateToken | undefined;
  let label: CandidateToken | undefined;
  let labelAssignment: CandidateToken | undefined;
  let maxConnections: CandidateToken | undefined;
  let maxConnectionsAssignment: CandidateToken | undefined;
  let at = 3;
  while (at < tokens.length && !raw(tokens[at], ']')) {
    const key = tokens[at];
    const colon = tokens[at + 1];
    const value = tokens[at + 2];
    const editionKey = extended && isBareId(key) && (key.value === 'label' || key.value === 'maxConnections') &&
      raw(colon, ':');
    if (editionKey && (value === undefined || raw(value, ']') || raw(value, ','))) {
      issue(errors, line, key.range.start.column, colon.range.end.column,
        key.value === 'label' ? 'coral.syntax.port.label.invalid' : 'coral.syntax.port.max-connections.invalid',
        key.value === 'label' ? 'A port label needs quoted text' : 'maxConnections needs a positive integer');
      return undefined;
    }
    const editionField = editionKey;
    if (!editionField && (!isBareId(key) || !raw(colon, ':') || !isBareId(value))) {
      issue(errors, line, ...offsets(key ?? open), 'coral.syntax.port.field.invalid',
        'A port field must be a keyed identifier value');
      return undefined;
    }
    const assignment = assignmentToken(line, key, value);
    if (key.value === 'direction') {
      if (directionAssignment) issue(errors, line, ...offsets(assignment),
        'coral.syntax.port.direction.duplicate', 'Duplicate port direction', directionAssignment);
      else {
        directionAssignment = assignment;
        if (!['in', 'out', 'inout'].includes(value.value)) issue(errors, line, ...offsets(value),
          'coral.syntax.port.direction.invalid', 'Port direction must be in, out, or inout');
        else direction = value;
      }
    } else if (key.value === 'anchor') {
      if (anchorAssignment) issue(errors, line, ...offsets(assignment),
        'coral.syntax.port.anchor.duplicate', 'Duplicate port anchor', anchorAssignment);
      else {
        anchorAssignment = assignment;
        anchor = value;
      }
    } else if (editionField && key.value === 'label') {
      if (labelAssignment) issue(errors, line, ...offsets(assignment),
        'coral.syntax.port.label.duplicate', 'Duplicate port label', labelAssignment);
      else {
        labelAssignment = assignment;
        if (value.kind !== 'string') issue(errors, line, ...offsets(value),
          'coral.syntax.port.label.invalid', 'A port label must be quoted text');
        else label = value;
      }
    } else if (editionField) {
      if (maxConnectionsAssignment) issue(errors, line, ...offsets(assignment),
        'coral.syntax.port.max-connections.duplicate', 'Duplicate port maxConnections', maxConnectionsAssignment);
      else {
        maxConnectionsAssignment = assignment;
        if (value.kind !== 'number' || !/^[1-9][0-9]*$/.test(value.raw) ||
          !Number.isSafeInteger(Number(value.raw))) issue(errors, line, ...offsets(value),
          'coral.syntax.port.max-connections.invalid', 'maxConnections must be a positive integer');
        else maxConnections = value;
      }
    } else issue(errors, line, ...offsets(key), 'coral.syntax.port.field.unknown',
      `Unknown port field: ${key.value}`);
    at += 3;
    if (raw(tokens[at], ',')) {
      const comma = tokens[at]!;
      at++;
      if (raw(tokens[at], ']')) issue(errors, line, ...offsets(comma),
        'coral.syntax.port.trailing-comma', 'A port field must follow the final comma');
    } else if (!raw(tokens[at], ']')) {
      issue(errors, line, ...offsets(tokens[at] ?? value), 'coral.syntax.port.comma-required',
        'Expected comma or closing bracket in port declaration');
      return undefined;
    }
  }
  if (!raw(tokens[at], ']')) {
    issue(errors, line, ...offsets(open), 'coral.syntax.port.unclosed', 'Port bracket is not closed');
    return undefined;
  }
  if (!directionAssignment) issue(errors, line, ...offsets(open), 'coral.syntax.port.direction.required',
    'A port declaration requires direction: in, out, or inout');
  if (at + 1 < tokens.length) issue(errors, line, ...offsets(tokens[at + 1]!),
    'coral.syntax.statement.trailing', 'Unexpected text after port declaration');
  return direction ? { kind: 'port', owner, id, portKeyword, direction,
    ...(anchor ? { anchor } : {}), ...(label ? { label } : {}),
    ...(maxConnections ? { maxConnections } : {}) } : undefined;
}
/** One physical line of the shared 028 line grammar, for edition 0.2.9
 * definition regions; the header scanner has already excluded raw content. */
export function scanSourceLine028(text: string, start: number, number: number):
  { tokens: CandidateToken[]; diagnostics: ParseDiagnostic[] } {
  const diagnostics: ParseDiagnostic[] = [];
  return { tokens: scan({ text, start, number }, diagnostics).tokens, diagnostics };
}
/** The shared port-line grammar for a port declared inside a definition. */
export function parsePortLine028(tokens: CandidateToken[], text: string, start: number, number: number,
  owner: CandidateToken, edition: string): { port?: CandidatePortSyntax; diagnostics: ParseDiagnostic[] } {
  const diagnostics: ParseDiagnostic[] = [];
  const port = portStatement(tokens, { text, start, number }, diagnostics, owner, edition);
  return { ...(port && !diagnostics.length ? { port } : {}), diagnostics };
}
function referenceError(out: ParseDiagnostic[], token: CandidateToken, role: 'source' | 'target'): void {
  out.push(parseDiagnostic({ severity: 'error', code: `coral.reference.${role}.unresolved`,
    message: `Unresolved ${role} reference: ${token.value}`,
    position: token.range.start, range: token.range }));
}
function compartmentStatement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[],
  owner: CandidateToken): CandidateCompartmentSyntax | undefined {
  if (!tokens.length) return undefined;
  const assignment = raw(tokens[1], '=') ? tokens[1] : undefined;
  const id = assignment ? tokens[0] : undefined;
  const compartmentKind = tokens[assignment ? 2 : 0];
  const blockOpen = tokens[assignment ? 3 : 1];
  if (id && !isBareId(id) || !isBareId(compartmentKind) ||
      !['attributes', 'operations'].includes(compartmentKind.value) || !raw(blockOpen, '{')) {
    issue(errors, line, ...offsets(tokens[0]!), 'coral.uml.compartment.invalid',
      'Expected attributes {, operations {, or a named compartment');
    return undefined;
  }
  const blockClose = raw(tokens[assignment ? 4 : 2], '}') ? tokens[assignment ? 4 : 2] : undefined;
  const next = (assignment ? 4 : 2) + (blockClose ? 1 : 0);
  if (next < tokens.length) issue(errors, line, ...offsets(tokens[next]!),
    'coral.syntax.statement.trailing', 'Unexpected text after compartment declaration');
  return { kind: 'compartment', owner, ...(id ? { id, assignment } : {}),
    compartmentKind, blockOpen: blockOpen!, ...(blockClose ? { blockClose } : {}) };
}
function attributeStatement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[],
  owner: CandidateCompartmentSyntax): CandidateAttributeSyntax | undefined {
  if (!tokens.length) return undefined;
  const assignment = raw(tokens[1], '=') ? tokens[1] : undefined;
  const id = assignment ? tokens[0] : undefined;
  const start = assignment ? 2 : 0;
  if (assignment && tokens[start] && ['+', '-', '#', '~'].includes(tokens[start]!.raw)) {
    issue(errors, line, ...offsets(tokens[start]!), 'coral.uml.member.named-symbolic-unsupported',
      'A named attribute uses a visibility word and attribute keyword');
    return undefined;
  }
  const named = !!assignment && isBareId(id) && !!tokens[start]
    && ['public', 'private', 'protected', 'package'].includes(tokens[start]!.raw)
    && raw(tokens[start + 1], 'attribute');
  const compact = !assignment && raw(tokens[0], '+');
  const visibility = tokens[start];
  const memberKind = named ? tokens[start + 1] : undefined;
  const name = tokens[start + (named ? 2 : 1)];
  const colon = tokens[start + (named ? 3 : 2)];
  const valueType = tokens[start + (named ? 4 : 3)];
  if ((!named && !compact) || !isBareId(name) || !raw(colon, ':') || !isBareId(valueType)) {
    issue(errors, line, ...offsets(tokens[0]!), 'coral.uml.member.invalid',
      'Expected + name: Type or id = visibility attribute name: Type');
    return undefined;
  }
  requireGap(visibility, memberKind ?? name, line, errors);
  if (memberKind) requireGap(memberKind, name, line, errors);
  const next = start + (named ? 5 : 4);
  if (next < tokens.length) issue(errors, line, ...offsets(tokens[next]!),
    'coral.syntax.statement.trailing', 'Unexpected text after UML attribute');
  return { kind: 'attribute', owner, ...(id ? { id, assignment } : {}),
    visibility: visibility!, ...(memberKind ? { memberKind } : {}), name, colon: colon!, valueType };
}
function operationStatement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[],
  owner: CandidateCompartmentSyntax): CandidateOperationSyntax | undefined {
  if (!tokens.length) return undefined;
  const assignment = raw(tokens[1], '=') ? tokens[1] : undefined;
  const id = assignment ? tokens[0] : undefined;
  const start = assignment ? 2 : 0;
  const visibility = tokens[start];
  if (assignment && visibility && ['+', '-', '#', '~'].includes(visibility.raw)) {
    issue(errors, line, ...offsets(visibility), 'coral.uml.member.named-symbolic-unsupported',
      'A named operation uses a visibility word and operation keyword');
    return undefined;
  }
  const words = ['public', 'private', 'protected', 'package'];
  const named = !!assignment && isBareId(id) && !!visibility && words.includes(visibility.raw)
    && raw(tokens[start + 1], 'operation');
  const compact = !assignment && !!visibility && ['+', '-', '#', '~'].includes(visibility.raw);
  const memberKind = named ? tokens[start + 1] : undefined;
  const name = tokens[start + (named ? 2 : 1)];
  let at = start + (named ? 3 : 2);
  if ((!named && !compact) || !isBareId(name) || !raw(tokens[at], '(')) {
    issue(errors, line, ...offsets(tokens[0]!), 'coral.uml.operation.invalid',
      'Expected + name(...) or id = public operation name(...)');
    return undefined;
  }
  requireGap(visibility, memberKind ?? name, line, errors);
  if (memberKind) requireGap(memberKind, name, line, errors);
  at++;
  const parameters: CandidateOperationSyntax['parameters'] = [];
  while (at < tokens.length && !raw(tokens[at], ')')) {
    const parameterName = tokens[at];
    const colon = tokens[at + 1];
    const parameterType = tokens[at + 2];
    if (!isBareId(parameterName) || !raw(colon, ':') || !isBareId(parameterType)) {
      issue(errors, line, ...offsets(parameterName ?? tokens[at - 1]!),
        'coral.uml.operation.parameter.invalid', 'Expected parameter name: Type');
      return undefined;
    }
    parameters.push({ name: parameterName, type: parameterType });
    at += 3;
    if (raw(tokens[at], ',')) {
      at++;
      if (raw(tokens[at], ')')) {
        issue(errors, line, ...offsets(tokens[at - 1]!),
          'coral.uml.operation.parameter.invalid', 'A parameter list cannot end with a comma');
        return undefined;
      }
    } else if (!raw(tokens[at], ')')) {
      issue(errors, line, ...offsets(tokens[at] ?? parameterType),
        'coral.uml.operation.parameter.invalid', 'Expected a comma or closing parenthesis');
      return undefined;
    }
  }
  if (!raw(tokens[at], ')')) {
    issue(errors, line, ...offsets(tokens[at - 1] ?? name),
      'coral.uml.operation.invalid', 'Operation parameter list is not closed');
    return undefined;
  }
  at++;
  let returnType: CandidateToken | undefined;
  if (raw(tokens[at], ':')) {
    returnType = tokens[at + 1];
    if (!isBareId(returnType)) {
      issue(errors, line, ...offsets(returnType ?? tokens[at]!),
        'coral.uml.operation.return-type.invalid', 'Expected a return type after colon');
      return undefined;
    }
    at += 2;
  }
  if (at < tokens.length) issue(errors, line, ...offsets(tokens[at]!),
    'coral.syntax.statement.trailing', 'Unexpected text after UML operation');
  return { kind: 'operation', owner, ...(id ? { id, assignment } : {}), visibility: visibility!,
    ...(memberKind ? { memberKind } : {}), name, parameters,
    ...(returnType ? { returnType } : {}) };
}
function noteStatement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[]):
  CandidateNoteSyntax | undefined {
  const named = raw(tokens[1], '=');
  const at = named ? 2 : 0;
  const keyword = tokens[at]!;
  const text = tokens[at + 1];
  const on = tokens[at + 2];
  const target = tokens[at + 3];
  const targets: CandidateToken[] = [];
  if (named && !isId(tokens[0])) issue(errors, line, ...offsets(tokens[0]!),
    'coral.sequence.note.id-invalid', 'A named note needs an identifier');
  if (named && isId(tokens[0]) && !isBareId(tokens[0])) issue(errors, line, ...offsets(tokens[0]),
    'coral.sequence.note.id-qualified', 'A note declaration uses a local identifier');
  if (text?.kind !== 'string') issue(errors, line, ...offsets(text ?? keyword),
    'coral.sequence.note.text-quoted', 'A note body must use matching quotes');
  if (raw(tokens[at + 4], 'as')) issue(errors, line, ...offsets(tokens[at + 4]!),
    'coral.sequence.note.as-invalid', 'Use id = note to name a note; as labels nodes and edges');
  else if (!raw(on, 'on') || !isBareId(target)) issue(errors, line,
    ...offsets(on ?? text ?? keyword), 'coral.sequence.note.target',
    'A note needs a named target after on');
  else {
    targets.push(target!);
    for (let index = at + 4; index < tokens.length; index += 2) {
      if (!raw(tokens[index], ',') || !isBareId(tokens[index + 1])) {
        issue(errors, line, ...offsets(tokens[index] ?? target), 'coral.sequence.note.target',
          'Separate note targets with commas and use bare IDs');
        break;
      }
      targets.push(tokens[index + 1]!);
    }
  }
  if (errors.some((item) => item.range?.start.line === line.number &&
    item.range.start.column >= keyword.range.start.column)) return undefined;
  requireGap(keyword, text, line, errors);
  requireGap(text, on, line, errors);
  requireGap(on, target, line, errors);
  return { kind: 'note', ...(named ? { id: tokens[0], assignment: tokens[1] } : {}),
    noteKeyword: keyword, text: text!, onKeyword: on!, target: target!, targets };
}
function routeStatement(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[]):
  CandidateRouteSyntax | undefined {
  const [routeKeyword, edgeKeyword, edge, blockOpen] = tokens;
  if (!raw(edgeKeyword, 'edge') || !isNodeReference(edge) || !raw(blockOpen, '{') ||
    tokens.length !== 4) {
    issue(errors, line, ...offsets(tokens.find((token, index) => index > 0 &&
      (index === 1 ? !raw(token, 'edge') : index === 2 ? !isNodeReference(token)
        : index === 3 ? !raw(token, '{') : true)) ?? tokens[tokens.length - 1] ?? routeKeyword!),
    'coral.route.syntax.invalid', 'Expected route edge <named-edge> {');
    return undefined;
  }
  requireGap(routeKeyword, edgeKeyword, line, errors);
  requireGap(edgeKeyword, edge, line, errors);
  requireGap(edge, blockOpen, line, errors);
  return { kind: 'route', routeKeyword: routeKeyword!, edgeKeyword: edgeKeyword!, edge: edge!,
    blockOpen: blockOpen!, waypoints: [] };
}
function routeWaypoint(tokens: CandidateToken[], line: Line, errors: ParseDiagnostic[]):
  CandidateRouteWaypointSyntax | undefined {
  const [id, equals, keyword] = tokens;
  const relative = raw(tokens[3], 'relative');
  const anchor = relative ? tokens[5] : undefined;
  const nodeForm = raw(anchor, 'node');
  const portForm = raw(anchor, 'port');
  const waypointForm = raw(anchor, 'waypoint');
  const anchorWaypoint = waypointForm ? tokens[6] : undefined;
  const anchorNode = nodeForm || portForm ? tokens[6] : undefined;
  const anchorPort = portForm ? tokens[8] : undefined;
  const atIndex = relative ? portForm ? 9 : nodeForm || waypointForm ? 7 : 6 : 3;
  const at = tokens[atIndex];
  const open = tokens[atIndex + 1];
  const x = tokens[atIndex + 2];
  const comma = tokens[atIndex + 3];
  const y = tokens[atIndex + 4];
  const close = tokens[atIndex + 5];
  if (!isBareId(id) || !raw(equals, '=') || !raw(keyword, 'waypoint') ||
    (relative ? !raw(tokens[4], 'to') || !raw(at, 'offset') : !raw(at, 'at')) ||
    ((nodeForm || portForm) && !isNodeReference(anchorNode)) ||
    (waypointForm && !isBareId(anchorWaypoint)) ||
    (portForm && (!raw(tokens[7], ':') || !isBareId(anchorPort))) ||
    !raw(open, '(') || !raw(comma, ',') ||
    !raw(close, ')') || tokens.length !== atIndex + 6) {
    issue(errors, line, ...offsets(tokens[0]!), 'coral.route.waypoint.syntax',
      'Expected id = waypoint at (x, y) or id = waypoint relative to first|second|node <id>|port <node>:<port> offset (x, y)');
    return undefined;
  }
  if (relative && (!anchor || !['first', 'second', 'node', 'port', 'waypoint'].includes(anchor.value))) {
    issue(errors, line, ...offsets(anchor ?? tokens[4]!), 'coral.route.anchor.invalid',
      'A relative route waypoint names the written first or second endpoint, a node, or a semantic port');
    return undefined;
  }
  if (x?.kind !== 'number' || y?.kind !== 'number' ||
    !Number.isFinite(Number(x.value)) || !Number.isFinite(Number(y.value))) {
    const invalid = x?.kind !== 'number' || !Number.isFinite(Number(x.value)) ? x : y;
    issue(errors, line, ...offsets(invalid ?? keyword!), 'coral.route.waypoint.position.invalid',
      'Waypoint coordinates must be finite numbers');
    return undefined;
  }
  requireGap(id, equals, line, errors);
  requireGap(equals, keyword, line, errors);
  requireGap(keyword, relative ? tokens[3] : at, line, errors);
  if (relative) {
    requireGap(tokens[3], tokens[4], line, errors);
    requireGap(tokens[4], anchor, line, errors);
    requireGap(anchor, anchorNode ?? at, line, errors);
    if (anchorPort) requireGap(anchorPort, at, line, errors);
    else if (anchorNode) requireGap(anchorNode, at, line, errors);
  }
  requireGap(at, open, line, errors);
  return { id: id!, x: x!, y: y!, ...(anchor ? { anchor } : {}),
    ...(anchorNode ? { anchorNode } : {}), ...(anchorPort ? { anchorPort } : {}), ...(anchorWaypoint ? {anchorWaypoint} : {}) };
}
export function parseCandidate028(source: string, options: CandidateOptions = {}): CandidateResult {
  const diagnostics: ParseDiagnostic[] = [];
  const statements: CandidateStatement[] = [];
  const sequenceItems: CandidateSequenceItemSyntax[] = [];
  const sequenceScopes: { syntax: CandidateFragmentSyntax | CandidateActivationSyntax |
    CandidateRegionSyntax; line: Line }[] = [];
  const activeSequenceItems = (): CandidateSequenceItemSyntax[] => {
    const current = sequenceScopes[sequenceScopes.length - 1]?.syntax;
    return !current ? sequenceItems : current.kind === 'activation' || current.kind === 'region' ? current.items
      : current.operands[current.operands.length - 1]!.items;
  };
  const groups: { id: CandidateToken; open: CandidateToken; line: Line;
    syntax: CandidateNodeSyntax }[] = [];
  let portOnlyScope: { node: CandidateNodeSyntax; open: CandidateToken; line: Line } | undefined;
  let classifierScope: { node: CandidateNodeSyntax; open: CandidateToken; line: Line } | undefined;
  let compartmentScope: { syntax: CandidateCompartmentSyntax; open: CandidateToken; line: Line } | undefined;
  let routeScope: { syntax: CandidateRouteSyntax; line: Line } | undefined;
  // Descendants of a rejected block opener cannot be reinterpreted as roots.
  let invalidBlockDepth = 0;
  for (const line of sourceLines(source)) {
    const diagnosticsBeforeLine = diagnostics.length;
    const { tokens, invalidSpacing } = scan(line, diagnostics);
    const blockDelta = tokens.reduce((depth, token) => depth + (raw(token, '{') ? 1 : raw(token, '}') ? -1 : 0), 0);
    if (invalidBlockDepth > 0) {
      invalidBlockDepth = Math.max(0, invalidBlockDepth + blockDelta);
      continue;
    }
    if (options.profile === 'uml-sequence' && raw(tokens[0], '}') &&
      (raw(tokens[1], 'else') || raw(tokens[1], 'and'))) {
      const top = sequenceScopes[sequenceScopes.length - 1]?.syntax;
      const current = top?.kind === 'fragment' ? top : undefined;
      const separator = tokens[1]!;
      const expectedKind = separator.value === 'else' ? 'alt' : 'par';
      const separatorCode = separator.value === 'else'
        ? 'coral.sequence.fragment.else' : 'coral.sequence.fragment.and';
      let accepted = false;
      if (top?.kind === 'activation' || top?.kind === 'region') {
        issue(diagnostics, line, ...offsets(separator), top.kind === 'region'
          ? 'coral.sequence.region.scope' : 'coral.sequence.activation.scope',
          `A ${top.kind} must close within one containing sequence timeline`);
        top.blockClose = tokens[0]!;
        sequenceScopes.pop();
        invalidBlockDepth = raw(tokens[tokens.length - 1], '{') ? 1 : 0;
      } else if (current && current.fragmentKind.value !== expectedKind) {
        issue(diagnostics, line, ...offsets(separator), separatorCode,
          `${separator.value} continues a ${expectedKind} fragment only`);
        current.blockClose = tokens[0]!;
        sequenceScopes.pop();
        invalidBlockDepth = raw(tokens[tokens.length - 1], '{') ? 1 : 0;
      } else if (!current ||
        (expectedKind === 'alt' && (tokens.length !== 4 || tokens[2]?.kind !== 'string')) ||
        (expectedKind === 'par' && tokens.length !== 3 && tokens.length !== 4) ||
        (tokens.length === 4 && tokens[2]?.kind !== 'string') ||
        !raw(tokens[tokens.length - 1], '{')) {
        issue(diagnostics, line, ...offsets(separator), separatorCode,
          expectedKind === 'alt'
            ? 'An else operand needs an open alt block and a quoted guard'
            : 'An and operand needs an open par block and an optional quoted guard');
      } else {
        const guard = tokens.length === 4 ? tokens[2] : undefined;
        requireGap(tokens[0], separator, line, diagnostics);
        requireGap(separator, guard ?? tokens[tokens.length - 1], line, diagnostics);
        if (guard && !guard.value) issue(diagnostics, line, ...offsets(guard),
          'coral.sequence.fragment.guard', 'A fragment guard must not be empty');
        if (diagnostics.length === diagnosticsBeforeLine) {
          current.operands.push({ ...(guard ? { guard } : {}), items: [] });
          accepted = true;
        }
      }
      if (!accepted) {
        // The leading brace closes the accepted operand even if the next
        // operand's guard, separator, or spacing is rejected. Quarantine any
        // opened block so its messages cannot enter the prior timeline.
        if (current && sequenceScopes[sequenceScopes.length - 1]?.syntax === current) {
          current.blockClose = tokens[0]!;
          sequenceScopes.pop();
          if (MULTI_OPERAND_FRAGMENTS_028.has(current.fragmentKind.value) &&
            current.operands.length < 2)
            issue(diagnostics, lineForToken(current.fragmentKind),
              ...offsets(current.fragmentKind), 'coral.sequence.fragment.operands',
              `${current.fragmentKind.value} requires at least two operands`);
        }
        invalidBlockDepth = Math.max(invalidBlockDepth, tokens.slice(1).reduce((depth, token) =>
          depth + (raw(token, '{') ? 1 : raw(token, '}') ? -1 : 0), 0));
      }
      continue;
    }
    if (raw(tokens[0], '}')) {
      if (tokens.length > 1) issue(diagnostics, line, ...offsets(tokens[1]!),
        'coral.syntax.statement.trailing', 'Unexpected text after block close');
      if (routeScope) {
        routeScope.syntax.blockClose = tokens[0]!;
        routeScope = undefined;
      } else if (sequenceScopes.length) {
        const current = sequenceScopes.pop()!.syntax;
        current.blockClose = tokens[0]!;
        if (current.kind === 'fragment' && MULTI_OPERAND_FRAGMENTS_028.has(current.fragmentKind.value) &&
          current.operands.length < 2)
          issue(diagnostics, lineForToken(current.fragmentKind),
          ...offsets(current.fragmentKind), 'coral.sequence.fragment.operands',
          `${current.fragmentKind.value} requires at least two operands`);
      } else if (compartmentScope) {
        compartmentScope.syntax.blockClose = tokens[0]!;
        compartmentScope = undefined;
      } else if (classifierScope) {
        classifierScope.node.blockClose = tokens[0]!;
        classifierScope = undefined;
      } else if (portOnlyScope) {
        portOnlyScope.node.blockClose = tokens[0]!;
        portOnlyScope = undefined;
      } else if (groups.length) groups.pop()!.syntax.blockClose = tokens[0]!;
      else issue(diagnostics, line, ...offsets(tokens[0]!),
        'coral.syntax.group.unexpected-close', 'No open group matches this closing brace');
      continue;
    }
    if (invalidSpacing) {
      invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (routeScope && tokens.length) {
      routeScope.syntax.sawWaypointLine = true;
      const waypoint = routeWaypoint(tokens, line, diagnostics);
      if (waypoint && diagnostics.length === diagnosticsBeforeLine) {
        const first = routeScope.syntax.waypoints.find((entry) => entry.id.value === waypoint.id.value);
        if (first) issue(diagnostics, line, ...offsets(waypoint.id),
          'coral.route.waypoint.id.duplicate',
          `Duplicate waypoint ID on route: ${waypoint.id.value}`, first.id);
        else routeScope.syntax.waypoints.push(waypoint);
      }
      invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (raw(tokens[0], 'route') && raw(tokens[1], 'edge') &&
      tokens.some((token) => raw(token, '{'))) {
      const route = routeStatement(tokens, line, diagnostics);
      if (route && diagnostics.length === diagnosticsBeforeLine && !sequenceScopes.length &&
        !portOnlyScope && !classifierScope && !compartmentScope && options.profile !== 'uml-sequence') {
        route.scope = groups.map((group) => group.id);
        statements.push(route);
        routeScope = { syntax: route, line };
      } else {
        if (route && diagnostics.length === diagnosticsBeforeLine) issue(diagnostics, line,
          ...offsets(route.routeKeyword), 'coral.route.scope.invalid',
          'A route belongs at root or inside a group outside a sequence');
        invalidBlockDepth = Math.max(0, blockDelta);
      }
      continue;
    }
    if (options.profile === 'uml-sequence' &&
      (MULTI_OPERAND_FRAGMENTS_028.has(tokens[0]?.value ?? '') ||
        SINGLE_OPERAND_FRAGMENTS_028.has(tokens[0]?.value ?? '') ||
      (isId(tokens[0]) && raw(tokens[1], '=') &&
        (MULTI_OPERAND_FRAGMENTS_028.has(tokens[2]?.value ?? '') ||
          SINGLE_OPERAND_FRAGMENTS_028.has(tokens[2]?.value ?? ''))))) {
      const named = raw(tokens[1], '=');
      const at = named ? 2 : 0;
      const kind = tokens[at]!;
      const guard = tokens[at + 1]?.kind === 'string' ? tokens[at + 1] : undefined;
      const open = tokens[at + (guard ? 2 : 1)];
      const guardRequired = kind.value === 'alt' || kind.value === 'opt' || kind.value === 'break';
      if (named && !isBareId(tokens[0])) {
        issue(diagnostics, line, ...offsets(tokens[0]!), 'coral.sequence.fragment.id-qualified',
          'A fragment declaration uses a local identifier');
        invalidBlockDepth = Math.max(0, blockDelta);
        continue;
      }
      if (tokens.length !== at + (guard ? 3 : 2) || guardRequired && !guard || !raw(open, '{')) {
        issue(diagnostics, line, ...offsets(kind), 'coral.sequence.fragment.syntax',
          `${kind.value} needs ${guardRequired ? 'a quoted' : 'an optional quoted'} guard and an opening brace`);
        invalidBlockDepth = Math.max(0, blockDelta);
        continue;
      }
      requireGap(kind, guard ?? open, line, diagnostics);
      if (guard && !guard.value) issue(diagnostics, line, ...offsets(guard),
        'coral.sequence.fragment.guard', 'A fragment guard must not be empty');
      if (diagnostics.length === diagnosticsBeforeLine) {
        const fragment: CandidateFragmentSyntax = { kind: 'fragment',
          ...(named ? { id: tokens[0], assignment: tokens[1] } : {}),
          fragmentKind: kind, blockOpen: open!, operands: [
            { ...(guard ? { guard } : {}), items: [] },
          ] };
        activeSequenceItems().push(fragment);
        statements.push(fragment);
        sequenceScopes.push({ syntax: fragment, line });
      } else invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (options.profile === 'uml-sequence' && (raw(tokens[0], 'activation') ||
      (isId(tokens[0]) && raw(tokens[1], '=') && raw(tokens[2], 'activation')))) {
      const named = raw(tokens[1], '=');
      const at = named ? 2 : 0;
      const keyword = tokens[at]!;
      const participant = tokens[at + 1];
      const open = tokens[at + 2];
      if (named && !isBareId(tokens[0])) issue(diagnostics, line, ...offsets(tokens[0]!),
        'coral.sequence.activation.id-qualified', 'An activation declaration uses a local identifier');
      if (tokens.length !== at + 3 || !isBareId(participant) || !raw(open, '{')) {
        issue(diagnostics, line, ...offsets(participant ?? keyword), 'coral.sequence.activation.syntax',
          'Expected activation participant {');
      } else {
        requireGap(keyword, participant, line, diagnostics);
        requireGap(participant, open, line, diagnostics);
      }
      if (diagnostics.length === diagnosticsBeforeLine) {
        const activation: CandidateActivationSyntax = { kind: 'activation',
          ...(named ? { id: tokens[0], assignment: tokens[1] } : {}),
          activationKeyword: keyword, participant: participant!, blockOpen: open!, items: [] };
        activeSequenceItems().push(activation);
        statements.push(activation);
        sequenceScopes.push({ syntax: activation, line });
      } else invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (options.profile === 'uml-sequence' && (raw(tokens[0], 'region') ||
      (isId(tokens[0]) && raw(tokens[1], '=') && raw(tokens[2], 'region')))) {
      const named = raw(tokens[1], '=');
      const at = named ? 2 : 0;
      const keyword = tokens[at]!;
      const label = tokens[at + 1]?.kind === 'string' ? tokens[at + 1] : undefined;
      const open = tokens[at + (label ? 2 : 1)];
      if (named && !isBareId(tokens[0])) issue(diagnostics, line, ...offsets(tokens[0]!),
        'coral.sequence.region.id-qualified', 'A region declaration uses a local identifier');
      if (tokens.length !== at + (label ? 3 : 2) || !raw(open, '{')) {
        issue(diagnostics, line, ...offsets(keyword), 'coral.sequence.region.syntax',
          'Expected region ["label"] {');
      } else requireGap(keyword, label ?? open, line, diagnostics);
      if (diagnostics.length === diagnosticsBeforeLine) {
        const region: CandidateRegionSyntax = { kind: 'region',
          ...(named ? { id: tokens[0], assignment: tokens[1] } : {}),
          regionKeyword: keyword, ...(label ? { label } : {}), blockOpen: open!, items: [] };
        activeSequenceItems().push(region);
        statements.push(region);
        sequenceScopes.push({ syntax: region, line });
      } else invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (options.profile === 'uml-sequence' && (raw(tokens[0], 'participants') ||
      (isId(tokens[0]) && raw(tokens[1], '=') && raw(tokens[2], 'participants')))) {
      const named = raw(tokens[1], '=');
      const at = named ? 2 : 0;
      const keyword = tokens[at]!;
      const members: CandidateToken[] = [];
      let cursor = at + 1;
      if (named && !isBareId(tokens[0])) issue(diagnostics, line, ...offsets(tokens[0]!),
        'coral.sequence.group.id-qualified', 'A participant group uses a local identifier');
      while (true) {
        const member = tokens[cursor];
        if (!isBareId(member)) {
          issue(diagnostics, line, ...offsets(member ?? tokens[cursor - 1] ?? keyword), 'coral.sequence.group.syntax',
            'Expected participant IDs separated by commas');
          break;
        }
        members.push(member);
        cursor++;
        if (!raw(tokens[cursor], ',')) break;
        cursor++;
      }
      if (members.length) requireGap(keyword, members[0], line, diagnostics);
      let label: CandidateToken | undefined;
      if (cursor < tokens.length) {
        if (raw(tokens[cursor], '[') && raw(tokens[cursor + 1], 'label') &&
          raw(tokens[cursor + 2], ':') && tokens[cursor + 3]?.kind === 'string' &&
          raw(tokens[cursor + 4], ']') && cursor + 5 === tokens.length) {
          label = tokens[cursor + 3];
        } else if (raw(tokens[cursor], '[') || raw(tokens[cursor], 'as'))
          issue(diagnostics, line, ...offsets(tokens[cursor]!),
            'coral.sequence.group.label', 'Use [label: "text"] for a participant group label');
        else issue(diagnostics, line, ...offsets(tokens[cursor]!),
          'coral.sequence.group.syntax', 'Expected a comma between participant IDs');
      }
      if (sequenceScopes.length) issue(diagnostics, line, ...offsets(keyword),
        'coral.sequence.group.scope', 'A participant group is declared at root sequence scope');
      if (diagnostics.length === diagnosticsBeforeLine) statements.push({
        kind: 'participant-group', ...(named ? { id: tokens[0], assignment: tokens[1] } : {}),
        participantsKeyword: keyword, members, ...(label ? { label } : {}),
      });
      continue;
    }
    if (options.profile === 'uml-sequence' && (raw(tokens[0], 'note') ||
      (isId(tokens[0]) && raw(tokens[1], '=') && raw(tokens[2], 'note')))) {
      const note = noteStatement(tokens, line, diagnostics);
      if (note && diagnostics.length === diagnosticsBeforeLine) {
        activeSequenceItems().push(note);
        statements.push(note);
      }
      continue;
    }
    const portOwner = classifierScope?.node.id ?? portOnlyScope?.node.id ?? groups[groups.length - 1]?.id;
    if (portOwner && raw(tokens[1], 'port')) {
      const port = portStatement(tokens, line, diagnostics, portOwner, options.edition);
      if (port && diagnostics.length === diagnosticsBeforeLine) {
        port.ownerQualifiedId = classifierScope?.node.qualifiedId ?? portOnlyScope?.node.qualifiedId ??
          groups[groups.length - 1]?.syntax.qualifiedId;
        statements.push(port);
      }
      else if (diagnostics.length > diagnosticsBeforeLine) invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (portOnlyScope && tokens.length) {
      issue(diagnostics, line, ...offsets(tokens[0]!), 'coral.syntax.node.body.invalid',
        'A node body accepts only port declarations');
      invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (compartmentScope) {
      const member = compartmentScope.syntax.compartmentKind.value === 'operations'
        ? operationStatement(tokens, line, diagnostics, compartmentScope.syntax)
        : attributeStatement(tokens, line, diagnostics, compartmentScope.syntax);
      if (member && diagnostics.length === diagnosticsBeforeLine) statements.push(member);
      else if (diagnostics.length > diagnosticsBeforeLine) invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    if (classifierScope) {
      const compartment = compartmentStatement(tokens, line, diagnostics, classifierScope.node.id);
      if (compartment && diagnostics.length === diagnosticsBeforeLine) {
        statements.push(compartment);
        if (!compartment.blockClose) compartmentScope = { syntax: compartment, open: compartment.blockOpen, line };
      } else if (diagnostics.length > diagnosticsBeforeLine) invalidBlockDepth = Math.max(0, blockDelta);
      continue;
    }
    const parsed = statement(tokens, line, diagnostics);
    if (parsed && diagnostics.length === diagnosticsBeforeLine) {
      if (sequenceScopes.length && parsed.kind !== 'edge') {
        issue(diagnostics, line, ...offsets(tokens[0]!), 'coral.sequence.fragment.item',
          'A sequence block contains messages, notes, activations, or nested fragments');
        continue;
      }
      if (options.profile === 'uml-sequence' && parsed.kind === 'edge') {
        activeSequenceItems().push(parsed);
      }
      if (parsed.kind === 'node') {
        const parent = groups[groups.length - 1];
        if (parent) parsed.parentGroup = parent.id;
        if (!isBareId(parsed.id)) {
          issue(diagnostics, line, ...offsets(parsed.id),
            parsed.id.raw.includes('.') ? 'coral.syntax.node.id-qualified' : 'coral.syntax.node.id-invalid',
            'A declaration needs a bare local ID; its group supplies the qualified identity');
          invalidBlockDepth = Math.max(0, blockDelta);
          continue;
        }
        parsed.qualifiedId = parent ? `${parent.syntax.qualifiedId}.${parsed.id.value}` : parsed.id.value;
        if (parsed.blockOpen && !parsed.blockClose) {
          if (parsed.nodeKind.value === 'class' || parsed.nodeKind.value === 'interface') {
            if (options.profile === 'uml-class') classifierScope = { node: parsed, open: parsed.blockOpen, line };
            else issue(diagnostics, line, ...offsets(parsed.blockOpen), 'coral.uml.class.profile-required',
              'A classifier body requires the UML class profile');
          } else if (parsed.nodeKind.value === 'group') groups.push({ id: parsed.id, open: parsed.blockOpen, line,
            syntax: parsed });
          else portOnlyScope = { node: parsed, open: parsed.blockOpen, line };
        }
      }
      if (parsed.kind === 'edge' || parsed.kind === 'arrangement' || parsed.kind === 'constraint') {
        parsed.scope = groups.map((group) => group.id);
        if (parsed.id) {
          const parent = groups[groups.length - 1];
          parsed.qualifiedId = parent
            ? `${parent.syntax.qualifiedId}.${parsed.id.value}` : parsed.id.value;
        }
      }
      if(parsed.kind==='layout'&&groups.length)spatialIssue028(diagnostics,parsed.keyword,'layout.option.invalid','Layout is a document-level declaration');
      statements.push(parsed);
    } else if (diagnostics.length > diagnosticsBeforeLine) invalidBlockDepth = Math.max(0, blockDelta);
  }
  if (compartmentScope) issue(diagnostics, compartmentScope.line, ...offsets(compartmentScope.open),
    'coral.uml.compartment.unclosed', 'UML compartment is not closed');
  if (routeScope) issue(diagnostics, routeScope.line, ...offsets(routeScope.syntax.blockOpen),
    'coral.route.unclosed', 'Route block is not closed');
  if (classifierScope) issue(diagnostics, classifierScope.line, ...offsets(classifierScope.open),
    'coral.uml.class.unclosed', `Class ${classifierScope.node.id.value} is not closed`);
  if (portOnlyScope) issue(diagnostics, portOnlyScope.line, ...offsets(portOnlyScope.open),
    'coral.syntax.node.unclosed', `Node ${portOnlyScope.node.id.value} is not closed`);
  for (const group of groups) issue(diagnostics, group.line, ...offsets(group.open),
    'coral.syntax.group.unclosed', `Group ${group.id.value} is not closed`);
  for (const scope of sequenceScopes) issue(diagnostics, scope.line, ...offsets(scope.syntax.blockOpen),
    scope.syntax.kind === 'activation' ? 'coral.sequence.activation.unclosed'
      : scope.syntax.kind === 'region' ? 'coral.sequence.region.unclosed' : 'coral.sequence.fragment.unclosed',
    scope.syntax.kind === 'activation' ? 'Activation is not closed'
      : scope.syntax.kind === 'region' ? 'Region is not closed'
      : `${scope.syntax.fragmentKind.value} fragment is not closed`);
  const graph: GraphIR = { version: '3.0.0', id: options.graphId ?? 'coral-graph', nodes: [], edges: [],
    ...(options.profile ? { metadata: { notation: options.profile } } : {}) };
  const nodes = new Map<string, GraphNode>();
  const nodeByDeclaration = new Map<CandidateToken, GraphNode>();
  const declared = new Map<string, CandidateToken>();
  const invalidSequenceNodeIds = new Set<string>();
  const edgeIds = new Map<string, CandidateToken>();
  const participantOrder: string[] = [];
  const messages: InteractionMessage[] = [];
  const sequence = options.profile === 'uml-sequence';
  const resolveNodeId = (token: CandidateToken, scope?: CandidateToken[]): string | undefined => {
    if (token.value.includes('.')) return nodes.has(token.value) ? token.value : undefined;
    const parts = (scope ?? []).map((part) => part.value);
    for (let depth = parts.length; depth >= 0; depth--) {
      const candidate = [...parts.slice(0, depth), token.value].join('.');
      if (nodes.has(candidate)) return candidate;
    }
    return undefined;
  };
  if (sequence) {
    graph.profile = { id: 'uml', kind: 'sequence', version: '1.0.0' };
  }
  if (options.profile === 'uml-class') graph.profile = { id: 'uml', kind: 'class', version: '1.0.0' };
  let edgeOrdinal = 0;
  for (const item of statements) {
    if (item.kind !== 'node') continue;
    const id = item.qualifiedId ?? item.id.value;
    const firstNode = declared.get(id);
    if (firstNode) {
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.identity.node.duplicate',
        message: `Duplicate node ID: ${id}`, position: item.id.range.start, range: item.id.range,
        related: [{ message: 'First node declaration', position: firstNode.range.start,
          range: firstNode.range }] }));
      continue;
    }
    declared.set(id, item.id);
    if (sequence && !(SEQUENCE_PARTICIPANT_TYPES as readonly string[]).includes(item.nodeKind.value)) {
      invalidSequenceNodeIds.add(id);
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.sequence.participant.invalid',
        message: `Sequence participant "${item.id.value}" must be an actor or participant`,
        position: item.nodeKind.range.start, range: item.nodeKind.range }));
      continue;
    }
    const node: GraphNode = { id, type: item.nodeKind.value,
      label: item.label?.value ?? id,
      ...(item.symbol ? { symbol: item.symbol.value } : {}),
      ...(item.variant ? { variant: item.variant.value } : {}),
      ...(item.position ? { position: { x: Number(item.position.x.value),
        y: Number(item.position.y.value) } } : {}),
      ...(item.pinned && item.position ? { pinned: true } : {}),
      ...(item.labelPlacement ? { labelPlacement: {
        side: item.labelPlacement.side.value as 'above' | 'below' | 'left' | 'right' | 'center',
        ...(item.labelPlacement.offset ? { offset: Number(item.labelPlacement.offset.value) } : {}),
      } } : {}),
      ...(options.profile === 'uml-class' &&
        (item.nodeKind.value === 'class' || item.nodeKind.value === 'interface')
        ? { classifier: classifierFor(item.nodeKind.value, item.label?.value ?? item.id.value) } : {}),
      ...(item.parentGroup ? { parent: id.slice(0, id.lastIndexOf('.')) } : {}) };
    if (item.parentGroup) {
      const parentId = node.parent!;
      const parent = nodes.get(parentId);
      if (parent?.type !== 'group' || declared.get(parentId) !== item.parentGroup) {
        diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.syntax.group.parent-invalid',
          message: `Group ${item.parentGroup.value} is not a valid parent`,
          position: item.parentGroup.range.start, range: item.parentGroup.range }));
        continue;
      }
      parent.children ??= [];
      parent.children.push(node);
    } else graph.nodes.push(node);
    nodes.set(node.id, node);
    nodeByDeclaration.set(item.id, node);
    participantOrder.push(node.id);
  }
  const portIds = new Map<string, CandidateToken>();
  for (const item of statements) {
    if (item.kind !== 'port' || !nodeByDeclaration.has(item.owner)) continue;
    const key = `${item.ownerQualifiedId ?? item.owner.value}\0${item.id.value}`;
    const first = portIds.get(key);
    if (first) diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.identity.port.duplicate',
      message: `Duplicate port ID on ${item.owner.value}: ${item.id.value}`,
      position: item.id.range.start, range: item.id.range,
      related: [{ message: 'First port declaration', position: first.range.start, range: first.range }] }));
    else portIds.set(key, item.id);
  }
  const compartments = new Map<CandidateCompartmentSyntax, ClassifierCompartment>();
  const compartmentIds = new Map<string, CandidateToken>();
  const memberIds = new Map<string, CandidateToken>();
  for (const item of statements) {
    if (item.kind !== 'compartment') continue;
    const node = nodeByDeclaration.get(item.owner);
    if (!node?.classifier) continue;
    const id = item.id?.value ?? `${item.compartmentKind.value}_${node.classifier.compartments.length}`;
    const key = `${node.id}\0${id}`;
    const first = compartmentIds.get(key);
    if (first) {
      issue(diagnostics, { text: '', start: item.compartmentKind.range.start.offset - item.compartmentKind.range.start.column,
        number: item.compartmentKind.range.start.line },
      (item.id ?? item.compartmentKind).range.start.column, (item.id ?? item.compartmentKind).range.end.column,
      'coral.uml.compartment.id.duplicate', `Duplicate compartment ID: ${id}`, first);
      continue;
    }
    compartmentIds.set(key, item.id ?? item.compartmentKind);
    const compartment: ClassifierCompartment = item.compartmentKind.value === 'operations'
      ? { id, kind: 'operations', items: [] }
      : { id, kind: 'attributes', items: [] };
    node.classifier.compartments.push(compartment);
    compartments.set(item, compartment);
  }
  const reservedMemberIds = new Set(statements.flatMap((item) => {
    if (item.kind !== 'attribute' && item.kind !== 'operation' || !item.id) return [];
    const ownerId = nodeByDeclaration.get(item.owner.owner)?.id;
    return ownerId ? [`${ownerId}\0${item.id.value}`] : [];
  }));
  const memberOrdinals = new Map<string, number>();
  for (const item of statements) {
    if (item.kind !== 'attribute' && item.kind !== 'operation') continue;
    const compartment = compartments.get(item.owner);
    if (!compartment) continue;
    const ownerId = nodeByDeclaration.get(item.owner.owner)?.id;
    if (!ownerId) continue;
    let id = item.id?.value;
    if (!id) {
      let ordinal = memberOrdinals.get(ownerId) ?? 0;
      do { id = `${item.kind}_${++ordinal}`; }
      while (reservedMemberIds.has(`${ownerId}\0${id}`) || memberIds.has(`${ownerId}\0${id}`));
      memberOrdinals.set(ownerId, ordinal);
    }
    const key = `${ownerId}\0${id}`;
    const first = memberIds.get(key);
    if (first) {
      const token = item.id ?? item.name;
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.uml.member.id.duplicate',
        message: `Duplicate UML member ID: ${id}`, position: token.range.start, range: token.range,
        related: [{ message: 'First member declaration', position: first.range.start, range: first.range }] }));
      continue;
    }
    memberIds.set(key, item.id ?? item.name);
    if (item.kind === 'attribute' && compartment.kind === 'attributes') {
      const visibility = ({ '+': 'public', public: 'public', private: 'private',
        protected: 'protected', package: 'package',
      } as const)[item.visibility.value as '+' | 'public' | 'private' | 'protected' | 'package'];
      const attribute: ClassifierAttribute = { id, kind: 'attribute', visibility,
        name: item.name.value, type: item.valueType.value };
      compartment.items.push(attribute);
    } else if (item.kind === 'operation' && compartment.kind === 'operations') {
      const visibility = ({ '+': 'public', '-': 'private', '#': 'protected', '~': 'package',
        public: 'public', private: 'private', protected: 'protected', package: 'package',
      } as const)[item.visibility.value as '+' | '-' | '#' | '~' | 'public' | 'private' | 'protected' | 'package'];
      const operation: ClassifierOperation = { id, kind: 'operation', visibility,
        name: item.name.value, parameters: item.parameters.map((parameter) => ({
          name: parameter.name.value, ...(parameter.type ? { type: parameter.type.value } : {}),
        })), ...(item.returnType ? { returnType: item.returnType.value } : {}) };
      compartment.items.push(operation);
    }
  }
  const arrangementIds = new Map<string, CandidateToken>();
  const explicitArrangementIds = new Set(statements.flatMap((item) =>
    (item.kind === 'arrangement' || item.kind === 'constraint') && item.id ? [item.qualifiedId ?? item.id.value] : []));
  let arrangementOrdinal = 0;
  for (const item of statements) {
    if (item.kind !== 'arrangement' || item.parameters || item.subjects.some(t => 'referenceKind' in t)) continue;
    let valid = true;
    const seenSubjects = new Map<string, CandidateToken>();
    const resolvedSubjects: string[] = [];
    for (const subject of item.subjects) {
      const resolved = resolveNodeId(subject, item.scope);
      const firstSubject = seenSubjects.get(resolved ?? subject.value);
      if (firstSubject) {
        diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.reference.arrangement.duplicate-subject',
          message: `Repeated arrangement subject: ${subject.value}`, position: subject.range.start,
          range: subject.range, related: [{ message: 'First subject', position: firstSubject.range.start,
            range: firstSubject.range }] }));
        valid = false;
      } else seenSubjects.set(resolved ?? subject.value, subject);
      if (!resolved) {
        diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.reference.arrangement.unresolved',
          message: `Unresolved arrangement subject: ${subject.value}`,
          position: subject.range.start, range: subject.range }));
        valid = false;
      } else resolvedSubjects.push(resolved);
    }
    let id = item.qualifiedId;
    if (!id) {
      do { id = [...(item.scope??[]).map(t=>t.value),`arrangement_${++arrangementOrdinal}`].join('.'); }
      while (explicitArrangementIds.has(id) || arrangementIds.has(id));
    }
    const firstId = arrangementIds.get(id);
    if (firstId) {
      const token = item.id ?? item.keyword;
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.identity.arrangement.duplicate',
        message: `Duplicate arrangement ID: ${id}`, position: token.range.start, range: token.range,
        related: [{ message: 'First arrangement declaration', position: firstId.range.start,
          range: firstId.range }] }));
      valid = false;
    } else arrangementIds.set(id, item.id ?? item.keyword);
    if (!valid) continue;
    graph.constraints ??= [];
    graph.constraints.push({ id, kind: 'arrangement', axis: item.axis.value as 'row' | 'column',
      subjects: resolvedSubjects.map((nodeId) => ({ kind: 'node', nodeId })) });
  }
  for (const item of statements) {
    if (item.kind !== 'edge') continue;
    const resolvedSource = resolveNodeId(item.source, item.scope);
    const resolvedTarget = resolveNodeId(item.target, item.scope);
    if (resolvedSource) item.resolvedSource = resolvedSource;
    if (resolvedTarget) item.resolvedTarget = resolvedTarget;
    const operatorConnector = item.operatorConnector ?? item.connector;
    const reverseSequence = sequence && operatorConnector?.firstEnd.kind === 'arrow' &&
      operatorConnector.secondEnd.kind === 'none';
    const forwardSequence = sequence && operatorConnector?.firstEnd.kind === 'none' &&
      operatorConnector.secondEnd.kind === 'arrow';
    if (sequence && !reverseSequence && !forwardSequence) {
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.sequence.operator.unsupported',
        message: 'A UML sequence message requires exactly one arrow-ended connector',
        position: item.operator.range.start, range: item.operator.range }));
      continue;
    }
    const create = sequence && isDashedOpenArrow028(operatorConnector) &&
      item.edgeType?.value === 'create';
    const arrowEnd = reverseSequence ? operatorConnector?.firstEnd : operatorConnector?.secondEnd;
    const messageKind: InteractionMessage['kind'] = create ? 'create'
      : operatorConnector?.stroke === 'dashed' ? 'return'
        : arrowEnd?.kind === 'arrow' && arrowEnd.fill === 'filled'
          ? 'synchronous' : 'asynchronous';
    const sourceExists = resolvedSource !== undefined;
    if (!sourceExists && !invalidSequenceNodeIds.has(item.source.value)) {
      referenceError(diagnostics, item.source, 'source');
    }
    if (!resolvedTarget) {
      if (create) {
        if (sourceExists && !invalidSequenceNodeIds.has(item.target.value)) {
          const node: GraphNode = { id: item.target.value, type: 'participant', label: item.target.value };
          graph.nodes.push(node); nodes.set(node.id, node); participantOrder.push(node.id);
          item.resolvedTarget = node.id;
        }
      } else if (!invalidSequenceNodeIds.has(item.target.value)) {
        referenceError(diagnostics, item.target, 'target');
      }
    }
    // A failed reference is a source diagnostic, not a dangling GraphIR edge.
    // Keep valid neighboring statements independently projectable.
    if (!sourceExists || !item.resolvedTarget) continue;
    const id = item.qualifiedId ?? `edge-${++edgeOrdinal}`;
    const firstEdge = edgeIds.get(id);
    if (firstEdge) {
      const duplicate = item.id ?? item.source;
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.identity.edge.duplicate',
        message: `Duplicate edge ID: ${id}`, position: duplicate.range.start, range: duplicate.range,
        related: [{ message: 'First edge declaration', position: firstEdge.range.start,
          range: firstEdge.range }] }));
      continue;
    }
    edgeIds.set(id, item.id ?? item.source);
    // GraphIR 3 requires sequence display edges to run sender-to-receiver.
    // Reverse source endpoint order remains authoritative in the syntax tree
    // and in the direct successor projection, not in this display graph.
    const edge: GraphEdge = { id,
      source: reverseSequence ? item.resolvedTarget : item.resolvedSource!,
      target: reverseSequence ? item.resolvedSource! : item.resolvedTarget,
      ...((reverseSequence ? item.targetPort : item.sourcePort)
        ? { sourcePort: (reverseSequence ? item.targetPort : item.sourcePort)!.value } : {}),
      ...((reverseSequence ? item.sourcePort : item.targetPort)
        ? { targetPort: (reverseSequence ? item.sourcePort : item.targetPort)!.value } : {}),
      // The approved source word names the existing portable profile relation.
      // Keep the authored token intact for exact saves and bounded edits.
      ...(item.edgeType ? { type: options.profile === 'data-engineering' &&
        item.edgeType.value === 'batchFlow' ? 'batch-flow' : item.edgeType.value }
        : sequence ? { type: sequenceMessageToken(messageKind) }
          : options.profile === 'uml-state' ? { type: 'transition' } : {}),
      ...(item.label ? { label: item.label.value } : {}),
      ...(item.labelPlacement ? { labelPlacement: {
        side: item.labelPlacement.side.value as 'above' | 'below' | 'left' | 'right' | 'center',
        ...(item.labelPlacement.at ? { at: Number(item.labelPlacement.at.value) } : {}),
        ...(item.labelPlacement.offset ? { offset: Number(item.labelPlacement.offset.value) } : {}),
      } } : {}) };
    if (item.connector) {
      edge.sourceEnd = { marker: reverseSequence
        ? { kind: 'none', fill: 'unspecified' } : item.connector.firstEnd };
      const marker = sequence && arrowEnd?.kind === 'arrow' &&
        arrowEnd.fill === 'filled'
        ? { kind: 'triangle' as const, fill: 'filled' as const }
        : reverseSequence ? item.connector.firstEnd : item.connector.secondEnd;
      edge.targetEnd = { marker };
      if (item.style && ['solid', 'dashed', 'dotted'].includes(item.style.value))
        edge.style = { lineStyle: item.style.value as 'solid' | 'dashed' | 'dotted' };
      else if (item.connector.stroke === 'dashed') edge.style = { lineStyle: 'dashed' };
    }
    graph.edges.push(edge);
    if (sequence) messages.push({ id, edgeId: id, sourceParticipantId: edge.source,
      targetParticipantId: edge.target, kind: messageKind });
  }
  const routedEdges = new Map<string, CandidateToken>();
  const routeIntents028: Record<string, RouteIntentSuccessor> = Object.create(null) as Record<string, RouteIntentSuccessor>;
  for (const route of statements) {
    if (route.kind !== 'route') continue;
    const scope = route.scope?.map((part) => part.value) ?? [];
    const candidates = route.edge.value.includes('.') ? [route.edge.value]
      : Array.from({ length: scope.length + 1 }, (_, index) =>
        [...scope.slice(0, scope.length - index), route.edge.value].join('.'));
    const edgeId = candidates.find((id) => edgeIds.has(id));
    if (!edgeId) {
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.route.edge.unresolved',
        message: `Route target is not a named edge: ${route.edge.value}`,
        position: route.edge.range.start, range: route.edge.range }));
      continue;
    }
    const firstRoute = routedEdges.get(edgeId);
    if (firstRoute) {
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.route.edge.duplicate',
        message: `Edge ${edgeId} has more than one route`,
        position: route.edge.range.start, range: route.edge.range,
        related: [{ message: 'First route', position: firstRoute.range.start,
          range: firstRoute.range }] }));
      continue;
    }
    routedEdges.set(edgeId, route.edge);
    if (!route.waypoints.length && !route.sawWaypointLine) {
      diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.route.waypoint.required',
        message: 'A route needs at least one waypoint',
        position: route.blockOpen.range.start, range: route.blockOpen.range }));
      continue;
    }
    if (!route.waypoints.length) continue;
    const waypoints: NonNullable<GraphEdge['routeIntent']>['waypoints'] = [];
    for (const waypoint of route.waypoints) {
      const point = { x: Number(waypoint.x.value), y: Number(waypoint.y.value) };
      if (!waypoint.anchor) waypoints.push({ id: waypoint.id.value,
        placement: { kind: 'absolute', position: point } });
      else if (waypoint.anchorWaypoint) {
        if (!route.waypoints.some(other => other.id.value === waypoint.anchorWaypoint!.value)) spatialIssue028(diagnostics,waypoint.anchorWaypoint,'coral.route.anchor.unresolved','Unknown route-local waypoint');
      } else if (waypoint.anchorNode) {
        const nodeId = resolveNodeId(waypoint.anchorNode, route.scope);
        if (!nodeId) {
          diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.route.anchor.node.unresolved',
            message: `Unknown route anchor node: ${waypoint.anchorNode.value}`,
            position: waypoint.anchorNode.range.start, range: waypoint.anchorNode.range }));
          continue;
        }
        waypoints.push({ id: waypoint.id.value, placement: { kind: 'relative',
          anchor: waypoint.anchorPort
            ? { kind: 'port', nodeId, portId: waypoint.anchorPort.value }
            : { kind: 'node', nodeId }, offset: point } });
      } else waypoints.push({ id: waypoint.id.value, placement: { kind: 'relative',
        anchor: { kind: waypoint.anchor.value === 'first' ? 'source' : 'target' }, offset: point } });
    }
    const edge = graph.edges.find((entry) => entry.id === edgeId);
    const portable: RouteIntentSuccessor['waypoints'] = [];
    for (const waypoint of route.waypoints) {
      const point={x:Number(waypoint.x.value),y:Number(waypoint.y.value)};
      if (waypoint.anchorWaypoint) portable.push({id:waypoint.id.value,placement:{kind:'relative',anchor:{kind:'waypoint',waypointId:waypoint.anchorWaypoint.value},offset:point}});
      else {
        const staged=waypoints.find(item=>item.id===waypoint.id.value);if(!staged)continue;
        const placement=staged.placement;
        portable.push({id:staged.id,placement:placement.kind==='absolute'?placement:{kind:'relative',offset:placement.offset,anchor:placement.anchor.kind==='source'?{kind:'first'}:placement.anchor.kind==='target'?{kind:'second'}:placement.anchor}});
      }
    }
    if (portable.length === route.waypoints.length) routeIntents028[edgeId] = {waypoints:portable};
    if (edge && waypoints.length === route.waypoints.length) edge.routeIntent = { waypoints };
  }
  if (sequence) graph.interaction = {
    participants: participantOrder.map((id) => ({ id, nodeId: id })), participantOrder,
    messages, messageOrder: messages.map((message) => message.id),
  };
  const sequenceCreations = new Map<string, CandidateEdgeSyntax>();
  if (sequence) for (const item of statements) {
    if (item.kind === 'edge' && item.edgeType?.value === 'create' &&
      isDashedOpenArrow028(item.operatorConnector ?? item.connector) &&
      !sequenceCreations.has(item.target.value))
      sequenceCreations.set(item.target.value, item);
  }
  if (sequence) for (const item of statements) {
    if (item.kind !== 'edge') continue;
    for (const endpoint of [item.source, item.target]) {
      const creation = sequenceCreations.get(endpoint.value);
      if (creation && item.operator.range.start.offset < creation.operator.range.start.offset)
        issue(diagnostics, lineForToken(endpoint), ...offsets(endpoint),
          'coral.sequence.message.outside-participant-lifetime',
          `Message references ${endpoint.value} before its creation message`);
    }
  }
  if (sequence) for (const item of statements) {
    if (item.kind !== 'activation') continue;
    if (!nodes.has(item.participant.value)) {
      issue(diagnostics, lineForToken(item.participant), ...offsets(item.participant),
        'coral.sequence.activation.participant-unresolved',
        `Unknown activation participant: ${item.participant.value}`);
      continue;
    }
    const creation = sequenceCreations.get(item.participant.value);
    if (creation &&
      item.activationKeyword.range.start.offset < creation.operator.range.start.offset)
      issue(diagnostics, lineForToken(item.participant), ...offsets(item.participant),
        'coral.sequence.activation.outside-participant-lifetime',
        `Activation targets ${item.participant.value} before its creation message`);
  }
  const layouts=statements.filter((item):item is CandidateLayoutSyntax028=>item.kind==='layout');
  if(layouts.length>1) for(const layout of layouts.slice(1)) spatialIssue028(diagnostics,layout.keyword,'layout.option.invalid','Only one document layout declaration is allowed',layouts[0]!.keyword);
  const spatialConstraints028=resolveSpatial028(statements,graph.constraints??[],diagnostics);
  return { graph, statements, sequenceItems, ...(spatialConstraints028.length?{spatialConstraints028}:{}), ...(layouts[0]?{layoutOptions028:layouts[0].options}:{}), ...(Object.keys(routeIntents028).length?{routeIntents028}:{}), diagnostics: diagnostics.sort((a, b) => a.offset - b.offset) };
}

/** Replace only an existing authored label token; retain its quote delimiter. */
export function replaceCandidateLabel(source: string, item: CandidateStatement, value: string): string {
  if (item.kind !== 'node' && item.kind !== 'edge') throw new Error('Only nodes and edges have rendered labels');
  const label = item.label;
  if (!label) throw new Error('The statement has no authored label to replace');
  const delimiter = label.raw[0];
  if (delimiter !== '"' && delimiter !== "'") throw new Error('Invalid authored quote delimiter');
  const escaped = escapeCandidateLabel(value, delimiter);
  const { start, end } = label.range;
  return source.slice(0, start.offset) + delimiter + escaped + delimiter + source.slice(end.offset);
}

function escapeCandidateLabel(value: string, delimiter: '"' | "'"): string {
  for (const char of value) {
    const point = char.codePointAt(0)!;
    if (point < 0x20 && char !== '\n' || point >= 0x7f && point <= 0x9f ||
        point === 0x2028 || point === 0x2029 || point >= 0xd800 && point <= 0xdfff)
      throw new Error('Unsupported control character in label');
  }
  return value.split('\\').join('\\\\').split(delimiter).join(`\\${delimiter}`).split('\n').join('\\n');
}

/** Add an authored `as` only for an explicit label edit; preserve all neighboring bytes. */
export function setCandidateLabel(source: string, item: CandidateStatement, value: string): string {
  if (item.kind !== 'node' && item.kind !== 'edge') throw new Error('Only nodes and edges have rendered labels');
  if (item.label) return replaceCandidateLabel(source, item, value);
  const insertion = item.kind === 'node' ? (item.bracketClose ?? item.nodeKind).range.end.offset
    : (item.bracketClose ?? item.targetPort ?? item.target).range.end.offset;
  const generated = ` as "${escapeCandidateLabel(value, '"')}"`;
  return source.slice(0, insertion) + generated + source.slice(insertion);
}
