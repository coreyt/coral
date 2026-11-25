import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029, parseInstalledDocument028 } from '../src/index.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { CALIBRATION_ARTWORKS_029, calibrationDocument029 } from './fixtures/svgArtworkCalibration029.js';

// The calibration corpus sits where calibration-design.md says it does, so the
// benchmarks measure artwork at each tier's limits.

describe('SVG artwork calibration corpus', () => {
  it.each([
    ['typical', 'standard', { bytes: 760, elements: 8, segments: 23 }],
    ['standard', 'standard', { bytes: 53_370, elements: 256, segments: 4_096 }],
    ['detailed', 'detailed', { bytes: 213_422, elements: 1_024, segments: 16_384 }],
  ] as const)('admits the %s artwork as %s with its recorded measures', (name, tier, measures) => {
    const result = admitSvgArtwork029(CALIBRATION_ARTWORKS_029[name]());
    expect(result.ok && result.artwork.tier).toBe(tier);
    expect(result.ok && result.artwork.measures).toEqual(measures);
  });

  it('builds a document with one definition per artwork and the requested instances', () => {
    const artworks = [CALIBRATION_ARTWORKS_029.typical(), CALIBRATION_ARTWORKS_029.typical(1)];
    const text = calibrationDocument029(artworks, 5, 'salt');
    const parsed = parseInstalledDocument028(text);
    expect(parsed.syntax.diagnostics.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(parsed.definitions?.map((definition) => definition.id)).toEqual(['art0', 'art1']);
    expect(parsed.artwork?.size).toBe(2);
    expect(projectInstalledSourceToSuccessor028(text).graph?.nodes.map((node) => node.symbol)).toEqual(
      ['local.art0', 'local.art1', 'local.art0', 'local.art1', 'local.art0']);
  });
});
