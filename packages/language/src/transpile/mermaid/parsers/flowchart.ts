import type { BodyLine, LineIndex } from '../preprocess.js';
import { splitStatementsOnSemicolon, splitTrailingToken } from '../lexer.js';
import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';

export type FlowchartClassicShape =
  | 'bare'
  | 'rect'
  | 'rounded'
  | 'stadium'
  | 'subproc'
  | 'cylinder'
  | 'circle'
  | 'dbl-circle'
  | 'asymmetric'
  | 'diamond'
  | 'hexagon'
  | 'lean-r'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t'
  | 'expanded';

export interface FlowchartNodeRef {
  rawId: string;
  shape: FlowchartClassicShape;
  expandedShape?: string;
  rawLabel?: string;
  hasExplicitLabel: boolean;
  className?: string;
  range: TranspileSourceRange;
}

export type FlowchartEdgeLineStyle = 'solid' | 'dashed' | 'thick' | 'invisible';
export type FlowchartEdgeEndKind = 'none' | 'arrow' | 'circle' | 'cross';

export interface FlowchartEdgeStmt {
  kind: 'edge';
  edgeId?: string;
  sources: FlowchartNodeRef[];
  targets: FlowchartNodeRef[];
  lineStyle: FlowchartEdgeLineStyle;
  firstEnd: FlowchartEdgeEndKind;
  secondEnd: FlowchartEdgeEndKind;
  shaftLength: number;
  rawLabel?: string;
  range: TranspileSourceRange;
}

export interface FlowchartNodeStmt {
  kind: 'node';
  nodes: FlowchartNodeRef[];
  range: TranspileSourceRange;
}

export interface FlowchartSubgraphStmt {
  kind: 'subgraph';
  rawId: string;
  rawTitle?: string;
  explicitId: boolean;
  body: FlowchartStmt[];
  range: TranspileSourceRange;
}

export interface FlowchartDirectionStmt {
  kind: 'direction';
  direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  range: TranspileSourceRange;
}

export interface FlowchartClassDefStmt {
  kind: 'classDef';
  name: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface FlowchartClassAssignStmt {
  kind: 'class';
  nodeIds: string[];
  className: string;
  range: TranspileSourceRange;
}

export interface FlowchartStyleStmt {
  kind: 'style';
  nodeId: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface FlowchartLinkStyleStmt {
  kind: 'linkStyle';
  targets: 'default' | number[];
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface FlowchartEdgeConfigStmt {
  kind: 'edgeConfig';
  edgeId: string;
  animate: boolean;
  animationSpeed?: string;
  range: TranspileSourceRange;
}

export interface FlowchartClickStmt {
  kind: 'click';
  nodeId: string;
  range: TranspileSourceRange;
}

export type FlowchartStmt =
  | FlowchartEdgeStmt
  | FlowchartNodeStmt
  | FlowchartSubgraphStmt
  | FlowchartDirectionStmt
  | FlowchartClassDefStmt
  | FlowchartClassAssignStmt
  | FlowchartStyleStmt
  | FlowchartLinkStyleStmt
  | FlowchartEdgeConfigStmt
  | FlowchartClickStmt;

export interface FlowchartAst {
  direction?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  body: FlowchartStmt[];
}

interface ParsedConnector {
  edgeId?: string;
  lineStyle: FlowchartEdgeLineStyle;
  firstEnd: FlowchartEdgeEndKind;
  secondEnd: FlowchartEdgeEndKind;
  shaftLength: number;
  rawLabel?: string;
  nextIndex: number;
}

function skipSpaces(s: string, pos: number): number {
  let i = pos;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  return i;
}

function isIdChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57)) return true;
  if (ch === '_' || ch === '-' || ch === '.' || ch === '$') return true;
  return c > 127;
}

function parseQuotedString(s: string, pos: number): { value: string; end: number; closed: boolean } {
  const quote = s[pos]!;
  let i = pos + 1;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '\\') { i += 2; continue; }
    if (ch === quote) return { value: s.slice(pos, i + 1), end: i + 1, closed: true };
    i++;
  }
  return { value: s.slice(pos), end: s.length, closed: false };
}

function findClosingDelimiter(s: string, start: number, closeDelim: string): number {
  let inDouble = false;
  let inMarkdown = false;
  for (let i = start; i < s.length; i++) {
    if (inMarkdown) {
      if (s[i] === '`' && s[i + 1] === '"') {
        inMarkdown = false;
        i++;
      }
      continue;
    }
    if (inDouble) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '"') inDouble = false;
      continue;
    }
    if (s[i] === '"' && s[i + 1] === '`') {
      inMarkdown = true;
      i++;
      continue;
    }
    if (s[i] === '"') {
      inDouble = true;
      continue;
    }
    if (s.startsWith(closeDelim, i)) {
      return i;
    }
  }
  return -1;
}

function parseYamlLikeMap(raw: string): Record<string, string> {
  const map: Record<string, string> = Object.create(null);
  let i = 0;
  while (i < raw.length) {
    i = skipSpaces(raw, i);
    while (i < raw.length && (raw[i] === ',' || raw[i] === '\n' || raw[i] === '\r')) {
      i = skipSpaces(raw, i + 1);
    }
    if (i >= raw.length) break;
    // Key
    let key = '';
    if (raw[i] === '"' || raw[i] === "'") {
      const q = parseQuotedString(raw, i);
      key = q.value.slice(1, q.closed ? -1 : undefined);
      i = q.end;
    } else {
      const kStart = i;
      while (i < raw.length && raw[i] !== ':' && raw[i] !== ',' && raw[i] !== '\n') i++;
      key = raw.slice(kStart, i).trim();
    }
    i = skipSpaces(raw, i);
    if (raw[i] !== ':') {
      while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n') i++;
      continue;
    }
    i = skipSpaces(raw, i + 1);
    let val = '';
    if (raw[i] === '"' || raw[i] === "'") {
      const q = parseQuotedString(raw, i);
      val = q.value;
      i = q.end;
    } else {
      const vStart = i;
      while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '}') i++;
      val = raw.slice(vStart, i).trim();
    }
    if (key) map[key] = val;
  }
  return map;
}

const SHAPE_DELIMS: ReadonlyArray<{ open: string; close: string; shape: FlowchartClassicShape }> = [
  { open: '(((', close: ')))', shape: 'dbl-circle' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '[[', close: ']]', shape: 'subproc' },
  { open: '[/', close: '/]', shape: 'lean-r' },
  { open: '[\\', close: '\\]', shape: 'lean-l' },
  { open: '[/', close: '\\]', shape: 'trap-b' },
  { open: '[\\', close: '/]', shape: 'trap-t' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '(', close: ')', shape: 'rounded' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '>', close: ']', shape: 'asymmetric' },
];

function parseNodeRef(
  s: string,
  pos: number,
  baseOffset: number,
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
): { node: FlowchartNodeRef; next: number } | null {
  let i = skipSpaces(s, pos);
  if (i >= s.length) return null;
  const startPos = i;

  // Read node ID (bare word or quoted)
  let rawId = '';
  if (s[i] === '"' || s[i] === "'") {
    const q = parseQuotedString(s, i);
    if (!q.closed) {
      diagnostics.push({
        severity: 'error',
        code: 'mermaid.flowchart.statement.unparsed',
        message: 'Unclosed quoted node identifier in flowchart statement.',
        range: lineIndex.range(baseOffset + startPos, baseOffset + s.length),
      });
      return null;
    }
    rawId = q.value.slice(1, -1);
    i = q.end;
  } else {
    while (i < s.length && isIdChar(s[i]!)) {
      // Stop if `-->`, `---`, `-.->`, `-.-`, `--o`, `--x`, `o--o`, `x--x` starts!
      if (s[i] === '-' && isConnectorStartAt(s, i)) break;
      // Stop before `:::`
      if (s[i] === ':' && s.startsWith(':::', i)) break;
      // Stop before `@{`
      if (s[i] === '@' && s[i + 1] === '{') break;
      i++;
    }
    rawId = s.slice(startPos, i);
  }

  if (!rawId) return null;

  let shape: FlowchartClassicShape = 'bare';
  let expandedShape: string | undefined;
  let rawLabel: string | undefined;
  let hasExplicitLabel = false;

  // Check v11.3+ @{ ... }
  if (s.startsWith('@{', i)) {
    const close = findClosingDelimiter(s, i + 2, '}');
    if (close < 0) {
      diagnostics.push({
        severity: 'error',
        code: 'mermaid.flowchart.statement.unparsed',
        message: `Unclosed @{...} attribute block on node "${rawId}".`,
        range: lineIndex.range(baseOffset + startPos, baseOffset + s.length),
      });
      return null;
    }
    const props = parseYamlLikeMap(s.slice(i + 2, close));
    shape = 'expanded';
    expandedShape = (props.shape ?? 'rect').replace(/^["']|["']$/g, '').trim();
    if (props.label !== undefined) {
      rawLabel = props.label;
      hasExplicitLabel = true;
    }
    i = close + 1;
  } else if (s.startsWith('[/', i) || s.startsWith('[\\', i)) {
    // M4: pick the earliest closing delimiter among `/]` and `\]` so `A[/Trap\] --> B[/Para/]` never over-consumes
    const isSlashOpen = s[i + 1] === '/';
    const slashClose = findClosingDelimiter(s, i + 2, '/]');
    const backClose = findClosingDelimiter(s, i + 2, '\\]');
    let chosenClose = -1;
    let chosenShape: FlowchartClassicShape = 'rect';
    if (slashClose >= 0 && (backClose < 0 || slashClose < backClose)) {
      chosenClose = slashClose;
      chosenShape = isSlashOpen ? 'lean-r' : 'trap-t';
    } else if (backClose >= 0) {
      chosenClose = backClose;
      chosenShape = isSlashOpen ? 'trap-b' : 'lean-l';
    }
    if (chosenClose >= 0) {
      shape = chosenShape;
      rawLabel = s.slice(i + 2, chosenClose);
      hasExplicitLabel = true;
      i = chosenClose + 2;
    } else {
      diagnostics.push({
        severity: 'error',
        code: 'mermaid.flowchart.statement.unparsed',
        message: `Unclosed shape delimiter "${s.slice(i, i + 2)}" on node "${rawId}".`,
        range: lineIndex.range(baseOffset + startPos, baseOffset + s.length),
      });
      return null;
    }
  } else {
    // Try classic shape delimiters (longest-first)
    for (const d of SHAPE_DELIMS) {
      if (d.open === '[/' || d.open === '[\\') continue;
      if (s.startsWith(d.open, i)) {
        const close = findClosingDelimiter(s, i + d.open.length, d.close);
        if (close >= 0) {
          shape = d.shape;
          rawLabel = s.slice(i + d.open.length, close);
          hasExplicitLabel = true;
          i = close + d.close.length;
          break;
        }
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.flowchart.statement.unparsed',
          message: `Unclosed shape delimiter "${d.open}" on node "${rawId}".`,
          range: lineIndex.range(baseOffset + startPos, baseOffset + s.length),
        });
        return null;
      }
    }
  }

  // Optional :::className
  let className: string | undefined;
  if (s.startsWith(':::', i)) {
    i += 3;
    const cStart = i;
    while (i < s.length && isIdChar(s[i]!)) {
      if (s[i] === '-' && isConnectorStartAt(s, i)) break;
      i++;
    }
    className = s.slice(cStart, i) || undefined;
  }

  return {
    node: {
      rawId,
      shape,
      ...(expandedShape ? { expandedShape } : {}),
      ...(rawLabel !== undefined ? { rawLabel } : {}),
      hasExplicitLabel,
      ...(className ? { className } : {}),
      range: lineIndex.range(baseOffset + startPos, baseOffset + i),
    },
    next: i,
  };
}

function isConnectorStartAt(s: string, pos: number): boolean {
  const ch = s[pos];
  if (!ch) return false;
  if (ch === '-') {
    const n1 = s[pos + 1];
    return n1 === '-' || n1 === '.' || n1 === '>';
  }
  if (ch === '=' && s[pos + 1] === '=') return true;
  if (ch === '~' && s[pos + 1] === '~' && s[pos + 2] === '~') return true;
  if (ch === '<' && (s[pos + 1] === '-' || s[pos + 1] === '=')) return true;
  if ((ch === 'o' || ch === 'x') && (s[pos + 1] === '-' || s[pos + 1] === '=')) return true;
  return false;
}

function parseConnector(s: string, pos: number): ParsedConnector | null {
  let i = skipSpaces(s, pos);
  if (i >= s.length) return null;

  // Optional v11.3+ `<edgeId>@` prefix before connector
  let edgeId: string | undefined;
  {
    let j = i;
    while (j < s.length && ((s.charCodeAt(j) >= 65 && s.charCodeAt(j) <= 90)
      || (s.charCodeAt(j) >= 97 && s.charCodeAt(j) <= 122)
      || (s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57)
      || s[j] === '_' || s[j] === '-')) {
      j++;
    }
    if (j > i && s[j] === '@' && isConnectorStartAt(s, j + 1)) {
      edgeId = s.slice(i, j);
      i = j + 1;
    }
  }

  // Invisible link: ~~~...
  if (s.startsWith('~~~', i)) {
    let j = i;
    while (j < s.length && s[j] === '~') j++;
    return {
      ...(edgeId ? { edgeId } : {}),
      lineStyle: 'invisible',
      firstEnd: 'none',
      secondEnd: 'none',
      shaftLength: j - i,
      nextIndex: j,
    };
  }

  // Inline labeled connectors:
  // -- text --> / -- text ---
  // -. text .-> / -. text .-
  // == text ==> / == text ===
  const inlineResult = tryParseInlineLabeledConnector(s, i, edgeId);
  if (inlineResult) return inlineResult;

  // Standard connectors
  let firstEnd: FlowchartEdgeEndKind = 'none';
  if (s[i] === '<' && (s[i + 1] === '-' || s[i + 1] === '=')) {
    firstEnd = 'arrow';
    i++;
  } else if (s[i] === 'o' && (s[i + 1] === '-' || s[i + 1] === '=')) {
    firstEnd = 'circle';
    i++;
  } else if (s[i] === 'x' && (s[i + 1] === '-' || s[i + 1] === '=')) {
    firstEnd = 'cross';
    i++;
  }

  let lineStyle: FlowchartEdgeLineStyle;
  let shaftLength = 1;

  if (s[i] === '=' && s[i + 1] === '=') {
    lineStyle = 'thick';
    const start = i;
    while (i < s.length && s[i] === '=') i++;
    shaftLength = Math.max(1, i - start - 1);
  } else if (s[i] === '-' && s[i + 1] === '.') {
    lineStyle = 'dashed';
    i++; // consume '-'
    const dotStart = i;
    while (i < s.length && s[i] === '.') i++;
    const dotCount = i - dotStart;
    if (s[i] !== '-') return null;
    while (i < s.length && s[i] === '-') i++;
    shaftLength = Math.max(1, dotCount);
  } else if (s[i] === '-' && s[i + 1] === '-') {
    lineStyle = 'solid';
    const start = i;
    while (i < s.length && s[i] === '-') i++;
    shaftLength = Math.max(1, i - start - 1);
  } else {
    return null;
  }

  let secondEnd: FlowchartEdgeEndKind = 'none';
  if (s[i] === '>') { secondEnd = 'arrow'; i++; }
  else if (s[i] === 'o') { secondEnd = 'circle'; i++; }
  else if (s[i] === 'x') { secondEnd = 'cross'; i++; }

  // Require at least 3 chars for plain open link `---` / `===` unless ends are present
  if (lineStyle === 'solid' && firstEnd === 'none' && secondEnd === 'none' && shaftLength < 2) {
    return null;
  }
  if (lineStyle === 'thick' && firstEnd === 'none' && secondEnd === 'none' && shaftLength < 2) {
    return null;
  }

  // Optional pipe label `|text|`
  let rawLabel: string | undefined;
  const afterConn = skipSpaces(s, i);
  if (s[afterConn] === '|') {
    const closePipe = findClosingDelimiter(s, afterConn + 1, '|');
    if (closePipe >= 0) {
      rawLabel = s.slice(afterConn + 1, closePipe);
      i = closePipe + 1;
    }
  }

  return {
    ...(edgeId ? { edgeId } : {}),
    lineStyle,
    firstEnd,
    secondEnd,
    shaftLength,
    ...(rawLabel !== undefined ? { rawLabel } : {}),
    nextIndex: i,
  };
}

function tryParseInlineLabeledConnector(
  s: string,
  pos: number,
  edgeId?: string,
): ParsedConnector | null {
  // Check `-- text -->`, `-- text ---`, `-. text .->`, `-. text .-`, `== text ==>`, `== text ===`
  if (s.startsWith('-- ', pos) || s.startsWith('--\t', pos)) {
    const contentStart = pos + 2;
    const arrowIdx = findInlineEnd(s, contentStart, '-->');
    const openIdx = findInlineEnd(s, contentStart, '---');
    if (arrowIdx >= 0 && (openIdx < 0 || arrowIdx < openIdx)) {
      return {
        ...(edgeId ? { edgeId } : {}),
        lineStyle: 'solid',
        firstEnd: 'none',
        secondEnd: 'arrow',
        shaftLength: 1,
        rawLabel: s.slice(contentStart, arrowIdx).trim(),
        nextIndex: arrowIdx + 3,
      };
    }
    if (openIdx >= 0) {
      return {
        ...(edgeId ? { edgeId } : {}),
        lineStyle: 'solid',
        firstEnd: 'none',
        secondEnd: 'none',
        shaftLength: 2,
        rawLabel: s.slice(contentStart, openIdx).trim(),
        nextIndex: openIdx + 3,
      };
    }
  } else if (s.startsWith('-. ', pos) || s.startsWith('-.\t', pos)) {
    const contentStart = pos + 2;
    const arrowIdx = findInlineEnd(s, contentStart, '.->');
    const openIdx = findInlineEnd(s, contentStart, '.-');
    if (arrowIdx >= 0 && (openIdx < 0 || arrowIdx <= openIdx)) {
      return {
        ...(edgeId ? { edgeId } : {}),
        lineStyle: 'dashed',
        firstEnd: 'none',
        secondEnd: 'arrow',
        shaftLength: 1,
        rawLabel: s.slice(contentStart, arrowIdx).trim(),
        nextIndex: arrowIdx + 3,
      };
    }
    if (openIdx >= 0) {
      return {
        ...(edgeId ? { edgeId } : {}),
        lineStyle: 'dashed',
        firstEnd: 'none',
        secondEnd: 'none',
        shaftLength: 1,
        rawLabel: s.slice(contentStart, openIdx).trim(),
        nextIndex: openIdx + 2,
      };
    }
  } else if (s.startsWith('== ', pos) || s.startsWith('==\t', pos)) {
    const contentStart = pos + 2;
    const arrowIdx = findInlineEnd(s, contentStart, '==>');
    const openIdx = findInlineEnd(s, contentStart, '===');
    if (arrowIdx >= 0 && (openIdx < 0 || arrowIdx < openIdx)) {
      return {
        ...(edgeId ? { edgeId } : {}),
        lineStyle: 'thick',
        firstEnd: 'none',
        secondEnd: 'arrow',
        shaftLength: 1,
        rawLabel: s.slice(contentStart, arrowIdx).trim(),
        nextIndex: arrowIdx + 3,
      };
    }
    if (openIdx >= 0) {
      return {
        ...(edgeId ? { edgeId } : {}),
        lineStyle: 'thick',
        firstEnd: 'none',
        secondEnd: 'none',
        shaftLength: 2,
        rawLabel: s.slice(contentStart, openIdx).trim(),
        nextIndex: openIdx + 3,
      };
    }
  }
  return null;
}

function findInlineEnd(s: string, start: number, token: string): number {
  let inDouble = false;
  for (let i = start; i < s.length; i++) {
    if (inDouble) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '"') inDouble = false;
      continue;
    }
    if (s[i] === '"') { inDouble = true; continue; }
    if (s.startsWith(token, i)) {
      const before = s[i - 1];
      if (before === ' ' || before === '\t') {
        return i;
      }
    }
  }
  return -1;
}

function parseNodeGroup(
  s: string,
  pos: number,
  baseOffset: number,
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
): { nodes: FlowchartNodeRef[]; next: number } | null {
  const first = parseNodeRef(s, pos, baseOffset, lineIndex, diagnostics);
  if (!first) return null;
  const nodes: FlowchartNodeRef[] = [first.node];
  let i = first.next;
  for (;;) {
    const afterSpace = skipSpaces(s, i);
    if (s[afterSpace] !== '&') break;
    const nextNode = parseNodeRef(s, afterSpace + 1, baseOffset, lineIndex, diagnostics);
    if (!nextNode) break;
    nodes.push(nextNode.node);
    i = nextNode.next;
  }
  return { nodes, next: i };
}

function mergeMultilineFlowchartBody(bodyLines: readonly BodyLine[]): BodyLine[] {
  // Merge lines only when inside an unclosed markdown string "`...`" or @{ ... } block
  const merged: BodyLine[] = [];
  let acc: BodyLine | null = null;
  let inMarkdown = false;
  let braceDepth = 0;

  for (const line of bodyLines) {
    if (acc) {
      acc = { lineNumber: acc.lineNumber, text: `${acc.text}\n${line.text}`, startOffset: acc.startOffset };
    } else {
      acc = line;
    }
    const scanText = line.text;
    for (let i = 0; i < scanText.length; i++) {
      if (inMarkdown) {
        if (scanText[i] === '`' && scanText[i + 1] === '"') {
          inMarkdown = false;
          i++;
        }
        continue;
      }
      if (scanText[i] === '"' && scanText[i + 1] === '`') {
        inMarkdown = true;
        i++;
        continue;
      }
      if (braceDepth > 0) {
        if (scanText[i] === '{') braceDepth++;
        else if (scanText[i] === '}') braceDepth--;
        continue;
      }
      if (scanText[i] === '@' && scanText[i + 1] === '{') {
        braceDepth = 1;
        i++;
      }
    }
    if (!inMarkdown && braceDepth === 0) {
      merged.push(acc);
      acc = null;
    }
  }
  if (acc) merged.push(acc);
  return merged;
}

export function parseFlowchart(
  bodyLines: readonly BodyLine[],
  headerDirection: 'TD' | 'TB' | 'BT' | 'LR' | 'RL' | undefined,
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
  maxNestingDepth: number,
): FlowchartAst {
  const rootBody: FlowchartStmt[] = [];
  const stack: Array<{ body: FlowchartStmt[]; subgraph?: FlowchartSubgraphStmt }> = [{ body: rootBody }];
  const lines = mergeMultilineFlowchartBody(bodyLines);

  for (const line of lines) {
    const pieces = splitStatementsOnSemicolon(line.text, { respectBrackets: true });
    for (const piece of pieces) {
      const trimmed = piece.text.trim();
      if (!trimmed) continue;
      const leadSpaces = piece.text.length - piece.text.trimStart().length;
      const stmtStartOffset = line.startOffset + piece.offsetInLine + leadSpaces;
      const stmtRange = lineIndex.range(stmtStartOffset, stmtStartOffset + trimmed.length);
      const currentBody = stack[stack.length - 1]!.body;

      // 1. `end` closes subgraph
      if (trimmed === 'end') {
        if (stack.length > 1) {
          stack.pop();
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: 'Unexpected "end" without a matching subgraph.',
            range: stmtRange,
            source: trimmed,
          });
        }
        continue;
      }

      // 2. `subgraph ...`
      if (/^subgraph(?:\s|$)/i.test(trimmed)) {
        if (stack.length >= maxNestingDepth) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.input.nesting-exceeded',
            message: `Subgraph nesting exceeds maximum depth of ${maxNestingDepth}.`,
            range: stmtRange,
          });
          return { ...(headerDirection ? { direction: headerDirection } : {}), body: rootBody };
        }
        const rest = trimmed.slice('subgraph'.length).trim();
        const sg = parseSubgraphHeader(rest, stmtRange);
        currentBody.push(sg);
        stack.push({ body: sg.body, subgraph: sg });
        continue;
      }

      // 3. `direction TD|TB|BT|LR|RL`
      const dirMatch = /^direction\s+(TD|TB|BT|LR|RL)$/i.exec(trimmed);
      if (dirMatch) {
        currentBody.push({
          kind: 'direction',
          direction: dirMatch[1]!.toUpperCase() as 'TD' | 'TB' | 'BT' | 'LR' | 'RL',
          range: stmtRange,
        });
        continue;
      }

      // 4. `classDef name styles`
      if (/^classDef\s+/i.test(trimmed)) {
        const rest = trimmed.slice('classDef'.length).trim();
        const sp = rest.search(/\s/);
        if (sp > 0) {
          currentBody.push({
            kind: 'classDef',
            name: rest.slice(0, sp).trim(),
            rawStyle: rest.slice(sp + 1).trim(),
            range: stmtRange,
          });
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: 'Malformed classDef statement.',
            range: stmtRange,
            source: trimmed,
          });
        }
        continue;
      }

      // 5. `class node1,node2 className`
      if (/^class\s+/i.test(trimmed)) {
        const rest = trimmed.slice('class'.length).trim();
        const split = splitTrailingToken(rest);
        if (split) {
          const nodeIds = split.head.split(',').map((x) => x.trim()).filter(Boolean);
          currentBody.push({ kind: 'class', nodeIds, className: split.tail, range: stmtRange });
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: 'Malformed class assignment statement.',
            range: stmtRange,
            source: trimmed,
          });
        }
        continue;
      }

      // 6. `style nodeId styles`
      if (/^style\s+/i.test(trimmed)) {
        const rest = trimmed.slice('style'.length).trim();
        const sp = rest.search(/\s/);
        if (sp > 0) {
          currentBody.push({
            kind: 'style',
            nodeId: rest.slice(0, sp).trim(),
            rawStyle: rest.slice(sp + 1).trim(),
            range: stmtRange,
          });
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: 'Malformed style statement.',
            range: stmtRange,
            source: trimmed,
          });
        }
        continue;
      }

      // 7. `linkStyle default|0,1,... styles`
      if (/^linkStyle\s+/i.test(trimmed)) {
        const rest = trimmed.slice('linkStyle'.length).trim();
        const sp = rest.search(/\s/);
        if (sp > 0) {
          const targetPart = rest.slice(0, sp).trim();
          const rawStyle = rest.slice(sp + 1).trim();
          const targets: 'default' | number[] = targetPart.toLowerCase() === 'default'
            ? 'default'
            : targetPart.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !Number.isNaN(n));
          currentBody.push({ kind: 'linkStyle', targets, rawStyle, range: stmtRange });
        }
        continue;
      }

      // 8. `click nodeId ...`
      if (/^click\s+/i.test(trimmed)) {
        const rest = trimmed.slice('click'.length).trim();
        const sp = rest.search(/\s/);
        const nodeId = sp > 0 ? rest.slice(0, sp).trim() : rest;
        currentBody.push({ kind: 'click', nodeId, range: stmtRange });
        continue;
      }

      // 9. Standalone v11.3+ edge animation/config `e1@{ animate: true }` (no shape key)
      const edgeCfgAt = trimmed.indexOf('@{');
      if (edgeCfgAt > 0 && trimmed.endsWith('}')) {
        const prefix = trimmed.slice(0, edgeCfgAt).trim();
        if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(prefix)) {
          const props = parseYamlLikeMap(trimmed.slice(edgeCfgAt + 2, -1));
          if (props.shape === undefined && (props.animate !== undefined || props.animation !== undefined)) {
            const animVal = props.animate?.toLowerCase();
            const speed = props.animation?.replace(/^["']|["']$/g, '').trim();
            const animate = animVal === 'true' || speed !== undefined;
            currentBody.push({
              kind: 'edgeConfig',
              edgeId: prefix,
              animate,
              ...(speed ? { animationSpeed: speed } : {}),
              range: stmtRange,
            });
            continue;
          }
        }
      }

      // 10. Node / Edge chain statement
      const firstGroup = parseNodeGroup(trimmed, 0, stmtStartOffset, lineIndex, diagnostics);
      if (!firstGroup) {
        if (!diagnostics.some((d) => d.range?.start.offset === stmtRange.start.offset)) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: `Could not parse flowchart statement: "${trimmed.slice(0, 60)}".`,
            range: stmtRange,
            source: trimmed.slice(0, 120),
          });
        }
        continue;
      }

      let cursor = skipSpaces(trimmed, firstGroup.next);
      if (cursor >= trimmed.length) {
        currentBody.push({ kind: 'node', nodes: firstGroup.nodes, range: stmtRange });
        continue;
      }

      let prevNodes = firstGroup.nodes;
      let parsedAnyEdge = false;
      while (cursor < trimmed.length) {
        const conn = parseConnector(trimmed, cursor);
        if (!conn) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: `Unexpected trailing text in flowchart statement: "${trimmed.slice(cursor, cursor + 40)}".`,
            range: lineIndex.range(stmtStartOffset + cursor, stmtStartOffset + trimmed.length),
            source: trimmed.slice(0, 120),
          });
          break;
        }
        const nextGroup = parseNodeGroup(trimmed, conn.nextIndex, stmtStartOffset, lineIndex, diagnostics);
        if (!nextGroup) {
          diagnostics.push({
            severity: 'error',
            code: 'mermaid.flowchart.statement.unparsed',
            message: 'Expected target node after connector.',
            range: lineIndex.range(stmtStartOffset + cursor, stmtStartOffset + trimmed.length),
            source: trimmed.slice(0, 120),
          });
          break;
        }
        currentBody.push({
          kind: 'edge',
          ...(conn.edgeId ? { edgeId: conn.edgeId } : {}),
          sources: prevNodes,
          targets: nextGroup.nodes,
          lineStyle: conn.lineStyle,
          firstEnd: conn.firstEnd,
          secondEnd: conn.secondEnd,
          shaftLength: conn.shaftLength,
          ...(conn.rawLabel !== undefined ? { rawLabel: conn.rawLabel } : {}),
          range: stmtRange,
        });
        parsedAnyEdge = true;
        prevNodes = nextGroup.nodes;
        cursor = skipSpaces(trimmed, nextGroup.next);
      }

      if (!parsedAnyEdge && firstGroup.nodes.length > 0) {
        currentBody.push({ kind: 'node', nodes: firstGroup.nodes, range: stmtRange });
      }
    }
  }

  while (stack.length > 1) {
    const unclosed = stack.pop()!;
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.flowchart.block.unclosed',
      message: `Subgraph "${unclosed.subgraph?.rawId ?? 'unknown'}" is missing a closing "end".`,
      ...(unclosed.subgraph ? { range: unclosed.subgraph.range } : {}),
    });
  }

  return {
    ...(headerDirection ? { direction: headerDirection } : {}),
    body: rootBody,
  };
}

function parseSubgraphHeader(rest: string, range: TranspileSourceRange): FlowchartSubgraphStmt {
  if (!rest) {
    return { kind: 'subgraph', rawId: 'subgraph', explicitId: false, body: [], range };
  }
  // `subgraph "Title"`
  if (rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2) {
    const title = rest.slice(1, -1);
    return { kind: 'subgraph', rawId: title, rawTitle: title, explicitId: false, body: [], range };
  }
  // `subgraph id [Title]` or `subgraph id[Title]`
  const bracketIdx = rest.indexOf('[');
  if (bracketIdx > 0 && rest.endsWith(']')) {
    const idPart = rest.slice(0, bracketIdx).trim();
    if (!/\s/.test(idPart)) {
      const title = rest.slice(bracketIdx + 1, -1).trim();
      return { kind: 'subgraph', rawId: idPart, rawTitle: title, explicitId: true, body: [], range };
    }
  }
  // Single bare token `subgraph sg1`
  if (!/\s/.test(rest)) {
    return { kind: 'subgraph', rawId: rest, explicitId: true, body: [], range };
  }
  // Bare multi-word title `subgraph Backend Services`
  return { kind: 'subgraph', rawId: rest, rawTitle: rest, explicitId: false, body: [], range };
}
