/**
 * Tests for the syntax defect injector (Slice 49, R-049.5 AC-4).
 *
 * Per `dev/designs/coral-defect-corpus.md` Step 5 and
 * `dev/releases/0.2.5/slice-49/draft-plan.md`, every one of the fifteen
 * grammar-level defect types must be verified, via `@coral-viz/language`'s
 * real `parse()`, to actually make the mutated DSL fail to parse — not merely
 * to "look different." That check is the load-bearing part of this suite; an
 * earlier design review round caught two originally-proposed defect types
 * that looked plausible but did not actually break the real grammar.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@coral-viz/language/parser';
import {
  ALL_SYNTAX_DEFECT_TYPES,
  availableDefectTypes,
  injectSyntaxDefect,
  selectAndInjectDefect,
  type SyntaxDefectType,
} from './inject-syntax-defects';

// ============================================================================
// Fixtures
// ============================================================================

/**
 * A small, deliberately feature-complete Coral diagram: a node with a `{ }`
 * property block (string + boolean properties), a node with a `data { }`
 * JSON clause with two keys, a multi-attribute edge bracket list, an edge
 * using `=` instead of `:` for its attribute (valid — see the
 * colon-to-equals-node-property scoping note), and a plain bracket-less edge.
 * Between them, every one of the 15 catalog types has a valid injection site.
 */
const BASE_DSL = `service "API Gateway" as gateway {
  description: "Front door"
  critical: true
}
database "Postgres" as db
queue "Message Queue" as mq
service "Worker" as worker data { "description": "Background worker", "variant": "async" }

gateway -> db [label: "reads", type: "sync", critical: true]
gateway -> mq [label: "publishes"]
mq -> worker`;

/** No brace blocks, no data clauses, no bracket attributes, no multi-word-free labels. */
const MINIMAL_DSL = `service "Login" as login
service "Dashboard" as dashboard

login -> dashboard`;

const zeroRng = () => 0;

function lines(dsl: string): string[] {
  return dsl.split('\n');
}

function line(dsl: string, n: number): string {
  return lines(dsl)[n - 1];
}

/** Independent re-implementation of the offset math, to avoid grading the SUT against itself. */
function expectedOffset(dsl: string, lineNumber: number, column: number): number {
  const ls = lines(dsl);
  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i++) offset += ls[i].length + 1;
  return offset + column;
}

function closingQuoteIndex(text: string): number {
  return text.indexOf('"', text.indexOf('"') + 1);
}

function expectParseFails(dsl: string): void {
  const result = parse(dsl);
  expect(result.success).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
}

// ============================================================================
// Sanity: the fixtures themselves are known-good
// ============================================================================

describe('fixtures', () => {
  it('BASE_DSL parses cleanly with zero errors', () => {
    const result = parse(BASE_DSL);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('MINIMAL_DSL parses cleanly with zero errors', () => {
    const result = parse(MINIMAL_DSL);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ============================================================================
// availableDefectTypes
// ============================================================================

describe('availableDefectTypes', () => {
  it('reports all 15 catalog types available on the feature-complete fixture', () => {
    expect(availableDefectTypes(BASE_DSL)).toEqual(ALL_SYNTAX_DEFECT_TYPES);
  });

  it('excludes types with no valid site on a minimal fixture', () => {
    expect(availableDefectTypes(MINIMAL_DSL)).toEqual([
      'missing-closing-quote',
      'missing-opening-quote',
      'wrong-arrow',
      'missing-edge-target',
      'stray-character',
      'unicode-lookalike-quote',
      'missing-space-after-type',
    ]);
  });

  it('excludes colon-to-equals-node-property when there is no property block', () => {
    expect(availableDefectTypes(MINIMAL_DSL)).not.toContain('colon-to-equals-node-property');
  });

  it('excludes missing-comma/trailing-comma when there is no data{} clause', () => {
    const available = availableDefectTypes(MINIMAL_DSL);
    expect(available).not.toContain('missing-comma');
    expect(available).not.toContain('trailing-comma');
  });

  it('excludes brace types when there is no node body', () => {
    const available = availableDefectTypes(MINIMAL_DSL);
    expect(available).not.toContain('missing-closing-brace');
    expect(available).not.toContain('missing-opening-brace');
  });

  it('excludes bracket types when no edge has a bracket attribute list', () => {
    const available = availableDefectTypes(MINIMAL_DSL);
    expect(available).not.toContain('unbalanced-bracket');
    expect(available).not.toContain('bare-bracket-attribute');
  });

  it('excludes line-break-in-label when no label contains a space', () => {
    expect(availableDefectTypes(MINIMAL_DSL)).not.toContain('line-break-in-label');
  });

  it('returns an empty array for a DSL with no nodes or edges', () => {
    expect(availableDefectTypes('// just a comment\n')).toEqual([]);
  });
});

// ============================================================================
// injectSyntaxDefect — one describe block per catalog type
// ============================================================================

describe('injectSyntaxDefect', () => {
  it('throws when the defect type has no valid injection site', () => {
    expect(() => injectSyntaxDefect('minimal.coral', MINIMAL_DSL, 'missing-comma', zeroRng)).toThrow();
  });

  describe('missing-closing-quote', () => {
    it('removes the closing quote of the first node label and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const quoteEnd = closingQuoteIndex(l1);
      const expectedLine1 = l1.slice(0, quoteEnd) + l1.slice(quoteEnd + 1);

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-closing-quote', zeroRng);

      expect(result.originalFilename).toBe('sample.coral');
      expect(result.originalDsl).toBe(BASE_DSL);
      expect(result.outputFilename).toBe('sample-missing-closing-quote.coral');
      expect(line(result.outputText, 1)).toBe(expectedLine1);
      expect(result.outputText).not.toBe(BASE_DSL);
      expect(result.injectedDefects).toHaveLength(1);
      expect(result.injectedDefects[0]).toEqual({
        defectType: 'missing-closing-quote',
        location: { line: 1, column: quoteEnd, charOffset: expectedOffset(BASE_DSL, 1, quoteEnd) },
        description: 'removed closing quote on label "API Gateway"',
      });
      expectParseFails(result.outputText);
    });
  });

  describe('missing-opening-quote', () => {
    it('removes the opening quote of the first node label and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const quoteStart = l1.indexOf('"');
      const expectedLine1 = l1.slice(0, quoteStart) + l1.slice(quoteStart + 1);

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-opening-quote', zeroRng);

      expect(line(result.outputText, 1)).toBe(expectedLine1);
      expect(result.injectedDefects[0].location).toEqual({
        line: 1,
        column: quoteStart,
        charOffset: expectedOffset(BASE_DSL, 1, quoteStart),
      });
      expect(result.injectedDefects[0].description).toBe('removed opening quote on label "API Gateway"');
      expectParseFails(result.outputText);
    });
  });

  describe('missing-closing-brace', () => {
    it('deletes the line closing the first node body and fails to parse', () => {
      const expectedLines = lines(BASE_DSL);
      expectedLines.splice(3, 1); // line 4, the lone "}"
      const expectedOutput = expectedLines.join('\n');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-closing-brace', zeroRng);

      expect(result.outputText).toBe(expectedOutput);
      expect(result.injectedDefects[0].location).toEqual({
        line: 4,
        column: 0,
        charOffset: expectedOffset(BASE_DSL, 4, 0),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('missing-opening-brace', () => {
    it('strips the trailing "{" from the node body opener and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const braceColumn = l1.lastIndexOf('{');
      const expectedLine1 = l1.slice(0, braceColumn).trimEnd();

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-opening-brace', zeroRng);

      expect(line(result.outputText, 1)).toBe(expectedLine1);
      expect(result.injectedDefects[0].location).toEqual({
        line: 1,
        column: braceColumn,
        charOffset: expectedOffset(BASE_DSL, 1, braceColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('unbalanced-bracket', () => {
    it('removes the closing "]" of the first bracketed edge attribute list and fails to parse', () => {
      const l9 = line(BASE_DSL, 9);
      expect(l9.endsWith(']')).toBe(true);
      const expectedLine9 = l9.slice(0, -1);

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'unbalanced-bracket', zeroRng);

      expect(line(result.outputText, 9)).toBe(expectedLine9);
      expect(result.injectedDefects[0].location).toEqual({
        line: 9,
        column: l9.length - 1,
        charOffset: expectedOffset(BASE_DSL, 9, l9.length - 1),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('wrong-arrow', () => {
    it('mutates "->" into "-->" on the first edge and fails to parse', () => {
      const l9 = line(BASE_DSL, 9);
      const arrowColumn = l9.indexOf('->');
      const expectedLine9 = l9.replace('->', '-->');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'wrong-arrow', zeroRng);

      expect(line(result.outputText, 9)).toBe(expectedLine9);
      expect(result.injectedDefects[0].location).toEqual({
        line: 9,
        column: arrowColumn,
        charOffset: expectedOffset(BASE_DSL, 9, arrowColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('missing-edge-target', () => {
    it('removes the target token of the first edge and fails to parse', () => {
      const l9 = line(BASE_DSL, 9);
      const targetColumn = l9.indexOf('db');
      const expectedLine9 = l9.replace('gateway -> db', 'gateway -> ');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-edge-target', zeroRng);

      expect(line(result.outputText, 9)).toBe(expectedLine9);
      expect(result.injectedDefects[0].location).toEqual({
        line: 9,
        column: targetColumn,
        charOffset: expectedOffset(BASE_DSL, 9, targetColumn),
      });
      expect(result.injectedDefects[0].description).toBe('removed edge target "db" from "gateway -> db"');
      expectParseFails(result.outputText);
    });
  });

  describe('missing-comma', () => {
    it('removes the top-level comma inside the data{} clause and fails to parse', () => {
      const l7 = line(BASE_DSL, 7);
      const commaColumn = l7.indexOf(',');
      const expectedLine7 = l7.replace('"Background worker", "variant"', '"Background worker" "variant"');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-comma', zeroRng);

      expect(line(result.outputText, 7)).toBe(expectedLine7);
      expect(result.injectedDefects[0].location).toEqual({
        line: 7,
        column: commaColumn,
        charOffset: expectedOffset(BASE_DSL, 7, commaColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('trailing-comma', () => {
    it('inserts a trailing comma before the data{} closing brace and fails to parse', () => {
      const l7 = line(BASE_DSL, 7);
      const braceColumn = l7.lastIndexOf('}');
      const expectedLine7 = l7.replace('"async" }', '"async" ,}');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'trailing-comma', zeroRng);

      expect(line(result.outputText, 7)).toBe(expectedLine7);
      expect(result.injectedDefects[0].location).toEqual({
        line: 7,
        column: braceColumn,
        charOffset: expectedOffset(BASE_DSL, 7, braceColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('bare-bracket-attribute', () => {
    it('strips the brackets around the first edge attribute list, leaving it bare, and fails to parse', () => {
      const l9 = line(BASE_DSL, 9);
      const bracketColumn = l9.indexOf('[');
      const expectedLine9 = l9.replace('[', '').replace(']', '');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'bare-bracket-attribute', zeroRng);

      expect(line(result.outputText, 9)).toBe(expectedLine9);
      expect(result.injectedDefects[0].location).toEqual({
        line: 9,
        column: bracketColumn,
        charOffset: expectedOffset(BASE_DSL, 9, bracketColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('colon-to-equals-node-property', () => {
    it('changes ":" to "=" on the first node property and fails to parse', () => {
      const l2 = line(BASE_DSL, 2);
      const colonColumn = l2.indexOf(':');
      const expectedLine2 = l2.replace(':', '=');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'colon-to-equals-node-property', zeroRng);

      expect(line(result.outputText, 2)).toBe(expectedLine2);
      expect(result.injectedDefects[0].location).toEqual({
        line: 2,
        column: colonColumn,
        charOffset: expectedOffset(BASE_DSL, 2, colonColumn),
      });
      expectParseFails(result.outputText);
    });

    it('never targets an edge bracket attribute list (the injector owns node-property colons only)', () => {
      // A DSL with a property block and a colon edge attribute must still only
      // ever mutate the property line.
      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'colon-to-equals-node-property', zeroRng);
      // The edge attribute colon (line 10) must remain untouched.
      expect(line(result.outputText, 10)).toBe(line(BASE_DSL, 10));
    });
  });

  describe('stray-character', () => {
    it('inserts a stray "~" right after the first node type keyword and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const insertColumn = 'service'.length;
      const expectedLine1 = l1.replace('service ', 'service~ ');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'stray-character', zeroRng);

      expect(line(result.outputText, 1)).toBe(expectedLine1);
      expect(result.injectedDefects[0].location).toEqual({
        line: 1,
        column: insertColumn,
        charOffset: expectedOffset(BASE_DSL, 1, insertColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('line-break-in-label', () => {
    it('splits the first multi-word label across a literal line break and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const spaceColumn = l1.indexOf('API Gateway') + 'API'.length;
      const expectedBefore = l1.slice(0, spaceColumn);
      const expectedAfter = l1.slice(spaceColumn + 1);
      const expectedLines = lines(BASE_DSL);
      expectedLines.splice(0, 1, expectedBefore, expectedAfter);

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'line-break-in-label', zeroRng);

      expect(result.outputText).toBe(expectedLines.join('\n'));
      expect(result.injectedDefects[0].location).toEqual({
        line: 1,
        column: spaceColumn,
        charOffset: expectedOffset(BASE_DSL, 1, spaceColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('unicode-lookalike-quote', () => {
    it('replaces the closing quote of the first node label with a Unicode look-alike and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const quoteEnd = closingQuoteIndex(l1);
      const expectedLine1 = l1.slice(0, quoteEnd) + '”' + l1.slice(quoteEnd + 1);

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'unicode-lookalike-quote', zeroRng);

      expect(line(result.outputText, 1)).toBe(expectedLine1);
      expect(result.outputText).toContain('”');
      expect(result.injectedDefects[0].location).toEqual({
        line: 1,
        column: quoteEnd,
        charOffset: expectedOffset(BASE_DSL, 1, quoteEnd),
      });
      expectParseFails(result.outputText);
    });
  });

  describe('missing-space-after-type', () => {
    it('removes the whitespace between the node type and its label and fails to parse', () => {
      const l1 = line(BASE_DSL, 1);
      const wsColumn = 'service'.length;
      const expectedLine1 = l1.replace('service ', 'service');

      const result = injectSyntaxDefect('sample.coral', BASE_DSL, 'missing-space-after-type', zeroRng);

      expect(line(result.outputText, 1)).toBe(expectedLine1);
      expect(result.injectedDefects[0].location).toEqual({
        line: 1,
        column: wsColumn,
        charOffset: expectedOffset(BASE_DSL, 1, wsColumn),
      });
      expectParseFails(result.outputText);
    });
  });

  it('every catalog type actually produces unparseable output on the feature-complete fixture', () => {
    for (const defectType of ALL_SYNTAX_DEFECT_TYPES) {
      const result = injectSyntaxDefect('sample.coral', BASE_DSL, defectType, zeroRng);
      const parsed = parse(result.outputText);
      expect(parsed.success, `expected ${defectType} to break parsing`).toBe(false);
    }
  });
});

// ============================================================================
// selectAndInjectDefect
// ============================================================================

describe('selectAndInjectDefect', () => {
  it('is deterministic: the same seed on the same input produces byte-identical output', () => {
    const first = selectAndInjectDefect('sample.coral', BASE_DSL, 12345);
    const second = selectAndInjectDefect('sample.coral', BASE_DSL, 12345);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(second?.outputText).toBe(first?.outputText);
  });

  it('produces output that genuinely fails to parse, whatever type is selected', () => {
    for (const seed of [0, 1, 2, 7, 42, 1000, 999999]) {
      const result = selectAndInjectDefect('sample.coral', BASE_DSL, seed);
      expect(result).not.toBeNull();
      if (!result) continue;
      expect(availableDefectTypes(BASE_DSL)).toContain(result.injectedDefects[0].defectType);
      const parsed = parse(result.outputText);
      expect(parsed.success, `seed ${seed} selected ${result.injectedDefects[0].defectType}`).toBe(false);
    }
  });

  it('only ever selects from the types actually available on a constrained fixture', () => {
    const available = new Set<SyntaxDefectType>(availableDefectTypes(MINIMAL_DSL));
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const result = selectAndInjectDefect('minimal.coral', MINIMAL_DSL, seed);
      expect(result).not.toBeNull();
      if (!result) continue;
      expect(available.has(result.injectedDefects[0].defectType)).toBe(true);
    }
  });

  it('returns null when no catalog type has a valid injection site', () => {
    expect(selectAndInjectDefect('empty.coral', '// just a comment\n', 1)).toBeNull();
    expect(selectAndInjectDefect('empty.coral', '', 1)).toBeNull();
  });

  it('different seeds can select different defect types', () => {
    const selected = new Set<SyntaxDefectType>();
    for (let seed = 0; seed < 30; seed++) {
      const result = selectAndInjectDefect('sample.coral', BASE_DSL, seed);
      if (result) selected.add(result.injectedDefects[0].defectType);
    }
    expect(selected.size).toBeGreaterThan(1);
  });
});
