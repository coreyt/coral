import { describe, expect, it } from 'vitest';
import { prepareSvgIconImport029 } from '../src/artwork/svgIconImport029.js';
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
describe('bounded icon import', () => {
  it('normalizes percentage RGB and retains viewBox proportions', () => {
    const result = prepareSvgIconImport029(svg('<rect x="2" y="2" width="20" height="20" fill="rgb(100%,0%,0%)"/>'));
    expect(result.artwork.canonicalText).toContain('#ff0000');
    expect(result.measures).toMatchObject({ operations: 4, shapes: 1, depth: 0 });
  });
  it('counts repeated coordinate sets and excludes moves', () => {
    expect(prepareSvgIconImport029(svg('<path d="M0 0 1 1 2 2 L3 3 4 4 Z"/>')).measures.operations).toBe(5);
  });
  it('expands inherited local references and charges every copy', () => {
    const result = prepareSvgIconImport029(svg('<defs><path id="p" d="M2 2h4v4z"/></defs><g fill="red"><use href="#p"/><use href="#p" x="8"/></g>'));
    expect(result.measures).toMatchObject({ shapes: 2, operations: 6 });
    expect(result.artwork.canonicalText).not.toContain('<use');
    expect(result.artwork.canonicalText).toContain('#ff0000');
  });
  it.each([
    ['input bytes', ' '.repeat(131073)],
    ['shape expansion', svg('<defs><path id="p" d="M1 1h1"/></defs>' + '<use href="#p"/>'.repeat(101))],
    ['drawing operations', svg('<path d="M1 1' + 'h0'.repeat(3001) + '"/>')],
    ['container depth', svg('<g>'.repeat(9) + '<path d="M1 1h1"/>' + '</g>'.repeat(9))],
    ['circular reference', svg('<defs><g id="p"><use href="#p"/></g></defs><use href="#p"/>')],
    ['external reference', svg('<use href="https://example.com/icon.svg#p"/>')],
    ['clipped overflow', svg('<defs><clipPath id="p"><rect width="24" height="24"/></clipPath></defs><path clip-path="url(#p)" d="M0 0h100"/>')],
    ['filter', svg('<filter id="f"/>')],
    ['DTD', '<!DOCTYPE svg [<!ENTITY p "test">]>' + svg('')],
  ])('refuses %s before preview', (_name, input) => {
    expect(() => prepareSvgIconImport029(input)).toThrow();
  });
});

// Bounds engine is separately exercised by the three real browser rounds.
describe('bounds estimate enforcement', () => {
  it('checks unclipped reported bounds against 1% and releases the engine', async () => {
    const { checkSvgIconBounds029 } = await import('../src/artwork/svgIconImport029.js');
    const artwork = prepareSvgIconImport029(svg('<path d="M2 2h4v4z"/>')).artwork;
    let freed = 0;
    expect(() => checkSvgIconBounds029(artwork, () => ({ getBBox: () => ({ x: -1, y: 0, width: 8, height: 8 }), free: () => freed++ }))).toThrow(/1%/);
    expect(freed).toBe(1);
    expect(checkSvgIconBounds029(artwork, () => ({ getBBox: () => ({ x: -.1, y: 0, width: 8, height: 8 }), free: () => freed++ })).overhang).toBe(.1);
  });
});

it('bounds empty reference fanout before materializing an expanded tree', () => {
  const group = (id: string, child: string) => `<g id="${id}">${`<use href="#${child}"/>`.repeat(100)}</g>`;
  const text = svg('<defs><g id="leaf"/>' + group('first', 'leaf') + group('second', 'first') + '</defs><use href="#second"/>');
  expect(() => prepareSvgIconImport029(text)).toThrow(/expanded.*limit/i);
});

it('normalizes equivalent style colours and local paint-server references', () => {
  const coloured = prepareSvgIconImport029(svg('<path d="M2 2h4v4z" style="fill:rgb(100%,0%,0%)"/>'));
  expect(coloured.artwork.canonicalText).toContain('#ff0000');
  const gradient = prepareSvgIconImport029(svg('<defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path style="fill:url(#g)" d="M2 2h4v4z"/>'));
  expect(gradient.artwork.canonicalText).toContain('url(#p1)');
});

it('discloses nonvisual removals and refuses external stylesheet instructions', () => {
  const result = prepareSvgIconImport029('<!--made in editor-->' + svg('<title>Title</title><path d="M2 2h4v4z"/>'));
  expect(result.notices.join(' ')).toMatch(/comment/);
  expect(result.notices.join(' ')).toMatch(/title/);
  expect(() => prepareSvgIconImport029('<?xml-stylesheet href="https://example.com/art.css"?>' + svg('<path d="M2 2h4v4z"/>'))).toThrow(/instruction/i);
});
