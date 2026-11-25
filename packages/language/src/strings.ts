/**
 * Quoting (R-009).
 *
 * One escaper and one unescaper, inverse over the characters Coral quotes.
 * Every quoted position — node label, property value, edge attribute and the
 * id spellings — is written by the first and read by the second, so a string
 * survives any number of round-trips rather than growing a backslash on each.
 */

/** Escape the characters that cannot appear raw inside a Coral quoted string. */
export function escapeString(str: string): string {
  return str.replace(/[\\"\n\r\t]/g, (char) => {
    if (char === '\\') return '\\\\';
    if (char === '"') return '\\"';
    if (char === '\n') return '\\n';
    if (char === '\r') return '\\r';
    if (char === '\t') return '\\t';
    return char;
  });
}

/** Decode backslash escapes in a Coral string value. */
export function unescapeString(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '\\' || i + 1 >= str.length) {
      out += str[i];
      continue;
    }
    const next = str[++i];
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === '"') out += '"';
    else if (next === '\\') out += '\\';
    else out += next;
  }
  return out;
}

/** A bare identifier needs no quoting; anything else does. */
export const BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Emit an id or key bare when it can be, quoted when it cannot. */
export function quoteIfNeeded(value: string): string {
  return BARE_IDENTIFIER.test(value) ? value : `"${escapeString(value)}"`;
}
