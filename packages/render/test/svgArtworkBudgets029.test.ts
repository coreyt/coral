import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029, SVG_ARTWORK_BUDGETS_029, type SvgArtworkAdmission029 } from '../src/index.js';

// Budget edges beyond the shared vectors: measures, charging and tier
// selection of coral.svg-artwork 1 (profile §11).

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
const svg = (body: string) => `${OPEN}${body}</svg>`;
const admitted = (result: SvgArtworkAdmission029) => {
  if (!result.ok) throw new Error(JSON.stringify(result.failures.slice(0, 3)));
  return result.artwork;
};

describe('coral.svg-artwork 1 budget measures', () => {
  it('counts segments of each primitive as its SVG 2 equivalent path', () => {
    const measure = (body: string) => admitted(admitSvgArtwork029(svg(body))).measures.segments;
    expect(measure('<rect width="1" height="1"/>')).toBe(5);
    expect(measure('<rect width="1" height="1" ry="0.5"/>')).toBe(10);
    expect(measure('<circle r="1"/><ellipse rx="1" ry="2"/>')).toBe(12);
    expect(measure('<line x2="1"/>')).toBe(2);
    expect(measure('<polyline points="0 0 1 1 2 0"/>')).toBe(3);
    expect(measure('<polygon points="0 0 1 1 2 0"/>')).toBe(4);
    expect(measure('<path d="M0 0 1 1 2 2zM3 3"/>')).toBe(5);
  });

  it('charges a gradient named by both fill and stroke twice, and a clip path per reference with its segments', () => {
    const gradient = admitted(admitSvgArtwork029(svg('<linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient>' +
      '<path d="M0 0H1" fill="url(#g)" stroke="url(#g)"/>')));
    expect(gradient.measures.elements).toBe(1 + 1 + 2 * 3);
    expect(gradient.model.paintServers).toHaveLength(1);
    const clip = admitted(admitSvgArtwork029(svg('<clipPath id="k"><rect width="1" height="1"/><circle r="1"/></clipPath>' +
      '<g clip-path="url(#k)"><path d="M0 0H1" clip-path="url(#k)"/></g>')));
    expect(clip.measures.elements).toBe(1 + 2 + 2 * 3);
    expect(clip.measures.segments).toBe(2 + 2 * (5 + 6));
  });

  it('does not charge unreferenced paint servers, clip paths or templates', () => {
    const artwork = admitted(admitSvgArtwork029(svg('<linearGradient id="t"><stop offset="0"/></linearGradient>' +
      '<linearGradient id="g" href="#t"/><clipPath id="k"><rect width="1" height="1"/></clipPath><path d="M0 0H1" fill="url(#g)"/>')));
    expect(artwork.measures.elements).toBe(1 + 1 + 2);
    expect(artwork.measures.segments).toBe(2);
    expect(artwork.discarded.map((item) => item.kind)).toEqual(expect.arrayContaining(['gradient-template', 'unreferenced-clip-path']));
  });

  it('is Detailed when any one measure exceeds its Standard limit', () => {
    const many = admitted(admitSvgArtwork029(svg('<g/>'.repeat(SVG_ARTWORK_BUDGETS_029.elements.standard))));
    expect(many.measures.elements).toBe(257);
    expect(many.measures.segments).toBe(0);
    expect(many.tier).toBe('detailed');
  });

  it('lists every exceeded Detailed budget in one P7 failure, in profile order, with measures', () => {
    const result = admitSvgArtwork029(svg(`<path d="M0 0${' H1.0625'.repeat(30_000)}"/>${'<g/>'.repeat(1_100)}`));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toHaveLength(1);
    const [failure] = result.failures;
    expect(failure).toMatchObject({ code: 'coral.artwork.svg.budget.exceeded', phase: 'P7', start: 0 });
    expect(failure!.budgets!.map((budget) => budget.name)).toEqual(['bytes', 'elements', 'segments']);
    expect(failure!.budgets![1]).toEqual({ name: 'elements', measure: 1 + 1 + 1_100, limit: 1_024 });
    expect(failure!.budgets![2]).toEqual({ name: 'segments', measure: 30_001, limit: 16_384 });
  });

  it('refuses polylines and polygons with very long point lists by budget, without exhausting the stack', () => {
    for (const [element, points, segments] of [['polyline', 100_000, 100_000], ['polygon', 80_000, 80_001]] as const) {
      const result = admitSvgArtwork029(svg(`<${element} points="${'1 1 '.repeat(points)}"/>`));
      expect(result.ok, element).toBe(false);
      if (result.ok) continue;
      expect(result.failures, element).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ code: 'coral.artwork.svg.budget.exceeded', phase: 'P7' });
      expect(result.failures[0]!.budgets!.find((budget) => budget.name === 'segments')?.measure, element).toBe(segments);
    }
  });
});

