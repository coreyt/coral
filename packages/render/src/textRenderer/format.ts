import { CHARACTER_GLYPH_ROLES_028 as roles, FONT_SHA_BY_FACE_029 } from '../characterGlyphRoles028.js';
import { getEndpointGlyph029 } from '../characterEndpoint029.js';
import { TextRenderError, unfit, type RenderTextOptions, type TextDiagnostic } from './types.js';

const prefixes = { none: '', slash: '// ', hash: '# ', dash: '-- ', 'block-c': ' * ', html: '  ' };
const choices = {
  profile: ['document', 'comment'], charset: ['ascii', 'utf8-box', 'monotrue-v1'],
  page: ['letter', 'a4'], density: ['compact', 'standard'], commentStyle: Object.keys(prefixes),
  legend: ['auto', 'always', 'none'], eol: ['lf', 'crlf'],
};
const invalid = (message: string): never => { throw new TextRenderError('text.options.invalid', message); };
function dimension(name: string, value: number, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) invalid(`${name} must be an integer >= ${minimum}.`);
  return value;
}

export function settings(options: RenderTextOptions, diagnostics: TextDiagnostic[]) {
  for (const [key, values] of Object.entries(choices)) {
    const value = options[key as keyof RenderTextOptions];
    if (value !== undefined && !values.includes(String(value))) invalid(`Unsupported ${key}: ${value}.`);
  }
  const profile = options.profile ?? 'document';
  const comment = profile === 'comment';
  const columns = dimension('columns', options.pageWidth ?? options.columns ?? (comment ? 80 : 72), comment ? 32 : 40);
  const height = options.pageHeight === undefined || (comment && options.pageHeight === Infinity)
    ? comment ? Infinity : options.page === 'a4' ? 60 : 55
    : dimension('pageHeight', options.pageHeight, comment ? 1 : 20);
  let charset = options.charset ?? (comment ? 'utf8-box' : 'ascii');
  if (charset === 'monotrue-v1') {
    const cap = options.monoTrue;
    if (cap?.profile !== 'monotrue-v1' || cap.selected !== true || cap.face !== 'Regular' ||
      cap.fontSha256 !== FONT_SHA_BY_FACE_029.Regular || !Array.isArray(cap.validatedRoles) ||
      !Object.keys(roles).every(role => cap.validatedRoles.includes(role))) {
      charset = 'ascii';
      diagnostics.push({ code: 'text.monotrue.fallback', severity: 'warning', message: 'MonoTrue Regular capability unavailable. Using ASCII.' });
    }
  }
  const style = comment ? options.commentStyle ?? 'none' : 'none';
  const forbidden = style === 'block-c' ? '*/' : style === 'html' ? '-->' : undefined;
  function neutralize(value: string, drawn = false) {
    if (!forbidden || !value.includes(forbidden)) return value;
    if (!diagnostics.some(d => d.code === 'text.comment.delimiter')) diagnostics.push({
      code: 'text.comment.delimiter', severity: 'info', message: 'Separated a closing comment delimiter inside the picture.',
    });
    return value.replaceAll(forbidden, forbidden === '*/' ? '* /' : drawn ? '- >' : '-- >');
  }
  // Keep one printable cell per emitted scalar. Escape controls, bidi marks,
  // combining sequences, wide glyphs and authored private-use characters.
  function encode(value: string) {
    return neutralize(Array.from(value, c => {
      if (c === '\\') return '\\\\';
      if (/^[ -~]$/.test(c) || (charset !== 'ascii' && /^\p{L}$/u.test(c) && /^[\u00c0-\u024f\u0370-\u052f]$/u.test(c))) return c;
      return `\\u{${c.codePointAt(0)!.toString(16).toUpperCase()}}`;
    }).join('').replace(/\[(?=(?:-> p\.\d+:[A-Z]+(?: \^)?|(?:v )?p\.\d+:[A-Z]+ ->)\])/g, '\\u{5B}'));
  }
  const prefix = comment && options.commentPrefix !== undefined ? encode(options.commentPrefix) : prefixes[style];
  const width = columns - prefix.length;
  if (width < 3) unfit('commentPrefix', prefix.length + 3, 'no space for the picture');
  const ascii = charset === 'ascii';
  const glyph = {
    tl: ascii ? '+' : '┌', tr: ascii ? '+' : '┐', bl: ascii ? '+' : '└', br: ascii ? '+' : '┘',
    h: ascii ? '-' : '─', v: ascii ? '|' : '│', tee: ascii ? '+' : '├', end: ascii ? '+' : '┤',
    right: charset === 'monotrue-v1' ? getEndpointGlyph029('arrow_open', 1, 0) : ascii ? '>' : '→',
    left: charset === 'monotrue-v1' ? getEndpointGlyph029('arrow_open', -1, 0) : ascii ? '<' : '←',
    down: charset === 'monotrue-v1' ? getEndpointGlyph029('arrow_open', 0, 1) : ascii ? 'v' : '↓',
  };
  return { profile, charset, columns, width, height, glyph, prefix, style, forbidden, neutralize, encode,
    density: options.density ?? (comment ? 'compact' : 'standard'), header: options.header ?? !comment,
    legend: options.legend ?? 'auto', eol: options.eol === 'crlf' ? '\r\n' : '\n' };
}
export type Settings = ReturnType<typeof settings>;

/** Break on words first. A legend can also break a long word between scalar escapes. */
export function wrap(text: string, width: number, path: string): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = ''; }
    if (line) line += ' ';
    for (const token of word.match(/\\u\{[0-9A-F]+\}|\\\\|./gu) ?? []) {
      if (token.length > width) unfit(path, token.length, 'one scalar escape exceeds available width');
      if (line.length + token.length > width) { lines.push(line); line = ''; }
      line += token;
    }
  }
  lines.push(line);
  return lines;
}

export function key(index: number): string {
  let value = index + 1, result = '';
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function box(rows: (string | null)[], cfg: Settings) {
  const g = cfg.glyph;
  const width = Math.max(1, ...rows.map(row => row?.length ?? 0));
  const rule = g.h.repeat(width + 2);
  return [g.tl + rule + g.tr, ...rows.map(row => row === null ? g.tee + rule + g.end :
    g.v + ' ' + row.padEnd(width) + ' ' + g.v), g.bl + rule + g.br];
}
