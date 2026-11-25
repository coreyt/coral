/**
 * Validation Tests
 *
 * Tests for DSL extraction, validation, drift detection, and error formatting.
 * Requirement: Issue #46 (LLM-powered diagram generation)
 */

import { describe, it, expect } from 'vitest';
import {
  extractDslFromResponse,
  validateOutput,
  checkStructuralDrift,
  formatErrorsForRetry,
} from '../../src/llm/validate';

// ============================================================================
// extractDslFromResponse
// ============================================================================

describe('extractDslFromResponse', () => {
  it('returns raw DSL when no code fences', () => {
    const dsl = 'service "A"\nservice "B"\na -> b';
    expect(extractDslFromResponse(dsl)).toBe(dsl);
  });

  it('strips markdown code fences', () => {
    const raw = '```\nservice "A"\nservice "B"\n```';
    expect(extractDslFromResponse(raw)).toBe('service "A"\nservice "B"');
  });

  it('strips language-tagged code fences', () => {
    const raw = '```coral\nservice "A"\n```';
    expect(extractDslFromResponse(raw)).toBe('service "A"');
  });

  it('strips leading/trailing whitespace', () => {
    const raw = '  \n\nservice "A"\n\n  ';
    expect(extractDslFromResponse(raw)).toBe('service "A"');
  });

  it('handles backtick-coral fence', () => {
    const raw = '```coral\nservice "Test"\na -> b\n```';
    expect(extractDslFromResponse(raw)).toBe('service "Test"\na -> b');
  });

  it('handles empty input', () => {
    expect(extractDslFromResponse('')).toBe('');
  });

  it('handles multiple code blocks (takes first)', () => {
    const raw = '```\nservice "A"\n```\n\nSome text\n\n```\nservice "B"\n```';
    expect(extractDslFromResponse(raw)).toBe('service "A"');
  });

  it('strips prose before and after DSL when code fenced', () => {
    const raw = 'Here is the diagram:\n```\nservice "A"\n```\nHope that helps!';
    expect(extractDslFromResponse(raw)).toBe('service "A"');
  });
});

// ============================================================================
// Coral validation through the format-aware owner
// ============================================================================

describe('validateOutput for Coral', () => {
  const validateCoral = (dsl: string) => validateOutput(dsl, 'coral');

  it('accepts valid DSL', () => {
    const result = validateCoral('@diagram architecture\na service as "A"\nb service as "B"\na -> b');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.nodeCount).toBe(2);
  });

  it('accepts DSL with comments', () => {
    const result = validateCoral('@diagram architecture\n// comment\na service as "A"');
    expect(result.valid).toBe(true);
    expect(result.nodeCount).toBe(1);
  });

  it('reports parse errors', () => {
    const result = validateCoral('this is not valid DSL at all');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects empty DSL (no nodes)', () => {
    const result = validateCoral('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects comments-only DSL (no nodes)', () => {
    const result = validateCoral('// just a comment\n// nothing here');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns node IDs from valid DSL', () => {
    const result = validateCoral('@diagram architecture\nauth service as "Auth"\nusers_db database as "Users DB"');
    expect(result.valid).toBe(true);
    expect(result.nodeIds).toContain('auth');
    expect(result.nodeIds).toContain('users_db');
  });

  it('returns node count', () => {
    const result = validateCoral('@diagram architecture\na service as "A"\nb service as "B"\nc service as "C"');
    expect(result.nodeCount).toBe(3);
  });

  it('rejects edges whose source or target identity is missing', () => {
    const result = validateCoral([
      '@diagram architecture',
      'present service as "Present"',
      'missing -> present',
      'present -> absent',
    ].join('\n'));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.reference.source.unresolved', message: 'Unresolved source reference: missing' }),
      expect.objectContaining({ code: 'coral.reference.target.unresolved', message: 'Unresolved target reference: absent' }),
    ]));
  });
});

describe('validateOutput', () => {
  it('rejects Mermaid with valid content followed by an unparsed line', () => {
    const result = validateOutput('flowchart TD\n  A[Valid]\n  arbitrary garbage', 'mermaid');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ line: 3 });
  });

  // R-063 AC-5: AI output that states a field twice or uses a removed or
  // non-canonical spelling is rejected with a positioned error.
  it.each([
    ['a collision', '@diagram architecture\na service as "A"\nb service as "B"\na -> b [k: 1] data {"properties":{"k":[2]}}', 4],
    ['an equals attribute', '@diagram architecture\na service as "A"\nb service as "B"\na -> b [label = "x"]', 4],
    ['an underscore key', '@diagram architecture\na service as "A" {\n  _k: 1\n}', 3],
    ['a legacy arrow', '@diagram architecture\na service as "A"\nb service as "B"\na -> b data {"style":{"targetArrow":"arrow"}}', 4],
    ['a readable data key', '@diagram architecture\na service as "A" data {"label":"x"}', 2],
    ['a duplicate id', '@diagram architecture\na service as "A"\na service as "B"', 3],
    ['require with a strength flag', '@diagram architecture\na service as "A"\nb service as "B"\nrequire a above b [preferred]', 4],
  ])('rejects Coral output with %s', (_name, dsl, line) => {
    const result = validateOutput(dsl, 'coral');
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.line)).toContain(line);
  });
});

// ============================================================================
// checkStructuralDrift
// ============================================================================

describe('checkStructuralDrift', () => {
  it('returns no drift for identical node sets', () => {
    const result = checkStructuralDrift(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(result.drifted).toBe(false);
  });

  it('returns no drift when nodes are added', () => {
    const result = checkStructuralDrift(['a', 'b'], ['a', 'b', 'c', 'd']);
    expect(result.drifted).toBe(false);
  });

  it('returns no drift for small removals (< 50%)', () => {
    // Remove 1 of 4 = 25% loss
    const result = checkStructuralDrift(['a', 'b', 'c', 'd'], ['a', 'b', 'c']);
    expect(result.drifted).toBe(false);
  });

  it('detects drift when >50% nodes are removed', () => {
    // Remove 3 of 4 = 75% loss
    const result = checkStructuralDrift(['a', 'b', 'c', 'd'], ['a']);
    expect(result.drifted).toBe(true);
    expect(result.lossPercentage).toBeGreaterThan(50);
  });

  it('detects drift when all nodes are replaced', () => {
    const result = checkStructuralDrift(['a', 'b', 'c'], ['x', 'y', 'z']);
    expect(result.drifted).toBe(true);
    expect(result.lossPercentage).toBe(100);
  });

  it('returns no drift with empty original (fresh generate)', () => {
    const result = checkStructuralDrift([], ['a', 'b', 'c']);
    expect(result.drifted).toBe(false);
  });

  it('reports loss percentage', () => {
    // Remove 2 of 4 = 50% loss (exactly 50%, threshold is >50%)
    const result = checkStructuralDrift(['a', 'b', 'c', 'd'], ['a', 'b']);
    expect(result.lossPercentage).toBe(50);
    expect(result.drifted).toBe(false); // exactly 50% is OK
  });

  it('detects drift at 51% loss (just over threshold)', () => {
    // Remove 51 of 100
    const original = Array.from({ length: 100 }, (_, i) => `n${i}`);
    const kept = original.slice(0, 49); // keep 49, lose 51 = 51%
    const result = checkStructuralDrift(original, kept);
    expect(result.drifted).toBe(true);
    expect(result.lossPercentage).toBe(51);
  });
});

// ============================================================================
// formatErrorsForRetry
// ============================================================================

describe('formatErrorsForRetry', () => {
  it('formats parse errors for retry prompt', () => {
    const errors = [
      { line: 1, message: 'Unknown syntax: blah' },
      { line: 3, message: 'Unknown syntax: foo bar' },
    ];
    const formatted = formatErrorsForRetry(errors, 'blah\nservice "A"\nfoo bar');
    expect(formatted).toContain('Line 1');
    expect(formatted).toContain('Unknown syntax');
    expect(formatted).toContain('Line 3');
  });

  it('includes the original DSL', () => {
    const dsl = 'service "A"\nbad line';
    const errors = [{ line: 2, message: 'Unknown syntax: bad line' }];
    const formatted = formatErrorsForRetry(errors, dsl);
    expect(formatted).toContain(dsl);
  });

  it('handles empty errors array', () => {
    const formatted = formatErrorsForRetry([], 'service "A"');
    expect(formatted).toContain('service "A"');
  });

  it('includes fix instruction', () => {
    const errors = [{ line: 1, message: 'error' }];
    const formatted = formatErrorsForRetry(errors, 'bad');
    expect(formatted.toLowerCase()).toMatch(/fix|correct|valid/);
  });
});
