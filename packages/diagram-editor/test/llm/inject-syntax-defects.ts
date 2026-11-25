/**
 * Syntax defect injector for the Coral defect corpus (Slice 49, R-049.5 AC-4).
 *
 * Implements Step 5 of `dev/designs/coral-defect-corpus.md`: a durable,
 * deterministic (no `Math.random()`) mutator that takes a known-good Coral
 * DSL file and injects exactly one of fifteen grammar-level syntax defects,
 * verified (in the accompanying test file) to make `@coral-viz/language`'s
 * `parse()` actually fail.
 *
 * This module performs a cheap structural scan of the DSL text rather than a
 * full parse, per the design doc: "select-and-inject-defects.ts first
 * computes, per file, which catalog types actually have a valid injection
 * site (a cheap structural scan, not a full parse)".
 */

export type SyntaxDefectType =
  | 'missing-closing-quote'
  | 'missing-opening-quote'
  | 'missing-closing-brace'
  | 'missing-opening-brace'
  | 'unbalanced-bracket'
  | 'wrong-arrow'
  | 'missing-edge-target'
  | 'missing-comma'
  | 'trailing-comma'
  | 'bare-bracket-attribute'
  | 'colon-to-equals-node-property'
  | 'stray-character'
  | 'line-break-in-label'
  | 'unicode-lookalike-quote'
  | 'missing-space-after-type';

export interface InjectedDefectLocation {
  line: number;
  column: number;
  charOffset: number;
}

export interface InjectedDefect {
  defectType: SyntaxDefectType;
  location: InjectedDefectLocation;
  description: string;
}

export interface DefectInjectionResult {
  originalFilename: string;
  originalDsl: string;
  injectedDefects: InjectedDefect[];
  outputFilename: string;
  outputText: string;
}

/** All fifteen grammar-level syntax defect types, in catalog order. */
export const ALL_SYNTAX_DEFECT_TYPES: readonly SyntaxDefectType[] = [
  'missing-closing-quote',
  'missing-opening-quote',
  'missing-closing-brace',
  'missing-opening-brace',
  'unbalanced-bracket',
  'wrong-arrow',
  'missing-edge-target',
  'missing-comma',
  'trailing-comma',
  'bare-bracket-attribute',
  'colon-to-equals-node-property',
  'stray-character',
  'line-break-in-label',
  'unicode-lookalike-quote',
  'missing-space-after-type',
];

// ============================================================================
// Deterministic PRNG (mulberry32) — no Math.random() anywhere in this file.
// ============================================================================

/** A small, seeded PRNG. Deterministic: same seed -> same sequence, forever. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Shared scanning helpers
// ============================================================================

/** A matched node declaration line, with the pieces an injector might mutate. */
interface NodeDeclMatch {
  lineIndex: number; // 0-based index into the lines array
  leadingWs: number; // width of leading whitespace on the raw line
  typeToken: string;
  typeEnd: number; // column (raw line) just past the type token
  wsStart: number; // column where the whitespace before the label quote begins
  wsEnd: number; // column where that whitespace ends (== quoteStart)
  quoteStart: number; // column of the opening quote of the label
  quoteEnd: number; // column of the closing quote of the label
  label: string;
  sourceOwned?: boolean;
  opensBody: boolean; // line ends in a bare `{` (not `{}` / `{ }`)
}

const NODE_DECL_RE = /^([A-Za-z_][\w-]*)(\s+)"((?:[^"\\]|\\.)*)"/;

function findNodeDecls(lines: string[]): NodeDeclMatch[] {
  const out: NodeDeclMatch[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    const trimmed = raw.trimStart();
    const leadingWs = raw.length - trimmed.length;
    const modern = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s+as\s+"((?:[^"\\]|\\.)*)"/.exec(trimmed);
    const match = NODE_DECL_RE.exec(trimmed);
    if (!modern && (lines.some(line => /^@diagram\b/.test(line)) || !match)) continue;
    const typeToken = modern?.[2] ?? match![1];
    const ws = modern ? ' ' : match![2];
    const label = modern?.[3] ?? match![3];
    const typeEnd = leadingWs + typeToken.length;
    const wsStart = typeEnd;
    const wsEnd = wsStart + ws.length;
    const quoteStart = modern ? raw.indexOf('"') : wsEnd;
    const quoteEnd = quoteStart + 1 + label.length;
    const trimmedEnd = raw.trimEnd();
    const opensBody = trimmedEnd.endsWith('{') && !trimmedEnd.endsWith('{}') && !trimmedEnd.endsWith('{ }');
    out.push({ sourceOwned: !!modern, lineIndex, leadingWs, typeToken, typeEnd, wsStart, wsEnd, quoteStart, quoteEnd, label, opensBody });
  }
  return out;
}

/** A matched edge declaration line. */
interface EdgeDeclMatch {
  lineIndex: number;
  leadingWs: number;
  source: string;
  sourceEnd: number; // column just past the source token
  arrowStart: number; // column where the "->" (with surrounding ws) begins
  targetStart: number; // column where the target token begins
  targetEnd: number;
  target: string;
  bracketStart: number; // column of "[" or -1 if no bracket attribute list
  bracketEnd: number; // column of "]" or -1
  bracketContent: string;
}

const EDGE_DECL_RE = /^([A-Za-z_][\w-]*)(\s*->\s*)([A-Za-z_][\w-]*)/;

function findEdgeDecls(lines: string[]): EdgeDeclMatch[] {
  const out: EdgeDeclMatch[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    const trimmed = raw.trimStart();
    const leadingWs = raw.length - trimmed.length;
    const match = EDGE_DECL_RE.exec(trimmed);
    if (!match) continue;
    const [, source, arrow, target] = match;
    const sourceEnd = leadingWs + source.length;
    const arrowStart = sourceEnd;
    const targetStart = leadingWs + source.length + arrow.length;
    const targetEnd = targetStart + target.length;

    let bracketStart = -1;
    let bracketEnd = -1;
    let bracketContent = '';
    const bracketMatch = /\[([^[\]]*)\]/.exec(raw.slice(targetEnd));
    if (bracketMatch && bracketMatch.index !== undefined) {
      bracketStart = targetEnd + bracketMatch.index;
      bracketEnd = bracketStart + bracketMatch[0].length - 1;
      bracketContent = bracketMatch[1];
    }

    out.push({ lineIndex, leadingWs, source, sourceEnd, arrowStart, targetStart, targetEnd, target, bracketStart, bracketEnd, bracketContent });
  }
  return out;
}

/** Brace depth in effect *before* each line is processed (mirrors the parser). */
function computeBraceDepths(lines: string[]): number[] {
  const depths: number[] = [];
  let depth = 0;
  const nodeDecls = new Map(findNodeDecls(lines).map((n) => [n.lineIndex, n]));
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    depths.push(depth);
    const trimmed = lines[lineIndex].trim();
    if (trimmed === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const decl = nodeDecls.get(lineIndex);
    if (decl?.opensBody) depth += 1;
  }
  return depths;
}

/** A matched `key: value` node property line (only relevant inside `{ }`). */
interface PropertyMatch {
  lineIndex: number;
  leadingWs: number;
  key: string;
  keyEnd: number;
  colonIndex: number;
  valueStart: number;
  rawValue: string;
  quotedValue: string | null; // set when the value is a quoted string
  quoteStart: number; // column of the opening quote of the value, if quotedValue
  quoteEnd: number; // column of the closing quote of the value, if quotedValue
}

const PROPERTY_RE = /^([A-Za-z_][A-Za-z0-9_]*)(\s*)(:)(\s*)(.+)$/;
const QUOTED_VALUE_RE = /^"((?:[^"\\]|\\.)*)"$/;

function findPropertyLines(lines: string[]): PropertyMatch[] {
  const depths = computeBraceDepths(lines);
  const out: PropertyMatch[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (depths[lineIndex] <= 0) continue;
    const raw = lines[lineIndex];
    const trimmed = raw.trimStart();
    const leadingWs = raw.length - trimmed.length;
    const match = PROPERTY_RE.exec(trimmed);
    if (!match) continue;
    const [, key, wsBeforeColon, , , rawValue] = match;
    const keyEnd = leadingWs + key.length;
    const colonIndex = keyEnd + wsBeforeColon.length;
    const valueStart = raw.indexOf(rawValue, colonIndex + 1);
    const quoted = QUOTED_VALUE_RE.exec(rawValue);
    let quotedValue: string | null = null;
    let quoteStart = -1;
    let quoteEnd = -1;
    if (quoted) {
      quotedValue = quoted[1];
      quoteStart = valueStart;
      quoteEnd = valueStart + rawValue.length - 1;
    }
    out.push({ lineIndex, leadingWs, key, keyEnd, colonIndex, valueStart, rawValue, quotedValue, quoteStart, quoteEnd });
  }
  return out;
}

/** A `data { ... }` clause on a single line (node or edge). */
interface DataClauseMatch {
  lineIndex: number;
  braceStart: number; // column of "{"
  braceEnd: number; // column of "}"
  content: string; // text strictly between the braces
  topLevelCommaIndices: number[]; // columns (raw line) of top-level commas inside content
}

const DATA_CLAUSE_RE = /\bdata\s+(\{[^{}]*\})/;

/** Indices (relative to `s`) of commas not enclosed in a quoted string. */
function findTopLevelCommaIndices(s: string): number[] {
  const out: number[] = [];
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === ',') out.push(i);
  }
  return out;
}

function findDataClauses(lines: string[]): DataClauseMatch[] {
  const out: DataClauseMatch[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    const match = DATA_CLAUSE_RE.exec(raw);
    if (!match || match.index === undefined) continue;
    const braceStart = raw.indexOf('{', match.index);
    const braceEnd = braceStart + match[1].length - 1;
    const content = raw.slice(braceStart + 1, braceEnd);
    const topLevelCommaIndices = findTopLevelCommaIndices(content).map((i) => i + braceStart + 1);
    out.push({ lineIndex, braceStart, braceEnd, content, topLevelCommaIndices });
  }
  return out;
}

// ============================================================================
// Candidate abstraction
// ============================================================================

interface Candidate {
  line: number; // 1-based, in ORIGINAL coordinates
  column: number; // 0-based, in ORIGINAL coordinates
  description: string;
  mutate: (lines: string[]) => string[];
}

function computeOffset(lines: string[], line1: number, column0: number): number {
  let offset = 0;
  for (let i = 0; i < line1 - 1; i++) offset += lines[i].length + 1;
  return offset + column0;
}

function replaceAt(line: string, start: number, end: number, replacement: string): string {
  return line.slice(0, start) + replacement + line.slice(end);
}

function withLine(lines: string[], index: number, newLine: string): string[] {
  const out = lines.slice();
  out[index] = newLine;
  return out;
}

// ============================================================================
// Candidate finders, one per defect type
// ============================================================================

type CandidateFinder = (lines: string[]) => Candidate[];

const UNICODE_CLOSING_LOOKALIKE = '”'; // RIGHT DOUBLE QUOTATION MARK

function quoteCandidates(
  lines: string[],
  kind: 'delete-closing' | 'delete-opening' | 'unicode-closing',
): Candidate[] {
  const out: Candidate[] = [];

  for (const node of findNodeDecls(lines)) {
    out.push(buildQuoteCandidate(node.lineIndex, node.quoteStart, node.quoteEnd, `label "${node.label}"`, kind));
  }
  for (const prop of findPropertyLines(lines)) {
    if (prop.quotedValue === null) continue;
    out.push(
      buildQuoteCandidate(
        prop.lineIndex,
        prop.quoteStart,
        prop.quoteEnd,
        `property "${prop.key}" value "${prop.quotedValue}"`,
        kind,
      ),
    );
  }
  return out;
}

function buildQuoteCandidate(
  lineIndex: number,
  quoteStart: number,
  quoteEnd: number,
  what: string,
  kind: 'delete-closing' | 'delete-opening' | 'unicode-closing',
): Candidate {
  const line1 = lineIndex + 1;
  if (kind === 'delete-closing') {
    return {
      line: line1,
      column: quoteEnd,
      description: `removed closing quote on ${what}`,
      mutate: (lines) => withLine(lines, lineIndex, replaceAt(lines[lineIndex], quoteEnd, quoteEnd + 1, '')),
    };
  }
  if (kind === 'delete-opening') {
    return {
      line: line1,
      column: quoteStart,
      description: `removed opening quote on ${what}`,
      mutate: (lines) => withLine(lines, lineIndex, replaceAt(lines[lineIndex], quoteStart, quoteStart + 1, '')),
    };
  }
  return {
    line: line1,
    column: quoteEnd,
    description: `replaced closing quote on ${what} with Unicode look-alike U+201D`,
    mutate: (lines) =>
      withLine(lines, lineIndex, replaceAt(lines[lineIndex], quoteEnd, quoteEnd + 1, UNICODE_CLOSING_LOOKALIKE)),
  };
}

function findMissingClosingQuoteCandidates(lines: string[]): Candidate[] {
  return quoteCandidates(lines, 'delete-closing');
}

function findMissingOpeningQuoteCandidates(lines: string[]): Candidate[] {
  return quoteCandidates(lines, 'delete-opening');
}

function findUnicodeLookalikeQuoteCandidates(lines: string[]): Candidate[] {
  return quoteCandidates(lines, 'unicode-closing');
}

function findMissingClosingBraceCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  const nodeDecls = findNodeDecls(lines).filter((n) => n.opensBody);
  for (const node of nodeDecls) {
    let closeLineIndex = -1;
    let depth = 1;
    for (let i = node.lineIndex + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '}') {
        depth -= 1;
        if (depth === 0) { closeLineIndex = i; break; }
      } else {
        const decl = findNodeDecls([lines[i]])[0];
        if (decl?.opensBody) depth += 1;
      }
    }
    if (closeLineIndex === -1) continue;
    const braceColumn = lines[closeLineIndex].indexOf('}');
    out.push({
      line: closeLineIndex + 1,
      column: braceColumn,
      description: `removed closing brace matching node "${node.label}" opened at line ${node.lineIndex + 1}`,
      mutate: (mutLines) => {
        const copy = mutLines.slice();
        copy.splice(closeLineIndex, 1);
        return copy;
      },
    });
  }
  return out;
}

function findMissingOpeningBraceCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const node of findNodeDecls(lines).filter((n) => n.opensBody)) {
    const raw = lines[node.lineIndex];
    const braceColumn = raw.lastIndexOf('{');
    out.push({
      line: node.lineIndex + 1,
      column: braceColumn,
      description: `removed opening brace from node "${node.label}" (line ${node.lineIndex + 1})`,
      mutate: (mutLines) =>
        withLine(mutLines, node.lineIndex, mutLines[node.lineIndex].slice(0, braceColumn).trimEnd()),
    });
  }
  return out;
}

function findUnbalancedBracketCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const edge of findEdgeDecls(lines)) {
    if (edge.bracketStart < 0) continue;
    out.push({
      line: edge.lineIndex + 1,
      column: edge.bracketEnd,
      description: `removed closing bracket "]" from edge attribute list on line ${edge.lineIndex + 1}`,
      mutate: (mutLines) =>
        withLine(mutLines, edge.lineIndex, replaceAt(mutLines[edge.lineIndex], edge.bracketEnd, edge.bracketEnd + 1, '')),
    });
  }
  return out;
}

function findWrongArrowCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const edge of findEdgeDecls(lines)) {
    const raw = lines[edge.lineIndex];
    const arrowIndex = raw.indexOf('->', edge.sourceEnd);
    if (arrowIndex < 0) continue;
    out.push({
      line: edge.lineIndex + 1,
      column: arrowIndex,
      description: `changed arrow from "->" to "-->" on line ${edge.lineIndex + 1}`,
      mutate: (mutLines) => withLine(mutLines, edge.lineIndex, replaceAt(mutLines[edge.lineIndex], arrowIndex, arrowIndex + 2, '-->')),
    });
  }
  return out;
}

function findMissingEdgeTargetCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const edge of findEdgeDecls(lines)) {
    out.push({
      line: edge.lineIndex + 1,
      column: edge.targetStart,
      description: `removed edge target "${edge.target}" from "${edge.source} -> ${edge.target}"`,
      mutate: (mutLines) =>
        withLine(mutLines, edge.lineIndex, replaceAt(mutLines[edge.lineIndex], edge.targetStart, edge.targetEnd, '')),
    });
  }
  return out;
}

function findMissingCommaCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const clause of findDataClauses(lines)) {
    if (clause.topLevelCommaIndices.length === 0) continue;
    const commaColumn = clause.topLevelCommaIndices[0];
    out.push({
      line: clause.lineIndex + 1,
      column: commaColumn,
      description: `removed comma between JSON data properties on line ${clause.lineIndex + 1}`,
      mutate: (mutLines) =>
        withLine(mutLines, clause.lineIndex, replaceAt(mutLines[clause.lineIndex], commaColumn, commaColumn + 1, '')),
    });
  }
  return out;
}

function findTrailingCommaCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const clause of findDataClauses(lines)) {
    if (clause.content.trim().length === 0) continue;
    out.push({
      line: clause.lineIndex + 1,
      column: clause.braceEnd,
      description: `inserted trailing comma before closing brace of JSON data object on line ${clause.lineIndex + 1}`,
      mutate: (mutLines) =>
        withLine(mutLines, clause.lineIndex, replaceAt(mutLines[clause.lineIndex], clause.braceEnd, clause.braceEnd, ',')),
    });
  }
  return out;
}

function findBareBracketAttributeCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const edge of findEdgeDecls(lines)) {
    if (edge.bracketStart < 0) continue;
    out.push({
      line: edge.lineIndex + 1,
      column: edge.bracketStart,
      description: `removed brackets around edge attribute list, leaving it bare: ${edge.bracketContent}`,
      mutate: (mutLines) => {
        const raw = mutLines[edge.lineIndex];
        const withoutClosing = replaceAt(raw, edge.bracketEnd, edge.bracketEnd + 1, '');
        const withoutOpening = replaceAt(withoutClosing, edge.bracketStart, edge.bracketStart + 1, '');
        return withLine(mutLines, edge.lineIndex, withoutOpening);
      },
    });
  }
  return out;
}

function findColonToEqualsCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const prop of findPropertyLines(lines)) {
    out.push({
      line: prop.lineIndex + 1,
      column: prop.colonIndex,
      description: `changed ":" to "=" on node property "${prop.key}"`,
      mutate: (mutLines) =>
        withLine(mutLines, prop.lineIndex, replaceAt(mutLines[prop.lineIndex], prop.colonIndex, prop.colonIndex + 1, '=')),
    });
  }
  return out;
}

function findStrayCharacterCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const node of findNodeDecls(lines)) {
    out.push({
      line: node.lineIndex + 1,
      column: node.typeEnd,
      description: `inserted stray character "~" after "${node.typeToken}"`,
      mutate: (mutLines) => withLine(mutLines, node.lineIndex, replaceAt(mutLines[node.lineIndex], node.typeEnd, node.typeEnd, '~')),
    });
  }
  for (const edge of findEdgeDecls(lines)) {
    out.push({
      line: edge.lineIndex + 1,
      column: edge.sourceEnd,
      description: `inserted stray character "~" after "${edge.source}"`,
      mutate: (mutLines) => withLine(mutLines, edge.lineIndex, replaceAt(mutLines[edge.lineIndex], edge.sourceEnd, edge.sourceEnd, '~')),
    });
  }
  return out;
}

function findLineBreakInLabelCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const node of findNodeDecls(lines)) {
    const spaceOffsetInLabel = node.label.indexOf(' ');
    if (spaceOffsetInLabel < 0) continue;
    const spaceColumn = node.quoteStart + 1 + spaceOffsetInLabel;
    out.push({
      line: node.lineIndex + 1,
      column: spaceColumn,
      description: `inserted a line break inside label "${node.label}"`,
      mutate: (mutLines) => {
        const raw = mutLines[node.lineIndex];
        const before = raw.slice(0, spaceColumn);
        const after = raw.slice(spaceColumn + 1);
        const copy = mutLines.slice();
        copy.splice(node.lineIndex, 1, before, after);
        return copy;
      },
    });
  }
  return out;
}

function findMissingSpaceAfterTypeCandidates(lines: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const node of findNodeDecls(lines)) {
    if (node.sourceOwned) continue;
    out.push({
      line: node.lineIndex + 1,
      column: node.wsStart,
      description: `removed space between node type "${node.typeToken}" and its label`,
      mutate: (mutLines) => withLine(mutLines, node.lineIndex, replaceAt(mutLines[node.lineIndex], node.wsStart, node.wsEnd, '')),
    });
  }
  return out;
}

const FINDERS: Record<SyntaxDefectType, CandidateFinder> = {
  'missing-closing-quote': findMissingClosingQuoteCandidates,
  'missing-opening-quote': findMissingOpeningQuoteCandidates,
  'missing-closing-brace': findMissingClosingBraceCandidates,
  'missing-opening-brace': findMissingOpeningBraceCandidates,
  'unbalanced-bracket': findUnbalancedBracketCandidates,
  'wrong-arrow': findWrongArrowCandidates,
  'missing-edge-target': findMissingEdgeTargetCandidates,
  'missing-comma': findMissingCommaCandidates,
  'trailing-comma': findTrailingCommaCandidates,
  'bare-bracket-attribute': findBareBracketAttributeCandidates,
  'colon-to-equals-node-property': findColonToEqualsCandidates,
  'stray-character': findStrayCharacterCandidates,
  'line-break-in-label': findLineBreakInLabelCandidates,
  'unicode-lookalike-quote': findUnicodeLookalikeQuoteCandidates,
  'missing-space-after-type': findMissingSpaceAfterTypeCandidates,
};

// ============================================================================
// Public API
// ============================================================================

function withDefectSuffix(filename: string, defectType: SyntaxDefectType): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0) return `${filename}-${defectType}`;
  return `${filename.slice(0, dotIndex)}-${defectType}${filename.slice(dotIndex)}`;
}

/**
 * Injects exactly one occurrence of `defectType` into `originalDsl`, choosing
 * deterministically among every valid injection site using `rng`.
 *
 * Throws if `defectType` has no valid injection site in `originalDsl` — callers
 * should check `availableDefectTypes` first (as `selectAndInjectDefect` does).
 */
export function injectSyntaxDefect(
  originalFilename: string,
  originalDsl: string,
  defectType: SyntaxDefectType,
  rng: () => number,
): DefectInjectionResult {
  const lines = originalDsl.split('\n');
  const candidates = FINDERS[defectType](lines);
  if (candidates.length === 0) {
    throw new Error(`No valid injection site for defect type "${defectType}" in the given DSL`);
  }
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  const chosen = candidates[index];
  const mutatedLines = chosen.mutate(lines);
  const outputText = mutatedLines.join('\n');
  const charOffset = computeOffset(lines, chosen.line, chosen.column);

  return {
    originalFilename,
    originalDsl,
    injectedDefects: [
      {
        defectType,
        location: { line: chosen.line, column: chosen.column, charOffset },
        description: chosen.description,
      },
    ],
    outputFilename: withDefectSuffix(originalFilename, defectType),
    outputText,
  };
}

/** Which of the fifteen catalog types have at least one valid injection site in `dsl`. */
export function availableDefectTypes(dsl: string): SyntaxDefectType[] {
  const lines = dsl.split('\n');
  return ALL_SYNTAX_DEFECT_TYPES.filter((type) => FINDERS[type](lines).length > 0);
}

/**
 * Deterministically picks one available defect type for `originalDsl` using
 * `seed`, then injects it. Re-running with the same `(originalDsl, seed)`
 * produces byte-identical `outputText`. Returns `null` when no catalog type
 * has a valid injection site.
 */
export function selectAndInjectDefect(
  originalFilename: string,
  originalDsl: string,
  seed: number,
): DefectInjectionResult | null {
  const available = availableDefectTypes(originalDsl);
  if (available.length === 0) return null;

  const rng = mulberry32(seed);
  const typeIndex = Math.min(available.length - 1, Math.floor(rng() * available.length));
  const defectType = available[typeIndex];

  return injectSyntaxDefect(originalFilename, originalDsl, defectType, rng);
}
