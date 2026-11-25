import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../src/parser/index.js';
import { repairCoralDsl, type SyntaxDefectType } from '../src/repair.js';

/**
 * Tests for `repairCoralDsl` - S49-C5 AC-5.
 *
 * One hand-crafted fixture per grammar-level syntax defect type, under
 * `test/fixtures/repair/`, each containing exactly that one injected defect
 * (dev/designs/coral-defect-corpus.md, Step 5/6). Every case asserts both
 * Safe, diagnostic-backed cases assert a fix and clean reparse. Ambiguous or
 * parser-valid catalog cases assert byte preservation instead: reducing a test
 * corpus's error count is not permission to invent authored meaning.
 */

const DIR = join(import.meta.dirname, 'fixtures', 'repair');

function fixture(name: string): string {
  return readFileSync(join(DIR, `${name}.coral`), 'utf8');
}

function expectFullyRepaired(source: string, defectType: SyntaxDefectType) {
  const before = parse(source);
  expect(before.success).toBe(false);

  const result = repairCoralDsl(source);

  const after = parse(result.fixed);
  expect(after.success).toBe(true);
  expect(after.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  expect(result.unresolved).toEqual([]);
  expect(result.appliedFixes.some((f) => f.defectType === defectType)).toBe(true);

  return result;
}

function expectUnresolvedUnchanged(source: string) {
  expect(parse(source).success).toBe(false);
  const result = repairCoralDsl(source);
  expect(result.fixed).toBe(source);
  expect(result.appliedFixes).toEqual([]);
  expect(result.unresolved.length).toBeGreaterThan(0);
}

describe('repairCoralDsl', () => {
  describe('removed equals attribute spelling (L2, R-063 AC-5)', () => {
    it('rewrites the = at the diagnostic range in an edge attribute', () => {
      const source = fixture('colon-to-equals-attribute');
      const diagnostic = parse(source).errors[0] as { code?: string };
      expect(diagnostic.code).toBe('coral.attribute.equals.unsupported');
      const result = expectFullyRepaired(source, 'colon-to-equals-attribute');
      expect(result.fixed).toBe(source.replace('label = "x"', 'label: "x"'));
      expect(result.appliedFixes).toEqual([{
        defectType: 'colon-to-equals-attribute',
        location: { line: 3, column: source.split('\n')[2].indexOf('=') },
        description: expect.stringContaining('label: "x"'),
      }]);
    });

    it('rewrites the = in a constraint parameter', () => {
      const source = 'service "A" as a\nservice "B" as b\nconstraint c: a above b [gap = 8]';
      const result = expectFullyRepaired(source, 'colon-to-equals-attribute');
      expect(result.fixed).toBe('service "A" as a\nservice "B" as b\nconstraint c: a above b [gap: 8]');
    });

    it('rewrites the = even when the list also has an ordering error, which stays unresolved', () => {
      // Each rewrite is accepted when it strictly lowers the error count. The
      // = and the misplaced line style are separate errors, so the = rewrite
      // lowers the count; repair does not reorder the list.
      const source = 'service "A" as a\nservice "B" as b\na -> b [label = "x", dashed]';
      const result = repairCoralDsl(source);
      expect(result.fixed).toBe('service "A" as a\nservice "B" as b\na -> b [label: "x", dashed]');
      expect(result.appliedFixes.map(({ defectType }) => defectType)).toEqual(['colon-to-equals-attribute']);
      expect(result.unresolved.map(({ code }) => code)).toEqual(['coral.attribute.relation.invalid']);
    });

    it('never rewrites an = inside a quoted value', () => {
      const source = 'service "A" as a\nservice "B" as b\na -> b [label: "x = y"]';
      expect(parse(source).success).toBe(true);
      expect(repairCoralDsl(source).fixed).toBe(source);
    });
  });

  describe('brace-balance defects (real diagnostic position)', () => {
    it('leaves missing-closing-brace unresolved because indentation cannot prove containment', () => {
      expectUnresolvedUnchanged(fixture('missing-closing-brace'));
    });

    it('leaves missing-opening-brace unresolved because the intended parent is ambiguous', () => {
      expectUnresolvedUnchanged(fixture('missing-opening-brace'));
    });

    it.each([
      'service "A" as a {\nservice "B" as b',
      'service "A" as a {\n  service "B" as b',
      'service "A" as a {\n    service "B" as b',
    ])('preserves the adversarial missing-brace source for every indentation variant', (source) => {
      expectUnresolvedUnchanged(source);
    });
  });

  describe('generic line-diagnostic defects (heuristic re-scan)', () => {
    it('leaves missing-closing-quote unresolved rather than absorbing another declaration', () => {
      expectUnresolvedUnchanged(fixture('missing-closing-quote'));
    });

    it('leaves missing-opening-quote unresolved rather than selecting a label boundary', () => {
      expectUnresolvedUnchanged(fixture('missing-opening-quote'));
    });

    it('leaves unbalanced-bracket unresolved rather than selecting an attribute boundary', () => {
      expectUnresolvedUnchanged(fixture('unbalanced-bracket'));
    });

    it('leaves wrong-arrow unresolved rather than choosing relationship meaning', () => {
      expectUnresolvedUnchanged(fixture('wrong-arrow'));
    });

    it('leaves a missing edge target unresolved instead of inventing an entity', () => {
      const source = fixture('missing-edge-target');
      const result = repairCoralDsl(source);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(result.unresolved.length).toBeGreaterThan(0);
      expect(result.fixed).not.toContain('_missing_target');
    });

    it('does not disguise a missing target with an edge id as stray-character repair', () => {
      const source = 'service "A" as a\na ->  as edge_1';
      const result = repairCoralDsl(source);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(result.unresolved.length).toBeGreaterThan(0);
    });

    it('resolves colon-to-equals-node-property', () => {
      const result = expectFullyRepaired(fixture('colon-to-equals-node-property'), 'colon-to-equals-node-property');
      const graph = parse(result.fixed).graph!;
      expect(graph.nodes[0].properties).toEqual({ key: 'value' });
    });

    it('leaves stray-character unresolved rather than deleting an arbitrary identity character', () => {
      expectUnresolvedUnchanged(fixture('stray-character'));
    });

    it('leaves line-break-in-label unresolved rather than joining declarations', () => {
      expectUnresolvedUnchanged(fixture('line-break-in-label'));
    });

    it('leaves unicode-lookalike-quote unresolved rather than rewriting opaque text', () => {
      expectUnresolvedUnchanged(fixture('unicode-lookalike-quote'));
    });

    it('resolves missing-space-after-type', () => {
      const result = expectFullyRepaired(fixture('missing-space-after-type'), 'missing-space-after-type');
      const graph = parse(result.fixed).graph!;
      expect(graph.nodes[0]).toMatchObject({ type: 'service', label: 'API' });
    });
  });

  describe('defects invisible to the parser (no diagnostic; text-normalization pass)', () => {
    it('preserves a missing-comma attribute list byte-for-byte and leaves its unquoted value unresolved', () => {
      const source = fixture('missing-comma');
      // A missing bracket-list comma now leaves an unquoted value, which is
      // an error (R-063 AC-5). Repair does not reinterpret bracket-list bytes.
      const before = parse(source);
      expect(before.success).toBe(false);
      expect(before.errors.map((d) => (d as { code?: string }).code)).toEqual(['coral.attribute.value.unparsed']);
      expect(before.graph!.edges[0].label).not.toBe('reads');

      const result = repairCoralDsl(source);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(result.unresolved.map((d) => d.code)).toEqual(['coral.attribute.value.unparsed']);
    });

    it('preserves a parser-valid trailing-comma attribute list byte-for-byte', () => {
      const source = fixture('trailing-comma');
      const before = parse(source);
      expect(before.success).toBe(true);

      const result = repairCoralDsl(source);
      const after = parse(result.fixed);
      expect(after.success).toBe(true);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(after.graph).toEqual(before.graph);
    });

    it('preserves a parser-valid bare relation instead of reinterpreting it as a label', () => {
      const source = fixture('bare-bracket-attribute');
      const before = parse(source);
      // Ground truth: this is already valid Coral before any repair.
      expect(before.success).toBe(true);
      expect(before.graph!.edges[0].type).toBe('Yes');

      const result = repairCoralDsl(source);
      const after = parse(result.fixed);
      expect(after.success).toBe(true);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(after.graph).toEqual(before.graph);
    });

    it('leaves an invalid unbracketed attribute unresolved instead of guessing its meaning', () => {
      const source = 'service "A" as a\nservice "B" as b\na -> b label: "uses"';
      const result = repairCoralDsl(source);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(result.unresolved.length).toBeGreaterThan(0);
    });
  });

  describe('data{} clause comma defects (real diagnostic, found by independent code review)', () => {
    // Regression test for the exact gap code review found: the real corpus's
    // injector (`inject-syntax-defects.ts`) places missing-comma/trailing-comma
    // defects inside a `data { ... }` JSON clause, not an edge's `[ ]` list —
    // that raises `coral.node.data.unparsed`/`coral.edge.data.unparsed`, which
    // the original two-branch `repairDiagnostic` dispatch didn't handle at all.
    it('resolves a missing comma inside a node data{} clause', () => {
      const source = 'service "Worker" as worker data { "description": "x" "variant": "y" }';
      const before = parse(source);
      expect(before.success).toBe(false);
      expect(before.diagnostics.some((d) => d.code === 'coral.node.data.unparsed')).toBe(true);

      const result = repairCoralDsl(source);
      const after = parse(result.fixed);
      expect(after.success).toBe(true);
      expect(after.graph!.nodes[0]).toMatchObject({ description: 'x', variant: 'y' });
      expect(result.appliedFixes.some((f) => f.defectType === 'missing-comma')).toBe(true);
      expect(result.unresolved).toEqual([]);
    });

    it('resolves a trailing comma inside an edge data{} clause', () => {
      const source =
        'service "A"\nservice "B"\n\na -> b data { "style": { "routing": "orthogonal" }, }';
      const before = parse(source);
      expect(before.success).toBe(false);
      expect(before.diagnostics.some((d) => d.code === 'coral.edge.data.unparsed')).toBe(true);

      const result = repairCoralDsl(source);
      const after = parse(result.fixed);
      expect(after.success).toBe(true);
      expect(result.appliedFixes.some((f) => f.defectType === 'trailing-comma')).toBe(true);
      expect(result.unresolved).toEqual([]);
    });

    it.each([
      'service "data { \\"a\\": 1 \\"b\\": 2 }" as label',
      '// service"Worker" data { "a": 1 "b": 2 }',
      'service "Worker" as worker data { "description": "service\\\"Worker\\\"", "layoutOptions": { "padding": { "top": 1, "left": 2 } } }',
    ])('does not apply allowlisted punctuation inside valid labels, comments, or nested data: %s', (source) => {
      expect(parse(source).success).toBe(true);
      const result = repairCoralDsl(source);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
    });
  });

  describe('general behaviour', () => {
    it.each([
      'custom_widget "Custom" as custom',
      'service "API \\"quoted\\"" as api @ (10, 20)',
      'service "A" as a\nservice "B" as b\na -> b [label: "uses"]',
      'service "A => B" as arrow_label',
    ])('preserves valid source bytes and geometry: %s', (source) => {
      expect(parse(source).success).toBe(true);
      const repaired = repairCoralDsl(source);
      expect(repaired.fixed).toBe(source);
      expect(repaired.appliedFixes).toEqual([]);
      expect(parse(repaired.fixed).graph).toEqual(parse(source).graph);
    });

    it('preserves a valid custom relation byte-for-byte', () => {
      const source = 'service "A" as a\nservice "B" as b\na -> b [custom_relation]';
      expect(parse(source).success).toBe(true);
      expect(parse(source).graph!.edges[0].type).toBe('custom_relation');
      const repaired = repairCoralDsl(source);
      expect(repaired.fixed).toBe(source);
      expect(repaired.appliedFixes).toEqual([]);
    });

    it('preserves a missing target and its diagnostic instead of inventing one', () => {
      const source = fixture('missing-edge-target');
      const repaired = repairCoralDsl(source);
      expect(repaired.fixed).toBe(source);
      expect(repaired.unresolved.length).toBeGreaterThan(0);
      expect(repaired.fixed).not.toContain('_missing_target');
    });
    it('leaves an already-valid document untouched', () => {
      const source = 'service "API"\ndatabase "DB"\n\napi -> db [label: "reads"]';
      const result = repairCoralDsl(source);
      expect(result.fixed).toBe(source);
      expect(result.appliedFixes).toEqual([]);
      expect(result.unresolved).toEqual([]);
    });

    it('reports an unfamiliar failure in unresolved rather than fabricating a fix', () => {
      // Not a member of the fifteen-type catalog: a completely garbled line
      // with no resemblance to any node/edge shape and nothing to delete or
      // rearrange that would make it one.
      const source = '!!! not coral at all !!! %%% ??? ### @@@ &&&';
      const result = repairCoralDsl(source);
      expect(result.appliedFixes).toEqual([]);
      expect(result.unresolved.length).toBeGreaterThan(0);
    });
  });
});

describe('repair output never uses a removed spelling (R-063 AC-5)', () => {
  const REMOVED = [/\[[^\]"]*\b[A-Za-z_]\w*\s*=/, /"(?:source|target)Arrow"\s*:/, /^\s*_\w+\s*:|\[[^\]]*\b_\w+\s*:/m];
  const sources = [
    ...['colon-to-equals-attribute', 'colon-to-equals-node-property', 'missing-comma', 'trailing-comma',
      'missing-space-after-type', 'bare-bracket-attribute'].map(fixture),
    'service "A" as a\nservice "B" as b\nconstraint c: a above b [gap = 8, alignment = start]',
  ];
  it.each(sources)('repairs without a removed spelling: %s', (source) => {
    const { fixed } = repairCoralDsl(source);
    for (const pattern of REMOVED) expect(fixed).not.toMatch(pattern);
  });
});

