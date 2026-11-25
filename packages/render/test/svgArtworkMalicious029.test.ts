import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029, type SvgArtworkAdmission029 } from '../src/index.js';

// Hostile artwork beyond the shared vectors: every case is refused with an
// attributable coral.artwork.svg.* code, and no failure detail carries raw
// input (profile §3; design c2-design.md R1-4).

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
const svg = (body: string, open = OPEN) => `${open}${body}</svg>`;
const XLINK = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24">';

function codes(result: SvgArtworkAdmission029): string[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : [...new Set(result.failures.map((failure) => failure.code))];
}

const cases: [string, string, string[]][] = [
  ['XInclude', svg('<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="file:///etc/passwd"/>'),
    ['coral.artwork.svg.element.unsupported']],
  ['an external entity in an attribute', `<!DOCTYPE svg [<!ENTITY e SYSTEM "http://evil.example/">]>${svg('<path d="&e;"/>')}`,
    ['coral.artwork.svg.parse']],
  ['a parameter entity', `<!DOCTYPE svg [<!ENTITY % p SYSTEM "x">%p;]>${svg('')}`, ['coral.artwork.svg.parse']],
  ['xlink:href to a file', svg('<linearGradient id="g" xlink:href="file:///etc/passwd#g"/>', XLINK),
    ['coral.artwork.svg.reference.unsupported']],
  ['an href to another document', svg('<linearGradient id="g" href="other.svg#g"/>'),
    ['coral.artwork.svg.reference.unsupported']],
  ['a data URL clip path', svg('<path d="M0 0H1" clip-path="url(data:image/svg+xml,x)"/>'),
    ['coral.artwork.svg.reference.unsupported']],
  ['a protocol-relative paint URL', svg('<path d="M0 0H1" stroke="url(//evil.example/a#b)"/>'),
    ['coral.artwork.svg.reference.unsupported']],
  ['an event handler in upper case', svg('<path d="M0 0H1" ONLOAD="alert(1)"/>'),
    ['coral.artwork.svg.attribute.unsupported']],
  ['an event handler on a gradient stop', svg('<linearGradient id="g"><stop offset="0" onbegin="x"/></linearGradient>'),
    ['coral.artwork.svg.attribute.unsupported']],
  ['an event handler on a title', svg('<title onclick="x">t</title>'), ['coral.artwork.svg.attribute.unsupported']],
  ['an animation inside a gradient', svg('<linearGradient id="g"><animate attributeName="x1"/></linearGradient>'),
    ['coral.artwork.svg.element.unsupported']],
  ['a script inside a clip path', svg('<clipPath id="k"><script>x</script></clipPath>'),
    ['coral.artwork.svg.element.unsupported']],
  ['a style block in CDATA', svg('<style><![CDATA[*{fill:red}]]></style>'), ['coral.artwork.svg.element.unsupported']],
  ['an expression in a presentation attribute', svg('<path d="M0 0H1" fill="expression(alert(1))"/>'),
    ['coral.artwork.svg.attribute.unsupported']],
  ['a CSS escape in a value', svg('<path d="M0 0H1" style="fill:\\72 ed"/>'), ['coral.artwork.svg.attribute.unsupported']],
  ['a style closing tag', svg('<path d="M0 0H1" style="fill:red&lt;/style&gt;"/>'),
    ['coral.artwork.svg.attribute.unsupported']],
  ['a URL in a dash array', svg('<path d="M0 0H1" stroke-dasharray="url(#x)"/>'), ['coral.artwork.svg.attribute.unsupported']],
  ['a mask through style', svg('<path d="M0 0H1" style="mask:url(#m)"/>'), ['coral.artwork.svg.attribute.unsupported']],
  ['a root transform', svg('', '<svg xmlns="http://www.w3.org/2000/svg" transform="scale(1)" viewBox="0 0 1 1">'),
    ['coral.artwork.svg.attribute.unsupported']],
  ['a foreign default namespace on a descendant', svg('<g xmlns="http://www.w3.org/1999/xhtml"><script/></g>'),
    ['coral.artwork.svg.element.unsupported']],
];

describe('coral.svg-artwork 1 refuses hostile artwork', () => {
  for (const [name, input, expected] of cases) {
    it(`refuses ${name}`, () => {
      expect(codes(admitSvgArtwork029(input))).toEqual(expected);
    });
  }

  it('never puts raw input into a failure detail', () => {
    const long = `javascript:${'\u0007'.repeat(10)}${'x'.repeat(5_000)}`;
    const inputs = [
      svg(`<path d="M0 0H1" fill="url(${long})"/>`),
      svg(`<path d="M0 0H1" data-x="${'y'.repeat(5_000)}é"/>`),
      svg(`<path d="${'Q'.repeat(5_000)}"/>`),
      svg(`<path d="M0 0H1" style="fill:${'z'.repeat(5_000)}"/>`),
      svg(`<g>${'w'.repeat(5_000)}</g>`),
    ];
    for (const input of inputs) {
      const result = admitSvgArtwork029(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      for (const failure of result.failures) {
        expect(failure.detail.length).toBeLessThanOrEqual(200);
        expect(failure.detail).toMatch(/^[\x20-\x7e]*$/);
      }
    }
  });
});
