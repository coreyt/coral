import type { BodyLine, LineIndex } from '../preprocess.js';
import { splitTrailingToken } from '../lexer.js';
import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';

export type ErCardinality = 'one' | 'zero-or-one' | 'one-or-many' | 'zero-or-many';

export interface ErAttributeAst {
  rawType: string;
  rawName: string;
  keys: string[];
  rawComment?: string;
  range: TranspileSourceRange;
}

export interface ErEntityDecl {
  kind: 'entity';
  rawId: string;
  rawAlias?: string;
  className?: string;
  attributes: ErAttributeAst[];
  range: TranspileSourceRange;
}

export interface ErRelationStmt {
  kind: 'relation';
  leftId: string;
  leftClassName?: string;
  rightId: string;
  rightClassName?: string;
  leftCard: ErCardinality;
  rightCard: ErCardinality;
  identifying: boolean;
  rawLabel?: string;
  range: TranspileSourceRange;
}

export interface ErSubgraphStmt {
  kind: 'subgraph';
  rawId?: string;
  rawTitle?: string;
  statements: ErStmt[];
  range: TranspileSourceRange;
}

export interface ErStyleStmt {
  kind: 'style';
  targetId: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface ErClassDefStmt {
  kind: 'classDef';
  name: string;
  rawStyle: string;
  range: TranspileSourceRange;
}

export interface ErClassAssignStmt {
  kind: 'class';
  targetIds: string[];
  className: string;
  range: TranspileSourceRange;
}

export type ErStmt =
  | ErEntityDecl
  | ErRelationStmt
  | ErSubgraphStmt
  | ErStyleStmt
  | ErClassDefStmt
  | ErClassAssignStmt;

export interface ErAst {
  direction?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  statements: ErStmt[];
}

const LEFT_SYMBOLIC: Readonly<Record<string, ErCardinality>> = {
  '||': 'one',
  '|o': 'zero-or-one',
  'o|': 'zero-or-one',
  '}|': 'one-or-many',
  '}o': 'zero-or-many',
  '|{': 'one-or-many',
  'o{': 'zero-or-many',
};

const RIGHT_SYMBOLIC: Readonly<Record<string, ErCardinality>> = {
  '||': 'one',
  'o|': 'zero-or-one',
  '|o': 'zero-or-one',
  '|{': 'one-or-many',
  'o{': 'zero-or-many',
  '}|': 'one-or-many',
  '}o': 'zero-or-many',
};

const ENGLISH_CARDINALITIES: ReadonlyArray<[string, ErCardinality]> = [
  ['zero or more', 'zero-or-many'],
  ['zero or many', 'zero-or-many'],
  ['one or more', 'one-or-many'],
  ['one or many', 'one-or-many'],
  ['zero or one', 'zero-or-one'],
  ['one or zero', 'zero-or-one'],
  ['only one', 'one'],
  ['many(0+)', 'zero-or-many'],
  ['many(1+)', 'one-or-many'],
  ['many(0)', 'zero-or-many'],
  ['many(1)', 'one-or-many'],
  ['many', 'zero-or-many'],
  ['one', 'one'],
  ['0+', 'zero-or-many'],
  ['1+', 'one-or-many'],
  ['1', 'one'],
];

function unquoteEntity(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function readEntityToken(s: string, pos: number): { id: string; className?: string; next: number } | null {
  let i = pos;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  if (i >= s.length) return null;
  let id: string;
  if (s[i] === '"') {
    const start = i + 1;
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') i++;
      i++;
    }
    if (i >= s.length) return null;
    id = s.slice(start, i);
    i++;
  } else {
    const start = i;
    while (i < s.length && !/\s/.test(s[i]!) && s[i] !== '{' && s[i] !== '}' && s[i] !== ':' && s[i] !== '|') i++;
    if (i === start) return null;
    id = s.slice(start, i);
  }
  let className: string | undefined;
  if (s.startsWith(':::', i)) {
    const clsStart = i + 3;
    let j = clsStart;
    while (j < s.length && /[A-Za-z0-9_-]/.test(s[j]!)) j++;
    if (j > clsStart) {
      className = s.slice(clsStart, j);
      i = j;
    }
  }
  return { id, ...(className ? { className } : {}), next: i };
}

function matchCardinality(s: string, pos: number, side: 'left' | 'right'): { card: ErCardinality; next: number } | null {
  let i = pos;
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  const symMap = side === 'left' ? LEFT_SYMBOLIC : RIGHT_SYMBOLIC;
  const two = s.slice(i, i + 2);
  if (Object.prototype.hasOwnProperty.call(symMap, two)) {
    return { card: symMap[two]!, next: i + 2 };
  }
  const lower = s.slice(i).toLowerCase();
  for (const [phrase, card] of ENGLISH_CARDINALITIES) {
    if (lower.startsWith(phrase)) {
      const after = s[i + phrase.length];
      if (!after || /\s/.test(after) || after === '-' || after === '.') {
        return { card, next: i + phrase.length };
      }
    }
  }
  return null;
}

function tryParseErRelation(trimmed: string, range: TranspileSourceRange): ErRelationStmt | null {
  const leftTok = readEntityToken(trimmed, 0);
  if (!leftTok) return null;

  const leftCard = matchCardinality(trimmed, leftTok.next, 'left');
  if (!leftCard) return null;

  let i = leftCard.next;
  while (i < trimmed.length && (trimmed[i] === ' ' || trimmed[i] === '\t')) i++;

  let identifying: boolean;
  const lowerRest = trimmed.slice(i).toLowerCase();
  if (trimmed.startsWith('--', i)) {
    identifying = true;
    i += 2;
  } else if (trimmed.startsWith('..', i)) {
    identifying = false;
    i += 2;
  } else if (lowerRest.startsWith('optionally to') && (!trimmed[i + 13] || /\s/.test(trimmed[i + 13]!))) {
    identifying = false;
    i += 13;
  } else if (lowerRest.startsWith('to') && (!trimmed[i + 2] || /\s/.test(trimmed[i + 2]!))) {
    identifying = true;
    i += 2;
  } else {
    return null;
  }

  const rightCard = matchCardinality(trimmed, i, 'right');
  if (!rightCard) return null;

  const rightTok = readEntityToken(trimmed, rightCard.next);
  if (!rightTok) return null;

  let rest = trimmed.slice(rightTok.next).trim();
  let rawLabel: string | undefined;
  if (rest.startsWith(':')) {
    rawLabel = rest.slice(1).trim();
  } else if (rest !== '') {
    return null;
  }

  return {
    kind: 'relation',
    leftId: leftTok.id,
    ...(leftTok.className ? { leftClassName: leftTok.className } : {}),
    rightId: rightTok.id,
    ...(rightTok.className ? { rightClassName: rightTok.className } : {}),
    leftCard: leftCard.card,
    rightCard: rightCard.card,
    identifying,
    ...(rawLabel !== undefined ? { rawLabel } : {}),
    range,
  };
}

function splitWhitespaceRespectingParens(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    if (i >= s.length) break;
    const start = i;
    let parenDepth = 0;
    while (i < s.length) {
      const ch = s[i]!;
      if (ch === '(') parenDepth++;
      else if (ch === ')' && parenDepth > 0) parenDepth--;
      else if ((ch === ' ' || ch === '\t') && parenDepth === 0) break;
      i++;
    }
    out.push(s.slice(start, i));
  }
  return out;
}

function parseErAttributeLine(trimmed: string, range: TranspileSourceRange): ErAttributeAst | null {
  // Format: <type> <name> [PK|FK|UK[, ...]] ["comment"]
  let rest = trimmed;
  let rawComment: string | undefined;
  // Extract optional trailing quoted comment
  if (rest.endsWith('"')) {
    // Scan backwards for matching opening quote
    let qStart = -1;
    for (let i = rest.length - 2; i >= 0; i--) {
      if (rest[i] === '"' && rest[i - 1] !== '\\') {
        qStart = i;
        break;
      }
    }
    if (qStart > 0 && /\s/.test(rest[qStart - 1]!)) {
      rawComment = rest.slice(qStart + 1, -1);
      rest = rest.slice(0, qStart).trim();
    }
  }

  const tokens = splitWhitespaceRespectingParens(rest);
  if (tokens.length < 2) return null;
  const rawType = tokens[0]!;
  const rawName = tokens[1]!;
  const keyRest = tokens.slice(2).join(' ');
  const keys: string[] = [];
  if (keyRest) {
    for (const part of keyRest.split(',')) {
      const k = part.trim().toUpperCase();
      if (k === 'PK' || k === 'FK' || k === 'UK') keys.push(k);
    }
  }
  return {
    rawType,
    rawName,
    keys,
    ...(rawComment !== undefined ? { rawComment } : {}),
    range,
  };
}

function parseSubgraphHeader(rest: string): { rawId?: string; rawTitle?: string } {
  const t = rest.trim();
  if (!t) return {};
  // `id [Title]` or `id["Title"]`
  const bracketIdx = t.indexOf('[');
  if (bracketIdx > 0 && t.endsWith(']')) {
    const rawId = unquoteEntity(t.slice(0, bracketIdx).trim());
    const inside = t.slice(bracketIdx + 1, -1).trim();
    const rawTitle = unquoteEntity(inside);
    return { ...(rawId ? { rawId } : {}), ...(rawTitle ? { rawTitle } : {}) };
  }
  // `"Customer Domain"` -> title only (no explicit id)
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return { rawTitle: t.slice(1, -1) };
  }
  // Single bare token `title1` -> id & title
  if (!/\s/.test(t)) {
    return { rawId: t, rawTitle: t };
  }
  return { rawTitle: t };
}

export function parseErDiagram(
  bodyLines: readonly BodyLine[],
  lineIndex: LineIndex,
  diagnostics: TranspileDiagnostic[],
  maxNestingDepth = 32,
): ErAst {
  const rootStatements: ErStmt[] = [];
  const subgraphStack: ErSubgraphStmt[] = [];
  const currentStatements = (): ErStmt[] =>
    subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1]!.statements : rootStatements;
  let direction: ErAst['direction'];
  let activeEntity: ErEntityDecl | null = null;

  for (const line of bodyLines) {
    const trimmed = line.text.trim();
    if (!trimmed) continue;
    const lead = line.text.length - line.text.trimStart().length;
    const stmtRange = lineIndex.range(line.startOffset + lead, line.startOffset + lead + trimmed.length);

    if (activeEntity) {
      if (trimmed === '}') {
        activeEntity = null;
        continue;
      }
      const attr = parseErAttributeLine(trimmed, stmtRange);
      if (attr) {
        activeEntity.attributes.push(attr);
      } else {
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.er.statement.unparsed',
          message: `Could not parse ER attribute line: "${trimmed.slice(0, 60)}".`,
          range: stmtRange,
          source: trimmed.slice(0, 120),
        });
      }
      continue;
    }

    // 0. `subgraph ...` and `end`
    if (/^subgraph(?:\s+|$)/i.test(trimmed)) {
      if (subgraphStack.length >= maxNestingDepth) {
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.input.nesting.exceeded',
          message: `ER subgraph nesting depth exceeds maximum allowed (${maxNestingDepth}).`,
          range: stmtRange,
        });
        continue;
      }
      const header = parseSubgraphHeader(trimmed.slice('subgraph'.length));
      const sg: ErSubgraphStmt = {
        kind: 'subgraph',
        ...(header.rawId !== undefined ? { rawId: header.rawId } : {}),
        ...(header.rawTitle !== undefined ? { rawTitle: header.rawTitle } : {}),
        statements: [],
        range: stmtRange,
      };
      currentStatements().push(sg);
      subgraphStack.push(sg);
      continue;
    }
    if (/^end$/i.test(trimmed)) {
      if (subgraphStack.length > 0) {
        subgraphStack.pop();
        continue;
      }
    }

    // 1. `direction TB|BT|LR|RL`
    const dirMatch = /^direction\s+(TD|TB|BT|LR|RL)$/i.exec(trimmed);
    if (dirMatch) {
      if (subgraphStack.length === 0) {
        direction = dirMatch[1]!.toUpperCase() as ErAst['direction'];
      }
      continue;
    }

    // 2. `classDef`, `class`, `style`
    if (/^classDef\s+/i.test(trimmed)) {
      const rest = trimmed.slice('classDef'.length).trim();
      const sp = rest.search(/\s/);
      if (sp > 0) {
        currentStatements().push({
          kind: 'classDef',
          name: rest.slice(0, sp).trim(),
          rawStyle: rest.slice(sp + 1).trim(),
          range: stmtRange,
        });
        continue;
      }
    }
    if (/^class\s+/i.test(trimmed)) {
      const rest = trimmed.slice('class'.length).trim();
      const split = splitTrailingToken(rest);
      if (split) {
        currentStatements().push({
          kind: 'class',
          targetIds: split.head.split(',').map((s) => s.trim()).filter(Boolean),
          className: split.tail,
          range: stmtRange,
        });
        continue;
      }
    }
    if (/^style\s+/i.test(trimmed)) {
      const rest = trimmed.slice('style'.length).trim();
      const sp = rest.search(/\s/);
      if (sp > 0) {
        currentStatements().push({
          kind: 'style',
          targetId: rest.slice(0, sp).trim(),
          rawStyle: rest.slice(sp + 1).trim(),
          range: stmtRange,
        });
        continue;
      }
    }

    // 3. Relationship
    const rel = tryParseErRelation(trimmed, stmtRange);
    if (rel) {
      currentStatements().push(rel);
      continue;
    }

    // 4. Entity block `ENTITY {` or `ENTITY {}` or `p["Person"] {` or standalone `ENTITY` / `ENTITY:::cls`
    const opensBlock = trimmed.endsWith('{');
    const emptyBlock = trimmed.endsWith('{}');
    let head = emptyBlock ? trimmed.slice(0, -2).trim() : opensBlock ? trimmed.slice(0, -1).trim() : trimmed;
    let className: string | undefined;
    const clsIdx = head.indexOf(':::');
    if (clsIdx > 0) {
      const afterCls = head.slice(clsIdx + 3).trim();
      if (/^[A-Za-z0-9_-]+$/.test(afterCls)) {
        className = afterCls;
        head = head.slice(0, clsIdx).trim();
      }
    }
    let rawAlias: string | undefined;
    const aliasIdx = head.indexOf('[');
    if (aliasIdx > 0 && head.endsWith(']')) {
      const inside = head.slice(aliasIdx + 1, -1).trim();
      rawAlias = inside.startsWith('"') && inside.endsWith('"') && inside.length >= 2
        ? inside.slice(1, -1) : inside;
      head = head.slice(0, aliasIdx).trim();
    }
    const rawId = unquoteEntity(head);
    if (rawId && (opensBlock || emptyBlock || !/\s/.test(head) || (head.startsWith('"') && head.endsWith('"')))) {
      const entity: ErEntityDecl = {
        kind: 'entity',
        rawId,
        ...(rawAlias !== undefined ? { rawAlias } : {}),
        ...(className ? { className } : {}),
        attributes: [],
        range: stmtRange,
      };
      currentStatements().push(entity);
      if (opensBlock && !emptyBlock) {
        activeEntity = entity;
      }
      continue;
    }

    diagnostics.push({
      severity: 'error',
      code: 'mermaid.er.statement.unparsed',
      message: `Could not parse ER diagram statement: "${trimmed.slice(0, 60)}".`,
      range: stmtRange,
      source: trimmed.slice(0, 120),
    });
  }

  if (activeEntity) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.er.block.unclosed',
      message: `Entity "${activeEntity.rawId}" block is missing a closing "}".`,
      range: activeEntity.range,
    });
  }

  for (const unclosed of subgraphStack) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.er.subgraph.unclosed',
      message: `ER subgraph "${unclosed.rawTitle ?? unclosed.rawId ?? 'subgraph'}" is missing a closing "end".`,
      range: unclosed.range,
    });
  }

  return { ...(direction ? { direction } : {}), statements: rootStatements };
}
