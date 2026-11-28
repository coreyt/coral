import type { Settings } from './format.js';
import { portal } from './paginate.js';
import { TextRenderError, type ContinuationLink } from './types.js';
import { CHARACTER_GLYPH_ROLES_028 } from '../characterGlyphRoles028.js';

const verified = new Set<string>(Object.values(CHARACTER_GLYPH_ROLES_028).map(r => r.character));

export function verifyTextOutput(rows: string[][], links: ContinuationLink[], cfg: Settings) {
  const fail = (detail: string): never => { throw new TextRenderError('text.output.invalid', detail); };
  let width = 0, height = 0;
  for (const page of rows) {
    height = Math.max(height, page.length);
    if (page.length > cfg.height) fail('Page exceeds its height.');
    for (const [index, line] of page.entries()) {
      width = Math.max(width, line.length);
      if (line.length > cfg.columns || /\s$/u.test(line) || /[\p{Cc}\p{Cf}]/u.test(line))
        fail('Invalid output row.');
      if (cfg.charset === 'ascii' && /[^ -~]/u.test(line)) fail('Non-ASCII output.');
      if (cfg.forbidden && index < page.length - 1 && line.includes(cfg.forbidden)) fail('Unsafe comment body.');
      for (const char of line) if (/\p{Co}/u.test(char) && (cfg.charset !== 'monotrue-v1' || !verified.has(char)))
        fail('Unverified font endpoint.');
    }
  }
  const pages = rows.map(page => page.join(cfg.eol));
  for (const link of links) {
    for (const exit of [true, false]) {
      const page = pages[(exit ? link.fromPage : link.toPage) - 1];
      if (page.split(portal(link, exit)).length !== 2) fail('Unpaired continuation marker.');
    }
  }
  return { pages, text: pages.join('\f' + cfg.eol), width, height };
}
