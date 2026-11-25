import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029 } from '../src/index.js';

const svg = (path: string, transform = '') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  `<g${transform ? ` transform="${transform}"` : ''}><path d="${path}" stroke-width="0"/></g></svg>`;

describe('minor-arc admission resource guard', () => {
  it.each([
    ['short circular arc', 'M12 12 A100000 100000 0 0 1 13 12', ''],
    ['opposite sweep', 'M12 12 A100000 100000 0 0 0 13 12', ''],
    ['rotated near-circle', 'M12 12 A100000 99900 63 0 1 13 12', ''],
    ['relative endpoint', 'M12 12 a100000 100000 0 0 1 1 0', ''],
    ['nonuniform transform', 'M0 0 A100000 100000 0 0 1 1 0', 'scale(2 3)'],
    ['previously refused conformance case', 'M0 0 A97 1 0 0 1 1 0', 'scale(2)'],
    ['coincident endpoints', 'M12 12 A100000 1 0 0 1 12 12', ''],
    ['coincident endpoints with subnormal radius', 'M12 12 A1000000000 5e-324 0 0 1 12 12', ''],
    ['SVG radius correction', 'M0 0 A0.1 0.1 0 0 1 24 0', ''],
  ])('admits %s and its canonical round trip', (_name, path, transform) => {
    const result = admitSvgArtwork029(svg(path, transform));
    expect(result.ok, JSON.stringify(result.ok ? null : result.failures)).toBe(true);
    if (!result.ok) return;
    const again = admitSvgArtwork029(result.artwork.canonicalText);
    expect(again.ok && again.artwork.canonicalText).toBe(result.artwork.canonicalText);
  });

  it.each([
    ['eccentric painted extent', 'M12 11 A100000 1 0 0 1 12 13', ''],
    ['opposite eccentric sweep', 'M12 11 A100000 1 0 0 0 12 13', ''],
    ['large arc', 'M12 12 A100000 100000 0 1 1 13 12', ''],
    ['zero-radius existing policy', 'M12 12 A100000 0 0 0 1 13 12', ''],
    ['scale amplifies chord bound', 'M0 0 A100000 100000 0 0 1 1 0', 'translate(-190 12) scale(400)'],
  ])('preserves refusal for %s', (_name, path, transform) => {
    const result = admitSvgArtwork029(svg(path, transform));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]?.code).toBe('coral.artwork.svg.geometry.invalid');
      expect(result.failures[0]?.detail).toBe('<path> arc radius exceeds the effective bounds');
    }
  });

  it('admits all 3,732 pinned real icons and their canonical forms', () => {
    const corpus: { width: number; height: number;
      icons: Record<string, { body: string; width?: number; height?: number }> } = JSON.parse(
      readFileSync(createRequire(import.meta.url).resolve('@iconify-json/simple-icons/icons.json'), 'utf8'));
    expect(Object.keys(corpus.icons)).toHaveLength(3732);
    const failures: string[] = [];
    for (const [name, icon] of Object.entries(corpus.icons)) {
      const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? corpus.width} ` +
        `${icon.height ?? corpus.height}" color="#000000">${icon.body}</svg>`;
      const result = admitSvgArtwork029(text);
      if (!result.ok) { failures.push(name); continue; }
      const again = admitSvgArtwork029(result.artwork.canonicalText);
      if (!again.ok || again.artwork.canonicalText !== result.artwork.canonicalText) failures.push(`${name}: round trip`);
    }
    expect(failures).toEqual([]);
  });
});
