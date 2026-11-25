import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// C4 guard (c4-design.md "What host CSS can and cannot reach"): the editor
// canvas draws user-symbol artwork in light DOM, where the document's
// stylesheets apply inside <use> instance trees. No stylesheet the editor
// bundles may hold a rule whose selector can match an artwork element with
// only shadow-tree ancestors and that sets a painting or geometry property.

const require = createRequire(join(__dirname, 'guard.cjs'));
const STYLESHEETS = [join(__dirname, '../src/visual-system.css'), require.resolve('@xyflow/react/dist/style.css')];
const DRAWING = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use',
  'symbol', 'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop']);

/** Painting and geometry properties that would change how artwork draws. */
const PAINTING = /^(fill|stroke|opacity|color|visibility|display|transform|filter|clip|mask|marker|paint-order|vector-effect|shape-rendering|mix-blend-mode|isolation|all|d|cx|cy|r|rx|ry|x|y|width|height|stop-|color-interpolation)/;

/** Selectors and declared property names of every style rule; at-rule preludes skipped. */
function rules(css: string): { selector: string; properties: string[] }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: { selector: string; properties: string[] }[] = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = match[1]!.trim();
    if (!prelude || prelude.startsWith('@') || /^(from|to|\d+%)/.test(prelude)) continue;
    const properties = match[2]!.split(';').map((item) => item.split(':')[0]!.trim().toLowerCase()).filter(Boolean);
    for (const selector of prelude.split(',').map((item) => item.trim()).filter(Boolean)) found.push({ selector, properties });
  }
  return found;
}

/** True when the selector could match an artwork element inside a <use> tree:
 * no class or ID compound, no attribute Coral never writes on artwork, and a
 * subject that can be an SVG drawing element. */
export function matchesArtwork029(selector: string): boolean {
  if (/\[\s*(data-|role|aria-)/.test(selector)) return false;
  const compounds = selector.replace(/\[[^\]]*\]/g, '[]').split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  if (compounds.some((compound) => /[.#]/.test(compound) || /:(root|host)\b/.test(compound))) return false;
  const subject = compounds.at(-1)!.replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[\]/g, '').toLowerCase();
  return subject === '' || subject === '*' || DRAWING.has(subject);
}

describe('editor stylesheets cannot restyle canvas artwork', () => {
  it('classifies selectors as the guard intends', () => {
    expect(matchesArtwork029('path')).toBe(true);
    expect(matchesArtwork029('svg *')).toBe(true);
    expect(matchesArtwork029('[fill]')).toBe(true);
    expect(matchesArtwork029('.react-flow .react-flow__edges svg')).toBe(false);
    expect(matchesArtwork029('.react-flow__edge.animated path')).toBe(false);
    expect(matchesArtwork029('body')).toBe(false);
    expect(matchesArtwork029('[data-coral-theme] *')).toBe(false);
    expect(matchesArtwork029(':root')).toBe(false);
  });

  it.each(STYLESHEETS)('%s has no rule that can match artwork', (sheet) => {
    const css = readFileSync(sheet, 'utf8');
    expect(rules(css).length).toBeGreaterThan(10);
    expect(rules(css).filter((rule) => matchesArtwork029(rule.selector) &&
      rule.properties.some((property) => PAINTING.test(property)))).toEqual([]);
  });
});
