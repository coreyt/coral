import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029, admitSvgArtworkBytes029, type SvgArtworkAdmission029 } from '../src/index.js';

// Ingress (P1) and parse (P2) behavior of the coral.svg-artwork 1 admitter:
// the first failure only, located at the offending construct (profile §3, §4).

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
const svg = (body: string) => `${OPEN}${body}</svg>`;

function refusal(result: SvgArtworkAdmission029) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('admitted');
  expect(result.failures).toHaveLength(1);
  return result.failures[0]!;
}

describe('coral.svg-artwork 1 ingress', () => {
  it('measures UTF-8 bytes, not UTF-16 code units', () => {
    const euros = '€'.repeat(699_051); // 2,097,153 bytes in 699,051 code units
    const failure = refusal(admitSvgArtwork029(svg(`<title>${euros}</title>`)));
    expect(failure).toMatchObject({ code: 'coral.artwork.svg.budget.exceeded', phase: 'P1' });
    expect(failure.budgets?.[0]).toMatchObject({ name: 'input.bytes', limit: 2_097_152 });
    expect(failure.budgets![0]!.measure).toBeGreaterThan(2_097_152);
  });

  it('checks the byte ceiling before decoding bytes', () => {
    const bytes = new Uint8Array(2_097_153).fill(0xff);
    expect(refusal(admitSvgArtworkBytes029(bytes))).toMatchObject({
      code: 'coral.artwork.svg.budget.exceeded', phase: 'P1' });
  });

  it('refuses malformed UTF-8 and a byte order mark in bytes', () => {
    const text = new TextEncoder().encode(svg('<path d="M0 0H1"/>'));
    const broken = new Uint8Array([...text.slice(0, 10), 0xc3, 0x28, ...text.slice(10)]);
    expect(refusal(admitSvgArtworkBytes029(broken))).toMatchObject({ code: 'coral.artwork.svg.parse', phase: 'P2' });
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...text]);
    expect(refusal(admitSvgArtworkBytes029(bom))).toMatchObject({ code: 'coral.artwork.svg.parse' });
  });
});

describe('coral.svg-artwork 1 parse failures', () => {
  const cases: [string, string, string][] = [
    ['a document type declaration', `<!DOCTYPE svg>${svg('')}`, '<!DOCTYPE'],
    ['an undeclared entity', svg('<title>&nbsp;</title>'), '&nbsp;'],
    ['a NUL character reference', svg('<title>&#0;</title>'), '&#0;'],
    ['a surrogate character reference', svg('<title>&#xD800;</title>'), '&#xD800;'],
    ['a character reference beyond Unicode', svg('<title>&#x110000;</title>'), '&#x110000;'],
    ['a lone surrogate', svg('<title>\ud800</title>'), '\ud800'],
    ['U+FFFE', svg('<title>￾</title>'), '￾'],
    ['a vertical tab', svg('<title>\u000b</title>'), '\u000b'],
    ['a processing instruction', svg('<?php echo 1 ?>'), '<?php'],
    ['a late XML declaration', `\n<?xml version="1.0"?>${svg('')}`, '<?xml'],
    ['an XML 1.1 declaration', `<?xml version="1.1"?>${svg('')}`, '<?xml'],
    ['a comment ending in three hyphens', svg('<!-- a --->'), '<!--'],
    ['"]]>" in character data', svg('<title>a]]>b</title>'), ']]>'],
    ['"<" in an attribute value', svg('<path d="M0 0<H1"/>'), '<H1'],
    ['an unquoted attribute value', svg('<path d=M0/>'), 'M0/>'],
    ['an attribute without a value', svg('<path d/>'), '/>'],
    ['a mismatched end tag', svg('<g></path>'), '</path>'],
    ['an end tag without a start tag', `${OPEN}</g></svg>`, '</g>'],
    ['an unclosed root', OPEN, OPEN],
    ['two root elements', `${svg('')}${svg('')}`, OPEN],
    ['text after the root', `${svg('')}~`, '~'],
    ['text before the root', `~${svg('')}`, '~'],
    ['an empty prefix declaration', svg('<g xmlns:p=""/>'), 'xmlns:p'],
    ['a rebound xml prefix', svg('<g xmlns:xml="urn:x"/>'), 'xmlns:xml'],
    ['an unbound element prefix', svg('<p:g/>'), '<p:g'],
    ['a non-ASCII name', svg('<gé/>'), 'é'],
    ['a name with two colons', svg('<a:b:c/>'), '<a:b:c'],
    ['a prefixed root', '<s:svg xmlns:s="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', '<s:svg'],
    ['a root in another namespace', '<svg xmlns="urn:x" viewBox="0 0 1 1"/>', '<svg'],
    ['the same attribute through two prefixes',
      svg('<linearGradient xmlns:a="urn:x" xmlns:b="urn:x" a:k="1" b:k="2"/>'), 'b:k'],
    ['CDATA outside the root', `<![CDATA[x]]>${svg('')}`, '<![CDATA['],
    ['an empty document', '', ''],
  ];
  for (const [name, input, at] of cases) {
    it(`refuses ${name} at the construct`, () => {
      const failure = refusal(admitSvgArtwork029(input));
      expect(failure.code).toBe('coral.artwork.svg.parse');
      expect(failure.phase).toBe('P2');
      expect(failure.start).toBe(input.indexOf(at, at === OPEN && input.startsWith(OPEN + '</svg>') ? 1 : 0));
    });
  }

  it('locates nesting and element-count failures at the start tag that crosses the ceiling', () => {
    const deep = `${OPEN}${'<g>'.repeat(31)}<path d="M0 0H1"/>${'</g>'.repeat(31)}</svg>`;
    const nested = refusal(admitSvgArtwork029(deep));
    expect(nested).toMatchObject({ code: 'coral.artwork.svg.budget.exceeded', phase: 'P2' });
    expect(nested.start).toBe(OPEN.length + 3 * 31);
    const many = `${OPEN}${'<g/>'.repeat(10_000)}</svg>`;
    const counted = refusal(admitSvgArtwork029(many));
    expect(counted.budgets?.[0]?.name).toBe('input.elements');
    expect(counted.start).toBe(OPEN.length + 4 * 9_999);
  });

  it('reports only the first failure', () => {
    const failure = refusal(admitSvgArtwork029(svg('<title>&a;&b;</title><p:x/>')));
    expect(failure.start).toBe(OPEN.length + 7);
  });

  it('keeps a failure at the end of the input inside the input', () => {
    for (const input of [`${OPEN}<`, `${OPEN}<path d`, `${OPEN}<path d="M0`, `${OPEN}<g x`, '<']) {
      const failure = refusal(admitSvgArtwork029(input));
      expect(failure.start).toBeLessThanOrEqual(failure.end);
      expect(failure.end).toBeLessThanOrEqual(input.length);
    }
  });

  it('never carries raw input in a parse failure detail', () => {
    const long = 'n'.repeat(300);
    for (const input of [svg('<title>&l\u001d;</title>'), svg(`<title>&#x${'f'.repeat(9)};</title>`), svg(`<${long}\u0007/>`),
      svg(`<g ${long}:${long}:x=""/>`), svg(`<g ${long}="1" ${long}="2"/>`), svg(`<g xmlns:p="" />`), svg(`<${long}:g/>`),
      svg(`<g></${long}>`), `${OPEN}<${long}>`]) {
      const failure = refusal(admitSvgArtwork029(input));
      expect(failure.detail).toMatch(/^[\x20-\x7e]{1,200}$/);
    }
  });
});
