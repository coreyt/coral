import { describe, expect, it } from 'vitest';
import { LAYOUT_CORPUS_0211 } from './fixtures/layoutCorpus0211.js';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';
import { evaluatePreparedSceneQuality0211 } from '../src/quality/diagramQuality0211.js';

describe('Slice 20: Canonical 40-diagram Coral layout verification corpus', () => {
  it('meets stratification coverage targets (>= 40 cases, 9 notations, 4 scales, flat + grouped)', () => {
    expect(LAYOUT_CORPUS_0211.length).toBeGreaterThanOrEqual(40);
    const ids = new Set(LAYOUT_CORPUS_0211.map((c) => c.id));
    expect(ids.size).toBe(LAYOUT_CORPUS_0211.length);

    const notations = new Set(LAYOUT_CORPUS_0211.map((c) => c.notation));
    expect(notations.size).toBe(9);

    const scales = new Set(LAYOUT_CORPUS_0211.map((c) => c.scale));
    expect(scales).toEqual(new Set(['small', 'medium', 'large', 'stress']));

    const directions = new Set(LAYOUT_CORPUS_0211.map((c) => c.direction));
    expect(directions).toEqual(new Set(['RIGHT', 'DOWN']));

    const grouped = LAYOUT_CORPUS_0211.filter((c) => c.source.includes(' group as '));
    expect(grouped.length).toBeGreaterThanOrEqual(8);
  });

  it.each(LAYOUT_CORPUS_0211)(
    'renders and scores deterministically: $id ($notation, $direction, $scale)',
    async (entry) => {
      const { scene } = await completeSpatialSource029(entry.source, entry.style, entry.direction);
      expect(scene.status).toBe('complete');
      const orthogonal = !['block', 'sketch'].includes(entry.notation);
      const report = evaluatePreparedSceneQuality0211(scene, {
        id: entry.id,
        direction: entry.direction,
        orthogonal,
      });
      expect(report.tier1.pass, JSON.stringify(report.tier1.findings)).toBe(true);
      expect(report.tier2.intraGroupAlignmentMaxPx).toBeLessThanOrEqual(1);
      expect(report.nodeCount).toBeGreaterThanOrEqual(5);
      expect(report.edgeCount).toBeGreaterThanOrEqual(5);
      expect(report.tier2.compositeScore).toBeGreaterThanOrEqual(0);
      expect(report.tier2.compositeScore).toBeLessThanOrEqual(100);
    },
    15000,
  );
});
