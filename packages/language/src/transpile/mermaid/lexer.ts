import type { TranspileDiagnostic, TranspileSourceRange } from './types.js';

/**
 * Linear-time string, entity, escape, and statement-splitting primitives.
 * Zero backtracking regexes; zero module-level side effects.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const MERMAID_HASH_ENTITIES: Readonly<Record<string, string>> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
};

function isValidXml10Scalar(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return true;
  if (cp >= 0x20 && cp <= 0xd7ff) return true;
  if (cp >= 0xe000 && cp <= 0xfffd) return true;
  if (cp >= 0x10000 && cp <= 0x10ffff) return true;
  return false;
}

/**
 * Decode Mermaid text (quotes, markdown backtick strings, <br/>, HTML/#NNN; entities,
 * literal tabs, U+2028/U+2029, and XML 1.0 / surrogate validation) into clean Coral string text.
 */
export function normalizeMermaidText(
  raw: string,
  diagnostics: TranspileDiagnostic[],
  range?: TranspileSourceRange,
  options: { unquote?: boolean } = {},
): string {
  let text = raw;
  const shouldUnquote = options.unquote ?? true;

  if (shouldUnquote) {
    const trimmed = text.trim();
    // Markdown string "`...`"
    if (trimmed.length >= 4 && trimmed.startsWith('"`') && trimmed.endsWith('`"')) {
      const inner = trimmed.slice(2, -2);
      if (inner.includes('**') || inner.includes('__') || /(?:^|\s)[*_][^\s]/.test(inner)) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.text.markdown.degraded',
          message: 'Markdown string formatting markers are preserved as plain text in Coral labels.',
          ...(range ? { range } : {}),
        });
      }
      text = inner;
    } else if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      text = unescapeMermaidQuoted(trimmed.slice(1, -1));
    } else {
      text = trimmed;
    }
  }

  // Convert <br>, <br/>, <br /> (case-insensitive) to \n in linear time
  text = replaceBrTags(text);

  // Decode safe HTML entities (&amp;, &lt;, &gt;, &quot;, &#NNN;, &#xHHH;) and Mermaid #quot; / #NNN;
  text = decodeEntities(text);

  // Validate scalars and normalize \t -> ' ', U+2028/U+2029 -> '\n', \r\n/\r -> '\n'
  let out = '';
  let reportedTab = false;
  let reportedInvalidScalar = false;

  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit === 0x0d /* \r */) {
      if (text.charCodeAt(i + 1) === 0x0a) i++;
      out += '\n';
      continue;
    }
    if (unit === 0x0a /* \n */) {
      out += '\n';
      continue;
    }
    if (unit === 0x09 /* \t */) {
      if (!reportedTab) {
        reportedTab = true;
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.text.tab.normalized',
          message: 'Tab character in Mermaid text was normalized to a single ASCII space for Coral saved source.',
          ...(range ? { range } : {}),
        });
      }
      out += ' ';
      continue;
    }
    if (unit === 0x2028 || unit === 0x2029) {
      out += '\n';
      continue;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text.slice(i, i + 2);
        i++;
        continue;
      }
      if (!reportedInvalidScalar) {
        reportedInvalidScalar = true;
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.text.invalid-scalar',
          message: 'Mermaid text contains an isolated Unicode high surrogate.',
          ...(range ? { range } : {}),
        });
      }
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      if (!reportedInvalidScalar) {
        reportedInvalidScalar = true;
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.text.invalid-scalar',
          message: 'Mermaid text contains an isolated Unicode low surrogate.',
          ...(range ? { range } : {}),
        });
      }
      continue;
    }
    if (unit < 0x20 || (unit >= 0x7f && unit <= 0x9f) || unit === 0xfffe || unit === 0xffff) {
      if (!reportedInvalidScalar) {
        reportedInvalidScalar = true;
        diagnostics.push({
          severity: 'error',
          code: 'mermaid.text.invalid-scalar',
          message: `Mermaid text contains prohibited scalar U+${unit.toString(16).toUpperCase().padStart(4, '0')}.`,
          ...(range ? { range } : {}),
        });
      }
      continue;
    }
    out += text[i]!;
  }

  return out;
}

function unescapeMermaidQuoted(inner: string): string {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === '\\' && i + 1 < inner.length) {
      const next = inner[i + 1]!;
      if (next === '"' || next === '\\') {
        out += next;
        i++;
        continue;
      }
      if (next === 'n') {
        out += '\n';
        i++;
        continue;
      }
      if (next === 't') {
        out += '\t';
        i++;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function replaceBrTags(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '<') {
      const c1 = text[i + 1];
      const c2 = text[i + 2];
      if ((c1 === 'b' || c1 === 'B') && (c2 === 'r' || c2 === 'R')) {
        let j = i + 3;
        while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
        if (text[j] === '/') j++;
        if (text[j] === '>') {
          out += '\n';
          i = j + 1;
          continue;
        }
      }
    }
    out += text[i]!;
    i++;
  }
  return out;
}

function decodeEntities(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '&') {
      const semi = text.indexOf(';', i + 1);
      if (semi > i + 1 && semi - i <= 12) {
        const body = text.slice(i + 1, semi);
        if (body.startsWith('#x') || body.startsWith('#X')) {
          const hex = body.slice(2);
          if (/^[0-9a-fA-F]+$/.test(hex)) {
            const cp = parseInt(hex, 16);
            if (isValidXml10Scalar(cp)) {
              out += String.fromCodePoint(cp);
              i = semi + 1;
              continue;
            }
          }
        } else if (body.startsWith('#')) {
          const dec = body.slice(1);
          if (/^[0-9]+$/.test(dec)) {
            const cp = parseInt(dec, 10);
            if (isValidXml10Scalar(cp)) {
              out += String.fromCodePoint(cp);
              i = semi + 1;
              continue;
            }
          }
        } else if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) {
          out += NAMED_ENTITIES[body]!;
          i = semi + 1;
          continue;
        }
      }
    } else if (ch === '#') {
      const semi = text.indexOf(';', i + 1);
      if (semi > i + 1 && semi - i <= 10) {
        const body = text.slice(i + 1, semi);
        if (/^[0-9]+$/.test(body)) {
          const cp = parseInt(body, 10);
          if (isValidXml10Scalar(cp)) {
            out += String.fromCodePoint(cp);
            i = semi + 1;
            continue;
          }
        } else if (Object.prototype.hasOwnProperty.call(MERMAID_HASH_ENTITIES, body)) {
          out += MERMAID_HASH_ENTITIES[body]!;
          i = semi + 1;
          continue;
        }
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Split a single line on `;` outside quotes, brackets, braces, parens, and Mermaid `#entity;` / `&entity;`.
 */
export function splitStatementsOnSemicolon(
  line: string,
  options: { respectBrackets?: boolean } = {},
): Array<{ text: string; offsetInLine: number }> {
  const respectBrackets = options.respectBrackets ?? true;
  const parts: Array<{ text: string; offsetInLine: number }> = [];
  let start = 0;
  let inDouble = false;
  let inBacktick = false;
  let sqDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inDouble) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (respectBrackets) {
      if (ch === '[') { sqDepth++; continue; }
      if (ch === ']' && sqDepth > 0) { sqDepth--; continue; }
      if (ch === '(') { parenDepth++; continue; }
      if (ch === ')' && parenDepth > 0) { parenDepth--; continue; }
      if (ch === '{') { braceDepth++; continue; }
      if (ch === '}' && braceDepth > 0) { braceDepth--; continue; }
    }
    if (ch === ';' && sqDepth === 0 && parenDepth === 0 && braceDepth === 0) {
      // Check if this semicolon terminates a Mermaid #entity; or &entity;
      if (isEntitySemicolon(line, i)) continue;
      const seg = line.slice(start, i);
      if (seg.trim()) {
        parts.push({ text: seg, offsetInLine: start });
      }
      start = i + 1;
    }
  }
  const tail = line.slice(start);
  if (tail.trim()) {
    parts.push({ text: tail, offsetInLine: start });
  }
  return parts;
}

function isEntitySemicolon(line: string, semiIdx: number): boolean {
  let j = semiIdx - 1;
  let len = 0;
  while (j >= 0 && len <= 10) {
    const c = line.charCodeAt(j);
    const isAlnum = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (isAlnum) { j--; len++; continue; }
    if ((c === 35 /* # */ || c === 38 /* & */) && len > 0) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Linear O(n) split of `rest` into `[beforeLastToken, lastToken]` separated by whitespace.
 * Replaces backtracking `/\s+[^\s]+$/` regexes (C3).
 */
export function splitTrailingToken(rest: string): { head: string; tail: string } | null {
  let end = rest.length;
  while (end > 0 && (rest[end - 1] === ' ' || rest[end - 1] === '\t')) end--;
  if (end === 0) return null;
  let tokStart = end;
  while (tokStart > 0 && rest[tokStart - 1] !== ' ' && rest[tokStart - 1] !== '\t') tokStart--;
  if (tokStart === 0) return null;
  let headEnd = tokStart;
  while (headEnd > 0 && (rest[headEnd - 1] === ' ' || rest[headEnd - 1] === '\t')) headEnd--;
  if (headEnd === 0) return null;
  return { head: rest.slice(0, headEnd), tail: rest.slice(tokStart, end) };
}

/**
 * Escape text strictly for a Coral double-quoted string: ONLY \", \\, \n.
 */
export function quoteCoralString(text: string): string {
  let out = '"';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const unit = text.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n' || unit === 0x2028 || unit === 0x2029) out += '\\n';
    else if (ch === '\r') { /* already normalized */ }
    else if (ch === '\t') out += ' ';
    else out += ch;
  }
  out += '"';
  return out;
}
