/**
 * TDD coverage for the vocabulary-level defect injector (Slice 49,
 * R-049.5 AC-4's remaining two catalog types). Every accepted candidate is
 * verified against the real `repairKnownNodeTypeTypos`, so these tests
 * exercise the actual repair function, not a hand-modeled prediction of it.
 */

import { describe, it, expect } from 'vitest';
import { repairKnownNodeTypeTypos } from '../../src/parsers';
import {
  ALL_VOCABULARY_DEFECT_TYPES,
  availableVocabularyDefectTypes,
  injectVocabularyDefect,
  selectAndInjectVocabularyDefect,
} from './inject-vocabulary-defects';

const SAMPLE_DSL = 'service "API Gateway" as gw\ndatabase "Orders DB" as db\ngw -> db\n';

describe('availableVocabularyDefectTypes', () => {
  it('finds both catalog types available for a DSL with real known node types', () => {
    const available = availableVocabularyDefectTypes(SAMPLE_DSL);
    expect(available).toEqual(expect.arrayContaining(ALL_VOCABULARY_DEFECT_TYPES));
  });

  it('returns an empty array for a DSL with no node declarations', () => {
    expect(availableVocabularyDefectTypes('gw -> db\n')).toEqual([]);
  });
});

describe('injectVocabularyDefect', () => {
  for (const defectType of ALL_VOCABULARY_DEFECT_TYPES) {
    it(`injects a "${defectType}" defect that repairKnownNodeTypeTypos resolves back to the original type`, () => {
      const rng = (() => {
        let i = 0;
        const seq = [0.1, 0.4, 0.7, 0.2];
        return () => seq[i++ % seq.length];
      })();

      const result = injectVocabularyDefect('sample.coral', SAMPLE_DSL, defectType, rng);

      expect(result.injectedDefects).toHaveLength(1);
      expect(result.injectedDefects[0].defectType).toBe(defectType);
      expect(result.outputText).not.toBe(SAMPLE_DSL);
      expect(result.outputFilename).toBe(`sample-${defectType}.coral`);

      // The injected DSL must actually fail KNOWN_NODE_TYPES validation...
      const declaredTypes = result.outputText.match(/^(\w[\w-]*)\s+"/gm)?.map((m) => m.trim().split(/\s+/)[0]) ?? [];
      expect(declaredTypes.some((t) => t !== 'service' && t !== 'database')).toBe(true);

      // ...and repairKnownNodeTypeTypos must resolve it completely.
      const repaired = repairKnownNodeTypeTypos(result.outputText);
      expect(repaired.unresolved).toEqual([]);
      expect(repaired.fixed).toBe(SAMPLE_DSL);
    });
  }

  it('throws when the requested defect type has no verified injection site', () => {
    expect(() => injectVocabularyDefect('empty.coral', 'gw -> db\n', 'misspelled-keyword', () => 0)).toThrow(
      /No verified injection site/,
    );
  });
});

describe('selectAndInjectVocabularyDefect', () => {
  it('is deterministic: the same seed produces byte-identical output', () => {
    const first = selectAndInjectVocabularyDefect('sample.coral', SAMPLE_DSL, 42);
    const second = selectAndInjectVocabularyDefect('sample.coral', SAMPLE_DSL, 42);
    expect(second).toEqual(first);
  });

  it('produces output that repairKnownNodeTypeTypos fully resolves, whichever type is selected', () => {
    const result = selectAndInjectVocabularyDefect('sample.coral', SAMPLE_DSL, 7);
    expect(result).not.toBeNull();
    const repaired = repairKnownNodeTypeTypos(result!.outputText);
    expect(repaired.unresolved).toEqual([]);
    expect(repaired.fixed).toBe(SAMPLE_DSL);
  });

  it('returns null when neither catalog type has a verified injection site', () => {
    expect(selectAndInjectVocabularyDefect('empty.coral', 'gw -> db\n', 1)).toBeNull();
  });
});
