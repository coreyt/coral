/**
 * Deterministic syntax repair (S49-C5 AC-5).
 *
 * `repairCoralDsl` attempts the diagnostic-backed grammar-level syntax defect
 * types cataloged in `dev/designs/coral-defect-corpus.md` Step 5/6.
 * `misspelled-keyword`/`keyword-case-mutation` are vocabulary-level defects
 * repaired separately by `repairKnownNodeTypeTypos`
 * (`packages/diagram-editor/src/parsers.ts`), since this package has no
 * dependency on `KNOWN_NODE_TYPES` and must not invert the real workspace
 * dependency direction.
 *
 * The accepted repair subset has three diagnostic shapes:
 *
 * 1. `coral.line.unparsed` may authorize inserting missing whitespace after
 *    a node type or changing `=` to `:` on a property inside an open node
 *    body. Lexical preconditions constrain both operations.
 * 2. A missing/trailing comma *inside a `data { ... }` clause* raises
 *    `coral.node.data.unparsed`/`coral.edge.data.unparsed` (via
 *    `parseJsonObject` failing) — a real, diagnostic-driven case, added
 *    after independent code review found the original two-branch dispatch
 *    silently skipped it, so `missing-comma`/`trailing-comma` reported
 *    "working" against hand-built test fixtures but went unrepaired against
 *    the actual corpus (built by a different, concurrently-developed
 *    injector that specifically targets `data{}` clauses for these two
 *    types — an integration gap neither side's isolated unit tests could see).
 * 3. `coral.attribute.equals.unsupported` authorizes changing the removed
 *    `=` it ranges, in an edge attribute or constraint parameter, to `:`.
 *
 * Parser-valid input is always byte-preserved. In particular, bracket-list
 * commas and bare relation tokens are not normalized: parser success cannot
 * prove that reinterpreting those bytes preserves authored meaning.
 *
 * Parser-error reduction is necessary but insufficient: only those reviewed
 * lexical operations are dispatched. Every applied repair is also verified by
 * re-parsing the candidate and confirming it strictly reduces error diagnostics.
 * All other syntax categories remain byte-identical and unresolved.
 */

import { parse } from './parser/index.js';
import type { ParseDiagnostic } from './diagnostics.js';
import type { Diagnostic } from './diagnostics.js';

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
  | 'colon-to-equals-attribute'
  | 'stray-character'
  | 'line-break-in-label'
  | 'unicode-lookalike-quote'
  | 'missing-space-after-type';

export interface AppliedFix {
  defectType: SyntaxDefectType | 'unknown';
  location: { line: number; column: number };
  description: string;
}

export interface RepairResult {
  fixed: string;
  appliedFixes: AppliedFix[];
  unresolved: Diagnostic[];
}

/** Repair every grammar-level syntax defect `repairCoralDsl` knows how to find. */
export function repairCoralDsl(source: string): RepairResult {
  let current = source;
  const appliedFixes: AppliedFix[] = [];

  // Diagnostic-driven repair. Each pass re-parses, then tries every
  // current error diagnostic in position order until one repair strictly
  // reduces the error count; an earlier diagnostic that can't (yet) be
  // repaired in isolation must not block progress on a later one (e.g. a
  // `missing-opening-brace` orphans a property line with its own generic
  // diagnostic that only disappears once the brace itself is restored).
  const MAX_PASSES = 30;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = parse(current);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length === 0) break;

    let progressed = false;
    for (const diag of errors) {
      const attempt = repairDiagnostic(current, diag, errors.length);
      if (attempt) {
        current = attempt.text;
        appliedFixes.push(attempt.fix);
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }

  const final = parse(current);
  const unresolved: Diagnostic[] = final.diagnostics.filter((d) => d.severity === 'error');

  return { fixed: current, appliedFixes, unresolved };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function countErrors(text: string): number {
  return parse(text).diagnostics.filter((d) => d.severity === 'error').length;
}

// ---------------------------------------------------------------------------
// Diagnostic-driven repair
// ---------------------------------------------------------------------------

function repairDiagnostic(
  text: string,
  diag: ParseDiagnostic,
  originalErrorCount: number,
): { text: string; fix: AppliedFix } | null {
  if (diag.code === 'coral.line.unparsed') {
    return repairGenericLine(text, diag, originalErrorCount);
  }
  // Found by independent code review after the initial 15/15 build: a
  // missing/trailing comma *inside a `data { ... }` clause* raises this code
  // (via `parseJsonObject` failing), not `coral.line.unparsed` — contradicting
  // this module's own original assumption (see the corrected module doc
  // above). This is exactly the shape
  // `packages/diagram-editor/test/llm/inject-syntax-defects.ts`'s
  // `findMissingCommaCandidates`/`findTrailingCommaCandidates` actually
  // produce, so without this branch those two defect types silently went
  // unrepaired despite both sides independently reporting "15/15 working" —
  // an integration gap unit tests built in isolation couldn't see.
  if (diag.code === 'coral.node.data.unparsed' || diag.code === 'coral.edge.data.unparsed') {
    return repairDataClauseComma(text, diag, originalErrorCount);
  }
  if (diag.code === 'coral.attribute.equals.unsupported') {
    return repairEqualsAttribute(text, diag, originalErrorCount);
  }
  return null;
}

/**
 * The removed Language 0.2 `=` in an edge attribute or constraint parameter
 * (R-063 AC-5). The diagnostic ranges the `=` token exactly, so the rewrite
 * replaces that token and its surrounding spaces with `: ` and nothing else.
 */
function repairEqualsAttribute(
  text: string,
  diag: ParseDiagnostic,
  originalErrorCount: number,
): { text: string; fix: AppliedFix } | null {
  const lines = text.split('\n');
  const idx = diag.position.line - 1;
  const line = lines[idx];
  const column = diag.range?.start.column;
  if (line === undefined || column === undefined || line[column] !== '=') return null;
  const before = line.slice(0, column).replace(/[ \t]+$/, '');
  const after = line.slice(column + 1).replace(/^[ \t]+/, '');
  const candidateLines = lines.slice();
  candidateLines[idx] = `${before}: ${after}`;
  const candidateText = candidateLines.join('\n');
  if (countErrors(candidateText) >= originalErrorCount) return null;
  return {
    text: candidateText,
    fix: {
      defectType: 'colon-to-equals-attribute',
      location: { line: diag.position.line, column },
      description: describeGenericFix('colon-to-equals-attribute', line, candidateLines[idx]),
    },
  };
}

const DATA_KEYWORD_RE = /\bdata\s*\{/;

/**
 * Find a `data { ... }` clause's brace span on a line, handling nested
 * objects (e.g. `data { "style": { "color": "red" } }`) by counting brace
 * depth rather than assuming a flat, non-nesting `{[^{}]*}` shape.
 */
function findDataClauseSpan(line: string): { braceStart: number; braceEnd: number } | null {
  const keyword = DATA_KEYWORD_RE.exec(line);
  if (!keyword) return null;
  const braceStart = line.indexOf('{', keyword.index);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  for (let i = braceStart; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { braceStart, braceEnd: i };
    }
  }
  return null; // unbalanced on this line — not this repair's concern
}

/** A value directly followed by the start of another key, with no separating comma. */
function fixMissingCommaInJson(content: string): string | null {
  // `\s*`, not `\s+`: `stableJson`'s real output (what the corpus's data{}
  // clauses actually contain) is compact with no space after a comma, so a
  // missing comma leaves the two tokens directly adjacent with zero
  // whitespace between them, not merely a differently-spaced gap.
  const valueThenKey =
    /("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?|\}|\])(\s*)("(?:[^"\\]|\\.)*"\s*:)/;
  const m = content.match(valueThenKey);
  if (!m || m.index === undefined) return null;
  return content.slice(0, m.index) + m[1] + ',' + m[2] + m[3] + content.slice(m.index + m[0].length);
}

/**
 * `missing-comma`/`trailing-comma` inside a node/edge `data { ... }` JSON
 * clause. Unlike the bracket-list normalizations in Phase 1, this one *is*
 * diagnostic-driven (a real `coral.{node,edge}.data.unparsed` error exists),
 * so it belongs in the diagnostic-driven loop, not the undiagnosed pass.
 */
function repairDataClauseComma(
  text: string,
  diag: ParseDiagnostic,
  originalErrorCount: number,
): { text: string; fix: AppliedFix } | null {
  const lines = text.split('\n');
  const idx = diag.position.line - 1;
  const line = lines[idx];
  if (line === undefined) return null;

  const span = findDataClauseSpan(line);
  if (!span) return null;
  const { braceStart, braceEnd } = span;
  const content = line.slice(braceStart + 1, braceEnd);

  const withoutTrailingComma = content.replace(/,(\s*)$/, '$1');
  const candidateContent =
    withoutTrailingComma !== content ? withoutTrailingComma : fixMissingCommaInJson(content);
  if (candidateContent === null || candidateContent === content) return null;

  const newLine = line.slice(0, braceStart + 1) + candidateContent + line.slice(braceEnd);
  const candidateLines = lines.slice();
  candidateLines[idx] = newLine;
  const candidateText = candidateLines.join('\n');
  if (countErrors(candidateText) >= originalErrorCount) return null;

  const defectType: SyntaxDefectType = withoutTrailingComma !== content ? 'trailing-comma' : 'missing-comma';
  return {
    text: candidateText,
    fix: {
      defectType,
      location: { line: diag.position.line, column: braceStart },
      description: `${defectType === 'trailing-comma' ? 'removed a trailing comma from' : 'inserted a missing comma in'} a data{} clause: "${content.trim()}" -> "${candidateContent.trim()}"`,
    },
  };
}

/** A safe subset of line failures collapses into `coral.line.unparsed`. */
function repairGenericLine(
  text: string,
  diag: ParseDiagnostic,
  originalErrorCount: number,
): { text: string; fix: AppliedFix } | null {
  const lines = text.split('\n');
  const idx = diag.position.line - 1;
  const line = lines[idx];
  if (line === undefined) return null;

  const heuristics: Array<[SyntaxDefectType, (l: string) => string | null]> = [
    ['missing-space-after-type', tryMissingSpaceAfterType],
    ['colon-to-equals-node-property', (candidate) =>
      isInsideNodePropertyBody(lines, idx) ? tryColonToEqualsProperty(candidate) : null],
  ];

  for (const [defectType, fn] of heuristics) {
    const candidateLine = fn(line);
    if (candidateLine === null || candidateLine === line) continue;
    const candidateLines = lines.slice();
    candidateLines[idx] = candidateLine;
    const candidateText = candidateLines.join('\n');
    if (countErrors(candidateText) < originalErrorCount) {
      return {
        text: candidateText,
        fix: {
          defectType,
          location: { line: diag.position.line, column: diag.position.column },
          description: describeGenericFix(defectType, line, candidateLine),
        },
      };
    }
  }

  return null;
}

/** Confirm an `=` line belongs to an open node property body, not arbitrary text. */
function isInsideNodePropertyBody(lines: string[], idx: number): boolean {
  if (!/^\s+/.test(lines[idx])) return false;
  let nestedClosures = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const candidate = lines[i];
    const opens = (candidate.match(/\{/g) ?? []).length;
    const closes = (candidate.match(/\}/g) ?? []).length;
    nestedClosures += closes;
    if (opens <= nestedClosures) {
      nestedClosures -= opens;
      continue;
    }
    return /^\s*[A-Za-z_][\w-]*\s+"(?:[^"\\]|\\.)*"(?:\s+as\s+[A-Za-z_][\w-]*)?(?:\s+@\s*\([^)]*\))?\s*\{\s*$/.test(candidate);
  }
  return false;
}

function tryMissingSpaceAfterType(line: string): string | null {
  const m = line.match(/^(\s*)([A-Za-z_][\w-]*)("(?:[^"\\]|\\.)*".*)$/);
  if (!m) return null;
  return `${m[1]}${m[2]} ${m[3]}`;
}

function tryColonToEqualsProperty(line: string): string | null {
  // Only excludes edge lines (which never have this `key = value` shape at
  // the start of the line, but do legitimately contain "->"). A property's
  // *value* may itself contain "[" / "]" (e.g. an array-valued property like
  // `members: [...]`, which is exactly what a class/ER diagram's converted
  // member/attribute list prints as) -- excluding on bracket presence, as an
  // earlier version of this function did, silently skipped every one of
  // those real corpus lines.
  if (line.includes('->')) return null;
  const m = line.match(/^(\s*)((?:"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*))\s*=\s*(.+)$/);
  if (!m) return null;
  return `${m[1]}${m[2]}: ${m[3]}`;
}

function describeGenericFix(defectType: SyntaxDefectType, before: string, after: string): string {
  return `${defectType}: "${before.trim()}" -> "${after.trim()}"`;
}
