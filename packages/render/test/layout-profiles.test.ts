import { describe, expect, it } from 'vitest';
import { notationRegistry } from '../src/index.js';

describe('notation layout profiles', () => {
  it('registers one conservative closed profile for every installed notation', () => {
    const notations = notationRegistry.getAll();
    expect(notations.map((notation) => notation.id)).toEqual([
      'block', 'flowchart', 'bpmn', 'erd', 'code', 'architecture', 'infrastructure', 'aiml', 'data-engineering', 'sketch', 'uml-class', 'uml-sequence', 'uml-state',
    ]);
    // R-039 leaves sequence layout to R-060's specialized layout: no ELK profile.
    expect(notationRegistry.get('uml-sequence')?.layoutProfile).toBeUndefined();
    for (const notation of notations.filter((candidate) => candidate.id !== 'uml-sequence')) {
      expect(notation.layoutProfile).toEqual(expect.objectContaining({
        algorithm: 'layered',
        direction: expect.stringMatching(/^(UP|DOWN|LEFT|RIGHT)$/),
        spacing: expect.objectContaining({
          nodeNode: expect.any(Number), edgeNode: expect.any(Number), layerSpacing: expect.any(Number),
        }),
        edgeRouting: expect.stringMatching(/^(ORTHOGONAL|POLYLINE|SPLINES)$/),
      }));
      expect(Object.keys(notation.layoutProfile?.elkOptions ?? {}).every((key) => [
        'elk.layered.considerModelOrder.strategy',
        'elk.layered.crossingMinimization.forceNodeModelOrder',
      ].includes(key))).toBe(true);
    }
  });
});
