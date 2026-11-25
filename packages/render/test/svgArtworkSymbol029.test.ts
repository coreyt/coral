import { describe, expect, it } from 'vitest';
import {
  admitSvgArtwork029, svgArtworkTintsStroke029, userSymbolSvgDefinition029, userSymbolSvgId029, userSymbolSvgInstance029,
  type AdmittedSvgArtwork029,
} from '../src/index.js';

// <symbol>/<use> output: one namespaced symbol per definition per document,
// explicit paint on every primitive, tint through currentColor
// (c2-design.md "Symbol and use output").

const admit = (text: string): AdmittedSvgArtwork029 => {
  const result = admitSvgArtwork029(text);
  if (!result.ok) throw new Error(JSON.stringify(result.failures));
  return result.artwork;
};
const SHIELD = admit('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28"><linearGradient id="g"><stop offset="0" stop-color="#2f6f4f"/></linearGradient>' +
  '<clipPath id="k"><circle cx="12" cy="12" r="11"/></clipPath><g clip-path="url(#k)"><path d="M12 0L24 4V14Z" fill="url(#g)" stroke="#fff"/>' +
  '<circle cx="12" cy="12" r="2" stroke="url(#g)"/></g><rect width="4" height="4" fill="none"/></svg>');
const KEY = admit('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><radialGradient id="g"><stop offset="1" stop-color="red"/></radialGradient>' +
  '<path d="M0 0H16" stroke="url(#g)" stroke-width="2"/></svg>');

const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
const references = (svg: string) => [...svg.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((match) => match[1] ?? match[2]!);
const primitives = (svg: string) => [...svg.matchAll(/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*>/g)]
  .map((match) => match[0]);

describe('user-symbol <symbol> and <use> output', () => {
  it('namespaces every ID by scope and local ID, and every reference resolves inside its own symbol', () => {
    const shield = userSymbolSvgDefinition029('coral-instance-a', 'shield', SHIELD);
    expect(ids(shield)).toEqual(['coral-instance-a-coral-sym-shield', 'coral-instance-a-coral-sym-shield-p1',
      'coral-instance-a-coral-sym-shield-c1']);
    for (const reference of references(shield)) expect(ids(shield)).toContain(reference);
    expect(shield).toMatch(/^<symbol id="coral-instance-a-coral-sym-shield" viewBox="0 0 24 28" preserveAspectRatio="xMidYMid meet">/);
    expect(shield).not.toContain('\n');
  });

  it('keeps two definitions and two instances in one document free of ID collisions', () => {
    const scope = 'coral-instance-doc';
    const page = [
      userSymbolSvgDefinition029(scope, 'shield', SHIELD), userSymbolSvgDefinition029(scope, 'key', KEY),
      userSymbolSvgInstance029(scope, 'shield', { x: 0, y: 0, width: 24, height: 28 }),
      userSymbolSvgInstance029(scope, 'shield', { x: 40, y: 0, width: 48, height: 56 }),
      userSymbolSvgInstance029(scope, 'key', { x: 0, y: 60, width: 16, height: 16 }),
    ].join('');
    const all = ids(page);
    expect(new Set(all).size).toBe(all.length);
    for (const reference of references(page)) expect(all).toContain(reference);
    // Instances reuse the one definition: no per-instance copies.
    expect(page.match(/<symbol /g)).toHaveLength(2);
    expect(page.match(/href="#coral-instance-doc-coral-sym-shield"/g)).toHaveLength(2);
  });

  it('keeps two documents that both define local.shield apart on one page', () => {
    const first = userSymbolSvgDefinition029('coral-instance-one', 'shield', SHIELD) +
      userSymbolSvgInstance029('coral-instance-one', 'shield', { x: 0, y: 0, width: 1, height: 1 });
    const second = userSymbolSvgDefinition029('coral-instance-two', 'shield', KEY) +
      userSymbolSvgInstance029('coral-instance-two', 'shield', { x: 0, y: 0, width: 1, height: 1 });
    const firstIds = new Set(ids(first));
    expect(ids(second).some((id) => firstIds.has(id))).toBe(false);
    for (const reference of references(second)) expect(ids(second)).toContain(reference);
  });

  it('paints every primitive explicitly', () => {
    for (const svg of [userSymbolSvgDefinition029('s', 'shield', SHIELD), userSymbolSvgDefinition029('s', 'key', KEY, { tint: 'stroke' })]) {
      const painted = svg.replace(/<clipPath\b.*?<\/clipPath>/g, '');
      const tags = primitives(painted);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        for (const attribute of ['fill', 'stroke', 'stroke-width', 'opacity']) expect(tag).toMatch(new RegExp(` ${attribute}="[^"]+"`));
      }
    }
  });

  it('tints every stroke that is not none with currentColor, and sets the colour per instance', () => {
    const tinted = userSymbolSvgDefinition029('s', 'shield', SHIELD, { tint: 'stroke' });
    expect(tinted).toContain('stroke="currentColor"');
    expect(tinted).not.toContain('stroke="#ffffff"');
    expect(tinted).not.toMatch(/stroke="url\(/);
    expect(tinted).toMatch(/<rect [^>]*stroke="none"/);
    expect(tinted).toContain('fill="url(#s-coral-sym-shield-p1)"');
    expect(userSymbolSvgDefinition029('s', 'shield', SHIELD)).toContain('stroke="#ffffff"');
    expect(userSymbolSvgInstance029('s', 'shield', { x: 1.5, y: -0, width: 24, height: 28 }, { color: '#ABC' }))
      .toBe('<use href="#s-coral-sym-shield" x="1.5" y="0" width="24" height="28" aria-hidden="true" color="#aabbcc"/>');
    const [path, circle, rect] = (SHIELD.model.children[0]!.kind === 'g' ? [...SHIELD.model.children[0]!.children, SHIELD.model.children[1]!] : []);
    expect([path, circle, rect].map((node) => node && node.kind !== 'g' && svgArtworkTintsStroke029(node.paint))).toEqual([true, true, false]);
  });

  it('writes nothing for a zero-size frame and refuses invalid arguments', () => {
    expect(userSymbolSvgInstance029('s', 'shield', { x: 0, y: 0, width: 0, height: 5 })).toBe('');
    expect(userSymbolSvgId029('coral-instance-x', 'a_b')).toBe('coral-instance-x-coral-sym-a_b');
    expect(() => userSymbolSvgId029('bad scope', 'a')).toThrow();
    expect(() => userSymbolSvgId029('x-coral-sym-y', 'a')).toThrow();
    expect(() => userSymbolSvgId029('s', 'a-b')).toThrow();
    expect(() => userSymbolSvgDefinition029('s', '1a', SHIELD)).toThrow();
    expect(() => userSymbolSvgInstance029('s', 'a', { x: Number.NaN, y: 0, width: 1, height: 1 })).toThrow();
    expect(() => userSymbolSvgInstance029('s', 'a', { x: 0, y: 0, width: -1, height: 1 })).toThrow();
    expect(() => userSymbolSvgInstance029('s', 'a', { x: 0, y: 0, width: 1, height: Infinity })).toThrow();
    expect(() => userSymbolSvgInstance029('s', 'a', { x: 0, y: 0, width: 1, height: 1 }, { color: 'red;x' })).toThrow();
  });
});
