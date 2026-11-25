import { describe, expect, it } from 'vitest';
import {
  admitSvgArtwork029, userOutlineShape029, userSymbolSvgDefinition029, userSymbolSvgInstance029,
  type AdmittedSvgArtwork029, type UserOutline029,
} from '../src/index.js';

// C4 symbol output: the inherited-property reset group (profile SA-2), the
// per-definition outline clip in artwork coordinates and decorative <use>
// instances (c4-design.md "Symbol and use output").

const admit = (text: string): AdmittedSvgArtwork029 => {
  const result = admitSvgArtwork029(text);
  if (!result.ok) throw new Error(JSON.stringify(result.failures));
  return result.artwork;
};
const art = (viewBox: string) => admit(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
  '<path d="M0 0 L10 0 L10 10 Z" fill="#2f6f4f" stroke="#112233"/></svg>');
const outline = (kind: UserOutline029['outline'], width = 60, height = 40): UserOutline029 =>
  ({ symbolId: 'local.probe', outline: kind, width, height });

const RESET = 'fill="#000000" fill-opacity="1" fill-rule="nonzero" stroke="none" stroke-opacity="1" ' +
  'stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4" stroke-dasharray="none" ' +
  'stroke-dashoffset="0" paint-order="normal" clip-rule="nonzero" marker-start="none" marker-mid="none" ' +
  'marker-end="none" color-interpolation="sRGB" shape-rendering="auto"';

describe('user-symbol definition boundary', () => {
  it('wraps the content in one reset group that sets every inherited painting property', () => {
    const text = userSymbolSvgDefinition029('s', 'probe', art('0 0 10 10'));
    expect(text.split(`<g ${RESET}>`)).toHaveLength(2);
    expect(text.indexOf(`<g ${RESET}>`)).toBe(text.indexOf('>') + 1);
    expect(text.endsWith('</g></symbol>')).toBe(true);
    expect(text).not.toContain('var(');
    // `color` is not reset: only tint may paint with currentColor.
    expect(text).not.toContain('currentColor');
    expect(userSymbolSvgDefinition029('s', 'probe', art('0 0 10 10'), { tint: 'stroke' })).toContain('currentColor');
  });

  it.each(['rectangle', 'rounded', 'ellipse', 'diamond'] as const)('clips the %s outline inside the definition', (kind) => {
    const text = userSymbolSvgDefinition029('s', 'probe', art('0 0 60 40'), { outline: outline(kind) });
    const path = userOutlineShape029(outline(kind)).path;
    expect(text).toContain('<clipPath id="s-coral-sym-probe-outline" clipPathUnits="userSpaceOnUse">' +
      `<path d="${path}" transform="translate(0 0) scale(1)"/></clipPath>`);
    expect(text).toContain('<g clip-path="url(#s-coral-sym-probe-outline)">');
    const ids = [...text.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps the frame into artwork coordinates for wider, taller and offset viewBoxes', () => {
    // Frame 60 x 40; viewBox 0 0 30 10 is wider: s = min(2, 4) = 2, frame is 30 x 20 artwork units.
    expect(userSymbolSvgDefinition029('s', 'probe', art('0 0 30 10'), { outline: outline('ellipse') }))
      .toContain('transform="translate(0 -5) scale(0.5)"');
    // viewBox 0 0 10 20 is taller: s = min(6, 2) = 2, frame is 30 x 20; centred horizontally.
    expect(userSymbolSvgDefinition029('s', 'probe', art('0 0 10 20'), { outline: outline('ellipse') }))
      .toContain('transform="translate(-10 0) scale(0.5)"');
    // An offset viewBox moves the frame origin with it.
    expect(userSymbolSvgDefinition029('s', 'probe', art('5 -3 60 40'), { outline: outline('diamond') }))
      .toContain('transform="translate(5 -3) scale(1)"');
  });

  it('marks every instance decorative and keeps the tint colour', () => {
    expect(userSymbolSvgInstance029('s', 'probe', { x: 1, y: 2, width: 60, height: 40 }))
      .toBe('<use href="#s-coral-sym-probe" x="1" y="2" width="60" height="40" aria-hidden="true"/>');
    expect(userSymbolSvgInstance029('s', 'probe', { x: 1, y: 2, width: 60, height: 40 }, { color: '#f1f5f9' }))
      .toBe('<use href="#s-coral-sym-probe" x="1" y="2" width="60" height="40" aria-hidden="true" color="#f1f5f9"/>');
  });
});
